import { describe, expect, it } from "vitest";
import { speciesRegistry } from "../registry.js";
import { DEFAULT_ASSUMPTIONS as COMPARATOR_DEFAULTS } from "../ComparatorView.js";
import { DEFAULT_TEAM_ASSUMPTIONS } from "../TeamRaidView.js";
import { DEFAULT_ASSUMPTIONS as SPECIES_REPORT_DEFAULTS } from "../SpeciesReportView.js";
import { DEFAULT_ASSUMPTIONS as IV_DEFAULTS } from "../IvBreakpointsView.js";
import { DEFAULT_ASSUMPTIONS as ADB_DEFAULTS } from "../AttackDefenseBreakpointsView.js";
import { DEFAULT_ASSUMPTIONS as PU_DEFAULTS } from "../PowerUpOptimizerView.js";
import { runComparatorScenario } from "./runComparator.js";
import { runTeamRaidScenario } from "./runTeamRaid.js";
import { runSpeciesReportScenario } from "./runSpeciesReport.js";
import { runIvBreakpointsScenario } from "./runIvBreakpoints.js";
import { runAttackDefenseBreakpointsScenario } from "./runAttackDefenseBreakpoints.js";
import { runPowerUpOptimizerScenario } from "./runPowerUpOptimizer.js";
import { runRosterBudgetScenario, runRosterPlannerScenario } from "./runRosterPlanner.js";
import { resolveMultiRaidBossIds, DEFAULT_MULTI_RAID_BOSS_FILTERS } from "../multiRaidBossSet.js";
import type { RosterEntry } from "../import/pokeGenieMatch.js";

// One smoke test per run*Scenario function, against the real registry and
// each tab's own default scenario — the same inputs a fresh page load
// demonstrates. Not exhaustive coverage of every branch (each run module's
// logic is otherwise exercised indirectly through the app itself); this
// exists to catch a wiring mistake (wrong field name, dropped guard) that
// would make the DEFAULT scenario itself throw or return NaN/undefined,
// which would be an immediate, visible break on first load.

function expectFiniteNumber(value: unknown, label: string) {
  expect(typeof value, label).toBe("number");
  expect(Number.isFinite(value as number), label).toBe(true);
}

describe("runComparatorScenario (default scenario)", () => {
  it("produces a well-formed result with no NaN/undefined headline numbers", () => {
    const result = runComparatorScenario(COMPARATOR_DEFAULTS, speciesRegistry);
    expect(result.speciesError).toBeNull();
    expect(result.resultsError).toBeNull();
    expect(result.candidates).not.toBeNull();
    expect(result.candidates).toHaveLength(2);
    expect(result.boss).not.toBeNull();
    expect(result.results).not.toBeNull();
    expect(result.results).toHaveLength(2);
    for (const c of result.results!) {
      expectFiniteNumber(c.meanSecondsSurvived, "meanSecondsSurvived");
      expectFiniteNumber(c.meanTotalDamage, "meanTotalDamage");
    }
    expectFiniteNumber(result.naturalFightLengthSeconds, "naturalFightLengthSeconds");
    expectFiniteNumber(result.chartMaxSeconds, "chartMaxSeconds");
    expect(result.chartMaxSeconds).toBeGreaterThan(0);
    // Level/dodge/party/boost/cadence/dps + attack/defense/stamina IV = 10 checks.
    expect(result.sensitivity.length).toBe(10);
  }, 20_000);
});

describe("runTeamRaidScenario (default scenario)", () => {
  it("produces a well-formed result with no NaN/undefined headline numbers", () => {
    const result = runTeamRaidScenario(DEFAULT_TEAM_ASSUMPTIONS, speciesRegistry);
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.bossSpecies).not.toBeNull();
    expectFiniteNumber(result.bossHp, "bossHp");
    expect(result.bossHp).toBeGreaterThan(0);
    expect(["cleared", "timerExpired"]).toContain(result.data!.outcome);
    expect(result.data!.slots.length).toBeGreaterThan(0);
    expectFiniteNumber(result.data!.wipeCount, "wipeCount");
    expectFiniteNumber(result.data!.slotsUsed, "slotsUsed");
  }, 20_000);
});

