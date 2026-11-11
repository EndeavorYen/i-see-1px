#!/usr/bin/env node
/* README layout check: the README of a repo called i-see-1px has to pass its own rules.
   Usage:  node scripts/readme-check.mjs [README.md]
   Checks:
     - every image the README references exists
     - each *-without.png has a *-with.png partner with identical pixel dimensions
     - side by side: each pair is two <img> tags back to back on one line (nothing between them), with the
       same percentage width attribute, and the two widths add up to at most 100% (so they share a line,
       display at equal width and share one top)
     - all docs/compare images share one pixel width and one width="" attribute
     - Side-by-side captions share one structure: "**N. Title.** Without the skill, ... With it, ..."
     - one H1, no skipped heading levels, no heading directly followed by another heading of the same or higher level
     - table columns whose body cells are all numbers are right-aligned (---:)
   Exit: 0 = pass, 1 = failures. No dependencies. */
import fs from "node:fs";
import path from "node:path";

const readme = process.argv[2] ?? "README.md";
const root = path.dirname(path.resolve(readme));
const md = fs.readFileSync(readme, "utf8");
const fails = [];
let checks = 0;
const check = (cond, msg) => { checks++; if (!cond) fails.push(msg); };

const pngSize = (file) => {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

// images: markdown ![alt](src) and <img src="" width="">
const imgs = [];
for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)|<img\b[^>]*>/g)) {
  const tag = m[0]; const end = m.index + tag.length;
  const src = m[1] ?? tag.match(/src="([^"]+)"/)?.[1];
  const width = tag.startsWith("<img") ? tag.match(/width="([^"]+)"/)?.[1] ?? null : null;
  if (!src || /^https?:/.test(src)) continue;
  imgs.push({ src, width, index: m.index, end });
}
const sizes = new Map();
for (const im of imgs) {
  const file = path.join(root, im.src);
  check(fs.existsSync(file), `missing image: ${im.src}`);
  if (fs.existsSync(file)) sizes.set(im.src, pngSize(file));
}

// pairs
const pairs = imgs.filter((im) => /-without(-skill)?\.png$/.test(im.src) || /without-skill\.png$/.test(im.src));
for (const a of pairs) {
  const partnerSrc = a.src.replace(/without/, "with");
  const i = imgs.indexOf(a);
  const b = imgs.find((im) => im.src === partnerSrc);
  check(!!b, `no partner for ${a.src}`);
  if (!b) continue;
  check(imgs[i + 1] === b && md.slice(a.end, b.index) === "", `${partnerSrc} does not sit directly after ${a.src} on the same line`);
  const pct = (w) => (w && /^\d+(\.\d+)?%$/.test(w) ? parseFloat(w) : NaN);
  check(!Number.isNaN(pct(a.width)) && pct(a.width) === pct(b.width), `pair ${a.src} needs one percentage width on both images (got ${a.width}, ${b.width})`);
  check(pct(a.width) + pct(b.width) <= 100, `pair ${a.src} is wider than 100% (${a.width} + ${b.width}) and would wrap`);
  const sa = sizes.get(a.src), sb = sizes.get(b.src);
  if (sa && sb) check(sa.w === sb.w && sa.h === sb.h, `pair size differs: ${a.src} ${sa.w}x${sa.h} vs ${b.src} ${sb.w}x${sb.h}`);
  check(a.width === b.width, `pair width attribute differs: ${a.src} ${a.width} vs ${b.src} ${b.width}`);
}

// compare images share one width
const compare = imgs.filter((im) => im.src.startsWith("docs/compare/"));
const widths = new Set(compare.map((im) => sizes.get(im.src)?.w));
check(widths.size <= 1, `compare images have ${widths.size} pixel widths: ${[...widths].join(", ")}`);
const attrs = new Set(compare.map((im) => im.width));
check(attrs.size <= 1, `compare images have ${attrs.size} width attributes: ${[...attrs].join(", ")}`);
const onDisk = fs.existsSync(path.join(root, "docs/compare")) ? fs.readdirSync(path.join(root, "docs/compare")).filter((f) => f.endsWith(".png")) : [];
for (const f of onDisk) check(compare.some((im) => im.src === `docs/compare/${f}`), `unused image: docs/compare/${f}`);

// captions
const sbs = md.split(/^## /m).find((s) => s.startsWith("Side-by-side"));
if (sbs) {
  const caps = sbs.split("\n").filter((l) => /^\*\*\d+\./.test(l));
  check(caps.length === compare.length / 2, `${caps.length} captions for ${compare.length / 2} pairs`);
  caps.forEach((c, i) => {
    check(new RegExp(`^\\*\\*${i + 1}\\. [^*]+\\.\\*\\* Without the skill, [^.]+(\\.\\d[^.]*)*\\. With it, .+\\.$`).test(c), `caption ${i + 1} breaks the pattern: ${c.slice(0, 60)}…`);
    check(c.split(/(?<=[a-z0-9)`])\. /i).length <= 3, `caption ${i + 1} has more than two sentences after its title`);
  });
}

// headings (outside code fences)
const lines = md.replace(/```[\s\S]*?```/g, (m) => m.split("\n").map(() => "(code)").join("\n")).split("\n");
const heads = lines.map((l, i) => ({ l, i, m: l.match(/^(#{1,6}) /) })).filter((h) => h.m).map((h) => ({ level: h.m[1].length, line: h.i, text: h.l }));
check(heads.filter((h) => h.level === 1).length === 1, "README needs exactly one H1");
heads.forEach((h, k) => {
  if (k > 0) check(h.level <= heads[k - 1].level + 1, `heading level skipped at "${h.text}"`);
  const next = lines.slice(h.line + 1).find((l) => l.trim());
  const nm = next?.match(/^(#{1,6}) /);
  check(!nm || nm[1].length > h.level, `empty section: "${h.text}" is followed directly by "${next}"`);
});

// tables: numeric columns right-aligned
const rows = md.split("\n");
for (let i = 0; i < rows.length - 1; i++) {
  if (!/^\|.*\|$/.test(rows[i]) || !/^\|(\s*:?-+:?\s*\|)+$/.test(rows[i + 1])) continue;
  const cells = (r) => r.slice(1, -1).split("|").map((c) => c.trim());
  const head = cells(rows[i]), align = cells(rows[i + 1]);
  const body = []; for (let j = i + 2; j < rows.length && /^\|.*\|$/.test(rows[j]); j++) body.push(cells(rows[j]));
  head.forEach((h, c) => {
    const numeric = body.length > 0 && body.every((r) => /^[\d.,%$+-]+$/.test(r[c] ?? ""));
    if (numeric) check(/-:$/.test(align[c]), `table column "${h}" is numeric but not right-aligned (---:)`);
  });
}

if (fails.length) { for (const f of fails) console.log("FAIL " + f); console.log(`readme check: ${fails.length} failed of ${checks}`); process.exit(1); }
console.log(`readme check: pass (${checks} checks, ${imgs.length} images, ${pairs.length} pairs, compare width ${[...widths][0]}px)`);
