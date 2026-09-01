-- Run in Supabase SQL Editor.
-- Creates parlor_notes (no spaces) and RLS:
--   members can read, members can insert,
--   only mr_jones86@ymail.com can delete.

create table if not exists public.parlor_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  author text not null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists parlor_notes_created_at_idx
  on public.parlor_notes (created_at desc);

alter table public.parlor_notes enable row level security;

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

drop policy if exists "parlor_notes_member_read" on public.parlor_notes;
create policy "parlor_notes_member_read"
  on public.parlor_notes
  for select
  to authenticated
  using (true);

drop policy if exists "parlor_notes_member_post" on public.parlor_notes;
create policy "parlor_notes_member_post"
  on public.parlor_notes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "parlor_notes_admin_delete" on public.parlor_notes;
create policy "parlor_notes_admin_delete"
  on public.parlor_notes
  for delete
  to authenticated
  using (public.is_parlor_admin());

grant select, insert, delete on table public.parlor_notes to authenticated;

-- Roster + revoke: also run parlor_admin.sql (safe to run this whole file again).
