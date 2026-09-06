/**
 * CP Multiplier table, keyed by level (including half-levels). Sourced from the
 * public Pokémon GO GameMaster data (levels 1-40), extended through level 50.
 * Values are the multipliers applied to (base stat + IV) to produce an
 * effective stat at that level.
 *
 * Levels 41-50 (and their half-levels) were added 2026-09-06. The whole-level
 * values (41, 42, ..., 50) were read directly out of the live PokeMiners/game_masters
 * `latest.json` GAME_MASTER dump on GitHub (`PLAYER_LEVEL_SETTINGS.playerLevel.cpMultiplier`,
 * a raw array indexed by level-1) via a real curl+JSON.parse, and cross-checked to match
 * this table's own existing levels 1-40 exactly. The half-level values (40.5, 41.5, ...,
 * 49.5) were computed from those verified whole-level values via
 * CPM(n+0.5) = sqrt((CPM(n)^2 + CPM(n+1)^2)/2), confirmed correct by reproducing this
 * table's own already-pinned 39.5 entry to 8 significant figures using the same formula.
 * Levels 50.5+ are deliberately omitted: the raw array does continue with distinct
 * values through level 54 before flatlining (a padding artifact), but the real,
 * live-game-confirmed max Pokémon power-up level is 50 (Niantic's Oct 2025 trainer-level-cap
 * blog post explicitly says the raise to 80 "only affects Trainer level and not Pokémon";
 * the Pokémon cap has been 50 since Nov 2020's GO Beyond update). Full derivation detail:
 * `.claude/agent-memory/pogo-researcher/fact_cpm_table_levels_41_50.md`.
 */
export const CPM_TABLE: Record<number, number> = {
  1: 0.094, 1.5: 0.1351374318, 2: 0.16639787, 2.5: 0.192650919,
  3: 0.21573247, 3.5: 0.2365726613, 4: 0.25572005, 4.5: 0.2735303812,
  5: 0.29024988, 5.5: 0.3060573775, 6: 0.3210876, 6.5: 0.3354450362,
  7: 0.34921268, 7.5: 0.3624577511, 8: 0.3752356, 8.5: 0.387592416,
  9: 0.39956728, 9.5: 0.4111935514, 10: 0.4225, 10.5: 0.4329264091,
  11: 0.44310755, 11.5: 0.4530599591, 12: 0.4627984, 12.5: 0.472336093,
  13: 0.48168495, 13.5: 0.4908558003, 14: 0.49985844, 14.5: 0.508701765,
  15: 0.51739395, 15.5: 0.5259425113, 16: 0.5343543, 16.5: 0.5426357375,
  17: 0.5507927, 17.5: 0.5588305862, 18: 0.5667545, 18.5: 0.5745691333,
  19: 0.5822789, 19.5: 0.5898879072, 20: 0.5974, 20.5: 0.6048236651,
  21: 0.6121573, 21.5: 0.6194041216, 22: 0.6265671, 22.5: 0.6336491432,
  23: 0.64065295, 23.5: 0.6475809666, 24: 0.65443563, 24.5: 0.6612192524,
  25: 0.667934, 25.5: 0.6745818959, 26: 0.6811649, 26.5: 0.6876849038,
  27: 0.69414365, 27.5: 0.70054287, 28: 0.7068842, 28.5: 0.7131691091,
  29: 0.7193991, 29.5: 0.7255756136, 30: 0.7317, 30.5: 0.7347410093,
  31: 0.7377695, 31.5: 0.7407855938, 32: 0.74378943, 32.5: 0.7467812109,
  33: 0.74976104, 33.5: 0.7527290867, 34: 0.7556855, 34.5: 0.7586303683,
  35: 0.76156384, 35.5: 0.7644860647, 36: 0.76739717, 36.5: 0.7702972656,
  37: 0.7731865, 37.5: 0.7760649616, 38: 0.77893275, 38.5: 0.7817900548,
  39: 0.784637, 39.5: 0.7874736075, 40: 0.7903, 40.5: 0.7928039417157309,
  41: 0.7953, 41.5: 0.7978039170121942, 42: 0.8003, 42.5: 0.8028038926163724,
  43: 0.8053, 43.5: 0.8078038685225517, 44: 0.8103, 44.5: 0.8128038447251588,
  45: 0.8153, 45.5: 0.8178038212187566, 46: 0.8203, 46.5: 0.8228037979980404,
  47: 0.8253, 47.5: 0.8278037750578334, 48: 0.8303, 48.5: 0.8328037523930834,
  49: 0.8353, 49.5: 0.8378037299988584, 50: 0.8403,
};

export function cpmForLevel(level: number): number {
  const cpm = CPM_TABLE[level];
  if (cpm === undefined) {
    throw new Error(`No CPM entry for level ${level}. Valid levels are 1-50 in 0.5 steps.`);
  }
  return cpm;
}
