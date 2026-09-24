import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const SITE = "https://www.taloncherry.com";

const TITLE_FIXES = {
  "Sins of our Fathersu": "Sins of our Fathers",
  "Its Ganna Be Alright": "Its Ganna Be Alright",
};

function titleFromFilename(filename) {
  const base = filename.replace(/\.txt$/i, "");
  if (TITLE_FIXES[base]) return TITLE_FIXES[base];
  return base.replace(/_/g, "'");
}

function parseSimpleYaml(block) {
  const meta = {};
  String(block || "").split("\n").forEach((line) => {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) return;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[match[1]] = value;
  });
  return meta;
}

function splitFrontmatter(raw) {
  const text = String(raw || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const close = text.indexOf("\n---\n", 4);
  if (close === -1) return { meta: {}, body: text };
  return {
    meta: parseSimpleYaml(text.slice(4, close)),
    body: text.slice(close + 5),
  };
}

function cleanBody(raw) {
  let text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push(line);
      continue;
    }
    if (/^\/\/img1\.wsimg\.com\//i.test(trimmed)) continue;
    if (/^image\d+(image\d+)+$/i.test(trimmed.replace(/\s/g, ""))) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

function extractDate(text) {
  const head = text.split("\n").slice(0, 8).join("\n");
  const copy = head.match(
    /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i
  );
  if (copy) return copy[1];
  const yearOnly = head.match(/\b(19|20)\d{2}\b/);
  return yearOnly ? yearOnly[0] : "Archive";
}

function stripTitleAndMeta(text, title) {
  const lines = text.split("\n");
  let i = 0;
  const skip = (line) => {
    const t = line.trim();
    if (!t) return true;
    if (t.toLowerCase() === title.toLowerCase()) return true;
    if (/©|all rights reserved/i.test(t)) return true;
    if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i.test(t))
      return true;
    return false;
  };
  while (i < lines.length && skip(lines[i]) && i < 6) i++;
  return lines.slice(i).join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

function loadEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".txt"))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const split = splitFrontmatter(raw);
      const title = String(split.meta.title || titleFromFilename(file)).trim() || titleFromFilename(file);
      const cleaned = cleanBody(split.body);
      const date = split.meta.date || extractDate(cleaned);
      const text = stripTitleAndMeta(cleaned, title);
      return { title, date, text };
    });
}

const libraryData = {
  cultural: {
    title: "Cultural",
    subtitle: "Reflections on society and thoughts.",
    entries: loadEntries(path.join(root, "Writing", "Cultural")),
  },
  poetry: {
    title: "Poetry",
    subtitle: "Rhythmic verse and archives.",
    entries: loadEntries(path.join(root, "Writing", "Poetry Archive")),
  },
  lyrics: {
    title: "Lyrics",
    subtitle: "Songs and acoustic tracks.",
    entries: loadEntries(path.join(root, "Writing", "Lyrics")),
  },
  stories: {
    title: "Short Stories",
    subtitle: "Memoirs, farm lessons, and narratives.",
    entries: loadEntries(path.join(root, "Writing", "Short Stories")),
  },
};

const LIFE_PREFERRED = [
  ["The old life.txt", "old", "The Old Life", "From Oregon childhood through the years that made the man."],
  ["The New Life.txt", "new", "The New Life", "Texas soil, the farm, and the faith that followed."],
  ["Faith.txt", "faith", "Faith", "Prayer, the fall, the climb, and the Christian life."],
  ["Family and Friends.txt", "family", "Family and Friends", "Parents, siblings, and the friends who stayed."],
  ["Jayden.txt", "jayden", "Jayden", ""],
  ["Katelyn.txt", "katelyn", "Katelyn", ""],
  ["Britanny.txt", "britanny", "Britanny", ""],
  ["Truitt.txt", "truitt", "Truitt", ""],
];

