import { describe, expect, it } from "vitest";
import { diffSpecies, diffRaids } from "../diff.ts";
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
