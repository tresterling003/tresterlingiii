-- League trash talk. Members post short messages; everyone in the league sees
-- them live (posting bumps the league version, which drives live sync).

create table league_messages (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references leagues(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index league_messages_league_idx on league_messages(league_id, created_at desc);

alter table league_messages enable row level security;
grant select on league_messages to rival_app;
create policy league_messages_members on league_messages for select to rival_app
  using (rival_is_member(league_id));

create function post_message(p_league uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if not rival_is_member(p_league) then perform rival_fail('not_found', 'League not found.'); end if;
  if char_length(v_body) = 0 then perform rival_fail('invalid', 'Say something first.'); end if;
  if char_length(v_body) > 280 then perform rival_fail('invalid', 'Keep it under 280 characters.'); end if;
  if (select count(*) from league_messages
      where user_id = me and created_at > now() - interval '1 minute') >= 10 then
    perform rival_fail('rate_limited', 'Easy there — wait a moment before posting again.');
  end if;
  insert into league_messages (league_id, user_id, body) values (p_league, me, v_body) returning id into v_id;
  perform rival_bump(p_league);
  return v_id;
end $$;

create function delete_message(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); v_league uuid;
begin
  delete from league_messages where id = p_id and user_id = me returning league_id into v_league;
  if v_league is null then perform rival_fail('not_found', 'Message not found.'); end if;
  perform rival_bump(v_league);
end $$;

revoke execute on function post_message(uuid, text), delete_message(uuid) from public;
grant execute on function post_message(uuid, text), delete_message(uuid) to rival_app;
