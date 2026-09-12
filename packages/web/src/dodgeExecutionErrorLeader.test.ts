import { describe, expect, it } from "vitest";
import { computeDodgeExecutionErrorLeader } from "./dodgeExecutionErrorLeader.js";
import type { DodgeExecutionErrorBandPoint } from "./run/dodgeExecutionErrorSweep.js";

// Minimal fixtures — only meanTotalDamage is read by computeDodgeExecutionErrorLeader.
function point(missedFraction: number, aTotal: number, bTotal: number): DodgeExecutionErrorBandPoint {
  return {
    missedFraction,
    a: { meanTotalDamage: aTotal } as unknown as DodgeExecutionErrorBandPoint["a"],
    b: { meanTotalDamage: bTotal } as unknown as DodgeExecutionErrorBandPoint["b"],
  };
}

describe("computeDodgeExecutionErrorLeader", () => {
  it("finds no flip and names the leader when one candidate leads throughout", () => {
    const points = [point(0, 500, 100), point(0.5, 300, 50)];
    const result = computeDodgeExecutionErrorLeader(points);
    expect(result.flipBetween).toBeNull();
    expect(result.finalLeader).toBe("a");
    expect(result.finalTieIsBothZero).toBe(false);
  });

  it("finds a flip between adjacent samples when the leader changes", () => {
    const points = [point(0, 500, 100), point(0.25, 200, 250), point(0.5, 100, 400)];
    const result = computeDodgeExecutionErrorLeader(points);
    expect(result.flipBetween).not.toBeNull();
    expect(result.finalLeader).toBe("b");
  });

  /**
   * The bug this fix addresses: the old `>=` comparison silently named "a"
   * the leader on a 0-vs-0 tie (e.g. both candidates locked out by a
   * too-fast-to-dodge boss fast move — see dodgeFastAttackLockout.ts).
   * finalLeader must be "tie", and finalTieIsBothZero must distinguish this
   * from a genuine nonzero tie.
   */
  it("reports a tie (not 'a') when both candidates are stuck at zero throughout", () => {
    const points = [point(0, 0, 0), point(0.5, 0, 0)];
    const result = computeDodgeExecutionErrorLeader(points);
    expect(result.finalLeader).toBe("tie");
    expect(result.finalTieIsBothZero).toBe(true);
  });

  it("reports a tie but finalTieIsBothZero=false for a genuine nonzero tie", () => {
    const points = [point(0, 300, 300), point(0.5, 200, 200)];
    const result = computeDodgeExecutionErrorLeader(points);
    expect(result.finalLeader).toBe("tie");
    expect(result.finalTieIsBothZero).toBe(false);
  });
});
