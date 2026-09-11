import { describe, expect, it } from "vitest";
import { bossChargedMoveReadySeconds } from "@pogo-analyzer/engine";
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
import { runRosterMoveChangeScenario } from "./runRosterMoveChange.js";
import { runRosterScenario } from "./runRoster.js";
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
    // Default candidates (kartana vs rayquaza, both non-mega) have no active
    // mega/primal boost — party size cannot change the ranking, so this
    // axis is reported as inapplicable (null), same gate AssumptionPanel.tsx
    // uses to hide the party-size controls entirely in this case.
    expect(result.partySizeFlip).toBeNull();
    // IDEAS #21 — a band, not one blended number, see
    // run/dodgeExecutionErrorSweep.ts's own doc comment.
    expect(result.dodgeExecutionErrorBand).not.toBeNull();
    expect(result.dodgeExecutionErrorBand).toHaveLength(6);
    for (const p of result.dodgeExecutionErrorBand!) {
      expectFiniteNumber(p.a.meanTotalDamage, "dodgeExecutionErrorBand a.meanTotalDamage");
      expectFiniteNumber(p.b.meanTotalDamage, "dodgeExecutionErrorBand b.meanTotalDamage");
    }
  }, 20_000);
});

describe("runComparatorScenario (party-size ranking flip, IDEAS #19)", () => {
  // Real species pair found by sweeping the actual registry (see
  // feature_partysize_flip_and_boss_moveset_sweep in agent memory): Mega
  // Rayquaza's persistsThroughFaint boost plus higher own damage (406) wins
  // with few other trainers present, but Mega Salamence survives longer
  // (21.9s vs 18.5s mean) and so accrues more team-boost damage as the party
  // grows — the ranking flips once there are enough other trainers for that
  // extra uptime to outweigh Mega Rayquaza's raw damage lead.
  it("finds a real flip point for a pair where survivability-vs-raw-damage trades off with party size", () => {
    const assumptions = {
      ...COMPARATOR_DEFAULTS,
      candidateAId: "rayquaza-mega",
      candidateBId: "salamence-mega",
      targetId: "tyranitar",
      matchingTeammateCount: 2,
    };
    const result = runComparatorScenario(assumptions, speciesRegistry);
    expect(result.partySizeFlip).not.toBeNull();
    const flip = result.partySizeFlip!;
    expect(flip.partySize).toBe(3);
    expect(flip.leaderBelow).toBe("Mega Rayquaza");
    expect(flip.leaderAtOrAbove).toBe("Mega Salamence");
  }, 20_000);

  it("reports no crossing (partySize: null) when one candidate leads at every party size in range", () => {
    const assumptions = {
      ...COMPARATOR_DEFAULTS,
      candidateAId: "rayquaza-mega",
      candidateBId: "kartana",
      targetId: "latios-mega",
      matchingTeammateCount: 2,
    };
    const result = runComparatorScenario(assumptions, speciesRegistry);
    expect(result.partySizeFlip).not.toBeNull();
    const flip = result.partySizeFlip!;
    expect(flip.partySize).toBeNull();
    expect(flip.leaderBelow).toBe("Mega Rayquaza");
    expect(flip.leaderAtOrAbove).toBe("Mega Rayquaza");
  });
});

describe("runComparatorScenario (showDetailedAssumptions derived-frequency fallback)", () => {
  it("derives effectiveBossChargedMoveFrequencySeconds from the boss's own fast-move charge time when showDetailedAssumptions is false", () => {
    const assumptions = { ...COMPARATOR_DEFAULTS, showDetailedAssumptions: false };
    const result = runComparatorScenario(assumptions, speciesRegistry);
    expect(result.boss).not.toBeNull();
    const boss = result.boss!;
    const bossFastMove = boss.fastMoves.find((m) => m.id === assumptions.bossFastMoveId) ?? boss.fastMoves[0]!;
    const bossChargedMove =
      boss.chargedMoves.find((m) => m.id === assumptions.bossChargedMoveId) ?? boss.chargedMoves[0]!;
    const expected = bossChargedMoveReadySeconds(bossFastMove, bossChargedMove, 0);
    expect(result.effectiveBossChargedMoveFrequencySeconds).toBe(expected);
  });

  it("uses the stored bossChargedMoveFrequencySeconds verbatim when showDetailedAssumptions is true", () => {
    const assumptions = { ...COMPARATOR_DEFAULTS, showDetailedAssumptions: true, bossChargedMoveFrequencySeconds: 42 };
    const result = runComparatorScenario(assumptions, speciesRegistry);
    expect(result.effectiveBossChargedMoveFrequencySeconds).toBe(42);
  });
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
    // Default boss (tyranitar-mega) has 4 known charged moves — the sweep
    // must actually run against the default scenario, not require a
    // special-cased matchup to exercise at all.
    expect(result.bossMovesetSweep).not.toBeNull();
    expect(result.bossMovesetSweep!.results.length).toBe(4);
    // IDEAS #14/#12 — well-formed even though the default scenario has both
    // toggles off and (in this CLI/test context) an empty roster pool.
    expectFiniteNumber(result.rosterPoolSize, "rosterPoolSize");
    expect(result.rosterPoolSize).toBe(0);
    expect(result.eraHpMatch === null || typeof result.eraHpMatch.eraHp === "number").toBe(true);
  }, 20_000);
});

