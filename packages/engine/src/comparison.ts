import { bossChargedMoveReadySeconds, simulateOpeningBurst, type DamageTrajectoryPoint } from "./combat.js";
import type { DodgeBehavior } from "./breakpoints.js";
import { effectiveStatsAtLevel } from "./stats.js";
import { typeEffectiveness } from "./typeChart.js";
import { RAID_BOSS_CPM, RAID_BOSS_IVS } from "./raidBoss.js";
import { DEFAULT_STEPWISE_MAX_SECONDS, runStepwiseDistribution, type DistributionSummary } from "./simulate.js";
import type { IVSpread, SpeciesDefinition } from "./types.js";

/**
 * Resolves a move selection by id against a species' available moves, falling
 * back to the first move when the id is omitted, null, or doesn't match —
 * i.e. today's implicit "always use moves[0]" behavior. Shared by both
 * runComparison and runSustainedComparison so a candidate/boss move choice
 * means the same thing in either path.
 */
function resolveMove<T extends { id: string }>(moves: T[], id: string | null | undefined): T | undefined {
  return (id ? moves.find((m) => m.id === id) : undefined) ?? moves[0];
}

export interface ComparisonInputs {
  candidates: SpeciesDefinition[];
  /** Per-candidate fast-move selection, matched by index to `candidates`. Omit or use null for a given index to default to that species' first fast move (today's behavior). */
  candidateFastMoveIds?: (string | null)[];
  /** Per-candidate charged-move selection — see candidateFastMoveIds. */
  candidateChargedMoveIds?: (string | null)[];
  boss: SpeciesDefinition;
  /** Boss fast-move selection. Omit/null defaults to the boss's first fast move (today's behavior). */
  bossFastMoveId?: string | null;
  /** Boss charged-move selection. Omit/null defaults to the boss's first charged move (today's behavior). */
  bossChargedMoveId?: string | null;
  level: number;
  ivs: IVSpread;
  /** Governs dodging the boss's CHARGED attacks only — inert during the opening burst, since the boss never throws one there. */
  dodge: DodgeBehavior;
  /** Whether the candidate also attempts to dodge the boss's fast attacks — the only attack type that exists during the opening burst, so this is what actually extends survival here. Costs DODGE_COST_SECONDS per attempt (see breakpoints.ts). Defaults to false. */
  dodgeFastAttacks?: boolean;
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
  /** Charged-move damage only. */
  ownChargedDamage: number;
  /** Fast-move damage dealt to the boss — previously untracked entirely (the fast move's damage was never computed, only its energy gain). */
  ownFastMoveDamage: number;
  /** ownChargedDamage + ownFastMoveDamage — the true total damage output, and what feeds the team-contribution/crossover math (uptime.ts) and the damage-over-time chart. */
  ownTotalDamage: number;
  boostMultiplier: number;
  boostedType: SpeciesDefinition["types"][number];
  /** Combined fast+charged cumulative damage over time — see combat.ts's OpeningBurstResult.ownDamageTrajectory. */
  ownDamageTrajectory: DamageTrajectoryPoint[];
}

/**
 * Runs the opening-burst comparison (see combat.ts) for every candidate against
 * a shared boss under one set of assumptions. This is the single code path
 * both the acceptance tests and the web UI drive, so "what does the tool
 * conclude" can never drift between the two.
 */
