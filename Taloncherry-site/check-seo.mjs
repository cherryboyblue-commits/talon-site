import fs from "fs";

const targets = [
  ["index.html", "site-jsonld"],
  ["music.html", "site-jsonld"],
  ["studio.html", "site-jsonld"],
  ["writings.html", "site-jsonld"],
  ["writings.html", "site-works-jsonld"],
  ["life.html", "site-jsonld"],
  ["life.html", "site-chapters-jsonld"],
  ["social.html", "site-jsonld"],
];

for (const [file, id] of targets) {
  const html = fs.readFileSync(file, "utf8");
  const open = `<script id="${id}" type="application/ld+json">`;
  const start = html.indexOf(open);
  if (start === -1) {
    console.log(`${file} [${id}] MISSING`);
    continue;
  }
  const raw = html.slice(start + open.length, html.indexOf("</script>", start));
  try {
    const json = JSON.parse(raw);
    const nodes = json["@graph"] || [json];
    console.log(`${file} [${id}] OK nodes=${nodes.length} types=${nodes.map((n) => n["@type"]).join(",")}`);
  } catch (err) {
    console.log(`${file} [${id}] PARSE FAIL ${err.message}`);
  }
}
