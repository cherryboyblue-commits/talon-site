-- Allow short stories on the member ledger. Safe to re-run.

alter table public.member_entries drop constraint if exists member_entries_category_check;
alter table public.member_entries
  add constraint member_entries_category_check
  check (
    lower(btrim(category)) in (
      'memories', 'memory',
      'dreams', 'dream',
      'poetry', 'lyrics', 'poetry_lyrics', 'poetry-lyrics',
      'stories', 'story', 'short_stories', 'short-stories'
    )
  );
