import { DODGE_COST_SECONDS, DODGE_DAMAGE_MULTIPLIER, type DodgeBehavior } from "./breakpoints.js";
import { calculateDamage, type DamageInputs } from "./damage.js";
import { energyFromDamageTaken } from "./energy.js";
import type { ChargedMove, FastMove } from "./types.js";

export interface AttackerProfile {
  hp: number;
  defenseStat: number;
  attackStat: number;
  fastMove: FastMove;
  chargedMove: ChargedMove;
  /**
   * Damage modifiers for the attacker's OWN FAST move landing on the boss —
   * kept separate from chargedDamageOut because STAB/type-effectiveness
   * depend on the move's own type, which can differ from the charged move's
   * (e.g. a Dragon fast move paired with a Fire charged move). An earlier
   * version of this engine used one shared `damageOut` for both moves, which
   * happened to be invisible in every fixture/test because Scenario A's
   * moves are both Electric — but was wrong for any species whose fast and
   * charged moves differ in type.
   */
  fastDamageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  /** Damage modifiers for the attacker's OWN CHARGED move landing on the boss — see fastDamageOut. */
  chargedDamageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
}

export interface BossProfile {
  attackStat: number;
  defenseStat: number;
  fastMove: FastMove;
  /** Damage modifiers for the boss's fast move landing on the attacker. */
  damageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
}

export interface DamageTrajectoryPoint {
  atSeconds: number;
  cumulativeDamage: number;
}

export interface OpeningBurstResult {
  /** Seconds at which the attacker's cumulative damage taken reached its HP, or null if it survived the window. */
  faintedAtSeconds: number | null;
  chargedAttacksLanded: number;
  totalChargedDamage: number;
  /** Damage the attacker's own fast move dealt to the boss over the whole window — previously untracked entirely (only its energy gain was modeled). */
  totalFastMoveDamage: number;
  totalDamageTaken: number;
  /**
   * The attacker's own cumulative damage over time — fast-move AND
   * charged-move damage COMBINED (not charged-only, despite the name
   * predating fast-move damage tracking): a point at {0, 0}, one point each
   * time either move lands, and a final point at faintedAtSeconds (or the
   * window end) repeating the last value — so a chart can draw a flat line
   * after death/window-end with no special-casing.
   */
  ownDamageTrajectory: DamageTrajectoryPoint[];
}


/**
 * The earliest possible time a boss could have enough energy for its first
 * charged move, counting only its own fast-move casts — not the energy the
 * real game also grants bosses from damage taken, which this engine doesn't
 * model on the boss side. That omission is deliberate: this function answers
 * "cannot happen sooner than X," a lower bound, not "happens at exactly X."
 * Level-independent (raid bosses use a fixed CPM, not a level curve — see
 * raidBoss.ts), so it depends only on the boss's own fast/charged move data.
 *
 * `startingEnergy` models a boss encountered mid-fight (e.g. after an earlier
 * trainer's mega already fainted or rotated out) rather than fresh at 0
 * energy — defaults to 0, today's implicit assumption everywhere else in the
 * engine.
 */
export function bossChargedMoveReadySeconds(
  fastMove: FastMove,
  chargedMove: ChargedMove,
  startingEnergy = 0,
): number {
  const remaining = Math.max(0, chargedMove.energyCost - startingEnergy);
  if (remaining === 0) return 0;
  if (fastMove.energyGain <= 0) return Infinity;
  return Math.ceil(remaining / fastMove.energyGain) * fastMove.durationSeconds;
}

/**
 * Models the "opening burst" phase of a raid: the boss has not yet started
 * throwing charged moves, so only its fast move lands, on a fixed cadence.
 * The attacker's own fast moves land on their own cadence too, EXCEPT that
 * every dodge it attempts against an incoming boss fast move costs it
 * DODGE_COST_SECONDS, pushing its own next fast move later — dodging is not
 * free. Energy accrues from BOTH the attacker's own fast moves and the
 * damage it takes (see energy.ts) — the moment total energy reaches the
 * charged move's cost, it fires immediately and energy resets to 0 (no cast
 * duration/vulnerability window modeled here; Phase 5's stepwise simulator
 * replaces this once that or randomized boss behavior needs modeling). The
 * attacker's own fast move ALSO deals damage to the boss, tracked separately
 * (totalFastMoveDamage) and combined into ownDamageTrajectory alongside
 * charged-move damage — not just used for energy gain.
 *
 * `dodge` (DodgeBehavior) has no effect in this phase — the boss never
 * throws a charged move here, so there's nothing for it to apply to. Use
 * `dodgeFastAttacks` (a plain boolean, not a percentage — matches the "is it
 * worth it" yes/no framing this option represents) to model dodging the
 * boss's fast attacks, the only attack type that exists in this phase.
 * Defaults to no dodging of either kind, matching Scenario A.
 *
 * Implementation note: only the ATTACKER's fast-move schedule can shift (it's
 * the one paying the dodge cost) — the boss's schedule never depends on
 * whether the attacker dodges, so it stays a precomputed periodic array
 * exactly as before. This is walked alongside a dynamically-advanced
 * attacker pointer (2-pointer merge, boss wins an exact tie — matching the
 * old stable-sort-by-time behavior, since the boss array was built first).
 * With dodgeFastAttacks false (the default), the attacker pointer advances
 * by exactly fastMove.durationSeconds every step with no added delay, which
 * reproduces the exact same event sequence as the old precomputed-and-sorted
 * arrays — this function's default-path output is unchanged.
 */
