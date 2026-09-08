import { bossEffectiveHp, bossEffectiveStats, ownBoostMultiplier, resolveMove } from "./comparison.js";
import { calculateDamage, type DamageInputs } from "./damage.js";
import { effectiveStatsAtLevel } from "./stats.js";
import {
  runTeamRaid,
  type TeamRaidInputs,
  type TeamRaidResult,
  type TeamRaidSlotInput,
} from "./teamRaid.js";
import { typeEffectiveness } from "./typeChart.js";
import type { ChargedMove, FastMove, IVSpread, SpeciesDefinition } from "./types.js";
import { isWeatherBoosted } from "./weather.js";

/**
 * Power-Up Optimizer (v1) — ranks a candidate power-up by TEAM-DPS gained
 * per resource spent, keeping stardust and candy as two SEPARATE numbers
 * (never blended into one composite "score") per this project's core
 * survivability-as-team-DPS thesis. Per-hit damage is FLOORED
 * (damage.ts's calculateDamage), so a power-up can spend real resources and
 * change nothing until it crosses an actual breakpoint against a specific
 * boss — see Part C (powerUpDamageLadder) for the mechanic that surfaces
 * this directly, independent of the noisier simulated-fight DPS numbers in
 * Part E.
 *
 * SOURCING (verified live 2026-09-08 by the overseer against the upstream
 * GAME_MASTER dump — https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json,
 * this project's primary data source — template POKEMON_UPGRADE_SETTINGS ->
 * data.pokemonUpgrades):
 *
 *   upgradesPerLevel: 2, maxNormalUpgradeLevel: 50, xlCandyMinPokemonLevel: 40,
 *   shadowStardustMultiplier: 1.2, shadowCandyMultiplier: 1.2,
 *   purifiedStardustMultiplier: 0.9, purifiedCandyMultiplier: 0.9,
 *   stardustCost: 49 entries, candyCost: 50 entries (a trailing 0 for level
 *   50 itself, which has no power-up — tolerated, see validation), xlCandyCost:
 *   10 entries.
 *
 * and template LUCKY_POKEMON_SETTINGS -> data.luckyPokemonSettings
 * .powerUpStardustDiscountPercent: 0.5 (a FRACTION despite the name — Lucky
 * halves stardust only; candy is completely unaffected).
 *
 * INTERPRETATION (cross-checked against three well-known real costs: level
 * 1 = 200 dust/1 candy per power-up, level 40 = 10,000 dust/10 XL, level
 * 49.5->50 = 15,000 dust/20 XL — all three hold under this reading):
 * `stardustCost`/`candyCost` are indexed by WHOLE level (array index i =
 * whole level i+1, 1..maxNormalUpgradeLevel-1), and because
 * `upgradesPerLevel: 2`, EACH of a whole level's two half-level power-ups
 * (L -> L+0.5 and L+0.5 -> L+1) costs that SAME tabulated amount — i.e. the
 * relevant array index for any half-level step is `Math.floor(fromLevel) - 1`.
 * `xlCandyCost` is indexed the same way but only exists for whole levels
 * `xlCandyMinPokemonLevel..maxNormalUpgradeLevel-1`
 * (`xlCandyCost[wholeLevel - xlCandyMinPokemonLevel]`); `candyCost` is a
 * literal 0 for every whole level in that same range, since the real spend
 * moves entirely to XL. See `powerUpCostTableFromGameMaster`'s validation
 * for the "exactly one of candy/XL must be non-zero per whole level" rule
 * this implies.
 *
 * NOTE ON A DISCREPANCY: the task spec that commissioned this module
 * additionally hand-derived a total of {19000, 15, 10} for the crossing
 * step pair 39.5->40.5. Running the interpretation above (verified via a
 * throwaway script, not hand arithmetic — see this module's test file)
 * instead produces {20000, 15, 10}: the candy/XL split (15 then 0/10)
 * matches exactly, but the stardust total does not, because 39.5->40 draws
 * whole-level-39's tabulated 10000 and 40->40.5 draws whole-level-40's
 * tabulated 10000 (both entries happen to be equal in the raw array), and
 * no self-consistent reading of the given arrays that also reproduces the
 * OTHER four given anchors (level 1, 1->2, level 40, 49.5->50 — all of
 * which check out exactly) produces 19000 instead of 20000 for this pair.
 * This module's own pinned test values use the code-verified 20000, per
 * this project's standing discipline of re-deriving over hand-forcing an
 * assertion — flagged here explicitly for a human to double check against
 * the raw GAME_MASTER dump if it matters.
 *
 * Rounding: Bulbapedia's "Shadow Pokémon (GO)" page (fetched 2026-09-08)
 * states Shadow costs "x6/5 Candy and Stardust to power up" and Purified
 * costs "0.9x Stardust and Candy to power up (rounded up)". This module
 * applies each multiplier PER power-up step and ceils the result per step
 * (per-field, i.e. stardust and candy/XL are each ceiled independently).
 * The shadow-side rounding is [inferred from the purified rule] —
 * Bulbapedia only states "rounded up" explicitly for Purified; stardust
 * values are all multiples of 100 so this only ever actually bites candy.
 *
 * KNOWN GAP (deliberate, v1): an Eternatus-specific override template
 * (POKEMON_UPGRADE_OVERRIDE_SETTINGS_V0890_POKEMON_ETERNATUS, 30x candy)
 * exists upstream. This module does not model per-species overrides at
 * all — every species uses the one shared PowerUpCostTable.
 */

