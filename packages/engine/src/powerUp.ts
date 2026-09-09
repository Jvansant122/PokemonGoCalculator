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
  /**
   * A shared, fungible Rare Candy pool: spendable as regular Candy on ANY
   * fielded slot, not just one species (unlike PowerUpSlotInput.candyOnHand,
   * which is real per-species Candy) — see RARE_CANDY_TO_CANDY_RATIO for the
   * (confirmed 1:1) conversion.
   *
   * Consumed by BOTH exports, but for different jobs. planPowerUpBudget
   * genuinely allocates the pool across slots. optimizePowerUps only counts
   * it toward each candidate's own PowerUpCandidate.affordable flag — it
   * never allocates, because every candidate there is priced independently.
   * Without that, the two exports contradict each other on the same tab: a
   * 12-Candy step for a slot holding 10 Candy would read "unaffordable" in
   * the ranked table while the budget plan actively recommends it. Defaults
   * to 0, so a caller that passes neither pool keeps exactly its previous
   * behaviour.
   */
  rareCandyOnHand?: number;
  /**
   * The same shared-pool mechanic as rareCandyOnHand, but for the wholly
   * SEPARATE Rare Candy XL item — see RARE_CANDY_XL_TO_XL_CANDY_RATIO
   * (confirmed 1:1, never derivable from plain Rare Candy). Defaults to 0.
   *
   * NOT modelled here (a real but deliberately out-of-scope lever, per
   * MECHANICS.md's "Fungible candy currencies" entry, 2026-09-08): the
   * in-game "Convert" button, which turns 100 regular Candy into 1 XL Candy
   * for the SAME species — a real arbitrage a sufficiently aggressive
   * planner could exploit, but modelling it would let this planner spend
   * candy the user was deliberately saving for a different species, and at
   * realistic per-species candy counts (tens, not hundreds) it almost never
   * actually unlocks a step anyway.
   */
  rareCandyXlOnHand?: number;
  /** Defaults to costTable.maxLevel. */
  maxLevel?: number;
  /**
   * How many full team-raid runs to average per candidate (and for the
   * baseline). Defaults to 3, which is only enough for a smoke result —
   * measured on the default roster (202 candidates) at 3 seeds, 78
   * candidates come out with a negative deltaTeamDps purely from seed
   * noise; at 40 seeds only 24 do (4 with a 15s revive cost), none below
   * -0.05. The web tab uses 20-40 iterations for a real result; this
   * default is deliberately cheap so callers that only need shape/wiring
   * (tests, a first paint) aren't paying for it. Each iteration i's seed is
   * `seed + i * 7919` — the same offsetting convention
   * runStepwiseDistribution already uses. Critically, the SAME seed set is
   * reused for the baseline AND every candidate (common random numbers) —
   * this is what makes small candidate-vs-baseline deltas rankable at all;
   * independently-seeded runs would bury a real but small teamDps delta in
   * run-to-run jitter noise. Even so, that pairing is weak for THIS
   * comparison (a level change shifts when the boss's charged-move RNG is
   * consumed) — see PowerUpOptimizerResult.noiseFloorTeamDps, which is
   * deliberately conservative about how much the pairing actually helps.
   * Measured cost: ~217ms for 202 candidates at 3 seeds on the default
   * roster, so roughly ~1.5s at 20.
   */
  iterations?: number;
}

export interface PowerUpEncounterSummary {
  /** Mean, over iterations, of: cleared within the timer -> bossHp / timeToClearSeconds; else teamDamageAtRaidSeconds(result, raidTimerSeconds) / raidTimerSeconds. */
  teamDps: number;
  /** The per-iteration teamDps values that fed the mean above, in seed order (same length as `iterations`). */
  teamDpsPerSeed: number[];
  /** Population standard deviation of teamDpsPerSeed. Always 0 for a single iteration (a lone sample has no deviation from itself, not "no noise"). */
  teamDpsStdDev: number;
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
  /**
   * Whether THIS candidate could be bought on its own, counting the slot's
   * own Candy/XL Candy plus the shared Rare Candy pools
   * (PowerUpOptimizerInputs.rareCandyOnHand/rareCandyXlOnHand, both 0 by
   * default).
   *
   * Deliberately a SINGLE-candidate test: every candidate is priced as if it
   * were the only power-up bought, so two candidates can each be affordable
   * while being jointly unaffordable (they'd draw on the same stardust and
   * the same shared pools). That is what this table means — "what could I do
   * next?", one row at a time. Do NOT "fix" this into a joint budget
   * constraint; the joint question is planPowerUpBudget's entire job, and
   * making these rows interdependent would silently change what the tab's
   * ranked table has always shown.
   */
  affordable: boolean;
  /** Rare Candy this candidate would have to draw from the shared pool, i.e. the part of cost.candy the slot's own candyOnHand can't cover. 0 when the slot funds it alone. Lets the UI say "affordable, but spends 2 Rare Candy". */
  sharedCandyNeeded: number;
  /** Same as sharedCandyNeeded, for the shared Rare Candy XL pool against cost.xlCandy. */
  sharedXlCandyNeeded: number;
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
  /**
   * `Math.abs(deltaTeamDps) > noiseFloorTeamDps` (the result's noise floor —
   * see PowerUpOptimizerResult.noiseFloorTeamDps). A level change shifts
   * WHEN the boss's charged-move RNG is consumed, which is weak signal on
   * its own — most small deltas measured on the default roster are this
   * seed-timing noise, not a real effect. The web layer should render a
   * candidate with this false as "no measurable change," not as a signed
   * delta.
   */
  deltaExceedsNoise: boolean;
}

export interface PowerUpOptimizerResult {
  baseline: PowerUpEncounterSummary;
  bossHp: number;
  /** The iteration count actually used (same value the caller passed as `iterations`, or the default). */
  iterations: number;
  /**
   * A conservative noise floor for `deltaTeamDps`, in the same teamDps
   * units: `2 * baseline.teamDpsStdDev * Math.sqrt(2 / iterations)` —
   * roughly a 95% band on the difference between two independent means of
   * `iterations` seeds each. This DELIBERATELY ignores the variance
   * reduction the paired common-random-numbers seeding (see
   * PowerUpOptimizerInputs.iterations) would normally buy, because that
   * pairing is weak here: a level change shifts when the boss's own
   * charged-move RNG gets consumed, decorrelating the "same seed" runs more
   * than a typical paired comparison. Treating the floor as if runs were
   * unpaired is the conservative (i.e. larger, safer) choice.
   *
   * Exactly 0 when iterations is 1 — with a single seed there is no
   * estimate of noise AT ALL, not "everything is significant." The web
   * layer must not treat a 0 floor here as license to trust every nonzero
   * delta; it should surface that caveat explicitly whenever iterations
   * is 1.
   */
  noiseFloorTeamDps: number;
  /** Every fielded slot x every half-level above its current level through maxLevel, ascending slotIndex then toLevel. */
  candidates: PowerUpCandidate[];
  /** One per input slot (same index), null for an empty slot. */
  ladders: (PowerUpDamageLadder | null)[];
  /** Max deltaTeamDps among affordable candidates with deltaTeamDps > noiseFloorTeamDps (stricter than, and not the same test as, deltaExceedsNoise — see that field). Null if none qualify. */
  bestAffordableByDelta: PowerUpCandidate | null;
  /** Max deltaTeamDpsPer1000Stardust among affordable candidates with deltaTeamDps > noiseFloorTeamDps (and a non-null per-1000-stardust value). Null if none qualify. */
  bestAffordableByStardustEfficiency: PowerUpCandidate | null;
}

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

/** Population standard deviation (divides by n, not n-1) — this is a description of the exact sample set produced, not an estimate of a larger population. */
const stdDev = (values: number[]): number => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
};

/**
 * A conservative noise floor for `deltaTeamDps`, derived from ONE
 * `PowerUpEncounterSummary`'s own measured `teamDpsStdDev`:
 * `2 * summary.teamDpsStdDev * Math.sqrt(2 / iterations)` — roughly a 95%
 * band on the difference between two independent means of `iterations` seeds
 * each. Deliberately ignores the variance reduction the paired
 * common-random-numbers seeding would normally buy (see
 * PowerUpOptimizerResult.noiseFloorTeamDps for the full reasoning); treating
 * runs as unpaired is the conservative (larger, safer) choice. The single
 * shared derivation behind BOTH optimizePowerUps' noiseFloorTeamDps (computed
 * once, from the unchanging baseline — correct there, since every candidate
 * is priced against the same fixed roster) and planPowerUpBudget's
 * PER-ROUND floor (recomputed from whichever roster is current — see
 * planPowerUpBudget's top doc comment for why a single static floor goes
 * stale as a roster is powered up).
 *
 * EXPORTED (2026-09-09) for rosterPlanner.ts's multi-boss noise floor — same
 * derivation, applied to a POOLED sample across every boss's baseline seeds
 * (see that module's top doc comment) rather than one boss's. Per this
 * project's "reuse verbatim, don't invent a second one" rule.
 */
