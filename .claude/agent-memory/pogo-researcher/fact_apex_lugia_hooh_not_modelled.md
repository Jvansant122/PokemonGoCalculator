---
name: fact-apex-lugia-hooh-not-modelled
description: Apex Shadow Lugia/Ho-Oh's boosted Aeroblast+/++ and Sacred Fire+/++ moves (real GAME_MASTER templates, GO Tour Johto) have no corresponding species form or move assignment anywhere in this repo's data pipeline — an Apex-tagged Lugia/Ho-Oh would silently fall back to the ordinary 180/120-power move
metadata:
  type: project
---

Researched 2026-09-09, round 3, as a side-check while verifying the Super Max "+" move claim
(see [[fact-super-max-extra-charged-move]]) — same shape of content gap, different mechanism.

## What's real (confirmed via this repo's own cached GAME_MASTER)

`data/raw/game_master.json` (the exact file `sync-data.ts` consumes) contains real move templates
`AEROBLAST_PLUS` (200 power), `AEROBLAST_PLUS_PLUS` (225 power), `SACRED_FIRE_PLUS` (135 power),
`SACRED_FIRE_PLUS_PLUS` (155 power) — the Apex Shadow Lugia/Ho-Oh exclusive moves from GO Tour
Johto. These are genuine COMBAT_V0001 templates, not fabricated.

## What's NOT in the data at any layer

- `data/normalized/species.json` has no Apex-form entry for Lugia or Ho-Oh at all — no
  `lugia-apex`/`ho-oh-apex` id, no species whose `chargedMoves` includes any `_PLUS` variant.
  (The only `_PLUS`-family ids anywhere in the 2 Lugia/Ho-Oh entries — normal + shadow, 4 entries
  total — are absent; both just carry plain `AEROBLAST` at 180 / `SACRED_FIRE` at 120.)
- The raw `game_master.json` has no `pokemonSettings` template referencing `AEROBLAST_PLUS` or
  `AEROBLAST_PLUS_PLUS` as a quick/cinematic/elite move for any `pokemonId`, and no
  `LUGIA_APEX`/`HO_OH_APEX`-style form template exists in the dump at all. So this isn't a
  matching bug in `scripts/sync-data/` — there's no species-level template to match in the first
  place. The Apex designation and its exclusive move appear to be assigned purely at the
  raid-encounter level (server-side/event-specific), same underlying pattern as the Super Max "+"
  moves: real content that exists in the move-template layer but was never surfaced as a
  species/form-level GAME_MASTER entry.
- No `.ts` file in `scripts/sync-data/` or `packages/engine/src/` mentions "apex" (grepped
  case-insensitive, zero hits in both).

## Practical consequence (not a proposal — read-only finding per role boundary)

If a user ever wanted to model "Apex Shadow Lugia" or "Apex Shadow Ho-Oh" in this tool, there is
no way to select that form today — only ordinary Shadow Lugia/Shadow Ho-Oh exist, and their
Aeroblast/Sacred Fire moves are the un-boosted 180/120 power versions, not the Apex 200/225 or
135/155 variants. This under-counts those two specific historical-event Pokémon's true ceiling
DPS/TDO if used as an attacker, structurally identical to the Super Max "+"-move gap. Given Apex
Lugia/Ho-Oh were a one-time GO Tour Johto (2024) research-reward/raid encounter rather than
current standard-raid content, this is likely low real-world priority relative to the Super Max
gap — flagging for completeness, not urgency.

## Sources
- This repo's own `data/raw/game_master.json` (grepped directly, 2026-09-09) — primary,
  already-synced data, not a separate fetch.
- Cross-corroborated by an independently-fetched full raw GAME_MASTER dump (19.5MB
  `raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json`, fetched
  2026-09-09 by a separate pass this session) — same four move templates, same powers.
