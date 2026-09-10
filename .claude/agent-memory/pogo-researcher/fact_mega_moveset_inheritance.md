---
name: fact-mega-moveset-inheritance
description: Mega/Primal forms have NO separate movepool in GAME_MASTER — tempEvoOverrides carries only stats/type/mega-energy, never quickMoves/cinematicMoves; a mega inherits whatever fast/charged move the underlying Pokemon currently knows
metadata:
  type: project
---

Researched 2026-09-10 for the move-change-optimizer design (does TMing the base form change what
the Mega form uses?). Direct first-party structural evidence, not previously recorded.

**`tempEvoOverrides` entries in `data/raw/game_master.json`'s `pokemon` array carry ONLY
`baseAttack`/`baseDefense`/`baseStamina`/`typeOverride1`/`typeOverride2`/`hasTypeOverride`/
`firstTimeMegaEnergyRequired`/`megaEnergyRequired`** — confirmed by reading two full species
entries directly (Blaziken, Rayquaza), both with populated `tempEvoOverrides.TEMP_EVOLUTION_MEGA`
blocks. Neither carries its own `quickMoves`/`cinematicMoves`/`eliteQuickMoves`/
`eliteCinematicMoves` — those fields exist only once, at the base `pokemonSettings` template
level, and a mega/primal form has no template of its own distinct from the base species' (the
"Mega X" a player owns is a temporary transformation flag on the SAME underlying Pokémon object,
not a second stored Pokémon). [first-party, `data/raw/game_master.json`, read directly 2026-09-10]

**Community-level corroboration of the gameplay consequence** (first-party proves the DATA has no
separate movepool; this confirms what that means for a specific individual Pokémon's CURRENT
move): a Mega-Evolved Pokémon keeps whatever fast/charged move it already had before Mega
Evolving, and TMing it (in or out of Mega form) changes the same underlying moveset either way —
there is no separate "Mega moveset" to independently manage. [community-consensus, WebSearch
aggregate 2026-09-10, no contrary source found]

**One structurally distinct exception, NOT a counter-example**: Super Max "+" moves are granted BY
Mega Evolving (at Mega Level 3+) as an ADDITIVE bonus move layered on top, hand-curated in
`scripts/sync-data/superMaxPlusMoves.ts`, never present in `cinematicMoves`/`eliteCinematicMoves`
and never TM-able in either direction — see `fact_super_max_extra_charged_move`. This doesn't
contradict the "no separate mega movepool" finding; it's a different mechanism entirely (a
temporary bonus slot, not a moveset entry).

**Design implication**: a move-change candidate priced against a species with a Mega form should
be computed once, against the underlying Pokémon's moveset — never duplicated as a "base form"
candidate and a "mega form" candidate, since TMing one IS TMing the other.
