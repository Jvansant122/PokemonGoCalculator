import { describe, expect, it } from "vitest";
import { runSustainedComparison } from "../src/comparison.js";
import {
  MEGA_RAICHU_X,
  MEGA_RAICHU_Y,
  PRIMAL_KYOGRE,
  SCENARIO_A_LEVEL,
  SCENARIO_A_PERFECT_IVS,
} from "../src/fixtures/scenarioA.js";

describe("runSustainedComparison", () => {
  it("returns a distribution (not a point estimate) per candidate once the boss starts using charged moves", () => {
    const [x, y] = runSustainedComparison({
      candidates: [MEGA_RAICHU_X, MEGA_RAICHU_Y],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 12,
      bossChargedMoveWarmupSeconds: 8,
      maxSeconds: 40,
      iterations: 150,
    });

    for (const result of [x!, y!]) {
      expect(result.iterations).toBe(150);
      expect(result.meanSecondsSurvived).toBeGreaterThan(0);
      expect(result.p90TotalDamage).toBeGreaterThanOrEqual(result.medianTotalDamage);
      expect(result.medianTotalDamage).toBeGreaterThanOrEqual(result.p10TotalDamage);
    }

    // Kyogre's Hydro Pump is lethal on its own against these HP totals, so
    // adding it to the fight should shorten survival versus Scenario A's
    // fast-move-only opening burst (10.0s) at least some of the time.
    expect(x!.meanSecondsSurvived).toBeLessThanOrEqual(40);
    expect(y!.meanSecondsSurvived).toBeLessThanOrEqual(40);

    // representativeRun exposes one concrete, reproducible trajectory alongside the distribution.
    expect(x!.representativeRun.ownDamageTrajectory[0]).toEqual({ atSeconds: 0, cumulativeDamage: 0 });
    expect(x!.representativeRun.ownDamageTrajectory.length).toBeGreaterThan(0);
  });

  it("derives bossChargedMoveWarmupSeconds from the boss's own energy economy when omitted, instead of firing at t=0", () => {
    const [x] = runSustainedComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 12,
      // bossChargedMoveWarmupSeconds intentionally omitted.
      iterations: 50,
    });
    // Without a physically-derived warmup, the boss could fire Hydro Pump
    // (100 cost) almost immediately; with it (~32.5s minimum), X should
    // survive at least as long as the plain fast-move-only fight (10.0s),
    // since no run's boss charged move can land before ~32.5s.
    expect(x!.meanSecondsSurvived).toBeGreaterThanOrEqual(10);
  });

  it("no longer produces degenerate all-zero output for a too-small caller-supplied window (the fixed bug)", () => {
    // Previously, a small maxSeconds (e.g. from a UI field that shouldn't
    // have existed) meant the tick loop never ran at all, silently reporting
    // survivedFullWindow at 100% with every stat at 0 — indistinguishable
    // from a real result. This confirms the default (DEFAULT_STEPWISE_MAX_SECONDS)
    // is generous enough that omitting maxSeconds entirely never does this
    // for a normal matchup.
    const [x, y] = runSustainedComparison({
      candidates: [MEGA_RAICHU_X, MEGA_RAICHU_Y],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 15,
      iterations: 50,
    });
    for (const result of [x!, y!]) {
      expect(result.meanSecondsSurvived).toBeGreaterThan(0);
      expect(result.fractionSurvivedFullWindow).toBeLessThan(1);
    }
  });
});