describe("runTeamRaidScenario (boss moveset sweep, IDEAS #18)", () => {
  it("agrees with the main (single-moveset) run for the boss's currently-selected charged move", () => {
    const result = runTeamRaidScenario(DEFAULT_TEAM_ASSUMPTIONS, speciesRegistry);
    const sweepRowForSelectedMove = result.bossMovesetSweep!.results.find((r) => r.moveId === DEFAULT_TEAM_ASSUMPTIONS.bossChargedMoveId);
    expect(sweepRowForSelectedMove).toBeDefined();
    expect(sweepRowForSelectedMove!.outcome).toBe(result.data!.outcome);
    expect(sweepRowForSelectedMove!.timeToClearSeconds).toBe(result.data!.timeToClearSeconds);
  });

  it("flags verdictVaries when a real boss/roster pairing clears against one charged move but not another", () => {
    // A deliberately tightened timer (default is 300s for a Mega raid) so
    // at least one of the boss's own charged moves flips clear into failure
    // — found by sweeping raidTimerSeconds against the real default
    // roster/boss (see agent memory): at 290s, Mega Tyranitar's Fire Blast
    // fails to clear while its other 3 known charged moves (Crunch, Stone
    // Edge, Brutal Swing) all still clear comfortably.
    const tight = {
      ...DEFAULT_TEAM_ASSUMPTIONS,
      raidTimerSeconds: 290,
    };
    const result = runTeamRaidScenario(tight, speciesRegistry);
    expect(result.bossMovesetSweep).not.toBeNull();
    const sweep = result.bossMovesetSweep!;
    const outcomes = new Set(sweep.results.map((r) => r.clearsWithinTimer));
    // If this specific tightened timer happens not to reproduce a varying
    // verdict on a future data/balance change, this assertion documents the
    // intent (a verdict CAN vary) rather than silently degrading into a
    // trivially-true "results.length >= 2" check.
    expect(outcomes.size).toBeGreaterThan(1);
    expect(sweep.verdictVaries).toBe(true);
  });

  it("returns null when the boss has fewer than 2 known charged moves", () => {
    // magikarp is a real registry entry with exactly 1 known charged move —
    // not a real raid boss, but runTeamRaidScenario resolves targetId
    // straight off the registry with no raid-eligibility gate of its own, so
    // it's a legitimate way to exercise the `chargedMoves.length >= 2` guard
    // (same gate ComparatorView's own bossMovesetSweep uses) without a
    // synthetic species fixture.
    const oneMoveBoss = { ...DEFAULT_TEAM_ASSUMPTIONS, targetId: "magikarp" };
    const result = runTeamRaidScenario(oneMoveBoss, speciesRegistry);
    expect(result.error).toBeNull();
    expect(result.bossMovesetSweep).toBeNull();
  });
});

