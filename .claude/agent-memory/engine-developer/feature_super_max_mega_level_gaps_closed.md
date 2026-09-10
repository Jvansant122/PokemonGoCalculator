---
name: feature-super-max-mega-level-gaps-closed
description: 2026-09-09 follow-up closing the two gaps flagged in phase 1 (feature_super_max_plus_moves_and_mega_level) — powerUpDamageLadder's ladder now honors megaLevel, rosterPlanner.ts gained a roster-wide megaLevel; also fixed a real bug (toTeamRaidSlotsAtLevels silently dropped megaLevel) and found perf.test.ts has zero rosterPlanner coverage
metadata:
  type: project
---

Closed both gaps [[feature_super_max_plus_moves_and_mega_level]] flagged as deliberately out of
phase-1 scope. Touched `packages/engine/src/powerUp.ts` and `packages/engine/src/rosterPlanner.ts`
only, plus 4 test files and 1 shared fixture file.

## Gap 1 — powerUp.ts (the Power-Up Optimizer's single-raid mode)

`powerUpDamageLadder` gained an optional `megaLevel?: MegaLevel | null` field on its params
object. Internally resolves via `resolveCandidateMegaLevel(species, megaLevel)` (comparison.ts's
existing gate — same as comparison.ts/teamRaid.ts already use), applies `effectiveLevelForMegaLevel`
to every level the ladder computes stats at, and pre-scales the charged move ONCE via
`chargedMoveAtMegaLevel` before building the `statsAt` closure. `optimizePowerUps`'s own ladder
call site now passes `megaLevel: slot.megaLevel` through.

