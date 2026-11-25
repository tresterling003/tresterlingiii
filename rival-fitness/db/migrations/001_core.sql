-- RIVAL core schema: accounts, sessions, leagues, membership, matchups, workouts.
-- All timestamps are server-generated (timestamptz default now()/rival_now()).

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Clock. Production always uses now(). The test suite (running as the owner
-- role) can pin the clock by writing a row here; the app role cannot write it.
-- ---------------------------------------------------------------------------
create table test_clock (
  id boolean primary key default true check (id),
  fixed_now timestamptz not null
);

create function rival_now() returns timestamptz
language sql stable as $$
  select coalesce((select fixed_now from test_clock where id), now());
$$;

-- Caller identity, set per-transaction by the API layer after it validates the
-- session cookie: select set_config('rival.user_id', <uuid>, true).
create function rival_uid() returns uuid
language sql stable as $$
  select nullif(current_setting('rival.user_id', true), '')::uuid;
$$;

create function rival_require_uid() returns uuid
language plpgsql stable as $$
declare v uuid := rival_uid();
begin
  if v is null then
    raise exception 'You need to sign in first.' using errcode = 'P0001', detail = 'unauthenticated';
  end if;
  return v;
end $$;

create function rival_fail(p_code text, p_message text) returns void
language plpgsql as $$
begin
  raise exception '%', p_message using errcode = 'P0001', detail = p_code;
end $$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  team_name     text not null check (char_length(team_name) between 2 and 32),
  team_abbr     text not null check (team_abbr ~ '^[A-Z0-9]{2,4}$'),
  team_color    text not null default '#C6FF3D' check (team_color ~ '^#[0-9A-Fa-f]{6}$'),
  timezone      text not null default 'America/Chicago',
  share_details boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Password hashes live apart from profile data; the app role has no direct
