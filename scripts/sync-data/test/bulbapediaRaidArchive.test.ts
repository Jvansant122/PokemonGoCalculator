import { describe, expect, it } from "vitest";
import {
  parseBulbapediaRaidRows,
  parseBulbapediaShadowRaidPage,
  buildBaseNameIndex,
  resolveBulbapediaRow,
  KNOWN_ERA_HP_VALUES,
  type BulbapediaRaidRow,
} from "../bulbapediaRaidArchive.ts";
import type { RaidTier, SpeciesDefinition } from "@pogo-analyzer/engine";

function species(id: string, name: string): Pick<SpeciesDefinition, "id" | "name"> {
  return { id, name };
}

describe("parseBulbapediaRaidRows", () => {
  it("parses a normal-tier row under a numeric head, capturing its era HP", () => {
    const pages = {
      "2019": "{{lop/raid/GO-head|3}}\n{{lop/raid/GO|142|Aerodactyl|3600|...}}\n",
    };
    const { rows, invalidHpSamples } = parseBulbapediaRaidRows(pages);
    expect(rows).toEqual([{ bucket: "normal", name: "Aerodactyl", form: undefined, normalTier: "3-Star Raids", hp: 3600 }]);
    expect(invalidHpSamples).toEqual([]);
  });

  it("merges the pre-2020-08-26 tier-2/tier-4 head tokens into tier-1/tier-3", () => {
    const pages = {
      "2017-2018": "{{lop/raid/GO-head|2}}\n{{lop/raid/GO|1|Pidgey|600|...}}\n{{lop/raid/GO-head|4}}\n{{lop/raid/GO|1|Machamp|9000|...}}\n",
    };
    const { rows } = parseBulbapediaRaidRows(pages);
    expect(rows[0]!.normalTier).toBe("1-Star Raids");
    expect(rows[1]!.normalTier).toBe("3-Star Raids");
  });

  it("parses a mega/primal-bucket row with no normalTier", () => {
    const pages = {
      "Season_1": "{{lop/raid/GO-head|Mega|6}}\n{{lop/raid/GO|6|Charizard|15000|form=Mega Charizard X}}\n",
    };
    const { rows } = parseBulbapediaRaidRows(pages);
    expect(rows).toEqual([{ bucket: "mega", name: "Charizard", form: "Mega Charizard X", hp: 15000 }]);
  });

  it("applies the Giratina absent-form default only for Giratina, only pre-Origin-Forme rows", () => {
    const pages = {
      "2017-2018": "{{lop/raid/GO-head|5}}\n{{lop/raid/GO|487|Giratina|12500|...}}\n",
    };
    const { rows } = parseBulbapediaRaidRows(pages);
    expect(rows[0]!.form).toBe("Altered Form");
  });

  it("reports (never throws on) a positional HP value outside the known magnitude set", () => {
    const pages = {
      "2019": "{{lop/raid/GO-head|5}}\n{{lop/raid/GO|150|Mewtwo|18750|...}}\n",
    };
    const { rows, invalidHpSamples } = parseBulbapediaRaidRows(pages);
    expect(rows[0]!.hp).toBeUndefined();
    expect(invalidHpSamples).toEqual(["2019: Mewtwo: 18750"]);
  });

  it("skips rows under an unrecognized head token rather than guessing a tier", () => {
    const pages = {
      "2019": "{{lop/raid/GO-head|garbage}}\n{{lop/raid/GO|1|Pidgey|600|...}}\n",
    };
    const { rows } = parseBulbapediaRaidRows(pages);
    expect(rows).toEqual([]);
  });

  it("ignores a page missing from the input map (failed fetch) without throwing", () => {
    const { rows } = parseBulbapediaRaidRows({});
    expect(rows).toEqual([]);
  });

  it("every documented KNOWN_ERA_HP_VALUES member is a plausible raid HP magnitude", () => {
    expect([...KNOWN_ERA_HP_VALUES].sort((a, b) => a - b)).toEqual([600, 1800, 3000, 3600, 9000, 12500, 15000, 20000, 22500, 25000]);
  });
});

describe("parseBulbapediaShadowRaidPage", () => {
  it("parses every row as a bare base-species name, normalizing curly apostrophes", () => {
    const wikitext = "{{lop/raid/GO-head|Shadow}}\n{{lop/raid/GO|1|Sneasel|600|...}}\n{{lop/raid/GO|1|Farfetch’d|600|...}}\n";
    expect(parseBulbapediaShadowRaidPage(wikitext)).toEqual([{ name: "Sneasel" }, { name: "Farfetch'd" }]);
  });

  it("returns an empty array for a page with no row templates", () => {
    expect(parseBulbapediaShadowRaidPage("nothing here")).toEqual([]);
  });
});

describe("buildBaseNameIndex", () => {
  it("indexes every species by its full qualified name", () => {
    const index = buildBaseNameIndex([species("giratina-altered", "Giratina (Altered)")]);
    expect(index.byQualifiedName.get("giratina (altered)")).toBe("giratina-altered");
  });

  it("indexes a base name only when exactly one roster entry shares it", () => {
    const index = buildBaseNameIndex([species("giratina-altered", "Giratina (Altered)")]);
    expect(index.byUniqueBaseName.get("giratina")).toBe("giratina-altered");
  });

  it("omits a base name from byUniqueBaseName when 2+ roster entries share it", () => {
    const index = buildBaseNameIndex([species("urshifu-single-strike", "Urshifu (Single Strike)"), species("urshifu-rapid-strike", "Urshifu (Rapid Strike)")]);
    expect(index.byUniqueBaseName.has("urshifu")).toBe(false);
  });
});

