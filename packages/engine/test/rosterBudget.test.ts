import { describe, expect, it } from "vitest";
import { planRosterBudget, type RosterEntry, type RosterBudgetInputs } from "../src/rosterPlanner.js";
import { powerUpCostTableFromGameMaster, type PowerUpCostTable } from "../src/powerUp.js";
import type { IVSpread } from "../src/types.js";
import { NO_MODIFIERS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, RAW_POKEMON_UPGRADE_SETTINGS } from "./fixtures/powerUpCosts.js";
import {
  BOSS_ONE,
  BOSS_TWO,
  STRONG_SPECIES,
  UNEVOLVED_SPECIES,
  WEAK_BENCH_SPECIES,
} from "./fixtures/rosterPlannerFixtures.js";

/**
 * Phase 4 of PLAN_multi_raid_roster_optimizer.md — planRosterBudget, the
 * joint fixed-budget allocator generalizing powerUp.ts's planPowerUpBudget
 * from "6 slots vs one boss" to "N pool entries vs M bosses." See
 * rosterPlanner.ts's own top-of-planRosterBudget doc comment for the full
 * algorithm and the two real, empirically-found scale bugs this test file
 * guards against (a round-robin-by-depth candidate selector and a
 * per-stardust-efficiency pre-filter each silently excluded the single most
 * valuable candidate in a real 164-species sweep).
 *
 * Reuses the SAME test-only fixtures as rosterPlanner.test.ts (STRONG_SPECIES/
 * WEAK_BENCH_SPECIES/UNEVOLVED_SPECIES/BOSS_ONE/BOSS_TWO) — every fixture's
 * own doc comment in rosterPlannerFixtures.ts explains its role.
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
    // Every fixture species is hand-authored with a unique id and carries no
    // real candyFamilyId of its own — give each entry its own family keyed
    // off its entryId so tests can control per-family candy independently
    // unless a test deliberately shares one (see the "candy spent own-first"
    // describe block below).
    candyFamilyId: `FAMILY_${id.toUpperCase()}`,
    ...overrides,
  };
}

function baseInputs(overrides: Partial<RosterBudgetInputs> = {}): Omit<RosterBudgetInputs, "pool" | "targets"> {
  return {
    costTable: TABLE,
    stardustOnHand: 1_000_000,
    candyByFamilyId: {},
    dodge: { kind: "none" },
    bossChargedMoveMeanIntervalSeconds: 3,
    raidTimerSeconds: 300,
    screenIterations: 4,
    iterations: 5,
    ...overrides,
  };
}

function strongTeam(level = 20): RosterEntry[] {
  return STRONG_SPECIES.map((sp, i) => entry(`strong-${i}`, sp, level));
}

/** Generous candy for every entry's own resolved family — the common case for tests not specifically about candy scarcity. */
function generousCandyFor(pool: RosterEntry[]): Record<string, { candy: number; xlCandy: number }> {
  const out: Record<string, { candy: number; xlCandy: number }> = {};
  for (const e of pool) out[e.candyFamilyId!] = { candy: 1_000_000, xlCandy: 1_000_000 };
  return out;
}

