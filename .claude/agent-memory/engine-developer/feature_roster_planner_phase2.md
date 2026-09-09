---
name: feature_roster_planner_phase2
description: rosterPlanner.ts's runRosterPlanner (Phase 2 of PLAN_multi_raid_roster_optimizer.md) — the four-stage algorithm, the no-simulation relevance proxy, THREE real defects found on a real 164-species/13-boss sweep and fixed 2026-09-09 (pooled noise floor, scale-mismatched zero-score fallback, dilution/no-diversity), compute budget confirmed, and the teamRaid.ts bossMaxHpOverride gap flagged for a future session
metadata:
  type: project
---

`packages/engine/src/rosterPlanner.ts` implements Phase 2: `runRosterPlanner` ranks power-ups
across a LARGE roster (100-200 pool entries) against a SET of raid bosses, surfacing whether a
currently-BENCHED Pokémon would beat a fielded one if powered up. Built entirely as an
orchestration layer over `runTeamRaid`/`runSustainedComparison`/`powerUp.ts` — zero new combat
math except one deliberate, documented exception (see "the relevance proxy" below).

**Why:** delegated by the overseer while a parallel session had uncommitted work in
`simulate.ts`/`comparison.ts`/`speciesReport.ts`/`teamRaid.ts`/`types.ts` — this module only
imports from those, never edits them. The only shared-file edits were exporting two
already-existing PRIVATE helpers from `powerUp.ts` (`summarizeResults`, `noiseFloorFor` — a bare
`export` keyword addition, zero behavior change) so this module could reuse them verbatim instead
of re-deriving the same noise-floor/summary formulas a second time, and appending one line to
`index.ts`.

**How to apply:** read before touching `rosterPlanner.ts`, `powerUp.ts`'s exports, or Phase 4
(`planRosterBudget`, deferred — same module, joint fixed-budget allocation, explicitly NOT built
this phase).

## The four-stage algorithm, condensed

1. **Screen** (Stage 1): one `runSustainedComparison` call per (pool entry, boss) at the entry's
   CURRENT level, low iterations (default 4). Score = `meanTotalDamage / (meanSecondsSurvived +
   swapCostSeconds)` — damage per second of raid clock consumed, not raw damage. Memoized by
   `(entryId, level, targetIndex)`.
