---
name: feature_evolve_then_powerup_hypothetical_catch_onprogress
description: rosterPlanner.ts's "evolve then power up" candidate (IDEAS.md #9), hypothetical-catch comparisons (#3), and onProgress hook (#13) — exact signatures, the synthetic-entryId collision bug found and fixed, and the planRosterBudget scope cut
metadata:
  type: project
---

Lane A of a 3-lane concurrent session (2026-09-10), scoped to `powerUp.ts`/`rosterPlanner.ts`.
Shipped all three remaining IDEAS.md items against `rosterPlanner.ts` only — `powerUp.ts` itself
needed zero changes (all three features are roster-scale, single-boss `powerUp.ts` has no
equivalent need).

## #9 — "evolve, then power up to L" as one priced candidate

**New engine-wide data field**: `SpeciesDefinition.evolutions?: EvolutionOption[]` (types.ts),
`EvolutionOption = { to: SpeciesDefinition; candyCost: number }`. As of this field's introduction,
**no real synced species populates it** — data-sync doesn't normalize GAME_MASTER's per-branch
`candyCost` yet (see MECHANICS.md/IDEAS.md #9's own "not yet normalized" note). Every existing
fixture/test that predates this (`UNEVOLVED_SPECIES`) deliberately carries NO `evolutions` data,
so the whole pre-existing "evolve first" fallback path is unchanged and still exercised — I added
a SECOND fixture (`UNEVOLVED_WITH_EVOLUTIONS_SPECIES`) with real data for the new path, rather than
mutating the existing one, specifically to prove both paths independently.

**`evolutionEndpoints(species)`** (rosterPlanner.ts, exported): walks `.evolutions` RECURSIVELY to
every FULLY-EVOLVED terminal form, summing candy cost across every hop (handles a multi-stage
chain like Bulbasaur->Ivysaur->Venusaur correctly — stopping at an intermediate unevolved stage
and pricing a power-up there would be exactly as wrong as not evolving at all) and every BRANCH
(Eevee-shaped — each endpoint priced independently). Returns `[]` whenever the walk runs off the
end of populated data anywhere along the path (never a partial/guessed chain).

**A real correctness bug I found and fixed before shipping**: my first draft reused the REAL
owned entry's `entryId` for the "virtual" post-evolution entry (species swapped, id unchanged).
That collides silently when the unevolved species is ALSO already fielded on some boss's baseline
team in its own unevolved form — `simulateDraft`'s "already fielded" branch does
`baselineTeam.map(e => e.entryId === d.entry.entryId ? {...e, level: toLevel} : e)`, which reuses
the STALE (still-unevolved) team member object and only overrides `level`, silently simulating the
WRONG species at a power-up level. Fixed by giving every virtual evolved entry a SYNTHETIC entryId
(`` `${entry.entryId}::evolve->${endpoint.to.id}` ``) so it can never collide with the real owned
row; the real owned entry's identity is instead carried in the new
`RosterPowerUpCandidate.viaEvolution.fromEntryId` field. **This is a general pattern for this
codebase**: never reuse a real `RosterEntry.entryId` for a "what if this entry were something else"
comparison — a hypothetical/virtual variant needs its OWN id, always. The same reasoning applies to
`HypotheticalCatchCandidate` (#3 below), which was designed with a caller-supplied unique id from
the start for exactly this reason.

**Where it lives**: `runRosterPlanner` gets the FULL priced candidate (one Draft per reachable
endpoint, via a new shared `generateDraftsForEntry` helper factored out of the old inline per-entry
loop — byte-identical behavior for the `extraCandy: 0`/no-`viaEvolution` case, verified by the full
pre-existing suite passing unchanged). `planRosterBudget` does **NOT** commit an evolution step —
see the scope-cut note below — it only reports `RosterNeverCompetitiveEntry.evolutionRecommendation`
(a REAL one-shot `evaluateCandidate` simulation of the single best endpoint/level, not a proxy)
for information.

### Deliberate scope cut: why planRosterBudget doesn't COMMIT an evolution step

`planRosterBudget`'s greedy round loop caches EVERYTHING by `entryId` alone
(`screenScoreCache`/`metricsInputsCache`/`teamSummaryCache` — see `entryBossMetricsInputs`'s cache
key `${entryId}|${targetIndex}`, no level or species component) under the invariant that one
entryId's SPECIES never changes for the whole search. Correctly committing a mid-search species
swap needs: (a) a synthetic entryId (to dodge the cache-corruption this invariant protects
against — see the bug above), which then requires (b) REMOVING the real original entryId from
`scoredAllByTarget`/`currentTeamsByTarget` on every boss (not just touched ones, since the entry's
disappearance is itself a team-composition change the existing "only touched bosses change"
performance invariant doesn't cover), and (c) mutual exclusion across sibling branches (evolving
into Vaporeon should make Jolteon/Flareon/etc. unavailable for the SAME committed Eevee). All three
are tractable but real, and I judged it not worth the risk in a 2200-line function with several
documented past real-sweep bugs already. Scoped out explicitly, not silently — flag to a future
session if this is wanted; the informational `evolutionRecommendation` is a real, honest partial
answer in the meantime (a caller can always run `runRosterPlanner` on that one entry to get the
real committable candidate).

## #3 — "add a 7th" hypothetical-catch comparisons

`RosterPlannerInputs.hypotheticalCatches?: HypotheticalCatchCandidate[]` (runRosterPlanner ONLY —
explicitly `Omit`ted from `RosterBudgetInputs`, since a fresh catch has no resource cost the
budget ledger tracks). `HypotheticalCatchCandidate.species` MUST be a real, already-synced
`SpeciesDefinition` at a real level — never fabricated stats (this project deleted 4 hand-authored
species once for exactly this). The engine has no I/O and can't verify this at runtime; the
boundary is enforced by convention/caller discipline only, same as `pool`/`targets` already are.
Reuses the SAME "would this not-currently-fielded entry beat the team's 6th place" logic as a
benched power-up candidate, at exactly ONE caller-supplied level (no ladder — a catch isn't
powered up in this comparison). Output is a fully separate array
(`RosterPlanResult.hypotheticalCatches: RosterHypotheticalCatchImpact[]`), never folded into
`candidates`/`benchedButPromising`/`neverCompetitive`. Throws if a hypothetical catch id collides
with any real `RosterEntry.entryId` or another hypothetical catch's id.

## #13 — onProgress hook

`RosterPlannerInputs.onProgress?: (event: RosterPlannerProgressEvent) => void` (inherited by
`RosterBudgetInputs` too — not excluded). Callback shape:
`{ stage: "baseline" | "candidates" | "hypotheticalCatches" | "rounds"; completed: number; total: number; bossId?: string; bossName?: string }`.
Every event is REAL completed work, never a fabricated percentage:
- `"baseline"`: fires once per target, right after that boss's baseline team+summary is computed
  (both functions).
- `"candidates"`: `runRosterPlanner` only, fires once per Stage-4 simulation actually run
  (`toSimulate.size` total — the REAL post-cap, post-dedup count, not `pool.length`).
- `"hypotheticalCatches"`: `runRosterPlanner` only, once per input comparison; never fires when the
  input is empty/omitted.
- `"rounds"`: `planRosterBudget` only, fires ONCE PER COMMITTED STEP (not once per round attempted
  — a round that finds nothing significant and breaks the loop does not fire an event), with
  `completed` = the round index and `bossId`/`bossName` = that step's `bestBossId` when one exists.

Web routing: this is a **callback**, not a return value — `packages/web`'s
`rosterPlanner.worker.ts` needs to pass a function through (postMessage a progress event back to
the main thread on each call) rather than reading anything off the final result. Stages do NOT
share one combined total (their unit costs differ wildly) — a UI wanting one overall bar needs to
weight stages itself.

## Files touched

`packages/engine/src/types.ts` (EvolutionOption, SpeciesDefinition.evolutions),
`packages/engine/src/rosterPlanner.ts` (all three features), new
`packages/engine/test/rosterPlannerEvolutionAndCatches.test.ts` (17 tests), extended
`packages/engine/test/fixtures/rosterPlannerFixtures.ts` (EVOLVED_FORM_SPECIES,
UNEVOLVED_WITH_EVOLUTIONS_SPECIES, CHAIN_*, BRANCH_*, HYPOTHETICAL_CATCH_SPECIES — all additive,
zero existing fixtures mutated). Engine suite 548 -> 565 tests, both typecheck configs
(`tsconfig.json`/`tsconfig.test.json`) clean, lint clean, perf budgets unaffected (new features are
zero-cost no-ops when their new inputs are omitted).

## Also fixed in this pass (not mine originally, but landed in files I own)

Two pre-existing "signature pinning" tests in `rosterPlanner.test.ts` broke from CONCURRENT lanes
(Lane B added `meanHoldChargedMoveDodgeCostSeconds` to `DistributionSummary`; Lane C added
`slotId` to `TeamRaidSlotResult`) — fixed by adding the new keys to the pinned key-list arrays,
never by loosening the assertion (that's the whole point of a signature pin: force conscious
acknowledgement of a shape change). Also fixed a resulting TYPECHECK-ONLY failure (invisible to
`npm run test:engine`, only `tsc`) in `powerUp.test.ts`'s hand-built `TeamRaidSlotResult[]`
literal, missing the new required `slotId` field. **Lesson reinforced**: `npm run test:engine`
(vitest) does NOT typecheck; always also run
`npx tsc -p packages/engine/tsconfig.json --noEmit` and
`npx tsc -p packages/engine/tsconfig.test.json --noEmit` before calling a change done — this
project's own `typecheck:engine-test` config exists BECAUSE of a prior stale-mock incident, and it
caught a real gap here too (I had referenced `EvolutionOption` in a doc comment before actually
defining the interface — vitest never noticed, `tsc` did immediately).
