import type { PokemonType } from "./types.js";

/**
 * Default mega/primal boost multiplier (30%). This is load-bearing, not a
 * cosmetic default: at 1.1 (10%) instead of 1.3 (30%), Scenario B's "extra mega
 * uptime is worth more than a raw DPS edge" conclusion flips back the other way.
 * Any UI that lets this be edited must treat it as a first-class assumption
 * (see Phase 4's assumption panel), not a hidden constant.
 */
export const DEFAULT_MEGA_BOOST_MULTIPLIER = 1.3;

/**
 * The mega/primal boost is NOT all-or-nothing by type: every party member
 * gets at least this flat boost regardless of type match — only a teammate
 * whose attack type matches the mega's boosted type gets the full
 * `boostMultiplier` (e.g. 1.3) instead. An earlier version of this engine
 * gave off-type teammates 1x (no boost at all), which understated their
 * contribution.
 */
export const OFF_TYPE_MEGA_BOOST_MULTIPLIER = 1.1;

export interface UptimeConversionInputs {
  secondsSurvived: number;
  /** On-type multiplier (e.g. 1.3 for a mega boost) — applied to matchingTeammateCount only. */
  boostMultiplier: number;
  teammateCount: number;
  /**
   * How many of teammateCount share the mega's boosted type and so get the
   * full boostMultiplier — the rest get OFF_TYPE_MEGA_BOOST_MULTIPLIER, not
   * zero. Real teams are rarely all-or-nothing on type, so this is a count,
   * not a single yes/no for the whole party. Clamped to [0, teammateCount].
   */
  matchingTeammateCount: number;
  teammateDps: number;
}

/**
 * Converts "this mega survived N seconds longer" into total team damage
 * contributed during that window, split by how many teammates share its
 * boosted type (full boostMultiplier) versus don't (still
 * OFF_TYPE_MEGA_BOOST_MULTIPLIER, never zero).
 */
export function convertUptimeToTeamDamage(inputs: UptimeConversionInputs): number {
  const { secondsSurvived, boostMultiplier, teammateCount, teammateDps } = inputs;
  if (secondsSurvived <= 0 || teammateCount <= 0) return 0;
  const matching = Math.min(Math.max(inputs.matchingTeammateCount, 0), teammateCount);
  const nonMatching = teammateCount - matching;
  const perSecondDamage = matching * teammateDps * boostMultiplier + nonMatching * teammateDps * OFF_TYPE_MEGA_BOOST_MULTIPLIER;
  return secondsSurvived * perSecondDamage;
}

export interface Candidate {
  id: string;
  secondsSurvived: number;
  boostMultiplier: number;
  boostedType: PokemonType;
  /** This candidate's own raw damage contribution, independent of teammates. */
  ownDamage: number;
}

export interface CrossoverPoint {
  /** First integer party size (within the searched range) at which the ranking flips, or null if it never does. */
  partySize: number | null;
  leaderBelow: string | null;
  leaderAtOrAbove: string | null;
}

/**
 * For two candidates plotted against party size (1-20 by default), finds the
 * crossover point where total contribution ranking flips. The headline output
 * of Phase 3 is *where* this line crosses, not which candidate leads at any one
 * party size.
 *
 * matchingFraction (0-1 per candidate) is what stays fixed as party size is
 * swept, since an absolute matching COUNT (see convertUptimeToTeamDamage)
 * doesn't scale sensibly across different party sizes — e.g. "3 teammates
 * match" means something different at party size 4 versus party size 20.
 * Round to the nearest whole teammate at each swept size.
 */
export function findCrossoverPartySize(
  a: Candidate,
  b: Candidate,
  teammateDps: number,
  matchingFraction: { a: number; b: number },
  partySizeRange: number[] = Array.from({ length: 20 }, (_, i) => i + 1),
): CrossoverPoint {
  const totalFor = (c: Candidate, fraction: number, partySize: number) =>
    c.ownDamage +
    convertUptimeToTeamDamage({
      secondsSurvived: c.secondsSurvived,
      boostMultiplier: c.boostMultiplier,
      teammateCount: partySize,
      matchingTeammateCount: Math.round(partySize * fraction),
      teammateDps,
    });

  let previousLeader: string | null = null;
  for (const partySize of partySizeRange) {
    const totalA = totalFor(a, matchingFraction.a, partySize);
    const totalB = totalFor(b, matchingFraction.b, partySize);
    const leader: string | null = totalA === totalB ? previousLeader : totalA > totalB ? a.id : b.id;
    if (previousLeader !== null && leader !== null && leader !== previousLeader) {
      return { partySize, leaderBelow: previousLeader, leaderAtOrAbove: leader };
    }
    if (leader !== null) previousLeader = leader;
  }
  return { partySize: null, leaderBelow: previousLeader, leaderAtOrAbove: previousLeader };
}
