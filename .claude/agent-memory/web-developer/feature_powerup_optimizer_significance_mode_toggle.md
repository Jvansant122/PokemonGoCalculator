---
name: feature-powerup-optimizer-significance-mode-toggle
description: Wiring the engine's pre-landed RosterSignificanceMode ("aggregate-only" vs "aggregate-or-per-boss") into a multi-raid-only toggle on the Power-Up Optimizer — a real UI-filtering behavior change (not just display), and a Playwright async-race lesson from chasing a bug that didn't exist
metadata:
  type: project
---

Built 2026-09-10. The engine half (`RosterSignificanceMode`, `RosterPlannerInputs.significanceMode`,
`candidateClearsBudgetFloor`) was already landed in `packages/engine/src/rosterPlanner.ts` before
this task started — pure wiring, zero `packages/engine` edits.

**Field**: `multiRaidSignificanceMode: RosterSignificanceMode` on `PowerUpOptimizerAssumptions`
(and `?: RosterSignificanceMode` on `PowerUpOptimizerScenario`). Threaded into ONE place only —
`resolveRosterPlannerInputs`'s constructed `RosterPlannerInputs` object
(`packages/web/src/run/runRosterPlanner.ts`) — because both `runRosterPlanner` (ranked table) and
`planRosterBudget` (budget plan) consume that SAME resolved object unchanged (see
`feature_power_up_optimizer_fixed_budget_plan.md`'s already-established "one inputs object, two
engine calls" pattern). This is why the table and the plan structurally CANNOT disagree about
what's significant — there's only one place the value is set.

**Inverted default, same `showDetailedAssumptions` precedent**: `DEFAULT_ASSUMPTIONS` is
`"aggregate-only"` (the user's chosen stricter default), but `scenarioToAssumptions`'s decode of
an ABSENT field falls back to `"aggregate-or-per-boss"` (today's pre-toggle behavior), not
`DEFAULT_ASSUMPTIONS.multiRaidSignificanceMode`. This split had to be re-applied in FOUR places
that all default off `PowerUpOptimizerAssumptions`, not just the codec: the single-raid
placeholder memo (`optimizerAssumptions`, hardcoded to `"aggregate-only"` since multi-raid fields
are irrelevant there), `teamRaidExport.ts`'s `teamAssumptionsToPowerUpOptimizerAssumptions` (also
hardcoded `"aggregate-only"`, Team Raid has no equivalent setting), and the `scenarioRoundtrip.test.ts`
minimal-decode test's expected object (which otherwise inherits `PU_DEFAULTS` via spread and would
silently assert the WRONG fallback). `add-scenario-assumption`'s checklist doesn't call out "count
every placeholder-object call site," so grep for every literal object matching the `Assumptions`
shape, not just the two codec functions.

**A real UI-filtering behavior change, not just a display toggle** — the engine's `exceedsNoise`
field on every `RosterPowerUpCandidate` already existed and already varied by `significanceMode`,
but the UI previously showed EVERY capped candidate regardless (dimmed via `opacity: 0.6` if
`!exceedsNoise`), never actually removing rows. The task's own wording ("a candidate...now
silently vanishes from the table") required a real filter, added as two `useMemo`s in
`MultiRaidResultsSection`: `hiddenBySignificanceMode` (`!exceedsNoise && significantBossCount > 0`)
and `qualifyingCandidates` (the complement, feeding `sortedCandidateGroups` instead of the raw
`dedupedCandidates`). A candidate insignificant under BOTH measures (`significantBossCount === 0`)
is UNCHANGED — still shown dimmed, never hidden — only the "per-boss-only significant" set is new.
The hidden count is honestly derivable from a SINGLE engine run's own data (no second run under
the other mode needed): `significantBossCount` is computed independently of `significanceMode`
inside the engine, so `!exceedsNoise && significantBossCount > 0` correctly identifies "would show
under aggregate-or-per-boss but doesn't under the current mode" regardless of which mode actually
ran — proven by an isolated `tsx` scratch script calling `runRosterPlanner` twice with the two
modes on identical seeded inputs (seed defaults to `1`, fully deterministic) before touching the UI
at all.

**A real Playwright async-race false alarm, ~40 minutes of debugging a bug that didn't exist**:
first pass of the live-browser check asserted `hiddenCountAfter === 0` immediately after clicking
"Run sweep again" following the checkbox toggle, and it consistently read the STALE pre-toggle
count. Chased this through three layers of temporary `console.log` debugging (browser-side memo
recompute, `handleRunMultiRaidSweep` invocation, the `onFinish` callback) before realizing the
`hiddenLine`'s own TEXT changes for a purely cosmetic reason (a trailing " — check the box above"
hint disappears) the INSTANT `significanceMode` prop changes — well before the second async Web
Worker round trip (`runRosterPlannerOffMainThread`) actually resolves — so a `not.toHaveText(oldText)`
or "stale badge disappeared" check both pass trivially without ever waiting for the real
recomputation (the stale badge specifically disappears the moment `isRunning` flips true, which
happens SYNCHRONOUSLY at click time, not when the new result arrives). The fix: `expect.poll(async
() => parsedCount, {timeout}).toBe(0)` — poll the actual PARSED value, not a locator's visibility
or raw-text-inequality, whenever a UI text node can change for TWO independent reasons (one
instant/cosmetic, one async/real) and you need to wait specifically for the second one. Once fixed,
the feature worked correctly on the very first real attempt — this was a test bug end to end, not
a production one. Landed as a permanent test in `packages/web/e2e/multi-raid.spec.ts` (not a
scratch file) since it's a share-link/tab-behavior surface, per CLAUDE.md's e2e coverage rule.

**Wording**: control worded as "Also count a candidate that only helps against one boss, even if
it doesn't move the average" (checkbox, checked = `"aggregate-or-per-boss"`), one line, no
jargon about noise floors, gated to `value.mode === "multi-raid"` only (single-raid has one boss,
no aggregate-vs-per-boss distinction to make — the engine agent deliberately didn't add the field
there either). Hidden-count line lives in the existing "Multi-raid sweep" result-card `<dl>`
alongside "Never competitive" etc.: "N candidate(s) hidden: significant against one boss but not
on average" (+ " — check the box above to reveal them" appended only when `aggregate-only` AND
count > 0, so the sentence doesn't dangling-point at a toggle that's already checked).

Round-trip field count: 114 -> 115 (`npm run check-scenario-roundtrip`). Confirmed live in a real
browser (import a Poke Genie CSV, run sweep, toggle, re-run): row count grew from 36 to 51
(+15, exactly matching the hidden-count line's own claimed 15) and the committed budget plan
re-ran without disagreement (`npm run verify` + `npm run test:e2e`, 16/16 specs, both green).
