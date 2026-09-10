---
name: fact-mega-level-system-2026-update
description: Mega Level system (Base/High/Max, +Super Max as of Feb 2026) reduces the OWNER's mega energy cost/cooldown but does NOT change the 1.3x team boost; Super Max's own "enhanced CP" mechanism is unconfirmed
metadata:
  type: project
---

Researched 2026-09-08 for the multi-raid Power-Up Optimizer expansion (Mega Energy is a
per-species currency this engine doesn't model at all).

**Mega Level system** (introduced 2022-04-28): repeatedly Mega Evolving the SAME species (max
once/day per species) raises that species' own Mega Level, which reduces Mega Energy cost and
rest-period/cooldown to re-mega without spending more energy:
- Base (1 mega evolution): 80% cost reduction on repeats, 7-day rest period.
- High (7 total): 90% reduction, 5-day rest.
- Max (30 total): 95% reduction, 3-day rest.
[community-consensus: Bulbapedia "Mega Evolution (GO)", fetched as raw wikitext 2026-09-08 —
the AI-summarized (non-raw) WebFetch of the same page also surfaced these, consistent].
The raw wikitext's table shows **no CP/stat bonus at any of these three tiers** ("CP Level Bonus"
column blank) — Mega Level historically only ever touched cost/cooldown, never the mega's own
combat stats.

**Super Max Level (new tier, launched at Pokémon GO Tour: Kalos, 2026-02-28/03-01)**: reached
after Max Level by spending 5,000 of that species' own Mega Energy. [first-party: Niantic's own
post, https://pokemongo.com/news/mega-evolution-2026-update, fetched 2026-09-08] states the
benefits as: "Greatly enhanced CP," stronger same-type catch bonus, improved Candy XL catch
chance, and rest period cut to 24 hours. **The exact mechanism behind "greatly enhanced CP" is
NOT clarified by Niantic's own post, nor by LeekDuck's companion writeup**
(https://leekduck.com/posts/mega-evolution-update-super-mega-raids-super-max/, fetched
2026-09-08, first-party-adjacent) — neither states whether this is a real stat/CPM change (like
Best Buddy's +1 effective level, just bigger) or a display-only CP number. A "+2 levels" figure
circulates but **only on lower-tier SEO guide sites** (pokeep.com, boostroom.com, theclick.gg)
that don't cite a primary source — could not be corroborated at Niantic or LeekDuck tier.
**Treat "+2 effective levels" as `[speculative/unverified]`**, not fact, until a better source
surfaces.

**Partial upgrade, round 2, 2026-09-09** (see [[fact-cpm-table-levels-41-50]]): a GitHub gist
comment (`gist.github.com/Mygod/71ac34368f66f0d3de469fbaeed386c4`) independently states the same
magnitude — Mega Level 4 ("Super Max") brings a Pokémon to effective level 52, level 53 stacked
with Best Buddy — found while researching a different question (why the raw GAME_MASTER CPM array
has real values through level 54/55). Still gist-comment tier, not first-party, but now two
independent-ish community sources converge on the same number instead of one low-tier SEO cluster.
Upgrade confidence to `[community-consensus]` for the MAGNITUDE only; the underlying MECHANISM
(is this a real CPM-table lookup swap, or a display-only CP recompute) is still not confirmed by
Niantic or LeekDuck.

**Confirmed unaffected by this whole system, at every tier including Super Max**: the **1.3x
team-wide mega/primal damage boost does not change** with Mega Level [Bulbapedia raw wikitext
explicit on this for Base/High/Max; Niantic's 2026 post doesn't mention the team boost changing
at all for Super Max]. This directly corroborates — does NOT contradict — CLAUDE.md's standing
decision that the 1.3 boost is load-bearing and the "boosts other trainers only" scoping; worth
citing explicitly next time someone worries a mega content update might have touched it.

**Also new in this update** (same source): **Super Mega Raids** (8+ trainers, already correctly
present in this project's `RaidTier` union / `RAID_TIER_TABLE` at 25000 HP / 0.79 mult — no gap
here) and **Link Charges** (a new consumable needed alongside a Raid/Remote Pass to ENTER a
Mega/Super Mega Raid — an access-gate resource, not a combat-stat mechanic, likely irrelevant to
this engine's math).

Fed into the multi-raid-optimizer research response (2026-09-08). Recommended: record as not
modelled + UI caveat, not build — per-species Mega Energy/cooldown tracking across a 100-200
roster is a real, separate subsystem, out of scope for a power-up-focused expansion.

**Round 3 addendum (2026-09-09)**: Bulbapedia (`Mega_Evolution_(GO)`, fetched 2026-09-09) dates
the "+" additional-Charged-Attack feature itself to **2026-08-31** — a distinct, later date from
Super Max Level's own Feb 2026 launch (Super Max Level existed for ~6 months as a CP/cooldown/catch
tier before any species got an extra move on top of it). States the "+" moves are "based off Plus
Moves from Pokémon Legends: Z-A" in name/flavor only — Z-A's own Plus Move mechanic boosts *every*
move a mega uses via a resource gauge, structurally unlike GO's one-fixed-extra-move
implementation, so nothing numeric transfers. Full detail in
[[fact-super-max-plus-move-mechanics-detail]]. **Re-confirmed again this round: the 1.3x team-wide
mega/primal boost is untouched by any of this** — no source across 3 research rounds has ever
described Mega Level, Super Max, or the "+" moves as affecting it.
