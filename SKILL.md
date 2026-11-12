---
name: i-see-1px
description: >-
  Use when building (including from an empty repo or a vague "make it look neat"
  request), editing, or reviewing frontend layout, CSS, UI polish, typography,
  responsive breakpoints, or alignment — anything where edges, baselines, line
  heights, control heights, button widths, or spacing must line up. Start from
  the shipped check config, measure every viewport and open state, and do not
  claim done until a pasted self-audit shows the guard and the lint at zero.
---
# i-see-1px: UI alignment, measured

Measure, never eyeball. A number from `getBoundingClientRect` beats any judgement of a screenshot. The tools in this skill's `templates/` folder:
- `tokens.css`: spacing, type pairs, controls, columns and overlays
- `align.config.example.json`: a **complete** check config, one `_section` per component
- `alignment-guard.mjs`: multi-viewport, multi-state browser checks
- `spacing-lint.mjs`: spacing plus line-height and font-size

A vague request ("make it tidy, good on laptop and tablet") still means every rule below. Turn the request into checks; don't wait for numbers.

## Pick the path

- **Existing UI** → Step 0, then the rules, then the fix loop.
- **Empty repo or new page** → the from-zero path. Write no component CSS before Z4.
- **The project has no tokens, guard or lint** → do Z1–Z3 first.
- **A printed document, PDF or fixed-size sheet** → the print path below, then the rules.

## From zero (and for any project missing the tools)

1. **Z1 Tokens.** Copy `templates/tokens.css` and load it first. Map any existing tokens onto these names; never keep two scales. Fix the type pairs (`--fs-*` with `--lh-*`) and the breakpoints now.
2. **Z2 Lint.** Copy `spacing-lint.mjs` and run `node scripts/spacing-lint.mjs <css-dir>`. It reads values from `tokens.css` (or `--tokens FILE`) and never lints that file.
3. **Z3 Guard config, by deletion.** Install `playwright-core` (`npm i -D playwright-core`; set `CHROME_PATH` if there is no bundled browser) and copy `alignment-guard.mjs`. Then:
   - Copy `align.config.example.json` to `align.config.json`.
   - Rename its `data-qa` hooks to yours. Use hooks, never class names.
   - Repeat each "repeat per field/column" check for every field and every number column.
   - Delete **only the sections your UI does not have**, such as icon buttons or popovers.
   - Add checks for anything specific to your page.
   - Keep every viewport you support (at least two, for example 1280 and 768). Restrict a check with `"viewports": [1280]`; the old `"widths"` key still works but is deprecated.
4. **Z4 Prove the config bites.** Run the guard on the skeleton. Expect `missing` and other failures, not a pass. Then write markup and component CSS.
5. **Z5 Wire it in.** Add an npm script such as `check:align` that runs the lint and then the guard.

## Printed documents (A4, PDF, fixed-size sheets)

Same rules, different set-up. Check the HTML source in a browser, then print it to PDF.

1. Copy `templates/tokens.print-a4.css` as `tokens.css` and `templates/align.config.print.example.json` as `align.config.json`. The config has one viewport (`allowSingleViewport`) and the sheet size. Give every sheet `min-height`, never `height`, so content that overflows fails the `size` check.
2. Rename the `data-qa` hooks. Boxes, lists and table cells start their text on one `--inset`.
3. Add the document checks: the guard's `widow` (no wrapped paragraph ends in a stub line), `node typography-check.mjs <page.html>` (scale, leading, line length, rhythm, alignment lines) and `node palette-check.mjs <page.html>` (colours, hue families, contrast). The leading and line-length rules apply to CJK text; pass `--prose-lh`, `--measure` and `--lines` for your own numbers.
4. Open every page once the guards pass. They cannot see inside SVG illustrations or content drawn by CSS (a list bullet written as a CSS escape rendered as ",2" and passed every check).

## Step 0 — inventory and "before"

- **Existing UI:** before any change, run the guard and the lint at every viewport, and record the counts. Write an inventory (`screen | viewport | element | left | right | top | height | baseline | font-size/line-height`, in px) for each group that should match, and take `before/` screenshots of every viewport and state.
- **New page:** "before" is the **first complete render**, with all content and states present, or skip it. Never report the skeleton's score as a baseline.

## Rules

