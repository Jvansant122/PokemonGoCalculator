import { describe, expect, it } from "vitest";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";
import type { RosterEntry } from "../import/pokeGenieMatch.js";
import { activeRaidBossOptions, pastRaidBossOptions, speciesRegistry } from "../registry.js";
import { buildHypotheticalCatchCandidates, effectiveMoveIds, resolveBossTarget, toEngineRosterPool } from "./runRosterPlanner.js";

/** A species with a movepool wide enough to have a genuine "best by power/duration" answer, unlike fakeSpecies' single-move pools below. */
function fakeSpeciesWithMoveChoices(id: string): SpeciesDefinition {
  return {
    id,
    name: id,
    types: ["normal"],
    baseAttack: 100,
    baseDefense: 100,
    baseStamina: 100,
    fastMoves: [
      { id: "TACKLE", name: "Tackle", type: "normal", power: 5, energyGain: 5, durationSeconds: 0.5 },
      { id: "QUICK_ATTACK", name: "Quick Attack", type: "normal", power: 10, energyGain: 6, durationSeconds: 0.5 },
    ],
    chargedMoves: [
      { id: "BODY_SLAM", name: "Body Slam", type: "normal", power: 50, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 },
      { id: "HYPER_BEAM", name: "Hyper Beam", type: "normal", power: 150, energyCost: 100, durationSeconds: 3.7, vulnerableWindowSeconds: 3.7 },
    ],
  };
}

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
    fastMoveIsDefaulted: false,
    chargedMoveIsDefaulted: false,
    fastMoveUnmatchedName: null,
    chargedMoveUnmatchedName: null,
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

  it("carries knownChargedMoveIds straight through unchanged (PLAN_tm_move_change_optimizer.md) — never derived from movesetIsDefaulted/chargedMoveId", () => {
    const [known] = toEngineRosterPool([fakeImportedEntry({ knownChargedMoveIds: ["BODY_SLAM"] })]);
    expect(known!.knownChargedMoveIds).toEqual(["BODY_SLAM"]);
    const [unknown] = toEngineRosterPool([fakeImportedEntry({ knownChargedMoveIds: undefined })]);
    expect(unknown!.knownChargedMoveIds).toBeUndefined();
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

  it("leaves fastMoveId/chargedMoveId untouched when useBestAvailableMoveset is omitted or false — the toggle's OFF default", () => {
    const entry = fakeImportedEntry({
      species: fakeSpeciesWithMoveChoices("houndour"),
      fastMoveId: "TACKLE",
      chargedMoveId: "BODY_SLAM",
      fastMoveIsDefaulted: true,
      chargedMoveIsDefaulted: true,
    });
    const [withoutArg] = toEngineRosterPool([entry]);
    const [explicitFalse] = toEngineRosterPool([entry], false);
    expect(withoutArg!.fastMoveId).toBe("TACKLE");
    expect(withoutArg!.chargedMoveId).toBe("BODY_SLAM");
    expect(explicitFalse!.fastMoveId).toBe("TACKLE");
    expect(explicitFalse!.chargedMoveId).toBe("BODY_SLAM");
  });

  it("substitutes the highest power/duration move ONLY for a slot still flagged as defaulted, when the toggle is on (IDEAS.md #11)", () => {
    const entry = fakeImportedEntry({
      species: fakeSpeciesWithMoveChoices("houndour"),
      fastMoveId: "TACKLE",
      chargedMoveId: "BODY_SLAM",
      fastMoveIsDefaulted: true,
      chargedMoveIsDefaulted: true,
    });
    const [substituted] = toEngineRosterPool([entry], true);
    expect(substituted!.fastMoveId).toBe("QUICK_ATTACK");
    expect(substituted!.chargedMoveId).toBe("HYPER_BEAM");
  });

  it("never substitutes a move the user actually confirmed, even with the toggle on — a hand-fixed Roster-tab entry is immune by construction", () => {
    const entry = fakeImportedEntry({
      species: fakeSpeciesWithMoveChoices("houndour"),
      fastMoveId: "TACKLE",
      chargedMoveId: "BODY_SLAM",
      fastMoveIsDefaulted: false,
      chargedMoveIsDefaulted: false,
    });
    const [result] = toEngineRosterPool([entry], true);
    expect(result!.fastMoveId).toBe("TACKLE");
    expect(result!.chargedMoveId).toBe("BODY_SLAM");
  });

  it("substitutes only the ONE defaulted slot when just one of fast/charged is unknown", () => {
    const entry = fakeImportedEntry({
      species: fakeSpeciesWithMoveChoices("houndour"),
      fastMoveId: "TACKLE",
      chargedMoveId: "BODY_SLAM",
      fastMoveIsDefaulted: false,
      chargedMoveIsDefaulted: true,
    });
    const [result] = toEngineRosterPool([entry], true);
    expect(result!.fastMoveId).toBe("TACKLE");
    expect(result!.chargedMoveId).toBe("HYPER_BEAM");
  });
});

describe("buildHypotheticalCatchCandidates", () => {
  it("resolves a real species into a HypotheticalCatchCandidate with perfect IVs and default moves", () => {
    const real = speciesRegistry.all()[0]!;
    const [candidate] = buildHypotheticalCatchCandidates([{ speciesId: real.id, level: 20 }], speciesRegistry);
    expect(candidate).toBeDefined();
    expect(candidate!.species.id).toBe(real.id);
    expect(candidate!.level).toBe(20);
    expect(candidate!.ivs).toEqual({ attack: 15, defense: 15, stamina: 15 });
    expect(candidate!.fastMoveId).toBeNull();
    expect(candidate!.chargedMoveId).toBeNull();
    expect(candidate!.id).toContain(real.id);
  });

  it("silently drops a blank (speciesId: null) row — never throws, never fabricates a species", () => {
    expect(buildHypotheticalCatchCandidates([{ speciesId: null, level: 20 }], speciesRegistry)).toEqual([]);
  });

  it("silently drops a row whose speciesId no longer resolves in this registry — degrades a stale link instead of throwing", () => {
    expect(buildHypotheticalCatchCandidates([{ speciesId: "not-a-real-species-id", level: 25 }], speciesRegistry)).toEqual([]);
  });

  it("index-qualifies ids so two rows for the SAME species/level never collide", () => {
    const real = speciesRegistry.all()[0]!;
    const candidates = buildHypotheticalCatchCandidates(
      [
        { speciesId: real.id, level: 20 },
        { speciesId: real.id, level: 20 },
      ],
      speciesRegistry,
    );
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.id).not.toBe(candidates[1]!.id);
  });
});

describe("effectiveMoveIds", () => {
  it("is the exact function toEngineRosterPool delegates to — same result for the same inputs", () => {
    const entry = fakeImportedEntry({
      species: fakeSpeciesWithMoveChoices("houndour"),
      fastMoveId: "TACKLE",
      chargedMoveId: "BODY_SLAM",
      fastMoveIsDefaulted: true,
      chargedMoveIsDefaulted: true,
    });
    expect(effectiveMoveIds(entry, true)).toEqual({ fastMoveId: "QUICK_ATTACK", chargedMoveId: "HYPER_BEAM" });
    expect(effectiveMoveIds(entry, false)).toEqual({ fastMoveId: "TACKLE", chargedMoveId: "BODY_SLAM" });
  });
});
