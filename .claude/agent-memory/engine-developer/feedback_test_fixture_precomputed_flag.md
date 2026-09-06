---
name: feedback-test-fixture-precomputed-flag
description: When adding SpeciesDefinition.statsArePrecomputed, every hand-authored ad-hoc boss fixture across the WHOLE test suite needed the flag too, not just the 4 product hypothetical fixtures the task named
metadata:
  type: feedback
---

While implementing real per-tier raid-boss stats ([[fact-raid-boss-tier-math]]), the incoming task
said to set the new `statsArePrecomputed` flag "only on the existing 4 hypothetical boss fixtures"
(`fixtures/scenarioA.ts`). Taking that literally broke ~10 other tests across
`comparison.test.ts`/`sustainedComparison.test.ts`/`teamRaid.test.ts`: every one of those files also
hand-authors its own throwaway `SpeciesDefinition` boss literals (e.g. `fireBoss`, `test-boss`,
`normalBoss`, `boost-gating-test-boss`, `weak-boss`, `two-slot-boss`, ...), and those numbers were
ALSO authored under the "this literal number IS the effective boss stat" assumption (round
attack/defense values, `baseStamina` used directly as HP in `teamRaid.test.ts`) — semantically
identical to the 4 product fixtures, just never given the vocabulary to say so before this flag
existed.

**Resolution**: added `statsArePrecomputed: true` to every one of those test-only boss fixtures
too. This is not "quietly weakening an assertion" — it's applying the new flag correctly per its
own documented meaning (already-final boss-effective numbers) to data that has always had that
property, just implicitly. The alternative (leaving them unflagged) would have meant recomputing
dozens of unrelated pinned expected-value assertions (STAB gating, weather boosts, dodge behavior)
under the real tier formula for no reason connected to what those tests actually check.

**How to apply**: any future change to boss-stat derivation must audit the WHOLE test suite for
ad-hoc `SpeciesDefinition` boss literals, not just the named product fixtures — grep for
`boss[:,]|Boss[:,]` across `packages/engine/test/` first, the way this change did, before assuming
a task's fixture list is exhaustive.
