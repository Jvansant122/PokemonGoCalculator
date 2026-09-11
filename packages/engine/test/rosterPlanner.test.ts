import { describe, expect, it } from "vitest";
import { runSustainedComparison } from "../src/comparison.js";
import type { MegaLevel } from "../src/megaLevel.js";
import { noiseFloorFor, powerUpCostTableFromGameMaster, type PowerUpCostTable } from "../src/powerUp.js";
import { runRosterPlanner, type RosterEntry, type RosterPlannerInputs } from "../src/rosterPlanner.js";
import { runTeamRaid, type TeamRaidInputs } from "../src/teamRaid.js";
import type { IVSpread } from "../src/types.js";
import { NO_MODIFIERS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, RAW_POKEMON_UPGRADE_SETTINGS } from "./fixtures/powerUpCosts.js";
import {
  BOSS_ONE,
  BOSS_TWO,
  MEGA_BENCH_SPECIES,
  STRONG_SPECIES,
  TINY_SPECIES,
  UNEVOLVED_SPECIES,
  WEAK_BENCH_SPECIES,
} from "./fixtures/rosterPlannerFixtures.js";

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
    // Pinned at 0, not teamRaid.ts's new DEFAULT_SWAP_COST_SECONDS (1.0) —
    // this file's acceptance tests pin exact empirically-verified noise-floor
    // and multi-level-jump numbers unrelated to the swap-cost mechanic; a
    // nonzero swap cost between multi-slot teams would perturb them for no
    // reason relevant to what each test actually checks.
    swapCostSeconds: 0,
    ...overrides,
  };
}

// A team of 6 identical strong attackers that deterministically fills the
// baseline 6-slot team for any boss on its own — see rosterPlannerFixtures.ts.
function strongTeam(level = 20): RosterEntry[] {
  return STRONG_SPECIES.map((sp, i) => entry(`strong-${i}`, sp, level));
}

describe("runRosterPlanner — signature pinning (§3.5)", () => {
  // Pins the exact fields this module reads off runTeamRaid/runSustainedComparison
  // so a signature change from the parallel engine session (which owns
  // simulate.ts/comparison.ts/teamRaid.ts this phase) surfaces as a named
  // failure here instead of silent behavioral drift in rosterPlanner.ts.
  it("runTeamRaid's TeamRaidResult / TeamRaidSlotResult carry exactly the fields this module consumes", () => {
    const inputs: TeamRaidInputs = {
      slots: [{ species: STRONG_SPECIES[0]!, fastMoveId: null, chargedMoveId: null, isMega: false, level: 20, ivs: IVS }],
      boss: BOSS_ONE,
      level: 20,
      ivs: IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 3,
      raidTimerSeconds: 300,
      seed: 1,
    };
    const result = runTeamRaid(inputs);
    expect(Object.keys(result).sort()).toEqual(
      [
        "clearingCycleIndex",
        "clearingSlotIndex",
        "clearsWithinTimer",
        "outcome",
        "slots",
        "slotsFainted",
        "slotsUsed",
        "timeToClearSeconds",
        "timerMarginSeconds",
        "wipeCount",
      ].sort(),
    );
    expect(result.slots.length).toBeGreaterThan(0);
    expect(Object.keys(result.slots[0]!).sort()).toEqual(
      [
        "bossChargedHitsTaken",
        "chargedAttacksLanded",
        "cycleIndex",
        "dodgeFastAttacksLockout",
        "enragedAtRaidSeconds",
        "endedAtRaidSeconds",
        "faintedAtSeconds",
        "ownDamageDealt",
        "ownDamageTrajectory",
        "secondsActive",
        "slotId",
        "slotIndex",
        "speciesId",
        "speciesName",
        "subduedAtRaidSeconds",
        "startedAtRaidSeconds",
      ].sort(),
    );
    // Fields this module actually threads through TeamRaidInputs — a field
    // disappearing from this list (TS would catch a required-field ADDITION
    // via a compile error at every call site below; this instead catches a
    // silent field REMOVAL/rename that TS narrowing might not).
    expect(inputs).toMatchObject({
      slots: expect.any(Array),
      boss: expect.any(Object),
      level: expect.any(Number),
      ivs: expect.any(Object),
      dodge: expect.any(Object),
      bossChargedMoveMeanIntervalSeconds: expect.any(Number),
      raidTimerSeconds: expect.any(Number),
      seed: expect.any(Number),
    });
  });

  it("runSustainedComparison's SustainedCandidateResult carries exactly the fields this module's screen score consumes", () => {
    const [result] = runSustainedComparison({
      candidates: [STRONG_SPECIES[0]!],
      boss: BOSS_ONE,
      level: 20,
      ivs: IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 3,
      iterations: 4,
    });
    expect(result).toBeDefined();
    expect(Object.keys(result!).sort()).toEqual(
      [
        "id",
        "name",
        "bossMaxHp",
        "iterations",
        "meanTotalDamage",
        "medianTotalDamage",
        "p10TotalDamage",
        "p90TotalDamage",
        "meanChargedDamage",
        "meanFastMoveDamage",
        "meanSecondsSurvived",
        "fractionSurvivedFullWindow",
        "fractionDiedDuringOwnAnimation",
        "bossChargedMoveCadenceClamped",
        "bossChargedMoveEffectiveMinIntervalSeconds",
        "dodgeFastAttacksLockout",
        "meanHoldChargedMoveDodgeCostSeconds",
        "representativeRun",
      ].sort(),
    );
    // The two fields Stage 1's screen score is actually built from.
    expect(typeof result!.meanTotalDamage).toBe("number");
    expect(typeof result!.meanSecondsSurvived).toBe("number");
  });
});

