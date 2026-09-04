/**
 * Energy gained per point of damage taken. This is the mechanic that lets a
 * Pokémon reach a charged move purely from being hit, with no fast moves of its
 * own landing in time — the load-bearing term behind the "one charged attack in
 * 10 seconds" result this engine was built to reproduce (see the spec's
 * Scenario A). Do not treat this as optional or drop it during a refactor.
 */
export const ENERGY_PER_DAMAGE_TAKEN = 0.5;

export const MAX_ENERGY = 100;

/** Energy gained from a single fast move landing (a flat, move-defined amount). */
export function energyFromFastMove(fastMoveEnergyGain: number): number {
  return fastMoveEnergyGain;
}

/** Energy gained from a single instance of incoming damage. */
export function energyFromDamageTaken(damageTaken: number): number {
  return Math.floor(damageTaken * ENERGY_PER_DAMAGE_TAKEN);
}

export interface EnergyEvent {
  /** Seconds from the start of the fight at which this energy is gained. */
  atSeconds: number;
  amount: number;
  source: "fast-move" | "damage-taken";
}

/**
 * Merges a combatant's own fast-move energy gains with the energy it gains from
 * incoming damage, in time order, and reports the running total plus the first
 * moment (if any) it reaches the charged move's energy cost.
 */
export function accumulateEnergy(
  events: EnergyEvent[],
  energyCost: number,
): { readyAtSeconds: number | null; finalEnergy: number } {
  const sorted = [...events].sort((a, b) => a.atSeconds - b.atSeconds);
  let total = 0;
  let readyAtSeconds: number | null = null;
  for (const event of sorted) {
    total += event.amount;
    if (readyAtSeconds === null && total >= energyCost) {
      readyAtSeconds = event.atSeconds;
    }
  }
  return { readyAtSeconds, finalEnergy: Math.min(total, MAX_ENERGY) };
}