-- access to this table (only through auth_* security-definer functions).
create table user_credentials (
  user_id       uuid primary key references users(id) on delete cascade,
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

create table sessions (
  token_hash   text primary key,           -- sha256 of the random cookie token
  user_id      uuid not null references users(id) on delete cascade,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index sessions_user_idx on sessions(user_id);

create table auth_failures (
  id         bigserial primary key,
  email      citext not null,
  created_at timestamptz not null default now()
);
create index auth_failures_email_idx on auth_failures(email, created_at);

-- Personal daily goal. A change takes effect the following day so it can't be
-- lowered after the fact to collect the goal bonus.
create table goals (
  user_id        uuid not null references users(id) on delete cascade,
  effective_from date not null,
  active_minutes int  not null check (active_minutes between 10 and 180),
  steps          int  not null check (steps between 1000 and 40000),
  created_at     timestamptz not null default now(),
  primary key (user_id, effective_from)
);

-- ---------------------------------------------------------------------------
-- Leagues
-- ---------------------------------------------------------------------------
create table leagues (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 3 and 40),
  code           text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  commissioner_id uuid not null references users(id),
  max_members    int  not null default 12 check (max_members between 4 and 20),
  season_weeks   int  not null default 10 check (season_weeks between 1 and 26),
  playoff_teams  int  not null default 4 check (playoff_teams in (0, 2, 4, 6, 8)),
  timezone       text not null default 'America/Chicago',
  scoring        jsonb not null,
  status         text not null default 'preseason'
                 check (status in ('preseason', 'regular', 'playoffs', 'complete')),
  season         int  not null default 1,
  season_start   date,                     -- Monday of week 1
  version        bigint not null default 0,  -- bumped on every change; drives live sync
  created_at     timestamptz not null default now(),
  check (status = 'preseason' or season_start is not null),
  check (season_start is null or extract(isodow from season_start) = 1)
);

create table league_members (
  league_id uuid not null references leagues(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  role      text not null default 'member' check (role in ('commissioner', 'member')),
  active    boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (league_id, user_id)
);
create index league_members_user_idx on league_members(user_id) where active;

create table matchups (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues(id) on delete cascade,
  season      int  not null,
  week        int  not null check (week >= 1),
  week_start  date not null,
  kind        text not null default 'regular' check (kind in ('regular', 'playoff', 'championship')),
  round       int,
  home_id     uuid not null references users(id),
  away_id     uuid references users(id),           -- null = bye
  home_seed   int,
  away_seed   int,
  home_score  numeric(7,1),                        -- snapshotted at finalization
  away_score  numeric(7,1),
  winner_id   uuid references users(id),
  is_tie      boolean not null default false,
  finalized_at timestamptz,
  created_at  timestamptz not null default now(),
  check (home_id is distinct from away_id)
);
create index matchups_league_week_idx on matchups(league_id, season, week);
create unique index matchups_home_unique on matchups(league_id, season, week, home_id);
create unique index matchups_away_unique on matchups(league_id, season, week, away_id) where away_id is not null;

create table season_history (
  league_id      uuid not null references leagues(id) on delete cascade,
  season         int  not null,
  champion_id    uuid references users(id),
  champion_team  text,
  runner_up_id   uuid references users(id),
  runner_up_team text,
  champion_score numeric(7,1),
  runner_up_score numeric(7,1),
  completed_at   timestamptz not null default now(),
  primary key (league_id, season)
);

create table join_failures (
  id         bigserial primary key,
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index join_failures_user_idx on join_failures(user_id, created_at);

-- ---------------------------------------------------------------------------
-- Activity
-- ---------------------------------------------------------------------------
create table activity_types (
  type     text primary key,
  label    text not null,
  category text not null check (category in ('steps', 'cardio', 'strength', 'mobility')),
  needs_duration boolean not null,
  needs_steps    boolean not null,
  sort     int not null
);

insert into activity_types (type, label, category, needs_duration, needs_steps, sort) values
  ('steps',    'Daily steps',      'steps',    false, true,  10),
  ('walk',     'Walk',             'steps',    false, true,  20),
  ('run',      'Run',              'cardio',   true,  false, 30),
  ('cycle',    'Cycling',          'cardio',   true,  false, 40),
  ('swim',     'Swim',             'cardio',   true,  false, 50),
  ('hiit',     'HIIT',             'cardio',   true,  false, 60),
  ('cardio',   'Cardio workout',   'cardio',   true,  false, 70),
  ('sport',    'Sport / game',     'cardio',   true,  false, 80),
  ('hike',     'Hike',             'cardio',   true,  false, 90),
  ('strength', 'Strength training','strength', true,  false, 100),
  ('yoga',     'Yoga',             'mobility', true,  false, 110),
  ('mobility', 'Mobility / stretch','mobility',true,  false, 120);

create table workouts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  activity_type     text not null references activity_types(type),
  category          text not null,
  activity_date     date not null,
  duration_min      int  check (duration_min between 1 and 240),
  steps             int  check (steps between 1 and 100000),
  distance_km       numeric(6,2) check (distance_km > 0 and distance_km <= 300),
  notes             text check (char_length(notes) <= 200),
  source            text not null default 'manual'
                    check (source in ('manual', 'apple_health', 'health_connect')),
  external_id       text,
  client_request_id uuid not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, client_request_id)
);
create index workouts_user_date_idx on workouts(user_id, activity_date);
create unique index workouts_external_unique on workouts(user_id, source, external_id) where external_id is not null;
-- One daily step total per person per day (walks are separate entries).
create unique index workouts_daily_steps_unique on workouts(user_id, activity_date) where activity_type = 'steps';

create table planned_workouts (
  user_id        uuid not null references users(id) on delete cascade,
  plan_date      date not null,
  category       text not null check (category in ('cardio', 'strength', 'mobility')),
  target_minutes int  not null check (target_minutes between 10 and 120),
  created_at     timestamptz not null default now(),
  primary key (user_id, plan_date)
);
