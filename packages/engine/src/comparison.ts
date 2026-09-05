import { bossChargedMoveReadySeconds, simulateOpeningBurst, type DamageTrajectoryPoint } from "./combat.js";
import type { DodgeBehavior } from "./breakpoints.js";
import { effectiveStatsAtLevel } from "./stats.js";
import { typeEffectiveness } from "./typeChart.js";
import { RAID_BOSS_CPM, RAID_BOSS_IVS } from "./raidBoss.js";
import { DEFAULT_STEPWISE_MAX_SECONDS, runStepwiseDistribution, type DistributionSummary } from "./simulate.js";
import type { IVSpread, SpeciesDefinition } from "./types.js";

export interface ComparisonInputs {
  candidates: SpeciesDefinition[];
  boss: SpeciesDefinition;
  level: number;
  ivs: IVSpread;
  dodge: DodgeBehavior;
  /**
   * How long the "opening burst" window lasts before a real boss would start
   * throwing charged moves. Defaults to bossChargedMoveReadySeconds(boss's
   * fast move, boss's first charged move, bossStartingEnergy) — the earliest
   * physically possible time, not an arbitrary number — so callers only need
   * to override this explicitly for a scenario that isn't "boss starts
   * fresh, this is the natural pre-charged-move window."
   */
  openingBurstSeconds?: number;
  /**
   * Energy the boss already has saved when the fight begins (0-energyCost of
   * its first charged move) — only affects the derived openingBurstSeconds
   * default above. Models a mega tagging in mid-fight against a boss an
   * earlier trainer's mega left partway charged. Defaults to 0.
   */
  bossStartingEnergy?: number;
}

export interface CandidateResult {
  id: string;
  name: string;
  secondsSurvived: number;
  chargedAttacksLanded: number;
  ownDamage: number;
  boostMultiplier: number;
  boostedType: SpeciesDefinition["types"][number];
  ownDamageTrajectory: DamageTrajectoryPoint[];
}

/**
 * Runs the opening-burst comparison (see combat.ts) for every candidate against
 * a shared boss under one set of assumptions. This is the single code path
 * both the acceptance tests and the web UI drive, so "what does the tool
 * conclude" can never drift between the two.
 */
