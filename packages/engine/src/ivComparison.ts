import { calculateDamage, type DamageInputs } from "./damage.js";
import { resolveCandidateMegaLevel } from "./comparison.js";
import { CPM_TABLE, MAX_POKEMON_POWER_UP_LEVEL } from "./cpm.js";
import { chargedMoveAtMegaLevel, effectiveLevelForMegaLevel, type MegaLevel } from "./megaLevel.js";
import { effectiveStatsAtLevel } from "./stats.js";
import { timeToFaint, type DodgeBehavior } from "./breakpoints.js";
import type { ChargedMove, FastMove, IVSpread, SpeciesDefinition } from "./types.js";

/**
 * Real power-up-reachable levels only — see breakpoints.ts's identical
 * ALL_LEVELS doc comment for why this must filter against
 * MAX_POKEMON_POWER_UP_LEVEL explicitly rather than trusting CPM_TABLE's own
 * (deliberately wider, for an unrelated purpose) key range.
 */
const ALL_LEVELS = Object.keys(CPM_TABLE).map(Number).filter((level) => level <= MAX_POKEMON_POWER_UP_LEVEL).sort((a, b) => a - b);

/**
 * The full set of numbers that matter for one IV spread at one level: what it
 * hits for (fast/charged, against the boss's own defense) and how long it
 * survives (against the boss's fast move). Everything downstream of
 * effectiveStatsAtLevel — never re-floor these, see stats.ts.
 */
export interface IvSpreadStatsAtLevel {
  attackStat: number;
  defenseStat: number;
  hp: number;
  fastMoveDamage: number;
  chargedMoveDamage: number;
  /** null means the spread outlasted the timeToFaint scan window. */
  timeToFaintSeconds: number | null;
}

export interface IvComparisonRow {
  level: number;
  ivA: IvSpreadStatsAtLevel;
  ivB: IvSpreadStatsAtLevel;
  /**
   * Whether the two spreads actually produce a different ROUNDED result at
   * this level, not just a different raw stat — two attack IVs commonly
   * share a floored effective stat (or a floored damage output even when the
   * effective stats differ), and "no breakpoint yet" is exactly the case the
   * UI needs to be able to state plainly rather than imply a difference that
   * isn't really there.
   */
  fastMoveDamageDiffers: boolean;
  chargedMoveDamageDiffers: boolean;
  timeToFaintDiffers: boolean;
}

export interface IvComparisonResult {
  rows: IvComparisonRow[];
  /**
   * The lowest level (ascending) at which each kind of divergence first
   * appears within the scanned range, or null if the two spreads never
   * diverge in that dimension anywhere in range — the headline "these two
   * are identical up to level X" (or "never diverge") figure the UI wants.
   */
  firstDivergenceLevel: {
    fastMoveDamage: number | null;
    chargedMoveDamage: number | null;
    timeToFaint: number | null;
  };
}

/**
 * Compares two arbitrary IV spreads of the SAME species/moveset across a
 * level range, to answer "is it worth powering up spread A over spread B, and
 * if so starting at what level" — the IV/level-investment analogue of this
 * project's core "where does the ranking flip" thesis (breakpoints.ts answers
 * the same question swept across a whole IV range against one level; this
 * answers it for two SPECIFIC spreads swept across levels instead).
 *
 * Reuses the same primitives as breakpoints.ts (effectiveStatsAtLevel,
 * calculateDamage, timeToFaint) rather than duplicating any of that math.
 * Fast and charged moves get their own damage-modifier objects deliberately
 * — see comparison.ts's fastDamageOut/chargedDamageOut precedent — since a
 * shared modifier built from one move's type is wrong whenever the two moves
 * don't share a type (the common case for real species).
 */
