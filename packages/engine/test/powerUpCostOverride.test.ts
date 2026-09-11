import { describe, expect, it } from "vitest";
import {
  powerUpCost,
  powerUpCostTableFor,
  powerUpCostTableFromGameMaster,
  powerUpDamageLadder,
  type PowerUpCostTable,
} from "../src/powerUp.js";
import type { SpeciesDefinition } from "../src/types.js";
import {
  NO_MODIFIERS,
  RAW_ETERNATUS_UPGRADE_OVERRIDE,
  RAW_LUCKY_STARDUST_DISCOUNT_PERCENT,
  RAW_PARTIAL_UPGRADE_OVERRIDE,
  RAW_POKEMON_UPGRADE_SETTINGS,
} from "./fixtures/powerUpCosts.js";

/**
 * Fixes a real correctness bug flagged 2026-09-10: Eternatus's candy cost
 * was understated by ~30-59x (and its XL candy cost, previously undocumented
 * entirely, by ~10-44.5x) because `powerUpCostTableFromGameMaster` never
 * consumed `data-sync`'s already-extracted `perSpeciesUpgradeOverrides`. See
 * `powerUp.ts`'s "PER-SPECIES OVERRIDES" top-doc-comment section for the
 * full schema (`PowerUpCostTable.perSpeciesOverridesByPokemonId`,
 * `powerUpCostTableFor`) and why it's keyed by raw pokemonId rather than a
 * resolved species id.
 */

const ETERNATUS_SPECIES: SpeciesDefinition = {
  id: "eternatus",
  name: "Eternatus",
  types: ["poison", "dragon"],
  baseAttack: 250,
  baseDefense: 175,
  baseStamina: 240,
  fastMoves: [],
  chargedMoves: [],
};

const UNRELATED_SPECIES: SpeciesDefinition = {
  id: "some-other-species",
  name: "Some Other Species",
  types: ["normal"],
  baseAttack: 150,
  baseDefense: 150,
  baseStamina: 150,
  fastMoves: [],
  chargedMoves: [],
};

describe("powerUpCostTableFromGameMaster — perSpeciesUpgradeOverrides", () => {
  it("builds no perSpeciesOverridesByPokemonId when omitted (byte-identical to before this parameter existed)", () => {
    const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
    expect(table.perSpeciesOverridesByPokemonId).toBeUndefined();
  });

  it("builds a real, independently-valid override table keyed by raw pokemonId", () => {
    const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, [
      RAW_ETERNATUS_UPGRADE_OVERRIDE,
    ]);
    expect(table.perSpeciesOverridesByPokemonId).toBeDefined();
    const eternatusTable = table.perSpeciesOverridesByPokemonId!["ETERNATUS"]!;
    expect(eternatusTable).toBeDefined();
    // level 39 -> 39.5 (array index 38): universal candy is 15, override is 890.
    const universalStep = table.steps.find((s) => s.fromLevel === 39)!;
    const overrideStep = eternatusTable.steps.find((s) => s.fromLevel === 39)!;
    expect(universalStep.candy).toBe(15);
    expect(overrideStep.candy).toBe(890);
    // stardust is genuinely UNAFFECTED — byte-identical between the two.
    expect(overrideStep.stardust).toBe(universalStep.stardust);
    // XL candy at level 40 -> 40.5: universal 10, override 100 (10x here).
    const universalXlStep = table.steps.find((s) => s.fromLevel === 40)!;
    const overrideXlStep = eternatusTable.steps.find((s) => s.fromLevel === 40)!;
    expect(universalXlStep.xlCandy).toBe(10);
    expect(overrideXlStep.xlCandy).toBe(100);
  });

  it("a PARTIAL override (only candyCost set) falls back to the universal record for every omitted field", () => {
    const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, [
      RAW_PARTIAL_UPGRADE_OVERRIDE,
    ]);
    const overrideTable = table.perSpeciesOverridesByPokemonId!["TESTMON"]!;
    // maxLevel/xlCandy/multipliers all inherited from the universal record —
    // never thrown, never defaulted to something invented.
    expect(overrideTable.maxLevel).toBe(table.maxLevel);
    expect(overrideTable.shadowCandyMultiplier).toBe(table.shadowCandyMultiplier);
    const universalStep = table.steps.find((s) => s.fromLevel === 40)!;
    const overrideStep = overrideTable.steps.find((s) => s.fromLevel === 40)!;
    // XL candy at level 40 is inherited (identical), but candy at level 39
    // (below the XL threshold) reflects the override's own candyCost.
    expect(overrideStep.xlCandy).toBe(universalStep.xlCandy);
    const overrideStep39 = overrideTable.steps.find((s) => s.fromLevel === 39)!;
    expect(overrideStep39.candy).toBe(890);
  });

  it("multiple override entries each resolve independently", () => {
    const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, [
      RAW_ETERNATUS_UPGRADE_OVERRIDE,
      RAW_PARTIAL_UPGRADE_OVERRIDE,
    ]);
    expect(Object.keys(table.perSpeciesOverridesByPokemonId!).sort()).toEqual(["ETERNATUS", "TESTMON"]);
  });
});

