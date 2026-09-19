(function () {
  window.parlorMemberHref = function (username) {
    return "member.html?user=" + encodeURIComponent(String(username || "").trim() || "Member");
  };

  window.parlorSessionHandle = async function (user) {
    if (!user) return "Member";
    try {
      const res = await fetch(
        window.parlorProfilesUrl() +
          "?select=username,avatar_url&user_id=eq." + encodeURIComponent(user.id) + "&limit=1",
        { method: "GET", headers: await window.parlorRestHeaders() }
      );
      if (res.ok) {
        const rows = await res.json();
        const row = rows && rows[0];
        if (row && row.username) {
          return {
            username: String(row.username).trim(),
            avatar_url: row.avatar_url || ""
          };
        }
      }
    } catch (err) {
      console.warn(err);
    }
    return {
      username: window.parlorDisplayName ? window.parlorDisplayName(user) : "Member",
      avatar_url: window.parlorAvatarFromUser ? window.parlorAvatarFromUser(user) : ""
    };
  };

  window.parlorMountChrome = async function (user, active) {
    const session = await window.parlorSessionHandle(user);
    const handle = session.username || "Member";
    const ledger = document.getElementById("parlor-nav-ledger");
    if (ledger) ledger.href = window.parlorMemberHref(handle);
    const label = document.getElementById("member-label");
    if (label) {
      const steward = window.parlorIsAdmin && window.parlorIsAdmin(user) ? " · steward" : "";
      label.textContent = handle + steward;
    }
    const face = document.getElementById("member-avatar");
    if (face) {
      const url = window.parlorSafeMediaUrl
        ? window.parlorSafeMediaUrl(session.avatar_url) || window.parlorAvatarFromUser(user)
        : session.avatar_url;
      if (url) {
        face.src = url;
        face.alt = handle;
        face.classList.remove("is-empty");
      }
    }
    document.querySelectorAll("[data-parlor-nav]").forEach(function (link) {
      const on = link.getAttribute("data-parlor-nav") === active;
      link.classList.toggle("is-active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const nav = document.querySelector(".parlor-bar-links");
    if (nav && window.parlorIsAdmin && window.parlorIsAdmin(user)) {
      let sanctuary = document.getElementById("sanctuary-link");
      if (!sanctuary) {
        sanctuary = document.createElement("a");
        sanctuary.id = "sanctuary-link";
        sanctuary.className = "parlor-bar-link";
        sanctuary.textContent = "Admin Sanctuary";
        nav.append(sanctuary);
      }
      const onBoard = /forum\.html$/i.test(location.pathname) || /forum\.html$/i.test(location.href.split("?")[0]);
      sanctuary.href = onBoard ? "#sanctuary" : "forum.html#sanctuary";
    }
    return session;
  };
})();