/** One power-up: fromLevel -> fromLevel + 0.5, at BASE (unmodified — no Shadow/Purified/Lucky) cost. */
export interface PowerUpStepCost {
  fromLevel: number;
  stardust: number;
  candy: number;
  xlCandy: number;
}

export interface PowerUpCostTable {
  /** 98 entries, fromLevel 1, 1.5, ..., 49.5 ascending, base (unmodified) costs. */
  steps: PowerUpStepCost[];
  /** The highest level a Pokémon can reach via power-ups (50, per maxNormalUpgradeLevel). */
  maxLevel: number;
  shadowStardustMultiplier: number;
  shadowCandyMultiplier: number;
  purifiedStardustMultiplier: number;
  purifiedCandyMultiplier: number;
  /** Already the MULTIPLIER (0.5), not the raw "discount percent" fraction the GAME_MASTER field is misleadingly named after — see powerUpCostTableFromGameMaster. */
  luckyStardustMultiplier: number;
}

/** The subset of GAME_MASTER's POKEMON_UPGRADE_SETTINGS -> data.pokemonUpgrades this module actually consumes — see this module's top doc comment for the full raw shape and sourcing. */
export interface GameMasterPokemonUpgradeSettings {
  upgradesPerLevel: number;
  maxNormalUpgradeLevel: number;
  xlCandyMinPokemonLevel: number;
  stardustCost: number[];
  candyCost: number[];
  xlCandyCost: number[];
  shadowStardustMultiplier: number;
  shadowCandyMultiplier: number;
  purifiedStardustMultiplier: number;
  purifiedCandyMultiplier: number;
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite, non-negative number — got ${value}.`);
  }
}

/**
 * The ONE place the raw GAME_MASTER upgrade-cost record is interpreted —
 * same "single on-ramp" role as gamemaster.ts's fromGameMaster/
 * fromGameMasterMove. scripts/sync-data.ts is expected to import and call
 * this directly; don't grow a second interpretation of pokemonUpgrades
 * anywhere else.
 */
export function powerUpCostTableFromGameMaster(
  upgrades: GameMasterPokemonUpgradeSettings,
  luckyStardustDiscountPercent: number,
): PowerUpCostTable {
  const {
    upgradesPerLevel,
    maxNormalUpgradeLevel,
    xlCandyMinPokemonLevel,
    stardustCost,
    candyCost,
    xlCandyCost,
    shadowStardustMultiplier,
    shadowCandyMultiplier,
    purifiedStardustMultiplier,
    purifiedCandyMultiplier,
  } = upgrades;

  if (upgradesPerLevel !== 2) {
    throw new Error(
      `powerUpCostTableFromGameMaster only understands upgradesPerLevel: 2 (two half-level power-ups per whole ` +
        `level, both costing the same tabulated amount) — got ${upgradesPerLevel}. A different value would need a ` +
        `different derivation entirely, not just a different constant.`,
    );
  }

  const expectedWholeLevelCount = maxNormalUpgradeLevel - 1;
  if (stardustCost.length !== expectedWholeLevelCount) {
    throw new Error(
      `stardustCost must have maxNormalUpgradeLevel - 1 = ${expectedWholeLevelCount} entries, got ${stardustCost.length}.`,
    );
  }
  // The live dump (2026-09-08) carries ONE more candyCost entry than
  // stardustCost — a trailing 0 for level 50, which has no power-up at all.
  // Tolerate extra trailing entries only when they are all 0; anything else
  // would mean the two arrays are no longer indexed the same way.
  if (candyCost.length < stardustCost.length) {
    throw new Error(`candyCost must have at least as many entries as stardustCost (${stardustCost.length}), got ${candyCost.length}.`);
  }
  if (candyCost.slice(stardustCost.length).some((v) => v !== 0)) {
    throw new Error(`candyCost has ${candyCost.length - stardustCost.length} extra entries beyond stardustCost's ${stardustCost.length}, and they are not all 0.`);
  }
  const expectedXlCount = maxNormalUpgradeLevel - xlCandyMinPokemonLevel;
  if (xlCandyCost.length !== expectedXlCount) {
    throw new Error(
      `xlCandyCost must have maxNormalUpgradeLevel - xlCandyMinPokemonLevel = ${expectedXlCount} entries, got ${xlCandyCost.length}.`,
    );
  }

  stardustCost.forEach((v, i) => assertFiniteNonNegative(v, `stardustCost[${i}]`));
  candyCost.forEach((v, i) => assertFiniteNonNegative(v, `candyCost[${i}]`));
  xlCandyCost.forEach((v, i) => assertFiniteNonNegative(v, `xlCandyCost[${i}]`));
  assertFiniteNonNegative(shadowStardustMultiplier, "shadowStardustMultiplier");
  assertFiniteNonNegative(shadowCandyMultiplier, "shadowCandyMultiplier");
  assertFiniteNonNegative(purifiedStardustMultiplier, "purifiedStardustMultiplier");
  assertFiniteNonNegative(purifiedCandyMultiplier, "purifiedCandyMultiplier");
  assertFiniteNonNegative(luckyStardustDiscountPercent, "luckyStardustDiscountPercent");

  // Whole-level candy/XL exclusivity: below xlCandyMinPokemonLevel, a whole
  // level must spend regular candy (there's no XL entry to even check yet);
  // at/above it, candyCost is retired to a literal 0 and the real spend
  // moves entirely to xlCandyCost. Exactly one of the two may be non-zero
  // for any given whole level — never both, never neither.
  for (let level = 1; level <= expectedWholeLevelCount; level++) {
    const idx = level - 1;
    const candy = candyCost[idx]!;
    if (level < xlCandyMinPokemonLevel) {
      if (candy <= 0) {
        throw new Error(
          `Whole level ${level} is below xlCandyMinPokemonLevel (${xlCandyMinPokemonLevel}) but candyCost[${idx}] is ${candy} (must be > 0).`,
        );
      }
      continue;
    }
    const xl = xlCandyCost[level - xlCandyMinPokemonLevel]!;
    if ((candy > 0) === (xl > 0)) {
      throw new Error(
        `Whole level ${level} must spend exactly one of regular candy or XL candy, not both or neither — got ` +
          `candyCost[${idx}]=${candy}, xlCandyCost[${level - xlCandyMinPokemonLevel}]=${xl}.`,
      );
    }
  }

  const steps: PowerUpStepCost[] = [];
  for (let halfStep = 0; halfStep < expectedWholeLevelCount * 2; halfStep++) {
    const fromLevel = 1 + halfStep * 0.5;
    const anchorLevel = Math.floor(fromLevel);
    const idx = anchorLevel - 1;
    const stardust = stardustCost[idx]!;
    const usesXl = anchorLevel >= xlCandyMinPokemonLevel;
    steps.push({
      fromLevel,
      stardust,
      candy: usesXl ? 0 : candyCost[idx]!,
      xlCandy: usesXl ? xlCandyCost[anchorLevel - xlCandyMinPokemonLevel]! : 0,
    });
  }

  return {
    steps,
    maxLevel: maxNormalUpgradeLevel,
    shadowStardustMultiplier,
    shadowCandyMultiplier,
    purifiedStardustMultiplier,
    purifiedCandyMultiplier,
    luckyStardustMultiplier: 1 - luckyStardustDiscountPercent,
  };
}