export function noiseFloorFor(summary: PowerUpEncounterSummary, iterations: number): number {
  return 2 * summary.teamDpsStdDev * Math.sqrt(2 / iterations);
}

/**
 * EXPORTED (2026-09-09) for rosterPlanner.ts, which calls this directly to
 * summarize both the baseline and every simulated candidate team's
 * TeamRaidResult[] per boss — same summarization every other caller in this
 * file already uses, not a second implementation.
 */
export function summarizeResults(results: TeamRaidResult[], bossHp: number, raidTimerSeconds: number): PowerUpEncounterSummary {
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
    teamDpsPerSeed: dpsValues,
    teamDpsStdDev: stdDev(dpsValues),
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
  const {
    slots,
    costTable,
    stardustOnHand,
    rareCandyOnHand = 0,
    rareCandyXlOnHand = 0,
    maxLevel = costTable.maxLevel,
    iterations = 3,
    seed = 1,
    ...rest
  } = inputs;

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
  // See PowerUpOptimizerResult.noiseFloorTeamDps for the derivation and why
  // it deliberately ignores the (weak) variance reduction from seed pairing.
  // Computed ONCE from the unchanging baseline — correct here, since every
  // candidate in this function is priced against that same fixed roster
  // (unlike planPowerUpBudget, which recomputes this per round — see its top
  // doc comment).
  const noiseFloorTeamDps = noiseFloorFor(baseline, iterations);

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
      // Each candidate is priced as if it were the ONLY thing bought — see
      // PowerUpCandidate.affordable. The shared Rare Candy pools count toward
      // a candidate's own affordability (a slot holding 10 Candy CAN reach a
      // 12-Candy step given 2+ Rare Candy), spending the slot's own candy
      // first, exactly as planPowerUpBudget does.
      const sharedCandyNeeded = Math.max(0, cost.candy - slot.candyOnHand) / RARE_CANDY_TO_CANDY_RATIO;
      const sharedXlCandyNeeded = Math.max(0, cost.xlCandy - slot.xlCandyOnHand) / RARE_CANDY_XL_TO_XL_CANDY_RATIO;
      const affordable =
        cost.stardust <= stardustOnHand && sharedCandyNeeded <= rareCandyOnHand && sharedXlCandyNeeded <= rareCandyXlOnHand;

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
        sharedCandyNeeded,
        sharedXlCandyNeeded,
        summary,
        deltaTeamDps,
        deltaTeamDpsPer1000Stardust: cost.stardust > 0 ? (deltaTeamDps / cost.stardust) * 1000 : null,
        deltaTeamDpsPerCandy: cost.candy > 0 ? deltaTeamDps / cost.candy : null,
        deltaTeamDpsPerXlCandy: cost.xlCandy > 0 ? deltaTeamDps / cost.xlCandy : null,
        crossesFastBreakpoint: ladder != null && ladderStep != null && ladderStep.fastMoveDamage !== ladder.current.fastMoveDamage,
        crossesChargedBreakpoint: ladder != null && ladderStep != null && ladderStep.chargedMoveDamage !== ladder.current.chargedMoveDamage,
        deltaExceedsNoise: Math.abs(deltaTeamDps) > noiseFloorTeamDps,
      });
    }
  });

  // Both "best" picks now require deltaTeamDps > noiseFloorTeamDps, not
  // merely delta > 0 — see PowerUpOptimizerResult.noiseFloorTeamDps for why
  // a bare positive delta isn't trustworthy on its own for this comparison.
  // NOTE: this is stricter than (and NOT the same as) c.deltaExceedsNoise,
  // which uses Math.abs and so also flags a significant NEGATIVE delta —
  // useful for "don't power this up, it measurably hurts," but not what a
  // "best improvement" pick should ever select.
  const affordableSignificant = candidates.filter((c) => c.affordable && c.deltaTeamDps > noiseFloorTeamDps);
  const bestAffordableByDelta =
    affordableSignificant.length > 0 ? affordableSignificant.reduce((best, c) => (c.deltaTeamDps > best.deltaTeamDps ? c : best)) : null;

  const stardustEfficiencyCandidates = affordableSignificant.filter((c) => c.deltaTeamDpsPer1000Stardust !== null);
  const bestAffordableByStardustEfficiency =
    stardustEfficiencyCandidates.length > 0
      ? stardustEfficiencyCandidates.reduce((best, c) => (c.deltaTeamDpsPer1000Stardust! > best.deltaTeamDpsPer1000Stardust! ? c : best))
      : null;

  return { baseline, bossHp, iterations, noiseFloorTeamDps, candidates, ladders, bestAffordableByDelta, bestAffordableByStardustEfficiency };
}

// --- Fixed-budget planner (Part F) -----------------------------------------

