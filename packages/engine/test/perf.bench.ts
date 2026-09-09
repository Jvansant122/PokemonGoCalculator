import { bench, describe } from "vitest";
import { bossEffectiveStats, resolveMove, runSustainedComparison } from "../src/comparison.js";
import { attackDamageGrid, defenseDamageGrid } from "../src/breakpoints.js";
import { optimizePowerUps, planPowerUpBudget, type PowerUpSlotInput } from "../src/powerUp.js";
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
 * Performance benchmarks (vitest `bench`, informational only — see
 * perf.test.ts for the actual pass/fail regression guard). Covers the hot
 * paths the web UI drives repeatedly on a debounce: Species Report (~200
 * sims/boss over ~600 bosses) and the Power-Up Optimizer (~200 full Team
 * Raids/keystroke). Every case uses REAL synced species (data/normalized/
 * species.json) so the numbers mean something against the actual roster
 * shapes/movesets in production, not a hand-tuned worst/best case.
 *
 * Run via `npm run bench` (from repo root) or `npm run bench --workspace=
 * packages/engine`.
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

/** Same as powerUpSlots, but with a caller-chosen (tight) per-slot candyOnHand — see perf.test.ts's matching helper for why. */
function powerUpSlotsWithCandy(level: number, ivs: IVSpread, candyOnHand: number): PowerUpSlotInput[] {
  return rosterSpecies.map((species) => ({
    species,
    fastMoveId: null,
    chargedMoveId: null,
    isMega: species.id === PERF_ATTACKER_ID,
    level,
    ivs,
    costModifiers: { isShadow: false, isPurified: false, isLucky: false },
    candyOnHand,
    xlCandyOnHand: candyOnHand,
  }));
}

describe("simulate.ts: one stepwise simulation run", () => {
  const params = buildPerfStepwiseParams(attacker, boss);
  bench("simulateStepwiseBattle (single run, real species)", () => {
    simulateStepwiseBattle(params);
  });
});

describe("comparison.ts: sustained distribution (Species Report's per-boss cost)", () => {
  bench("runSustainedComparison (1 candidate, 200 iterations, real species)", () => {
    runSustainedComparison({
      candidates: [attacker],
      boss,
      level: PERF_LEVEL,
      ivs: PERF_IVS,
      dodge: { kind: "perfect" },
      bossChargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
    });
  });
});

describe("teamRaid.ts: one full Team Raid", () => {
  bench("runTeamRaid (realistic 6-slot roster vs. real boss)", () => {
    runTeamRaid({
      slots: teamRaidSlots(PERF_LEVEL, PERF_IVS),
      boss,
      level: PERF_LEVEL,
      ivs: PERF_IVS,
      dodge: { kind: "perfect" },
      bossChargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
      raidTimerSeconds: 300,
      seed: 1,
    });
  });
});

describe("powerUp.ts: full optimizer sweep (~180 candidates, default-like roster)", () => {
  bench("optimizePowerUps (6-slot roster, level 35 -> maxLevel 50)", () => {
    optimizePowerUps({
      slots: powerUpSlots(35, PERF_IVS),
      boss,
      dodge: { kind: "perfect" },
      bossChargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
      raidTimerSeconds: 300,
      costTable,
      stardustOnHand: 999_999_999,
      seed: 1,
    });
  });
});

describe("powerUp.ts: fixed-budget greedy planner (worst-case: level 1 -> maxLevel 50, effectively unlimited budget)", () => {
  bench("planPowerUpBudget (6-slot roster, 20 iterations)", () => {
    planPowerUpBudget({
      slots: powerUpSlots(1, PERF_IVS),
      boss,
      dodge: { kind: "perfect" },
      bossChargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
      raidTimerSeconds: 300,
      costTable,
      stardustOnHand: 999_999_999,
      rareCandyOnHand: 99_999,
      rareCandyXlOnHand: 99_999,
      maxLevel: 50,
      iterations: 20,
      seed: 1,
    });
  });
});

describe("powerUp.ts: fixed-budget greedy planner's post-search 'best blocked candidate' pass (candy-starved slots)", () => {
  bench("planPowerUpBudget (6-slot roster, level 20, tight own-candy, generous shared pools, 20 iterations)", () => {
    planPowerUpBudget({
      slots: powerUpSlotsWithCandy(20, PERF_IVS, 15),
      boss,
      dodge: { kind: "perfect" },
      bossChargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
      raidTimerSeconds: 300,
      costTable,
      stardustOnHand: 999_999_999,
      rareCandyOnHand: 30,
      rareCandyXlOnHand: 30,
      maxLevel: 50,
      iterations: 20,
      seed: 1,
    });
  });
});

describe("speciesReport.ts: reverse lookup across several real bosses", () => {
  bench("runSpeciesReverseLookup (5 bosses, 200 iterations each, real species)", () => {
    runSpeciesReverseLookup({
      species: attacker,
      level: PERF_LEVEL,
      ivs: PERF_IVS,
      dodge: { kind: "perfect" },
      bossChargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
      targets: reportTargets,
    });
  });
});

describe("breakpoints.ts: full attack/defense damage grids", () => {
  const bossStats = bossEffectiveStats(boss);
  const fastMove = resolveMove(attacker.fastMoves, undefined)!;
  const bossFastMove = resolveMove(boss.fastMoves, undefined)!;

  bench("attackDamageGrid + defenseDamageGrid (full 16 IV x 51 level grid, real species)", () => {
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
  });
});
