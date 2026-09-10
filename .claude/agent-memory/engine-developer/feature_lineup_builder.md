---
name: feature_lineup_builder
description: lineupBuilder.ts's runLineupBuilder (PLAN_lineup_builder.md's engine half) — two-stage shortlist+beam search, a real one-mega filler bug found and fixed, measured performance, and the runner-up/margin design
metadata:
  type: project
---

Implemented `packages/engine/src/lineupBuilder.ts` — `runLineupBuilder`, the order-aware promotion
of `rosterPlanner.ts`'s internal `selectTeam` (which was score-only and order-blind). Answers
"which up to 6 of my own roster, in what order, against this ONE boss" — engine-only, per the
task's explicit scope; `packages/web`/`scripts/` untouched.

**Search shape actually implemented** (validated the plan's suggestion, kept it as-is):
1. **Stage 1 screen**: one `runSustainedComparison` call per pool entry (own level, alone vs. the
   boss), same score formula as `rosterPlanner.ts`'s Stage 1
   (`meanTotalDamage / (meanSecondsSurvived + swapCostSeconds)`). Returned in full as
   `screenedPool` (every entry, descending) — `shortlist` is just its top `shortlistSize` (default
   15) slice, so "what the search rejected" is directly visible, not just implied.
2. **Stage 2 — beam search, one slot at a time**: for each beam state (partial ordered lineup),
   every still-eligible shortlisted candidate is scored by projecting the FULL lineup
   (`committed + candidate + FILLER`, filler = best remaining shortlisted entries by their static
   Stage 1 score) through `runTeamRaid`, averaged over `iterations` (default 3) paired seeds. This
   lookahead score is used ONLY to rank candidates during search — every reported number comes from
   a separate, real, filler-free final evaluation of each surviving terminal lineup.
   `beamWidth: 1` reproduces the plan's own math exactly (15+14+13+12+11+10 = 75 lookahead sims for
   a 15-entry shortlist/6 slots) — confirmed by construction, not just estimated.

**Default `beamWidth` is 2, not 1** — deliberate deviation from the plan's minimum suggestion.
Beam width 1 is pure greedy and can never produce a genuine alternative full lineup to report as a
runner-up (CLAUDE.md's whole thesis is "where does the ranking flip," not just who's on top), so a
width-1 search structurally cannot satisfy the task's own "report the runner-up and margin"
requirement. `runnerUp`/`margin` are `null` only when the search legitimately produces one
surviving lineup (explicit `beamWidth: 1`, or a pool/mega-constraint too small for a second
distinct ordering) — tested explicitly.

## Real bug found (via the one-mega-constraint test, not by inspection)

`pickFiller` originally accepted a single `megaUsed` boolean (whether the committed prefix + the
candidate being tested already used the one mega slot) and used it as a static filter for the
WHOLE filler pass. That's wrong: the filler-selection loop itself can pick a `canMega` entry as
ITS OWN first pick, and nothing stopped it from then also picking a SECOND, different `canMega`
entry later in the same filler pass (both entries individually eligible per the STARTING flag,
which never updated as filler accumulated). Consequence: `runTeamRaid`'s own "at most one
Mega-Evolved slot" validation threw mid-search, from inside a lookahead evaluation, whenever two
strong mega candidates both screened well and neither was the state's own committed candidate yet.
Fix: `pickFiller` now tracks `megaAlreadyPicked` as a local, mutable flag updated as it fills, not
just the caller-supplied starting value. Confirmed via `lineupBuilder.test.ts`'s "never fields more
than one canMega entry, even when two would otherwise screen well" test, which failed with the
exact `runTeamRaid` validation error before the fix and passes after.

## Order-search correctness — verified against full brute force, not just plausibility

