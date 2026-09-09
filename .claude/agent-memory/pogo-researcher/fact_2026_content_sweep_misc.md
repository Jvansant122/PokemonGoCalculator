---
name: fact-2026-content-sweep-misc
description: Roundup of smaller confirmations from the 2026-09-09 content-sweep pass — Mega Staraptor upcoming (not yet live), Mega Garchomp Z is Legends Z-A only (NOT Pokemon GO, a near-miss caught), GBL move rebalances are power/energy tuning only (no structural change, auto-syncs fine), level cap and 1.3/1.1 mega boost split both reverified unchanged
metadata:
  type: project
---

Researched 2026-09-09, overnight content-sweep pass. Smaller items bundled into one file since
each is a quick confirmation, not a deep finding.

## Mega Staraptor — announced, NOT yet released as of today (2026-09-09)

"Staraptor Super Mega Raid Day," Saturday **September 19, 2026**, 2-5pm local — Mega Staraptor's
Pokémon GO debut, gets "Brave Bird+" (150 power in raid battles) at Super Max Level.
[official, first-party: pokemongo.com/news/staraptor-super-mega-raid-day-2026, fetched 2026-09-09]
**Do not add to `RELEASED_MEGA_PRIMAL_ALLOWLIST` yet** — per this project's own allowlist-entry
discipline ("never speculatively; GAME_MASTER lists unreleased forms too"), an announced-but-not-
yet-happened event is not yet "released, real content." Revisit after 2026-09-19. Also worth
noting for `check-mega-gaps`/`check-mega-gates`: Staraptor is a very plausible candidate to
reproduce the exact Skarmory/Mewtwo-Y failure mode (one-day debut, may not immediately land in
pogoapi's roster or stay in raid rotation) — flag for a fast follow-up allowlist entry once a real
raid-day observation or Bulbapedia debut citation exists.

## Mega Garchomp Z — a near-miss: this is Pokémon LEGENDS: Z-A content, NOT Pokémon GO

Multiple lower-tier DB sites (dittobase, pokemongohub's `db.` subdomain) have populated pages for
"Mega Garchomp Z" with Pokémon-GO-shaped stats/CP/counters — but the actual debut context, cross-
checked directly, is the **Pokémon Legends: Z-A "Mega Dimension" DLC** (revealed at the Pokémon
Presents livestream, Pokémon Day, **2026-02-27**), reached via a Mystery Gift hyperspace-distortion
encounter in that Switch game, not Pokémon GO at all. [official-adjacent: animenewsnetwork.com and
pokemon.com/us/pokemon-news/mega-garchomp-z-comes-to-pokemon-legends-z-a-mega-dimension, both
fetched 2026-09-09, both describing Legends Z-A specifically]. Regular (non-Z) Mega Garchomp IS
real Pokémon GO content (debuted 2023-11-11, long since ordinary roster content, not a gap).
**Do not add "Mega Garchomp Z" to the allowlist** — this is exactly the "GAME_MASTER/community-DB
lists unreleased-in-GO forms too" trap CLAUDE.md's allowlist doc comment warns about, caught before
acting on it. If `check-mega-gaps.ts`'s Bulbapedia diff ever flags "Garchomp Z" as missing, that's
a false positive to investigate, not an auto-add.

## Move rebalances in 2025-2026 — power/energy tuning only, nothing structural found

Two GBL seasons with named rebalances this year: **"Memories in Motion"** (2026-03-03 to
2026-06-02) and **"Twilight Trails"** (began 2026-09-08, i.e. yesterday relative to this research).
[community-consensus: pokemongohub.net's "GBL Season 25/26 Move Rebalance" articles, fetched via
WebSearch summary 2026-09-09 — not independently re-fetched verbatim this session, treat the exact
per-move numbers as unconfirmed pending a direct fetch].
- Memories in Motion: Wing Attack energy-gain restored upward, Bullet Punch/Mud Slap/Smack Down
  damage reduced, Aerial Ace energy cost raised, Volt Tackle energy cost lowered, Twister changed.
- Twilight Trails: buffs to underused moves (Take Down, Infestation, Brine, Bulldoze, Draining
  Kiss) and adjustments to established ones (Bite, Shadow Ball, Rage Fist); **30+ Pokémon gained
  NEW moves onto their moveset**, e.g. Volt Tackle for (Alolan) Raichu, Sacred Sword for Gallade,
  Drill Run for Skarmory, Earth Power for Lugia.
- **None of this is structurally new** — every change is a power/energy/duration number on an
  existing move type, or a new (move, species) moveset pairing using moves that already exist in
  this engine's move schema. Both categories sync automatically via the live GAME_MASTER dump per
  CLAUDE.md's description of `data-sync`'s primary source — no engine code change implied. Contrast
  with the genuinely structural finds this same session ([[fact-super-mega-raid-shield-enrage-
  mechanic]], [[fact-super-max-extra-charged-move]]), which add a new MECHANIC, not just new
  numbers on the existing damage formula.

## Level cap and CPM table — reverified unchanged

Trainer level cap raised 50->80 on **2025-10-15**, explicitly Trainer-level only
[official: pokemon.com "Level Up Your Game with Pokémon GO's New Leveling System", re-confirmed
via WebSearch 2026-09-09]. Pokémon power-up level cap remains 50, unchanged — consistent with the
already-recorded, more deeply-sourced [[fact-cpm-table-levels-41-50]] (no new evidence found this
session that would change that file's conclusions; this is a light reverification, not a new
derivation).

## 1.3/1.1 mega boost split — reverified unchanged, and confirmed this engine already models it

WebSearch this session surfaced (dittobase, fandom-mirror-of-Bulbapedia) the SAME 1.3x
(type-matching moves) / 1.1x (all other ally moves) split already recorded in this project's own
[[fact-mega-boost-other-trainers-not-own-party]] history and, checked directly this session,
**already fully implemented** in `packages/engine/src/uptime.ts`
(`DEFAULT_MEGA_BOOST_MULTIPLIER = 1.3`, `OFF_TYPE_MEGA_BOOST_MULTIPLIER = 1.1`, applied via
`ownBoostMultiplier(boost, moveType)` in comparison.ts/teamRaid.ts/powerUp.ts). **No gap, no stale
number — this was a reverification, not a new finding.** No source found anywhere this session
suggesting either value has changed in 2026; the Mega Level/Super Max system explicitly leaves
both untouched (see [[fact-mega-level-system-2026-update]]).

## Sources
All fetched/searched 2026-09-09: pokemongo.com/news/staraptor-super-mega-raid-day-2026;
animenewsnetwork.com Feb 2026 Legends Z-A article; pokemon.com's Mega Garchomp Z Legends article;
pokemongohub.net's Season 25/26 move-rebalance articles (WebSearch summary only, not re-fetched
verbatim); pokemon.com's Oct 2025 leveling-update post (re-confirmed via WebSearch); direct repo
reads of packages/engine/src/uptime.ts and MECHANICS.md.