describe("runRosterPlanner — isFullyEvolved filter (§3.6, acceptance #4)", () => {
  it("excludes isFullyEvolved === false into neverCompetitive, naming evolvesToIds", () => {
    const result = runRosterPlanner({
      ...baseInputs(),
      pool: [...strongTeam(), entry("unevolved", UNEVOLVED_SPECIES, 20)],
      targets: [{ species: BOSS_ONE }],
    });
    expect(result.candidates.some((c) => c.entryId === "unevolved")).toBe(false);
    expect(result.benchedButPromising.some((c) => c.entryId === "unevolved")).toBe(false);
    const row = result.neverCompetitive.find((n) => n.entryId === "unevolved");
    expect(row).toBeDefined();
    expect(row!.reason).toMatch(/evolve first/i);
    expect(row!.evolvesToIds).toEqual(["test-evolved-form"]);
  });

  it("treats isFullyEvolved === undefined as eligible (never excluded) — the megas trap from §3.6", () => {
    // STRONG_SPECIES never sets isFullyEvolved at all (undefined, exactly
    // like every real mega/primal SpeciesDefinition) — every fielded slot's
    // own useful levels must still generate real candidates.
    const result = runRosterPlanner({
      ...baseInputs({ iterations: 8 }),
      pool: strongTeam(20),
      targets: [{ species: BOSS_ONE }],
    });
    expect(STRONG_SPECIES[0]!.isFullyEvolved).toBeUndefined();
    expect(result.neverCompetitive.some((n) => n.entryId === "strong-0")).toBe(false);
    expect(result.candidates.some((c) => c.entryId === "strong-0")).toBe(true);
  });
});

describe("runRosterPlanner — a benched Pokémon provably enters after a power-up (acceptance #1)", () => {
  it("fields WEAK_BENCH_SPECIES onto the boss's team once powered up far enough, with a non-empty bossesNewlyFielded", () => {
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 5, iterations: 5, maxCandidates: 500 }),
      pool: [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)],
      targets: [{ species: BOSS_ONE }],
    });

    // Not on the baseline team — six identical, higher-level STRONG entries
    // fill every slot first.
    expect(result.baselinePerBoss[0]!.team).not.toContain("weak-bench");
    expect(result.baselinePerBoss[0]!.team).toHaveLength(6);

    const entering = result.candidates.filter((c) => c.entryId === "weak-bench" && c.bossesNewlyFielded.length > 0);
    expect(entering.length).toBeGreaterThan(0);
    const best = entering.reduce((a, b) => (b.meanDeltaTeamDps > a.meanDeltaTeamDps ? b : a));
    expect(best.bossesNewlyFielded).toEqual(["test-roster-boss-one"]);
    expect(best.meanDeltaTeamDps).toBeGreaterThan(0);
    const rowForBossOne = best.perBoss.find((p) => p.bossId === "test-roster-boss-one")!;
    expect(rowForBossOne.rankBefore).toBeNull();
    expect(rowForBossOne.rankAfter).not.toBeNull();
    expect(rowForBossOne.simulated).toBe(true);
  });
});