/**
 * `optimizePowerUps` answers "what is the single best next power-up?" —
 * `planPowerUpBudget` answers the DIFFERENT question "I have this much
 * stardust/candy, what SET of upgrades should I make?" This is a joint
 * multi-slot allocation over a fixed budget, not a ranking of independent
 * single steps — a genuinely different algorithm, added ALONGSIDE
 * optimizePowerUps rather than replacing it. optimizePowerUps is completely
 * unchanged by this addition; the web tab's existing ranked single-candidate
 * table keeps using it as before.
 *
 * ALGORITHM: greedy with full re-simulation each round (reusing runTeamRaid
 * unchanged — no new combat math). Exact search over a 6-slot roster is
 * 50^6; greedy is the honest tractable choice, same tradeoff this project
 * already made for optimizePowerUps' per-candidate re-simulation.
 *
 * Each round:
 *   1. For every fielded slot, find its next few USEFUL levels above its
 *      currently-planned level (see usefulPowerUpLevelsAbove — the
 *      dominated-level reduction that keeps this fast) that are still
 *      affordable against what's actually LEFT of the budget.
 *   2. Simulate every such candidate as a full team raid over the SAME
 *      paired seed set used for the baseline (common random numbers).
 *   3. Score each by (marginal team-DPS gain) / (cost as a fraction of what
 *      remains of each constrained resource, summed across resources) — a
 *      standard multi-dimensional-knapsack greedy heuristic. THIS
 *      SCALARIZATION IS A SEARCH HEURISTIC ONLY, never surfaced in the
 *      output: CLAUDE.md's standing decision that stardust and candy are
 *      never blended into one composite score applies to what this function
 *      REPORTS, not to how it internally decides what to try next. Every
 *      number in PowerUpBudgetPlan keeps stardust/candy/XL separate.
 *   4. Only commit the winning candidate if its marginal deltaTeamDps
 *      exceeds the CURRENT noise floor (same reasoning as optimizePowerUps'
 *      deltaExceedsNoise: greedy on a noisy objective otherwise chases seed
 *      noise instead of a real effect) — see "NOISE FLOOR IS PER-ROUND, NOT
 *      FIXED" below for why "current" matters.
 *   5. Deduct resources (a slot's OWN candy/XL is always spent before either
 *      shared pool — see PowerUpBudgetStep.ownCandySpent/sharedCandySpent),
 *      update the roster's currently-planned levels, and repeat.
 *
 * NOISE FLOOR IS PER-ROUND, NOT FIXED (2026-09-08 fix — was a real bug): a
 * roster's seed-to-seed variance changes as it's powered up (a stronger,
 * tankier roster typically clears more consistently OR less consistently
 * depending on exactly which breakpoints it crosses — either direction is
 * possible, this isn't a one-way ratchet), so a floor computed ONCE from the
 * starting roster goes stale exactly as the search proceeds — the dangerous
 * direction being a floor that's gone STALE-LOW, which would let real seed
 * noise through as a committed recommendation. The floor is therefore
 * recomputed after every COMMITTED step from THAT step's own measured
 * `PowerUpEncounterSummary.teamDpsStdDev` (already computed as part of
 * scoring the step — no extra simulation), and that new floor governs the
 * NEXT round's commit decision. `PowerUpBudgetStep.noiseFloorTeamDps` records
 * the exact floor each step was actually judged against, so a reader can
 * audit any single step's acceptance without assuming one number governed
 * the whole plan. `PowerUpBudgetPlan.noiseFloorTeamDps` is the FINAL floor —
 * see that field's own doc comment. A rising floor can make the search stop
 * EARLIER than a stale fixed floor would have — that's correct behaviour
 * (a later round's real variance genuinely no longer supports the same small
 * deltas as being significant), not a regression.
 *
 * Stops when: no fielded slot has any useful level left at all
 * ("max-level-reached"), no remaining candidate is affordable against what's
 * left of the budget ("budget-exhausted"), no affordable candidate's
 * marginal gain exceeds the CURRENT noise floor ("no-significant-candidate"),
 * or maxRounds is hit as a pure engineering safety cap ("round-cap-reached" —
 * same role as teamRaid.ts's MAX_TEAM_RAID_CYCLES; a sane roster/budget
 * reaches one of the other three stop reasons long before approaching it).
 *
 * Each committed step's `deltaTeamDps` is the difference between two REAL
 * full-roster simulations (this step's candidate vs. the roster's state
 * immediately before it), and `final` is a dedicated extra full-roster
 * simulation of the FINISHED roster over the same seed set — never a sum of
 * per-step deltas, which would compound noise across rounds. (In practice,
 * because each round's "before" state IS the previous round's committed
 * candidate, `final` is mathematically guaranteed to reproduce the last
 * step's own `cumulativeTeamDps` exactly under this engine's deterministic
 * seeding — the dedicated re-run exists so that guarantee is enforced by
 * construction, not by an invariant a future edit could quietly break.)
 *
 * IMPORTANT: "no-significant-candidate"/"budget-exhausted" alone do NOT mean
 * the roster is optimal — they mean no AFFORDABLE candidate helped. A real,
 * bigger gain can sit just beyond what the budget currently covers (e.g. a
 * species' next real breakpoint needs more Candy than is on hand) — reporting
 * only the stop reason would read as "nothing more to do" when the truth is
 * "something more to do, but you can't afford it yet." After the round loop
 * above has already decided to stop, this function runs ONE dedicated extra
 * pass (never per round) over the FINAL roster/budget state: for each slot,
 * every useful level beyond where affordability broke is a "blocked"
 * candidate (cost is monotone non-decreasing in level, so once one level is
 * unaffordable every higher one is too); the best (highest deltaTeamDps) one
 * that still clears the FINAL noise floor (the same one the round loop was
 * judging against when it stopped — see "NOISE FLOOR IS PER-ROUND, NOT FIXED"
 * above, and PowerUpBudgetPlan.noiseFloorTeamDps) becomes `PowerUpBudgetPlan
 * .bestBlockedCandidate`, complete with which resource(s) it's short on and
 * by how much (`PowerUpBudgetBlockedCandidate.shortfalls`, kept per-resource,
 * never blended per CLAUDE.md's standing decision). This search is bounded
 * (`blockedCandidateLevelsPerSlot`/`maxBlockedCandidatesToCheck`), not
 * exhaustive — a real blocked gain sitting further out than the bound could
 * still be missed and reported as `null`, which reads as "didn't find one
 * within this bound," not a proof none exists. `bestBlockedCandidate: null`
 * is the genuine "you're done, stop saving" signal; non-null is "you're
 * blocked, not done."
 */
export interface PowerUpBudgetInputs extends PowerUpOptimizerInputs {
  /**
   * Pure engineering safety cap on greedy rounds (each round commits at most
   * one step) — same role as teamRaid.ts's MAX_TEAM_RAID_CYCLES. A sane
   * roster/budget reaches "max-level-reached"/"budget-exhausted"/
   * "no-significant-candidate" long before approaching this. Defaults to
   * 300 (comfortably above the worst case of 6 slots x up to ~98 half-levels
   * each, even though the dominated-level reduction makes that worst case
   * very unlikely in practice).
   */
  maxRounds?: number;
  /**
   * How many of a slot's next USEFUL levels above its currently-planned
   * level are offered as jump candidates each round (each one a candidate
   * for "jump straight from the current level to this one," priced and
   * measured as that whole multi-level jump — never a chain of forced
   * single-step candidates). Defaults to `Number.POSITIVE_INFINITY`, i.e.
   * every affordable useful level in range is offered, not just the nearest
   * couple.
   *
   * REGRESSION HISTORY: this used to default to 2, which was a real bug, not
   * a perf knob — see this module's test file,
   * "commits a multi-level jump whose own individual half-steps each sit
   * below the noise floor." The noise-floor commit rule (below) only ever
   * evaluates a candidate's OWN marginal delta, so when every individual
   * useful half-level step is too small to clear the floor on its own, the
   * only way a real multi-level gain is ever found is by offering the
   * multi-level jump itself as a single candidate. Capping this at 2 meant
   * only the nearest one or two useful levels per slot ever competed, so any
   * gain that only became measurable several useful-levels out (a very
   * common shape — most of a species' real gain over a wide level range
   * comes from crossing several small breakpoints at once) was structurally
   * unreachable no matter how much budget was left. `usefulPowerUpLevelsAbove`
   * already keeps the offered set tractable (it excludes levels with no
   * detectable stat/damage/survival change vs. the level below), so
   * "unbounded" here is bounded in practice by real breakpoint density, not
   * by the raw ~98 half-level count. Lower this only as a deliberate perf
   * tradeoff, and re-verify against a roster/boss where a real gain only
   * shows up as a multi-level jump before trusting the result.
   */
  candidateLevelsPerSlotPerRound?: number;
  /**
   * Hard cap on how many candidates are actually simulated in a single
   * round, across every slot combined — keeps a round's cost bounded
   * regardless of roster size or candidateLevelsPerSlotPerRound. Candidates
   * are interleaved round-robin across slots BY DEPTH (every slot's nearest
   * useful level first, then every slot's 2nd-nearest, etc. — not
   * first-slot-exhausts-the-cap-first), so no single slot can starve the
   * others of a look-in, and a far-out jump on one slot still gets a turn
   * once the nearer levels on every slot have each had theirs. The
   * interleaving depth itself is separately bounded by the longest actual
   * per-slot candidate list (never infinite even when
   * candidateLevelsPerSlotPerRound is left at its unbounded default).
   * Defaults to 60 (== MAX_TEAM_RAID_SLOTS x 10 — comfortably past the
   * handful of useful levels a real multi-level jump needs to reach, per the
   * regression above, while still bounding a round's worst-case cost well
   * below optimizePowerUps' own ~200-candidate full sweep).
   */
  maxCandidatesPerRound?: number;
  /**
   * Bounds the post-search "best blocked candidate" pass (see
   * PowerUpBudgetPlan.bestBlockedCandidate) — how many of a single slot's
   * useful-but-CURRENTLY-UNAFFORDABLE levels (closest-to-affordable first;
   * cost is monotone non-decreasing in level, so these are exactly the
   * levels starting right after the last one the main search found
   * affordable) are simulated to check for a real blocked gain. Defaults to
   * 8. This search is DELIBERATELY NOT EXHAUSTIVE: a real blocked gain
   * sitting beyond this many useful levels out on a single slot could still
   * be missed and reported as `bestBlockedCandidate: null` — an honest
   * "didn't find one within this bound," not a guarantee none exists. Raise
   * this if a specific roster/boss needs a wider look; the tradeoff is
   * exactly one extra round's worth of simulation, capped in total by
   * maxBlockedCandidatesToCheck below.
   */
  blockedCandidateLevelsPerSlot?: number;
  /**
   * Hard cap on how many candidates the "best blocked candidate" pass
   * actually simulates in total, across every slot combined (round-robin
   * interleaved the same way maxCandidatesPerRound bounds the main search —
   * see interleaveCandidatesRoundRobin) — keeps this one-time pass's cost
   * bounded regardless of roster size. Defaults to 60 (matching
   * maxCandidatesPerRound's default and reasoning).
   */
  maxBlockedCandidatesToCheck?: number;
}

