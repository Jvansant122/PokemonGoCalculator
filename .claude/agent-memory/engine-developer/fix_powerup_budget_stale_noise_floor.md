---
name: fix-powerup-budget-stale-noise-floor
description: planPowerUpBudget's noise floor recomputed per-round from current roster variance (2026-09-08) — the too-small-floor direction the overseer flagged, the shared noiseFloorFor helper, and the PowerUpBudgetStep.noiseFloorTeamDps audit field
metadata:
  type: project
---

**The bug (found by the overseer probing right after [[feature_powerup_budget_blocked_candidate]] shipped):**
`planPowerUpBudget` computed `noiseFloorTeamDps` ONCE from the STARTING baseline roster and reused
that single value as the commit threshold for every round. A roster's seed-to-seed variance
changes as it's powered up (measured on the real default 6-slot roster vs Mega Tyranitar: stdDev
0.23 -> 0.35 after 2 steps, floor should go +/-0.102 -> +/-0.222 but a stale floor kept judging
round 3 against +/-0.102). The dangerous direction is stale-LOW: it lets real seed noise through
as a committed recommendation, exactly what the noise floor exists to prevent. `optimizePowerUps`
is explicitly NOT affected/NOT touched — every candidate there is priced against one fixed,
unchanging baseline roster, so a single floor is correct there by construction.

**Fix:** extracted `noiseFloorFor(summary: PowerUpEncounterSummary, iterations) => 2 *
summary.teamDpsStdDev * Math.sqrt(2/iterations)` as a shared helper (`optimizePowerUps` now calls
it too, purely a dedup, zero behavior change there). `planPowerUpBudget` keeps a mutable
`currentNoiseFloorTeamDps`, captured into a per-round-local `floorForThisRound` BEFORE any
candidate is evaluated that round (so `PowerUpBudgetStep.noiseFloorTeamDps` records exactly what
governed that step's acceptance), then recomputed via `noiseFloorFor(currentSummary, iterations)`
immediately after a step commits — `currentSummary` already **is** that step's real
`PowerUpEncounterSummary` (from `runFullRoster`), so this costs zero extra simulation, per the
overseer's explicit constraint. The post-search "best blocked candidate" pass (from
[[feature_powerup_budget_blocked_candidate]]) now checks against `currentNoiseFloorTeamDps` as
left by the round loop — i.e. the FINAL floor, not round 1's stale one.

**Field semantics, decided and documented explicitly (the overseer left this as my call):**
`PowerUpBudgetPlan.noiseFloorTeamDps` is now the FINAL floor — the value in effect when the round
loop actually stopped, which is the SAME value the blocked-candidate pass judges against. This is
NOT one fixed floor for the whole plan: an earlier committed step may have cleared a smaller (or
larger — recomputation isn't a one-way ratchet, variance can drop too, see below) floor. Added
`PowerUpBudgetStep.noiseFloorTeamDps` (new field) so any single step's own acceptance is
independently auditable without assuming the top-level field applied to it.

**Verified via a hand-authored test fixture, not hand arithmetic — widening `maxLevel` on the
EXISTING regression fixture from [[fix_powerup_budget_candidate_window]] (`REGRESSION_SLOT`/
`REGRESSION_BOSS`, `regressionInputs()`) to 50 produces a clean 2-step plan** (31->34, then
34->49.5) whose measured variance actually goes DOWN then back UP across rounds (baseline stdDev
0.2818 -> post-step-1 0.2266 -> post-step-2/final 0.5368; floors 0.1782 -> 0.1433 -> 0.3395) — a
real, non-monotonic case, not a constructed one-directional ratchet. `packages/engine/test/
powerUp.test.ts`'s new tests (in the same "regression: a multi-level jump..." describe block)
cross-check `PowerUpBudgetStep.noiseFloorTeamDps` against a fully INDEPENDENT second
`planPowerUpBudget` call whose lone slot already starts at the post-step level with `maxLevel`
capped there (deterministic re-simulation, same species/level/boss/seeds -> exact reproduction,
zero access to internal state needed) — a reusable verification technique if this function is
touched again. A second new test starves candy so only step 1 commits, then widens
`blockedCandidateLevelsPerSlot` (default 8 is too narrow to reach this fixture's real blocked
candidate at 49.5 — a dense useful-level list eats the window first; NOT a bug, matches that
field's own documented "bounded, not exhaustive" tradeoff) to confirm the blocked-candidate pass
judges against the FINAL (post-step-1) floor, not round 1's baseline-derived one.

**Existing tests needed ZERO changes** — every pre-existing `planPowerUpBudget` test either
commits 0-1 steps (round-1's floor == baseline's floor in both old and new code, so no observable
difference) or already asserted per-step behavior loosely enough to hold under either semantics.
Confirmed the full pre-existing suite passes unchanged before writing new tests, per the
overseer's explicit instruction to flag rather than silently rewrite anything that encoded the old
single-floor assumption.

**Real cross-package impact flagged, NOT fixed (stayed inside packages/engine per instruction):**
`packages/web/src/run/run.smoke.test.ts` asserts `step.deltaTeamDps > plan.noiseFloorTeamDps` for
EVERY step — bakes in the old single-floor assumption. Under the new FINAL-floor semantics this
only provably holds for the LAST step (an earlier step's delta only had to clear the smaller floor
active at ITS OWN round, not the plan's final, possibly-larger one). `packages/web/src/
PowerUpOptimizerView.tsx` (lines ~604-606) narrates "a step is only committed once its own
marginal team-DPS gain measurably beats **this run's** ±X team-DPS noise floor" — now misleading,
since different steps in the SAME run can be judged against genuinely different floors. Both need
a `web-developer` pass (or the smoke test could switch to `step.noiseFloorTeamDps`); did not touch
either file myself, per the explicit "stay entirely inside packages/engine" instruction for this
task, with a concurrent web-developer session mid-edit on unrelated files in the same tree.

See [[feature_powerup_budget_blocked_candidate]] and [[fix_powerup_budget_candidate_window]] for
the two features this directly extends, and [[feature_power_up_optimizer]] for the original
single-floor design this correction supersedes (for `planPowerUpBudget` only — `optimizePowerUps`
keeps that original, still-correct design).