// IDEAS.md #23 — the Team Raid half of the own-charged-move-cast
// dodge-vulnerability cost the Comparator already surfaces. Both fields are
// 0 whenever holdChargedMoveUntilSafe is off (the default scenario's own
// state, already covered by the "produces a well-formed result" test above);
// this pins that turning the toggle ON produces a well-formed, non-negative,
// internally-consistent value instead, so a wiring regression (e.g. the
// field being dropped from buildTeamRaidInputs) fails this test rather than
// only being visible by eye in the UI.
describe("runTeamRaidScenario (holdChargedMoveUntilSafe own-cast dodge cost, IDEAS #23)", () => {
  it("is exactly 0 across every fight when holdChargedMoveUntilSafe is off", () => {
    const result = runTeamRaidScenario(DEFAULT_TEAM_ASSUMPTIONS, speciesRegistry);
    expect(result.data).not.toBeNull();
    for (const slot of result.data!.slots) {
      expect(slot.holdChargedMoveDodgeCostEvents).toBe(0);
      expect(slot.holdChargedMoveDodgeCostSeconds).toBe(0);
    }
  });

  it("reports a well-formed, non-negative total when holdChargedMoveUntilSafe is on", () => {
    const assumptions = { ...DEFAULT_TEAM_ASSUMPTIONS, holdChargedMoveUntilSafe: true };
    const result = runTeamRaidScenario(assumptions, speciesRegistry);
    expect(result.data).not.toBeNull();
    let totalEvents = 0;
    let totalSeconds = 0;
    for (const slot of result.data!.slots) {
      expectFiniteNumber(slot.holdChargedMoveDodgeCostEvents, "slot.holdChargedMoveDodgeCostEvents");
      expectFiniteNumber(slot.holdChargedMoveDodgeCostSeconds, "slot.holdChargedMoveDodgeCostSeconds");
      expect(slot.holdChargedMoveDodgeCostEvents).toBeGreaterThanOrEqual(0);
      expect(slot.holdChargedMoveDodgeCostSeconds).toBeGreaterThanOrEqual(0);
      totalEvents += slot.holdChargedMoveDodgeCostEvents;
      totalSeconds += slot.holdChargedMoveDodgeCostSeconds;
    }
    // The default roster/boss/dodge assumptions genuinely attempt at least
    // one charged-move dodge somewhere across the encounter, so this isn't a
    // vacuous "always 0" pass.
    expect(totalEvents).toBeGreaterThan(0);
    expect(totalSeconds).toBeGreaterThan(0);
  }, 20_000);
});

describe("runTeamRaidScenario (showDetailedAssumptions derived-frequency fallback)", () => {
  it("derives effectiveBossChargedMoveFrequencySeconds from the boss's own fast-move charge time when showDetailedAssumptions is false", () => {
    const assumptions = { ...DEFAULT_TEAM_ASSUMPTIONS, showDetailedAssumptions: false };
    const result = runTeamRaidScenario(assumptions, speciesRegistry);
    expect(result.bossSpecies).not.toBeNull();
    const boss = result.bossSpecies!;
    const bossFastMove = boss.fastMoves.find((m) => m.id === assumptions.bossFastMoveId) ?? boss.fastMoves[0]!;
    const bossChargedMove =
      boss.chargedMoves.find((m) => m.id === assumptions.bossChargedMoveId) ?? boss.chargedMoves[0]!;
    const expected = bossChargedMoveReadySeconds(bossFastMove, bossChargedMove, 0);
    expect(result.effectiveBossChargedMoveFrequencySeconds).toBe(expected);
  });

  it("uses the stored bossChargedMoveFrequencySeconds verbatim when showDetailedAssumptions is true", () => {
    const assumptions = { ...DEFAULT_TEAM_ASSUMPTIONS, showDetailedAssumptions: true, bossChargedMoveFrequencySeconds: 42 };
    const result = runTeamRaidScenario(assumptions, speciesRegistry);
    expect(result.effectiveBossChargedMoveFrequencySeconds).toBe(42);
  });
});

