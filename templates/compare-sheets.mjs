#!/usr/bin/env node
/* Before/after sheets: every sheet of two HTML files side by side, so a regression can be seen, not just measured.
   Usage:  node compare-sheets.mjs before.html after.html [--out DIR] [--sheet SELECTOR] [--width 794] [--height 1123]
                                   [--labels "Before,After"] [--strict]
           --strict  exit 1 when a block of text with the same words now takes more lines than before
   Needs:  playwright-core (CHROME_PATH if there is no bundled Chromium), like alignment-guard.mjs.
   Writes: DIR/sheet-01.png ... one image per sheet (left = before, right = after, with the share of changed pixels),
           DIR/before-after.pdf   all of them in one file.
   Why:    the guards see what they were told to look for. Comparing the two renders by eye found a command that wrapped
           inside a terminal after a "fix", which no check covered; this makes that comparison one command.
   A sheet is every element matching --sheet (default [data-qa=page]); with no match the whole page is one sheet.
   Exit:   0 = written, 2 = setup error. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const files = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (files.length !== 2) { console.error('usage: node compare-sheets.mjs before.html after.html [--out DIR] [--sheet SELECTOR] [--width 794] [--height 1123] [--labels "Before,After"]'); process.exit(2); }
const out = path.resolve(flag("--out", "before-after"));
const sheetSel = flag("--sheet", "[data-qa=page]");
const W = Number(flag("--width", 794)), H = Number(flag("--height", 1123));
const [labelA, labelB] = flag("--labels", "Before,After").split(",");

const req = createRequire(path.join(process.cwd(), "noop.js"));
let chromium;
for (const name of ["playwright-core", "playwright"]) {
  for (const load of [async () => import(pathToFileURL(req.resolve(name)).href), async () => import(name)]) {
    try { const m = await load(); chromium = m.chromium ?? m.default?.chromium; if (chromium) break; } catch {}
  }
  if (chromium) break;
}
if (!chromium) { console.error("compare-sheets: needs playwright-core (npm i --no-save playwright-core)"); process.exit(2); }

const toUrl = (f) => (f.includes("://") ? f : pathToFileURL(path.resolve(f)).href);
// --disable-lcd-text: grayscale antialiasing, so the images do not carry ClearType colour fringes
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--disable-lcd-text"] });
try {
  async function shoot(file) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(toUrl(file), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const loc = page.locator(sheetSel);
    const n = await loc.count();
    const bufs = [];
    if (n === 0) bufs.push(await page.screenshot({ fullPage: true }));
    else for (let i = 0; i < n; i++) bufs.push(await loc.nth(i).screenshot());
    const blocks = await page.evaluate(measureBlocks, sheetSel);
    await page.close();
    return { bufs, blocks };
  }
  // every block of running text with the number of lines it takes, keyed by its words (symbols and spaces ignored)
  function measureBlocks(sheetSel) {
    const out = [], seen = {};
    const ignore = /[\s←-⯿①-⓿\u{1f300}-\u{1faff}]/gu;
    const sheets = [...document.querySelectorAll(sheetSel)];
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest("svg,script,style,pre")) continue;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.display.startsWith("inline")) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if ([...el.children].some((c) => { const d = getComputedStyle(c).display; return !d.startsWith("inline") && d !== "none"; })) continue; // only blocks whose children are all inline
      const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
      const inner = el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
      const key = el.textContent.replace(ignore, "");
      if (!key) continue;
      seen[key] = (seen[key] ?? 0) + 1;
      const sheet = sheets.findIndex((p) => p.contains(el)) + 1;
      out.push({ key: key + "#" + seen[key], text: el.textContent.replace(/\s+/g, " ").trim().slice(0, 48), lines: Math.max(1, Math.round(inner / lh)), sheet });
    }
    return out;
  }
  const [{ bufs: A, blocks: blocksA }, { bufs: B, blocks: blocksB }] = [await shoot(files[0]), await shoot(files[1])];
  const n = Math.max(A.length, B.length);
  fs.mkdirSync(out, { recursive: true });

  const GAP = 24, HEAD = 56;
  const comp = await browser.newPage({ viewport: { width: W * 2 + GAP * 3, height: 800 } });
  const composed = [];
  for (let i = 0; i < n; i++) {
    const a = A[i]?.toString("base64") ?? "", b = B[i]?.toString("base64") ?? "";
    await comp.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#e2e8f0;font:600 22px system-ui,"Segoe UI",sans-serif;color:#334155}
      .row{display:flex;gap:${GAP}px;padding:0 ${GAP}px ${GAP}px}
      .head{display:flex;gap:${GAP}px;padding:${GAP / 2}px ${GAP}px;height:${HEAD}px;box-sizing:border-box;align-items:center}
      .head > span{flex:none;width:${W}px} .head .b{display:flex;justify-content:space-between;align-items:baseline}
      .head .meta{font-weight:500;color:#64748b;font-size:18px}
      .a{color:#64748b} .b{color:#5f5394}
      img{display:block;box-shadow:0 1px 4px rgba(0,0,0,.25);background:#fff;max-width:${W}px}
    </style>
    <div class="head"><span class="a">${labelA}</span><span class="b"><span>${labelB}</span></span></div>
    <div class="row">${a ? `<img id="a" src="data:image/png;base64,${a}">` : `<div style="width:${W}px"></div>`}${b ? `<img id="b" src="data:image/png;base64,${b}">` : `<div style="width:${W}px"></div>`}</div>`);
    await comp.waitForFunction(() => [...document.images].every((im) => im.complete));
    const changed = await comp.evaluate(() => {
      const ia = document.getElementById("a"), ib = document.getElementById("b");
      if (!ia || !ib) return null;
      const w = Math.min(ia.naturalWidth, ib.naturalWidth), h = Math.min(ia.naturalHeight, ib.naturalHeight);
      const px = (im) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, w, h).data; };
      const p = px(ia), q = px(ib); let d = 0;
      for (let k = 0; k < p.length; k += 4) if (Math.abs(p[k] - q[k]) + Math.abs(p[k + 1] - q[k + 1]) + Math.abs(p[k + 2] - q[k + 2]) > 24) d++;
      return (d / (w * h)) * 100;
    });
    await comp.evaluate(([i, c]) => { const m = document.createElement("span"); m.className = "meta"; m.textContent = `sheet ${i + 1}${c == null ? "" : ` · ${c.toFixed(0)}% of pixels changed`}`; document.querySelector(".head .b").appendChild(m); }, [i, changed]);
    const file = path.join(out, `sheet-${String(i + 1).padStart(2, "0")}.png`);
    await comp.screenshot({ path: file, fullPage: true });
    composed.push({ file, changed });
    console.log(`${path.relative(process.cwd(), file)}  ${changed == null ? "only in one file" : changed.toFixed(0) + "% changed"}`);
  }
  await comp.close();

  // one PDF with every composed sheet, one per page
  const pdfPage = await browser.newPage();
  const imgs = composed.map((c) => `<img src="data:image/png;base64,${fs.readFileSync(c.file).toString("base64")}">`).join("");
  await pdfPage.setContent(`<!doctype html><meta charset="utf-8"><style>@page{size:${W * 2 + GAP * 3}px ${H + HEAD + GAP}px;margin:0}body{margin:0}img{display:block;width:${W * 2 + GAP * 3}px;height:${H + HEAD + GAP}px;page-break-after:always}</style>${imgs}`);
  await pdfPage.waitForFunction(() => [...document.images].every((im) => im.complete));
  await pdfPage.pdf({ path: path.join(out, "before-after.pdf"), width: `${W * 2 + GAP * 3}px`, height: `${H + HEAD + GAP}px`, printBackground: true });
  console.log(`${path.relative(process.cwd(), path.join(out, "before-after.pdf"))}  ${composed.length} pages`);

  // blocks of text that did not change but now take more lines (a sentence that fit on one line and no longer does)
  const before = new Map(blocksA.map((b) => [b.key, b]));
  const grown = [], shrunk = [];
  for (const b of blocksB) {
    const a = before.get(b.key); if (!a || a.lines === b.lines) continue;
    (b.lines > a.lines ? grown : shrunk).push({ text: b.text, sheet: b.sheet, before: a.lines, after: b.lines });
  }
  fs.writeFileSync(path.join(out, "wraps.json"), JSON.stringify({ grown, shrunk }, null, 2));
  console.log(`text blocks compared: ${blocksB.filter((b) => before.has(b.key)).length} unchanged in wording | now longer: ${grown.length} | now shorter: ${shrunk.length}`);
  for (const g of grown) console.log(`  LONGER sheet ${g.sheet}: ${g.before} -> ${g.after} lines  "${g.text}"`);
  if (grown.length && args.includes("--strict")) { console.log(`compare-sheets: ${grown.length} block${grown.length > 1 ? "s" : ""} grew (--strict)`); process.exitCode = 1; }
} catch (e) { console.error("compare-sheets: error:", e.message.split("\n")[0]); process.exitCode = 2; }
finally { await browser.close(); }
