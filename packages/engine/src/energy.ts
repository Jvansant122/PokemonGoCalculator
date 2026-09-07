/**
 * Energy gained per point of damage taken. This is the mechanic that lets a
 * Pokémon reach a charged move purely from being hit, with no fast moves of its
 * own landing in time — the load-bearing term behind the "one charged attack in
 * 10 seconds" result this engine was built to reproduce (see the spec's
 * Scenario A). Do not treat this as optional or drop it during a refactor.
 */
export const ENERGY_PER_DAMAGE_TAKEN = 0.5;

export const MAX_ENERGY = 100;

/** Energy gained from a single instance of incoming damage. */
export function energyFromDamageTaken(damageTaken: number): number {
  return Math.floor(damageTaken * ENERGY_PER_DAMAGE_TAKEN);
}
