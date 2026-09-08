import { describe, expect, it } from "vitest";
import {
  addResourceCosts,
  optimizePowerUps,
  powerUpCost,
  powerUpCostTableFromGameMaster,
  powerUpDamageLadder,
  powerUpLevelsAbove,
  powerUpStepCost,
  teamDamageAtRaidSeconds,
  type PowerUpCostModifiers,
  type PowerUpCostTable,
  type PowerUpOptimizerInputs,
  type PowerUpSlotInput,
} from "../src/powerUp.js";
import type { TeamRaidResult } from "../src/teamRaid.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";
import { NO_MODIFIERS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, RAW_POKEMON_UPGRADE_SETTINGS } from "./fixtures/powerUpCosts.js";

const modifiers = (overrides: Partial<PowerUpCostModifiers> = {}): PowerUpCostModifiers => ({
  isShadow: false,
  isPurified: false,
  isLucky: false,
  ...overrides,
});

describe("powerUpCostTableFromGameMaster", () => {
  it("produces 98 steps and the right maxLevel", () => {
    const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
    expect(table.steps).toHaveLength(98);
    expect(table.maxLevel).toBe(50);
    expect(table.steps[0]).toEqual({ fromLevel: 1, stardust: 200, candy: 1, xlCandy: 0 });
    expect(table.steps[97]).toEqual({ fromLevel: 49.5, stardust: 15000, candy: 0, xlCandy: 20 });
    expect(table.luckyStardustMultiplier).toBe(0.5);
  });

  it("throws when upgradesPerLevel isn't 2", () => {
    expect(() => powerUpCostTableFromGameMaster({ ...RAW_POKEMON_UPGRADE_SETTINGS, upgradesPerLevel: 1 }, 0.5)).toThrow(
      /upgradesPerLevel/,
    );
  });

  it("throws when stardustCost has the wrong length", () => {
    expect(() =>
      powerUpCostTableFromGameMaster({ ...RAW_POKEMON_UPGRADE_SETTINGS, stardustCost: RAW_POKEMON_UPGRADE_SETTINGS.stardustCost.slice(1) }, 0.5),
    ).toThrow(/stardustCost/);
  });

  it("throws when candyCost is shorter than stardustCost", () => {
    expect(() =>
      powerUpCostTableFromGameMaster({ ...RAW_POKEMON_UPGRADE_SETTINGS, candyCost: RAW_POKEMON_UPGRADE_SETTINGS.candyCost.slice(0, 48) }, 0.5),
    ).toThrow(/candyCost/);
  });

  it("tolerates the live dump's extra trailing candyCost zero (level 50) but rejects a non-zero extra", () => {
    expect(RAW_POKEMON_UPGRADE_SETTINGS.candyCost.length).toBe(RAW_POKEMON_UPGRADE_SETTINGS.stardustCost.length + 1);
    expect(() => powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, 0.5)).not.toThrow();
    expect(() =>
      powerUpCostTableFromGameMaster({ ...RAW_POKEMON_UPGRADE_SETTINGS, candyCost: [...RAW_POKEMON_UPGRADE_SETTINGS.candyCost, 3] }, 0.5),
    ).toThrow(/extra entries/);
  });

  it("throws when xlCandyCost has the wrong length", () => {
    expect(() =>
      powerUpCostTableFromGameMaster({ ...RAW_POKEMON_UPGRADE_SETTINGS, xlCandyCost: RAW_POKEMON_UPGRADE_SETTINGS.xlCandyCost.slice(1) }, 0.5),
    ).toThrow(/xlCandyCost/);
  });

  it("throws when a whole level has neither candy nor XL non-zero", () => {
    const badCandy = [...RAW_POKEMON_UPGRADE_SETTINGS.candyCost];
    badCandy[38] = 0; // whole level 39, below xlCandyMinPokemonLevel — must be non-zero
    expect(() => powerUpCostTableFromGameMaster({ ...RAW_POKEMON_UPGRADE_SETTINGS, candyCost: badCandy }, 0.5)).toThrow(
      /below xlCandyMinPokemonLevel/,
    );
  });

  it("throws when a whole level has BOTH candy and XL non-zero", () => {
    const badCandy = [...RAW_POKEMON_UPGRADE_SETTINGS.candyCost];
    badCandy[39] = 5; // whole level 40, at/above xlCandyMinPokemonLevel — candy must stay 0 (XL already non-zero here)
    expect(() => powerUpCostTableFromGameMaster({ ...RAW_POKEMON_UPGRADE_SETTINGS, candyCost: badCandy }, 0.5)).toThrow(
      /exactly one of regular candy or XL candy/,
    );
  });

  it("throws on a non-finite or negative value", () => {
    const badStardust = [...RAW_POKEMON_UPGRADE_SETTINGS.stardustCost];
    badStardust[0] = -1;
    expect(() => powerUpCostTableFromGameMaster({ ...RAW_POKEMON_UPGRADE_SETTINGS, stardustCost: badStardust }, 0.5)).toThrow(
      /finite, non-negative/,
    );
    expect(() => powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, Number.NaN)).toThrow(/finite, non-negative/);
  });
});

