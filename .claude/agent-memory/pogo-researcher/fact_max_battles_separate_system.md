---
name: fact-max-battles-separate-system
description: Max Battles (Dynamax/Gigantamax) are real, live Pokemon GO content since Oct 2024 and are structurally NOT the standard raid model — must be excluded from any raid-boss sweep, never approximated
metadata:
  type: project
---

Researched 2026-09-08. I initially assumed (wrongly) that Dynamax/Gigantamax might not exist in
Pokémon GO at all, since it's core-series terminology — checked rather than asserted. **They are
real, live content**, introduced in the "GO Bigger" event, October 2024. [first-party: Niantic's
own https://pokemongo.com/max-pokemon-battle and Helpshift FAQ pages ("What are Max Pokémon?",
"Max Battles and Catching Max Pokémon"), corroborated via WebFetch of the max-pokemon-battle page
2026-09-08].

**Max Battles are a genuinely separate battle system, not a raid variant**:
- Take place at **Power Spots**, not Gyms.
- Only Dynamax/Gigantamax-flagged Pokémon can be fielded as the boss — not an ordinary raid
  roster species.
- Requires a consumable **Max Particles** resource to enter (separate from Raid Passes).
- Up to 4 trainers per battle instance for standard Max Battles; up to 40 trainers split into
  groups of 4 for Gigantamax bosses.
- Combat has fast/charged attacks AS USUAL but adds a filling "meter" that triggers a temporary
  3-turn Dynamax/Gigantamax transformation with access to a **Max Move**, plus mid-battle
  "cheering" mechanics when a trainer's own Pokémon faints.
- No `RaidTier`-shaped HP/attack-defense-multiplier table applies at all — this isn't a boss with
  a bigger number, it's a different combat loop.

**Implication, stated plainly**: this engine's standard raid model (fixed boss HP/multiplier per
tier, fast+charged move exchange, one active Pokémon at a time) cannot validly represent a Max
Battle even approximately. Any pipeline that builds "the N most recent raid bosses" must filter
Max Battle content out at the DATA layer, not attempt to map it onto the nearest `RaidTier`.

Fed into the multi-raid-optimizer research response (2026-09-08). Recommended: out of scope,
permanently, for this engine's raid model — not a "not yet modelled" gap to schedule, a
structural mismatch to exclude.
