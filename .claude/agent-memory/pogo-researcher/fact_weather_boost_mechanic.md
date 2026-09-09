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

**SUPERSEDED 2026-09-09 (round 4) on the "+5 effective levels" point specifically** — see
[[fact_weather_5_levels_is_catch_only]]. That was a misreading: the "+5 effective levels" is a
wild-spawn/raid-catch/GO-Rocket-catch encounter-level mechanic (affects the level, and therefore
CP, of a Pokémon when it spawns or is caught), NOT an in-battle stat effect on either the boss or
the attacker. In battle, real weather is fully and only the flat 1.2x move-power multiplier,
applied to both sides — which is exactly what this engine already implements. There is no
deferred/missing "level+5 stat bump" to build; `weather.ts`'s "KNOWN SIMPLIFICATION" comment
describing one is itself wrong and should be corrected (handed back, not fixed by this role).
The 1.2x-both-sides finding and the weather-to-type mapping table below remain correct.

**How to apply:** Cite [[fact_weather_5_levels_is_catch_only]] for the in-battle question; cite
this entry only for the weather-to-type mapping table. If a future official Niantic source is
found, replace this citation with it and upgrade the tier.
