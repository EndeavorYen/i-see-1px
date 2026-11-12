#!/usr/bin/env node
/* Self-test for templates/typography-check.mjs: single-line labels are not wrapped prose, real wraps still are.
   Usage:  node scripts/typography-selftest.mjs
   Needs:  npm i --no-save playwright-core   (set CHROME_PATH if Playwright has no bundled Chromium)
   Case "issue-2" is the repro of issue #2: buttons, a table cell and a padded heading are one line each, though their boxes
   are taller than one line (padding, a fixed height, flex items are blockified). Only the paragraph really wraps.
   Case "real-wraps" keeps the check honest the other way: a block label that wraps and a cell with a <br> still count as
   several lines, and a paragraph with an inline code chip is one line. Inline-block labels stay outside the prose rules, as before.
   Exit: 0 = every expectation holds, 1 = one does not, 2 = setup error. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "isee-typo-"));

const CASES = {
  "issue-2": {
    html: `<!doctype html><html lang="zh-Hant"><meta charset="utf-8">
<style>body{font:14px/20px sans-serif;margin:0;padding:16px}
button{font:inherit;height:32px;line-height:20px;padding:0 16px}
td{height:40px;line-height:20px;padding:0 12px}
h2{font-size:16px;line-height:24px;padding-top:12px;margin:0}</style>
<div style="display:flex;gap:8px"><button data-qa="btn-a">提交任務</button><button data-qa="btn-b">取消</button></div>
<table><tr><td data-qa="cell">第 7 位・約 40 分</td></tr></table>
<h2 data-qa="heading">資料狀態</h2>
<p data-qa="prose" style="max-width:20em">這是一段真的會換行的中文段落，用來確認真正的多行文字仍然會被檢查到，而且行高不足時應該要報錯。</p>
</html>`,
    args: ["--ratio", "1.14,1.42"],
    leading: ["prose"], measure: []
  },
  "real-wraps": {
    html: `<!doctype html><html lang="zh-Hant"><meta charset="utf-8">
<style>body{font:14px/20px sans-serif;margin:0;padding:16px}
td{line-height:20px;padding:0 12px}
code{padding:6px 4px;background:#eee}</style>
<div data-qa="wrapped-label" style="width:64px">這是一個很長的標籤文字</div>
<table><tr><td data-qa="br-cell">第一行<br>第二行</td></tr></table>
<p data-qa="chip-line">請用 <code>mer status</code> 開始。</p>
</html>`,
    args: ["--ratio", "1.14,1.42"],
    leading: ["br-cell", "wrapped-label"], measure: []   // chip-line is one line: not reported
  }
};

const fails = [];
for (const [name, c] of Object.entries(CASES)) {
  const file = path.join(tmp, `${name}.html`), json = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, c.html);
  const r = spawnSync(process.execPath, ["templates/typography-check.mjs", file, ...c.args, "--json-out", json], { cwd: root, encoding: "utf8" });
  if (!fs.existsSync(json)) { console.error(`typography selftest: setup error in ${name}: ${(r.stderr || r.stdout).trim().split("\n")[0]}`); process.exit(2); }
  const v = JSON.parse(fs.readFileSync(json, "utf8")).violations;
  const labels = (kind) => v.filter((x) => x.startsWith(kind + ":")).map((x) => x.slice(kind.length + 2).split(":")[0]).sort();
  const got = { leading: labels("leading"), measure: labels("measure") };
  for (const kind of ["leading", "measure"]) {
    const want = [...c[kind]].sort();
    const ok = JSON.stringify(got[kind]) === JSON.stringify(want);
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${kind} reported on [${got[kind].join(", ")}], expected [${want.join(", ")}]`);
    if (!ok) fails.push(`${name}: ${kind}`);
  }
}
console.log(fails.length ? `typography selftest: ${fails.length} failed` : "typography selftest: pass");
process.exit(fails.length ? 1 : 0);
