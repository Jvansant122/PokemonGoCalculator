---
name: fact-dps-tdo-vocabulary
description: Community-standard raid-attacker vocabulary — DPS (damage/sec), TDO (total damage output before fainting), and blended eDPS/Score metrics that weight DPS more for tight-timer raids and TDO more for solo/survivability scenarios
metadata:
  type: project
---

Researched 2026-09-05, via web search across raid-tier-list aggregator sites (Dittobase, PoGoMate,
DoctorPokeGoGo's published "Rating Methodology" page, switchbladegaming, sportskeeda) — no single
official Niantic source for this, it's aggregator/community terminology. **[community-consensus]**.

- **DPS** = damage per second: sustained output from an attacker's best fast+charged moveset,
  factoring in energy gain, charged-move animation time, and (per some sites) a "one-bar nuke"
  penalty. This is the raw output rate, before any relobby/downtime cost.
- **TDO** = total damage output: how much damage one attacker deals in total before fainting —
  factors in the attacker's own HP/bulk and the boss's incoming damage, so a tankier attacker has
  higher TDO than a glassy one at the same DPS.
- Some sites blend both into a single **eDPS** or **Score** (commonly described as a DPS-weighted
  blend like DPS³ × TDO, scaled to 100 for the top attacker on a list) that also folds in the cost
  of relobbying after a faint.
- Practical framing these sites use: DPS matters most when raid timers are tight (want max damage
  before the boss's own attack timer runs out); TDO matters more in solo/duo play where surviving
  longer matters more.

**Relevance to this project:** this tool's own "own damage per second" and "mean own total
(charged+fast)" result-card metrics are effectively DPS and TDO under different names — see
[[proposal-dps-tdo-vocabulary]] for the labeling proposal this grounds. The community's own eDPS/
Score blend is a *single-attacker* solo-relobby framing (not team-attributable damage) — distinct
from, not a substitute for, this tool's "own + team damage from boost" metric, which is this
product's actual point of differentiation.
