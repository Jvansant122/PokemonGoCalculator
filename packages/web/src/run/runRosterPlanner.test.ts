import { describe, expect, it } from "vitest";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";
import type { RosterEntry } from "../import/pokeGenieMatch.js";
import { activeRaidBossOptions, pastRaidBossOptions, speciesRegistry } from "../registry.js";
import { resolveBossTarget, toEngineRosterPool } from "./runRosterPlanner.js";

function fakeSpecies(id: string, boost?: SpeciesDefinition["boost"]): SpeciesDefinition {
  return {
    id,
    name: id,
    types: ["normal"],
    baseAttack: 100,
    baseDefense: 100,
    baseStamina: 100,
    fastMoves: [{ id: "TACKLE", name: "Tackle", type: "normal", power: 5, energyGain: 5, durationSeconds: 0.5 }],
    chargedMoves: [{ id: "BODY_SLAM", name: "Body Slam", type: "normal", power: 50, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
    boost,
  };
}

function fakeImportedEntry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    entryId: "pg-2-houndour",
    species: fakeSpecies("houndour"),
    fastMoveId: "TACKLE",
    chargedMoveId: "BODY_SLAM",
    level: 11,
    ivs: { attack: 13, defense: 13, stamina: 11 },
    costModifiers: { isShadow: false, isPurified: false, isLucky: false },
    canMega: false,
    ivsAreApproximate: false,
    levelIsApproximate: false,
    movesetIsDefaulted: false,
    sourceLineNumber: 2,
    unmatchedMoveNames: [],
    ...overrides,
  };
}

describe("resolveBossTarget", () => {
  it("resolves a currently-active raid boss with today's real tier and no HP override", () => {
    const active = activeRaidBossOptions()[0];
    if (!active) return; // no active raids in this data snapshot — nothing to assert
    const target = resolveBossTarget(active.id, speciesRegistry);
    expect(target).not.toBeNull();
    expect(target!.species.id).toBe(active.id);
    expect(target!.bossMaxHpOverride).toBeUndefined();
  });

  it("resolves a past/inactive raid boss with ITS OWN recorded tier and eraHp when present", () => {
    const past = pastRaidBossOptions()[0];
    if (!past) return; // no past raids recorded in this data snapshot
    const target = resolveBossTarget(past.id, speciesRegistry);
    expect(target).not.toBeNull();
    expect(target!.species.id).toBe(past.id);
    expect(target!.tier).toBe(past.tier);
  });

  it("falls back to defaultRaidTierForSpecies for a species that is neither an active nor a past raid boss", () => {
    const activeIds = new Set(activeRaidBossOptions().map((b) => b.id));
    const pastIds = new Set(pastRaidBossOptions().map((r) => r.id));
    const neither = speciesRegistry.all().find((s) => !activeIds.has(s.id) && !pastIds.has(s.id));
    if (!neither) return; // every registered species is a recorded boss in this data snapshot
    const target = resolveBossTarget(neither.id, speciesRegistry);
    expect(target).not.toBeNull();
    expect(target!.species.id).toBe(neither.id);
    expect(target!.bossMaxHpOverride).toBeUndefined();
  });

  it("returns null for an id this registry doesn't have at all — degrades, never throws", () => {
    expect(resolveBossTarget("not-a-real-species-id", speciesRegistry)).toBeNull();
  });
});

describe("toEngineRosterPool", () => {
  it("carries every field straight through, leaving candyFamilyId unset (falls back to species.candyFamilyId)", () => {
    const [entry] = toEngineRosterPool([fakeImportedEntry()]);
    expect(entry!.entryId).toBe("pg-2-houndour");
    expect(entry!.species.id).toBe("houndour");
    expect(entry!.level).toBe(11);
    expect(entry!.candyFamilyId).toBeUndefined();
  });

  it("defensively clears canMega when the species has no boost mechanic, even if the imported flag says true", () => {
    const corrupt = fakeImportedEntry({ canMega: true, species: fakeSpecies("no-boost-species") });
    const [entry] = toEngineRosterPool([corrupt]);
    expect(entry!.canMega).toBe(false);
  });

  it("keeps canMega true when the species genuinely has a boost mechanic", () => {
    const real = fakeImportedEntry({
      canMega: true,
      species: fakeSpecies("tyranitar-mega", { multiplier: 1.3, boostedType: "dark" }),
    });
    const [entry] = toEngineRosterPool([real]);
    expect(entry!.canMega).toBe(true);
  });

  it("resolves a mega/primal entry's candyFamilyId from its BASE species — Phase 3b, PLAN §5's 'if it's cheap' item", () => {
    const real = fakeImportedEntry({
      canMega: true,
      species: fakeSpecies("tyranitar-mega", { multiplier: 1.3, boostedType: "dark" }),
    });
    const [entry] = toEngineRosterPool([real]);
    const baseCandyFamilyId = speciesRegistry.get("tyranitar").candyFamilyId;
    expect(baseCandyFamilyId).toBeTruthy();
    expect(entry!.candyFamilyId).toBe(baseCandyFamilyId);
  });

  it("does NOT resolve a candyFamilyId for a non-mega entry — leaves it unset so the engine falls back to species.candyFamilyId itself", () => {
    const [entry] = toEngineRosterPool([fakeImportedEntry()]);
    expect(entry!.candyFamilyId).toBeUndefined();
  });
});