export function compareIvSpreads(params: {
  species: SpeciesDefinition;
  fastMove: FastMove;
  chargedMove: ChargedMove;
  ivA: IVSpread;
  ivB: IVSpread;
  levels?: number[];
  /** The boss's effective defense stat, for this attacker's outgoing damage. */
  bossDefenseStat: number;
  fastMoveDamageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  chargedMoveDamageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  /** The boss's effective attack stat and fast move, for this attacker's time-to-faint. */
  bossAttackStat: number;
  bossFastMovePower: number;
  bossFastMoveDurationSeconds: number;
  incomingDamageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  dodge: DodgeBehavior;
  maxSeconds?: number;
  /**
   * `species`' own Mega Level, if any — see megaLevel.ts. Applied to BOTH
   * IV spreads identically (they're the same species/moveset, differing
   * only in IVs), in two ways: (1) every `level` row's effective-stat lookup
   * is shifted via effectiveLevelForMegaLevel (Super Max's +2-effective-level
   * CP bonus) while the row's own displayed `level` stays the real power-up
   * level; (2) `chargedMove` is passed through chargedMoveAtMegaLevel first,
   * so a "+" move's power is scaled before `chargedMoveDamage` is computed —
   * a non-"+" `chargedMove` (the common case) is unaffected either way.
   * Resolved via comparison.ts's `resolveCandidateMegaLevel` (this module
   * used to hand-roll only the `.boost` half of that gate locally; now
   * shares the exact same function, so a caller does not need to check
   * `.boost` OR Super Max eligibility itself): ignored entirely (treated as
   * if omitted) when `species` has no `.boost` at all, and a `"super-max"`
   * request is additionally CLAMPED down to `"max"` when `species` can't
   * actually reach Super Max (no "+" move — see megaLevel.ts's
   * canReachSuperMax). Omitted/undefined is byte-identical to before this
   * parameter existed.
   */
  megaLevel?: MegaLevel | null;
}): IvComparisonResult {
  const {
    species,
    fastMove,
    ivA,
    ivB,
    bossDefenseStat,
    fastMoveDamageModifiers,
    chargedMoveDamageModifiers,
    bossAttackStat,
    bossFastMovePower,
    bossFastMoveDurationSeconds,
    incomingDamageModifiers,
    dodge,
    maxSeconds,
  } = params;

  // Shares comparison.ts's resolveCandidateMegaLevel gate (species.boost
  // check + the Super Max eligibility clamp) rather than re-deriving either
  // locally — see megaLevel's own doc comment above.
  // effectiveLevelForMegaLevel/chargedMoveAtMegaLevel are themselves pure
  // and ungated, so SOME caller has to apply this gate before reaching them.
  const resolvedMegaLevel = resolveCandidateMegaLevel(species, params.megaLevel);
  const chargedMove = chargedMoveAtMegaLevel(params.chargedMove, resolvedMegaLevel);

  const levels = [...(params.levels ?? ALL_LEVELS)].sort((a, b) => a - b);

  const statsForSpread = (iv: IVSpread, level: number): IvSpreadStatsAtLevel => {
    const { attack, defense, stamina } = effectiveStatsAtLevel(species, iv, effectiveLevelForMegaLevel(level, resolvedMegaLevel));
    const fastMoveDamage = calculateDamage({
      power: fastMove.power,
      attackerAttackStat: attack,
      defenderDefenseStat: bossDefenseStat,
      ...fastMoveDamageModifiers,
    });
    const chargedMoveDamage = calculateDamage({
      power: chargedMove.power,
      attackerAttackStat: attack,
      defenderDefenseStat: bossDefenseStat,
      ...chargedMoveDamageModifiers,
    });
    const timeToFaintSeconds = timeToFaint({
      hp: stamina,
      defenseStat: defense,
      bossAttackStat,
      bossFastMovePower,
      bossFastMoveDurationSeconds,
      damageModifiers: incomingDamageModifiers,
      dodge,
      ...(maxSeconds !== undefined ? { maxSeconds } : {}),
    });
    return { attackStat: attack, defenseStat: defense, hp: stamina, fastMoveDamage, chargedMoveDamage, timeToFaintSeconds };
  };

  const rows: IvComparisonRow[] = levels.map((level) => {
    const statsA = statsForSpread(ivA, level);
    const statsB = statsForSpread(ivB, level);
    return {
      level,
      ivA: statsA,
      ivB: statsB,
      fastMoveDamageDiffers: statsA.fastMoveDamage !== statsB.fastMoveDamage,
      chargedMoveDamageDiffers: statsA.chargedMoveDamage !== statsB.chargedMoveDamage,
      timeToFaintDiffers: statsA.timeToFaintSeconds !== statsB.timeToFaintSeconds,
    };
  });

  const firstLevelWhere = (predicate: (row: IvComparisonRow) => boolean): number | null => {
    const found = rows.find(predicate);
    return found ? found.level : null;
  };

  return {
    rows,
    firstDivergenceLevel: {
      fastMoveDamage: firstLevelWhere((r) => r.fastMoveDamageDiffers),
      chargedMoveDamage: firstLevelWhere((r) => r.chargedMoveDamageDiffers),
      timeToFaint: firstLevelWhere((r) => r.timeToFaintDiffers),
    },
  };
}
