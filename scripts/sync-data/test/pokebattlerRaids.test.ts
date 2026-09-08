import { describe, expect, it } from "vitest";
import {
  isArchivableLegacyTier,
  isCurrentRotationTier,
  buildEnumToPogoapiName,
  resolvePokebattlerPokemonId,
  resolveMegaLegacyTier,
  pokebattlerDisplayNameForCrossCheck,
  POKEBATTLER_LEGACY_NUMERIC_TIER_MAP,
  POKEBATTLER_LEGACY_MEGA_TIERS,
  POKEBATTLER_LEGACY_EXCLUDED_TIERS,
  POKEBATTLER_MEGA_POOL_TIERS,
  type PokebattlerResolutionContext,
} from "../pokebattlerRaids.ts";
import type { RaidTier, SpeciesDefinition } from "@pogo-analyzer/engine";

describe("isArchivableLegacyTier", () => {
  it("accepts a _LEGACY tier", () => {
    expect(isArchivableLegacyTier("RAID_LEVEL_1_LEGACY")).toBe(true);
  });

  it("rejects a _LEGACY _MAX (Dynamax/Gigantamax) tier — out of scope", () => {
    expect(isArchivableLegacyTier("RAID_LEVEL_5_MAX_LEGACY")).toBe(false);
  });

  it("rejects a non-legacy tier", () => {
    expect(isArchivableLegacyTier("RAID_LEVEL_5")).toBe(false);
  });
});

describe("isCurrentRotationTier", () => {
  it("excludes RAID_LEVEL_UNSET (Pokebattler's internal full-dex catalog)", () => {
    expect(isCurrentRotationTier("RAID_LEVEL_UNSET")).toBe(false);
  });

  it("excludes _FUTURE tiers (announced, not live)", () => {
    expect(isCurrentRotationTier("RAID_LEVEL_5_FUTURE")).toBe(false);
  });

  it("excludes _LEGACY and _MAX tiers", () => {
    expect(isCurrentRotationTier("RAID_LEVEL_1_LEGACY")).toBe(false);
    expect(isCurrentRotationTier("RAID_LEVEL_5_MAX")).toBe(false);
  });

  it("excludes the Mega rotation-pool tiers even though they aren't _LEGACY/_FUTURE/_MAX", () => {
    expect(isCurrentRotationTier("RAID_LEVEL_MEGA")).toBe(false);
    expect(isCurrentRotationTier("RAID_LEVEL_4_MEGA_ENHANCED")).toBe(false);
    expect(POKEBATTLER_MEGA_POOL_TIERS.has("RAID_LEVEL_MEGA")).toBe(true);
  });

  it("accepts an ordinary current tier", () => {
    expect(isCurrentRotationTier("RAID_LEVEL_5")).toBe(true);
  });
});

describe("legacy tier tables", () => {
  it("map every documented numeric legacy tier to a real RaidTier", () => {
    expect(POKEBATTLER_LEGACY_NUMERIC_TIER_MAP.RAID_LEVEL_1_LEGACY).toBe("1-Star Raids");
    expect(POKEBATTLER_LEGACY_NUMERIC_TIER_MAP.RAID_LEVEL_3_LEGACY).toBe("3-Star Raids");
    expect(POKEBATTLER_LEGACY_NUMERIC_TIER_MAP.RAID_LEVEL_5_LEGACY).toBe("5-Star Raids");
  });

  it("exclude tiers with no honest RaidTier mapping", () => {
    expect(POKEBATTLER_LEGACY_EXCLUDED_TIERS.has("RAID_LEVEL_2_LEGACY")).toBe(true);
    expect(POKEBATTLER_LEGACY_EXCLUDED_TIERS.has("RAID_LEVEL_4_LEGACY")).toBe(true);
    expect(POKEBATTLER_LEGACY_EXCLUDED_TIERS.has("RAID_LEVEL_ULTRA_BEAST_LEGACY")).toBe(true);
    expect(POKEBATTLER_LEGACY_EXCLUDED_TIERS.has("RAID_LEVEL_ELITE_LEGACY")).toBe(true);
  });

  it("never overlap between the numeric map, the mega set, and the excluded set", () => {
    const numericKeys = new Set(Object.keys(POKEBATTLER_LEGACY_NUMERIC_TIER_MAP));
    for (const key of numericKeys) {
      expect(POKEBATTLER_LEGACY_MEGA_TIERS.has(key)).toBe(false);
      expect(POKEBATTLER_LEGACY_EXCLUDED_TIERS.has(key)).toBe(false);
    }
    for (const key of POKEBATTLER_LEGACY_MEGA_TIERS) {
      expect(POKEBATTLER_LEGACY_EXCLUDED_TIERS.has(key)).toBe(false);
    }
  });
});

