---
name: fact-evolution-and-second-charge-move-costs
description: Evolution candy costs (12-400, species-specific, no stardust), evolution preserves level/IVs exactly, and second-charged-move unlock costs (buddy-distance-tiered stardust+candy) — all compete for the same budget the Power-Up Optimizer allocates
metadata:
  type: project
---

Researched 2026-09-08 for the multi-raid Power-Up Optimizer expansion (a 100-200 roster imported
from a Poke Genie CSV will contain many unevolved Pokémon).

**Evolution**: candy-only cost (no stardust), species-specific, ranges roughly 12 (Caterpie ->
Metapod) to 400 (Magikarp -> Gyarados, Meltan -> Melmetal); typical two-stage lines ~50, several
exceptions at 25 (Rattata, Alolan Rattata, Eevee, Sentret, Ledyba, etc.) [community-consensus,
Bulbapedia-derived figures via WebSearch aggregate 2026-09-08, individual per-species numbers not
independently spot-checked this pass]. **Evolving never changes level or IVs** — the evolved
form's base stats replace the pre-evolution base stats at the SAME level/IVs, which is why CP
usually jumps at evolution (new base stats, same CPM) [community-consensus, overwhelming and
uncontested across every CP-calculator source checked, no official Niantic statement located
but zero contrary evidence found either — treat as settled].

**No case found where powering up an unevolved Pokémon before evolving is mechanically
correct.** The power-up cost table (`powerUpCostTableFromGameMaster`) is universal across species
(no per-evolution-stage variant beyond the one known Eternatus override) — so stardust/candy
already spent power-up an unevolved mon are NOT wasted by evolving afterward (level/IV progress
carries over exactly). But the evolved form's higher base stats mean the SAME power-up step buys
strictly more team-DPS post-evolution than pre-evolution — so ranking an unevolved candidate for
power-up "as-is," without accounting for its pending evolution, systematically understates its
real value and can recommend a genuinely suboptimal purchase order on a roster with many
unevolved mons (exactly the roster shape this expansion introduces).

**Second charged-move unlock**: tiered by the family's OWN buddy-walking distance (not a flat
number): 1km-buddy families 10,000 stardust/25 candy, 3km 50,000/50, 5km 75,000/75, 20km
100,000/100; starters and baby Pokémon (except Toxel) are a flat 10,000/25 regardless of buddy
tier. Shadow multiplies both by 1.2x; **Purified multiplies both by 0.8x** — note this is a
DIFFERENT purified rate than the 0.9x this project's power-up cost table uses (see
`fact_rare_candy_xl_candy_conversions`/MECHANICS.md's "Power-up (level-up) costs" — do not
conflate the two Purified multipliers, they're genuinely different numbers for different actions).
A fixed list of species (Caterpie, Metapod, Weedle, Kakuna, Magikarp, Ditto, Wynaut, Wobbuffet,
Smeargle, Wurmple, Silcoon, Cascoon, Taillow, Feebas, Beldum, Kricketot) cannot learn a second
charged move at all unless Shadow or Purified. [community-consensus: Pokémon GO Fandom "List of
second Charged Attack cost", cross-referenced against Pokémon GO Hub and a 2026-09-08 WebSearch
aggregate; no official Niantic numeric table located].

**This draws on the SAME stardust+candy pool `optimizePowerUps`/`planPowerUpBudget` already
allocate**, and is currently entirely unmodelled — no field for it anywhere in `powerUp.ts` or
any `Scenario`. Often a much better team-DPS-per-stardust purchase than several power-up half-
levels, especially since it can unlock a strictly better moveset rather than just scaling an
existing one.

**Elite TM / move reroll, by contrast, does NOT compete for this same pool**: earned via GO
Battle League win milestones (400 wins for Elite Fast TM, 500 for Elite Charged TM), Community
Day event shop boxes (~1000 PokéCoins), or Special Research — never purchasable with stardust or
candy [community-consensus, WebSearch aggregate 2026-09-08, corroborated across GamingOnPhone,
Dot Esports, Pokémon GO Hub]. Regular (non-elite) Fast/Charged TMs are free to apply once owned.
So TM choice is a real competing PRIORITY for "what should this Pokémon's moveset be," but not a
literal budget competitor for this specific optimizer's stardust/candy pool.

Fed into the multi-raid-optimizer research response (2026-09-08). Recommended: (a) model —
flag/exclude unevolved-with-available-evolution candidates from power-up ranking, and add
second-charged-move unlock as a new candidate type sharing the existing stardust/candy pool.
Elite TM: (c) out of scope, different currency entirely.

**Update 2026-09-10**: confirmed structurally (not just "no table found") that this project's own
committed `data/raw/game_master.json` has exactly three top-level data keys — `pokemon`, `moves`,
`upgradeSettings` — and nothing else; `scripts/sync-data/fetchCache.ts`'s own fetch layer only
ever extracts `pokemonSettings`/`moveSettings`/`POKEMON_UPGRADE_SETTINGS`/`LUCKY_POKEMON_SETTINGS`
from the upstream dump. A WebSearch for the plausible upstream template name
(`CANDY_TO_UNLOCK_SECOND_MOVE_SETTINGS`) found no confirmation either — so the real template name
remains unconfirmed, not just unsynced. This is now the anchor fact behind the "no first-party
Niantic table found" line above: it isn't that nobody's looked, it's that this project's pipeline
was never built to look, and the exact field to look for isn't independently confirmed anywhere.
See `fact_tm_move_change_mechanics` (a sibling gap — TM item definitions are equally absent from
this same file) and `proposal_move_change_optimizer_candidates`.
