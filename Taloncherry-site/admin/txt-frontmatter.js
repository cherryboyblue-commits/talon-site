(function () {
    function yamlScalar(value) {
        const text = String(value == null ? "" : value);
        if (text === "" || /[:#\[\]\{\}&*!|>'"%@`\n]/.test(text) || text !== text.trim()) {
            return JSON.stringify(text);
        }
        return text;
    }

    function parseMeta(block) {
        const meta = {};
        String(block || "").split("\n").forEach(function (line) {
            const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
            if (!match) return;
            let value = match[2].trim();
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                try {
                    value = JSON.parse(value.replace(/^'/, '"').replace(/'$/, '"'));
                } catch (err) {
                    value = value.slice(1, -1);
                }
            }
            meta[match[1]] = value;
        });
        return meta;
    }

    function fromFile(text) {
        const source = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
        if (!source.startsWith("---\n")) {
            return { title: "", body: source };
        }
        const close = source.indexOf("\n---\n", 4);
        if (close === -1) {
            return { title: "", body: source };
        }
        const meta = parseMeta(source.slice(4, close));
        return {
            title: meta.title || "",
            subtitle: meta.subtitle || "",
            date: meta.date || "",
            body: source.slice(close + 5)
        };
    }

    function toFile(data) {
        const title = data && data.title != null ? data.title : "";
        const subtitle = data && data.subtitle != null ? data.subtitle : "";
        const date = data && data.date != null ? data.date : "";
        const body = data && data.body != null ? data.body : "";
        let head = "---\ntitle: " + yamlScalar(title) + "\n";
        if (String(subtitle).trim()) {
            head += "subtitle: " + yamlScalar(subtitle) + "\n";
        }
        if (String(date).trim()) {
            head += "date: " + yamlScalar(date) + "\n";
        }
        head += "---\n";
        return head + String(body).replace(/^\n/, "");
    }

    window.TalonTxtFrontmatter = { fromFile: fromFile, toFile: toFile };
})();
