/**
 * Shared core tooltip text for the "own-cast dodge-vulnerability cost" line
 * (IDEAS.md #20/#23) — the Comparator (per-candidate, 200-seed mean) and the
 * Team Raid Simulator (per-encounter, single deterministic run) each append
 * their own trailing sentence describing what "the number below" actually
 * summarizes, but the load-bearing caveat — this is this project's OWN
 * unsourced modelling assumption, not a confirmed game mechanic — must read
 * identically everywhere it appears. One shared copy so that caveat can't
 * drift between tabs the way BEST_BUDDY_HINT/FRIENDSHIP_HINT are already
 * shared for their own tooltips.
 */
export const OWN_CAST_DODGE_COST_HINT_CORE =
  'UNSOURCED PLACEHOLDER, not a confirmed game mechanic: with "hold charged move for a safer moment" on, this ' +
  "engine models the attacker as dodging TWICE around each held cast (once before throwing it, once after) rather " +
  "than the ordinary single dodge attempt, so each of the boss's charged hits attempted-to-dodge while holding " +
  "costs 2x the usual dodge time instead of 1x. No source quantifies this sequence at all — it is this project's " +
  "own labelled modelling assumption (simulate.ts's HOLD_CHARGED_MOVE_DODGE_ATTEMPTS), and MECHANICS.md still " +
  "records it as an open question.";
