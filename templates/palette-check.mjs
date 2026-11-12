#!/usr/bin/env node
/* Palette check: measure the colours a page really renders with, in a real browser.
   Usage:  node palette-check.mjs page.html|URL [--allow blue,green,red,gray] [--artwork SEL] [--max-colors 28] [--max-accent 10] [--sheet SELECTOR] [--json-out FILE]
   Reports   distinct colours, hue families, WCAG contrast of every text run (4.5:1, or 3:1 for large text),
             and how much of the page area is covered by saturated "accent" fills.
   Exit      0 = pass, 1 = violations, 2 = usage/runtime error.
   Needs     playwright-core (CHROME_PATH or bundled Chromium), like alignment-guard.mjs. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a) => /^https?:\/\//.test(a) || /\.html?$/i.test(a)); // an HTML file or a URL
if (!file) { console.error("usage: node palette-check.mjs page.html|URL [--allow blue,green,red,gray] [--max-colors N] [--max-accent PCT]"); process.exit(2); }
const allow = new Set(flag("--allow", "blue,green,red,gray").split(","));
// --artwork SEL: pictures (a game scene, a drawn clock, a map). Their fills are not the interface palette and are left out of the
// colour count, the hue families and the accent area; text drawn on them is still checked for contrast.
const artworkSel = flag("--artwork", "");
const maxColors = Number(flag("--max-colors", 28));
const maxAccent = Number(flag("--max-accent", 10));
const jsonOut = flag("--json-out");
const sheet = flag("--sheet", "[data-qa=page]"); // the sheets whose total area the accent share is measured against; falls back to the whole document

const req = createRequire(path.join(process.cwd(), "noop.js"));
let chromium;
for (const name of ["playwright-core", "playwright"]) {
  for (const load of [async () => import(pathToFileURL(req.resolve(name)).href), async () => import(name)]) {
    try { const m = await load(); chromium = m.chromium ?? m.default?.chromium; if (chromium) break; } catch {}
  }
  if (chromium) break;
}
if (!chromium) { console.error("palette check: needs playwright-core"); process.exit(2); }

function inPage([sheetSel, artworkSel]) {
  const parse = (s) => { const m = (s || "").match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const hsl = (c) => { const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return { h: 0, s: 0, l }; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; return { h, s, l }; };
  const family = (c) => { const { h, s } = hsl(c); if (s < 0.06) return "gray"; if (h >= 195 && h < 250) return "blue"; if (h >= 80 && h < 170) return "green";
    if (h >= 340 || h < 20) return "red"; if (h >= 20 && h < 80) return "amber"; if (h >= 170 && h < 195) return "teal"; return "purple"; };
  const stops = (img) => [...(img || "").matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter(Boolean);
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e), c = parse(s.backgroundColor);
      if (s.backgroundImage !== "none" && /gradient/.test(s.backgroundImage)) { const d = stops(s.backgroundImage).sort((a, b) => lum(a) - lum(b))[0]; if (d) { layers.push(d); break; } }
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const used = new Map();   // hex -> {n, roles}
  const note = (c, role) => { if (!c || c.a === 0) return; const k = hex(c); const u = used.get(k) ?? { n: 0, roles: new Set() }; u.n++; u.roles.add(role); used.set(k, u); };
  const SHAPES = new Set(["rect", "circle", "ellipse", "path", "polygon", "polyline", "line"]);
  const low = [];
  let accentArea = 0, docArea = 0;
  for (const p of document.querySelectorAll(sheetSel)) { const r = p.getBoundingClientRect(); docArea += r.width * r.height; }
  if (!docArea) docArea = document.documentElement.scrollWidth * document.documentElement.scrollHeight;
  const isAccent = (c) => { const h = hsl(c); return h.s > 0.5 && h.l < 0.7; };
  for (const el of document.body.querySelectorAll("*")) {
    const s = getComputedStyle(el), svg = el instanceof SVGElement;
    const rect = el.getBoundingClientRect();
    const art = !!artworkSel && !!el.closest(artworkSel); // a picture: its fills are not the palette (text is still checked)
    if (!art && !svg) {
      const bg = parse(s.backgroundColor); if (bg && bg.a > 0) { note(bg, "bg"); if (isAccent(bg)) accentArea += rect.width * rect.height; }
      for (const side of ["Top", "Right", "Bottom", "Left"]) if (parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none") note(parse(s[`border${side}Color`]), "border");
      if (s.backgroundImage !== "none") for (const c of stops(s.backgroundImage)) note(c, "gradient");
    } else if (!art && SHAPES.has(el.tagName.toLowerCase())) {
      const f = parse(s.fill), st = parse(s.stroke);
      if (f && s.fill !== "none") { note(f, "svg-fill"); if (isAccent(f)) accentArea += rect.width * rect.height; }
      if (st && s.stroke !== "none") note(st, "svg-stroke");
    }
    // text runs
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own || rect.width < 1) continue;
    const fs = parseFloat(s.fontSize), bold = parseInt(s.fontWeight, 10) >= 700, large = fs >= 24 || (fs >= 18.66 && bold);
    let fg = svg ? parse(s.fill) : parse(s.color), bg;
    if (svg) {
      el.scrollIntoView({ block: "center", inline: "center" }); // hit-testing only works inside the viewport
      const r2 = el.getBoundingClientRect(), cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2; bg = null;
      // the background is what lies BENEATH the text: skip the text itself and anything painted on top of it
      // (a clock hand crossing a number), and read a shape's stroke colour when the point is on its stroke only
      const stack = document.elementsFromPoint(cx, cy), at = stack.indexOf(el);
      for (const e of at >= 0 ? stack.slice(at + 1) : stack) {
        if (e === el || el.contains(e)) continue;
        if (e instanceof SVGElement) {
          if (!SHAPES.has(e.tagName.toLowerCase())) continue;
          const cs = getComputedStyle(e);
          let inFill = true, onStroke = false;
          try {
            const m = e.getScreenCTM()?.inverse(); const svgRoot = e.ownerSVGElement;
            if (m && svgRoot && e.isPointInFill) { const p = svgRoot.createSVGPoint(); p.x = cx; p.y = cy; const q = p.matrixTransform(m); inFill = e.isPointInFill(q); onStroke = e.isPointInStroke(q); }
          } catch {}
          if (inFill && cs.fill && cs.fill !== "none") { bg = parse(cs.fill); break; }
          if (onStroke && cs.stroke && cs.stroke !== "none") { bg = parse(cs.stroke); break; }
        } else { bg = bgOf(e); break; }
      }
      bg = bg ?? bgOf(el.closest("svg"));
    } else bg = bgOf(el);
    if (!fg) continue;
    if (!art) note(fg, svg ? "svg-text" : "text");
    const f2 = over(fg, bg), need = large ? 3 : 4.5, a = lum(f2), b = lum(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < need) low.push({ ratio: Math.round(ratio * 100) / 100, need, fg: hex(f2), bg: hex(bg), size: Math.round(fs), text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 28), where: svg ? "svg" : (el.getAttribute("data-qa") || el.tagName.toLowerCase()) });
  }
  const colors = [...used].map(([k, v]) => { const c = parse(`rgb(${parseInt(k.slice(1, 3), 16)},${parseInt(k.slice(3, 5), 16)},${parseInt(k.slice(5, 7), 16)})`); return { hex: k, family: family(c), n: v.n, roles: [...v.roles] }; });
  return { colors, low, accentPct: docArea ? (accentArea / docArea) * 100 : 0 };
}

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto(/^https?:\/\//.test(file) ? file : pathToFileURL(path.resolve(file)).href, { waitUntil: "load" }); // a file, or a URL
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(inPage, [sheet, artworkSel]);
  const fam = {};
  for (const c of r.colors) (fam[c.family] ??= []).push(c.hex);
  const bad = [];
  if (r.colors.length > maxColors) bad.push(`${r.colors.length} distinct colours (max ${maxColors})`);
  for (const f of Object.keys(fam)) if (!allow.has(f)) bad.push(`hue family "${f}" is not in the palette: ${fam[f].join(" ")}`);
  for (const l of r.low) bad.push(`contrast ${l.ratio}:1 < ${l.need}:1  ${l.fg} on ${l.bg}  ${l.size}px  [${l.where}] "${l.text}"`);
  if (r.accentPct > maxAccent) bad.push(`saturated accent fills cover ${r.accentPct.toFixed(1)}% of the pages (max ${maxAccent}%)`);
  console.log(`palette: ${r.colors.length} distinct colours | families: ${Object.entries(fam).map(([k, v]) => `${k}(${v.length})`).join(" ")} | accent area ${r.accentPct.toFixed(1)}% | low-contrast text runs: ${r.low.length}`);
  for (const b of bad) console.log("PALETTE " + b);
  console.log(bad.length ? `palette check: ${bad.length} violations` : "palette check: pass");
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ ...r, families: fam, violations: bad }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.error("palette check: runtime error:", e.message); process.exitCode = 2; }
finally { await browser?.close(); }
