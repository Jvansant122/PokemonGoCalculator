import { describe, expect, it } from "vitest";
import type { PowerUpBudgetFinalLevel } from "@pogo-analyzer/engine";
import { emptyPowerUpSlot, type PowerUpOptimizerAssumptions, type PowerUpSlotAssumption } from "./PowerUpOptimizerAssumptionPanel.js";
import { powerUpOptimizerAssumptionsToTeamAssumptions } from "./powerUpOptimizerExport.js";

function slot(overrides: Partial<PowerUpSlotAssumption> = {}): PowerUpSlotAssumption {
  return { ...emptyPowerUpSlot(), ...overrides };
}

function baseAssumptions(overrides: Partial<PowerUpOptimizerAssumptions> = {}): PowerUpOptimizerAssumptions {
  return {
    mode: "single-raid",
    slots: [
      slot({ speciesId: "lucario-mega", fastMoveId: "COUNTER_FAST", chargedMoveId: "CLOSE_COMBAT", isMega: true, level: 35, ivAttack: 15, ivDefense: 15, ivStamina: 15 }),
      slot({ speciesId: "machamp", fastMoveId: "COUNTER_FAST", chargedMoveId: "CLOSE_COMBAT", level: 25, ivAttack: 10, ivDefense: 10, ivStamina: 10 }),
      slot(),
      slot(),
      slot(),
      slot(),
    ],
    stardustOnHand: 200000,
    rareCandyOnHand: 20,
    rareCandyXlOnHand: 10,
    targetId: "tyranitar-mega",
    bossFastMoveId: "SMACK_DOWN_FAST",
    bossChargedMoveId: "STONE_EDGE",
    dodge: { kind: "perfect" },
    dodgeFastAttacks: false,
    holdChargedMoveUntilSafe: false,
    weather: "none",
    bossChargedMoveFrequencySeconds: 15,
    bossChargedMoveCadence: "fixed-interval",
    bossStartsPrimed: false,
    bossStartingEnergyFraction: 0.5,
    raidTimerSeconds: 300,
    swapCostSeconds: 0,
    reviveCostSeconds: 15,
    rankBy: "stardust",
    multiRaidBossIds: [],
    multiRaidIncludePastRaids: false,
    multiRaidIncludedTiers: null,
    multiRaidMaxBossCount: 30,
    candyByFamilyId: {},
    multiRaidMegaLevel: null,
    multiRaidSignificanceMode: "aggregate-only",
    ...overrides,
  };
}

