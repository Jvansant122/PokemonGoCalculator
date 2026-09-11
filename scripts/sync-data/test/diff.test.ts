import { describe, expect, it } from "vitest";
import { diffSpecies, diffRaids } from "../diff.ts";
// @ts-expect-error — a plain .mjs CLI with no type declarations; only its powerUpCosts handler is imported.
import { diffPowerUpCostsFile } from "../../diff-normalized.mjs";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";
import type { ActiveRaidEntry } from "../rawShapes.ts";

function species(id: string, baseAttack: number): SpeciesDefinition {
  return { id, name: id, types: ["normal"], baseAttack, baseDefense: 100, baseStamina: 100, fastMoves: [], chargedMoves: [] };
}

describe("diffSpecies", () => {
  it("reports an initial sync when there is no previous baseline", () => {
    expect(diffSpecies(null, [species("bulbasaur", 118)])).toEqual(["initial sync (no previous species.json baseline)"]);
  });

  it("reports a new species as added", () => {
    expect(diffSpecies([], [species("bulbasaur", 118)])).toEqual(["+ bulbasaur (new species)"]);
  });

  it("reports a changed species", () => {
    const prev = [species("bulbasaur", 118)];
    const next = [species("bulbasaur", 120)];
    expect(diffSpecies(prev, next)).toEqual(["~ bulbasaur changed"]);
  });

  it("reports a removed species", () => {
    expect(diffSpecies([species("bulbasaur", 118)], [])).toEqual(["- bulbasaur (removed)"]);
  });

  it("reports no diffs for an unchanged roster", () => {
    const prev = [species("bulbasaur", 118)];
    const next = [species("bulbasaur", 118)];
    expect(diffSpecies(prev, next)).toEqual([]);
  });
});

describe("diffRaids", () => {
  function raid(name: string, tier: string, speciesId: string | null = name.toLowerCase()): ActiveRaidEntry {
    return { raidName: name, tier, speciesId, isApproximate: false };
  }

  it("reports an initial sync when there is no previous baseline", () => {
    expect(diffRaids(null, [raid("Dratini", "1-Star Raids")])).toEqual(["initial sync (no previous activeRaids.json baseline)"]);
  });

  it("reports a new raid entry", () => {
    expect(diffRaids([], [raid("Dratini", "1-Star Raids")])).toEqual(["+ Dratini (new raid entry)"]);
  });

  it("reports a changed raid entry with before/after values", () => {
    const prev = [raid("Dratini", "1-Star Raids")];
    const next = [raid("Dratini", "3-Star Raids")];
    const diffs = diffRaids(prev, next);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain("~ Dratini changed");
    expect(diffs[0]).toContain("1-Star Raids");
    expect(diffs[0]).toContain("3-Star Raids");
  });

  it("reports a raid no longer active", () => {
    expect(diffRaids([raid("Dratini", "1-Star Raids")], [])).toEqual(["- Dratini (no longer an active raid)"]);
  });
});

// scripts/diff-normalized.mjs is a CLI, but its powerUpCosts handler is
// hand-maintained field-by-field, and that under-reported twice (2026-09-10):
// `luckyStardustMultiplier` was never in its scalar list, and the interpreted
// `perSpeciesOverridesByPokemonId` map — the one the engine prices every
// power-up against — was added to the data file with no branch to report it.
// These pin the reporting, and the unrecognized-key guard that makes the next
// omission loud instead of silent.
describe("diffPowerUpCostsFile (scripts/diff-normalized.mjs)", () => {
  function table(steps: { fromLevel: number; stardust: number; candy: number; xlCandy: number }[]) {
    return { maxLevel: 50, steps };
  }
  const base = {
    sourceUrl: "https://example.invalid/gm",
    maxLevel: 50,
    shadowStardustMultiplier: 1.2,
    shadowCandyMultiplier: 1.2,
    purifiedStardustMultiplier: 0.9,
    purifiedCandyMultiplier: 0.9,
    luckyStardustMultiplier: 0.5,
    steps: [{ fromLevel: 1, stardust: 200, candy: 1, xlCandy: 0 }],
    perSpeciesUpgradeOverrides: [],
    perSpeciesOverridesByPokemonId: {},
  };

  it("reports a changed luckyStardustMultiplier (was silently skipped before 2026-09-10)", () => {
    const result = diffPowerUpCostsFile(base, { ...base, luckyStardustMultiplier: 0.4 });
    expect(result.changedTop).toContain("luckyStardustMultiplier");
  });

  it("reports an added interpreted per-species table", () => {
    const next = {
      ...base,
      perSpeciesOverridesByPokemonId: { ETERNATUS: table([{ fromLevel: 1, stardust: 200, candy: 30, xlCandy: 0 }]) },
    };
    const result = diffPowerUpCostsFile(base, next);
    expect(result.interpretedAdded).toEqual(["ETERNATUS"]);
    expect(result.interpretedRemoved).toEqual([]);
  });

  it("names the levels whose costs moved when an interpreted table changes", () => {
    const prev = {
      ...base,
      perSpeciesOverridesByPokemonId: {
        ETERNATUS: table([
          { fromLevel: 1, stardust: 200, candy: 30, xlCandy: 0 },
          { fromLevel: 2, stardust: 200, candy: 30, xlCandy: 0 },
        ]),
      },
    };
    const next = {
      ...base,
      perSpeciesOverridesByPokemonId: {
        ETERNATUS: table([
          { fromLevel: 1, stardust: 200, candy: 30, xlCandy: 0 },
          { fromLevel: 2, stardust: 200, candy: 31, xlCandy: 0 },
        ]),
      },
    };
    const result = diffPowerUpCostsFile(prev, next);
    expect(result.interpretedChanged).toEqual([{ pokemonId: "ETERNATUS", levels: [2] }]);
  });

  it("flags a CHANGED top-level field it doesn't recognize rather than skipping it", () => {
    const result = diffPowerUpCostsFile(base, { ...base, someFutureField: 7 });
    expect(result.unrecognized).toEqual(["someFutureField"]);
  });

  it("stays quiet about an unrecognized field that did not change", () => {
    const prev = { ...base, someFutureField: 7 };
    const result = diffPowerUpCostsFile(prev, { ...prev });
    expect(result.unrecognized).toEqual([]);
  });
});
