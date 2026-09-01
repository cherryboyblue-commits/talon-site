-- Run after parlor_notes.sql (or together).
-- Hidden admin roster + revoke. Only mr_jones86@ymail.com can read profiles or call this RPC.

create or replace function public.is_parlor_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'mr_jones86@ymail.com'
    or lower(coalesce(auth.email(), '')) = 'mr_jones86@ymail.com',
    false
  );
$$;

create table if not exists public.parlor_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.parlor_profiles enable row level security;

create or replace function public.handle_new_parlor_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.parlor_profiles (user_id, username)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      nullif(new.raw_user_meta_data->>'display_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_parlor_user();

insert into public.parlor_profiles (user_id, username)
select
  id,
  coalesce(
    nullif(raw_user_meta_data->>'username', ''),
    nullif(raw_user_meta_data->>'display_name', ''),
    split_part(email, '@', 1)
  )
from auth.users
on conflict (user_id) do nothing;

drop policy if exists "parlor_profiles_admin_read" on public.parlor_profiles;
create policy "parlor_profiles_admin_read"
  on public.parlor_profiles
  for select
  to authenticated
  using (public.is_parlor_admin());

drop policy if exists "parlor_notes_member_post" on public.parlor_notes;
create policy "parlor_notes_member_post"
  on public.parlor_notes
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.parlor_profiles p
      where p.user_id = auth.uid()
        and p.revoked = false
    )
  );

create or replace function public.admin_revoke_member(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  handle text;
begin
  if not public.is_parlor_admin() then
    raise exception 'not authorized';
  end if;
  if target_user is null or target_user = auth.uid() then
    raise exception 'cannot revoke this member';
  end if;

  select lower(username) into handle
  from public.parlor_profiles
  where user_id = target_user;

  if handle = 'talon86' then
    raise exception 'cannot revoke the steward';
  end if;

  update public.parlor_profiles
     set revoked = true
   where user_id = target_user;

  delete from public.parlor_notes where user_id = target_user;

  begin
    delete from auth.users where id = target_user;
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.admin_revoke_member(uuid) from public;
grant execute on function public.admin_revoke_member(uuid) to authenticated;
grant execute on function public.is_parlor_admin() to authenticated;

grant select on table public.parlor_profiles to authenticated;
