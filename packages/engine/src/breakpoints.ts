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

export interface DamageGridCell {
  /** The swept IV (0-15) — Attack IV for attacker-role, Defense IV for defender-role. */
  iv: number;
  level: number;
  /** The swept side's own effective stat at this iv/level (Attack for attacker-role, Defense for defender-role). */
  stat: number;
  damage: number;
}

type DamageGridRole = "attacker" | "defender";

/**
 * Shared sweep underneath both attackDamageGrid and defenseDamageGrid — a
 * FULL, unfiltered iv x level grid (every cell populated, unlike
 * findFastMoveBreakpoints above which only records changes). Both roles are
 * thin wrappers around this single loop/formula so they can never drift
 * apart: `role` only decides which side of calculateDamage's atk/def pair
 * the swept `stat` plugs into, the fixed opposing stat plugs into the other
 * side, and both route through the exact same calculateDamage call.
 */
function damageGrid(params: {
  role: DamageGridRole;
  baseStat: number;
  fixedOpposingStat: number;
  power: number;
  damageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  ivRange?: number[];
  levels?: number[];
}): DamageGridCell[] {
  const { role, baseStat, fixedOpposingStat, power, damageModifiers } = params;
  const ivRange = params.ivRange ?? ALL_IVS;
  const levels = params.levels ?? ALL_LEVELS;

  const cells: DamageGridCell[] = [];
  for (const iv of ivRange) {
    for (const level of levels) {
      const cpm = CPM_TABLE[level];
      if (cpm === undefined) {
        throw new Error(`No CPM entry for level ${level}`);
      }
      const stat = effectiveStat(baseStat, iv, cpm);
      const damage = calculateDamage({
        power,
        attackerAttackStat: role === "attacker" ? stat : fixedOpposingStat,
        defenderDefenseStat: role === "attacker" ? fixedOpposingStat : stat,
        ...damageModifiers,
      });
      cells.push({ iv, level, stat, damage });
    }
  }
  return cells;
}

/**
 * Full attacker-role iv x level damage grid: sweeps the attacking Pokémon's
 * own Attack IV (0-15 by default) x level against a FIXED opposing Defense
 * stat (the caller resolves that from the boss's effective Defense — see
 * bossEffectiveStats in comparison.ts). Every cell is populated, unlike
 * findFastMoveBreakpoints which only records changes — this backs the
 * Attack Breakpoints spreadsheet tab, which needs every cell to render a row.
 */
export function attackDamageGrid(params: {
  baseAttack: number;
  defenderDefenseStat: number;
  power: number;
  damageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  ivRange?: number[];
  levels?: number[];
}): DamageGridCell[] {
  return damageGrid({
    role: "attacker",
    baseStat: params.baseAttack,
    fixedOpposingStat: params.defenderDefenseStat,
    power: params.power,
    damageModifiers: params.damageModifiers,
    ivRange: params.ivRange,
    levels: params.levels,
  });
}

/**
 * Full defender-role iv x level damage grid: sweeps the defending Pokémon's
 * own Defense IV (0-15 by default) x level, against a FIXED opposing Attack
 * stat (the boss's effective Attack — the boss's own IV/level don't vary
 * here, only the defender's do). Same calculateDamage primitive as
 * attackDamageGrid above, just with attack/defense roles swapped — see
 * damageGrid, the one shared loop both route through. Backs the Defense
 * Breakpoints spreadsheet tab (damage the chosen Pokémon RECEIVES).
 */
export function defenseDamageGrid(params: {
  baseDefense: number;
  attackerAttackStat: number;
  power: number;
  damageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  ivRange?: number[];
  levels?: number[];
}): DamageGridCell[] {
  return damageGrid({
    role: "defender",
    baseStat: params.baseDefense,
    fixedOpposingStat: params.attackerAttackStat,
    power: params.power,
    damageModifiers: params.damageModifiers,
    ivRange: params.ivRange,
    levels: params.levels,
  });
}

/** Damage taken while successfully dodging is reduced to this fraction of full damage. */
export const DODGE_DAMAGE_MULTIPLIER = 0.25;

/**
 * The rough duration of a dodge's damage-reduction window in the real game.
 * It is not a standing shield: a player has to re-dodge before each incoming
 * hit, which is only feasible against attacks with a slower cadence than
 * this window — and is not feasible at all while locked into your own
 * charged-move animation (multiple seconds long, no input accepted).
 *
 * IMPORTANT: this constant is consumed ONLY as prose justification elsewhere
 * in this codebase (e.g. simulate.ts's comment on why a boss hit landing
 * mid-own-charged-move-animation always deals full damage) — no function in
 * this package reads this value computationally. That is a deliberate
 * modeling choice, not an oversight: dodging the boss's CHARGED attacks is
 * resolved as an instantaneous per-hit outcome (see dodgeMultiplierForHit
 * below, keyed only by hit index and DodgeBehavior), not as a timed
 * reaction window checked against how much advance warning a specific
 * attack actually gives before landing. Actually gating dodge feasibility on
 * this window would require tracking a windup/telegraph phase separate from
 * a hit's landing time — data pogoapi.net doesn't expose at all (the same
 * "no frame-level timing data exists" reasoning behind
 * ChargedMove.perfectlyDodgeable only ever being hand-set, never derived).
 * Kept as a named constant rather than inlining 0.7s into every comment that
 * cites it, so there's one place to update if this figure (or the modeling
 * decision above) is ever revisited — not because anything computes with it
 * today.
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

/**
 * hitIndex must count only the hit type this DodgeBehavior applies to (charged
 * hits) — see the type doc above. moveIsDodgeable defaults to true; pass
 * false (from the boss's ChargedMove.perfectlyDodgeable) to force full
 * damage regardless of dodge.kind — an undodgeable move ignores the dodge
 * setting entirely, same as "none".
 */
export function dodgeMultiplierForHit(dodge: DodgeBehavior, hitIndex: number, moveIsDodgeable = true): number {
  if (!moveIsDodgeable) return 1;
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
