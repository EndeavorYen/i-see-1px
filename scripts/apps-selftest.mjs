#!/usr/bin/env node
/* Self-test for the apps-and-games additions: actions (eval, hold, waitFor), freshContext, inViewport, hooks,
   snapshot.mjs, the type check skipping svg text, palette-check reading what lies beneath svg text, --artwork,
   the lint accepting round(…, 4px) and not misreading a length after a positional property.
   Usage: node scripts/apps-selftest.mjs   (needs playwright-core; CHROME_PATH if no bundled Chromium) */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const T = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "i-see-1px-apps-"));
const run = (tool, args) => spawnSync("node", [path.join(T, tool), ...args], { encoding: "utf8", cwd: dir });
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failed++; };

// A tiny "game": a start button, a debug hook that sets the screen, a long-press grown-ups' button, a save in
// localStorage, a drawn clock whose hand crosses a number, and a play area that is too tall on the "tall" screen.
fs.writeFileSync(path.join(dir, "game.html"), `<!doctype html><html><head><meta charset="utf-8"><style>
  * { line-height: round(nearest, 1.35em, 4px); }
  body { margin: 0; font: 16px/24px sans-serif; color: #18202E; background: #EAF1F8; }
  button { height: 48px; min-width: 48px; font: 16px/24px sans-serif; }
  #play { padding: 16px; } .tall::before { content: ""; display: block; height: 2000px; }
  .framed { height: 120px; overflow-y: auto; } .framed::before { content: ""; display: block; height: 100px; }
  .tiny { height: 32px; min-width: 32px; }
  svg text { font: 9px sans-serif; }
</style></head><body>
<button data-testid="start" onclick="document.body.dataset.started=1; play.hidden=false">Start</button>
<button data-testid="grown-ups" aria-label="settings">⚙</button>
<div id="play" data-testid="play" hidden><button id="go" data-testid="go">Go</button></div>
<svg class="clock" viewBox="0 0 100 100" width="200" height="200"><circle cx="50" cy="50" r="48" fill="#fff" stroke="#18202E" stroke-width="3"/>
  <text x="50" y="18" text-anchor="middle" fill="#18202E">12</text><path d="M50 50 L50 8" stroke="#E8483A" stroke-width="2"/></svg>
<script>
  window.__game = { show(screen) { document.getElementById('play').className = screen; if (screen === 'tiny') go.className = 'tiny'; } };
  const n = Number(localStorage.getItem('visits') || 0) + 1; localStorage.setItem('visits', n); document.body.dataset.visits = n;
  let held = 0; const g = document.querySelector('[data-testid=grown-ups]');
  g.addEventListener('pointerdown', () => (held = Date.now()));
  g.addEventListener('pointerup', () => { if (Date.now() - held > 900) document.body.insertAdjacentHTML('beforeend', '<div class="sheet" data-testid="sheet">Settings</div>'); });
</script></body></html>`);