describe("powerUpStepCost / powerUpCost / powerUpLevelsAbove", () => {
  const table: PowerUpCostTable = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);

  it("1 -> 2 costs {400, 2, 0}", () => {
    expect(powerUpCost(table, 1, 2, NO_MODIFIERS)).toEqual({ stardust: 400, candy: 2, xlCandy: 0 });
  });

  it("39.5 -> 40.5 costs {20000, 15, 10} (see this module's top doc comment for why this deviates from the task spec's hand-derived 19000)", () => {
    // The candy/XL split (15 then 0/10) matches the spec's own anchors
    // exactly; only the stardust total differs, and every OTHER given
    // anchor (level 1, 1->2, level 40, 49.5->50) checks out exactly under
    // this interpretation — verified via this engine's own code, not hand
    // arithmetic, per this project's standing discipline.
    expect(powerUpCost(table, 39.5, 40.5, NO_MODIFIERS)).toEqual({ stardust: 20000, candy: 15, xlCandy: 10 });
  });

  it("49.5 -> 50 costs {15000, 0, 20}", () => {
    expect(powerUpCost(table, 49.5, 50, NO_MODIFIERS)).toEqual({ stardust: 15000, candy: 0, xlCandy: 20 });
  });

  it("shadow 1 -> 1.5 = {240, 2, 0} (ceil of 1.2)", () => {
    expect(powerUpStepCost(table, 1, modifiers({ isShadow: true }))).toEqual({ stardust: 240, candy: 2, xlCandy: 0 });
  });

  it("purified 1 -> 1.5 = {180, 1, 0}", () => {
    expect(powerUpStepCost(table, 1, modifiers({ isPurified: true }))).toEqual({ stardust: 180, candy: 1, xlCandy: 0 });
  });

  it("lucky halves stardust only", () => {
    expect(powerUpStepCost(table, 1, modifiers({ isLucky: true }))).toEqual({ stardust: 100, candy: 1, xlCandy: 0 });
  });

  it("lucky + purified stack multiplicatively on stardust (200 -> 90)", () => {
    expect(powerUpStepCost(table, 1, modifiers({ isLucky: true, isPurified: true })).stardust).toBe(90);
  });

  it("shadow + purified throws (mutually exclusive)", () => {
    expect(() => powerUpStepCost(table, 1, modifiers({ isShadow: true, isPurified: true }))).toThrow(/Shadow and Purified/);
  });

  it("equal levels -> zeros", () => {
    expect(powerUpCost(table, 10, 10, NO_MODIFIERS)).toEqual({ stardust: 0, candy: 0, xlCandy: 0 });
  });

  it("reversed levels throw", () => {
    expect(() => powerUpCost(table, 2, 1, NO_MODIFIERS)).toThrow(/toLevel/);
  });

  it("powerUpLevelsAbove(..., 48.5) = [49, 49.5, 50]", () => {
    expect(powerUpLevelsAbove(table, 48.5)).toEqual([49, 49.5, 50]);
  });

  it("addResourceCosts sums each field independently", () => {
    expect(addResourceCosts({ stardust: 1, candy: 2, xlCandy: 3 }, { stardust: 10, candy: 20, xlCandy: 30 })).toEqual({
      stardust: 11,
      candy: 22,
      xlCandy: 33,
    });
  });
});