describe("planRosterBudget — a realistic budget spends and the ledger balances exactly", () => {
  it("stardust/candy/shared-pool spend reconstructed from steps equals the ledger, resource-by-resource, never blended", () => {
    const pool = [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)];
    const plan = planRosterBudget({
      ...baseInputs({
        candyByFamilyId: generousCandyFor(pool),
        stardustOnHand: 2_000_000,
        screenIterations: 5,
        iterations: 8,
      }),
      pool,
      targets: [
        { species: BOSS_ONE, weight: 1 },
        { species: BOSS_TWO, weight: 2 },
      ],
    });

    expect(plan.steps.length).toBeGreaterThan(0);

    // Stardust: sum of every step's cost equals the ledger's recorded spend.
    const stardustSum = plan.steps.reduce((sum, s) => sum + s.cost.stardust, 0);
    expect(plan.ledger.stardust.spent).toBe(stardustSum);
    expect(plan.ledger.stardust.spent + plan.ledger.stardust.remaining).toBe(2_000_000);

    // Per-family candy: sum of ownCandySpent/ownXlCandySpent across every
    // step touching that family equals that family's OWN ledger spend.
    const ownCandyByFamily = new Map<string, number>();
    const ownXlByFamily = new Map<string, number>();
    let sharedCandySum = 0;
    let sharedXlSum = 0;
    for (const s of plan.steps) {
      const familyId = pool.find((e) => e.entryId === s.entryId)!.candyFamilyId!;
      ownCandyByFamily.set(familyId, (ownCandyByFamily.get(familyId) ?? 0) + s.ownCandySpent);
      ownXlByFamily.set(familyId, (ownXlByFamily.get(familyId) ?? 0) + s.ownXlCandySpent);
      sharedCandySum += s.sharedCandySpent;
      sharedXlSum += s.sharedXlCandySpent;
      // Every step's own cost breakdown must itself balance.
      expect(s.ownCandySpent + s.sharedCandySpent).toBe(s.cost.candy);
      expect(s.ownXlCandySpent + s.sharedXlCandySpent).toBe(s.cost.xlCandy);
    }
    for (const [familyId, spent] of ownCandyByFamily) {
      expect(plan.ledger.candyByFamilyId[familyId]!.candy.spent).toBe(spent);
    }
    for (const [familyId, spent] of ownXlByFamily) {
      expect(plan.ledger.candyByFamilyId[familyId]!.xlCandy.spent).toBe(spent);
    }
    expect(plan.ledger.sharedRareCandy.spent).toBeCloseTo(sharedCandySum, 10);
    expect(plan.ledger.sharedRareCandyXl.spent).toBeCloseTo(sharedXlSum, 10);

    // Never negative, never exceeding what was on hand.
    expect(plan.ledger.stardust.remaining).toBeGreaterThanOrEqual(0);
    for (const fam of Object.values(plan.ledger.candyByFamilyId)) {
      expect(fam.candy.remaining).toBeGreaterThanOrEqual(0);
      expect(fam.xlCandy.remaining).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("planRosterBudget — the noise floor is PER-ROUND, not fixed", () => {
  it("records a floor on each step, and floors genuinely vary across steps rather than reusing one fixed value", () => {
    const pool = [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)];
    const plan = planRosterBudget({
      ...baseInputs({ candyByFamilyId: generousCandyFor(pool), stardustOnHand: 3_000_000, screenIterations: 5, iterations: 8 }),
      pool,
      targets: [
        { species: BOSS_ONE, weight: 1 },
        { species: BOSS_TWO, weight: 2 },
      ],
    });

    expect(plan.steps.length).toBeGreaterThan(2);
    const floors = plan.steps.map((s) => s.noiseFloorTeamDps);
    expect(new Set(floors).size).toBeGreaterThan(1);

    // Every step's own recorded floor is what it was ACTUALLY judged
    // against — either the aggregate mean clears it, or the step is
    // significant on at least one boss's own floor (recorded via
    // significantBossCount/clearsAggregateFloor — "which test it passed").
    for (const s of plan.steps) {
      expect(s.clearsAggregateFloor || s.significantBossCount > 0).toBe(true);
    }

    // The plan's own top-level floor is the FINAL one, not the first step's.
    expect(plan.noiseFloorTeamDps).not.toBe(plan.steps[0]!.noiseFloorTeamDps);
  });
});

describe("planRosterBudget — bestBlockedCandidate: 'blocked, not done'", () => {
  it("is null on genuine convergence (every fielded slot already at maxLevel)", () => {
    const pool = strongTeam(50); // already maxed — nothing useful left anywhere
    const plan = planRosterBudget({
      ...baseInputs({ candyByFamilyId: generousCandyFor(pool), stardustOnHand: 2_000_000, screenIterations: 4, iterations: 5 }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });
    expect(plan.stopReason).toBe("max-level-reached");
    expect(plan.steps).toHaveLength(0);
    expect(plan.bestBlockedCandidate).toBeNull();
  });

  it("is non-null and names a real, significant gain when the fielded team can't be budgeted for (unknown candy) but a bench entry's own family is known-but-tight", () => {
    // The fielded STRONG team is given NO known candy family at all, so it
    // is excluded from candidate generation entirely (§3.4) — it still
    // FIELDS on the baseline/final team (team selection always sees the
    // FULL pool), so the competitive bar it sets never moves. weak-bench
    // gets a KNOWN but tight candy pool: enough to afford a few cheap
    // levels (which don't matter) but not the deep jump that would
    // actually make it competitive against a level-35 fielded team.
    const pool = [...strongTeam(35), entry("weak-bench", WEAK_BENCH_SPECIES, 1)];
    const candyByFamilyId: Record<string, { candy: number; xlCandy: number }> = {
      [pool.find((e) => e.entryId === "weak-bench")!.candyFamilyId!]: { candy: 150, xlCandy: 100_000 },
    };

    const plan = planRosterBudget({
      ...baseInputs({
        candyByFamilyId,
        stardustOnHand: 50_000_000,
        screenIterations: 6,
        iterations: 10,
        rareCandyOnHand: 0,
        rareCandyXlOnHand: 0,
      }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });

    expect(plan.excludedEntries.length).toBe(6); // every STRONG_SPECIES entry, unknown candy family
    expect(plan.steps).toHaveLength(0); // nothing affordable-and-significant ever gets committed

    expect(plan.bestBlockedCandidate).not.toBeNull();
    const blocked = plan.bestBlockedCandidate!;
    expect(blocked.entryId).toBe("weak-bench");
    expect(blocked.fromLevel).toBe(1); // never touched — no steps were committed
    expect(blocked.toLevel).toBeGreaterThan(1);
    expect(blocked.meanDeltaTeamDps).toBeGreaterThan(plan.noiseFloorTeamDps);
    expect(blocked.shortfalls.length).toBeGreaterThan(0);
    expect(blocked.shortfalls.some((s) => s.resource === "candy")).toBe(true);
  });
});

describe("planRosterBudget — a multi-level jump is committed even though its own individual half-steps sit below the floor", () => {
  it("mirrors powerUp.ts's own regression, generalized to the pool-scale proxy-ranked candidate selector", () => {
    const pool = STRONG_SPECIES.slice(0, 2).map((sp, i) => entry(`strong-${i}`, sp, 20));
    const plan = planRosterBudget({
      ...baseInputs({ candyByFamilyId: generousCandyFor(pool), stardustOnHand: 5_000_000, screenIterations: 5, iterations: 10 }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });

    expect(plan.steps.length).toBeGreaterThan(0);
    const first = plan.steps[0]!;
    // A real multi-level jump (more than one useful level's worth), never a
    // single half-step — the whole point of the regression this mirrors.
    expect(first.toLevel - first.fromLevel).toBeGreaterThan(1);
    expect(first.meanDeltaTeamDps).toBeGreaterThan(first.noiseFloorTeamDps);
  });
});

describe("planRosterBudget — unknown-candy families are excluded with a reason, never treated as 0", () => {
  it("reports an unresolvable/unknown-candy entry in excludedEntries with a distinct reason from the evolution case, and never generates a candidate for it", () => {
    const pool = [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1), entry("unevolved", UNEVOLVED_SPECIES, 20)];
    // Only STRONG entries get a known candy pool — weak-bench's family is
    // left entirely absent from candyByFamilyId (unknown, not 0).
    const candyByFamilyId: Record<string, { candy: number; xlCandy: number }> = {};
    for (const e of pool) {
      if (e.entryId.startsWith("strong")) candyByFamilyId[e.candyFamilyId!] = { candy: 100_000, xlCandy: 100_000 };
    }

    const plan = planRosterBudget({
      ...baseInputs({ candyByFamilyId, stardustOnHand: 2_000_000, screenIterations: 4, iterations: 5 }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });

    const weakBenchExclusion = plan.excludedEntries.find((e) => e.entryId === "weak-bench");
    expect(weakBenchExclusion).toBeDefined();
    expect(weakBenchExclusion!.reason).toMatch(/candy.*unknown/i);
    expect(weakBenchExclusion!.evolvesToIds).toBeUndefined();

    const unevolvedExclusion = plan.excludedEntries.find((e) => e.entryId === "unevolved");
    expect(unevolvedExclusion).toBeDefined();
    expect(unevolvedExclusion!.reason).toMatch(/evolve first/i);
    expect(unevolvedExclusion!.evolvesToIds).toEqual(["test-evolved-form"]);

    // Never in finalLevels (that's scoped to ELIGIBLE entries only).
    expect(plan.finalLevels.some((f) => f.entryId === "weak-bench")).toBe(false);
    expect(plan.finalLevels.some((f) => f.entryId === "unevolved")).toBe(false);
    // Every committed step (if any) is one of the STRONG entries only.
    for (const s of plan.steps) expect(s.entryId.startsWith("strong")).toBe(true);
  });
});

describe("planRosterBudget — isFullyEvolved: undefined is eligible, === false is excluded (§3.6)", () => {
  it("never excludes STRONG_SPECIES (isFullyEvolved undefined, exactly like every real mega/primal SpeciesDefinition)", () => {
    expect(STRONG_SPECIES[0]!.isFullyEvolved).toBeUndefined();
    const pool = strongTeam(20);
    const plan = planRosterBudget({
      ...baseInputs({ candyByFamilyId: generousCandyFor(pool), stardustOnHand: 500_000, screenIterations: 4, iterations: 5 }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });
    expect(plan.excludedEntries.some((e) => e.entryId.startsWith("strong"))).toBe(false);
  });
});

describe("planRosterBudget — candy spent own-first, then the shared pool", () => {
  it("draws down a shared FAMILY's own candy before touching the shared Rare Candy pool, for every step that shares a family", () => {
    // Two pool entries deliberately SHARE one candy family (mirrors §3.4's
    // real 12-Houndour-in-one-family case) with a small starting pool, so
    // committing both entries' steps must eventually spill into the shared
    // Rare Candy pool.
    const sharedFamily = "FAMILY_SHARED_TEST";
    const pool = [
      entry("strong-0", STRONG_SPECIES[0]!, 20, { candyFamilyId: sharedFamily }),
      entry("strong-1", STRONG_SPECIES[1]!, 20, { candyFamilyId: sharedFamily }),
      ...STRONG_SPECIES.slice(2).map((sp, i) => entry(`filler-${i}`, sp, 20)),
    ];
    const candyByFamilyId: Record<string, { candy: number; xlCandy: number }> = {
      [sharedFamily]: { candy: 20, xlCandy: 100_000 },
      ...generousCandyFor(pool.slice(2)),
    };

    const plan = planRosterBudget({
      ...baseInputs({ candyByFamilyId, stardustOnHand: 5_000_000, screenIterations: 5, iterations: 8, rareCandyOnHand: 10_000, rareCandyXlOnHand: 10_000 }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });

    const sharedFamilySteps = plan.steps.filter((s) => s.entryId === "strong-0" || s.entryId === "strong-1");
    expect(sharedFamilySteps.length).toBeGreaterThan(0);

    // Own-first: the family's own 20 candy must be exhausted before any
    // step draws from the shared pool.
    let cumulativeOwnSpent = 0;
    let sawSharedSpend = false;
    for (const s of sharedFamilySteps) {
      if (s.sharedCandySpent > 0) sawSharedSpend = true;
      if (!sawSharedSpend) {
        cumulativeOwnSpent += s.ownCandySpent;
        expect(cumulativeOwnSpent).toBeLessThanOrEqual(20);
      } else {
        // Once the shared pool has been touched once, the family's own
        // candy must be fully drained (0 remaining) — own-first, no
        // reordering back to the depleted own pool afterward.
        expect(plan.ledger.candyByFamilyId[sharedFamily]!.candy.remaining).toBe(0);
      }
    }
    expect(plan.ledger.candyByFamilyId[sharedFamily]!.candy.spent).toBeLessThanOrEqual(20);
    // The family's total candy spend across BOTH entries reflects the
    // shared pool, never double-counted or negative.
    expect(plan.ledger.candyByFamilyId[sharedFamily]!.candy.remaining).toBeGreaterThanOrEqual(0);
  });
});

describe("planRosterBudget — input validation", () => {
  it("throws on an empty pool", () => {
    expect(() => planRosterBudget({ ...baseInputs(), pool: [], targets: [{ species: BOSS_ONE }] })).toThrow(/non-empty pool/);
  });

  it("throws on an empty target list", () => {
    expect(() => planRosterBudget({ ...baseInputs(), pool: strongTeam(), targets: [] })).toThrow(/at least one raid target/);
  });

  it("throws on a duplicate entryId", () => {
    const dupe = [entry("dup", STRONG_SPECIES[0]!, 20), entry("dup", STRONG_SPECIES[1]!, 20)];
    expect(() => planRosterBudget({ ...baseInputs(), pool: dupe, targets: [{ species: BOSS_ONE }] })).toThrow(/Duplicate/);
  });

  it("throws if an entry is flagged canMega without a boost mechanic", () => {
    const bad = entry("bad", STRONG_SPECIES[0]!, 20, { canMega: true });
    expect(() => planRosterBudget({ ...baseInputs(), pool: [bad], targets: [{ species: BOSS_ONE }] })).toThrow(/canMega/);
  });
});

describe("planRosterBudget — never exceeds any budget dimension", () => {
  it("stardust and every candy pool stay non-negative across a tightly-constrained run", () => {
    const pool = [...strongTeam(25), entry("weak-bench", WEAK_BENCH_SPECIES, 1)];
    const candyByFamilyId: Record<string, { candy: number; xlCandy: number }> = {};
    for (const e of pool) candyByFamilyId[e.candyFamilyId!] = { candy: 5, xlCandy: 0 };

    const plan = planRosterBudget({
      ...baseInputs({ candyByFamilyId, stardustOnHand: 5_000, screenIterations: 4, iterations: 5, rareCandyOnHand: 3, rareCandyXlOnHand: 0 }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });

    expect(plan.ledger.stardust.remaining).toBeGreaterThanOrEqual(0);
    for (const fam of Object.values(plan.ledger.candyByFamilyId)) {
      expect(fam.candy.remaining).toBeGreaterThanOrEqual(0);
      expect(fam.xlCandy.remaining).toBeGreaterThanOrEqual(0);
    }
    expect(plan.ledger.sharedRareCandy.remaining).toBeGreaterThanOrEqual(0);
    expect(plan.ledger.sharedRareCandyXl.remaining).toBeGreaterThanOrEqual(0);
  });
});