| # | Rule | Checked by |
|---|------|------------|
| R1 | `margin`, `padding`, `gap`, `inset` and `top/left` offsets use only `var(--space-*)` or `0` (4px steps). | lint |
| R2 | Font sizes come from one small scale (`--fs-*`, such as 12/14/16/20/24/32), with at most 6 in use. | lint; guard `type` `maxDistinct` |
| R3 | Line heights are `var(--lh-*)` in **px on the 4px grid**, paired with their size. Never unitless, and never `normal`, including on inputs and buttons. | lint; guard `type` |
| R4 | Controls in a row share one height and top (`--control-sm/md/lg`). | guard `row`; `size` `height`, `equal` |
| R5 | **Buttons hug their label**: no `width: 100%` or `flex: 1` on action buttons unless a full-width button is the design. | guard `size` `hug` |
| R6 | Columns share left edges; text inside them shares text-left; spanning elements share right edges. | guard `column` |
| R7 | Mixed sizes side by side share a baseline. Table cells use `vertical-align: top` or `baseline`. | guard `row` `baseline` |
| R8 | Number columns: `tabular-nums`, `text-align: end`, and headers aligned the same way. Text columns: header and cells share text-left. | guard `style`; `column` |
| R9 | Long text wraps; never truncate content. | guard `noClip` |
| R10 | Icons sit in a fixed slot, centred, with no margin nudges. | guard `center` |
| R11 | Popovers sit `--popover-offset` from the trigger, on a trigger edge. Dialogs are centred (`showModal()`). | guard `distance`, `anyOf`, `centered` |
| R12 | One content column. Card rows stretch, and their inner parts align. | guard `column`, `row` `rowOf`, `gaps` |
| R13 | Every viewport and every open state passes, with no horizontal overflow. | guard `viewports`, `pages[].actions`, `noOverflow` |
| R14 | Fix the cause. Never delete, hide or rename hooks to pass. | guard `missing` |

Exception: a sub-4px optical fix may carry a same-line `/* px-ok: <reason> */`. Allow at most 3 per screen, and list them.

## Commonly missed — the config must contain these when the UI has the part

- [ ] **Buttons sized to their label text:** `size` with `hug: true` on every button group, the dialog footer and the form actions.
- [ ] **Dialog footer:** the button gap is on the scale (`gaps` with `scale: 4`), the buttons share top, height and **baseline**, and the title, body, label and field share left and text-left.
- [ ] **Sidebar against main on desktop:** `distance` from sidebar right to main left ≥ 0, and a `row` check that they share a top.
- [ ] **Nav above main on tablet:** `distance` from sidebar bottom to main top ≥ 0, at the tablet viewport only.
- [ ] **Table text column:** the header and the cells share `textLeft`. Number columns share `textRight`.
- [ ] **Form labels in one row share a top** (`row`, `groupBy: "row"`). Fields in one row share top and height; fields in one column share left and right.
- [ ] **Actions on the field-column edge:** an `anyOf` with the left edge or the right edge.
- [ ] **Checkbox:** a `size` check with `square: true`, and it is centred on its label.

## Fix loop

1. Fix in this order: columns, then control heights and button widths, then type and baselines, then open states, then the tablet viewport.
2. After each change, re-run the lint and the guard at **all viewports**. The counts must go down; revert any change that raises them.
3. Never raise the tolerance (0.5px), delete a failing check, narrow a selector, or drop a viewport.

## Screenshots

- Page states: full page.
- Popover or dialog open: **viewport-sized**. The guard does this by itself for pages with `actions`, so the backdrop and the overlay are framed correctly.
- Name them `<state>-<viewport>.png`, for every viewport.

## Self-audit before any done-claim

1. Re-run the lint and the guard from a clean state. Paste the final lines: `env: …`, `checks: N/M passed at viewports …`, `alignment guard: pass`, `spacing lint: pass`.
2. Look at every screenshot for what the guard cannot see: overlap, a missing error state, contrast.
3. Go through the request item by item (and the "Commonly missed" list), marking each one **guard**, **eye** or **not verified**.
4. List the remaining risks honestly. "None" is allowed only when step 3 has no "not verified" item.

## Report: environment and numbers

- Record the **browser version and the fonts actually rendered**. Copy the guard's `env:` line, for example `env: chromium 147.0… | fonts: Noto Sans (2211 glyphs)`.
- Mark numbers that depend on text width (button widths, button left edges in a right-aligned group, wrapped heights) as **env-dependent**, because they drift a few px with other fonts or Chrome builds. Layout-driven edges (columns, gaps, control heights) are stable.

## Done means all of these

- [ ] `alignment guard: pass` and `checks: M/M passed at viewports <all>`
- [ ] `spacing lint: pass`
- [ ] Screenshots of every state at every viewport. Existing UI: before and after. New page: after only, or the first complete render as before.
- [ ] Changed screens, and the inventory deltas in px, with env-dependent numbers marked
- [ ] The self-audit list, the remaining risks, the `px-ok` exceptions or "none", and the `env:` line

If any box is missing, write `NOT DONE: <item> — <reason>` with the numbers. Never round a partial pass up to done.

## Report template

```
Env: chromium 147.0.x | fonts: Noto Sans        Viewports: 1280, 768   States: page, popover-open, dialog-open
Guard: checks: 95/95 passed at viewports 1280, 768 / alignment guard: pass   (first full render: N)
Lint:  spacing lint: pass
Screenshots: shots/page-1280.png (full) … shots/dialog-open-768.png (viewport)
Request items: nav on top at tablet: guard ✓ · error state: eye ✓ · print styles: not verified
Env-dependent numbers: Save left 1133 (text width)     Risks: <honest list>     px-ok: none
```
