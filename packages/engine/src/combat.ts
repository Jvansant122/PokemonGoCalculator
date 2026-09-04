import { dodgeMultiplierForHit, type DodgeBehavior } from "./breakpoints.js";
import { calculateDamage, type DamageInputs } from "./damage.js";
import { energyFromDamageTaken } from "./energy.js";
import type { ChargedMove, FastMove } from "./types.js";

export interface AttackerProfile {
  hp: number;
  defenseStat: number;
  attackStat: number;
  fastMove: FastMove;
  chargedMove: ChargedMove;
  /** Damage modifiers for the attacker's own moves landing on the boss. */
  damageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
}

export interface BossProfile {
  attackStat: number;
  defenseStat: number;
  fastMove: FastMove;
  /** Damage modifiers for the boss's fast move landing on the attacker. */
  damageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
}

export interface OpeningBurstResult {
  /** Seconds at which the attacker's cumulative damage taken reached its HP, or null if it survived the window. */
  faintedAtSeconds: number | null;
  chargedAttacksLanded: number;
  totalChargedDamage: number;
  totalDamageTaken: number;
}

type TimelineEvent = { atSeconds: number; kind: "boss-fast-move" } | { atSeconds: number; kind: "attacker-fast-move" };

/**
 * Models the "opening burst" phase of a raid: the boss has not yet started
 * throwing charged moves, so only its fast move lands, on a fixed cadence
 * (optionally reduced by `dodge`). The attacker's own fast moves land on their
 * own fixed cadence. Energy accrues from BOTH the attacker's own fast moves and
 * the damage it takes (see energy.ts) — the moment total energy reaches the
 * charged move's cost, it fires immediately and energy resets to 0. This is
 * intentionally a simplified scheduler (perfectly periodic casts, instant-cast
 * charged moves, no boss charged moves at all); Phase 5's stepwise simulator
 * replaces it once randomized boss behavior and animation-window vulnerability
 * need modeling. Defaults to no dodging, matching Scenario A.
 */
export function simulateOpeningBurst(
  attacker: AttackerProfile,
  boss: BossProfile,
  maxSeconds = 30,
  dodge: DodgeBehavior = { kind: "none" },
): OpeningBurstResult {
  const events: TimelineEvent[] = [];
  for (let t = boss.fastMove.durationSeconds; t <= maxSeconds; t += boss.fastMove.durationSeconds) {
    events.push({ atSeconds: round(t), kind: "boss-fast-move" });
  }
  for (let t = attacker.fastMove.durationSeconds; t <= maxSeconds; t += attacker.fastMove.durationSeconds) {
    events.push({ atSeconds: round(t), kind: "attacker-fast-move" });
  }
  events.sort((a, b) => a.atSeconds - b.atSeconds);

  let energy = 0;
  let totalDamageTaken = 0;
  let chargedAttacksLanded = 0;
  let totalChargedDamage = 0;
  let faintedAtSeconds: number | null = null;
  let bossHitIndex = 0;

  for (const event of events) {
    if (event.kind === "boss-fast-move") {
      bossHitIndex += 1;
      const fullDamage = calculateDamage({
        power: boss.fastMove.power,
        attackerAttackStat: boss.attackStat,
        defenderDefenseStat: attacker.defenseStat,
        ...boss.damageOut,
      });
      const damage = Math.floor(fullDamage * dodgeMultiplierForHit(dodge, bossHitIndex));
      totalDamageTaken += damage;
      if (totalDamageTaken >= attacker.hp) {
        faintedAtSeconds = event.atSeconds;
        break;
      }
      energy += energyFromDamageTaken(damage);
    } else {
      energy += attacker.fastMove.energyGain;
    }

    if (energy >= attacker.chargedMove.energyCost) {
      const damage = calculateDamage({
        power: attacker.chargedMove.power,
        attackerAttackStat: attacker.attackStat,
        defenderDefenseStat: boss.defenseStat,
        ...attacker.damageOut,
      });
      totalChargedDamage += damage;
      chargedAttacksLanded += 1;
      energy = 0;
    }
  }

  return { faintedAtSeconds, chargedAttacksLanded, totalChargedDamage, totalDamageTaken };
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
