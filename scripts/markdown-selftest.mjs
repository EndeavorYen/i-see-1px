#!/usr/bin/env node
/* Self-test for the Markdown path: templates/markdown-check.mjs, markdown-preview.mjs and the guard on a rendered document.
   Usage:  node scripts/markdown-selftest.mjs
   Needs:  npm i --no-save playwright-core marked   (set CHROME_PATH if Playwright has no bundled Chromium)
   1. docs/demo/markdown/bad.md must trip every structure rule in the list below, and good.md must pass.
   2. good.md is rendered with markdown-preview.mjs and measured with the markdown example config: the guard must pass.
      Its tables mix CJK text, Latin text and inline code in one row (rendered with lang=zh-Hant, so CJK falls back to a
      different font than Latin). That is what the guard's baseline probe is for: a glyph-rect baseline reads those rows
      1px apart on many Windows setups even though the real baselines match.
   Exit: 0 = every expectation holds, 1 = one does not, 2 = setup error. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (args, cwd = root) => spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
let bad = 0;
const expect = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) bad++; };

// 1) structure rules
const MUST_TRIP = [
  "a code fence is never closed", "expected exactly one H1", "heading level skipped", "is an empty section", "matches no heading",
  "empty header cell", "columns, the header has", "merges into the paragraph above", "trailing whitespace", "tab on line",
  "two or more blank lines", "must end with exactly one newline",
];
const b = run(["templates/markdown-check.mjs", "docs/demo/markdown/bad.md"]);
expect(b.status === 1, "bad.md fails the markdown check");
for (const m of MUST_TRIP) expect(b.stdout.includes(m), `bad.md trips: ${m}`);
const g = run(["templates/markdown-check.mjs", "docs/demo/markdown/good.md"]);
expect(g.status === 0, "good.md passes the markdown check");

// 2) rendered document through the guard
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "isee-md-"));
const p = run(["templates/markdown-preview.mjs", "docs/demo/markdown/good.md", "--out", path.join(tmp, "preview"), "--lang", "zh-Hant"]);
if (p.status !== 0) { console.error(p.stderr || p.stdout); process.exit(2); }
fs.copyFileSync(path.join(root, "templates/align.config.markdown.example.json"), path.join(tmp, "align.config.json"));
const guard = run([path.join(root, "templates/alignment-guard.mjs"), "align.config.json"], tmp);
if (guard.status === 2) { console.error(guard.stderr || guard.stdout); process.exit(2); }
console.log(guard.stdout.trim().split("\n").slice(-3).join("\n"));
expect(guard.status === 0, "good.md rendered: the guard passes at every viewport");
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`markdown selftest: ${bad ? "FAIL" : "pass"}`);
process.exit(bad ? 1 : 0);
