#!/usr/bin/env node
/* Consistency check: the things an obsessive designer sees at a glance and a spacing guard does not.
   Usage:  node consistency-check.mjs page.html [--max-radii 4] [--max-borders 3] [--max-strokes 2] [--svg-scale equal|N]
                                      [--tolerance 0.02] [--primary-fonts 2] [--sheet SELECTOR] [--role-attr data-qa] [--json-out FILE]
   Rules (measured on the rendered page; svg is read where it matters):
     symbols     icon characters (check marks, arrows, warning signs, circled numbers) are drawn by ONE font, and none by an emoji font.
                 Each distinct symbol is rendered in a probe with the same font stack and asked which font really drew it.
     fonts       glyphs drawn by fonts outside the --primary-fonts most used (fallback fonts), with the text that triggered them.
     radii       at most --max-radii distinct corner radii (a pill or circle counts as one "full"), and every radius used in svg
                 artwork is one that the HTML uses too: one radius scale for text boxes and illustrations.
     borders     at most --max-borders distinct border widths.
     strokes     at most --max-strokes distinct stroke widths in svg artwork, measured as displayed (stroke x svg scale).
     shadows     panels (rounded, filled boxes) either all have the same shadow or none do.
     roles       elements that share a role attribute (data-qa) share one radius and one shadow.
     svg scale   every svg is drawn at the same scale (rendered width / viewBox width); --svg-scale N pins it, e.g. 1 for 1:1.
                 Icons (svg smaller than 48px both ways) are not illustrations and are left out of the radii, stroke and scale rules.
     tables      the first column of every table has the same width.
     text        one ellipsis form, one family of quote marks, one arrow form, one casing of a mixed-case word (PowerShell, not Powershell).
                 Text inside code, pre, kbd, svg, script and style is not read.
     document    <html lang> is set, and the <title> is in the script the page is written in.
   Printed only (not a rule): how full each sheet is.
   Exit: 0 = pass, 1 = violations, 2 = usage or runtime error. Needs playwright-core (CHROME_PATH if there is no bundled Chromium). */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a) => /\.html?$/i.test(a));
if (!file) { console.error("usage: node consistency-check.mjs page.html [--max-radii 4] [--max-borders 3] [--max-strokes 2] [--svg-scale equal|N] [--primary-fonts 2]"); process.exit(2); }
const maxRadii = Number(flag("--max-radii", 4)), maxBorders = Number(flag("--max-borders", 3)), maxStrokes = Number(flag("--max-strokes", 2));
const svgScale = flag("--svg-scale", "equal"), tol = Number(flag("--tolerance", 0.02)), primaryN = Number(flag("--primary-fonts", 2));
const sheetSel = flag("--sheet", "[data-qa=page]"), roleAttr = flag("--role-attr", "data-qa"), jsonOut = flag("--json-out");

const req = createRequire(path.join(process.cwd(), "noop.js"));
let chromium;
for (const name of ["playwright-core", "playwright"]) {
  for (const load of [async () => import(pathToFileURL(req.resolve(name)).href), async () => import(name)]) {
    try { const m = await load(); chromium = m.chromium ?? m.default?.chromium; if (chromium) break; } catch {}
  }
  if (chromium) break;
}
if (!chromium) { console.error("consistency check: needs playwright-core (npm i --no-save playwright-core)"); process.exit(2); }

