(function () {
  const CATS = [
    { id: "memories", label: "Memories" },
    { id: "dreams", label: "Dreams" },
    { id: "poetry", label: "Poetry & Lyrics" }
  ];

  function uuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function entriesUrl() {
    const cfg = window.PARLOR_CONFIG || {};
    return String(cfg.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/member_entries";
  }

  function commentsUrl() {
    const cfg = window.PARLOR_CONFIG || {};
    return String(cfg.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/member_work_comments";
  }

  function escapeHtml(value) {
    if (typeof window.parlorEscape === "function") return window.parlorEscape(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function linkify(text) {
    const source = String(text || "");
    const parts = [];
    const re = /\b((?:https?:\/\/|www\.)[^\s<]+)/gi;
    let last = 0;
    let match;
    while ((match = re.exec(source))) {
      parts.push(escapeHtml(source.slice(last, match.index)));
      let raw = match[1];
      let trailing = "";
      raw = raw.replace(/[),.;:!?]+$/g, function (mark) {
        trailing = mark;
        return "";
      });
      let href = /^www\./i.test(raw) ? "https://" + raw : raw;
      let ok = false;
      try {
        const parsed = new URL(href);
        ok = parsed.protocol === "http:" || parsed.protocol === "https:";
        href = parsed.href;
      } catch (err) {
        ok = false;
      }
      if (ok) {
        parts.push(
          '<a class="ledger-inline-link" href="' + escapeHtml(href) +
            '" target="_blank" rel="noopener noreferrer">' + escapeHtml(raw) + "</a>" +
            escapeHtml(trailing)
        );
      } else {
        parts.push(escapeHtml(match[1]));
      }
      last = match.index + match[1].length;
    }
    parts.push(escapeHtml(source.slice(last)));
    return parts.join("");
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  function parseQuery() {
    const params = new URLSearchParams(location.search);
    return String(params.get("user") || params.get("user_id") || params.get("id") || "").trim();
  }

  function normalizeCategory(raw) {
    const value = String(raw == null ? "" : raw).trim().toLowerCase();
    if (value === "memory") return "memories";
    if (value === "dream") return "dreams";
    if (value === "lyrics" || value === "poetry_lyrics" || value === "poetry-lyrics") return "poetry";
    return CATS.some(function (item) { return item.id === value; }) ? value : "memories";
  }

  function categoryAliases(raw) {
    const id = normalizeCategory(raw);
    if (id === "memories") return ["memories", "memory"];
    if (id === "dreams") return ["dreams", "dream"];
    if (id === "poetry") return ["poetry", "lyrics", "poetry_lyrics", "poetry-lyrics"];
    return [id];
  }

  async function fetchProfile(lookup, currentUser) {
    const headers = await window.parlorRestHeaders();
    const base = window.parlorProfilesUrl();
    const selects = [
      "user_id,username,avatar_url,bio,background_url",
      "user_id,username,avatar_url,bio",
      "user_id,username,avatar_url"
    ];
    const filters = [];
    if (uuidLike(lookup)) {
      filters.push("user_id=eq." + encodeURIComponent(lookup));
    } else if (lookup) {
      filters.push("username=ilike." + encodeURIComponent(lookup));
      filters.push("username=eq." + encodeURIComponent(lookup));
    } else if (currentUser && currentUser.id) {
      filters.push("user_id=eq." + encodeURIComponent(currentUser.id));
    }
    for (let s = 0; s < selects.length; s += 1) {
      for (let f = 0; f < filters.length; f += 1) {
        const res = await fetch(base + "?select=" + selects[s] + "&" + filters[f] + "&limit=1", {
          method: "GET",
          headers: headers
        });
        if (!res.ok) continue;
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]) return rows[0];
      }
    }
    return null;
  }

  async function fetchEntries(userId, category) {
    if (!userId) return [];
    const headers = await window.parlorRestHeaders();
    const aliases = categoryAliases(category);
    const userFilter = "&user_id=eq." + encodeURIComponent(userId);
    const attempts = [
      "?select=id,user_id,category,title,body,content,created_at,sort_order&order=sort_order.asc,created_at.asc",
      "?select=id,user_id,category,title,body,created_at&order=created_at.asc",
      "?select=id,user_id,category,title,content,created_at&order=created_at.asc",
      "?select=*&order=created_at.asc"
    ];
    let lastDetail = "";
    for (let i = 0; i < attempts.length; i += 1) {
      const res = await fetch(entriesUrl() + attempts[i] + userFilter, { method: "GET", headers: headers });
      if (res.ok) {
        const rows = await res.json();
        return (Array.isArray(rows) ? rows : []).filter(function (row) {
          const cat = String(row.category || "").trim().toLowerCase();
          return aliases.indexOf(cat) >= 0;
        }).map(function (row) {
          return {
            id: row.id,
            user_id: row.user_id,
            category: row.category,
            title: row.title || row.name || "Untitled",
            body: row.body || row.content || row.note || row.text || "",
            created_at: row.created_at,
            sort_order: Number(row.sort_order)
          };
        });
      }
      lastDetail = await res.text();
    }
    throw new Error(lastDetail || "The ledger would not open.");
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

  function paintBanner(el, url) {
    const safe = displayMediaUrl(url);
    if (safe) {
      el.style.backgroundImage =
        "linear-gradient(180deg, rgba(44,26,18,0.15), rgba(44,26,18,0.55)), url(\"" + safe.replace(/"/g, "") + "\")";
      el.classList.add("has-photo");
    } else {
      el.style.backgroundImage = "";
      el.classList.remove("has-photo");
    }
  }

  function paintProfile(profile) {
    const username = profile.username || "Member";
    document.title = username + " · Ledger | Talon T. Cherry";
    document.getElementById("ledger-name").textContent = username;
    document.getElementById("ledger-bio").textContent = profile.bio || "A member of the house.";
    paintBanner(document.getElementById("ledger-banner"), profile.background_url);
    const face = document.getElementById("ledger-face");
    const fallback = document.querySelector(".ledger-face-fallback");
    if (fallback) fallback.remove();
    const avatar = displayMediaUrl(profile.avatar_url);
    if (avatar) {
      face.src = avatar;
      face.alt = username;
      face.hidden = false;
    } else {
      face.removeAttribute("src");
      face.hidden = true;
      const mark = document.createElement("div");
      mark.className = "ledger-face ledger-face-fallback";
      mark.textContent = String(username).slice(0, 2).toUpperCase();
      document.getElementById("ledger-banner").append(mark);
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const gate = await window.parlorRequireSession();
    if (!gate.session) return;
    const currentUser = gate.user;
    const main = document.getElementById("ledger-main");
    const gateMsg = document.getElementById("gate-msg");
    if (gateMsg) gateMsg.hidden = true;
    if (main) main.hidden = false;

    document.getElementById("sign-out").addEventListener("click", async function () {
      if (gate.client) await gate.client.auth.signOut();
      location.replace("login.html");
    });
    await window.parlorMountChrome(currentUser, "ledger");

    const lookup = parseQuery();
    let profile = null;
    try {
      profile = await fetchProfile(lookup, currentUser);
    } catch (err) {
      console.warn(err);
    }
    if (!profile && (!lookup || (currentUser && (lookup === currentUser.id || lookup.toLowerCase() === String(window.parlorDisplayName(currentUser) || "").toLowerCase())))) {
      profile = {
        user_id: currentUser.id,
        username: window.parlorDisplayName(currentUser),
        avatar_url: window.parlorAvatarFromUser ? window.parlorAvatarFromUser(currentUser) : "",
        bio: "",
        background_url: ""
      };
    }

    const errorEl = document.getElementById("ledger-error");
    if (!profile) {
      if (errorEl) errorEl.textContent = "No member by that name is in the guest book.";
      return;
    }

    const isOwn = Boolean(currentUser && currentUser.id && profile.user_id === currentUser.id);
    paintProfile(profile);

    const writeBtn = document.getElementById("ledger-write");
    const editBtn = document.getElementById("ledger-edit");
    const compose = document.getElementById("ledger-compose");
    if (writeBtn) writeBtn.hidden = true;
    editBtn.hidden = !isOwn;
    compose.hidden = !isOwn;

    let active = normalizeCategory(new URLSearchParams(location.search).get("tab"));
    const listEl = document.getElementById("ledger-list");
    let tabRows = [];
    let openWork = null;

    function commentsUrlLocal() {
      return commentsUrl();
    }

    function renderWorkComments(rows) {
      const list = document.getElementById("work-comment-list");
      list.replaceChildren();
      if (!rows.length) {
        const empty = document.createElement("p");
        empty.className = "work-comment-empty";
        empty.textContent = "No encouragement yet. Leave a kind word.";
        list.append(empty);
        return;
      }
      rows.forEach(function (row) {
        const item = document.createElement("li");
        item.className = "work-comment-item";
        item.innerHTML = '<span class="work-comment-author">' + escapeHtml(row.author || "Member") +
          '</span><p class="work-comment-text">' + linkify(row.comment || "") + "</p>";
        list.append(item);
      });
    }

    async function loadWorkComments(entryId) {
      const note = document.getElementById("work-comment-error");
      note.textContent = "";
      const res = await fetch(
        commentsUrlLocal() +
          "?select=id,entry_id,user_id,author,comment,created_at" +
          "&entry_id=eq." + encodeURIComponent(entryId) +
          "&order=created_at.asc",
        { method: "GET", headers: await window.parlorRestHeaders() }
      );
      if (!res.ok) {
        renderWorkComments([]);
        const detail = await res.text();
        const missing = /PGRST205|does not exist|schema cache/i.test(detail);
        note.textContent = missing
          ? "Run member_work_comments.sql in the Supabase SQL editor, then refresh."
          : "Encouragement could not be loaded.";
        return;
      }
      const rows = await res.json();
      renderWorkComments(Array.isArray(rows) ? rows : []);
    }

    async function patchEntry(id, payload) {
      const res = await fetch(entriesUrl() + "?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        headers: await window.parlorRestHeaders(),
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.text()) || "The page would not hold.");
      const rows = await res.json();
      return Array.isArray(rows) ? rows[0] : rows;
    }

    async function persistOrder(rows) {
      for (let i = 0; i < rows.length; i += 1) {
        rows[i].sort_order = i;
        try {
          await patchEntry(rows[i].id, { sort_order: i });
        } catch (err) {
          console.warn(err);
        }
      }
    }

    function openWorkModal(row) {
      openWork = row;
      const canEdit = isOwn;
      const writing = row.body || row.content || "";
      document.getElementById("work-mode").textContent = canEdit ? "Your page" : "A page from this ledger";
      const title = document.getElementById("work-title");
      const body = document.getElementById("work-body");
      const titleEdit = document.getElementById("work-title-edit");
      const bodyEdit = document.getElementById("work-body-edit");
      const titleRead = document.getElementById("work-title-read");
      const bodyRead = document.getElementById("work-body-read");
      title.value = row.title || "";
      body.value = writing;
      title.required = canEdit;
      body.required = canEdit;
      title.readOnly = !canEdit;
      body.readOnly = !canEdit;
      titleEdit.hidden = !canEdit;
      bodyEdit.hidden = !canEdit;
      titleRead.hidden = canEdit;
      bodyRead.hidden = canEdit;
      titleRead.textContent = row.title || "Untitled";
      bodyRead.innerHTML = linkify(writing);
      document.getElementById("work-save").hidden = !canEdit;
      document.getElementById("work-delete").hidden = !canEdit;
      document.getElementById("work-date").textContent = formatDate(row.created_at);
      document.getElementById("work-comment-input").value = "";
      document.getElementById("work-modal").hidden = false;
      loadWorkComments(row.id);
      if (canEdit) title.focus();
    }

    function renderWorks() {
      listEl.replaceChildren();
      if (!tabRows.length) {
        const empty = document.createElement("p");
        empty.className = "ledger-empty";
        empty.textContent = isOwn
          ? "Nothing bound here yet. Title a piece above and save it to this tab."
          : "This page of the ledger is still blank.";
        listEl.append(empty);
        return;
      }
      tabRows.forEach(function (row, index) {
        const item = document.createElement("article");
        item.className = "ledger-work";
        item.dataset.id = row.id;
        item.draggable = isOwn;
        if (isOwn) {
          const order = document.createElement("div");
          order.className = "ledger-order";
          const up = document.createElement("button");
          up.type = "button";
          up.dataset.move = "up";
          up.dataset.id = row.id;
          up.textContent = "▲";
          up.setAttribute("aria-label", "Move up");
          up.disabled = index === 0;
          const down = document.createElement("button");
          down.type = "button";
          down.dataset.move = "down";
          down.dataset.id = row.id;
          down.textContent = "▼";
          down.setAttribute("aria-label", "Move down");
          down.disabled = index === tabRows.length - 1;
          order.append(up, down);
          item.append(order);
        }
        const main = document.createElement("button");
        main.type = "button";
        main.className = "ledger-work-main";
        main.dataset.open = row.id;
        const title = document.createElement("h3");
        title.className = "ledger-work-title";
        title.innerHTML = escapeHtml(row.title || "Untitled");
        const meta = document.createElement("p");
        meta.className = "ledger-work-meta";
        meta.textContent = (isOwn ? "Open to edit · " : "Open to read · ") + formatDate(row.created_at);
        main.append(title, meta);
        item.append(main);
        listEl.append(item);
      });
    }

    async function moveWork(id, dir) {
      const index = tabRows.findIndex(function (row) { return String(row.id) === String(id); });
      if (index < 0) return;
      const next = index + dir;
      if (next < 0 || next >= tabRows.length) return;
      const swap = tabRows[index];
      tabRows[index] = tabRows[next];
      tabRows[next] = swap;
      renderWorks();
      await persistOrder(tabRows);
    }

    async function showTab(category) {
      active = normalizeCategory(category);
      document.querySelectorAll(".ledger-tab").forEach(function (btn) {
        const on = btn.dataset.category === active;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      if (errorEl) errorEl.textContent = "";
      try {
        tabRows = await fetchEntries(profile.user_id, active);
        tabRows.sort(function (a, b) {
          const ao = Number.isFinite(a.sort_order) ? a.sort_order : 9999;
          const bo = Number.isFinite(b.sort_order) ? b.sort_order : 9999;
          if (ao !== bo) return ao - bo;
          return String(a.created_at || "").localeCompare(String(b.created_at || ""));
        });
        renderWorks();
      } catch (err) {
        listEl.replaceChildren();
        if (errorEl) {
          errorEl.textContent = "Run member_ledger.sql in Supabase, then refresh. " + (err.message || "");
        }
      }
    }

    document.getElementById("ledger-tabs").addEventListener("click", function (event) {
      const btn = event.target.closest(".ledger-tab");
      if (!btn) return;
      showTab(btn.dataset.category);
    });

    compose.addEventListener("submit", async function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!isOwn) return;
      const title = String(document.getElementById("compose-title").value || "").trim();
      const body = String(document.getElementById("compose-body").value || "").trim();
      if (!title || !body) return;
      const submit = document.getElementById("compose-submit");
      submit.disabled = true;
      const text = body.slice(0, 12000);
      const heading = title.slice(0, 160);
      const aliases = categoryAliases(active);
      try {
        let saved = null;
        let lastDetail = "";
        for (let a = 0; a < aliases.length && !saved; a += 1) {
          const payloads = [
            {
              user_id: currentUser.id,
              category: aliases[a],
              title: heading,
              body: text,
              content: text,
              sort_order: tabRows.length
            },
            {
              user_id: currentUser.id,
              category: aliases[a],
              title: heading,
              body: text,
              content: text
            }
          ];
          for (let i = 0; i < payloads.length && !saved; i += 1) {
            const res = await fetch(entriesUrl(), {
              method: "POST",
              headers: await window.parlorRestHeaders(),
              body: JSON.stringify(payloads[i])
            });
            if (res.ok) {
              const rows = await res.json();
              saved = (Array.isArray(rows) ? rows[0] : rows) || payloads[i];
              break;
            }
            lastDetail = await res.text();
            if (res.status !== 400 && lastDetail.indexOf("23514") < 0 && lastDetail.indexOf("category") < 0) {
              break;
            }
          }
        }
        if (!saved) throw new Error(lastDetail || "The page would not take the ink.");
        compose.reset();
        await showTab(active);
      } catch (err) {
        if (errorEl) errorEl.textContent = err.message || "The page would not take the ink.";
      } finally {
        submit.disabled = false;
      }
    });

    listEl.addEventListener("click", async function (event) {
      const mover = event.target.closest("[data-move]");
      if (mover && isOwn) {
        event.preventDefault();
        await moveWork(mover.dataset.id, mover.dataset.move === "up" ? -1 : 1);
        return;
      }
      const opener = event.target.closest("[data-open]");
      if (!opener) return;
      const row = tabRows.find(function (item) { return String(item.id) === String(opener.dataset.open); });
      if (row) openWorkModal(row);
    });

    let dragId = "";
    listEl.addEventListener("dragstart", function (event) {
      const item = event.target.closest(".ledger-work");
      if (!isOwn || !item) return;
      dragId = item.dataset.id;
      event.dataTransfer.effectAllowed = "move";
    });
    listEl.addEventListener("dragover", function (event) {
      if (!isOwn || !dragId) return;
      event.preventDefault();
    });
    listEl.addEventListener("drop", async function (event) {
      const item = event.target.closest(".ledger-work");
      if (!isOwn || !item || !dragId) return;
      event.preventDefault();
      const from = tabRows.findIndex(function (row) { return String(row.id) === String(dragId); });
      const to = tabRows.findIndex(function (row) { return String(row.id) === String(item.dataset.id); });
      dragId = "";
      if (from < 0 || to < 0 || from === to) return;
      const moved = tabRows.splice(from, 1)[0];
      tabRows.splice(to, 0, moved);
      renderWorks();
      await persistOrder(tabRows);
    });

    const workModal = document.getElementById("work-modal");
    document.getElementById("work-comment-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!openWork) return;
      const input = document.getElementById("work-comment-input");
      const text = String(input.value || "").trim();
      if (!text) return;
      const submit = document.getElementById("work-comment-submit");
      const note = document.getElementById("work-comment-error");
      submit.disabled = true;
      note.textContent = "";
      try {
        const author = (window.parlorCommentAuthorName
          ? await window.parlorCommentAuthorName(currentUser)
          : "") || (window.parlorDisplayName ? window.parlorDisplayName(currentUser) : "Member");
        const res = await fetch(commentsUrlLocal(), {
          method: "POST",
          headers: await window.parlorRestHeaders(),
          body: JSON.stringify({
            entry_id: openWork.id,
            user_id: currentUser.id,
            author: author,
            comment: text.slice(0, 280)
          })
        });
        if (!res.ok) throw new Error((await res.text()) || "The word would not hold.");
        input.value = "";
        await loadWorkComments(openWork.id);
      } catch (err) {
        note.textContent = err.message || "The word would not hold.";
      } finally {
        submit.disabled = false;
      }
    });
    document.getElementById("work-close").addEventListener("click", function () {
      workModal.hidden = true;
      openWork = null;
    });
    workModal.addEventListener("click", function (event) {
      if (event.target === workModal) {
        workModal.hidden = true;
        openWork = null;
      }
    });
    document.getElementById("work-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!isOwn || !openWork) return;
      const title = String(document.getElementById("work-title").value || "").trim();
      const body = String(document.getElementById("work-body").value || "").trim();
      if (!title || !body) return;
      const save = document.getElementById("work-save");
      save.disabled = true;
      try {
        await patchEntry(openWork.id, {
          title: title.slice(0, 160),
          body: body.slice(0, 12000),
          content: body.slice(0, 12000)
        });
        workModal.hidden = true;
        openWork = null;
        await showTab(active);
      } catch (err) {
        if (errorEl) errorEl.textContent = err.message || "The page would not hold.";
      } finally {
        save.disabled = false;
      }
    });
    document.getElementById("work-delete").addEventListener("click", async function () {
      if (!isOwn || !openWork) return;
      if (!window.confirm("Take this page out of the ledger?")) return;
      const res = await fetch(entriesUrl() + "?id=eq." + encodeURIComponent(openWork.id), {
        method: "DELETE",
        headers: await window.parlorRestHeaders()
      });
      if (!res.ok) {
        if (errorEl) errorEl.textContent = (await res.text()) || "The page would not come out.";
        return;
      }
      workModal.hidden = true;
      openWork = null;
      await showTab(active);
    });

    const profileModal = document.getElementById("profile-modal");
    const profileForm = document.getElementById("profile-form");
    const profileError = document.getElementById("profile-error");
    let profilePreviewUrls = [];

    function forgetProfilePreviews() {
      profilePreviewUrls.forEach(function (url) {
        try { URL.revokeObjectURL(url); } catch (err) { /* ignore */ }
      });
      profilePreviewUrls = [];
    }

    function paintAvatarPreview(url) {
      const face = document.getElementById("profile-avatar-preview");
      const safe = displayMediaUrl(url) || (/^blob:/i.test(String(url || "")) ? url : "");
      if (safe) {
        face.src = safe;
        face.classList.remove("is-empty");
      } else {
        face.removeAttribute("src");
        face.classList.add("is-empty");
      }
    }

    function paintBannerPreview(url) {
      paintBanner(document.getElementById("profile-banner-preview"), url);
      const el = document.getElementById("profile-banner-preview");
      if (!displayMediaUrl(url) && /^blob:/i.test(String(url || ""))) {
        el.style.backgroundImage =
          "linear-gradient(180deg, rgba(44,26,18,0.15), rgba(44,26,18,0.55)), url(\"" + url + "\")";
        el.classList.add("has-photo");
      }
    }

    function fillProfileForm() {
      forgetProfilePreviews();
      document.getElementById("profile-bio").value = profile.bio || "";
      document.getElementById("profile-avatar").value = profile.avatar_url || "";
      document.getElementById("profile-banner").value = profile.background_url || "";
      document.getElementById("profile-avatar-file").value = "";
      document.getElementById("profile-banner-file").value = "";
      if (profileError) profileError.textContent = "";
      paintAvatarPreview(profile.avatar_url);
      paintBannerPreview(profile.background_url);
    }

    function closeProfileModal() {
      profileModal.hidden = true;
      forgetProfilePreviews();
      document.getElementById("profile-avatar-file").value = "";
      document.getElementById("profile-banner-file").value = "";
    }

    editBtn.addEventListener("click", function () {
      fillProfileForm();
      profileModal.hidden = false;
      document.getElementById("profile-bio").focus();
    });
    document.getElementById("profile-cancel").addEventListener("click", closeProfileModal);
    profileModal.addEventListener("click", function (event) {
      if (event.target === profileModal) closeProfileModal();
    });
    document.getElementById("profile-avatar-file").addEventListener("change", function () {
      const file = this.files && this.files[0];
      if (!file) return;
      if (window.parlorValidateImageFile) {
        const problem = window.parlorValidateImageFile(file);
        if (problem) {
          if (profileError) profileError.textContent = problem;
          this.value = "";
          return;
        }
      }
      const blob = URL.createObjectURL(file);
      profilePreviewUrls.push(blob);
      paintAvatarPreview(blob);
      if (profileError) profileError.textContent = "";
    });
    document.getElementById("profile-banner-file").addEventListener("change", function () {
      const file = this.files && this.files[0];
      if (!file) return;
      if (window.parlorValidateImageFile) {
        const problem = window.parlorValidateImageFile(file);
        if (problem) {
          if (profileError) profileError.textContent = problem;
          this.value = "";
          return;
        }
      }
      const blob = URL.createObjectURL(file);
      profilePreviewUrls.push(blob);
      paintBannerPreview(blob);
      if (profileError) profileError.textContent = "";
    });
    document.getElementById("profile-avatar").addEventListener("input", function () {
      if (document.getElementById("profile-avatar-file").files.length) return;
      paintAvatarPreview(this.value);
    });
    document.getElementById("profile-banner").addEventListener("input", function () {
      if (document.getElementById("profile-banner-file").files.length) return;
      paintBannerPreview(this.value);
    });
    profileForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!isOwn) return;
      const bio = String(document.getElementById("profile-bio").value || "").trim().slice(0, 480);
      let avatarUrl = String(document.getElementById("profile-avatar").value || "").trim();
      let bannerUrl = String(document.getElementById("profile-banner").value || "").trim();
      const avatarFile = document.getElementById("profile-avatar-file").files[0];
      const bannerFile = document.getElementById("profile-banner-file").files[0];
      const submit = document.getElementById("profile-submit");
      submit.disabled = true;
      if (profileError) profileError.textContent = "";
      try {
        if (avatarFile) {
          if (window.parlorSaveAvatar) {
            avatarUrl = await window.parlorSaveAvatar(avatarFile);
          } else {
            avatarUrl = await window.parlorUploadMedia(avatarFile, "avatars");
          }
        }
        if (bannerFile) {
          bannerUrl = await window.parlorUploadMedia(bannerFile, "banners");
        }
        const payloads = [
          { bio: bio, avatar_url: avatarUrl, background_url: bannerUrl, username: profile.username || window.parlorDisplayName(currentUser) },
          { bio: bio, avatar_url: avatarUrl, username: profile.username || window.parlorDisplayName(currentUser) }
        ];
        let saved = null;
        let lastDetail = "";
        for (let i = 0; i < payloads.length; i += 1) {
          const res = await fetch(
            window.parlorProfilesUrl() + "?user_id=eq." + encodeURIComponent(currentUser.id),
            {
              method: "PATCH",
              headers: await window.parlorRestHeaders(),
              body: JSON.stringify(payloads[i])
            }
          );
          if (res.ok) {
            const rows = await res.json();
            saved = (Array.isArray(rows) && rows[0]) || payloads[i];
            break;
          }
          lastDetail = await res.text();
        }
        if (!saved) throw new Error(lastDetail || "The likeness would not take.");
        profile.bio = saved.bio != null ? saved.bio : bio;
        profile.avatar_url = saved.avatar_url != null ? saved.avatar_url : avatarUrl;
        profile.background_url = saved.background_url != null ? saved.background_url : bannerUrl;
        paintProfile(profile);
        await window.parlorMountChrome(currentUser, "ledger");
        closeProfileModal();
      } catch (err) {
        const message = err.message || "The likeness would not take.";
        if (profileError) profileError.textContent = message;
        if (errorEl) errorEl.textContent = message;
      } finally {
        submit.disabled = false;
      }
    });

    await showTab(active);
  });
})();
