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

  it("with no plan (null finalLevels), reduces the shared level/IVs to the mean of fielded slots' CURRENT values", () => {
    const a = baseAssumptions();
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, null);
    // (35 + 25) / 2 = 30, already a legal half-level.
    expect(result.level).toBe(30);
    expect(result.ivAttack).toBe(13); // mean(15, 10) = 12.5 -> rounds to 13
    expect(result.ivDefense).toBe(13);
    expect(result.ivStamina).toBe(13);
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
    // (40 + 25) / 2 = 32.5, already a legal half-level.
    expect(result.level).toBe(32.5);
  });

  it("falls back to a slot's own current level when the plan's finalLevels entry for it is missing/unfielded", () => {
    const a = baseAssumptions();
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, []);
    expect(result.level).toBe(30);
  });

  it("rounds an uneven mean level to the nearest half-level", () => {
    const a = baseAssumptions({
      slots: [
        slot({ speciesId: "machamp", level: 21 }),
        slot({ speciesId: "terrakion", level: 22 }),
        slot({ speciesId: "excadrill", level: 22 }),
        slot(),
        slot(),
        slot(),
      ],
    });
    // mean(21, 22, 22) = 21.666... -> nearest half-level is 21.5.
    const result = powerUpOptimizerAssumptionsToTeamAssumptions(a, null);
    expect(result.level).toBe(21.5);
  });

  it("falls back to 20/15/15/15 for a fully empty roster", () => {
    const a = baseAssumptions({ slots: [slot(), slot(), slot(), slot(), slot(), slot()] });
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