const start = [{ click: "[data-testid=start]" }, { waitFor: "[data-testid=play]" }];
const cfg = {
  viewports: [{ width: 390, height: 844 }, { width: 834, height: 1194 }], freshContext: true, touch: true, hooks: ["data-testid"],
  pages: [
    { name: "first-visit", url: "game.html", actions: start, checks: [{ type: "style", name: "fresh storage: first visit every time", selectors: ["body[data-visits='1']"], property: "white-space", equals: "normal" }] },
    { name: "tall", url: "game.html", actions: [...start, { eval: "window.__game.show('tall')" }],
      checks: [{ type: "inViewport", name: "play button on screen", selectors: ["[data-testid=go]"] }] },
    { name: "framed", url: "game.html", actions: [...start, { eval: "window.__game.show('framed')" }],
      checks: [{ type: "inViewport", name: "play button on screen", selectors: ["[data-testid=go]"] }] },
    { name: "tiny", url: "game.html", actions: [...start, { eval: "window.__game.show('tiny'); return 1;" }],
      checks: [{ type: "size", name: "touch targets", selectors: ["button:not(:disabled)"], height: { min: 44 }, width: { min: 44 } }] },
    { name: "settings", url: "game.html", actions: [{ hold: "[data-testid=grown-ups]", ms: 1100 }, { waitFor: "[data-testid=sheet]" }],
      checks: [{ type: "type", name: "type on the 4px grid (svg text is artwork)", selectors: ["body *"], grid: 4, maxDistinct: 3 }] },
  ],
};
fs.writeFileSync(path.join(dir, "align.config.json"), JSON.stringify(cfg));
const g = run("alignment-guard.mjs", ["align.config.json", "--json-out", "guard.json"]);
if (!fs.existsSync(path.join(dir, "guard.json"))) { console.error(g.stdout + g.stderr); process.exit(2); }
const gj = JSON.parse(fs.readFileSync(path.join(dir, "guard.json"), "utf8"));
const failing = (page) => gj.issues.filter((i) => i.where.startsWith(page + "@"));
ok(g.status !== 2, `guard ran with eval / hold / waitFor actions (exit ${g.status})`);
ok(!failing("first-visit").length, "freshContext: every page x viewport starts with empty storage");
ok(failing("tall").some((i) => /not fully on screen/.test(i.msg)), "inViewport fails when the play button needs scrolling");
ok(failing("framed").some((i) => /cut by \[data-testid=play\]/.test(i.msg)), "inViewport fails when a scrolling frame cuts the button off, and names the frame");
ok(failing("tiny").some((i) => /\[data-testid=go\]/.test(i.detail)), "size: a 32px button fails, named by its data-testid hook");
ok(!failing("settings").length, "type: round(nearest, 1.35em, 4px) is on the grid and svg text is left out");
ok(gj.checksRun === 10, `every page ran at both viewports (${gj.checksRun} checks)`);

const s = run("snapshot.mjs", ["align.config.json", "--out", "snaps"]);
const list = fs.existsSync(path.join(dir, "snaps/snapshots.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "snaps/snapshots.json"), "utf8")) : [];
ok(s.status === 0 && list.length === 10, `snapshot: 10 frozen files (${list.length})`);
const tall = fs.readFileSync(path.join(dir, "snaps/settings-390.html"), "utf8");
ok(/data-testid="sheet"/.test(tall) && !/<script/.test(tall), "snapshot keeps the opened sheet and drops the scripts");

const p = run("palette-check.mjs", [path.join("snaps", "first-visit-390.html"), "--allow", "blue,red,gray"]);
ok(!/contrast [\d.]+:1 < [\d.]+:1\s+#18202E on #E8483A/i.test(p.stdout) && !/on #000000/.test(p.stdout), "palette: svg text is measured on what lies beneath it, not on a hand drawn over it");
const p2 = run("palette-check.mjs", [path.join("snaps", "first-visit-390.html"), "--allow", "blue,gray", "--artwork", ".clock"]);
ok(!/hue family "red"/.test(p2.stdout), "palette --artwork: a picture's colours are not the interface palette");

fs.writeFileSync(path.join(dir, "lint.css"), ".a { top: 3px; padding: 0 12px; }\n.b { line-height: round(nearest, 1.4em, 4px); }\n.c { line-height: 0; }\n");
const l = run("spacing-lint.mjs", ["--loose-type", "lint.css"]);
ok(/top: 3px/.test(l.stdout) && !/padding: 0 12px/.test(l.stdout), "lint: reports top: 3px, not a phantom 2px inside padding: 0 12px");
ok(!/round\(/.test(l.stdout) && !/line-height: 0/.test(l.stdout), "lint: round(…, 4px) and line-height 0 are on the grid");

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `apps selftest: ${failed} failed` : "apps selftest: pass");
process.exit(failed ? 1 : 0);
