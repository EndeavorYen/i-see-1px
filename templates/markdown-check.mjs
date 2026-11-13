#!/usr/bin/env node
/* Markdown structure check: the defects a renderer hides until a reader sees them.
   Usage:  node markdown-check.mjs README.md [guide.md ...]
   Checks (each one counts per place it is evaluated):
     - exactly one H1; no skipped heading level; no empty section (a heading directly followed by a same-level or higher heading)
     - no empty table header cell (a blank corner cell is a missing label and a screen-reader gap)
     - every table row has the header's column count; a blank line before each table
     - consecutive prose lines that a renderer silently merges into one paragraph (a "✅ ..." / "❌ ..." list with no bullets)
     - code fences are closed, and have a blank line before and after (list items may nest a fence)
     - every in-page link [x](#anchor) matches a heading (GitHub-style slug)
     - no trailing whitespace, no tabs, no run of 2+ blank lines, file ends with one newline
   Fenced code is skipped by the prose rules. No dependencies.
   Exit: 0 = pass, 1 = failures, 2 = usage error. */
import fs from "node:fs";

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!files.length) { console.error("usage: node markdown-check.mjs FILE.md [FILE.md ...]"); process.exit(2); }

const FENCE = /^\s*(```|~~~)/;
const BLOCK_START = /^\s*(#|\||>|[-*+]\s|\d+[.)]\s|```|~~~)/; // headings, tables, quotes, list items, fences
const slug = (t) => t.toLowerCase().replace(/[`*_]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-");

let failed = 0;
for (const file of files) {
  if (!fs.existsSync(file)) { console.error(`markdown check: no such file: ${file}`); process.exit(2); }
  const md = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const fm = md.match(/^---\n[\s\S]*?\n---\n/); // YAML front matter is not prose
  const lines = md.split("\n");
  let checks = 0; const fails = [];
  const check = (ok, msg) => { checks++; if (!ok) fails.push(msg); };

  // 1) split into fenced and prose lines
  const prose = []; // { text, n }
  let fenceMark = null;
  lines.forEach((l, i) => {
    const m = l.match(FENCE);
    if (m) {
      if (!fenceMark) {
        fenceMark = m[1];
        const prev = lines[i - 1];
        check(i === 0 || prev.trim() === "" || /^\s*(\d+[.)]|[-*+])\s/.test(prev), `no blank line before the code fence at line ${i + 1}`);
      } else if (m[1] === fenceMark) {
        fenceMark = null;
        check(lines[i + 1] === undefined || lines[i + 1].trim() === "", `no blank line after the code fence that ends at line ${i + 1}`);
      }
      return;
    }
    if (!fenceMark && !(fm && i + 1 <= fm[0].split("\n").length - 1)) prose.push({ text: l, n: i + 1 });
  });
  check(!fenceMark, "a code fence is never closed");

  // 2) headings
  const heads = prose.map((p) => ({ ...p, m: p.text.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/) })).filter((p) => p.m)
    .map((p) => ({ lvl: p.m[1].length, text: p.m[2], n: p.n }));
  check(heads.filter((h) => h.lvl === 1).length === 1, `expected exactly one H1, found ${heads.filter((h) => h.lvl === 1).length}`);
  heads.forEach((h, i) => {
    if (i) check(h.lvl <= heads[i - 1].lvl + 1, `heading level skipped at line ${h.n}: "${h.text}" (H${heads[i - 1].lvl} then H${h.lvl})`);
    const next = lines.slice(h.n).find((l) => l.trim() !== ""); // all lines: a code fence counts as content
    const nl = next && next.match(/^(#{1,6})\s/);
    check(!(nl && nl[1].length <= h.lvl), `heading at line ${h.n} ("${h.text}") is an empty section: the next heading is the same level or higher`);
  });

  // 3) anchors
  const slugs = new Set(heads.map((h) => slug(h.text)));
  prose.forEach((p) => { for (const m of p.text.matchAll(/\]\(#([^)\s]+)\)/g)) { let a = m[1]; try { a = decodeURIComponent(a); } catch {} check(slugs.has(a), `line ${p.n}: anchor #${a} matches no heading`); } });

  // 4) tables
  const cells = (r) => r.trim().replace(/^\||\|$/g, "").replace(/\\\|/g, "").replace(/`[^`]*`/g, "x").split("|");
  for (let i = 0; i < prose.length; i++) {
    const row = prose[i];
    if (!/^\s*\|/.test(row.text)) continue;
    if (i && /^\s*\|/.test(prose[i - 1].text) && prose[i - 1].n === row.n - 1) continue; // not the first row
    const n = cells(row.text).length;
    const prev = lines[row.n - 2];
    check(row.n === 1 || prev === undefined || prev.trim() === "", `table at line ${row.n} has no blank line before it`);
    check(!cells(row.text).some((c) => c.trim() === ""), `table at line ${row.n} has an empty header cell`);
    for (let j = i; j < prose.length && /^\s*\|/.test(prose[j].text) && prose[j].n === row.n + (j - i); j++) {
      check(cells(prose[j].text).length === n, `table row at line ${prose[j].n} has ${cells(prose[j].text).length} columns, the header has ${n}`);
    }
  }

  // 5) merged prose lines
  prose.forEach((p, i) => {
    if (!i) return;
    const prev = prose[i - 1];
    if (prev.n !== p.n - 1) return;
    const plain = (s) => s.trim() !== "" && !BLOCK_START.test(s) && !/^\s+\S/.test(s) && !/^(---+|===+|\*\*\*+)\s*$/.test(s.trim());
    if (plain(p.text) && plain(prev.text)) check(false, `line ${p.n} merges into the paragraph above when rendered (add a blank line or a list marker)`);
  });

  // 6) whitespace
  lines.forEach((l, i) => { check(!/[ \t]+$/.test(l), `trailing whitespace on line ${i + 1}`); check(!/\t/.test(l), `tab on line ${i + 1}`); });
  check(!/\n{3,}/.test(md), "two or more blank lines in a row");
  check(md.endsWith("\n") && !md.endsWith("\n\n"), "the file must end with exactly one newline");

  const bad = fails;
  console.log(`${file}: ${checks - bad.length}/${checks} checks passed`);
  bad.forEach((f) => console.log(`  FAIL ${f}`));
  failed += bad.length;
}
console.log(failed ? "markdown check: FAIL" : "markdown check: pass");
process.exit(failed ? 1 : 0);