export type PowerUpBudgetStopReason =
  /** No fielded slot has ANY useful level left below maxLevel — regardless of budget. */
  | "max-level-reached"
  /** At least one useful level remains somewhere, but none is affordable against what's left of every resource. */
  | "budget-exhausted"
  /**
   * At least one candidate was affordable, but none of their marginal
   * deltaTeamDps values exceeded the noise floor CURRENT at that round (see
   * PowerUpBudgetStep.noiseFloorTeamDps / PowerUpBudgetPlan.noiseFloorTeamDps
   * — the floor is recomputed every round, not fixed for the whole plan).
   * This reason ALONE does not mean "you're done" — it means no AFFORDABLE
   * candidate helped. Check
   * PowerUpBudgetPlan.bestBlockedCandidate: a non-null value there means a
   * real, significant gain exists but couldn't be simulated as a committable
   * step because it wasn't affordable — "blocked," not "optimal." Only a
   * null bestBlockedCandidate alongside this reason means the roster is
   * genuinely done improving against this boss.
   */
  | "no-significant-candidate"
  /** maxRounds was reached before any of the above — see PowerUpBudgetInputs.maxRounds. */
  | "round-cap-reached";

export interface PowerUpBudgetStep {
  slotIndex: number;
  speciesId: string;
  speciesName: string;
  fromLevel: number;
  toLevel: number;
  /** This step's total resource cost (fromLevel -> toLevel), same shape as powerUpCost's return. */
  cost: PowerUpResourceCost;
  /** How much of cost.candy was drawn from this slot's OWN candyOnHand (spent first) — ownCandySpent + sharedCandySpent === cost.candy. */
  ownCandySpent: number;
  /** How much of cost.candy was drawn from the shared rareCandyOnHand pool, only after this slot's own candy ran out. */
  sharedCandySpent: number;
  /** Same own-first breakdown as ownCandySpent, for cost.xlCandy against this slot's own xlCandyOnHand. */
  ownXlCandySpent: number;
  /** Same own-first breakdown as sharedCandySpent, for cost.xlCandy against the shared rareCandyXlOnHand pool. */
  sharedXlCandySpent: number;
  /**
   * This step's marginal team-DPS gain: (full-roster teamDps with this step
   * applied) - (full-roster teamDps immediately before it), both real
   * simulations over the same shared seed set — never a difference-of-
   * differences or an estimate.
   */
  deltaTeamDps: number;
  /**
   * The noise floor THIS step's deltaTeamDps was actually judged against —
   * i.e. the value of PowerUpBudgetPlan.noiseFloorTeamDps at the moment this
   * round ran, BEFORE it was recomputed from this step's own outcome for the
   * next round. Recorded per-step because the floor is NOT fixed for the
   * whole plan (see planPowerUpBudget's top doc comment, "NOISE FLOOR IS
   * PER-ROUND, NOT FIXED") — a later step can be judged against a
   * meaningfully larger (or smaller) floor than an earlier one, so
   * `deltaTeamDps > noiseFloorTeamDps` holds for every step against ITS OWN
   * recorded floor, but NOT necessarily against `PowerUpBudgetPlan
   * .noiseFloorTeamDps` (the FINAL floor) for steps other than the last one.
   * This field is what makes a specific step's acceptance auditable without
   * that false assumption.
   */
  noiseFloorTeamDps: number;
  /** The full roster's mean team DPS immediately after this step — a real simulation of the roster-so-far, not baseline + a running sum of deltas. */
  cumulativeTeamDps: number;
}

export interface PowerUpBudgetFinalLevel {
  slotIndex: number;
  /** Null for an empty (unfielded) slot. */
  speciesId: string | null;
  speciesName: string | null;
  /** This slot's starting level (== toLevel if the plan never touched this slot). Null for an empty slot. */
  fromLevel: number | null;
  /** This slot's level at the end of the plan. Null for an empty slot. */
  toLevel: number | null;
}

export interface PowerUpBudgetResourceLedgerEntry {
  spent: number;
  remaining: number;
}

export interface PowerUpBudgetLedger {
  stardust: PowerUpBudgetResourceLedgerEntry;
  /** This slot's OWN regular Candy actually spent (never shared) and what's left of it — index matches inputs.slots; 0/candyOnHand for an empty or untouched slot. */
  ownCandy: PowerUpBudgetResourceLedgerEntry[];
  /** Same as ownCandy, for XL Candy. */
  ownXlCandy: PowerUpBudgetResourceLedgerEntry[];
  /** The shared rareCandyOnHand pool. */
  sharedRareCandy: PowerUpBudgetResourceLedgerEntry;
  /** The shared rareCandyXlOnHand pool. */
  sharedRareCandyXl: PowerUpBudgetResourceLedgerEntry;
}

/**
 * One resource this blocked candidate is short on, and by how much — never
 * collapsed into a single blended "you need Nx more budget" number (per
 * CLAUDE.md's standing decision against blending stardust/candy). A single
 * candidate can appear here more than once across different resources (e.g.
 * short on both candy AND stardust at once) — report every shortfall found,
 * not just the first.
 */
export interface PowerUpBudgetResourceShortfall {
  resource: "stardust" | "candy" | "xlCandy";
  /**
   * How much MORE of this resource is needed beyond what's actually
   * available right now for this candidate — for candy/xlCandy, "available"
   * already accounts for this slot's own candyOnHand/xlCandyOnHand PLUS
   * whatever is left of the shared rareCandyOnHand/rareCandyXlOnHand pools
   * at the point the search stopped, the same accounting `affordable` uses
   * elsewhere in this module. Always > 0 (a resource only appears here
   * because it fell short).
   */
  shortfall: number;
}

/**
 * The best (highest deltaTeamDps) USEFUL level, for any fielded slot, that
 * cleared the FINAL noise floor (PowerUpBudgetPlan.noiseFloorTeamDps) but
 * could not be committed because it wasn't affordable against what was left
 * of the budget when the search stopped —
 * see PowerUpBudgetPlan.bestBlockedCandidate's doc comment for the
 * "blocked, not done" distinction this exists to surface, and this module's
 * top doc comment (search for "best blocked candidate") for the bounded,
 * NOT-exhaustive search that finds it.
 */
export interface PowerUpBudgetBlockedCandidate {
  slotIndex: number;
  speciesId: string;
  speciesName: string;
  /** This slot's level at the point the search stopped (== its starting level if the plan never touched this slot). */
  fromLevel: number;
  toLevel: number;
  /** This candidate's total resource cost (fromLevel -> toLevel), same shape as powerUpCost's return. */
  cost: PowerUpResourceCost;
  /**
   * This candidate's own marginal team-DPS gain versus the roster's state at
   * the point the search stopped — measured exactly like
   * PowerUpBudgetStep.deltaTeamDps (a real simulation, over the same shared
   * seed set), guaranteed > noiseFloorTeamDps (that's what qualifies it for
   * this field at all).
   */
  deltaTeamDps: number;
  /** Every resource this candidate is short on right now — see PowerUpBudgetResourceShortfall. Never empty (a candidate only reaches this field because affordability failed on at least one resource). */
  shortfalls: PowerUpBudgetResourceShortfall[];
}

export interface PowerUpBudgetPlan {
  /** The plan, in the order the greedy search chose each step. */
  steps: PowerUpBudgetStep[];
  /** One entry per input slot (same index), unchanged slots included. */
  finalLevels: PowerUpBudgetFinalLevel[];
  /** The do-nothing roster's measured encounter summary, over the same seed set as every step. */
  baseline: PowerUpEncounterSummary;
  /**
   * The FINISHED roster's measured encounter summary — a dedicated real
   * simulation, not baseline plus a running sum of steps[].deltaTeamDps. See
   * this export's top doc comment for why those two are guaranteed to agree
   * exactly under this engine's deterministic seeding, and why the dedicated
   * re-run exists anyway.
   */
  final: PowerUpEncounterSummary;
  bossHp: number;
  /** The iteration count actually used (same value the caller passed as `iterations`, or the default). */
  iterations: number;
  /**
   * The FINAL noise floor — the value in effect when the round loop actually
   * stopped (same derivation as PowerUpOptimizerResult.noiseFloorTeamDps,
   * but re-derived from whichever roster was current at that point, not
   * fixed from the starting baseline). This is the SAME floor value used by
   * the "best blocked candidate" pass below, and is what a
   * "no-significant-candidate" stop reason is measured against.
   *
   * IMPORTANT — this is NOT one fixed floor that governed the whole plan:
   * the floor is recomputed after every committed step from that step's own
   * measured roster variance (see planPowerUpBudget's top doc comment,
   * "NOISE FLOOR IS PER-ROUND, NOT FIXED"), because a roster's seed-to-seed
   * variance changes as it's powered up. An EARLIER step in `steps` may have
   * cleared a smaller (or larger) floor than this final value — check that
   * step's own `PowerUpBudgetStep.noiseFloorTeamDps` to audit its specific
   * acceptance, don't assume this top-level number applied to it.
   */
  noiseFloorTeamDps: number;
  /** Total spend and what's left, broken out per resource — never blended into one number. */
  ledger: PowerUpBudgetLedger;
  /** Why the search stopped — see PowerUpBudgetStopReason. */
  stopReason: PowerUpBudgetStopReason;
  /**
   * "You're done" vs. "you're blocked," disambiguated: null means the search
   * genuinely found no further significant gain anywhere (the real "stop
   * saving, you're optimal" signal) — NOT "we didn't look," since this is
   * always computed once, after the round loop above has already decided to
   * stop, regardless of stopReason. A non-null value names the best
   * (highest-deltaTeamDps) USEFUL level that cleared noiseFloorTeamDps but
   * was NOT affordable — the "next real gain, but you can't afford it yet"
   * case a stopReason of "no-significant-candidate" or "budget-exhausted"
   * alone can't distinguish from genuine convergence. See this module's
   * `planPowerUpBudget` top doc comment for the bounded (not exhaustive)
   * search that produces this, and PowerUpBudgetInputs.blockedCandidateLevelsPerSlot/
   * .maxBlockedCandidatesToCheck for the bound itself.
   */
  bestBlockedCandidate: PowerUpBudgetBlockedCandidate | null;
}