describe("runSpeciesReportScenario (default scenario)", () => {
  it("produces a well-formed result with no NaN/undefined headline numbers", () => {
    const result = runSpeciesReportScenario(SPECIES_REPORT_DEFAULTS, speciesRegistry);
    expect(result.error).toBeNull();
    expect(result.species).not.toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data!.rows.length).toBe(result.targets.length);
    expect(result.data!.rows.length).toBeGreaterThan(0);
    for (const row of result.data!.rows) {
      expectFiniteNumber(row.sustained.meanTotalDamage, "row.sustained.meanTotalDamage");
      expectFiniteNumber(row.offensiveTypeMatchup, "row.offensiveTypeMatchup");
    }
  }, 30_000);
});

describe("runIvBreakpointsScenario (default scenario)", () => {
  it("produces a well-formed result with no NaN/undefined headline numbers", () => {
    const result = runIvBreakpointsScenario(IV_DEFAULTS, speciesRegistry);
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    // One row per scanned level (LEVELS_35_TO_50 has 31 entries).
    expect(result.data!.rows.length).toBe(31);
    for (const row of result.data!.rows) {
      expectFiniteNumber(row.ivA.fastMoveDamage, "ivA.fastMoveDamage");
      expectFiniteNumber(row.ivB.fastMoveDamage, "ivB.fastMoveDamage");
    }
    expect(result.sweepAggregate.totalComputed).toBeGreaterThan(0);
  }, 30_000);
});

describe("runAttackDefenseBreakpointsScenario (default scenario)", () => {
  it("produces a well-formed attack-mode grid with no NaN/undefined damage values", () => {
    const result = runAttackDefenseBreakpointsScenario(ADB_DEFAULTS, speciesRegistry);
    expect(result.error).toBeNull();
    expect(ADB_DEFAULTS.mode).toBe("attack");
    expect(result.attack).not.toBeNull();
    expect(result.defense).toBeNull();
    // 16 IVs x 51 levels = 816 cells per move.
    expect(result.attack!.fast.length).toBe(16 * 51);
    expect(result.attack!.charged.length).toBe(16 * 51);
    for (const cell of result.attack!.fast) {
      expectFiniteNumber(cell.damage, "cell.damage");
    }
  }, 20_000);
});

