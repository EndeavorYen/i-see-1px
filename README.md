# i-see-1px

> A skill to stop your coding agent from saying the layout is done when it's one pixel off.

You asked for a tidy page. Your agent said "Done! Everything is aligned." Then you opened it and saw:

- table numbers floating 10.5px below the first line of the name next to them,
- a badge sitting 6.3px off the heading's baseline,
- a `6px` gap that belongs to no spacing scale known to humankind,
- a line-height of `16.8px`, because `1.2` felt right at the time.

You can't unsee it. Now neither can your agent.

**i-see-1px** turns "looks about right" into numbers. The agent measures the page in a real browser, lints the CSS, and is only allowed to say "done" when a check script it committed says so.

## What it makes your agent do

- **4px spacing scale.** Every `margin`, `padding`, `gap` and offset is a `var(--space-*)` token or `0`. No magic numbers.
- **Shared edges.** Columns share left edges, text shares text-left, spanning blocks share right edges. One content column, not five that are almost the same.
- **Line-heights on the grid.** Paired `--fs-*` / `--lh-*` tokens in px on the 4px grid. No unitless ratios, no `normal`, not even on inputs.
- **Baseline alignment.** Mixed sizes side by side share a baseline. Table numbers line up with the first line of a wrapped label.
- **Controls that agree.** Controls in a row share height and top. Buttons hug their labels.
- **Popover offsets and dialogs.** Popovers sit a fixed token away from their trigger edge. Dialogs are actually centered.
- **Lint for magic px.** `spacing-lint.mjs` flags off-scale spacing, raw line-heights and stray font sizes in CSS, `<style>` blocks and inline styles.
- **Measured checks at multiple viewports.** `alignment-guard.mjs` runs `getBoundingClientRect` checks in headless Chromium at every viewport (e.g. 1280 and 768) and every open state (popover, dialog), and takes screenshots.
- **An honest done-claim.** The agent pastes the guard and lint output, lists what it checked by eye and what it didn't verify, and writes `NOT DONE: ...` instead of rounding a partial pass up.

## What's inside

```
SKILL.md                              # the rules the agent follows
templates/tokens.css                  # spacing, type pairs, control heights, overlays
templates/spacing-lint.mjs            # lint: spacing scale, line-height, font-size
templates/alignment-guard.mjs         # browser checks: edges, rows, baselines, gaps, overlays
templates/align.config.example.json   # a complete example check config, one section per component
scripts/readme-check.mjs              # this README's own layout check (we dogfood it)
```

## Install

Copy the folder into your agent's skills directory.

### Claude Code

```bash
git clone https://github.com/EndeavorYen/i-see-1px.git ~/.claude/skills/i-see-1px
```

### Cursor (per project)

```bash
git clone https://github.com/EndeavorYen/i-see-1px.git .cursor/skills/i-see-1px
```

### Codex and other agents

Put the folder wherever your agent loads skills from, or point it at `SKILL.md` from your `AGENTS.md`.

### Requirements

The guard needs Node 18+ and `playwright-core` in the project it checks (`npm i -D playwright-core`). Set `CHROME_PATH` if you don't have Playwright's bundled Chromium.

## Usage

Just ask for UI work. The skill triggers on layout, CSS, polish, responsive and alignment tasks, including vague ones like "make it look neat on laptop and tablet".

Or call it out explicitly:

> Use the i-see-1px skill. Build the billing settings page and don't tell me it's done until the guard passes at 1280 and 768.

What the agent will do:

1. Copy `tokens.css`, the lint and the guard into the project.
2. Copy `align.config.example.json` to `align.config.json`, rename the `data-qa` hooks, and delete only the sections the UI doesn't have.
3. Run the guard on the skeleton first to prove the checks can fail.
4. Build, then loop: lint and guard at every viewport until both are at zero.
5. Wire it into `npm run check:align` so the check stays in the repo.
6. Report the `env:` line (browser and fonts), the pass counts, screenshots, and the remaining risks.

You can run the tools yourself too:

```bash
node scripts/spacing-lint.mjs src/styles
node scripts/alignment-guard.mjs align.config.json --screenshots shots
```

