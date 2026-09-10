---
name: fact-frustration-removal-event-gating
description: Frustration (Shadow Pokemon's forced charged move) can NEVER be touched by any TM except during irregular "Taken Over" events (~quarterly); purification always works and is ungated; once changed, permanent
metadata:
  type: project
---

Researched 2026-09-10. Confirms and precision-refines the user's own stated understanding in a
move-change optimizer research request ("Shadow Pokemon know Frustration, and my understanding is
it can normally only be removed during specific events") — their premise was correct; here is the
exact mechanic.

**Frustration is a Shadow Pokémon's forced, catch-time charged move**, real stats confirmed
first-party from this project's own synced `data/raw/game_master.json` `moves` array: power 10 /
energyDelta -33 / durationMs 2000 — the weakest charged move in the game by a wide margin (compare
Return, its purified replacement: power 25 / energyDelta -33 / durationMs 500, same energy cost,
2.5x the power, 4x less time exposed to a dodge). [first-party for the two moves' own stats;
"weakest in the game" framing is community-consensus, Bulbapedia `Frustration_(move)` raw
wikitext]

**Neither a regular Charged TM nor an Elite Charged TM can normally reroll Frustration away — ONLY
during specific "Taken Over" (formerly "Team GO Rocket Takeover") branded events.** During one of
these windows, Frustration becomes a valid "current move" a Charged TM can target, and from there
behaves completely normally (regular TM = random reroll among the species' normal eligible pool;
Elite Charged TM = player's full choice, including legacy moves). Confirmed live and current via a
directly-fetched, dated real 2026 event page
(`pokemongohub.net/post/event/steeled-resolve-taken-over/`, event ran 2026-04-30 to 2026-05-04,
fetched 2026-09-10), verbatim: "You can use a Charged TM to help a Shadow Pokémon forget the
Charged Attack Frustration." A WebSearch aggregate lists 6 such events across 2025-2026 (Jan/Aug/
Sep 2025, Jan/Apr-May/Jun 2026 — NOT independently verified one-by-one, treat the exact list as
`[unverified]`, but the cadence pattern it implies is corroborated by the directly-fetched one) —
call this **roughly quarterly**, not "a handful of times a year" in the sense of being
rare-to-nonexistent; frequent enough to plan around but not always-available.
[community-consensus, cross-checked Bulbapedia `Frustration_(move)` + `Shadow_Pokémon_(GO)` raw
wikitext + a directly-fetched real event page + an official-adjacent `pokemon.com` strategy
article]

**Purification is a completely separate, ALWAYS-available route**: purifying a Shadow Pokémon
automatically replaces Frustration with Return in the SAME slot (first charged-move slot
specifically) — no event gating, no TM item spent, happens automatically as part of purifying.
[community-consensus, Bulbapedia `Shadow_Pokémon_(GO)` raw wikitext verbatim: "Learn Return,
replacing the Charged Attack in the first slot"]

**Once Frustration is replaced by either route, it is permanently gone** — cannot be relearned,
even by a later Elite Charged TM, even through evolution. [community-consensus, Bulbapedia,
multiple pages agree]

**Design implication**: a move-change optimizer candidate that says "TM this Shadow's Frustration
away" is only EXECUTABLE during an irregular, real-world-calendar-dependent event window — pricing
it as if always-actionable (the way a power-up always is) would misrepresent it. See
`proposal_move_change_optimizer_candidates` for how this could surface without adding a live-event
Scenario dependency.

See `fact_shadow_pokemon_stats` for the Shadow attack/defense multipliers this compounds with, and
`fact_tm_move_change_mechanics` for the general TM rules this is the one big exception to.
