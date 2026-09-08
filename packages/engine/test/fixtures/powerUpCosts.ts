import type { GameMasterPokemonUpgradeSettings } from "../../src/powerUp.js";

/**
 * TEST-ONLY fixture: the raw GAME_MASTER POKEMON_UPGRADE_SETTINGS ->
 * data.pokemonUpgrades arrays, as verified live 2026-09-08 against
 * https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json
 * — see powerUp.ts's top doc comment for the full sourcing and
 * interpretation. Deliberately NOT under src/fixtures and NOT re-exported
 * from src/index.ts, same rule as test/fixtures/hypotheticalDuo.ts: nothing
 * outside this engine's own test suite should ever import this file.
 */
export const RAW_POKEMON_UPGRADE_SETTINGS: GameMasterPokemonUpgradeSettings = {
  upgradesPerLevel: 2,
  maxNormalUpgradeLevel: 50,
  xlCandyMinPokemonLevel: 40,
  stardustCost: [
    200, 200, 400, 400, 600, 600, 800, 800, 1000, 1000, 1300, 1300, 1600, 1600, 1900, 1900, 2200, 2200, 2500, 2500, 3000, 3000,
    3500, 3500, 4000, 4000, 4500, 4500, 5000, 5000, 6000, 6000, 7000, 7000, 8000, 8000, 9000, 9000, 10000, 10000, 11000, 11000,
    12000, 12000, 13000, 13000, 14000, 14000, 15000,
  ],
  candyCost: [
    // 50 entries in the live dump — one more than stardustCost: a trailing 0 for
    // level 50 itself, which has no power-up (verified 2026-09-08).
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 15, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  xlCandyCost: [10, 10, 12, 12, 15, 15, 17, 17, 20, 20],
  shadowStardustMultiplier: 1.2,
  shadowCandyMultiplier: 1.2,
  purifiedStardustMultiplier: 0.9,
  purifiedCandyMultiplier: 0.9,
};

/** LUCKY_POKEMON_SETTINGS -> data.luckyPokemonSettings.powerUpStardustDiscountPercent — a fraction, not a multiplier; see powerUp.ts's top doc comment. */
export const RAW_LUCKY_STARDUST_DISCOUNT_PERCENT = 0.5;

export const NO_MODIFIERS = { isShadow: false, isPurified: false, isLucky: false } as const;
