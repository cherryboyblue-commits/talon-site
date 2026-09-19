-- Custom name badges the steward can grant from Admin Sanctuary.
-- Safe to re-run. Does not change parlor_notes.

alter table public.parlor_profiles
  add column if not exists badge text;

alter table public.parlor_profiles
  drop constraint if exists parlor_profiles_badge_len;

alter table public.parlor_profiles
  add constraint parlor_profiles_badge_len
  check (badge is null or char_length(btrim(badge)) between 1 and 24);

update public.parlor_profiles
   set badge = 'steward'
 where lower(username) = 'talon86'
   and (badge is null or btrim(badge) = '');

create or replace function public.parlor_profiles_guard_badge()
returns trigger
language plpgsql
as $$
begin
  if new.badge is not null and btrim(new.badge) = '' then
    new.badge := null;
  end if;
  if current_setting('parlor.allow_badge', true) = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.badge is distinct from old.badge and not public.is_parlor_admin() then
    new.badge := old.badge;
  end if;
  if tg_op = 'INSERT' and not public.is_parlor_admin() then
    new.badge := null;
  end if;
  return new;
end;
$$;

drop trigger if exists parlor_profiles_guard_badge on public.parlor_profiles;
create trigger parlor_profiles_guard_badge
  before insert or update on public.parlor_profiles
  for each row execute function public.parlor_profiles_guard_badge();

drop policy if exists "parlor_profiles_admin_update" on public.parlor_profiles;
create policy "parlor_profiles_admin_update"
  on public.parlor_profiles
  for update
  to authenticated
  using (public.is_parlor_admin())
  with check (public.is_parlor_admin());

create or replace function public.admin_set_member_badge(target_user uuid, badge_text text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text;
begin
  if not public.is_parlor_admin() then
    raise exception 'not authorized';
  end if;
  if target_user is null then
    raise exception 'member not on the roll';
  end if;
  cleaned := nullif(btrim(coalesce(badge_text, '')), '');
  if cleaned is not null and char_length(cleaned) > 24 then
    raise exception 'badge too long';
  end if;
  perform set_config('parlor.allow_badge', '1', true);
  update public.parlor_profiles
     set badge = cleaned
   where user_id = target_user;
  if not found then
    raise exception 'member not on the roll';
  end if;
  return coalesce(cleaned, '');
end;
$$;

revoke all on function public.admin_set_member_badge(uuid, text) from public;
grant execute on function public.admin_set_member_badge(uuid, text) to authenticated;
grant select, insert, update on table public.parlor_profiles to authenticated;

notify pgrst, 'reload schema';
