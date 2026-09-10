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
  findCrossoverPartySize,
  runSustainedComparison,
  type CrossoverPoint,
  type RaidTier,
  type SpeciesDefinition,
  type SpeciesRegistry,
} from "@pogo-analyzer/engine";
import type { Assumptions } from "../AssumptionPanel.js";
import { applyShadowToggle } from "../shadowToggle.js";
import { computeSensitivity, type SensitivityCheck } from "../sensitivity.js";
import { raidTierForSpeciesId } from "../registry.js";
import { deriveEffectiveBossChargedMoveFrequencySeconds } from "./effectiveBossChargedMoveFrequency.js";

const MAX_ENERGY = 100;

/**
 * The scanned party-size range for the ranking-flip-by-party-size headline
 * (IDEAS #19) — 0 to 20, matching sensitivity.ts's own "Other trainers in
 * this raid" check (check 1) and AssumptionPanel.tsx's partySize
 * NumberField bounds (min 0, max 20). Exported so PartySizeFlipView.tsx's
 * FlipBar reuses the exact same bounds rather than re-declaring them.
 */
export const PARTY_SIZE_FLIP_MIN = 0;
export const PARTY_SIZE_FLIP_MAX = 20;
const PARTY_SIZE_RANGE = Array.from({ length: PARTY_SIZE_FLIP_MAX - PARTY_SIZE_FLIP_MIN + 1 }, (_, i) => PARTY_SIZE_FLIP_MIN + i);

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
  /**
   * The boss charged-move mean frequency actually fed into BOTH
   * runSustainedComparison and (when applicable) compareAcrossBossChargedMoves
   * for THIS run. Equal to the stored `a.bossChargedMoveFrequencySeconds`
   * when `a.showDetailedAssumptions` is true; otherwise derived from the
   * boss's own fast-move charge time — see effectiveBossChargedMoveFrequency.ts's
   * own doc comment for the full derivation, shared with
   * run/runTeamRaid.ts's identical field. Exposed so the assumption panel
   * can show it and seed the stored field with it when the user opts into
   * detailed mode.
   */
  effectiveBossChargedMoveFrequencySeconds: number;
  energyBuffers: { name: string; buffer: number }[];
  results: ReturnType<typeof runSustainedComparison> | null;
  resultsError: string | null;
  naturalFightLengthSeconds: number | null;
  chartMaxSeconds: number;
  sensitivity: SensitivityCheck[];
  bossMovesetSweep: ReturnType<typeof compareAcrossBossChargedMoves> | null;
  /**
   * IDEAS #19: sweeps party size itself (0-20, see PARTY_SIZE_RANGE above)
   * at the CURRENTLY configured other-assumptions, for where the ranking
   * flips — the same "crossing detection" shape rankingFlip.ts already
   * applies to the time axis, just applied to party size instead. Reuses the
   * engine's own findCrossoverPartySize (uptime.ts) rather than
   * reimplementing a second scan loop in the web layer — that function
   * already existed, already tested in packages/engine, and was previously
   * only *considered* (see sensitivity.ts's own comment on check 1) and
   * never actually wired up anywhere in packages/web.
   * `null` whenever NEITHER candidate has an active mega/primal boost (a
   * disabled boost or a genuinely non-mega species) — with no team-damage
   * mechanic in play at all, party size cannot change the ranking, so this
   * mirrors AssumptionPanel.tsx's own `anyBoostActive` gate that hides the
   * party-size controls entirely in that case, rather than reporting a
   * trivial "no flip found" that's really "this axis does nothing here."
   */
  partySizeFlip: CrossoverPoint | null;
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

  const selectedBossFastMove = boss
    ? (boss.fastMoves.find((m) => m.id === a.bossFastMoveId) ?? boss.fastMoves[0])
    : undefined;

  const bossStartingEnergy =
    a.bossStartsPrimed && boss ? a.bossStartingEnergyFraction * (selectedBossChargedMove?.energyCost ?? 0) : 0;

  let bossReadySeconds: number | null = null;
  if (boss && selectedBossFastMove && selectedBossChargedMove) {
    bossReadySeconds = bossChargedMoveReadySeconds(selectedBossFastMove, selectedBossChargedMove, bossStartingEnergy);
  }

  // The boss charged-move mean frequency ACTUALLY fed into BOTH engine calls
  // below (runSustainedComparison and, when applicable,
  // compareAcrossBossChargedMoves) for THIS run — equal to the stored
  // a.bossChargedMoveFrequencySeconds when a.showDetailedAssumptions is
  // true, otherwise derived from the boss's own fast-move charge time.
  // Shared with run/runTeamRaid.ts's identical field via
  // effectiveBossChargedMoveFrequency.ts so the two tabs can't compute two
  // different numbers for the same "simple mode" concept — see that
  // module's own doc comment for the full derivation.
  const effectiveBossChargedMoveFrequencySeconds = deriveEffectiveBossChargedMoveFrequencySeconds({
    showDetailedAssumptions: a.showDetailedAssumptions,
    bossSpecies: boss,
    bossFastMove: selectedBossFastMove,
    bossChargedMove: selectedBossChargedMove,
    stored: a.bossChargedMoveFrequencySeconds,
  });

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
        bossChargedMoveMeanIntervalSeconds: effectiveBossChargedMoveFrequencySeconds,
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
      sensitivity = computeSensitivity(shadowAdjustedCandidates, boss, a, bossRaidTier, effectiveBossChargedMoveFrequencySeconds);
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
        bossChargedMoveMeanIntervalSeconds: effectiveBossChargedMoveFrequencySeconds,
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

  // IDEAS #19 — see ComparatorRunResult.partySizeFlip's own doc comment.
  // Gated on "at least one candidate has an active boost" the same way
  // AssumptionPanel.tsx hides the party-size controls (`anyBoostActive`) —
  // computed locally rather than imported, same precedent as
  // sensitivity.ts/DamageOverTimeChart.tsx inlining this exact two-line
  // check instead of a shared helper (see feature_hide_inert_boost_ui_and_
  // move_efficiency_metrics in agent memory).
  let partySizeFlip: CrossoverPoint | null = null;
  if (shadowAdjustedCandidates && results) {
    const boostA = resolveBoost(shadowAdjustedCandidates[0], a.candidateMegaBoostDisabled[0]);
    const boostB = resolveBoost(shadowAdjustedCandidates[1], a.candidateMegaBoostDisabled[1]);
    if (boostA?.multiplier !== undefined || boostB?.multiplier !== undefined) {
      // Shared fight length both candidates' team-boost windows are judged
      // against — same convention as sensitivity.ts's winnerOf (the longer
      // of the two mean survival times), not the padded/extendable chart
      // window, since this is a "does the ranking change" computation, not a
      // display window.
      const fightDurationSeconds = Math.max(results[0]!.meanSecondsSurvived, results[1]!.meanSecondsSurvived);
      // matchingTeammateCount is a single shared value (not per-candidate) —
      // see AssumptionPanel.tsx's matchingTeammateCount field — so the same
      // fraction-of-party-that-matches applies to both candidates as party
      // size is swept, exactly like DamageOverTimeChart/rankingFlip.ts
      // already treat it for the time axis.
      const matchingFraction = a.partySize > 0 ? Math.min(1, Math.max(0, a.matchingTeammateCount / a.partySize)) : 0;
      partySizeFlip = findCrossoverPartySize(
        {
          id: shadowAdjustedCandidates[0].name,
          secondsSurvived: results[0]!.meanSecondsSurvived,
          boostMultiplier: boostA?.multiplier,
          boostedType: shadowAdjustedCandidates[0].types[0],
          ownDamage: results[0]!.meanTotalDamage,
          persistsThroughFaint: boostA?.persistsThroughFaint ?? false,
        },
        {
          id: shadowAdjustedCandidates[1].name,
          secondsSurvived: results[1]!.meanSecondsSurvived,
          boostMultiplier: boostB?.multiplier,
          boostedType: shadowAdjustedCandidates[1].types[0],
          ownDamage: results[1]!.meanTotalDamage,
          persistsThroughFaint: boostB?.persistsThroughFaint ?? false,
        },
        a.teammateDps,
        { a: matchingFraction, b: matchingFraction },
        PARTY_SIZE_RANGE,
        fightDurationSeconds,
      );
    }
  }

  return {
    candidates,
    boss,
    speciesError,
    bossRaidTier,
    bossReadySeconds,
    effectiveBossChargedMoveFrequencySeconds,
    energyBuffers,
    results,
    resultsError,
    naturalFightLengthSeconds,
    chartMaxSeconds,
    sensitivity,
    bossMovesetSweep,
    partySizeFlip,
  };
}