/**
 * How much of a slot's own regular-Candy cost one unit of the shared Rare
 * Candy pool covers — CONFIRMED 1:1, deterministic, no species exclusion,
 * no batch-size limit and no trainer-level gate (pogo-researcher,
 * 2026-09-08: Pokémon GO Hub's "Rare Candy" guide, cross-checked with no
 * contrary source; see MECHANICS.md's "Fungible candy currencies" entry and
 * `.claude/agent-memory/pogo-researcher/fact_rare_candy_xl_candy_conversions.md`).
 * Every use of the shared pools below multiplies/divides through this
 * constant rather than assuming equality inline, so if this ever needs
 * correcting it's a change to this ONE constant, not a rewrite of
 * planPowerUpBudget. Plain Rare Candy can NEVER become XL Candy by any
 * route this module models — see rareCandyXlOnHand's doc comment on
 * PowerUpOptimizerInputs for the one real (but deliberately unmodelled)
 * exception, the in-game 100:1 regular-Candy-to-XL-Candy "Convert" button.
 */
export const RARE_CANDY_TO_CANDY_RATIO = 1;
/** See RARE_CANDY_TO_CANDY_RATIO — the same confirmed 1:1 ratio for the shared Rare Candy XL pool covering XL Candy cost (a wholly separate item from plain Rare Candy, never interchangeable with it). */
export const RARE_CANDY_XL_TO_XL_CANDY_RATIO = 1;

type OutgoingDamageModifiers = Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;

export interface PowerUpLevelMetrics {
  level: number;
  /** Floored outgoing fast-move damage against the boss at this level. */
  outgoingFastDamage: number;
  /** Floored outgoing charged-move damage against the boss at this level. */
  outgoingChargedDamage: number;
  /**
   * Floored incoming boss fast-move damage against this level's defense
   * stat. Compared for equality in its OWN right (not just via
   * survivalFastHits below) — see levelMetricsEqual's doc comment for why:
   * this engine credits energy from damage taken
   * (ENERGY_PER_DAMAGE_TAKEN, energy.ts), so two levels with the SAME
   * survival hit count can still differ in real simulated outcome if the
   * raw per-hit damage magnitude differs.
   */
  incomingFastDamage: number;
  /** Same as incomingFastDamage, for the boss's charged move. Null when the boss has no charged move at all. */
  incomingChargedDamage: number | null;
  /** ceil(effective HP at this level / incomingFastDamage) — how many boss fast attacks this level survives. */
  survivalFastHits: number;
  /** Same as survivalFastHits, for the boss's charged move. Null when the boss has no charged move at all (nothing to survive). */
  survivalChargedHits: number | null;
}

export interface PowerUpLevelMetricsParams {
  species: SpeciesDefinition;
  ivs: IVSpread;
  level: number;
  fastMove: FastMove;
  chargedMove: ChargedMove;
  outgoingFastMoveDamageModifiers: OutgoingDamageModifiers;
  outgoingChargedMoveDamageModifiers: OutgoingDamageModifiers;
  bossFastMove: FastMove;
  bossChargedMove: ChargedMove | undefined;
  bossAttackStat: number;
  bossDefenseStat: number;
  incomingFastMoveDamageModifiers: OutgoingDamageModifiers;
  /** Required whenever bossChargedMove is present; ignored otherwise. */
  incomingChargedMoveDamageModifiers?: OutgoingDamageModifiers;
}

/**
 * The values planPowerUpBudget's dominated-level candidate reduction
 * compares level-to-level: outgoing fast/charged damage (already floored by
 * calculateDamage, exactly as powerUpDamageLadder computes it), incoming
 * fast/charged damage, AND the survival counts derived from them — because
 * this project counts survivability as team DPS rather than raw damage, a
 * level that crosses no outgoing breakpoint can still buy real DPS by
 * surviving longer (see levelMetricsEqual's doc comment for why the raw
 * incoming-damage values are compared too, not just the derived survival
 * counts). No new damage math: reuses effectiveStatsAtLevel/calculateDamage
 * exactly as powerUpDamageLadder does.
 */
export function powerUpLevelMetrics(params: PowerUpLevelMetricsParams): PowerUpLevelMetrics {
  const {
    species,
    ivs,
    level,
    fastMove,
    chargedMove,
    outgoingFastMoveDamageModifiers,
    outgoingChargedMoveDamageModifiers,
    bossFastMove,
    bossChargedMove,
    bossAttackStat,
    bossDefenseStat,
    incomingFastMoveDamageModifiers,
    incomingChargedMoveDamageModifiers,
  } = params;

  const stats = effectiveStatsAtLevel(species, ivs, level);
  const outgoingFastDamage = calculateDamage({
    power: fastMove.power,
    attackerAttackStat: stats.attack,
    defenderDefenseStat: bossDefenseStat,
    ...outgoingFastMoveDamageModifiers,
  });
  const outgoingChargedDamage = calculateDamage({
    power: chargedMove.power,
    attackerAttackStat: stats.attack,
    defenderDefenseStat: bossDefenseStat,
    ...outgoingChargedMoveDamageModifiers,
  });
  const incomingFastDamage = calculateDamage({
    power: bossFastMove.power,
    attackerAttackStat: bossAttackStat,
    defenderDefenseStat: stats.defense,
    ...incomingFastMoveDamageModifiers,
  });
  const survivalFastHits = Math.ceil(stats.stamina / incomingFastDamage);

  let incomingChargedDamage: number | null = null;
  let survivalChargedHits: number | null = null;
  if (bossChargedMove && incomingChargedMoveDamageModifiers) {
    incomingChargedDamage = calculateDamage({
      power: bossChargedMove.power,
      attackerAttackStat: bossAttackStat,
      defenderDefenseStat: stats.defense,
      ...incomingChargedMoveDamageModifiers,
    });
    survivalChargedHits = Math.ceil(stats.stamina / incomingChargedDamage);
  }

  return {
    level,
    outgoingFastDamage,
    outgoingChargedDamage,
    incomingFastDamage,
    incomingChargedDamage,
    survivalFastHits,
    survivalChargedHits,
  };
}

/**
 * EMPIRICALLY WIDENED once (see this module's test file, "dominated-level
 * candidate reduction"): comparing only outgoing damage + the two survival
 * HIT COUNTS (this project's originally-specified minimum four fields) let a
 * real, if small, effect slip through undetected on a fragile single-
 * attacker fixture. Root cause: energy.ts credits energy from raw damage
 * TAKEN (ENERGY_PER_DAMAGE_TAKEN), not from hit COUNT — two levels with the
 * identical ceil(hp/incomingDamage) survival count can still receive
 * different per-hit energy credit if the underlying incomingFastDamage/
 * incomingChargedDamage magnitude differs, which can shift exactly when a
 * charged move becomes ready. Comparing the raw incoming-damage values too
 * (already computed above; free to add) closes this gap. This does not
 * contradict the original four-field spec — it's a strict superset of it
 * (harder to satisfy, i.e. classifies MORE levels as useful, never fewer),
 * so it can only ever fix a false "dominated" classification, never
 * introduce one.
 */
