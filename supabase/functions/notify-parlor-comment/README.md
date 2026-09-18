# notify-parlor-comment

Sends a Resend email when a row is inserted into `public.parlor_comments`. Self-replies (commenter `user_id` equals the parent note owner) return 200 and skip mail.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the Edge runtime. Do not put them in git.

## Secrets

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
```

Optional from-address (must be a verified Resend domain):

```bash
supabase secrets set RESEND_FROM="The Parlor <notifications@taloncherry.com>"
```

## Deploy

From the workspace root (`Taloncherry-site/`):

```bash
supabase functions deploy notify-parlor-comment --no-verify-jwt
```

`--no-verify-jwt` is required so Database Webhooks can POST without a user JWT.

## Database webhook

In Supabase Dashboard → Database → Webhooks:

- Table: `parlor_comments`
- Events: INSERT
- Type: HTTP Request
- Method: POST
- URL: `https://<project-ref>.supabase.co/functions/v1/notify-parlor-comment`

No frontend or `parlor_notes` query changes are needed. The function looks up the parent note with the service role.
