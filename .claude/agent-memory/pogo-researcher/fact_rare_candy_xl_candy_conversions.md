---
name: fact-rare-candy-xl-candy-conversions
description: Exact conversion rules for Rare Candy, Rare Candy XL, and the regular-Candy-to-XL-Candy Convert button
metadata:
  type: project
---

Researched 2026-09-08 for a fixed-budget Power-Up Optimizer planner request (100k stardust /
N candy / 25 Rare Candy).

**Three separate conversion mechanics, do not merge them:**

1. **Rare Candy -> regular species Candy.** Strictly 1:1, deterministic, on use (tap the item,
   pick a species, choose a quantity via the game's +/- quantity selector — that selector is a
   UI convenience for doing N individual 1:1 conversions in one confirmation, not a batch
   ratio). No documented minimum/maximum batch size beyond how many you own. No trainer-level
   requirement to use plain Rare Candy. No species exclusion found — works on regionals, Ditto,
   Legendary/Mythical, everything. [community-consensus: Pokémon GO Hub "Rare Candy" guide,
   published/updated 2020-11-24, https://pokemongohub.net/post/guide/rare-candy/, corroborated by
   a 2026-09-08 WebSearch aggregate with no contrary results found]

2. **Rare Candy XL -> species XL Candy.** A wholly SEPARATE item (not a form of Rare Candy),
   1:1 to XL Candy for a chosen species on use, same "any species" scope as plain Rare Candy.
   Obtained via 3-star+ **in-person-only** raids (remote raids do not reward it), Trainer-level-up
   rewards from level 41 through 50 (1 per level 41-49, 2 at level 50), and Special Research.
   [community-consensus: Bulbapedia "Candy (GO)" page fetched 2026-09-08 for the 1:1-on-use fact;
   Gamerant "Pokemon GO: Guide to Rare Candy XL", published 2022-09-04,
   https://gamerant.com/pokemon-go-guide-rare-candy-xl/, for the acquisition-source list]

3. **Regular Candy -> XL Candy, the in-game "Convert" button.** Exactly 100 regular Candy -> 1
   XL Candy, deterministic (not random), no stated daily/weekly limit on how many times you can
   convert. Gated at **Trainer Level 31+** to hold/use XL Candy at all (lowered from the original
   Level 40 requirement in June 2022). [community-consensus: Pokémon GO Hub "XL Candy Guide",
   last updated 2026-08-27, https://pokemongohub.net/post/guide/xl-candy-guide-how-to-get-power-up-costs-and-mechanics/,
   corroborated by multiple independent 2026-09-08 WebSearch results agreeing on both the 100:1
   ratio and the Level 31 gate]

**No direct Rare-Candy-to-XL-Candy shortcut exists.** Plain Rare Candy only ever yields regular
Candy; getting XL Candy requires either actual Rare Candy XL (a separately-acquired item, see #2)
or routing regular Candy through the 100:1 Convert button (#3). A WebSearch synthesis pass on
2026-09-08 asserted "100 Rare Candy can be converted to 1 Rare Candy XL" as a fourth mechanic —
**this could NOT be corroborated** when the two underlying articles it cited (Dexerto 2023-07-28,
Gamerant 2022-09-04) were fetched directly; neither mentions any Rare-Candy-to-Rare-Candy-XL
conversion. Treat that specific claim as an unreliable, likely-hallucinated conflation of
mechanic #3 (100 regular Candy -> 1 XL Candy) — do not repeat it as fact without a real source.

See [[fact_trainer_level_powerup_cap]] for how the Level 31 XL gate above is actually the SAME
underlying rule as the power-up level cap, not a separate coincidence.

Fed into [[proposal_fixed_budget_powerup_planner]].
