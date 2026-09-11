import { describe, expect, it } from "vitest";
import { emptyTeamSlot, type TeamAssumptions } from "./TeamAssumptionPanel.js";
import { teamAssumptionsToPowerUpOptimizerAssumptions } from "./teamRaidExport.js";

function baseTeamAssumptions(overrides: Partial<TeamAssumptions> = {}): TeamAssumptions {
  return {
    slots: [
      { speciesId: "mewtwo-mega-x", fastMoveId: "COUNTER_FAST", chargedMoveId: "DYNAMIC_PUNCH_PLUS", isMega: true, megaLevel: null, isShadow: false },
      { speciesId: "machamp", fastMoveId: "COUNTER_FAST", chargedMoveId: "CLOSE_COMBAT", isMega: false, megaLevel: null, isShadow: false },
      { speciesId: "terrakion", fastMoveId: "DOUBLE_KICK_FAST", chargedMoveId: "SACRED_SWORD", isMega: false, megaLevel: null, isShadow: false },
      { speciesId: "lucario", fastMoveId: "COUNTER_FAST", chargedMoveId: "AURA_SPHERE", isMega: false, megaLevel: null, isShadow: false },
      { speciesId: "lucario", fastMoveId: "COUNTER_FAST", chargedMoveId: "AURA_SPHERE", isMega: false, megaLevel: null, isShadow: true },
      emptyTeamSlot(),
    ],
    targetId: "tyranitar-mega",
    bossFastMoveId: "SMACK_DOWN_FAST",
    bossChargedMoveId: "STONE_EDGE",
    level: 35,
    ivAttack: 15,
    ivDefense: 14,
    ivStamina: 13,
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
    friendshipLevel: "none",
    bossMaxHpOverrideEnabled: false,
    reselectAfterWipeEnabled: false,
    ...overrides,
  };
}

describe("teamAssumptionsToPowerUpOptimizerAssumptions", () => {
  it("carries every slot's species/moves/mega/Mega Level/Shadow flag through, in order", () => {
    const team = baseTeamAssumptions();
    const result = teamAssumptionsToPowerUpOptimizerAssumptions(team);
    expect(result.slots).toHaveLength(6);
    result.slots.forEach((slot, i) => {
      expect(slot.speciesId).toBe(team.slots[i]!.speciesId);
      expect(slot.fastMoveId).toBe(team.slots[i]!.fastMoveId);
      expect(slot.chargedMoveId).toBe(team.slots[i]!.chargedMoveId);
      expect(slot.isMega).toBe(team.slots[i]!.isMega);
      expect(slot.megaLevel).toBe(team.slots[i]!.megaLevel);
      expect(slot.isShadow).toBe(team.slots[i]!.isShadow);
    });
  });

  it("fans the roster's single shared level/IV spread out to every slot", () => {
    const team = baseTeamAssumptions({ level: 40, ivAttack: 15, ivDefense: 14, ivStamina: 13 });
    const result = teamAssumptionsToPowerUpOptimizerAssumptions(team);
    for (const slot of result.slots) {
      expect(slot.level).toBe(40);
      expect(slot.ivAttack).toBe(15);
      expect(slot.ivDefense).toBe(14);
      expect(slot.ivStamina).toBe(13);
    }
  });

  it("prefers a slot's own level/IV override over the shared roster spread when present (e.g. a Lineup-Builder-filled slot)", () => {
    const team = baseTeamAssumptions({ level: 40, ivAttack: 15, ivDefense: 15, ivStamina: 15 });
    team.slots[0] = { ...team.slots[0]!, level: 22, ivs: { attack: 3, defense: 4, stamina: 5 } };
    const result = teamAssumptionsToPowerUpOptimizerAssumptions(team);
    expect(result.slots[0]!.level).toBe(22);
    expect(result.slots[0]!.ivAttack).toBe(3);
    expect(result.slots[0]!.ivDefense).toBe(4);
    expect(result.slots[0]!.ivStamina).toBe(5);
    // Every OTHER slot (no override) still falls back to the shared spread.
    expect(result.slots[1]!.level).toBe(40);
    expect(result.slots[1]!.ivAttack).toBe(15);
  });

  it("leaves every resource Team Raid has no concept of at its own zero/false resting state, not an invented number", () => {
    const result = teamAssumptionsToPowerUpOptimizerAssumptions(baseTeamAssumptions());
    expect(result.stardustOnHand).toBe(0);
    expect(result.rareCandyOnHand).toBe(0);
    expect(result.rareCandyXlOnHand).toBe(0);
    for (const slot of result.slots) {
      expect(slot.candyOnHand).toBe(0);
      expect(slot.xlCandyOnHand).toBe(0);
      expect(slot.isPurified).toBe(false);
      expect(slot.isLucky).toBe(false);
    }
  });

  it("carries the boss target/moves and every shared combat assumption verbatim", () => {
    const team = baseTeamAssumptions();
    const result = teamAssumptionsToPowerUpOptimizerAssumptions(team);
    expect(result.targetId).toBe(team.targetId);
    expect(result.bossFastMoveId).toBe(team.bossFastMoveId);
    expect(result.bossChargedMoveId).toBe(team.bossChargedMoveId);
    expect(result.dodge).toEqual(team.dodge);
    expect(result.dodgeFastAttacks).toBe(team.dodgeFastAttacks);
    expect(result.holdChargedMoveUntilSafe).toBe(team.holdChargedMoveUntilSafe);
    expect(result.weather).toBe(team.weather);
    expect(result.bossChargedMoveFrequencySeconds).toBe(team.bossChargedMoveFrequencySeconds);
    expect(result.bossChargedMoveCadence).toBe(team.bossChargedMoveCadence);
    expect(result.bossStartsPrimed).toBe(team.bossStartsPrimed);
    expect(result.bossStartingEnergyFraction).toBe(team.bossStartingEnergyFraction);
    expect(result.raidTimerSeconds).toBe(team.raidTimerSeconds);
    expect(result.swapCostSeconds).toBe(team.swapCostSeconds);
    expect(result.reviveCostSeconds).toBe(team.reviveCostSeconds);
  });

  it("always forces single-raid mode and leaves every multi-raid-only field at its inert default", () => {
    const result = teamAssumptionsToPowerUpOptimizerAssumptions(baseTeamAssumptions());
    expect(result.mode).toBe("single-raid");
    expect(result.multiRaidBossIds).toEqual([]);
    expect(result.multiRaidIncludePastRaids).toBe(false);
    expect(result.multiRaidIncludedTiers).toBeNull();
    expect(result.multiRaidMaxBossCount).toBe(30);
    expect(result.candyByFamilyId).toEqual({});
    expect(result.multiRaidMegaLevel).toBeNull();
  });

  it("defaults rankBy to the destination's own normal default, not treated as a missing resource", () => {
    const result = teamAssumptionsToPowerUpOptimizerAssumptions(baseTeamAssumptions());
    expect(result.rankBy).toBe("stardust");
  });

  it("handles an empty slot (null speciesId) without throwing", () => {
    const team = baseTeamAssumptions({ slots: [emptyTeamSlot(), emptyTeamSlot(), emptyTeamSlot(), emptyTeamSlot(), emptyTeamSlot(), emptyTeamSlot()] });
    const result = teamAssumptionsToPowerUpOptimizerAssumptions(team);
    expect(result.slots.every((s) => s.speciesId === null)).toBe(true);
  });
});
