---
name: fact-weather-boost-mechanic
description: Pokemon GO weather boost gives +20% damage to moves of matching type(s) and treats the Pokemon as +5 effective levels, applies in raids/gyms too — which types map to which weather
metadata:
  type: project
---

[community-consensus], researched 2026-09-05 via WebSearch (Pokémon GO Fandom wiki,
PogoWeather, Pokemon GO Hub, Switchblade Gaming, Hundo Hunter — all wiki/guide-tier,
no direct official Niantic blog post fetched this pass). No date conflict found across
sources; this has been stable mechanic for years.

- Attacks of the boosted type(s) deal 1.2x damage in gym/raid battles, AND the attacking
  Pokémon is treated as if it were +5 effective levels higher (affects its own stats, not
  just a flat damage multiplier — broader than `damage.ts`'s current
  `WEATHER_BOOST_MULTIPLIER = 1.2`, which only applies the damage-formula multiplier, not
  the level-treatment stat bump).
- Weather-to-type mapping: Sunny/Clear → Ground/Fire/Grass; Rainy → Water/Electric/Bug;
  Windy → Dragon/Flying/Psychic; Cloudy → Fairy; Fog → Dark/Ghost; Snow → Ice/Steel;
  Partly Cloudy → Normal/Rock.
- Applies based on **move type**, not the attacking Pokémon's own type — matches how
  `damage.ts`'s `weatherBoosted` flag is already scoped (per-move, not per-species).
- Applies to **both sides** — a raid boss with a weather-matching move also deals boosted
  damage to the player's party, not just the player's attacker to the boss.

**Why this matters:** if implemented, the "+5 effective levels" nuance means a naive
"just multiply damage by 1.2" implementation would under-model weather's real effect
(real weather also nudges the attacker's own effective stats, which matters more at low
levels where CPM curves are steep). Worth flagging to whoever implements
[[proposal_weather_scenario_assumption]] rather than silently doing the simpler thing.

**How to apply:** Cite this before proposing/building any weather feature. If a future
official Niantic source is found, replace this citation with it and upgrade the tier.
