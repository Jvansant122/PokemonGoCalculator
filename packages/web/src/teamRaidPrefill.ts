/**
 * Minimal payload for the "start from a Pokémon" hand-off into Team Raid
 * Simulator — the sibling of comparatorPrefill.ts's ComparatorPrefill, same
 * mechanism (a lifted-prop hand-off through App.tsx's own state, NOT a full
 * navigation) but a separate small type rather than reusing ComparatorPrefill
 * itself: `candidateAId` is specifically named for the two-candidate
 * comparator's candidate A, and reusing it here for "the one slot to seed"
 * would read as ambiguous about which destination a given field is for.
 *
 * SpeciesReportView hands one of these to App.tsx when a row's "Send to Team
 * Raid Simulator" action is clicked, App.tsx switches the active tab to Team
 * Raid, and TeamRaidView seeds slot 1 of its roster from it (species + its
 * currently-selected moveset) with the row's own boss as the raid target —
 * every other slot and every shared assumption (level/IVs/dodge/weather/
 * timer/etc.) stays at TeamRaidView's own DEFAULT_TEAM_ASSUMPTIONS, left for
 * the player to adjust, same "only seed what was actually clicked" precedent
 * as ComparatorPrefill.
 *
 * Deliberately a standalone file rather than defined inside App.tsx or
 * TeamRaidView.tsx, so neither of those two has to import the other just to
 * share this one small type — same reasoning as comparatorPrefill.ts.
 */
export interface TeamRaidPrefill {
  targetId: string;
  speciesId: string;
  /** null = use that species' first fast move — same convention as ComparatorPrefill. */
  fastMoveId: string | null;
  chargedMoveId: string | null;
}
