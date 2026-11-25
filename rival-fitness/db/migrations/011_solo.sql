-- RIVAL Solo: your own program, daily habits, and "beat last week".
--
-- Programs are workout templates (exercises with target sets/reps/weight)
-- assigned to days of the week. Doing a workout creates a session with
-- per-exercise logs; finishing it records a normal workout so all scoring
-- stays in one engine. Habits (water, protein) add daily points.

create table workout_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  kind        text not null default 'strength' check (kind in ('strength', 'cardio', 'mobility')),
  est_minutes int  not null default 45 check (est_minutes between 5 and 240),
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);
create index workout_templates_user_idx on workout_templates(user_id);

create table template_exercises (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references workout_templates(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  position    int  not null,
  name        text not null check (char_length(name) between 1 and 60),
  sets        int  check (sets between 1 and 20),
  reps        text check (char_length(reps) <= 20),
  weight      numeric(6,1) check (weight >= 0 and weight <= 2000),
  minutes     int  check (minutes between 1 and 240),
  notes       text check (char_length(notes) <= 120)
);
create index template_exercises_template_idx on template_exercises(template_id, position);

create table program_days (
  user_id     uuid not null references users(id) on delete cascade,
  weekday     int  not null check (weekday between 1 and 7),   -- ISO: 1 = Monday
  template_id uuid references workout_templates(id) on delete set null,
  primary key (user_id, weekday)
);

create table workout_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  template_id   uuid references workout_templates(id) on delete set null,
  template_name text not null,
  kind          text not null,
  session_date  date not null,
  scheduled     boolean not null default false,
  duration_min  int check (duration_min between 1 and 240),
  workout_id    uuid references workouts(id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index workout_sessions_unique on workout_sessions(user_id, template_id, session_date);
create index workout_sessions_user_date_idx on workout_sessions(user_id, session_date);

create table exercise_logs (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references workout_sessions(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  exercise_id   uuid references template_exercises(id) on delete set null,
  exercise_name text not null,
  position      int  not null,
  done          boolean not null default false,
  sets_done     int  check (sets_done between 0 and 20),
  reps          text check (char_length(reps) <= 20),
  weight        numeric(6,1) check (weight >= 0 and weight <= 2000)
);
create index exercise_logs_user_idx on exercise_logs(user_id, exercise_name);

create table habit_settings (
  user_id         uuid primary key references users(id) on delete cascade,
  water_enabled   boolean not null default true,
  water_target    int not null default 8 check (water_target between 1 and 30),
  protein_enabled boolean not null default true,
  protein_target  int not null default 150 check (protein_target between 20 and 400)
);

create table habit_logs (
  user_id uuid not null references users(id) on delete cascade,
  day     date not null,
  water   int  not null default 0 check (water between 0 and 60),
  protein int  not null default 0 check (protein between 0 and 1000),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Security: owner-only reads; all writes through functions below.
-- ---------------------------------------------------------------------------
alter table workout_templates  enable row level security;
alter table template_exercises enable row level security;
alter table program_days       enable row level security;
alter table workout_sessions   enable row level security;
alter table exercise_logs      enable row level security;
alter table habit_settings     enable row level security;
alter table habit_logs         enable row level security;
grant select on workout_templates, template_exercises, program_days, workout_sessions,
                exercise_logs, habit_settings, habit_logs to rival_app;
create policy own on workout_templates  for select to rival_app using (user_id = rival_uid());
create policy own on template_exercises for select to rival_app using (user_id = rival_uid());
create policy own on program_days       for select to rival_app using (user_id = rival_uid());
create policy own on workout_sessions   for select to rival_app using (user_id = rival_uid());
create policy own on exercise_logs      for select to rival_app using (user_id = rival_uid());
create policy own on habit_settings     for select to rival_app using (user_id = rival_uid());
create policy own on habit_logs         for select to rival_app using (user_id = rival_uid());

-- ---------------------------------------------------------------------------
-- Scoring: habits + program workouts count as "planned".
-- ---------------------------------------------------------------------------
alter type rival_day_score add attribute habit_pts numeric;
alter type rival_day_score add attribute water int;
alter type rival_day_score add attribute protein int;
alter type rival_day_score add attribute water_met boolean;
alter type rival_day_score add attribute protein_met boolean;

create or replace function rival_default_scoring() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'steps',    jsonb_build_object('per', 1000, 'points', 2, 'daily_cap', 25000),
    'cardio',   jsonb_build_object('per', 10,   'points', 4, 'daily_cap', 120),
    'strength', jsonb_build_object('per', 10,   'points', 4, 'daily_cap', 90),
    'mobility', jsonb_build_object('per', 10,   'points', 3, 'daily_cap', 60),
    'planned_workout', 5,
    'daily_goal', 5,
    'habits', jsonb_build_object('water', 3, 'protein', 3),
    'active_day', jsonb_build_object('minutes', 20, 'steps', 5000),
    'consistency', jsonb_build_object('days', 5, 'points', 10),
    'daily_cap', 60
  );
$$;

create or replace function rival_score_day(p_rules jsonb, p_user uuid, p_day date)
returns rival_day_score
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s rival_day_score;
  v_daily_steps int; v_walk_steps int;
  v_goal_min int; v_goal_steps int;
  v_plan record;
  v_plan_min int;
  hs habit_settings;
  hl habit_logs;
begin
  s.user_id := p_user; s.day := p_day;

  select
    coalesce(sum(steps) filter (where activity_type = 'steps'), 0),
    coalesce(sum(steps) filter (where activity_type = 'walk'), 0),
    coalesce(sum(duration_min) filter (where category = 'cardio'), 0),
    coalesce(sum(duration_min) filter (where category = 'strength'), 0),
    coalesce(sum(duration_min) filter (where category = 'mobility'), 0),
    count(*)
  into v_daily_steps, v_walk_steps, s.cardio_min, s.strength_min, s.mobility_min, s.workouts
  from workouts where user_id = p_user and activity_date = p_day;

  s.steps := greatest(v_daily_steps, v_walk_steps);
  s.active_minutes := s.cardio_min + s.strength_min + s.mobility_min;

  s.steps_pts    := rival_pts(s.steps,        (p_rules->'steps'->>'daily_cap')::numeric,    (p_rules->'steps'->>'per')::numeric,    (p_rules->'steps'->>'points')::numeric);
  s.cardio_pts   := rival_pts(s.cardio_min,   (p_rules->'cardio'->>'daily_cap')::numeric,   (p_rules->'cardio'->>'per')::numeric,   (p_rules->'cardio'->>'points')::numeric);
  s.strength_pts := rival_pts(s.strength_min, (p_rules->'strength'->>'daily_cap')::numeric, (p_rules->'strength'->>'per')::numeric, (p_rules->'strength'->>'points')::numeric);
  s.mobility_pts := rival_pts(s.mobility_min, (p_rules->'mobility'->>'daily_cap')::numeric, (p_rules->'mobility'->>'per')::numeric, (p_rules->'mobility'->>'points')::numeric);

  -- Planned workout: a finished workout from your program scheduled for that
  -- day, or a one-off plan made at least a day ahead.
  s.plan_done := exists (select 1 from workout_sessions
                         where user_id = p_user and session_date = p_day
                           and completed_at is not null and scheduled);
  if not s.plan_done then
    select * into v_plan from planned_workouts where user_id = p_user and plan_date = p_day;
    if found then
      v_plan_min := case v_plan.category
        when 'cardio' then s.cardio_min when 'strength' then s.strength_min else s.mobility_min end;
      s.plan_done := v_plan_min >= v_plan.target_minutes;
    end if;
  end if;
  s.plan_pts := case when s.plan_done then (p_rules->>'planned_workout')::numeric else 0 end;

  select active_minutes, steps into v_goal_min, v_goal_steps
  from goals where user_id = p_user and effective_from <= p_day
  order by effective_from desc limit 1;
  v_goal_min := coalesce(v_goal_min, 30);
  v_goal_steps := coalesce(v_goal_steps, 8000);
  s.goal_met := s.active_minutes >= v_goal_min or s.steps >= v_goal_steps;
  s.goal_pts := case when s.goal_met then (p_rules->>'daily_goal')::numeric else 0 end;

  -- Daily habits.
  select * into hs from habit_settings where user_id = p_user;
  select * into hl from habit_logs where user_id = p_user and day = p_day;
  s.water := coalesce(hl.water, 0);
  s.protein := coalesce(hl.protein, 0);
  s.water_met := coalesce(hs.water_enabled, true) and s.water >= coalesce(hs.water_target, 8);
  s.protein_met := coalesce(hs.protein_enabled, true) and s.protein >= coalesce(hs.protein_target, 150);
  s.habit_pts := (case when s.water_met then coalesce((p_rules->'habits'->>'water')::numeric, 3) else 0 end)
               + (case when s.protein_met then coalesce((p_rules->'habits'->>'protein')::numeric, 3) else 0 end);

  s.raw_total := s.steps_pts + s.cardio_pts + s.strength_pts + s.mobility_pts + s.plan_pts + s.goal_pts + s.habit_pts;
  s.total := least(s.raw_total, (p_rules->>'daily_cap')::numeric);
  s.is_active := s.active_minutes >= (p_rules->'active_day'->>'minutes')::numeric
              or s.steps >= (p_rules->'active_day'->>'steps')::numeric;
  return s;
end $$;

-- ---------------------------------------------------------------------------
-- Program API
-- ---------------------------------------------------------------------------
-- p: {id?, name, kind, est_minutes, exercises: [{name, sets, reps, weight, minutes, notes}]}
create function save_template(p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := rival_require_uid();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  e jsonb;
  i int := 0;
begin
  if jsonb_typeof(coalesce(p -> 'exercises', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p -> 'exercises', '[]'::jsonb)) > 30 then
    perform rival_fail('invalid', 'A workout can have up to 30 exercises.');
  end if;
  if (select count(*) from workout_templates where user_id = me) >= 30 and v_id is null then
    perform rival_fail('limit', 'You can save up to 30 workouts.');
  end if;
  if v_id is null then
    insert into workout_templates (user_id, name, kind, est_minutes, position)
    values (me, btrim(p ->> 'name'), coalesce(p ->> 'kind', 'strength'), coalesce((p ->> 'est_minutes')::int, 45),
            coalesce((select max(position) + 1 from workout_templates where user_id = me), 0))
    returning id into v_id;
  else
    update workout_templates set name = btrim(p ->> 'name'), kind = coalesce(p ->> 'kind', kind),
           est_minutes = coalesce((p ->> 'est_minutes')::int, est_minutes)
    where id = v_id and user_id = me;
    if not found then perform rival_fail('not_found', 'Workout not found.'); end if;
    delete from template_exercises where template_id = v_id;
  end if;
  for e in select * from jsonb_array_elements(coalesce(p -> 'exercises', '[]'::jsonb)) loop
    if char_length(btrim(coalesce(e ->> 'name', ''))) = 0 then continue; end if;
    insert into template_exercises (template_id, user_id, position, name, sets, reps, weight, minutes, notes)
    values (v_id, me, i, btrim(e ->> 'name'), nullif(e ->> 'sets', '')::int, nullif(btrim(coalesce(e ->> 'reps', '')), ''),
            nullif(e ->> 'weight', '')::numeric, nullif(e ->> 'minutes', '')::int, nullif(btrim(coalesce(e ->> 'notes', '')), ''));
    i := i + 1;
  end loop;
  return v_id;
end $$;

create function delete_template(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from workout_templates where id = p_id and user_id = rival_require_uid();
  if not found then perform rival_fail('not_found', 'Workout not found.'); end if;
end $$;

create function set_program_day(p_weekday int, p_template uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid();
begin
  if p_weekday not between 1 and 7 then perform rival_fail('invalid', 'Invalid day.'); end if;
  if p_template is not null and not exists (select 1 from workout_templates where id = p_template and user_id = me) then
    perform rival_fail('not_found', 'Workout not found.');
  end if;
  insert into program_days (user_id, weekday, template_id) values (me, p_weekday, p_template)
  on conflict (user_id, weekday) do update set template_id = excluded.template_id;
end $$;

-- ---------------------------------------------------------------------------
-- Session API. Today or yesterday only, like all logging.
-- ---------------------------------------------------------------------------
create function rival_session_for(p_user uuid, p_date date, p_template uuid) returns workout_sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare t workout_templates; s workout_sessions; today date := rival_user_today(p_user);
begin
  perform rival_require_pledge(p_user);
  if p_date is null or p_date > today or p_date < today - 1 then
    perform rival_fail('invalid_date', 'Workouts can be logged for today or yesterday only.');
  end if;
  select * into t from workout_templates where id = p_template and user_id = p_user;
  if not found then perform rival_fail('not_found', 'Workout not found.'); end if;
  insert into workout_sessions (user_id, template_id, template_name, kind, session_date, scheduled)
  values (p_user, t.id, t.name, t.kind, p_date,
          exists (select 1 from program_days where user_id = p_user and template_id = t.id
                  and weekday = extract(isodow from p_date)::int))
  on conflict (user_id, template_id, session_date) do update set updated_at = now()
  returning * into s;
  return s;
end $$;

-- p_exercises: [{exercise_id?, name, done, sets_done, reps, weight}]
create function save_session(p_date date, p_template uuid, p_exercises jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); s workout_sessions; e jsonb; i int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(me::text, 11));
  s := rival_session_for(me, p_date, p_template);
  if jsonb_typeof(p_exercises) <> 'array' or jsonb_array_length(p_exercises) > 30 then
    perform rival_fail('invalid', 'Too many exercises.');
  end if;
  delete from exercise_logs where session_id = s.id;
  for e in select * from jsonb_array_elements(p_exercises) loop
    insert into exercise_logs (session_id, user_id, exercise_id, exercise_name, position, done, sets_done, reps, weight)
    values (s.id, me,
            (select id from template_exercises where id = nullif(e ->> 'exercise_id', '')::uuid and user_id = me),
            left(btrim(coalesce(e ->> 'name', 'Exercise')), 60), i, coalesce((e ->> 'done')::boolean, false),
            nullif(e ->> 'sets_done', '')::int, nullif(left(btrim(coalesce(e ->> 'reps', '')), 20), ''),
            nullif(e ->> 'weight', '')::numeric);
    i := i + 1;
  end loop;
  return s.id;
end $$;

create function finish_session(p_date date, p_template uuid, p_duration int, p_request uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); s workout_sessions; w uuid; v_type text;
begin
  perform pg_advisory_xact_lock(hashtextextended(me::text, 12));
  s := rival_session_for(me, p_date, p_template);
  if s.completed_at is not null then return s.id; end if;          -- idempotent
  v_type := case s.kind when 'cardio' then 'cardio' when 'mobility' then 'mobility' else 'strength' end;
  w := log_workout(p_request, v_type, p_date, p_duration, null, null, s.template_name);
  update workout_sessions set duration_min = p_duration, workout_id = w, completed_at = now(), updated_at = now()
  where id = s.id;
  return s.id;
end $$;

create function reopen_session(p_date date, p_template uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); s workout_sessions;
begin
  select * into s from workout_sessions where user_id = me and template_id = p_template and session_date = p_date for update;
  if not found then perform rival_fail('not_found', 'Session not found.'); end if;
  if p_date < rival_user_today(me) - 1 then perform rival_fail('locked', 'Older workouts are locked.'); end if;
  update workout_sessions set completed_at = null, duration_min = null, workout_id = null, updated_at = now() where id = s.id;
  if s.workout_id is not null then delete from workouts where id = s.workout_id and user_id = me; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Habits API
-- ---------------------------------------------------------------------------
create function set_habit_settings(p_water_enabled boolean, p_water_target int,
                                   p_protein_enabled boolean, p_protein_target int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into habit_settings (user_id, water_enabled, water_target, protein_enabled, protein_target)
  values (rival_require_uid(), p_water_enabled, p_water_target, p_protein_enabled, p_protein_target)
  on conflict (user_id) do update set water_enabled = excluded.water_enabled, water_target = excluded.water_target,
    protein_enabled = excluded.protein_enabled, protein_target = excluded.protein_target;
end $$;

create function log_habits(p_date date, p_water int, p_protein int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); today date := rival_user_today(me);
begin
  perform rival_require_pledge(me);
  if p_date is null or p_date > today or p_date < today - 1 then
    perform rival_fail('invalid_date', 'Habits can be logged for today or yesterday only.');
  end if;
  insert into habit_logs (user_id, day, water, protein) values (me, p_date, greatest(0, p_water), greatest(0, p_protein))
  on conflict (user_id, day) do update set water = excluded.water, protein = excluded.protein;
end $$;

-- ---------------------------------------------------------------------------
-- Progress: weekly totals (default rules) for the last p_weeks Mondays.
-- ---------------------------------------------------------------------------
create function my_weeks(p_weeks int) returns table (week_start date, points numeric, active_days int, bonus numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me uuid := rival_require_uid();
  today date := rival_user_today(me);
  monday date := today - (extract(isodow from today)::int - 1);
  first date;
  i int;
  wp record;
begin
  select least(min(activity_date), today) into first from workouts where user_id = me;
  first := coalesce(first, today);
  for i in reverse least(greatest(p_weeks, 1), 52) - 1 .. 0 loop
    week_start := monday - 7 * i;
    if week_start + 6 < first - 7 then continue; end if;          -- skip weeks before any activity
    wp := rival_week_points(rival_default_scoring(), me, week_start);
    points := wp.points; active_days := wp.active_days; bonus := wp.bonus;
    return next;
  end loop;
end $$;

revoke execute on function save_template(jsonb), delete_template(uuid), set_program_day(int, uuid),
  rival_session_for(uuid, date, uuid), save_session(date, uuid, jsonb), finish_session(date, uuid, int, uuid),
  reopen_session(date, uuid), set_habit_settings(boolean, int, boolean, int), log_habits(date, int, int),
  my_weeks(int) from public;
grant execute on function save_template(jsonb), delete_template(uuid), set_program_day(int, uuid),
  save_session(date, uuid, jsonb), finish_session(date, uuid, int, uuid), reopen_session(date, uuid),
  set_habit_settings(boolean, int, boolean, int), log_habits(date, int, int), my_weeks(int) to rival_app;

-- Account deletion also erases programs, sessions and habits.
create or replace function delete_account() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := rival_require_uid();
  r record;
  heir uuid;
begin
  for r in select l.id, l.commissioner_id from league_members m join leagues l on l.id = m.league_id
           where m.user_id = me and m.active loop
    if r.commissioner_id = me then
      select user_id into heir from league_members
      where league_id = r.id and active and user_id <> me order by joined_at, user_id limit 1;
      if heir is null then
        delete from leagues where id = r.id;            -- sole member: nothing left to keep
        continue;
      end if;
      update league_members set role = 'commissioner' where league_id = r.id and user_id = heir;
      update league_members set role = 'member' where league_id = r.id and user_id = me;
      update leagues set commissioner_id = heir where id = r.id;
    end if;
    perform rival_deactivate_member(r.id, me);           -- forfeit current week, reschedule
  end loop;

  delete from exercise_logs where user_id = me;
  delete from workout_sessions where user_id = me;
  delete from program_days where user_id = me;
  delete from workout_templates where user_id = me;
  delete from habit_logs where user_id = me;
  delete from habit_settings where user_id = me;
  delete from workouts where user_id = me;
  delete from planned_workouts where user_id = me;
  delete from goals where user_id = me;
  delete from user_avatars where user_id = me;
  delete from league_messages where user_id = me;
  delete from password_resets where user_id = me;
  delete from feedback where user_id = me;
  delete from join_failures where user_id = me;
  delete from sessions where user_id = me;
  delete from user_credentials where user_id = me;
  delete from auth_failures where email = (select email from users where id = me);
  update users set
    email = 'deleted-' || id || '@deleted.rival.invalid',
    display_name = 'Former player', team_name = 'Former player', team_abbr = 'EX',
    team_color = '#6E737D', share_details = false, avatar_updated_at = null,
    pledged_at = null, deleted_at = now()
  where id = me;
end $$;

