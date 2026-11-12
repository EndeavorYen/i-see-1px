#!/usr/bin/env node
/* Typography check: scale, proportion, indentation, measure and vertical rhythm, measured on the rendered page.
   Usage:  node typography-check.mjs page.html [--ratio 1.2,1.34] [--prose-lh 1.5] [--head-lh 1.5] [--measure 40]
                                          [--rhythm 8] [--lines 0,24] [--config FILE] [--json-out FILE]
   Rules (HTML text only; svg illustrations are artwork):
     scale      adjacent distinct font sizes differ by a ratio inside --ratio (a modular scale, not 14/16/17/18).
     leading    wrapped CJK prose has line-height >= --prose-lh x size; large headings stay <= --head-lh x size.
     measure    a wrapped paragraph is no wider than --measure ems (about that many CJK characters per line).
     rhythm     the vertical gap between consecutive blocks of a sheet is a multiple of --rhythm px.
     proximity  a heading sits closer to what follows than to what precedes (margin-top >= 1.5 x margin-bottom).
     lines      the first character of every text block starts on one of a few alignment lines (offsets in px from
                the content column, or from the half-width column inside a two-column row).
   Exit 0 = pass, 1 = violations, 2 = error. Needs playwright-core (like alignment-guard.mjs). */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a) => a.endsWith(".html"));
if (!file) { console.error("usage: node typography-check.mjs page.html [options]"); process.exit(2); }
const [rMin, rMax] = flag("--ratio", "1.2,1.34").split(",").map(Number);
const proseLh = Number(flag("--prose-lh", 1.5)), headLh = Number(flag("--head-lh", 1.5));
const measure = Number(flag("--measure", 40)), rhythm = Number(flag("--rhythm", 8));
const lines = flag("--lines", "0,24").split(",").map(Number);
const jsonOut = flag("--json-out");
// Hook selectors. Defaults match the data-qa names used in docs/demo/print; override any of them with --config FILE (JSON).
const defaults = {
  sheet: "[data-qa=page]",            // one printed sheet / artboard; its padding box is the content column
  foot: "[data-qa=foot]",             // absolutely positioned page furniture, ignored by the rhythm check
  lockup: "[data-qa=head]",           // a heading lockup (badge + title); not an alignment line
  column: "[data-qa=two] > *",        // a nested column: alignment lines inside it are measured from its left edge
  headings: "h1,h2,h3,[data-qa=cmd-label]",
  blocks: "[data-qa=page] > p, [data-qa=page] > h3, [data-qa=page] > ol > li, [data-qa=page] > [data-qa=title], [data-qa=page] > [data-qa=page-title], [data-qa=page] > [data-qa=cmd-label], [data-qa=page] > [data-qa=cmd], [data-qa=page] > [data-qa=callout], [data-qa=page] > [data-qa=term] pre, [data-qa=page] > [data-qa=table] th:first-child, [data-qa=page] > [data-qa=table] td:first-child, [data-qa=two] > * > p, [data-qa=two] > * > [data-qa=callout], [data-qa=two] > * > [data-qa=term] pre, [data-qa=two] > * > .ok, [data-qa=two] > * > .no"
};
const cfgFile = flag("--config");
const cfg = { ...defaults, ...(cfgFile ? JSON.parse(fs.readFileSync(cfgFile, "utf8")) : {}) };

const req = createRequire(path.join(process.cwd(), "noop.js"));
let chromium;
for (const name of ["playwright-core", "playwright"]) {
  for (const load of [async () => import(pathToFileURL(req.resolve(name)).href), async () => import(name)]) {
    try { const m = await load(); chromium = m.chromium ?? m.default?.chromium; if (chromium) break; } catch {}
  }
  if (chromium) break;
}
if (!chromium) { console.error("typography check: needs playwright-core"); process.exit(2); }

