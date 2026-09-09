---
name: feature_roster_planner_phase4_budget
description: rosterPlanner.ts's planRosterBudget (Phase 4, joint fixed-budget allocator over a pool x boss set) — two real scale bugs found and fixed via a cheap-proxy candidate selector, replacing round-robin-by-depth
metadata:
  type: project
---

Implemented `planRosterBudget` in `packages/engine/src/rosterPlanner.ts` (2026-09-09) — Phase 4 of
`PLAN_multi_raid_roster_optimizer.md`, generalizing `powerUp.ts`'s `planPowerUpBudget` greedy round
loop from "6 fixed slots vs one boss" to "N pool entries (100-200) vs M weighted bosses." Exported
types: `RosterBudgetInputs`, `RosterBudgetStep`, `RosterBudgetFinalLevel`,
`RosterBudgetResourceLedgerEntry`, `RosterBudgetCandyFamilyLedgerEntry`, `RosterBudgetLedger`,
`RosterBudgetBlockedCandidate`, `RosterBudgetPlan`, `planRosterBudget`.

**Why:** `runRosterPlanner`'s ranked table prices each candidate independently ("as if it were the
only purchase"); `planRosterBudget` answers the joint "here's my stardust/candy, what should I
actually buy" question — same two-questions split `optimizePowerUps`/`planPowerUpBudget` already
established for the 6-slot tab, per CLAUDE.md's standing decision not to merge them.

## Two real scale bugs found and fixed (both verified on a real 164-species x 13-boss sweep, never hand-derived)

1. **Round-robin-by-depth (the 6-slot ancestor's own candidate-selection mechanism, explicitly
   named in the task spec) does not scale to a pool.** At 6 slots, depth-0-alone (every slot's
   nearest candidate) is only 6 items — a 60-candidate round cap reaches ~10 levels deep per slot,
   plenty for a multi-level jump. At 164 entries, depth-0-alone is already 164 items, so a
   60-candidate cap is exhausted before ANY entry gets a look at its 2nd-nearest level, let alone a
   deep jump — a real Gengar 30->49 jump was silently unreachable this way. Fixed by replacing
   `interleaveCandidatesRoundRobin` (kept private in powerUp.ts, unused by this module) with
   `selectTopCandidatesByProxy`: rank every entry's own candidates by a cheap arithmetic proxy,
   keep each entry's own top `candidateLevelsPerEntryPerRound` (default 5), then globally
   proxy-rank the survivors and cap at `maxCandidatesPerRound` — a genuinely valuable deep jump
   scores highly on the proxy and survives both cuts, unlike a pure-position cut.
2. **A per-stardust-efficiency pre-filter also silently excludes the single most valuable
   candidate.** My first fix (above) still divided the ranking proxy by `cost.stardust` — but the
   noise floor a candidate must clear to be committable is an ABSOLUTE bar, not a per-stardust one,
   so "value per stardust" ranks a cheap tiny candidate above an expensive-but-huge one even when
   only the huge one can ever clear the floor. A real ~1.8 team-DPS Entei 29->50 jump never reached
   a real simulation because many tiny, individually-worthless candidates scored "more efficient."
   Fixed by making the PRE-FILTER proxy rank by absolute weighted improvement only (no cost
   division) — the cost-fraction knapsack scalarization is still used, but only AFTER real
   simulation, to pick the winner among candidates that already cleared the floor.
3. The proxy itself is anchored against each entry's REAL, already-cached current screen score
   (`estimateScreenScore`'s scaling technique, reused verbatim from `runRosterPlanner`'s Stage 3),
   not a raw un-anchored `proxyDps` delta — a raw delta comparison across species is scale-mismatched
   (see `real_vs_hypothetical_fixture_tradeoff` and `runRosterPlanner`'s own Defect 2 regression for
   the same class of bug in a different spot).

**How to apply:** if a future "pool-scale" feature reuses `planPowerUpBudget`'s round-robin-by-depth
pattern, check the pool size first — that mechanism is only correct when candidate-list-count is
small relative to the round cap. At pool scale, rank by a cheap ABSOLUTE (not per-cost) proxy,
diversify per-entry, THEN globally cap.

## Other design decisions made explicitly (documented in code, worth remembering)

- **Acceptance is "aggregate floor OR per-boss floor," but POSITIVE-only for the COMMIT gate**
  (`candidateClearsBudgetFloor`), unlike `RosterPowerUpCandidate.exceedsNoise`'s literal
  abs-based OR (which also flags "measurably hurts" as significant — fine for a read-only ranked
  row, wrong for a planner about to spend real resources). `significantBossCount` on
  `RosterBudgetStep` still mirrors `exceedsNoise`'s abs-based definition for reporting/audit
  consistency; only the internal commit gate diverges, and every positive per-boss clearance is
  automatically also counted by the abs test, so they never disagree about a genuine gain.
- **Team selection always uses the FULL pool; only Stage-3-style candidate generation is
  restricted to eligible entries.** An `isFullyEvolved === false` or unknown-candy-family entry
  can still be fielded (it just never becomes a power-up candidate) — this is why the
  `bestBlockedCandidate` non-null test needed the FIELDED team's own candy to be UNKNOWN (excluded
  from budgeting) rather than just giving it 0 candy; otherwise the fielded team keeps leveling up
  every round and the competitive bar a benched entry needs to clear keeps rising too, and nothing
  ever gets "blocked" in a findable way within a bounded search.
- Screen-score/metrics/proxy caches are ALL keyed by (entryId, level, targetIndex) — pure
  functions independent of every OTHER entry's level — so they persist correctly across the WHOLE
  round loop (not just one round), which is most of why a round after the first stays cheap: only
  the ONE just-committed entry's touched-target scores/teams/floors need recomputing.
- Ledger is keyed by `candyFamilyId` (`RosterBudgetLedger.candyByFamilyId`), never per-entry —
  own-family-first-then-shared-pool spending verified via a dedicated test where two pool entries
  deliberately share one family.

## Measured performance (real 164-entry pool x 13 real active-raid bosses, screenIterations=4,
iterations=5, seed=1)

- Realistic tight budget (500k stardust, 500/200 candy per family, 100/50 shared Rare
  Candy(XL)): **~3.2s**, 3 steps committed, real `bestBlockedCandidate` found (Shiftry).
- Generous/unlimited-ish budget (5M stardust, 5000/2000 candy per family): **~10.5s**, 10 steps
  committed (Entei, Gengar, Mewtwo, Shiftry, Gardevoir, Lugia, Charizard, ...), converges via
  `no-significant-candidate`. Both comfortably under the plan's ~15s target — re-measure if
  `maxRounds`/`maxCandidatesPerRound` defaults ever change.

## Deferred / not built here

`teamRaid.ts`'s missing `bossMaxHpOverride` hook (flagged in `feature_roster_planner_phase2`) still
applies identically to `planRosterBudget` (it calls the same `runFullRosterCached` -> `runTeamRaid`
path) — not re-flagged separately, same gap, same reason (teamRaid.ts off-limits this phase per
the plan's §3.5 parallel-session file partition).