// --- Modifiers and costs (Part B) -----------------------------------------

export interface PowerUpCostModifiers {
  isShadow: boolean;
  isPurified: boolean;
  isLucky: boolean;
}

export interface PowerUpResourceCost {
  stardust: number;
  candy: number;
  xlCandy: number;
}

/**
 * Converts a level to a "half-level index" (level * 2) for integer-safe
 * arithmetic — see this function's every call site below. Throws if `level`
 * isn't actually a multiple of 0.5.
 */
function toHalfIndex(level: number, label: string): number {
  const doubled = level * 2;
  const rounded = Math.round(doubled);
  if (Math.abs(doubled - rounded) > 1e-9) {
    throw new Error(`${label} (${level}) must be a half-level (a multiple of 0.5).`);
  }
  return rounded;
}

function stepIndexForFromLevel(table: PowerUpCostTable, fromLevel: number): number {
  const half = toHalfIndex(fromLevel, "fromLevel");
  const minHalf = toHalfIndex(1, "table minimum level");
  const maxHalf = toHalfIndex(table.maxLevel, "table maxLevel");
  if (half < minHalf || half > maxHalf - 1) {
    throw new Error(`fromLevel ${fromLevel} is out of range — must be a half-level in [1, ${table.maxLevel - 0.5}].`);
  }
  return half - minHalf;
}