describe("runRosterPlanner — a candidate that changes no team returns exactly 0, unsimulated (acceptance #2)", () => {
  it("TINY_SPECIES, hopelessly outclassed by a full 6-slot strong team, gets a real 0 delta with zero simulations", () => {
    const result = runRosterPlanner({
      ...baseInputs({ stardustOnHand: 400, screenIterations: 5, iterations: 5 }),
      // STRONG entries sit at maxLevel (50) so they generate zero of their OWN
      // candidates (already maxed) — isolates this test to TINY's own rows.
      pool: [...strongTeam(50), entry("tiny", TINY_SPECIES, 1, { ivs: { attack: 0, defense: 0, stamina: 0 } })],
      targets: [{ species: BOSS_ONE }],
    });

    expect(result.baselinePerBoss[0]!.team).not.toContain("tiny");
    const tinyCandidates = result.candidates.filter((c) => c.entryId === "tiny");
    expect(tinyCandidates.length).toBeGreaterThan(0);
    for (const c of tinyCandidates) {
      expect(c.meanDeltaTeamDps).toBe(0);
      expect(c.bossesNewlyFielded).toEqual([]);
      expect(c.perBoss.every((p) => p.simulated === false)).toBe(true);
      expect(c.perBoss.every((p) => p.deltaTeamDps === 0)).toBe(true);
    }
    // Also surfaced in neverCompetitive — every affordable level was untouched.
    expect(result.neverCompetitive.some((n) => n.entryId === "tiny")).toBe(true);
  });
});

describe("runRosterPlanner — a multi-level jump is found even though its own individual half-steps sit below the noise floor (acceptance #3)", () => {
  it("mirrors powerUp.ts's own regression: offers the whole jump as one candidate, never a forced chain", () => {
    const result = runRosterPlanner({
      // This test is deliberately about ONE entry's dense level ladder
      // (27 through 29), which the per-entry diversity cap (default 3 —
      // see RosterPlannerInputs.maxLevelsPerEntry) would otherwise truncate
      // before this assertion ever sees the small steps — override it wide
      // open since diversity across a roster isn't what's under test here.
      ...baseInputs({ stardustOnHand: 2_000_000, screenIterations: 5, iterations: 10, maxCandidates: 500, maxLevelsPerEntry: 500 }),
      pool: STRONG_SPECIES.slice(0, 2).map((sp, i) => entry(`strong-${i}`, sp, 20)),
      targets: [{ species: BOSS_ONE }],
    });

    const strong0 = result.candidates.filter((c) => c.entryId === "strong-0").sort((a, b) => a.toLevel - b.toLevel);
    expect(strong0.length).toBeGreaterThan(0);

    // Verified empirically (throwaway script, this exact config/seed) —
    // every half-level from 27 through 28.5 sits below the noise floor...
    const smallSteps = strong0.filter((c) => c.toLevel >= 27 && c.toLevel <= 28.5);
    expect(smallSteps.length).toBeGreaterThan(0);
    for (const c of smallSteps) expect(c.exceedsNoise).toBe(false);

    // ...while the level-29 JUMP (offered directly from level 20, never a
    // forced chain through 20.5/21/.../28.5) clears the floor by a wide
    // margin — the real regression this test guards against.
    const jump = strong0.find((c) => c.toLevel === 29);
    expect(jump).toBeDefined();
    expect(jump!.exceedsNoise).toBe(true);
    expect(jump!.meanDeltaTeamDps).toBeGreaterThan(result.noiseFloorTeamDps * 10);
  });
});

