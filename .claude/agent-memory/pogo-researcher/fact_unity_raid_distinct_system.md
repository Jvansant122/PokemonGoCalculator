---
name: fact-unity-raid-distinct-system
description: Unity Raids (debuted GO Fest 2026 Global, Mega Mewtwo X/Y) are structurally distinct from standard raids in more than just auto-revive — mass-scale participation, a crowd-charged Unity Attack requiring physical device motion, and "cannot flee." Recommendation — EXCLUDE like Max Battles, do not approximate via reviveCostSeconds=0.
metadata:
  type: project
---

[community-consensus, multi-source], researched 2026-09-09 (round 2, deepened
from the brief mention in [[fact_raid_timer_and_revive_flow]]). This entry
resolves the scope call that pass left open: is a Unity Raid a standard raid with
one rule changed, or a structurally different battle system.

**What it is.** Debuted at GO Fest 2026: Global (in-person events), first bosses
Mega Mewtwo X/Y. Confirmed via Niantic's own Help Center page ("How to Participate
in the Mega Mewtwo Super Mega Raid at Pokémon GO Fest 2026 in-person events") plus
WebSearch corroboration (GamingHQ, Pokémon GO Hub's Mega Mewtwo raid guide,
Pokémon GO Hub's earlier datamine post "Dataminers Discover New Texts For a New
Raid Type: Unity Raids").

**Three divergences from a standard raid, not one:**
1. **Auto-revive** — a trainer's fainted team revives automatically instead of
   requiring manual healing/re-selection (this is the part the earlier pass
   caught).
2. **Unity Attack** — once the boss reaches low HP, a finishing move becomes
   available that **no single trainer can activate alone**: all participating
   trainers must fill a shared "Unity meter," charged by **physically raising
   their phones/devices into the air together** — a real-world crowd gesture, not
   a simulable in-game input.
3. **Mass-scale, no-flee lobby** — described as trainers working together
   "alongside thousands of other Trainers" in one battle, and "you cannot flee
   this battle once it begins." This breaks the standard raid's up-to-20-trainer
   lobby assumption entirely, not just the revive rule.

**Recommendation, directly answering the scope question posed:** Unity Raids are
**not** representable as "the standard raid model with `reviveCostSeconds`
tuned to ~0." That framing would silently drop divergences #2 and #3, which have
no analogue in this engine's Scenario/TeamRaid model at all (there is no concept
of "thousands of co-participants" or a crowd-charged, physically-gestured
finishing move). This is the same category as
[[fact_max_battles_separate_system]] — a distinct battle system to **exclude**
from any raid-boss sweep or data pipeline, not a variant to approximate. If this
tool's data layer ever ingests raid-boss rosters broadly, Unity Raid bosses (Mega
Mewtwo X/Y under this mode specifically) need the same DATA-layer filter Max
Battle content already needs — don't let a boss name match trick a sync script
into treating it as an ordinary Tier-5/Mega raid encounter.

**Engine: no impact today** — nothing in the current pipeline ingests Unity Raid
as a distinct source, so there's nothing to fix, only something to keep excluding
if raid-boss data sourcing ever expands (see [[fact_third_raid_source]] and
[[fact_historical_raid_bosses]] for the sourcing work this would interact with).
