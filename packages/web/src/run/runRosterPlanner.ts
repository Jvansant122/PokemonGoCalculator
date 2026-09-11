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
  type HypotheticalCatchCandidate,
  type RosterBudgetPlan,
  type RosterEntry as EngineRosterEntry,
  type RosterPlanResult,
  type RosterPlannerInputs,
  type SpeciesRegistry,
  type WeightedRaidTarget,
} from "@pogo-analyzer/engine";
import type { RosterEntry as ImportedRosterEntry } from "../import/pokeGenieMatch.js";
import type { HypotheticalCatchAssumption, PowerUpOptimizerAssumptions } from "../PowerUpOptimizerAssumptionPanel.js";
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
 * Approximate, context-free "move DPS" (power / duration) — the SAME
 * intrinsic-only metric MoveSelect.tsx's own `approximateDps` already shows
 * next to every move option (deliberately not folding in STAB/type
 * effectiveness against a specific opponent, since "best available" is a
 * property of the species' own movepool, not a matchup). Not exported from
 * MoveSelect.tsx (a component file), so re-implemented here rather than
 * reaching into it — see effectiveMoveIds below for the one caller.
 */
function highestApproximateDpsMoveId<T extends { id: string; power: number; durationSeconds: number }>(moves: T[]): string | null {
  if (moves.length === 0) return null;
  let best = moves[0]!;
  let bestDps = best.durationSeconds > 0 ? best.power / best.durationSeconds : 0;
  for (const move of moves.slice(1)) {
    const dps = move.durationSeconds > 0 ? move.power / move.durationSeconds : 0;
    if (dps > bestDps) {
      best = move;
      bestDps = dps;
    }
  }
  return best.id;
}

/**
 * IDEAS.md #11 ("a 'best available moveset' toggle") — resolves the fast/
 * charged move id one pool entry actually simulates WITH, honoring
 * `PowerUpOptimizerAssumptions.multiRaidUseBestAvailableMoveset`.
 *
 * Only ever substitutes a slot that is ACTUALLY still defaulted
 * (`fastMoveIsDefaulted`/`chargedMoveIsDefaulted`, import/pokeGenieMatch.ts)
 * — never a slot the user has stated for real. This is what keeps the toggle
 * from contradicting the Roster tab's own hand-fix flow: editing an entry
 * there (rosterEntryDraft.ts) always writes BOTH flags back to `false`
 * ("moveset/level/IVs are always marked fully KNOWN, never inheriting the
 * default-moveset badge a blank CSV column earns"), so a corrected entry is
 * structurally immune to this substitution the moment it's fixed — there is
 * no separate "trust this guess less" state to reconcile, the flag itself IS
 * the reconciliation.
 *
 * Deliberately narrow in scope: multi-raid mode only (see
 * PowerUpOptimizerAssumptionPanel.tsx's own field doc comment for why). The
 * single-raid TM/second-charged-move optimizer (PLAN_tm_move_change_optimizer.md)
 * is a wholly separate code path (run/runPowerUpOptimizer.ts, never this
 * module) that only ever prices a moveset the tool actually observed on a
 * hand-built 6-slot roster — this function has no call site there and must
 * not gain one, or the toggle becomes exactly the "price a moveset we never
 * observed" back door CLAUDE.md's TM section rules out.
 */
export function effectiveMoveIds(
  entry: Pick<ImportedRosterEntry, "species" | "fastMoveId" | "chargedMoveId" | "fastMoveIsDefaulted" | "chargedMoveIsDefaulted">,
  useBestAvailableMoveset: boolean,
): { fastMoveId: string | null; chargedMoveId: string | null } {
  return {
    fastMoveId:
      useBestAvailableMoveset && entry.fastMoveIsDefaulted
        ? (highestApproximateDpsMoveId(entry.species.fastMoves) ?? entry.fastMoveId)
        : entry.fastMoveId,
    chargedMoveId:
      useBestAvailableMoveset && entry.chargedMoveIsDefaulted
        ? (highestApproximateDpsMoveId(entry.species.chargedMoves) ?? entry.chargedMoveId)
        : entry.chargedMoveId,
  };
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
 *
 * `useBestAvailableMoveset` (default `false`, preserving every existing
 * caller/test unchanged) applies `effectiveMoveIds` above to each entry
 * before handing it to the engine — see that function's own doc comment.
 */
export function toEngineRosterPool(pool: ImportedRosterEntry[], useBestAvailableMoveset = false): EngineRosterEntry[] {
  return pool.map((e) => {
    const canMega = e.canMega && !!e.species.boost;
    const { fastMoveId, chargedMoveId } = effectiveMoveIds(e, useBestAvailableMoveset);
    return {
      entryId: e.entryId,
      species: e.species,
      fastMoveId,
      chargedMoveId,
      level: e.level,
      ivs: e.ivs,
      costModifiers: e.costModifiers,
      canMega,
      ivsAreApproximate: e.ivsAreApproximate,
      levelIsApproximate: e.levelIsApproximate,
      movesetIsDefaulted: e.movesetIsDefaulted,
      // See RosterEntry.knownChargedMoveIds' own doc comment (import/pokeGenieMatch.ts)
      // — TM-eligibility provenance for rosterMoveChange.ts, carried straight
      // through unchanged (never derived from movesetIsDefaulted/fastMoveId/
      // chargedMoveId, which can't by themselves distinguish "known single
      // move" from "known move plus an unrecorded second one").
      knownChargedMoveIds: e.knownChargedMoveIds,
      candyFamilyId: canMega ? resolveMegaBaseCandyFamilyId(e.species) : undefined,
    };
  });
}

/**
 * Perfect IVs (15/15/15) for every hypothetical catch (IDEAS.md #3, "add a
 * 7th") — a deliberate "best case for a fresh catch" modeling choice, NOT a
 * user-facing setting: the question this feature answers is "would this
 * species be worth fielding at ALL," and a real wild/raid-catch IV roll would
 * just add noise to that yes/no read without changing which species clear
 * the bar. See HypotheticalCatchAssumption's own doc comment.
 */
const HYPOTHETICAL_CATCH_IVS = { attack: 15, defense: 15, stamina: 15 };

/**
 * Turns `PowerUpOptimizerAssumptions.multiRaidHypotheticalCatches` (species +
 * raid-catch level only) into engine `HypotheticalCatchCandidate[]` — REAL,
 * already-synced species only (a row whose `speciesId` doesn't resolve in
 * this registry, including a blank `null` row, is silently dropped, same
 * "degrade a stale link instead of throwing" precedent as `resolveBossTarget`
 * above). Fast/charged move ids are left `null` (defaults to the species' own
 * first move — same "null = default" convention `emptyPowerUpSlot` already
 * uses), and IVs are fixed at `HYPOTHETICAL_CATCH_IVS` — see that constant's
 * own doc comment for why neither is a user-facing setting despite feeding a
 * real engine call. `id` is index-qualified (`hypothetical:${i}:${speciesId}`)
 * so two rows for the SAME species/level never collide (runRosterPlanner
 * throws on a duplicate `HypotheticalCatchCandidate.id`).
 */
export function buildHypotheticalCatchCandidates(rows: HypotheticalCatchAssumption[], registry: SpeciesRegistry): HypotheticalCatchCandidate[] {
  const candidates: HypotheticalCatchCandidate[] = [];
  rows.forEach((row, i) => {
    if (!row.speciesId || !registry.has(row.speciesId)) return;
    candidates.push({
      id: `hypothetical:${i}:${row.speciesId}`,
      species: registry.get(row.speciesId),
      level: row.level,
      ivs: HYPOTHETICAL_CATCH_IVS,
      fastMoveId: null,
      chargedMoveId: null,
    });
  });
  return candidates;
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
    pool: toEngineRosterPool(pool, a.multiRaidUseBestAvailableMoveset),
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
    // Reported ONLY in RosterPlanResult.hypotheticalCatches (runRosterPlanner)
    // — never priced, never part of the joint budget allocation. Handing this
    // SAME `inputs` object to planRosterBudget (which structurally omits this
    // field from RosterBudgetInputs — see rosterPlanner.ts's own doc comment)
    // is harmless: the extra field is simply never read there.
    hypotheticalCatches: buildHypotheticalCatchCandidates(a.multiRaidHypotheticalCatches, registry),
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
