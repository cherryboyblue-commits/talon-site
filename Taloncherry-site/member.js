(function () {
  const CATS = [
    { id: "memories", label: "Memories" },
    { id: "dreams", label: "Dreams" },
    { id: "poetry", label: "Poetry & Lyrics" },
    { id: "stories", label: "Short Stories" }
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

  function likesUrl() {
    const cfg = window.PARLOR_CONFIG || {};
    return String(cfg.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/member_work_likes";
  }

  const HEART_MARK =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.2-4.35-9.3-8.22C1.2 8.9 2.4 5.6 5.5 4.7c1.85-.54 3.7.18 4.7 1.7 1-1.52 2.85-2.24 4.7-1.7 3.1.9 4.3 4.2 2.8 7.08C19.2 15.65 12 20 12 20z"/></svg><span class="pin-like-count">0</span>';

  function likesMissingMessage(detail) {
    return /PGRST205|does not exist|schema cache|member_work_likes/i.test(String(detail || ""))
      ? "Run member_work_likes.sql in the Supabase SQL editor, then refresh."
      : "";
  }

  function paintHeartButton(button, liked, count) {
    if (!button) return;
    const safeCount = Math.max(0, Number(count) || 0);
    button.dataset.liked = liked ? "1" : "0";
    button.dataset.count = String(safeCount);
    button.classList.toggle("is-liked", liked);
    button.setAttribute("aria-pressed", liked ? "true" : "false");
    button.setAttribute(
      "aria-label",
      liked ? "Unlike this work, " + safeCount + " likes" : "Like this work, " + safeCount + " likes"
    );
    const tally = button.querySelector(".pin-like-count");
    if (tally) tally.textContent = String(safeCount);
  }

  function createHeartButton(row) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pin-like";
    if (row && row.id != null) button.dataset.entryId = String(row.id);
    button.innerHTML = HEART_MARK;
    paintHeartButton(button, Boolean(row && row.liked), Number(row && row.likeCount) || 0);
    return button;
  }

  function paintHeartsFor(entryId, liked, count) {
    document.querySelectorAll(".pin-like[data-entry-id]").forEach(function (button) {
      if (String(button.dataset.entryId) === String(entryId)) {
        paintHeartButton(button, liked, count);
      }
    });
  }

  function applyWorkLikes(rows, likeRows, userId) {
    const counts = {};
    const mine = {};
    const selfId = String(userId || "");
    (likeRows || []).forEach(function (row) {
      if (!row || row.entry_id == null) return;
      const key = String(row.entry_id);
      counts[key] = (counts[key] || 0) + 1;
      if (selfId && String(row.user_id) === selfId) mine[key] = true;
    });
    (rows || []).forEach(function (row) {
      const key = String(row.id);
      row.likeCount = counts[key] || 0;
      row.liked = Boolean(mine[key]);
    });
    return rows;
  }

  async function loadWorkLikes(entryIds) {
    const ids = (entryIds || []).filter(Boolean);
    if (!ids.length) return [];
    const encoded = ids.map(function (id) { return encodeURIComponent(String(id)); }).join(",");
    const res = await fetch(
      likesUrl() + "?select=entry_id,user_id&entry_id=in.(" + encoded + ")",
      { method: "GET", headers: await window.parlorRestHeaders() }
    );
    if (!res.ok) {
      const detail = await res.text();
      if (likesMissingMessage(detail)) console.warn(likesMissingMessage(detail));
      return [];
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  async function likeWork(entryId, userId) {
    const res = await fetch(likesUrl(), {
      method: "POST",
      headers: await window.parlorRestHeaders(),
      body: JSON.stringify({ entry_id: entryId, user_id: userId })
    });
    if (res.ok || res.status === 409) return true;
    const detail = await res.text();
    throw new Error(likesMissingMessage(detail) || detail || "The heart would not hold.");
  }

  async function unlikeWork(entryId, userId) {
    const res = await fetch(
      likesUrl() +
        "?entry_id=eq." + encodeURIComponent(String(entryId)) +
        "&user_id=eq." + encodeURIComponent(userId),
      { method: "DELETE", headers: await window.parlorRestHeaders() }
    );
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(likesMissingMessage(detail) || detail || "The heart would not lift.");
    }
    return true;
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
    if (value === "story" || value === "short_stories" || value === "short-stories" || value === "shortstories") return "stories";
    return CATS.some(function (item) { return item.id === value; }) ? value : "memories";
  }

  function categoryAliases(raw) {
    const id = normalizeCategory(raw);
    if (id === "memories") return ["memories", "memory"];
    if (id === "dreams") return ["dreams", "dream"];
    if (id === "poetry") return ["poetry", "lyrics", "poetry_lyrics", "poetry-lyrics"];
    if (id === "stories") return ["stories", "story", "short_stories", "short-stories"];
    return [id];
  }

  async function fetchProfile(lookup, currentUser) {
    const headers = await window.parlorRestHeaders();
    const base = window.parlorProfilesUrl();
    const selects = [
      "user_id,username,avatar_url,bio,background_url,badge",
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
            sort_order: Number(row.sort_order),
            likeCount: 0,
            liked: false
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
    const badgeEl = document.getElementById("ledger-badge");
    if (badgeEl) {
      const mark = window.parlorBadgeForProfile ? window.parlorBadgeForProfile(profile) : "";
      if (mark) {
        badgeEl.hidden = false;
        badgeEl.textContent = mark;
      } else {
        badgeEl.hidden = true;
        badgeEl.textContent = "";
      }
    }
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
    let workPages = [];
    let workCursor = 0;
    let workFlipping = false;
    const workPhoneQuery = window.matchMedia("(max-width: 768px)");
    const workCard = document.querySelector(".ledger-work-card");

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

    function catLabel(id) {
      const found = CATS.find(function (item) { return item.id === id; });
      return found ? found.label : "The ledger";
    }

    function isPhoneReader() {
      return workPhoneQuery.matches;
    }

    function pageStep() {
      return isPhoneReader() ? 1 : 2;
    }

    function formatProseHtml(text, withDropCap) {
      const paras = String(text || "")
        .replace(/\r\n/g, "\n")
        .split(/\n\s*\n/)
        .map(function (p) { return p.replace(/\s+/g, " ").trim(); })
        .filter(Boolean);
      if (!paras.length) return "";
      return paras.map(function (p, i) {
        const lead = withDropCap && i === 0 && /[A-Za-z]/.test(p.charAt(0));
        return '<p class="print-p' + (lead ? " is-lead" : "") + '">' + linkify(p) + "</p>";
      }).join("");
    }

    function formatVerseHtml(text) {
      return '<div class="print-verse">' + linkify(String(text || "").trim()) + "</div>";
    }

    function pageInnerHtml(page) {
      if (!page || page.type === "blank") return "";
      if (page.type === "title") {
        return '<div class="title-plate"><p class="page-kicker">' + escapeHtml(page.kicker) +
          "</p><h2>" + escapeHtml(page.title) + '</h2><div class="title-rule"></div><p>' +
          escapeHtml(page.text) + "</p></div>";
      }
      const verse = page.layout === "verse";
      const body = verse
        ? formatVerseHtml(page.text)
        : '<div class="print-prose">' + formatProseHtml(page.text, !page.continued) + "</div>";
      return '<p class="page-kicker">' + escapeHtml(page.kicker) + '</p><h3 class="page-title">' +
        escapeHtml(page.title) + "</h3>" + body;
    }

    function prepareMeasure() {
      const sample = document.getElementById("work-page-left");
      if (!sample) return false;
      const rect = sample.getBoundingClientRect();
      const width = Math.round(rect.width || sample.clientWidth || 460);
      const height = Math.round(rect.height || sample.clientHeight || 520);
      const innerH = Math.max(220, height - 40);
      let el = document.getElementById("work-page-measure");
      if (!el) {
        el = document.createElement("div");
        el.id = "work-page-measure";
        el.setAttribute("aria-hidden", "true");
        document.body.appendChild(el);
      }
      el.style.width = width + "px";
      el.style.height = innerH + "px";
      return innerH > 160 && width > 180;
    }

    function pageContentFits(page) {
      const el = document.getElementById("work-page-measure");
      const text = page && page.text ? String(page.text) : "";
      const lines = text.split("\n").length;
      if (!el || el.clientHeight < 120) {
        if (page && page.layout === "verse") return lines <= 15;
        return text.length <= 860;
      }
      el.innerHTML = pageInnerHtml(page);
      return el.scrollHeight <= el.clientHeight;
    }

    function textUnits(text, layout) {
      const raw = String(text || "").replace(/\r\n/g, "\n").replace(/^\s+|\s+$/g, "");
      if (layout === "verse") return raw.split("\n");
      const paras = raw.split(/\n\s*\n/).map(function (p) {
        return p.replace(/[ \t]+/g, " ").trim();
      }).filter(Boolean);
      return paras.length ? paras : (raw ? [raw] : []);
    }

    function joinUnits(units, layout) {
      return layout === "verse" ? units.join("\n") : units.join("\n\n");
    }

    function splitLongUnit(unit, layout, make) {
      const words = String(unit).split(/\s+/).filter(Boolean);
      if (words.length < 8) return [unit];
      const parts = [];
      let start = 0;
      while (start < words.length) {
        let lo = 1;
        let hi = words.length - start;
        let best = 1;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const trial = words.slice(start, start + mid).join(" ");
          if (pageContentFits(make(trial))) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (best < 12 && words.length - start > 12) {
          best = Math.min(120, words.length - start);
        }
        parts.push(words.slice(start, start + best).join(" "));
        start += best;
      }
      return parts;
    }

    function paginateText(text, layout, meta) {
      const units = textUnits(text, layout);
      const out = [];
      const make = function (chunk, cont) {
        return {
          type: "body",
          layout: layout,
          kicker: meta.kicker,
          title: cont ? meta.baseTitle + " (cont.)" : meta.baseTitle,
          text: chunk,
          continued: cont
        };
      };
      if (!units.length) {
        out.push(make("", false));
        return out;
      }
      let i = 0;
      let continued = false;
      while (i < units.length) {
        let lo = 1;
        let hi = units.length - i;
        let best = 1;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const trial = joinUnits(units.slice(i, i + mid), layout);
          if (pageContentFits(make(trial, continued))) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (best === 1 && !pageContentFits(make(units[i], continued))) {
          if (layout === "verse" && units.length - i > 1) {
            best = Math.min(15, units.length - i);
            out.push(make(joinUnits(units.slice(i, i + best), layout), continued));
            i += best;
            continued = true;
            continue;
          }
          if (String(units[i]).length > 220) {
            splitLongUnit(units[i], layout, function (chunk) {
              return make(chunk, continued);
            }).forEach(function (piece, n) {
              out.push(make(piece, continued || n > 0));
            });
            i += 1;
            continued = true;
            continue;
          }
        }
        out.push(make(joinUnits(units.slice(i, i + best), layout), continued));
        i += best;
        continued = true;
      }
      return out;
    }

    function chunkText(text, limit) {
      const cleaned = (text || "").replace(/\n{3,}/g, "\n\n").trim();
      if (cleaned.length <= limit) return [cleaned];
      const parts = [];
      const paras = cleaned.split(/\n\n/);
      let buf = "";
      const pushBuf = function () {
        if (buf.trim()) parts.push(buf.trim());
        buf = "";
      };
      for (let p = 0; p < paras.length; p += 1) {
        const para = paras[p];
        if (para.length > limit) {
          pushBuf();
          const words = para.split(/\s+/);
          let line = "";
          for (let w = 0; w < words.length; w += 1) {
            if ((line + " " + words[w]).trim().length > limit && line) {
              parts.push(line.trim());
              line = words[w];
            } else {
              line = (line + " " + words[w]).trim();
            }
          }
          if (line) buf = line;
        } else if ((buf + "\n\n" + para).trim().length > limit && buf) {
          pushBuf();
          buf = para;
        } else {
          buf = buf ? buf + "\n\n" + para : para;
        }
      }
      pushBuf();
      return parts.length ? parts : [cleaned];
    }

    function buildWorkPages(row) {
      const writing = row.body || row.content || "";
      const layout = active === "poetry" ? "verse" : "prose";
      const author = document.getElementById("ledger-name").textContent || "Member";
      const dated = formatDate(row.created_at);
      const kicker = catLabel(active);
      const title = row.title || "Untitled";
      const built = [{
        type: "title",
        kicker: kicker,
        title: title,
        text: author + (dated ? "\n\n" + dated : "")
      }];
      const canMeasure = prepareMeasure();
      const meta = { kicker: kicker, baseTitle: title };
      const pieces = canMeasure
        ? paginateText(writing, layout, meta)
        : chunkText(writing, layout === "verse" ? 720 : 980).map(function (chunk, n) {
          return {
            type: "body",
            layout: layout,
            kicker: kicker,
            title: n === 0 ? title : title + " (cont.)",
            text: chunk,
            continued: n > 0
          };
        });
      built.push.apply(built, pieces);
      if (!isPhoneReader() && built.length % 2 === 1) {
        built.push({ type: "blank" });
      }
      return built;
    }

    function renderWorkPage(el, page, pageNumber) {
      if (!el) return;
      if (!page || page.type === "blank") {
        el.innerHTML = '<div class="page-inner"></div><div class="page-num">' + (pageNumber || "") + "</div>";
        return;
      }
      el.innerHTML = '<div class="page-inner">' + pageInnerHtml(page) + '</div><div class="page-num">' + pageNumber + "</div>";
    }

    function viewIndex() {
      if (isPhoneReader()) return workCursor;
      return workCursor - (workCursor % 2);
    }

    function renderWorkSpread() {
      const leftN = viewIndex();
      workCursor = leftN;
      const rightN = leftN + 1;
      renderWorkPage(document.getElementById("work-page-left"), workPages[leftN], leftN + 1);
      const rightEl = document.getElementById("work-page-right");
      const indicator = document.getElementById("work-page-indicator");
      if (isPhoneReader()) {
        rightEl.innerHTML = "";
        indicator.textContent = (leftN + 1) + " / " + workPages.length;
      } else {
        renderWorkPage(rightEl, workPages[rightN], rightN + 1);
        const last = Math.min(rightN + 1, workPages.length);
        indicator.textContent = (leftN + 1) + "–" + last + " / " + workPages.length;
      }
      document.getElementById("work-prev-page").disabled = leftN <= 0;
      document.getElementById("work-next-page").disabled = leftN + pageStep() >= workPages.length;
    }

    function runWorkFlip(direction) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const folio = document.getElementById("work-folio");
      const sheet = document.createElement("div");
      sheet.className = "flip-sheet " + (direction === "next" ? "next" : "prev");
      sheet.innerHTML = '<div class="flip-face"></div>';
      folio.appendChild(sheet);
      setTimeout(function () { sheet.remove(); }, isPhoneReader() ? 280 : 620);
    }

    function goWorkSpread(nextCursor, direction) {
      if (workFlipping) return;
      let next = nextCursor;
      if (!isPhoneReader()) next = next - (next % 2);
      if (next < 0 || next >= workPages.length || next === viewIndex()) return;
      workFlipping = true;
      runWorkFlip(direction);
      setTimeout(function () {
        workCursor = next;
        renderWorkSpread();
        workFlipping = false;
      }, isPhoneReader() ? 140 : 280);
    }

    function turnWork(direction) {
      const step = pageStep();
      const next = viewIndex() + (direction === "next" ? step : -step);
      goWorkSpread(next, direction);
    }

    async function paintWorkBook(row) {
      workCursor = 0;
      workPages = [];
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (err) {}
      }
      await new Promise(function (resolve) {
        requestAnimationFrame(function () { requestAnimationFrame(resolve); });
      });
      workPages = buildWorkPages(row);
      renderWorkSpread();
    }

    function closeWorkModal() {
      document.getElementById("work-modal").hidden = true;
      if (workCard) workCard.classList.remove("is-reading");
      document.getElementById("work-reader").hidden = true;
      openWork = null;
      workPages = [];
      workCursor = 0;
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
      const reader = document.getElementById("work-reader");
      title.value = row.title || "";
      body.value = writing;
      title.required = canEdit;
      body.required = canEdit;
      title.readOnly = !canEdit;
      body.readOnly = !canEdit;
      titleEdit.hidden = !canEdit;
      bodyEdit.hidden = !canEdit;
      reader.hidden = canEdit;
      if (workCard) workCard.classList.toggle("is-reading", !canEdit);
      document.getElementById("work-save").hidden = !canEdit;
      document.getElementById("work-delete").hidden = !canEdit;
      document.getElementById("work-date").textContent = formatDate(row.created_at);
      const modalHeart = document.getElementById("work-like");
      modalHeart.dataset.entryId = String(row.id);
      paintHeartButton(modalHeart, Boolean(row.liked), Number(row.likeCount) || 0);
      const likeNote = document.getElementById("work-like-error");
      if (likeNote) likeNote.textContent = "";
      document.getElementById("work-comment-input").value = "";
      document.getElementById("work-modal").hidden = false;
      loadWorkComments(row.id);
      if (canEdit) title.focus();
      else paintWorkBook(row);
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
        item.append(main, createHeartButton(row));
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
        await applyWorkLikes(tabRows, await loadWorkLikes(tabRows.map(function (row) { return row.id; })), currentUser && currentUser.id);
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

    async function toggleWorkHeart(button) {
      const entryId = button && button.dataset.entryId;
      if (!entryId || !currentUser || !currentUser.id) return;
      if (button.dataset.busy === "1") return;
      const liked = button.dataset.liked === "1";
      const count = Number(button.dataset.count || 0) || 0;
      const nextLiked = !liked;
      const nextCount = Math.max(0, count + (nextLiked ? 1 : -1));
      const note = document.getElementById("work-like-error");
      if (note) note.textContent = "";
      if (errorEl && document.getElementById("work-modal").hidden) errorEl.textContent = "";
      button.dataset.busy = "1";
      paintHeartsFor(entryId, nextLiked, nextCount);
      if (nextLiked) {
        button.classList.remove("is-pop");
        void button.offsetWidth;
        button.classList.add("is-pop");
      }
      try {
        if (nextLiked) await likeWork(entryId, currentUser.id);
        else await unlikeWork(entryId, currentUser.id);
        const row = tabRows.find(function (item) { return String(item.id) === String(entryId); });
        if (row) {
          row.liked = nextLiked;
          row.likeCount = nextCount;
        }
        if (openWork && String(openWork.id) === String(entryId)) {
          openWork.liked = nextLiked;
          openWork.likeCount = nextCount;
        }
      } catch (err) {
        paintHeartsFor(entryId, liked, count);
        const msg = err.message || "The heart would not hold.";
        if (note) note.textContent = msg;
        if (errorEl && document.getElementById("work-modal").hidden) errorEl.textContent = msg;
      } finally {
        button.dataset.busy = "0";
      }
    }

    listEl.addEventListener("click", async function (event) {
      const heart = event.target.closest(".pin-like");
      if (heart) {
        event.preventDefault();
        event.stopPropagation();
        await toggleWorkHeart(heart);
        return;
      }
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
      if (event.target.closest(".pin-like")) {
        event.preventDefault();
        return;
      }
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
    document.getElementById("work-close").addEventListener("click", closeWorkModal);
    document.getElementById("work-like").addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopPropagation();
      await toggleWorkHeart(event.currentTarget);
    });
    workModal.addEventListener("click", function (event) {
      if (event.target === workModal) closeWorkModal();
    });
    document.getElementById("work-prev-page").addEventListener("click", function () { turnWork("prev"); });
    document.getElementById("work-next-page").addEventListener("click", function () { turnWork("next"); });
    document.getElementById("work-page-left").addEventListener("click", function () {
      if (isPhoneReader()) return;
      turnWork("prev");
    });
    document.getElementById("work-page-right").addEventListener("click", function () {
      if (isPhoneReader()) return;
      turnWork("next");
    });
    (function bindWorkSwipe() {
      const folio = document.getElementById("work-folio");
      let startX = 0;
      let startY = 0;
      folio.addEventListener("touchstart", function (e) {
        if (!e.changedTouches[0]) return;
        startX = e.changedTouches[0].clientX;
        startY = e.changedTouches[0].clientY;
      }, { passive: true });
      folio.addEventListener("touchend", function (e) {
        if (!workCard || !workCard.classList.contains("is-reading")) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) turnWork("next");
        else turnWork("prev");
      }, { passive: true });
    })();
    window.addEventListener("keydown", function (e) {
      if (document.getElementById("work-modal").hidden) return;
      if (!workCard || !workCard.classList.contains("is-reading")) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowRight") { e.preventDefault(); turnWork("next"); }
      if (e.key === "ArrowLeft") { e.preventDefault(); turnWork("prev"); }
      if (e.key === "Escape") { e.preventDefault(); closeWorkModal(); }
    });
    let workReflowTimer = null;
    workPhoneQuery.addEventListener("change", function () {
      if (!openWork || !workCard || !workCard.classList.contains("is-reading")) return;
      clearTimeout(workReflowTimer);
      workReflowTimer = setTimeout(function () { paintWorkBook(openWork); }, 180);
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
        closeWorkModal();
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
      closeWorkModal();
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
