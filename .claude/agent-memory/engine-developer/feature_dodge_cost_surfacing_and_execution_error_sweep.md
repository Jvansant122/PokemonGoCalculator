---
name: feature-dodge-cost-surfacing-and-execution-error-sweep
description: simulate.ts's holdChargedMoveDodgeCostSeconds/Events + sweepDodgeExecutionError (IDEAS #20/#21); declined asymmetric move delay for lack of a source; concurrent-lane pin-test ripple in a file I don't own
metadata:
  type: project
---

2026-09-10, Lane B of a 3-lane concurrent `simulate.ts`-only session (Lane A: powerUp.ts/
rosterPlanner.ts, Lane C: teamRaid.ts/teamScenario.ts). Three assigned items; two built, one
declined with reasoning. Full context in HANDOFF.md's "three concurrent engine lanes" section if
it still exists when this is read.

**IDEAS #20 — surfaced the own-charged-move-cast vulnerability cost.** The engine already computed
`HOLD_CHARGED_MOVE_DODGE_ATTEMPTS * DODGE_COST_SECONDS` inline (folded straight into
`nextAttackerFastMoveAt`) with no separate readout. Added, purely additive, zero pinned numbers
moved:
- `StepwiseRunResult.holdChargedMoveDodgeCostEvents`/`.holdChargedMoveDodgeCostSeconds` (per run).
- `DistributionSummary.meanHoldChargedMoveDodgeCostSeconds` (mean across a distribution).
Both 0 whenever `holdChargedMoveUntilSafe` is off (every existing caller). Doc comments on both
fields say explicitly, in caps, that this is still [[feature_hold_charged_move_dodge_cost]]'s
unsourced placeholder, not a confirmed mechanic — MECHANICS.md's "OPEN QUESTION" entry is
untouched. **UI wiring is NOT done** — no tab reads either field yet; whichever tab does must
caveat it, per the task's own instruction (this user distrusts a number whose error-bias direction
they can't judge, worse than not showing it at all if shown confidently).

**IDEAS #21 — dodge-execution-error sweep.** Built `sweepDodgeExecutionError` in simulate.ts: a
single-attacker-vs-boss primitive (same level as `runStepwiseDistribution`) that sweeps the
ALREADY-EXISTING `{kind:"percentage-missed", missedFraction}` `DodgeBehavior`
(`breakpoints.ts`, built for exactly this axis, apparently never actually swept anywhere before
this) across a caller-supplied or default (`DEFAULT_DODGE_ERROR_MISSED_FRACTIONS = [0, 0.1, 0.2,
0.3, 0.4, 0.5]`) list, returning one `DistributionSummary` per point — an array, deliberately not
one blended number, per this project's crossing/band discipline.

**Real finding while writing the equivalence tests**: `missedFraction=0` IS byte-identical to
`{kind:"perfect"}` at a matching seed (both RNG-free on the dodge axis), but `missedFraction=1` is
**NOT** byte-identical to `{kind:"none"}` — a real, correct mechanical distinction, not a bug.
`{kind:"none"}` never attempts a dodge against a charged hit at all (`attemptingDodge` false, no
`DODGE_COST_SECONDS` spent). `{kind:"percentage-missed", missedFraction:1}` still THROWS a dodge
input every time — it's just guaranteed to whiff — so `attemptingDodge` is true and it still pays
the ordinary attempt cost. Both endpoints deal identical incoming damage (multiplier 1 either
way, verified via `representativeRun.totalDamageTaken` equality with a boss on a fixed-interval
schedule independent of the attacker), but `missedFraction=1`'s own fast-move output is strictly
worse (`meanFastMoveDamage` provably less) — the worst point on this axis is genuinely worse than
simply never trying. Caught this by writing a "byte-identical" test that failed, not by reasoning
it out first — worth the same caution next time an endpoint of a swept axis looks like it should
equal an existing named mode.

**Pre-existing related code discovered, not duplicated**: `packages/web/src/sensitivity.ts`
already has a narrower single-flip-point "Dodge accuracy (boss charged attacks)" check (its #4)
that scans `missedFraction` on the Comparator's two-candidate ranking specifically, using
`runSustainedComparison`. That's a different question (nearest ranking flip vs. a full band across
the axis) at a different layer (two-candidate comparison vs. single attacker/boss) — complementary,
not something to merge or replace. **UI wiring for `sweepDodgeExecutionError`'s band view is NOT
done** — no tab calls it yet.

**Asymmetric move delay (item 3) — DECLINED, insufficient evidence.** MECHANICS.md's "Move delay
is applied at different ends" entry is the ONLY entry in that whole file with zero reliability tag
(`git log -S` on its introducing commit shows it landed untagged at MECHANICS.md's initial
creation) — a direct violation of that file's own stated "cite, don't assert" rule. Flagged the
entry itself (`[UNCITED — flagged 2026-09-10]`) rather than silently leaving it looking equivalent
to every sourced entry around it, and moved IDEAS.md's item 1 ("Asymmetric move delay") into the
"Removed" table with why/what-would-unblock-it, per that file's own established convention for
items that can't currently be built (renumbered the two items after it, 2->1/3->2, no content
changes to those). Did NOT touch `simulate.ts`'s actual move timing — this is a real fidelity
change that would move the fine structure of every dodge/breakpoint interaction, and "more
faithful in principle" was explicitly named in the task as insufficient on its own without a
source that survives scrutiny.

**File-ownership ripple, NOT fixed (by design)**: adding `meanHoldChargedMoveDodgeCostSeconds` to
`DistributionSummary` flows through `SustainedCandidateResult extends DistributionSummary`
(comparison.ts — untouched, inherits automatically via `extends`) into
`rosterPlanner.test.ts`'s deliberate "signature pinning" test, which enumerates the exact expected
key set of that type specifically so a new field forces a conscious decision by rosterPlanner.ts's
owner (Lane A). Did NOT edit that test file (don't own it) — left the one-line fix (add
`"meanHoldChargedMoveDodgeCostSeconds"` to the expected sorted array) for Lane A. Also observed,
concurrently and unrelated to my own changes, a SECOND failure in the same pin-test file
(`TeamRaidSlotResult` gaining a `slotId` field) — that one is Lane C's `teamRaid.ts` work landing
in the same shared worktree, not mine; flagged for visibility only, not investigated further.

Files: `packages/engine/src/simulate.ts` (both new fields + `sweepDodgeExecutionError` +
`DodgeErrorSweepPoint` + `DEFAULT_DODGE_ERROR_MISSED_FRACTIONS`), `packages/engine/test/
simulate.test.ts` (6 new tests: 2 extending the existing holdChargedMoveUntilSafe describe block,
1 new meanHoldChargedMoveDodgeCostSeconds describe block, 5 new sweepDodgeExecutionError describe
block — some counted above already existed as extensions not new its), `MECHANICS.md`, `IDEAS.md`.
Full `npm run test:engine`: 541 total (was 535), 539 passed / 2 failed — both failures isolated to
`rosterPlanner.test.ts`'s pin test, both out-of-lane (one from this change, one from Lane C's
concurrent work), neither in a file this session touched or owns.
