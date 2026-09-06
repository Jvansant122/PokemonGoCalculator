/**
 * Minimal payload for the "start from a Pokémon" hand-off described in
 * .claude/agent-memory/pogo-researcher/proposal_species_reverse_lookup.md
 * section 4: SpeciesReportView hands one of these to App.tsx when a row's
 * "Compare against another attacker" action is clicked, App.tsx switches the
 * active tab to the comparator, and ComparatorView seeds its initial
 * Assumptions from it (candidate A + target only — candidate B is left at
 * whatever the comparator's own default is, for the player to change).
 *
 * Deliberately a standalone file rather than defined inside App.tsx or
 * ComparatorView.tsx, so neither of those two has to import the other just
 * to share this one small type.
 */
export interface ComparatorPrefill {
  targetId: string;
  candidateAId: string;
  /** null = use that species' first fast move — same convention as Assumptions/Scenario everywhere else in this app. */
  candidateAFastMoveId: string | null;
  candidateAChargedMoveId: string | null;
}