export function runComparison(inputs: ComparisonInputs): CandidateResult[] {
  const { candidates, boss, level, ivs, dodge, bossStartingEnergy = 0 } = inputs;
  const bossAttackStat = Math.floor((boss.baseAttack + RAID_BOSS_IVS.attack) * RAID_BOSS_CPM);
  const bossDefenseStat = Math.floor((boss.baseDefense + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
  const bossFastMove = boss.fastMoves[0];
  if (!bossFastMove) throw new Error(`Boss species ${boss.id} has no fast move defined.`);
  const bossChargedMove = boss.chargedMoves[0];
  const openingBurstSeconds =
    inputs.openingBurstSeconds ??
    (bossChargedMove ? bossChargedMoveReadySeconds(bossFastMove, bossChargedMove, bossStartingEnergy) : 20);

  return candidates.map((species) => {
    const stats = effectiveStatsAtLevel(species, ivs, level);
    const fastMove = species.fastMoves[0];
    const chargedMove = species.chargedMoves[0];
    if (!fastMove || !chargedMove) {
      throw new Error(`Candidate ${species.id} needs at least one fast move and one charged move.`);
    }
    const candidateVsBoss = typeEffectiveness(fastMove.type, boss.types);
    const bossVsCandidate = typeEffectiveness(bossFastMove.type, species.types);

    const result = simulateOpeningBurst(
      {
        hp: stats.stamina,
        defenseStat: stats.defense,
        attackStat: stats.attack,
        fastMove,
        chargedMove,
        damageOut: {
          stab: species.types.includes(fastMove.type),
          typeEffectiveness: candidateVsBoss,
          megaBoostMultiplier: species.boost?.multiplier ?? 1,
        },
      },
      {
        attackStat: bossAttackStat,
        defenseStat: bossDefenseStat,
        fastMove: bossFastMove,
        damageOut: {
          stab: boss.types.includes(bossFastMove.type),
          typeEffectiveness: bossVsCandidate,
        },
      },
      openingBurstSeconds,
      dodge,
    );

    return {
      id: species.id,
      name: species.name,
      secondsSurvived: result.faintedAtSeconds ?? openingBurstSeconds,
      chargedAttacksLanded: result.chargedAttacksLanded,
      ownDamage: result.totalChargedDamage,
      boostMultiplier: species.boost?.multiplier ?? 1,
      boostedType: species.boost?.boostedType ?? species.types[0],
      ownDamageTrajectory: result.ownDamageTrajectory,
    };
  });
}

export interface SustainedComparisonInputs {
  candidates: SpeciesDefinition[];
  boss: SpeciesDefinition;
  level: number;
  ivs: IVSpread;
  dodge: DodgeBehavior;
  /** Mean seconds between the boss's charged moves once the sustained phase begins. */
  bossChargedMoveMeanIntervalSeconds: number;
  /**
   * Defaults to bossChargedMoveReadySeconds(boss's fast move, boss's charged
   * move, bossStartingEnergy) — see ComparisonInputs.openingBurstSeconds for
   * why this replaced a flat 0 default.
   */
  bossChargedMoveWarmupSeconds?: number;
  /** See ComparisonInputs.bossStartingEnergy. Defaults to 0. */
  bossStartingEnergy?: number;
  maxSeconds?: number;
  iterations?: number;
}

export interface SustainedCandidateResult extends DistributionSummary {
  id: string;
  name: string;
}

/**
 * Phase 5: the sustained-combat counterpart to runComparison. The boss's
 * charged-move timing is randomized (see simulate.ts), so this returns a
 * distribution per candidate rather than one number.
 */
export function runSustainedComparison(inputs: SustainedComparisonInputs): SustainedCandidateResult[] {
  const {
    candidates,
    boss,
    level,
    ivs,
    dodge,
    bossChargedMoveMeanIntervalSeconds,
    bossChargedMoveWarmupSeconds,
    bossStartingEnergy = 0,
    maxSeconds = DEFAULT_STEPWISE_MAX_SECONDS,
    iterations = 200,
  } = inputs;
  const bossAttackStat = Math.floor((boss.baseAttack + RAID_BOSS_IVS.attack) * RAID_BOSS_CPM);
  const bossDefenseStat = Math.floor((boss.baseDefense + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
  const bossFastMove = boss.fastMoves[0];
  const bossChargedMove = boss.chargedMoves[0];
  if (!bossFastMove) throw new Error(`Boss species ${boss.id} has no fast move defined.`);

  return candidates.map((species) => {
    const stats = effectiveStatsAtLevel(species, ivs, level);
    const fastMove = species.fastMoves[0];
    const chargedMove = species.chargedMoves[0];
    if (!fastMove || !chargedMove) {
      throw new Error(`Candidate ${species.id} needs at least one fast move and one charged move.`);
    }
    const candidateVsBoss = typeEffectiveness(fastMove.type, boss.types);
    const bossVsCandidate = typeEffectiveness(bossFastMove.type, species.types);
    const bossChargedVsCandidate = bossChargedMove ? typeEffectiveness(bossChargedMove.type, species.types) : 1;

    const distribution = runStepwiseDistribution(
      {
        attacker: {
          hp: stats.stamina,
          defenseStat: stats.defense,
          attackStat: stats.attack,
          fastMove,
          chargedMove,
          damageOut: {
            stab: species.types.includes(fastMove.type),
            typeEffectiveness: candidateVsBoss,
            megaBoostMultiplier: species.boost?.multiplier ?? 1,
          },
        },
        boss: {
          attackStat: bossAttackStat,
          defenseStat: bossDefenseStat,
          fastMove: bossFastMove,
          damageOut: {
            stab: boss.types.includes(bossFastMove.type),
            typeEffectiveness: bossVsCandidate,
          },
          chargedMove: bossChargedMove,
          chargedMoveDamageOut: bossChargedMove
            ? { stab: boss.types.includes(bossChargedMove.type), typeEffectiveness: bossChargedVsCandidate }
            : undefined,
          chargedMoveMeanIntervalSeconds: bossChargedMoveMeanIntervalSeconds,
          chargedMoveWarmupSeconds: bossChargedMoveWarmupSeconds,
          startingEnergy: bossStartingEnergy,
        },
        dodge,
        maxSeconds,
      },
      iterations,
    );

    return { id: species.id, name: species.name, ...distribution };
  });
}
