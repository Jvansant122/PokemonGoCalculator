import type { RosterPowerUpCandidate } from "@pogo-analyzer/engine";
import type { RosterEntry as ImportedRosterEntry } from "./import/pokeGenieMatch.js";

/**
 * Collapses `RosterPowerUpCandidate` rows whose underlying pool entries are
 * genuinely INTERCHANGEABLE — Phase 3b of PLAN_multi_raid_roster_optimizer.md,
 * item 3. A real imported roster holds actually-identical duplicates (the
 * reference export has two level-20, IV 12/12/14 Mewtwo), and Stage 4's own
 * swap-order noise alone produces DIFFERENT deltas (measured: +0.161 vs
 * +0.147, a gap far below the sweep's own noise floor) for what is, in every
 * way that matters to the player, the SAME recommendation — the top rows of
 * an un-deduped table can be one recommendation repeated, which reads as
 * ranking but is actually noise.
 *
 * CONSERVATIVE BY CONSTRUCTION: the group key is EXACT equality on species
 * id, `fromLevel`, `toLevel`, all three IVs, both move ids, and all three
 * cost modifiers (shadow/purified/lucky) — any ONE difference keeps rows
 * separate. Two entries that collapse into one group are therefore, by
 * definition, identical in every way this planner's own math can see, so
 * there is nothing meaningful to distinguish between them beyond a count —
 * see MultiRaidCandidateRow.tsx's own doc comment for "either one satisfies
 * the recommendation."
 */
export interface DedupedRosterCandidateGroup {
  /** Stable across renders for the SAME underlying group — use as the table row's React key. NOT any single candidate's own entryId, since a group can hold several. */
  key: string;
  /** How many pool entries collapsed into this one row. 1 means "not actually a duplicate" — render identically to a raw (undeduped) row. */
  count: number;
  /**
   * The group member whose OWN `meanDeltaTeamDps` is closest to the group's
   * average — a real, fully-computed candidate (its `perBoss` breakdown,
   * cost, etc. are all genuinely ITS OWN, never a synthesized blend across
   * the group), chosen so a single lucky/unlucky swap-order outlier isn't
   * what gets shown as "the" number for the whole group.
   */
  representative: RosterPowerUpCandidate;
}

function candidateGroupKey(c: RosterPowerUpCandidate, entry: ImportedRosterEntry): string {
  return [
    c.speciesId,
    c.fromLevel,
    c.toLevel,
    entry.ivs.attack,
    entry.ivs.defense,
    entry.ivs.stamina,
    entry.fastMoveId ?? "",
    entry.chargedMoveId ?? "",
    entry.costModifiers.isShadow ? 1 : 0,
    entry.costModifiers.isPurified ? 1 : 0,
    entry.costModifiers.isLucky ? 1 : 0,
  ].join("|");
}

/**
 * `candidates` should already be in the display order the caller wants (e.g.
 * rank order) — group order follows first-occurrence order, so a pre-sorted
 * input stays effectively sorted (a group surfaces at its best/earliest
 * member's rank).
 */
export function dedupeInterchangeableCandidates(
  candidates: RosterPowerUpCandidate[],
  pool: ImportedRosterEntry[],
): DedupedRosterCandidateGroup[] {
  const poolByEntryId = new Map(pool.map((e) => [e.entryId, e]));
  const groups = new Map<string, RosterPowerUpCandidate[]>();
  const order: string[] = [];

  for (const c of candidates) {
    const entry = poolByEntryId.get(c.entryId);
    // Conservative fallback: if the underlying pool entry can't be found at
    // all (shouldn't happen in practice — every candidate's entryId comes
    // from the same pool this sweep was computed from), never collapse it —
    // give it its own row rather than guessing at identity.
    const key = entry ? candidateGroupKey(c, entry) : `unique:${c.entryId}@${c.toLevel}`;
    const existing = groups.get(key);
    if (existing) existing.push(c);
    else {
      groups.set(key, [c]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    if (group.length === 1) return { key, count: 1, representative: group[0]! };

    const meanOfMeans = group.reduce((sum, c) => sum + c.meanDeltaTeamDps, 0) / group.length;
    let representative = group[0]!;
    let bestDistance = Infinity;
    for (const c of group) {
      const distance = Math.abs(c.meanDeltaTeamDps - meanOfMeans);
      if (distance < bestDistance) {
        bestDistance = distance;
        representative = c;
      }
    }
    return { key, count: group.length, representative };
  });
}