export function runComparison(inputs: ComparisonInputs): CandidateResult[] {
  const { candidates, boss, level, ivs, dodge, dodgeFastAttacks = false, bossStartingEnergy = 0 } = inputs;
  const bossAttackStat = Math.floor((boss.baseAttack + RAID_BOSS_IVS.attack) * RAID_BOSS_CPM);
  const bossDefenseStat = Math.floor((boss.baseDefense + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
  const bossFastMove = resolveMove(boss.fastMoves, inputs.bossFastMoveId);
  if (!bossFastMove) throw new Error(`Boss species ${boss.id} has no fast move defined.`);
  const bossChargedMove = resolveMove(boss.chargedMoves, inputs.bossChargedMoveId);
  const openingBurstSeconds =
    inputs.openingBurstSeconds ??
    (bossChargedMove ? bossChargedMoveReadySeconds(bossFastMove, bossChargedMove, bossStartingEnergy) : 20);

  return candidates.map((species, i) => {
    const stats = effectiveStatsAtLevel(species, ivs, level);
    const fastMove = resolveMove(species.fastMoves, inputs.candidateFastMoveIds?.[i]);
    const chargedMove = resolveMove(species.chargedMoves, inputs.candidateChargedMoveIds?.[i]);
    if (!fastMove || !chargedMove) {
      throw new Error(`Candidate ${species.id} needs at least one fast move and one charged move.`);
    }
    // Fast and charged moves can differ in type (e.g. a Dragon fast move with
    // a Fire charged move), so STAB/type-effectiveness are computed per-move,
    // not shared — see combat.ts's AttackerProfile.fastDamageOut doc for the
    // bug this fixes (previously invisible because every fixture's fast and
    // charged moves happen to share a type).
    const candidateFastVsBoss = typeEffectiveness(fastMove.type, boss.types);
    const candidateChargedVsBoss = typeEffectiveness(chargedMove.type, boss.types);
    const bossVsCandidate = typeEffectiveness(bossFastMove.type, species.types);

    const result = simulateOpeningBurst(
      {
        hp: stats.stamina,
        defenseStat: stats.defense,
        attackStat: stats.attack,
        fastMove,
        chargedMove,
        fastDamageOut: {
          stab: species.types.includes(fastMove.type),
          typeEffectiveness: candidateFastVsBoss,
          megaBoostMultiplier: species.boost?.multiplier ?? 1,
        },
        chargedDamageOut: {
          stab: species.types.includes(chargedMove.type),
          typeEffectiveness: candidateChargedVsBoss,
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
      dodgeFastAttacks,
    );

    return {
      id: species.id,
      name: species.name,
      secondsSurvived: result.faintedAtSeconds ?? openingBurstSeconds,
      chargedAttacksLanded: result.chargedAttacksLanded,
      ownChargedDamage: result.totalChargedDamage,
      ownFastMoveDamage: result.totalFastMoveDamage,
      ownTotalDamage: result.totalChargedDamage + result.totalFastMoveDamage,
      boostMultiplier: species.boost?.multiplier ?? 1,
      boostedType: species.boost?.boostedType ?? species.types[0],
      ownDamageTrajectory: result.ownDamageTrajectory,
    };
  });
}

export interface SustainedComparisonInputs {
  candidates: SpeciesDefinition[];
  /** Per-candidate fast-move selection, matched by index to `candidates`. Omit or use null for a given index to default to that species' first fast move (today's behavior). */
  candidateFastMoveIds?: (string | null)[];
  /** Per-candidate charged-move selection — see candidateFastMoveIds. */
  candidateChargedMoveIds?: (string | null)[];
  boss: SpeciesDefinition;
  /** Boss fast-move selection. Omit/null defaults to the boss's first fast move (today's behavior). */
  bossFastMoveId?: string | null;
  /** Boss charged-move selection. Omit/null defaults to the boss's first charged move (today's behavior) — also determines which move's `perfectlyDodgeable` flag applies. */
  bossChargedMoveId?: string | null;
  level: number;
  ivs: IVSpread;
  /** Governs dodging the boss's CHARGED attacks only. */
  dodge: DodgeBehavior;
  /** Whether the candidate also attempts to dodge the boss's fast attacks — a plain boolean, not a percentage. Costs DODGE_COST_SECONDS per attempt. Defaults to false. */
  dodgeFastAttacks?: boolean;
  /**
   * Hold the charged move for a safer moment instead of firing the instant
   * energy allows — see simulate.ts's StepwiseAttacker.holdChargedMoveUntilSafe
   * for the exact trigger conditions. Defaults to false (today's
   * fire-immediately behavior).
   */
  holdChargedMoveUntilSafe?: boolean;
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
    dodgeFastAttacks = false,
    holdChargedMoveUntilSafe = false,
    bossChargedMoveMeanIntervalSeconds,
    bossChargedMoveWarmupSeconds,
    bossStartingEnergy = 0,
    maxSeconds = DEFAULT_STEPWISE_MAX_SECONDS,
    iterations = 200,
  } = inputs;
  const bossAttackStat = Math.floor((boss.baseAttack + RAID_BOSS_IVS.attack) * RAID_BOSS_CPM);
  const bossDefenseStat = Math.floor((boss.baseDefense + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
  const bossFastMove = resolveMove(boss.fastMoves, inputs.bossFastMoveId);
  const bossChargedMove = resolveMove(boss.chargedMoves, inputs.bossChargedMoveId);
  if (!bossFastMove) throw new Error(`Boss species ${boss.id} has no fast move defined.`);

  return candidates.map((species, i) => {
    const stats = effectiveStatsAtLevel(species, ivs, level);
    const fastMove = resolveMove(species.fastMoves, inputs.candidateFastMoveIds?.[i]);
    const chargedMove = resolveMove(species.chargedMoves, inputs.candidateChargedMoveIds?.[i]);
    if (!fastMove || !chargedMove) {
      throw new Error(`Candidate ${species.id} needs at least one fast move and one charged move.`);
    }
    const candidateFastVsBoss = typeEffectiveness(fastMove.type, boss.types);
    const candidateChargedVsBoss = typeEffectiveness(chargedMove.type, boss.types);
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
          fastDamageOut: {
            stab: species.types.includes(fastMove.type),
            typeEffectiveness: candidateFastVsBoss,
            megaBoostMultiplier: species.boost?.multiplier ?? 1,
          },
          chargedDamageOut: {
            stab: species.types.includes(chargedMove.type),
            typeEffectiveness: candidateChargedVsBoss,
            megaBoostMultiplier: species.boost?.multiplier ?? 1,
          },
          holdChargedMoveUntilSafe,
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
        dodgeFastAttacks,
        maxSeconds,
      },
      iterations,
    );

    return { id: species.id, name: species.name, ...distribution };
  });
}