/** The cost of ONE power-up (fromLevel -> fromLevel + 0.5), with Shadow/Purified/Lucky applied. */
export function powerUpStepCost(table: PowerUpCostTable, fromLevel: number, modifiers: PowerUpCostModifiers): PowerUpResourceCost {
  if (modifiers.isShadow && modifiers.isPurified) {
    throw new Error(
      "A Pokémon cannot be both Shadow and Purified at once — the same mutual-exclusion rule as shadow.ts's shadowAdjustedBaseStats.",
    );
  }
  const base = table.steps[stepIndexForFromLevel(table, fromLevel)]!;

  let stardustMultiplier = 1;
  let candyMultiplier = 1;
  if (modifiers.isShadow) {
    stardustMultiplier *= table.shadowStardustMultiplier;
    candyMultiplier *= table.shadowCandyMultiplier;
  }
  if (modifiers.isPurified) {
    stardustMultiplier *= table.purifiedStardustMultiplier;
    candyMultiplier *= table.purifiedCandyMultiplier;
  }
  if (modifiers.isLucky) {
    // Lucky ONLY discounts stardust (LUCKY_POKEMON_SETTINGS) — never folded
    // into candyMultiplier.
    stardustMultiplier *= table.luckyStardustMultiplier;
  }

  return {
    stardust: Math.ceil(base.stardust * stardustMultiplier),
    candy: Math.ceil(base.candy * candyMultiplier),
    xlCandy: Math.ceil(base.xlCandy * candyMultiplier),
  };
}

/** Sum of every individual power-up's cost from fromLevel to toLevel (exclusive of the final level's own outgoing step). Equal levels -> zeros. Throws if toLevel < fromLevel. */
export function powerUpCost(table: PowerUpCostTable, fromLevel: number, toLevel: number, modifiers: PowerUpCostModifiers): PowerUpResourceCost {
  const fromHalf = toHalfIndex(fromLevel, "fromLevel");
  const toHalf = toHalfIndex(toLevel, "toLevel");
  if (toHalf < fromHalf) {
    throw new Error(`powerUpCost's toLevel (${toLevel}) must be >= fromLevel (${fromLevel}).`);
  }
  let total: PowerUpResourceCost = { stardust: 0, candy: 0, xlCandy: 0 };
  for (let half = fromHalf; half < toHalf; half++) {
    total = addResourceCosts(total, powerUpStepCost(table, half / 2, modifiers));
  }
  return total;
}