describe("resolveBulbapediaRow", () => {
  const defaultRaidTierForSpecies = (s: SpeciesDefinition): RaidTier => (s.rarity === "LEGENDARY" ? "5-Star Raids" : "Mega Raids");

  it("resolves a mega-bucket row directly against the roster's own name field", () => {
    const megaSpecies = { ...species("charizard-mega-x", "Mega Charizard X"), rarity: "STANDARD" } as SpeciesDefinition;
    const index = buildBaseNameIndex([megaSpecies]);
    const speciesById = new Map([["charizard-mega-x", megaSpecies]]);
    const row: BulbapediaRaidRow = { bucket: "mega", name: "Charizard", form: "Mega Charizard X", hp: 15000 };
    const result = resolveBulbapediaRow(row, index, speciesById, defaultRaidTierForSpecies);
    expect(result).toEqual({ speciesId: "charizard-mega-x", raidName: "Mega Charizard X", tier: "Mega Raids", viaBaseNameFallback: false, eraHp: 15000 });
  });

  it("strips an HTML <br> tag hiding extra text in a mega row's form field", () => {
    const megaSpecies = { ...species("lopunny-mega", "Mega Lopunny"), rarity: "STANDARD" } as SpeciesDefinition;
    const index = buildBaseNameIndex([megaSpecies]);
    const speciesById = new Map([["lopunny-mega", megaSpecies]]);
    const row: BulbapediaRaidRow = { bucket: "mega", name: "Lopunny", form: "Mega Lopunny<br>(Flower Crown)" };
    const result = resolveBulbapediaRow(row, index, speciesById, defaultRaidTierForSpecies);
    expect(result?.speciesId).toBe("lopunny-mega");
  });

  it("resolves a normal-bucket row with no form field to the bare qualified name", () => {
    const base = species("pidgey", "Pidgey") as SpeciesDefinition;
    const index = buildBaseNameIndex([base]);
    const speciesById = new Map([["pidgey", base]]);
    const row: BulbapediaRaidRow = { bucket: "normal", name: "Pidgey", normalTier: "1-Star Raids", hp: 600 };
    expect(resolveBulbapediaRow(row, index, speciesById, defaultRaidTierForSpecies)).toEqual({
      speciesId: "pidgey",
      raidName: "Pidgey",
      tier: "1-Star Raids",
      viaBaseNameFallback: false,
      eraHp: 600,
    });
  });

  it("strips a Shadow prefix and resolves against the BASE roster (this general archive parser has no shadow-variant concept — that's the dedicated shadow-page path's job instead)", () => {
    const base = species("slowpoke", "Slowpoke") as SpeciesDefinition;
    const index = buildBaseNameIndex([base]);
    const speciesById = new Map([["slowpoke", base]]);
    const row: BulbapediaRaidRow = { bucket: "normal", name: "Shadow Slowpoke", normalTier: "1-Star Raids" };
    const result = resolveBulbapediaRow(row, index, speciesById, defaultRaidTierForSpecies);
    expect(result?.speciesId).toBe("slowpoke");
    expect(result?.raidName).toBe("Slowpoke");
  });

  it("falls back to the base-name roster entry for a cosmetic reskin the roster doesn't model separately", () => {
    const base = species("genesect", "Genesect") as SpeciesDefinition;
    const index = buildBaseNameIndex([base]);
    const speciesById = new Map([["genesect", base]]);
    const row: BulbapediaRaidRow = { bucket: "normal", name: "Genesect", form: "Douse Drive", normalTier: "5-Star Raids" };
    const result = resolveBulbapediaRow(row, index, speciesById, defaultRaidTierForSpecies);
    expect(result).toEqual({ speciesId: "genesect", raidName: "Genesect", tier: "5-Star Raids", viaBaseNameFallback: true, eraHp: undefined });
  });

  it("does NOT fall back for a form that looks like a real alternate form the roster doesn't carry", () => {
    const base = species("sneasel", "Sneasel") as SpeciesDefinition;
    const index = buildBaseNameIndex([base]);
    const speciesById = new Map([["sneasel", base]]);
    const row: BulbapediaRaidRow = { bucket: "normal", name: "Sneasel", form: "Hisuian Form", normalTier: "3-Star Raids" };
    expect(resolveBulbapediaRow(row, index, speciesById, defaultRaidTierForSpecies)).toBeNull();
  });

  it("returns null for a normal-bucket row with no normalTier at all", () => {
    const base = species("pidgey", "Pidgey") as SpeciesDefinition;
    const index = buildBaseNameIndex([base]);
    const speciesById = new Map([["pidgey", base]]);
    const row: BulbapediaRaidRow = { bucket: "normal", name: "Pidgey" };
    expect(resolveBulbapediaRow(row, index, speciesById, defaultRaidTierForSpecies)).toBeNull();
  });
});
