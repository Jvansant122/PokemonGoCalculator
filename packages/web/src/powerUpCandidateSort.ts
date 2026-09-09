import type { PowerUpRankBy } from "./powerUpOptimizerScenario.js";

/**
 * The three orthogonal fields either candidate shape's efficiency sort
 * needs, pulled out because single-raid's `PowerUpCandidate` and
 * multi-raid's `RosterPowerUpCandidate` (packages/engine/src/powerUp.ts vs
 * rosterPlanner.ts) name the same concepts differently
 * (`deltaTeamDps`/`deltaExceedsNoise` vs `meanDeltaTeamDps`/`exceedsNoise`) —
 * this lets both call sites share ONE sort implementation instead of two
 * that could silently drift apart.
 */
export interface RankableCandidateFields {
  /** The candidate's own signed delta (deltaTeamDps / meanDeltaTeamDps). */
  delta: number;
  /** Whether `delta` clears this candidate's own noise floor — deltaExceedsNoise (single-raid) / exceedsNoise (multi-raid, itself "aggregate OR per-boss significant"). */
  isSignificant: boolean;
  /** cost.stardust — the tiebreaker sort key for "within noise" rows (cheapest first). */
  costStardust: number;
  /** The chosen rankBy's own per-1000-stardust/per-candy/per-XL-candy value for this candidate, already resolved by the caller via efficiencyForRankBy — null when that resource's cost is 0. */
  efficiency: number | null;
}

/** 0 = measurable gain, 1 = within noise floor ("no measurable change"), 2 = measurable loss. */
function sortGroup(c: RankableCandidateFields): 0 | 1 | 2 {
  if (!c.isSignificant) return 1;
  return c.delta > 0 ? 0 : 2;
}

/**
 * Three-group, noise-floor-aware comparator (see PowerUpOptimizerView.tsx's
 * single-raid `sortedCandidates`, which this now backs): (1) measurable
 * gains, by `efficiency` descending — a `null` efficiency sinks within this
 * group (nothing to divide by, not a zero result); (2) within-noise rows,
 * by `costStardust` ascending (cheapest first); (3) measurable losses, most
 * negative last (worst-to-least-bad).
 */
export function compareCandidatesByEfficiency(a: RankableCandidateFields, b: RankableCandidateFields): number {
  const ga = sortGroup(a);
  const gb = sortGroup(b);
  if (ga !== gb) return ga - gb;
  if (ga === 0) {
    if (a.efficiency === null && b.efficiency === null) return 0;
    if (a.efficiency === null) return 1;
    if (b.efficiency === null) return -1;
    return b.efficiency - a.efficiency;
  }
  if (ga === 1) return a.costStardust - b.costStardust;
  // ga === 2: most-negative delta last.
  return b.delta - a.delta;
}

/**
 * Sorts a COPY of `items` (never mutates the input) via `compareCandidatesByEfficiency`,
 * using a caller-supplied projection to `RankableCandidateFields` — keeps
 * this module agnostic of which of the two candidate shapes it's sorting.
 */
export function sortCandidatesByEfficiency<T>(items: T[], toRankable: (item: T) => RankableCandidateFields): T[] {
  return [...items].sort((a, b) => compareCandidatesByEfficiency(toRankable(a), toRankable(b)));
}

/**
 * Resolves the chosen `rankBy`'s own efficiency value from either candidate
 * shape's three per-resource fields (passed as plain values, not the whole
 * object, so this stays usable for both `PowerUpCandidate` and
 * `RosterPowerUpCandidate` without a shared base type).
 */
export function efficiencyForRankBy(
  rankBy: PowerUpRankBy,
  deltaPer1000Stardust: number | null,
  deltaPerCandy: number | null,
  deltaPerXlCandy: number | null,
): number | null {
  if (rankBy === "stardust") return deltaPer1000Stardust;
  if (rankBy === "candy") return deltaPerCandy;
  return deltaPerXlCandy;
}