describe("powerUpDamageLadder", () => {
  const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);

  const species: SpeciesDefinition = {
    id: "ladder-test",
    name: "Ladder Test",
    types: ["normal"],
    baseAttack: 120,
    baseDefense: 100,
    baseStamina: 100,
    fastMoves: [],
    chargedMoves: [],
  };
  const fastMove: FastMove = { id: "f", name: "F", type: "normal", power: 8, energyGain: 3, durationSeconds: 1 };
  const chargedMove: ChargedMove = {
    id: "c",
    name: "C",
    type: "normal",
    power: 50,
    energyCost: 35,
    durationSeconds: 2,
    vulnerableWindowSeconds: 2,
  };

  it("finds the first level where floored fast-move damage steps up, with the right cumulative cost", () => {
    // Verified via a throwaway script driving this engine's own
    // effectiveStatsAtLevel/calculateDamage: at level 1 (IV 0/0/0), fast
    // damage floors to 1 and stays there through level 5.5, first stepping
    // up to 2 at exactly level 6.
    const ladder = powerUpDamageLadder({
      species,
      ivs: { attack: 0, defense: 0, stamina: 0 },
      fromLevel: 1,
      fastMove,
      chargedMove,
      bossDefenseStat: 150,
      fastMoveDamageModifiers: { stab: false },
      chargedMoveDamageModifiers: { stab: false },
      table,
      modifiers: NO_MODIFIERS,
    });

    expect(ladder.current).toEqual({ level: 1, attackStat: 11, fastMoveDamage: 1, chargedMoveDamage: 2 });
    expect(ladder.nextFastBreakpoint).not.toBeNull();
    expect(ladder.nextFastBreakpoint!.level).toBe(6);
    expect(ladder.nextFastBreakpoint!.fastMoveDamage).toBe(2);
    expect(ladder.nextFastBreakpoint!.cumulativeCost).toEqual(powerUpCost(table, 1, 6, NO_MODIFIERS));

    // Every step strictly below the breakpoint must still show the OLD
    // (unchanged) fast damage — the whole point of the breakpoint framing.
    for (const step of ladder.steps) {
      if (step.level < ladder.nextFastBreakpoint!.level) {
        expect(step.fastMoveDamage).toBe(ladder.current.fastMoveDamage);
      }
    }

    // The charged move (higher power) breaks earlier — sanity check it's
    // found independently of the fast-move breakpoint.
    expect(ladder.nextChargedBreakpoint).not.toBeNull();
    expect(ladder.nextChargedBreakpoint!.chargedMoveDamage).toBeGreaterThan(ladder.current.chargedMoveDamage);
  });

  it("returns null breakpoints when maxLevel caps the ladder before any change occurs", () => {
    const ladder = powerUpDamageLadder({
      species,
      ivs: { attack: 0, defense: 0, stamina: 0 },
      fromLevel: 1,
      fastMove,
      chargedMove,
      bossDefenseStat: 150,
      fastMoveDamageModifiers: { stab: false },
      chargedMoveDamageModifiers: { stab: false },
      table,
      modifiers: NO_MODIFIERS,
      maxLevel: 1.5, // only one step in range, well below the level-6 fast breakpoint
    });
    expect(ladder.steps).toHaveLength(1);
    expect(ladder.nextFastBreakpoint).toBeNull();
  });
});