describe("powerUpCostTableFor", () => {
  const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, [
    RAW_ETERNATUS_UPGRADE_OVERRIDE,
  ]);

  it("returns the table unchanged when it has no overrides at all", () => {
    const noOverrides = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
    expect(powerUpCostTableFor(noOverrides, ETERNATUS_SPECIES)).toBe(noOverrides);
  });

  it("resolves Eternatus (by species.name -> pokemonId) to its own override table", () => {
    const resolved = powerUpCostTableFor(table, ETERNATUS_SPECIES);
    expect(resolved).toBe(table.perSpeciesOverridesByPokemonId!["ETERNATUS"]);
    expect(resolved).not.toBe(table);
  });

  it("leaves an unrelated species on the universal table unchanged", () => {
    const resolved = powerUpCostTableFor(table, UNRELATED_SPECIES);
    expect(resolved).toBe(table);
  });

  it("real bug fix, end to end: powerUpCost for Eternatus at 39 -> 39.5 is 890 candy, not the universal 15", () => {
    const resolvedTable = powerUpCostTableFor(table, ETERNATUS_SPECIES);
    const cost = powerUpCost(resolvedTable, 39, 39.5, NO_MODIFIERS);
    expect(cost.candy).toBe(890);
    expect(cost.stardust).toBe(10000); // universal stardust (index 38), unaffected — verified against RAW_POKEMON_UPGRADE_SETTINGS.stardustCost[38]
  });
});

describe("powerUpDamageLadder — reflects a per-species override without any caller change", () => {
  const table: PowerUpCostTable = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, [
    RAW_ETERNATUS_UPGRADE_OVERRIDE,
  ]);
  const fastMove = { id: "f", name: "F", type: "normal" as const, power: 8, energyGain: 3, durationSeconds: 1 };
  const chargedMove = {
    id: "c",
    name: "C",
    type: "normal" as const,
    power: 50,
    energyCost: 35,
    durationSeconds: 2,
    vulnerableWindowSeconds: 2,
  };

  it("an Eternatus ladder's cumulative candy cost matches the override table, not the universal one", () => {
    const ladder = powerUpDamageLadder({
      species: ETERNATUS_SPECIES,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      fromLevel: 38,
      fastMove,
      chargedMove,
      bossDefenseStat: 150,
      fastMoveDamageModifiers: { stab: false },
      chargedMoveDamageModifiers: { stab: false },
      table,
      modifiers: NO_MODIFIERS,
      maxLevel: 40,
    });
    const step39 = ladder.steps.find((s) => s.level === 39)!;
    // Cumulative 38 -> 39 == the override's own single-step cost at fromLevel 38.
    const eternatusTable = table.perSpeciesOverridesByPokemonId!["ETERNATUS"]!;
    const expected = powerUpCost(eternatusTable, 38, 39, NO_MODIFIERS);
    expect(step39.cumulativeCost).toEqual(expected);
    expect(step39.cumulativeCost.candy).toBeGreaterThan(30 * 2); // real signal this isn't the universal (tiny) table
  });

  it("an unrelated species' ladder is completely unaffected by Eternatus's override existing in the same table", () => {
    const ladderWithOverridesPresent = powerUpDamageLadder({
      species: UNRELATED_SPECIES,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      fromLevel: 38,
      fastMove,
      chargedMove,
      bossDefenseStat: 150,
      fastMoveDamageModifiers: { stab: false },
      chargedMoveDamageModifiers: { stab: false },
      table,
      modifiers: NO_MODIFIERS,
      maxLevel: 40,
    });
    const universalOnlyTable = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
    const ladderWithoutOverrides = powerUpDamageLadder({
      species: UNRELATED_SPECIES,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      fromLevel: 38,
      fastMove,
      chargedMove,
      bossDefenseStat: 150,
      fastMoveDamageModifiers: { stab: false },
      chargedMoveDamageModifiers: { stab: false },
      table: universalOnlyTable,
      modifiers: NO_MODIFIERS,
      maxLevel: 40,
    });
    expect(ladderWithOverridesPresent.steps).toEqual(ladderWithoutOverrides.steps);
  });
});