describe("runRosterPlanner — per-boss deltas aggregate to the weighted mean (acceptance #5)", () => {
  it("meanDeltaTeamDps equals sum(weight * perBoss.deltaTeamDps) / sum(weight) exactly", () => {
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 4, iterations: 4, maxCandidates: 500 }),
      pool: [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)],
      targets: [
        { species: BOSS_ONE, weight: 1 },
        { species: BOSS_TWO, weight: 3 },
      ],
    });

    const withMovement = result.candidates.filter((c) => c.entryId === "weak-bench");
    expect(withMovement.length).toBeGreaterThan(0);
    for (const c of withMovement) {
      const totalWeight = 1 + 3;
      const expected = (1 * c.perBoss[0]!.deltaTeamDps + 3 * c.perBoss[1]!.deltaTeamDps) / totalWeight;
      expect(c.meanDeltaTeamDps).toBeCloseTo(expected, 10);
    }
  });
});

describe("runRosterPlanner — team selection respects the one-mega-slot cap", () => {
  it("fields at most one canMega entry even when several score higher than every non-mega entry", () => {
    const megaA = entry("mega-a", { ...STRONG_SPECIES[0]!, id: "mega-a-species", boost: { multiplier: 1.3, boostedType: "normal" } }, 20, {
      canMega: true,
    });
    const megaB = entry("mega-b", { ...STRONG_SPECIES[1]!, id: "mega-b-species", boost: { multiplier: 1.3, boostedType: "normal" } }, 20, {
      canMega: true,
    });
    const others = STRONG_SPECIES.slice(2).map((sp, i) => entry(`other-${i}`, sp, 20));

    const result = runRosterPlanner({
      ...baseInputs(),
      pool: [megaA, megaB, ...others],
      targets: [{ species: BOSS_ONE }],
    });

    const team = result.baselinePerBoss[0]!.team;
    const megaCount = team.filter((id) => id === "mega-a" || id === "mega-b").length;
    expect(megaCount).toBeLessThanOrEqual(1);
    expect(team).toHaveLength(5); // 1 mega (at most) + 4 "other" entries = 5 total pool entries available
  });

  it("throws if an entry is flagged canMega without a boost mechanic", () => {
    const bad = entry("bad", STRONG_SPECIES[0]!, 20, { canMega: true });
    expect(() => runRosterPlanner({ ...baseInputs(), pool: [bad], targets: [{ species: BOSS_ONE }] })).toThrow(/canMega/);
  });
});

describe("runRosterPlanner — input validation", () => {
  it("throws on an empty pool", () => {
    expect(() => runRosterPlanner({ ...baseInputs(), pool: [], targets: [{ species: BOSS_ONE }] })).toThrow(/non-empty pool/);
  });

  it("throws on an empty target list", () => {
    expect(() => runRosterPlanner({ ...baseInputs(), pool: strongTeam(), targets: [] })).toThrow(/at least one raid target/);
  });

  it("throws on a duplicate entryId", () => {
    const dupe = [entry("dup", STRONG_SPECIES[0]!, 20), entry("dup", STRONG_SPECIES[1]!, 20)];
    expect(() => runRosterPlanner({ ...baseInputs(), pool: dupe, targets: [{ species: BOSS_ONE }] })).toThrow(/Duplicate/);
  });
});

