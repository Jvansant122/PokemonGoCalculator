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
  });
});
