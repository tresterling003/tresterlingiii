-- Deleting things: leagues (commissioner), accounts (self), and chat
-- moderation (commissioner).
--
-- Accounts are erased, not hard-deleted: personal data (email, name, photo,
-- workouts, plans, goals, messages, sessions, password) is removed and the
-- row becomes "Former player" so opponents' historical results stay correct.

alter table users add column deleted_at timestamptz;

create function delete_league(p_league uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare l leagues := rival_require_commissioner(p_league);
begin
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(l.name)) then
    perform rival_fail('confirm', 'Type the league name exactly to confirm.');
  end if;
  -- Cascades to members, matchups, history, messages and reset links.
  delete from leagues where id = p_league;
end $$;

-- Commissioners can remove any message in their league; players their own.
create or replace function delete_message(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := rival_require_uid(); m league_messages;
begin
  select * into m from league_messages where id = p_id;
  if not found or not rival_is_member(m.league_id) then
    perform rival_fail('not_found', 'Message not found.');
  end if;
  if m.user_id <> me and (select commissioner_id from leagues where id = m.league_id) <> me then
    perform rival_fail('not_found', 'Message not found.');
  end if;
  delete from league_messages where id = p_id;
  perform rival_bump(m.league_id);
end $$;

create function delete_account() returns void
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

revoke execute on function delete_league(uuid, text), delete_message(uuid), delete_account() from public;
grant execute on function delete_league(uuid, text), delete_message(uuid), delete_account() to rival_app;
