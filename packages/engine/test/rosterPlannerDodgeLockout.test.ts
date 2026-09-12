import { describe, expect, it } from "vitest";
import { powerUpCostTableFromGameMaster, type PowerUpCostTable } from "../src/powerUp.js";
import { planRosterBudget, runRosterPlanner, type RosterBudgetInputs, type RosterEntry, type RosterPlannerInputs } from "../src/rosterPlanner.js";
import type { IVSpread } from "../src/types.js";
import { NO_MODIFIERS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, RAW_POKEMON_UPGRADE_SETTINGS } from "./fixtures/powerUpCosts.js";
import { BOSS_HALF_SECOND_FAST_MOVE, BOSS_ONE, STRONG_SPECIES, WEAK_BENCH_SPECIES } from "./fixtures/rosterPlannerFixtures.js";

/**
 * IDEAS-adjacent gap closure: single-raid `powerUp.ts` already surfaces
 * "this boss's fast move is too fast to fast-dodge" (see
 * simulate.ts's StepwiseRunResult.dodgeFastAttacksLockout /
 * breakpoints.ts's fastMoveCadenceTooFastToDodge) but multi-raid mode
 * couldn't, because RosterPerBossImpact carried no equivalent field. These
 * tests pin the new RosterPerBossImpact.dodgeFastAttacksLockout fact and the
 * RosterPlanResult/RosterBudgetPlan.lockedBossCount aggregate against
 * BOSS_HALF_SECOND_FAST_MOVE (fast move duration EXACTLY DODGE_COST_SECONDS,
 * the documented `<=` boundary) vs. BOSS_ONE (1.0s, never locked).
 */

const TABLE: PowerUpCostTable = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
const IVS: IVSpread = { attack: 15, defense: 15, stamina: 15 };

function entry(id: string, species: RosterEntry["species"], level: number, overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    entryId: id,
    species,
    fastMoveId: null,
    chargedMoveId: null,
    level,
    ivs: IVS,
    costModifiers: NO_MODIFIERS,
    canMega: false,
    ivsAreApproximate: false,
    levelIsApproximate: false,
    movesetIsDefaulted: false,
    candyFamilyId: `FAMILY_${id.toUpperCase()}`,
    ...overrides,
  };
}

function baseInputs(overrides: Partial<RosterPlannerInputs> = {}): Omit<RosterPlannerInputs, "pool" | "targets"> {
  return {
    costTable: TABLE,
    stardustOnHand: 1_000_000,
    candyByFamilyId: {},
    dodge: { kind: "none" },
    bossChargedMoveMeanIntervalSeconds: 3,
    raidTimerSeconds: 300,
    screenIterations: 4,
    iterations: 5,
    swapCostSeconds: 0,
    ...overrides,
  };
}

function strongTeam(level = 20): RosterEntry[] {
  return STRONG_SPECIES.map((sp, i) => entry(`strong-${i}`, sp, level));
}

function generousCandyFor(pool: RosterEntry[]): Record<string, { candy: number; xlCandy: number }> {
  const out: Record<string, { candy: number; xlCandy: number }> = {};
  for (const e of pool) out[e.candyFamilyId!] = { candy: 1_000_000, xlCandy: 1_000_000 };
  return out;
}