## Benchmark

A small experiment, not a peer-reviewed study: **n=1 per round**, same model, same prompt, and the only difference was whether the skill was loaded. Scoring used hidden checks the agents never saw.

| Round | Task | Without skill | With skill |
|---:|---|---|---|
| 1 | Fix an existing page | 82.9 / 100 | **100 / 100** |
| 2 | Build from scratch, detailed spec | 100 / 100 (121/121 checks), 18.6 min | **100 / 100** (121/121 checks), **13.9 min**, left a reusable check script |
| 3 | Build from scratch, vague brief, 127 hidden alignment checks | 23 / 100: 26 failed checks, 37 lint violations, still claimed done | **100 / 100**: 0 failed checks, 0 lint violations, its self-reported results matched the grader |

The gap is largest when the brief is vague, which is exactly when an agent is most tempted to eyeball it.

Round 3 at 1280px, without the skill (left) and with it (right):

<img src="docs/without-skill.png" width="50%" alt="Round 3 page, without skill"><img src="docs/with-skill.png" width="50%" alt="Round 3 page, with skill">

They look similar at a glance. That's the point: the difference is a badge 6.3px off the baseline, numbers 10.5px below the line they belong to, 6px gaps and fractional line-heights. Small on their own, and all of it adds up. Close-ups below.

## Side-by-side

Round 3 pages at 1280px, re-rendered in headless Chromium. Left: without the skill. Right: with it. Every crop is the same size as its partner, and the overlays use one key: gray dashed lines are the reference, orange is the measurement. A solid orange line with a filled tag is off; a dashed orange line with an outlined ✓ tag is aligned or on scale.

**1. Badge on the title baseline.** Without the skill, the "3 plans active" chip sits 6.3px above the heading's baseline. With it, the chip shares the heading's baseline exactly (0.0px).

<img src="docs/compare/01-chip-baseline-without.png" width="50%" alt="Badge on the title baseline, without skill"><img src="docs/compare/01-chip-baseline-with.png" width="50%" alt="Badge on the title baseline, with skill">

**2. Numbers next to a wrapped name.** Without the skill, vertically centered cells push the numbers 10.5px below the first line of a two-line team name. With it, top-aligned cells keep the numbers on the first line (0.0px).

<img src="docs/compare/02-wrapped-row-without.png" width="50%" alt="Numbers next to a wrapped name, without skill"><img src="docs/compare/02-wrapped-row-with.png" width="50%" alt="Numbers next to a wrapped name, with skill">

**3. Form gaps on the scale.** Without the skill, label to field and field to message are both 6px, which is off the 4px scale. With it, both gaps are 4px, a `--space-*` token.

<img src="docs/compare/03-form-gaps-without.png" width="50%" alt="Form gaps on the scale, without skill"><img src="docs/compare/03-form-gaps-with.png" width="50%" alt="Form gaps on the scale, with skill">

**4. Line-heights on the grid.** Without the skill, a unitless `1.55` gives the intro 21.7px lines, so every line after the first drifts off the 4px grid. With it, the intro is 16px/24px and every line lands on the grid.

<img src="docs/compare/04-line-height-without.png" width="50%" alt="Line-heights on the grid, without skill"><img src="docs/compare/04-line-height-with.png" width="50%" alt="Line-heights on the grid, with skill">

**5. Popover offset.** Without the skill, the filter menu opens 6px below its trigger, which is off the 4px scale. With it, the menu opens 8px below, the `--popover-offset` token.

<img src="docs/compare/05-popover-offset-without.png" width="50%" alt="Popover offset, without skill"><img src="docs/compare/05-popover-offset-with.png" width="50%" alt="Popover offset, with skill">

None of these is dramatic on its own, and that's the trap: each one is easy to eyeball as "fine", and an agent that only looks at screenshots will happily call it done.

## FAQ

**Will this make my design pretty?** No. It makes it *aligned*. Taste is still your job. This skill makes sure nothing is quietly off.

**Can I change the scale?** Yes. Edit `tokens.css`; the lint reads token values from it.

**Isn't this a bit much for one pixel?** Yes. That's the whole idea.

## License

MIT
