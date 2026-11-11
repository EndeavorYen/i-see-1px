#!/usr/bin/env node
/* Dogfood check for the Pages site: the skill's own spacing lint and alignment guard on docs/index.html.
   Usage:  node scripts/site-check.mjs [--screenshots DIR]
   Needs:  npm i --no-save playwright-core   (set CHROME_PATH if Playwright has no bundled Chromium)
   Serves docs/ on 127.0.0.1:4173 so the demo iframes are same-origin, then runs:
     node templates/spacing-lint.mjs --tokens docs/tokens.css docs/site.css docs/index.html
     node templates/alignment-guard.mjs scripts/site.align.json
   Exit: 0 = both pass, 1 = a failure, 2 = setup error. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".csv": "text/csv", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^[/\\]+/, "");
  let file = path.join(docs, p);
  if (!file.startsWith(docs)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((ok, bad) => server.listen(4173, "127.0.0.1", ok).on("error", bad)).catch((e) => { console.error("site check: cannot listen on 4173:", e.message); process.exit(2); });

const run = (args) => spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" }).status;
const shots = process.argv.indexOf("--screenshots");
const lint = run(["templates/spacing-lint.mjs", "--tokens", "docs/tokens.css", "docs/site.css", "docs/index.html"]);
const guardArgs = ["templates/alignment-guard.mjs", "scripts/site.align.json"];
if (shots > 0) guardArgs.push("--screenshots", process.argv[shots + 1]);
const guard = await new Promise((ok) => {
  // run the guard asynchronously so this process keeps serving files
  import("node:child_process").then(({ spawn }) => spawn(process.execPath, guardArgs, { cwd: root, stdio: "inherit" }).on("exit", ok));
});
server.close();
console.log(`site check: lint ${lint === 0 ? "pass" : "FAIL"}, guard ${guard === 0 ? "pass" : "FAIL"}`);
process.exit(lint === 0 && guard === 0 ? 0 : 1);
