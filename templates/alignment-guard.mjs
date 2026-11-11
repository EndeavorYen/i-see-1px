#!/usr/bin/env node
/* Alignment guard: measure getBoundingClientRect in a real browser and fail on any misalignment.
   Usage:  node alignment-guard.mjs align.config.json [--screenshots DIR] [--json-out FILE]
   Needs:  npm i --no-save playwright-core   (uses CHROME_PATH, else Playwright's bundled Chromium)
   Exit:   0 = pass, 1 = misalignments, 2 = config or runtime error.
   Config: see align.config.example.json. A url without "://" is a file path relative to the config.
   Every page runs at every viewport (at least two, unless "allowSingleViewport": true).
   A check may set "viewports": [1280] to run only at those viewport widths ("widths" is a deprecated alias,
   except on "size" checks, where "width"/"height" are the element's allowed size).
   Keys starting with "_" (e.g. "_section", "_note") are ignored, so the example config can carry notes.
   Pages with "actions" (an opened popover or dialog) are screenshotted at viewport size; others full page.
   Prints the browser version and the fonts the page actually rendered with (for the report). */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const cfgPath = args.find((a) => a.endsWith(".json") && args[args.indexOf(a) - 1] !== "--json-out");
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (!cfgPath) { console.error("usage: node alignment-guard.mjs align.config.json [--screenshots DIR] [--json-out FILE]"); process.exit(2); }

// Resolve Playwright from the project you run in first, then from beside this script.
async function loadChromium() {
  const req = createRequire(path.join(process.cwd(), "noop.js"));
  for (const name of ["playwright-core", "playwright"]) {
    try { const m = await import(pathToFileURL(req.resolve(name)).href); return m.chromium ?? m.default.chromium; } catch {}
    try { return (await import(name)).chromium; } catch {}
  }
  console.error("alignment guard: needs playwright-core (npm i --no-save playwright-core)");
  process.exit(2);
}

const cfgDir = path.dirname(path.resolve(cfgPath));
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const TOL = cfg.tolerance ?? 0.5;
const viewports = cfg.viewports ?? [];
if (viewports.length < 2 && !(cfg.allowSingleViewport ?? cfg.allowSingleWidth)) {
  console.error("alignment guard: config error: list every breakpoint in \"viewports\" (at least 2), or set \"allowSingleViewport\": true for a fixed-width page");
  process.exit(2);
}
const shotDir = flag("--screenshots") ?? (cfg.screenshots ? path.resolve(cfgDir, cfg.screenshots) : null);
const jsonOut = flag("--json-out");
const toUrl = (u) => (u.includes("://") ? u : pathToFileURL(path.resolve(cfgDir, u)).href);
const chromium = await loadChromium();

const issues = [];
const runs = [];          // one entry per check instance (check x page x width)
let current = null;
const fail = (where, check, msg, detail = "") => { issues.push({ where, check, msg, detail }); if (current) current.failed = true; };
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

