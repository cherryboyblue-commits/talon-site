-- Hearts on ledger pieces. Run in the Supabase SQL editor after member_entries exists. Safe to re-run.

create table if not exists public.member_work_likes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.member_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (entry_id, user_id)
);

create index if not exists member_work_likes_entry_idx
  on public.member_work_likes (entry_id);

alter table public.member_work_likes enable row level security;

drop policy if exists "member_work_likes_read" on public.member_work_likes;
create policy "member_work_likes_read"
  on public.member_work_likes
  for select
  to authenticated
  using (true);

drop policy if exists "member_work_likes_insert" on public.member_work_likes;
create policy "member_work_likes_insert"
  on public.member_work_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "member_work_likes_delete" on public.member_work_likes;
create policy "member_work_likes_delete"
  on public.member_work_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on table public.member_work_likes to authenticated;

notify pgrst, 'reload schema';
