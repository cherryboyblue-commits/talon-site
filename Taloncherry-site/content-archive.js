(function (root) {
    const REPO = "cherryboyblue-commits/talon-site";
    const REPO_ROOT = "Taloncherry-site";
    const TITLE_FIXES = {
        "Sins of our Fathersu": "Sins of our Fathers"
    };

    const CHAPTER_FILES = [
        { file: "The old life.txt", key: "old", title: "The Old Life", subtitle: "Oregon childhood, Colorado, fatherhood, and the years that made the man." },
        { file: "The New Life.txt", key: "new", title: "The New Life", subtitle: "How we became Texans, farm lessons, and the turn toward Christ." },
        { file: "Faith.txt", key: "faith", title: "Faith", subtitle: "The fall, the climb, and baptism at Hamby Church of Christ." },
        { file: "Family and Friends.txt", key: "family", title: "Family and Friends", subtitle: "Kent and Judi, Logan and Brandy, Tim, Sean, Jason, and the rest." },
        { file: "Jayden.txt", key: "jayden" },
        { file: "Katelyn.txt", key: "katelyn" },
        { file: "Britanny.txt", key: "britanny" },
        { file: "Truitt.txt", key: "truitt" }
    ];

    const WRITING_FOLDERS = {
        cultural: "Writing/Cultural",
        poetry: "Writing/Poetry Archive",
        lyrics: "Writing/Lyrics",
        stories: "Writing/Short Stories"
    };

    const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

    function titleFromFilename(filename) {
        const base = String(filename || "").replace(/\.txt$/i, "");
        if (TITLE_FIXES[base]) return TITLE_FIXES[base];
        return base.replace(/_/g, "'");
    }

    function slugFromFilename(filename) {
        const known = CHAPTER_FILES.find(function (row) {
            return row.file.toLowerCase() === String(filename).toLowerCase();
        });
        if (known) return known.key;
        return String(filename || "")
            .replace(/\.txt$/i, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "entry";
    }

    function parseSimpleYaml(block) {
        const meta = {};
        String(block || "").split("\n").forEach(function (line) {
            const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
            if (!match) return;
            let value = match[2].trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
        if (close === -1) {
            const eof = text.indexOf("\n---");
            if (eof === -1) return { meta: {}, body: text };
            return {
                meta: parseSimpleYaml(text.slice(4, eof)),
                body: text.slice(eof + 4).replace(/^\n/, "")
            };
        }
        return {
            meta: parseSimpleYaml(text.slice(4, close)),
            body: text.slice(close + 5)
        };
    }

    function cleanBody(raw) {
        const kept = [];
        String(raw || "").split("\n").forEach(function (line) {
            const trimmed = line.trim();
            if (!trimmed) {
                kept.push(line);
                return;
            }
            if (/^\/\/img1\.wsimg\.com\//i.test(trimmed)) return;
            if (/^image\d+(image\d+)+$/i.test(trimmed.replace(/\s/g, ""))) return;
            kept.push(line);
        });
        return kept.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
    }

    function extractDate(text) {
        const head = String(text || "").split("\n").slice(0, 8).join("\n");
        const copy = head.match(
            /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i
        );
        if (copy) return copy[1];
        const yearOnly = head.match(/\b(19|20)\d{2}\b/);
        return yearOnly ? yearOnly[0] : "Archive";
    }

    function stripTitleAndMeta(text, title) {
        const lines = String(text || "").split("\n");
        let i = 0;
        function skip(line) {
            const t = line.trim();
            if (!t) return true;
            if (t.toLowerCase() === String(title || "").toLowerCase()) return true;
            if (/©|all rights reserved/i.test(t)) return true;
            if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i.test(t)) return true;
            return false;
        }
        while (i < lines.length && skip(lines[i]) && i < 6) i += 1;
        return lines.slice(i).join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
    }

    function parseDocument(raw, filename) {
        const split = splitFrontmatter(raw);
        const known = CHAPTER_FILES.find(function (row) {
            return row.file.toLowerCase() === String(filename).toLowerCase();
        });
        const fileTitle = titleFromFilename(filename);
        const title = String(split.meta.title || (known && known.title) || fileTitle).trim() || fileTitle;
        const cleaned = cleanBody(split.body);
        const date = split.meta.date || extractDate(cleaned);
        const text = stripTitleAndMeta(cleaned, title);
        return {
            filename: filename,
            key: slugFromFilename(filename),
            title: title,
            subtitle: String(split.meta.subtitle || (known && known.subtitle) || "").trim(),
            date: date,
            text: text
        };
    }

    function blurbFor(entry) {
        if (entry.subtitle) return entry.subtitle;
        const plain = String(entry.text || "").replace(/\s+/g, " ").trim();
        if (!plain) return "A page from the archive.";
        if (plain.length < 96) return plain;
        return plain.slice(0, 108).replace(/\s+\S*$/, "") + "…";
    }

    function roman(n) {
        return ROMAN[n] || String(n + 1);
    }

    function encodePath(folder, filename) {
        return folder.split("/").concat(filename ? [filename] : []).map(encodeURIComponent).join("/");
    }

    async function listRemoteTxt(folder) {
        const api = "https://api.github.com/repos/" + REPO + "/contents/" + encodePath(REPO_ROOT + "/" + folder) + "?ref=main";
        const res = await fetch(api, { headers: { Accept: "application/vnd.github+json" } });
        if (!res.ok) throw new Error("list");
        const rows = await res.json();
        if (!Array.isArray(rows)) return [];
        return rows
            .filter(function (row) { return row && row.type === "file" && /\.txt$/i.test(row.name); })
            .map(function (row) { return row.name; });
    }

    async function listTxt(folder, fallbackNames) {
        const names = new Set(fallbackNames || []);
        try {
            const remote = await Promise.race([
                listRemoteTxt(folder),
                new Promise(function (_, reject) {
                    setTimeout(function () { reject(new Error("timeout")); }, 2800);
                })
            ]);
            remote.forEach(function (name) { names.add(name); });
        } catch (err) { /* local fallback */ }
        return Array.from(names);
    }

    async function fetchText(folder, filename) {
        const res = await fetch(encodePath(folder, filename) + "?t=" + Date.now());
        if (!res.ok) throw new Error(filename);
        return res.text();
    }

    function sortChapterNames(names) {
        const rank = {};
        CHAPTER_FILES.forEach(function (row, i) {
            rank[row.file.toLowerCase()] = i;
        });
        return names.slice().sort(function (a, b) {
            const ia = rank[a.toLowerCase()];
            const ib = rank[b.toLowerCase()];
            if (ia != null && ib != null) return ia - ib;
            if (ia != null) return -1;
            if (ib != null) return 1;
            return a.localeCompare(b, "en", { sensitivity: "base" });
        });
    }

    async function loadChapters(bundled) {
        const data = bundled && typeof bundled === "object" ? bundled : {};
        const names = sortChapterNames(await listTxt("His Life", CHAPTER_FILES.map(function (row) { return row.file; })));
        const order = [];
        const fetched = await Promise.all(names.map(function (filename) {
            const key = slugFromFilename(filename);
            return fetchText("His Life", filename)
                .then(function (raw) { return parseDocument(raw, filename); })
                .catch(function () {
                    if (data[key] && data[key].text) {
                        return {
                            key: key,
                            filename: filename,
                            title: data[key].title,
                            subtitle: data[key].subtitle || "",
                            text: data[key].text,
                            date: "Archive"
                        };
                    }
                    return null;
                });
        }));
        fetched.forEach(function (parsed) {
            if (!parsed || !parsed.text) return;
            const key = parsed.key;
            if (!parsed.subtitle && data[key] && data[key].subtitle) parsed.subtitle = data[key].subtitle;
            data[key] = {
                title: parsed.title,
                subtitle: parsed.subtitle || blurbFor(parsed),
                text: parsed.text,
                filename: parsed.filename
            };
            order.push(key);
        });
        return { data: data, order: order };
    }

    async function loadWritings(bundled) {
        const library = bundled && typeof bundled === "object" ? bundled : {};
        const keys = Object.keys(WRITING_FOLDERS);
        for (let i = 0; i < keys.length; i += 1) {
            const key = keys[i];
            const folder = WRITING_FOLDERS[key];
            const shelf = library[key] || { title: key, subtitle: "", entries: [] };
            const bundledEntries = Array.isArray(shelf.entries) ? shelf.entries : [];
            let names = [];
            try {
                names = await listTxt(folder, []);
            } catch (err) {
                names = [];
            }
            if (!names.length) continue;
            names.sort(function (a, b) {
                return a.localeCompare(b, "en", { sensitivity: "base" });
            });
            const loaded = await Promise.all(names.map(function (filename) {
                return fetchText(folder, filename)
                    .then(function (raw) {
                        const parsed = parseDocument(raw, filename);
                        return { title: parsed.title, date: parsed.date, text: parsed.text };
                    })
                    .catch(function () {
                        const guess = titleFromFilename(filename);
                        return bundledEntries.find(function (entry) {
                            return String(entry.title).toLowerCase() === guess.toLowerCase();
                        }) || null;
                    });
            }));
            const kept = loaded.filter(Boolean);
            if (kept.length) shelf.entries = kept;
            library[key] = shelf;
        }
        return library;
    }

    root.ContentArchive = {
        parseDocument: parseDocument,
        blurbFor: blurbFor,
        roman: roman,
        loadChapters: loadChapters,
        loadWritings: loadWritings,
        WRITING_FOLDERS: WRITING_FOLDERS
    };
})(window);
