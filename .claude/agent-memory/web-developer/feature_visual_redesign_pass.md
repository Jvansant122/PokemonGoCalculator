---
name: feature-visual-redesign-pass
description: Whole-app presentational redesign (design tokens, masthead, stat tiles, callouts, table scroll class) — plus the discovery that Playwright can be driven directly from Bash for real visual verification, and three JSX/tooling gotchas hit along the way
metadata:
  type: project
---

Shipped 2026-09-08 (uncommitted at hand-off). Purely presentational: no engine call, no
`Scenario` field, no `run/` module, no displayed number changed. 20 files, all in
`packages/web`.

## The single most useful discovery: I CAN drive a real browser

`@playwright/test` is installed at the repo root (`node_modules/@playwright/test`) with a
Chromium binary already downloaded, so a scratchpad `.mjs` script + `node` gives a real browser
even when no browser *tool* is granted. This supersedes the "no browser tool, do the
build/serve/curl ladder" ceiling described in [[verification-without-browser-tool]] — that
ladder is now the FALLBACK, not the best available evidence.

Two things to get right:

- A bare `import { chromium } from "@playwright/test"` fails from the scratchpad
  (`ERR_MODULE_NOT_FOUND`) because Node resolves bare specifiers from the *importing file's*
  location, not cwd. Import the absolute path instead:
  `import { chromium } from "file:///C:/Users/Jack/Documents/PokemonGoCalculator/node_modules/@playwright/test/index.mjs";`
- Run `npx vite preview --port 4174 --strictPort` from `packages/web` in the background first
  (port 4173 is Playwright's own `webServer`; using a different port avoids fighting it).

Then `page.screenshot()` into the scratchpad and **read the PNGs back with the Read tool** — the
model actually sees them. That is how the em-dash/spacing bugs below were caught; neither would
have shown up in a diff, a typecheck, or the e2e suite. Also worth scripting in the same pass,
since it's nearly free once the browser is up: `document.documentElement.scrollWidth` at 375px
(the documented mobile-overflow regression class), `document.fonts.check(...)`, and
`console`/`pageerror`/`requestfailed` listeners.

## Real bugs found only by looking at the rendered page

- **JSX eats the space between an expression and the next line's text.**
  `...window ({partySize}\n  other trainer{...}` rendered as "(4other trainers" — a
  long-standing defect in `DamageOverTimeChart.tsx`'s ranking-flip sentence, the most prominent
  line in the whole product. Fixed with an explicit `{" "}`. Check any wrapped JSX line that
  ends in `}` for this.
- **An em dash as a large "no value" placeholder reads as a stray horizontal bar** at 1.8rem in
  a stat tile. Use `"n/a"` (which the Team Raid `dl` already used) instead of `"—"` for headline
  metrics.

## Structural conventions this pass established

- **`.tab-switcher` / `.tab-button` are shared by three things**: the top-level `nav`, plus
  Attack/Defense's mode switch and Species Report's sort-by, both `<div role="group">`. Any
  nav-only styling (sticky, backdrop blur) must be element-qualified as `nav.tab-switcher` or it
  leaks into two in-panel segmented controls.
- **`.table-scroll`** replaced the eight copy-pasted `style={{ overflowX: "auto" }}` wrapper
  divs. A ninth table call site must use it — the table classes themselves still scope no
  scrolling, and `overflow-x` still must not go on `.panel` (see
  [[bugfix-mobile-horizontal-overflow]] for why).
- **`.crossover-note` gets its label from CSS `::before`**, so the sentence text is untouched:
  base label "Verdict" (the IV tabs put their own headline verdict in the same callout),
  overridden to "Ranking flip" / "No ranking flip" by `--flip` / `--steady` modifiers the
  comparator chart sets. Species Report's "the two rankings disagree…" line was promoted into
  this same callout — it's that tab's flip-line analogue.
- Result cards became stat tiles: a `.stat-tile-headline` (own DPS / team DPS / time to clear)
  ABOVE the existing `dl`, which stays intact because Playwright reads `dt` text and its
  following `dd`. The candidate accent moved from a full colored border to a `::before` top bar.
- The boss-cadence explainer is now a collapsed `<details className="prose-details">`. That is
  allowed *only* because it's background prose — inputs and result caveats stay visible.

## Tooling gotchas (cost real time)

- **No `python` on this machine** (Windows store-alias stub). Use `node` scripts for
  multi-file mechanical edits.
- **A large heredoc through the Bash tool fails with `ENAMETOOLONG: uv_spawn`.** Write big files
  (a ~1000-line CSS rewrite) with the Write tool, not `cat > f <<'EOF'`.
- **`{cond && ( <p/> )}` cannot also contain a `{/* comment */}`** — that's two children of a
  parenthesized expression and tsc reports it as a cascade of ~10 confusing JSX errors starting
  with `')' expected`. Put the comment on the line *above* the `{cond && (`.

## Incidental observations

- Google Fonts (Inter, `display=swap`) added to `index.html` produced ZERO console errors or
  failed requests in the Playwright run — checked explicitly with a `requestfailed` listener,
  since `tabs.spec.ts` asserts `consoleErrors` is empty and a blocked font would have broken it.
- `npm run lint` reports **3** react-hooks warnings now (2x exhaustive-deps in
  `IvBreakpointsView`, 1x set-state-in-effect in `SpeciesPicker`), not the "six as of
  2026-09-08" the agent brief states. Don't treat six as the current baseline.
