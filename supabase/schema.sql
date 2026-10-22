-- Umbra accounts, devices and bans.
-- Run this once in your Supabase project: Dashboard → SQL Editor → paste → Run.
-- Accounts whose email is listed in admin_emails (below) become admins once the
-- email is confirmed. To add another admin later, either use the Admin tab in Umbra or:
--   update public.profiles set role = 'admin' where email = 'someone@example.com';

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  provider text,
  role text not null default 'user' check (role in ('user', 'admin')),
  banned boolean not null default false,
  ban_reason text,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);

-- A device is a hashed hardware ID (HWID) seen signing in to an account.
create table if not exists public.devices (
  hwid text not null,
  user_id uuid not null references auth.users on delete cascade,
  platform text,
  app_version text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (hwid, user_id)
);

create table if not exists public.hwid_bans (
  hwid text primary key,
  reason text,
  banned_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- Emails that are made admin automatically (only once the address is confirmed).
create table if not exists public.admin_emails (email text primary key);
insert into public.admin_emails (email) values ('vishantnagrani@gmail.com') on conflict do nothing;
alter table public.admin_emails enable row level security;

-- Everything goes through the functions below; clients only read their own profile.
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.hwid_bans enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

-- ---------- new accounts get a profile ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, provider, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name',
             new.raw_user_meta_data->>'user_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    coalesce(new.raw_app_meta_data->>'provider', 'email'),
    case when new.email_confirmed_at is not null
      and exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email)) then 'admin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Listed admin emails get the role when the address is confirmed after sign-up.
create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null
    and exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email)) then
    update public.profiles set role = 'admin' where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- Accounts that already exist when this file is (re)run.
update public.profiles p set role = 'admin'
from auth.users u
where u.id = p.id and u.email_confirmed_at is not null
  and exists (select 1 from public.admin_emails a where lower(a.email) = lower(u.email));

-- ---------- helpers ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and not banned);
$$;

-- Checked before sign-in, so a banned machine can't even create an account.
create or replace function public.hwid_status(p_hwid text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('banned', b.hwid is not null, 'reason', b.reason)
  from (select 1) x left join hwid_bans b on b.hwid = p_hwid;
$$;

-- Called by the app after every sign-in and periodically while it runs.
create or replace function public.register_device(p_hwid text, p_platform text, p_version text)
returns json language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  hb hwid_bans;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_hwid is null or length(p_hwid) < 16 then raise exception 'Bad device id'; end if;
  insert into devices (hwid, user_id, platform, app_version)
  values (p_hwid, auth.uid(), p_platform, p_version)
  on conflict (hwid, user_id) do update set last_seen = now(), platform = excluded.platform, app_version = excluded.app_version;
  update profiles set last_seen = now() where id = auth.uid() returning * into me;
  select * into hb from hwid_bans where hwid = p_hwid;
  return json_build_object(
    'role', coalesce(me.role, 'user'),
    'banned', coalesce(me.banned, false) or hb.hwid is not null,
    'reason', coalesce(case when me.banned then me.ban_reason end, hb.reason)
  );
end $$;

-- ---------- admin ----------
create or replace function public.admin_list_users()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  return json_build_object(
    'users', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'email', p.email, 'name', p.display_name, 'avatar', p.avatar_url,
        'provider', p.provider, 'role', p.role, 'banned', p.banned, 'reason', p.ban_reason,
        'created', p.created_at, 'lastSeen', p.last_seen,
        'devices', coalesce((
          select json_agg(json_build_object(
            'hwid', d.hwid, 'platform', d.platform, 'version', d.app_version, 'lastSeen', d.last_seen,
            'banned', exists (select 1 from hwid_bans b where b.hwid = d.hwid)) order by d.last_seen desc)
          from devices d where d.user_id = p.id), '[]'::json)
      ) order by p.last_seen desc nulls last)
      from profiles p), '[]'::json),
    'bans', coalesce((
      select json_agg(json_build_object('hwid', b.hwid, 'reason', b.reason, 'created', b.created_at,
        'by', (select email from profiles where id = b.banned_by)) order by b.created_at desc)
      from hwid_bans b), '[]'::json)
  );
end $$;

create or replace function public.admin_set_hwid_ban(p_hwid text, p_banned boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_banned then
    if exists (select 1 from devices d join profiles p on p.id = d.user_id where d.hwid = p_hwid and p.role = 'admin') then
      raise exception 'That device is used by an admin and can''t be banned';
    end if;
    insert into hwid_bans (hwid, reason, banned_by) values (p_hwid, p_reason, auth.uid())
    on conflict (hwid) do update set reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();
  else
    delete from hwid_bans where hwid = p_hwid;
  end if;
end $$;

-- Bans or unbans an account; with p_devices it also bans/unbans every device it used.
create or replace function public.admin_set_user_ban(p_user uuid, p_banned boolean, p_reason text default null, p_devices boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_user = auth.uid() then raise exception 'You can''t ban yourself'; end if;
  update profiles set banned = p_banned, ban_reason = case when p_banned then p_reason end where id = p_user;
  if p_devices then
    if p_banned then
      insert into hwid_bans (hwid, reason, banned_by)
      select hwid, p_reason, auth.uid() from devices where user_id = p_user
        -- Never lock out an admin who once signed in on the same Mac.
        and hwid not in (select d.hwid from devices d join profiles p on p.id = d.user_id where p.role = 'admin')
      on conflict (hwid) do nothing;
    else
      delete from hwid_bans where hwid in (select hwid from devices where user_id = p_user);
    end if;
  end if;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_user = auth.uid() then raise exception 'You can''t change your own role'; end if;
  update profiles set role = p_role where id = p_user;
end $$;

-- ---------- who may call what ----------
revoke all on function public.hwid_status(text) from public;
revoke all on function public.register_device(text, text, text) from public;
revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_set_hwid_ban(text, boolean, text) from public;
revoke all on function public.admin_set_user_ban(uuid, boolean, text, boolean) from public;
revoke all on function public.admin_set_role(uuid, text) from public;
revoke all on function public.is_admin() from public;
revoke all on function public.handle_user_confirmed() from public;
grant execute on function public.hwid_status(text) to anon, authenticated;
grant execute on function public.register_device(text, text, text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_hwid_ban(text, boolean, text) to authenticated;
grant execute on function public.admin_set_user_ban(uuid, boolean, text, boolean) to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.is_admin() to authenticated;