**A real bug found while doing this, bigger than what the task named**: `toTeamRaidSlotsAtLevels`
(the slot-mapper `planPowerUpBudget`'s ACTUAL `runFullRoster` simulation uses — a different mapper
from `optimizePowerUps`'s own `toTeamRaidSlots`) was silently DROPPING `megaLevel` entirely. This
meant `planPowerUpBudget`'s entire simulation (not just its displayed ladder) ran every candidate
at Base Mega Level regardless of a slot's own `megaLevel`, directly contradicting that function's
own doc comment ("every other field passes through unchanged"). Found by grepping every
`TeamRaidSlotInput`-shaped object literal in the file rather than trusting the task's own
description of where the gap was — same lesson as phase 1's "task named `powerUp.ts`/
`rosterPlanner.ts` as the risk area for the CPM_TABLE extension; the real bug was in
`breakpoints.ts`/`ivComparison.ts`" finding. **A task's named symptom is a starting point, not the
boundary of the actual bug — grep every structurally-similar construction site before considering
a module "done."**

Also threaded `megaLevel` through `PowerUpLevelMetricsParams`/`powerUpLevelMetrics` (used by BOTH
`usefulPowerUpLevelsAbove`'s dominated-level search AND, transitively via
`entryBossMetricsInputs`, `rosterPlanner.ts`'s Stage 3 proxy). NOT explicitly named in the task —
a judgment call. Reasoning: after fixing the ladder and `toTeamRaidSlotsAtLevels`, leaving this
unthreaded would mean the dominated-level search classifies "is this level worth trying" against
Base-Mega-Level stats/move-power while the REAL simulation it feeds now correctly uses Super Max —
a level could be wrongly excluded from the candidate window as "dominated" under Base stats when
it isn't under Super Max. This project has hit exactly this class of bug once already
([[fix_powerup_budget_candidate_window]] — a narrow candidate window silently hid a real
multi-level gain), so leaving a second, structurally similar gap felt like the wrong call even
though it wasn't literally requested. Flag if this should be reconsidered.

## Gap 2 — rosterPlanner.ts (roster-wide, deliberately NOT per-entry)

`RosterPlannerInputs.megaLevel?: MegaLevel` (new field) — roster-wide per the task's own explicit
instruction (a ~164-entry import makes a per-entry picker unusable). `RosterEntry` itself gained
NO field. `RosterBudgetInputs extends Omit<RosterPlannerInputs, "maxCandidates" |
"maxLevelsPerEntry">` inherits it automatically — confirmed via typecheck, no separate declaration
needed.

Threading (`rosterPlanner.ts`-internal only): new `SharedAssumptions.megaLevel` field (the
existing per-call bag already threaded through both `runRosterPlanner`'s and `planRosterBudget`'s
Stage 1/2/4 helpers) carries the roster-wide value. `toSlotInput` gained a 2nd param
(`megaLevel: MegaLevel | undefined`) forwarded onto `TeamRaidSlotInput.megaLevel`
UNCONDITIONALLY for every entry — `runTeamRaid`'s own `resolveCandidateMegaLevel` gate (keyed on
each entry's OWN `species.boost`) already does the per-entry exclusion deep inside the simulation,
so no NEW gating logic was written here, matching the existing "forward raw, gate at the point of
consumption" convention `toSlotInput`'s sibling `TeamRaidSlotInput.megaLevel` field already
established. `runFullRosterCached`'s `teamEntries.map(toSlotInput)` became
`teamEntries.map((entry) => toSlotInput(entry, shared.megaLevel))` (had to stop using point-free
style once `toSlotInput` took a 2nd param, or `.map`'s index argument would have silently landed
in the `megaLevel` slot). `screenScoreFor`'s `runSustainedComparison` call gained
`candidateMegaLevel: [shared.megaLevel ?? null, null]` — the same 2-tuple-with-null-second-slot
convention `speciesReport.ts`'s own single-candidate call already established.
`entryBossMetricsInputs` gained a 4th param forwarded onto `PowerUpLevelMetricsParams.megaLevel`.
Both `runRosterPlanner`'s and `planRosterBudget`'s own `shared`-object-literal construction and
`getMetricsInputs` closures needed one identical line each — used `replace_all` edits since the
text is byte-for-byte duplicated between the two functions (pre-existing duplication, not
introduced by this change).

### Type-shape choice: `MegaLevel | undefined`, not `| null` — confirmed correct against web's own code

`RosterPlannerInputs.megaLevel?: MegaLevel;` (no explicit `null` in the union) deliberately matches
`TeamRaidSlotInput.megaLevel?: MegaLevel;`'s existing convention, not
`SpeciesReportInputs.megaLevel?: MegaLevel | null;`'s. Checked this was the right call (read-only,
did not edit `packages/web`) by reading `packages/web/src/run/runPowerUpOptimizer.ts`'s existing
single-raid wiring: `megaLevel: s.megaLevel ?? undefined` with a comment explicitly citing this
exact null-vs-undefined shape mismatch as deliberate. web already has an established `?? undefined`
idiom for converting its own `MegaLevel | null` UI/Scenario state into this engine's
`MegaLevel | undefined` fields — so web-developer's one-line wiring for Gap 2 is
`megaLevel: a.multiRaidMegaLevel ?? undefined,` inserted into `resolveRosterPlannerInputs`'s
`RosterPlannerInputs` object-literal (`packages/web/src/run/runRosterPlanner.ts`, currently lines
~217-235 alongside `dodge: a.dodge,`/`weather: a.weather,`) — the SAME idiom already in use
elsewhere, not a new one. That one object literal feeds BOTH `runRosterPlanner` and
`planRosterBudget` (the doc comment there already says `inputs` is handed to `planRosterBudget`
with no remapping), so a single line closes both call sites. `megaLevel` is a plain string-union
value (`"base"|"high"|"max"|"super-max"`), trivially structured-cloneable across
`rosterPlanner.worker.ts`'s postMessage boundary — no special handling needed there.

## Perf: `perf.test.ts`/`perf.bench.ts` have ZERO existing coverage for rosterPlanner.ts

Confirmed by direct grep of both files before assuming otherwise — this CONTRADICTS the task's own
assumption ("`test/perf.test.ts` asserts ~10x budgets" was written as if it already covered
`rosterPlanner`'s sweep; it doesn't, at all. Only `powerUp.ts`'s `optimizePowerUps`/
`planPowerUpBudget` and 5 other unrelated hot paths are covered). Substituted a throwaway
`packages/engine/test/_scratch_measure_megalevel.ts` (deleted before finishing, `npx tsx`, per
[[feature_perf_benchmark_suite]]'s documented "write it INSIDE packages/engine/test/, not the
session scratchpad — deeply-relative imports from outside the package fail outright" technique)
against a synthetic 164-real-species pool x 13 real bosses (mirroring
[[feature_roster_planner_phase4_budget]]'s own previously-measured scale/budget numbers exactly):

| Function | This measurement | Phase 4's prior measurement |
| :-- | :-- | :-- |
| `runRosterPlanner` | ~420-520ms | (not previously measured) |
| `planRosterBudget`, realistic tight budget | ~2.45-2.47s | ~3.2s |
| `planRosterBudget`, generous/unlimited budget | ~6.5-6.6s | ~10.5s |

All comfortably the same order of magnitude or faster (likely machine/species-mix variance, not a
regression signal). Critically, `megaLevel: "super-max"` vs. omitted showed NO measurable
difference in any of the three pairs — the added `resolveCandidateMegaLevel`/
`chargedMoveAtMegaLevel`/`effectiveLevelForMegaLevel` calls are O(1) per level lookup, at the same
call frequency as before this change, exactly as expected.

The EXISTING `perf.test.ts` budgets that DO cover part of this feature's surface
(`powerUp.ts`'s two `planPowerUpBudget` tests, budgets 90s/42s) measured 6.8s/3.7s in the
full-suite run after this change — comfortably far from tripping, consistent with their
pre-existing ~8.5-9.1s/~4.1-4.2s documented baselines. No `npm run bench` re-run or budget change
needed. **Flag for a future session**: adding real `runRosterPlanner`/`planRosterBudget` coverage
to `perf.test.ts`/`perf.bench.ts` would close a genuine, currently-real gap in the perf suite —
not redundant busywork. Whoever picks this up should know the module has NO regression net today.

## Tests added (408 total passed, was 387; engine + full monorepo typecheck both clean)

- `test/powerUp.test.ts` (+12): `powerUpDamageLadder`/`powerUpLevelMetrics`/`optimizePowerUps`/
  `planPowerUpBudget` megaLevel describes. The `planPowerUpBudget` one specifically isolates the
  `toTeamRaidSlotsAtLevels` bug fix by comparing BASELINE-only team DPS with `stardustOnHand: 0` —
  nothing is ever powered up, so the only variable left is the fixed-level slot's own `megaLevel`.
- `test/megaLevelPowerUpCeiling.test.ts` (+3): re-runs the existing level-50 ceiling regression
  with a Super-Max mega, confirming the +2 effective-level bonus never leaks into which levels
  `powerUpLevelsAbove`/`usefulPowerUpLevelsAbove` GENERATE as candidates — only the stats/damage
  computed AT an already-generated level shift.
- `test/rosterPlanner.test.ts` / `test/rosterBudget.test.ts` (+3 each, same three cases: changes
  an already-fielded mega entry's baseline team DPS / has NO effect on a pool with no mega-capable
  entries (the gate) / byte-identical defaults). New shared fixture `MEGA_BENCH_SPECIES` added to
  `test/fixtures/rosterPlannerFixtures.ts` (same base stats as `STRONG_SPECIES`, plus `.boost`).

All new fields are optional, unlike phase 1's REQUIRED `Scenario`/`TeamScenario` field additions —
zero `packages/web`/`packages/scripts` typecheck fallout this time (confirmed via the full
monorepo `npm run typecheck`, not just `typecheck:engine`).

## A test-writing gotcha hit again (same family as [[investigation_charged_damage_mid_animation_contradiction]])

A first-draft "super-max strictly increases BOTH fast and charged damage" assertion failed on the
fast-move half at one specific (level, IV, move-power) combination — NOT a bug: `calculateDamage`
floors, and this fixture's small fast-move power didn't happen to cross a breakpoint between
level 40 and the super-max-shifted level 42, even though the underlying attack stat did increase.
Fixed the assertion to `toBeGreaterThanOrEqual` for the fast move (the charged move, driven by
BOTH the stat bump AND the "+" move's 30% power scale, kept the strict `toBeGreaterThan`).
Breakpoints being lumpy is the entire point of this engine's floor-based damage model — a test
asserting naive cross-level monotonicity for an arbitrary move/level pair is the bug, not the
engine; verify the EXACT numbers via independently-called primitives (`effectiveStatsAtLevel` +
`calculateDamage`, called directly in the test) instead of assuming a directional inequality.
