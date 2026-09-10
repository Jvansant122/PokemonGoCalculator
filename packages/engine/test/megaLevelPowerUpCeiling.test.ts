import { describe, expect, it } from "vitest";
import { CPM_TABLE, MAX_POKEMON_POWER_UP_LEVEL } from "../src/cpm.js";
import { effectiveLevelForMegaLevel } from "../src/megaLevel.js";
import {
  optimizePowerUps,
  planPowerUpBudget,
  powerUpCostTableFromGameMaster,
  powerUpLevelsAbove,
  usefulPowerUpLevelsAbove,
  type PowerUpCostTable,
  type PowerUpOptimizerInputs,
  type PowerUpSlotInput,
} from "../src/powerUp.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";
import { NO_MODIFIERS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, RAW_POKEMON_UPGRADE_SETTINGS } from "./fixtures/powerUpCosts.js";

/**
 * THE single highest-risk regression this whole feature introduces (per the
 * feature's own design brief): extending cpm.ts's CPM_TABLE past level 50 (to
 * 52, for Super Max Mega Level's effective-level CP bonus — see megaLevel.ts)
 * must NOT make 50.5/51/51.5/52 reachable as an actual POWER-UP target
 * anywhere the Power-Up Optimizer or Roster Planner price a candidate. A
 * Pokémon's own power-up level is capped at 50 in the real game
 * (MAX_POKEMON_POWER_UP_LEVEL) — no source in this codebase relaxes that.
 *
 * Confirmed by direct code reading before writing this file:
 * `powerUp.ts`/`rosterPlanner.ts` never reference CPM_TABLE or
 * MAX_POKEMON_POWER_UP_LEVEL at all — their own candidate ladder is entirely
 * derived from `PowerUpCostTable.maxLevel` (via `powerUpLevelsAbove`/
 * `usefulPowerUpLevelsAbove`, both exercised directly below), which comes
 * from the real GAME_MASTER `maxNormalUpgradeLevel` field, completely
 * independent of cpm.ts's own key range. `rosterPlanner.ts` has no
 * independent level-ladder logic of its own beyond calling
 * `usefulPowerUpLevelsAbove` directly (grepped: 2 call sites, both routed
 * through this exact function) — so exercising these shared primitives here
 * transitively covers its risk surface too, without needing a second,
 * heavier rosterPlanner-specific fixture.
 *
 * This file exists to make that structural safety an ENFORCED regression,
 * not just a one-time code-reading finding — if a future change ever made
 * either module derive its ladder from CPM_TABLE's keys instead, the tests
 * below would start failing the moment CPM_TABLE grows again.
 */

