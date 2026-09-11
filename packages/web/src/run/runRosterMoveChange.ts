/**
 * Roster (multi-raid) mode's move-change sweep — the web half of
 * PLAN_tm_move_change_optimizer.md's "Both modes, not just single-raid"
 * section. `packages/engine/src/rosterMoveChange.ts`'s
 * `runRosterMoveChangeCandidates` shipped fully built and tested but with NO
 * caller anywhere in packages/web — this module is that caller, mirroring
 * `run/runRosterPlanner.ts`'s own RESOLUTION/COMPUTATION split (see that
 * module's top doc comment for the reasoning this repeats):
 *   - RESOLUTION (`resolveRosterMoveChangeInputs`, this module, MAIN thread
 *     only) — needs `registry.ts` indirectly via `resolveRosterPlannerInputs`
 *     (species lookup, boss-set resolution, the cost table) and produces a
 *     complete, plain-JSON `RosterMoveChangeInputs`.
 *   - COMPUTATION (`runRosterMoveChangeCandidates(inputs)`,
 *     `@pogo-analyzer/engine`) — called EITHER synchronously right here
 *     (`runRosterMoveChangeScenario`, used by `run.smoke.test.ts`) OR inside
 *     `rosterPlanner.worker.ts`'s third request type (the UI's PRIMARY path
 *     — see `rosterPlannerWorkerClient.ts`'s `runRosterMoveChangeOffMainThread`).
 *
 * REQUIRES an already-computed `RosterPlanResult.baselinePerBoss` — this
 * sweep answers "what's the best move change GIVEN who's already fielded,"
 * not an independent question, so it can never run before the main ranked
 * sweep has (see `runRosterMoveChangeCandidates`'s own
 * `RosterMoveChangeInputs.baselinePerBoss` doc comment: "pass
 * RosterPlanResult.baselinePerBoss... straight through"). The UI gates its
 * own "Run move-change sweep" button on `multiRaidRun.result.data` being
 * non-null AND not stale for exactly this reason.
 */
import {
  runRosterMoveChangeCandidates,
  type RosterBaselineBossSummary,
  type RosterMoveChangeInputs,
  type RosterMoveChangeResult,
  type SpeciesRegistry,
  type WeightedRaidTarget,
} from "@pogo-analyzer/engine";
import type { RosterEntry as ImportedRosterEntry } from "../import/pokeGenieMatch.js";
import type { PowerUpOptimizerAssumptions } from "../PowerUpOptimizerAssumptionPanel.js";
import { resolveRosterPlannerInputs, type RosterPlannerBlockedReason } from "./runRosterPlanner.js";

export interface RosterMoveChangeResolution {
  /** See RosterPlannerRunResult.targets (run/runRosterPlanner.ts) — the SAME resolved target list runRosterMoveChangeCandidates simulates against, reused from `resolveRosterPlannerInputs` rather than re-derived. */
  targets: WeightedRaidTarget[];
  /**
   * Non-null exactly when `inputs` is null — either the two ordinary
   * "nothing to compute" cases `resolveRosterPlannerInputs` already reports
   * (no-roster/no-bosses), or a THIRD case unique to this sweep: the caller
   * handed a `baselinePerBoss` whose length doesn't match the resolved
   * `targets` (a stale baseline from a DIFFERENT boss set/pool than the
   * current assumptions resolve to — the caller must re-run the main sweep
   * first). Reported as `"no-bosses"` too — the practical remedy is the same
   * ("re-run the sweep for the current settings"), and the UI's own
   * `isMultiRaidStale` guard is what actually prevents this from firing in
   * normal use.
   */
  blockedReason: RosterPlannerBlockedReason | null;
  inputs: RosterMoveChangeInputs | null;
}

/**
 * The RESOLUTION step — everything that needs `registry.ts` (via
 * `resolveRosterPlannerInputs`) to turn `PowerUpOptimizerAssumptions` + the
 * hydrated roster pool + an ALREADY-COMPUTED `baselinePerBoss` into a
 * complete `RosterMoveChangeInputs`. Reuses `resolveRosterPlannerInputs`'s
 * output field-for-field (same pool/candy/dodge/weather/timer assumptions the
 * main sweep already resolved) rather than re-deriving any of it, plus the
 * two Elite TM inventory fields `resolveRosterPlannerInputs` deliberately
 * never reads (see that function's own "Placeholders" comment at its call
 * site in PowerUpOptimizerView.tsx, now resolved HERE instead). Performs NO
 * engine call itself, same "resolution/computation split" contract as
 * `resolveRosterPlannerInputs`.
 *
 * `eliteFastTmOnHand`/`eliteChargedTmOnHand` are taken as EXPLICIT
 * parameters, deliberately NOT read off `a.eliteFastTmOnHand`/
 * `a.eliteChargedTmOnHand` the way every other field here is — `a` is
 * `PowerUpOptimizerView.tsx`'s `multiRaidInputs` memo, whose reference
 * identity ALSO drives the main sweep's own `isMultiRaidStale` flag. If this
 * function read the two TM fields off `a` instead, `multiRaidInputs` would
 * have to include them in ITS OWN dependency array (an earlier version of
 * this wiring did exactly that) — which means typing a new Elite TM count
 * would mark the ALREADY-COMPLETED main sweep stale too, even though
 * `resolveRosterPlannerInputs` never reads either field. Caught live via
 * Playwright: filling in `eliteFastTmOnHand` disabled the "Run move-change
 * sweep again" button entirely, because `canRunMoveChange` requires the main
 * sweep to be non-stale. Keeping these two as separate parameters lets the
 * caller read them straight off the LIVE `assumptions` object instead.
 */