/* ---------- in-page measurement ---------- */
function measureInPage([sels, rowOf]) {
  const ctx = document.createElement("canvas").getContext("2d");
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || el.closest("[hidden]")) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };
  const metrics = (el) => {
    const s = getComputedStyle(el);
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const m = ctx.measureText("Hg");
    return { a: m.fontBoundingBoxAscent, d: m.fontBoundingBoxDescent };
  };
  const textNodes = (el) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent.trim() && visible(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const out = []; let n; while ((n = walk.nextNode())) out.push(n); return out;
  };
  const charRect = (node, idx) => { const r = document.createRange(); r.setStart(node, idx); r.setEnd(node, idx + 1); return r.getClientRects()[0]; };
  const text = (el) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      const top = r.top + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop);
      const h = r.height - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth) - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
      const { a, d } = metrics(el);
      return { baseline: top + (h - (a + d)) / 2 + a, textLeft: r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft),
        textRight: r.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight) };
    }
    const nodes = textNodes(el);
    if (!nodes.length) return { baseline: null, textLeft: null, textRight: null };
    const first = nodes[0], last = nodes[nodes.length - 1];
    const fr = charRect(first, first.textContent.search(/\S/));
    const lt = last.textContent.replace(/\s+$/, "");
    const lr = charRect(last, lt.length - 1);
    if (!fr || !lr) return { baseline: null, textLeft: null, textRight: null };
    const { a, d } = metrics(first.parentElement);
    return { baseline: fr.top + (fr.height - (a + d)) / 2 + a, textLeft: fr.left, textRight: lr.right };
  };
  const label = (el) => {
    const qa = el.getAttribute("data-qa");
    if (qa) return `[data-qa=${qa}]`;
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    return s;
  };
  const out = []; const seen = new Set();
  for (const sel of sels) {
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el) || seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      const o = rowOf && el.closest(rowOf); const k = (o || el).getBoundingClientRect();
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName);
      out.push({ sel, tag: el.tagName, label: label(el), left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        width: r.width, height: r.height, centerX: r.left + r.width / 2, centerY: r.top + r.height / 2, ...text(el),
        span: { top: k.top, bottom: k.bottom, left: k.left, right: k.right },
        ownText, fontSize: parseFloat(s.fontSize), lineHeight: s.lineHeight,
        clipX: el.clientWidth > 0 ? el.scrollWidth - el.clientWidth : 0,
        slackX: (() => {
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return null;
          const rg = document.createRange(); rg.selectNodeContents(el); const u = rg.getBoundingClientRect();
          const cw = r.width - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth) - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
          return u.width > 0 ? cw - u.width : null;
        })(),
        style: { "font-variant-numeric": s.fontVariantNumeric, "text-align": s.textAlign, "white-space": s.whiteSpace },
        vw: document.documentElement.clientWidth, vh: window.innerHeight });
    }
  }
  return out;
}

function centerPairs([[outerSel, innerSel], axis]) {
  const res = [];
  for (const outer of document.querySelectorAll(outerSel)) {
    const inner = outer.querySelector(innerSel);
    if (!inner) continue;
    const a = outer.getBoundingClientRect(), b = inner.getBoundingClientRect();
    if (a.width < 1 || b.width < 1) continue;
    const s = getComputedStyle(outer);
    const oc = axis === "x" ? a.left + parseFloat(s.borderLeftWidth) + (a.width - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth)) / 2
                            : a.top + parseFloat(s.borderTopWidth) + (a.height - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth)) / 2;
    const ic = axis === "x" ? b.left + b.width / 2 : b.top + b.height / 2;
    res.push({ label: outer.getAttribute("data-qa") || outer.tagName.toLowerCase(), delta: ic - oc });
  }
  return res;
}

/* ---------- checks ---------- */
function groupBy(items, mode) {
  if (!mode) return [items];
  const [lo, hi] = mode === "row" ? ["top", "bottom"] : ["left", "right"];
  const sorted = [...items].sort((p, q) => p.span[lo] - q.span[lo]);
  const groups = []; let end = -Infinity;
  for (const it of sorted) {
    if (groups.length && it.span[lo] < end - TOL) { groups[groups.length - 1].push(it); end = Math.max(end, it.span[hi]); }
    else { groups.push([it]); end = it.span[hi]; }
  }
  return groups;
}

function spreadCheck(where, chk, items) {
  const groups = groupBy(items, chk.groupBy);
  groups.forEach((g, gi) => {
    if (g.length < 2) return;
    const tag = groups.length > 1 ? ` (group ${gi + 1})` : "";
    for (const key of chk.match ?? ["top", "height"]) {
      const vals = g.map((it) => it[key]);
      if (vals.some((v) => v == null)) { fail(where, chk.name, `${key}: no text to measure`, g.filter((it) => it[key] == null).map((it) => it.label).join(", ")); continue; }
      const spread = Math.max(...vals) - Math.min(...vals);
      if (spread > TOL) fail(where, chk.name + tag, `${key} spread ${f1(spread)}px > ${TOL}px`, g.map((it) => `${it.label}=${f1(it[key])}`).join(", "));
    }
  });
}

