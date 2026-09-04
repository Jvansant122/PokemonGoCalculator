import { describe, expect, it } from "vitest";
import { runComparison } from "../src/comparison.js";
import { findCrossoverPartySize } from "../src/uptime.js";
import {
  MEGA_RAICHU_X,
  MEGA_RAICHU_Y,
  MEGA_SKARMORY,
  SCENARIO_A_LEVEL,
  SCENARIO_A_PERFECT_IVS,
} from "../src/fixtures/scenarioA.js";

/**
 * Scenario B (tank -> team damage): against a Flying attacker, X's secondary
 * Steel typing resists Flying on top of Y's Electric resistance, so X takes
 * less per hit and survives longer under identical dodging — even though X
 * still deals less raw damage per charged attack than Y. This is what
 * produces a crossover in total team contribution as party size grows.
 */
describe("Scenario B: Mega Raichu X vs Y vs Mega Skarmory (dodging, tank -> team damage)", () => {
  it("X survives longer than Y against a Flying attacker under identical dodging", () => {
    const [x, y] = runComparison({
      candidates: [MEGA_RAICHU_X, MEGA_RAICHU_Y],
      boss: MEGA_SKARMORY,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "perfect" },
      openingBurstSeconds: 20,
    });

    expect(x!.secondsSurvived).toBeGreaterThan(y!.secondsSurvived);
  });

  it("a large enough party size lets X's extra uptime overtake Y's raw damage lead", () => {
    const [x, y] = runComparison({
      candidates: [MEGA_RAICHU_X, MEGA_RAICHU_Y],
      boss: MEGA_SKARMORY,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "perfect" },
      openingBurstSeconds: 20,
    });

    expect(y!.ownDamage).toBeGreaterThan(x!.ownDamage);

    // A lower teammate DPS than the spec's own worked example (26.5) is used
    // here deliberately: at 26.5 DPS, X's extended uptime is worth so much per
    // teammate that it overtakes Y's raw-damage lead before party size 1 even
    // — i.e. X wins outright, itself a legitimate, sensitivity-panel-visible
    // finding (see App.tsx's default scenario). A slower party is what makes
    // the crossover land inside the plotted 1-20 range for this assertion.
    const crossover = findCrossoverPartySize(
      { id: "X", secondsSurvived: x!.secondsSurvived, boostMultiplier: x!.boostMultiplier, boostedType: x!.boostedType, ownDamage: x!.ownDamage },
      { id: "Y", secondsSurvived: y!.secondsSurvived, boostMultiplier: y!.boostMultiplier, boostedType: y!.boostedType, ownDamage: y!.ownDamage },
      5,
      { a: true, b: true },
    );

    expect(crossover.partySize).not.toBeNull();
    expect(crossover.leaderBelow).toBe("Y");
    expect(crossover.leaderAtOrAbove).toBe("X");
  });
});
