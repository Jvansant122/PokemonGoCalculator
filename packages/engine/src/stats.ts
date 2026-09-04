import { cpmForLevel } from "./cpm.js";
import type { EffectiveStats, IVSpread, SpeciesDefinition } from "./types.js";

/**
 * (baseStat, iv, cpm) -> effectiveStat.
 *
 * FLOOR() is applied exactly once, right here, at (base + iv) * cpm. This is the
 * ONLY place in the engine that should floor a raw base stat into an effective one.
 *
 * Known failure mode ("the nested FLOOR() problem"): some upstream data sources
 * (GameMaster dumps, third-party APIs) publish stats that have already been run
 * through this same floor once. If a caller feeds an already-effective stat back
 * into this function, the result gets floored a second time and quietly skews
 * low. Always pass the raw `baseStat`, never a previously-computed effective one.
 */
export function effectiveStat(baseStat: number, iv: number, cpm: number): number {
  return Math.floor((baseStat + iv) * cpm);
}

export function effectiveStatsAtLevel(
  species: Pick<SpeciesDefinition, "baseAttack" | "baseDefense" | "baseStamina">,
  ivs: IVSpread,
  level: number,
): EffectiveStats {
  const cpm = cpmForLevel(level);
  return {
    attack: effectiveStat(species.baseAttack, ivs.attack, cpm),
    defense: effectiveStat(species.baseDefense, ivs.defense, cpm),
    stamina: effectiveStat(species.baseStamina, ivs.stamina, cpm),
  };
}
