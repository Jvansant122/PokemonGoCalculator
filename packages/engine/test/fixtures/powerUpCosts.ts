import type { GameMasterPerSpeciesUpgradeOverride, GameMasterPokemonUpgradeSettings } from "../../src/powerUp.js";

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

/**
 * TEST-ONLY fixture: the REAL raw
 * `POKEMON_UPGRADE_OVERRIDE_SETTINGS_V0890_POKEMON_ETERNATUS` record, as
 * verified live 2026-09-10 straight off `data/normalized/powerUpCosts.json`'s
 * `perSpeciesUpgradeOverrides[0]` (data-sync's own extraction). `stardustCost`
 * is byte-identical to `RAW_POKEMON_UPGRADE_SETTINGS.stardustCost` above (the
 * override only actually changes `candyCost`/`xlCandyCost`) — kept explicit
 * here anyway rather than inherited, so this fixture is a genuinely complete,
 * standalone record matching what the live dump contains, and so the "merge
 * falls back to universal for an OMITTED field" behavior is exercised by a
 * SEPARATE, deliberately-partial fixture below rather than by this one.
 */
export const RAW_ETERNATUS_UPGRADE_OVERRIDE: GameMasterPerSpeciesUpgradeOverride = {
  pokemonId: "ETERNATUS",
  upgradesPerLevel: 2,
  maxNormalUpgradeLevel: 50,
  xlCandyMinPokemonLevel: 40,
  stardustCost: RAW_POKEMON_UPGRADE_SETTINGS.stardustCost,
  candyCost: [
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 90, 90, 90, 90, 90, 120, 120, 120, 120, 120,
    175, 175, 225, 225, 300, 300, 375, 375, 890, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  xlCandyCost: [100, 100, 200, 200, 400, 400, 635, 635, 890, 890],
  shadowStardustMultiplier: 1.2,
  shadowCandyMultiplier: 1.2,
  purifiedStardustMultiplier: 0.9,
  purifiedCandyMultiplier: 0.9,
};

/**
 * A deliberately PARTIAL override — only `candyCost` set, every other field
 * omitted — to exercise `powerUpCostTableFromGameMaster`'s "merge onto the
 * universal record" fallback for whichever fields a real future override
 * DOESN'T set (data-sync's own raw extraction type,
 * `GameMasterUpgradeOverrideRecord`, marks every field but `pokemonId`/
 * `sourceTemplateId` optional — nothing guarantees a future override sets
 * them all, the way Eternatus's happens to).
 */
export const RAW_PARTIAL_UPGRADE_OVERRIDE: GameMasterPerSpeciesUpgradeOverride = {
  pokemonId: "TESTMON",
  candyCost: RAW_ETERNATUS_UPGRADE_OVERRIDE.candyCost,
};

export const NO_MODIFIERS = { isShadow: false, isPurified: false, isLucky: false } as const;
