import { dodgeMultiplierForHit, type DodgeBehavior } from "./breakpoints.js";
import { calculateDamage, type DamageInputs } from "./damage.js";
import { energyFromDamageTaken } from "./energy.js";
import type { ChargedMove, FastMove } from "./types.js";

/**
 * Phase 5: a stepwise (100ms-tick) battle simulator. Unlike combat.ts's
 * simulateOpeningBurst (deterministic, boss uses only its fast move), this
 * models the sustained phase: the boss's charged-move timing is randomized,
 * so a single run is a single sample — callers should run many (see
 * runStepwiseDistribution) and report a distribution, not a point estimate.
 * It also models the attacker's own charged-move animation as a vulnerability
 * window: if the boss's next hit lands before that animation completes, the
 * attacker faints before the attack lands and it counts for nothing — the
 * "died mid-animation" failure mode the source analysis flagged as a known
 * caveat instead of assuming it away. Every boss hit (fast or charged) that
 * lands during that window is guaranteed to deal full damage: a dodge input
 * cannot be thrown mid-animation, and a dodge's ~0.7s reduction window
 * couldn't cover a multi-second cast even if it could — so the configured
 * DodgeBehavior is ignored for hits landing in this window specifically.
 * Boss charged moves are modeled as landing all at once at their fire time
 * (a "fast damage window"), the same as boss fast moves — there is no
 * separate windup phase to dodge around.
 */

export const DEFAULT_TICK_SECONDS = 0.1;

/** Boss charged-move intervals are randomized uniformly within +/-40% of the mean. */
export const BOSS_CHARGED_MOVE_JITTER = 0.4;

export interface StepwiseAttacker {
  hp: number;
  defenseStat: number;
  attackStat: number;
  fastMove: FastMove;
  chargedMove: ChargedMove;
  damageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
}

export interface StepwiseBoss {
  attackStat: number;
  defenseStat: number;
  fastMove: FastMove;
  damageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  /** Boss charged move; omit to reproduce the opening-burst-only behavior. */
  chargedMove?: ChargedMove;
  chargedMoveDamageOut?: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  /** Mean seconds between the boss's charged moves once it starts using them. */
  chargedMoveMeanIntervalSeconds?: number;
  /** Seconds before the boss can use its first charged move at all. */
  chargedMoveWarmupSeconds?: number;
}

export interface StepwiseRunResult {
  faintedAtSeconds: number | null;
  survivedFullWindow: boolean;
  chargedAttacksLanded: number;
  totalChargedDamage: number;
  totalDamageTaken: number;
  /** True if the attacker fainted while mid-animation on its own charged move — that attack never landed. */
  diedDuringOwnChargedMoveAnimation: boolean;
  bossChargedHitsTaken: number;
}

