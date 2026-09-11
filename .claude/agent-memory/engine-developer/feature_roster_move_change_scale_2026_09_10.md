---
name: feature_roster_move_change_scale_2026_09_10
description: rosterMoveChange.ts's runRosterMoveChangeCandidates — roster-mode TM candidates (PLAN_tm_move_change_optimizer.md "Both modes"), FIELDED via tmMove.ts's existing generators unchanged, BENCHED via a cheap arithmetic prefilter + capped real sim; measured ~1s at realistic 164x13 scale, far cheaper than feared
metadata:
  type: project
---

Finishes the last unbuilt piece of `PLAN_tm_move_change_optimizer.md`'s "Both modes, not just
single-raid" section — second-charged-move and Elite TM candidates swept across a whole roster
pool x boss set, mirroring `rosterPlanner.ts`'s generalization of single-raid power-up candidates.

## New file: `packages/engine/src/rosterMoveChange.ts`

Deliberately a SEPARATE file from `rosterPlanner.ts` (mirrors `tmMove.ts` sitting alongside
`powerUp.ts`) rather than growing `runRosterPlanner` further. `runRosterMoveChangeCandidates`
takes `baselinePerBoss` as a caller-supplied input (pass `RosterPlanResult.baselinePerBoss`
straight through) rather than recomputing Stage 1+2 itself — avoids a second expensive baseline
pass and guarantees "who's fielded" answers the SAME question the power-up sweep already did.

**FIELDED case**: reuses `tmMove.ts`'s existing `generateSecondChargedMoveCandidates`/
`generateEliteTmCandidates` completely unchanged (both were already generic over
`TeamRaidInputs`/`TeamRaidSlotInput` specifically so this would be possible without editing
tmMove.ts at all — confirmed and exploited). Bounded search space (at most 6 slots x
targets.length), always run in full.

**BENCHED case** (the plan's headline "not limited to the six already fielded" requirement) needed
genuinely different mechanics — `generateSecondChargedMoveCandidates`/`generateEliteTmCandidates`
assume the candidate's species is ALREADY in the evaluated slot (their baseline is built from
`inputs.slots` as-is), which is wrong for "would swapping this NOT-fielded entry in beat the
current team" (the baseline needs to be the REAL current team, weakest member included). Built
directly on the lower-level primitives those functions themselves compose
(`runTeamRaid`/`summarizeResults`/`noiseFloorFor`), evaluating "replace the boss's team's weakest
(6th, by fielding-order convention) slot with this benched entry + candidate move" as a real paired
simulation — never routed through tmMove.ts's "one field of an EXISTING slot" model.

**Cheap prefilter before any benched real simulation**: a self-contained
`benchedProxyDamagePerSecond` (same `powerUpLevelMetrics`-based arithmetic composition as
rosterPlanner.ts's own private `proxyDps`, deliberately NOT imported/coupled to it — 2-line
duplication judged cheaper than cross-file coupling for something this small) compares a
candidate's proxy DPS with the ALTERNATE move against the boss's weakest fielded member's proxy
DPS with its OWN CURRENT move — both arithmetic-only, apples-to-apples, no simulation. Only
positive-gain survivors get a real paired sim, globally capped
(`maxBenchedRealEvaluations`, default 60) — same "screen cheap, confirm real, cap globally"
discipline `runRosterPlanner`'s own Stage 3/benched logic already uses.

## New `RosterEntry` field (rosterPlanner.ts, since RosterEntry lives there)