describe("runPowerUpOptimizerScenario (default scenario)", () => {
  it("produces a well-formed result with no NaN/undefined headline numbers", () => {
    const result = runPowerUpOptimizerScenario(PU_DEFAULTS, speciesRegistry);
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expectFiniteNumber(result.bossHp, "bossHp");
    expectFiniteNumber(result.data!.baseline.teamDps, "baseline.teamDps");
    expect(result.data!.ladders.length).toBe(PU_DEFAULTS.slots.length);
    for (const c of result.data!.candidates) {
      expectFiniteNumber(c.deltaTeamDps, "candidate.deltaTeamDps");
    }
  }, 30_000);

  it("runs enough seeds to produce a positive noise floor, and never recommends a within-noise candidate", () => {
    const result = runPowerUpOptimizerScenario(PU_DEFAULTS, speciesRegistry);
    expect(result.data).not.toBeNull();
    const d = result.data!;
    expectFiniteNumber(d.noiseFloorTeamDps, "noiseFloorTeamDps");
    expect(d.noiseFloorTeamDps).toBeGreaterThan(0);
    expect(d.iterations).toBeGreaterThan(3);
    if (d.bestAffordableByDelta) {
      expect(d.bestAffordableByDelta.deltaExceedsNoise).toBe(true);
    }
    if (d.bestAffordableByStardustEfficiency) {
      expect(d.bestAffordableByStardustEfficiency.deltaExceedsNoise).toBe(true);
    }
  }, 30_000);

  it("computes a fixed-budget plan alongside the ranked candidates, with a well-formed ledger", () => {
    const result = runPowerUpOptimizerScenario(PU_DEFAULTS, speciesRegistry);
    expect(result.plan).not.toBeNull();
    const plan = result.plan!;
    expectFiniteNumber(plan.baseline.teamDps, "plan.baseline.teamDps");
    expectFiniteNumber(plan.final.teamDps, "plan.final.teamDps");
    expectFiniteNumber(plan.noiseFloorTeamDps, "plan.noiseFloorTeamDps");
    // Each committed step must clear the noise floor in effect for ITS OWN
    // round — NOT plan.noiseFloorTeamDps, which is the FINAL floor. The floor
    // is remeasured from the current roster's variance after every commit, so
    // a plan's steps can legitimately be judged against different bars, and
    // only the last step is guaranteed to clear the final one. Asserting
    // against plan.noiseFloorTeamDps here passed on the default roster by
    // luck, not by construction.
    for (const step of plan.steps) {
      expectFiniteNumber(step.deltaTeamDps, "step.deltaTeamDps");
      expectFiniteNumber(step.noiseFloorTeamDps, "step.noiseFloorTeamDps");
      expect(step.deltaTeamDps).toBeGreaterThan(step.noiseFloorTeamDps);
      // Own-vs-shared split must sum back to the step's own reported cost.
      expect(step.ownCandySpent + step.sharedCandySpent).toBe(step.cost.candy);
      expect(step.ownXlCandySpent + step.sharedXlCandySpent).toBe(step.cost.xlCandy);
    }
    // Never spend more than what was on hand.
    expect(plan.ledger.stardust.spent).toBeLessThanOrEqual(PU_DEFAULTS.stardustOnHand);
    expect(plan.ledger.stardust.remaining).toBeGreaterThanOrEqual(0);
    expect(plan.ledger.sharedRareCandy.remaining).toBeGreaterThanOrEqual(0);
    expect(plan.ledger.sharedRareCandyXl.remaining).toBeGreaterThanOrEqual(0);
    expect(plan.finalLevels.length).toBe(PU_DEFAULTS.slots.length);
    // Shape-only check on the default (generous) budget — whether a real
    // blocked gain exists at all depends on how much headroom is left, so
    // this doesn't assert null/non-null, only that whichever it is is
    // well-formed. The genuinely-tight-budget case below asserts non-null.
    if (plan.bestBlockedCandidate) {
      const blocked = plan.bestBlockedCandidate;
      expectFiniteNumber(blocked.deltaTeamDps, "bestBlockedCandidate.deltaTeamDps");
      expect(blocked.deltaTeamDps).toBeGreaterThan(plan.noiseFloorTeamDps);
      expect(blocked.shortfalls.length).toBeGreaterThan(0);
      for (const s of blocked.shortfalls) {
        expect(["stardust", "candy", "xlCandy"]).toContain(s.resource);
        expect(s.shortfall).toBeGreaterThan(0);
      }
    } else {
      expect(plan.bestBlockedCandidate).toBeNull();
    }
  }, 30_000);

  it("reports a non-null bestBlockedCandidate — with every shortfall named — when a real gain exists but the budget is too tight to afford it", () => {
    // Same default roster/boss, but a deliberately tight budget (matches the
    // real bug report this field exists to fix): a bigger gain exists just
    // beyond what's affordable, and the plan must say so rather than reading
    // as "nothing else helps."
    const tightAssumptions = {
      ...PU_DEFAULTS,
      stardustOnHand: 100_000,
      rareCandyOnHand: 25,
      slots: PU_DEFAULTS.slots.map((s) => ({ ...s, candyOnHand: 10 })),
    };
    const result = runPowerUpOptimizerScenario(tightAssumptions, speciesRegistry);
    expect(result.plan).not.toBeNull();
    const blocked = result.plan!.bestBlockedCandidate;
    expect(blocked).not.toBeNull();
    expectFiniteNumber(blocked!.deltaTeamDps, "bestBlockedCandidate.deltaTeamDps");
    expect(blocked!.deltaTeamDps).toBeGreaterThan(result.plan!.noiseFloorTeamDps);
    expect(blocked!.shortfalls.length).toBeGreaterThan(0);
    for (const s of blocked!.shortfalls) {
      expect(["stardust", "candy", "xlCandy"]).toContain(s.resource);
      expect(s.shortfall).toBeGreaterThan(0);
    }
  }, 30_000);
});