describe("the power-up ceiling stays 50 even though CPM_TABLE now has effective-level-only entries past it", () => {
  it("sanity: CPM_TABLE really does extend past 50 (otherwise these tests would pass trivially, proving nothing)", () => {
    expect(Math.max(...Object.keys(CPM_TABLE).map(Number))).toBe(52);
    expect(MAX_POKEMON_POWER_UP_LEVEL).toBe(50);
  });

  it("powerUpCostTableFromGameMaster's own maxLevel — derived independently from real GAME_MASTER data — still agrees with MAX_POKEMON_POWER_UP_LEVEL", () => {
    const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
    expect(table.maxLevel).toBe(MAX_POKEMON_POWER_UP_LEVEL);
  });

  it("powerUpLevelsAbove never returns a level above the table's maxLevel, from any starting point", () => {
    const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
    for (const fromLevel of [1, 25, 40, 49, 49.5]) {
      const levels = powerUpLevelsAbove(table, fromLevel);
      expect(levels.length).toBeGreaterThan(0);
      expect(Math.max(...levels)).toBeLessThanOrEqual(50);
    }
    // Exactly at the ceiling, there is nothing left above it.
    expect(powerUpLevelsAbove(table, 50)).toEqual([]);
  });

  const table: PowerUpCostTable = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
  const fastMove: FastMove = { id: "ceiling-fast", name: "Ceiling Fast", type: "normal", power: 8, energyGain: 8, durationSeconds: 1 };
  const chargedMove: ChargedMove = {
    id: "ceiling-charged",
    name: "Ceiling Charged",
    type: "normal",
    power: 60,
    energyCost: 50,
    durationSeconds: 2,
    vulnerableWindowSeconds: 2,
  };
  const species: SpeciesDefinition = {
    id: "ceiling-test-species",
    name: "Ceiling Test Species",
    types: ["normal"],
    baseAttack: 200,
    baseDefense: 150,
    baseStamina: 180,
    fastMoves: [fastMove],
    chargedMoves: [chargedMove],
  };
  const bossFastMove: FastMove = { id: "ceiling-boss-fast", name: "Ceiling Boss Fast", type: "normal", power: 10, energyGain: 0, durationSeconds: 1.5 };
  const boss: SpeciesDefinition = {
    id: "ceiling-boss",
    name: "Ceiling Boss",
    types: ["normal"],
    baseAttack: 150,
    baseDefense: 150,
    baseStamina: 5000,
    fastMoves: [bossFastMove],
    chargedMoves: [],
    statsArePrecomputed: true,
  };

  it("usefulPowerUpLevelsAbove never returns a level above maxLevel, even starting from a level very close to the ceiling", () => {
    const levels = usefulPowerUpLevelsAbove({
      table,
      fromLevel: 48,
      species,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      fastMove,
      chargedMove,
      outgoingFastMoveDamageModifiers: { stab: true },
      outgoingChargedMoveDamageModifiers: { stab: true },
      bossFastMove,
      bossChargedMove: undefined,
      bossAttackStat: 150,
      bossDefenseStat: 150,
      incomingFastMoveDamageModifiers: { stab: false },
    });
    expect(levels.length).toBeGreaterThan(0);
    expect(Math.max(...levels)).toBeLessThanOrEqual(50);
    expect(levels).not.toContain(50.5);
    expect(levels).not.toContain(51);
    expect(levels).not.toContain(52);
  });

  it("optimizePowerUps never generates a candidate above level 50, starting from a level right at the edge", () => {
    const slot: PowerUpSlotInput = {
      species,
      fastMoveId: null,
      chargedMoveId: null,
      isMega: false,
      level: 48.5,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      costModifiers: NO_MODIFIERS,
      candyOnHand: 1_000_000,
      xlCandyOnHand: 1_000_000,
    };
    const inputs: PowerUpOptimizerInputs = {
      slots: [slot],
      boss,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 180,
      costTable: table,
      stardustOnHand: 1_000_000_000,
      iterations: 1,
      seed: 1,
      // maxLevel omitted deliberately — defaults to costTable.maxLevel (50).
    };
    const result = optimizePowerUps(inputs);
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.candidates) {
      expect(candidate.toLevel).toBeLessThanOrEqual(50);
    }
    expect(Math.max(...result.candidates.map((c) => c.toLevel))).toBe(50);
  });

  it("optimizePowerUps rejects an explicit maxLevel above the real ceiling being usable as a candidate level, even if a caller tried to force one past 50", () => {
    // A caller cannot actually request 50.5/51/52 as maxLevel and get
    // candidates there — powerUpLevelsAbove (which both optimizePowerUps and
    // usefulPowerUpLevelsAbove route through) is bounded by
    // toHalfIndex(table.maxLevel, ...), and table.maxLevel itself is always
    // exactly 50 for any real GAME_MASTER-derived table — so a caller-supplied
    // maxLevel above 50 simply has no effect (there is nothing above 50 to
    // offer regardless of what maxLevel claims).
    const slot: PowerUpSlotInput = {
      species,
      fastMoveId: null,
      chargedMoveId: null,
      isMega: false,
      level: 49.5,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      costModifiers: NO_MODIFIERS,
      candyOnHand: 1_000_000,
      xlCandyOnHand: 1_000_000,
    };
    const inputs: PowerUpOptimizerInputs = {
      slots: [slot],
      boss,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 180,
      costTable: table,
      stardustOnHand: 1_000_000_000,
      iterations: 1,
      seed: 1,
      maxLevel: 52, // an attempted (invalid) request past the real ceiling
    };
    const result = optimizePowerUps(inputs);
    // Only 49.5 -> 50 exists — 52 was never a real candidate to begin with.
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.toLevel).toBe(50);
  });

  // 2026-09-09 follow-up: megaLevel now reaches powerUpDamageLadder AND
  // planPowerUpBudget's actual simulation (see powerUp.test.ts's megaLevel
  // describe blocks) — re-run the same edge-of-ceiling shape with a
  // mega-capable species at Super Max Mega Level (effective combat level 52,
  // per effectiveLevelForMegaLevel) to confirm the +2 effective-level bonus
  // never leaks into the CANDIDATE LEVEL LADDER itself. The bonus only ever
  // shifts what effectiveStatsAtLevel computes AT an already-generated
  // candidate level — it never changes which levels powerUpLevelsAbove
  // generates in the first place (that ladder is bounded purely by
  // table.maxLevel, completely independent of megaLevel).
  describe("the same ceiling holds for a mega-capable species at Super Max Mega Level", () => {
    const megaSpecies: SpeciesDefinition = { ...species, id: "ceiling-mega-species", boost: { multiplier: 1.3, boostedType: "normal" } };

    it("sanity: Super Max really does push the effective combat level past the real level-50 ceiling", () => {
      expect(effectiveLevelForMegaLevel(50, "super-max")).toBe(52);
      expect(effectiveLevelForMegaLevel(48.5, "super-max")).toBe(50.5);
    });

    it("optimizePowerUps never generates a candidate above level 50 for a Super Max mega, even starting from a level right at the edge", () => {
      const slot: PowerUpSlotInput = {
        species: megaSpecies,
        fastMoveId: null,
        chargedMoveId: null,
        isMega: true,
        megaLevel: "super-max",
        level: 48.5,
        ivs: { attack: 15, defense: 15, stamina: 15 },
        costModifiers: NO_MODIFIERS,
        candyOnHand: 1_000_000,
        xlCandyOnHand: 1_000_000,
      };
      const result = optimizePowerUps({
        slots: [slot],
        boss,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: 1000,
        raidTimerSeconds: 180,
        costTable: table,
        stardustOnHand: 1_000_000_000,
        iterations: 1,
        seed: 1,
      });
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(Math.max(...result.candidates.map((c) => c.toLevel))).toBe(50);
      // The displayed ladder itself must ALSO never claim a level above 50,
      // even though it now honors megaLevel's stat bump at every level it
      // does report.
      expect(result.ladders[0]).not.toBeNull();
      expect(Math.max(...result.ladders[0]!.steps.map((s) => s.level))).toBe(50);
    });

    it("planPowerUpBudget never commits a step above level 50 for a Super Max mega, even with an effectively unlimited budget", () => {
      const plan = planPowerUpBudget({
        slots: [
          {
            species: megaSpecies,
            fastMoveId: null,
            chargedMoveId: null,
            isMega: true,
            megaLevel: "super-max",
            level: 48.5,
            ivs: { attack: 15, defense: 15, stamina: 15 },
            costModifiers: NO_MODIFIERS,
            candyOnHand: 1_000_000,
            xlCandyOnHand: 1_000_000,
          },
        ],
        boss,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: 1000,
        raidTimerSeconds: 180,
        costTable: table,
        stardustOnHand: 1_000_000_000,
        iterations: 1,
        seed: 1,
      });
      for (const step of plan.steps) expect(step.toLevel).toBeLessThanOrEqual(50);
      expect(plan.finalLevels[0]!.toLevel).toBeLessThanOrEqual(50);
    });
  });
});
