---
name: fact-trainer-level-powerup-cap
description: The real Trainer-Level-to-Pokemon-power-up-level cap formula (min(trainerLevel+10, 50)), and stale/wrong numbers to discard
metadata:
  type: project
---

Researched 2026-09-08. **A Pokémon cannot be powered up past `min(TrainerLevel + 10, 50)`.**
This is currently unmodelled anywhere in this engine (`packages/engine/src/powerUp.ts` and the
Power-Up Optimizer have no trainer-level concept at all as of 2026-09-08) and matters a lot for
any budget planner that recommends a target level — recommending level 50 to a level-30 trainer
is currently possible and would be real-mechanically wrong advice (a level-30 trainer caps at
exactly level 40, per this formula).

**Source chain** (no single official Niantic patch note states the formula in so many words —
this is [community-consensus], not [confirmed]):
- Bulbapedia's "Power up" page RAW WIKITEXT (fetched directly via the `action=raw` endpoint on
  2026-09-08, bypassing WebFetch's AI-summary layer, which on an earlier pass in this same
  research session produced a spurious "+2, up to level 40" figure that turned out to be an
  apparent conflation with a completely different formula on the same page — the TRADE received-
  Pokémon-level formula, `min(TrainerLevel + 2, floor(OriginalLevel))`. The raw wikitext's
  `==Mechanics==` section states, verbatim: "Each power-up increases the level by 0.5, up to the
  player's Trainer level + 10.") — https://bulbapedia.bulbagarden.net/wiki/Power_up
- A separate 2026-09-08 WebSearch aggregate independently produced the same "+10" figure with a
  matching worked example (Trainer level 35 -> Pokémon cap level 45), with no shared wording to
  the Bulbapedia fetch (different query, different underlying pages).
- Niantic's own official blog on the 2025-10-15 Trainer-Level-cap-to-80 rebalance
  (https://pokemongo.com/post/pgo-leveling-update-details-2025/?hl=en, and LeekDuck's companion
  piece https://leekduck.com/posts/pokemon-go-level-cap-increase-80/, published 2025-08-25) states
  the update does NOT change Pokémon leveling mechanics at all, and specifically that "you will
  still need to be Level 40 to power up Pokémon to Level 50" — which is exactly what
  `min(40+10, 50) = 50` predicts. This is the one piece of this chain that IS first-party
  (official Niantic), though it only confirms the boundary case, not the general formula.

**Internal consistency check (not itself a citation, but a strong reason to trust the above):**
the "+10, capped at 50" formula and the separately-sourced "Trainer Level 31+ needed to hold/use
XL Candy" rule ([[fact_rare_candy_xl_candy_conversions]]) are actually the SAME underlying
mechanic viewed two ways, not two independent facts that happen to agree: a Trainer Level 30
Pokémon cap of exactly 40 lets you reach the last regular-Candy step (39.5->40) but not the first
XL-costing step (40->40.5, since `xlCandyMinPokemonLevel: 40` per GAME_MASTER); Trainer Level 31
raises the cap to 41, which is the first level at which that XL step becomes reachable at all.
This is why XL Candy's real-world level gate is 31, not 30 or 40 — it falls straight out of the
+10 formula once you actually try to use XL Candy for the first time.

**Numbers found and explicitly REJECTED after direct verification** (recorded so they aren't
re-surfaced as fact in a future pass): "Trainer level + 2, up to level 40" (an apparent
conflation with the Trade-received-level formula, not present in the raw wikitext's Mechanics
section) and "Trainer level + 1.5" (from a GamePress URL that 404'd on direct fetch in this
session — likely stale/pre-Dec-2020 content describing the original Level-40-cap era, before
Pokémon level 50 and XL Candy existed at all, never re-verified against the current page).

Fed into [[proposal_fixed_budget_powerup_planner]].