describe("powerUpOptimizerAssumptionsToTeamAssumptions", () => {
  it("carries every slot's species/moves/mega/Mega Level/Shadow flag through, in order", () => {
    const a = baseAssumptions();
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, null);
    expect(result.slots).toHaveLength(6);
    result.slots.forEach((s, i) => {
      expect(s.speciesId).toBe(a.slots[i]!.speciesId);
      expect(s.fastMoveId).toBe(a.slots[i]!.fastMoveId);
      expect(s.chargedMoveId).toBe(a.slots[i]!.chargedMoveId);
      expect(s.isMega).toBe(a.slots[i]!.isMega);
      expect(s.megaLevel).toBe(a.slots[i]!.megaLevel);
      expect(s.isShadow).toBe(a.slots[i]!.isShadow);
    });
  });

  it("carries each slot's OWN current level/IVs through as its per-slot override when no plan exists", () => {
    const a = baseAssumptions();
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, null);
    expect(result.slots[0]!.level).toBe(35);
    expect(result.slots[0]!.ivs).toEqual({ attack: 15, defense: 15, stamina: 15 });
    expect(result.slots[1]!.level).toBe(25);
    expect(result.slots[1]!.ivs).toEqual({ attack: 10, defense: 10, stamina: 10 });
  });

  it("carries N differing per-slot levels through DISTINCTLY, not collapsed to a shared mean (regression: this is what the ~40% clear-time divergence bug collapsed)", () => {
    const a = baseAssumptions({
      slots: [
        slot({ speciesId: "machamp", level: 21 }),
        slot({ speciesId: "terrakion", level: 30 }),
        slot({ speciesId: "excadrill", level: 45 }),
        slot(),
        slot(),
        slot(),
      ],
    });
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, null);
    expect(result.slots[0]!.level).toBe(21);
    expect(result.slots[1]!.level).toBe(30);
    expect(result.slots[2]!.level).toBe(45);
    // The shared roster-wide field is NOT a mean of these — see below.
    expect(result.level).not.toBe(32); // mean(21, 30, 45) would be 32
  });

  it("prefers a committed plan's POST-PLAN toLevel over the slot's current level for a touched slot", () => {
    const a = baseAssumptions();
    const finalLevels: PowerUpBudgetFinalLevel[] = [
      { slotIndex: 0, speciesId: "lucario-mega", speciesName: "Mega Lucario", fromLevel: 35, toLevel: 40 },
      { slotIndex: 1, speciesId: "machamp", speciesName: "Machamp", fromLevel: 25, toLevel: 25 },
      { slotIndex: 2, speciesId: null, speciesName: null, fromLevel: null, toLevel: null },
      { slotIndex: 3, speciesId: null, speciesName: null, fromLevel: null, toLevel: null },
      { slotIndex: 4, speciesId: null, speciesName: null, fromLevel: null, toLevel: null },
      { slotIndex: 5, speciesId: null, speciesName: null, fromLevel: null, toLevel: null },
    ];
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, finalLevels);
    expect(result.slots[0]!.level).toBe(40);
    expect(result.slots[1]!.level).toBe(25);
  });

  it("falls back to a slot's own current level when the plan's finalLevels entry for it is missing/unfielded", () => {
    const a = baseAssumptions();
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, []);
    expect(result.slots[0]!.level).toBe(35);
    expect(result.slots[1]!.level).toBe(25);
  });

  it("rounds a slot's level to the nearest half-level and its IVs to the nearest whole number", () => {
    const a = baseAssumptions({
      slots: [slot({ speciesId: "machamp", level: 21.3, ivAttack: 12.6, ivDefense: 12.4, ivStamina: 12.5 }), slot(), slot(), slot(), slot(), slot()],
    });
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, null);
    expect(result.slots[0]!.level).toBe(21.5);
    expect(result.slots[0]!.ivs).toEqual({ attack: 13, defense: 12, stamina: 13 });
  });

  it("leaves the roster-wide shared level/IVs at Team Raid's own plain resting default (20/15/15/15), not a computed mean", () => {
    const a = baseAssumptions();
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, null);
    expect(result.level).toBe(20);
    expect(result.ivAttack).toBe(15);
    expect(result.ivDefense).toBe(15);
    expect(result.ivStamina).toBe(15);
  });

  it("carries the boss target/moves and every shared combat assumption verbatim, and forces showDetailedAssumptions true", () => {
    const a = baseAssumptions();
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, null);
    expect(result.targetId).toBe(a.targetId);
    expect(result.bossFastMoveId).toBe(a.bossFastMoveId);
    expect(result.bossChargedMoveId).toBe(a.bossChargedMoveId);
    expect(result.dodge).toEqual(a.dodge);
    expect(result.dodgeFastAttacks).toBe(a.dodgeFastAttacks);
    expect(result.holdChargedMoveUntilSafe).toBe(a.holdChargedMoveUntilSafe);
    expect(result.weather).toBe(a.weather);
    expect(result.bossChargedMoveFrequencySeconds).toBe(a.bossChargedMoveFrequencySeconds);
    expect(result.bossChargedMoveCadence).toBe(a.bossChargedMoveCadence);
    expect(result.bossStartsPrimed).toBe(a.bossStartsPrimed);
    expect(result.bossStartingEnergyFraction).toBe(a.bossStartingEnergyFraction);
    expect(result.raidTimerSeconds).toBe(a.raidTimerSeconds);
    expect(result.swapCostSeconds).toBe(a.swapCostSeconds);
    expect(result.reviveCostSeconds).toBe(a.reviveCostSeconds);
    expect(result.showDetailedAssumptions).toBe(true);
  });

  it("handles an empty slot (null speciesId) without throwing", () => {
    const a = baseAssumptions({ slots: [slot(), slot(), slot(), slot(), slot(), slot()] });
    expect(() => powerUpOptimizerAssumptionsToTeamAssumptions(a, null)).not.toThrow();
  });
});