describe("runRosterPlanner — candy family pooling and costUnverified (§3.4)", () => {
  it("marks a candidate costUnverified when its resolved family has no entry in candyByFamilyId", () => {
    const result = runRosterPlanner({
      ...baseInputs(),
      pool: [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1, { candyFamilyId: "FAMILY_TEST_WEAK" })],
      targets: [{ species: BOSS_ONE }],
    });
    const rows = result.candidates.filter((c) => c.entryId === "weak-bench");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.costUnverified).toBe(true);
      expect(r.affordable).toBe(false);
    }
  });

  it("a known, sufficient family pool makes a candidate affordable (still priced independently, per §3.4)", () => {
    const result = runRosterPlanner({
      ...baseInputs({ stardustOnHand: 1_000_000 }),
      pool: [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1, { candyFamilyId: "FAMILY_TEST_WEAK" })],
      targets: [{ species: BOSS_ONE }],
      candyByFamilyId: { FAMILY_TEST_WEAK: { candy: 100_000, xlCandy: 100_000 } },
    });
    const rows = result.candidates.filter((c) => c.entryId === "weak-bench");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.costUnverified === false)).toBe(true);
    expect(rows.some((r) => r.affordable === true)).toBe(true);
  });
});

describe("runRosterPlanner — aggregate noise floor combines PER-BOSS floors in quadrature, never pooled raw samples (Defect 1 regression)", () => {
  it("noiseFloorTeamDps equals sqrt(sum((normalizedWeight * thatBoss'sOwnFloor)^2)), not noiseFloorFor applied to a pooled sample", () => {
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 4, iterations: 6, maxCandidates: 500 }),
      pool: [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)],
      targets: [
        { species: BOSS_ONE, weight: 1 },
        { species: BOSS_TWO, weight: 3 },
      ],
    });

    const weights = [1, 3];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const expected = Math.sqrt(
      result.baselinePerBoss.reduce((sum, b, i) => {
        const normalizedWeight = weights[i]! / totalWeight;
        const perBossFloor = noiseFloorFor(b.summary, result.iterations);
        return sum + (normalizedWeight * perBossFloor) ** 2;
      }, 0),
    );
    expect(result.noiseFloorTeamDps).toBeCloseTo(expected, 10);

    // Regression guard against the OLD (buggy) formula: pooling every boss's
    // raw teamDpsPerSeed into one sample and taking noiseFloorFor of THAT.
    // On a real 164-species/13-boss sweep this measured 20-100x LOOSER
    // (2.67-9.23) than the quadrature combination (0.18-0.47) because it was
    // measuring BETWEEN-BOSS spread, not noise — assert the two formulas
    // actually differ here too (not just that the new one is "a" number).
    const pooledSeedValues = result.baselinePerBoss.flatMap((b) => b.summary.teamDpsPerSeed);
    const pooledMean = pooledSeedValues.reduce((a, v) => a + v, 0) / pooledSeedValues.length;
    const pooledStdDev = Math.sqrt(pooledSeedValues.reduce((a, v) => a + (v - pooledMean) ** 2, 0) / pooledSeedValues.length);
    const oldPooledFloor = noiseFloorFor({ ...result.baselinePerBoss[0]!.summary, teamDpsStdDev: pooledStdDev }, pooledSeedValues.length);
    expect(result.noiseFloorTeamDps).toBeLessThan(oldPooledFloor);
  });
});

