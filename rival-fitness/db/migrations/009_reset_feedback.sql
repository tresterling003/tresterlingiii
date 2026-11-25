-- v1 support tools.
--
-- 1. Password reset without email: the league commissioner generates a
--    one-time link for a member and sends it themselves (text, etc.). Only a
--    SHA-256 of the token is stored; links expire after 48 hours, work once,
--    and using one signs that account out everywhere.
-- 2. In-app feedback, collected for the next version. Write-only for players.

create table password_resets (
  token_hash text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  league_id  uuid not null references leagues(id) on delete cascade,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
alter table password_resets enable row level security;  -- no policies

create function create_reset_link(p_league uuid, p_user uuid, p_token_hash text) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare l leagues := rival_require_commissioner(p_league); exp timestamptz := now() + interval '48 hours';
begin
  if not exists (select 1 from league_members where league_id = p_league and user_id = p_user and active) then
    perform rival_fail('not_found', 'That person isn''t in this league.');
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then perform rival_fail('invalid', 'Invalid token.'); end if;
  -- Only the newest link for a person stays valid.
  update password_resets set used_at = now() where user_id = p_user and used_at is null;
  insert into password_resets (token_hash, user_id, league_id, created_by, expires_at)
  values (p_token_hash, p_user, p_league, l.commissioner_id, exp);
  return exp;
end $$;

-- Anonymous: looks up a link for the reset page (name only, no email).
create function auth_reset_info(p_token_hash text) returns table (display_name text, team_name text, expires_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.display_name, u.team_name, r.expires_at
  from password_resets r join users u on u.id = r.user_id
  where r.token_hash = p_token_hash and r.used_at is null and r.expires_at > now();
$$;

create function auth_use_reset(p_token_hash text, p_new_hash text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare r password_resets;
begin
  select * into r from password_resets
  where token_hash = p_token_hash and used_at is null and expires_at > now() for update;
  if not found then
    perform rival_fail('invalid_link', 'This reset link has expired or was already used. Ask your commissioner for a new one.');
  end if;
  update password_resets set used_at = now() where token_hash = p_token_hash;
  update user_credentials set password_hash = p_new_hash, updated_at = now() where user_id = r.user_id;
  delete from sessions where user_id = r.user_id;
  return r.user_id;
end $$;

create table feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('idea', 'bug', 'love')),
  body       text not null check (char_length(body) between 1 and 2000),
  page       text check (char_length(page) <= 200),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
alter table feedback enable row level security;  -- no policies: write-only via function

create function submit_feedback(p_kind text, p_body text, p_page text, p_ua text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); v uuid;
begin
  if p_kind not in ('idea', 'bug', 'love') then p_kind := 'idea'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then perform rival_fail('invalid', 'Write a little something first.'); end if;
  if (select count(*) from feedback where user_id = me and created_at > now() - interval '1 hour') >= 20 then
    perform rival_fail('rate_limited', 'Thanks! That''s plenty for now — try again later.');
  end if;
  insert into feedback (user_id, kind, body, page, user_agent)
  values (me, p_kind, left(btrim(p_body), 2000), left(p_page, 200), left(p_ua, 300)) returning id into v;
  return v;
end $$;

revoke execute on function create_reset_link(uuid, uuid, text), auth_reset_info(text), auth_use_reset(text, text),
  submit_feedback(text, text, text, text) from public;
grant execute on function create_reset_link(uuid, uuid, text), auth_reset_info(text), auth_use_reset(text, text),
  submit_feedback(text, text, text, text) to rival_app;