2. **Team selection** (Stage 2): top 6 by score, skipping any `canMega` entry beyond the first
   (`runTeamRaid`'s own "at most one mega slot" validation would otherwise throw).
3. **Candidate generation** (Stage 3): every OTHER eligible entry's every USEFUL level
   (`usefulPowerUpLevelsAbove`, union across ALL bosses, bounded by `maxLevel` and stardust
   affordability) is offered as ONE direct jump from its current level — never a forced chain of
   half-steps. This structurally avoids `powerUp.ts`'s own `candidateLevelsPerSlotPerRound`
   regression (see `fix_powerup_budget_candidate_window.md`) by construction, since there's no
   per-round cap here at all.
4. **Paired evaluation** (Stage 4): baseline team simulated once per boss over `iterations` paired
   seeds (common random numbers); each candidate that "touches" a boss gets that boss's team
   re-simulated with the candidate's entry swapped in/leveled up, over the SAME seeds, memoized on
   TEAM COMPOSITION (ordered `entryId@level` list) not candidate identity. An untouched boss
   contributes a real, computed 0 with ZERO `runTeamRaid` calls.

`meanDeltaTeamDps` is the weighted mean across the FULL `perBoss` array (every target, not just
touched ones) — a candidate that only helps 2 of 30 bosses correctly reads as a small overall
number.

## The relevance proxy — the one deliberate "new math" exception, and a real bug found in it

Re-running Stage 1's simulated screen at every (entry, candidate level, boss) combination would
cost roughly 15-30x the plan's own budgeted Stage-1 cost (a candidate has ~10-20 useful levels;
nothing in the plan's compute-budget arithmetic accounts for that multiplier) — genuinely
unbudgeted. Resolution: a cheap, PURE-ARITHMETIC proxy reusing `powerUp.ts`'s own
`powerUpLevelMetrics` (never a new damage/energy formula, just division by an existing field):

```
proxyDps(level) = outgoingFastDamage / fastMove.durationSeconds
                 + outgoingChargedDamage / chargedMove.durationSeconds
```

An entry's ALREADY-simulated Stage 1 screen score is scaled by this proxy's own ratio
(`newProxy / currentProxy`) to estimate the new level's screen score — keeping the estimate on the
same simulated scale as every other entry's real Stage 1 score, rather than comparing an
arithmetic proxy directly against a simulated one.

**Real bug found and fixed during verification** (not hand-arithmetic — via a throwaway script,
per this project's discipline): the original guard only checked `currentProxy > 1e-9` before
computing `currentScreenScore * ratio`. When an entry's CURRENT level's real simulated screen
score is exactly 0 (a common case for a genuinely benched, very-low-level entry — e.g. it dies
before landing a single complete hit, so `meanTotalDamage` is 0 even though its floored per-hit
damage isn't), multiplying 0 by any finite ratio stays 0 — completely hiding the "benched Pokémon
becomes competitive after leveling" case this whole module exists to surface. Fix: the guard now
also requires `currentScreenScore > 1e-9`; when either the current score or proxy is ~0, fall back
to the new level's raw proxy value directly (`Math.max(currentScreenScore, newProxy)`) instead of
scaling a zero. Confirmed via a hand-built fixture (WEAK_BENCH_SPECIES at level 1 vs 6 identical
STRONG entries fielded at level 25): before the fix, `bossesNewlyFielded` was always empty no
matter how far the entry was powered up; after, it correctly enters at level ~29+ with a real,
large positive delta.

**Known minor inefficiency, not a bug**: a `canMega` entry that's estimated "touched" (its score
would clear 6th place) can still fail to actually enter a team during Stage 4's real
`selectTeam` reconstruction if a DIFFERENT, better-scoring `canMega` entry already occupies the
one mega slot — the arithmetic touched-check doesn't account for the mega cap. Consequence: an
occasional wasted `runTeamRaid` call (compute cost only), never a wrong answer — Stage 4's own
`selectTeam` is the final authority and correctly reports `deltaTeamDps: 0, rankAfter: null` in
that case. Left unfixed this phase (correctness > cost when only 3-4 real megas are typically in
a pool); a future session could add a cheap pre-check for it if profiling shows it matters at
real 164×30 scale.

## Confirmed compute budget

Measured directly (not estimated) on a randomized 164-entry pool × 30-boss target set (mix of
real megas/non-megas from `data/normalized/species.json`, screenIterations=4, iterations=5):
**~1.2-1.3 seconds**, comfortably under the plan's <4s target. The two stated optimizations both
mattered: without team-composition memoization (Stage 4) a run this size would re-simulate many
identical rosters redundantly; without the untouched-boss skip, every candidate would pay for
every boss regardless of relevance.

## A real gap found, NOT fixed (flagged for whoever owns `teamRaid.ts` next)

`SpeciesReportBossTarget.bossMaxHpOverride` (a real, sourced historical-HP figure for an archived
boss target) is honored by `SustainedComparisonInputs.bossMaxHpOverride` (Stage 1's screen) but
`TeamRaidInputs` has NO equivalent field at all — `runTeamRaid` always computes `bossHp` internally
via `bossEffectiveHp(boss, bossRaidTier)` with no override parameter, so ITS OWN clear-timer
detection (`outcome`/`clearsWithinTimer`/`timeToClearSeconds`) cannot honor an override no matter
what a caller passes. `rosterPlanner.ts` mitigates this partially — it computes its OWN `bossHp`
via `bossEffectiveHp(target.species, target.tier, target.bossMaxHpOverride)` for the
`summarizeResults` call (only affects the non-cleared fallback branch's denominator) — but a run
that DOES clear still clears against the wrong (today's-tier) HP internally. `teamRaid.ts` needs
the same `bossMaxHpOverride` hook `comparison.ts`'s `SustainedComparisonInputs` already has. This
only matters when a multi-raid sweep includes historical/archived bosses (`WeightedRaidTarget`
extends `SpeciesReportBossTarget`, so it's reachable) — not an issue for a pool swept only against
today's active raids.

## Three real defects found (by a review session) and fixed (2026-09-09)

A review session ran `runRosterPlanner` against the REAL 164-Pokémon roster and 13 live raid
bosses (`data/normalized/activeRaids.json`) and found the module produced NO usable output —
every candidate read "no measurable change." Verified all three myself before fixing (this
project's own discipline: never trust a bug report's numbers without reproducing them).

**1. The pooled noise floor measured BETWEEN-BOSS spread, not noise.** The original
`noiseFloorTeamDps` pooled every boss's raw `teamDpsPerSeed` into one sample and took its
`stdDev` — but baseline team DPS legitimately varies 8-92 across a 1-star vs. a 5-star boss, and
that spread is not noise (it cancels exactly in a paired per-boss delta). Measured: 2.67-9.23
depending on iteration count, driving 0-of-60 candidates significant at every iteration count
tested. **Fix:** the aggregate delta is `Σ wᵦ·δᵦ` (wᵦ = normalized target weight), so its noise is
the per-boss floors (`noiseFloorFor` applied PER boss, unchanged) combined in QUADRATURE with the
same weights — `sqrt(Σ (wᵦ·floorᵦ)²)`. Measured on the real sweep: **0.178** at 25 iterations
(20-100x tighter than the old pooled number), and demonstrably tighter than most (not all —
trivial 1-star bosses with near-zero variance can individually read tighter) individual boss
floors. `RosterPlanResult.noiseFloorTeamDps`'s doc comment now describes this correctly.

**2. The zero-score fallback returned a raw arithmetic proxy value on the wrong scale.**
`estimateScreenScore`'s original zero-baseline fallback returned `Math.max(currentScreenScore,
newProxy)` — `newProxy` is `damage/duration`, a totally different scale from every simulated
screen score (`damage / (survived + swap) seconds`) it then got compared against. Consequence on
the real sweep: a **level-1 Vaporeon read as the rank-1 fielded attacker** against a team of
level 35-40 attackers (three distinct low-level Vaporeon rows, all `rankAfter: 1`, mean delta
around -20 team DPS once actually simulated — stable across iteration counts, so not seed noise).
**Fix:** `estimateScreenScore` now returns `number | null` — `null` means "the ratio-scaling isn't
sound," and the caller (`estimateOrMeasureScreenScore`, a new shared helper used at BOTH call
sites — the Stage 3 touched-check AND the Stage 4 `selectTeam` reconstruction, both previously had
their own copy of this logic) falls back to a REAL `getScreenScore(entry, toLevel, ...)`
measurement instead — an actual, cheap, memoized simulation at the candidate level, only ever paid
for in the rare zero-score case. Confirmed via a hand-built fixture (WEAK_BENCH_SPECIES, same base
stats as a level-35 STRONG_SPECIES team, starting at level 1): every toLevel from 1.5 through 24 is
now correctly `simulated: false, rankAfter: null` (a real, computed 0) — admission only starts
around toLevel 24.5+, genuinely close to the fielded team's own level, never at an absurdly low one.

**3(a). The aggregate mean alone manufactured false negatives for a candidate that only helps
ONE boss out of many.** `meanDeltaTeamDps` correctly stays the honest "across your whole boss set"
number, but using it as the SOLE significance test hid real per-boss gains (a benched Kyurem
entering one boss's team read as "no measurable change" purely from being averaged across 12 other
untouched bosses). **Fix:** added `bestBossDeltaTeamDps`/`bestBossId` (the largest-magnitude single
`perBoss[]` entry, signed — can be negative; `null` only when every boss reads exactly 0) and
`significantBossCount` (count of `perBoss[]` entries individually clearing THAT boss's own
`noiseFloorFor(...)`), and `exceedsNoise` is now `Math.abs(meanDeltaTeamDps) > noiseFloorTeamDps ||
significantBossCount > 0`. Confirmed on the real sweep: 25 candidates have `|meanDeltaTeamDps| <=
noiseFloorTeamDps` yet `significantBossCount > 0` and correctly read `exceedsNoise: true`.

**3(b). No candidate diversity — the cap was consumed by one entry's dense level ladder.** With
`maxCandidates: 60` on the real sweep, only 8 distinct species survived (adjacent half-level rows
of the same 2-3 entries, indistinguishable by delta). **Fix:** new `maxLevelsPerEntry` input
(default 3) caps each pool entry's OWN best rows (by Stage 3's `rankProxy`) BEFORE the global
`maxCandidates` cap is applied — so the global cap represents the roster, not a few level ladders.
Confirmed on the real sweep: 21 distinct species now survive the same 60-candidate cap (vs. 8
before). One existing pinned test ("multi-level jump... never a forced chain," acceptance #3)
is deliberately about ONE entry's dense level ladder and had to pass `maxLevelsPerEntry: 500` to
opt out of the new per-entry cap — that override is legitimate, not a workaround; the test is
specifically probing single-entry level granularity, not roster diversity.

**Re-verified real-sweep numbers after all three fixes** (164-entry synthetic pool built from real
synced species, real 13-boss `activeRaids.json`, `iterations: 25`): aggregate floor **0.178**,
**34 of 60** candidates now significant (`exceedsNoise`), **21 distinct species** among 60
candidate rows, **0** suspicious low-level rank-1 admissions, wall clock **970ms** (budget ~4s).

**Scenario/web wiring note:** `maxLevelsPerEntry` is a new `RosterPlannerInputs` field with a
default — no `Scenario`-family type exists for this module yet (Phase 2 is engine-only; Phase 3,
not yet built, is the web wiring). Whoever builds Phase 3 needs to thread this through the same
way `maxCandidates`/`screenIterations`/`iterations` will need to be.

## Test-fixture note

`test/fixtures/rosterPlannerFixtures.ts` (test-only, same discipline as `hypotheticalDuo.ts`) uses
one shared moveset/type across every hand-authored attacker so ranking is isolated purely to
base-stat/level differences — same simplification `CANDIDATE_ALPHA`/`BETA` use. `STRONG_SPECIES`
is 6 byte-identical attackers so they deterministically fill a 6-slot baseline team by themselves,
which made most of the acceptance-criteria fixtures (benched-enters, changes-nothing,
multi-level-jump) constructible without hand-solving the ranking math — just tune ONE outlier
entry's level/stardust budget against the fixed 6-strong backdrop and verify the outcome via
script before pinning.