describe("runRosterPlanner — bestBossDeltaTeamDps / significantBossCount / exceedsNoise OR-logic (Defect 3a regression)", () => {
  it("holds the documented invariants for every candidate in a multi-boss run", () => {
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 4, iterations: 6, maxCandidates: 500 }),
      pool: [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)],
      targets: [
        { species: BOSS_ONE, weight: 1 },
        { species: BOSS_TWO, weight: 3 },
      ],
    });

    const perBossFloors = result.baselinePerBoss.map((b) => noiseFloorFor(b.summary, result.iterations));
    expect(result.candidates.length).toBeGreaterThan(0);

    for (const c of result.candidates) {
      // significantBossCount: count of perBoss entries individually clearing
      // THAT boss's own floor.
      const expectedSignificantCount = c.perBoss.filter((p, i) => Math.abs(p.deltaTeamDps) > perBossFloors[i]!).length;
      expect(c.significantBossCount).toBe(expectedSignificantCount);

      // bestBossDeltaTeamDps/bestBossId: the largest-magnitude perBoss entry,
      // or null when every perBoss entry is exactly 0 (fully untouched).
      const allZero = c.perBoss.every((p) => p.deltaTeamDps === 0);
      if (allZero) {
        expect(c.bestBossDeltaTeamDps).toBeNull();
        expect(c.bestBossId).toBeNull();
      } else {
        const maxAbs = Math.max(...c.perBoss.map((p) => Math.abs(p.deltaTeamDps)));
        expect(Math.abs(c.bestBossDeltaTeamDps!)).toBeCloseTo(maxAbs, 10);
        const matchingBoss = c.perBoss.find((p) => Math.abs(p.deltaTeamDps) === maxAbs)!;
        expect(c.bestBossId).toBe(matchingBoss.bossId);
      }

      // exceedsNoise: aggregate floor OR at least one individually
      // significant boss — never JUST the (dilutable) aggregate mean.
      const expectedExceedsNoise = Math.abs(c.meanDeltaTeamDps) > result.noiseFloorTeamDps || c.significantBossCount > 0;
      expect(c.exceedsNoise).toBe(expectedExceedsNoise);
    }

    // At least one candidate in this run is a real, demonstrated case of the
    // dilution this field exists to catch: individually significant on some
    // boss while the aggregate mean alone would NOT have cleared the floor.
    const dilutedButReal = result.candidates.filter(
      (c) => c.significantBossCount > 0 && Math.abs(c.meanDeltaTeamDps) <= result.noiseFloorTeamDps,
    );
    expect(dilutedButReal.length).toBeGreaterThan(0);
    for (const c of dilutedButReal) expect(c.exceedsNoise).toBe(true);
  });
});

describe("RosterPlannerInputs.significanceMode", () => {
  // Reuses the exact Defect 3a fixture/config above — that run already
  // demonstrates at least one candidate that is individually significant on
  // ONE boss while diluted below the aggregate floor overall (dilutedButReal).
  function dilutedFixtureResult(significanceMode?: RosterPlannerInputs["significanceMode"]) {
    return runRosterPlanner({
      ...baseInputs({ screenIterations: 4, iterations: 6, maxCandidates: 500, significanceMode }),
      pool: [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)],
      targets: [
        { species: BOSS_ONE, weight: 1 },
        { species: BOSS_TWO, weight: 3 },
      ],
    });
  }

  it("defaults to 'aggregate-or-per-boss' — omitting the field is byte-identical to the explicit value", () => {
    const omitted = dilutedFixtureResult(undefined);
    const explicit = dilutedFixtureResult("aggregate-or-per-boss");
    expect(omitted).toEqual(explicit);
  });

  it("'aggregate-only' excludes a candidate that only qualifies via significantBossCount, while keeping significantBossCount/bestBossDeltaTeamDps populated exactly the same", () => {
    const withPerBoss = dilutedFixtureResult("aggregate-or-per-boss");
    const aggregateOnly = dilutedFixtureResult("aggregate-only");

    const dilutedButReal = withPerBoss.candidates.filter(
      (c) => c.significantBossCount > 0 && Math.abs(c.meanDeltaTeamDps) <= withPerBoss.noiseFloorTeamDps,
    );
    expect(dilutedButReal.length).toBeGreaterThan(0);
    for (const c of dilutedButReal) expect(c.exceedsNoise).toBe(true);

    for (const diluted of dilutedButReal) {
      const underAggregateOnly = aggregateOnly.candidates.find(
        (c) => c.entryId === diluted.entryId && c.toLevel === diluted.toLevel,
      )!;
      expect(underAggregateOnly).toBeDefined();
      // The mode changes what QUALIFIES, never what's MEASURED or REPORTED.
      expect(underAggregateOnly.significantBossCount).toBe(diluted.significantBossCount);
      expect(underAggregateOnly.bestBossDeltaTeamDps).toBe(diluted.bestBossDeltaTeamDps);
      expect(underAggregateOnly.bestBossId).toBe(diluted.bestBossId);
      expect(underAggregateOnly.meanDeltaTeamDps).toBeCloseTo(diluted.meanDeltaTeamDps, 10);
      // But it no longer qualifies as significant.
      expect(underAggregateOnly.exceedsNoise).toBe(false);
    }
  });

  it("a candidate that clears the AGGREGATE floor is admitted under both modes", () => {
    const withPerBoss = dilutedFixtureResult("aggregate-or-per-boss");
    const aggregateOnly = dilutedFixtureResult("aggregate-only");

    const aggregateClearing = withPerBoss.candidates.filter((c) => Math.abs(c.meanDeltaTeamDps) > withPerBoss.noiseFloorTeamDps);
    expect(aggregateClearing.length).toBeGreaterThan(0);
    for (const c of aggregateClearing) {
      expect(c.exceedsNoise).toBe(true);
      const underAggregateOnly = aggregateOnly.candidates.find((x) => x.entryId === c.entryId && x.toLevel === c.toLevel)!;
      expect(underAggregateOnly.exceedsNoise).toBe(true);
    }
  });
});

