#!/usr/bin/env node
/* Spacing and type lint: spacing comes from the 4px token scale; line-height and font-size come from tokens.
   Usage:  node spacing-lint.mjs [--strict] [--no-type] [--ignore FILE] [--tokens tokens.css] <file|dir>...
   tokens.css is never linted; it is read for token values (beside each target, or via --tokens).
   Scans .css files, <style> blocks and style="" attributes in .html files.
   Spacing (margin, padding, gap, inset, top/right/bottom/left offsets):
     fails on a px/rem value not a multiple of 4px (rem = 16px), or a var(--x) that is neither a known
     token nor a custom property defined in the scanned files whose own value passes these rules.
     --strict: also fails on any raw non-zero length (use var(--space-*)).
   Type (unless --no-type):
     line-height (and the "/x" part of the font shorthand) must be var(--lh-*) or inherit, and the token
     must resolve to px on the 4px grid. font-size (and the font shorthand size) must be var(--fs-*) or inherit.
     --loose-type: any token name or a raw value is fine, as long as line-height resolves to px on the 4px
     grid (unitless ratios, em, % and normal still fail) and font-size is a whole px or rem value.
   Escape hatch: a same-line comment containing "px-ok" (say why).
   Exit: 0 = clean, 1 = violations, 2 = usage error. */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const typeRules = !args.includes("--no-type");
const looseType = args.includes("--loose-type");
const ignore = new Set(["tokens.css"]);
const targets = [];
const tokenFiles = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--strict" || args[i] === "--no-type" || args[i] === "--loose-type") continue;
  if (args[i] === "--ignore") { ignore.add(args[++i]); continue; }
  if (args[i] === "--tokens") { tokenFiles.push(args[++i]); continue; }
  targets.push(args[i]);
}
if (!targets.length) { console.error("usage: node spacing-lint.mjs [--strict] [--no-type] [--ignore FILE] <file|dir>..."); process.exit(2); }

const PROP = /(?:^|[;{\s"'])((?:margin|padding|gap|row-gap|column-gap|inset)(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?|top|right|bottom|left|line-height|font-size|font)\s*:\s*([^;}"]+)/g;
const POSITIONAL = new Set(["top", "right", "bottom", "left"]);
const LEN = /(-?\d*\.?\d+)(px|rem)\b/g;
const VAR = /var\(\s*(--[\w-]+)/g;
const TOKEN = /^--(space-|popover-offset|dialog-pad|gutter|page-pad|hairline|control-|content-col|icon-|sidebar-)/;

const files = [];
const walk = (p) => {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const e of fs.readdirSync(p)) if (e !== "node_modules" && !e.startsWith(".")) walk(path.join(p, e)); }
  else if (/\.(css|html?)$/i.test(p) && !ignore.has(path.basename(p))) files.push(p);
};
for (const t of targets) walk(t);

// custom properties defined anywhere scanned, plus tokens.css files that were skipped
const defs = new Map();
const defFiles = [...files, ...tokenFiles];
for (const t of targets) { const d = fs.statSync(t).isDirectory() ? t : path.dirname(t); const tk = path.join(d, "tokens.css"); if (fs.existsSync(tk)) defFiles.push(tk); }
for (const file of defFiles) for (const m of fs.readFileSync(file, "utf8").matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) defs.set(m[1], m[2].trim());

function spacingProblems(value, seen = new Set()) {
  const problems = [];
  for (const [, num, unit] of value.matchAll(LEN)) {
    const px = Math.abs(parseFloat(num) * (unit === "rem" ? 16 : 1));
    if (px === 0) continue;
    if (px % 4 !== 0) problems.push(`${num}${unit} not on 4px scale`);
    else if (strict && !seen.size) problems.push(`raw ${num}${unit}; use var(--space-*)`);
  }
  for (const [, name] of value.matchAll(VAR)) {
    if (seen.has(name)) continue;
    if (!defs.has(name)) { if (!TOKEN.test(name)) problems.push(`${name} is not a spacing token`); continue; }
    if (spacingProblems(defs.get(name), new Set([...seen, name])).length) problems.push(`${name} resolves off the 4px scale`);
  }
  return problems;
}