describe("runRosterPlanner — dodgeFastAttacksLockout", () => {
  it("flags every candidate's perBoss entry for a boss whose fast move is exactly 0.5s (the documented <= boundary) when dodgeFastAttacks is on", () => {
    const pool = strongTeam(20);
    const result = runRosterPlanner({
      ...baseInputs({ dodgeFastAttacks: true }),
      pool,
      targets: [{ species: BOSS_HALF_SECOND_FAST_MOVE, weight: 1 }],
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.candidates) {
      expect(candidate.perBoss).toHaveLength(1);
      expect(candidate.perBoss[0]!.bossId).toBe(BOSS_HALF_SECOND_FAST_MOVE.id);
      expect(candidate.perBoss[0]!.dodgeFastAttacksLockout).toBe(true);
    }
    expect(result.lockedBossCount).toBe(1);
  });

  it("does NOT flag the same 0.5s boss when dodgeFastAttacks is off", () => {
    const pool = strongTeam(20);
    const result = runRosterPlanner({
      ...baseInputs({ dodgeFastAttacks: false }),
      pool,
      targets: [{ species: BOSS_HALF_SECOND_FAST_MOVE, weight: 1 }],
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.candidates) {
      expect(candidate.perBoss[0]!.dodgeFastAttacksLockout).toBe(false);
    }
    expect(result.lockedBossCount).toBe(0);
  });

  it("never flags a 1.0s-fast-move boss (BOSS_ONE) even with dodgeFastAttacks on", () => {
    const pool = strongTeam(20);
    const result = runRosterPlanner({
      ...baseInputs({ dodgeFastAttacks: true }),
      pool,
      targets: [{ species: BOSS_ONE, weight: 1 }],
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.candidates) {
      expect(candidate.perBoss[0]!.dodgeFastAttacksLockout).toBe(false);
    }
    expect(result.lockedBossCount).toBe(0);
  });

  it("lockedBossCount reflects a PARTIAL lockout across a mixed boss set — a plain count, not a pre-baked verdict", () => {
    const pool = strongTeam(20);
    const result = runRosterPlanner({
      ...baseInputs({ dodgeFastAttacks: true }),
      pool,
      targets: [
        { species: BOSS_HALF_SECOND_FAST_MOVE, weight: 1 },
        { species: BOSS_ONE, weight: 1 },
      ],
    });

    expect(result.lockedBossCount).toBe(1);
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.candidates) {
      const half = candidate.perBoss.find((p) => p.bossId === BOSS_HALF_SECOND_FAST_MOVE.id)!;
      const one = candidate.perBoss.find((p) => p.bossId === BOSS_ONE.id)!;
      expect(half.dodgeFastAttacksLockout).toBe(true);
      expect(one.dodgeFastAttacksLockout).toBe(false);
    }
  });

  it("hypotheticalCatches rows carry the same per-boss fact (RosterPerBossImpact is shared)", () => {
    const pool = strongTeam(20);
    const result = runRosterPlanner({
      ...baseInputs({ dodgeFastAttacks: true }),
      pool,
      targets: [{ species: BOSS_HALF_SECOND_FAST_MOVE, weight: 1 }],
      hypotheticalCatches: [
        { id: "hypothetical:test", species: WEAK_BENCH_SPECIES, level: 20, ivs: IVS, fastMoveId: null, chargedMoveId: null },
      ],
    });

    expect(result.hypotheticalCatches).toHaveLength(1);
    expect(result.hypotheticalCatches[0]!.perBoss[0]!.dodgeFastAttacksLockout).toBe(true);
  });
});

describe("planRosterBudget — dodgeFastAttacksLockout", () => {
  it("flags a committed step's perBoss entry for the 0.5s boss when dodgeFastAttacks is on, and reports lockedBossCount", () => {
    const pool = [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)];
    const plan = planRosterBudget({
      ...(baseInputs({
        dodgeFastAttacks: true,
        candyByFamilyId: generousCandyFor(pool),
        stardustOnHand: 2_000_000,
        screenIterations: 5,
        iterations: 8,
      }) as Omit<RosterBudgetInputs, "pool" | "targets">),
      pool,
      targets: [{ species: BOSS_HALF_SECOND_FAST_MOVE, weight: 1 }],
    });

    expect(plan.steps.length).toBeGreaterThan(0);
    for (const step of plan.steps) {
      expect(step.perBoss).toHaveLength(1);
      expect(step.perBoss[0]!.dodgeFastAttacksLockout).toBe(true);
    }
    expect(plan.lockedBossCount).toBe(1);
  });

  it("does not flag BOSS_ONE (1.0s) even with dodgeFastAttacks on, and lockedBossCount is 0", () => {
    const pool = [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)];
    const plan = planRosterBudget({
      ...(baseInputs({
        dodgeFastAttacks: true,
        candyByFamilyId: generousCandyFor(pool),
        stardustOnHand: 2_000_000,
        screenIterations: 5,
        iterations: 8,
      }) as Omit<RosterBudgetInputs, "pool" | "targets">),
      pool,
      targets: [{ species: BOSS_ONE, weight: 1 }],
    });

    expect(plan.lockedBossCount).toBe(0);
    for (const step of plan.steps) {
      expect(step.perBoss[0]!.dodgeFastAttacksLockout).toBe(false);
    }
  });

  it("lockedBossCount is computed up front from config alone — present even when the search commits zero steps", () => {
    const pool = strongTeam(25);
    const plan = planRosterBudget({
      ...(baseInputs({
        dodgeFastAttacks: true,
        candyByFamilyId: generousCandyFor(pool),
        // Nothing left to spend — the search should commit no steps at all,
        // but the lockout fact is config-level and unaffected by that.
        stardustOnHand: 0,
      }) as Omit<RosterBudgetInputs, "pool" | "targets">),
      pool,
      targets: [{ species: BOSS_HALF_SECOND_FAST_MOVE, weight: 1 }],
    });

    expect(plan.lockedBossCount).toBe(1);
  });
});
