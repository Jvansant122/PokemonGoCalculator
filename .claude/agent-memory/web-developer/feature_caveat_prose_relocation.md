---
name: feature-caveat-prose-relocation
description: Moved sourcing/methodology prose out of all six Assumptions panels into each tab's existing "Known caveats" section (megaLevelSelect.tsx/bossCadence.tsx's own inline <details> blocks were the biggest win) — a real heading-substring locator collision found, why a naive ch-width CSS fix was wrong twice, and the live-DOM-reinjection measurement technique
metadata:
  type: feedback
---

Done 2026-09-10. Task: "picking a Pokémon shouldn't be buried in sourcing text" — move
background/methodology/confidence-hedging prose out of every tab's Assumptions panel into its
already-collapsed "Known caveats" section, **keep every live conditional warning inline**, don't
water down any wording. All six tabs, `megaLevelSelect.tsx`/`bossCadence.tsx` (each rendered their
own `<details className="prose-details">` — 255/384 words — inline next to their `<select>`, up to
6x per page for Mega Level) were named the biggest win.

**Classification worked as designed — three categories, only category 1 moves.** Grepping
`species-picker-hint` over-matches badly: most hits are either (2) live conditional warnings that
must stay attached to the state that triggers them (an "Overridden for Candidate A" note, a
disabled-control explainer, a computed "~12.3s" readout), or (3) not prose at all — a `<label
className="species-picker-hint">` wrapping a radio/checkbox purely for styling. Only real
background/sourcing paragraphs (data-source methodology, "what this control means" explainers, a
control's own deep-sourcing `<details>`) are category 1. Two borderline calls worth recording:
- Species Report's "A sourced historical archive, not a live log..." paragraph had an explicit
  PRE-EXISTING code comment arguing FOR keeping it at the control (not just in caveats) for
  discoverability. Moved it anyway per this task's explicit directive, but preserved the intent
  with a `title` tooltip pointer at the control — and then found its full content was **already a
  near-verbatim duplicate** of existing Known Caveats prose, so nothing was re-added there at all
  (verified word-for-word overlap first, not just "looks similar" — under-moving is recoverable,
  a fabricated duplicate isn't).
- `BossSetPanel.tsx`'s "{N} bosses resolved and encoded..." hint has substantial prose attached to
  a live computed count — judged category 2 (kept inline) since it's directly load-bearing for
  understanding what a share link freezes, not generic background reading.

**Pattern for a shared-component's own inline deep-dive prose (reusable for any future
`<details className="prose-details">` living inside a shared control):** stop the component
rendering the `<details>` itself; keep the exported hint constant (`MEGA_LEVEL_HINT`,
`BOSS_CADENCE_HINT`) untouched; give the control a `title` tooltip pointing at "Known caveats"
below; for `MegaLevelSelect` specifically, ALSO keep its existing short LIVE paragraph (only shows
once a non-Base level is actually picked) since that one's conditional, not background. Every
consuming tab imports the hint constant directly and renders it once, verbatim, in its own Known
Caveats section — duplicated PER TAB (not a shared render), same "a hand-typed sourcing claim
drifts if copied and only one copy gets corrected" reasoning `bossCadence.tsx` already used for
going shared-module-not-copy-paste. Where a control is shared across TWO MODES of the same tab
(Power-Up Optimizer's Mega Level/cadence/rankBy/raid-timer controls render in both single- and
multi-raid), the hint also has to be duplicated into BOTH modes' own caveats sections — a mode
switch doesn't collapse into one caveats location any more than two tabs would.

**A real, reusable Playwright bug found: heading-text substring collisions once you add `<h3>`
sub-headings inside a "Known caveats" body.** `getByRole("heading", { name: "Assumptions" })`
(used to expand the top-level Assumptions `<details>` in e2e tests) does a case-insensitive
SUBSTRING match by default. A new `<h3>"More detailed assumptions" checkbox</h3>` sub-heading I
added inside "Known caveats" CONTAINS "assumptions" as a substring — invisible/no collision at
first because collapsed `<details>` children aren't in the accessibility tree, so it only bit once
"Known caveats" had ALSO been expanded (fold state persists per-browser via
`collapsibleState.ts`'s localStorage, so this can trigger from an EARLIER test/page visit, not
just the current one). Fixed both ends: renamed the heading to drop the word "assumptions"
entirely (`The "More detailed" toggle`), AND hardened the e2e locators with `{ exact: true }` so
this class of collision can't recur even if a future heading reintroduces the substring. Any
future `<h3>` added near a top-level `"Assumptions"`/similarly-generic heading should avoid
containing that exact word as a substring, or the test locator needs `exact: true` regardless.

**Found and fixed 5 pre-existing, NOT-mine e2e failures — a different, already-landed concurrent
change (all six tabs' "Assumptions" `<details>` flipped from `defaultOpen` to `defaultOpen={false}`
just before this task started, per the task's own brief) broke `share-link.spec.ts` (3 tests) and
`multi-raid.spec.ts` (2 tests), which all interact with controls living inside that now-collapsed
section without ever expanding it first.** Confirmed via `git diff` on `AssumptionPanel.tsx`
(`-defaultOpen` / `+defaultOpen={false}`) that this predated my own edits, not caused by them.
Fixed anyway since `packages/web/e2e/` is squarely in scope and a red `test:e2e` blocks the
deliverable regardless of blame. **The fix must set `details.open = true` directly via
`.evaluate()`, never `.click()` the summary** — click TOGGLES, and since fold state is shared
localStorage across `page.context().newPage()` (same browser context = same storage partition), a
second unconditional click on a `freshPage` that already inherited the "open" state would close it
again. A genuinely fresh `browser.newContext()` (no localStorage carried over, used by
`multi-raid.spec.ts`'s "no roster imported" test) doesn't need the expand call at all IF the
content being asserted lives in a section that stays `defaultOpen` (headline results sections
weren't touched by the collapse-by-default change, only Assumptions/Known-caveats/Sensitivity/etc
— see `feature_collapsible_sections.md`).

**The old inline `<details className="prose-details">` blocks were ALREADY collapsed by default
(no `open` prop) — so the raw ~640-word count overstates the DEFAULT-state vertical-space
savings.** Measured both scenarios honestly rather than picking whichever number sounded better:
live DOM re-injection (append the exact removed HTML, real CSS classes, into the actual expanded
Assumptions `<details>` on the actual built `dist`, via Playwright `.evaluate()`, then
`getBoundingClientRect().height` before/after) gave Team Raid +460px default-state /
+1366px fully-expanded-old-widgets, Power-Up Optimizer (single-raid) +309px / +984px. Reused the
SAME live page's own newly-relocated "Known caveats" text (extracted via `textContent`) for the
two long hint constants instead of hand-retyping 255/384 words and risking transcription drift.

**A ch-unit CSS width fix that was wrong TWICE before being right — measure the actual rendered
word, don't estimate from character counts.** Species Report's `th:nth-child(2)` ("Type matchup")
header clips its wrapped word "MATCHUP" against a `max-width` budget because the shared
`.time-series-table thead th` rule applies `text-transform: uppercase` + `letter-spacing: 0.04em`,
and the table is `box-sizing: border-box` (`max-width` must cover the cell's own 20px padding too,
not just glyphs). First attempt (7ch→8ch) was a guess and still overflowed (measured scrollWidth
67 vs clientWidth 57). Second attempt used a `<span>` probe copying `getComputedStyle(th).font`
(the shorthand) — which silently returned `""` for a `<th>`, so the probe rendered in the
WRONG/default font and gave a plausible-looking but wrong ch ratio. The only reliable method:
clone the REAL `<th>` (guarantees identical classes/computed style), set just that element's text
to the single wrapped word, force `white-space: nowrap` + `max-width: none`, and read
`getBoundingClientRect().width` directly (border-box, matching what `max-width` actually
constrains) — that gave "MATCHUP" needs ~10.0ch border-box, so shipped 11ch for margin. Verified
the two sibling budgets (col 3, col 5) the SAME measured way rather than re-asserting the original
eyeballed claim — both had real headroom, no change needed. Re-verify any future ch-based width
tuned against `text-transform: uppercase`/`letter-spacing`/non-content-box sizing this way, not by
counting characters.

**Verification depth this session:** `npm run verify` (engine 418 / web 205 / scripts 213 tests,
typecheck clean x3, lint 0 errors, all 4 checkers, `check-scenario-roundtrip` unchanged at 114
fields across all 6 tabs — pure display refactor, confirmed mechanically) and `npm run test:e2e`
(14/14) both run to green multiple times across the session (after the heading fix, after the CSS
fix). Real browser verification via Playwright screenshots (no interactive browser-pane tool this
session) at 1920x1080 against an isolated `vite preview` instance on a throwaway port (4199, never
the shared 4173 another concurrent session might be using) — confirmed all six tabs' Assumptions
render controls-first with zero console/page errors, the new multi-raid "Known caveats" section
renders with 5 headed sub-sections, and the column-2 header fix holds pixel-for-pixel
(scrollWidth === clientWidth after the real fix). All scratch `.mjs` scripts and the throwaway
preview server were created/killed/deleted before finishing — the repo-root scratch-script
placement gotcha (`@pogo-analyzer/engine`/workspace bare-specifier resolution roots off the
script's own file location, not cwd) applies to plain browser-launching scripts too, not just
`tsx`.

**Worked in a heavily concurrent shared worktree** — `git status` at session start already showed
~40 modified/untracked files across `packages/engine`, `data/`, `scripts/`, and several
`packages/web/src/*` files I never touched (Mega Level dropdown work, a MoveSelect rewrite,
roster-planner changes). Cross-checked `git status --porcelain | grep packages/web/(src|e2e)/`
against my own memory of which files I'd actually opened with Edit/Write to produce an accurate
"what I touched" list for reporting, rather than trusting the full modified-file list. Per this
task's own instruction, staged nothing.