`knownChargedMoveIds?: string[]` — 1 entry = known single charged move (second-charged-move
eligible), 2 = already knows both (nothing to buy), `undefined` = unknown COUNT (excludes from
second-charged-move specifically, even if the entry's single ACTIVE move is otherwise known —
a plain `chargedMoveId` can't distinguish "only knows this one" from "knows this one plus a second
we have no record of"). Elite TM doesn't need this field at all — it only needs
`!entry.movesetIsDefaulted` (the currently-active move is always resolvable; the question is only
whether it's TRUSTED). This split produced a real, deliberately-tested case: an entry can be
excluded from second-charged-move alone while still generating real Elite TM candidates.

## The "known moveset" rule applies uniformly, tested explicitly

Every candidate (both actions, both fielded/benched) is gated on
`RosterEntry.movesetIsDefaulted`/`knownChargedMoveIds`, reported via `RosterMoveChangeResult.excluded`
— never silently smaller. Roughly a third of a real Poke Genie import has a blank move column, so
this exclusion is large and visible by design, matching the plan's central rule.

## Ranking axis (CLAUDE.md standing decision, mirrored from tmMove.ts's own single-raid split)

`secondChargedMove` (stardust+candy, shares the SAME resource ledger a power-up does — the plan's
own words) and `eliteTm` (TM ITEMS, a third/fourth non-fungible currency) are two ENTIRELY SEPARATE
output arrays — never merged, never cross-ranked. Each candidate's own `affordable` field answers
"could I buy JUST this" (same "priced independently" convention as `RosterPowerUpCandidate.affordable`).

## Deliberate scope cut: NO joint budget allocator

`runRosterMoveChangeCandidates` only answers the ranked-table question (mirrors `optimizePowerUps`/
`runRosterPlanner`'s own "priced as if independent" convention) — does NOT fold into
`planRosterBudget`'s joint stardust/candy/Rare-Candy allocator. Building a joint allocator spending
stardust, candy, Rare Candy, Elite Fast TMs and Elite Charged TMs together in ONE greedy search is
real rearchitecture on the same order as the evolve-then-power-up commit question `rosterPlanner.ts`
already declined for `planRosterBudget` (see
[feature_evolve_then_powerup_hypothetical_catch_onprogress](feature_evolve_then_powerup_hypothetical_catch_onprogress.md)).
Flagged explicitly, not attempted.

## Measured, not estimated (the task's explicit "measure before committing" instruction)

Real 164-entry pool (real synced species, deduped-cycled) x 13 real bosses, via a throwaway
`packages/engine/test/_scratch_measure.ts` (deleted after use — same pattern as the perf-suite's
own scratch-script convention): FIELDED-only 708ms (3171 real `runTeamRaid` calls), WITH-BENCHED at
the default cap (60) 808ms, at a generous cap (200) 942ms. **All well under a second** — far
cheaper than the plan's own "may be infeasible, measure before building" worry anticipated. No
worker/async chunking needed at this scale (unlike `rosterPlanner.ts`'s own sweep, which the web
layer already runs in a worker regardless).

## Files

`packages/engine/src/rosterMoveChange.ts` (new, ~450 lines), `packages/engine/src/rosterPlanner.ts`
(`RosterEntry.knownChargedMoveIds`), `packages/engine/src/index.ts` (`export *` line added, no
collision), new `packages/engine/test/rosterMoveChange.test.ts` (12 tests) +
`packages/engine/test/fixtures/rosterMoveChangeFixtures.ts` (multi-move species fixtures —
rosterPlannerFixtures.ts's own species deliberately carry ONE move each, irrelevant to what those
tests check, so a separate fixture file was needed rather than extending that one). Suite
581 -> 593, both typecheck configs clean, lint clean.

**A real test-design mistake I made and fixed**: my first draft of the "excludes a fielded entry"
tests APPENDED a 7th pool entry expecting it to be fielded — wrong, since `runRosterPlanner`'s own
team selection doesn't guarantee an appended entry displaces one of an already-full 6-slot team.
Fixed by REPLACING one of the 6 team members instead. Worth remembering for any future
roster-scale test: "fielded" is never guaranteed by mere pool membership, only by winning the
actual team-selection comparison.

## Not done — flagged for the coordinator to route

`web-developer`'s half (UI, `Scenario` round-trip for `eliteFastTmOnHand`/`eliteChargedTmOnHand`,
worker wiring) is untouched — this memory covers the engine half only.
`PLAN_tm_move_change_optimizer.md` was NOT deleted (left for whoever ships the web half, per that
file's own "delete when it ships" instruction).
