-- Personal ledger for Parlor members.
-- Does not alter parlor_notes RLS or queries.
-- Run in the Supabase SQL editor after parlor_admin.sql / parlor_upgrade.sql.

alter table public.parlor_profiles
  add column if not exists bio text,
  add column if not exists background_url text;

create table if not exists public.member_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.parlor_profiles (user_id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS does not add columns to an older table.
alter table public.member_entries
  add column if not exists user_id uuid,
  add column if not exists category text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists created_at timestamptz default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'member_entries' and column_name = 'content'
  ) then
    execute $sql$
      update public.member_entries
         set body = content
       where (body is null or btrim(body) = '')
         and content is not null
    $sql$;
    execute $sql$
      update public.member_entries
         set content = body
       where (content is null or btrim(content) = '')
         and body is not null
    $sql$;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'member_entries' and column_name = 'note'
  ) then
    execute $sql$
      update public.member_entries
         set body = note
       where (body is null or btrim(body) = '')
         and note is not null
    $sql$;
  end if;
end $$;

update public.member_entries
   set body = coalesce(nullif(btrim(body), ''), '(untitled page)')
 where body is null or btrim(body) = '';

update public.member_entries
   set title = coalesce(nullif(btrim(title), ''), 'Untitled')
 where title is null or btrim(title) = '';

update public.member_entries
   set category = 'memories'
 where category is null or btrim(category) = '';

alter table public.member_entries alter column body set not null;
alter table public.member_entries alter column title set not null;
alter table public.member_entries alter column category set not null;

do $$
begin
  alter table public.member_entries drop constraint if exists member_entries_category_check;
  alter table public.member_entries
    add constraint member_entries_category_check
    check (
      lower(btrim(category)) in (
        'memories', 'memory',
        'dreams', 'dream',
        'poetry', 'lyrics', 'poetry_lyrics', 'poetry-lyrics'
      )
    );
exception
  when others then
    null;
end $$;

alter table public.member_entries
  add column if not exists sort_order integer not null default 0;

update public.member_entries e
   set sort_order = sub.rn
  from (
    select id,
           row_number() over (
             partition by user_id, category
             order by created_at asc, id asc
           ) - 1 as rn
      from public.member_entries
  ) sub
 where e.id = sub.id
   and e.sort_order = 0;

create index if not exists member_entries_user_cat_idx
  on public.member_entries (user_id, category, sort_order, created_at);

alter table public.member_entries enable row level security;

drop policy if exists "member_entries_member_read" on public.member_entries;
create policy "member_entries_member_read"
  on public.member_entries
  for select
  to authenticated
  using (true);

drop policy if exists "member_entries_self_insert" on public.member_entries;
create policy "member_entries_self_insert"
  on public.member_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "member_entries_self_update" on public.member_entries;
create policy "member_entries_self_update"
  on public.member_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "member_entries_self_delete" on public.member_entries;
create policy "member_entries_self_delete"
  on public.member_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.member_entries to authenticated;
grant select, update on table public.parlor_profiles to authenticated;

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

create or replace function public.member_entries_sync_text()
returns trigger
language plpgsql
as $$
begin
  if new.body is null or btrim(new.body) = '' then
    new.body := coalesce(new.content, '');
  end if;
  if new.content is null or btrim(new.content) = '' then
    new.content := coalesce(new.body, '');
  end if;
  return new;
end;
$$;

drop trigger if exists member_entries_sync_text on public.member_entries;
create trigger member_entries_sync_text
  before insert or update on public.member_entries
  for each row execute function public.member_entries_sync_text();

notify pgrst, 'reload schema';
