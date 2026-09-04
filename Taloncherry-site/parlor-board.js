(function () {
  function mapNote(row, avatarMap, currentUser) {
    const userId = row.user_id || "";
    const category = typeof window.parlorDrawerFor === "function"
      ? window.parlorDrawerFor(row)
      : (typeof window.parlorNormalizeCategory === "function"
        ? window.parlorNormalizeCategory(row && row.category)
        : "general");
    return {
      id: row.id,
      userId: userId,
      author: row.author || "A member",
      note: row.note || "",
      created: row.created_at || "",
      imageUrl: window.parlorSafeMediaUrl ? window.parlorSafeMediaUrl(row.image_url) : "",
      category: category || "general",
      pinned: row.is_pinned === true,
      avatarUrl: window.parlorResolveAvatar ? window.parlorResolveAvatar(userId, row.author, avatarMap, currentUser) : "",
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

  function sortNotes(notes) {
    return (notes || []).slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aTime = Date.parse(a.created) || 0;
      const bTime = Date.parse(b.created) || 0;
      return bTime - aTime;
    });
  }

  window.parlorLoadNotes = async function (currentUser) {
    const avatarMap = await window.parlorLoadAvatarMap();
    let res = await fetch(window.parlorRestUrl() + "?select=*&order=is_pinned.desc,created_at.desc", {
      method: "GET",
      headers: await window.parlorRestHeaders()
    });
    if (!res.ok) {
      res = await fetch(window.parlorRestUrl() + "?select=*&order=created_at.desc", {
        method: "GET",
        headers: await window.parlorRestHeaders()
      });
    }
    if (!res.ok) throw new Error("The ledger could not be opened.");
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows : [];
    const notes = sortNotes(list.map(function (row) {
      try {
        return mapNote(row, avatarMap, currentUser);
      } catch (err) {
        console.warn(err);
        return {
          id: row && row.id,
          author: (row && row.author) || "A member",
          note: (row && row.note) || "",
          created: (row && row.created_at) || "",
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
