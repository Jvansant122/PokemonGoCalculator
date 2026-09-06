---
name: fact-cpm-table-levels-41-50
description: Real CPM values for Pokemon levels 40.5-50, sourcing tier, and the level-cap caveats (max Pokemon level stays 50 even after 2025 trainer-cap-to-80 change)
metadata:
  type: project
---

Researched 2026-09-06 for a proposed `CPM_TABLE` extension (levels 41-50) in `packages/engine/src/cpm.ts`, requested by the user/overseer directly (not a self-initiated proposal). Handed back as a data report only — did not implement.

**CORRECTED 2026-09-06 by the overseer** after this file's original WebFetch-sourced values turned out subtly wrong on cross-check. The overseer downloaded the raw `PokeMiners/game_masters` `latest.json` (~19MB, the actual current live GAME_MASTER dump extracted straight from Niantic's servers — the ground-truth source basically every other CPM table, including pogoapi.net's, is itself derived from) and read `PLAYER_LEVEL_SETTINGS.playerLevel.cpMultiplier` directly with `JSON.parse`, no LLM summarization in the loop. Two things the original pass got wrong:
1. **pogoapi.net's `cp_multiplier.json` is stale and truncated** — its `Last-Modified` header reads 2022-09-19, and it only contains entries through **level 45**, not 50. The original pass's claim that pogoapi.net "cross-verified" whole levels 46-50 was wrong; that data was never in pogoapi.net's live response at all.
2. **The formula-derived half-level digits were off in the 6th-7th significant figure** (e.g. reported `40.5: 0.79280394` vs. the value the raw whole-level data actually yields via the same sqrt-average formula, `0.7928039417157309`) — small, but this project cares about exact floor-rounding behavior, so "close" isn't good enough for a table other code divides/floors against.

## Values (whole levels, DIRECT from the raw GAME_MASTER array, index-verified against this project's own existing 1-40 entries which match exactly)
41: 0.7953, 42: 0.8003, 43: 0.8053, 44: 0.8103, 45: 0.8153,
46: 0.8203, 47: 0.8253, 48: 0.8303, 49: 0.8353, 50: 0.8403

These are clean (no float32-tail noise) in the raw PokeMiners dump itself — the "...0001"/"...9999" tails other sites report for these same levels are an artifact of THEIR extraction/serialization pipeline, not present in the source. Formula: whole-level CPM(L) = 0.7903 + 0.005*(L-40) for L=41..50 — confirmed exactly against the raw array, not just inferred.

**Genuinely interesting, not acted on**: the raw array continues past 50 with real (non-repeated) values through level 54 (51: 0.8453, 52: 0.8503, 53: 0.8553, 54: 0.8603) before flatlining at a constant 0.8653 from level 55 through the array's end (80) — a classic "padded past the real cap" pattern. This arguably means the GAME_MASTER data structure itself doesn't hard-stop at 50 the way the "max Pokemon level is 50" community claim (and Niantic's own Oct-2025 blog post, which only speaks to Trainer level) implies. Not investigated further since the user's actual request was levels 35-50, not 51-54 — flagging here in case a future session wonders whether 51+ is meaningfully reachable in live gameplay (unresolved; the flat plateau at 55+ is the only strong signal either way, and it's silent on 51-54 specifically).

## Values (half levels, DERIVED from the verified whole-level values above via the confirmed formula)
40.5: 0.7928039417157309, 41.5: 0.7978039170121942, 42.5: 0.8028038926163724, 43.5: 0.8078038685225517,
44.5: 0.8128038447251588, 45.5: 0.8178038212187566, 46.5: 0.8228037979980404, 47.5: 0.8278037750578334,
48.5: 0.8328037523930834, 49.5: 0.8378037299988584

Half-level formula: CPM(n+0.5) = sqrt((CPM(n)^2 + CPM(n+1)^2)/2) — same formula the original pass proposed, now applied to the verified raw whole-level inputs rather than to values transcribed off a rendered web page. Reproduces this codebase's own already-pinned `39.5: 0.7874736075` entry to 8 significant figures (`0.7874735905949481`) when run against the raw `39`/`40` values — as close a validation as this formula-vs.-pinned-data check can get, and the basis for trusting it here too.

## Caveat: don't add 50.5 or 51
Some CPM list dumps (pokemongohub `/post/article/.../cpm-list/`) include entries for 50.5 (0.84279999) and 51 (0.84529999, flagged with a "?" in the wiki version). **Do not add these.** Confirmed via Niantic's own official blog (pokemongo.com/post/pgo-leveling-update-details-2025, announcing the Oct 15 2025 trainer-level-cap raise from 50 to 80): "This level cap increase only affects Trainer level and not Pokémon." Max Pokemon power-up level has stayed 50 continuously since GO Beyond (Nov 2020) through today (2026-09-06), independent of trainer level cap changes. The 50.5/51 GAME_MASTER entries are inert leftovers, not reachable in live gameplay.

## Caveat: how levels 41-50 are actually reached
- Requires **Trainer Level 40** first (Trainer's own level, via XP/tasks — trainer leveling 41-50 needs Niantic's task-based system, not pure XP grind, per community guides at thegamer.com/gamesradar.com, [community-consensus]).
- Then each individual Pokemon is powered up **41->50 with Stardust + Candy XL**, same power-up UI as levels 1-40, not tied to Best Buddy or Special Research. Total 40->50 cost for a standard Pokemon: 296 XL Candy + 250,000 Stardust (Purified: 272 XL; Shadow: 360 XL) — [community-consensus], gamepur.com/pokemongohub.net XL Candy guide.
- XL Candy has been obtainable starting at Trainer Level 31 since a June 2022 change (originally required Trainer Level 40) — [community-consensus].
- Applies uniformly regardless of catch method (wild/raid/hatch) — cost/cap depends only on Shadow/Purified/normal status, not how the Pokemon was obtained.
- Best Buddy CP boost is a separate, unrelated +1-level-equivalent stat bonus that stacks on top of whatever level the Pokemon is powered to — don't conflate with the 41-50 power-up system itself (see [[fact_friendship_raid_scope_nuance]]).

## Source-reliability note for future research
WebFetch's page-summarization step introduces small transcription/rounding noise in exact many-digit numeric tables (observed: pogoapi.net's raw JSON came back with half-level digits differing from pokemongohub's in the 6th decimal on a single WebFetch pass). Don't trust a single WebFetch pass for many-digit precision data — cross-validate either against a second independent fetch or, ideally, against a known formula/identity from the existing codebase (as done here via the sqrt-average half-level check against the already-trusted 39.5 entry).
