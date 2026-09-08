import { describe, expect, it } from "vitest";
import { bossEffectiveStats, resolveMove, runSustainedComparison } from "../src/comparison.js";
import { attackDamageGrid, defenseDamageGrid } from "../src/breakpoints.js";
import { optimizePowerUps, type PowerUpSlotInput } from "../src/powerUp.js";
import { runSpeciesReverseLookup, type SpeciesReportBossTarget } from "../src/speciesReport.js";
import { simulateStepwiseBattle } from "../src/simulate.js";
import { runTeamRaid, type TeamRaidSlotInput } from "../src/teamRaid.js";
import type { IVSpread, SpeciesDefinition } from "../src/types.js";
import {
  buildPerfStepwiseParams,
  PERF_ATTACKER_ID,
  PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
  PERF_BOSS_ID,
  PERF_IVS,
  PERF_LEVEL,
  PERF_REPORT_BOSS_IDS,
  PERF_ROSTER_IDS,
  realPowerUpCostTable,
  realSpecies,
} from "./fixtures/perfFixtures.js";

/**
 * A coarse performance-regression guard, not a benchmark (see perf.bench.ts
 * for the actual timing suite) — a normal vitest test that runs in the
 * regular suite / the PostToolUse hook / CI, asserting each hot path
 * completes within a GENEROUS budget (~10x a number actually measured on
 * this project's dev machine, recorded per-block below). The goal is to
 * catch an order-of-magnitude regression in simulate.ts/teamRaid.ts/
 * optimizePowerUps — the debounces the web UI relies on (Species Report:
 * ~200 sims/boss over ~600 bosses; Power-Up Optimizer: ~200 full Team Raids
 * per keystroke) assume these stay roughly this cheap — never to flake on a
 * slower CI runner. Each block warms up once (excluded from the timed
 * measurement) before timing.
 *
 * If a legitimate engine change makes one of these meaningfully (not 10x)
 * slower, re-measure locally and raise the budget explicitly — don't
 * silently loosen it further than that without re-deriving the number, per
 * this project's regression-gate discipline.
 */

const boss: SpeciesDefinition = realSpecies(PERF_BOSS_ID);
const attacker: SpeciesDefinition = realSpecies(PERF_ATTACKER_ID);
const rosterSpecies: SpeciesDefinition[] = PERF_ROSTER_IDS.map((id) => realSpecies(id));
const reportTargets: SpeciesReportBossTarget[] = PERF_REPORT_BOSS_IDS.map((id) => ({ species: realSpecies(id) }));
const costTable = realPowerUpCostTable();

function teamRaidSlots(level: number, ivs: IVSpread): TeamRaidSlotInput[] {
  return rosterSpecies.map((species) => ({
    species,
    fastMoveId: null,
    chargedMoveId: null,
    isMega: species.id === PERF_ATTACKER_ID,
    level,
    ivs,
  }));
}

function powerUpSlots(level: number, ivs: IVSpread): PowerUpSlotInput[] {
  return rosterSpecies.map((species) => ({
    species,
    fastMoveId: null,
    chargedMoveId: null,
    isMega: species.id === PERF_ATTACKER_ID,
    level,
    ivs,
    costModifiers: { isShadow: false, isPurified: false, isLucky: false },
    candyOnHand: 9999,
    xlCandyOnHand: 9999,
  }));
}

/** Runs `fn` once (discarded, as warmup) then `reps` more times, returning the elapsed ms for those `reps` runs only. */
function timeReps(fn: () => void, reps: number): number {
  fn(); // warmup
  const start = performance.now();
  for (let i = 0; i < reps; i++) fn();
  return performance.now() - start;
}

describe("performance regression guard (coarse, ~10x locally-measured budgets)", () => {
  it("simulateStepwiseBattle: single stepwise run stays cheap", () => {
    const params = buildPerfStepwiseParams(attacker, boss);
    // Locally measured: 20 reps ~1.7-2.0ms total (~0.09ms/call) on this dev machine.
    const REPS = 20;
    const BUDGET_MS = 20; // ~10x measured
    const elapsed = timeReps(() => simulateStepwiseBattle(params), REPS);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("runSustainedComparison: one boss's 200-iteration distribution stays cheap (Species Report's per-boss unit cost)", () => {
    const REPS = 3;
    const BUDGET_MS = 180; // ~10x measured (~17-18ms for 3 reps, i.e. ~6ms/call)
    const elapsed = timeReps(
      () =>
        runSustainedComparison({
          candidates: [attacker],
          boss,
          level: PERF_LEVEL,
          ivs: PERF_IVS,
          dodge: { kind: "perfect" },
          bossChargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
        }),
      REPS,
    );
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("runTeamRaid: one full 6-slot Team Raid stays cheap", () => {
    const slots = teamRaidSlots(PERF_LEVEL, PERF_IVS);
    const REPS = 10;
    const BUDGET_MS = 80; // ~10x measured (~5.6-7.6ms for 10 reps, i.e. ~0.7ms/call)
    const elapsed = timeReps(
      () =>
        runTeamRaid({
          slots,
          boss,
          level: PERF_LEVEL,
          ivs: PERF_IVS,
          dodge: { kind: "perfect" },
          bossChargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
          raidTimerSeconds: 300,
          seed: 1,
        }),
      REPS,
    );
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("optimizePowerUps: a full ~180-candidate sweep on a 6-slot roster stays cheap", () => {
    const slots = powerUpSlots(35, PERF_IVS);
    const REPS = 1;
    const BUDGET_MS = 1350; // ~10x measured (~131-135ms for a single full sweep)
    const elapsed = timeReps(
      () =>
        optimizePowerUps({
          slots,
          boss,
          dodge: { kind: "perfect" },
          bossChargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
          raidTimerSeconds: 300,
          costTable,
          stardustOnHand: 999_999_999,
          seed: 1,
        }),
      REPS,
    );
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("runSpeciesReverseLookup: sweeping several real bosses at 200 iterations each stays cheap", () => {
    const REPS = 3;
    const BUDGET_MS = 300; // ~10x measured (~29.6-30ms for 3 reps, i.e. ~10ms/call across 5 bosses)
    const elapsed = timeReps(
      () =>
        runSpeciesReverseLookup({
          species: attacker,
          level: PERF_LEVEL,
          ivs: PERF_IVS,
          dodge: { kind: "perfect" },
          bossChargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
          targets: reportTargets,
        }),
      REPS,
    );
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("attackDamageGrid + defenseDamageGrid: the full 16 IV x 51 level grids stay cheap", () => {
    const bossStats = bossEffectiveStats(boss);
    const fastMove = resolveMove(attacker.fastMoves, undefined)!;
    const bossFastMove = resolveMove(boss.fastMoves, undefined)!;
    const REPS = 50;
    const BUDGET_MS = 320; // ~10x measured (~31-32ms for 50 reps, i.e. ~0.63ms/call for both grids)
    const elapsed = timeReps(() => {
      attackDamageGrid({
        baseAttack: attacker.baseAttack,
        defenderDefenseStat: bossStats.defense,
        power: fastMove.power,
        damageModifiers: { stab: true, typeEffectiveness: 1 },
      });
      defenseDamageGrid({
        baseDefense: attacker.baseDefense,
        attackerAttackStat: bossStats.attack,
        power: bossFastMove.power,
        damageModifiers: { stab: true, typeEffectiveness: 1 },
      });
    }, REPS);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