/* ---------- in the page ---------- */
function collect([sheetSel, roleAttr]) {
  const SYMBOL = /[←-⇿⌀-⏿①-⓿■-➿⤀-⥿⬀-⯿\u{1f300}-\u{1faff}]/gu;
  const parse = (s) => { const m = (s || "").match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const r1 = (v) => Math.round(v * 10) / 10;
  const label = (el) => (el.getAttribute(roleAttr) || el.tagName.toLowerCase()) + (el.className && typeof el.className === "string" && !el.getAttribute(roleAttr) ? "." + el.className.split(" ")[0] : "");
  const visible = (el) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width >= 1 && r.height >= 1; };
  const out = { radii: {}, svgRadii: {}, borders: {}, strokes: {}, panels: [], roles: {}, svgScales: [], tables: [], symbols: [], text: {}, doc: {}, fill: [] };
  const bump = (o, k, who) => { (o[k] ??= []).push(who); };
  const svgScaleOf = (svg) => { const vb = svg.viewBox?.baseVal; const w = svg.getBoundingClientRect().width; return vb && vb.width ? w / vb.width : 1; };

  for (const el of document.body.querySelectorAll("*")) {
    if (el instanceof SVGElement) continue;
    if (!visible(el)) continue;
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), bg = parse(s.backgroundColor);
    const hasBg = bg && bg.a > 0;
    let hasBorder = false;
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const w = parseFloat(s[`border${side}Width`]);
      if (w > 0 && s[`border${side}Style`] !== "none") { hasBorder = true; bump(out.borders, String(r1(w)), label(el)); }
    }
    const rad = s.borderTopLeftRadius;
    if ((hasBg || hasBorder) && rad && rad !== "0px") {
      const px = parseFloat(rad), pct = rad.includes("%");
      const full = (pct && px >= 50) || (!pct && px >= Math.min(r.width, r.height) / 2 - 0.01);
      const key = full ? "full" : r1(pct ? (px / 100) * Math.min(r.width, r.height) : px) + "px";
      bump(out.radii, key, label(el));
      const role = el.getAttribute(roleAttr);
      if (role) { const g = (out.roles[role] ??= { radii: {}, shadows: {} }); bump(g.radii, key, 1); bump(g.shadows, s.boxShadow === "none" ? "none" : s.boxShadow, 1); }
      if (!full && hasBg && s.display !== "inline" && r.width >= 120 && r.height >= 32) out.panels.push({ label: label(el), shadow: s.boxShadow === "none" ? "none" : s.boxShadow });
    }
  }
  for (const svg of document.querySelectorAll("svg")) {
    if (!visible(svg)) continue;
    const sc = svgScaleOf(svg), r = svg.getBoundingClientRect();
    if (r.width < 48 && r.height < 48) continue;   // an icon is a glyph, not an illustration: its radii, strokes and scale are the icon set's business
    out.svgScales.push({ i: out.svgScales.length + 1, scale: Math.round(sc * 1000) / 1000, width: Math.round(r.width), viewBox: svg.getAttribute("viewBox") });
    for (const el of svg.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      if (s.stroke && s.stroke !== "none" && parseFloat(s.strokeWidth) > 0) bump(out.strokes, String(r1(parseFloat(s.strokeWidth) * sc)), el.tagName.toLowerCase());
      if (el.tagName.toLowerCase() === "rect") {
        const rx = parseFloat(s.rx) || parseFloat(el.getAttribute("rx")) || 0;
        if (rx > 0) { const b = el.getBBox(); const full = rx >= Math.min(b.width, b.height) / 2 - 0.01; bump(out.svgRadii, full ? "full" : r1(rx * sc) + "px", "rect"); }
      }
    }
  }
  for (const t of document.querySelectorAll("table")) {
    const c = t.querySelector("tr")?.cells?.[0]; if (c && visible(c)) out.tables.push(r1(c.getBoundingClientRect().width));
  }

  // text outside code
  const SKIP = "code,pre,kbd,samp,svg,script,style,[hidden]";
  const parts = [];
  const codeLike = (el) => { const cs = getComputedStyle(el); return /mono|consolas|courier|menlo/i.test(cs.fontFamily.split(",")[0]) || cs.whiteSpace.startsWith("pre"); };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() && !n.parentElement.closest(SKIP) && !codeLike(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  for (let n; (n = walker.nextNode());) parts.push(n.textContent);
  const text = parts.join(" ");
  out.text.ellipsis = { unicode: (text.match(/…/g) || []).length, dots: (text.match(/\.\.\./g) || []).length };
  out.text.quotes = { straight: (text.match(/"/g) || []).length, curly: (text.match(/[“”]/g) || []).length, corner: (text.match(/[「」『』]/g) || []).length };
  out.text.arrows = { unicode: (text.match(/→/g) || []).length, ascii: (text.match(/->|=>/g) || []).length };
  const forms = {};
  for (const w of text.match(/[A-Za-z][A-Za-z0-9]{2,}/g) || []) (forms[w.toLowerCase()] ??= {})[w] = (forms[w.toLowerCase()]?.[w] ?? 0) + 1;
  out.text.casing = Object.entries(forms).filter(([, f]) => Object.keys(f).length > 1 && Object.keys(f).some((x) => /[a-z][A-Z]/.test(x))).map(([k, f]) => ({ word: k, forms: f }));
  const cjk = (text.match(/[⺀-鿿＀-￯]/g) || []).length, latin = (text.match(/[A-Za-z]/g) || []).length;
  out.doc = { lang: document.documentElement.lang || "", title: document.title || "", cjkShare: cjk + latin ? cjk / (cjk + latin) : 0, titleHasCjk: /[⺀-鿿＀-￯]/.test(document.title || "") };

  // every distinct non-ASCII character with the style it is drawn in; symbols are flagged
  const seen = new Set(), SYM1 = new RegExp(SYMBOL.source, "u");
  const sw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() && !n.parentElement.closest("script,style,[hidden]") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  for (let n; (n = sw.nextNode());) {
    const cs = getComputedStyle(n.parentElement);
    for (const ch of n.textContent) {
      if (ch.codePointAt(0) < 128 || /\s/u.test(ch)) continue;
      const k = [ch, cs.fontFamily, cs.fontWeight, cs.fontStyle].join("|");
      if (!seen.has(k)) { seen.add(k); out.symbols.push({ ch, family: cs.fontFamily, weight: cs.fontWeight, style: cs.fontStyle, symbol: SYM1.test(ch) }); }
    }
  }
  // how full each sheet is (information only)
  for (const pg of document.querySelectorAll(sheetSel)) {
    const kids = [...pg.children].filter((c) => getComputedStyle(c).position !== "absolute"); if (!kids.length) continue;
    const top = pg.getBoundingClientRect().top, last = kids[kids.length - 1].getBoundingClientRect().bottom - top;
    out.fill.push(Math.round((last / pg.getBoundingClientRect().height) * 100));
  }
  return out;
}

/* ---------- run ---------- */
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(collect, [sheetSel, roleAttr]);

  // which font really draws each symbol: one probe per distinct (symbol, font stack)
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable"); await client.send("CSS.enable");
  await page.evaluate((syms) => {
    syms.forEach((s, i) => { const p = document.createElement("span"); p.setAttribute("data-probe", String(i)); p.textContent = s.ch;
      p.style.cssText = `position:fixed;left:-9999px;top:0;font-family:${s.family};font-weight:${s.weight};font-style:${s.style};font-size:16px`; document.body.appendChild(p); });
  }, r.symbols);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))); // CDP reports fonts only after layout
  let { root } = await client.send("DOM.getDocument", { depth: -1 });
  const probes = (await client.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-probe]" })).nodeIds;
  const symbolFont = new Map();   // symbol -> set of families
  const charFont = [];            // every probed character with the font that drew it
  for (let i = 0; i < probes.length; i++) {
    const { fonts } = await client.send("CSS.getPlatformFontsForNode", { nodeId: probes[i] });
    const fam = fonts.map((f) => f.familyName).join("+") || "(none)";
    const sy = r.symbols[i]; charFont.push({ ch: sy.ch, fam });
    if (sy.symbol) (symbolFont.get(sy.ch) ?? symbolFont.set(sy.ch, new Set()).get(sy.ch)).add(fam);
  }
  await page.evaluate(() => document.querySelectorAll("[data-probe]").forEach((p) => p.remove()));

  // fonts drawing text: the most used are the design's fonts; the rest are fallbacks
  ({ root } = await client.send("DOM.getDocument", { depth: -1 }));
  const nodes = (await client.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "body *" })).nodeIds;
  const perFont = new Map();
  for (const nodeId of nodes) {
    let fonts; try { ({ fonts } = await client.send("CSS.getPlatformFontsForNode", { nodeId })); } catch { continue; }
    for (const f of fonts) perFont.set(f.familyName, (perFont.get(f.familyName) ?? 0) + f.glyphCount);
  }
  const ranked = [...perFont].sort((x, y) => y[1] - x[1]);
  const primary = new Set(ranked.slice(0, primaryN).map(([k]) => k));
  const fallback = new Map();   // family -> {chars:Set, glyphs}
  for (const { ch, fam } of charFont) {
    if (fam === "(none)" || primary.has(fam)) continue;
    const e = fallback.get(fam) ?? { chars: new Set(), glyphs: perFont.get(fam) ?? 0 }; e.chars.add(ch); fallback.set(fam, e);
  }

  /* ---------- verdicts ---------- */
  const bad = [];
  const keys = (o) => Object.keys(o);
  const list = (o) => keys(o).sort((a, b) => parseFloat(a) - parseFloat(b)).map((k) => `${k} (x${o[k].length})`).join(", ");

  const families = new Set(); for (const s of symbolFont.values()) for (const f of s) families.add(f);
  const emoji = [...families].filter((f) => /emoji/i.test(f));
  if (families.size > 1) bad.push(`symbols: ${families.size} fonts draw the icon characters: ${[...symbolFont].map(([c, f]) => `${c} ${[...f].join("+")}`).join("; ")}. Draw icons as one inline svg set, or make one font cover them`);
  else if (emoji.length) bad.push(`symbols: drawn by an emoji font (${emoji.join(", ")}): ${[...symbolFont].map(([c]) => c).join(" ")}`);
  if ([...symbolFont.keys()].some((c) => /[\u{1f300}-\u{1faff}]/u.test(c)) && !bad.some((b) => b.startsWith("symbols:"))) bad.push(`symbols: emoji characters in the text: ${[...symbolFont.keys()].filter((c) => /[\u{1f300}-\u{1faff}]/u.test(c)).join(" ")}`);
  for (const [fam, e] of fallback) bad.push(`fonts: "${fam}" is a fallback (primary: ${[...primary].join(", ")}); it draws ${[...e.chars].slice(0, 16).join(" ")}${e.chars.size > 16 ? " ..." : ""} (${e.chars.size} distinct)`);

  const radii = keys(r.radii);
  if (radii.length > maxRadii) bad.push(`radii: ${radii.length} distinct corner radii (max ${maxRadii}): ${list(r.radii)}`);
  const allowed = new Set([...radii, "full"]);
  const strayRx = keys(r.svgRadii).filter((k) => !allowed.has(k));
  if (strayRx.length) bad.push(`radii: svg corner radii outside the HTML scale (${[...allowed].join(", ")}): ${strayRx.map((k) => `${k} (x${r.svgRadii[k].length})`).join(", ")}`);
  if (keys(r.borders).length > maxBorders) bad.push(`borders: ${keys(r.borders).length} distinct border widths (max ${maxBorders}): ${list(r.borders)}`);
  if (keys(r.strokes).length > maxStrokes) bad.push(`strokes: ${keys(r.strokes).length} distinct svg stroke widths (max ${maxStrokes}): ${list(r.strokes)}`);

  const withShadow = r.panels.filter((p) => p.shadow !== "none"), without = r.panels.filter((p) => p.shadow === "none");
  if (withShadow.length && without.length) {
    const names = (a) => [...new Set(a.map((p) => p.label))].slice(0, 5).join(", ");
    bad.push(`shadows: ${withShadow.length} panel${withShadow.length > 1 ? "s" : ""} have a shadow (${names(withShadow)}), ${without.length} do not (${names(without)}): all or none`);
  } else if (new Set(withShadow.map((p) => p.shadow)).size > 1) bad.push(`shadows: ${new Set(withShadow.map((p) => p.shadow)).size} different shadows on panels`);
  for (const [role, g] of Object.entries(r.roles)) {
    if (keys(g.radii).length > 1) bad.push(`roles: elements with ${roleAttr}="${role}" have ${keys(g.radii).length} different radii: ${list(g.radii)}`);
    if (keys(g.shadows).length > 1) bad.push(`roles: elements with ${roleAttr}="${role}" differ in shadow`);
  }

  if (r.svgScales.length) {
    const sc = r.svgScales.map((s) => s.scale), lo = Math.min(...sc), hi = Math.max(...sc);
    const pinned = svgScale !== "equal" ? Number(svgScale) : null;
    const detail = r.svgScales.map((s) => `#${s.i} ${s.scale}`).join(", ");
    if (pinned != null ? sc.some((v) => Math.abs(v - pinned) > tol) : hi - lo > tol) bad.push(`svg scale: ${pinned != null ? `not all ${pinned}` : "illustrations are drawn at different scales"} (${detail}); a label of the same size should look the same in every figure`);
  }
  if (r.tables.length > 1 && Math.max(...r.tables) - Math.min(...r.tables) > 1) bad.push(`tables: first column widths differ across tables (${r.tables.join("px, ")}px)`);

  const t = r.text;
  if (t.ellipsis.unicode && t.ellipsis.dots) bad.push(`text: two ellipsis forms, "…" x${t.ellipsis.unicode} and "..." x${t.ellipsis.dots}`);
  const q = Object.entries(t.quotes).filter(([, n]) => n > 0).map(([k]) => k);
  if (q.length > 1) bad.push(`text: mixed quote marks (${q.map((k) => `${k} x${t.quotes[k]}`).join(", ")})`);
  if (t.arrows.unicode && t.arrows.ascii) bad.push(`text: two arrow forms, "→" x${t.arrows.unicode} and "->" x${t.arrows.ascii}`);
  for (const c of t.casing) bad.push(`text: "${c.word}" is written ${Object.keys(c.forms).join(" and ")}`);
  const d = r.doc;
  if (!d.lang) bad.push("document: <html> has no lang attribute");
  if (!d.title.trim()) bad.push("document: <title> is empty");
  else if (d.cjkShare >= 0.3 && !d.titleHasCjk) bad.push(`document: the page is mostly CJK text but the <title> is not ("${d.title}")`);
  else if (d.cjkShare < 0.05 && d.titleHasCjk) bad.push(`document: the page is Latin text but the <title> is CJK ("${d.title}")`);

  console.log(`consistency: radii ${radii.length} | svg radii ${keys(r.svgRadii).length} | borders ${keys(r.borders).length} | strokes ${keys(r.strokes).length} | symbol fonts ${families.size} | fallback fonts ${fallback.size} | svg scales ${[...new Set(r.svgScales.map((s) => s.scale))].length} | panels with shadow ${withShadow.length}/${r.panels.length}`);
  if (r.fill.length) console.log(`sheet fill (information, not a rule): ${r.fill.join("% ")}%`);
  for (const b of bad) console.log("CONSISTENCY " + b);
  console.log(bad.length ? `consistency check: ${bad.length} violation${bad.length > 1 ? "s" : ""}` : "consistency check: pass");
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ ...r, symbolFonts: Object.fromEntries([...symbolFont].map(([k, v]) => [k, [...v]])), fallback: Object.fromEntries(fallback), violations: bad }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.error("consistency check: runtime error:", e.message.split("\n")[0]); process.exitCode = 2; }
finally { await browser?.close(); }
