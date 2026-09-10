/**
 * Pure "assumptions in -> results out" computation for the Two-Candidate
 * Comparator tab, extracted out of ComparatorView.tsx so the CLI
 * (scripts/run-scenario.ts) and this module's own vitest smoke test call the
 * EXACT same code path the live UI does — no separate reimplementation to
 * drift out of sync with what the browser actually shows.
 *
 * React-free: takes the tab's own `Assumptions` (from AssumptionPanel.tsx —
 * already defaulted/normalized by ComparatorView's own scenarioToAssumptions/
 * normalizeAssumptions) plus a SpeciesRegistry, and returns exactly the data
 * ComparatorView.tsx renders, using the identical control flow (species
 * resolution has its OWN try/catch, separate from the sustained-comparison
 * call's — mirroring the view's `overallError = species.error ?? results.error`).
 * A behavior-preserving extraction, not a rewrite.
 */
import {
  bossChargedMoveReadySeconds,
  compareAcrossBossChargedMoves,
  runSustainedComparison,
  type RaidTier,
  type SpeciesDefinition,
  type SpeciesRegistry,
} from "@pogo-analyzer/engine";
import type { Assumptions } from "../AssumptionPanel.js";
import { applyShadowToggle } from "../shadowToggle.js";
import { computeSensitivity, type SensitivityCheck } from "../sensitivity.js";
import { raidTierForSpeciesId } from "../registry.js";

const MAX_ENERGY = 100;

/**
 * Mirrors ComparatorView's own resolveBoost — `disabled` (the per-candidate
 * candidateMegaBoostDisabled toggle) or a genuinely non-mega species (no
 * `boost` field at all) both collapse to `undefined`, never `1`. `undefined`
 * must propagate all the way to convertUptimeToTeamDamage's boostMultiplier —
 * passing `1` there is NOT equivalent (see uptime.ts).
 */
export function resolveBoost(species: SpeciesDefinition | null | undefined, disabled: boolean): SpeciesDefinition["boost"] | undefined {
  if (!species || disabled) return undefined;
  return species.boost;
}

export interface ComparatorRunResult {
  candidates: [SpeciesDefinition, SpeciesDefinition] | null;
  boss: SpeciesDefinition | null;
  speciesError: string | null;
  bossRaidTier: RaidTier | undefined;
  bossReadySeconds: number | null;
  energyBuffers: { name: string; buffer: number }[];
  results: ReturnType<typeof runSustainedComparison> | null;
  resultsError: string | null;
  naturalFightLengthSeconds: number | null;
  chartMaxSeconds: number;
  sensitivity: SensitivityCheck[];
  bossMovesetSweep: ReturnType<typeof compareAcrossBossChargedMoves> | null;
}

