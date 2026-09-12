---
name: deletion_opening_burst_cluster_2026_09_11
description: Deleted combat.ts's simulateOpeningBurst/AttackerProfile/BossProfile/OpeningBurstResult and comparison.ts's runComparison/ComparisonInputs/CandidateResult at explicit user instruction ("there is no opening salvo"); lists exactly which test coverage was given up rather than migrated
metadata:
  type: project
---

2026-09-11: the user explicitly overrode the 2026-09-06 code-simplifier
"keep alive as acceptance-test harness" note in [dead_code_audit_2026_09_06](dead_code_audit_2026_09_06.md)
and ordered the whole "Phase 1 opening burst" cluster deleted, not
deprecated: `combat.ts`'s `simulateOpeningBurst`/`AttackerProfile`/
`BossProfile`/`OpeningBurstResult`, and `comparison.ts`'s `runComparison`/
`ComparisonInputs`/`CandidateResult`. Reasoning given: the opening-burst vs
sustained split was never a real game concept, only ever an engine
simplification — same spirit as the standing "no phase toggle" decision in
CLAUDE.md, just at the deterministic-test-harness layer this time rather
than the UI layer.

**What survived, unchanged in behavior:** `bossChargedMoveReadySeconds`
(still combat.ts's one production export, reused by simulate.ts) and
`DamageTrajectoryPoint` (still combat.ts's shared type, reused by
simulate.ts/teamRaid.ts/comparison.ts's `SustainedCandidateResult`... wait,
actually `CandidateResult` was the only consumer of `DamageTrajectoryPoint`
inside comparison.ts itself — once it was deleted, comparison.ts's import of
`DamageTrajectoryPoint` became dead and was removed too; `SustainedComparisonInputs`/
`SustainedCandidateResult` never used it). `combat.ts` was left in place
(not relocated/merged into another file) per the task's explicit instruction,
even though it now holds only one function — a file move was called
out-of-scope.

**Real lint gotcha found:** after deleting `runComparison`, `comparison.ts`'s
import of `bossChargedMoveReadySeconds` from `combat.ts` became unused —
`runSustainedComparison`'s own default warmup window is computed inside
`simulate.ts` itself (`chargedMoveWarmupSeconds ?? bossChargedMoveReadySeconds(...)`
at the point `StepwiseBoss` is consumed), not in comparison.ts as I initially
assumed by pattern-matching the old `runComparison` structure. ESLint's
unused-var rule caught it; had to re-check where the default actually lives
before deleting the import.

**Test coverage genuinely lost, not migrated (per explicit instruction: "do
not attempt a large migration"):**
- `test/scenarioA.test.ts`/`test/scenarioB.test.ts` deleted whole — the
  hand-derived pinned acceptance numbers (Alpha/Beta vs Boss Tide: 7.5s/171/189;
  vs Boss Gale: 110s/536 vs 83.6s/592 crossover) are no longer asserted by
  any test. Their derivations are preserved as historical doc comments in
  `test/fixtures/hypotheticalDuo.ts` (BOSS_TIDE/BOSS_GALE) for anyone
  hand-re-verifying later, but nothing currently checks them.
- `test/simulate.test.ts`'s cross-check test (was "matches simulateOpeningBurst's
  death timing...") was rewritten to assert the SAME stepwise-engine numbers
  (7.5s fainted, 0 charged attacks landed, diedDuringOwnChargedMoveAnimation
  true) standing alone — this one WAS cheap to preserve without the deleted
  function, so I kept it rather than deleting outright.
- From `test/comparison.test.ts`'s deleted `describe("runComparison", ...)`
  block, the following have **no equivalent coverage anywhere else in the
  suite** (checked via grep across every test file before writing this):
  - Fast-move-vs-charged-move using each move's OWN type for STAB/type-effectiveness
    (the regression guard for the bug where a shared `damageOut` built from
    the fast move's type was silently applied to the charged move too —
    invisible in every fixture whose fast/charged moves happen to share a
    type). **No test anywhere exercises this specific bug shape through
    `runSustainedComparison`.**
  - Resolving an explicitly-selected candidate/boss move by id (`candidateFastMoveIds`/
    `candidateChargedMoveIds`/`bossFastMoveId`/`bossChargedMoveId`) end-to-end
    through a comparison run and confirming a higher-power move selection
    shows up as more damage. `compareAcrossBossMovesets`'s tests exercise
    `bossFastMoveId`/`bossChargedMoveId` incidentally as part of the sweep,
    but nothing tests the plain "pick a non-default move" path directly.
  - "Applies the friendship attack bonus to the candidate's own damage but
    NEVER to the boss's" tested specifically through `runSustainedComparison`'s
    plumbing — the underlying mechanic IS still covered (`teamRaid.test.ts`'s
    `TeamRaidInputs.friendshipLevel` describe block, `damage.test.ts`'s unit
    test of the multiplier itself), just not through this exact entry point.
  - "Applies the weather boost to the BOSS's own move too" as an isolated
    test — but this one's actually fine: `sustainedComparison.test.ts`'s own
    weather test already asserts "boosting both the candidate's and the
    boss's own moves", so this is NOT a real gap, just a duplicate removed.
  - The following were ALSO removed but are NOT real gaps — they're already
    covered at the unit level independent of any comparison entry point:
    Shadow attack/defense multiplier applied to boss stats (`shadow.test.ts`
    tests `shadowAdjustedBaseStats`/`bossEffectiveStats` directly), throwing
    on a boss flagged both `isShadow` and `boost` (same file, same functions),
    and `bossRaidTier` threading to a real boss's stats (`raidBossTier.test.ts`
    tests `bossEffectiveStats` directly with every tier).
  - `describe("runComparison: candidateMegaLevel", ...)` (Super Max +2
    effective level, "+" move power scaling) — **fully redundant**, already
    covered by `sustainedComparison.test.ts`'s own candidateMegaLevel describe
    block (base/high/max/super-max, non-mega no-op) using the exact same
    isolation technique. No gap here.
  - `describe("resolveCandidateMegaLevel", ...)` — kept verbatim in the
    rewritten `comparison.test.ts`, since it tests a surviving pure function
    directly and never called `runComparison` at all.

If this coverage gap (STAB-per-move-type bug regression, explicit move
selection) ever needs closing, it should be a NEW test written directly
against `runSustainedComparison`, not a resurrection of the deleted cluster.

See also [dead_code_audit_2026_09_06](dead_code_audit_2026_09_06.md) (the
now-overridden "keep alive" reasoning) and
[investigation_charged_damage_mid_animation_contradiction](investigation_charged_damage_mid_animation_contradiction.md)'s
addendum (the opening-burst-vs-stepwise fixture reuse gotcha, now moot for
the opening-burst side specifically since that path no longer exists).
