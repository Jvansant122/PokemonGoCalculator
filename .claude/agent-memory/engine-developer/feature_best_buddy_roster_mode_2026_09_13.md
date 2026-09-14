---
name: feature_best_buddy_roster_mode_2026_09_13
description: IDEAS.md #5's roster/multi-raid Best Buddy mode, built on the strength of measurement_best_buddy_roster_mode_impact.md's BUILD recommendation — RosterEntry.isBestBuddy, RosterPlanResult.bestBuddyCandidates, RosterBudgetPlan.bestBuddyRecommendation; real teamKeyFor memoization bug found+fixed
metadata:
  type: project
---

2026-09-13. Closes the scope cut recorded in
[[feature_best_buddy_candidate_2026_09_11]] ("roster mode NOT built") using
the methodology and magnitudes already measured in
[[measurement_best_buddy_roster_mode_impact]] — no fresh measurement needed,
just faithful implementation against an already-approved recommendation.

## What shipped

- `RosterEntry.isBestBuddy?: boolean` (rosterPlanner.ts) — genuinely didn't
  exist before, confirmed by reading the interface directly (matches the
  measurement's own confirmation).
- `toSlotInput` forwards it unchanged onto `TeamRaidSlotInput.isBestBuddy`.
- `RosterPlanResult.bestBuddyCandidates: RosterBestBuddyCandidate[]` — the
  ranked-table half. One row per pool entry NOT already `isBestBuddy: true`
  that is fielded on at least one boss's BASELINE team. Every row
  independent (no one-at-a-time enforcement here), mirroring powerUp.ts's
  `PowerUpOptimizerResult.bestBuddyCandidates` exactly, including having
  **no cost/efficiency fields at all** (not `null` placeholders — the field
  simply doesn't exist on the type), same as the single-raid precedent.
- `RosterBudgetPlan.bestBuddyRecommendation: RosterBestBuddyRecommendation |
  null` — the joint-plan half. Computed ONCE, post-search, against the FINAL
  committed roster state, via `candidateClearsBudgetFloor` (the SAME
  aggregate-or-per-boss test `planRosterBudget`'s main round loop already
  uses — no parallel significance path invented). At-most-one is
  STRUCTURAL: the return type is a single nullable object, never an array,
  exactly the same trick the single-raid `bestBuddyRecommendation` already
  used successfully.
- `RosterPlannerProgressEvent.stage` gained a `"bestBuddy"` variant (additive
  union member — `packages/web`'s `rosterProgressSentence` switch already
  has a `default` case, so this doesn't break web typecheck; web wiring left
  for a future session per the task's own scope).

## SCOPE DECISION: Best Buddy candidates are evaluated ONLY for entries
already fielded on at least one boss's team — never estimated for a benched
one

Every OTHER candidate type in `rosterPlanner.ts` (a power-up level, an
evolve-then-power-up row) considers a not-currently-fielded pool entry too,
via `estimateOrMeasureScreenScore`'s cheap arithmetic-proxy-then-real-measurement
fallback. Best Buddy does NOT get this treatment, deliberately:
`screenScoreFor` (the function that proxy relies on for its real, simulated
baseline) has **no `isBestBuddy` parameter at all** — there is no cheap,
sound way to estimate "would a benched Pokémon's fixed +1-level Best Buddy
bonus alone earn it a team slot" without either (a) building a whole new
estimation path this task didn't ask for, or (b) paying for a real
simulation on every benched pool entry (100-200 on a real roster) just to
find out most of them still don't qualify. The measurement itself found the
REAL, meaningful effect lives in the already-fielded case (Dialga vs Shadow
Lampent +1.82, Darmanitan vs Shadow Sandslash +1.34 to +1.93) — this scope
cut trades away a structurally-unlikely-to-matter case (Best Buddy's small,
fixed nudge flipping bench status) for a much simpler, cheaper
implementation. Flag if a future request specifically wants "would Best
Buddy alone get this benched Pokémon fielded" — it would need a new
estimation path, not just wiring.

## Real bug found: `teamKeyFor`'s memoization cache key didn't include
`isBestBuddy` — every Best Buddy delta silently read exactly 0 until fixed

`runFullRosterCached`'s cache key (`teamKeyFor`) was `${entryId}@${level}`
only. Every candidate type this module varied BEFORE Best Buddy existed
(a power-up's `toLevel`, a benched entry's promotion) always changed
`level` too, so that key was sufficient — nothing had ever needed to vary a
per-entry field independently of level before. A Best Buddy candidate team
differs from the baseline ONLY by `isBestBuddy` at a FIXED level, so it
hashed to the EXACT SAME cache key as the already-computed baseline team,
and `runFullRosterCached` returned the cached baseline summary for every
single Best Buddy candidate — `deltaTeamDps` read a uniform, suspicious
`0.0000` across ten different boss Attack values in a scratch measurement,
which is what surfaced it (a REAL effect should vary boss to boss; it
didn't, at all). Fixed by including the flag in the key:
`${entryId}@${level}${isBestBuddy ? "+bb" : ""}`. This was 100% latent
before this session (no existing test ever set `isBestBuddy` on a
`RosterEntry`, so no prior candidate type could have tripped it) — the full
633-test suite's pass count was unchanged before/after the fix, confirming
nothing else was silently depending on the old (broken) behavior. **Lesson
for any future per-entry field added to `RosterEntry`:** if a caller can
vary it independently of `level` between two team compositions,
`teamKeyFor` must name it, or the memoization will silently collapse two
genuinely different teams into one cached result.

## Trap avoided (as instructed) — a dedicated never-clears fixture pair,
verified empirically before writing any assertion

Added `TOUGH_BOSS`/`TOUGH_BOSS_LOW_ATTACK`/`TOUGH_BOSS_HIGH_ATTACK` to
`test/fixtures/rosterPlannerFixtures.ts` (huge `baseStamina`, same
"normal"-type hand-authored family as `BOSS_ONE`/`BOSS_TWO` but never
clears against a full 6-slot `STRONG_SPECIES` team — confirmed via a
dedicated precondition test asserting `summary.clearRate === 0` and
`summary.meanTimeToClearSeconds === null`, the module-level equivalent of
the raw `TeamRaidResult.timeToClearSeconds === null` check the task named).
`BOSS_ONE`/`BOSS_TWO` themselves were left untouched (other tests in the
sibling file rely on them being clearable).

## The "significant on one boss, diluted in aggregate" test — genuinely
measured, not guessed, and non-trivial to find

First attempt (uniform 6-strong-team vs. two bosses differing only in
`baseDefense`, weight-skewed) found NOTHING across a 48-combination sweep —
identical-species Best Buddy deltas stayed too proportional across
defense values to dilute below a weight-skewed aggregate floor. Second
attempt (a 7th "borderline" entry engineered to be fielded on one boss but
not another, via boss Attack differences) DID find real touched/untouched
splits, but tripped the `teamKeyFor` bug above (every fielded-boss delta
also read 0 before the fix). After fixing `teamKeyFor`, went back to the
SIMPLEST construction — a uniform 6-strong team (trivially fielded on every
boss, exactly 6 entries for 6 slots) against two never-clears bosses
differing only in boss Attack (150 vs. 260) with an 8:1 weight skew — and it
worked immediately: boss-Attack-150 measured delta 0.105 (floor 0.037,
individually significant), boss-Attack-260 measured delta 0.006 (floor
0.025, not significant), weighted mean 0.017 vs. aggregate floor 0.022 (NOT
significant in aggregate). These exact Attack values (150/260) are recorded
in the fixture's own doc comment as measured, not derived from first
principles — a different move/level/IV combination would need re-measuring,
not just re-deriving.

## Standing multi-raid rules — confirmed undisturbed

Best Buddy has no cost at all, so it never touches candy-family pooling,
the `isFullyEvolved` exclusion gate, or the ledger (`planRosterBudget`'s
`steps`/`ledger` are asserted unchanged by a Best Buddy recommendation in
this session's own tests). The aggregate noise floor's quadrature
combination is reused verbatim (`aggregateRosterImpact`, a new shared helper
factored out of three pre-existing inline copies of the same weighted-mean/
best-boss/significant-count formula — existing call sites untouched, purely
additive).

## Files

`packages/engine/src/rosterPlanner.ts` (`RosterEntry.isBestBuddy`,
`toSlotInput`, `teamKeyFor` bug fix, `aggregateRosterImpact`/
`bestBuddyPerBossImpactFor` shared helpers, `RosterBestBuddyCandidate`/
`RosterPlanResult.bestBuddyCandidates`, `RosterBestBuddyRecommendation`/
`RosterBudgetPlan.bestBuddyRecommendation`, `RosterPlannerProgressEvent`'s
`"bestBuddy"` stage), `packages/engine/test/fixtures/rosterPlannerFixtures.ts`
(`TOUGH_BOSS`/`TOUGH_BOSS_LOW_ATTACK`/`TOUGH_BOSS_HIGH_ATTACK`),
`packages/engine/test/rosterBestBuddy.test.ts` (new, 13 tests). Full
`npm run verify` (all three vitest suites, typecheck, lint, all four
`check` scripts, production web build) passes with zero regressions;
web-side wiring (surfacing these two new fields, and the `"bestBuddy"`
progress stage) is left for `web-developer` per the task's own scope.
