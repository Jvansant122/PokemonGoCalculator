/**
 * Shared tooltip text for the per-candidate/per-slot "Best Buddy" checkbox on
 * every tab that offers it — one copy so the stacking caveat can't drift
 * between AssumptionPanel.tsx and TeamAssumptionPanel.tsx. See
 * megaLevel.ts's BEST_BUDDY_EFFECTIVE_LEVEL_BONUS doc comment for the full
 * sourcing this paraphrases; deliberately hedged rather than stated as a
 * clean, confirmed mechanic — this must read as carefully labeled, not
 * oversold, per this feature's own instructions.
 *
 * "Best Buddy" here is the CP Boost (+1 effective level, orthogonal to Mega
 * Evolution, applies to any species) — completely unrelated to the
 * Friendship ATTACK bonus (FriendshipSelect.tsx) despite sharing the word
 * "Friend"; do not conflate the two in copy.
 */
export const BEST_BUDDY_HINT =
  "Free +1 effective level while this Pokemon is your active buddy (see the real Best Buddy CP Boost) — unrelated " +
  "to Mega Level, applies to any species. Stacks with Super Max's own +2 (50+2+1=53 at max level+Super Max+Best " +
  "Buddy) per the ONLY source this project has found stating so: a single GitHub gist comment — the SAME source " +
  "already cited for Super Max's own +2 magnitude, not a second, independent corroboration of the STACKING claim " +
  "specifically. Treat the stacking number as community-consensus, single-source, not a confirmed game rule.";
