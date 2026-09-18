-- Run in Supabase SQL Editor.
-- Replies on parlor notes. Does not alter parlor_notes, parlor_likes, or parlor_profiles.
-- Email on insert is not handled here: add a Database Webhook on parlor_comments INSERT
-- pointing at a Supabase Edge Function.

create table if not exists public.parlor_comments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.parlor_notes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author text not null,
  comment text not null,
  created_at timestamptz not null default now(),
  constraint parlor_comments_comment_len check (char_length(comment) between 1 and 280)
);

create index if not exists parlor_comments_note_id_idx
  on public.parlor_comments (note_id, created_at);

alter table public.parlor_comments enable row level security;

drop policy if exists "parlor_comments_member_read" on public.parlor_comments;
create policy "parlor_comments_member_read"
  on public.parlor_comments
  for select
  to authenticated
  using (true);

drop policy if exists "parlor_comments_member_insert" on public.parlor_comments;
create policy "parlor_comments_member_insert"
  on public.parlor_comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "parlor_comments_member_delete" on public.parlor_comments;
create policy "parlor_comments_member_delete"
  on public.parlor_comments
  for delete
  to authenticated
  using (auth.uid() = user_id or public.is_parlor_admin());

grant select, insert, delete on table public.parlor_comments to authenticated;
