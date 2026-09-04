import { describe, expect, it } from "vitest";
import { runComparison } from "../src/comparison.js";
import {
  MEGA_RAICHU_X,
  MEGA_RAICHU_Y,
  PRIMAL_KYOGRE,
  SCENARIO_A_LEVEL,
  SCENARIO_A_PERFECT_IVS,
} from "../src/fixtures/scenarioA.js";

describe("runComparison", () => {
  it("reproduces the Scenario A acceptance numbers through the shared comparison path", () => {
    const [x, y] = runComparison({
      candidates: [MEGA_RAICHU_X, MEGA_RAICHU_Y],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
    });

    expect(x!.secondsSurvived).toBe(10);
    expect(y!.secondsSurvived).toBe(10);
    expect(x!.chargedAttacksLanded).toBe(1);
    expect(y!.chargedAttacksLanded).toBe(1);
    expect(x!.ownDamage).toBe(190);
    expect(y!.ownDamage).toBe(221);
  });

  it("perfect dodging extends survival time versus no dodging", () => {
    const noDodge = runComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
    });
    const perfectDodge = runComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "perfect" },
    });
    expect(perfectDodge[0]!.secondsSurvived).toBeGreaterThan(noDodge[0]!.secondsSurvived);
  });
});
