(function () {
  const PATH = "cms/site.json";

  function get(data, path) {
    return String(path || "").split(".").reduce(function (obj, key) {
      if (obj == null) return undefined;
      return obj[key];
    }, data);
  }

  function mediaSrc(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw.replace(/^\//, "");
  }

  function playlistId(raw) {
    const text = String(raw || "").trim();
    const listed = text.match(/[?&]list=([A-Za-z0-9_-]+)/);
    if (listed) return listed[1];
    return text;
  }

  function embedUrl(station) {
    const id = playlistId(station && (station.playlist_id || station.embedUrl));
    if (!id) return "";
    return "https://www.youtube-nocookie.com/embed/videoseries?list=" + encodeURIComponent(id);
  }

  function markCurrent(anchor) {
    try {
      const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
      const href = String(anchor.getAttribute("href") || "").split("/").pop().toLowerCase();
      if (href && href === here) anchor.setAttribute("aria-current", "page");
      else anchor.removeAttribute("aria-current");
    } catch (err) { /* ignore */ }
  }

  function fillNav(nav, items, className) {
    if (!nav || !items || !items.length) return;
    const kicker = nav.querySelector(".crossroads-kicker");
    nav.replaceChildren();
    if (kicker) nav.appendChild(kicker);
    items.forEach(function (item) {
      if (!item || !item.href || !item.label) return;
      const a = document.createElement("a");
      a.href = item.href;
      a.textContent = item.label;
      if (className) a.className = className;
      markCurrent(a);
      nav.appendChild(a);
    });
  }

  function apply(data) {
    window.SITE_COPY = data;
    document.querySelectorAll("[data-site]").forEach(function (el) {
      const value = get(data, el.getAttribute("data-site"));
      if (value == null || value === "") return;
      el.textContent = String(value);
    });
    document.querySelectorAll("[data-site-href]").forEach(function (el) {
      const value = get(data, el.getAttribute("data-site-href"));
      if (!value) return;
      el.setAttribute("href", String(value));
    });
    document.querySelectorAll("[data-site-src]").forEach(function (el) {
      const value = mediaSrc(get(data, el.getAttribute("data-site-src")));
      if (!value) return;
      el.setAttribute("src", value);
    });
    const ident = data.identity || {};
    document.querySelectorAll(".js-copyright").forEach(function (el) {
      if (ident.copyright) el.textContent = ident.copyright;
    });
    document.querySelectorAll(".js-host-note").forEach(function (el) {
      if (ident.host_note) el.textContent = ident.host_note;
    });
    document.querySelectorAll(".cookie-aside").forEach(function (el) {
      if (ident.cookie_note) el.textContent = ident.cookie_note;
    });
    document.querySelectorAll(".js-venmo, a.author-tip-jar").forEach(function (el) {
      if (ident.venmo_url) el.setAttribute("href", ident.venmo_url);
    });
    document.querySelectorAll(".js-venmo-label").forEach(function (el) {
      if (ident.venmo_label) el.textContent = ident.venmo_label;
    });
    const tip = data.tip_jar || {};
    document.querySelectorAll(".tip-jar-kicker").forEach(function (el) {
      if (tip.kicker) el.textContent = tip.kicker;
    });
    document.querySelectorAll(".tip-jar-line").forEach(function (el) {
      if (tip.line) el.textContent = tip.line;
    });
    document.querySelectorAll(".tip-jar-brass").forEach(function (el) {
      if (tip.brass) el.textContent = tip.brass;
    });
    fillNav(document.querySelector("nav.home-nav[data-site-nav='nav']"), data.nav);
    fillNav(document.querySelector("nav.home-nav[data-site-nav='social']"), (data.social && data.social.links || []).map(function (link) {
      return { label: link.label, href: link.url };
    }));
    document.querySelectorAll("nav.home-nav[data-site-nav='social'] a").forEach(function (a) {
      a.target = "_blank";
      a.rel = "me noopener noreferrer";
    });
    document.querySelectorAll("nav.crossroads").forEach(function (nav) {
      fillNav(nav, data.footer_nav);
    });
    const meta = document.querySelector('meta[name="description"]');
    if (meta && ident.description) meta.setAttribute("content", ident.description);
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld && ident.name) {
      try {
        const schema = JSON.parse(ld.textContent);
        if (ident.person_name) schema.name = ident.person_name;
        if (ident.name) schema.alternateName = [ident.name];
        if (ident.description) schema.description = ident.description;
        if (ident.portrait) {
          schema.image = "https://www.taloncherry.com/" + mediaSrc(ident.portrait);
        }
        if (data.social && data.social.links) {
          schema.sameAs = data.social.links.map(function (link) { return link.url; }).filter(Boolean);
        }
        ld.textContent = JSON.stringify(schema, null, 2);
      } catch (err) { /* leave bundled schema */ }
    }
    window.SITE_STATIONS = (data.music && data.music.stations || []).map(function (station) {
      return {
        freq: station.freq,
        title: station.title,
        embedUrl: embedUrl(station),
        date: station.date,
        notes: station.notes
      };
    }).filter(function (station) { return station.embedUrl; });
    document.dispatchEvent(new CustomEvent("sitecopy", { detail: data }));
  }

  window.siteContentReady = fetch(PATH)
    .then(function (res) {
      if (!res.ok) throw new Error("site copy missing");
      return res.json();
    })
    .then(function (data) {
      apply(data);
      return data;
    })
    .catch(function (err) {
      console.warn(err);
      window.SITE_COPY = window.SITE_COPY || {};
      window.SITE_STATIONS = window.SITE_STATIONS || [];
      return null;
    });
})();
