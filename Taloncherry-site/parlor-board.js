(function () {
  function parlorNoteTilt(id) {
    const text = String(id == null ? "" : id);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const deg = ((hash >>> 0) % 451) / 100 - 2.2;
    return deg.toFixed(2) + "deg";
  }

  window.parlorNoteTilt = parlorNoteTilt;

  window.parlorMemberHref = window.parlorMemberHref || function (username) {
    return "member.html?user=" + encodeURIComponent(String(username || "").trim());
  };

  window.parlorParseNoteMetadata = function (text) {
    const raw = String(text || "");
    const refs = [];
    const pattern = /\[Ref:\s*([^\]]+)\]/gi;
    let match;
    while ((match = pattern.exec(raw))) {
      const label = String(match[1] || "").trim();
      if (label) refs.push(label);
    }
    const display = raw.replace(/\s*\[Ref:\s*[^\]]+\]/gi, "").trim();
    return {
      raw: raw,
      display: display || raw,
      refs: refs
    };
  };

  function noteAuthor(row) {
    return (row && (row.author || row.username || row.name)) || "A member";
  }

  function noteBody(row) {
    return (row && (row.note || row.message || row.body)) || "";
  }

  function noteCreated(row) {
    return (row && (row.created_at || row.created || row.inserted_at)) || "";
  }

  function mapNote(row, avatarMap, currentUser) {
    const userId = (row && (row.user_id || row.userId)) || "";
    const category = typeof window.parlorDrawerFor === "function"
      ? window.parlorDrawerFor(row)
      : (typeof window.parlorNormalizeCategory === "function"
        ? window.parlorNormalizeCategory(row && row.category)
        : "general");
    return {
      id: row && row.id,
      userId: userId,
      author: noteAuthor(row),
      note: noteBody(row),
      created: noteCreated(row),
      imageUrl: window.parlorSafeMediaUrl ? window.parlorSafeMediaUrl(row && row.image_url) : "",
      category: category || "general",
      pinned: row && (row.is_pinned === true || row.is_pinned === "true" || row.is_pinned === 1),
      avatarUrl: window.parlorResolveAvatar ? window.parlorResolveAvatar(userId, noteAuthor(row), avatarMap, currentUser) : "",
      badge: window.parlorBadgeForProfile
        ? window.parlorBadgeForProfile((avatarMap && avatarMap[userId]) || { username: noteAuthor(row) })
        : "",
      likeCount: 0,
      liked: false
    };
  }

  function parlorCoerceNoteId(id) {
    if (id == null || id === "") return null;
    if (typeof id === "number" && Number.isFinite(id)) return id;
    const text = String(id);
    if (/^\d+$/.test(text)) return Number(text);
    return text;
  }

  function applyLikes(notes, likeRows, currentUser) {
    const counts = {};
    const mine = {};
    const selfId = currentUser && currentUser.id;
    (likeRows || []).forEach(function (row) {
      if (!row || row.note_id == null) return;
      const key = String(row.note_id);
      counts[key] = (counts[key] || 0) + 1;
      if (selfId && row.user_id === selfId) mine[key] = true;
    });
    notes.forEach(function (note) {
      const key = String(note.id);
      note.likeCount = counts[key] || 0;
      note.liked = Boolean(mine[key]);
    });
    return notes;
  }

  window.parlorLoadLikes = async function (noteIds) {
    const ids = (noteIds || []).map(parlorCoerceNoteId).filter(function (id) { return id != null && id !== ""; });
    if (!ids.length) return [];
    const encoded = ids.map(function (id) { return encodeURIComponent(String(id)); }).join(",");
    const res = await fetch(
      window.parlorLikesUrl() + "?select=note_id,user_id&note_id=in.(" + encoded + ")",
      { method: "GET", headers: await window.parlorRestHeaders() }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  };

  window.parlorLikeNote = async function (noteId, userId) {
    const body = {
      note_id: parlorCoerceNoteId(noteId),
      user_id: userId
    };
    const res = await fetch(window.parlorLikesUrl(), {
      method: "POST",
      headers: await window.parlorRestHeaders(),
      body: JSON.stringify(body)
    });
    if (res.ok || res.status === 409) return true;
    const detail = await res.text();
    throw new Error(detail || "The heart would not hold.");
  };

  window.parlorUnlikeNote = async function (noteId, userId) {
    const res = await fetch(
      window.parlorLikesUrl() +
        "?note_id=eq." + encodeURIComponent(String(parlorCoerceNoteId(noteId))) +
        "&user_id=eq." + encodeURIComponent(userId),
      { method: "DELETE", headers: await window.parlorRestHeaders() }
    );
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || "The heart would not lift.");
    }
    return true;
  };

  function parlorCommentsTable() {
    const cfg = window.PARLOR_CONFIG || {};
    return String(cfg.parlorCommentsTable || "parlor_comments").replace(/\s+/g, "_");
  }

  window.parlorCommentsUrl = function () {
    const cfg = window.PARLOR_CONFIG || {};
    return String(cfg.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/" + parlorCommentsTable();
  };

  function mapComment(row) {
    return {
      id: row && row.id,
      noteId: row && (row.note_id || row.noteId),
      userId: row && (row.user_id || row.userId) || "",
      author: (row && (row.author || row.username)) || "A member",
      comment: (row && (row.comment || row.body || row.note)) || "",
      created: (row && (row.created_at || row.created)) || ""
    };
  }

  window.parlorGroupCommentsByNote = function (rows) {
    const grouped = {};
    (rows || []).forEach(function (row) {
      const mapped = row && row.comment != null && row.noteId != null ? row : mapComment(row);
      if (!mapped || mapped.noteId == null || mapped.noteId === "") return;
      const key = String(mapped.noteId);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(mapped);
    });
    Object.keys(grouped).forEach(function (key) {
      grouped[key].sort(function (a, b) {
        return (Date.parse(a.created) || 0) - (Date.parse(b.created) || 0);
      });
    });
    return grouped;
  };

  window.parlorLoadComments = async function (noteIds) {
    const ids = (noteIds || []).map(parlorCoerceNoteId).filter(function (id) {
      return id != null && id !== "";
    });
    if (!ids.length) return [];
    const headers = await window.parlorRestHeaders();
    const chunks = [];
    for (let i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80));
    const collected = [];
    for (let c = 0; c < chunks.length; c += 1) {
      const encoded = chunks[c].map(function (id) { return encodeURIComponent(String(id)); }).join(",");
      const res = await fetch(
        window.parlorCommentsUrl() +
          "?select=id,note_id,user_id,author,comment,created_at&note_id=in.(" + encoded + ")&order=created_at.asc",
        { method: "GET", headers: headers }
      );
      if (!res.ok) {
        console.warn("parlor_comments read failed", res.status);
        return collected;
      }
      const rows = await res.json();
      if (Array.isArray(rows)) collected.push.apply(collected, rows.map(mapComment));
    }
    return collected;
  };

  window.parlorCommentAuthorName = async function (user) {
    if (!user || !user.id) return "Member";
    try {
      if (window.parlorProfilesUrl) {
        const res = await fetch(
          window.parlorProfilesUrl() + "?select=username&user_id=eq." + encodeURIComponent(user.id),
          { method: "GET", headers: await window.parlorRestHeaders() }
        );
        if (res.ok) {
          const rows = await res.json();
          const name = String((rows && rows[0] && (rows[0].username || rows[0].author)) || "").trim();
          if (name) return name;
        }
      }
    } catch (err) {
      console.warn(err);
    }
    const prefix = String(user.email || "").split("@")[0].trim();
    return prefix || "Member";
  };

  window.parlorPostComment = async function (noteId, commentText) {
    const text = String(commentText || "").trim();
    if (!text) throw new Error("Write a word before you pin the reply.");
    const client = window.parlorClient && window.parlorClient();
    if (!client) throw new Error("The parlor door is still shut.");
    const { data } = await client.auth.getSession();
    const user = data && data.session && data.session.user;
    if (!user || !user.id) throw new Error("Sign in to leave a reply.");
    const author = await window.parlorCommentAuthorName(user);
    const body = {
      note_id: parlorCoerceNoteId(noteId),
      user_id: user.id,
      author: author,
      comment: text.slice(0, 280)
    };
    const res = await fetch(window.parlorCommentsUrl(), {
      method: "POST",
      headers: await window.parlorRestHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || "The reply would not hold.");
    }
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    return mapComment(row || body);
  };

  function sortNotes(notes) {
    return (notes || []).slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aTime = Date.parse(a.created) || 0;
      const bTime = Date.parse(b.created) || 0;
      return bTime - aTime;
    });
  }

  async function readHeaders() {
    return window.parlorRestHeaders({
      Prefer: "count=exact"
    });
  }

  async function fetchParlorNoteRows() {
    const headers = await readHeaders();
    const base = window.parlorRestUrl();
    const attempts = [
      "?select=id,user_id,author,note,created_at,image_url,category,is_pinned&order=is_pinned.desc,created_at.desc",
      "?select=id,user_id,author,note,created_at,category,is_pinned&order=created_at.desc",
      "?select=id,user_id,author,note,created_at&order=created_at.desc",
      "?select=*&order=created_at.desc",
      "?select=*"
    ];
    let lastDetail = "";
    for (let i = 0; i < attempts.length; i += 1) {
      const res = await fetch(base + attempts[i], { method: "GET", headers: headers });
      if (res.ok) {
        const rows = await res.json();
        return Array.isArray(rows) ? rows : [];
      }
      lastDetail = (await res.text()) || ("HTTP " + res.status);
    }
    throw new Error(lastDetail || "The ledger could not be opened.");
  }

  window.parlorLoadNotes = async function (currentUser) {
    const notesPromise = fetchParlorNoteRows();
    const avatarsPromise = window.parlorLoadAvatarMap ? window.parlorLoadAvatarMap() : Promise.resolve({});
    let list = [];
    let avatarMap = {};
    try {
      list = await notesPromise;
    } catch (err) {
      throw err;
    }
    try {
      avatarMap = await avatarsPromise;
    } catch (err) {
      console.warn(err);
      avatarMap = {};
    }
    const notes = sortNotes(list.map(function (row) {
      try {
        return mapNote(row, avatarMap, currentUser);
      } catch (err) {
        console.warn(err);
        return {
          id: row && row.id,
          userId: row && (row.user_id || ""),
          author: noteAuthor(row),
          note: noteBody(row),
          created: noteCreated(row),
          imageUrl: "",
          category: "general",
          pinned: false,
          avatarUrl: "",
          likeCount: 0,
          liked: false
        };
      }
    }));
    let likeRows = [];
    try {
      likeRows = await window.parlorLoadLikes(notes.map(function (note) { return note.id; }));
    } catch (err) {
      console.warn(err);
    }
    applyLikes(notes, likeRows, currentUser);
    if (currentUser && window.parlorAvatarFromUser) {
      const selfUrl = window.parlorAvatarFromUser(currentUser);
      if (selfUrl) {
        const prior = avatarMap[currentUser.id] || {};
        avatarMap[currentUser.id] = {
          username: prior.username || (window.parlorDisplayName ? window.parlorDisplayName(currentUser) : ""),
          avatar_url: prior.avatar_url || selfUrl
        };
        notes.forEach(function (note) {
          if (note.userId === currentUser.id && !note.avatarUrl) note.avatarUrl = selfUrl;
        });
      }
    }
    return {
      notes: notes,
      avatars: avatarMap,
      source: "supabase"
    };
  };

  window.parlorPinNote = async function (payload) {
    const author = payload.author;
    const note = payload.note;
    const userId = payload.userId;
    const category = window.parlorNormalizeCategory(payload.category);
    const pinned = Boolean(payload.pinned);
    let imageUrl = "";
    if (payload.imageFile) {
      imageUrl = await window.parlorUploadMedia(payload.imageFile, "notes");
    }
    const body = {
      author: author,
      note: note,
      user_id: userId,
      category: category
    };
    if (imageUrl) body.image_url = imageUrl;
    if (payload.pinned) body.is_pinned = true;
    const res = await fetch(window.parlorRestUrl(), {
      method: "POST",
      headers: await window.parlorRestHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || "The note could not be pinned.");
    }
    const rows = await res.json();
    const row = rows[0] || rows;
    const mapped = mapNote(row, payload.avatarMap || {}, payload.currentUser);
    if (imageUrl) mapped.imageUrl = mapped.imageUrl || imageUrl;
    if (pinned) mapped.pinned = true;
    mapped.category = category;
    mapped.likeCount = 0;
    mapped.liked = false;
    return mapped;
  };

  window.parlorSetNotePinned = async function (recordId, pinned) {
    const res = await fetch(window.parlorRestUrl() + "?id=eq." + encodeURIComponent(recordId), {
      method: "PATCH",
      headers: await window.parlorRestHeaders(),
      body: JSON.stringify({ is_pinned: Boolean(pinned) })
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || "The tack would not hold.");
    }
    const rows = await res.json();
    return rows[0] || rows;
  };

  window.parlorDeleteNote = async function (recordId) {
    const res = await fetch(window.parlorRestUrl() + "?id=eq." + encodeURIComponent(recordId), {
      method: "DELETE",
      headers: await window.parlorRestHeaders()
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || "The note would not come down.");
    }
  };
})();
