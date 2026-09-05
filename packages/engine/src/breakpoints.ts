import { calculateDamage, type DamageInputs } from "./damage.js";
import { CPM_TABLE } from "./cpm.js";
import { effectiveStat } from "./stats.js";

const ALL_LEVELS = Object.keys(CPM_TABLE).map(Number).sort((a, b) => a - b);
const ALL_IVS = Array.from({ length: 16 }, (_, i) => i);

export interface FastMoveDamageBreakpoint {
  ivAttack: number;
  level: number;
  attackStat: number;
  damage: number;
}

/**
 * Sweeps level x attack-IV and returns only the rows where fast-move damage
 * against a fixed defender actually changes — the breakpoint table, not a
 * single "what is it now" figure. Rows are grouped by IV, ascending by level.
 */
export function findFastMoveBreakpoints(params: {
  baseAttack: number;
  power: number;
  defenderDefenseStat: number;
  damageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  ivRange?: number[];
  levels?: number[];
}): FastMoveDamageBreakpoint[] {
  const { baseAttack, power, defenderDefenseStat, damageModifiers } = params;
  const ivRange = params.ivRange ?? ALL_IVS;
  const levels = params.levels ?? ALL_LEVELS;

  const breakpoints: FastMoveDamageBreakpoint[] = [];
  for (const ivAttack of ivRange) {
    let previousDamage: number | null = null;
    for (const level of levels) {
      const attackStat = effectiveStat(baseAttack, ivAttack, CPM_TABLE[level]!);
      const damage = calculateDamage({
        power,
        attackerAttackStat: attackStat,
        defenderDefenseStat,
        ...damageModifiers,
      });
      if (damage !== previousDamage) {
        breakpoints.push({ ivAttack, level, attackStat, damage });
        previousDamage = damage;
      }
    }
  }
  return breakpoints;
}

/** Damage taken while successfully dodging is reduced to this fraction of full damage. */
export const DODGE_DAMAGE_MULTIPLIER = 0.25;

/**
 * A dodge's damage-reduction window lasts roughly this long from the swipe.
 * It is not a standing shield: a player has to re-dodge before each incoming
 * hit, which is only feasible against attacks with a slower cadence than
 * this window — and is not feasible at all while locked into your own
 * charged-move animation (multiple seconds long, no input accepted). See
 * simulate.ts's stepwise battle model, which enforces that a boss hit
 * landing during the attacker's own cast is never reduced by dodging,
 * regardless of which DodgeBehavior is configured — "perfect" dodge here
 * means perfectly timed against everything a dodge window CAN cover, not
 * invulnerability.
 */
export const DODGE_WINDOW_SECONDS = 0.7;

/**
 * Throwing a dodge — successful or not — costs this many seconds of your own
 * attack cycle: it's a distinct input that interrupts whatever you were about
 * to do, not a free reflex. Applied once per dodge *attempt* (see combat.ts /
 * simulate.ts), pushing the attacker's own next fast-move timing back by this
 * much, which is why dodging every fast attack is usually a bad trade — it
 * measurably lowers your own damage and energy-gain rate — even though it's
 * "free" in the sense that no resource is consumed.
 */
export const DODGE_COST_SECONDS = 0.5;

/**
 * Governs how well the attacker dodges the boss's CHARGED attacks
 * specifically — not fast attacks, which are a separate boolean
 * (`dodgeFastAttacks`) wherever this is consumed (combat.ts/simulate.ts).
 * Splitting these was a deliberate choice: dodging every fast attack is
 * rarely worth its 0.5s cost (DODGE_COST_SECONDS), but dodging a boss's
 * charged attacks — the big, infrequent hits — usually is, so they're
 * different real decisions a player makes, not one dial.
 */
export type DodgeBehavior =
  | { kind: "none" }
  | { kind: "perfect" }
  | { kind: "percentage-missed"; missedFraction: number };

/** hitIndex must count only the hit type this DodgeBehavior applies to (charged hits) — see the type doc above. */
export function dodgeMultiplierForHit(dodge: DodgeBehavior, hitIndex: number): number {
  switch (dodge.kind) {
    case "none":
      return 1;
    case "perfect":
      return DODGE_DAMAGE_MULTIPLIER;
    case "percentage-missed": {
      // Deterministic interleaving: every 1/missedFraction-th hit is a missed dodge.
      if (dodge.missedFraction <= 0) return DODGE_DAMAGE_MULTIPLIER;
      if (dodge.missedFraction >= 1) return 1;
      const period = Math.round(1 / dodge.missedFraction);
      return hitIndex % period === 0 ? 1 : DODGE_DAMAGE_MULTIPLIER;
    }
  }
}

/**
 * Time-to-faint (seconds) for a defender taking a boss's fast move repeatedly,
 * as a function of its effective HP/defense and dodge behavior. Returns null if
 * the defender outlasts maxSeconds.
 */
export function timeToFaint(params: {
  hp: number;
  defenseStat: number;
  bossAttackStat: number;
  bossFastMovePower: number;
  bossFastMoveDurationSeconds: number;
  damageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  dodge: DodgeBehavior;
  maxSeconds?: number;
}): number | null {
  const { hp, defenseStat, bossAttackStat, bossFastMovePower, bossFastMoveDurationSeconds, damageModifiers, dodge } =
    params;
  const maxSeconds = params.maxSeconds ?? 60;

  const fullDamage = calculateDamage({
    power: bossFastMovePower,
    attackerAttackStat: bossAttackStat,
    defenderDefenseStat: defenseStat,
    ...damageModifiers,
  });

  let cumulative = 0;
  let hitIndex = 0;
  for (let t = bossFastMoveDurationSeconds; t <= maxSeconds; t += bossFastMoveDurationSeconds) {
    hitIndex += 1;
    const multiplier = dodgeMultiplierForHit(dodge, hitIndex);
    cumulative += Math.floor(fullDamage * multiplier);
    if (cumulative >= hp) {
      return Math.round(t * 1000) / 1000;
    }
  }
  return null;
}

export interface TimeToFaintRow {
  level: number;
  ivDefense: number;
  hp: number;
  timeToFaintSeconds: number | null;
}

/**
 * Sweeps level x defense-IV and returns time-to-faint for each combination —
 * the survivability side of the breakpoint table, feeding directly into the
 * Phase 3 uptime conversion.
 */
export function timeToFaintTable(params: {
  baseStamina: number;
  baseDefense: number;
  ivStamina: number;
  bossAttackStat: number;
  bossFastMovePower: number;
  bossFastMoveDurationSeconds: number;
  damageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  dodge: DodgeBehavior;
  levels?: number[];
  ivDefenseRange?: number[];
}): TimeToFaintRow[] {
  const levels = params.levels ?? ALL_LEVELS;
  const ivDefenseRange = params.ivDefenseRange ?? ALL_IVS;

  const rows: TimeToFaintRow[] = [];
  for (const level of levels) {
    const cpm = CPM_TABLE[level]!;
    const hp = effectiveStat(params.baseStamina, params.ivStamina, cpm);
    for (const ivDefense of ivDefenseRange) {
      const defenseStat = effectiveStat(params.baseDefense, ivDefense, cpm);
      const timeToFaintSeconds = timeToFaint({
        hp,
        defenseStat,
        bossAttackStat: params.bossAttackStat,
        bossFastMovePower: params.bossFastMovePower,
        bossFastMoveDurationSeconds: params.bossFastMoveDurationSeconds,
        damageModifiers: params.damageModifiers,
        dodge: params.dodge,
      });
      rows.push({ level, ivDefense, hp, timeToFaintSeconds });
    }
  }
  return rows;
}
