import { createClient } from "npm:@supabase/supabase-js@2";

const FORUM_URL = "https://www.taloncherry.com/forum.html";
const PARCHMENT = "#fdf6e3";
const BRASS = "#c4a35a";

type WebhookBody = {
  type?: string;
  table?: string;
  schema?: string;
  record?: Record<string, unknown> | null;
  payload?: {
    type?: string;
    table?: string;
    record?: Record<string, unknown> | null;
  };
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractRecord(payload: WebhookBody) {
  return payload.record || (payload.payload && payload.payload.record) || null;
}

function commentEmailHtml(opts: {
  author: string;
  comment: string;
  note: string;
}) {
  const author = escapeHtml(opts.author);
  const comment = escapeHtml(opts.comment).replace(/\n/g, "<br>");
  const note = escapeHtml(opts.note).replace(/\n/g, "<br>");
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#2c1a12;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:${PARCHMENT};border:2px solid ${BRASS};">
      <tr>
        <td style="padding:28px 32px 24px;color:#2c1a12;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#8a6420;">The Parlor</p>
          <h1 style="margin:0 0 18px;font-size:26px;font-weight:normal;color:#3d2418;">A reply was pinned to your note</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            <strong>${author}</strong> left a word on your corkboard.
          </p>
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7a4e18;">Their reply</p>
          <p style="margin:0 0 20px;padding:14px 16px;background:#f7ecd0;border:1px solid ${BRASS};font-size:17px;line-height:1.45;">${comment}</p>
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7a4e18;">Your note</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.45;color:#5c3310;font-style:italic;">${note}</p>
          <p style="margin:0;">
            <a href="${FORUM_URL}" style="display:inline-block;padding:10px 18px;background:${BRASS};color:#3d2418;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-size:12px;">Open the parlor</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json(405, { ok: false, error: "POST only" });
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const resendKey = Deno.env.get("RESEND_API_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { ok: false, error: "Missing Supabase service credentials." });
    }
    if (!resendKey) {
      return json(500, { ok: false, error: "Missing RESEND_API_KEY." });
    }

    let payload: WebhookBody;
    try {
      payload = await req.json();
    } catch {
      return json(400, { ok: false, error: "Invalid JSON." });
    }

    const eventType = payload.type || (payload.payload && payload.payload.type) || "";
    const table = payload.table || (payload.payload && payload.payload.table) || "";
    if (eventType && eventType !== "INSERT") {
      return json(200, { ok: true, skipped: "not_insert" });
    }
    if (table && table !== "parlor_comments") {
      return json(200, { ok: true, skipped: "wrong_table" });
    }

    const record = extractRecord(payload);
    if (!record) {
      return json(200, { ok: true, skipped: "no_record" });
    }

    const note_id = asText(record.note_id);
    const commenterId = asText(record.user_id);
    const author = asText(record.author) || "A member";
    const comment = asText(record.comment);
    if (!note_id || !commenterId || !comment) {
      return json(200, { ok: true, skipped: "incomplete_comment" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: parentNote, error: noteErr } = await supabase
      .from("parlor_notes")
      .select("user_id, author, note")
      .eq("id", note_id)
      .maybeSingle();

    if (noteErr || !parentNote) {
      return json(200, { ok: true, skipped: "note_missing" });
    }

    const ownerId = asText(parentNote.user_id);
    if (!ownerId) {
      return json(200, { ok: true, skipped: "note_missing" });
    }
    if (ownerId === commenterId) {
      return json(200, { ok: true, skipped: "self_reply" });
    }

    const { data: owner, error: ownerError } = await supabase.auth.admin.getUserById(ownerId);
    if (ownerError || !owner?.user) {
      return json(200, { ok: true, skipped: "no_recipient_email" });
    }
    const to = asText(owner.user.email);
    if (!to) {
      return json(200, { ok: true, skipped: "no_recipient_email" });
    }

    const noteText = asText(parentNote.note) || "(untitled pin)";
    const from = Deno.env.get("RESEND_FROM") || "The Parlor <notifications@taloncherry.com>";
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: author + " replied on The Parlor",
        html: commentEmailHtml({
          author,
          comment,
          note: noteText.slice(0, 600),
        }),
        text:
          author +
          " replied to your note on The Parlor.\n\n" +
          comment +
          "\n\nOpen the board: " +
          FORUM_URL,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      return json(502, { ok: false, error: detail || "Resend rejected the mail." });
    }

    return json(200, { ok: true });
  } catch (err) {
    return json(500, { ok: false, error: String(err && err.message ? err.message : err) });
  }
});
