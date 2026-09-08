---
name: fix-boss-charged-move-cadence-floor
description: simulate.ts's physical floor on boss charged-move cadence (can't recast before the last cast finishes), why it must clamp the sampled interval not the mean, and the exact new observable fields
metadata:
  type: project
---

Fixed 2026-09-08: `StepwiseBoss.chargedMoveMeanIntervalSeconds` was user-adjustable with no floor
relative to the boss's own charged move `durationSeconds`. A cadence shorter than the cast time
(e.g. Regirock's 2.5s Stone Edge requested at 2.0s) produced back-to-back/overlapping casts with
no gap to dodge into — `dodge: perfect` became byte-identical to `dodge: none` with no error or
indication. Confirmed empirically before fixing: dodge started mattering at exactly the move's own
`durationSeconds`, not below it.

**The fix, in `simulate.ts`**: a new exported helper
`boundedJitteredChargedMoveInterval(meanSeconds, minSeconds, rng): { seconds, wasClamped }` wraps
the existing (still-private) `jitteredInterval`, clamping the POST-jitter sample up to `minSeconds`
via `Math.max`. Applied at both places `jitteredInterval` was previously called directly for the
boss's charged move (the initial `warmup + interval` computation, and the loop's re-fire
computation) — `minSeconds` is always the resolved `boss.chargedMove.durationSeconds`.

**Why post-jitter, not the mean**: clamping only the mean (`Math.max(mean, duration)`) still lets
the +/-40% jitter sample as low as `0.6 * clampedMean`, which can still be below `duration` when
`clampedMean` is close to it. Only a post-jitter clamp actually guarantees the invariant "a boss
can't begin a new cast before the last one finished." This was flagged explicitly by the requester
and is the one design point that isn't a judgment call — it's the only guarantee that works.

**Why `durationSeconds` alone, not duration + one fast-move cycle**: a real boss does interleave
fast attacks between charged moves, so the true minimum gap is probably larger in practice — but
there's no sourced constant for how much larger without inventing a padding number. `durationSeconds`
alone is the defensible, minimal, purely-physical floor ("can't recast before the last cast
finished"); anything more would be fabricated. Went with this after the requester explicitly asked
for a judgment call on it, not just instructions.

**New observable fields (for `web-developer` to surface a "requested cadence was physically
impossible; clamped" message)**:
- `StepwiseRunResult.bossChargedMoveCadenceClamped: boolean` — true if at least one sampled
  interval in THIS run was clamped. Always false when the boss has no charged-move timing
  configured.
- `DistributionSummary.bossChargedMoveCadenceClamped: boolean` — OR across every run in the
  distribution (flows straight into `SustainedCandidateResult` via its `extends DistributionSummary`
  — zero `comparison.ts` changes needed, the spread already carries it through).
- `DistributionSummary.bossChargedMoveEffectiveMinIntervalSeconds: number | null` —
  `Math.max(chargedMoveMeanIntervalSeconds, chargedMove.durationSeconds)`, a config-level fact (not
  an observed sample mean), null when the boss has no charged-move timing configured. Lets a caller
  build "requested Xs is below this move's Ys cast time; using Ys" without re-deriving it.

**Existing-test fallout**: two pre-existing `simulate.test.ts` tests
(`holdChargedMoveUntilSafe`/`ChargedMove.perfectlyDodgeable`) used a `chargedMoveMeanIntervalSeconds`
(0.5) below their synthetic boss charged move's `durationSeconds` (1 and 100 respectively) purely
as a timing-convenience artifact unrelated to what they were actually testing. Retuned those
`durationSeconds` values down to 0.2 (below the mean's lowest possible jittered sample, 0.3) so the
new clamp is a no-op there and every pinned number in those two tests is unchanged — this is NOT a
case of "silently weakening an assertion," the tests' own premises were the physically-impossible
scenario this fix targets. Confirmed via full run: all 186 pre-existing tests pass byte-identical;
Scenario A/B and every `bossChargedMoveMeanIntervalSeconds` value elsewhere in the suite (8-40s
against 2.2-3.5s real fixture durations) was already safely above the floor.

**New tests**: `simulate.test.ts`'s `boundedJitteredChargedMoveInterval` describe block (direct
unit coverage with an injected deterministic `rng`) plus a `physically impossible boss
charged-move cadence` describe block — the key trick is picking a mean whose highest possible
jittered sample (`mean * 1.4`) is still below the move's duration, which makes the clamped interval
fully deterministic every run regardless of seed, so exact tick-level assertions are possible
without a statistical distribution. Covers two different boss charged-move durations (2s, 4s), not
a single hardcoded number.

See also [[fact-raid-boss-tier-math]] for the sibling "don't fabricate a constant" precedent
(HP-vs-effectiveStat), and [[investigation-stepwise-tick-timing]] for other tick-timing invariants
in this same file.
