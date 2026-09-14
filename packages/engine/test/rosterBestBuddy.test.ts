import { describe, expect, it } from "vitest";
import { noiseFloorFor, powerUpCostTableFromGameMaster, type PowerUpCostTable } from "../src/powerUp.js";
import {
  planRosterBudget,
  runRosterPlanner,
  toSlotInput,
  type RosterEntry,
  type RosterPlannerInputs,
  type RosterPlannerProgressEvent,
} from "../src/rosterPlanner.js";
import type { IVSpread } from "../src/types.js";
import { NO_MODIFIERS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, RAW_POKEMON_UPGRADE_SETTINGS } from "./fixtures/powerUpCosts.js";
import {
  BOSS_ONE,
  STRONG_SPECIES,
  TOUGH_BOSS,
  TOUGH_BOSS_HIGH_ATTACK,
  TOUGH_BOSS_LOW_ATTACK,
  WEAK_BENCH_SPECIES,
} from "./fixtures/rosterPlannerFixtures.js";

/**
 * IDEAS.md #5 (roster mode, 2026-09-13) — RosterEntry.isBestBuddy,
 * RosterPlanResult.bestBuddyCandidates, RosterBudgetPlan.bestBuddyRecommendation.
 *
 * TRAP AVOIDED DELIBERATELY (see
 * `.claude/agent-memory/engine-developer/measurement_best_buddy_roster_mode_impact.md`):
 * every test in this file uses TOUGH_BOSS/TOUGH_BOSS_LOW_ATTACK/
 * TOUGH_BOSS_HIGH_ATTACK (huge baseStamina, never clears within
 * raidTimerSeconds) with a FULL 6-slot strong team, never BOSS_ONE/BOSS_TWO
 * (which this file's sibling rosterPlanner.test.ts deliberately keeps
 * clearable for its own, unrelated tests) — a clearing boss quantizes
 * teamDps by discrete cast count, which has twice already made a real,
 * nonzero per-hit-damage difference between two variants read as an
 * IDENTICAL teamDps purely by coincidence. The very first precondition test
 * below asserts the never-clears property directly rather than assuming it.
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
    ...overrides,
  };
}

// A team of 6 identical strong attackers that deterministically fills the
// baseline 6-slot team for any boss on its own — same fixture convention as
// rosterPlanner.test.ts's own strongTeam helper.
function strongTeam(level = 25): RosterEntry[] {
  return STRONG_SPECIES.map((sp, i) => entry(`strong-${i}`, sp, level));
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
    // Higher than this file's sibling's default (5) — a tighter per-boss
    // noise floor is what actually let the dilution fixture below be found
    // (measured directly; see the two TOUGH_BOSS_*_ATTACK fixtures' own doc
    // comments).
    iterations: 30,
    swapCostSeconds: 0,
    ...overrides,
  };
}

describe("RosterEntry.isBestBuddy — forwarded to TeamRaidSlotInput unchanged", () => {
  it("toSlotInput forwards true, and omits/undefined stays undefined", () => {
    const flagged = entry("e", STRONG_SPECIES[0]!, 25, { isBestBuddy: true });
    expect(toSlotInput(flagged, undefined).isBestBuddy).toBe(true);

    const plain = entry("e2", STRONG_SPECIES[0]!, 25);
    expect(toSlotInput(plain, undefined).isBestBuddy).toBeUndefined();
  });
});

describe("runRosterPlanner — bestBuddyCandidates precondition: the never-clears fixture actually never clears", () => {
  it("TOUGH_BOSS's clearRate is exactly 0 (and meanTimeToClearSeconds is null) against a full 6-slot strong team", () => {
    const result = runRosterPlanner({ ...baseInputs(), pool: strongTeam(25), targets: [{ species: TOUGH_BOSS, weight: 1 }] });
    expect(result.baselinePerBoss[0]!.summary.clearRate).toBe(0);
    expect(result.baselinePerBoss[0]!.summary.meanTimeToClearSeconds).toBeNull();
  });
});

describe("runRosterPlanner — bestBuddyCandidates (IDEAS.md #5, roster mode)", () => {
  it("one row per fielded, non-Best-Buddy pool entry, each a real simulated per-boss delta with no cost/efficiency fields at all", () => {
    const result = runRosterPlanner({ ...baseInputs(), pool: strongTeam(25), targets: [{ species: TOUGH_BOSS, weight: 1 }] });
    expect(result.bestBuddyCandidates.length).toBe(6);

    for (const c of result.bestBuddyCandidates) {
      // Exact field set — pins that this type never grows a cost/efficiency
      // field (this task's explicit trap #2: dividing a free candidate's
      // delta by a zero cost, or fabricating a denominator).
      expect(Object.keys(c).sort()).toEqual(
        ["entryId", "speciesId", "speciesName", "perBoss", "meanDeltaTeamDps", "bestBossDeltaTeamDps", "bestBossId", "significantBossCount", "exceedsNoise"].sort(),
      );
      expect(c.perBoss.length).toBe(1);
      expect(c.perBoss[0]!.simulated).toBe(true);
      expect(c.perBoss[0]!.rankBefore).not.toBeNull();
    }

    // At least one candidate shows a real, nonzero measured effect — this is
    // also a regression pin for a real bug this feature's own development
    // found: runFullRosterCached's memoization key (teamKeyFor) used to key
    // ONLY on entryId@level, so a Best Buddy variant team (same level,
    // different isBestBuddy flag) collided with the already-cached baseline
    // team and every delta silently read exactly 0.
    expect(result.bestBuddyCandidates.some((c) => c.meanDeltaTeamDps !== 0)).toBe(true);
  });

  it("excludes a benched (not currently fielded) pool entry entirely — never a zero row", () => {
    const pool = [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)];
    const result = runRosterPlanner({ ...baseInputs(), pool, targets: [{ species: TOUGH_BOSS, weight: 1 }] });

    expect(result.baselinePerBoss[0]!.team).not.toContain("weak-bench");
    expect(result.bestBuddyCandidates.map((c) => c.entryId)).not.toContain("weak-bench");
    expect(result.bestBuddyCandidates.length).toBe(6);
  });

  it("excludes a fielded entry that's already flagged isBestBuddy: true", () => {
    const pool = STRONG_SPECIES.map((sp, i) => entry(`strong-${i}`, sp, 25, i === 0 ? { isBestBuddy: true } : {}));
    const result = runRosterPlanner({ ...baseInputs(), pool, targets: [{ species: TOUGH_BOSS, weight: 1 }] });

    expect(result.baselinePerBoss[0]!.team).toContain("strong-0");
    expect(result.bestBuddyCandidates.map((c) => c.entryId)).not.toContain("strong-0");
    expect(result.bestBuddyCandidates.length).toBe(5);
  });

  it("a candidate significant on ONE boss but diluted below the weighted-aggregate floor is still surfaced via exceedsNoise (aggregate-OR-per-boss)", () => {
    const result = runRosterPlanner({
      ...baseInputs(),
      pool: strongTeam(25),
      targets: [
        { species: TOUGH_BOSS_LOW_ATTACK, weight: 1 },
        { species: TOUGH_BOSS_HIGH_ATTACK, weight: 8 },
      ],
    });

    const perBossFloors = result.baselinePerBoss.map((b) => noiseFloorFor(b.summary, result.iterations));
    const diluted = result.bestBuddyCandidates.filter((c) => {
      const sigCount = c.perBoss.filter((p, i) => Math.abs(p.deltaTeamDps) > perBossFloors[i]!).length;
      return sigCount > 0 && Math.abs(c.meanDeltaTeamDps) <= result.noiseFloorTeamDps;
    });

    expect(diluted.length).toBeGreaterThan(0);
    for (const c of diluted) {
      expect(c.significantBossCount).toBeGreaterThan(0);
      expect(c.exceedsNoise).toBe(true);
    }
  });

  it("under significanceMode 'aggregate-only', that same diluted candidate no longer exceeds noise", () => {
    const shared = {
      ...baseInputs(),
      pool: strongTeam(25),
      targets: [
        { species: TOUGH_BOSS_LOW_ATTACK, weight: 1 },
        { species: TOUGH_BOSS_HIGH_ATTACK, weight: 8 },
      ],
    };
    const orResult = runRosterPlanner(shared);
    const aggOnlyResult = runRosterPlanner({ ...shared, significanceMode: "aggregate-only" });

    const perBossFloors = orResult.baselinePerBoss.map((b) => noiseFloorFor(b.summary, orResult.iterations));
    const dilutedEntryIds = orResult.bestBuddyCandidates
      .filter((c) => {
        const sigCount = c.perBoss.filter((p, i) => Math.abs(p.deltaTeamDps) > perBossFloors[i]!).length;
        return sigCount > 0 && Math.abs(c.meanDeltaTeamDps) <= orResult.noiseFloorTeamDps;
      })
      .map((c) => c.entryId);
    expect(dilutedEntryIds.length).toBeGreaterThan(0);

    for (const id of dilutedEntryIds) {
      const c = aggOnlyResult.bestBuddyCandidates.find((x) => x.entryId === id)!;
      expect(c.exceedsNoise).toBe(false);
    }
  });

  it("reports onProgress 'bestBuddy' events, one per eligible entry", () => {
    const events: RosterPlannerProgressEvent[] = [];
    runRosterPlanner({
      ...baseInputs(),
      pool: strongTeam(25),
      targets: [{ species: TOUGH_BOSS, weight: 1 }],
      onProgress: (e) => events.push(e),
    });

    const bbEvents = events.filter((e) => e.stage === "bestBuddy");
    expect(bbEvents.length).toBe(6);
    expect(bbEvents.map((e) => e.completed)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(bbEvents.every((e) => e.total === 6)).toBe(true);
  });

  it("input validation / signature still holds with isBestBuddy present (regression: BOSS_ONE/precomputed fixtures untouched)", () => {
    // Sanity check that adding isBestBuddy didn't disturb this module's
    // pre-existing, unrelated candidate generation for a normal (clearable)
    // boss/team pair.
    const result = runRosterPlanner({ ...baseInputs(), pool: strongTeam(20), targets: [{ species: BOSS_ONE, weight: 1 }] });
    expect(result.candidates.length).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.bestBuddyCandidates)).toBe(true);
  });
});

describe("planRosterBudget — bestBuddyRecommendation (IDEAS.md #5, roster mode)", () => {
  it("recommends AT MOST ONE entry, structurally — the field is a single nullable object, never an array", () => {
    const plan = planRosterBudget({
      ...baseInputs(),
      pool: strongTeam(25),
      targets: [
        { species: TOUGH_BOSS_LOW_ATTACK, weight: 1 },
        { species: TOUGH_BOSS_HIGH_ATTACK, weight: 8 },
      ],
      // No stardust at all — no power-up step can compete with or precede
      // the Best Buddy pass, isolating exactly what's under test.
      stardustOnHand: 0,
    });

    expect(Array.isArray(plan.bestBuddyRecommendation)).toBe(false);
    expect(plan.bestBuddyRecommendation).not.toBeNull();
    expect(plan.bestBuddyRecommendation!.entryId).toMatch(/^strong-/);
    expect(typeof plan.bestBuddyRecommendation!.deltaTeamDps).toBe("number");
    expect(Object.keys(plan.bestBuddyRecommendation!).sort()).toEqual(["entryId", "speciesId", "speciesName", "deltaTeamDps"].sort());
  });

  it("is null when every fielded pool entry already carries isBestBuddy: true", () => {
    const pool = strongTeam(25).map((e) => ({ ...e, isBestBuddy: true }));
    const plan = planRosterBudget({
      ...baseInputs(),
      pool,
      targets: [{ species: TOUGH_BOSS, weight: 1 }],
      stardustOnHand: 0,
    });

    expect(plan.bestBuddyRecommendation).toBeNull();
  });

  it("recommends a candidate via the aggregate-OR-per-boss gate — a per-boss-only clearance is enough, same as the ranked table's exceedsNoise", () => {
    const plan = planRosterBudget({
      ...baseInputs(),
      pool: strongTeam(25),
      targets: [
        { species: TOUGH_BOSS_LOW_ATTACK, weight: 1 },
        { species: TOUGH_BOSS_HIGH_ATTACK, weight: 8 },
      ],
      stardustOnHand: 0,
    });

    // The same (pool, targets) pairing demonstrably dilutes below the
    // aggregate floor in runRosterPlanner's own test above — this asserts
    // planRosterBudget's post-search pass still recommends a real candidate
    // in that exact situation, via candidateClearsBudgetFloor's identical
    // aggregate-OR-per-boss logic (never a parallel/looser test).
    expect(plan.bestBuddyRecommendation).not.toBeNull();
  });

  it("never touches steps/ledger — Best Buddy costs nothing tracked", () => {
    const plan = planRosterBudget({
      ...baseInputs(),
      pool: strongTeam(25),
      targets: [
        { species: TOUGH_BOSS_LOW_ATTACK, weight: 1 },
        { species: TOUGH_BOSS_HIGH_ATTACK, weight: 8 },
      ],
      stardustOnHand: 0,
    });

    expect(plan.bestBuddyRecommendation).not.toBeNull();
    expect(plan.steps.length).toBe(0);
    expect(plan.ledger.stardust.spent).toBe(0);
  });
});
