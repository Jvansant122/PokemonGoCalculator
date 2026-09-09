---
name: fact-super-max-extra-charged-move
description: A Pokemon that reaches Super Max Level unlocks a THIRD/extra Charged Attack while Mega Evolved, confirmed usable in raid battles with its own raid-specific power number, confirmed NOT usable against Gym defenders — a real per-species moveset addition this engine's SpeciesDefinition has no field for. Independently re-verified 2026-09-09 (round 3) against a skeptical prior — claim holds.
metadata:
  type: project
---

## VERIFIED 2026-09-09 (round 3, adversarial re-check)

A later same-session pass treated this file's claim as unproven and re-fetched both official
URLs directly via WebFetch (page-content extraction, not WebSearch index summaries) specifically
to quote verbatim text rather than trust an earlier paraphrase. Result: **claim confirmed, not
retracted.**

- `pokemongo.com/en/news/more-mega-updates-2026`, re-fetched 2026-09-09: verbatim quote "Beginning
  now, Pokémon that can reach Super Max Level will have an additional Charged Attack while Mega
  Evolved!" Full species list re-extracted and matches the 13 species below **exactly**, same
  move names. Gym-restriction sentence reconfirmed verbatim: "At this time, Pokémon won't be able
  to use the additional Charged Attack in Gym battles against Pokémon defending a Gym." GBL
  sentence reconfirmed: "Pokémon will be able to use the additional Charged Attacks in the GO
  Battle League."
- `pokemongo.com/news/staraptor-super-mega-raid-day-2026`, re-fetched 2026-09-09: verbatim quote
  "Staraptor will now be able to use an additional Charged Attack, Brave Bird+, when it's Mega
  Evolved," with an explicit two-context power breakdown: "Trainer Battles: 70 power and decreases
  the user's Defense by three stages" / "Raid Battles: 150 power." The raid figure from the
  original pass is reconfirmed verbatim, not a garbled/hallucinated number.
- **GAME_MASTER cross-check, independently re-run**: grepped this repo's own cached
  `data/raw/game_master.json` (the exact file `sync-data.ts` consumes) for all 13 species' "+"
  move IDs (`BRAVE_BIRD_PLUS`, `SEED_BOMB_PLUS`, `MYSTICAL_FIRE_PLUS`, `SURF_PLUS`,
  `VOLT_TACKLE_PLUS`, `ZAP_CANNON_PLUS`, `DRILL_PECK_PLUS`, `BRICK_BREAK_PLUS`,
  `LIQUIDATION_PLUS`, `ACID_SPRAY_PLUS`, `PSYBEAM_PLUS`, `OUTRAGE_PLUS`, `DYNAMIC_PUNCH_PLUS`,
  `FUTURE_SIGHT_PLUS`): **zero matches**, corroborating a separately-gathered raw full-dump fetch
  (19.5MB `latest.json` from PokeMiners, fetched independently 2026-09-09) that found the only
  `_PLUS`/`_PLUS_PLUS`-suffixed `movementId`s in all 403 move templates are `AEROBLAST_PLUS`(200)/
  `AEROBLAST_PLUS_PLUS`(225) and `SACRED_FIRE_PLUS`(135)/`SACRED_FIRE_PLUS_PLUS`(155) — the
  unrelated Apex Lugia/Ho-Oh moves, not any Super Max "+" move. **Verdict: (a)** — the mechanic
  and the Staraptor power number are both real, official content; the "+" moves genuinely do not
  exist as distinct move templates in GAME_MASTER at all (client/server-side raid- and
  GBL-context logic only), which is exactly what makes this a real, currently-uncloseable content
  gap rather than something `data-sync` could pick up on the next sync.
- Caveat carried forward honestly: WebFetch fetches the real page and extracts via a small model,
  which is a materially different (more reliable) path than WebSearch's index-snippet summaries,
  but it is still model-mediated extraction, not a byte-for-byte HTML read. Two independent
  fetches across two different sessions/passes produced identical verbatim quotes and an
  identical 13-species list, which is the strongest corroboration available without a raw-HTML
  tool.

Researched 2026-09-09, overnight content-sweep pass, question 2 (structural move changes).
Debuted with the Mega Level "Super Max" tier (see [[fact-mega-level-system-2026-update]]) but the
move-unlock detail wasn't captured in that earlier pass — this is new.

## The mechanic