describe("teamDamageAtRaidSeconds", () => {
  function buildResult(trajectories: { atSeconds: number; cumulativeDamage: number }[][]): TeamRaidResult {
    return {
      outcome: "timerExpired",
      clearsWithinTimer: false,
      timeToClearSeconds: null,
      timerMarginSeconds: null,
      clearingCycleIndex: null,
      clearingSlotIndex: null,
      slotsUsed: trajectories.length,
      slotsFainted: 0,
      wipeCount: 0,
      slots: trajectories.map((ownDamageTrajectory, i) => ({
        cycleIndex: 0,
        slotIndex: i,
        speciesId: `s${i}`,
        speciesName: `S${i}`,
        faintedAtSeconds: null,
        secondsActive: 10,
        startedAtRaidSeconds: 0,
        endedAtRaidSeconds: 10,
        ownDamageDealt: ownDamageTrajectory.at(-1)?.cumulativeDamage ?? 0,
        chargedAttacksLanded: 0,
        bossChargedHitsTaken: 0,
        ownDamageTrajectory,
      })),
    };
  }

  it("returns the cumulative damage of the last qualifying point across all slots", () => {
    const result = buildResult([
      [
        { atSeconds: 0, cumulativeDamage: 0 },
        { atSeconds: 5, cumulativeDamage: 50 },
        { atSeconds: 10, cumulativeDamage: 100 },
      ],
      [
        { atSeconds: 12, cumulativeDamage: 120 },
        { atSeconds: 20, cumulativeDamage: 200 },
      ],
    ]);

    expect(teamDamageAtRaidSeconds(result, 7)).toBe(50);
    expect(teamDamageAtRaidSeconds(result, 15)).toBe(120);
    expect(teamDamageAtRaidSeconds(result, 100)).toBe(200);
  });

  it("returns 0 when no point qualifies", () => {
    const result = buildResult([[{ atSeconds: 5, cumulativeDamage: 50 }]]);
    expect(teamDamageAtRaidSeconds(result, 1)).toBe(0);
  });
});