/** Every half-level strictly above fromLevel through the table's maxLevel, ascending. */
export function powerUpLevelsAbove(table: PowerUpCostTable, fromLevel: number): number[] {
  const fromHalf = toHalfIndex(fromLevel, "fromLevel");
  const maxHalf = toHalfIndex(table.maxLevel, "table maxLevel");
  const levels: number[] = [];
  for (let half = fromHalf + 1; half <= maxHalf; half++) {
    levels.push(half / 2);
  }
  return levels;
}

export function addResourceCosts(a: PowerUpResourceCost, b: PowerUpResourceCost): PowerUpResourceCost {
  return { stardust: a.stardust + b.stardust, candy: a.candy + b.candy, xlCandy: a.xlCandy + b.xlCandy };
}

// --- Per-hit damage ladder (Part C) ----------------------------------------

export interface PowerUpDamageStep {
  level: number;
  attackStat: number;
  fastMoveDamage: number;
  chargedMoveDamage: number;
  cumulativeCost: PowerUpResourceCost;
}

export interface PowerUpDamageLadder {
  current: { level: number; attackStat: number; fastMoveDamage: number; chargedMoveDamage: number };
  /** One per half-level above current, ascending. */
  steps: PowerUpDamageStep[];
  /** First step whose fastMoveDamage exceeds current's — the breakpoint half of this module's thesis (a power-up can be "free" damage-wise until this point). Null if none in range. */
  nextFastBreakpoint: PowerUpDamageStep | null;
  nextChargedBreakpoint: PowerUpDamageStep | null;
}

/**
 * The floored per-hit damage ladder for one species/moveset/IV-spread as it
 * powers up, against one boss's defense stat — the breakpoint half of this
 * module's thesis: resources spent below a breakpoint change nothing.
 * Reuses effectiveStatsAtLevel/calculateDamage exactly as ivComparison.ts
 * does; never re-derives either.
 */
export function powerUpDamageLadder(params: {
  species: SpeciesDefinition;
  ivs: IVSpread;
  fromLevel: number;
  fastMove: FastMove;
  chargedMove: ChargedMove;
  bossDefenseStat: number;
  fastMoveDamageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  chargedMoveDamageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  table: PowerUpCostTable;
  modifiers: PowerUpCostModifiers;
  maxLevel?: number;
}): PowerUpDamageLadder {
  const {
    species,
    ivs,
    fromLevel,
    fastMove,
    chargedMove,
    bossDefenseStat,
    fastMoveDamageModifiers,
    chargedMoveDamageModifiers,
    table,
    modifiers,
    maxLevel = table.maxLevel,
  } = params;

  const statsAt = (level: number) => {
    const { attack } = effectiveStatsAtLevel(species, ivs, level);
    return {
      attackStat: attack,
      fastMoveDamage: calculateDamage({
        power: fastMove.power,
        attackerAttackStat: attack,
        defenderDefenseStat: bossDefenseStat,
        ...fastMoveDamageModifiers,
      }),
      chargedMoveDamage: calculateDamage({
        power: chargedMove.power,
        attackerAttackStat: attack,
        defenderDefenseStat: bossDefenseStat,
        ...chargedMoveDamageModifiers,
      }),
    };
  };

  const current = { level: fromLevel, ...statsAt(fromLevel) };

  const levels = powerUpLevelsAbove(table, fromLevel).filter((level) => level <= maxLevel);
  const steps: PowerUpDamageStep[] = levels.map((level) => ({
    level,
    ...statsAt(level),
    cumulativeCost: powerUpCost(table, fromLevel, level, modifiers),
  }));

  return {
    current,
    steps,
    nextFastBreakpoint: steps.find((s) => s.fastMoveDamage > current.fastMoveDamage) ?? null,
    nextChargedBreakpoint: steps.find((s) => s.chargedMoveDamage > current.chargedMoveDamage) ?? null,
  };
}

// --- The optimizer (Part E) -------------------------------------------------

export interface PowerUpSlotInput extends TeamRaidSlotInput {
  /**
   * This slot's CURRENT level/IVs — required here (unlike
   * TeamRaidSlotInput's own optional level/ivs, which are per-slot
   * OVERRIDES over a shared roster-wide default). The optimizer has no
   * roster-wide default to fall back to: every fielded slot needs its own
   * explicit starting point to build a cost table lookup and a damage
   * ladder against. Ignored for an empty slot (species: null/undefined).
   */
  level: number;
  ivs: IVSpread;
  costModifiers: PowerUpCostModifiers;
  candyOnHand: number;
  xlCandyOnHand: number;
}