export function simulateOpeningBurst(
  attacker: AttackerProfile,
  boss: BossProfile,
  maxSeconds = 30,
  dodge: DodgeBehavior = { kind: "none" },
  dodgeFastAttacks = false,
): OpeningBurstResult {
  const bossEvents: number[] = [];
  for (let t = boss.fastMove.durationSeconds; t <= maxSeconds; t += boss.fastMove.durationSeconds) {
    bossEvents.push(round(t));
  }

  let energy = 0;
  let totalDamageTaken = 0;
  let chargedAttacksLanded = 0;
  let totalChargedDamage = 0;
  let totalFastMoveDamage = 0;
  let faintedAtSeconds: number | null = null;
  const ownDamageTrajectory: DamageTrajectoryPoint[] = [{ atSeconds: 0, cumulativeDamage: 0 }];

  let bossEventIndex = 0;
  // Unrounded accumulator, matching the old for-loop's `t += duration` on the
  // raw value — only rounded at the point of use/comparison — so floating
  // point behavior matches the previous precomputed-array version exactly.
  let nextAttackerFastMoveAtRaw = attacker.fastMove.durationSeconds;

  for (;;) {
    const nextBossAt = bossEventIndex < bossEvents.length ? bossEvents[bossEventIndex]! : null;
    const nextAttackerAt = nextAttackerFastMoveAtRaw <= maxSeconds ? round(nextAttackerFastMoveAtRaw) : null;
    if (nextBossAt === null && nextAttackerAt === null) break;

    const processBoss = nextBossAt !== null && (nextAttackerAt === null || nextBossAt <= nextAttackerAt);
    let atSeconds: number;

    if (processBoss) {
      atSeconds = nextBossAt!;
      bossEventIndex += 1;
      const fullDamage = calculateDamage({
        power: boss.fastMove.power,
        attackerAttackStat: boss.attackStat,
        defenderDefenseStat: attacker.defenseStat,
        ...boss.damageOut,
      });
      const damage = Math.floor(fullDamage * (dodgeFastAttacks ? DODGE_DAMAGE_MULTIPLIER : 1));
      totalDamageTaken += damage;
      if (totalDamageTaken >= attacker.hp) {
        faintedAtSeconds = atSeconds;
        break;
      }
      energy += energyFromDamageTaken(damage);
      if (dodgeFastAttacks) nextAttackerFastMoveAtRaw += DODGE_COST_SECONDS;
    } else {
      atSeconds = nextAttackerAt!;
      energy += attacker.fastMove.energyGain;
      nextAttackerFastMoveAtRaw += attacker.fastMove.durationSeconds;
      const fastDamage = calculateDamage({
        power: attacker.fastMove.power,
        attackerAttackStat: attacker.attackStat,
        defenderDefenseStat: boss.defenseStat,
        ...attacker.fastDamageOut,
      });
      totalFastMoveDamage += fastDamage;
      ownDamageTrajectory.push({ atSeconds, cumulativeDamage: totalFastMoveDamage + totalChargedDamage });
    }

    if (energy >= attacker.chargedMove.energyCost) {
      const damage = calculateDamage({
        power: attacker.chargedMove.power,
        attackerAttackStat: attacker.attackStat,
        defenderDefenseStat: boss.defenseStat,
        ...attacker.chargedDamageOut,
      });
      totalChargedDamage += damage;
      chargedAttacksLanded += 1;
      energy = 0;
      ownDamageTrajectory.push({ atSeconds, cumulativeDamage: totalFastMoveDamage + totalChargedDamage });
    }
  }

  const endSeconds = faintedAtSeconds ?? maxSeconds;
  const lastPoint = ownDamageTrajectory[ownDamageTrajectory.length - 1]!;
  if (lastPoint.atSeconds < endSeconds) {
    ownDamageTrajectory.push({ atSeconds: endSeconds, cumulativeDamage: lastPoint.cumulativeDamage });
  }

  return { faintedAtSeconds, chargedAttacksLanded, totalChargedDamage, totalFastMoveDamage, totalDamageTaken, ownDamageTrajectory };
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
