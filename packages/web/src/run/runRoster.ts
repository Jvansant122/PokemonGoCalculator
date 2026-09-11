/**
 * Pure "assumptions [+ roster] in -> summary out" computation for the Roster
 * tab — see runComparator.ts's own doc comment for why this extraction
 * exists and the conventions every run module follows. Unlike every other
 * run<Tab>Scenario, this tab computes no combat/damage numbers at all (it's
 * a roster-management page, not a simulation): `entries` is the caller's
 * ALREADY-HYDRATED roster pool (rosterPool.ts is localStorage-only and never
 * read here directly — same "hand the pool in as its own parameter"
 * convention as run/runRosterPlanner.ts's own resolution functions), and the
 * only real computation is a small roster-wide summary plus this scenario's
 * own display-only sort order, so the CLI and the UI can never disagree
 * about either.
 *
 * NOTE for a future session: `scripts/run-scenario.ts` does not yet have a
 * "roster" case (see HANDOFF.md — left out deliberately this session because
 * `scripts/` was off-limits while a concurrent session was editing it; the
 * CLI branch would be a "roster not available to this CLI" message, same
 * shape as Power-Up Optimizer's multi-raid branch, since the roster is
 * localStorage-only and structurally unreachable from a share link either
 * way).
 */
import type { RosterEntry } from "../import/pokeGenieMatch.js";
import { movesetDefaultBadge } from "../rosterMovesetBadge.js";
import type { RosterSortBy } from "../rosterScenario.js";

export interface RosterSummary {
  entryCount: number;
  uniqueSpeciesCount: number;
  megaCapableCount: number;
  shadowCount: number;
  purifiedCount: number;
  luckyCount: number;
  defaultedMovesetCount: number;
  approximateIvCount: number;
  approximateLevelCount: number;
}

export function summarizeRoster(entries: RosterEntry[]): RosterSummary {
  const speciesIds = new Set<string>();
  let megaCapableCount = 0;
  let shadowCount = 0;
  let purifiedCount = 0;
  let luckyCount = 0;
  let defaultedMovesetCount = 0;
  let approximateIvCount = 0;
  let approximateLevelCount = 0;
  for (const entry of entries) {
    speciesIds.add(entry.species.id);
    if (entry.canMega) megaCapableCount += 1;
    if (entry.species.isShadow || entry.costModifiers.isShadow) shadowCount += 1;
    if (entry.costModifiers.isPurified) purifiedCount += 1;
    if (entry.costModifiers.isLucky) luckyCount += 1;
    if (movesetDefaultBadge(entry)) defaultedMovesetCount += 1;
    if (entry.ivsAreApproximate) approximateIvCount += 1;
    if (entry.levelIsApproximate) approximateLevelCount += 1;
  }
  return {
    entryCount: entries.length,
    uniqueSpeciesCount: speciesIds.size,
    megaCapableCount,
    shadowCount,
    purifiedCount,
    luckyCount,
    defaultedMovesetCount,
    approximateIvCount,
    approximateLevelCount,
  };
}

/**
 * Applies this tab's own display-only `sortBy` — never mutates `entries`.
 * "recent" keeps the pool's own stored (append) order, since that's the
 * order a user added/imported things in and there is no other natural
 * "recency" this pool tracks.
 */
export function sortRosterEntries(entries: RosterEntry[], sortBy: RosterSortBy): RosterEntry[] {
  const copy = [...entries];
  if (sortBy === "species") copy.sort((a, b) => a.species.name.localeCompare(b.species.name));
  else if (sortBy === "level") copy.sort((a, b) => b.level - a.level);
  return copy;
}

export interface RosterRunResult {
  summary: RosterSummary;
  sortedEntries: RosterEntry[];
}

export function runRosterScenario(sortBy: RosterSortBy, entries: RosterEntry[]): RosterRunResult {
  return { summary: summarizeRoster(entries), sortedEntries: sortRosterEntries(entries, sortBy) };
}
