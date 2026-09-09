import { describe, expect, it } from "vitest";
import {
  KNOWN_PREFIXES,
  findByExactName,
  resolveCompoundRegionalNameAfterShadowPrefix,
  matchRaidName,
  type RaidNameMatchPools,
} from "../raidNameMatching.ts";

// Minimal roster standing in for real registered species — "Sandslash"
// (base, Ground) and "Sandslash (Alola)" (extra form, Ice/Steel) plus a
// couple of unrelated species/mega entries, mirroring the real 2026-09-09
// "Shadow Alolan Sandslash" bug (see this module's own doc comment).
const speciesLookupPool = [
  { id: "sandslash", name: "Sandslash" },
  { id: "sandslash-alola", name: "Sandslash (Alola)" },
  { id: "bagon", name: "Bagon" },
  { id: "lilligant-hisuian", name: "Lilligant (Hisuian)" },
];
const megaSpeciesLookupPool = [{ id: "gyarados-mega", name: "Mega Gyarados" }];

// Same key convention sync-data.ts's own regionalFormSpeciesByPrefixAndBase
// uses: `${raid-prefix}|${base pokemon_name lowercased}` -> extra-form id.
const regionalFormSpeciesByPrefixAndBase = new Map<string, string>([
  ["alolan|sandslash", "sandslash-alola"],
  ["hisuian|lilligant", "lilligant-hisuian"],
]);

const pools: RaidNameMatchPools = { megaSpeciesLookupPool, speciesLookupPool, regionalFormSpeciesByPrefixAndBase };

describe("resolveCompoundRegionalNameAfterShadowPrefix", () => {
  it("resolves a regional-form name to its real (non-Shadow) species id", () => {
    expect(
      resolveCompoundRegionalNameAfterShadowPrefix("Alolan Sandslash", regionalFormSpeciesByPrefixAndBase),
    ).toBe("sandslash-alola");
  });

  it("returns null for a name with no other recognized prefix (the plain-Shadow case falls through here)", () => {
    expect(resolveCompoundRegionalNameAfterShadowPrefix("Bagon", regionalFormSpeciesByPrefixAndBase)).toBeNull();
  });

  it("never matches on a double-Shadow compound", () => {
    expect(
      resolveCompoundRegionalNameAfterShadowPrefix("Shadow Sandslash", regionalFormSpeciesByPrefixAndBase),
    ).toBeNull();
  });
});

describe("matchRaidName", () => {
  it("resolves the compound 'Shadow ' + regional-adjective case to the regional form's own Shadow variant (the 2026-09-09 bug)", () => {
    const shadowSpeciesByBaseId = new Map<string, { id: string }>();
    const resolveShadowVariant = (baseSpeciesId: string) => {
      const existing = shadowSpeciesByBaseId.get(baseSpeciesId);
      if (existing) return existing.id;
      const created = { id: `${baseSpeciesId}-shadow` };
      shadowSpeciesByBaseId.set(baseSpeciesId, created);
      return created.id;
    };

    const result = matchRaidName("Shadow Alolan Sandslash", pools, resolveShadowVariant);

    expect(result).toEqual({ speciesId: "sandslash-alola-shadow", isApproximate: false });
    // Resolved against the Alolan form's own base id, never plain "sandslash".
    expect(shadowSpeciesByBaseId.has("sandslash-alola")).toBe(true);
    expect(shadowSpeciesByBaseId.has("sandslash")).toBe(false);
  });

  it("still resolves a plain 'Shadow X' (no regional adjective) exactly as before", () => {
    const resolveShadowVariant = (baseSpeciesId: string) => `${baseSpeciesId}-shadow`;
    const result = matchRaidName("Shadow Bagon", pools, resolveShadowVariant);
    expect(result).toEqual({ speciesId: "bagon-shadow", isApproximate: false });
  });

  it("still resolves a plain 'Hisuian X' (regional, non-Shadow) exactly as before", () => {
    const resolveShadowVariant = () => null; // never consulted for a non-Shadow prefix
    const result = matchRaidName("Hisuian Lilligant", pools, resolveShadowVariant);
    expect(result).toEqual({ speciesId: "lilligant-hisuian", isApproximate: false });
  });

  it("falls back to the approximate base-species stand-in when no Shadow variant can be resolved or created (e.g. history migration, which never synthesizes)", () => {
    const neverResolves = () => null;
    const result = matchRaidName("Shadow Alolan Sandslash", pools, neverResolves);
    // No existing shadow variant, and migration-style callers never create
    // one — falls through past the compound branch to the generic
    // exact-name match, which "Alolan Sandslash" (not "Sandslash (Alola)")
    // doesn't satisfy either, so this resolves to nothing rather than
    // silently standing in the wrong species.
    expect(result).toEqual({ speciesId: null, isApproximate: true });
  });

  it("resolves an exact mega/primal name before ever consulting the prefix cascade", () => {
    const result = matchRaidName("Mega Gyarados", pools, () => null);
    expect(result).toEqual({ speciesId: "gyarados-mega", isApproximate: false });
  });

  it("resolves an unmatched name to null/approximate", () => {
    const result = matchRaidName("Totally Unknown Pokemon", pools, () => null);
    expect(result).toEqual({ speciesId: null, isApproximate: true });
  });
});

describe("findByExactName", () => {
  it("matches case-insensitively", () => {
    expect(findByExactName("bagon", speciesLookupPool)).toBe("bagon");
    expect(findByExactName("BAGON", speciesLookupPool)).toBe("bagon");
  });

  it("returns null when nothing matches", () => {
    expect(findByExactName("Nonexistent", speciesLookupPool)).toBeNull();
  });
});

describe("KNOWN_PREFIXES", () => {
  it("includes Shadow and every regional adjective the registry above uses", () => {
    expect(KNOWN_PREFIXES).toContain("Shadow ");
    expect(KNOWN_PREFIXES).toContain("Alolan ");
    expect(KNOWN_PREFIXES).toContain("Hisuian ");
  });
});
