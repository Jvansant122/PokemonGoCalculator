/**
 * CP Multiplier table, keyed by level (including half-levels). Sourced from the
 * public Pokémon GO GameMaster data (levels 1-40), extended through level 52.
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
 * Full derivation detail: `.claude/agent-memory/pogo-researcher/fact_cpm_table_levels_41_50.md`.
 *
 * Levels 50.5-52 were added 2026-09-09 for a DIFFERENT, NARROWER purpose than
 * the rest of the table — read this before assuming they mean what 1-50 mean.
 * `MAX_POKEMON_POWER_UP_LEVEL` below (50) remains the real, live-game
 * power-up ceiling — Niantic's Oct 2025 trainer-level-cap blog post
 * explicitly says the raise to 80 "only affects Trainer level and not
 * Pokémon," and the Pokémon cap has been 50 since Nov 2020's GO Beyond
 * update. These four extra entries (51/52 real whole-level values straight
 * from the raw GAME_MASTER array; 50.5/51.5 computed via this file's own
 * half-level formula above) exist SOLELY as effective-level lookup targets
 * for bonuses stacked on top of that level-50 ceiling — Super Max Mega Level
 * 4's "+2 effective levels" CP bonus (see megaLevel.ts's
 * SUPER_MAX_EFFECTIVE_LEVEL_BONUS/effectiveLevelForMegaLevel: a level-48.5-50
 * Pokémon at Super Max needs exactly these four shifted lookups) — NEVER as
 * power-up targets a Pokémon's own level can actually reach. `cpmForLevel`
 * happily resolves these four keys (that's the whole point — a caller who's
 * already computed a valid shifted effective level shouldn't be blocked from
 * looking it up), but nothing in this engine may present 50.5/51/51.5/52 as
 * a selectable POWER-UP level — see MAX_POKEMON_POWER_UP_LEVEL below, and
 * breakpoints.ts's/ivComparison.ts's ALL_LEVELS (both filter against it
 * explicitly rather than trusting this table's own key count). The raw
 * GAME_MASTER array continues with further distinct values through level 54
 * before flatlining at a constant past that (a classic "padded past the real
 * cap" pattern) — 53/54 are deliberately still omitted here, since no
 * modelled bonus in this engine ever needs to shift a level that far (the
 * largest shift, Super Max's +2 applied to a level-50 Pokémon, tops out at
 * exactly 52).
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
  // --- Effective-level-only lookup targets past the real power-up ceiling
  // (see this table's own doc comment above and MAX_POKEMON_POWER_UP_LEVEL
  // below) — 51/52 are real GAME_MASTER whole-level values; 50.5/51.5 are
  // this file's own half-level formula applied to them.
  50.5: 0.842803707870344, 51: 0.8453, 51.5: 0.8478036860028387, 52: 0.8503,
};

/**
 * The real, live-game power-up ceiling for an individual Pokémon: Stardust +
 * Candy can raise a Pokémon's own level from 1 up to this and no further —
 * see CPM_TABLE's doc comment for the sourcing (Niantic's Oct 2025 blog post
 * on the Trainer-level-cap raise to 80, explicit that Pokémon level is
 * unaffected). Distinct from CPM_TABLE's own key range, which now
 * deliberately extends to 52 for a narrower, DIFFERENT purpose (effective-
 * level bonus stacking, e.g. Super Max Mega Level) — this constant is what
 * anything presenting "every level a Pokémon can actually be powered up to"
 * must filter against, rather than trusting CPM_TABLE's key count or length.
 * `powerUp.ts`/`rosterPlanner.ts` don't need this constant themselves: their
 * own candidate ladder is independently bounded by
 * `PowerUpCostTable.maxLevel`, sourced fresh from GAME_MASTER's real
 * `maxNormalUpgradeLevel` field (confirmed, independently of this constant,
 * to also currently be 50) — see the regression test proving that stays
 * true even after this table's extension
 * (test/megaLevelPowerUpCeiling.test.ts). `breakpoints.ts`'s and
 * `ivComparison.ts`'s `ALL_LEVELS` DO consume this directly, since those
 * modules build their default level sweep straight from this table's own
 * keys and would otherwise silently start sweeping 50.5-52 the moment this
 * table grew past 50.
 */
export const MAX_POKEMON_POWER_UP_LEVEL = 50;

export function cpmForLevel(level: number): number {
  const cpm = CPM_TABLE[level];
  if (cpm === undefined) {
    throw new Error(
      `No CPM entry for level ${level}. Valid levels are 1-52 in 0.5 steps, though only 1-${MAX_POKEMON_POWER_UP_LEVEL} ` +
        `are reachable as an ordinary power-up target — see CPM_TABLE's doc comment for what 50.5-52 are actually for.`,
    );
  }
  return cpm;
}
