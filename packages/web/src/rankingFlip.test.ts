import { describe, expect, it } from "vitest";
import { computeRankingFlip } from "./rankingFlip.js";
import type { DamageOverTimeSeries } from "./DamageOverTimeChart.js";

/**
 * Pins the double-flip case from bugfix_multiflip_crossing_marker (agent
 * memory): the chart used to mark the FIRST lead-flip while `finalLeader` was
 * derived independently from the final totals, so a lead that flips TWICE
 * showed a marker sitting at the wrong (non-decisive) flip. Uses hand-built
 * synthetic trajectories (not the real engine's RNG) so the exact flip
 * boundaries are deterministic and don't depend on simulation seeding.
 */
function series(name: string, points: { atSeconds: number; cumulativeDamage: number }[]): DamageOverTimeSeries {
  return {
    name,
    ownDamageTrajectory: points,
    secondsSurvivedCutoff: 999, // never cuts off within the tested window
    boostMultiplier: undefined, // no team-boost contribution — totals are pure own-damage
  };
}

describe("computeRankingFlip", () => {
  it("reports the LAST flip, not the first, when the lead changes twice", () => {
    // own-damage step function: X leads in [3,6), Y leads in [6,9), X leads again in [9,12].
    const x = series("X", [
      { atSeconds: 0, cumulativeDamage: 0 },
      { atSeconds: 3, cumulativeDamage: 100 },
      { atSeconds: 9, cumulativeDamage: 250 },
    ]);
    const y = series("Y", [
      { atSeconds: 0, cumulativeDamage: 0 },
      { atSeconds: 3, cumulativeDamage: 40 },
      { atSeconds: 6, cumulativeDamage: 180 },
      { atSeconds: 9, cumulativeDamage: 200 },
    ]);

    const result = computeRankingFlip(x, y, 0, 0, 0, 12);

    expect(result.crossing).not.toBeNull();
    // The decisive (last) flip sits near t=9, not the transient one near t=6.
    expect(result.crossing!.t).toBeGreaterThan(8);
    expect(result.crossing!.t).toBeLessThan(9.5);
    // X ends ahead (250 > 200) — finalLeader must agree with the LAST flip's
    // post-flip sign, not the first flip's (which would wrongly say Y).
    expect(result.finalLeader).toBe("X");
    expect(result.crossingLeader).toBe("X");
  });

  it("reports no crossing when one candidate leads the whole window", () => {
    const x = series("X", [
      { atSeconds: 0, cumulativeDamage: 0 },
      { atSeconds: 1, cumulativeDamage: 500 },
    ]);
    const y = series("Y", [
      { atSeconds: 0, cumulativeDamage: 0 },
      { atSeconds: 1, cumulativeDamage: 100 },
    ]);
    const result = computeRankingFlip(x, y, 0, 0, 0, 10);
    expect(result.crossing).toBeNull();
    expect(result.crossingLeader).toBeNull();
    expect(result.finalLeader).toBe("X");
  });

  it("handles a single, real flip correctly (the common case)", () => {
    const x = series("X", [
      { atSeconds: 0, cumulativeDamage: 0 },
      { atSeconds: 2, cumulativeDamage: 100 },
    ]);
    const y = series("Y", [
      { atSeconds: 0, cumulativeDamage: 0 },
      { atSeconds: 5, cumulativeDamage: 300 },
    ]);
    const result = computeRankingFlip(x, y, 0, 0, 0, 10);
    expect(result.crossing).not.toBeNull();
    expect(result.finalLeader).toBe("Y");
    expect(result.crossingLeader).toBe("Y");
  });

  /**
   * The bug this task fixes: both candidates dealt zero own+team damage the
   * whole window (e.g. a fast-attack-dodge lockout against a boss whose fast
   * move recycles too quickly — see dodgeFastAttackLockout.ts) used to fall
   * into the old `>=` comparison and silently declare X the "leader" on a
   * 0-vs-0 tie. `finalLeader` must be null, and `finalTieIsBothZero` must be
   * true so a caller can say "neither dealt any damage" rather than "tied."
   */
  it("reports a null leader (not X) when both candidates are stuck at zero the whole window", () => {
    const x = series("X", [
      { atSeconds: 0, cumulativeDamage: 0 },
      { atSeconds: 10, cumulativeDamage: 0 },
    ]);
    const y = series("Y", [
      { atSeconds: 0, cumulativeDamage: 0 },
      { atSeconds: 10, cumulativeDamage: 0 },
    ]);
    const result = computeRankingFlip(x, y, 0, 0, 0, 10);
    expect(result.crossing).toBeNull();
    expect(result.crossingLeader).toBeNull();
    expect(result.finalLeader).toBeNull();
    expect(result.finalTieIsBothZero).toBe(true);
  });

  /** A genuine nonzero exact tie is still a tie (finalLeader null) but is NOT the "both zero" case — the two must stay distinguishable. */
  it("reports a null leader but finalTieIsBothZero=false for a genuine nonzero tie", () => {
    const x = series("X", [
      { atSeconds: 0, cumulativeDamage: 0 },
      { atSeconds: 10, cumulativeDamage: 150 },
    ]);
    const y = series("Y", [
      { atSeconds: 0, cumulativeDamage: 0 },
      { atSeconds: 10, cumulativeDamage: 150 },
    ]);
    const result = computeRankingFlip(x, y, 0, 0, 0, 10);
    expect(result.crossing).toBeNull();
    expect(result.finalLeader).toBeNull();
    expect(result.finalTieIsBothZero).toBe(false);
  });
});