export function resolveRosterMoveChangeInputs(
  a: PowerUpOptimizerAssumptions,
  registry: SpeciesRegistry,
  pool: ImportedRosterEntry[],
  baselinePerBoss: RosterBaselineBossSummary[],
  eliteFastTmOnHand: number | null,
  eliteChargedTmOnHand: number | null,
): RosterMoveChangeResolution {
  const { targets, blockedReason, inputs } = resolveRosterPlannerInputs(a, registry, pool);
  if (blockedReason || !inputs) {
    return { targets, blockedReason: blockedReason ?? "no-bosses", inputs: null };
  }
  if (baselinePerBoss.length !== targets.length) {
    // Stale baseline — see this module's own RosterMoveChangeResolution.blockedReason doc comment.
    return { targets, blockedReason: "no-bosses", inputs: null };
  }

  const moveChangeInputs: RosterMoveChangeInputs = {
    pool: inputs.pool,
    targets,
    baselinePerBoss,
    candyByFamilyId: inputs.candyByFamilyId,
    rareCandyOnHand: inputs.rareCandyOnHand,
    // "unknown" (null) collapses to 0 here, same as every other TM-inventory
    // field's own "unknown, not zero" convention downstream — the ENGINE
    // itself treats 0 as "affordable: false" for every Elite TM candidate,
    // which is the correct, honest default when the count is genuinely
    // unfilled (never silently treated as "unlimited").
    eliteFastTmOnHand: Math.max(0, Math.floor(eliteFastTmOnHand ?? 0)),
    eliteChargedTmOnHand: Math.max(0, Math.floor(eliteChargedTmOnHand ?? 0)),
    dodge: inputs.dodge,
    dodgeFastAttacks: inputs.dodgeFastAttacks,
    megaLevel: inputs.megaLevel,
    holdChargedMoveUntilSafe: inputs.holdChargedMoveUntilSafe,
    bossChargedMoveMeanIntervalSeconds: inputs.bossChargedMoveMeanIntervalSeconds,
    bossChargedMoveCadence: inputs.bossChargedMoveCadence,
    weather: inputs.weather,
    raidTimerSeconds: inputs.raidTimerSeconds,
    swapCostSeconds: inputs.swapCostSeconds,
    reviveCostSeconds: inputs.reviveCostSeconds,
  };
  return { targets, blockedReason: null, inputs: moveChangeInputs };
}

export interface RosterMoveChangeRunResult {
  targets: WeightedRaidTarget[];
  data: RosterMoveChangeResult | null;
  blockedReason: RosterPlannerBlockedReason | null;
  error: string | null;
}

/**
 * Resolution PLUS the engine call itself, both on THIS (calling) thread —
 * the synchronous contract `run/run.smoke.test.ts` needs. The UI's own
 * PRIMARY path (PowerUpOptimizerView.tsx) does NOT call this — it calls
 * `resolveRosterMoveChangeInputs` directly (with the two TM fields read off
 * the LIVE `assumptions` object, not this memo-safety concern) and hands
 * `inputs` to `rosterPlannerWorkerClient.ts`'s `runRosterMoveChangeOffMainThread`,
 * which runs the engine call inside the shared Web Worker (falling back to
 * this same synchronous call only if the worker itself can't be used).
 *
 * Reads `eliteFastTmOnHand`/`eliteChargedTmOnHand` off `a` itself, unlike
 * `resolveRosterMoveChangeInputs` — this synchronous wrapper has no live
 * React memo to protect from a spurious staleness flag, so there's no reason
 * to force every caller to pass them separately.
 */
export function runRosterMoveChangeScenario(
  a: PowerUpOptimizerAssumptions,
  registry: SpeciesRegistry,
  pool: ImportedRosterEntry[],
  baselinePerBoss: RosterBaselineBossSummary[],
): RosterMoveChangeRunResult {
  const { targets, blockedReason, inputs } = resolveRosterMoveChangeInputs(
    a,
    registry,
    pool,
    baselinePerBoss,
    a.eliteFastTmOnHand,
    a.eliteChargedTmOnHand,
  );
  if (blockedReason) {
    return { targets, data: null, blockedReason, error: null };
  }
  try {
    const data = runRosterMoveChangeCandidates(inputs!);
    return { targets, data, blockedReason: null, error: null };
  } catch (err) {
    return { targets, data: null, blockedReason: null, error: (err as Error).message };
  }
}