describe("optimizePowerUps", () => {
  const WEAK_FAST: FastMove = { id: "weak-fast", name: "Weak Fast", type: "normal", power: 3, energyGain: 3, durationSeconds: 0.5 };
  const WEAK_CHARGED: ChargedMove = {
    id: "weak-charged",
    name: "Weak Charged",
    type: "normal",
    power: 20,
    energyCost: 30,
    durationSeconds: 1,
    vulnerableWindowSeconds: 1,
  };

  const HARD_HITTER: SpeciesDefinition = {
    id: "hard-hitter",
    name: "Hard Hitter",
    types: ["normal"],
    baseAttack: 300,
    baseDefense: 150,
    baseStamina: 200,
    fastMoves: [WEAK_FAST],
    chargedMoves: [WEAK_CHARGED],
  };

  const BOSS: SpeciesDefinition = {
    id: "weak-boss",
    name: "Weak Boss",
    types: ["normal"],
    baseAttack: 20,
    baseDefense: 50,
    baseStamina: 1500,
    fastMoves: [WEAK_FAST],
    chargedMoves: [],
    statsArePrecomputed: true,
  };

  const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
  const PERFECT_IVS = { attack: 15, defense: 15, stamina: 15 } as const;

  function makeSlot(overrides: Partial<PowerUpSlotInput> = {}): PowerUpSlotInput {
    return {
      species: HARD_HITTER,
      fastMoveId: null,
      chargedMoveId: null,
      isMega: false,
      level: 49,
      ivs: PERFECT_IVS,
      costModifiers: NO_MODIFIERS,
      candyOnHand: 100,
      xlCandyOnHand: 100,
      ...overrides,
    };
  }

  function baseInputs(overrides: Partial<PowerUpOptimizerInputs> = {}): PowerUpOptimizerInputs {
    return {
      slots: [makeSlot(), makeSlot()],
      boss: BOSS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 180,
      costTable: table,
      stardustOnHand: 1_000_000,
      iterations: 2,
      seed: 1,
      ...overrides,
    };
  }

  it("produces one candidate per fielded slot per half-level above its current level, through maxLevel", () => {
    const result = optimizePowerUps(baseInputs({ maxLevel: 50 }));
    const expectedPerSlot = powerUpLevelsAbove(table, 49).filter((l) => l <= 50).length; // [49.5, 50] -> 2
    expect(expectedPerSlot).toBe(2);
    expect(result.candidates).toHaveLength(2 * expectedPerSlot);
    expect(result.ladders).toHaveLength(2);
    expect(result.ladders[0]).not.toBeNull();
  });

  it("keeps candidate costs monotone non-decreasing in toLevel within a slot", () => {
    const result = optimizePowerUps(baseInputs({ maxLevel: 50 }));
    const slot0Candidates = result.candidates.filter((c) => c.slotIndex === 0).sort((a, b) => a.toLevel - b.toLevel);
    for (let i = 1; i < slot0Candidates.length; i++) {
      expect(slot0Candidates[i]!.cost.stardust).toBeGreaterThanOrEqual(slot0Candidates[i - 1]!.cost.stardust);
      expect(slot0Candidates[i]!.cost.candy).toBeGreaterThanOrEqual(slot0Candidates[i - 1]!.cost.candy);
      expect(slot0Candidates[i]!.cost.xlCandy).toBeGreaterThanOrEqual(slot0Candidates[i - 1]!.cost.xlCandy);
    }
  });

  it("respects all three budgets independently for the affordable flag", () => {
    // 49->49.5 costs {15000, 0, 20}; 49->50 costs {30000, 0, 40} (both steps).
    const result = optimizePowerUps(
      baseInputs({
        maxLevel: 50,
        stardustOnHand: 20000, // enough for the single step, not the double step
        slots: [
          makeSlot({ xlCandyOnHand: 25 }), // enough XL for the single step (20), not the double (40)
          makeSlot({ xlCandyOnHand: 5 }), // not even enough for the single step
        ],
      }),
    );

    const slot0Single = result.candidates.find((c) => c.slotIndex === 0 && c.toLevel === 49.5)!;
    const slot0Double = result.candidates.find((c) => c.slotIndex === 0 && c.toLevel === 50)!;
    const slot1Single = result.candidates.find((c) => c.slotIndex === 1 && c.toLevel === 49.5)!;

    expect(slot0Single.cost).toEqual({ stardust: 15000, candy: 0, xlCandy: 20 });
    expect(slot0Single.affordable).toBe(true);
    expect(slot0Double.cost).toEqual({ stardust: 30000, candy: 0, xlCandy: 40 });
    expect(slot0Double.affordable).toBe(false); // fails stardust AND xlCandy
    expect(slot1Single.affordable).toBe(false); // fails xlCandy only (5 < 20)
  });

  it("produces a reproducible baseline across two identical calls", () => {
    const inputs = baseInputs({ maxLevel: 50 });
    const first = optimizePowerUps(inputs);
    const second = optimizePowerUps(inputs);
    expect(second.baseline).toEqual(first.baseline);
    expect(second.bossHp).toBe(first.bossHp);
  });

  it("bestAffordableByDelta is null when nothing is affordable", () => {
    const result = optimizePowerUps(baseInputs({ maxLevel: 50, stardustOnHand: 0 }));
    expect(result.candidates.some((c) => c.affordable)).toBe(false);
    expect(result.bestAffordableByDelta).toBeNull();
    expect(result.bestAffordableByStardustEfficiency).toBeNull();
  });

  describe("noise floor and per-seed stats", () => {
    // A boss with a real charged move, so its timing jitter (see
    // simulate.ts's boundedJitteredChargedMoveInterval) actually gives
    // different seeds different outcomes — BOSS above has chargedMoves: []
    // and so is deterministic regardless of seed (used below to pin the
    // "no jitter -> stdDev exactly 0" case).
    const BOSS_CHARGED_MOVE: ChargedMove = {
      id: "boss-charged",
      name: "Boss Charged",
      type: "normal",
      power: 80,
      energyCost: 50,
      durationSeconds: 2,
      vulnerableWindowSeconds: 2,
    };
    const BOSS_WITH_CHARGED: SpeciesDefinition = {
      id: "boss-with-charged",
      name: "Boss With Charged",
      types: ["normal"],
      baseAttack: 40,
      baseDefense: 50,
      baseStamina: 3000,
      fastMoves: [WEAK_FAST],
      chargedMoves: [BOSS_CHARGED_MOVE],
      statsArePrecomputed: true,
    };

    // A higher-variance boss/level combo, tuned (via a throwaway script
    // driving this engine's own optimizePowerUps, not hand arithmetic) so
    // that at iterations=2 the only available power-up (20 -> 20.5) for
    // BOTH slots comes out with a small POSITIVE deltaTeamDps that still
    // sits below noiseFloorTeamDps — the "real but unmeasurable" case this
    // feature exists to surface.
    const VARIANCE_CHARGED_MOVE: ChargedMove = {
      id: "variance-charged",
      name: "Variance Charged",
      type: "normal",
      power: 80,
      energyCost: 50,
      durationSeconds: 2,
      vulnerableWindowSeconds: 2,
    };
    const VARIANCE_BOSS: SpeciesDefinition = {
      id: "variance-boss",
      name: "Variance Boss",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 60,
      baseStamina: 4000,
      fastMoves: [WEAK_FAST],
      chargedMoves: [VARIANCE_CHARGED_MOVE],
      statsArePrecomputed: true,
    };

    it("teamDpsPerSeed has length == iterations and its mean equals teamDps", () => {
      const result = optimizePowerUps(baseInputs({ maxLevel: 50, iterations: 5 }));
      expect(result.baseline.teamDpsPerSeed).toHaveLength(5);
      const manualMean = result.baseline.teamDpsPerSeed.reduce((a, b) => a + b, 0) / 5;
      expect(manualMean).toBeCloseTo(result.baseline.teamDps, 10);
      expect(result.iterations).toBe(5);
    });

    it("teamDpsStdDev and noiseFloorTeamDps are exactly 0 for a single iteration", () => {
      const result = optimizePowerUps(baseInputs({ maxLevel: 50, iterations: 1 }));
      expect(result.baseline.teamDpsStdDev).toBe(0);
      expect(result.noiseFloorTeamDps).toBe(0);
      expect(result.iterations).toBe(1);
    });

    it("teamDpsStdDev and noiseFloorTeamDps are exactly 0 for a boss with no charged move at all (no jitter to sample)", () => {
      // BOSS's chargedMoves is [] — there is nothing for
      // boundedJitteredChargedMoveInterval to ever randomize, so every seed
      // in the seed set produces an identical run.
      const result = optimizePowerUps(baseInputs({ maxLevel: 50, iterations: 6 }));
      expect(result.baseline.teamDpsStdDev).toBe(0);
      expect(result.noiseFloorTeamDps).toBe(0);
    });

    it("teamDpsStdDev is non-zero for a boss whose charged-move timing is actually jittered across seeds", () => {
      const result = optimizePowerUps(
        baseInputs({
          maxLevel: 25,
          boss: BOSS_WITH_CHARGED,
          bossChargedMoveMeanIntervalSeconds: 8,
          iterations: 10,
          slots: [makeSlot({ level: 20 }), makeSlot({ level: 20 })],
        }),
      );
      expect(result.baseline.teamDpsStdDev).toBeGreaterThan(0);
    });

    it("noiseFloorTeamDps matches 2 * baseline.teamDpsStdDev * sqrt(2 / iterations)", () => {
      const result = optimizePowerUps(
        baseInputs({
          maxLevel: 25,
          boss: BOSS_WITH_CHARGED,
          bossChargedMoveMeanIntervalSeconds: 8,
          iterations: 10,
          slots: [makeSlot({ level: 20 }), makeSlot({ level: 20 })],
        }),
      );
      const expected = 2 * result.baseline.teamDpsStdDev * Math.sqrt(2 / result.iterations);
      expect(result.noiseFloorTeamDps).toBe(expected);
    });

    it("a candidate with a positive delta below the noise floor has deltaExceedsNoise false, and both bestAffordable* are null when EVERY affordable positive delta is below the floor", () => {
      const result = optimizePowerUps(
        baseInputs({
          maxLevel: 20.5, // only one power-up (20 -> 20.5) is even offered per slot
          boss: VARIANCE_BOSS,
          bossChargedMoveMeanIntervalSeconds: 6,
          iterations: 2,
          slots: [makeSlot({ level: 20 }), makeSlot({ level: 20 })],
        }),
      );

      expect(result.candidates).toHaveLength(2); // one candidate per slot
      for (const candidate of result.candidates) {
        expect(candidate.affordable).toBe(true);
        expect(candidate.deltaTeamDps).toBeGreaterThan(0); // real, positive effect...
        expect(candidate.deltaTeamDps).toBeLessThan(result.noiseFloorTeamDps); // ...but not a measurable one
        expect(candidate.deltaExceedsNoise).toBe(false);
      }
      expect(result.bestAffordableByDelta).toBeNull();
      expect(result.bestAffordableByStardustEfficiency).toBeNull();
    });
  });
});
