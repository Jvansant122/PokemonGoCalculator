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
});