describe("runRosterPlanner — a level-1 entry cannot be admitted as rank 1 against a boss whose fielded six are 30+ levels higher (Defect 2 regression)", () => {
  it("never admits WEAK_BENCH_SPECIES at level 1 far below the fielded team's own level — only once it's genuinely competitive", () => {
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 5, iterations: 5, maxCandidates: 500, maxLevelsPerEntry: 500 }),
      pool: [...strongTeam(35), entry("weak-bench", WEAK_BENCH_SPECIES, 1)],
      targets: [{ species: BOSS_ONE }],
    });

    const rows = result.candidates.filter((c) => c.entryId === "weak-bench").sort((a, b) => a.toLevel - b.toLevel);
    expect(rows.length).toBeGreaterThan(0);

    // Verified empirically (throwaway script, this exact config/seed) — every
    // toLevel from 1.5 through 24 is genuinely untouched (a real, computed 0,
    // not a scale-mismatched admission): the OLD buggy fallback compared a
    // raw arithmetic proxy value directly against a real simulated 6th-place
    // score and could admit a candidate at ANY toLevel regardless of how far
    // below the fielded team's own level it sat (the reported bug: a
    // level-1 Vaporeon read as rank 1 against level 35-40 attackers). The fix
    // measures a REAL screen score instead whenever the ratio-scaling proxy
    // isn't sound, so admission only ever happens once the candidate is
    // genuinely close to the fielded team's own level.
    const farBelowFieldedLevel = rows.filter((c) => c.toLevel <= 20);
    expect(farBelowFieldedLevel.length).toBeGreaterThan(0);
    for (const c of farBelowFieldedLevel) {
      expect(c.perBoss[0]!.rankAfter).toBeNull();
      expect(c.perBoss[0]!.simulated).toBe(false);
      expect(c.meanDeltaTeamDps).toBe(0);
    }

    // Sanity check the module still functions normally: WEAK_BENCH_SPECIES
    // DOES eventually become competitive once it's genuinely close to the
    // fielded team's own level (35) — this is a real, simulated admission,
    // never a scale-mismatched one.
    const eventuallyEnters = rows.some((c) => c.toLevel >= 24 && c.perBoss[0]!.rankAfter === 1 && c.perBoss[0]!.simulated === true);
    expect(eventuallyEnters).toBe(true);
  });
});