Built a tuned fixture (`test/fixtures/lineupBuilderFixtures.ts`'s `CLOSER`/`WEAK`/`ORDER_BOSS`, via
a throwaway scratch script, never hand arithmetic) where fielding one specific attacker FIRST
clears the boss in ~15.1s vs. ~43.0s fielding it LAST (same 6-entry roster, only reordered) — a
>2x swing purely from order. `lineupBuilder.test.ts` brute-forces all 720 orderings of that 6-entry
roster (same seed, same score formula `summarizeResults` itself uses) and confirms
`runLineupBuilder`'s winner order matches the TRUE global optimum EXACTLY (`toBeCloseTo(...,  9)`)
— not just structurally plausible, but numerically optimal on this case. No gap to report; if a
future change to the search ever regresses this, the task's own instruction applies: replace the
exact-match assertion with an explicit gap% assertion and say so, don't silently loosen it.

## Measured performance (real 164-entry pool vs. one real boss, via scratch script — not perf.test.ts, see below)

164 real synced species (160 non-mega + 4 real mega/primal) vs. Mewtwo, default settings
(`shortlistSize: 15`, `beamWidth: 2`, `iterations: 3`, `screenIterations: 4`): **~146ms**. Far
cheaper than `rosterPlanner.ts`'s Stage 1+4 (which sweeps MANY bosses, not one) — this module only
ever targets one boss per call, matching the plan's "single trainer vs. one raid" framing.
Comfortably fits on the UI thread for a single build action; a worker is not obviously required at
this measured cost, though `web-developer` should re-measure once real UI wiring exists (debounce
behavior, whether it's triggered on every keystroke vs. one explicit "build" action, matters more
than this module's own raw cost).

**Deliberately NOT added to `perf.test.ts`** — same precedent as `rosterPlanner.ts`
(`feature_roster_planner_phase2`/`phase4` memory: that module also has zero `perf.test.ts`
coverage, measured manually instead). Both modules' costs are dominated by how many
bosses/candidates a CALLER chooses to sweep, which isn't a fixed "hot path" shape the coarse
10x-budget guard is meant for.

## Exported shape (packages/web's follow-up will need this)

`runLineupBuilder(inputs: LineupBuilderInputs): LineupBuilderResult`. Key output fields:
`screenedPool`/`shortlist` (search transparency), `winner`/`runnerUp: LineupCandidateResult | null`
(each has `slots: LineupSlot[]` — `entryId`/`speciesId`/`speciesName`/resolved
`fastMoveId`/`chargedMoveId`/`level`/`ivs`/`isMega`/`megaLevel`, `summary:
PowerUpEncounterSummary`, `noiseFloorTeamDps`, `decisions: LineupSlotDecision[]` — the per-slot
"what else was considered" trail, and `representativeRun: TeamRaidResult` for charting), and
`margin: LineupMargin | null` (`teamDpsDelta`/`teamDpsDeltaFraction`/`exceedsNoise`, quadrature
noise-floor combination — same convention `rosterPlanner.ts`'s aggregate floor uses).
`LineupSlot` is deliberately shaped so a caller can build either a `TeamRaidSlotInput[]` or a
`TeamScenarioSlot[]` directly (per-slot `level`/`ivs` already present — see
`feature_team_scenario_per_slot_override.md`) without re-deriving anything.

## Known gap, not fixed here (same root cause already flagged twice elsewhere)

`TeamRaidInputs` still has no `bossMaxHpOverride` hook (`rosterPlanner.ts`'s Stage 4 has the same
gap — see `feature_roster_planner_phase2.md`/`feature_roster_planner_phase4_budget.md`). This
module's `evaluateLineup` always simulates against TODAY's tier-derived boss HP; a historical/
archived boss target can't be honored here either. Not fixed this pass — same "`teamRaid.ts` owns
this, not the orchestration layer calling it" reasoning as both prior notes.

## Fixture note

`test/fixtures/lineupBuilderFixtures.ts` — same test-only discipline as `hypotheticalDuo.ts`/
`rosterPlannerFixtures.ts` (hand-authored, not under `src/`, never re-exported from
`src/index.ts`). `ORDER_BOSS`/`CLOSER`/`WEAK` exist specifically to make order provably matter (see
above); `GENERIC_BOSS`/`GENERIC_ATTACKER`/`MEGA_ONE`/`MEGA_TWO` back the non-order-sensitive tests
(mega constraint, per-slot levels, determinism, small roster, validation).