export function runComparatorScenario(a: Assumptions, registry: SpeciesRegistry): ComparatorRunResult {
  let candidates: [SpeciesDefinition, SpeciesDefinition] | null;
  let boss: SpeciesDefinition | null;
  let speciesError: string | null = null;
  try {
    candidates = [registry.get(a.candidateAId), registry.get(a.candidateBId)];
    boss = registry.get(a.targetId);
  } catch (err) {
    candidates = null;
    boss = null;
    speciesError = (err as Error).message;
  }

  // The Shadow toggle is applied ONLY here, at the boundary into the engine
  // calls below — `candidates` above stays the raw registry object for
  // whatever the caller does with it (picker/badge/label logic) — see
  // shadowToggle.ts's file doc comment for why this split avoids a
  // self-locking checkbox bug.
  const shadowAdjustedCandidates: [SpeciesDefinition, SpeciesDefinition] | null = candidates
    ? (candidates.map((c, i) => applyShadowToggle(c, a.candidateShadow[i] ?? false)) as [SpeciesDefinition, SpeciesDefinition])
    : null;

  const bossRaidTier = raidTierForSpeciesId(a.targetId) ?? undefined;

  const selectedBossChargedMove = boss
    ? (boss.chargedMoves.find((m) => m.id === a.bossChargedMoveId) ?? boss.chargedMoves[0])
    : undefined;

  const bossStartingEnergy =
    a.bossStartsPrimed && boss ? a.bossStartingEnergyFraction * (selectedBossChargedMove?.energyCost ?? 0) : 0;

  let bossReadySeconds: number | null = null;
  if (boss) {
    const fastMove = boss.fastMoves.find((m) => m.id === a.bossFastMoveId) ?? boss.fastMoves[0];
    if (fastMove && selectedBossChargedMove) {
      bossReadySeconds = bossChargedMoveReadySeconds(fastMove, selectedBossChargedMove, bossStartingEnergy);
    }
  }

  const energyBuffers: { name: string; buffer: number }[] = candidates
    ? candidates.map((c, i) => {
        const chargedMoveIds = [a.candidateAChargedMoveId, a.candidateBChargedMoveId];
        const chargedMove = c.chargedMoves.find((m) => m.id === chargedMoveIds[i]) ?? c.chargedMoves[0];
        return { name: c.name, buffer: MAX_ENERGY - (chargedMove?.energyCost ?? MAX_ENERGY) };
      })
    : [];

  // There is no user-selectable "combat phase" — the fight is one continuous
  // simulation, which already naturally starts with a period where the boss
  // hasn't thrown a charged move yet, governed by bossReadySeconds above.
  let results: ReturnType<typeof runSustainedComparison> | null = null;
  let resultsError: string | null = null;
  if (shadowAdjustedCandidates && boss) {
    try {
      results = runSustainedComparison({
        candidates: shadowAdjustedCandidates,
        candidateFastMoveIds: [a.candidateAFastMoveId, a.candidateBFastMoveId],
        candidateChargedMoveIds: [a.candidateAChargedMoveId, a.candidateBChargedMoveId],
        boss,
        bossRaidTier,
        bossFastMoveId: a.bossFastMoveId,
        bossChargedMoveId: a.bossChargedMoveId,
        level: a.level,
        ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
        dodge: a.dodge,
        dodgeFastAttacks: a.dodgeFastAttacks,
        candidateDodge: a.candidateDodge,
        candidateDodgeFastAttacks: a.candidateDodgeFastAttacks,
        holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
        bossChargedMoveMeanIntervalSeconds: a.bossChargedMoveFrequencySeconds,
        bossChargedMoveCadence: a.bossChargedMoveCadence,
        bossStartingEnergy,
        weather: a.weather,
        candidateMegaBoostDisabled: a.candidateMegaBoostDisabled,
        candidateMegaLevel: a.candidateMegaLevel,
      });
    } catch (err) {
      resultsError = (err as Error).message;
    }
  }

  // The chart's window is auto-computed from the longer-mean-surviving
  // candidate (never a free-typed input, so a too-small value can't reproduce
  // the degenerate all-zero-output bug this project hit once already) — the
  // user can only stretch it further via minFightLengthSeconds, never shrink
  // it below this real, computed outcome.
  const naturalFightLengthSeconds = (() => {
    const raw = results?.map((c) => c.meanSecondsSurvived);
    if (!raw || raw.length === 0) return null;
    return Math.max(1, Math.ceil(Math.max(...raw) * 1.1 * 10) / 10);
  })();

  const chartMaxSeconds = Math.max(naturalFightLengthSeconds ?? 1, a.minFightLengthSeconds);

  let sensitivity: SensitivityCheck[] = [];
  if (shadowAdjustedCandidates && boss) {
    try {
      sensitivity = computeSensitivity(shadowAdjustedCandidates, boss, a, bossRaidTier);
    } catch {
      sensitivity = [];
    }
  }

  // Only meaningful when the boss actually has 2+ known charged moves — see
  // ComparatorView's own doc comment on bossMovesetSweep.
  let bossMovesetSweep: ReturnType<typeof compareAcrossBossChargedMoves> | null = null;
  if (shadowAdjustedCandidates && boss && boss.chargedMoves.length >= 2) {
    try {
      bossMovesetSweep = compareAcrossBossChargedMoves({
        candidates: shadowAdjustedCandidates,
        candidateFastMoveIds: [a.candidateAFastMoveId, a.candidateBFastMoveId],
        candidateChargedMoveIds: [a.candidateAChargedMoveId, a.candidateBChargedMoveId],
        boss,
        bossRaidTier,
        bossFastMoveId: a.bossFastMoveId,
        level: a.level,
        ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
        dodge: a.dodge,
        dodgeFastAttacks: a.dodgeFastAttacks,
        candidateDodge: a.candidateDodge,
        candidateDodgeFastAttacks: a.candidateDodgeFastAttacks,
        holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
        bossChargedMoveMeanIntervalSeconds: a.bossChargedMoveFrequencySeconds,
        bossChargedMoveCadence: a.bossChargedMoveCadence,
        bossStartingEnergy,
        weather: a.weather,
        candidateMegaBoostDisabled: a.candidateMegaBoostDisabled,
        candidateMegaLevel: a.candidateMegaLevel,
      });
    } catch {
      bossMovesetSweep = null;
    }
  }

  return {
    candidates,
    boss,
    speciesError,
    bossRaidTier,
    bossReadySeconds,
    energyBuffers,
    results,
    resultsError,
    naturalFightLengthSeconds,
    chartMaxSeconds,
    sensitivity,
    bossMovesetSweep,
  };
}
