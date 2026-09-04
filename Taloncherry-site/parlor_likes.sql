-- Likes on parlor notes. Table is assumed to exist:
--   parlor_likes (id, note_id, user_id) with unique (note_id, user_id)
-- Run if members cannot read counts or save a heart.

alter table public.parlor_likes enable row level security;

drop policy if exists "parlor_likes_member_read" on public.parlor_likes;
create policy "parlor_likes_member_read"
  on public.parlor_likes
  for select
  to authenticated
  using (true);

drop policy if exists "parlor_likes_member_insert" on public.parlor_likes;
create policy "parlor_likes_member_insert"
  on public.parlor_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "parlor_likes_member_delete" on public.parlor_likes;
create policy "parlor_likes_member_delete"
  on public.parlor_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on table public.parlor_likes to authenticated;