A Pokémon that can reach Super Max Level gets **one additional Charged Attack, usable only while
Mega Evolved**, on top of its normal fast + up-to-2-charged-move kit. Its power scales up further
as the Pokémon's own Mega Level rises (Base -> High -> Max -> Super Max).
[**official, first-party**: pokemongo.com/en/news/more-mega-updates-2026, fetched 2026-09-09;
corroborated by leekduck.com/gofest/mega-updates/ and pokemongohub.net's companion article, both
fetched 2026-09-09, both quoting the identical restriction sentence verbatim — high-confidence,
not independently-worded paraphrases].

- **Confirmed usable in GO Battle League.** [official, same source]
- **Confirmed NOT usable "in Gym battles against Pokémon defending a Gym."** [official, same
  source, exact quote, corroborated verbatim by 2 community mirrors]
- **Raid usability: CONFIRMED usable, with its own raid-specific power value.** The companion
  announcement for Mega Staraptor's Sept 19 2026 debut states its new move "Brave Bird+" is
  "150 power in raid battles" [official, first-party: pokemongo.com/news/staraptor-super-mega-
  raid-day-2026, fetched 2026-09-09] — a raid-context power number would not be stated if the
  move were inapplicable in raids. This resolves what looked like an open question earlier in
  this same research pass (the Gym/GBL sentence never mentions raids by name) — raids are a third,
  separately-confirmed-valid context.
- **13 species confirmed with a named "+" move so far** (all already real, released content, all
  already present in this project's `RELEASED_MEGA_PRIMAL_ALLOWLIST` except Staraptor, not yet
  live as of today — see companion memory [[fact-mega-staraptor-upcoming]]):
  Mega Chesnaught (Seed Bomb+), Mega Delphox (Mystical Fire+), Mega Greninja (Surf+), Mega Raichu
  X (Volt Tackle+), Mega Raichu Y (Zap Cannon+), Mega Skarmory (Drill Peck+), Mega Falinks (Brick
  Break+), Mega Starmie (Liquidation+), Mega Victreebel (Acid Spray+), Mega Malamar (Psybeam+),
  Mega Dragonite (Outrage+), Mega Mewtwo X (Dynamic Punch+), Mega Mewtwo Y (Future Sight+).
  [community-consensus, pokemongohub.net, fetched 2026-09-09, cross-checked against the official
  page's own Mewtwo X/Y naming — consistent].

## Why this matters for this engine

`SpeciesDefinition` (packages/engine/src/types.ts) models a fixed fast move + up to some number of
charged moves, with no concept of a per-species Mega Level progression (already flagged as
unmodeled in [[fact-mega-level-system-2026-update]] for cost/cooldown purposes) or of a
mega-evolution-conditional THIRD charged move. For any of the 13 species above used as an
ATTACKER in this tool while mega-evolved, today's model structurally cannot represent their real
best-case moveset if the player has invested to Super Max Level — the engine will always
under-count their true ceiling DPS/TDO by omitting a real, raid-usable move. This is a genuine,
citable content gap, not a numeric staleness issue GAME_MASTER auto-sync would catch on its own
(GAME_MASTER may well already list these "+" moves in the species' moveset — that part WOULD sync
automatically — but nothing in this engine's data model conditions move availability on a
Mega-Level state the engine doesn't track at all).

## Not proposing a build — flagging the size of the gap instead

Properly modeling this requires: (a) a per-species Mega Level input (a new dimension: `not
mega-eligible for Super Max` / `Base` / `High` / `Max` / `Super Max`), which needs its own
Scenario-round-trip treatment per CLAUDE.md's standing decisions if it ever becomes user-facing,
and (b) confirming whether GAME_MASTER's raw moveset data already gates the "+" move behind
anything data-sync could read (untested this session — a `data-sync` question, not a
`pogo-researcher` one). Handing back as a scoped research finding, not a proposal, since the
right owner and shape of a fix isn't yet clear enough to propose responsibly.

## Sources
- pokemongo.com/en/news/more-mega-updates-2026 — official, fetched 2026-09-09.
- pokemongo.com/news/staraptor-super-mega-raid-day-2026 — official, fetched 2026-09-09 (raid-power
  confirmation).
- leekduck.com/gofest/mega-updates/ — community/first-party-adjacent, fetched 2026-09-09.
- pokemongohub.net/post/news/mega-mewtwo-x-and-y-adventure-effects-revealed-plus-new-additional-
  mega-charged-attacks/ — community, fetched 2026-09-09 (13-species list).
