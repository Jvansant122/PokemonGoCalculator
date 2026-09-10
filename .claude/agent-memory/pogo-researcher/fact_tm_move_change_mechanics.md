---
name: fact-tm-move-change-mechanics
description: Core TM/Elite TM mechanics for Power-Up-Optimizer move-change modeling — item list, random vs chosen, pool exclusions, multi-charged-move choice, obtain sources/scarcity, uniformity NOT officially confirmed
metadata:
  type: project
---

Researched 2026-09-10 for a Power-Up Optimizer move-change-as-purchasable-action design (TM
inventory typed in by the user). MECHANICS.md's existing "Second charged move unlock" entry never
covered HOW TMs themselves work, only the separate second-move-unlock cost — this is new ground,
not a correction of anything already recorded.

**Four items exist, no more**: Fast TM, Charged TM, Elite Fast TM, Elite Charged TM.
[community-consensus — Bulbapedia has exactly these 4 as separate pages plus a disambiguation
"TM"/"Elite TM" page, corroborated across every guide site checked, 2026-09-10]

**Regular TM = random, EXCLUDES the currently-held move and ALL legacy/event-exclusive moves**
(Community Day moves etc. are never in the random pool). [community-consensus, Bulbapedia
`Fast_TM`/`Charged_TM` raw wikitext, fetched 2026-09-10, verbatim: "changes its Fast/Charged
Attack to a random, DIFFERENT move in the Pokémon's current move pool" + "Legacy and
event-exclusive moves ... cannot be learned this way"]

**Elite TM = player's full choice, INCLUDES legacy/event-exclusive moves** ("most" — see
exceptions below). [community-consensus, same source]

**Exceptions neither TM type can ever touch** (outside BOTH pools, always, no event exception
except Frustration — see the dedicated Frustration memory): Frustration, Return, Behemoth Bash,
Behemoth Blade, Dynamax Cannon, Secret Sword (Zacian/Zamazenta/Eternatus/Keldeo signature moves —
structurally the same "granted by form-change/catch, not by TM" category as Super Max "+" moves,
see `fact_super_max_extra_charged_move`), and Smeargle (moveset fixed at catch, cannot be TM'd at
all, ever). [community-consensus, Bulbapedia `Charged_TM`/`Elite_Charged_TM` raw wikitext, both
independently listing the same restricted set]

**On a Pokémon with TWO charged moves already, the player is prompted to choose WHICH of the two
gets targeted** before the TM applies (random outcome for regular, chosen outcome for Elite).
Fast moves never have this ambiguity — every Pokémon has exactly one fast-move slot, always.
[community-consensus, Bulbapedia `Charged_TM` raw wikitext verbatim: "If it has multiple Charged
Attacks, the player chooses which move to replace upon using the item."]

**Uniformity of the regular-TM random draw is explicitly NOT Niantic-confirmed, and is a live,
contested community question** — not settled trivia, a real open uncertainty. A GamePress Q&A
literally titled "Are Charged TMs Truly Random?" exists (page itself unreachable, whole domain
dead — see source catalog update); a Substack piece
(`pogojournal.substack.com/p/pokemon-gos-charged-tm-system-needs-an-overhaul`, fetched 2026-09-10)
quotes a reader claiming ~30 TMs spent chasing one outcome, and hedges its own uniformity
assumption ("as far as I know anyway"). The standard modeling assumption used by every
calculator/guide site is uniform-random over (pool minus current move), and this is the ONLY
practical assumption to build against — but it should be labeled an assumption anywhere it's
surfaced, not presented as a confirmed mechanic. [community-consensus for "uniform is the standard
assumption"; genuinely unresolved/contested for "uniform is actually true"]

**Obtaining regular TMs**: raid rewards, Trainer Battle rewards, event Field Research, GO Battle
League per-battle-set rewards, Special Research — plentiful, most active players hold many.
**Obtaining Elite TMs**: NEVER purchasable with stardust/candy (confirms existing memory). As of
GO Battle League Season 28 (confirmed live, started 2026-09-08 — same week as this research):
seasonal-research win-count milestones at 400 (Elite Fast) and 500 (Elite Charged) wins, OR
reaching ladder Rank 19 guarantees one of each by season's end, OR Community Day Boxes (~1,280
PokéCoins, real-money-adjacent), OR rare Route-completion rewards, OR occasional one-off
compensation/Special-Research grants. [community-consensus, WebSearch aggregate + Bulbapedia
`Elite_Fast_TM` raw wikitext cross-checked 2026-09-10; the 400/500 figures match this project's
pre-existing memory almost exactly, now dated to a specific live season]. **Genuinely scarce for a
typical player** — the free routes both require heavy PvP investment (hundreds of wins per season,
or high ladder rank); a casual roster owner plausibly has 0-3 on hand, matching the user's own
framing.

**No cost, cooldown, or per-day limit found on APPLYING an already-owned TM of any kind** — every
source checked either states or implies instant, free, repeatable application (multiple Bulbapedia
pages explicitly had nothing to report here, which given how thorough those pages are on every
other restriction is itself informative). [community-consensus by absence of contrary evidence]

Fed into `proposal_move_change_optimizer_candidates`. See also `fact_frustration_removal_event_gating`
(the one exception to "regular TM pool" above) and `fact_mega_moveset_inheritance` (whether a TM on
the base form affects the Mega form).
