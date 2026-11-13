#!/usr/bin/env node
/* Render a Markdown file to a static page that alignment-guard.mjs can measure (a stand-in for the real renderer).
   Usage:  node markdown-preview.mjs README.md [--out preview] [--tokens tokens.css] [--lang en]
   Needs:  npm i -D marked
   Writes OUT/index.html, OUT/tokens.css and OUT/markdown-preview.css, then use align.config.markdown.example.json.
   Hooks added for the guard config: the article is [data-qa=doc], each table [data-qa=table], each code block [data-qa=code].
   The preview is not your real renderer (GitHub, GitLab, a docs site). Numbers that depend on its CSS are env-dependent. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const src = args.find((a, i) => !a.startsWith("--") && !(i && args[i - 1].startsWith("--")));
if (!src) { console.error("usage: node markdown-preview.mjs FILE.md [--out DIR] [--tokens FILE] [--lang en]"); process.exit(2); }
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(flag("--out", "preview"));
const tokens = path.resolve(flag("--tokens", path.join(here, "tokens.css")));
const lang = flag("--lang", "en");

let marked;
try {
  const req = createRequire(path.join(process.cwd(), "noop.js"));
  marked = (await import(pathToFileURL(req.resolve("marked")).href)).marked;
} catch {
  try { marked = (await import("marked")).marked; } catch { console.error("markdown preview: needs marked (npm i -D marked)"); process.exit(2); }
}

const md = fs.readFileSync(src, "utf8").replace(/^---\n[\s\S]*?\n---\n/, ""); // front matter is not rendered
const body = marked.parse(md, { gfm: true })
  .replace(/<table>/g, '<table data-qa="table">')
  .replace(/<pre>/g, '<pre data-qa="code">');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(tokens, path.join(out, "tokens.css"));
fs.copyFileSync(path.join(here, "markdown-preview.css"), path.join(out, "markdown-preview.css"));
fs.writeFileSync(path.join(out, "index.html"), `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="markdown-preview.css"><title>${path.basename(src)}</title></head>
<body><article data-qa="doc">
${body}
</article></body></html>
`);
console.log(`markdown preview: ${path.join(out, "index.html")}`);