function resolvePokemonEnumStub(id: number, name: string, known: ReadonlySet<string>): string | null {
  const underscored = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return known.has(underscored) ? underscored : null;
}

describe("buildEnumToPogoapiName", () => {
  it("builds the reverse enum -> pogoapi-display-name map", () => {
    const pokemonIdByName = new Map([["Sneasel", 215], ["Ho-Oh", 250]]);
    const known = new Set(["SNEASEL", "HO_OH"]);
    const map = buildEnumToPogoapiName(pokemonIdByName, resolvePokemonEnumStub, known);
    expect(map.get("SNEASEL")).toBe("Sneasel");
    expect(map.get("HO_OH")).toBe("Ho-Oh");
  });
});

function species(id: string, name: string, rarity?: SpeciesDefinition["rarity"]): SpeciesDefinition {
  return { id, name, rarity } as SpeciesDefinition;
}

function makeContext(overrides: Partial<PokebattlerResolutionContext> = {}): PokebattlerResolutionContext {
  const pokemonIdByName = overrides.pokemonIdByName ?? new Map([["Sneasel", 215], ["Regice", 378]]);
  const defaultFormByPokemonId = overrides.defaultFormByPokemonId ?? new Map();
  const enumToPogoapiName =
    overrides.enumToPogoapiName ?? buildEnumToPogoapiName(pokemonIdByName, resolvePokemonEnumStub, new Set(["SNEASEL", "REGICE"]));
  const speciesIdByNameLower = overrides.speciesIdByNameLower ?? new Map([["sneasel", "sneasel"], ["regice", "regice"]]);
  return { pokemonIdByName, defaultFormByPokemonId, enumToPogoapiName, speciesIdByNameLower };
}

describe("resolvePokebattlerPokemonId", () => {
  it("resolves a mega id to Mega <Base>", () => {
    const ctx = makeContext({ speciesIdByNameLower: new Map([["mega sneasel", "sneasel-mega"]]) });
    expect(resolvePokebattlerPokemonId("SNEASEL_MEGA", ctx)).toEqual({
      speciesId: "sneasel-mega",
      displayName: "Mega Sneasel",
      bucket: "mega",
    });
  });

  it("resolves a mega X/Y id", () => {
    const pokemonIdByName = new Map([["Charizard", 6]]);
    const enumToPogoapiName = buildEnumToPogoapiName(pokemonIdByName, resolvePokemonEnumStub, new Set(["CHARIZARD"]));
    const ctx = makeContext({
      pokemonIdByName,
      enumToPogoapiName,
      speciesIdByNameLower: new Map([["mega charizard x", "charizard-mega-x"]]),
    });
    expect(resolvePokebattlerPokemonId("CHARIZARD_MEGA_X", ctx)).toEqual({
      speciesId: "charizard-mega-x",
      displayName: "Mega Charizard X",
      bucket: "mega",
    });
  });

  it("resolves a primal id", () => {
    const pokemonIdByName = new Map([["Kyogre", 382]]);
    const enumToPogoapiName = buildEnumToPogoapiName(pokemonIdByName, resolvePokemonEnumStub, new Set(["KYOGRE"]));
    const ctx = makeContext({
      pokemonIdByName,
      enumToPogoapiName,
      speciesIdByNameLower: new Map([["primal kyogre", "kyogre-primal"]]),
    });
    expect(resolvePokebattlerPokemonId("KYOGRE_PRIMAL", ctx)).toEqual({
      speciesId: "kyogre-primal",
      displayName: "Primal Kyogre",
      bucket: "mega",
    });
  });

  it("returns null for a mega id whose reconstructed name isn't in the roster", () => {
    const ctx = makeContext();
    expect(resolvePokebattlerPokemonId("SNEASEL_MEGA", ctx)).toBeNull();
  });

  it("prefers a registered Shadow-variant species id when one exists", () => {
    const ctx = makeContext({ speciesIdByNameLower: new Map([["sneasel", "sneasel"], ["shadow sneasel", "sneasel-shadow"]]) });
    expect(resolvePokebattlerPokemonId("SNEASEL_SHADOW_FORM", ctx)).toEqual({
      speciesId: "sneasel-shadow",
      displayName: "Shadow Sneasel",
      bucket: "shadow",
      resolvedToShadowVariant: true,
    });
  });

  it("falls back to the unboosted base species id when no Shadow variant is registered", () => {
    const ctx = makeContext({ speciesIdByNameLower: new Map([["sneasel", "sneasel"]]) });
    expect(resolvePokebattlerPokemonId("SNEASEL_SHADOW_FORM", ctx)).toEqual({
      speciesId: "sneasel",
      displayName: "Shadow Sneasel",
      bucket: "shadow",
    });
  });

  it("resolves a bare base enum with no form suffix", () => {
    const ctx = makeContext();
    expect(resolvePokebattlerPokemonId("REGICE", ctx)).toEqual({
      speciesId: "regice",
      displayName: "Regice",
      bucket: "normal",
    });
  });

  it("returns null for a real alternate form this pipeline's one-form-per-species scope doesn't carry", () => {
    const ctx = makeContext({ defaultFormByPokemonId: new Map() }); // roster form defaults to "Normal"
    // SNEASEL_HISUIAN_FORM peels to base "SNEASEL" + form words ["HISUIAN"], which
    // must match this pipeline's own single normalized form ("Normal") to succeed.
    expect(resolvePokebattlerPokemonId("SNEASEL_HISUIAN_FORM", ctx)).toBeNull();
  });

  it("resolves a _FORM id when the peeled form words match this pipeline's own normalized form", () => {
    const pokemonIdByName = new Map([["Sneasel", 215]]);
    const defaultFormByPokemonId = new Map([[215, "Hisuian"]]);
    const enumToPogoapiName = buildEnumToPogoapiName(pokemonIdByName, resolvePokemonEnumStub, new Set(["SNEASEL"]));
    const ctx = makeContext({
      pokemonIdByName,
      defaultFormByPokemonId,
      enumToPogoapiName,
      speciesIdByNameLower: new Map([["sneasel (hisuian)", "sneasel-hisuian"]]),
    });
    expect(resolvePokebattlerPokemonId("SNEASEL_HISUIAN_FORM", ctx)).toEqual({
      speciesId: "sneasel-hisuian",
      displayName: "Sneasel (Hisuian)",
      bucket: "normal",
    });
  });
});

