-- RIVAL security model.
--
-- The web app connects as `rival_app`, a role that owns nothing and has no
-- BYPASSRLS. Every request runs in a transaction that sets `rival.user_id`
-- (after the session cookie is verified). Row-level security limits reads to
-- what that person may see; ALL writes go through the security-definer
-- functions above, which validate input and derive points server-side.
-- `rival_app` cannot INSERT/UPDATE/DELETE any table directly.

alter function rival_now() security definer set search_path = public, pg_temp;

-- Lock everything down, then grant back the minimum.
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke execute on all functions in schema public from public;

grant usage on schema public to rival_app;

-- Reads (filtered by the policies below). Email and time zone are excluded
-- from the users grant so league-mates can't read them; `my_account()` returns
-- them for the caller only.
grant select (id, display_name, team_name, team_abbr, team_color, share_details, created_at)
  on users to rival_app;
grant select on leagues, league_members, matchups, season_history,
                workouts, planned_workouts, goals, activity_types to rival_app;

alter table users            enable row level security;
alter table leagues          enable row level security;
alter table league_members   enable row level security;
alter table matchups         enable row level security;
alter table season_history   enable row level security;
alter table workouts         enable row level security;
alter table planned_workouts enable row level security;
alter table goals            enable row level security;
alter table user_credentials enable row level security;  -- no policies: deny all
alter table sessions         enable row level security;
alter table auth_failures    enable row level security;
alter table join_failures    enable row level security;
alter table test_clock       enable row level security;

create policy users_visible on users for select to rival_app
  using (id = rival_uid() or rival_shares_league(id));
create policy leagues_members on leagues for select to rival_app
  using (rival_is_member(id));
create policy league_members_members on league_members for select to rival_app
  using (rival_is_member(league_id));
create policy matchups_members on matchups for select to rival_app
  using (rival_is_member(league_id));
create policy season_history_members on season_history for select to rival_app
  using (rival_is_member(league_id));
create policy workouts_own on workouts for select to rival_app
  using (user_id = rival_uid());
create policy plans_own on planned_workouts for select to rival_app
  using (user_id = rival_uid());
create policy goals_own on goals for select to rival_app
  using (user_id = rival_uid());

create function my_account()
returns table (id uuid, email text, display_name text, team_name text, team_abbr text,
               team_color text, timezone text, share_details boolean, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select id, email::text, display_name, team_name, team_abbr, team_color, timezone,
         share_details, created_at
  from users where id = rival_uid();
$$;

-- Public API surface for the application role.
grant execute on function
  rival_uid(), rival_now(), rival_default_scoring(),
  rival_user_today(uuid), rival_league_today(uuid),
  rival_advance_league(uuid), rival_advance_all(),
  my_account(),
  create_league(text, int, int, int, text), join_league(text), leave_league(uuid),
  remove_member(uuid, uuid), transfer_commissioner(uuid, uuid), regenerate_invite(uuid),
  update_league(uuid, jsonb), start_season(uuid, text), new_season(uuid),
  league_standings(uuid), league_day_scores(uuid, date, date), league_week_totals(uuid, date), league_feed(uuid, int),
  log_workout(uuid, text, date, int, int, numeric, text),
  update_workout(uuid, text, date, int, int, numeric, text), delete_workout(uuid),
  set_plan(date, text, int), delete_plan(date), set_goal(int, int), update_profile(jsonb),
  auth_signup(text, text, text, text, text, text, text), auth_lookup(text),
  auth_failure_count(text), auth_note_failure(text),
  auth_create_session(uuid, text, text), auth_session_user(text), auth_end_session(text),
  auth_end_other_sessions(text), auth_set_password(text), auth_get_password_hash()
to rival_app;

-- Policy helpers must be executable for RLS evaluation.
grant execute on function rival_is_member(uuid), rival_shares_league(uuid) to rival_app;
