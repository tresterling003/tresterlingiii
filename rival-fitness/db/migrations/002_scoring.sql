-- RIVAL scoring engine. Points are ALWAYS derived here from stored activity
-- records; no code path accepts a point total from a client.

create function rival_default_scoring() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'steps',    jsonb_build_object('per', 1000, 'points', 2, 'daily_cap', 25000),
    'cardio',   jsonb_build_object('per', 10,   'points', 4, 'daily_cap', 120),
    'strength', jsonb_build_object('per', 10,   'points', 4, 'daily_cap', 90),
    'mobility', jsonb_build_object('per', 10,   'points', 3, 'daily_cap', 60),
    'planned_workout', 5,
    'daily_goal', 5,
    'active_day', jsonb_build_object('minutes', 20, 'steps', 5000),
    'consistency', jsonb_build_object('days', 5, 'points', 10),
    'daily_cap', 60
  );
$$;

-- Validates a commissioner-supplied rule set and returns a normalized copy.
-- Anything missing falls back to the default; anything out of bounds is rejected.
create function rival_normalize_scoring(p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  d jsonb := rival_default_scoring();
  r jsonb := '{}'::jsonb;
  cat text;
  v_per numeric; v_pts numeric; v_cap numeric;
  max_cap numeric;
begin
  if p is null then return d; end if;
  foreach cat in array array['steps', 'cardio', 'strength', 'mobility'] loop
    v_per := coalesce((p -> cat ->> 'per')::numeric, (d -> cat ->> 'per')::numeric);
    v_pts := coalesce((p -> cat ->> 'points')::numeric, (d -> cat ->> 'points')::numeric);
    v_cap := coalesce((p -> cat ->> 'daily_cap')::numeric, (d -> cat ->> 'daily_cap')::numeric);
    max_cap := case cat when 'steps' then 40000 when 'cardio' then 180 when 'strength' then 120 else 90 end;
    if cat = 'steps' and v_per not in (500, 1000, 2000) then
      perform rival_fail('invalid_scoring', 'Steps must be scored per 500, 1,000 or 2,000 steps.');
    elsif cat <> 'steps' and v_per not in (5, 10, 15) then
      perform rival_fail('invalid_scoring', 'Workout minutes must be scored per 5, 10 or 15 minutes.');
    end if;
    if v_pts < 0 or v_pts > 10 then
      perform rival_fail('invalid_scoring', 'Points per increment must be between 0 and 10.');
    end if;
    if v_cap < v_per or v_cap > max_cap then
      perform rival_fail('invalid_scoring', format('The %s daily cap must be between %s and %s.', cat, v_per, max_cap));
    end if;
    r := r || jsonb_build_object(cat, jsonb_build_object('per', v_per, 'points', v_pts, 'daily_cap', v_cap));
  end loop;

  v_pts := coalesce((p ->> 'planned_workout')::numeric, (d ->> 'planned_workout')::numeric);
  if v_pts < 0 or v_pts > 15 then perform rival_fail('invalid_scoring', 'Planned-workout bonus must be 0–15.'); end if;
  r := r || jsonb_build_object('planned_workout', v_pts);

  v_pts := coalesce((p ->> 'daily_goal')::numeric, (d ->> 'daily_goal')::numeric);
  if v_pts < 0 or v_pts > 15 then perform rival_fail('invalid_scoring', 'Daily-goal bonus must be 0–15.'); end if;
  r := r || jsonb_build_object('daily_goal', v_pts);

  v_per := coalesce((p -> 'active_day' ->> 'minutes')::numeric, (d -> 'active_day' ->> 'minutes')::numeric);
  v_cap := coalesce((p -> 'active_day' ->> 'steps')::numeric, (d -> 'active_day' ->> 'steps')::numeric);
  if v_per < 10 or v_per > 60 or v_cap < 2000 or v_cap > 15000 then
    perform rival_fail('invalid_scoring', 'An active day needs 10–60 minutes or 2,000–15,000 steps.');
  end if;
  r := r || jsonb_build_object('active_day', jsonb_build_object('minutes', v_per, 'steps', v_cap));

  v_per := coalesce((p -> 'consistency' ->> 'days')::numeric, (d -> 'consistency' ->> 'days')::numeric);
  v_pts := coalesce((p -> 'consistency' ->> 'points')::numeric, (d -> 'consistency' ->> 'points')::numeric);
  if v_per < 3 or v_per > 7 or v_pts < 0 or v_pts > 25 then
    perform rival_fail('invalid_scoring', 'Consistency bonus needs 3–7 days and 0–25 points.');
  end if;
  r := r || jsonb_build_object('consistency', jsonb_build_object('days', v_per, 'points', v_pts));

  v_cap := coalesce((p ->> 'daily_cap')::numeric, (d ->> 'daily_cap')::numeric);
  if v_cap < 20 or v_cap > 150 then perform rival_fail('invalid_scoring', 'Daily point cap must be 20–150.'); end if;
  r := r || jsonb_build_object('daily_cap', v_cap);
  return r;
end $$;

-- Round DOWN to one decimal so partial increments never round up into points
-- that weren't earned.
create function rival_pts(p_units numeric, p_cap numeric, p_per numeric, p_points numeric)
returns numeric language sql immutable as $$
  select floor(least(greatest(coalesce(p_units, 0), 0), p_cap) * p_points / p_per * 10) / 10;
$$;

create type rival_day_score as (
  user_id        uuid,
  day            date,
  steps          int,
  cardio_min     int,
  strength_min   int,
  mobility_min   int,
  active_minutes int,
  steps_pts      numeric,
  cardio_pts     numeric,
  strength_pts   numeric,
  mobility_pts   numeric,
  plan_pts       numeric,
  goal_pts       numeric,
  raw_total      numeric,
  total          numeric,
  is_active      boolean,
  goal_met       boolean,
  plan_done      boolean,
  workouts       int
);

-- Score one person's day under one rule set.
create function rival_score_day(p_rules jsonb, p_user uuid, p_day date)
returns rival_day_score
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s rival_day_score;
  v_daily_steps int; v_walk_steps int;
  v_goal_min int; v_goal_steps int;
  v_plan record;
  v_plan_min int;
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

  -- Steps count once per day: the logged daily total already includes walks,
  -- so take whichever is higher instead of adding them (no double counting).
  s.steps := greatest(v_daily_steps, v_walk_steps);
  s.active_minutes := s.cardio_min + s.strength_min + s.mobility_min;

  s.steps_pts    := rival_pts(s.steps,        (p_rules->'steps'->>'daily_cap')::numeric,    (p_rules->'steps'->>'per')::numeric,    (p_rules->'steps'->>'points')::numeric);
  s.cardio_pts   := rival_pts(s.cardio_min,   (p_rules->'cardio'->>'daily_cap')::numeric,   (p_rules->'cardio'->>'per')::numeric,   (p_rules->'cardio'->>'points')::numeric);
  s.strength_pts := rival_pts(s.strength_min, (p_rules->'strength'->>'daily_cap')::numeric, (p_rules->'strength'->>'per')::numeric, (p_rules->'strength'->>'points')::numeric);
  s.mobility_pts := rival_pts(s.mobility_min, (p_rules->'mobility'->>'daily_cap')::numeric, (p_rules->'mobility'->>'per')::numeric, (p_rules->'mobility'->>'points')::numeric);

  -- Planned workout: plans can only be created for future days, so a plan
  -- existing for p_day was by construction made before the day began.
  s.plan_done := false;
  select * into v_plan from planned_workouts where user_id = p_user and plan_date = p_day;
  if found then
    v_plan_min := case v_plan.category
      when 'cardio' then s.cardio_min when 'strength' then s.strength_min else s.mobility_min end;
    s.plan_done := v_plan_min >= v_plan.target_minutes;
  end if;
  s.plan_pts := case when s.plan_done then (p_rules->>'planned_workout')::numeric else 0 end;

  -- Personal goal (defaults to 30 min / 8,000 steps until the user sets one).
  select active_minutes, steps into v_goal_min, v_goal_steps
  from goals where user_id = p_user and effective_from <= p_day
  order by effective_from desc limit 1;
  v_goal_min := coalesce(v_goal_min, 30);
  v_goal_steps := coalesce(v_goal_steps, 8000);
  s.goal_met := s.active_minutes >= v_goal_min or s.steps >= v_goal_steps;
  s.goal_pts := case when s.goal_met then (p_rules->>'daily_goal')::numeric else 0 end;

  s.raw_total := s.steps_pts + s.cardio_pts + s.strength_pts + s.mobility_pts + s.plan_pts + s.goal_pts;
  s.total := least(s.raw_total, (p_rules->>'daily_cap')::numeric);
  s.is_active := s.active_minutes >= (p_rules->'active_day'->>'minutes')::numeric
              or s.steps >= (p_rules->'active_day'->>'steps')::numeric;
  return s;
end $$;

-- Weekly total for one person: capped daily totals + consistency bonus.
create function rival_week_points(p_rules jsonb, p_user uuid, p_week_start date,
                                  out points numeric, out active_days int, out bonus numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d rival_day_score; i int;
begin
  points := 0; active_days := 0;
  for i in 0..6 loop
    d := rival_score_day(p_rules, p_user, p_week_start + i);
    points := points + d.total;
    if d.is_active then active_days := active_days + 1; end if;
  end loop;
  bonus := case when active_days >= (p_rules->'consistency'->>'days')::int
                then (p_rules->'consistency'->>'points')::numeric else 0 end;
  points := points + bonus;
end $$;
