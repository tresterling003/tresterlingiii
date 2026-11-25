-- The RIVAL Pledge: an honor commitment every player takes before logging.
-- RIVAL is self-reported, so the pledge sets the spirit: get healthier
-- together; winning is the bonus.

alter table users add column pledged_at timestamptz;
grant select (pledged_at) on users to rival_app;

create function take_pledge() returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); ts timestamptz;
begin
  update users set pledged_at = coalesce(pledged_at, now()) where id = me returning pledged_at into ts;
  perform rival_bump_user(me);
  return ts;
end $$;

-- Logging requires the pledge (enforced server-side, not just in the UI).
create or replace function rival_require_pledge(p_user uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if (select pledged_at from users where id = p_user) is null then
    perform rival_fail('pledge_required', 'Take the RIVAL Pledge before logging activity.');
  end if;
end $$;

create or replace function rival_validate_workout(p_user uuid, p_type text, p_date date, p_duration int,
                                                  p_steps int, p_exclude uuid)
returns activity_types
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t activity_types;
  today date := rival_user_today(p_user);
  day_minutes int;
  day_count int;
begin
  perform rival_require_pledge(p_user);
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

drop function my_account();
create function my_account()
returns table (id uuid, email text, display_name text, team_name text, team_abbr text,
               team_color text, timezone text, share_details boolean, created_at timestamptz,
               avatar_updated_at timestamptz, pledged_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select id, email::text, display_name, team_name, team_abbr, team_color, timezone,
         share_details, created_at, avatar_updated_at, pledged_at
  from users where id = rival_uid();
$$;

revoke execute on function take_pledge(), rival_require_pledge(uuid), rival_validate_workout(uuid, text, date, int, int, uuid), my_account() from public;
grant execute on function take_pledge(), my_account() to rival_app;
