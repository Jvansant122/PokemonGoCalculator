/**
 * IDEAS.md #21 — dodge-execution-error sensitivity, rendered as a BAND across
 * the 0-50% missed-dodge-attempt axis (engine's own sweepDodgeExecutionError/
 * DEFAULT_DODGE_ERROR_MISSED_FRACTIONS), not collapsed into one blended
 * number — collapsing a distribution is against this project's whole
 * discipline. Complementary to sensitivity.ts's existing "Dodge accuracy"
 * check (check 4 there): that finds the single NEAREST ranking-flip point on
 * a continuous scan; this renders the whole curve at 6 discrete points, for
 * BOTH candidates, so a reader can see the shape, not just the nearest edge.
 *
 * sweepDodgeExecutionError operates at simulate.ts's single-attacker-vs-boss
 * level (StepwiseSimulationParams), one level BELOW comparison.ts's own
 * two-candidate SustainedComparisonInputs — comparison.ts exposes no
 * single-candidate builder at that level (nothing outside packages/engine
 * needed one before this). buildStepwiseParamsForCandidate below repackages
 * already-computed values into that lower-level shape using ONLY
 * already-exported engine functions (effectiveStatsAtLevel,
 * resolveCandidateMegaLevel, chargedMoveAtMegaLevel, ownBoostMultiplier,
 * typeEffectiveness, isWeatherBoosted, bossEffectiveStats, bossEnrageStats,
 * bossEffectiveHp, resolveMove, resolveBoost, effectiveLevelForBestBuddy/
 * effectiveLevelForMegaLevel) — it does not reimplement any of the
 * underlying damage/stat math itself, mirroring the exact same attacker/boss
 * construction comparison.ts's runSustainedComparison performs internally
 * (see that function's own body) for a single candidate at a time. See this
 * feature's own AFFECTS note: a convenience single-candidate params builder
 * living in packages/engine instead would remove the need for this file, but
 * is not required — nothing here is engine math, only assembly.
 */
import {
  bossEffectiveHp,
  bossEffectiveStats,
  bossEnrageStats,
  chargedMoveAtMegaLevel,
  DEFAULT_DODGE_ERROR_MISSED_FRACTIONS,
  effectiveLevelForBestBuddy,
  effectiveLevelForMegaLevel,
  effectiveStatsAtLevel,
  isWeatherBoosted,
  ownBoostMultiplier,
  resolveBoost,
  resolveCandidateMegaLevel,
  resolveMove,
  sweepDodgeExecutionError,
  typeEffectiveness,
  type BossChargedMoveCadence,
  type DodgeErrorSweepPoint,
  type FriendshipLevel,
  type IVSpread,
  type MegaLevel,
  type RaidTier,
  type SpeciesDefinition,
  type StepwiseSimulationParams,
  type WeatherCondition,
} from "@pogo-analyzer/engine";

export interface DodgeExecutionErrorCandidateInputs {
  species: SpeciesDefinition;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  level: number;
  ivs: IVSpread;
  megaLevel: MegaLevel | null;
  isBestBuddy: boolean;
  megaBoostDisabled: boolean;
  dodgeFastAttacks: boolean;
  holdChargedMoveUntilSafe: boolean;
  boss: SpeciesDefinition;
  bossRaidTier?: RaidTier;
  bossFastMoveId: string | null;
  bossChargedMoveId: string | null;
  bossChargedMoveCadence: BossChargedMoveCadence;
  bossChargedMoveMeanIntervalSeconds: number;
  bossStartingEnergy: number;
  weather: WeatherCondition;
  friendshipLevel: FriendshipLevel;
}

