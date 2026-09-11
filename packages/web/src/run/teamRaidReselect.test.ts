import { describe, expect, it } from "vitest";
import type { SpeciesDefinition, TeamRaidReselectContext, TeamRaidSlotInput } from "@pogo-analyzer/engine";
import type { RosterEntry } from "../import/pokeGenieMatch.js";
import { buildTeamRaidReselector, scoreRosterEntryAgainstBoss } from "./teamRaidReselect.js";

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
    entryId: "pg-entry",
    species: fakeSpecies("fakemon"),
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
    sourceLineNumber: 1,
    unmatchedMoveNames: [],
    ...overrides,
  };
}

const boss = fakeSpecies("boss", { types: ["grass"] });

describe("buildTeamRaidReselector", () => {
  it("returns undefined for an empty pool or a null boss — byte-identical to reselectAfterWipe being omitted", () => {
    expect(buildTeamRaidReselector([], boss)).toBeUndefined();
    expect(buildTeamRaidReselector([fakeRosterEntry()], null)).toBeUndefined();
  });

  it("ranks by the cheap damage-output proxy (higher attack/better type matchup first)", () => {
    const weak = fakeRosterEntry({ entryId: "weak", species: fakeSpecies("weak", { baseAttack: 50 }) });
    const strong = fakeRosterEntry({ entryId: "strong", species: fakeSpecies("strong", { baseAttack: 300 }) });
    expect(scoreRosterEntryAgainstBoss(strong, boss)).toBeGreaterThan(scoreRosterEntryAgainstBoss(weak, boss));
  });

  it("excludes exactly the entries that just fielded (matched by slotId === entryId), not the whole pool history", () => {
    const pool = Array.from({ length: 8 }, (_, i) =>
      fakeRosterEntry({ entryId: `e${i}`, species: fakeSpecies(`s${i}`, { baseAttack: 200 - i }) }),
    );
    const reselect = buildTeamRaidReselector(pool, boss)!;
    const previousSlots: TeamRaidSlotInput[] = pool.slice(0, 6).map((e) => ({ slotId: e.entryId, species: e.species }));
    const context: TeamRaidReselectContext = {
      cycleIndex: 1,
      wipeCount: 1,
      previousSlots,
      bossDamageDealt: 0,
      bossMaxHp: 1000,
      raidClockSeconds: 20,
      raidTimerSeconds: 300,
    };
    const next = reselect(context);
    // Only 2 non-excluded entries remain (e6, e7) — a team can legally field
    // fewer than 6.
    expect(next.map((s) => s.species!.id)).toEqual(["s6", "s7"]);
  });

  it("falls back to the unfiltered top ranking (not an empty array) when every pool entry was just fielded", () => {
    const pool = Array.from({ length: 3 }, (_, i) => fakeRosterEntry({ entryId: `e${i}`, species: fakeSpecies(`s${i}`) }));
    const reselect = buildTeamRaidReselector(pool, boss)!;
    const previousSlots: TeamRaidSlotInput[] = pool.map((e) => ({ slotId: e.entryId, species: e.species }));
    const context: TeamRaidReselectContext = {
      cycleIndex: 1,
      wipeCount: 1,
      previousSlots,
      bossDamageDealt: 0,
      bossMaxHp: 1000,
      raidClockSeconds: 20,
      raidTimerSeconds: 300,
    };
    const next = reselect(context);
    expect(next.length).toBeGreaterThan(0);
  });

  it("skips any second canMega entry so runTeamRaid's own at-most-one-mega validation never fires", () => {
    const pool = [
      fakeRosterEntry({ entryId: "mega-a", canMega: true, species: fakeSpecies("mega-a", { baseAttack: 300 }) }),
      fakeRosterEntry({ entryId: "mega-b", canMega: true, species: fakeSpecies("mega-b", { baseAttack: 290 }) }),
      fakeRosterEntry({ entryId: "plain", canMega: false, species: fakeSpecies("plain", { baseAttack: 280 }) }),
    ];
    const reselect = buildTeamRaidReselector(pool, boss)!;
    const context: TeamRaidReselectContext = {
      cycleIndex: 1,
      wipeCount: 1,
      previousSlots: [],
      bossDamageDealt: 0,
      bossMaxHp: 1000,
      raidClockSeconds: 20,
      raidTimerSeconds: 300,
    };
    const next = reselect(context);
    expect(next.filter((s) => s.isMega).length).toBeLessThanOrEqual(1);
    expect(next.map((s) => s.species!.id)).toEqual(["mega-a", "plain"]);
  });
});
