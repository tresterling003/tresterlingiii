-- Profile photos. Images are resized in the browser (max ~320px) and stored
-- here; only league-mates (and the owner) can fetch them.

create table user_avatars (
  user_id      uuid primary key references users(id) on delete cascade,
  image        bytea not null check (octet_length(image) between 100 and 300000),
  content_type text  not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  updated_at   timestamptz not null default now()
);
alter table user_avatars enable row level security;  -- no policies: access via functions only

alter table users add column avatar_updated_at timestamptz;
grant select (avatar_updated_at) on users to rival_app;

create function set_avatar(p_image bytea, p_type text) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); ts timestamptz := clock_timestamp();
begin
  if p_type not in ('image/jpeg', 'image/png', 'image/webp') then
    perform rival_fail('invalid', 'Use a JPEG, PNG or WebP image.');
  end if;
  if p_image is null or octet_length(p_image) > 300000 then
    perform rival_fail('invalid', 'That image is too large.');
  end if;
  insert into user_avatars (user_id, image, content_type, updated_at) values (me, p_image, p_type, ts)
  on conflict (user_id) do update set image = excluded.image, content_type = excluded.content_type, updated_at = ts;
  update users set avatar_updated_at = ts where id = me;
  perform rival_bump_user(me);
  return ts;
end $$;

create function delete_avatar() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid();
begin
  delete from user_avatars where user_id = me;
  update users set avatar_updated_at = null where id = me;
  perform rival_bump_user(me);
end $$;

create function get_avatar(p_user uuid) returns table (image bytea, content_type text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_user <> rival_require_uid() and not rival_shares_league(p_user) then
    return;
  end if;
  return query select a.image, a.content_type, a.updated_at from user_avatars a where a.user_id = p_user;
end $$;

drop function my_account();
create function my_account()
returns table (id uuid, email text, display_name text, team_name text, team_abbr text,
               team_color text, timezone text, share_details boolean, created_at timestamptz,
               avatar_updated_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select id, email::text, display_name, team_name, team_abbr, team_color, timezone,
         share_details, created_at, avatar_updated_at
  from users where id = rival_uid();
$$;

revoke execute on function set_avatar(bytea, text), delete_avatar(), get_avatar(uuid), my_account() from public;
grant execute on function set_avatar(bytea, text), delete_avatar(), get_avatar(uuid), my_account() to rival_app;
