import type { PokemonType } from "./types.js";

/**
 * Default mega/primal boost multiplier (30%). This is load-bearing, not a
 * cosmetic default: at 1.1 (10%) instead of 1.3 (30%), Scenario B's "extra mega
 * uptime is worth more than a raw DPS edge" conclusion flips back the other way.
 * Any UI that lets this be edited must treat it as a first-class assumption
 * (see Phase 4's assumption panel), not a hidden constant.
 */
export const DEFAULT_MEGA_BOOST_MULTIPLIER = 1.3;

export interface UptimeConversionInputs {
  secondsSurvived: number;
  boostMultiplier: number;
  teammateCount: number;
  teammateDps: number;
  /** Whether the teammates' attack type matches the mega's boosted type. */
  typeMatches: boolean;
}

/**
 * Converts "this mega survived N seconds longer" into total team damage
 * contributed during that window. The boost is applied only when the
 * teammates' attacking type matches the mega's boost type — an off-type party
 * gets zero benefit from extra mega uptime, no matter how long it lives.
 */
export function convertUptimeToTeamDamage(inputs: UptimeConversionInputs): number {
  const { secondsSurvived, boostMultiplier, teammateCount, teammateDps, typeMatches } = inputs;
  if (secondsSurvived <= 0 || teammateCount <= 0) return 0;
  const effectiveMultiplier = typeMatches ? boostMultiplier : 1;
  return secondsSurvived * teammateDps * teammateCount * effectiveMultiplier;
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
 */
export function findCrossoverPartySize(
  a: Candidate,
  b: Candidate,
  teammateDps: number,
  typeMatches: { a: boolean; b: boolean },
  partySizeRange: number[] = Array.from({ length: 20 }, (_, i) => i + 1),
): CrossoverPoint {
  const totalFor = (c: Candidate, matches: boolean, partySize: number) =>
    c.ownDamage +
    convertUptimeToTeamDamage({
      secondsSurvived: c.secondsSurvived,
      boostMultiplier: c.boostMultiplier,
      teammateCount: partySize,
      teammateDps,
      typeMatches: matches,
    });

  let previousLeader: string | null = null;
  for (const partySize of partySizeRange) {
    const totalA = totalFor(a, typeMatches.a, partySize);
    const totalB = totalFor(b, typeMatches.b, partySize);
    const leader: string | null = totalA === totalB ? previousLeader : totalA > totalB ? a.id : b.id;
    if (previousLeader !== null && leader !== null && leader !== previousLeader) {
      return { partySize, leaderBelow: previousLeader, leaderAtOrAbove: leader };
    }
    if (leader !== null) previousLeader = leader;
  }
  return { partySize: null, leaderBelow: previousLeader, leaderAtOrAbove: previousLeader };
}
