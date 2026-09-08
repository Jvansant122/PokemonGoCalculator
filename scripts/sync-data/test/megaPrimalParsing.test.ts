import { describe, expect, it } from "vitest";
import {
  megaSpeciesIdFor,
  parseMegaOrPrimalRaidName,
  tempEvoIdFor,
  resolveMegaSpeciesIdCollision,
  spriteLookupIdFor,
} from "../megaPrimalParsing.ts";

describe("megaSpeciesIdFor", () => {
  it("builds a hyphenated suffix id from the mega name minus the base name", () => {
    expect(megaSpeciesIdFor("Charizard", "Mega Charizard X")).toBe("charizard-mega-x");
    expect(megaSpeciesIdFor("Charizard", "Mega Charizard Y")).toBe("charizard-mega-y");
  });

  it("handles a single (non-X/Y) mega", () => {
    expect(megaSpeciesIdFor("Skarmory", "Mega Skarmory")).toBe("skarmory-mega");
  });

  it("handles Primal forms", () => {
    expect(megaSpeciesIdFor("Kyogre", "Primal Kyogre")).toBe("kyogre-primal");
  });
});

describe("parseMegaOrPrimalRaidName", () => {
  it("parses a plain Mega name", () => {
    expect(parseMegaOrPrimalRaidName("Mega Gyarados")).toEqual({ prefix: "Mega", baseName: "Gyarados", suffix: undefined });
  });

  it("parses a Mega X/Y name", () => {
    expect(parseMegaOrPrimalRaidName("Mega Charizard X")).toEqual({ prefix: "Mega", baseName: "Charizard", suffix: "X" });
    expect(parseMegaOrPrimalRaidName("Mega Charizard Y")).toEqual({ prefix: "Mega", baseName: "Charizard", suffix: "Y" });
  });

  it("parses a Primal name", () => {
    expect(parseMegaOrPrimalRaidName("Primal Kyogre")).toEqual({ prefix: "Primal", baseName: "Kyogre", suffix: undefined });
  });

  it("returns null for a name with no Mega/Primal prefix", () => {
    expect(parseMegaOrPrimalRaidName("Gyarados")).toBeNull();
  });

  it("does not mistake a base name that happens to end in a single letter word for an X/Y suffix pair", () => {
    // Regression guard: only a trailing standalone " X"/" Y" token should be treated as a suffix.
    expect(parseMegaOrPrimalRaidName("Mega Latios")).toEqual({ prefix: "Mega", baseName: "Latios", suffix: undefined });
  });
});

describe("tempEvoIdFor", () => {
  it("returns the Primal id regardless of suffix", () => {
    expect(tempEvoIdFor("Primal")).toBe("TEMP_EVOLUTION_PRIMAL");
    expect(tempEvoIdFor("Primal", "X")).toBe("TEMP_EVOLUTION_PRIMAL");
  });

  it("returns the bare Mega id with no suffix", () => {
    expect(tempEvoIdFor("Mega")).toBe("TEMP_EVOLUTION_MEGA");
  });

  it("returns the suffixed Mega id for X/Y", () => {
    expect(tempEvoIdFor("Mega", "X")).toBe("TEMP_EVOLUTION_MEGA_X");
    expect(tempEvoIdFor("Mega", "Y")).toBe("TEMP_EVOLUTION_MEGA_Y");
  });
});

describe("resolveMegaSpeciesIdCollision", () => {
  it("returns the natural id unchanged when there is no collision", () => {
    const reserved = new Set(["charizard", "charizard-mega-x"]);
    expect(resolveMegaSpeciesIdCollision("charizard-mega-y", reserved)).toEqual({
      finalId: "charizard-mega-y",
      collided: false,
    });
  });

  it("appends -attacker on collision with an already-reserved id", () => {
    const reserved = new Set(["kyogre-primal"]);
    expect(resolveMegaSpeciesIdCollision("kyogre-primal", reserved)).toEqual({
      finalId: "kyogre-primal-attacker",
      collided: true,
    });
  });
});

describe("spriteLookupIdFor", () => {
  it("returns the id unchanged when it was never renamed", () => {
    const collisionRenames = new Map([["kyogre-primal-attacker", "kyogre-primal"]]);
    expect(spriteLookupIdFor("charizard-mega-x", collisionRenames)).toBe("charizard-mega-x");
  });

  it("returns the NATURAL pre-collision id for a renamed entry, never the renamed one", () => {
    // This is the exact bug CLAUDE.md's "Species images" note warns about:
    // PokeAPI has never heard of "kyogre-primal-attacker", only "kyogre-primal".
    const collisionRenames = new Map([["kyogre-primal-attacker", "kyogre-primal"]]);
    expect(spriteLookupIdFor("kyogre-primal-attacker", collisionRenames)).toBe("kyogre-primal");
  });
});
