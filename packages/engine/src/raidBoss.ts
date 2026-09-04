/**
 * Raid bosses don't level up or roll IVs the way trainer-owned Pokémon do — Niantic
 * publishes their effective stats directly. To reuse the single stat pipeline in
 * stats.ts (one documented FLOOR(), one code path) rather than forking a second one,
 * a raid boss is modeled as a species whose "base stat" fields already ARE its
 * effective stats, combined with iv = 0 and this fixed multiplier of 1.0.
 */
export const RAID_BOSS_CPM = 1.0;
export const RAID_BOSS_IVS = { attack: 0, defense: 0, stamina: 0 } as const;
