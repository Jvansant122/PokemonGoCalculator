---
name: feature_team_raid_detailed_assumptions_toggle
description: "More detailed assumptions" checkbox on Team Raid Simulator hiding 4 placeholder knobs; boss charged-move frequency derived from fast-move charge time when hidden; the inverted-default decode rule for a scattered (non-contiguous) gated group
metadata:
  type: project
---

2026-09-09: added `showDetailedAssumptions` (default `false`) to the Team
Raid Simulator, gating 4 advanced/placeholder knobs (hold-for-safe-window,
boss charged-move mean frequency, swap-in cost, wipe-and-rejoin cost) behind
a checkbox. New simple defaults: `swapCostSeconds: 0.5`, `reviveCostSeconds:
15` (was 0/0 — 15 deliberately chosen at the TOP of the 12-15s community
window "to allow for user error", not because it's more confirmed).

**The 4 gated fields are NOT contiguous in the DOM** (hold-charged-move sits
near dodge controls, boss-freq sits near the cadence select, swap/revive
cost sit at the very end) — the task's "place the checkbox immediately
before the group it gates" instruction doesn't map cleanly onto a scattered
group. Resolution: placed the checkbox (+ hint + one compact "simple
assumptions in force" summary line) once, right before the FIRST gated
field (hold-charged-move), and independently wrapped each of the other 3 in
`{value.showDetailedAssumptions && (...)}` in their existing positions
rather than physically relocating them — reordering fields the task didn't
ask to reorder felt like unwarranted scope creep. If a future task explicitly
wants these visually grouped, that's a bigger layout change, not implied by
"add a checkbox".

**Derived value must be computed in the run module, not the view** (per this
repo's `run/run<Tab>.ts` invariant) — `runTeamRaidScenario` now computes
`effectiveBossChargedMoveFrequencySeconds` via
`bossChargedMoveReadySeconds(bossFastMove, bossChargedMove, 0)` (deliberately
0 starting energy, NOT `bossStartingEnergy` — this is a steady-state cadence,
not the fight's opening warmup, so "boss starts already partway charged"
must not perturb it), falling back to the stored field whenever the result
is `Infinity` (fast move has no energy gain) or `0` (degenerate). Confirmed
empirically for the default boss (tyranitar-mega, Bite/Fire Blast):
derived = **12.5s** vs. the stored default of 15s — a real, non-degenerate,
non-coincidental difference, proven via both a `run.smoke.test.ts` case and
an actual `run-scenario.ts --json` CLI call against a hand-built share URL
(not just trusting the unit test).

**Checking the box seeds the stored field with the CURRENTLY-derived value**
(`onChange({ ...value, showDetailedAssumptions: true,
bossChargedMoveFrequencySeconds: effectiveBossChargedMoveFrequencySeconds
})`) so flipping the toggle on never itself changes a result — only unlocks
further editing. This required threading `effectiveBossChargedMoveFrequencySeconds`
as a new prop into `TeamAssumptionPanel` (sourced from `runTeamRaidScenario`'s
result in the view), same pattern as `bossReadySeconds`/`bossHp` already
being view-computed and passed down.

**A second inverted-default case beyond `bossChargedMoveCadence`** (see
[[feature_boss_cadence_toggle]]): an ABSENT `showDetailedAssumptions` on
decode must resolve to `true`, not `DEFAULT_TEAM_ASSUMPTIONS`'s `false` —
a link shared before this field existed carries a deliberately-chosen
`bossChargedMoveFrequencySeconds` that must not silently get swapped for the
newly-derived value. Symmetrically, `swapCostSeconds`/`reviveCostSeconds`
themselves kept their EXISTING `?? 0` decode fallback (not bumped to `??
DEFAULT_TEAM_ASSUMPTIONS.swapCostSeconds` = 0.5/15) for the same reason: a
link missing those two fields entirely predates them existing at all, back
when 0 really was the assumption in force. This meant updating the existing
"decodes a minimal (old-link-shaped) scenario" test to explicitly override
`swapCostSeconds: 0, reviveCostSeconds: 0, showDetailedAssumptions: true` in
its expected object rather than relying on the `...DEFAULT_TEAM_ASSUMPTIONS`
spread (which now carries the NEW 0.5/15 defaults) — a spread-based expected
value silently drifts out of sync with a decode fallback the moment the
default changes, worth double-checking any time a default changes on a field
with an existing `?? 0`-style guard.

Confirmed (again) that `packages/engine/src/teamScenario.ts`'s own doc
comments for `swapCostSeconds`/`reviveCostSeconds` still assert "defaults to
0" — now stale versus the real 0.5s/15s web-layer defaults. Correctly left
untouched (out of scope, engine file) and flagged in the final report rather
than edited, per this task's explicit boundary.

A large concurrent session was modifying `packages/engine/src/simulate.ts`,
`PowerUpOptimizerView.tsx`, `SpeciesReportView.tsx`, `styles.css`, and most of
`data/` throughout this task — transient unrelated tsc errors appeared and
cleared between edits (see [[feature_boss_cadence_toggle]] for the same
pattern). Confirmed via `git status` each time before assuming a fault was
mine; final full `npm run typecheck` came back clean once their edits
settled.