export interface PowerUpOptimizerInputs extends Omit<TeamRaidInputs, "slots" | "level" | "ivs"> {
  slots: PowerUpSlotInput[];
  costTable: PowerUpCostTable;
  stardustOnHand: number;
  /** Defaults to costTable.maxLevel. */
  maxLevel?: number;
  /**
   * How many full team-raid runs to average per candidate (and for the
   * baseline). Defaults to 3. Each iteration i's seed is `seed + i * 7919`
   * — the same offsetting convention runStepwiseDistribution already uses.
   * Critically, the SAME seed set is reused for the baseline AND every
   * candidate (common random numbers) — this is what makes small
   * candidate-vs-baseline deltas rankable at all; independently-seeded runs
   * would bury a real but small teamDps delta in run-to-run jitter noise.
   */
  iterations?: number;
}

export interface PowerUpEncounterSummary {
  /** Mean, over iterations, of: cleared within the timer -> bossHp / timeToClearSeconds; else teamDamageAtRaidSeconds(result, raidTimerSeconds) / raidTimerSeconds. */
  teamDps: number;
  /** Fraction of iterations with clearsWithinTimer. */
  clearRate: number;
  /** Mean over CLEARED iterations only; null if none cleared. */
  meanTimeToClearSeconds: number | null;
  /** Mean of min(bossHp, teamDamageAtRaidSeconds(result, raidTimerSeconds)). */
  meanDamageAtTimer: number;
}

/**
 * Cumulative team damage as of `atSeconds` on the raid-global clock, reading
 * TeamRaidResult.slots[].ownDamageTrajectory (already raid-global,
 * cumulative-across-fights). Slots — and each slot's own trajectory points —
 * are stored chronologically, and cumulative damage is monotonic
 * non-decreasing throughout a run, so the last qualifying point visited in
 * traversal order is the answer. Clips the timerExpired-mid-fight case,
 * where the currently-active fight's own trajectory legitimately runs past
 * the timer (its own simulated window is sized to always cover
 * raidTimerSeconds — see TeamRaidInputs.maxSecondsPerSlot). Returns 0 if no
 * point qualifies (e.g. atSeconds is before the fight even starts).
 */
export function teamDamageAtRaidSeconds(result: TeamRaidResult, atSeconds: number): number {
  let last = 0;
  for (const slot of result.slots) {
    for (const point of slot.ownDamageTrajectory) {
      if (point.atSeconds <= atSeconds) {
        last = point.cumulativeDamage;
      } else {
        break;
      }
    }
  }
  return last;
}

export interface PowerUpCandidate {
  slotIndex: number;
  speciesId: string;
  speciesName: string;
  fromLevel: number;
  toLevel: number;
  cost: PowerUpResourceCost;
  affordable: boolean;
  summary: PowerUpEncounterSummary;
  deltaTeamDps: number;
  /** Null when cost.stardust is 0. */
  deltaTeamDpsPer1000Stardust: number | null;
  /** Regular candy only. Null when cost.candy is 0. */
  deltaTeamDpsPerCandy: number | null;
  /** Null when cost.xlCandy is 0. */
  deltaTeamDpsPerXlCandy: number | null;
  /** Whether this slot's own floored per-hit damage (fast/charged) against this boss actually differs between fromLevel and toLevel — from the slot's damage ladder (Part C). */
  crossesFastBreakpoint: boolean;
  crossesChargedBreakpoint: boolean;
}

export interface PowerUpOptimizerResult {
  baseline: PowerUpEncounterSummary;
  bossHp: number;
  /** Every fielded slot x every half-level above its current level through maxLevel, ascending slotIndex then toLevel. */
  candidates: PowerUpCandidate[];
  /** One per input slot (same index), null for an empty slot. */
  ladders: (PowerUpDamageLadder | null)[];
  /** Max deltaTeamDps among affordable candidates with delta > 0. Null if none qualify. */
  bestAffordableByDelta: PowerUpCandidate | null;
  /** Max deltaTeamDpsPer1000Stardust among affordable candidates with delta > 0 (and a non-null per-1000-stardust value). Null if none qualify. */
  bestAffordableByStardustEfficiency: PowerUpCandidate | null;
}

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