function lifeKeyFor(filename) {
  const known = LIFE_PREFERRED.find(
    ([file]) => file.toLowerCase() === String(filename).toLowerCase()
  );
  if (known) return known[1];
  return String(filename)
    .replace(/\.txt$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "chapter";
}

function lifeFallback(filename) {
  const known = LIFE_PREFERRED.find(
    ([file]) => file.toLowerCase() === String(filename).toLowerCase()
  );
  if (known) return { title: known[2], subtitle: known[3] };
  return { title: titleFromFilename(filename), subtitle: "" };
}

const lifeDir = path.join(root, "My Life");
const lifeFiles = fs
  .readdirSync(lifeDir)
  .filter((f) => f.toLowerCase().endsWith(".txt"))
  .sort((a, b) => {
    const ia = LIFE_PREFERRED.findIndex(([file]) => file.toLowerCase() === a.toLowerCase());
    const ib = LIFE_PREFERRED.findIndex(([file]) => file.toLowerCase() === b.toLowerCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, "en", { sensitivity: "base" });
  });

const lifeData = {};
for (const file of lifeFiles) {
  const key = lifeKeyFor(file);
  const fallback = lifeFallback(file);
  const raw = fs.readFileSync(path.join(lifeDir, file), "utf8");
  const split = splitFrontmatter(raw);
  const resolvedTitle = String(split.meta.title || fallback.title).trim() || fallback.title;
  const cleaned = cleanBody(split.body);
  lifeData[key] = {
    title: resolvedTitle,
    subtitle: String(split.meta.subtitle || fallback.subtitle).trim() || fallback.subtitle,
    text: stripTitleAndMeta(cleaned, resolvedTitle),
    filename: file,
  };
}

function writeJs(filename, varName, data) {
  const out = `const ${varName} = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(path.join(root, filename), out, "utf8");
}

writeJs("library_data.js", "libraryData", libraryData);
writeJs("life_data.js", "lifeData", lifeData);

const LIBRARY_DIRS = {
  cultural: { dir: ["Writing", "Cultural"], type: "Article" },
  poetry: { dir: ["Writing", "Poetry Archive"], type: "Poem" },
  lyrics: { dir: ["Writing", "Lyrics"], type: "MusicComposition" },
  stories: { dir: ["Writing", "Short Stories"], type: "ShortStory" },
};

function siteUrl(segments) {
  return SITE + "/" + segments.map((part) => encodeURIComponent(part)).join("/");
}

function lastModified(relative) {
  try {
    const stamp = execFileSync("git", ["log", "-1", "--format=%cs", "--", relative], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return stamp;
  } catch {
    // not a checkout, or the file is untracked
  }
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) return null;
  return fs.statSync(full).mtime.toISOString().slice(0, 10);
}

function sourceFiles(segments) {
  const dir = path.join(root, ...segments);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".txt"))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map((file) => ({
      file,
      segments: segments.concat(file),
      relative: segments.concat(file).join("/"),
    }));
}

function titleOf(entry) {
  const raw = fs.readFileSync(path.join(root, entry.relative), "utf8");
  const split = splitFrontmatter(raw);
  return String(split.meta.title || titleFromFilename(entry.file)).trim() || titleFromFilename(entry.file);
}

function writeSitemap() {
  const pages = [
    ["", 1.0, "weekly"],
    ["music.html", 0.9, "weekly"],
    ["studio.html", 0.9, "weekly"],
    ["the-studio/", 0.8, "monthly"],
    ["writings.html", 0.9, "weekly"],
    ["life.html", 0.9, "weekly"],
    ["social.html", 0.7, "monthly"],
  ];
  const urls = pages.map(([page, priority, changefreq]) => ({
    loc: SITE + "/" + page,
    lastmod: lastModified(page === "" ? "index.html" : page.replace(/\/$/, "/index.html")),
    changefreq,
    priority: priority.toFixed(1),
  }));

  const body = urls
    .map((url) => {
      const lines = ["  <url>", "    <loc>" + url.loc + "</loc>"];
      if (url.lastmod) lines.push("    <lastmod>" + url.lastmod + "</lastmod>");
      lines.push("    <changefreq>" + url.changefreq + "</changefreq>");
      lines.push("    <priority>" + url.priority + "</priority>");
      lines.push("  </url>");
      return lines.join("\n");
    })
    .join("\n");

  fs.writeFileSync(
    path.join(root, "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      body +
      "\n</urlset>\n",
    "utf8"
  );
  return urls.length;
}

function injectJsonLd(page, id, payload) {
  const file = path.join(root, page);
  const html = fs.readFileSync(file, "utf8");
  const open = '<script id="' + id + '" type="application/ld+json">';
  const start = html.indexOf(open);
  if (start === -1) throw new Error("no " + id + " block in " + page);
  const end = html.indexOf("</script>", start);
  const block = open + JSON.stringify(payload) + "\n    ";
  fs.writeFileSync(file, html.slice(0, start) + block + html.slice(end), "utf8");
}

function writeWorksJsonLd() {
  const lists = Object.entries(LIBRARY_DIRS).map(([key, { dir, type }]) => {
    const entries = sourceFiles(dir);
    return {
      "@type": "ItemList",
      "@id": SITE + "/writings.html#" + key,
      name: libraryData[key].title + " by Talon Cherry",
      description: libraryData[key].subtitle,
      numberOfItems: entries.length,
      itemListOrder: "https://schema.org/ItemListUnordered",
      itemListElement: entries.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": type,
          name: titleOf(entry),
          url: siteUrl(entry.segments),
          author: { "@id": SITE + "/#person" },
        },
      })),
    };
  });
  injectJsonLd("writings.html", "site-works-jsonld", {
    "@context": "https://schema.org",
    "@graph": lists,
  });
  return lists.reduce((sum, list) => sum + list.numberOfItems, 0);
}

// life.html only offers the chapters named in its chapterOrder, so the markup
// must not advertise the loose .txt chapters that nothing on the page links to.
function pageChapterKeys() {
  const html = fs.readFileSync(path.join(root, "life.html"), "utf8");
  const match = html.match(/chapterOrder\s*=\s*\[([^\]]*)\]/);
  if (!match) throw new Error("no chapterOrder in life.html");
  return match[1]
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function writeChaptersJsonLd() {
  const keys = pageChapterKeys();
  const chapters = lifeFiles
    .filter((file) => keys.includes(lifeKeyFor(file)))
    .sort((a, b) => keys.indexOf(lifeKeyFor(a)) - keys.indexOf(lifeKeyFor(b)))
    .map((file, index) => {
      const key = lifeKeyFor(file);
      return {
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Chapter",
          name: lifeData[key].title,
          url: siteUrl(["My Life", file]),
          author: { "@id": SITE + "/#person" },
          about: { "@id": SITE + "/#person" },
        },
      };
    });
  injectJsonLd("life.html", "site-chapters-jsonld", {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        "@id": SITE + "/life.html#chapters",
        name: "Chapters from the life of Talon Cherry",
        numberOfItems: chapters.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: chapters,
      },
    ],
  });
  return chapters.length;
}

const counts = Object.fromEntries(
  Object.entries(libraryData).map(([k, v]) => [k, v.entries.length])
);
console.log("library", counts);
console.log("life chapters", Object.keys(lifeData));
console.log("sitemap urls", writeSitemap());
console.log("works in jsonld", writeWorksJsonLd());
console.log("chapters in jsonld", writeChaptersJsonLd());
