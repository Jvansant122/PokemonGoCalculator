import { totalAt, SAMPLE_COUNT, type DamageOverTimeSeries } from "./DamageOverTimeChart.js";

export interface RankingFlipResult {
  /**
   * The LAST sign flip found while scanning the sampled totals, or null if
   * the lead never flips within the window. Deliberately the LAST flip, not
   * the first — see bugfix_multiflip_crossing_marker in agent memory: the
   * lead can flip more than once, and only the last flip determines who is
   * ahead by the end of the window.
   */
  crossing: { t: number; value: number } | null;
  /** Whichever candidate leads immediately after `crossing` — same fact `finalLeader` is derived from, so the two can never disagree. Null only when `crossing` is null. */
  crossingLeader: string | null;
  /** Whoever leads at the end of the sampled window — derived from `crossing`'s own post-flip sign when a crossing exists, otherwise from the final sampled totals directly. */
  finalLeader: string;
}

/**
 * Scans a fixed-resolution sample of two candidates' own+team damage totals
 * over [0, maxSeconds] for the ranking flip — extracted out of
 * DamageOverTimeChart.tsx's component body (AUDIT_2026-09-08.md finding 0)
 * so both the chart AND a non-rendering caller (the run-scenario CLI,
 * vitest) can compute "where does the ranking flip" without needing an SVG
 * to render. Uses the exact same `totalAt`/`SAMPLE_COUNT` the chart itself
 * samples with, so a headline computed here always agrees with what the
 * chart actually draws.
 */
export function computeRankingFlip(
  x: DamageOverTimeSeries,
  y: DamageOverTimeSeries,
  teammateDps: number,
  partySize: number,
  matchingTeammateCount: number,
  maxSeconds: number,
): RankingFlipResult {
  const times = Array.from({ length: SAMPLE_COUNT }, (_, i) => (i / (SAMPLE_COUNT - 1)) * maxSeconds);
  const totals = times.map((t) => ({
    t,
    x: totalAt(x, t, teammateDps, partySize, matchingTeammateCount),
    y: totalAt(y, t, teammateDps, partySize, matchingTeammateCount),
  }));

  // Deliberately do NOT stop at the first flip found: keep overwriting
  // `crossing` as later flips are found so it always ends up holding the
  // final one.
  let crossing: { t: number; value: number } | null = null;
  let crossingLeader: string | null = null;
  for (let i = 1; i < totals.length; i++) {
    const prev = totals[i - 1]!;
    const curr = totals[i]!;
    const prevDelta = prev.x - prev.y;
    const currDelta = curr.x - curr.y;
    if (prevDelta !== 0 && currDelta !== 0 && Math.sign(prevDelta) !== Math.sign(currDelta)) {
      const frac = Math.abs(prevDelta) / (Math.abs(prevDelta) + Math.abs(currDelta));
      crossing = {
        t: prev.t + frac * (curr.t - prev.t),
        value: prev.x + frac * (curr.x - prev.x),
      };
      crossingLeader = currDelta > 0 ? x.name : y.name;
    }
  }

  const finalLeader = crossingLeader ?? (totals[totals.length - 1]!.x >= totals[totals.length - 1]!.y ? x.name : y.name);

  return { crossing, crossingLeader, finalLeader };
}
