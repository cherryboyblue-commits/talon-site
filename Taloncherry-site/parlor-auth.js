(function () {
  const cfg = () => window.PARLOR_CONFIG || {};
  let cachedClient = null;

  window.parlorNotesTable = function () {
    return String(cfg().parlorNotesTable || "parlor_notes").replace(/\s+/g, "_");
  };

  window.parlorRestUrl = function () {
    const c = cfg();
    return String(c.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/" + window.parlorNotesTable();
  };

  window.parlorClient = function () {
    if (cachedClient) return cachedClient;
    if (!window.supabase) throw new Error("Supabase library failed to load.");
    const c = cfg();
    cachedClient = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "talon-parlor-auth"
      }
    });
    return cachedClient;
  };

  window.PARLOR_ADMIN_HANDLE = "Talon86";
  window.PARLOR_ADMIN_EMAIL = "mr_jones86@ymail.com";

  window.parlorNormalizeUsername = function (raw) {
    return String(raw || "").trim().replace(/^@+/, "").replace(/\s+/g, "");
  };

  window.parlorIsAdminEmail = function (user) {
    const email = String(user && user.email || "").trim().toLowerCase();
    return email === String(window.PARLOR_ADMIN_EMAIL || "").toLowerCase();
  };

  window.parlorDisplayName = function (user) {
    if (!user) return "Guest";
    if (window.parlorIsAdminEmail(user)) return window.PARLOR_ADMIN_HANDLE;
    const meta = user.user_metadata || {};
    return window.parlorNormalizeUsername(meta.username || meta.display_name || meta.name) || "Member";
  };

  window.parlorIsAdmin = function (user) {
    if (!user) return false;
    if (window.parlorIsAdminEmail(user)) return true;
    const needle = String(window.PARLOR_ADMIN_HANDLE || "Talon86").toLowerCase();
    const meta = user.user_metadata || {};
    const handle = window.parlorNormalizeUsername(meta.username || meta.display_name || meta.name).toLowerCase();
    return handle === needle;
  };

  window.parlorStampAdminIdentity = async function (client, user) {
    if (!user || !window.parlorIsAdminEmail(user) || !client) return user;
    const meta = user.user_metadata || {};
    if (meta.username === window.PARLOR_ADMIN_HANDLE && meta.display_name === window.PARLOR_ADMIN_HANDLE) {
      return user;
    }
    const { data, error } = await client.auth.updateUser({
      data: {
        username: window.PARLOR_ADMIN_HANDLE,
        display_name: window.PARLOR_ADMIN_HANDLE,
        name: window.PARLOR_ADMIN_HANDLE
      }
    });
    if (error) {
      console.warn(error);
      return user;
    }
    return data.user || user;
  };

  window.parlorRequireSession = async function () {
    const client = window.parlorClient();
    const { data, error } = await client.auth.getSession();
    if (error) console.warn(error);
    const session = data?.session || null;
    if (!session) {
      const here = (location.pathname.split("/").pop() || "forum.html");
      location.replace("login.html?next=" + encodeURIComponent(here));
      return { session: null, user: null, client, setup: false, isAdmin: false };
    }
    session.user = await window.parlorStampAdminIdentity(client, session.user);
    const isAdmin = window.parlorIsAdmin(session.user);
    session.isAdmin = isAdmin;
    return { session, user: session.user, client, setup: false, isAdmin };
  };

  window.parlorEscape = function (value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };
})();