function gapCheck(where, chk, items) {
  const axis = chk.axis ?? "x";
  const [start, end] = axis === "x" ? ["left", "right"] : ["top", "bottom"];
  const groups = groupBy(items, chk.groupBy ?? (axis === "x" ? "row" : "column"));
  groups.forEach((g, gi) => {
    const s = [...g].sort((p, q) => p[start] - q[start]);
    const gaps = s.slice(1).map((it, i) => it[start] - s[i][end]);
    if (!gaps.length) return;
    const tag = groups.length > 1 ? ` (group ${gi + 1})` : "";
    const spread = Math.max(...gaps) - Math.min(...gaps);
    if (spread > TOL) fail(where, chk.name + tag, `unequal gaps, spread ${f1(spread)}px`, gaps.map(f1).join(", "));
    if (chk.scale) for (const gp of gaps) if (Math.abs(gp - Math.round(gp / chk.scale) * chk.scale) > TOL) { fail(where, chk.name + tag, `gap ${f1(gp)}px not on the ${chk.scale}px scale`); break; }
    if (chk.equals != null) for (const gp of gaps) if (Math.abs(gp - chk.equals) > TOL) { fail(where, chk.name + tag, `gap ${f1(gp)}px != ${chk.equals}px`); break; }
  });
}

const onScale = (v, scale) => Math.abs(v - Math.round(v / scale) * scale) <= TOL;

function typeCheck(where, chk, items) {
  const grid = chk.grid ?? 4;
  if (chk.maxDistinct) {
    const sizes = [...new Set(items.filter((i) => i.ownText).map((i) => Math.round(i.fontSize * 10) / 10))].sort((a, b) => a - b);
    if (sizes.length > chk.maxDistinct) fail(where, chk.name, `${sizes.length} font sizes in use (max ${chk.maxDistinct}): ${sizes.join(", ")}`);
  }
  for (const it of items.filter((i) => i.ownText)) {
    if (chk.fontSizes && !chk.fontSizes.some((f) => Math.abs(f - it.fontSize) <= TOL)) fail(where, chk.name, `font-size ${f1(it.fontSize)}px not in type scale [${chk.fontSizes.join(", ")}]`, it.label);
    if (it.tag === "SELECT") continue; // Chromium ignores line-height on <select>; its height is checked by "size"
    if (it.lineHeight === "normal") { fail(where, chk.name, "line-height is normal (font-dependent); set a token", it.label); continue; }
    const lh = parseFloat(it.lineHeight);
    if (!onScale(lh, grid)) fail(where, chk.name, `line-height ${f1(lh)}px not a multiple of ${grid}px`, it.label);
    if (chk.lineHeights && !chk.lineHeights.some((v) => Math.abs(v - lh) <= TOL)) fail(where, chk.name, `line-height ${f1(lh)}px not in [${chk.lineHeights.join(", ")}]`, it.label);
  }
}

// A size spec is a number, a list of allowed numbers, or {min, max, step}.
function sizeOk(v, spec) {
  if (spec == null) return true;
  if (typeof spec === "number") return Math.abs(v - spec) <= TOL;
  if (Array.isArray(spec)) return spec.some((x) => Math.abs(v - x) <= TOL);
  if (spec.min != null && v < spec.min - TOL) return false;
  if (spec.max != null && v > spec.max + TOL) return false;
  if (spec.step && !onScale(v, spec.step)) return false;
  return true;
}
const specText = (spec) => (typeof spec === "object" && !Array.isArray(spec) ? JSON.stringify(spec) : String(spec));
function sizeCheck(where, chk, items) {
  for (const it of items) {
    for (const dim of ["height", "width"]) {
      const spec = chk[dim] ?? (Array.isArray(chk[dim + "s"]) ? chk[dim + "s"] : undefined); // "heights"/"widths": legacy lists
      if (!sizeOk(it[dim], spec)) fail(where, chk.name, `${dim} ${f1(it[dim])}px not ${specText(spec)}`, it.label);
    }
    if (chk.square && Math.abs(it.width - it.height) > TOL) fail(where, chk.name, `not square: ${f1(it.width)}x${f1(it.height)}`, it.label);
    if (chk.hug && it.slackX != null && it.slackX > (chk.hugSlack ?? 1)) fail(where, chk.name, `stretched ${f1(it.slackX)}px wider than its content (should hug its label)`, it.label);
  }
  if (chk.equal) for (const dim of [].concat(chk.equal)) {
    const vals = items.map((i) => i[dim]); const sp = Math.max(...vals) - Math.min(...vals);
    if (sp > TOL) fail(where, chk.name, `${dim} differs by ${f1(sp)}px`, items.map((i) => `${i.label}=${f1(i[dim])}`).join(", "));
  }
}

