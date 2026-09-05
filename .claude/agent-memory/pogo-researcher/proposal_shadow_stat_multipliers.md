---
name: proposal-shadow-stat-multipliers
description: Proposed data/engine feature — model real Shadow attack/defense multipliers instead of the current approximation; status as of 2026-09-05 is proposed, not yet routed/built
metadata:
  type: project
---

Proposed 2026-09-05 (first ideation pass by this agent). Not yet built, rejected, or routed —
status: **proposed, pending overseer decision**.

**What it would show:** replace the current approximation (real Shadow-form stats not modeled,
per CLAUDE.md's known-gaps list — Shadow raid bosses currently matched to a non-Shadow stand-in
species) with the actual multipliers in [[fact-shadow-pokemon-stats]] (Attack x1.2, Defense
~x0.83), applied as an independent attack/defense modifier alongside (never combined with) the
mega/primal boost, since Shadow Pokemon cannot Mega Evolve in the real game.

**Why it sharpens the thesis:** Shadow is the single cleanest real-game illustration of a raw
glass-cannon trade — more attack, less defense/bulk — which is exactly the trade this tool's
survivability-as-team-DPS conversion exists to adjudicate. It's more a data-accuracy fix than a
new mechanic (closes a documented gap rather than adding a feature), but it's the kind of gap
whose fix directly produces thesis-relevant scenarios (does the 20% attack gain outweigh the
extra damage taken, once converted to team DPS) rather than being cosmetic.

**Standing-decision check:** no new Scenario field implied (Shadow-ness would be intrinsic
species/raid-boss data, resolved the same way boost multipliers already are). Doesn't touch the
1.3 mega-boost constant. Not the ruled-out Teambuilding Analyzer.

**Caveat carried forward:** exact defense multiplier has minor variance across sources (0.83 vs
5/6≈0.8333) — pin down precisely before hand-authoring, and treat as community-consensus, not
Niantic-confirmed.