// IDEAS.md #17b — the engine's Shadow raid enrage (shadow.ts, wired into
// simulate.ts 2026-09-10) surfaced in the UI for the first time. These pin
// real, live-verified (via a built-dist Playwright drive, not just this
// smoke test) numbers against real Shadow raid bosses currently in
// data/normalized/activeRaids.json, so a future data-sync/registry change
// that moves these species off the live feed will fail this test loudly
// rather than silently going untested — see this feature's own report for
// the exact rendered strings this test's values were read off of.
describe("Shadow raid enrage timings (IDEAS #17b)", () => {
  it("runComparatorScenario: a non-Shadow boss (latios-mega, the default target) never enrages — both representativeRun timestamps stay null", () => {
    const result = runComparatorScenario(COMPARATOR_DEFAULTS, speciesRegistry);
    for (const c of result.results!) {
      expect(c.representativeRun.enragedAtSeconds).toBeNull();
      expect(c.representativeRun.subduedAtSeconds).toBeNull();
    }
  });

  it("runComparatorScenario: a real Shadow raid boss (bagon-shadow) enrages mid-fight for the charted (representativeRun) seed, strictly before that run's own faint time", () => {
    const assumptions = {
      ...COMPARATOR_DEFAULTS,
      targetId: "bagon-shadow",
      bossFastMoveId: "BITE_FAST",
      bossChargedMoveId: "CRUNCH",
      candidateAId: "rayquaza-mega",
      candidateBId: "kartana",
    };
    const result = runComparatorScenario(assumptions, speciesRegistry);
    expect(result.resultsError).toBeNull();
    const kartana = result.results!.find((c) => c.name === "Kartana")!;
    expect(kartana.representativeRun.enragedAtSeconds).toBeCloseTo(6.6, 5);
    // Never subdued within this specific charted run (it faints first) —
    // still a real, correctly-absent value, not a "never enrages" null.
    expect(kartana.representativeRun.subduedAtSeconds).toBeNull();
    expect(kartana.representativeRun.faintedAtSeconds).not.toBeNull();
    expect(kartana.representativeRun.enragedAtSeconds!).toBeLessThan(kartana.representativeRun.faintedAtSeconds!);
  });

  it("runTeamRaidScenario: a non-Shadow boss (tyranitar-mega, the default target) never enrages — every slot's raid-clock timestamps stay null", () => {
    const result = runTeamRaidScenario(DEFAULT_TEAM_ASSUMPTIONS, speciesRegistry);
    for (const slot of result.data!.slots) {
      expect(slot.enragedAtRaidSeconds).toBeNull();
      expect(slot.subduedAtRaidSeconds).toBeNull();
    }
  });

  it("runTeamRaidScenario: a real Shadow raid boss (sandslash-alola-shadow) enrages then auto-subdues on the raid-global clock, both strictly before the reported clear time", () => {
    const assumptions = {
      ...DEFAULT_TEAM_ASSUMPTIONS,
      targetId: "sandslash-alola-shadow",
      bossFastMoveId: "METAL_CLAW_FAST",
      bossChargedMoveId: "BLIZZARD",
    };
    const result = runTeamRaidScenario(assumptions, speciesRegistry);
    expect(result.error).toBeNull();
    expect(result.data!.outcome).toBe("cleared");
    // The FIRST non-null value across the flat, chronological slots array is
    // the one genuine raid-wide transition — see TeamRaidView.tsx's own
    // "Boss enraged" dt/dd for why .find() (not e.g. the last slot, or an
    // aggregate) is the correct read: simulate.ts's per-run enragePhase
    // resets to "normal" at the start of every later fight even once the
    // boss is already carrying enraged-or-worse cumulative damage, so a
    // later slot in the SAME encounter can also report a non-null
    // enragedAtRaidSeconds for what is actually a re-detection of the same
    // already-past transition, not a second real one (flagged to
    // engine-developer as a real, if currently harmless-for-this-summary,
    // mismatch against TeamRaidSlotResult.enragedAtRaidSeconds's own doc
    // comment, which promises null on a repeat).
    const raidEnragedAtSeconds = result.data!.slots.find((s) => s.enragedAtRaidSeconds !== null)?.enragedAtRaidSeconds ?? null;
    const raidSubduedAtSeconds = result.data!.slots.find((s) => s.subduedAtRaidSeconds !== null)?.subduedAtRaidSeconds ?? null;
    expect(raidEnragedAtSeconds).toBeCloseTo(20.1, 5);
    expect(raidSubduedAtSeconds).toBeCloseTo(143.7, 5);
    expect(raidEnragedAtSeconds!).toBeLessThan(raidSubduedAtSeconds!);
    expect(raidSubduedAtSeconds!).toBeLessThan(result.data!.timeToClearSeconds!);
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
    // Same default roster/boss, but a deliberately tight budget: a bigger
    // gain exists just beyond what's affordable, and the plan must say so
    // rather than reading as "nothing else helps." Budget figures tightened
    // 2026-09-10 alongside the default roster/boss replacement (see
    // TeamRaidView.tsx's DEFAULT_TEAM_ASSUMPTIONS doc comment) — the new
    // roster clears its former boss's replacement (a 3600 HP "tyranitar",
    // not the old 9000 HP "tyranitar-mega") so comfortably that the ORIGINAL
    // 100k-stardust/25-candy figures this test used to pin (from the real
    // bug report this field exists to fix) no longer reproduce a blocked
    // state at all — every candidate that clears the noise floor is already
    // affordable at that budget now. Verified empirically that this tighter
    // budget reliably reproduces a real (deltaTeamDps ~6.8, well above the
    // ~1.3 noise floor) blocked candidate against the new default.
    const tightAssumptions = {
      ...PU_DEFAULTS,
      stardustOnHand: 20_000,
      rareCandyOnHand: 5,
      slots: PU_DEFAULTS.slots.map((s) => ({ ...s, candyOnHand: 5 })),
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

// IDEAS.md #5 — Best Buddy as a cost-less Power-Up Optimizer candidate,
// single-raid mode only. These pin the two load-bearing shape guarantees the
// task's own doc comments require: no cost/efficiency fields exist on a
// BestBuddyCandidate at all (never a fabricated denominator), and at most one
// bestBuddyRecommendation survives into the joint budget plan.
describe("runPowerUpOptimizerScenario (Best Buddy candidates, IDEAS #5)", () => {
  it("produces one real, well-formed candidate per fielded slot not already Best Buddy, with no cost/efficiency fields", () => {
    const result = runPowerUpOptimizerScenario(PU_DEFAULTS, speciesRegistry);
    expect(result.data).not.toBeNull();
    const fieldedSlotCount = PU_DEFAULTS.slots.filter((s) => s.speciesId).length;
    // None of the default scenario's slots carry an isBestBuddy setting (this
    // tab has no such per-slot UI control by design — see the task's own
    // "out of scope" note), so every fielded slot should appear here.
    expect(result.data!.bestBuddyCandidates.length).toBe(fieldedSlotCount);
    for (const c of result.data!.bestBuddyCandidates) {
      expectFiniteNumber(c.deltaTeamDps, "bestBuddyCandidate.deltaTeamDps");
      expectFiniteNumber(c.summary.teamDps, "bestBuddyCandidate.summary.teamDps");
      // Deliberately ABSENT, not null/undefined-but-present — a cost or
      // efficiency field here would be a divide-by-zero waiting to happen.
      expect("cost" in c).toBe(false);
      expect("deltaTeamDpsPer1000Stardust" in c).toBe(false);
      expect("deltaTeamDpsPerCandy" in c).toBe(false);
    }
  }, 30_000);

  it("recommends AT MOST ONE slot in the fixed-budget plan, honoring the real one-Best-Buddy-per-trainer constraint", () => {
    const result = runPowerUpOptimizerScenario(PU_DEFAULTS, speciesRegistry);
    expect(result.plan).not.toBeNull();
    const rec = result.plan!.bestBuddyRecommendation;
    // Shape-only check (same convention as bestBlockedCandidate's own "shape
    // only" test above) — whether a real, noise-floor-clearing gain exists at
    // all depends on the specific roster/boss pairing, but whichever it is
    // must be well-formed and, structurally, can only ever be ONE slot (the
    // field's own type is a single object or null, never an array).
    if (rec) {
      expect(typeof rec.slotIndex).toBe("number");
      expect(typeof rec.speciesName).toBe("string");
      expectFiniteNumber(rec.deltaTeamDps, "bestBuddyRecommendation.deltaTeamDps");
      expect(rec.deltaTeamDps).toBeGreaterThan(result.plan!.noiseFloorTeamDps);
    } else {
      expect(rec).toBeNull();
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
      fastMoveIsDefaulted: false,
      chargedMoveIsDefaulted: false,
      fastMoveUnmatchedName: null,
      chargedMoveUnmatchedName: null,
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
    // Houndour has a real, candy-only evolution (Houndoom) — as of
    // registry.ts's gated-evolution resolution (PLAN_tm_move_change_optimizer.md's
    // engine-surfaces gap, closed 2026-09-10) this is now a REAL priced
    // "evolve, then power up" candidate (IDEAS.md #9) rather than an inert
    // exclusion: `SpeciesDefinition.evolutions` used to be permanently
    // undefined for every real species (nothing in packages/web ever
    // resolved data-sync's own `evolutionCandyCosts` into it), so
    // `evolutionEndpoints` always returned `[]` and Houndour could only ever
    // land in `neverCompetitive`. Now that a competitive evolve+power-up
    // option is actually found, it's promoted OUT of `neverCompetitive`
    // entirely and into `candidates`/`benchedButPromising` instead — see
    // RosterNeverCompetitiveEntry.evolutionRecommendation's own doc comment
    // for exactly this "only landed in neverCompetitive if NO evolution
    // endpoint touched any boss" rule. Assert the NEW behavior rather than
    // the old exclusion.
    expect(d.neverCompetitive.some((n) => n.speciesId === "houndour")).toBe(false);
    const houndourCandidates = [...d.candidates, ...d.benchedButPromising].filter((c) => c.viaEvolution?.fromSpeciesId === "houndour");
    expect(houndourCandidates.length).toBeGreaterThan(0);
    for (const c of houndourCandidates) {
      expect(c.speciesId).toBe("houndoom");
      expect(c.viaEvolution!.evolutionCandyCost).toBeGreaterThan(0);
    }
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

  // run/runRosterMoveChange.ts's own smoke coverage — PLAN_tm_move_change_optimizer.md's
  // roster-mode half. Reuses the SAME hand-built pool/assumptions above; needs
  // an already-computed baselinePerBoss (see resolveRosterMoveChangeInputs'
  // own doc comment), so it first runs the main sweep exactly like the UI
  // does before its own "Run move-change sweep" button is even enabled.
  it("runRosterMoveChangeScenario produces a well-formed result against an already-computed baseline, and eliteFastTmOnHand/eliteChargedTmOnHand gate every RosterEliteTmCandidate.affordable flag", () => {
    const mainResult = runRosterPlannerScenario(multiRaidAssumptions, speciesRegistry, pool);
    expect(mainResult.data).not.toBeNull();
    const baselinePerBoss = mainResult.data!.baselinePerBoss;

    const withUnknownTmCount = runRosterMoveChangeScenario(multiRaidAssumptions, speciesRegistry, pool, baselinePerBoss);
    expect(withUnknownTmCount.error).toBeNull();
    expect(withUnknownTmCount.blockedReason).toBeNull();
    expect(withUnknownTmCount.data).not.toBeNull();
    const d0 = withUnknownTmCount.data!;
    for (const c of d0.eliteTm) expectFiniteNumber(c.deltaTeamDps, "eliteTm.deltaTeamDps");
    expect(d0.eliteTm.length).toBeGreaterThan(0);
    // Every pool entry above has no `knownChargedMoveIds` set — the
    // "unknown charged-move count" exclusion must fire for all six, never
    // silently drop them (PLAN's central "known moveset" rule).
    expect(d0.excluded.length).toBe(pool.length);
    // eliteFastTmOnHand/eliteChargedTmOnHand default to null (unknown) on
    // PU_DEFAULTS, which resolveRosterMoveChangeInputs clamps to 0 — a
    // REAL engine input, not a display-only framing (unlike single-raid's
    // own EliteTmCandidate) — so with 0 on hand, NOTHING is affordable yet.
    expect(d0.eliteTm.every((c) => !c.affordable)).toBe(true);

    // The live "does this control actually move a number" proof: filling in
    // both counts flips `affordable` to true for every candidate (each
    // needs exactly 1 item — RosterEliteTmCandidate.eliteTmItemsSpent is
    // always 1), without changing which candidates exist or their own
    // deltaTeamDps at all.
    const withFiveOnHand = runRosterMoveChangeScenario(
      { ...multiRaidAssumptions, eliteFastTmOnHand: 5, eliteChargedTmOnHand: 5 },
      speciesRegistry,
      pool,
      baselinePerBoss,
    );
    const d5 = withFiveOnHand.data!;
    expect(d5.eliteTm.length).toBe(d0.eliteTm.length);
    expect(d5.eliteTm.every((c) => c.affordable)).toBe(true);
    expect(d5.eliteTm.map((c) => c.deltaTeamDps)).toEqual(d0.eliteTm.map((c) => c.deltaTeamDps));
  }, 30_000);

  it("runRosterMoveChangeScenario reports blockedReason when handed a baseline that doesn't match the resolved boss set", () => {
    // An empty baselinePerBoss array can never match multiRaidAssumptions'
    // own resolved 3-boss target set — the exact "stale baseline" case
    // resolveRosterMoveChangeInputs guards against (see its own doc
    // comment), which the UI's isMultiRaidStale check exists to prevent in
    // normal use.
    const result = runRosterMoveChangeScenario(multiRaidAssumptions, speciesRegistry, pool, []);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
    expect(result.blockedReason).toBe("no-bosses");
  });

  // IDEAS.md #24 — no real species in this data layer's static movepool
  // lists "Frustration" (it's only ever assigned dynamically to a captured,
  // unpurified Shadow, never a GAME_MASTER-listed learnable move), so this
  // constructs a synthetic Frustration charged move on a real, already-used
  // species to exercise the notice path at all — the engine's own
  // frustrationLockNotice keys purely on `move.name.toLowerCase() === "frustration"`,
  // so this is a faithful trigger, not a fabricated shortcut around it.
  it("runRosterMoveChangeScenario reports a static frustrationNotices entry for a KNOWN Frustration moveset, structurally separate from excluded", () => {
    const houndourSpecies = speciesRegistry.get("houndour");
    const frustrationMove = { ...houndourSpecies.chargedMoves[0]!, id: "FRUSTRATION", name: "Frustration" };
    const speciesWithFrustration = { ...houndourSpecies, chargedMoves: [...houndourSpecies.chargedMoves, frustrationMove] };
    const poolWithFrustration: RosterEntry[] = pool.map((e, i) =>
      i === 0 ? { ...e, species: speciesWithFrustration, chargedMoveId: "FRUSTRATION", movesetIsDefaulted: false } : e,
    );

    const mainResult = runRosterPlannerScenario(multiRaidAssumptions, speciesRegistry, poolWithFrustration);
    expect(mainResult.data).not.toBeNull();
    const result = runRosterMoveChangeScenario(
      multiRaidAssumptions,
      speciesRegistry,
      poolWithFrustration,
      mainResult.data!.baselinePerBoss,
    );
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    const notice = result.data!.frustrationNotices.find((n) => n.entryId === poolWithFrustration[0]!.entryId);
    expect(notice).toBeDefined();
    expect(notice!.speciesId).toBe("houndour");
    expect(notice!.notice.length).toBeGreaterThan(0);
    // The notice is static (calendar-named, never a live "is the event
    // running now" check) and structurally additive — this entry must NOT
    // also be reported in `excluded` for that same reason (it may still
    // appear there for an UNRELATED reason, but not for holding Frustration).
    const excludedForFrustration = result.data!.excluded.find(
      (e) => e.entryId === poolWithFrustration[0]!.entryId && e.reason.toLowerCase().includes("frustration"),
    );
    expect(excludedForFrustration).toBeUndefined();
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
      fastMoveIsDefaulted: false,
      chargedMoveIsDefaulted: false,
      fastMoveUnmatchedName: null,
      chargedMoveUnmatchedName: null,
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

describe("runRosterScenario (Roster tab, default sortBy)", () => {
  // Same hand-built pool shape as runRosterPlannerScenario's own smoke test
  // above — this tab computes no combat numbers at all, so this only proves
  // the summary/sort wiring doesn't throw on real data.
  const pool: RosterEntry[] = ["houndour", "tyranitar-mega", "garchomp"].map((id, i) => {
    const species = speciesRegistry.get(id);
    return {
      entryId: `roster-smoke-${i}-${id}`,
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
      fastMoveIsDefaulted: false,
      chargedMoveIsDefaulted: false,
      fastMoveUnmatchedName: null,
      chargedMoveUnmatchedName: null,
      sourceLineNumber: i + 2,
      unmatchedMoveNames: [],
    };
  });

  it("produces a well-formed summary with no NaN/undefined headline numbers, given a real pool", () => {
    const result = runRosterScenario("recent", pool);
    expectFiniteNumber(result.summary.entryCount, "summary.entryCount");
    expectFiniteNumber(result.summary.uniqueSpeciesCount, "summary.uniqueSpeciesCount");
    expect(result.summary.entryCount).toBe(3);
    expect(result.summary.megaCapableCount).toBe(1);
    expect(result.sortedEntries).toHaveLength(3);
  });

  it("produces the same empty summary as a fresh page load's default scenario, given an empty pool", () => {
    const result = runRosterScenario("recent", []);
    expect(result.summary.entryCount).toBe(0);
    expect(result.sortedEntries).toEqual([]);
  });
});