describe("runRosterPlanner — per-entry candidate diversity cap (Defect 3b regression)", () => {
  it("maxLevelsPerEntry keeps a global cap from being consumed by one entry's dense level ladder", () => {
    // Two entries, each with MANY useful levels (a wide level range and a
    // large stardust budget) — with no per-entry cap, a small maxCandidates
    // could be entirely consumed by ONE entry's own level ladder.
    const pool = [
      entry("strong-0", STRONG_SPECIES[0]!, 20),
      entry("strong-1", STRONG_SPECIES[1]!, 20),
      entry("weak-bench", WEAK_BENCH_SPECIES, 1),
    ];

    const capped = runRosterPlanner({
      ...baseInputs({ stardustOnHand: 2_000_000, screenIterations: 4, iterations: 4, maxCandidates: 6, maxLevelsPerEntry: 2 }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });

    const byEntry = new Map<string, number>();
    for (const c of capped.candidates) byEntry.set(c.entryId, (byEntry.get(c.entryId) ?? 0) + 1);
    for (const count of byEntry.values()) expect(count).toBeLessThanOrEqual(2);
    // With maxCandidates: 6 and maxLevelsPerEntry: 2 across 3 eligible
    // entries, every entry should be represented (up to 2 rows each) rather
    // than the cap being consumed entirely by one or two entries' level
    // ladders.
    expect(byEntry.size).toBeGreaterThan(1);

    const uncapped = runRosterPlanner({
      ...baseInputs({ stardustOnHand: 2_000_000, screenIterations: 4, iterations: 4, maxCandidates: 500, maxLevelsPerEntry: 500 }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });
    // Confirms the fixture actually generates a dense per-entry ladder that
    // WOULD have starved a small global cap without the per-entry limit.
    const uncappedByEntry = new Map<string, number>();
    for (const c of uncapped.candidates) uncappedByEntry.set(c.entryId, (uncappedByEntry.get(c.entryId) ?? 0) + 1);
    expect(Math.max(...uncappedByEntry.values())).toBeGreaterThan(2);
  });
});

describe("RosterPlannerInputs.megaLevel — roster-wide (2026-09-09 follow-up: Gap 2)", () => {
  // Exactly 6 entries (5 strong clones + 1 mega-capable) so every entry is
  // fielded regardless of relative score — isolates megaLevel's effect on
  // the mega entry's own simulated output from any team-selection interaction.
  function poolWithMega(level = 20): RosterEntry[] {
    return [
      entry("mega-slot", MEGA_BENCH_SPECIES, level, { canMega: true }),
      ...STRONG_SPECIES.slice(0, 5).map((sp, i) => entry(`strong-${i}`, sp, level)),
    ];
  }

  it("changes an already-fielded mega-capable entry's simulated baseline team DPS", () => {
    const pool = poolWithMega();
    const withoutMegaLevel = runRosterPlanner({ ...baseInputs(), pool, targets: [{ species: BOSS_ONE }] });
    const withSuperMax = runRosterPlanner({ ...baseInputs({ megaLevel: "super-max" }), pool, targets: [{ species: BOSS_ONE }] });

    expect(withoutMegaLevel.baselinePerBoss[0]!.team).toContain("mega-slot");
    expect(withSuperMax.baselinePerBoss[0]!.team).toContain("mega-slot");
    expect(withSuperMax.baselinePerBoss[0]!.summary.teamDps).toBeGreaterThan(withoutMegaLevel.baselinePerBoss[0]!.summary.teamDps);
  });

  it("has no effect at all on a pool with no mega-capable entries — the roster-wide setting is gated per-entry, not applied blanket", () => {
    const pool = strongTeam(20);
    const withoutMegaLevel = runRosterPlanner({ ...baseInputs(), pool, targets: [{ species: BOSS_ONE }] });
    const withSuperMax = runRosterPlanner({ ...baseInputs({ megaLevel: "super-max" }), pool, targets: [{ species: BOSS_ONE }] });
    expect(withSuperMax.baselinePerBoss).toEqual(withoutMegaLevel.baselinePerBoss);
    expect(withSuperMax.candidates).toEqual(withoutMegaLevel.candidates);
  });

  it("omitting megaLevel is byte-identical to explicit undefined/'base' (defaults constraint), even with a mega-capable entry in the pool", () => {
    const pool = poolWithMega();
    const omitted = runRosterPlanner({ ...baseInputs(), pool, targets: [{ species: BOSS_ONE }] });
    const explicitUndefined = runRosterPlanner({ ...baseInputs({ megaLevel: undefined }), pool, targets: [{ species: BOSS_ONE }] });
    const explicitBase = runRosterPlanner({ ...baseInputs({ megaLevel: "base" as MegaLevel }), pool, targets: [{ species: BOSS_ONE }] });
    expect(explicitUndefined).toEqual(omitted);
    expect(explicitBase).toEqual(omitted);
  });
});