/** Simple seeded PRNG (mulberry32) so a given seed always reproduces the same run. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitteredInterval(mean: number, rng: () => number): number {
  const factor = 1 - BOSS_CHARGED_MOVE_JITTER + rng() * (2 * BOSS_CHARGED_MOVE_JITTER);
  return mean * factor;
}

export interface StepwiseSimulationParams {
  attacker: StepwiseAttacker;
  boss: StepwiseBoss;
  dodge?: DodgeBehavior;
  tickSeconds?: number;
  maxSeconds?: number;
  seed?: number;
}

export function simulateStepwiseBattle(params: StepwiseSimulationParams): StepwiseRunResult {
  const { attacker, boss } = params;
  const dodge = params.dodge ?? { kind: "none" };
  const tick = params.tickSeconds ?? DEFAULT_TICK_SECONDS;
  const maxSeconds = params.maxSeconds ?? 60;
  const rng = mulberry32(params.seed ?? 1);

  let hp = attacker.hp;
  let energy = 0;
  let totalDamageTaken = 0;
  let chargedAttacksLanded = 0;
  let totalChargedDamage = 0;
  let bossChargedHitsTaken = 0;
  let bossHitIndex = 0;
  let faintedAtSeconds: number | null = null;
  let diedDuringOwnChargedMoveAnimation = false;

  let nextAttackerFastMoveAt = attacker.fastMove.durationSeconds;
  let nextBossFastMoveAt = boss.fastMove.durationSeconds;
  let attackerAnimationEndsAt: number | null = null;

  let nextBossChargedMoveAt: number | null = null;
  if (boss.chargedMove && boss.chargedMoveMeanIntervalSeconds) {
    const warmup = boss.chargedMoveWarmupSeconds ?? 0;
    nextBossChargedMoveAt = warmup + jitteredInterval(boss.chargedMoveMeanIntervalSeconds, rng);
  }

  const EPS = 1e-9;
  for (let t = tick; t <= maxSeconds + EPS; t += tick) {
    const roundedT = Math.round(t * 1000) / 1000;

    // Boss charged move takes priority over its fast move in the same tick.
    let bossHitDamage: number | null = null;
    let isBossChargedHit = false;
    if (nextBossChargedMoveAt !== null && roundedT >= nextBossChargedMoveAt - EPS) {
      bossHitDamage = calculateDamage({
        power: boss.chargedMove!.power,
        attackerAttackStat: boss.attackStat,
        defenderDefenseStat: attacker.defenseStat,
        ...(boss.chargedMoveDamageOut ?? boss.damageOut),
      });
      isBossChargedHit = true;
      nextBossChargedMoveAt = roundedT + jitteredInterval(boss.chargedMoveMeanIntervalSeconds!, rng);
    } else if (roundedT >= nextBossFastMoveAt - EPS) {
      bossHitDamage = calculateDamage({
        power: boss.fastMove.power,
        attackerAttackStat: boss.attackStat,
        defenderDefenseStat: attacker.defenseStat,
        ...boss.damageOut,
      });
      nextBossFastMoveAt = roundedT + boss.fastMove.durationSeconds;
    }

    if (bossHitDamage !== null) {
      bossHitIndex += 1;
      if (isBossChargedHit) bossChargedHitsTaken += 1;
      // Locked into your own charged-move animation, you cannot input a new
      // dodge — a dodge's damage-reduction window (~0.7s, see
      // DODGE_WINDOW_SECONDS) cannot cover a multi-second cast anyway. Any
      // hit landing in this window is guaranteed to land at full damage,
      // regardless of the configured dodge behavior.
      const isMidOwnAnimation = attackerAnimationEndsAt !== null && roundedT < attackerAnimationEndsAt - EPS;
      const dodgeMultiplier = isMidOwnAnimation ? 1 : dodgeMultiplierForHit(dodge, bossHitIndex);
      const damage = Math.floor(bossHitDamage * dodgeMultiplier);
      totalDamageTaken += damage;
      hp -= damage;
      if (hp <= 0) {
        faintedAtSeconds = roundedT;
        diedDuringOwnChargedMoveAnimation = attackerAnimationEndsAt !== null && roundedT < attackerAnimationEndsAt - EPS;
        break;
      }
      energy += energyFromDamageTaken(damage);
    }

    // Attacker's own charged-move animation completing.
    if (attackerAnimationEndsAt !== null && roundedT >= attackerAnimationEndsAt - EPS) {
      const damage = calculateDamage({
        power: attacker.chargedMove.power,
        attackerAttackStat: attacker.attackStat,
        defenderDefenseStat: boss.defenseStat,
        ...attacker.damageOut,
      });
      totalChargedDamage += damage;
      chargedAttacksLanded += 1;
      attackerAnimationEndsAt = null;
    }

    // Attacker's own fast move — locked out while mid-charged-move-animation.
    if (attackerAnimationEndsAt === null && roundedT >= nextAttackerFastMoveAt - EPS) {
      energy += attacker.fastMove.energyGain;
      nextAttackerFastMoveAt = roundedT + attacker.fastMove.durationSeconds;
    }

    // Start a new charged-move animation as soon as energy allows.
    if (attackerAnimationEndsAt === null && energy >= attacker.chargedMove.energyCost) {
      energy = 0;
      attackerAnimationEndsAt = roundedT + attacker.chargedMove.durationSeconds;
    }
  }

  return {
    faintedAtSeconds,
    survivedFullWindow: faintedAtSeconds === null,
    chargedAttacksLanded,
    totalChargedDamage,
    totalDamageTaken,
    diedDuringOwnChargedMoveAnimation,
    bossChargedHitsTaken,
  };
}

export interface DistributionSummary {
  iterations: number;
  meanTotalDamage: number;
  medianTotalDamage: number;
  p10TotalDamage: number;
  p90TotalDamage: number;
  meanSecondsSurvived: number;
  fractionSurvivedFullWindow: number;
  fractionDiedDuringOwnAnimation: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index]!;
}

/**
 * Runs `iterations` independent samples (each with its own seed derived from
 * `baseSeed`) and reports a distribution rather than a single point estimate —
 * required because the boss's charged-move timing is randomized per Phase 5.
 */
export function runStepwiseDistribution(
  params: Omit<StepwiseSimulationParams, "seed">,
  iterations = 200,
  baseSeed = 1,
): DistributionSummary {
  const runs: StepwiseRunResult[] = [];
  for (let i = 0; i < iterations; i++) {
    runs.push(simulateStepwiseBattle({ ...params, seed: baseSeed + i * 7919 }));
  }

  const damages = runs.map((r) => r.totalChargedDamage).sort((a, b) => a - b);
  const survivalSeconds = runs.map((r) => r.faintedAtSeconds ?? (params.maxSeconds ?? 60));

  return {
    iterations,
    meanTotalDamage: damages.reduce((sum, d) => sum + d, 0) / iterations,
    medianTotalDamage: percentile(damages, 0.5),
    p10TotalDamage: percentile(damages, 0.1),
    p90TotalDamage: percentile(damages, 0.9),
    meanSecondsSurvived: survivalSeconds.reduce((sum, s) => sum + s, 0) / iterations,
    fractionSurvivedFullWindow: runs.filter((r) => r.survivedFullWindow).length / iterations,
    fractionDiedDuringOwnAnimation: runs.filter((r) => r.diedDuringOwnChargedMoveAnimation).length / iterations,
  };
}
