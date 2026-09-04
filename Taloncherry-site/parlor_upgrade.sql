-- Optional if columns exist but members cannot read avatars or the steward cannot pin notes.
-- Run in the Supabase SQL Editor. Safe to re-run.

alter table public.parlor_profiles
  add column if not exists avatar_url text;

alter table public.parlor_notes
  add column if not exists image_url text,
  add column if not exists category text not null default 'general',
  add column if not exists is_pinned boolean not null default false;

create index if not exists parlor_notes_pinned_created_idx
  on public.parlor_notes (is_pinned desc, created_at desc);

-- Members need to see likenesses on the corkboard.
drop policy if exists "parlor_profiles_member_read" on public.parlor_profiles;
create policy "parlor_profiles_member_read"
  on public.parlor_profiles
  for select
  to authenticated
  using (true);

-- A member may update only their own likeness.
drop policy if exists "parlor_profiles_self_update" on public.parlor_profiles;
create policy "parlor_profiles_self_update"
  on public.parlor_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Steward may hold or release any note.
drop policy if exists "parlor_notes_admin_update" on public.parlor_notes;
create policy "parlor_notes_admin_update"
  on public.parlor_notes
  for update
  to authenticated
  using (public.is_parlor_admin())
  with check (public.is_parlor_admin());

-- Members with no trigger row still need to store a likeness.
drop policy if exists "parlor_profiles_self_insert" on public.parlor_profiles;
create policy "parlor_profiles_self_insert"
  on public.parlor_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert, update on table public.parlor_profiles to authenticated;
grant select, insert, update, delete on table public.parlor_notes to authenticated;

-- Corkboard: every signed-in member may read every pin.
drop policy if exists "parlor_notes_member_read" on public.parlor_notes;
create policy "parlor_notes_member_read"
  on public.parlor_notes
  for select
  to authenticated
  using (true);

-- Public bucket parlor-media: members may write only inside their own folder.
insert into storage.buckets (id, name, public)
values ('parlor-media', 'parlor-media', true)
on conflict (id) do update set public = true;

drop policy if exists "parlor_media_public_read" on storage.objects;
create policy "parlor_media_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'parlor-media');

drop policy if exists "parlor_media_member_write" on storage.objects;
create policy "parlor_media_member_write"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'parlor-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "parlor_media_member_update" on storage.objects;
create policy "parlor_media_member_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'parlor-media'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'parlor-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );
