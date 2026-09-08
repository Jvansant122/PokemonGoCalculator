import type { IVSpread, IvComparisonResult, IvComparisonRow, RaidTier } from "@pogo-analyzer/engine";

/**
 * Pure logic/types shared between IvBreakpointsView.tsx (owns state + the
 * actual `compareIvSpreads` calls) and its render-only subcomponents
 * (IvSweepReport.tsx, IvPerLevelTable.tsx) — split out so those subcomponents
 * don't need to import from the view file itself (which would create a
 * component <-> helper circular import for no reason). Nothing here holds
 * React state or JSX; it's the same well-factored helpers that used to live
 * at the top of IvBreakpointsView.tsx, unchanged, just relocated.
 */

/**
 * Numeric Niantic/Bulbapedia raid difficulty tier for each of this project's
 * `RaidTier` label strings. `RaidTier` itself (engine/src/raidBoss.ts) carries
 * no numeric field, only the label strings the live raid feed emits — this
 * map exists purely so the web layer can bucket/filter by tier without the
 * engine needing to grow a field no combat formula actually needs. Sourced
 * from Bulbapedia's "Raid Battle (GO)" difficulty table, the SAME page
 * raidBoss.ts's own `RAID_TIER_TABLE` already cites for its HP/multiplier
 * figures [community-consensus] — not a fresh guess, just adding the numeric
 * column that table's own doc comment didn't need to carry: 1-Star Raids = 1,
 * 3-Star Raids = 3, Mega Raids = 4, 5-Star Raids = 5, Legendary Mega Raids and
 * Primal Raids both = 6 (six-star tier), Super Mega Raids = 7.
 */
export const RAID_TIER_NUMERIC: Record<RaidTier, number> = {
  "1-Star Raids": 1,
  "3-Star Raids": 3,
  "Mega Raids": 4,
  "5-Star Raids": 5,
  "Legendary Mega Raids": 6,
  "Primal Raids": 6,
  "Super Mega Raids": 7,
};

/**
 * "Tier 4 and higher" per the numeric map above — derived from it (filtered
 * on the numbers) rather than hand-listing the 5 label strings a second time,
 * so the two can't silently drift apart if a tier's number ever needs
 * correcting. Excludes "1-Star Raids"/"3-Star Raids" only.
 */
export const TIER_4_PLUS_LABELS = new Set<RaidTier>(
  (Object.keys(RAID_TIER_NUMERIC) as RaidTier[]).filter((tier) => RAID_TIER_NUMERIC[tier] >= 4),
);

/**
 * This tab deliberately restricts its whole sweep (single-target per-level
 * table AND the all-species report below) to levels 35 through 50 inclusive,
 * in the same 0.5 steps `CPM_TABLE` (packages/engine/src/cpm.ts) uses — NOT
 * `compareIvSpreads`'s own default of every registered level (1 through 50
 * as of the level-50 cap extension). This is a fixed product decision (same
 * as "check every level" was previously a fixed decision, just a narrower
 * fixed range now), not a user-adjustable setting, so it's a plain module
 * constant rather than an `IvBreakpointsScenario` field. Built with a loop
 * rather than 31 hand-typed literals so it can't drift from the intended
 * range. `(50 - 35) / 0.5 + 1 === 31` levels total.
 */
export const LEVELS_35_TO_50: number[] = (() => {
  const levels: number[] = [];
  for (let level = 35; level <= 50; level += 0.5) {
    levels.push(level);
  }
  return levels;
})();

export function ivLabel(iv: IVSpread): string {
  return `${iv.attack}/${iv.defense}/${iv.stamina}`;
}

/**
 * Tallies, across every (level, metric) instance in one target's full
 * `compareIvSpreads` result, which spread had the strictly higher value —
 * `fastMoveDamage`/`chargedMoveDamage`/`timeToFaintSeconds` are all "higher is
 * better", so no sign conflict between them. A tie at a given level/metric
 * (including "both spreads outlast the scan window") increments neither.
 * `timeToFaintSeconds: null` means "outlasted the scan window" — treated as
 * beating any finite value, same `?? Infinity` convention the per-level table
 * below already uses for its own winner-bolding.
 */
export function tallyIvSpreadWins(rows: IvComparisonRow[]): { winsA: number; winsB: number } {
  let winsA = 0;
  let winsB = 0;
  for (const row of rows) {
    if (row.ivA.fastMoveDamage !== row.ivB.fastMoveDamage) {
      if (row.ivA.fastMoveDamage > row.ivB.fastMoveDamage) winsA++;
      else winsB++;
    }
    if (row.ivA.chargedMoveDamage !== row.ivB.chargedMoveDamage) {
      if (row.ivA.chargedMoveDamage > row.ivB.chargedMoveDamage) winsA++;
      else winsB++;
    }
    const ttfA = row.ivA.timeToFaintSeconds ?? Infinity;
    const ttfB = row.ivB.timeToFaintSeconds ?? Infinity;
    if (ttfA !== ttfB) {
      if (ttfA > ttfB) winsA++;
      else winsB++;
    }
  }
  return { winsA, winsB };
}

/**
 * Aggregate verdict across every registered species this tool can target
 * (the full roster from `allSpeciesOptions()` — same species reachable via
 * the "Raid boss / target" picker's tail below the active-raid entries;
 * exact count drifts with each data-sync, deliberately not hardcoded here)
 * — NOT an attempt
 * to invent an "every raid boss ever" historical dataset (speciesReport.ts's
 * own doc comments document why that dataset doesn't exist); this just
 * broadens "which targets to sweep" from "currently live in the raid
 * rotation" to "every species this tool already lets a user pick as a
 * target".
 */
