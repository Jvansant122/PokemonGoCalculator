---
name: proposal-default-raid-tier-fallback
description: Research into fixing DEFAULT_REAL_RAID_TIER's single hardcoded "5-Star Raids" fallback for species not in today's live raid list
metadata:
  type: project
---

Researched 2026-09-06, requested by the user directly (not a routed feature ideation pass) —
`packages/engine/src/raidBoss.ts:99`'s `DEFAULT_REAL_RAID_TIER = "5-Star Raids"` fires whenever a
real species picked from the general species picker isn't in today's live
`data/normalized/activeRaids.json`, modeling e.g. a common Tier-1 species as a Legendary boss.

## What exists

- **pogoapi.net `raid_bosses.json`** [confirmed via direct fetch, 2026-09-06] — NOT currently
  synced by `scripts/sync-data.ts` (only `mega_pokemon.json` + ScrapedDuck's `raids.json` are
  fetched from live sources). Has `current` AND `previous` keys, each keyed by tier string
  ("1"/"2"/"3"/"4"/"5"/"6"/"ex"/"mega"/"mega_legendary"), each an array of `{name, id, tier, form,
  type, boosted_weather, possible_shiny, min/max_(un)boosted_cp}`. This is the closest thing to a
  per-species historical tier map this API family has — but "previous" appears to be a rolling
  recent-history window (rotation-scale), not a full multi-year archive back to 2017, and is
  compiled by the API maintainer, not Niantic.
- **pogoapi.net `raid_exclusive_pokemon.json`** [confirmed via direct fetch] — small, separate
  list (legendaries mostly: Articuno/Mewtwo/Kyogre in the sample fetched) with a `raid_level`
  field. Only covers Pokémon that are raid-exclusive (never wild/egg-obtainable), not general
  species, so it can't answer "what tier does this ordinary Pokémon appear at."
- **pogoapi.net `pokemon_rarity.json`** [confirmed to exist per documentation, not fetched for
  contents this pass] — Standard/Legendary/Mythic classification per species. Also not currently
  synced.
- **ScrapedDuck itself** [confirmed via GitHub search] — scrapes LeekDuck's *current* state only;
  no historical/archival endpoint found in the repo.
- **Bulbapedia/GamePress static tier-class list**: not separately searched this pass beyond the
  rarity classification above, which functionally serves the same purpose (Standard/Legendary/
  Mythic is the community's own coarse tier-class vocabulary).

## Does a single static per-species tier make sense?

**No, not perfectly** [community-consensus, general knowledge, not re-verified with specific dated
citations this pass] — species genuinely rotate tiers over time: pseudo-legendaries move between
Tier-3 and Mega-tier as their mega form releases; some legendaries get demoted to Tier-3 "raid
day" events later in their lifecycle. A per-species lookup can only ever be "most recently known"
tier, not a guarantee of current behavior — must be documented as such, same honesty precedent as
the existing constant's own comment.

## Recommendation

Two tiers of fix, both **new data-sync work**, not purely engine-side:

1. **Cheap, immediate**: sync `pokemon_rarity.json` (new endpoint fetch) and use
   Standard->"3-Star Raids", Legendary->"5-Star Raids", Mythic->pass through unclassified (mythicals
   aren't traditionally raid content) as a per-species-class default, replacing the single global
   constant. Mega/primal species already carry `species.boost` — branch those to a mega-tier label
   separately. Far more defensible than today's blanket 5-star assumption for the common case
   (most species are Standard-tier, not Legendary).
2. **More accurate, heavier**: sync `raid_bosses.json`'s `current`+`previous` and build a real
   per-species "most recently seen tier" map at sync time, falling back to (1)'s classification
   only for species `raid_bosses.json` has never listed at all.

Either way this is a `data-sync` task (new endpoint, new normalized field) escalated to
`engine-developer` for the `DEFAULT_REAL_RAID_TIER` consumption-site change — not something I can
route around purely in engine logic, since no per-species tier data exists in this repo today.

## Sources
- https://pogoapi.net/documentation/ (fetched 2026-09-06) — full endpoint list, confirms
  `raid_bosses.json`, `raid_exclusive_pokemon.json`, `pokemon_rarity.json` all exist and are
  unused by this project's sync script today.
- https://pogoapi.net/api/v1/raid_bosses.json (fetched 2026-09-06) — live shape confirmed directly.
- https://pogoapi.net/api/v1/raid_exclusive_pokemon.json (fetched 2026-09-06) — live shape
  confirmed directly; note the field range claimed by a search-result summary ("1-4") did not
  match the live fetch (all sampled entries showed `raid_level: 5`) — trust the direct fetch, flag
  the summary as unreliable for this specific field.
- https://chewett.co.uk/blog/2618/pokemon-go-api-raid-bosses-api/ (third-party blog, fetched
  2026-09-06) — confirms `raid_bosses.json` covers current+previous, updates within ~24h of a
  rotation change; doesn't claim a full historical archive back to game launch.
- https://github.com/bigfoott/ScrapedDuck (fetched 2026-09-06) — repo description/README, no
  historical-archive endpoint found.