/** See this module's own top doc comment for why this exists and what it deliberately does NOT reimplement. */
function buildStepwiseParamsForCandidate(
  inputs: DodgeExecutionErrorCandidateInputs,
): Omit<StepwiseSimulationParams, "dodge" | "seed"> {
  const { boss } = inputs;
  const megaLevel = resolveCandidateMegaLevel(inputs.species, inputs.megaLevel);
  const effectiveLevel = effectiveLevelForMegaLevel(effectiveLevelForBestBuddy(inputs.level, inputs.isBestBuddy), megaLevel);
  const stats = effectiveStatsAtLevel(inputs.species, inputs.ivs, effectiveLevel);
  const fastMove = resolveMove(inputs.species.fastMoves, inputs.fastMoveId);
  const rawChargedMove = resolveMove(inputs.species.chargedMoves, inputs.chargedMoveId);
  if (!fastMove || !rawChargedMove) {
    throw new Error(`Candidate ${inputs.species.id} needs at least one fast move and one charged move.`);
  }
  const chargedMove = chargedMoveAtMegaLevel(rawChargedMove, megaLevel);
  const bossFastMove = resolveMove(boss.fastMoves, inputs.bossFastMoveId);
  const bossChargedMove = resolveMove(boss.chargedMoves, inputs.bossChargedMoveId);
  if (!bossFastMove) throw new Error(`Boss species ${boss.id} has no fast move defined.`);

  const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(boss, inputs.bossRaidTier);
  const bossEnrage = bossEnrageStats(boss);
  const bossMaxHp = bossEffectiveHp(boss, inputs.bossRaidTier);
  const boost = resolveBoost(inputs.species, inputs.megaBoostDisabled);
  const candidateFastVsBoss = typeEffectiveness(fastMove.type, boss.types);
  const candidateChargedVsBoss = typeEffectiveness(chargedMove.type, boss.types);
  const bossVsCandidate = typeEffectiveness(bossFastMove.type, inputs.species.types);
  const bossChargedVsCandidate = bossChargedMove ? typeEffectiveness(bossChargedMove.type, inputs.species.types) : 1;

  return {
    attacker: {
      hp: stats.stamina,
      defenseStat: stats.defense,
      attackStat: stats.attack,
      fastMove,
      chargedMove,
      fastDamageOut: {
        stab: inputs.species.types.includes(fastMove.type),
        typeEffectiveness: candidateFastVsBoss,
        megaBoostMultiplier: ownBoostMultiplier(boost, fastMove.type),
        weatherBoosted: isWeatherBoosted(fastMove.type, inputs.weather),
        friendshipLevel: inputs.friendshipLevel,
      },
      chargedDamageOut: {
        stab: inputs.species.types.includes(chargedMove.type),
        typeEffectiveness: candidateChargedVsBoss,
        megaBoostMultiplier: ownBoostMultiplier(boost, chargedMove.type),
        weatherBoosted: isWeatherBoosted(chargedMove.type, inputs.weather),
        friendshipLevel: inputs.friendshipLevel,
      },
      holdChargedMoveUntilSafe: inputs.holdChargedMoveUntilSafe,
    },
    boss: {
      attackStat: bossAttackStat,
      defenseStat: bossDefenseStat,
      fastMove: bossFastMove,
      damageOut: {
        stab: boss.types.includes(bossFastMove.type),
        typeEffectiveness: bossVsCandidate,
        weatherBoosted: isWeatherBoosted(bossFastMove.type, inputs.weather),
      },
      chargedMove: bossChargedMove,
      chargedMoveDamageOut: bossChargedMove
        ? {
            stab: boss.types.includes(bossChargedMove.type),
            typeEffectiveness: bossChargedVsCandidate,
            weatherBoosted: isWeatherBoosted(bossChargedMove.type, inputs.weather),
          }
        : undefined,
      chargedMoveCadence: inputs.bossChargedMoveCadence,
      chargedMoveMeanIntervalSeconds: inputs.bossChargedMoveMeanIntervalSeconds,
      startingEnergy: inputs.bossStartingEnergy,
      enrage: bossEnrage ? { maxHp: bossMaxHp, attackStat: bossEnrage.attack, defenseStat: bossEnrage.defense } : undefined,
    },
    dodgeFastAttacks: inputs.dodgeFastAttacks,
  };
}

export interface DodgeExecutionErrorBandPoint {
  missedFraction: number;
  a: DodgeErrorSweepPoint["distribution"];
  b: DodgeErrorSweepPoint["distribution"];
}

/**
 * Runs the sweep for both candidates and zips the results by missedFraction
 * index — both calls share the exact same DEFAULT_DODGE_ERROR_MISSED_FRACTIONS
 * array (the default), so the indices always line up.
 */
export function runDodgeExecutionErrorBand(
  aInputs: DodgeExecutionErrorCandidateInputs,
  bInputs: DodgeExecutionErrorCandidateInputs,
): DodgeExecutionErrorBandPoint[] {
  const aParams = buildStepwiseParamsForCandidate(aInputs);
  const bParams = buildStepwiseParamsForCandidate(bInputs);
  const aSweep = sweepDodgeExecutionError(aParams);
  const bSweep = sweepDodgeExecutionError(bParams);
  return DEFAULT_DODGE_ERROR_MISSED_FRACTIONS.map((missedFraction, i) => ({
    missedFraction,
    a: aSweep[i]!.distribution,
    b: bSweep[i]!.distribution,
  }));
}
