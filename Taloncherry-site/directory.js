(function () {
  function escapeHtml(value) {
    if (typeof window.parlorEscape === "function") return window.parlorEscape(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function displayMediaUrl(value) {
    const parlor = window.parlorSafeMediaUrl ? window.parlorSafeMediaUrl(value) : "";
    if (parlor) return parlor;
    try {
      const parsed = new URL(String(value || "").trim());
      if (parsed.protocol === "https:") return parsed.href;
    } catch (err) { /* ignore */ }
    return "";
  }

  function snippet(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return "A member of the house.";
    return raw.length > 120 ? raw.slice(0, 117).trimEnd() + "…" : raw;
  }

  function formatPostedDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  async function loadLastPosted() {
    const cfg = window.PARLOR_CONFIG || {};
    const url = String(cfg.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/member_entries";
    if (!url || url.indexOf("http") !== 0) return {};
    const headers = await window.parlorRestHeaders();
    const res = await fetch(url + "?select=user_id,created_at", {
      method: "GET",
      headers: headers
    });
    if (!res.ok) return {};
    const rows = await res.json();
    const map = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || !row.user_id || !row.created_at) return;
      const prior = map[row.user_id];
      if (!prior || new Date(row.created_at).getTime() > new Date(prior).getTime()) {
        map[row.user_id] = row.created_at;
      }
    });
    return map;
  }

  async function loadProfiles() {
    const headers = await window.parlorRestHeaders();
    const base = window.parlorProfilesUrl();
    const attempts = [
      "?select=user_id,username,avatar_url,bio,revoked,badge,created_at&order=username.asc",
      "?select=user_id,username,avatar_url,bio,revoked,created_at&order=username.asc",
      "?select=user_id,username,avatar_url,bio,revoked&order=username.asc",
      "?select=user_id,username,avatar_url,bio&order=username.asc",
      "?select=user_id,username,avatar_url&order=username.asc"
    ];
    let lastDetail = "";
    for (let i = 0; i < attempts.length; i += 1) {
      const res = await fetch(base + attempts[i], { method: "GET", headers: headers });
      if (res.ok) {
        const rows = await res.json();
        return Array.isArray(rows) ? rows : [];
      }
      lastDetail = await res.text();
    }
    throw new Error(lastDetail || "The roll would not open.");
  }

  function renderCard(row, lastPosted) {
    const username = String(row.username || "").trim() || "Member";
    const href = window.parlorMemberHref
      ? window.parlorMemberHref(username)
      : "member.html?user=" + encodeURIComponent(username);
    const card = document.createElement("article");
    card.className = "directory-card";
    const faceUrl = displayMediaUrl(row.avatar_url);
    if (faceUrl) {
      const img = document.createElement("img");
      img.className = "directory-face";
      img.src = faceUrl;
      img.alt = "";
      card.append(img);
    } else {
      const mark = document.createElement("div");
      mark.className = "directory-face directory-mono";
      mark.textContent = username.slice(0, 2).toUpperCase();
      card.append(mark);
    }
    const postedOn = formatPostedDate(lastPosted);
    if (postedOn) {
      const notice = document.createElement("p");
      notice.className = "directory-posted";
      notice.textContent = "New content added on " + postedOn;
      card.append(notice);
    }
    const handle = document.createElement("h2");
    handle.className = "directory-handle";
    handle.innerHTML = escapeHtml(username);
    const badge = window.parlorBadgeForProfile ? window.parlorBadgeForProfile(row) : "";
    if (badge) {
      const mark = document.createElement("span");
      mark.className = "parlor-badge directory-badge";
      mark.textContent = badge;
      card.append(mark);
    }
    const bio = document.createElement("p");
    bio.className = "directory-bio";
    bio.innerHTML = escapeHtml(snippet(row.bio));
    const visit = document.createElement("a");
    visit.className = "directory-visit";
    visit.href = href;
    visit.textContent = "Visit Ledger";
    card.append(handle, bio, visit);
    return card;
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const gate = await window.parlorRequireSession();
    if (!gate.session) return;
    document.getElementById("gate-msg").hidden = true;
    document.getElementById("directory-main").hidden = false;
    await window.parlorMountChrome(gate.user, "directory");
    document.getElementById("sign-out").addEventListener("click", async function () {
      if (gate.client) await gate.client.auth.signOut();
      location.replace("login.html");
    });

    const grid = document.getElementById("directory-grid");
    const errorEl = document.getElementById("directory-error");
    const queryEl = document.getElementById("directory-query");
    const sortNameBtn = document.getElementById("directory-sort-name");
    const sortRecentBtn = document.getElementById("directory-sort-recent");
    let members = [];
    let lastPosted = {};
    let sortMode = "name";

    function postedStamp(row) {
      const raw = lastPosted[row && row.user_id];
      const time = raw ? new Date(raw).getTime() : 0;
      return Number.isNaN(time) ? 0 : time;
    }

    function paintRoll() {
      const needle = String(queryEl && queryEl.value || "").trim().toLowerCase();
      let shown = members.filter(function (row) {
        if (!needle) return true;
        const name = String(row.username || "").toLowerCase();
        const bio = String(row.bio || "").toLowerCase();
        return name.indexOf(needle) >= 0 || bio.indexOf(needle) >= 0;
      });
      shown.sort(function (a, b) {
        if (sortMode === "recent") {
          const diff = postedStamp(b) - postedStamp(a);
          if (diff) return diff;
        }
        return String(a.username || "").localeCompare(String(b.username || ""), undefined, { sensitivity: "base" });
      });
      grid.replaceChildren();
      if (!members.length) {
        const empty = document.createElement("p");
        empty.className = "directory-empty";
        empty.style.gridColumn = "1 / -1";
        empty.textContent = "The guest book has no names yet.";
        grid.append(empty);
        return;
      }
      if (!shown.length) {
        const empty = document.createElement("p");
        empty.className = "directory-empty";
        empty.style.gridColumn = "1 / -1";
        empty.textContent = "No member by that name is in the guest book.";
        grid.append(empty);
        return;
      }
      shown.forEach(function (row) {
        grid.append(renderCard(row, lastPosted[row.user_id]));
      });
    }

    function setSort(mode) {
      sortMode = mode === "recent" ? "recent" : "name";
      sortNameBtn.classList.toggle("is-active", sortMode === "name");
      sortRecentBtn.classList.toggle("is-active", sortMode === "recent");
      sortNameBtn.setAttribute("aria-pressed", sortMode === "name" ? "true" : "false");
      sortRecentBtn.setAttribute("aria-pressed", sortMode === "recent" ? "true" : "false");
      paintRoll();
    }

    try {
      const packed = await Promise.all([
        loadProfiles(),
        loadLastPosted().catch(function () { return {}; })
      ]);
      members = packed[0].filter(function (row) {
        if (!row || !row.username) return false;
        if (row.revoked === true || row.revoked === "true" || row.revoked === 1) return false;
        return true;
      });
      lastPosted = packed[1] || {};
      queryEl.addEventListener("input", paintRoll);
      sortNameBtn.addEventListener("click", function () { setSort("name"); });
      sortRecentBtn.addEventListener("click", function () { setSort("recent"); });
      paintRoll();
    } catch (err) {
      errorEl.hidden = false;
      errorEl.textContent = err.message || "The roll would not open.";
    }
  });
})();
