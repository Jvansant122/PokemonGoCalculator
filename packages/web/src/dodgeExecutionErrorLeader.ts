import type { DodgeExecutionErrorBandPoint } from "./run/dodgeExecutionErrorSweep.js";

export interface DodgeExecutionErrorLeaderResult {
  /** [start, end] dodge-accuracy percentage of the first ADJACENT-sample pair whose leader differs, or null if the leader never changes across the sampled band. */
  flipBetween: [number, number] | null;
  /** Whoever leads (on own total damage) at the worst-tested accuracy (the final sampled point) — "tie" for an exact tie, including a 0-vs-0 tie. */
  finalLeader: "a" | "b" | "tie";
  /** True only when finalLeader is "tie" AND both candidates' own total damage at the final sampled point is exactly zero (e.g. a fast-attack-dodge lockout — see dodgeFastAttackLockout.ts) — distinct from a genuine nonzero tie. */
  finalTieIsBothZero: boolean;
}

/**
 * Extracted out of DodgeExecutionErrorBand.tsx's component body so the exact
 * same leader/tie logic that fixed the "wrong statement on a tie" bug class
 * (see rankingFlip.ts's computeRankingFlip for the sibling fix and its own
 * doc comment) is directly unit-testable without rendering an SVG — same
 * "extract pure logic out of a chart component" precedent this project
 * already follows. Three-way ("a"/"b"/"tie") rather than a two-way `>=`
 * split — the old `>=` silently named "a" the leader on an exact tie
 * (including a 0-vs-0 tie), the same bug fixed in computeRankingFlip.
 */
export function computeDodgeExecutionErrorLeader(orderedPoints: DodgeExecutionErrorBandPoint[]): DodgeExecutionErrorLeaderResult {
  const accuracyFor = (missedFraction: number) => (1 - missedFraction) * 100;
  const leaderAt = (p: DodgeExecutionErrorBandPoint): "a" | "b" | "tie" =>
    p.a.meanTotalDamage === p.b.meanTotalDamage ? "tie" : p.a.meanTotalDamage > p.b.meanTotalDamage ? "a" : "b";

  let flipBetween: [number, number] | null = null;
  for (let i = 1; i < orderedPoints.length; i++) {
    if (leaderAt(orderedPoints[i]!) !== leaderAt(orderedPoints[i - 1]!)) {
      flipBetween = [accuracyFor(orderedPoints[i - 1]!.missedFraction), accuracyFor(orderedPoints[i]!.missedFraction)];
      break;
    }
  }

  const finalPoint = orderedPoints[orderedPoints.length - 1]!;
  const finalLeader = leaderAt(finalPoint);
  const finalTieIsBothZero = finalLeader === "tie" && finalPoint.a.meanTotalDamage === 0 && finalPoint.b.meanTotalDamage === 0;

  return { flipBetween, finalLeader, finalTieIsBothZero };
}
