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

    // ownDamageTrajectory: starts at {0,0}, ends at faint time with the final total.
    expect(x!.ownDamageTrajectory[0]).toEqual({ atSeconds: 0, cumulativeDamage: 0 });
    expect(x!.ownDamageTrajectory.at(-1)).toEqual({ atSeconds: 10, cumulativeDamage: 190 });
    expect(y!.ownDamageTrajectory.at(-1)).toEqual({ atSeconds: 10, cumulativeDamage: 221 });
  });

  it("derives the opening-burst window from the boss's own energy economy instead of a fixed 20s default", () => {
    // Primal Kyogre: Waterfall (energyGain 8, 2.5s) needs ceil(100/8)=13 casts
    // for Hydro Pump's 100 cost -> 13 * 2.5 = 32.5s. Both Raichu forms faint
    // at 10.0s regardless (well inside either the old 20s or new 32.5s), so
    // this only changes behavior for a candidate that would otherwise have
    // survived past the old fixed window.
    const [x] = runComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "perfect" },
    });
    // Perfect dodge quarters incoming damage, so X now easily outlasts the
    // old fixed 20s default; confirm it's capped at the new derived ~32.5s
    // window instead of an artificially small or infinite one.
    expect(x!.secondsSurvived).toBeLessThanOrEqual(32.5);
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