function styleCheck(where, chk, items) {
  for (const it of items) {
    const v = it.style[chk.property] ?? "";
    if (chk.includes && !v.split(/\s+/).includes(chk.includes)) fail(where, chk.name, `${chk.property} is "${v}", needs ${chk.includes}`, it.label);
    if (chk.equals && v !== chk.equals) fail(where, chk.name, `${chk.property} is "${v}", needs ${chk.equals}`, it.label);
  }
}

const pick = (items, end) => {
  if (!items.length) return null;
  if (!end.pick || end.pick === "first") return items[0];
  const by = (x) => x[end.edge];
  return items.reduce((p, q) => ((end.pick === "max" ? by(q) > by(p) : by(q) < by(p)) ? q : p));
};
function distanceCheck(where, chk, a, b) {
  const d = b[chk.to.edge] - a[chk.from.edge];
  const what = `${a.label}.${chk.from.edge} -> ${b.label}.${chk.to.edge}`;
  if (chk.equals != null && Math.abs(d - chk.equals) > TOL) fail(where, chk.name, `distance ${f1(d)}px != ${chk.equals}px`, what);
  if (chk.min != null && d < chk.min - TOL) fail(where, chk.name, `distance ${f1(d)}px < ${chk.min}px`, what);
  if (chk.max != null && d > chk.max + TOL) fail(where, chk.name, `distance ${f1(d)}px > ${chk.max}px`, what);
  if (chk.scale && !onScale(d, chk.scale)) fail(where, chk.name, `distance ${f1(d)}px not on the ${chk.scale}px scale`, what);
}

/* ---------- run ---------- */
let warnedWidths = false;
async function runCheck(page, where, vp, chk) {
  const measure = (sels, rowOf = null) => page.evaluate(measureInPage, [sels, rowOf]);
  if (chk.type === "overflow") {
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > TOL) fail(where, chk.name, `horizontal overflow ${f1(ov)}px`);
    return;
  }
  if (chk.type === "anyOf") {
    // passes when at least one alternative passes; otherwise reports one issue
    const start = issues.length; let ok = false; const msgs = [];
    for (const alt of chk.checks) {
      const before = issues.length;
      await runCheck(page, where, vp, { name: chk.name, ...alt });
      const got = issues.splice(before);
      if (!got.length) { ok = true; break; }
      msgs.push(got[0].msg);
    }
    issues.splice(start);
    if (current) current.failed = false;
    if (!ok) fail(where, chk.name, `no alternative holds: ${msgs.join(" / ")}`);
    return;
  }
  if (chk.type === "center") {
    const res = await page.evaluate(centerPairs, [chk.pairs, chk.axis ?? "y"]);
    if (!res.length) { fail(where, chk.name, "missing: no element pairs matched", chk.pairs.join(" > ")); return; }
    for (const r of res) if (Math.abs(r.delta) > TOL) fail(where, chk.name, `off-centre ${f1(r.delta)}px on ${chk.axis ?? "y"}`, r.label);
    return;
  }
  if (chk.type === "distance") {
    const a = pick(await measure([chk.from.selector]), chk.from); const b = pick(await measure([chk.to.selector]), chk.to);
    if (!a || !b) { fail(where, chk.name, "missing element", !a ? chk.from.selector : chk.to.selector); return; }
    distanceCheck(where, chk, a, b);
    return;
  }
  const items = await measure(chk.selectors, chk.rowOf ?? null);
  if (items.length < (chk.minCount ?? 1)) { fail(where, chk.name, `missing: found ${items.length}, need ${chk.minCount ?? 1}`, chk.selectors.join(", ")); return; }
  if (chk.type === "gaps") gapCheck(where, chk, items);
  else if (chk.type === "row" || chk.type === "column") spreadCheck(where, chk, items);
  else if (chk.type === "type") typeCheck(where, chk, items);
  else if (chk.type === "size") sizeCheck(where, chk, items);
  else if (chk.type === "style") styleCheck(where, chk, items);
  else if (chk.type === "noClip") { for (const it of items) if (it.clipX > TOL) fail(where, chk.name, `content clipped or overflowing by ${f1(it.clipX)}px (wrap it)`, it.label); }
  else if (chk.type === "centered") {
    for (const it of items) {
      if ((chk.axis ?? "x") === "x") { const d = it.left - (it.vw - it.right); if (Math.abs(d) > 2 * TOL) fail(where, chk.name, `not centred: left ${f1(it.left)} right ${f1(it.vw - it.right)}`, it.label); }
      else { const d = it.top - (it.vh - it.bottom); if (Math.abs(d) > 2 * TOL) fail(where, chk.name, `not centred: top ${f1(it.top)} bottom ${f1(it.vh - it.bottom)}`, it.label); }
    }
  }
  else fail(where, chk.name ?? "?", `unknown check type ${chk.type}`);
}

