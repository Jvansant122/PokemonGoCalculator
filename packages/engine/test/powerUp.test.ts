import { describe, expect, it } from "vitest";
import {
  addResourceCosts,
  optimizePowerUps,
  planPowerUpBudget,
  powerUpCost,
  powerUpCostTableFromGameMaster,
  powerUpDamageLadder,
  powerUpLevelMetrics,
  powerUpLevelsAbove,
  powerUpStepCost,
  teamDamageAtRaidSeconds,
  usefulPowerUpLevelsAbove,
  type PowerUpBudgetInputs,
  type PowerUpCostModifiers,
  type PowerUpCostTable,
  type PowerUpOptimizerInputs,
  type PowerUpSlotInput,
} from "../src/powerUp.js";
import { bossEffectiveStats, ownBoostMultiplier } from "../src/comparison.js";
import { calculateDamage } from "../src/damage.js";
import { chargedMoveAtMegaLevel, type MegaLevel } from "../src/megaLevel.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import type { TeamRaidResult } from "../src/teamRaid.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";
import { typeEffectiveness } from "../src/typeChart.js";
import { isWeatherBoosted } from "../src/weather.js";
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
        dodgeFastAttacksLockout: false,
        enragedAtRaidSeconds: null,
        subduedAtRaidSeconds: null,
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

  describe("shared Rare Candy pools and the affordable flag", () => {
    // 49->49.5 costs {15000 stardust, 0 candy, 20 XL}. The slot below holds 5
    // XL of its own, so it needs exactly 15 more from the shared pool.
    const shortBy15Xl = () => ({ maxLevel: 50, stardustOnHand: 20000, slots: [makeSlot({ xlCandyOnHand: 5 })] });
    const single = (result: ReturnType<typeof optimizePowerUps>) => result.candidates.find((c) => c.toLevel === 49.5)!;

    it("defaults both pools to 0, so a caller that passes neither keeps its previous behaviour exactly", () => {
      const withoutPools = single(optimizePowerUps(baseInputs(shortBy15Xl())));
      const withExplicitZeros = single(optimizePowerUps(baseInputs({ ...shortBy15Xl(), rareCandyOnHand: 0, rareCandyXlOnHand: 0 })));
      expect(withoutPools.affordable).toBe(false);
      expect(withoutPools).toEqual(withExplicitZeros);
    });

    it("counts the shared Rare Candy XL pool toward affordability once it covers the shortfall", () => {
      const justShort = single(optimizePowerUps(baseInputs({ ...shortBy15Xl(), rareCandyXlOnHand: 14 })));
      const exactly = single(optimizePowerUps(baseInputs({ ...shortBy15Xl(), rareCandyXlOnHand: 15 })));
      expect(justShort.affordable).toBe(false);
      expect(exactly.affordable).toBe(true);
      // The shortfall itself is reported so the UI can say "spends 15 Rare Candy XL".
      expect(exactly.sharedXlCandyNeeded).toBe(15);
      expect(exactly.sharedCandyNeeded).toBe(0);
    });

    it("never lets a shared pool paper over a stardust shortfall — the pools are candy only", () => {
      const noDust = single(optimizePowerUps(baseInputs({ ...shortBy15Xl(), stardustOnHand: 0, rareCandyXlOnHand: 9999 })));
      expect(noDust.affordable).toBe(false);
    });

    it("keeps the two pools separate — Rare Candy can never cover an XL Candy cost", () => {
      // The real-game rule: plain Rare Candy has no route to XL Candy at all
      // (MECHANICS.md, "Fungible candy currencies"). A huge regular pool must
      // not make an XL-costed step affordable.
      const wrongPool = single(optimizePowerUps(baseInputs({ ...shortBy15Xl(), rareCandyOnHand: 9999 })));
      expect(wrongPool.affordable).toBe(false);
      expect(wrongPool.sharedXlCandyNeeded).toBe(15);
    });

    it("spends the slot's own candy first, so sharedCandyNeeded is only the uncovered remainder", () => {
      // A level-1 slot's steps cost regular Candy, not XL.
      const result = optimizePowerUps(
        baseInputs({ maxLevel: 2, stardustOnHand: 1e9, slots: [makeSlot({ level: 1, candyOnHand: 1 })], rareCandyOnHand: 99 }),
      );
      for (const candidate of result.candidates) {
        expect(candidate.sharedCandyNeeded).toBe(Math.max(0, candidate.cost.candy - 1));
        expect(candidate.affordable).toBe(true);
      }
      // At least one step actually had to draw on the shared pool, or this
      // test would pass vacuously.
      expect(result.candidates.some((c) => c.sharedCandyNeeded > 0)).toBe(true);
    });
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

describe("planPowerUpBudget", () => {
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

  const HARD_HITTER_A: SpeciesDefinition = {
    id: "budget-hitter-a",
    name: "Budget Hitter A",
    types: ["normal"],
    baseAttack: 300,
    baseDefense: 150,
    baseStamina: 200,
    fastMoves: [WEAK_FAST],
    chargedMoves: [WEAK_CHARGED],
  };
  const HARD_HITTER_B: SpeciesDefinition = {
    id: "budget-hitter-b",
    name: "Budget Hitter B",
    types: ["normal"],
    baseAttack: 280,
    baseDefense: 160,
    baseStamina: 210,
    fastMoves: [WEAK_FAST],
    chargedMoves: [WEAK_CHARGED],
  };

  // No charged move at all -> zero jitter across seeds (see optimizePowerUps'
  // own "no jitter" test above) -> noiseFloorTeamDps is exactly 0 regardless
  // of `iterations`, which makes the greedy walk's own commit decisions
  // exactly reproducible without needing a large iteration count.
  const NO_CHARGE_BOSS: SpeciesDefinition = {
    id: "budget-boss",
    name: "Budget Boss",
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
      species: HARD_HITTER_A,
      fastMoveId: null,
      chargedMoveId: null,
      isMega: false,
      level: 20,
      ivs: PERFECT_IVS,
      costModifiers: NO_MODIFIERS,
      candyOnHand: 1000,
      xlCandyOnHand: 1000,
      ...overrides,
    };
  }

  // Verified via a throwaway tsx scratch script driving planPowerUpBudget
  // itself (deleted after use, per this project's re-derive discipline):
  // this exact configuration commits exactly 2 steps (both on slot 0 —
  // HARD_HITTER_A's attack stat pulls ahead of HARD_HITTER_B's fast enough
  // that it keeps winning the greedy's score comparison) before stopping
  // "no-significant-candidate", with 192000 of the 200000 stardust never
  // spent — the two attackers already clear this very weak boss so fast
  // that further power-ups stop moving the tick-quantized team-DPS metric
  // measurably, well before the budget or maxLevel is reached.
  function baseInputs(overrides: Partial<PowerUpBudgetInputs> = {}): PowerUpBudgetInputs {
    return {
      slots: [makeSlot(), makeSlot({ species: HARD_HITTER_B })],
      boss: NO_CHARGE_BOSS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 180,
      costTable: table,
      stardustOnHand: 200_000,
      rareCandyOnHand: 50,
      rareCandyXlOnHand: 20,
      maxLevel: 40,
      iterations: 2,
      seed: 1,
      ...overrides,
    };
  }

  it("a zero-budget plan is empty, and stops with budget-exhausted", () => {
    const plan = planPowerUpBudget(baseInputs({ stardustOnHand: 0 }));
    expect(plan.steps).toHaveLength(0);
    expect(plan.stopReason).toBe("budget-exhausted");
    expect(plan.finalLevels).toEqual([
      { slotIndex: 0, speciesId: HARD_HITTER_A.id, speciesName: HARD_HITTER_A.name, fromLevel: 20, toLevel: 20 },
      { slotIndex: 1, speciesId: HARD_HITTER_B.id, speciesName: HARD_HITTER_B.name, fromLevel: 20, toLevel: 20 },
    ]);
    expect(plan.final).toEqual(plan.baseline);
  });

  it("stops immediately with max-level-reached when every fielded slot is already at maxLevel", () => {
    const plan = planPowerUpBudget(
      baseInputs({
        slots: [makeSlot({ level: 40 }), makeSlot({ species: HARD_HITTER_B, level: 40 })],
        maxLevel: 40,
      }),
    );
    expect(plan.steps).toHaveLength(0);
    expect(plan.stopReason).toBe("max-level-reached");
  });

  it("eventually stops with no-significant-candidate once no further real gain remains, well short of the budget or maxLevel — and reports bestBlockedCandidate: null, since this is the GENUINELY optimal case (ample resources remain, nothing further clears the floor)", () => {
    const plan = planPowerUpBudget(baseInputs());
    expect(plan.stopReason).toBe("no-significant-candidate");
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.ledger.stardust.remaining).toBeGreaterThan(0);
    expect(plan.finalLevels.some((f) => f.toLevel! < 40)).toBe(true);
    expect(plan.bestBlockedCandidate).toBeNull();
  });

  describe("regression: a multi-level jump whose own individual half-steps each sit below the noise floor", () => {
    // REAL BUG (found 2026-09-08 on the live Power-Up Optimizer tab, a real
    // 6-slot roster vs. Mega Tyranitar): candidateLevelsPerSlotPerRound
    // defaulted to 2, so only a slot's NEAREST two useful levels ever
    // competed for a round's commit. Several real species' next real gain
    // sat at their 3rd+ useful level — individually a bigger jump than "the
    // next one or two," but still just ONE candidate, not a chain of
    // sub-floor steps. Capping the offered window at 2 made that candidate
    // structurally unreachable no matter how much budget was left, so the
    // planner stalled after committing at most one small, unrelated step and
    // left the overwhelming majority of the budget unspent.
    //
    // This fixture reproduces that exact shape, verified via a throwaway
    // tsx scratch script (deleted after use, per this project's re-derive
    // discipline) driving planPowerUpBudget itself: from level 31, a single
    // slot's nearest three useful levels (31.5, 32, 32.5) each sit at
    // deltaTeamDps ~0.082 — comfortably below the noise floor (~0.178) — but
    // the very next useful level (34, a bigger jump still measured directly
    // from 31, never a chain of the smaller ones) sits at ~1.16, over 6x the
    // floor.
    const REGRESSION_FAST: FastMove = { id: "reg-fast", name: "Reg Fast", type: "normal", power: 7, energyGain: 4, durationSeconds: 1.0 };
    const REGRESSION_CHARGED: ChargedMove = {
      id: "reg-charged",
      name: "Reg Charged",
      type: "normal",
      power: 80,
      energyCost: 50,
      durationSeconds: 2.2,
      vulnerableWindowSeconds: 2.2,
    };
    const REGRESSION_BOSS_CHARGED: ChargedMove = {
      id: "reg-boss-charged",
      name: "Reg Boss Charged",
      type: "normal",
      power: 90,
      energyCost: 55,
      durationSeconds: 2.5,
      vulnerableWindowSeconds: 2.5,
    };
    const REGRESSION_BOSS: SpeciesDefinition = {
      id: "reg-boss",
      name: "Reg Boss",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 150,
      baseStamina: 1000,
      fastMoves: [{ id: "reg-boss-fast", name: "Reg Boss Fast", type: "normal", power: 7, energyGain: 3, durationSeconds: 1 }],
      chargedMoves: [REGRESSION_BOSS_CHARGED],
      statsArePrecomputed: true,
    };
    const REGRESSION_SLOT: SpeciesDefinition = {
      id: "reg-slot",
      name: "Reg Slot",
      types: ["normal"],
      baseAttack: 180,
      baseDefense: 150,
      baseStamina: 180,
      fastMoves: [REGRESSION_FAST],
      chargedMoves: [REGRESSION_CHARGED],
    };

    function regressionInputs(overrides: Partial<PowerUpBudgetInputs> = {}): PowerUpBudgetInputs {
      return {
        slots: [
          {
            species: REGRESSION_SLOT,
            fastMoveId: null,
            chargedMoveId: null,
            isMega: false,
            level: 31,
            ivs: PERFECT_IVS,
            costModifiers: NO_MODIFIERS,
            candyOnHand: 100_000,
            xlCandyOnHand: 100_000,
          },
        ],
        boss: REGRESSION_BOSS,
        dodge: { kind: "perfect" },
        bossChargedMoveMeanIntervalSeconds: 3,
        raidTimerSeconds: 300,
        costTable: table,
        stardustOnHand: 999_999_999,
        rareCandyOnHand: 999_999,
        rareCandyXlOnHand: 999_999,
        maxLevel: 41,
        iterations: 20,
        seed: 1,
        ...overrides,
      };
    }

    it("finds and commits the significant multi-level jump by default (candidateLevelsPerSlotPerRound unbounded)", () => {
      const plan = planPowerUpBudget(regressionInputs());
      expect(plan.steps.length).toBeGreaterThan(0);
      const first = plan.steps[0]!;
      // The jump itself must be real (more than one useful level's worth —
      // the old bug's cap could still offer 2), and clearly exceed the
      // noise floor by a wide margin, not just barely.
      expect(first.toLevel - first.fromLevel).toBeGreaterThanOrEqual(1.5);
      expect(first.deltaTeamDps).toBeGreaterThan(plan.noiseFloorTeamDps * 2);
    });

    it("stalls at 0 steps when the offered window is artificially narrowed back to the old default of 2 — proving this fixture actually reproduces the historical bug, not just a hypothetical one", () => {
      const plan = planPowerUpBudget(regressionInputs({ candidateLevelsPerSlotPerRound: 2 }));
      expect(plan.steps).toHaveLength(0);
      expect(plan.stopReason).toBe("no-significant-candidate");
    });

    // FOLLOW-UP (2026-09-08, real Mega Tyranitar case on the live tab): even
    // once the offered-window bug above was fixed, "no-significant-candidate"
    // on its own still conflated two different situations — "genuinely
    // optimal" and "a real gain exists but you can't afford it yet." This
    // fixture is the same shape as the offered-window bug above (nearest few
    // useful levels sub-floor, the real gain sits at a bigger jump further
    // out) but blocked by CANDY instead of an offered-window cap.
    it("reports the real jump as bestBlockedCandidate, naming candy as the short resource, when it's affordable in every OTHER resource but candy", () => {
      const candyCappedInputs = regressionInputs({
        slots: [
          {
            species: REGRESSION_SLOT,
            fastMoveId: null,
            chargedMoveId: null,
            isMega: false,
            level: 31,
            ivs: PERFECT_IVS,
            costModifiers: NO_MODIFIERS,
            // Covers the three sub-floor levels (31.5/32/32.5 need 6/12/18
            // candy each, cumulative from 31) but not the real, significant
            // jump to 34 (needs 40 candy, cumulative from 31 — see this
            // describe block's top comment for the verified numbers).
            candyOnHand: 30,
            xlCandyOnHand: 100_000,
          },
        ],
        rareCandyOnHand: 0, // no shared pool to quietly cover the shortfall
        stardustOnHand: 999_999_999, // stardust must NOT be the thing that's short here
      });
      const plan = planPowerUpBudget(candyCappedInputs);

      // The three sub-floor levels ARE affordable but none is significant —
      // same "no-significant-candidate" stop reason as a genuinely optimal
      // roster would report. The only way to tell them apart is the new
      // field.
      expect(plan.stopReason).toBe("no-significant-candidate");
      expect(plan.steps).toHaveLength(0);

      expect(plan.bestBlockedCandidate).not.toBeNull();
      const blocked = plan.bestBlockedCandidate!;
      expect(blocked.slotIndex).toBe(0);
      expect(blocked.fromLevel).toBe(31); // never touched — no steps were committed
      expect(blocked.toLevel).toBeGreaterThan(31);
      // It must actually clear the noise floor — that's what makes it worth
      // reporting as "blocked" rather than silently dropped like the
      // sub-floor levels below it.
      expect(blocked.deltaTeamDps).toBeGreaterThan(plan.noiseFloorTeamDps);
      // Named, not blended: candy specifically, with a real positive
      // shortfall, and NOT stardust (which was deliberately left unlimited).
      expect(blocked.shortfalls.map((s) => s.resource)).toContain("candy");
      const candyShortfall = blocked.shortfalls.find((s) => s.resource === "candy")!;
      expect(candyShortfall.shortfall).toBeGreaterThan(0);
      expect(candyShortfall.shortfall).toBe(blocked.cost.candy - 30);
      expect(blocked.shortfalls.some((s) => s.resource === "stardust")).toBe(false);
    });

    // FOLLOW-UP (2026-09-08, real Mega Tyranitar case on the live tab): a
    // roster's seed-to-seed variance changes as it's powered up, so a floor
    // computed ONCE from the starting baseline goes stale exactly as the
    // search proceeds — the dangerous direction being stale-LOW, letting real
    // seed noise through as a committed recommendation. This fixture widens
    // maxLevel to 50 (rather than this describe block's default 41), which —
    // verified via a throwaway tsx scratch script, deleted after use, per
    // this project's re-derive discipline — produces a SECOND real,
    // significant jump (34 -> 49.5) after the first (31 -> 34), giving two
    // committed rounds whose measured variance genuinely differs.
    it("recomputes the noise floor after each committed step from that step's OWN measured variance, rather than reusing round 1's baseline-derived value forever", () => {
      const plan = planPowerUpBudget(regressionInputs({ maxLevel: 50 }));
      expect(plan.stopReason).toBe("max-level-reached");
      expect(plan.steps).toHaveLength(2);
      const [first, second] = plan.steps;

      // Round 1 has no earlier committed step to draw variance from, so it
      // is necessarily judged against the baseline's own measured variance —
      // this part is unchanged by the fix.
      const baselineFloor = 2 * plan.baseline.teamDpsStdDev * Math.sqrt(2 / plan.iterations);
      expect(first!.noiseFloorTeamDps).toBeCloseTo(baselineFloor, 6);

      // THE FIX: round 2 is judged against a DIFFERENT value than round 1's —
      // proof the floor was actually recomputed, not reused.
      expect(second!.noiseFloorTeamDps).not.toBeCloseTo(baselineFloor, 3);

      // Independent cross-check with zero reliance on internal state: a
      // SEPARATE plan whose lone slot already starts at round 1's post-step
      // level (34) and can go no further (maxLevel == that same level) is a
      // deterministic re-simulation of the exact roster round 2 was actually
      // judged against (same species/level/boss/seeds) — its own baseline
      // floor must reproduce round 2's recorded floor exactly.
      const baseSlot = regressionInputs().slots[0]!;
      const postStep1Roster = planPowerUpBudget(
        regressionInputs({ slots: [{ ...baseSlot, level: first!.toLevel }], maxLevel: first!.toLevel }),
      );
      expect(postStep1Roster.steps).toHaveLength(0); // nothing left to commit at its own maxLevel
      expect(second!.noiseFloorTeamDps).toBeCloseTo(postStep1Roster.noiseFloorTeamDps, 6);

      // The TOP-LEVEL plan.noiseFloorTeamDps is the FINAL floor (measured
      // from the finished, level-49.5 roster) — also not round 1's stale
      // baseline-derived value.
      expect(plan.noiseFloorTeamDps).not.toBeCloseTo(baselineFloor, 3);
      const finalFloor = 2 * plan.final.teamDpsStdDev * Math.sqrt(2 / plan.iterations);
      expect(plan.noiseFloorTeamDps).toBeCloseTo(finalFloor, 6);

      // Every step still honors ITS OWN recorded floor, whatever governed it
      // at the time — never assume a step cleared plan.noiseFloorTeamDps
      // (the FINAL value) instead.
      for (const step of plan.steps) {
        expect(step.deltaTeamDps).toBeGreaterThan(step.noiseFloorTeamDps);
      }
    });

    it("judges the post-search 'best blocked candidate' pass against the FINAL (recomputed) floor, not round 1's stale one", () => {
      const baseSlot = regressionInputs().slots[0]!;
      const plan = planPowerUpBudget(
        regressionInputs({
          slots: [{ ...baseSlot, candyOnHand: 50, xlCandyOnHand: 0 }],
          rareCandyOnHand: 0,
          rareCandyXlOnHand: 0,
          maxLevel: 50,
          // The real blocked gain (34 -> 49.5) sits further out than the
          // default blockedCandidateLevelsPerSlot (8) window on this
          // fixture's dense useful-level list — widen it so this test
          // exercises the real candidate rather than an artifact of that
          // separate, deliberate bound (see this field's own doc comment).
          blockedCandidateLevelsPerSlot: 20,
        }),
      );

      // Only the first jump (31 -> 34) is affordable; candy runs out before
      // the second (34 -> 49.5, which needs far more candy AND XL candy than
      // this fixture provides).
      expect(plan.steps).toHaveLength(1);
      expect(plan.stopReason).toBe("no-significant-candidate");
      expect(plan.bestBlockedCandidate).not.toBeNull();
      const blocked = plan.bestBlockedCandidate!;
      expect(blocked.toLevel).toBe(49.5);

      // Round 1's floor (baseline-derived) is NOT the same value the blocked
      // pass judged this candidate against — the pass runs AFTER round 1
      // committed, so it uses the recomputed, POST-step-1 floor instead.
      const round1Floor = plan.steps[0]!.noiseFloorTeamDps;
      expect(plan.noiseFloorTeamDps).not.toBeCloseTo(round1Floor, 3);
      // ...and the candidate's own reported gain is what actually cleared
      // that (different) floor.
      expect(blocked.deltaTeamDps).toBeGreaterThan(plan.noiseFloorTeamDps);
    });
  });

  it("never exceeds any budget dimension", () => {
    const inputs = baseInputs({
      stardustOnHand: 20_000,
      slots: [makeSlot({ candyOnHand: 3, xlCandyOnHand: 0 }), makeSlot({ species: HARD_HITTER_B, candyOnHand: 3, xlCandyOnHand: 0 })],
      rareCandyOnHand: 5,
      rareCandyXlOnHand: 0,
    });
    const plan = planPowerUpBudget(inputs);

    expect(plan.ledger.stardust.remaining).toBeGreaterThanOrEqual(0);
    for (const entry of [...plan.ledger.ownCandy, ...plan.ledger.ownXlCandy]) {
      expect(entry.remaining).toBeGreaterThanOrEqual(0);
    }
    expect(plan.ledger.sharedRareCandy.remaining).toBeGreaterThanOrEqual(0);
    expect(plan.ledger.sharedRareCandyXl.remaining).toBeGreaterThanOrEqual(0);

    // Reconstruct total spend directly from the step list (independent of
    // the ledger) and confirm it never exceeds what was actually on hand.
    let stardustSpent = 0;
    const ownCandySpent = [0, 0];
    const ownXlSpent = [0, 0];
    let sharedCandySpent = 0;
    let sharedXlSpent = 0;
    for (const step of plan.steps) {
      stardustSpent += step.cost.stardust;
      ownCandySpent[step.slotIndex]! += step.ownCandySpent;
      ownXlSpent[step.slotIndex]! += step.ownXlCandySpent;
      sharedCandySpent += step.sharedCandySpent;
      sharedXlSpent += step.sharedXlCandySpent;
    }
    expect(stardustSpent).toBeLessThanOrEqual(inputs.stardustOnHand);
    expect(ownCandySpent[0]).toBeLessThanOrEqual(inputs.slots[0]!.candyOnHand);
    expect(ownCandySpent[1]).toBeLessThanOrEqual(inputs.slots[1]!.candyOnHand);
    expect(sharedCandySpent).toBeLessThanOrEqual(inputs.rareCandyOnHand!);
    expect(sharedXlSpent).toBeLessThanOrEqual(inputs.rareCandyXlOnHand!);
  });

  it("spends a slot's own candy before ever drawing on the shared rare-candy pool", () => {
    // A single fielded slot, so every committed step is unambiguously this
    // slot's — no cross-slot competition to reason about.
    const plan = planPowerUpBudget(
      baseInputs({
        slots: [makeSlot({ candyOnHand: 2 })],
        stardustOnHand: 500_000,
        rareCandyOnHand: 200,
        maxLevel: 30,
      }),
    );
    expect(plan.steps.length).toBeGreaterThan(0);

    let ownRemaining = 2;
    for (const step of plan.steps) {
      expect(step.slotIndex).toBe(0);
      // Own candy is drawn down to its floor before the shared pool covers
      // the rest of THIS SAME step's cost, if any is left over.
      expect(step.ownCandySpent).toBe(Math.min(step.cost.candy, ownRemaining));
      expect(step.sharedCandySpent).toBe(step.cost.candy - step.ownCandySpent);
      ownRemaining -= step.ownCandySpent;
    }
    expect(ownRemaining).toBe(0); // this slot's own candy was fully exhausted by the end
    expect(plan.steps.some((s) => s.sharedCandySpent > 0)).toBe(true); // ...and the shared pool WAS actually drawn on
  });

  it("`final` genuinely re-measures the finished roster rather than summing steps[].deltaTeamDps", () => {
    const inputs = baseInputs({ iterations: 3 });
    const plan = planPowerUpBudget(inputs);
    expect(plan.steps.length).toBeGreaterThan(0); // otherwise this test would prove nothing

    // Independently reconstruct the finished roster (same species/ivs/moves,
    // each slot's FINAL level) and ask optimizePowerUps — a completely
    // separate code path — to measure ITS baseline over the identical seed
    // set. If planPowerUpBudget's `final` were instead built by summing
    // steps[].deltaTeamDps onto `baseline`, there would be no reason for it
    // to land on exactly this independently-measured value.
    const finalSlots = inputs.slots.map((slot, i) => ({ ...slot, level: plan.finalLevels[i]!.toLevel! }));
    const verification = optimizePowerUps({ ...inputs, slots: finalSlots });
    expect(plan.final).toEqual(verification.baseline);

    // Also true under this engine's deterministic seeding, and asserted
    // here as a documented consequence rather than an unstated invariant:
    // the LAST committed step's own cumulativeTeamDps was itself measured
    // on this exact finished roster, so it must agree with `final` exactly.
    expect(plan.final.teamDps).toBe(plan.steps[plan.steps.length - 1]!.cumulativeTeamDps);
  });

  it("is deterministic across two identical calls", () => {
    const inputs = baseInputs();
    const first = planPowerUpBudget(inputs);
    const second = planPowerUpBudget(inputs);
    expect(second).toEqual(first);
  });

  describe("dominated-level candidate reduction (usefulPowerUpLevelsAbove)", () => {
    // A boss WITH a charged move this time (unlike NO_CHARGE_BOSS above) so
    // survivalChargedHits is meaningful, sampling a realistic mid-level
    // range (20 -> 30) on a real-shaped roster.
    const BOSS_CHARGED_MOVE: ChargedMove = {
      id: "dom-boss-charged",
      name: "Dom Boss Charged",
      type: "normal",
      power: 60,
      energyCost: 50,
      durationSeconds: 2,
      vulnerableWindowSeconds: 2,
    };
    const DOM_BOSS: SpeciesDefinition = {
      id: "dom-boss",
      name: "Dom Boss",
      types: ["normal"],
      baseAttack: 180,
      baseDefense: 180,
      baseStamina: 3000,
      fastMoves: [{ id: "dom-boss-fast", name: "Dom Boss Fast", type: "normal", power: 10, energyGain: 3, durationSeconds: 1 }],
      chargedMoves: [BOSS_CHARGED_MOVE],
      statsArePrecomputed: true,
    };
    const DOM_SLOT: SpeciesDefinition = {
      id: "dom-slot",
      name: "Dom Slot",
      types: ["normal"],
      baseAttack: 180,
      baseDefense: 150,
      baseStamina: 160,
      fastMoves: [{ id: "dom-fast", name: "Dom Fast", type: "normal", power: 7, energyGain: 3, durationSeconds: 0.5 }],
      chargedMoves: [{ id: "dom-charged", name: "Dom Charged", type: "normal", power: 90, energyCost: 40, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
    };

    const fromLevel = 20;
    const maxLevel = 30;
    const fastMove = DOM_SLOT.fastMoves[0]!;
    const chargedMove = DOM_SLOT.chargedMoves[0]!;
    const bossFastMove = DOM_BOSS.fastMoves[0]!;
    // The SAME boss effective stats optimizePowerUps itself derives
    // internally (bossEffectiveStats) — using different stand-in numbers
    // here would classify "useful" levels against a boss that isn't the one
    // actually simulated below, which is exactly the mismatch this test
    // caught and fixed during development.
    const { attack: domBossAttackStat, defense: domBossDefenseStat } = bossEffectiveStats(DOM_BOSS);

    it("excludes at least one real dominated level from a realistic level range", () => {
      const allLevels = powerUpLevelsAbove(table, fromLevel).filter((l) => l <= maxLevel);
      const useful = usefulPowerUpLevelsAbove({
        species: DOM_SLOT,
        ivs: PERFECT_IVS,
        fastMove,
        chargedMove,
        outgoingFastMoveDamageModifiers: { stab: true, typeEffectiveness: 1 },
        outgoingChargedMoveDamageModifiers: { stab: true, typeEffectiveness: 1 },
        bossFastMove,
        bossChargedMove: BOSS_CHARGED_MOVE,
        bossAttackStat: domBossAttackStat,
        bossDefenseStat: domBossDefenseStat,
        incomingFastMoveDamageModifiers: { stab: true, typeEffectiveness: 1 },
        incomingChargedMoveDamageModifiers: { stab: true, typeEffectiveness: 1 },
        table,
        fromLevel,
        maxLevel,
      });

      // Sanity: useful is a strict, non-trivial subset of all levels in
      // range — otherwise the "dominated" sample below would be empty and
      // this test would prove nothing.
      expect(useful.length).toBeGreaterThan(0);
      expect(useful.length).toBeLessThan(allLevels.length);
      for (const level of useful) expect(allLevels).toContain(level);

      const dominated = allLevels.filter((l) => !useful.includes(l));
      expect(dominated.length).toBeGreaterThan(0);

      // EMPIRICAL CHECK (not an assumption): each sampled dominated level's
      // REAL simulated team DPS, measured the same way optimizePowerUps
      // measures any single power-up, sits within the noise floor of the
      // level directly below it — i.e. it is genuinely unmeasurable, not
      // merely "small." Sample up to 3 to keep this fast.
      for (const dominatedLevel of dominated.slice(0, 3)) {
        const result = optimizePowerUps({
          slots: [
            {
              species: DOM_SLOT,
              fastMoveId: null,
              chargedMoveId: null,
              isMega: false,
              level: dominatedLevel - 0.5,
              ivs: PERFECT_IVS,
              costModifiers: NO_MODIFIERS,
              candyOnHand: 1000,
              xlCandyOnHand: 1000,
            },
          ],
          boss: DOM_BOSS,
          dodge: { kind: "perfect" },
          bossChargedMoveMeanIntervalSeconds: 5,
          raidTimerSeconds: 180,
          costTable: table,
          stardustOnHand: 1_000_000,
          maxLevel: dominatedLevel,
          iterations: 30,
          seed: 1,
        });
        expect(result.candidates).toHaveLength(1);
        expect(Math.abs(result.candidates[0]!.deltaTeamDps)).toBeLessThanOrEqual(result.noiseFloorTeamDps);
      }
    });
  });
});

// =============================================================================
// === megaLevel follow-up (2026-09-09) — closing the two gaps flagged when
// === Super Max "+" moves / Mega Level first shipped: powerUpDamageLadder and
// === planPowerUpBudget's actual simulation (via toTeamRaidSlotsAtLevels)
// === both silently assumed Base Mega Level regardless of a slot's own
// === TeamRaidSlotInput.megaLevel. See CHANGELOG notes on powerUpDamageLadder
// === and toTeamRaidSlotsAtLevels in src/powerUp.ts for the two fixes.
// =============================================================================

describe("powerUpDamageLadder — megaLevel (2026-09-09 follow-up: Gap 1)", () => {
  const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
  const ivs = { attack: 15, defense: 15, stamina: 15 };
  const fastMove: FastMove = { id: "ladder-mega-fast", name: "Ladder Mega Fast", type: "normal", power: 9, energyGain: 3, durationSeconds: 1 };
  // A "+" move at Base-tier power 100 — Math.round(100 * 1.3) === 130 exactly
  // (verified via node, no floating-point rounding ambiguity), so the
  // super-max expectation below is a clean, checkable number.
  const plusMove: ChargedMove = {
    id: "ladder-plus-move",
    name: "Ladder Plus Move",
    type: "normal",
    power: 100,
    energyCost: 50,
    durationSeconds: 2,
    vulnerableWindowSeconds: 2,
    isPlusMove: true,
    plusMovePowerConfidence: "community-estimate",
  };
  const megaSpecies: SpeciesDefinition = {
    id: "ladder-mega-species",
    name: "Ladder Mega Species",
    types: ["normal"],
    baseAttack: 220,
    baseDefense: 150,
    baseStamina: 180,
    fastMoves: [fastMove],
    chargedMoves: [plusMove],
    boost: { multiplier: 1.3, boostedType: "normal" },
  };
  const nonMegaSpecies: SpeciesDefinition = { ...megaSpecies, id: "ladder-non-mega-species", boost: undefined };

  function ladderFor(species: SpeciesDefinition, megaLevel: MegaLevel | null | undefined) {
    return powerUpDamageLadder({
      species,
      ivs,
      fromLevel: 40,
      fastMove,
      chargedMove: plusMove,
      megaLevel,
      bossDefenseStat: 150,
      fastMoveDamageModifiers: { stab: true },
      chargedMoveDamageModifiers: { stab: true },
      table,
      modifiers: NO_MODIFIERS,
    });
  }

  it("omitting megaLevel is byte-identical to explicit undefined/null/'base' (defaults constraint)", () => {
    const omitted = powerUpDamageLadder({
      species: megaSpecies,
      ivs,
      fromLevel: 40,
      fastMove,
      chargedMove: plusMove,
      bossDefenseStat: 150,
      fastMoveDamageModifiers: { stab: true },
      chargedMoveDamageModifiers: { stab: true },
      table,
      modifiers: NO_MODIFIERS,
    });
    expect(ladderFor(megaSpecies, undefined)).toEqual(omitted);
    expect(ladderFor(megaSpecies, null)).toEqual(omitted);
    expect(ladderFor(megaSpecies, "base")).toEqual(omitted);
  });

  it("has no effect at all on a species with no boost mechanic, regardless of what megaLevel is requested", () => {
    expect(ladderFor(nonMegaSpecies, "super-max")).toEqual(ladderFor(nonMegaSpecies, undefined));
  });

  it("super-max's current step matches effectiveStatsAtLevel/calculateDamage computed independently at the +2 effective level with the '+' move's scaled power — proves the composition, not just 'it changed'", () => {
    const ladder = ladderFor(megaSpecies, "super-max");
    const { attack } = effectiveStatsAtLevel(megaSpecies, ivs, 42); // effectiveLevelForMegaLevel(40, "super-max") — pinned in megaLevel.test.ts
    const scaledPower = chargedMoveAtMegaLevel(plusMove, "super-max").power;
    expect(scaledPower).toBe(130);
    expect(ladder.current.level).toBe(40); // the real power-up level is NEVER shifted — only stats/move-power are
    expect(ladder.current.attackStat).toBe(attack);
    expect(ladder.current.chargedMoveDamage).toBe(
      calculateDamage({ power: scaledPower, attackerAttackStat: attack, defenderDefenseStat: 150, stab: true }),
    );
    // The fast move (not a "+" move) is untouched beyond the shared effective-level stat bump.
    expect(ladder.current.fastMoveDamage).toBe(
      calculateDamage({ power: fastMove.power, attackerAttackStat: attack, defenderDefenseStat: 150, stab: true }),
    );
  });

  it("super-max never decreases fast damage and strictly increases charged damage (the '+' move's own 30% power jump plus the +2 effective level, vs. only a +2 effective level for the ordinary fast move) over no megaLevel at all, at the same real level", () => {
    const base = ladderFor(megaSpecies, undefined);
    const superMax = ladderFor(megaSpecies, "super-max");
    // Fast move damage is floored (calculateDamage) and this move's power is
    // small enough that +2 effective levels doesn't necessarily cross a
    // breakpoint at THIS specific level/IV combination — see the previous
    // test for the exact (non-monotonic-looking but fully explained) numbers
    // via independent calculateDamage calls. Never DECREASES, though.
    expect(superMax.current.fastMoveDamage).toBeGreaterThanOrEqual(base.current.fastMoveDamage);
    expect(superMax.current.chargedMoveDamage).toBeGreaterThan(base.current.chargedMoveDamage);
  });
});

describe("powerUpLevelMetrics — megaLevel (2026-09-09 follow-up: Gap 1)", () => {
  // powerUpLevelMetrics backs BOTH planPowerUpBudget's dominated-level search
  // (usefulPowerUpLevelsAbove) and rosterPlanner.ts's Stage-3 proxyDps — a
  // single fix here covers both call sites.
  const ivs = { attack: 15, defense: 15, stamina: 15 };
  const fastMove: FastMove = { id: "metrics-mega-fast", name: "Metrics Mega Fast", type: "normal", power: 9, energyGain: 3, durationSeconds: 1 };
  const plusMove: ChargedMove = {
    id: "metrics-plus-move",
    name: "Metrics Plus Move",
    type: "normal",
    power: 100,
    energyCost: 50,
    durationSeconds: 2,
    vulnerableWindowSeconds: 2,
    isPlusMove: true,
    plusMovePowerConfidence: "community-estimate",
  };
  const megaSpecies: SpeciesDefinition = {
    id: "metrics-mega-species",
    name: "Metrics Mega Species",
    types: ["normal"],
    baseAttack: 220,
    baseDefense: 150,
    baseStamina: 180,
    fastMoves: [fastMove],
    chargedMoves: [plusMove],
    boost: { multiplier: 1.3, boostedType: "normal" },
  };
  const nonMegaSpecies: SpeciesDefinition = { ...megaSpecies, id: "metrics-non-mega-species", boost: undefined };
  const bossFastMove: FastMove = { id: "metrics-boss-fast", name: "Metrics Boss Fast", type: "normal", power: 10, energyGain: 0, durationSeconds: 1.5 };

  function metricsFor(species: SpeciesDefinition, level: number, megaLevel: MegaLevel | null | undefined) {
    return powerUpLevelMetrics({
      species,
      ivs,
      level,
      fastMove,
      chargedMove: plusMove,
      megaLevel,
      outgoingFastMoveDamageModifiers: { stab: true },
      outgoingChargedMoveDamageModifiers: { stab: true },
      bossFastMove,
      bossChargedMove: undefined,
      bossAttackStat: 150,
      bossDefenseStat: 150,
      incomingFastMoveDamageModifiers: { stab: false },
    });
  }

  it("reports the real (unshifted) level, but computes outgoing damage at the +2 effective level with the '+' move's scaled power", () => {
    const metrics = metricsFor(megaSpecies, 40, "super-max");
    expect(metrics.level).toBe(40);
    const { attack } = effectiveStatsAtLevel(megaSpecies, ivs, 42);
    expect(metrics.outgoingFastDamage).toBe(
      calculateDamage({ power: fastMove.power, attackerAttackStat: attack, defenderDefenseStat: 150, stab: true }),
    );
    expect(metrics.outgoingChargedDamage).toBe(
      calculateDamage({
        power: chargedMoveAtMegaLevel(plusMove, "super-max").power,
        attackerAttackStat: attack,
        defenderDefenseStat: 150,
        stab: true,
      }),
    );
  });

  it("has no effect on a species with no boost mechanic", () => {
    expect(metricsFor(nonMegaSpecies, 40, "super-max")).toEqual(metricsFor(nonMegaSpecies, 40, undefined));
  });

  it("omitting megaLevel is byte-identical to explicit undefined/null/'base' (defaults constraint)", () => {
    const omitted = powerUpLevelMetrics({
      species: megaSpecies,
      ivs,
      level: 40,
      fastMove,
      chargedMove: plusMove,
      outgoingFastMoveDamageModifiers: { stab: true },
      outgoingChargedMoveDamageModifiers: { stab: true },
      bossFastMove,
      bossChargedMove: undefined,
      bossAttackStat: 150,
      bossDefenseStat: 150,
      incomingFastMoveDamageModifiers: { stab: false },
    });
    expect(metricsFor(megaSpecies, 40, undefined)).toEqual(omitted);
    expect(metricsFor(megaSpecies, 40, null)).toEqual(omitted);
    expect(metricsFor(megaSpecies, 40, "base")).toEqual(omitted);
  });
});

describe("optimizePowerUps — the displayed ladder reflects the slot's own megaLevel (2026-09-09 follow-up: Gap 1)", () => {
  const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
  const ivs = { attack: 15, defense: 15, stamina: 15 };
  const fastMove: FastMove = { id: "opt-mega-fast", name: "Opt Mega Fast", type: "normal", power: 9, energyGain: 3, durationSeconds: 1 };
  const plusMove: ChargedMove = {
    id: "opt-plus-move",
    name: "Opt Plus Move",
    type: "normal",
    power: 100,
    energyCost: 50,
    durationSeconds: 2,
    vulnerableWindowSeconds: 2,
    isPlusMove: true,
    plusMovePowerConfidence: "community-estimate",
  };
  const megaSpecies: SpeciesDefinition = {
    id: "opt-mega-species",
    name: "Opt Mega Species",
    types: ["normal"],
    baseAttack: 220,
    baseDefense: 150,
    baseStamina: 180,
    fastMoves: [fastMove],
    chargedMoves: [plusMove],
    boost: { multiplier: 1.3, boostedType: "normal" },
  };
  const boss: SpeciesDefinition = {
    id: "opt-mega-boss",
    name: "Opt Mega Boss",
    types: ["normal"],
    baseAttack: 150,
    baseDefense: 150,
    baseStamina: 5000,
    fastMoves: [{ id: "opt-mega-boss-fast", name: "Opt Mega Boss Fast", type: "normal", power: 10, energyGain: 0, durationSeconds: 1.5 }],
    chargedMoves: [],
    statsArePrecomputed: true,
  };

  function slotAt(megaLevel: MegaLevel | undefined): PowerUpSlotInput {
    return {
      species: megaSpecies,
      fastMoveId: null,
      chargedMoveId: null,
      isMega: true,
      level: 40,
      ivs,
      megaLevel,
      costModifiers: NO_MODIFIERS,
      candyOnHand: 1_000_000,
      xlCandyOnHand: 1_000_000,
    };
  }

  function run(megaLevel: MegaLevel | undefined) {
    return optimizePowerUps({
      slots: [slotAt(megaLevel)],
      boss,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 60,
      costTable: table,
      stardustOnHand: 1_000_000_000,
      iterations: 1,
      seed: 1,
    });
  }

  it("the ladder actually responds to the slot's own megaLevel, and agrees EXACTLY with a direct powerUpDamageLadder call using the real per-move modifiers this module itself computes", () => {
    const withoutMegaLevel = run(undefined);
    const withSuperMax = run("super-max");

    // The core symptom this closes: the displayed ladder must respond to the
    // slot's own megaLevel, not silently assume Base Mega Level. The "+"
    // move's own power scaling makes the charged-move increase unconditional;
    // the ordinary fast move's floored damage only strictly increases when
    // the +2 effective level happens to cross a breakpoint (not guaranteed at
    // every level/IV combination — see powerUpDamageLadder's own megaLevel
    // describe block for the exact-equality version of this check).
    expect(withSuperMax.ladders[0]!.current.chargedMoveDamage).toBeGreaterThan(withoutMegaLevel.ladders[0]!.current.chargedMoveDamage);
    expect(withSuperMax.ladders[0]!.current.fastMoveDamage).toBeGreaterThanOrEqual(withoutMegaLevel.ladders[0]!.current.fastMoveDamage);

    // Agrees EXACTLY with calling powerUpDamageLadder directly at the same
    // megaLevel, using typeEffectiveness/ownBoostMultiplier/isWeatherBoosted
    // the same way optimizePowerUps' own ladder-building code does — this is
    // the "ladder matches what the simulation actually did" check, not just
    // "it changed".
    const { defense: bossDefenseStat } = bossEffectiveStats(boss);
    const expected = powerUpDamageLadder({
      species: megaSpecies,
      ivs,
      fromLevel: 40,
      fastMove,
      chargedMove: plusMove,
      megaLevel: "super-max",
      bossDefenseStat,
      fastMoveDamageModifiers: {
        stab: megaSpecies.types.includes(fastMove.type),
        typeEffectiveness: typeEffectiveness(fastMove.type, boss.types),
        megaBoostMultiplier: ownBoostMultiplier(megaSpecies.boost, fastMove.type),
        weatherBoosted: isWeatherBoosted(fastMove.type, "none"),
      },
      chargedMoveDamageModifiers: {
        stab: megaSpecies.types.includes(plusMove.type),
        typeEffectiveness: typeEffectiveness(plusMove.type, boss.types),
        megaBoostMultiplier: ownBoostMultiplier(megaSpecies.boost, plusMove.type),
        weatherBoosted: isWeatherBoosted(plusMove.type, "none"),
      },
      table,
      modifiers: NO_MODIFIERS,
    });
    expect(withSuperMax.ladders[0]).toEqual(expected);
  });

  it("optimizePowerUps' actual simulated fight for this slot also benefits from megaLevel — the ladder and the simulation now agree on direction", () => {
    const withoutMegaLevel = run(undefined);
    const withSuperMax = run("super-max");
    expect(withSuperMax.baseline.teamDps).toBeGreaterThan(withoutMegaLevel.baseline.teamDps);
  });

  it("omitting megaLevel on the slot is byte-identical to megaLevel: undefined (defaults constraint)", () => {
    const omitted = optimizePowerUps({
      slots: [
        {
          species: megaSpecies,
          fastMoveId: null,
          chargedMoveId: null,
          isMega: true,
          level: 40,
          ivs,
          costModifiers: NO_MODIFIERS,
          candyOnHand: 1_000_000,
          xlCandyOnHand: 1_000_000,
        },
      ],
      boss,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 60,
      costTable: table,
      stardustOnHand: 1_000_000_000,
      iterations: 1,
      seed: 1,
    });
    expect(run(undefined)).toEqual(omitted);
  });
});

describe("planPowerUpBudget — megaLevel now reaches the actual simulation (2026-09-09 bug fix: toTeamRaidSlotsAtLevels used to silently drop it)", () => {
  const table = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
  const ivs = { attack: 15, defense: 15, stamina: 15 };
  const megaSpecies: SpeciesDefinition = {
    id: "budget-mega-species",
    name: "Budget Mega Species",
    types: ["normal"],
    baseAttack: 220,
    baseDefense: 150,
    baseStamina: 180,
    fastMoves: [{ id: "budget-mega-fast", name: "Budget Mega Fast", type: "normal", power: 9, energyGain: 3, durationSeconds: 1 }],
    chargedMoves: [
      {
        id: "budget-plus-move",
        name: "Budget Plus Move",
        type: "normal",
        power: 100,
        energyCost: 50,
        durationSeconds: 2,
        vulnerableWindowSeconds: 2,
        isPlusMove: true,
        plusMovePowerConfidence: "community-estimate",
      },
    ],
    boost: { multiplier: 1.3, boostedType: "normal" },
  };
  // Never clears and barely scratches the attacker — isolates own-damage
  // output across the FULL raidTimerSeconds window, the same technique
  // teamRaid.test.ts's own "TeamRaidSlotInput.megaLevel" describe block uses.
  const tankyBoss: SpeciesDefinition = {
    id: "budget-mega-boss",
    name: "Budget Mega Boss",
    types: ["normal"],
    baseAttack: 1,
    baseDefense: 200,
    baseStamina: 1_000_000,
    fastMoves: [{ id: "budget-boss-fast", name: "Budget Boss Fast", type: "normal", power: 1, energyGain: 0, durationSeconds: 2 }],
    chargedMoves: [],
    statsArePrecomputed: true,
  };

  function baselineFor(megaLevel: MegaLevel | undefined) {
    return planPowerUpBudget({
      slots: [
        {
          species: megaSpecies,
          fastMoveId: null,
          chargedMoveId: null,
          isMega: true,
          level: 40,
          ivs,
          megaLevel,
          costModifiers: NO_MODIFIERS,
          candyOnHand: 0,
          xlCandyOnHand: 0,
        },
      ],
      boss: tankyBoss,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 180,
      costTable: table,
      stardustOnHand: 0, // nothing affordable — isolates the do-nothing BASELINE simulation itself
      iterations: 5,
      seed: 1,
    }).baseline;
  }

  it("the baseline (do-nothing) simulated team DPS is measurably higher at super-max than with no megaLevel set, at the SAME fixed level — proves toTeamRaidSlotsAtLevels now forwards megaLevel into the real simulation, not just the ladder", () => {
    const withoutMegaLevel = baselineFor(undefined);
    const withSuperMax = baselineFor("super-max");
    expect(withSuperMax.teamDps).toBeGreaterThan(withoutMegaLevel.teamDps);
  });

  it("omitting megaLevel is byte-identical to explicit undefined, across the whole plan (defaults constraint)", () => {
    const inputsWithout = (megaLevel: MegaLevel | undefined): PowerUpBudgetInputs => ({
      slots: [
        {
          species: megaSpecies,
          fastMoveId: null,
          chargedMoveId: null,
          isMega: true,
          level: 40,
          ivs,
          megaLevel,
          costModifiers: NO_MODIFIERS,
          candyOnHand: 1000,
          xlCandyOnHand: 1000,
        },
      ],
      boss: tankyBoss,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 180,
      costTable: table,
      stardustOnHand: 1_000_000_000,
      iterations: 3,
      seed: 1,
    });
    const omitted = planPowerUpBudget({
      slots: [
        {
          species: megaSpecies,
          fastMoveId: null,
          chargedMoveId: null,
          isMega: true,
          level: 40,
          ivs,
          costModifiers: NO_MODIFIERS,
          candyOnHand: 1000,
          xlCandyOnHand: 1000,
        },
      ],
      boss: tankyBoss,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 180,
      costTable: table,
      stardustOnHand: 1_000_000_000,
      iterations: 3,
      seed: 1,
    });
    expect(planPowerUpBudget(inputsWithout(undefined))).toEqual(omitted);
  });
});
