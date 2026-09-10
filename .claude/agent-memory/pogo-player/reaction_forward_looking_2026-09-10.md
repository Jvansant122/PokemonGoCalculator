---
name: reaction-forward-looking-2026-09-10
description: 2026-09-10 forward-looking pass (post round-2 audit) — not "what's broken" but "what's missing." All six tabs driven live. Confirms Team Raid -> Power-Up export and the multi-raid significance toggle both work as shipped. Four concrete findings -- ranked build list at the end.
metadata:
  type: project
---

Triggered by: "with the rough edges gone, what would make this tool materially more useful" —
follow-up to round-1/round-2 audits (`reaction_full_audit_2026-09-10.md`,
`reaction_full_audit_round2_2026-09-10.md`). Driven live, all six tabs, ~1280x720 (Browser pane
had screenshot/scale flakiness this session — see Tool notes).

## Confirmed shipped and working

- **Team Raid -> Power-Up Optimizer export** (single-raid mode): carries roster, boss, moves.
  Resource fields (stardust/candy/XL/Rare Candy) land on 0 with an explicit on-screen note:
  "You'll still need to fill in: stardust on hand, each slot's own regular/XL candy, the shared
  Rare Candy pools, and any Shadow-adjacent Purified/Lucky flags — Team Raid has no equivalent
  for those." Confirmed live with the new Mega Tyranitar default roster (5 slots).
- **Significance-mode toggle** (multi-raid Power-Up Optimizer): "Also count a candidate that only
  helps against one boss, even if it doesn't move the average" checkbox exists; results panel
  reports "Hidden by significance mode: N candidates hidden" live (0 in this session's thin
  2-entry test roster). Per-candidate columns "BEST BOSS Δ" / "SIGNIFICANT BOSSES" exist in the
  ranked table. Could not stress-test richness — this browser profile only has a 2-entry CSV
  import (Palkia, Rayquaza, both already maxLevel, both landed in "Never competitive").
- **Species Report -> Comparator link** ("Compare vs. another attacker" action per row) already
  exists and was working before this pass — noted here because it's directly relevant to finding
  4 below (there is a cross-tab link from Species Report, just not to the tab a "will my whole
  team clear this" decision actually needs).

## Four concrete findings, most valuable first

1. **No reverse export: Power-Up Optimizer's plan -> Team Raid Simulator.** The fixed-budget plan
   reports a headline "Clear rate after this plan: 100% (avg 277.4s)" but there is no button to
   push those post-power-up levels into Team Raid Simulator and see the actual per-cycle
   breakdown / wipe count / finishing blow the way the baseline roster does. A player has to
   hand-copy each slot's new level back into Team Raid to see the sim that would make the
   headline number feel real. This is the direct half-answer counterpart to the export that just
   shipped in the other direction.
2. **Multi-raid mode has no single-boss picker, only tier + count filters.** Verified live: the
   "Boss set (multi-raid mode)" panel has "Include past/inactive raids," "Max boss count," 4 tier
   checkboxes, and a "Refresh boss set from today's active raids" button — no per-boss
   search/checkbox list (checked via `find` for "Search by name" — the only two matches on the
   whole page were IV Breakpoints' species pickers, not a boss picker). So "what should I power up
   across my WHOLE roster, including bench, for TONIGHT'S ONE specific raid" cannot be asked
   directly — you either average across a whole tier's worth of active bosses (multi-raid) or
   hand-pick 6 slots for one boss but lose the bench (single-raid). This is an observed UI gap,
   not a belief.
3. **No single-trainer lineup builder** (pick + order the best N of an imported roster for one
   boss). Multi-raid Power-Up Optimizer already half-builds toward this with "benched but
   promising," but stops at single-slot swap suggestions — it never proposes a full 6-slot order.
   Flagged explicitly as adjacent to, but distinct from, the ruled-out Teambuilding Analyzer
   (that one is multi-TRAINER mega-staggering; this is one trainer's own sequential roster,
   which is what Team Raid Simulator already models by hand). Proximity to a standing decision
   means this should be clarified with the user before being scoped, not built on inference.
4. **Species Report's only cross-tab link goes to Comparator, not Team Raid Simulator.** Species
   Report answers "where should I bring this ONE Pokémon"; the real decision on raid night is
   "will my WHOLE fielded team clear it," which lives in Team Raid Simulator. Cheapest of the
   four findings — same shape as the already-shipped Team Raid -> Power-Up link, just one more
   spoke.

## What I'd cut

No strong candidate this pass — round 1/2 already trimmed the worst offenders (collapsed panels,
badge fixes). Weakest finding, not a real recommendation: Species Report's "Type rank" column
(cheap type-chart-only heuristic) sits next to the actual simulated ranking, and the one example
pulled up live ("Rankings disagree — go with the simulated pick") shows it can actively mislead if
skimmed alone — but the page already tells the reader which one to trust in that exact sentence,
so this is not costing much. Not worth an action.

## Ranked build list given to the user (see full response for one-liners)

1. Power-Up Optimizer plan -> Team Raid Simulator export (reverse of the just-shipped link)
2. Multi-raid mode: explicit single-boss selection alongside the tier filters
3. Single-trainer roster lineup builder (flagged as bordering the Teambuilding Analyzer standing
   decision — needs a scoping conversation, not a quiet build)
4. Species Report row -> Team Raid Simulator link

## Tool notes (not product findings)

- Ref-based clicks were unreliable again this session — refs appear computed against a
  1280x720 frame while `left_click`/`screenshot` execute against an 800x455 frame; a ref click
  would silently land on the wrong element (e.g. landed in a species combobox instead of a mode
  toggle button, typing nothing but shifting focus). Screenshot-derived raw pixel coordinates
  were the only reliable click target this session. `screenshot` itself intermittently timed out
  or returned a blank frame; `get_page_text` was also observed stale/cached once after a DOM
  change that a subsequent screenshot correctly reflected — when the two disagree, trust a fresh
  screenshot over `get_page_text` for CURRENT-state questions, and re-poll `get_page_text` after
  a beat rather than assuming a click failed.
