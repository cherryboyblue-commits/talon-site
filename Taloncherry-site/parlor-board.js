(function () {
  async function restHeaders(extra) {
    const config = window.PARLOR_CONFIG || {};
    const client = window.parlorClient && window.parlorClient();
    let token = config.supabaseAnonKey;
    if (client) {
      const { data } = await client.auth.getSession();
      if (data?.session?.access_token) token = data.session.access_token;
    }
    return Object.assign({
      apikey: config.supabaseAnonKey,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    }, extra || {});
  }

  window.parlorLoadNotes = async function () {
    const res = await fetch(window.parlorRestUrl() + "?select=*&order=created_at.desc", {
      method: "GET",
      headers: await restHeaders()
    });
    if (!res.ok) throw new Error("The ledger could not be opened.");
    const rows = await res.json();
    return {
      notes: (rows || []).map(function (row) {
        return {
          id: row.id,
          author: row.author || "A member",
          note: row.note || "",
          created: row.created_at || ""
        };
      }),
      source: "supabase"
    };
  };

  window.parlorPinNote = async function ({ author, note, userId }) {
    const res = await fetch(window.parlorRestUrl(), {
      method: "POST",
      headers: await restHeaders(),
      body: JSON.stringify({
        author: author,
        note: note,
        user_id: userId
      })
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || "The note could not be pinned.");
    }
    const rows = await res.json();
    return rows[0] || rows;
  };
})();