describe("resolveMegaLegacyTier", () => {
  it("resolves via the matched species' own defaultRaidTierForSpecies classification", () => {
    const speciesById = new Map([["kyogre-primal", species("kyogre-primal", "Primal Kyogre", "LEGENDARY")]]);
    const defaultRaidTierForSpecies = (s: SpeciesDefinition): RaidTier => (s.rarity === "LEGENDARY" ? "Legendary Mega Raids" : "Mega Raids");
    expect(resolveMegaLegacyTier("kyogre-primal", speciesById, defaultRaidTierForSpecies)).toBe("Legendary Mega Raids");
  });

  it("returns null when speciesId isn't a currently-registered species", () => {
    const speciesById = new Map<string, SpeciesDefinition>();
    expect(resolveMegaLegacyTier("nonexistent", speciesById, () => "Mega Raids")).toBeNull();
  });
});

describe("pokebattlerDisplayNameForCrossCheck", () => {
  const enumToPogoapiName = new Map([["SNEASEL", "Sneasel"], ["CHARIZARD", "Charizard"]]);

  it("reconstructs a bare base name with no suffix", () => {
    expect(pokebattlerDisplayNameForCrossCheck("SNEASEL", enumToPogoapiName)).toBe("Sneasel");
  });

  it("reconstructs a mega name", () => {
    expect(pokebattlerDisplayNameForCrossCheck("CHARIZARD_MEGA_X", enumToPogoapiName)).toBe("Mega Charizard X");
  });

  it("reconstructs a Shadow-prefixed name", () => {
    expect(pokebattlerDisplayNameForCrossCheck("SNEASEL_SHADOW_FORM", enumToPogoapiName)).toBe("Shadow Sneasel");
  });

  it("reconstructs a ScrapedDuck-style '<Form> <Base>' name, unlike this project's own '<Base> (<Form>)' roster convention", () => {
    expect(pokebattlerDisplayNameForCrossCheck("SNEASEL_HISUIAN_FORM", enumToPogoapiName)).toBe("Hisuian Sneasel");
  });

  it("does NOT gate on this pipeline's own registered roster form (unlike resolvePokebattlerPokemonId)", () => {
    // Confirms the two functions are genuinely independent — this one succeeds
    // for a real alternate form the roster doesn't carry, where
    // resolvePokebattlerPokemonId would return null (see its own test above).
    expect(pokebattlerDisplayNameForCrossCheck("SNEASEL_HISUIAN_FORM", enumToPogoapiName)).not.toBeNull();
  });

  it("returns null for an unresolvable base enum", () => {
    expect(pokebattlerDisplayNameForCrossCheck("TOTALLY_UNKNOWN", enumToPogoapiName)).toBeNull();
  });
});
