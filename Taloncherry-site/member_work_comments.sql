-- Encouragement under ledger pieces.
-- Run this in the Supabase SQL editor after member_entries exists. Safe to re-run.

create table if not exists public.member_work_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.member_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author text not null,
  comment text not null,
  created_at timestamptz not null default now(),
  constraint member_work_comments_len check (char_length(comment) between 1 and 280)
);

create index if not exists member_work_comments_entry_idx
  on public.member_work_comments (entry_id, created_at);

alter table public.member_work_comments enable row level security;

drop policy if exists "member_work_comments_read" on public.member_work_comments;
create policy "member_work_comments_read"
  on public.member_work_comments
  for select
  to authenticated
  using (true);

drop policy if exists "member_work_comments_insert" on public.member_work_comments;
create policy "member_work_comments_insert"
  on public.member_work_comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "member_work_comments_delete" on public.member_work_comments;
create policy "member_work_comments_delete"
  on public.member_work_comments
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on table public.member_work_comments to authenticated;

notify pgrst, 'reload schema';