async function fontsUsed(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable"); await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await client.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "body *" });
  const fonts = new Map();
  for (const nodeId of nodeIds.slice(0, 600)) {
    try {
      const { fonts: f } = await client.send("CSS.getPlatformFontsForNode", { nodeId });
      for (const x of f) fonts.set(x.familyName, (fonts.get(x.familyName) ?? 0) + x.glyphCount);
    } catch {}
  }
  await client.detach();
  return [...fonts].sort((p, q) => q[1] - p[1]).map(([name, glyphs]) => `${name} (${glyphs} glyphs)`);
}

let browser; let env = null;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: cfg.colorScheme ?? "light" });
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
  for (const pg of cfg.pages) {
    for (const vp of pg.viewports ?? viewports) {
      const where = `${pg.name}@${vp.width}`;
      await page.setViewportSize(vp);
      await page.goto(toUrl(pg.url), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      for (const act of pg.actions ?? []) {
        if (act.click) await page.click(act.click, { timeout: 3000 });
        if (act.press) await page.keyboard.press(act.press);
        await page.waitForTimeout(act.waitMs ?? 150);
      }
      if (!env) env = { browser: `${browser.browserType().name()} ${browser.version()}`, fonts: await fontsUsed(page).catch(() => ["(unavailable)"]) };
      const full = (pg.screenshot ?? (pg.actions?.length ? "viewport" : "full")) === "full";
      if (shotDir) await page.screenshot({ path: path.join(shotDir, `${pg.name}-${vp.width}.png`), fullPage: full });
      const checks = [...(pg.noOverflow ? [{ type: "overflow", name: "document overflow" }] : []), ...(pg.checks ?? [])];
      for (const chk of checks) {
        let only = chk.viewports;
        if (!only && chk.widths && chk.type !== "size") {
          only = chk.widths;
          if (!warnedWidths) { console.error('alignment guard: note: "widths" on a check is deprecated; use "viewports"'); warnedWidths = true; }
        }
        if (only && !only.includes(vp.width)) continue;
        current = { where, check: chk.name, failed: false }; runs.push(current);
        await runCheck(page, where, vp, chk);
      }
      current = null;
    }
  }
} catch (err) {
  console.error("alignment guard: error:", err.message.split("\n")[0]);
  await browser?.close();
  process.exit(2);
}
await browser.close();

const failedRuns = runs.filter((r) => r.failed).length;
const vpList = viewports.map((v) => v.width).join(", ");
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ tolerance: TOL, viewports: viewports.map((v) => v.width), env, checksRun: runs.length, checksFailed: failedRuns, issues, failed: runs.filter((r) => r.failed) }, null, 2));
for (const i of issues) console.log(`MISALIGN ${i.where} | ${i.check} | ${i.msg}${i.detail ? " | " + i.detail : ""}`);
console.log(`env: ${env?.browser ?? "?"} | fonts: ${(env?.fonts ?? []).join(", ")}`);
console.log(`checks: ${runs.length - failedRuns}/${runs.length} passed at viewports ${vpList}`);
console.log(issues.length ? `alignment guard: ${issues.length} misalignments` : "alignment guard: pass");
process.exit(issues.length ? 1 : 0);
