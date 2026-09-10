import { describe, expect, it } from "vitest";
import type { LineupSlot } from "@pogo-analyzer/engine";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";
import type { RosterEntry } from "./import/pokeGenieMatch.js";
import { emptyTeamSlot, type TeamAssumptions } from "./TeamAssumptionPanel.js";
import { applyLineupSlotsToTeamAssumptions, buildLineupPoolFromRoster, lineupSlotToTeamSlotAssumption } from "./lineupBuilderAction.js";

function fakeSpecies(id: string, overrides: Partial<SpeciesDefinition> = {}): SpeciesDefinition {
  return {
    id,
    name: id,
    types: ["normal"],
    baseAttack: 150,
    baseDefense: 150,
    baseStamina: 150,
    fastMoves: [{ id: "TACKLE", name: "Tackle", type: "normal", power: 5, energyGain: 5, durationSeconds: 0.5 }],
    chargedMoves: [{ id: "BODY_SLAM", name: "Body Slam", type: "normal", power: 50, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
    ...overrides,
  };
}

function fakeRosterEntry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    entryId: "pg-3-machamp",
    species: fakeSpecies("machamp"),
    fastMoveId: "TACKLE",
    chargedMoveId: "BODY_SLAM",
    level: 30,
    ivs: { attack: 14, defense: 13, stamina: 12 },
    costModifiers: { isShadow: false, isPurified: false, isLucky: false },
    canMega: false,
    ivsAreApproximate: false,
    levelIsApproximate: false,
    movesetIsDefaulted: false,
    fastMoveIsDefaulted: false,
    chargedMoveIsDefaulted: false,
    fastMoveUnmatchedName: null,
    chargedMoveUnmatchedName: null,
    sourceLineNumber: 3,
    unmatchedMoveNames: [],
    ...overrides,
  };
}

function fakeLineupSlot(overrides: Partial<LineupSlot> = {}): LineupSlot {
  return {
    entryId: "pg-3-machamp",
    speciesId: "machamp",
    speciesName: "Machamp",
    fastMoveId: "TACKLE",
    chargedMoveId: "BODY_SLAM",
    level: 30,
    ivs: { attack: 14, defense: 13, stamina: 12 },
    isMega: false,
    megaLevel: null,
    ...overrides,
  };
}

describe("buildLineupPoolFromRoster", () => {
  it("carries entryId/species/moves/level/ivs through unchanged", () => {
    const entry = fakeRosterEntry();
    const [pooled] = buildLineupPoolFromRoster([entry]);
    expect(pooled).toEqual({
      entryId: entry.entryId,
      species: entry.species,
      fastMoveId: entry.fastMoveId,
      chargedMoveId: entry.chargedMoveId,
      level: entry.level,
      ivs: entry.ivs,
      canMega: false,
    });
  });

  it("forces canMega false when the species has no boost mechanic, even if the imported row claims it does (a corrupted/hand-edited pool)", () => {
    const entry = fakeRosterEntry({ canMega: true, species: fakeSpecies("machamp") });
    const [pooled] = buildLineupPoolFromRoster([entry]);
    expect(pooled!.canMega).toBe(false);
  });

  it("respects a genuine boost-carrying species with canMega true", () => {
    const entry = fakeRosterEntry({ canMega: true, species: fakeSpecies("mewtwo-mega-x", { boost: { multiplier: 1.3, boostedType: "psychic" } }) });
    const [pooled] = buildLineupPoolFromRoster([entry]);
    expect(pooled!.canMega).toBe(true);
  });

  it("maps an empty pool to an empty array", () => {
    expect(buildLineupPoolFromRoster([])).toEqual([]);
  });
});

describe("lineupSlotToTeamSlotAssumption", () => {
  it("carries species/moves/mega/level/ivs through, and always sets isShadow false (the roster pool has no Shadow field the engine's LineupSlot can carry)", () => {
    const slot = fakeLineupSlot({ level: 42, ivs: { attack: 15, defense: 15, stamina: 15 }, isMega: true, megaLevel: "max" });
    const result = lineupSlotToTeamSlotAssumption(slot);
    expect(result).toEqual({
      speciesId: "machamp",
      fastMoveId: "TACKLE",
      chargedMoveId: "BODY_SLAM",
      isMega: true,
      megaLevel: "max",
      isShadow: false,
      level: 42,
      ivs: { attack: 15, defense: 15, stamina: 15 },
    });
  });
});

function baseTeamAssumptions(): TeamAssumptions {
  return {
    slots: [emptyTeamSlot(), emptyTeamSlot(), emptyTeamSlot(), emptyTeamSlot(), emptyTeamSlot(), emptyTeamSlot()],
    targetId: "tyranitar-mega",
    bossFastMoveId: null,
    bossChargedMoveId: null,
    level: 40,
    ivAttack: 15,
    ivDefense: 15,
    ivStamina: 15,
    dodge: { kind: "perfect" },
    dodgeFastAttacks: false,
    holdChargedMoveUntilSafe: false,
    weather: "none",
    bossChargedMoveFrequencySeconds: 15,
    bossChargedMoveCadence: "fixed-interval",
    bossStartsPrimed: false,
    bossStartingEnergyFraction: 0.5,
    raidTimerSeconds: 300,
    swapCostSeconds: 0.5,
    reviveCostSeconds: 15,
    showDetailedAssumptions: false,
  };
}

describe("applyLineupSlotsToTeamAssumptions", () => {
  it("fills each built slot with its OWN level, never the roster-wide shared level (the whole point of this feature)", () => {
    const current = baseTeamAssumptions();
    const winnerSlots: LineupSlot[] = [
      fakeLineupSlot({ entryId: "a", speciesId: "machamp", speciesName: "Machamp", level: 25 }),
      fakeLineupSlot({ entryId: "b", speciesId: "terrakion", speciesName: "Terrakion", level: 40 }),
    ];
    const next = applyLineupSlotsToTeamAssumptions(current, winnerSlots);
    expect(next.slots[0]!.speciesId).toBe("machamp");
    expect(next.slots[0]!.level).toBe(25);
    expect(next.slots[1]!.speciesId).toBe("terrakion");
    expect(next.slots[1]!.level).toBe(40);
    // Unrelated to the built lineup — never collapsed onto either slot's level.
    expect(current.level).toBe(40);
  });

  it("pads a short lineup out to MAX_TEAM_RAID_SLOTS with empty slots, never leaving the array shorter", () => {
    const current = baseTeamAssumptions();
    const next = applyLineupSlotsToTeamAssumptions(current, [fakeLineupSlot()]);
    expect(next.slots).toHaveLength(6);
    expect(next.slots[0]!.speciesId).toBe("machamp");
    for (let i = 1; i < 6; i++) {
      expect(next.slots[i]).toEqual(emptyTeamSlot());
    }
  });

  it("leaves every other assumption (dodge, weather, boss target, etc.) untouched", () => {
    const current = baseTeamAssumptions();
    const next = applyLineupSlotsToTeamAssumptions(current, [fakeLineupSlot()]);
    expect(next.targetId).toBe(current.targetId);
    expect(next.dodge).toEqual(current.dodge);
    expect(next.weather).toBe(current.weather);
    expect(next.raidTimerSeconds).toBe(current.raidTimerSeconds);
  });
});
