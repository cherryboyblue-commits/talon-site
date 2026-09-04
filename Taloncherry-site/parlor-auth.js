(function () {
  const cfg = () => window.PARLOR_CONFIG || {};
  let cachedClient = null;

  window.PARLOR_CATEGORIES = [
    { id: "general", label: "General" },
    { id: "music", label: "Music" },
    { id: "writing", label: "Writing" },
    { id: "reflection", label: "Reflection" }
  ];

  window.parlorNotesTable = function () {
    return String(cfg().parlorNotesTable || "parlor_notes").replace(/\s+/g, "_");
  };

  window.parlorProfilesTable = function () {
    return String(cfg().parlorProfilesTable || "parlor_profiles").replace(/\s+/g, "_");
  };

  window.parlorMediaBucket = function () {
    return String(cfg().parlorMediaBucket || "parlor-media");
  };

  window.parlorRestUrl = function () {
    const c = cfg();
    return String(c.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/" + window.parlorNotesTable();
  };

  window.parlorProfilesUrl = function () {
    const c = cfg();
    return String(c.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/" + window.parlorProfilesTable();
  };

  window.parlorLikesTable = function () {
    return String(cfg().parlorLikesTable || "parlor_likes").replace(/\s+/g, "_");
  };

  window.parlorLikesUrl = function () {
    const c = cfg();
    return String(c.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/" + window.parlorLikesTable();
  };

  window.parlorNormalizeCategory = function (raw) {
    const value = String(raw == null ? "" : raw).trim().toLowerCase().replace(/^#/, "");
    if (!value || value === "null" || value === "undefined") return "general";
    const known = window.PARLOR_CATEGORIES.map(function (item) { return item.id; });
    return known.indexOf(value) >= 0 ? value : "general";
  };

  window.parlorDrawerFor = function (row) {
    const stored = row && row.category;
    if (stored != null && String(stored).trim() !== "") {
      return window.parlorNormalizeCategory(stored);
    }
    const text = String(row && row.note || "");
    const tagged = text.match(/#(general|music|writing|reflection)\b/i);
    if (tagged) return tagged[1].toLowerCase();
    return "general";
  };

  window.parlorCategoryLabel = function (raw) {
    const id = window.parlorNormalizeCategory(raw);
    const match = window.PARLOR_CATEGORIES.find(function (item) { return item.id === id; });
    return match ? match.label : "General";
  };

  window.parlorPublicMediaUrl = function (objectPath) {
    const base = String(cfg().supabaseUrl || "").replace(/\/$/, "");
    const bucket = window.parlorMediaBucket();
    const encoded = String(objectPath || "")
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    return base + "/storage/v1/object/public/" + encodeURIComponent(bucket) + "/" + encoded;
  };

  window.parlorSafeMediaUrl = function (value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:") return "";
      const origin = new URL(String(cfg().supabaseUrl || ""));
      const host = parsed.hostname.toLowerCase();
      const expected = origin.hostname.toLowerCase();
      const project = expected.split(".")[0];
      const hostOk =
        host === expected ||
        host === project + ".supabase.co" ||
        host === project + ".storage.supabase.co";
      if (!hostOk) return "";
      const bucket = window.parlorMediaBucket();
      const path = decodeURIComponent(parsed.pathname);
      const publicNeedle = "/object/public/" + bucket + "/";
      const signedNeedle = "/object/sign/" + bucket + "/";
      if (path.indexOf(publicNeedle) < 0 && path.indexOf(signedNeedle) < 0) return "";
      return parsed.href;
    } catch (err) {
      return "";
    }
  };

  window.parlorAvatarFromUser = function (user) {
    if (!user) return "";
    const meta = user.user_metadata || {};
    return window.parlorSafeMediaUrl(meta.avatar_url || meta.avatarUrl || "");
  };

  function imageExtension(file) {
    const name = String(file && file.name || "").toLowerCase();
    if (name.endsWith(".png")) return "png";
    if (name.endsWith(".webp")) return "webp";
    if (name.endsWith(".gif")) return "gif";
    return "jpg";
  }

  window.parlorValidateImageFile = function (file) {
    if (!file) return "";
    const type = String(file.type || "").toLowerCase();
    const ok = type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/gif";
    if (!ok) return "Likenesses should be a JPG, PNG, WEBP, or GIF.";
    if (file.size > 5 * 1024 * 1024) return "Keep the image under 5 MB so the pin will hold.";
    return "";
  };

  window.parlorUploadMedia = async function (file, folder) {
    const problem = window.parlorValidateImageFile(file);
    if (problem) throw new Error(problem);
    const client = window.parlorClient();
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData && sessionData.session && sessionData.session.user;
    if (!user) throw new Error("Sign in before affixing a likeness.");
    const safeFolder = String(folder || "misc").replace(/[^a-z0-9_-]/gi, "") || "misc";
    const path = user.id + "/" + safeFolder + "/" + Date.now() + "." + imageExtension(file);
    const { error } = await client.storage.from(window.parlorMediaBucket()).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/jpeg"
    });
    if (error) {
      const msg = error.message || String(error);
      if (/bucket/i.test(msg) && /not found|does not exist/i.test(msg)) {
        throw new Error("The parlor-media shelf is missing. Run parlor_upgrade.sql in the Supabase SQL editor.");
      }
      throw error;
    }
    const built = window.parlorPublicMediaUrl(path);
    const { data } = client.storage.from(window.parlorMediaBucket()).getPublicUrl(path);
    return window.parlorSafeMediaUrl(built) || window.parlorSafeMediaUrl(data && data.publicUrl) || built;
  };

  async function parlorWriteProfileAvatar(user, url) {
    const headers = await window.parlorRestHeaders();
    const username = window.parlorDisplayName(user);
    const payload = { avatar_url: url, username: username };
    const patch = await fetch(
      window.parlorProfilesUrl() + "?user_id=eq." + encodeURIComponent(user.id),
      { method: "PATCH", headers: headers, body: JSON.stringify(payload) }
    );
    if (patch.ok) {
      try {
        const rows = await patch.json();
        if (Array.isArray(rows) && rows.length) return;
      } catch (err) {
        return;
      }
    }
    const insertHeaders = Object.assign({}, headers, {
      Prefer: "return=representation,resolution=merge-duplicates"
    });
    const ins = await fetch(window.parlorProfilesUrl() + "?on_conflict=user_id", {
      method: "POST",
      headers: insertHeaders,
      body: JSON.stringify({
        user_id: user.id,
        username: username,
        avatar_url: url
      })
    });
    if (!ins.ok) {
      console.warn("Profile likeness could not be written to parlor_profiles.", await ins.text());
    }
  }

  window.parlorSaveAvatar = async function (file) {
    const url = await window.parlorUploadMedia(file, "avatars");
    const client = window.parlorClient();
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData && sessionData.session && sessionData.session.user;
    if (!user) throw new Error("Sign in before affixing a likeness.");
    const meta = user.user_metadata || {};
    await client.auth.updateUser({
      data: Object.assign({}, meta, { avatar_url: url })
    });
    await parlorWriteProfileAvatar(user, url);
    return url;
  };

  window.parlorLoadAvatarMap = async function () {
    const map = {};
    try {
      const res = await fetch(
        window.parlorProfilesUrl() + "?select=user_id,username,avatar_url",
        { method: "GET", headers: await window.parlorRestHeaders() }
      );
      if (!res.ok) return map;
      const rows = await res.json();
      (rows || []).forEach(function (row) {
        if (!row || !row.user_id) return;
        map[row.user_id] = {
          username: row.username || "",
          avatar_url: window.parlorSafeMediaUrl(row.avatar_url)
        };
      });
    } catch (err) {
      console.warn(err);
    }
    return map;
  };

  window.parlorResolveAvatar = function (userId, author, avatarMap, currentUser) {
    if (userId && avatarMap && avatarMap[userId] && avatarMap[userId].avatar_url) {
      return avatarMap[userId].avatar_url;
    }
    if (currentUser && userId && currentUser.id === userId) {
      return window.parlorAvatarFromUser(currentUser);
    }
    const name = window.parlorNormalizeUsername(author).toLowerCase();
    if (avatarMap) {
      const keys = Object.keys(avatarMap);
      for (let i = 0; i < keys.length; i += 1) {
        const row = avatarMap[keys[i]];
        if (window.parlorNormalizeUsername(row.username).toLowerCase() === name && row.avatar_url) {
          return row.avatar_url;
        }
      }
    }
    return "";
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

  window.parlorRestHeaders = async function (extra) {
    const config = cfg();
    const client = window.parlorClient && window.parlorClient();
    let token = config.supabaseAnonKey;
    if (client) {
      const { data } = await client.auth.getSession();
      if (data && data.session && data.session.access_token) token = data.session.access_token;
    }
    return Object.assign({
      apikey: config.supabaseAnonKey,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    }, extra || {});
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
      data: Object.assign({}, meta, {
        username: window.PARLOR_ADMIN_HANDLE,
        display_name: window.PARLOR_ADMIN_HANDLE,
        name: window.PARLOR_ADMIN_HANDLE
      })
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