function levelMetricsEqual(a: PowerUpLevelMetrics, b: PowerUpLevelMetrics): boolean {
  return (
    a.outgoingFastDamage === b.outgoingFastDamage &&
    a.outgoingChargedDamage === b.outgoingChargedDamage &&
    a.incomingFastDamage === b.incomingFastDamage &&
    a.incomingChargedDamage === b.incomingChargedDamage &&
    a.survivalFastHits === b.survivalFastHits &&
    a.survivalChargedHits === b.survivalChargedHits
  );
}

export interface UsefulPowerUpLevelsParams extends Omit<PowerUpLevelMetricsParams, "level"> {
  table: PowerUpCostTable;
  fromLevel: number;
  /** Defaults to table.maxLevel. */
  maxLevel?: number;
}

/**
 * Every half-level strictly above fromLevel (through maxLevel) where at
 * least one of powerUpLevelMetrics' values actually changes versus the level
 * immediately below it — the dominated-level reduction planPowerUpBudget's
 * greedy search relies on to stay fast. A level is skipped ("dominated")
 * only when NOTHING in levelMetricsEqual's comparison changes: same outgoing
 * damage, same incoming damage, same survival counts, strictly more cost
 * (cost is monotone non-decreasing in level — see powerUpCost). See this
 * module's test file for the empirical check that a skipped level's real
 * simulated team DPS actually sits within the noise floor of the level
 * below — a verified property on a real roster, not an assumption (and see
 * levelMetricsEqual's doc comment for the one real gap that check found and
 * closed during development).
 */
export function usefulPowerUpLevelsAbove(params: UsefulPowerUpLevelsParams): number[] {
  const { table, fromLevel, maxLevel = table.maxLevel, ...metricsParams } = params;
  let previous = powerUpLevelMetrics({ ...metricsParams, level: fromLevel });
  const useful: number[] = [];
  for (const level of powerUpLevelsAbove(table, fromLevel).filter((l) => l <= maxLevel)) {
    const current = powerUpLevelMetrics({ ...metricsParams, level });
    if (!levelMetricsEqual(current, previous)) useful.push(level);
    previous = current;
  }
  return useful;
}

/** Maps PowerUpSlotInput[] to TeamRaidSlotInput[] at an explicit per-slot level array (index-matched) — every other field passes through unchanged. */
function toTeamRaidSlotsAtLevels(slots: PowerUpSlotInput[], levels: number[]): TeamRaidSlotInput[] {
  return slots.map((slot, i) => ({
    species: slot.species,
    fastMoveId: slot.fastMoveId,
    chargedMoveId: slot.chargedMoveId,
    isMega: slot.isMega,
    level: levels[i] ?? slot.level,
    ivs: slot.ivs,
  }));
}

interface RawPowerUpBudgetCandidate {
  slotIndex: number;
  toLevel: number;
  cost: PowerUpResourceCost;
}

/**
 * Round-robin interleaves per-slot candidate lists by depth (every slot's
 * nearest candidate first, then every slot's 2nd-nearest, etc.) so no single
 * slot can starve the others of a look-in, up to `depthLimit` levels deep and
 * `maxTotal` candidates combined. Shared by planPowerUpBudget's main round
 * loop (interleaving each slot's AFFORDABLE candidates) and its post-search
 * "best blocked candidate" pass (interleaving each slot's UNAFFORDABLE
 * ones) — same shape, different input lists.
 */
function interleaveCandidatesRoundRobin<T>(perSlotLists: T[][], depthLimit: number, maxTotal: number): T[] {
  const result: T[] = [];
  outer: for (let depth = 0; depth < depthLimit; depth++) {
    for (const list of perSlotLists) {
      if (result.length >= maxTotal) break outer;
      if (list[depth] !== undefined) result.push(list[depth]!);
    }
  }
  return result;
}

/**
 * Every resource `cost` falls short on, given what's actually available
 * right now: `ownAmount` (this slot's own candyOnHand/xlCandyOnHand — always
 * drawn down first) plus whatever's left of the relevant shared pool,
 * converted through the confirmed 1:1 ratio constants — the SAME
 * affordability accounting `affordable`/`sharedCandyNeeded` use elsewhere in
 * this module, just surfaced per-resource instead of collapsed to a
 * boolean. Never blends resources into one number (per CLAUDE.md's standing
 * decision) — a candidate short on two resources at once gets two entries.
 */
function shortfallsForCandidate(
  cost: PowerUpResourceCost,
  remainingStardust: number,
  ownCandy: number,
  ownXlCandy: number,
  sharedCandy: number,
  sharedXlCandy: number,
): PowerUpBudgetResourceShortfall[] {
  const shortfalls: PowerUpBudgetResourceShortfall[] = [];
  if (cost.stardust > remainingStardust) {
    shortfalls.push({ resource: "stardust", shortfall: cost.stardust - remainingStardust });
  }
  const availableCandy = ownCandy + sharedCandy * RARE_CANDY_TO_CANDY_RATIO;
  if (cost.candy > availableCandy) {
    shortfalls.push({ resource: "candy", shortfall: cost.candy - availableCandy });
  }
  const availableXlCandy = ownXlCandy + sharedXlCandy * RARE_CANDY_XL_TO_XL_CANDY_RATIO;
  if (cost.xlCandy > availableXlCandy) {
    shortfalls.push({ resource: "xlCandy", shortfall: cost.xlCandy - availableXlCandy });
  }
  return shortfalls;
}

/**
 * A fixed-budget, multi-slot power-up planner — see this export's top doc
 * comment for the algorithm, stop conditions, and why its internal
 * cost/gain scalarization never leaks into the reported output. A NEW
 * export alongside optimizePowerUps (completely unchanged by this addition).
 */