describe("runRosterPlannerScenario (multi-raid mode)", () => {
  // A small hand-built pool — the real (Poke Genie CSV) import path is
  // covered by import/pokeGenieMatch.test.ts; this smoke test only proves
  // runRosterPlannerScenario's OWN wiring (target resolution, engine call,
  // result shape) doesn't throw or produce NaN/undefined on real data, same
  // "catch a wiring mistake, not exhaustive coverage" scope as every other
  // smoke test in this file.
  const pool: RosterEntry[] = ["houndour", "houndoom", "kartana", "tyranitar-mega", "dragonite", "garchomp"].map((id, i) => {
    const species = speciesRegistry.get(id);
    return {
      entryId: `smoke-${i}-${id}`,
      species,
      fastMoveId: species.fastMoves[0]!.id,
      chargedMoveId: species.chargedMoves[0]!.id,
      level: 20 + i,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      costModifiers: { isShadow: false, isPurified: false, isLucky: false },
      canMega: id === "tyranitar-mega",
      ivsAreApproximate: false,
      levelIsApproximate: false,
      movesetIsDefaulted: false,
      sourceLineNumber: i + 2,
      unmatchedMoveNames: [],
    };
  });
  const multiRaidAssumptions = {
    ...PU_DEFAULTS,
    mode: "multi-raid" as const,
    multiRaidBossIds: resolveMultiRaidBossIds({ ...DEFAULT_MULTI_RAID_BOSS_FILTERS, maxBossCount: 3 }),
  };

  it("produces a well-formed result with no NaN/undefined headline numbers, given a real pool", () => {
    const result = runRosterPlannerScenario(multiRaidAssumptions, speciesRegistry, pool);
    expect(result.error).toBeNull();
    expect(result.blockedReason).toBeNull();
    expect(result.data).not.toBeNull();
    const d = result.data!;
    expectFiniteNumber(d.noiseFloorTeamDps, "noiseFloorTeamDps");
    expect(d.baselinePerBoss.length).toBe(result.targets.length);
    for (const b of d.baselinePerBoss) {
      expectFiniteNumber(b.summary.teamDps, "baselinePerBoss.summary.teamDps");
    }
    for (const c of d.candidates) {
      expectFiniteNumber(c.meanDeltaTeamDps, "candidate.meanDeltaTeamDps");
      expect(c.perBoss.length).toBe(result.targets.length);
    }
    // Houndour has an evolution (Houndoom) — must be excluded and reported,
    // never silently dropped (PLAN §3.6).
    expect(d.neverCompetitive.some((n) => n.speciesId === "houndour")).toBe(true);
  }, 30_000);

  it("reports blockedReason \"no-roster\" for an empty pool, never a thrown error", () => {
    const result = runRosterPlannerScenario(multiRaidAssumptions, speciesRegistry, []);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
    expect(result.blockedReason).toBe("no-roster");
  });

  it("reports blockedReason \"no-bosses\" when multiRaidBossIds resolves to nothing", () => {
    const result = runRosterPlannerScenario({ ...multiRaidAssumptions, multiRaidBossIds: [] }, speciesRegistry, pool);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
    expect(result.blockedReason).toBe("no-bosses");
  });

  // Phase 3b split runRosterPlannerScenario into resolveRosterPlannerInputs
  // (MAIN thread, needs registry.ts) + a plain runRosterPlanner(inputs) call
  // (either right here, or inside rosterPlanner.worker.ts). This proves the
  // resolved `inputs` object is exactly what a worker would need — handed
  // STRAIGHT to the engine's own runRosterPlanner with zero further
  // processing — producing the SAME result runRosterPlannerScenario's own
  // synchronous path does, so the worker path can never silently diverge
  // from what the CLI/smoke test exercise.
  it("resolveRosterPlannerInputs + a raw runRosterPlanner(inputs) call (the worker's own path) matches runRosterPlannerScenario's synchronous result", async () => {
    const { resolveRosterPlannerInputs } = await import("./runRosterPlanner.js");
    const { runRosterPlanner } = await import("@pogo-analyzer/engine");

    const resolution = resolveRosterPlannerInputs(multiRaidAssumptions, speciesRegistry, pool);
    expect(resolution.blockedReason).toBeNull();
    expect(resolution.inputs).not.toBeNull();

    const viaWorkerShapedPath = runRosterPlanner(resolution.inputs!);
    const viaSynchronousPath = runRosterPlannerScenario(multiRaidAssumptions, speciesRegistry, pool);

    expect(viaSynchronousPath.data).not.toBeNull();
    // Same seeded inputs -> byte-identical numeric result (this engine's
    // seeding is deterministic — see comparison.ts's own seed convention).
    expect(viaWorkerShapedPath.noiseFloorTeamDps).toBe(viaSynchronousPath.data!.noiseFloorTeamDps);
    expect(viaWorkerShapedPath.candidates.length).toBe(viaSynchronousPath.data!.candidates.length);
  }, 30_000);
});

