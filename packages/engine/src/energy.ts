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

/**
 * How much energy a RAID BOSS gains per point of damage it takes — the boss
 * side of the same mechanic as ENERGY_PER_DAMAGE_TAKEN above. Kept as its own
 * named constant rather than reused directly, even though it currently holds
 * the same value: MECHANICS.md's "Raid boss behaviour" section (Silph Road's
 * analysis of Niantic's September 2024 raid rework, r/TheSilphRoad `1fckfja`,
 * `[community-consensus]`, ~2 years old as of 2026-09-08) documents that
 * Niantic has independently retuned this exact dial before — briefly dropped
 * to `0.02` for bosses only during the rework, with no corresponding change
 * on the attacker side, before being reverted to `0.5`. That history is
 * itself the proof the two dials are independent in the real game, so
 * forcing a single shared constant here would be wrong even though the
 * current values happen to match.
 *
 * This is the mechanic behind bosses gaining MOST of their energy from being
 * attacked rather than from their own fast moves — see simulate.ts's
 * "energy-driven" StepwiseBoss.chargedMoveCadence, which is the only
 * consumer. Not used by the (default) "fixed-interval" cadence model.
 */
export const BOSS_ENERGY_PER_DAMAGE_TAKEN = 0.5;

/** Boss-side counterpart to energyFromDamageTaken — same flooring, see BOSS_ENERGY_PER_DAMAGE_TAKEN for why this is a separate constant/function rather than a reuse. */
export function bossEnergyFromDamageTaken(damageTaken: number): number {
  return Math.floor(damageTaken * BOSS_ENERGY_PER_DAMAGE_TAKEN);
}