function summarizeResults(results: TeamRaidResult[], bossHp: number, raidTimerSeconds: number): PowerUpEncounterSummary {
  const dpsValues = results.map((r) =>
    r.clearsWithinTimer && r.timeToClearSeconds !== null
      ? bossHp / r.timeToClearSeconds
      : teamDamageAtRaidSeconds(r, raidTimerSeconds) / raidTimerSeconds,
  );
  const clearedTimes = results
    .filter((r) => r.clearsWithinTimer && r.timeToClearSeconds !== null)
    .map((r) => r.timeToClearSeconds!);
  return {
    teamDps: mean(dpsValues),
    clearRate: results.filter((r) => r.clearsWithinTimer).length / results.length,
    meanTimeToClearSeconds: clearedTimes.length > 0 ? mean(clearedTimes) : null,
    meanDamageAtTimer: mean(results.map((r) => Math.min(bossHp, teamDamageAtRaidSeconds(r, raidTimerSeconds)))),
  };
}

/** Maps PowerUpSlotInput[] to TeamRaidSlotInput[], optionally overriding ONE slot's level (part D's per-slot override) — every other slot keeps its own current level/ivs. */
function toTeamRaidSlots(slots: PowerUpSlotInput[], overrideIndex: number | null, overrideLevel: number | undefined): TeamRaidSlotInput[] {
  return slots.map((slot, i) => ({
    species: slot.species,
    fastMoveId: slot.fastMoveId,
    chargedMoveId: slot.chargedMoveId,
    isMega: slot.isMega,
    level: i === overrideIndex ? overrideLevel : slot.level,
    ivs: slot.ivs,
  }));
}

/**
 * Ranks every possible power-up (every fielded slot x every half-level
 * above its current level) by team-DPS gained, run as a full paired
 * (common-random-numbers) team-raid comparison against a do-nothing
 * baseline — reusing runTeamRaid/simulateStepwiseBattle unchanged, no new
 * combat math. Cost: O(fielded slots x half-levels above current x
 * iterations) full team raids; the web layer is expected to debounce this.
 *
 * The roster-wide level/ivs runTeamRaid technically requires are dead
 * fallbacks here — every slot below always carries its own explicit
 * level/ivs override (see toTeamRaidSlots / TeamRaidSlotInput's level/ivs,
 * part D), so `slot.level ?? level` always resolves to the slot's own
 * value. The first fielded slot's own numbers are used as a harmless
 * placeholder to satisfy TeamRaidInputs' required fields.
 *
 * Lets runTeamRaid's own validation throw (empty roster, two megas, etc.)
 * rather than duplicating it.
 */
