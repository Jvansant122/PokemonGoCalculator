import { describe, expect, it } from "vitest";
import type { RosterPowerUpCandidate } from "@pogo-analyzer/engine";
import type { RosterEntry as ImportedRosterEntry } from "./import/pokeGenieMatch.js";
import { dedupeInterchangeableCandidates } from "./rosterCandidateDedupe.js";

function fakeEntry(overrides: Partial<ImportedRosterEntry> = {}): ImportedRosterEntry {
  return {
    entryId: "pg-1-mewtwo",
    species: {
      id: "mewtwo",
      name: "Mewtwo",
      types: ["psychic"],
      baseAttack: 300,
      baseDefense: 182,
      baseStamina: 214,
      fastMoves: [{ id: "CONFUSION", name: "Confusion", type: "psychic", power: 20, energyGain: 15, durationSeconds: 1.6 }],
      chargedMoves: [{ id: "PSYCHIC", name: "Psychic", type: "psychic", power: 100, energyCost: 100, durationSeconds: 2.8, vulnerableWindowSeconds: 2.8 }],
    },
    fastMoveId: "CONFUSION",
    chargedMoveId: "PSYCHIC",
    level: 20,
    ivs: { attack: 12, defense: 12, stamina: 14 },
    costModifiers: { isShadow: false, isPurified: false, isLucky: false },
    canMega: false,
    ivsAreApproximate: false,
    levelIsApproximate: false,
    movesetIsDefaulted: false,
    sourceLineNumber: 1,
    unmatchedMoveNames: [],
    ...overrides,
  };
}

function fakeCandidate(overrides: Partial<RosterPowerUpCandidate> = {}): RosterPowerUpCandidate {
  return {
    entryId: "pg-1-mewtwo",
    speciesId: "mewtwo",
    speciesName: "Mewtwo",
    fromLevel: 20,
    toLevel: 25,
    cost: { stardust: 5000, candy: 3, xlCandy: 0 },
    costUnverified: false,
    affordable: true,
    sharedCandyNeeded: 0,
    sharedXlCandyNeeded: 0,
    meanDeltaTeamDps: 0.15,
    bestBossDeltaTeamDps: 0.3,
    bestBossId: "boss-a",
    significantBossCount: 1,
    perBoss: [],
    bossesNewlyFielded: [],
    deltaPer1000Stardust: 0.03,
    deltaPerCandy: 0.05,
    deltaPerXlCandy: null,
    exceedsNoise: true,
    ...overrides,
  };
}

describe("dedupeInterchangeableCandidates", () => {
  it("collapses two genuinely identical entries (same species/level/toLevel/IVs/moveset/cost modifiers) into one group", () => {
    const entryA = fakeEntry({ entryId: "pg-1-mewtwo" });
    const entryB = fakeEntry({ entryId: "pg-9-mewtwo" });
    const candidateA = fakeCandidate({ entryId: "pg-1-mewtwo", meanDeltaTeamDps: 0.161 });
    const candidateB = fakeCandidate({ entryId: "pg-9-mewtwo", meanDeltaTeamDps: 0.147 });

    const groups = dedupeInterchangeableCandidates([candidateA, candidateB], [entryA, entryB]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(2);
  });

  it("keeps two entries separate when their IVs differ — never collapses on a near-miss", () => {
    const entryA = fakeEntry({ entryId: "pg-1-mewtwo", ivs: { attack: 12, defense: 12, stamina: 14 } });
    const entryB = fakeEntry({ entryId: "pg-2-mewtwo", ivs: { attack: 15, defense: 15, stamina: 15 } });
    const candidateA = fakeCandidate({ entryId: "pg-1-mewtwo" });
    const candidateB = fakeCandidate({ entryId: "pg-2-mewtwo" });

    const groups = dedupeInterchangeableCandidates([candidateA, candidateB], [entryA, entryB]);

    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.count === 1)).toBe(true);
  });

  it("keeps two entries separate when their moveset differs", () => {
    const entryA = fakeEntry({ entryId: "pg-1-mewtwo", chargedMoveId: "PSYCHIC" });
    const entryB = fakeEntry({ entryId: "pg-2-mewtwo", chargedMoveId: "SHADOW_BALL" });
    const groups = dedupeInterchangeableCandidates(
      [fakeCandidate({ entryId: "pg-1-mewtwo" }), fakeCandidate({ entryId: "pg-2-mewtwo" })],
      [entryA, entryB],
    );
    expect(groups).toHaveLength(2);
  });

  it("keeps two entries separate when a cost modifier (shadow/purified/lucky) differs", () => {
    const entryA = fakeEntry({ entryId: "pg-1-mewtwo", costModifiers: { isShadow: false, isPurified: false, isLucky: false } });
    const entryB = fakeEntry({ entryId: "pg-2-mewtwo", costModifiers: { isShadow: false, isPurified: false, isLucky: true } });
    const groups = dedupeInterchangeableCandidates(
      [fakeCandidate({ entryId: "pg-1-mewtwo" }), fakeCandidate({ entryId: "pg-2-mewtwo" })],
      [entryA, entryB],
    );
    expect(groups).toHaveLength(2);
  });

  it("keeps two entries separate when toLevel differs — a duplicate at one power-up level is a different candidate at another", () => {
    const entryA = fakeEntry({ entryId: "pg-1-mewtwo" });
    const entryB = fakeEntry({ entryId: "pg-2-mewtwo" });
    const groups = dedupeInterchangeableCandidates(
      [fakeCandidate({ entryId: "pg-1-mewtwo", toLevel: 25 }), fakeCandidate({ entryId: "pg-2-mewtwo", toLevel: 30 })],
      [entryA, entryB],
    );
    expect(groups).toHaveLength(2);
  });

  it("picks the group member whose own meanDeltaTeamDps is closest to the group average as the representative, never a synthesized blend", () => {
    const entries = [
      fakeEntry({ entryId: "a" }),
      fakeEntry({ entryId: "b" }),
      fakeEntry({ entryId: "c" }),
    ];
    const candidates = [
      fakeCandidate({ entryId: "a", meanDeltaTeamDps: 0.1 }),
      fakeCandidate({ entryId: "b", meanDeltaTeamDps: 0.2 }),
      fakeCandidate({ entryId: "c", meanDeltaTeamDps: 0.3 }),
    ];
    const groups = dedupeInterchangeableCandidates(candidates, entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(3);
    // mean of means = 0.2, exactly candidate "b"'s own value.
    expect(groups[0]!.representative.entryId).toBe("b");
  });

  it("a candidate whose entryId isn't found in the pool at all gets its own row rather than being guessed into a group", () => {
    const entryA = fakeEntry({ entryId: "pg-1-mewtwo" });
    const groups = dedupeInterchangeableCandidates(
      [fakeCandidate({ entryId: "pg-1-mewtwo" }), fakeCandidate({ entryId: "pg-missing" })],
      [entryA],
    );
    expect(groups).toHaveLength(2);
  });

  it("preserves the input array's order (first-occurrence order) so a pre-sorted ranked table stays effectively sorted", () => {
    const entries = [fakeEntry({ entryId: "top" }), fakeEntry({ entryId: "second" })];
    const groups = dedupeInterchangeableCandidates(
      [fakeCandidate({ entryId: "top", toLevel: 25 }), fakeCandidate({ entryId: "second", toLevel: 30 })],
      entries,
    );
    expect(groups.map((g) => g.representative.entryId)).toEqual(["top", "second"]);
  });
});
