-- Replaces the parlor_comments INSERT notify trigger.
-- pg_net lives in the `net` schema even when the extension is created in `extensions`.
-- The Edge Function gateway requires an apikey / Authorization header.
-- JWT verification on notify-parlor-comment must be OFF.
--
-- After a test comment, inspect:
--   select id, status_code, content, error_msg, created
--   from net._http_response
--   order by id desc
--   limit 10;

create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_notify_parlor_comment()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  publishable_key text := 'sb_publishable_a-Xtbm1_TmEYyVkY-bAekA_njjJU_3o';
begin
  perform net.http_post(
    url := 'https://atnrcraidpsocwhypabq.supabase.co/functions/v1/notify-parlor-comment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', publishable_key,
      'Authorization', 'Bearer ' || publishable_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'parlor_comments',
      'schema', 'public',
      'record', row_to_json(NEW)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists parlor_comment_insert_trigger on public.parlor_comments;
create trigger parlor_comment_insert_trigger
  after insert on public.parlor_comments
  for each row execute function public.trigger_notify_parlor_comment();