export function planPowerUpBudget(inputs: PowerUpBudgetInputs): PowerUpBudgetPlan {
  const {
    slots,
    costTable,
    stardustOnHand,
    rareCandyOnHand = 0,
    rareCandyXlOnHand = 0,
    maxLevel = costTable.maxLevel,
    iterations = 3,
    seed = 1,
    maxRounds = 300,
    candidateLevelsPerSlotPerRound = Number.POSITIVE_INFINITY,
    maxCandidatesPerRound = 60,
    blockedCandidateLevelsPerSlot = 8,
    maxBlockedCandidatesToCheck = 60,
    ...rest
  } = inputs;

  const seeds = Array.from({ length: iterations }, (_, i) => seed + i * 7919);

  const firstFielded = slots.find((s) => s.species != null);
  const rosterLevel = firstFielded?.level ?? 1;
  const rosterIvs: IVSpread = firstFielded?.ivs ?? { attack: 0, defense: 0, stamina: 0 };

  const bossHp = bossEffectiveHp(rest.boss, rest.bossRaidTier);
  const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(rest.boss, rest.bossRaidTier);
  const weather = rest.weather ?? "none";
  const bossFastMove = resolveMove(rest.boss.fastMoves, rest.bossFastMoveId);
  if (!bossFastMove) throw new Error(`Boss species ${rest.boss.id} has no fast move defined.`);
  const bossChargedMove = resolveMove(rest.boss.chargedMoves, rest.bossChargedMoveId);

  // Per-slot combat context (resolved moves + damage modifiers) — built once
  // since only LEVEL changes round to round, never movesets.
  const contexts = slots.map((slot) => {
    if (!slot.species) return null;
    const fastMove = resolveMove(slot.species.fastMoves, slot.fastMoveId);
    const chargedMove = resolveMove(slot.species.chargedMoves, slot.chargedMoveId);
    if (!fastMove || !chargedMove) {
      throw new Error(`Power-up budget slot (${slot.species.id}) needs at least one fast move and one charged move.`);
    }
    return {
      fastMove,
      chargedMove,
      outgoingFastMoveDamageModifiers: {
        stab: slot.species.types.includes(fastMove.type),
        typeEffectiveness: typeEffectiveness(fastMove.type, rest.boss.types),
        megaBoostMultiplier: ownBoostMultiplier(slot.species.boost, fastMove.type),
        weatherBoosted: isWeatherBoosted(fastMove.type, weather),
      } satisfies OutgoingDamageModifiers,
      outgoingChargedMoveDamageModifiers: {
        stab: slot.species.types.includes(chargedMove.type),
        typeEffectiveness: typeEffectiveness(chargedMove.type, rest.boss.types),
        megaBoostMultiplier: ownBoostMultiplier(slot.species.boost, chargedMove.type),
        weatherBoosted: isWeatherBoosted(chargedMove.type, weather),
      } satisfies OutgoingDamageModifiers,
      incomingFastMoveDamageModifiers: {
        stab: rest.boss.types.includes(bossFastMove.type),
        typeEffectiveness: typeEffectiveness(bossFastMove.type, slot.species.types),
        weatherBoosted: isWeatherBoosted(bossFastMove.type, weather),
      } satisfies OutgoingDamageModifiers,
      incomingChargedMoveDamageModifiers: bossChargedMove
        ? ({
            stab: rest.boss.types.includes(bossChargedMove.type),
            typeEffectiveness: typeEffectiveness(bossChargedMove.type, slot.species.types),
            weatherBoosted: isWeatherBoosted(bossChargedMove.type, weather),
          } satisfies OutgoingDamageModifiers)
        : undefined,
    };
  });

  const runFullRoster = (levels: number[]): PowerUpEncounterSummary => {
    const teamSlots = toTeamRaidSlotsAtLevels(slots, levels);
    const results = seeds.map((s) => runTeamRaid({ ...rest, slots: teamSlots, level: rosterLevel, ivs: rosterIvs, seed: s }));
    return summarizeResults(results, bossHp, rest.raidTimerSeconds);
  };

  // Every USEFUL level above `fromLevel` for one slot, ignoring
  // affordability entirely — shared by the main round loop (recomputed each
  // round, since only `fromLevel` changes) and the post-search "best blocked
  // candidate" pass below (called once, on the final `fromLevel`s).
  const usefulLevelsForSlot = (slotIndex: number, fromLevel: number): number[] => {
    const slot = slots[slotIndex]!;
    const ctx = contexts[slotIndex];
    if (!slot.species || !ctx || fromLevel >= maxLevel) return [];
    return usefulPowerUpLevelsAbove({
      species: slot.species,
      ivs: slot.ivs,
      fastMove: ctx.fastMove,
      chargedMove: ctx.chargedMove,
      outgoingFastMoveDamageModifiers: ctx.outgoingFastMoveDamageModifiers,
      outgoingChargedMoveDamageModifiers: ctx.outgoingChargedMoveDamageModifiers,
      bossFastMove,
      bossChargedMove,
      bossAttackStat,
      bossDefenseStat,
      incomingFastMoveDamageModifiers: ctx.incomingFastMoveDamageModifiers,
      incomingChargedMoveDamageModifiers: ctx.incomingChargedMoveDamageModifiers,
      table: costTable,
      fromLevel,
      maxLevel,
    });
  };

  const startingLevels = slots.map((s) => s.level);
  const currentLevels = [...startingLevels];

  const baseline = runFullRoster(currentLevels);
  // See "NOISE FLOOR IS PER-ROUND, NOT FIXED" in this function's top doc
  // comment: this starts from the baseline's measured variance, but is
  // RECOMPUTED after every committed step from that step's own
  // PowerUpEncounterSummary — never re-simulated just to measure variance,
  // since summarizeResults already fills in teamDpsStdDev for every roster
  // this function runs anyway.
  let currentNoiseFloorTeamDps = noiseFloorFor(baseline, iterations);

  let currentSummary = baseline;
  const steps: PowerUpBudgetStep[] = [];

  let remainingStardust = stardustOnHand;
  const remainingOwnCandy = slots.map((s) => s.candyOnHand ?? 0);
  const remainingOwnXl = slots.map((s) => s.xlCandyOnHand ?? 0);
  let remainingSharedCandy = rareCandyOnHand;
  let remainingSharedXl = rareCandyXlOnHand;

  let stopReason: PowerUpBudgetStopReason = "round-cap-reached";

  roundLoop: for (let round = 0; round < maxRounds; round++) {
    // The floor THIS round's candidates are judged against — captured before
    // any recompute below so PowerUpBudgetStep.noiseFloorTeamDps records
    // exactly what governed this round's decision, not next round's updated
    // value.
    const floorForThisRound = currentNoiseFloorTeamDps;

    // Every useful level left per slot, ignoring affordability — used only
    // to distinguish "max-level-reached" (nothing left AT ALL) from
    // "budget-exhausted" (something's left, but not affordable) below.
    const perSlotUseful: number[][] = slots.map((_slot, slotIndex) => usefulLevelsForSlot(slotIndex, currentLevels[slotIndex]!));

    if (perSlotUseful.every((levels) => levels.length === 0)) {
      stopReason = "max-level-reached";
      break roundLoop;
    }

    // Affordability-filter each slot's useful levels against what's actually
    // LEFT of the budget right now — cost is monotone non-decreasing in
    // level (see powerUpCost), so the first unaffordable level means every
    // higher one is unaffordable too; stop at the first one and at
    // candidateLevelsPerSlotPerRound, whichever comes first. Each entry here
    // is a JUMP CANDIDATE from this slot's currently-planned level straight
    // to `toLevel` — powerUpCost already prices the whole multi-level span,
    // not a single half-step — so a far-out useful level costs and reads as
    // one candidate, never a forced chain of intermediate ones.
    const perSlotCandidates: RawPowerUpBudgetCandidate[][] = perSlotUseful.map((usefulLevels, slotIndex) => {
      const slot = slots[slotIndex]!;
      const fromLevel = currentLevels[slotIndex]!;
      const maxSpendableCandy = remainingOwnCandy[slotIndex]! + remainingSharedCandy * RARE_CANDY_TO_CANDY_RATIO;
      const maxSpendableXl = remainingOwnXl[slotIndex]! + remainingSharedXl * RARE_CANDY_XL_TO_XL_CANDY_RATIO;

      const affordable: RawPowerUpBudgetCandidate[] = [];
      for (const toLevel of usefulLevels) {
        const cost = powerUpCost(costTable, fromLevel, toLevel, slot.costModifiers);
        if (cost.stardust > remainingStardust || cost.candy > maxSpendableCandy || cost.xlCandy > maxSpendableXl) break;
        affordable.push({ slotIndex, toLevel, cost });
        if (affordable.length >= candidateLevelsPerSlotPerRound) break;
      }
      return affordable;
    });

    // Round-robin interleave across slots (not first-slots-first) so no
    // single slot can starve the others of a look-in when
    // maxCandidatesPerRound is the binding constraint. The depth bound is
    // the longest ACTUAL per-slot candidate list, not
    // candidateLevelsPerSlotPerRound directly — that input defaults to
    // Number.POSITIVE_INFINITY (see its doc comment), and looping on it
    // directly would never terminate; every list is already finite (bounded
    // by real affordability and usefulPowerUpLevelsAbove's dominated-level
    // reduction), and `Math.min` still respects a caller-supplied finite
    // override.
    const maxPerSlotCandidateCount = perSlotCandidates.reduce((max, list) => Math.max(max, list.length), 0);
    const interleaveDepthLimit = Math.min(candidateLevelsPerSlotPerRound, maxPerSlotCandidateCount);
    const roundCandidates = interleaveCandidatesRoundRobin(perSlotCandidates, interleaveDepthLimit, maxCandidatesPerRound);

    if (roundCandidates.length === 0) {
      stopReason = "budget-exhausted";
      break roundLoop;
    }

    let best: { candidate: RawPowerUpBudgetCandidate; summary: PowerUpEncounterSummary; deltaTeamDps: number; score: number } | null =
      null;
    for (const candidate of roundCandidates) {
      const levels = [...currentLevels];
      levels[candidate.slotIndex] = candidate.toLevel;
      const summary = runFullRoster(levels);
      const deltaTeamDps = summary.teamDps - currentSummary.teamDps;

      // Multi-dimensional-knapsack-style scalarization: cost as a fraction
      // of what's actually left of EACH constrained resource, summed. A
      // SEARCH HEURISTIC ONLY — see this export's top doc comment for why
      // this never leaks into the reported output.
      const candyPool = remainingOwnCandy[candidate.slotIndex]! + remainingSharedCandy * RARE_CANDY_TO_CANDY_RATIO;
      const xlPool = remainingOwnXl[candidate.slotIndex]! + remainingSharedXl * RARE_CANDY_XL_TO_XL_CANDY_RATIO;
      const stardustFraction = remainingStardust > 0 ? candidate.cost.stardust / remainingStardust : 0;
      const candyFraction = candyPool > 0 ? candidate.cost.candy / candyPool : 0;
      const xlFraction = xlPool > 0 ? candidate.cost.xlCandy / xlPool : 0;
      const costFraction = Math.max(stardustFraction + candyFraction + xlFraction, 1e-9);
      const score = deltaTeamDps / costFraction;

      if (deltaTeamDps > floorForThisRound && (best === null || score > best.score)) {
        best = { candidate, summary, deltaTeamDps, score };
      }
    }

    if (!best) {
      stopReason = "no-significant-candidate";
      break roundLoop;
    }

    const { candidate, summary, deltaTeamDps } = best;
    const slot = slots[candidate.slotIndex]!;
    const fromLevel = currentLevels[candidate.slotIndex]!;

    // Own resources are always spent before either shared pool.
    const ownCandySpent = Math.min(candidate.cost.candy, remainingOwnCandy[candidate.slotIndex]!);
    const sharedCandySpent = candidate.cost.candy - ownCandySpent;
    const ownXlCandySpent = Math.min(candidate.cost.xlCandy, remainingOwnXl[candidate.slotIndex]!);
    const sharedXlCandySpent = candidate.cost.xlCandy - ownXlCandySpent;

    remainingStardust -= candidate.cost.stardust;
    remainingOwnCandy[candidate.slotIndex] = remainingOwnCandy[candidate.slotIndex]! - ownCandySpent;
    remainingOwnXl[candidate.slotIndex] = remainingOwnXl[candidate.slotIndex]! - ownXlCandySpent;
    remainingSharedCandy -= sharedCandySpent / RARE_CANDY_TO_CANDY_RATIO;
    remainingSharedXl -= sharedXlCandySpent / RARE_CANDY_XL_TO_XL_CANDY_RATIO;

    currentLevels[candidate.slotIndex] = candidate.toLevel;
    currentSummary = summary;
    // Recompute the floor from THIS newly-committed roster's own measured
    // variance for the NEXT round — see "NOISE FLOOR IS PER-ROUND, NOT
    // FIXED" above. `summary` already carries teamDpsStdDev from
    // summarizeResults, so this costs nothing extra.
    currentNoiseFloorTeamDps = noiseFloorFor(currentSummary, iterations);

    steps.push({
      slotIndex: candidate.slotIndex,
      speciesId: slot.species!.id,
      speciesName: slot.species!.name,
      fromLevel,
      toLevel: candidate.toLevel,
      cost: candidate.cost,
      ownCandySpent,
      sharedCandySpent,
      ownXlCandySpent,
      sharedXlCandySpent,
      deltaTeamDps,
      noiseFloorTeamDps: floorForThisRound,
      cumulativeTeamDps: summary.teamDps,
    });
  }

  // A dedicated re-simulation of the FINISHED roster — see this export's top
  // doc comment for why this is not just a re-read of the last step.
  const final = runFullRoster(currentLevels);

  // --- Best blocked candidate (one-time, post-search only) ------------------
  // Runs ONCE, on the roster/budget state the search actually stopped at —
  // never per round — so it costs at most one extra round's worth of
  // simulation. For each fielded slot, find every useful level BEYOND the
  // point affordability broke (cost is monotone non-decreasing in level, so
  // once one level is unaffordable every higher one is too — see
  // powerUpCost), bounded per slot by blockedCandidateLevelsPerSlot and in
  // total by maxBlockedCandidatesToCheck (same round-robin interleaving as
  // the main search, so no single slot can starve the others of a look-in).
  // This deliberately does NOT re-derive "unaffordable" from perSlotCandidates
  // captured mid-loop (which may have stopped short of the true affordability
  // boundary due to candidateLevelsPerSlotPerRound/maxCandidatesPerRound) —
  // it re-checks affordability directly against the FINAL remaining budget,
  // so it can never under- or over-report what's actually left on the table.
  const perSlotBlocked: RawPowerUpBudgetCandidate[][] = slots.map((_slot, slotIndex) => {
    const slot = slots[slotIndex]!;
    const fromLevel = currentLevels[slotIndex]!;
    const usefulLevels = usefulLevelsForSlot(slotIndex, fromLevel);
    if (usefulLevels.length === 0) return [];

    const maxSpendableCandy = remainingOwnCandy[slotIndex]! + remainingSharedCandy * RARE_CANDY_TO_CANDY_RATIO;
    const maxSpendableXl = remainingOwnXl[slotIndex]! + remainingSharedXl * RARE_CANDY_XL_TO_XL_CANDY_RATIO;

    const firstUnaffordableIndex = usefulLevels.findIndex((toLevel) => {
      const cost = powerUpCost(costTable, fromLevel, toLevel, slot.costModifiers);
      return cost.stardust > remainingStardust || cost.candy > maxSpendableCandy || cost.xlCandy > maxSpendableXl;
    });
    if (firstUnaffordableIndex === -1) return []; // every useful level left here is actually affordable — nothing "blocked" about this slot.

    return usefulLevels.slice(firstUnaffordableIndex, firstUnaffordableIndex + blockedCandidateLevelsPerSlot).map((toLevel) => ({
      slotIndex,
      toLevel,
      cost: powerUpCost(costTable, fromLevel, toLevel, slot.costModifiers),
    }));
  });

  const maxPerSlotBlockedCount = perSlotBlocked.reduce((max, list) => Math.max(max, list.length), 0);
  const blockedCandidatesToCheck = interleaveCandidatesRoundRobin(
    perSlotBlocked,
    Math.min(blockedCandidateLevelsPerSlot, maxPerSlotBlockedCount),
    maxBlockedCandidatesToCheck,
  );

  let bestBlockedCandidate: PowerUpBudgetBlockedCandidate | null = null;
  let bestBlockedDeltaTeamDps = -Infinity;
  for (const candidate of blockedCandidatesToCheck) {
    const levels = [...currentLevels];
    levels[candidate.slotIndex] = candidate.toLevel;
    const summary = runFullRoster(levels);
    const deltaTeamDps = summary.teamDps - currentSummary.teamDps;
    // Judged against the FINAL floor (currentNoiseFloorTeamDps as left by the
    // round loop above) — a blocked candidate must clear the SAME bar the
    // search itself was applying when it stopped, not a stale earlier one.
    if (deltaTeamDps > currentNoiseFloorTeamDps && deltaTeamDps > bestBlockedDeltaTeamDps) {
      const slot = slots[candidate.slotIndex]!;
      bestBlockedDeltaTeamDps = deltaTeamDps;
      bestBlockedCandidate = {
        slotIndex: candidate.slotIndex,
        speciesId: slot.species!.id,
        speciesName: slot.species!.name,
        fromLevel: currentLevels[candidate.slotIndex]!,
        toLevel: candidate.toLevel,
        cost: candidate.cost,
        deltaTeamDps,
        shortfalls: shortfallsForCandidate(
          candidate.cost,
          remainingStardust,
          remainingOwnCandy[candidate.slotIndex]!,
          remainingOwnXl[candidate.slotIndex]!,
          remainingSharedCandy,
          remainingSharedXl,
        ),
      };
    }
  }

  const finalLevels: PowerUpBudgetFinalLevel[] = slots.map((slot, i) => ({
    slotIndex: i,
    speciesId: slot.species?.id ?? null,
    speciesName: slot.species?.name ?? null,
    fromLevel: slot.species ? startingLevels[i]! : null,
    toLevel: slot.species ? currentLevels[i]! : null,
  }));

  const ledger: PowerUpBudgetLedger = {
    stardust: { spent: stardustOnHand - remainingStardust, remaining: remainingStardust },
    ownCandy: slots.map((slot, i) => ({
      spent: (slot.candyOnHand ?? 0) - remainingOwnCandy[i]!,
      remaining: remainingOwnCandy[i]!,
    })),
    ownXlCandy: slots.map((slot, i) => ({
      spent: (slot.xlCandyOnHand ?? 0) - remainingOwnXl[i]!,
      remaining: remainingOwnXl[i]!,
    })),
    sharedRareCandy: { spent: rareCandyOnHand - remainingSharedCandy, remaining: remainingSharedCandy },
    sharedRareCandyXl: { spent: rareCandyXlOnHand - remainingSharedXl, remaining: remainingSharedXl },
  };

  return {
    steps,
    finalLevels,
    baseline,
    final,
    bossHp,
    iterations,
    // The FINAL floor — see PowerUpBudgetPlan.noiseFloorTeamDps's doc comment.
    noiseFloorTeamDps: currentNoiseFloorTeamDps,
    ledger,
    stopReason,
    bestBlockedCandidate,
  };
}