export function optimizePowerUps(inputs: PowerUpOptimizerInputs): PowerUpOptimizerResult {
  const { slots, costTable, stardustOnHand, maxLevel = costTable.maxLevel, iterations = 3, seed = 1, ...rest } = inputs;

  const seeds = Array.from({ length: iterations }, (_, i) => seed + i * 7919);

  const firstFielded = slots.find((s) => s.species != null);
  const rosterLevel = firstFielded?.level ?? 1;
  const rosterIvs: IVSpread = firstFielded?.ivs ?? { attack: 0, defense: 0, stamina: 0 };

  const bossHp = bossEffectiveHp(rest.boss, rest.bossRaidTier);
  const { defense: bossDefenseStat } = bossEffectiveStats(rest.boss, rest.bossRaidTier);
  const weather = rest.weather ?? "none";

  const baselineSlots = toTeamRaidSlots(slots, null, undefined);
  const baselineResults = seeds.map((s) => runTeamRaid({ ...rest, slots: baselineSlots, level: rosterLevel, ivs: rosterIvs, seed: s }));
  const baseline = summarizeResults(baselineResults, bossHp, rest.raidTimerSeconds);

  const ladders: (PowerUpDamageLadder | null)[] = slots.map((slot) => {
    if (!slot.species) return null;
    const fastMove = resolveMove(slot.species.fastMoves, slot.fastMoveId);
    const chargedMove = resolveMove(slot.species.chargedMoves, slot.chargedMoveId);
    if (!fastMove || !chargedMove) return null;
    return powerUpDamageLadder({
      species: slot.species,
      ivs: slot.ivs,
      fromLevel: slot.level,
      fastMove,
      chargedMove,
      bossDefenseStat,
      fastMoveDamageModifiers: {
        stab: slot.species.types.includes(fastMove.type),
        typeEffectiveness: typeEffectiveness(fastMove.type, rest.boss.types),
        megaBoostMultiplier: ownBoostMultiplier(slot.species.boost, fastMove.type),
        weatherBoosted: isWeatherBoosted(fastMove.type, weather),
      },
      chargedMoveDamageModifiers: {
        stab: slot.species.types.includes(chargedMove.type),
        typeEffectiveness: typeEffectiveness(chargedMove.type, rest.boss.types),
        megaBoostMultiplier: ownBoostMultiplier(slot.species.boost, chargedMove.type),
        weatherBoosted: isWeatherBoosted(chargedMove.type, weather),
      },
      table: costTable,
      modifiers: slot.costModifiers,
      maxLevel,
    });
  });

  const candidates: PowerUpCandidate[] = [];
  slots.forEach((slot, slotIndex) => {
    if (!slot.species) return;
    const ladder = ladders[slotIndex] ?? null;
    const levels = powerUpLevelsAbove(costTable, slot.level).filter((lvl) => lvl <= maxLevel);

    for (const toLevel of levels) {
      const cost = powerUpCost(costTable, slot.level, toLevel, slot.costModifiers);
      const affordable = cost.stardust <= stardustOnHand && cost.candy <= slot.candyOnHand && cost.xlCandy <= slot.xlCandyOnHand;

      const candidateSlots = toTeamRaidSlots(slots, slotIndex, toLevel);
      const candidateResults = seeds.map((s) => runTeamRaid({ ...rest, slots: candidateSlots, level: rosterLevel, ivs: rosterIvs, seed: s }));
      const summary = summarizeResults(candidateResults, bossHp, rest.raidTimerSeconds);
      const deltaTeamDps = summary.teamDps - baseline.teamDps;

      const ladderStep = ladder?.steps.find((s) => s.level === toLevel) ?? null;

      candidates.push({
        slotIndex,
        speciesId: slot.species.id,
        speciesName: slot.species.name,
        fromLevel: slot.level,
        toLevel,
        cost,
        affordable,
        summary,
        deltaTeamDps,
        deltaTeamDpsPer1000Stardust: cost.stardust > 0 ? (deltaTeamDps / cost.stardust) * 1000 : null,
        deltaTeamDpsPerCandy: cost.candy > 0 ? deltaTeamDps / cost.candy : null,
        deltaTeamDpsPerXlCandy: cost.xlCandy > 0 ? deltaTeamDps / cost.xlCandy : null,
        crossesFastBreakpoint: ladder != null && ladderStep != null && ladderStep.fastMoveDamage !== ladder.current.fastMoveDamage,
        crossesChargedBreakpoint: ladder != null && ladderStep != null && ladderStep.chargedMoveDamage !== ladder.current.chargedMoveDamage,
      });
    }
  });

  const affordablePositive = candidates.filter((c) => c.affordable && c.deltaTeamDps > 0);
  const bestAffordableByDelta =
    affordablePositive.length > 0 ? affordablePositive.reduce((best, c) => (c.deltaTeamDps > best.deltaTeamDps ? c : best)) : null;

  const stardustEfficiencyCandidates = affordablePositive.filter((c) => c.deltaTeamDpsPer1000Stardust !== null);
  const bestAffordableByStardustEfficiency =
    stardustEfficiencyCandidates.length > 0
      ? stardustEfficiencyCandidates.reduce((best, c) => (c.deltaTeamDpsPer1000Stardust! > best.deltaTeamDpsPer1000Stardust! ? c : best))
      : null;

  return { baseline, bossHp, candidates, ladders, bestAffordableByDelta, bestAffordableByStardustEfficiency };
}
