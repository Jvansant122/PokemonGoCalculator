/**
 * Pure "assumptions in -> results out" computation for the Power-Up
 * Optimizer's MULTI-RAID mode — see runComparator.ts's own doc comment for
 * why this extraction exists and the conventions every run module follows.
 * React-free: takes PowerUpOptimizerView's own `PowerUpOptimizerAssumptions`,
 * a `SpeciesRegistry`, and the ALREADY-HYDRATED roster pool (never read from
 * localStorage here — see PLAN_multi_raid_roster_optimizer.md §3.2: the pool
 * is deliberately NOT part of `Assumptions`/`Scenario`, so it has to be
 * threaded in as its own parameter rather than picked up implicitly the way
 * every other run module's single `(assumptions, registry)` signature does).
 *
 * Phase 3a scope (see the plan's §5 "Phase 3" entry): mode switch, boss-set
 * resolution, and the sweep call itself, fully synchronous.
 *
 * Phase 3b split this into two steps, per the task's own "this part is not
 * negotiable" architecture note:
 *   - RESOLUTION (`resolveRosterPlannerInputs`, this module, MAIN thread
 *     only) — needs `registry.ts` (species lookup, boss-set resolution, the
 *     cost table) and produces a complete, plain-JSON `RosterPlannerInputs`.
 *   - COMPUTATION (`runRosterPlanner(inputs)`, `@pogo-analyzer/engine`) —
 *     called EITHER synchronously right here (`runRosterPlannerScenario`,
 *     used by the CLI/smoke test, and by the UI as its own worker-
 *     unavailable fallback) OR inside `rosterPlanner.worker.ts` (the UI's
 *     PRIMARY path — see `rosterPlannerWorkerClient.ts`), which imports
 *     ONLY `@pogo-analyzer/engine`, never this file or `registry.ts` — so
 *     `species.json` never gets bundled a second time into the worker
 *     chunk. `RosterPlannerInputs` is plain JSON (every `SpeciesDefinition`
 *     inside it is plain data, no functions/classes), so structured-clone
 *     through `postMessage` is fine.
 *
 * Phase 4 (PLAN §5's "fixed-budget plan across the pool") added
 * `runRosterBudgetScenario` right below `runRosterPlannerScenario` — the
 * SAME two-step split, reusing `resolveRosterPlannerInputs`'s output
 * unchanged (see rosterPlanner.ts's own `RosterBudgetInputs` doc comment for
 * why a plain `RosterPlannerInputs` value satisfies `RosterBudgetInputs`
 * structurally with zero remapping, same "reuse the same inputs object for
 * both engine calls" precedent as the single-raid path's
 * `optimizePowerUps`/`planPowerUpBudget` pairing). `rosterPlanner.worker.ts`
 * gained a SECOND request type ("plan") for this, rather than a second
 * worker file — see that module's own doc comment.
 */
import {
  defaultRaidTierForSpecies,
  planRosterBudget,
  runRosterPlanner,
  type RosterBudgetPlan,
  type RosterEntry as EngineRosterEntry,
  type RosterPlanResult,
  type RosterPlannerInputs,
  type SpeciesRegistry,
  type WeightedRaidTarget,
} from "@pogo-analyzer/engine";
import type { RosterEntry as ImportedRosterEntry } from "../import/pokeGenieMatch.js";
import type { PowerUpOptimizerAssumptions } from "../PowerUpOptimizerAssumptionPanel.js";
import { activeRaidBossOptions, pastRaidBossOptions, powerUpCostTable, raidTierForSpeciesId, resolveMegaBaseCandyFamilyId } from "../registry.js";
import { validEraHp } from "./runSpeciesReport.js";

/**
 * Stage 4's paired-evaluation seed count (see rosterPlanner.ts's own doc
 * comment for what this and screenIterations/maxCandidates/maxLevelsPerEntry
 * each cost). Deliberately NOT a Scenario field — same "a shared link should
 * encode WHAT was compared, not how hard the tool searched" reasoning as
 * runPowerUpOptimizer.ts's OPTIMIZER_ITERATIONS, which this mirrors. Measured
 * ~988ms at this value for a real 164-entry pool over 13 bosses (well inside
 * the plan's <4s Phase-3 target, and there is no worker yet this phase so the
 * whole call blocks the main thread for that long — see the "Run sweep"
 * button in PowerUpOptimizerView.tsx, deliberately NOT auto-triggered on
 * every keystroke). screenIterations/maxCandidates/maxLevelsPerEntry are left
 * at the engine's own defaults (4/60/3) — not overridden here, same "module
 * constant, not a user setting" treatment.
 */
const ROSTER_PLANNER_ITERATIONS = 25;

