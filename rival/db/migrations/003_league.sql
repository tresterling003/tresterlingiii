-- RIVAL league engine: membership, scheduling, weekly processing, playoffs,
-- and the read/write API exposed to the application role.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function rival_is_member(p_league uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from league_members
                 where league_id = p_league and user_id = rival_uid() and active);
$$;

create function rival_shares_league(p_other uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from league_members a
    join league_members b on b.league_id = a.league_id
    where a.user_id = rival_uid() and a.active and b.user_id = p_other);
$$;

create function rival_user_today(p_user uuid) returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select (rival_now() at time zone timezone)::date from users where id = p_user;
$$;

create function rival_league_today(p_league uuid) returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select (rival_now() at time zone timezone)::date from leagues where id = p_league;
$$;

create function rival_valid_tz(p_tz text) returns boolean
language sql stable as $$
  select exists (select 1 from pg_timezone_names where name = p_tz);
$$;

create function rival_bump(p_league uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update leagues set version = version + 1 where id = p_league;
$$;

create function rival_bump_user(p_user uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update leagues set version = version + 1
  where id in (select league_id from league_members where user_id = p_user and active);
$$;

create function rival_new_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I
  b bytea := uuid_send(gen_random_uuid());
  idx int[] := array[0, 1, 2, 3, 4, 5, 10, 11];                 -- skip version/variant bytes
  out text := '';
  i int;
begin
  foreach i in array idx loop
    out := out || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

create function rival_require_commissioner(p_league uuid) returns leagues
language plpgsql security definer set search_path = public, pg_temp as $$
declare l leagues;
begin
  select * into l from leagues where id = p_league for update;
  if not found or not rival_is_member(p_league) then
    perform rival_fail('not_found', 'League not found.');
  end if;
  if l.commissioner_id <> rival_require_uid() then
    perform rival_fail('forbidden', 'Only the commissioner can do that.');
  end if;
  return l;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduling: circle-method round robin. Odd member counts get a bye slot so
-- every team sits out exactly once per full rotation.
-- ---------------------------------------------------------------------------
create function rival_pairings(p_members uuid[], p_week int)
returns table (home uuid, away uuid)
language plpgsql immutable as $$
declare
  teams uuid[] := p_members;
  m int;
  r int;
  arr uuid[];
  i int;
  a uuid; b uuid;
begin
  if coalesce(array_length(teams, 1), 0) = 0 then return; end if;
  if array_length(teams, 1) % 2 = 1 then teams := teams || array[null::uuid]; end if;
  m := array_length(teams, 1);
  r := (p_week - 1) % (m - 1);
  arr := array[teams[1]];
  for i in 1..(m - 1) loop
    arr := arr || teams[((((i - 1 - r) % (m - 1)) + (m - 1)) % (m - 1)) + 2];
  end loop;
  for i in 1..(m / 2) loop
    a := arr[i]; b := arr[m + 1 - i];
    if a is null then home := b; away := null;
    elsif b is null then home := a; away := null;
    -- Home/away: the fixed team alternates each round; other slots alternate
    -- by position, which balances every team to within one game per rotation.
    elsif (i = 1 and r % 2 = 0) or (i > 1 and i % 2 = 0) then home := a; away := b;
    else home := b; away := a;
    end if;
    return next;
  end loop;
end $$;

create function rival_generate_weeks(p_league uuid, p_from int, p_to int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l leagues;
  members uuid[];
  w int;
begin
  select * into l from leagues where id = p_league;
  select array_agg(user_id order by joined_at, user_id) into members
  from league_members where league_id = p_league and active;
  if p_from > p_to then return; end if;
  for w in p_from..p_to loop
    insert into matchups (league_id, season, week, week_start, kind, home_id, away_id)
    select p_league, l.season, w, l.season_start + 7 * (w - 1), 'regular', p.home, p.away
    from rival_pairings(members, w) p;
  end loop;
end $$;

-- Rebuild every regular-season week that hasn't started yet. Used when the
-- roster changes mid-season; played and in-progress weeks are never touched.
create function rival_reschedule_future(p_league uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l leagues;
  today date;
  next_week int;
begin
  select * into l from leagues where id = p_league;
  if l.status <> 'regular' then return; end if;
  today := rival_league_today(p_league);
  next_week := greatest(1, ((today - l.season_start) / 7) + 2);
  delete from matchups
  where league_id = p_league and season = l.season and kind = 'regular'
    and week >= next_week and finalized_at is null;
  perform rival_generate_weeks(p_league, next_week, l.season_weeks);
end $$;

-- ---------------------------------------------------------------------------
-- Standings
-- ---------------------------------------------------------------------------
create function rival_standings_internal(p_league uuid, p_season int)
returns table (user_id uuid, wins int, losses int, ties int, points_for numeric,
               points_against numeric, games int, rank int)
language sql stable security definer set search_path = public, pg_temp as $$
  with sides as (
    select home_id as uid, home_score as pf, away_score as pa, away_id is null as bye,
           winner_id, is_tie
    from matchups where league_id = p_league and season = p_season
      and kind = 'regular' and finalized_at is not null
    union all
    select away_id, away_score, home_score, false, winner_id, is_tie
    from matchups where league_id = p_league and season = p_season
      and kind = 'regular' and finalized_at is not null and away_id is not null
  ),
  agg as (
    select m.user_id,
      count(*) filter (where not s.bye and s.winner_id = m.user_id)::int as wins,
      count(*) filter (where not s.bye and not s.is_tie and s.winner_id is distinct from m.user_id)::int as losses,
      count(*) filter (where not s.bye and s.is_tie)::int as ties,
      coalesce(sum(s.pf), 0) as pf,
      coalesce(sum(s.pa) filter (where not s.bye), 0) as pa,
      count(*) filter (where not s.bye)::int as games,
      m.joined_at
    from league_members m
    left join sides s on s.uid = m.user_id
    where m.league_id = p_league and m.active
    group by m.user_id, m.joined_at
  )
  select user_id, wins, losses, ties, pf, pa, games,
    (row_number() over (order by
       (wins + 0.5 * ties) / greatest(games, 1) desc, wins desc, pf desc, joined_at, user_id))::int
  from agg;
$$;

-- ---------------------------------------------------------------------------
-- Weekly processing
-- ---------------------------------------------------------------------------
create function rival_finalize_matchup(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m matchups; l leagues;
  hs numeric; as_ numeric;
  h_active boolean; a_active boolean;
  w uuid; tie boolean := false;
begin
  select * into m from matchups where id = p_id for update;
  if m.finalized_at is not null then return; end if;
  select * into l from leagues where id = m.league_id;
  hs := (rival_week_points(l.scoring, m.home_id, m.week_start)).points;
  select active into h_active from league_members where league_id = m.league_id and user_id = m.home_id;

  if m.away_id is null then
    -- Bye. In the playoffs a bye advances the higher seed.
    w := case when m.kind = 'regular' then null else m.home_id end;
  else
    as_ := (rival_week_points(l.scoring, m.away_id, m.week_start)).points;
    select active into a_active from league_members where league_id = m.league_id and user_id = m.away_id;
    if h_active and not a_active then w := m.home_id;          -- forfeit: removed/left member
    elsif a_active and not h_active then w := m.away_id;
    elsif hs > as_ then w := m.home_id;
    elsif as_ > hs then w := m.away_id;
    elsif m.kind = 'regular' then tie := true;
    else  -- playoff tie: higher seed (lower number) advances
      w := case when coalesce(m.home_seed, 99) <= coalesce(m.away_seed, 99) then m.home_id else m.away_id end;
    end if;
  end if;

  update matchups set home_score = hs, away_score = as_, winner_id = w, is_tie = tie,
         finalized_at = rival_now()
  where id = p_id;
end $$;

create function rival_create_playoff_round(p_league uuid, p_round int, p_seeds uuid[], p_seed_nums int[])
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
-- p_seeds ordered best-first; p_seed_nums are their original seed numbers.
declare
  l leagues;
  n int := array_length(p_seeds, 1);
  pow int := 1;
  byes int;
  wk int;
  wstart date;
  kind text;
  i int;
begin
  select * into l from leagues where id = p_league;
  while pow < n loop pow := pow * 2; end loop;
  byes := pow - n;
  wk := l.season_weeks + p_round;
  wstart := l.season_start + 7 * (wk - 1);
  kind := case when n = 2 then 'championship' else 'playoff' end;
  for i in 1..byes loop
    insert into matchups (league_id, season, week, week_start, kind, round, home_id, away_id, home_seed)
    values (p_league, l.season, wk, wstart, kind, p_round, p_seeds[i], null, p_seed_nums[i]);
  end loop;
  for i in 1..((n - byes) / 2) loop
    insert into matchups (league_id, season, week, week_start, kind, round, home_id, away_id, home_seed, away_seed)
    values (p_league, l.season, wk, wstart, kind, p_round,
            p_seeds[byes + i], p_seeds[n + 1 - i], p_seed_nums[byes + i], p_seed_nums[n + 1 - i]);
  end loop;
end $$;

create function rival_crown(p_league uuid, p_champ uuid, p_runner uuid, p_cs numeric, p_rs numeric)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare l leagues;
begin
  select * into l from leagues where id = p_league;
  insert into season_history (league_id, season, champion_id, champion_team, runner_up_id,
                              runner_up_team, champion_score, runner_up_score, completed_at)
  values (p_league, l.season, p_champ, (select team_name from users where id = p_champ),
          p_runner, (select team_name from users where id = p_runner), p_cs, p_rs, rival_now())
  on conflict (league_id, season) do nothing;
  update leagues set status = 'complete' where id = p_league;
end $$;

-- Idempotent; safe to call from cron and on every page load.
create function rival_advance_league(p_league uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l leagues;
  today date;
  changed boolean := false;
  progressed boolean;
  r record;
  n int;
  seeds uuid[]; seed_nums int[];
  last_round int;
  champ record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_league::text, 7));
  loop
    progressed := false;
    select * into l from leagues where id = p_league for update;
    if not found or l.status not in ('regular', 'playoffs') then exit; end if;
    today := rival_league_today(p_league);

    -- 1. Finalize weeks that have ended. Scores lock at 00:00 on the Tuesday
    --    after the week (league timezone), leaving Monday for late entries
    --    from the previous day.
    for r in select id from matchups
             where league_id = p_league and season = l.season
               and finalized_at is null and week_start + 8 <= today
             order by week loop
      perform rival_finalize_matchup(r.id);
      progressed := true;
    end loop;

    -- 2. Regular season over → seed the playoffs (or crown the leader).
    if l.status = 'regular'
       and l.season_start + 7 * l.season_weeks + 1 <= today
       and not exists (select 1 from matchups where league_id = p_league and season = l.season
                       and kind = 'regular' and finalized_at is null) then
      select count(*) into n from league_members where league_id = p_league and active;
      n := least(l.playoff_teams, n);
      if n >= 2 then
        select array_agg(s.user_id order by s.rank), array_agg(s.rank order by s.rank)
          into seeds, seed_nums
        from rival_standings_internal(p_league, l.season) s where s.rank <= n;
        perform rival_create_playoff_round(p_league, 1, seeds, seed_nums);
        update leagues set status = 'playoffs' where id = p_league;
      else
        select array_agg(s.user_id order by s.rank) into seeds
        from rival_standings_internal(p_league, l.season) s where s.rank <= 2;
        perform rival_crown(p_league, seeds[1], seeds[2], null, null);
      end if;
      progressed := true;

    -- 3. Playoff round complete → next round or championship result.
    elsif l.status = 'playoffs' then
      select max(round) into last_round from matchups
      where league_id = p_league and season = l.season and kind <> 'regular';
      if not exists (select 1 from matchups where league_id = p_league and season = l.season
                     and round = last_round and finalized_at is null) then
        select array_agg(x.uid order by x.seed), array_agg(x.seed order by x.seed)
          into seeds, seed_nums
        from (select winner_id as uid,
                     case when winner_id = home_id then home_seed else away_seed end as seed
              from matchups where league_id = p_league and season = l.season
                and round = last_round and winner_id is not null) x;
        if coalesce(array_length(seeds, 1), 0) <= 1 then
          select * into champ from matchups where league_id = p_league and season = l.season
            and round = last_round order by away_id is null limit 1;
          if champ.away_id is null then
            perform rival_crown(p_league, champ.home_id, null, champ.home_score, null);
          elsif champ.winner_id = champ.home_id then
            perform rival_crown(p_league, champ.home_id, champ.away_id, champ.home_score, champ.away_score);
          else
            perform rival_crown(p_league, champ.away_id, champ.home_id, champ.away_score, champ.home_score);
          end if;
        else
          perform rival_create_playoff_round(p_league, last_round + 1, seeds, seed_nums);
        end if;
        progressed := true;
      end if;
    end if;

    exit when not progressed;
    changed := true;
  end loop;

  if changed then perform rival_bump(p_league); end if;
  return changed;
end $$;

create function rival_advance_all() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id from leagues where status in ('regular', 'playoffs') loop
    if rival_advance_league(r.id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- League management API
-- ---------------------------------------------------------------------------
create function create_league(p_name text, p_max_members int, p_season_weeks int,
                              p_playoff_teams int, p_timezone text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := rival_require_uid();
  v_id uuid;
  attempt int := 0;
begin
  if not rival_valid_tz(p_timezone) then perform rival_fail('invalid_timezone', 'Unknown time zone.'); end if;
  if (select count(*) from league_members where user_id = me and active) >= 10 then
    perform rival_fail('limit', 'You can be in up to 10 leagues at once.');
  end if;
  loop
    begin
      insert into leagues (name, code, commissioner_id, max_members, season_weeks, playoff_teams,
                           timezone, scoring)
      values (trim(p_name), rival_new_code(), me, p_max_members, p_season_weeks, p_playoff_teams,
              p_timezone, rival_default_scoring())
      returning id into v_id;
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt > 5 then raise; end if;
    end;
  end loop;
  insert into league_members (league_id, user_id, role) values (v_id, me, 'commissioner');
  return v_id;
end $$;

create function join_league(p_code text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := rival_require_uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  l leagues;
  existing league_members;
  n int;
begin
  if (select count(*) from join_failures
      where user_id = me and created_at > now() - interval '15 minutes') >= 10 then
    perform rival_fail('rate_limited', 'Too many invalid codes. Try again in a few minutes.');
  end if;
  select * into l from leagues where code = v_code for update;
  if not found then
    -- Return null (instead of raising) so the failed attempt is committed and
    -- counts toward the guessing limit. The API maps null to a friendly error.
    insert into join_failures (user_id) values (me);
    return null;
  end if;
  select * into existing from league_members where league_id = l.id and user_id = me;
  if found and existing.active then return l.id; end if;
  if l.status = 'playoffs' then
    perform rival_fail('closed', 'This league is in the playoffs. You can join once the next season starts.');
  end if;
  select count(*) into n from league_members where league_id = l.id and active;
  if n >= l.max_members then perform rival_fail('full', 'This league is full.'); end if;
  if (select count(*) from league_members where user_id = me and active) >= 10 then
    perform rival_fail('limit', 'You can be in up to 10 leagues at once.');
  end if;

  insert into league_members (league_id, user_id, role, active, joined_at)
  values (l.id, me, 'member', true, rival_now())
  on conflict (league_id, user_id) do update set active = true, left_at = null, role = 'member',
                                                 joined_at = rival_now();
  perform rival_reschedule_future(l.id);
  perform rival_bump(l.id);
  return l.id;
end $$;

create function rival_deactivate_member(p_league uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update league_members set active = false, left_at = rival_now()
  where league_id = p_league and user_id = p_user and active;
  perform rival_reschedule_future(p_league);
  perform rival_bump(p_league);
end $$;

create function leave_league(p_league uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); l leagues;
begin
  select * into l from leagues where id = p_league for update;
  if not found or not rival_is_member(p_league) then perform rival_fail('not_found', 'League not found.'); end if;
  if l.commissioner_id = me then
    perform rival_fail('commissioner', 'Hand the commissioner role to someone else before leaving.');
  end if;
  perform rival_deactivate_member(p_league, me);
end $$;

create function remove_member(p_league uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare l leagues := rival_require_commissioner(p_league);
begin
  if p_user = l.commissioner_id then perform rival_fail('invalid', 'The commissioner can''t be removed.'); end if;
  if not exists (select 1 from league_members where league_id = p_league and user_id = p_user and active) then
    perform rival_fail('not_found', 'That person isn''t in this league.');
  end if;
  perform rival_deactivate_member(p_league, p_user);
end $$;

create function transfer_commissioner(p_league uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare l leagues := rival_require_commissioner(p_league);
begin
  if not exists (select 1 from league_members where league_id = p_league and user_id = p_user and active) then
    perform rival_fail('not_found', 'That person isn''t in this league.');
  end if;
  update league_members set role = 'member' where league_id = p_league and user_id = l.commissioner_id;
  update league_members set role = 'commissioner' where league_id = p_league and user_id = p_user;
  update leagues set commissioner_id = p_user where id = p_league;
  perform rival_bump(p_league);
end $$;

create function regenerate_invite(p_league uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare l leagues := rival_require_commissioner(p_league); v text;
begin
  loop
    begin
      v := rival_new_code();
      update leagues set code = v where id = p_league;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  perform rival_bump(p_league);
  return v;
end $$;

-- p: {name, max_members, season_weeks, playoff_teams, timezone, scoring}
create function update_league(p_league uuid, p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l leagues := rival_require_commissioner(p_league);
  n int;
begin
  select count(*) into n from league_members where league_id = p_league and active;
  if p ? 'name' then
    update leagues set name = trim(p ->> 'name') where id = p_league;
  end if;
  if p ? 'max_members' then
    if (p ->> 'max_members')::int < n then
      perform rival_fail('invalid', format('The league already has %s members.', n));
    end if;
    update leagues set max_members = (p ->> 'max_members')::int where id = p_league;
  end if;
  if p ?| array['season_weeks', 'playoff_teams', 'timezone'] and l.status <> 'preseason' then
    perform rival_fail('locked', 'Season length, playoffs and time zone can only change before the season starts.');
  end if;
  if p ? 'season_weeks' then update leagues set season_weeks = (p ->> 'season_weeks')::int where id = p_league; end if;
  if p ? 'playoff_teams' then update leagues set playoff_teams = (p ->> 'playoff_teams')::int where id = p_league; end if;
  if p ? 'timezone' then
    if not rival_valid_tz(p ->> 'timezone') then perform rival_fail('invalid_timezone', 'Unknown time zone.'); end if;
    update leagues set timezone = p ->> 'timezone' where id = p_league;
  end if;
  if p ? 'scoring' then
    -- Applies to every member equally and to all weeks not yet final.
    update leagues set scoring = rival_normalize_scoring(p -> 'scoring') where id = p_league;
  end if;
  perform rival_bump(p_league);
end $$;

-- p_when: 'this_week' (week 1 = the current Mon–Sun) or 'next_week'
create function start_season(p_league uuid, p_when text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l leagues := rival_require_commissioner(p_league);
  today date;
  monday date;
begin
  if l.status <> 'preseason' then perform rival_fail('invalid', 'The season has already started.'); end if;
  if (select count(*) from league_members where league_id = p_league and active) < 2 then
    perform rival_fail('invalid', 'Invite at least one rival before starting the season.');
  end if;
  today := rival_league_today(p_league);
  monday := today - (extract(isodow from today)::int - 1);
  if p_when = 'next_week' then monday := monday + 7; end if;
  update leagues set season_start = monday, status = 'regular' where id = p_league;
  perform rival_generate_weeks(p_league, 1, l.season_weeks);
  perform rival_bump(p_league);
end $$;

create function new_season(p_league uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare l leagues := rival_require_commissioner(p_league);
begin
  if l.status <> 'complete' then perform rival_fail('invalid', 'The current season isn''t finished yet.'); end if;
  update leagues set season = season + 1, status = 'preseason', season_start = null where id = p_league;
  perform rival_bump(p_league);
end $$;

-- ---------------------------------------------------------------------------
-- League read API (membership-checked; raw metrics redacted for others)
-- ---------------------------------------------------------------------------
create function league_standings(p_league uuid)
returns table (user_id uuid, wins int, losses int, ties int, points_for numeric,
               points_against numeric, games int, rank int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not rival_is_member(p_league) then perform rival_fail('not_found', 'League not found.'); end if;
  return query select * from rival_standings_internal(p_league, (select season from leagues where id = p_league));
end $$;

create function league_day_scores(p_league uuid, p_from date, p_to date)
returns table (user_id uuid, day date, steps_pts numeric, cardio_pts numeric, strength_pts numeric,
               mobility_pts numeric, plan_pts numeric, goal_pts numeric, raw_total numeric,
               total numeric, is_active boolean, goal_met boolean, plan_done boolean, workouts int,
               steps int, active_minutes int, cardio_min int, strength_min int, mobility_min int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  l leagues; me uuid := rival_uid(); s rival_day_score; u record; d date; visible boolean;
begin
  if not rival_is_member(p_league) then perform rival_fail('not_found', 'League not found.'); end if;
  if p_to < p_from or p_to - p_from > 41 then perform rival_fail('invalid', 'Date range too large.'); end if;
  select * into l from leagues where id = p_league;
  for u in
    select distinct x.uid, us.share_details from (
      select m.user_id as uid from league_members m where m.league_id = p_league and m.active
      union
      select home_id from matchups where league_id = p_league and season = l.season
        and week_start between p_from - 6 and p_to
      union
      select away_id from matchups where league_id = p_league and season = l.season
        and week_start between p_from - 6 and p_to and away_id is not null
    ) x join users us on us.id = x.uid
  loop
    visible := u.uid = me or u.share_details;
    d := p_from;
    while d <= p_to loop
      s := rival_score_day(l.scoring, u.uid, d);
      user_id := u.uid; day := d;
      steps_pts := s.steps_pts; cardio_pts := s.cardio_pts; strength_pts := s.strength_pts;
      mobility_pts := s.mobility_pts; plan_pts := s.plan_pts; goal_pts := s.goal_pts;
      raw_total := s.raw_total; total := s.total; is_active := s.is_active;
      goal_met := s.goal_met; plan_done := s.plan_done; workouts := s.workouts;
      steps := case when visible then s.steps end;
      active_minutes := case when visible then s.active_minutes end;
      cardio_min := case when visible then s.cardio_min end;
      strength_min := case when visible then s.strength_min end;
      mobility_min := case when visible then s.mobility_min end;
      return next;
      d := d + 1;
    end loop;
  end loop;
end $$;

-- Authoritative weekly totals (capped days + consistency bonus) for everyone
-- with a stake in the given week.
create function league_week_totals(p_league uuid, p_week_start date)
returns table (user_id uuid, points numeric, active_days int, bonus numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare l leagues; u uuid; wp record;
begin
  if not rival_is_member(p_league) then perform rival_fail('not_found', 'League not found.'); end if;
  select * into l from leagues where id = p_league;
  for u in
    select m.user_id from league_members m where m.league_id = p_league and m.active
    union
    select home_id from matchups where league_id = p_league and season = l.season and week_start = p_week_start
    union
    select away_id from matchups where league_id = p_league and season = l.season and week_start = p_week_start
      and away_id is not null
  loop
    wp := rival_week_points(l.scoring, u, p_week_start);
    user_id := u; points := wp.points; active_days := wp.active_days; bonus := wp.bonus;
    return next;
  end loop;
end $$;

-- Recent scoring activity for the league ticker. Shows activity labels only;
-- durations appear only for members who opted to share details.
create function league_feed(p_league uuid, p_limit int default 20)
returns table (id uuid, user_id uuid, activity_type text, label text, category text,
               activity_date date, duration_min int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not rival_is_member(p_league) then perform rival_fail('not_found', 'League not found.'); end if;
  return query
    select w.id, w.user_id, w.activity_type, t.label, w.category, w.activity_date,
           case when u.share_details or w.user_id = rival_uid() then w.duration_min end,
           w.created_at
    from workouts w
    join activity_types t on t.type = w.activity_type
    join users u on u.id = w.user_id
    join league_members m on m.league_id = p_league and m.user_id = w.user_id and m.active
    where w.created_at > rival_now() - interval '14 days'
    order by w.created_at desc
    limit least(greatest(p_limit, 1), 50);
end $$;

-- ---------------------------------------------------------------------------
-- Workout API. Users may log today or yesterday (their own time zone) — no
-- future dates and no back-filling old weeks.
-- ---------------------------------------------------------------------------
create function rival_validate_workout(p_user uuid, p_type text, p_date date, p_duration int,
                                       p_steps int, p_exclude uuid)
returns activity_types
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t activity_types;
  today date := rival_user_today(p_user);
  day_minutes int;
  day_count int;
begin
  select * into t from activity_types where type = p_type;
  if not found then perform rival_fail('invalid_type', 'Choose a supported activity.'); end if;
  if p_date is null or p_date > today then
    perform rival_fail('future_date', 'You can''t log a workout for a future date.');
  end if;
  if p_date < today - 1 then
    perform rival_fail('too_old', 'Workouts can be logged for today or yesterday only.');
  end if;
  if t.needs_duration and p_duration is null then
    perform rival_fail('invalid', 'Enter how many minutes you exercised.');
  end if;
  if t.needs_steps and p_steps is null then
    perform rival_fail('invalid', 'Enter your step count.');
  end if;
  if t.category <> 'steps' and p_steps is not null then
    perform rival_fail('invalid', 'Steps can only be logged with a walk or daily step total.');
  end if;
  if p_type = 'steps' and p_duration is not null then
    perform rival_fail('invalid', 'A daily step total doesn''t take a duration.');
  end if;
  if p_duration is not null and (p_duration < 1 or p_duration > 240) then
    perform rival_fail('invalid', 'A single workout must be between 1 and 240 minutes.');
  end if;
  if p_steps is not null and (p_steps < 1 or p_steps > 100000) then
    perform rival_fail('invalid', 'Step count must be between 1 and 100,000.');
  end if;
  select coalesce(sum(duration_min), 0), count(*) into day_minutes, day_count
  from workouts where user_id = p_user and activity_date = p_date and id is distinct from p_exclude;
  if day_count >= 20 then
    perform rival_fail('limit', 'That''s the maximum number of entries for one day.');
  end if;
  if day_minutes + coalesce(p_duration, 0) > 480 then
    perform rival_fail('limit', 'That would be more than 8 hours of exercise in one day. Rest counts too.');
  end if;
  if p_type = 'steps' and exists (select 1 from workouts where user_id = p_user and activity_date = p_date
                                  and activity_type = 'steps' and id is distinct from p_exclude) then
    perform rival_fail('duplicate_steps', 'You already logged a step total for that day. Edit it instead.');
  end if;
  return t;
end $$;

create function log_workout(p_request_id uuid, p_type text, p_date date, p_duration int,
                            p_steps int, p_distance numeric, p_notes text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := rival_require_uid();
  t activity_types;
  v_id uuid;
begin
  if p_request_id is null then perform rival_fail('invalid', 'Missing request id.'); end if;
  -- Serialize writes per person so concurrent double-submits can't race.
  perform pg_advisory_xact_lock(hashtextextended(me::text, 11));

  -- Idempotency: replaying the same submission returns the original record.
  select id into v_id from workouts where user_id = me and client_request_id = p_request_id;
  if found then return v_id; end if;

  t := rival_validate_workout(me, p_type, p_date, p_duration, p_steps, null);

  if exists (select 1 from workouts
             where user_id = me and activity_type = p_type and activity_date = p_date
               and duration_min is not distinct from p_duration
               and steps is not distinct from p_steps
               and created_at > rival_now() - interval '10 minutes') then
    perform rival_fail('duplicate', 'That looks like a duplicate of a workout you just logged.');
  end if;

  insert into workouts (user_id, activity_type, category, activity_date, duration_min, steps,
                        distance_km, notes, client_request_id, created_at, updated_at)
  values (me, p_type, t.category, p_date, p_duration, p_steps, p_distance,
          nullif(trim(p_notes), ''), p_request_id, rival_now(), rival_now())
  returning id into v_id;
  perform rival_bump_user(me);
  return v_id;
end $$;

create function update_workout(p_id uuid, p_type text, p_date date, p_duration int,
                               p_steps int, p_distance numeric, p_notes text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := rival_require_uid();
  w workouts;
  t activity_types;
begin
  perform pg_advisory_xact_lock(hashtextextended(me::text, 11));
  select * into w from workouts where id = p_id and user_id = me for update;
  if not found then perform rival_fail('not_found', 'Workout not found.'); end if;
  if w.activity_date < rival_user_today(me) - 1 then
    perform rival_fail('locked', 'Workouts older than yesterday are locked.');
  end if;
  t := rival_validate_workout(me, p_type, p_date, p_duration, p_steps, p_id);
  update workouts set activity_type = p_type, category = t.category, activity_date = p_date,
         duration_min = p_duration, steps = p_steps, distance_km = p_distance,
         notes = nullif(trim(p_notes), ''), updated_at = rival_now()
  where id = p_id;
  perform rival_bump_user(me);
end $$;

create function delete_workout(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); w workouts;
begin
  select * into w from workouts where id = p_id and user_id = me for update;
  if not found then perform rival_fail('not_found', 'Workout not found.'); end if;
  if w.activity_date < rival_user_today(me) - 1 then
    perform rival_fail('locked', 'Workouts older than yesterday are locked.');
  end if;
  delete from workouts where id = p_id;
  perform rival_bump_user(me);
end $$;

create function set_plan(p_date date, p_category text, p_minutes int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); today date := rival_user_today(me);
begin
  if p_date <= today then perform rival_fail('invalid', 'Plan workouts for tomorrow or later.'); end if;
  if p_date > today + 14 then perform rival_fail('invalid', 'You can plan up to two weeks ahead.'); end if;
  if p_category not in ('cardio', 'strength', 'mobility') then perform rival_fail('invalid', 'Choose cardio, strength or mobility.'); end if;
  if p_minutes is null or p_minutes < 10 or p_minutes > 120 then
    perform rival_fail('invalid', 'Planned workouts must be 10–120 minutes.');
  end if;
  insert into planned_workouts (user_id, plan_date, category, target_minutes, created_at)
  values (me, p_date, p_category, p_minutes, rival_now())
  on conflict (user_id, plan_date) do update
    set category = excluded.category, target_minutes = excluded.target_minutes, created_at = excluded.created_at;
end $$;

create function delete_plan(p_date date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid();
begin
  if p_date <= rival_user_today(me) then perform rival_fail('locked', 'Today''s plan is locked in.'); end if;
  delete from planned_workouts where user_id = me and plan_date = p_date;
end $$;

-- Goal changes take effect tomorrow.
create function set_goal(p_minutes int, p_steps int) returns date
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); eff date := rival_user_today(me) + 1;
begin
  if p_minutes is null or p_minutes < 10 or p_minutes > 180 then
    perform rival_fail('invalid', 'Daily active-minute goal must be 10–180.');
  end if;
  if p_steps is null or p_steps < 1000 or p_steps > 40000 then
    perform rival_fail('invalid', 'Daily step goal must be 1,000–40,000.');
  end if;
  insert into goals (user_id, effective_from, active_minutes, steps)
  values (me, eff, p_minutes, p_steps)
  on conflict (user_id, effective_from) do update
    set active_minutes = excluded.active_minutes, steps = excluded.steps, created_at = now();
  return eff;
end $$;

create function update_profile(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid();
begin
  if p ? 'timezone' and not rival_valid_tz(p ->> 'timezone') then
    perform rival_fail('invalid_timezone', 'Unknown time zone.');
  end if;
  update users set
    display_name  = coalesce(trim(p ->> 'display_name'), display_name),
    team_name     = coalesce(trim(p ->> 'team_name'), team_name),
    team_abbr     = coalesce(upper(trim(p ->> 'team_abbr')), team_abbr),
    team_color    = coalesce(p ->> 'team_color', team_color),
    timezone      = coalesce(p ->> 'timezone', timezone),
    share_details = coalesce((p ->> 'share_details')::boolean, share_details)
  where id = me;
  perform rival_bump_user(me);
end $$;

-- ---------------------------------------------------------------------------
-- Auth API (password hashing happens in the app with bcrypt; only hashes and
-- SHA-256 session-token digests reach the database).
-- ---------------------------------------------------------------------------
create function auth_signup(p_email text, p_hash text, p_display_name text, p_team_name text,
                            p_team_abbr text, p_team_color text, p_timezone text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not rival_valid_tz(p_timezone) then p_timezone := 'America/Chicago'; end if;
  begin
    insert into users (email, display_name, team_name, team_abbr, team_color, timezone)
    values (lower(trim(p_email)), trim(p_display_name), trim(p_team_name), upper(trim(p_team_abbr)),
            p_team_color, p_timezone)
    returning id into v_id;
  exception when unique_violation then
    perform rival_fail('email_taken', 'An account with that email already exists.');
  end;
  insert into user_credentials (user_id, password_hash) values (v_id, p_hash);
  return v_id;
end $$;

create function auth_lookup(p_email text) returns table (user_id uuid, password_hash text)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.id, c.password_hash from users u join user_credentials c on c.user_id = u.id
  where u.email = lower(trim(p_email));
$$;

create function auth_failure_count(p_email text) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from auth_failures
  where email = lower(trim(p_email)) and created_at > now() - interval '15 minutes';
$$;

create function auth_note_failure(p_email text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into auth_failures (email) values (lower(trim(p_email)));
  delete from auth_failures where created_at < now() - interval '1 day';
$$;

create function auth_create_session(p_user uuid, p_token_hash text, p_user_agent text)
returns timestamptz
language sql security definer set search_path = public, pg_temp as $$
  delete from sessions where user_id = p_user and expires_at < now();
  insert into sessions (token_hash, user_id, user_agent, expires_at)
  values (p_token_hash, p_user, left(p_user_agent, 200), now() + interval '60 days')
  returning expires_at;
$$;

create function auth_session_user(p_token_hash text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare s sessions;
begin
  select * into s from sessions where token_hash = p_token_hash and expires_at > now();
  if not found then return null; end if;
  if s.last_seen_at < now() - interval '1 hour' then
    update sessions set last_seen_at = now(), expires_at = now() + interval '60 days'
    where token_hash = p_token_hash;
  end if;
  return s.user_id;
end $$;

create function auth_end_session(p_token_hash text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from sessions where token_hash = p_token_hash;
$$;

create function auth_end_other_sessions(p_keep_token_hash text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  delete from sessions where user_id = rival_require_uid() and token_hash <> p_keep_token_hash;
  get diagnostics n = row_count;
  return n;
end $$;

create function auth_set_password(p_hash text) returns void
language sql security definer set search_path = public, pg_temp as $$
  update user_credentials set password_hash = p_hash, updated_at = now()
  where user_id = rival_require_uid();
$$;

create function auth_get_password_hash() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select password_hash from user_credentials where user_id = rival_require_uid();
$$;
