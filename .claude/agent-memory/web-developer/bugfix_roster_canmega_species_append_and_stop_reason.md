---
name: bugfix_roster_canmega_species_append_and_stop_reason
description: Three independent live-audit fixes (2026-09-11) — RosterEntryForm.canMega never self-enabled, SpeciesPicker's real "select-then-type appends" bug (component-wide, not Roster-only), and the new no-eligible-entries stop-reason sentence.
metadata:
  type: project
---

Three unrelated fixes from a live-app audit, done in one pass while a concurrent engine-developer
session was mid-edit in `packages/engine`/`scripts/` (per the "shared worktree" convention — only
staged/touched my own files, never reverted or inspected theirs beyond confirming the
`no-eligible-entries` variant they'd already shipped).

## Fix 1: `canMega` never defaulted on for a freshly-picked mega species

`RosterEntryForm.tsx`'s `SpeciesPicker onChange` reset moves on a species change but left
`canMega` alone, and `normalizeRosterEntryDraft` (`rosterEntryDraft.ts`) only ever forces it OFF
(`hasBoost ? draft.canMega : false`) — never on. Picking e.g. "Mega Mewtwo X" silently produced an
ineligible roster entry, feeding both the Lineup Builder and Power-Up Optimizer's multi-raid mode
with the boost missing.

Fix: extracted a pure `defaultCanMegaForSpecies(species: SpeciesDefinition | null): boolean`
(`rosterEntryDraft.ts`, returns `!!species?.boost`) and call it from the `SpeciesPicker onChange`
handler alongside the existing move-reset. Extracted as its own function specifically so it's
unit-testable — this file has no React Testing Library, so component-internal logic that needs a
test has to live in a plain function, same reasoning as every other helper in this file.

**Load-bearing distinction, confirmed by reading the actual call sites (an earlier audit claiming
otherwise was wrong):** `RosterEntry.canMega` is *eligibility* ("may be fielded as the team's one
mega slot" — the Lineup Builder picks which). `TeamAssumptions`/`PowerUpOptimizerAssumptions`'s
`isMega` is *exclusive per-raid selection* (setting it on one slot clears every other —
`TeamAssumptionPanel.tsx` ~255, `PowerUpOptimizerAssumptionPanel.tsx` ~282) and neither panel
auto-selects it on a species change. Do NOT default `isMega` on to "match" this fix — that would
fight the exclusivity invariant. Left a comment at both the field's doc comment
(`RosterEntryDraft.canMega`) and the derivation call site explaining the two are deliberately
different despite gating the same mechanic, so a future session doesn't "harmonise" them.

## Fix 2: the REAL SpeciesPicker bug — not Roster-specific, a shared-component defect

The task described this as "already fixed on older tabs, never propagated to Roster." That framing
was wrong once I actually reproduced it live (see verification section below): the select-all-on-
focus fix (`c059039`, 2026-09-10 14:45, predates the Roster tab's own commit `d65487b` at 20:33
the same day) is already in the shared `SpeciesPicker.tsx` and Roster already uses the shared
component — so by the time Roster existed, it should already have had the fix. It does use it. The
bug is real, but it's a **second, distinct defect in the shared component that affects every tab
equally** — Roster just makes it easy to trigger because its workflow is "pick a species, then
immediately pick another" in the same box, over and over.

Root cause: the dropdown option's `<button onMouseDown={(e) => e.preventDefault()}>` deliberately
keeps the input focused through a click (so the click registers before `onBlur`'s 150ms-delayed
close unmounts the list) — but that means after picking an option, the input NEVER loses focus, so
`onFocus`'s `e.target.select()` (the ORIGINAL fix) never fires again for the second+ pick. The very
next keystroke lands wherever the cursor happens to be and appends rather than replaces. Live
Playwright repro pre-fix: pick "Bulbasaur", then `.type("mewtwo")` with no re-click in between —
box reads `"Bulbasaurmewtwo"`. Reproduced identically on the Comparator tab too, proving it's
shared-component, not tab-specific.

Fix, in `SpeciesPicker.tsx` itself (so every consumer gets it, per the task's own preference):
added an `inputRef` and a `reselectAfterPickRef` boolean ref. `selectOption` sets the ref to `true`
in addition to its existing `setQuery`/`onChange`/`setOpen` calls. A new `useEffect(() => {...},
[query])` checks the ref, and if set, clears it and calls `inputRef.current?.select()` — but ONLY
if `document.activeElement === inputRef.current`, so a `selected` change from OUTSIDE (e.g.
restoring a share link, which also changes `query` via the pre-existing sync effect) never steals
focus or fires select() on an unfocused/invisible input. The reason this has to be a `useEffect`
rather than inline in `selectOption`: calling `.select()` synchronously in the click handler would
select whatever's in the DOM at that point (potentially the PRE-pick query text), since React
hasn't committed the new `value` to the DOM yet — the effect runs after commit, so it selects the
actual picked label.

Verified live (Playwright against a running `npm run dev` instance) that this exact fix resolves
the bug on BOTH Roster (`"Bulbasaurmewtwo"` -> `"mewtwo"`) and Comparator, and does NOT regress the
original fresh-focus-then-type path (blur, re-click, type still selects-all correctly).

## Fix 3: `PowerUpBudgetStopReason` gained `"no-eligible-entries"` (concurrent engine session)

A sibling engine-developer session added this variant mid-conversation (confirmed via
`git status` showing `packages/engine/src/powerUp.ts`/`rosterPlanner.ts` already dirty before I
started) to fix a real vacuous-truth bug: an all-excluded roster pool (`[].every(...)` is
vacuously true) used to read as `"max-level-reached"` ("every slot is already level 50") even when
the visible roster was all level 20 — the true cause (every entry excluded before evaluation,
almost always unset candy-on-hand) was invisible. Per the type's own doc comment, this variant is
**only reachable from multi-raid `planRosterBudget`** — the single-raid `optimizePowerUps` path
always has ≥1 fielded slot by construction and can't hit it, so `budgetStopReasonSentence`'s other
call site (single-raid `SingleRaidBudgetPlanSection`) never sees it in practice, but the switch is
exhaustive across both.

Wrote the sentence pointing at the "Excluded from this plan" table (`ExcludedEntriesTable`,
heading text matched exactly) rather than restating per-entry reasons, and named the dominant real
cause (missing candy counts) as the actionable next step. Exported `budgetStopReasonSentence`
(previously module-private) to unit-test it directly — `blockedCandidateSentence`/
`rosterBlockedCandidateSentence` in the same file were already exported for the same apparent
reason, though neither had an actual test file before this session; added
`PowerUpOptimizerView.test.ts` as the first one, importing a `.tsx` view module from a `.test.ts`
file the same way `AssumptionPanel.test.ts` already does (no React Testing Library in this repo —
only plain exported functions get unit tests, never rendered components).

## Verification performed

Live Chromium via Playwright driven from Bash against `npm run dev` (not just reading the diff) —
confirmed both the `canMega` default-on behavior (checked+enabled for a boost species,
unchecked+disabled for a non-boost one) and the SpeciesPicker append-bug fix pre/post. Scratch
scripts lived inside the repo root (`scratch-*.mjs`, per the earlier memory note that `/tmp`-based
ESM scripts can't resolve workspace `node_modules`) and were deleted afterward; the dev server was
killed by its specific PID (`netstat -ano | grep :5183` -> `taskkill /PID`), not a blanket
`taskkill node.exe` (a documented past mistake — see `feature_boss_set_panel_handpick.md`).
`npm run test:web` (346 tests, up from 340, all new ones passing), `npm run typecheck` (was failing
on `PowerUpOptimizerView.tsx:493` TS2366 before fix 3, clean after), `npm run lint` (0 errors, the
one pre-existing `SpeciesPicker.tsx` `set-state-in-effect` warning unchanged — my new effect calls
`.select()`, not `setState`, so it doesn't trip the rule), and a full `npm run verify` all green.
