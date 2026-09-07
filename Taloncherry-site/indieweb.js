(function () {
  const GITHUB = "https://github.com/cherryboyblue-commits";
  const WEBMENTION = "https://webmention.io/taloncherry.com/webmention";
  const PINGBACK = "https://webmention.io/taloncherry.com/xmlrpc";

  function hasLink(rel, href) {
    return Array.prototype.some.call(document.querySelectorAll("link[rel]"), function (el) {
      const rels = String(el.getAttribute("rel") || "").toLowerCase().split(/\s+/);
      return rels.indexOf(rel) !== -1 && el.getAttribute("href") === href;
    });
  }

  function ensureLink(rel, href) {
    if (hasLink(rel, href)) return;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
  }

  ensureLink("me", GITHUB);
  ensureLink("webmention", WEBMENTION);
  ensureLink("pingback", PINGBACK);

  const box = document.getElementById("webmentions");
  if (!box) return;

  function apexUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "www.taloncherry.com") parsed.hostname = "taloncherry.com";
      return parsed.href;
    } catch (err) {
      return String(url || "").replace("://www.taloncherry.com", "://taloncherry.com");
    }
  }

  const canonical = document.querySelector('link[rel="canonical"]');
  const target = apexUrl((canonical && canonical.href) || (location.origin + location.pathname));
  const endpoint =
    "https://webmention.io/api/mentions.jf2?per-page=20&target=" + encodeURIComponent(target);

  function labelFor(item) {
    const author = (item.author && item.author.name) || "Someone";
    const kind = item["wm-property"];
    if (kind === "like-of") return author + " liked this";
    if (kind === "repost-of") return author + " shared this";
    if (kind === "bookmark-of") return author + " bookmarked this";
    if (kind === "mention-of") return author + " mentioned this";
    return author + " replied";
  }

  fetch(endpoint)
    .then(function (res) {
      if (!res.ok) throw new Error("webmention fetch failed");
      return res.json();
    })
    .then(function (data) {
      const items = (data && data.children) || [];
      if (!items.length) return;
      const kicker = document.createElement("p");
      kicker.className = "webmentions-kicker";
      kicker.textContent = "Mentions from the web";
      const list = document.createElement("ul");
      items.forEach(function (item) {
        const li = document.createElement("li");
        const url = item.url || item["wm-source"];
        if (url) {
          const a = document.createElement("a");
          a.href = url;
          a.rel = "noopener noreferrer ugc";
          a.textContent = labelFor(item);
          li.appendChild(a);
        } else {
          li.textContent = labelFor(item);
        }
        list.appendChild(li);
      });
      box.replaceChildren(kicker, list);
      box.hidden = false;
    })
    .catch(function () {
      /* leave hidden */
    });
})();