function inPage([lineOffsets, tol, proseLh, headLh, measure, rhythm, cfg]) {
  const CJK = /[⺀-鿿＀-￯]/;
  const out = { sizes: {}, leading: [], measure: [], rhythm: [], proximity: [], lines: [], offsets: {} };
  const firstChar = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const n = w.nextNode(); if (!n) return null;
    const i = n.textContent.search(/\S/); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
    const q = r.getClientRects()[0]; return q ? q.left : null;
  };
  const textLen = (el) => el.textContent.replace(/\s+/g, "").length;
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const label = (el) => (el.getAttribute("data-qa") || el.tagName.toLowerCase()) + ":" + el.textContent.replace(/\s+/g, " ").trim().slice(0, 18);

  for (const el of document.body.querySelectorAll("*")) {
    if (el instanceof SVGElement || !ownText(el)) continue;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (r.width < 1 || s.display === "none") continue;
    const fs = parseFloat(s.fontSize), lh = parseFloat(s.lineHeight);
    out.sizes[fs] = (out.sizes[fs] ?? 0) + 1;
    const rows = Math.round(r.height / lh);
    const block = !["inline", "inline-block"].includes(s.display);
    if (block && rows >= 2 && CJK.test(el.textContent)) {
      if (lh / fs < proseLh - 0.001 && fs <= 24) out.leading.push(`${label(el)}  ${fs}/${lh} = ${(lh / fs).toFixed(2)} < ${proseLh}`);
      const content = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      if (content / fs > measure + 0.001) out.measure.push(`${label(el)}  ${(content / fs).toFixed(1)}em > ${measure}em`);
    }
    if (block && fs >= 28 && lh / fs > headLh + 0.001) out.leading.push(`${label(el)}  heading ${fs}/${lh} = ${(lh / fs).toFixed(2)} > ${headLh}`);
  }

  // vertical rhythm: gaps between consecutive blocks of each sheet
  for (const page of document.querySelectorAll(cfg.sheet)) {
    const kids = [...page.children].filter((c) => !c.matches(cfg.foot) && getComputedStyle(c).position !== "absolute");
    const rects = kids.map((c) => ({ c, r: c.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top);
    for (let i = 1; i < rects.length; i++) {
      const gap = rects[i].r.top - rects[i - 1].r.bottom;
      if (gap < -tol) out.rhythm.push(`${label(rects[i].c)} overlaps the previous block by ${(-gap).toFixed(1)}px`);
      else if (Math.abs(gap / rhythm - Math.round(gap / rhythm)) * rhythm > tol) out.rhythm.push(`${label(rects[i - 1].c)} -> ${label(rects[i].c)}  gap ${gap.toFixed(1)}px not a multiple of ${rhythm}`);
    }
  }

  // proximity of headings (not the first block of a sheet)
  for (const h of document.querySelectorAll(cfg.headings)) {
    if (h.parentElement?.matches(cfg.sheet) && h.parentElement.firstElementChild === h) continue;
    if (h.closest(cfg.lockup)) continue;
    const prev = h.previousElementSibling, next = h.nextElementSibling; if (!prev || !next) continue;
    const r = h.getBoundingClientRect(), above = r.top - prev.getBoundingClientRect().bottom, below = next.getBoundingClientRect().top - r.bottom;
    if (above < below * 1.5 - 0.001) out.proximity.push(`${label(h)}  ${above.toFixed(1)}px above vs ${below.toFixed(1)}px below (above must be >= 1.5x below)`);
  }

  // alignment lines
  const blocks = document.querySelectorAll(cfg.blocks);
  for (const el of blocks) {
    const left = firstChar(el); if (left == null) continue;
    const origin = (el.closest(cfg.column) ?? el.closest(cfg.sheet));
    const o = origin.matches(cfg.sheet) ? origin.getBoundingClientRect().left + parseFloat(getComputedStyle(origin).paddingLeft) : origin.getBoundingClientRect().left;
    const off = Math.round((left - o) * 2) / 2;
    out.offsets[off] = (out.offsets[off] ?? 0) + 1;
    if (!lineOffsets.some((x) => Math.abs(x - off) <= tol)) out.lines.push(`${label(el)}  starts ${off}px in (lines: ${lineOffsets.join(", ")})`);
  }
  return out;
}

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(inPage, [lines, 0.5, proseLh, headLh, measure, rhythm, cfg]);
  const bad = [];
  const sizes = Object.keys(r.sizes).map(Number).sort((a, b) => a - b);
  const ratios = sizes.slice(1).map((v, i) => ({ a: sizes[i], b: v, q: v / sizes[i] }));
  for (const x of ratios) if (x.q < rMin - 0.001 || x.q > rMax + 0.001) bad.push(`scale: ${x.a}px -> ${x.b}px is ${x.q.toFixed(2)}x (allowed ${rMin}-${rMax})`);
  for (const k of ["leading", "measure", "rhythm", "proximity", "lines"]) for (const m of r[k]) bad.push(`${k}: ${m}`);
  console.log(`typography: sizes ${sizes.join("/")} | ratios ${ratios.map((x) => x.q.toFixed(2)).join(" ")} | alignment lines ${JSON.stringify(r.offsets)}`);
  const counts = {}; for (const b of bad) counts[b.split(":")[0]] = (counts[b.split(":")[0]] ?? 0) + 1;
  console.log(`counts: ${JSON.stringify(counts)}`);
  for (const b of bad) console.log("TYPE " + b);
  console.log(bad.length ? `typography check: ${bad.length} violations` : "typography check: pass");
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ ...r, ratios, violations: bad }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.error("typography check: runtime error:", e.message); process.exitCode = 2; }
finally { await browser?.close(); }
