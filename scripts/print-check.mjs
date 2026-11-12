#!/usr/bin/env node
/* Dogfood check for the A4 print example in docs/demo/print: every tool in templates/ runs on both pages.
   Usage:  node scripts/print-check.mjs [--sheets DIR]
           --sheets DIR also writes the before/after sheets (one image per page, plus before-after.pdf) to DIR
   Needs:  npm i --no-save playwright-core   (set CHROME_PATH if Playwright has no bundled Chromium)
   Runs on without/ and with/:
     templates/spacing-lint.mjs, alignment-guard.mjs, palette-check.mjs, typography-check.mjs
   Prints one table (the numbers in the README) and passes when
     - the "with" page is clean in all four tools, and
     - the "without" page fails each of them (a check that cannot fail proves nothing).
   Exit: 0 = both hold, 1 = one does not, 2 = setup error. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demo = path.join(root, "docs/demo/print");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "isee-print-"));
const node = (args) => spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });

function measure(side) {
  const page = path.join(demo, side, "index.html");
  const out = {};
  // 1. spacing lint (tokens from the print preset)
  const lint = node(["templates/spacing-lint.mjs", "--tokens", path.join(demo, "with/tokens.css"), page]);
  out.lint = Number(lint.stdout.match(/(\d+) violations/)?.[1] ?? 0);
  // 2. alignment guard: the config points at with/, so write a copy aimed at this page
  const cfg = JSON.parse(fs.readFileSync(path.join(demo, "align.config.json"), "utf8"));
  cfg.pages[0].url = pathToFileUrl(page);
  delete cfg.screenshots;
  const cfgFile = path.join(tmp, `${side}.align.json`), guardJson = path.join(tmp, `${side}.guard.json`);
  fs.writeFileSync(cfgFile, JSON.stringify(cfg));
  const g = node(["templates/alignment-guard.mjs", cfgFile, "--json-out", guardJson]);
  if (!fs.existsSync(guardJson)) throw new Error(`guard did not run on ${side}: ${g.stderr.trim().split("\n")[0]}`);
  const gj = JSON.parse(fs.readFileSync(guardJson, "utf8"));
  out.guardRun = gj.checksRun; out.guardFailed = gj.checksFailed;
  out.stubs = gj.issues.filter((i) => /stub line/.test(i.check)).length;
  // 3. palette
  const palJson = path.join(tmp, `${side}.palette.json`);
  node(["templates/palette-check.mjs", page, "--json-out", palJson]);
  const pj = JSON.parse(fs.readFileSync(palJson, "utf8"));
  out.colours = pj.colors.length;
  out.outside = Object.keys(pj.families).filter((f) => !["blue", "gray", "red", "green"].includes(f)).length;
  out.lowContrast = pj.low.length;
  // 4. typography
  const tyJson = path.join(tmp, `${side}.type.json`);
  node(["templates/typography-check.mjs", page, "--json-out", tyJson]);
  const tj = JSON.parse(fs.readFileSync(tyJson, "utf8"));
  out.sizes = Object.keys(tj.sizes).length;
  out.typography = tj.violations.length;
  return out;
}
function pathToFileUrl(p) { return "file:///" + p.replace(/\\/g, "/").replace(/^\//, ""); }

let without, withSkill;
try { without = measure("without"); withSkill = measure("with"); }
catch (e) { console.error("print check: setup error:", e.message); process.exit(2); }

const rows = [
  ["Spacing lint violations", "lint"],
  ["Guard checks failing (of " + withSkill.guardRun + ")", "guardFailed"],
  ["Stub last lines", "stubs"],
  ["Font sizes in use", "sizes"],
  ["Typography violations", "typography"],
  ["Colours", "colours"],
  ["Hue families outside the palette", "outside"],
  ["Text runs below WCAG contrast", "lowContrast"]
];
const w = Math.max(...rows.map((r) => r[0].length));
console.log(`${"Measured on the rendered page".padEnd(w)} | without | with`);
for (const [label, k] of rows) console.log(`${label.padEnd(w)} | ${String(without[k]).padStart(7)} | ${String(withSkill[k]).padStart(4)}`);

// --sheets DIR: also write the before/after sheets (templates/compare-sheets.mjs), the side-by-side view of every page
const sheetsAt = process.argv.indexOf("--sheets");
if (sheetsAt > 0) {
  const dir = process.argv[sheetsAt + 1];
  if (!dir) { console.error("print check: --sheets needs a directory"); process.exit(2); }
  const r = node(["templates/compare-sheets.mjs", path.join(demo, "without/index.html"), path.join(demo, "with/index.html"), "--out", path.resolve(dir), "--labels", "Without the skill,With the skill"]);
  process.stdout.write(r.stdout);
  if (r.status !== 0) { console.error(r.stderr); process.exit(2); }
}

const mustBeClean = ["lint", "guardFailed", "stubs", "typography", "outside", "lowContrast"];
const mustFail = ["lint", "guardFailed", "typography", "outside"]; // each tool needs a defect on the "without" page
const fails = [];
for (const k of mustBeClean) if (withSkill[k] !== 0) fails.push(`with: ${k} is ${withSkill[k]}, expected 0`);
for (const k of mustFail) if (!(without[k] > 0)) fails.push(`without: ${k} is 0, so that check cannot be shown to bite`);
if (!(without.stubs > 0)) fails.push("without: no stub last line, the stub check cannot be shown to bite");
if (!(withSkill.sizes <= 6)) fails.push(`with: ${withSkill.sizes} font sizes, expected at most 6`);
console.log(fails.length ? fails.map((f) => "FAIL " + f).join("\n") + `\nprint check: ${fails.length} failed` : "print check: pass (with is clean, without fails every tool)");
process.exit(fails.length ? 1 : 0);