export type RosterPlannerBlockedReason = "no-roster" | "no-bosses";

export interface RosterPlannerRunResult {
  /** The resolved boss targets actually swept (or attempted) — species successfully looked up from RosterPlannerAssumptions' bossIds. A boss id that no longer resolves in this registry (a resync dropped/renamed it) is silently excluded here, never thrown. */
  targets: WeightedRaidTarget[];
  data: RosterPlanResult | null;
  /**
   * Non-null (and `data`/`error` both null) when nothing was computed for a
   * reason that ISN'T an engine error — the two real "can't compute yet"
   * cases this phase surfaces explicitly rather than as a generic error
   * banner (see PLAN §1 "never a silently empty result" / §3.2's roster
   * empty-state requirement):
   *   - "no-roster": the pool handed in is empty — either nothing has been
   *     imported in THIS browser yet, or (see scripts/run-scenario.ts) this
   *     is the CLI, which structurally can never have a roster at all (§3.2:
   *     the roster lives only in browser localStorage, never the share link).
   *   - "no-bosses": every RosterPlannerAssumptions.bossIds id failed to
   *     resolve, or the filter state resolved to zero bosses.
   */
  blockedReason: RosterPlannerBlockedReason | null;
  /** A thrown error from runRosterPlanner itself (a real engine-level failure, e.g. a validation error) — distinct from blockedReason, which covers the two "nothing to compute" cases above. */
  error: string | null;
}

/**
 * Resolves ONE boss id (already decided by RosterPlannerAssumptions.bossIds
 * — see multiRaidBossSet.ts's own doc comment for why that list, not a live
 * filter, is authoritative) into a full `WeightedRaidTarget`. A boss id can
 * legitimately no longer be resolvable to a species at all (a resync dropped
 * it) — that case returns `null` and the caller drops it, same "degrade a
 * stale link instead of crashing" precedent as every other tab's own
 * normalize* function.
 *
 * Tier/HP are NOT encoded in the scenario (only the id is) and are instead
 * re-resolved LIVE at compute time, in priority order:
 *   1. Still a currently-active raid boss -> today's real tier (same value
 *      raidTierForSpeciesId gives every other tab for this species).
 *   2. A recorded past/inactive raid boss -> THAT encounter's own tier and
 *      (when available) its real recorded eraHp, exactly like
 *      runSpeciesReportScenario's own past-raid targets.
 *   3. Neither (the boss rotated out of both the live feed AND the past-raid
 *      archive since a link was shared, or was never a raid at all) ->
 *      defaultRaidTierForSpecies, the same graceful fallback every tab uses.
 * This means a share link's boss SET survives exactly (§3.1's whole point),
 * but a boss's exact TIER/HP can silently drift to today's default once it's
 * fully rotated out of this pipeline's own memory — an honest, documented
 * consequence of encoding ids rather than a snapshot of every boss's full
 * stat block, not a bug.
 */
export function resolveBossTarget(id: string, registry: SpeciesRegistry): WeightedRaidTarget | null {
  if (!registry.has(id)) return null;
  const species = registry.get(id);

  const activeMatch = activeRaidBossOptions().find((b) => b.id === id);
  if (activeMatch) return { species, tier: raidTierForSpeciesId(id) ?? undefined };

  const pastMatch = pastRaidBossOptions().find((r) => r.id === id);
  if (pastMatch) return { species, tier: pastMatch.tier, bossMaxHpOverride: validEraHp(pastMatch.eraHp) };

  return { species, tier: defaultRaidTierForSpecies(species) };
}

/**
 * Web-layer import pool entries (import/pokeGenieMatch.ts's `RosterEntry` —
 * species-matched Poke Genie rows) into the engine's own `RosterEntry` shape
 * (rosterPlanner.ts) — a straight field-for-field carry-over EXCEPT
 * `candyFamilyId`: for a genuinely mega/primal entry (`canMega` true AND the
 * species actually has a boost mechanic), resolved via registry.ts's
 * `resolveMegaBaseCandyFamilyId` (a mega/primal draws its BASE species'
 * candy — see that function's own doc comment for the suffix-stripping
 * convention this rests on); left unset for every other entry so the
 * engine's own `resolveCandyFamilyId` falls back to `species.candyFamilyId`
 * as normal. Also defensively re-checks `canMega` against `species.boost` —
 * runRosterPlanner throws if a `canMega` entry's species has no boost
 * mechanic at all, and while the CSV matcher should never produce that
 * combination, a hand-edited/corrupted imported JSON roster (rosterPool.ts's
 * file-import path) could.
 */