describe("runRosterBudgetScenario (multi-raid mode fixed-budget plan, Phase 4)", () => {
  // Same hand-built pool shape as runRosterPlannerScenario's own smoke test
  // above — planRosterBudget shares the SAME resolveRosterPlannerInputs
  // input, so this only needs to prove ITS OWN wiring (the ledger, steps,
  // excludedEntries) doesn't throw or produce NaN/undefined on real data.
  const pool: RosterEntry[] = ["houndour", "houndoom", "kartana", "tyranitar-mega", "dragonite", "garchomp"].map((id, i) => {
    const species = speciesRegistry.get(id);
    return {
      entryId: `budget-smoke-${i}-${id}`,
      species,
      fastMoveId: species.fastMoves[0]!.id,
      chargedMoveId: species.chargedMoves[0]!.id,
      level: 20 + i,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      costModifiers: { isShadow: false, isPurified: false, isLucky: false },
      canMega: id === "tyranitar-mega",
      ivsAreApproximate: false,
      levelIsApproximate: false,
      movesetIsDefaulted: false,
      sourceLineNumber: i + 2,
      unmatchedMoveNames: [],
    };
  });

  // Generous, KNOWN candy for every family this pool resolves to — a budget
  // plan (unlike the ranked sweep, whose default candyByFamilyId of `{}`
  // suffices) EXCLUDES any entry whose candy family is unknown (PLAN §3.4),
  // so a test proving `steps.length > 0` needs real candy on hand.
  const knownFamilyIds = ["houndour", "houndoom", "kartana", "tyranitar", "dragonite", "garchomp"]
    .map((id) => speciesRegistry.get(id).candyFamilyId)
    .filter((id): id is string => !!id);
  const candyByFamilyId = Object.fromEntries(knownFamilyIds.map((id) => [id, { candy: 1_000_000, xlCandy: 1_000_000 }]));

  const multiRaidAssumptions = {
    ...PU_DEFAULTS,
    mode: "multi-raid" as const,
    multiRaidBossIds: resolveMultiRaidBossIds({ ...DEFAULT_MULTI_RAID_BOSS_FILTERS, maxBossCount: 3 }),
    stardustOnHand: 1_000_000,
    candyByFamilyId,
  };

  it("produces a well-formed plan with no NaN/undefined headline numbers, given a real pool with known candy", () => {
    const result = runRosterBudgetScenario(multiRaidAssumptions, speciesRegistry, pool);
    expect(result.error).toBeNull();
    expect(result.blockedReason).toBeNull();
    expect(result.data).not.toBeNull();
    const p = result.data!;
    expectFiniteNumber(p.noiseFloorTeamDps, "noiseFloorTeamDps");
    expect(p.baselinePerBoss.length).toBe(result.targets.length);
    expect(p.finalPerBoss.length).toBe(result.targets.length);
    for (const step of p.steps) {
      expectFiniteNumber(step.meanDeltaTeamDps, "step.meanDeltaTeamDps");
      expect(step.perBoss.length).toBe(result.targets.length);
      // Own + shared MUST sum back to the step's own reported cost — never a
      // silently-blended or overspent total (CLAUDE.md standing decision).
      expect(step.ownCandySpent + step.sharedCandySpent).toBe(step.cost.candy);
      expect(step.ownXlCandySpent + step.sharedXlCandySpent).toBe(step.cost.xlCandy);
    }
    expectFiniteNumber(p.ledger.stardust.spent, "ledger.stardust.spent");
    // Houndour has an evolution (Houndoom) — must be excluded and reported,
    // never silently dropped (PLAN §3.6), same as the ranked sweep's own
    // neverCompetitive assertion.
    expect(p.excludedEntries.some((e) => e.speciesId === "houndour")).toBe(true);
  }, 30_000);

  it('reports blockedReason "no-roster" for an empty pool, never a thrown error', () => {
    const result = runRosterBudgetScenario(multiRaidAssumptions, speciesRegistry, []);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
    expect(result.blockedReason).toBe("no-roster");
  });

  it('reports blockedReason "no-bosses" when multiRaidBossIds resolves to nothing', () => {
    const result = runRosterBudgetScenario({ ...multiRaidAssumptions, multiRaidBossIds: [] }, speciesRegistry, pool);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
    expect(result.blockedReason).toBe("no-bosses");
  });
});
