#!/usr/bin/env node
/* Makes the README comparison images of the A4 print guide from the live site, so they carry the same measured tags.
   Usage:  node scripts/make-compare.mjs [--out docs/compare] [--only terms,orphan]
   Needs:  npm i --no-save playwright-core   (set CHROME_PATH if Playwright has no bundled Chromium)
   It serves docs/ on 127.0.0.1:4174, switches the viewer to "A4 print guide", opens each spot and screenshots the two
   frames (strip with tags + the framed page) at 2x. Both images of a pair get one size, as scripts/readme-check.mjs requires.
   The five web-page pairs (01-05) were made earlier and are left alone. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(root, flag("--out", "docs/compare"));
const only = flag("--only", "")?.split(",").filter(Boolean);
const SPOTS = [
  { id: "terms", file: "06-paired-terminals" },
  { id: "orphan", file: "07-stub-last-line" },
  { id: "inset", file: "08-text-left" },
  { id: "scale", file: "09-type-scale" },
  { id: "palette", file: "10-palette" }
].filter((s) => !only.length || only.includes(s.id));

const req = createRequire(path.join(process.cwd(), "noop.js"));
let chromium;
for (const name of ["playwright-core", "playwright"]) {
  for (const load of [async () => import(pathToFileURL(req.resolve(name)).href), async () => import(name)]) {
    try { const m = await load(); chromium = m.chromium ?? m.default?.chromium; if (chromium) break; } catch {}
  }
  if (chromium) break;
}
if (!chromium) { console.error("make-compare: needs playwright-core (npm i --no-save playwright-core)"); process.exit(2); }

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".json": "application/json" };
const server = http.createServer((rq, rs) => {
  const p = path.normalize(decodeURIComponent(new URL(rq.url, "http://x").pathname)).replace(/^[/\\]+/, "");
  let file = path.join(docs, p);
  if (!file.startsWith(docs) || !fs.existsSync(file)) { rs.writeHead(404).end(); return; }
  if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  rs.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(rs);
});
await new Promise((ok, bad) => server.listen(4174, "127.0.0.1", ok).on("error", bad));

const VIEWPORT_W = 912; // two frames of 424 css px = 848 px images at 2x, the width of the web-page pairs
// --disable-lcd-text: grayscale antialiasing. Windows ClearType puts colour fringes on text, and readme-check reads those as extra hues in the header strip.
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--disable-lcd-text"] });
try {
  const ctx = await browser.newContext({ viewport: { width: VIEWPORT_W, height: 1500 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:4174/index.html", { waitUntil: "load" });
  await page.click("[data-kind=print]");
  const settle = () => page.waitForTimeout(700);
  fs.mkdirSync(outDir, { recursive: true });
  await settle();
  for (const s of SPOTS) {
    await page.click(`[data-spot=${s.id}]`);
    await page.evaluate(() => document.documentElement.style.removeProperty("--frame-h"));
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await settle();
    // fit the frame to the highlighted region (+ margin), then let the viewer re-centre on it
    const fit = await page.evaluate(() => {
      const f = document.querySelector("[data-qa=frame]"), box = f.querySelector(".viewport");
      const d = f.querySelector("iframe").contentDocument;
      const reg = [...d.querySelectorAll(".isee-ov")].find((e) => e.style.background);
      const scale = box.clientWidth / 794;
      return { h: reg ? reg.getBoundingClientRect().height : 200, scale, w: box.clientWidth };
    });
    await page.evaluate((px) => document.documentElement.style.setProperty("--frame-h", px + "px"), Math.ceil((fit.h + 16) * fit.scale));
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await settle();
    // both strips get the same height so the two images of a pair have identical dimensions
    await page.evaluate(() => {
      const strips = [...document.querySelectorAll(".frame .strip")]; strips.forEach((e) => (e.style.minHeight = ""));
      const h = Math.max(...strips.map((e) => e.getBoundingClientRect().height)); strips.forEach((e) => (e.style.minHeight = h + "px"));
    });
    for (const side of ["without", "with"]) {
      const file = path.join(outDir, `${s.file}-${side}.png`);
      await page.locator(`[data-qa=frame][data-side=${side}]`).screenshot({ path: file });
      const b = fs.readFileSync(file);
      console.log(`${path.relative(root, file)}  ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`);
    }
    const tags = await page.evaluate(() => [...document.querySelectorAll(".frame")].map((f) => f.getAttribute("data-side") + ": " + [...f.querySelectorAll(".tag")].map((t) => t.textContent).join(" | ")));
    for (const t of tags) console.log("   " + t);
  }
} finally { await browser.close(); server.close(); }