export function toEngineRosterPool(pool: ImportedRosterEntry[]): EngineRosterEntry[] {
  return pool.map((e) => {
    const canMega = e.canMega && !!e.species.boost;
    return {
      entryId: e.entryId,
      species: e.species,
      fastMoveId: e.fastMoveId,
      chargedMoveId: e.chargedMoveId,
      level: e.level,
      ivs: e.ivs,
      costModifiers: e.costModifiers,
      canMega,
      ivsAreApproximate: e.ivsAreApproximate,
      levelIsApproximate: e.levelIsApproximate,
      movesetIsDefaulted: e.movesetIsDefaulted,
      candyFamilyId: canMega ? resolveMegaBaseCandyFamilyId(e.species) : undefined,
    };
  });
}

export interface RosterPlannerResolution {
  /** See RosterPlannerRunResult.targets — the SAME resolved target list either path (worker or synchronous) ends up simulating. */
  targets: WeightedRaidTarget[];
  /** See RosterPlannerRunResult.blockedReason. Non-null exactly when `inputs` is null — nothing to hand a worker (or this module's own synchronous path) at all. */
  blockedReason: RosterPlannerBlockedReason | null;
  /**
   * The complete, plain-JSON `RosterPlannerInputs` — non-null exactly when
   * `blockedReason` is null. This is EVERYTHING `runRosterPlanner` needs and
   * NOTHING else: hand it straight to a Web Worker via `postMessage`
   * (structured-clone safe — see this module's own top doc comment) or to a
   * synchronous `runRosterPlanner(inputs)` call, with no further lookups
   * against `registry.ts`/`SpeciesRegistry` required either way.
   */
  inputs: RosterPlannerInputs | null;
}

/**
 * The RESOLUTION step (see this module's own top doc comment) — everything
 * that needs `registry.ts` (species lookup, boss-set resolution, the cost
 * table) to turn `PowerUpOptimizerAssumptions` + the hydrated roster pool
 * into a complete `RosterPlannerInputs`. Reads the SAME subset of
 * `PowerUpOptimizerAssumptions` fields the single-raid path already threads
 * for the ~80% of shared assumptions (dodge/weather/cadence/timer/swap/
 * revive/budgets — see PLAN §4.1) rather than duplicating them under new
 * names. Performs NO engine call itself — MUST stay that way, since the
 * whole point of splitting this out is that the caller decides separately
 * whether `runRosterPlanner(inputs)` then runs here (main thread) or inside
 * a Web Worker.
 */
export function resolveRosterPlannerInputs(
  a: PowerUpOptimizerAssumptions,
  registry: SpeciesRegistry,
  pool: ImportedRosterEntry[],
): RosterPlannerResolution {
  const targets = a.multiRaidBossIds
    .map((id) => resolveBossTarget(id, registry))
    .filter((t): t is WeightedRaidTarget => t !== null);

  if (pool.length === 0) {
    return { targets, blockedReason: "no-roster", inputs: null };
  }
  if (targets.length === 0) {
    return { targets, blockedReason: "no-bosses", inputs: null };
  }

  const inputs: RosterPlannerInputs = {
    pool: toEngineRosterPool(pool),
    targets,
    costTable: powerUpCostTable,
    stardustOnHand: Math.max(0, Math.floor(Number.isFinite(a.stardustOnHand) ? a.stardustOnHand : 0)),
    rareCandyOnHand: Math.max(0, Math.floor(Number.isFinite(a.rareCandyOnHand) ? a.rareCandyOnHand : 0)),
    rareCandyXlOnHand: Math.max(0, Math.floor(Number.isFinite(a.rareCandyXlOnHand) ? a.rareCandyXlOnHand : 0)),
    candyByFamilyId: a.candyByFamilyId,
    dodge: a.dodge,
    dodgeFastAttacks: a.dodgeFastAttacks,
    holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
    bossChargedMoveMeanIntervalSeconds: a.bossChargedMoveFrequencySeconds,
    bossChargedMoveCadence: a.bossChargedMoveCadence,
    weather: a.weather,
    raidTimerSeconds: a.raidTimerSeconds,
    swapCostSeconds: a.swapCostSeconds,
    reviveCostSeconds: a.reviveCostSeconds,
    // Roster-wide, not per-entry: the imported roster is ~164 entries and a per-entry
    // Mega Level would be unusable in that UI. The per-entry gate still applies inside
    // runTeamRaid, which resolves this against each entry’s own species.boost, so a
    // non-mega entry is unaffected. `?? undefined` matches RosterPlannerInputs.megaLevel’s
    // `MegaLevel | undefined` shape (TeamRaidSlotInput’s convention), not the `| null` one.
    megaLevel: a.multiRaidMegaLevel ?? undefined,
    // Threaded from the SAME assumptions field into BOTH runRosterPlanner
    // (this resolution feeds the ranked table) and planRosterBudget (the
    // fixed-budget plan reuses this exact `inputs` object unchanged — see
    // runRosterBudgetScenario's own doc comment) so the two can never
    // disagree about what counts as significant.
    significanceMode: a.multiRaidSignificanceMode,
    iterations: ROSTER_PLANNER_ITERATIONS,
  };
  return { targets, blockedReason: null, inputs };
}

