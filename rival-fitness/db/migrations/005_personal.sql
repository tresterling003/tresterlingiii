-- Personal views: the caller's own daily scores (full detail) under a league's
-- rules, or the default rules when they aren't in a league yet; and a
-- membership-free preview of an invite code for the join screen.

create function my_day_scores(p_from date, p_to date, p_league uuid default null)
returns setof rival_day_score
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me uuid := rival_require_uid();
  rules jsonb := rival_default_scoring();
  d date := p_from;
begin
  if p_to < p_from or p_to - p_from > 62 then perform rival_fail('invalid', 'Date range too large.'); end if;
  if p_league is not null and rival_is_member(p_league) then
    select scoring into rules from leagues where id = p_league;
  end if;
  while d <= p_to loop
    return next rival_score_day(rules, me, d);
    d := d + 1;
  end loop;
end $$;

-- Returns null for unknown codes and records the miss toward the same
-- guessing limit as join_league.
create function league_preview(p_code text)
returns table (id uuid, name text, status text, members int, max_members int,
               commissioner_team text, is_member boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := rival_require_uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  l leagues;
begin
  if (select count(*) from join_failures
      where user_id = me and created_at > now() - interval '15 minutes') >= 10 then
    perform rival_fail('rate_limited', 'Too many invalid codes. Try again in a few minutes.');
  end if;
  select * into l from leagues where code = v_code;
  if not found then
    insert into join_failures (user_id) values (me);
    return;
  end if;
  return query
    select l.id, l.name, l.status,
           (select count(*)::int from league_members m where m.league_id = l.id and m.active),
           l.max_members,
           (select team_name from users where users.id = l.commissioner_id),
           exists (select 1 from league_members m where m.league_id = l.id and m.user_id = me and m.active);
end $$;

revoke execute on function my_day_scores(date, date, uuid), league_preview(text) from public;
grant execute on function my_day_scores(date, date, uuid), league_preview(text) to rival_app;