/** Win tallies for one bucket of targets (either "all tiers" or one specific tier). */
export interface IvSweepBucket {
  total: number;
  countA: number;
  countB: number;
  ties: number;
}

/** One populated tier's bucket, carrying its own numeric tier alongside the label for display/sort. */
export interface IvSweepTierRow extends IvSweepBucket {
  tier: RaidTier;
  tierNumeric: number;
}

export interface IvSweepAggregate {
  /** Species successfully computed (excludes any lacking usable move data). */
  totalComputed: number;
  errorCount: number;
  /** Species where Spread A's summed win-tally across all levels/metrics is strictly higher. */
  countA: number;
  /** Species where Spread B's summed win-tally is strictly higher. */
  countB: number;
  /** Species where the tallies are equal (including both zero, i.e. never diverges). */
  ties: number;
  /**
   * The same win tallies as above, but bucketed by each target's own
   * resolved raid tier (`raidTierForSpeciesId(id) ?? DEFAULT_REAL_RAID_TIER`
   * — identical resolution used to build that target's boss stats). Only
   * tiers with at least one computed target are present, sorted by numeric
   * tier ascending. There are at most 7 possible entries here.
   */
  byTier: IvSweepTierRow[];
  /**
   * The headline verdict, restricted to targets whose resolved tier is
   * "Mega Raids"/"5-Star Raids"/"Legendary Mega Raids"/"Primal Raids"/
   * "Super Mega Raids" (numeric tier 4+, see TIER_4_PLUS_LABELS) — excludes
   * "1-Star Raids"/"3-Star Raids" targets entirely, per the user's request
   * that the single headline sentence not be diluted by low-tier trash
   * raids nobody is actually deciding an IV spread against.
   */
  tier4Plus: IvSweepBucket;
}

/**
 * "First becomes different at level X" — deliberately NOT "from level X
 * onward", since divergence between two IV spreads is not monotonic across
 * levels (floor-rounding can close a gap back up at a higher level even after
 * it opened lower down — see ivComparison.ts's own doc comment on
 * IvComparisonResult.firstDivergenceLevel). The full per-level table below is
 * the source of truth; this sentence is a headline pointer into it, not a
 * summary that replaces it.
 */
/**
 * The "Spread X outperforms Spread Y in N of M raids..." sentence, factored
 * out so both the tier-4+ headline and (if ever needed) an all-tiers sentence
 * can share the exact same wording/tie-handling rather than drifting apart —
 * `scopeIntro` is the sentence up through "...this tool can model" (already
 * carrying its own target count), this function only appends the comparison
 * clause.
 */
export function bucketVerdictSentence(bucket: IvSweepBucket, ivA: IVSpread, ivB: IVSpread, scopeIntro: string): string {
  if (bucket.total === 0) return `${scopeIntro}, but none could be computed for this matchup.`;
  if (bucket.countA === bucket.countB) {
    return `${scopeIntro}, Spread A (${ivLabel(ivA)}) and Spread B (${ivLabel(ivB)}) each come out ahead in ${bucket.countA} of them — neither spread outperforms the other more often overall (${bucket.ties} show no meaningful difference either way).`;
  }
  const aWins = bucket.countA > bucket.countB;
  const winnerLabel = aWins ? "A" : "B";
  const winnerIv = ivLabel(aWins ? ivA : ivB);
  const loserLabel = aWins ? "B" : "A";
  const loserIv = ivLabel(aWins ? ivB : ivA);
  const winnerCount = aWins ? bucket.countA : bucket.countB;
  const loserCount = aWins ? bucket.countB : bucket.countA;
  return `${scopeIntro}, Spread ${winnerLabel} (${winnerIv}) outperforms Spread ${loserLabel} (${loserIv}) in ${winnerCount} of them, versus ${loserCount} where Spread ${loserLabel} comes out ahead (${bucket.ties} show no meaningful difference either way) — Spread ${winnerLabel} outperforms Spread ${loserLabel} in ${winnerCount - loserCount} more raids overall.`;
}

export function headline(result: IvComparisonResult, ivA: IVSpread, ivB: IVSpread): string {
  const { fastMoveDamage, chargedMoveDamage, timeToFaint } = result.firstDivergenceLevel;
  if (fastMoveDamage === null && chargedMoveDamage === null && timeToFaint === null) {
    return `Spread A (${ivLabel(ivA)}) and Spread B (${ivLabel(ivB)}) are functionally identical at every level scanned against this target — no fast-move damage, charged-move damage, or time-to-faint difference appears anywhere in range. Powering up whichever spread is cheaper for you costs nothing here.`;
  }
  const parts: string[] = [];
  if (fastMoveDamage !== null) parts.push(`fast-move damage first becomes different at level ${fastMoveDamage}`);
  if (chargedMoveDamage !== null) parts.push(`charged-move damage first becomes different at level ${chargedMoveDamage}`);
  if (timeToFaint !== null) parts.push(`time-to-faint first becomes different at level ${timeToFaint}`);
  return `${parts.join("; ")}. This is the FIRST level any gap appears, not a permanent split — a gap can open and then close again at a higher level purely from floor-rounding, so check each row below rather than assuming the difference holds from this level on.`;
}
