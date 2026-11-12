#!/usr/bin/env node
/* Snapshot: freeze every page x viewport of an alignment-guard config into a static HTML file.
   Usage:  node snapshot.mjs align.config.json --out snaps
   Needs:  playwright-core (CHROME_PATH or bundled Chromium); actions.mjs next to this file.
   Why:    palette-check, typography-check, consistency-check and compare-sheets read one HTML file. An app or a game
           shows its screens only after clicks, a long press or a state set through a debug hook (the config's
           "actions"). This runs the same pages and actions as the guard, then saves what the browser rendered:
           the DOM as it is (inline styles, open dialogs, drawn SVG) with every same-origin stylesheet inlined and
           every script removed, so the file looks the same when opened again, at that viewport.
   Writes: OUT/<page>-<width>.html for each page and viewport, and OUT/snapshots.json (name, width, height, file).
           Run the file tools on them, e.g.  node palette-check.mjs snaps/menu-390.html
           and compare two runs with          node compare-sheets.mjs before/menu-390.html after/menu-390.html --width 390 --height 844
   Exit:   0 = written, 2 = setup or action error. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { runAction } from "./actions.mjs";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const cfgPath = args.find((a) => a.endsWith(".json") && args[args.indexOf(a) - 1] !== "--out");
if (!cfgPath) { console.error("usage: node snapshot.mjs align.config.json --out DIR"); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const cfgDir = path.dirname(path.resolve(cfgPath));
const out = path.resolve(flag("--out") ?? "snaps");
const toUrl = (u) => (u.includes("://") ? u : pathToFileURL(path.resolve(cfgDir, u)).href);

async function loadChromium() {
  const req = createRequire(path.join(process.cwd(), "noop.js"));
  for (const name of ["playwright-core", "playwright"]) {
    try { const m = await import(pathToFileURL(req.resolve(name)).href); return m.chromium ?? m.default.chromium; } catch {}
    try { return (await import(name)).chromium; } catch {}
  }
  console.error("snapshot: needs playwright-core (npm i --no-save playwright-core)");
  process.exit(2);
}

function freeze() {
  const css = [...document.styleSheets]
    .filter((s) => { try { return !!s.cssRules && (!s.href || s.href.startsWith(location.origin)); } catch { return false; } })
    .map((s) => [...s.cssRules].map((r) => r.cssText).join("\n")).join("\n");
  const doc = document.documentElement.cloneNode(true);
  // form state lives in properties, not attributes: write it back so the copy shows it
  const live = document.querySelectorAll("input, textarea, select"), copy = doc.querySelectorAll("input, textarea, select");
  live.forEach((el, i) => { const c = copy[i]; if (!c) return; if (el.type === "checkbox" || el.type === "radio") { if (el.checked) c.setAttribute("checked", ""); else c.removeAttribute("checked"); } else if (el.tagName === "TEXTAREA") c.textContent = el.value; else if (el.tagName === "SELECT") [...c.options].forEach((o, j) => (o.selected = el.options[j]?.selected)); else c.setAttribute("value", el.value); });
  doc.querySelectorAll("script, link[rel=modulepreload], link[rel=preload]").forEach((n) => n.remove());
  doc.querySelectorAll("link[rel=stylesheet]").forEach((l) => { if (!/^https?:/.test(l.getAttribute("href") ?? "") || l.href.startsWith(location.origin)) l.remove(); });
  // canvases cannot be copied as markup: keep their box, paint their pixels as an image
  const liveCanvas = document.querySelectorAll("canvas"), copyCanvas = doc.querySelectorAll("canvas");
  liveCanvas.forEach((cv, i) => { const c = copyCanvas[i]; if (!c) return; try { const img = document.createElement("img"); img.src = cv.toDataURL(); img.setAttribute("style", c.getAttribute("style") ?? ""); img.className = c.className; img.width = cv.width; img.height = cv.height; c.replaceWith(img); } catch { c.remove(); } });
  // absolute URLs for images, so the file can live anywhere
  doc.querySelectorAll("img[src]").forEach((im) => { if (!im.src.startsWith("data:")) im.setAttribute("src", new URL(im.getAttribute("src"), location.href).href); });
  const style = document.createElement("style");
  style.textContent = css;
  doc.querySelector("head").append(style);
  return "<!doctype html>\n" + doc.outerHTML;
}

const chromium = await loadChromium();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
fs.mkdirSync(out, { recursive: true });
const written = [];
try {
  for (const pg of cfg.pages) {
    for (const vp of pg.viewports ?? cfg.viewports ?? []) {
      // every snapshot starts from empty storage, like "freshContext" in the guard
      const ctx = await browser.newContext({ viewport: vp, hasTouch: cfg.touch ?? false, reducedMotion: "reduce", colorScheme: cfg.colorScheme ?? "light" });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(toUrl(pg.url), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      for (const act of pg.actions ?? []) await runAction(page, act);
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(out, `${pg.name}-${vp.width}.html`);
      fs.writeFileSync(file, await page.evaluate(freeze));
      written.push({ name: pg.name, width: vp.width, height: vp.height, file: path.relative(out, file) });
      if (errors.length) console.error(`snapshot: ${pg.name}@${vp.width}: page error: ${errors[0]}`);
      await ctx.close();
    }
  }
} catch (err) {
  console.error("snapshot: error:", err.message.split("\n")[0]);
  await browser.close();
  process.exit(2);
}
await browser.close();
fs.writeFileSync(path.join(out, "snapshots.json"), JSON.stringify(written, null, 2));
console.log(`snapshot: ${written.length} files in ${path.relative(process.cwd(), out) || "."}`);