/**
 * Resolution PLUS the engine call itself, both on THIS (calling) thread —
 * the pre-Phase-3b contract, kept unchanged for two callers that
 * structurally need a synchronous return value: `scripts/run-scenario.ts`
 * (the CLI) and `run/run.smoke.test.ts`. The UI's own PRIMARY path
 * (PowerUpOptimizerView.tsx) does NOT call this — it calls
 * `resolveRosterPlannerInputs` directly and hands `inputs` to
 * `rosterPlannerWorkerClient.ts`, which runs the engine call inside a Web
 * Worker (falling back to this same synchronous `runRosterPlanner` call,
 * inline, only if the worker itself can't be used — see that module's own
 * "degrade gracefully" doc comment). CLI == UI by construction either way:
 * both paths resolve inputs through the exact same function above and call
 * the exact same `runRosterPlanner` — only WHERE that second call executes
 * differs.
 */
export function runRosterPlannerScenario(
  a: PowerUpOptimizerAssumptions,
  registry: SpeciesRegistry,
  pool: ImportedRosterEntry[],
): RosterPlannerRunResult {
  const { targets, blockedReason, inputs } = resolveRosterPlannerInputs(a, registry, pool);
  if (blockedReason) {
    return { targets, data: null, blockedReason, error: null };
  }
  try {
    const data = runRosterPlanner(inputs!);
    return { targets, data, blockedReason: null, error: null };
  } catch (err) {
    return { targets, data: null, blockedReason: null, error: (err as Error).message };
  }
}

/** Same shape as RosterPlannerRunResult, for the Phase 4 fixed-budget plan (`planRosterBudget`) instead of the ranked sweep (`runRosterPlanner`). */
export interface RosterBudgetPlanRunResult {
  /** See RosterPlannerRunResult.targets. */
  targets: WeightedRaidTarget[];
  data: RosterBudgetPlan | null;
  /** See RosterPlannerRunResult.blockedReason — the SAME two "can't compute yet" cases (no roster imported / no bosses resolved), since both engine calls share resolveRosterPlannerInputs. */
  blockedReason: RosterPlannerBlockedReason | null;
  /** A thrown error from planRosterBudget itself. */
  error: string | null;
}

/**
 * Resolution PLUS `planRosterBudget(inputs)`, both on THIS (calling) thread —
 * the synchronous contract `scripts/run-scenario.ts` and
 * `run/run.smoke.test.ts` need. The UI's own PRIMARY path
 * (PowerUpOptimizerView.tsx) does NOT call this directly — it calls
 * `resolveRosterPlannerInputs` once (shared with the ranked-sweep call) and
 * hands the SAME `inputs` to `rosterPlannerWorkerClient.ts`'s
 * `runRosterBudgetOffMainThread`, which runs `planRosterBudget` inside the
 * worker (falling back to this same computation inline only if the worker
 * itself can't be used). CLI == UI by construction either way — both paths
 * resolve inputs through the exact same function and call the exact same
 * `planRosterBudget`, only WHERE that second call executes differs.
 *
 * Note `inputs` (typed `RosterPlannerInputs`) is handed straight to
 * `planRosterBudget` (which declares `RosterBudgetInputs`) with NO remapping
 * — see `RosterBudgetInputs`'s own doc comment in rosterPlanner.ts for why
 * that's structurally sound (it's `Omit<RosterPlannerInputs, "maxCandidates"
 * | "maxLevelsPerEntry">` plus its own optional fields, and `resolveRosterPlannerInputs`
 * never sets either omitted field).
 */
export function runRosterBudgetScenario(
  a: PowerUpOptimizerAssumptions,
  registry: SpeciesRegistry,
  pool: ImportedRosterEntry[],
): RosterBudgetPlanRunResult {
  const { targets, blockedReason, inputs } = resolveRosterPlannerInputs(a, registry, pool);
  if (blockedReason) {
    return { targets, data: null, blockedReason, error: null };
  }
  try {
    const data = planRosterBudget(inputs!);
    return { targets, data, blockedReason: null, error: null };
  } catch (err) {
    return { targets, data: null, blockedReason: null, error: (err as Error).message };
  }
}