function resolve(v) {
  const seen = new Set();
  while (/^var\(/.test(v) && !seen.has(v)) { seen.add(v); const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/); v = defs.get(m[1]) ?? m[2]?.trim() ?? null; if (v == null) return null; }
  return v;
}
function lineHeightProblems(value) {
  const v = value.trim();
  if (/^(inherit|initial|unset)$/.test(v)) return [];
  if (looseType) {
    const r = resolve(v);
    if (r == null) return [`${v} is not defined`];
    const px = r.match(/^(\d*\.?\d+)px$/);
    if (!px) return [`line-height ${v}${r !== v ? " = " + r : ""} is not px on the 4px grid`];
    return parseFloat(px[1]) % 4 ? [`line-height ${r} is not a multiple of 4px`] : [];
  }
  const m = v.match(/^var\(\s*(--[\w-]+)/);
  if (!m || !/^--lh-/.test(m[1])) return [`line-height "${v}" is not a var(--lh-*) token`];
  let def = defs.get(m[1]); const seen = new Set();
  while (def && /^var\(/.test(def) && !seen.has(def)) { seen.add(def); def = defs.get(def.match(/--[\w-]+/)[0]); }
  if (def == null) return [`${m[1]} is not defined`];
  const px = def.match(/^(\d*\.?\d+)px$/);
  if (!px) return [`${m[1]}: ${def} is not px; line-heights sit on a 4px grid in px`];
  if (parseFloat(px[1]) % 4 !== 0) return [`${m[1]}: ${def} is not a multiple of 4px`];
  return [];
}
function fontSizeProblems(value) {
  const v = value.trim();
  if (looseType) {
    const r = resolve(v);
    if (r == null) return [`${v} is not defined`];
    const m = r.match(/^(\d*\.?\d+)(px|rem)$/);
    if (!m) return /^(inherit|initial|unset)$/.test(r) ? [] : [`font-size ${v}${r !== v ? " = " + r : ""} is not a px or rem value`];
    const px = parseFloat(m[1]) * (m[2] === "rem" ? 16 : 1);
    return Number.isInteger(Math.round(px * 100) / 100) && px % 1 === 0 ? [] : [`font-size ${r} is not a whole px`];
  }
  if (/^(inherit|initial|unset)$/.test(v) || /^var\(\s*--fs-/.test(v)) return [];
  return [`font-size "${v}" is not a var(--fs-*) token`];
}
function fontShorthandProblems(value) {
  // font: <style> <weight> <size>[/<line-height>] <family>
  if (/^\s*(inherit|initial|unset)\s*$/.test(value)) return [];
  const m = value.match(/(var\([^)]*\)|[\d.]+(?:px|rem|em|%)|[a-z-]+)\s*\/\s*(var\([^)]*\)|[\d.]+(?:px|rem|em|%)?|normal)/);
  if (!m) return looseType ? ["font shorthand without a line-height; set line-height in px on the 4px grid"] : ["font shorthand without size/line-height tokens; write font-size and line-height tokens"];
  return [...fontSizeProblems(m[1]), ...lineHeightProblems(m[2])];
}

const bad = [];
let checked = 0;
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const isHtml = /\.html?$/i.test(file);
  let inStyle = !isHtml;
  lines.forEach((line, idx) => {
    if (isHtml && /<style[\s>]/i.test(line)) inStyle = true;
    const scan = inStyle || (isHtml && /style\s*=/.test(line));
    if (scan && !line.includes("px-ok")) {
      for (const m of line.matchAll(PROP)) {
        const [, prop, value] = m;
        if (POSITIONAL.has(prop) && !/calc\(/.test(value) && !/px|rem/.test(value)) continue;
        let problems;
        if (prop === "line-height") { if (!typeRules) continue; problems = lineHeightProblems(value); }
        else if (prop === "font-size") { if (!typeRules) continue; problems = fontSizeProblems(value); }
        else if (prop === "font") { if (!typeRules) continue; problems = fontShorthandProblems(value); }
        else problems = spacingProblems(value);
        checked++;
        if (problems.length) bad.push(`${file}:${idx + 1}: ${prop}: ${value.trim()}  -> ${problems.join("; ")}`);
      }
    }
    if (isHtml && /<\/style>/i.test(line)) inStyle = false;
  });
}
for (const b of bad) console.log("SPACING " + b);
console.log(bad.length ? `spacing lint: ${bad.length} violations (${checked} declarations, ${files.length} files)` : `spacing lint: pass (${checked} declarations, ${files.length} files)`);
process.exit(bad.length ? 1 : 0);
