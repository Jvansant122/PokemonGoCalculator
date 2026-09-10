---
name: reference-source-catalog
description: Verified, per-source checklist of every external research source used so far — URL/access shape, unique coverage, reliability tier, known failure modes, raid-vs-PvP scope, and the specific check that validates it. Read this BEFORE researching instead of re-deriving source trust from scratch or re-discovering a dead URL.
metadata:
  type: reference
---

Built 2026-09-09 after a costly miss: three research rounds recorded Super Max "+" move raid
energy as "unpublished." It wasn't — `db.pokemongohub.net` had it the whole time, verbatim, on
every "+" move's own page. That was a search-coverage failure, not a world fact. This file exists
so the next pass checks the right places first. Every URL below was directly fetched and confirmed
live on 2026-09-09 unless marked otherwise; do not add an entry to this file without fetching it.

## The validation method to reuse (read this before doubting a source on shape alone)

A source that returns a suspiciously *uniform* value for every item in some category (every "+"
move reads exactly 100 energy on `db.pokemongohub.net`; every "+" move reads exactly -100 energy
on `dittobase.com`) is not automatically a template default. **Test the same source's fields on a
different, already-ground-truthed category first.** This project's `data/raw/game_master.json` is
the ground truth for ordinary (non-"+") move power/energy/duration — it's already synced and
committed, so this costs nothing to check.

Worked example (this session): `db.pokemongohub.net/move/399` (Volt Tackle) reports Power 90 /
Energy 33 / Duration 3.5s for "Gym and Raid Battles." Grepping this repo's own
`data/raw/game_master.json` for `"movementId": "VOLT_TACKLE"` gives `power: 90, energyDelta: -33,
durationMs: 3500` — exact match. Same check on `ZAP_CANNON` (`energyDelta: -100`) also matches the
site's own energy figure. Because the site's pipeline reproduces *non-uniform* ground-truth numbers
exactly across multiple different moves, its uniform "100 energy" reading for every "+" move is
credible — a template default could not have also gotten the varied control values right. Contrast:
`dittobase.com`'s raid-context "Energy Cost" field reads -100 on every move checked **regardless of
that move's own real energyDelta** (confirmed again this session on Dark Pulse+: real base
`DARK_PULSE` energy is different from -100, yet the "+" page still shows -100) — that field fails
the same test and should be distrusted, while the same site's duration and PvP fields pass it and
should not be.

**Generalize**: before rejecting a value for looking too uniform, or accepting one for looking
plausible, run the source's own machinery against a handful of already-known-correct values in a
related category. Uniformity plus a passing control-group check = probably real. Uniformity with no
control check = unknown. Uniformity that fails the control check on the exact field in question
(not a different field on the same site) = template default, distrust that field specifically.

---

## Tier 1 — Official / first-party (and first-party-adjacent)

### pokemongo.com / pokemongolive.com (news/patch posts)
- **Access**: `pokemongo.com/en/news/<slug>` or `pokemongo.com/post/<slug>`. No API; read the
  rendered page.
- **Uniquely covers**: the only source that can make a claim `[official]` rather than
  `[community-consensus]`. Balance changes, new mega/primal debuts, event mechanics stated in
  Niantic's/Scopely's own words.
- **Reliability**: `[first-party]`.
- **Known failure modes**: (1) posts are marketing copy, not engineering docs — they name a
  mechanic ("Greatly enhanced CP," shield-reducing damage) without ever giving the underlying
  formula or exact multiplier; don't expect a number just because the mechanic is official. (2) An
  untargeted fetch can miss a mechanic buried mid-page — this session, an earlier fetch of
  `mega-evolution-2026-update` for Mega Level details completely missed the Super Mega Raid
  shield/enrage paragraph on the same page; a second, question-targeted fetch found it. Always
  re-fetch with a specific question before concluding a page doesn't mention something.
- **Raid vs PvP**: explicit when it matters (e.g. Staraptor's post gives separate "Trainer Battles:
  70 power" / "Raid Battles: 150 power" lines) — trust the labelled context, never assume one
  applies to the other.
- **Verify**: confirmed live 2026-09-09 (`mega-squads-2026` fetched directly). **Post-2025-05-29,
  the copyright footer reads "©Scopely," not Niantic** (directly confirmed this session) — still
  the correct `[first-party]` tier, just cite it as a Scopely post, not a Niantic one, for anything
  dated after that acquisition close (see `fact_niantic_scopely_acquisition_sourcing.md`).

### LeekDuck (leekduck.com)
- **Access**: `leekduck.com/posts/<slug>` (news mirror/summary), `leekduck.com/gofest/<slug>`
  (event hub pages).
- **Uniquely covers**: fastest first-party-adjacent mirror of an official post, often with the
  exact same sentences quoted verbatim — useful when `pokemongo.com`'s own page is slow to
  reflect an update or you want a second confirmation of an exact quote. Also the upstream source
  ScrapedDuck scrapes for this project's own live raid feed.
- **Reliability**: `[first-party-adjacent]` (a fan site, but with an unusually tight,
  verbatim-quoting relationship to official posts — treat its direct quotes of Niantic/Scopely
  copy as reliable, its own added commentary as `[community-consensus]`).
- **Known failure modes**: none found this session. Not itself a numeric-data API — it's a
  human-written companion article, so cross-check any number it states against a primary post if
  one exists.
- **Raid vs PvP**: inherits whatever the official post it's mirroring says; doesn't add its own
  conflation.
- **Verify**: confirmed live 2026-09-09 (`more-mega-updates-2026` fetched directly, verbatim quote
  matched the official post exactly).

### PokeMiners GAME_MASTER mirror (raw GitHub JSON)
- **Access**: `raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json`. This
  is the file `scripts/sync-data.ts` treats as primary.
- **Uniquely covers**: the actual live template data behind every move/species — power, energy,
  duration, `damageWindowStartMs/EndMs`, `staminaLossScalar`, `criticalChance`, and (in
  `BATTLE_SETTINGS`, a different top-level template ID from `COMBAT_SETTINGS`) the boss-AI-adjacent
  fields (`enemyAttackInterval`, `energyDeltaPerHealthLost`, `retargetSeconds`, `swapDurationMs`).
  Lists unreleased content too — cannot itself answer "is this released?"
- **Reliability**: `[first-party]` for anything it actually contains and you can read directly (no
  human summarization layer between you and the value).
- **Known failure modes**: **the file is ~19.5MB, over WebFetch's ~10MB response cap in this
  environment.** Direct-fetch attempts against this exact URL have both failed (`maxContentLength
  size of 10485760 exceeded`) and, on other occasions the same week, apparently succeeded (used to
  corroborate the Apex Lugia/Ho-Oh move templates and the Super Max "+" move absence) — **treat
  success as non-reproducible, not as "the cap doesn't apply here."** Don't plan research around
  needing this fetch to work. This repo's own `data/raw/game_master.json` (post-sync, `grep`-able
  via `Read`/`Grep`) is pre-filtered to `pokemonSettings` species/move data only — it does NOT carry
  `BATTLE_SETTINGS`/`COMBAT_SETTINGS` (confirmed by direct read) — so a question about boss-AI
  timing constants specifically cannot be answered from the committed file even when it can be
  answered from the raw dump.
- **Raid vs PvP**: the raw file has both `combatSettings` (PvP) and `battleSettings` (raid/gym) as
  separate top-level templates — real fields, not conflated, if you can get far enough into the
  file to reach them.
- **Verify**: `data/raw/_meta.json` shows this project's own last successful sync
  (`game_master.json`, most recent `fetchedAt` in the committed metadata). For a fresh raw fetch,
  expect roughly even odds of hitting the size cap.

### Hackage `pokemon-go-protobuf-types` package (schema only, not values)
- **Access**: `hackage-content.haskell.org/package/pokemon-go-protobuf-types-<version>/src/src/Proto/POGOProtos/Settings/Master/<MessageName>.hs`
  — auto-generated Haskell bindings from Niantic's real `.proto` schema files. Version `0.1.2`
  confirmed working 2026-09-09 for `GymBattleSettings.hs` and (implicitly, same package) the
  `MoveSettings` field list.
- **Uniquely covers**: the ONLY source found that confirms real protobuf **field names and field
  order** at the schema level (e.g. `energyDeltaPerHealthLost`, `retargetSeconds`,
  `swapDurationMs`, `damageWindowStartMs`/`EndMs`, `staminaLossScalar`) without needing to fetch or
  parse the 19.5MB live dump at all. This is how this project confirmed the real field names behind
  several boss-AI/damage-timing constants that no wiki names directly.
- **Reliability**: `[first-party]` for field names/types/order (it's a mechanical transcription of
  Niantic's own `.proto` files, not an interpretation) — but it is **schema only**. It carries no
  populated data, so it can never answer "what is the live 2026 value," only "what is this field
  called and what type is it."
- **Known failure modes**: none found — but don't mistake schema confirmation for value
  confirmation; this is a common trap (a field existing doesn't mean you know its current number).
- **Raid vs PvP**: `GymBattleSettings` (despite the name — a historical artifact of raids reusing
  the pre-2017 Gym combat settings block) is the raid/gym-relevant message; `CombatSettings` would
  be the separate PvP one, not yet located at this same package.
- **Verify**: confirmed live and readable 2026-09-09, 14-field `GymBattleSettings` list extracted
  directly.

---

## Tier 2 — Community databases and wikis

### Bulbapedia (bulbapedia.bulbagarden.net)
- **Access — the one trick that matters**: fetch `?action=raw` on the URL
  (`bulbapedia.bulbagarden.net/w/index.php?title=<Page_Name>&action=raw`), not the plain
  `/wiki/<Page_Name>` rendered page. This is **already the pattern this project's own
  `scripts/sync-data/fetchCache.ts` uses** (`List_of_Raid_Boss_changes_in_${page}&action=raw`,
  the shadow-raid-archive page) — reuse it for research too. Raw wikitext returns literal source
  text (tables, exact numbers) with no AI-summarization transcription layer in between; a rendered
  fetch of the *same page* has produced measurably different numbers on this project more than
  once (see the CPM half-level digit-drift note in `fact_cpm_table_levels_41_50.md`).
- **Uniquely covers**: raid tier HP/multiplier tables (`Raid_Battle_(GO)`), shadow raid enrage
  mechanics (`Shadow_Raid`), Mega Evolution mechanics/history (`Mega_Evolution_(GO)`), Power-up
  formula (`Power_up`), friendship bonuses (`Friends_(GO)`), and the only structured **historical**
  raid-boss archive found (`List of Raid Boss changes` family — see Tier 4 below for its coverage
  ceiling).
- **Reliability**: `[community-consensus]` — a wiki, not first-party, but the highest-trust wiki
  this project has found: several of its tables have been independently corroborated by other
  sources (GoBattleSim's hardcoded constants, official Niantic posts) and none have been
  contradicted.
- **Known failure modes**: it is a wiki — untagged claims sit next to sourced ones with no visual
  distinction (e.g. the raid boss tier table has no inline footnote at all). Its own maintained
  historical-archive series **stops at 2022** (see Tier 4) — don't expect 2023+ coverage.
- **Raid vs PvP**: generally keeps these separate and labelled (e.g. `Power_up`'s formula is
  raid/gym-general, not PvP-specific) but always check which page/section you're on.
- **Verify**: `action=raw` fetches of `Raid_Battle_(GO)`, `Shadow_Raid`, `Mega_Evolution_(GO)`,
  `Power_up`, `Friends_(GO)` all directly confirmed working this session and in prior sessions
  2026-09-05 through 2026-09-09.

### db.pokemongohub.net (the motivating-case source — per-move and per-species database)
- **Access**: species pages are `db.pokemongohub.net/pokemon/<nationalDex>-<Form>` — confirmed
  exact examples: `/pokemon/26-Mega_X` (Mega Raichu X), `/pokemon/26-Mega_Y` (Mega Raichu Y),
  `/pokemon/149-Mega` (Mega Dragonite), `/pokemon/658-Mega` (Mega Greninja). Move pages are
  `db.pokemongohub.net/move/<id>` where `<id>` is a **small sequential integer for ordinary
  moves** (confirmed: 133=Struggle, 221=Tackle, 399=Volt Tackle, 78=Thunder, 123=Brick Break) but
  a **distinct, much larger ID for a species-exclusive "+" move** (confirmed: Volt Tackle+ on Mega
  Raichu X = `/move/2002624`, Zap Cannon+ on Mega Raichu Y = `/move/2002625` — consecutive, so
  these read as assigned in the order the "+" moves were added to the DB, not derived from the
  dex number by a fixed formula). **Don't guess a "+" move's ID directly — reach it via the
  species' own page**, which lists it with a working link.
- **Uniquely covers**: this is the best source found for **raid-context (not PvP) move stats
  presented as a clean Power/Energy/Duration triple**, sourced separately from its own
  GO-Battle-League numbers on the same page (explicit "Gym and Raid Battles" vs "GO Battle League"
  headers) — exactly the raid-vs-PvP split that caused the "+" move energy error. It's also one of
  the only sources with populated `damageWindowStartMs`/`EndMs`-style **Damage Window** figures per
  move (e.g. Flamethrower 1.3s-1.5s of a 2.0s animation) — a frame-level timing gap almost nothing
  else covers.
- **Reliability**: `[community-consensus]` — a wiki-style database, not first-party — but this
  session validated its raid-context numbers against this project's own committed GAME_MASTER on
  multiple moves with zero mismatches (see the validation-method section above). Treat it as the
  single most load-bearing community source for exact raid power/energy/duration triples.
- **Known failure modes**: none caught this session on the fields tested (power/energy/duration for
  both ordinary and "+" moves). Unknown: whether its Damage Window figures update as promptly as
  its power/energy fields after a rebalance — not stress-tested.
- **Raid vs PvP**: explicitly separates these on every move page — this is its main strength, use
  it precisely because it doesn't conflate them.
- **Verify**: directly fetched and cross-checked against `data/raw/game_master.json` this session
  (2026-09-09) for `VOLT_TACKLE` (exact match) and `ZAP_CANNON` (exact match); "+" move data for
  Volt Tackle+/Zap Cannon+ fetched directly from the two Raichu pages.

### pokemongohub.net (the guide/news site — same publisher, different subdomain from `db.`)
- **Access**: `pokemongohub.net/post/<category>/<slug>/`.
- **Uniquely covers**: event guides, datamine writeups, and — importantly — this is the **ultimate
  source** for the Sept 2024 raid-rework reporting chain ("Niantic quietly updates Raid Move
  durations...", 2024-09-01/06) that Sportskeeda/Dexerto/Massively Overpowered all repeat; go to
  this article directly rather than one of its downstream repeats.
- **Reliability**: `[community-consensus]`.
- **Known failure modes**: an *older* GamePress-hosted Q&A page it once referenced
  (`gamepress.gg/pokemongo/q-a/attack-rate-defending-pokemon`) is now dead (see Tier 5) — a
  pokemongohub article citing a GamePress link doesn't mean that link still resolves.
- **Raid vs PvP**: generally keeps these separate in its own writing; no conflation found.
- **Verify**: multiple articles directly fetched across 2026-09-05 through 2026-09-09 sessions
  (Sept-2024-rework piece re-fetched and re-quoted verbatim as recently as this session).

### doctorpokegogo.com
- **Access**: per-move pages `doctorpokegogo.com/en/moves/<slug>/`; per-boss ranked tables
  `doctorpokegogo.com/en/raid_<bossname>/`; methodology at
  `doctorpokegogo.com/en/rating-methodology/`.
- **Uniquely covers**: a full ranked DPS/TDO table per raid boss with stated attacker assumptions
  (Level 50, IV15, Shadow bonus applied, no weather) on the same page — the closest thing found to
  a fetchable, numeric, methodology-labelled **output**-level reference (see
  `fact_external_output_validation_targets.md`). Also one of two sites with a per-move Base/
  High/Max/Super-Max (Level 1-4) power table for "+" moves.
  Honest about what it doesn't know: literally prints "Energy Bar Cost: Not specified in official
  data" rather than guessing.
- **Reliability**: `[community-consensus]`, single-source (no GamePress/Pokebattler attribution
  found, plausibly an independent methodology, but closed-source so "independent" rests on absence
  of attribution, not proof).
- **Known failure modes**: **(1) its own "+10%/tier" scaling disclaimer is a verbatim,
  site-wide template** repeated identically on every "+"-move page ("This formula is our own
  estimate based on in-game measurement") — many pages carrying it is one guess, not many. It is
  **also present near-verbatim on `dittobase.com`** — see the shared-disclaimer trap below; do not
  count these two sites as two corroborating sources for that specific formula.
  **(2) numbers can drift between fetches with no version marker.** This session, Dark Pulse+'s
  raid "Power" figure read differently on two direct fetches (a fetch during round 3 of the Super
  Max research implied 150, matching the official anchor; a fresh fetch this session returned
  "195" from a "Raid/Gym Rating Breakdown" section). This could be a genuine page update, a
  different tier being surfaced (Super Max vs Level 1), or the fetch tool's summarizer picking up
  a derived rating figure instead of the base Power stat (195 = 65 DPS × 3.0s duration is
  internally consistent either way) — **the cause wasn't resolved, but the lesson is: never
  present a single doctorpokegogo number as settled without a same-session cross-check against an
  official anchor or a second source**, exactly the discipline that caught this.
- **Raid vs PvP**: separates these (page sections labelled "Raid/Gym Rating" vs its separate PvP
  battle-league simulator, which it explicitly attributes to PvPoke rather than claiming as its
  own).
- **Verify**: `rating-methodology` and `raid_mewtwo_armored` pages fetched directly 2026-09-09;
  `dark-pulse-plus` re-fetched this session and produced the drifted figure described above —
  re-verify any single number pulled from here before relying on it.

### dittobase.com
- **Access**: per-move pages `dittobase.com/pokemon-go/moves/<hyphenated-move-name>` (e.g.
  `dark-pulse-plus`).
- **Uniquely covers**: same Base/High/Max/Super-Max power-scaling table shape as doctorpokegogo,
  for the same "+" move roster; also carries per-move PVP fields.
- **Reliability**: `[community-consensus]` for duration and PvP fields (both independently
  cross-checked and correct — see failure modes); `[unverified — actively distrust]` for its
  raid-context "Energy Cost" field specifically.
- **Known failure modes**: **its raid-context "Energy Cost" field reads exactly -100 on every
  single "+" move checked, regardless of that move's real energy cost** — reconfirmed again this
  session on Dark Pulse+ (still -100). This is the textbook template-default failure mode: the
  field never varies despite the underlying real values varying. Its **duration** field
  independently matches this project's real GAME_MASTER durations (11/11 checked across a full
  research round) and its **PVP power/energy fields independently match PvPoke's own maintained
  dataset** — **don't discard the whole site over one broken field.** Also shares the identical
  "+10%/tier, community-observed" disclaimer text with doctorpokegogo (see shared-disclaimer trap
  below).
- **Raid vs PvP**: presents both, but its raid-context energy field specifically should not be
  trusted (its power/duration raid fields are fine).
- **Verify**: `dark-pulse-plus` re-fetched directly this session (2026-09-09): Power 150, Energy
  -100, Duration 3.0s — energy field reproduces the known-bad pattern exactly, power/duration match
  the official/GAME_MASTER anchors.

### PvPoke (github.com/pvpoke/pvpoke)
- **Access**: `raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/moves.json` —
  the real file backing the live `pvpoke.com` simulator, not a paraphrase. Directly fetchable
  (confirmed working this session, unlike the 19.5MB PokeMiners dump).
- **Uniquely covers**: a real, actively-maintained, structured PVP/GBL moves dataset with
  `power`/`energy`/`isMegaMove` fields — including entries for most (not all) Super Max "+" moves,
  useful as the *PvP-context* half of a raid-vs-PvP comparison. `cooldown: 500` / `turns: 1` appear
  identically on every entry — this is PvPoke's own generic tap-lockout bookkeeping, **not a
  per-move duration figure**, don't mistake it for one.
- **Reliability**: `[community-consensus]`, but unusually strong — it's the actual production data
  file of a widely-used, actively-maintained PvP simulator, open-source and directly readable.
- **Known failure modes**: coverage gaps on very recent content (missing `BRAVE_BIRD_PLUS`,
  `DARK_PULSE_PLUS`, `ZAP_CANNON_PLUS` as of this session — plausible update lag or an unexplained
  hole, not a data-quality problem on what it does have). **PvE and PvP energy costs are
  genuinely different values for the same base move** (e.g. `FELL_STINGER` PvE energyDelta 33 vs
  PvPoke's PVP energy 35) — this is real, not a bug in either source; don't average or substitute
  one for the other.
- **Raid vs PvP**: **PvP/GBL only, always.** PvPoke has never modelled raids at all (confirmed
  separately via `fact_boss_cadence_hybrid_model_sourcing.md`) — this is the single most important
  scope fact about this source. A number from here is never a raid number.
- **Verify**: directly fetched 2026-09-09, confirmed live entries for `VOLT_TACKLE_PLUS`
  (power 65 / energy 35, matching this project's own prior record exactly) and confirmed
  `DARK_PULSE_PLUS` absent (matches the prior "missing from pvpoke" finding — gap persists).

### Pokebattler (pokebattler.com / fight.pokebattler.com)
- **Access**: `fight.pokebattler.com/raids` (JSON, documented, already the pattern this project
  uses for its own second live-raid cross-check) is a roster **listing** endpoint. The actual
  counter/DPS calculator lives at `pokebattler.com/raids/<BOSS>` and is **login-gated** — the page
  server-renders the boss's own stats (useful) but replaces the ranked-counters table with "Login
  to see your custom results!" Docs at `pokebattler.com/developers`.
- **Uniquely covers**: a second, independently-operated (though not provably independently
  *sourced* — no methodology disclosure found) live raid roster feed with bonus tier metadata
  (HP/players/soloable per `RAID_LEVEL_N`) and a genuinely useful **upcoming raid schedule**
  ScrapedDuck doesn't carry at all.
- **Reliability**: `[community-consensus]` for the roster feed (empirically matches ScrapedDuck);
  the DPS/TDO calculator itself is unreachable, so no reliability tier applies to numbers you can't
  get.
- **Known failure modes**: no sourcing-methodology disclosure anywhere on the site — "separately
  maintained from LeekDuck" is circumstantial (different company/history/API), not proven.
  Original open-source backend (`celandro/pokebattler-fight`) is explicitly stated by its own
  README to be retired, not current production code — don't treat it as a window into the live
  calculator.
- **Raid vs PvP**: raid-only product, no PvP ambiguity.
- **Verify**: `/raids` endpoint and `/developers` docs confirmed working across 2026-09-07 and
  2026-09-09 sessions; `robots.txt` explicitly invites automated "reference" use of documented API
  paths (blocks AI-training/SEO crawlers specifically, not reference tools).

### pogoapi.net
- **Access**: `pogoapi.net/api/v1/<endpoint>.json`. Confirmed endpoints beyond the ones already in
  this project's pipeline (`mega_pokemon.json`, `raid_bosses.json`): `pokemon_powerup_requirements.json`
  (stardust/candy/XL per level, 1-50), `raid_settings.json` (lobby-size/remote-raid logistics —
  `max_players_per_raid: 20`, `remote_damage_modifier`, friend-invite settings), and
  `friendship_level_settings.json` (`attack_bonus`, `raid_ball_bonus`, `trading_discount` per
  friendship tier).
- **Uniquely covers**: nothing anymore that a fresher source doesn't also cover — its value today
  is as a **stable JSON shape for settings tables** that would otherwise need hand-transcribing off
  wiki prose (e.g. `raid_settings.json`'s `max_players_per_raid: 20` is the same fact Bulbapedia
  states in prose).
- **Reliability**: `[community-consensus]`, and **already known stale for several endpoints** —
  `cp_multiplier.json`'s `Last-Modified` header reads 2022-09-19 and is truncated at level 45 (not
  50); `raid_bosses.json`'s `previous` key carries no date field at all. Already this project's
  documented fallback tier, not primary.
- **Known failure modes**: silent staleness with no visible warning on the JSON itself — always
  check `Last-Modified` or cross-validate against a fresher source (GAME_MASTER, Bulbapedia) before
  trusting an exact number, especially anything past level 45 or any "current vs previous" framing.
  A `chewett.co.uk` writeup (`/blog/2712/pokemon-go-api-raid-settings-api/`) documents
  `raid_settings.json` dated 2020-11-28 already showing `remote_damage_modifier: 1.0` — this is
  *earlier* than this project's own recorded 2023-06-01 remote-raid-penalty-removal date
  (`fact_remote_raid_penalty_removed.md`); **not resolved this pass** — could mean the penalty was
  never carried by this specific field, or the blog's example payload reflects a live re-fetch at
  render time rather than a frozen 2020 snapshot. Flagging as an open tension, not restating the
  removal date as safe without a fresh check if it matters to a future question.
- **Raid vs PvP**: raid/gym-only tables; no PvP endpoints found in this family.
- **Verify**: endpoint list and staleness re-confirmed across 2026-09-05 through 2026-09-09
  sessions; `raid_settings.json`/`friendship_level_settings.json` existence confirmed via
  `chewett.co.uk` writeups this session (2026-09-09), not yet re-fetched directly from pogoapi
  itself this session.

---

## Tier 3 — Open-source simulators (mechanic-SHAPE corroboration, never values)

### GoBattleSim-Engine / GoBattleSim-Python (github.com/biowpn/GoBattleSim-Engine, -Python)
- **Access**: raw files via `raw.githubusercontent.com/biowpn/GoBattleSim-Engine/master/<path>` —
  key files `include/GameMaster.h` (hardcoded default constants), `setting/GBS.json` (settings-as-
  data), `src/Battle.cpp` / `src/Strategy.cpp` (boss-AI decision logic in C++).
- **Uniquely covers**: this is the only place found that shows a **complete, runnable
  implementation** of boss-AI decision logic (when a boss re-checks its charged-move roll, how it
  picks between two known charged moves) and dodge/energy constants, as actual code rather than a
  prose description — useful for turning an ambiguous prose mechanic into a concrete, testable
  hypothesis (used this project to justify the per-move-boundary boss-cadence recommendation and
  the `0.25`/`500ms`/`700ms` dodge constants).
- **Reliability**: `[community-consensus]` — **one independent developer's own reverse-engineered
  modelling choice**, not a Niantic source and not proof of the real algorithm. Treat agreement
  between this project's own reasoning and GoBattleSim's implementation as "a second person studying
  the same public behavior converged on the same shape," not confirmation.
- **Known failure modes**: **specific settings files are stale** — `include/GameMaster.h` and
  `setting/GBS.json` were last touched January 2020 per GitHub commit history (five years before
  the Sept 2024 raid rework), even though the repo overall has 109+ commits and looks
  actively-maintained. Don't assume a fresh-looking repo means every file in it reflects 2026
  values — check the specific file's own history. Also carries visibly dead legacy data (an old
  tier "2" at 0.67 HP multiplier, defunct since Aug 2020) — a useful tell that a given constant
  predates a specific restructuring, not necessarily wrong for what it was current for.
- **Raid vs PvP**: `PvEBattleSettings` section is explicitly raid/gym; keeps this distinct from its
  own PvP logic elsewhere in the same repo.
- **Verify**: `include/GameMaster.h`, `setting/GBS.json`, `src/Battle.cpp`, `src/Strategy.cpp` all
  directly fetched 2026-09-09; repo confirmed still present and active (109 commits) this session,
  though a precise last-commit date wasn't extracted.
- **Same-upstream note**: GoBattleSim's own README states GamePress's (now-dead) "Comprehensive DPS
  Spreadsheet" was GoBattleSim's own extension, later made standalone — that spreadsheet and
  GoBattleSim are **one engine, not two independent ones**. Don't count agreement between them as
  corroboration if GamePress's version is ever revived somewhere.

---

## Tier 4 — Historical/archival-specific (narrow coverage windows, know the edges)

### Bulbapedia "List of Raid Boss changes" year-page family
- **Access**: index page links exactly 5 year-pages (2017-2018, 2019, 2020, 2021, 2022), each raw-
  wikitext-fetchable via the same `?action=raw` pattern as the rest of Bulbapedia. Structured,
  template-based (`{{lop/raid/GO|<dex>|<name>|...}}` per boss entry) — reliably parseable.
- **Uniquely covers**: the only structured, per-rotation historical raid-boss roster with
  species+CP+stats+dates found anywhere, for its covered window.
- **Reliability**: `[community-consensus]`.
- **Known failure modes**: **hard-stops at 2022.** Bulbapedia's own dedicated raid-tracking
  apparatus appears abandoned after that point — there is no 2023-2026 continuation on this wiki.
  Don't expect recent-era historical rows from this source.
- **Raid vs PvP**: raid-only by construction.
- **Verify**: index page and the 2017-2018 year-page both raw-wikitext-fetched directly 2026-09-07;
  re-confirmed no newer page exists.

### pokemongo.fandom.com — NOT independently usable, see "known-dead/blocked" below for status,
listed here only to note WHY it would matter if ever unblocked: search results describe year-pages
through 2026 (i.e., apparently maintained to present, unlike Bulbapedia), which would be the only
candidate found that could close the 2023-2026 historical gap. **Unverified, not ruled out on
merit** — only ruled out on access.

### chewett.co.uk (dated pogoapi.net snapshots + writeups)
- **Access**: `chewett.co.uk/blog/<numeric-id>/<slug>/` — the numeric ID is not guessable or
  derivable; use WebSearch to locate a specific writeup (e.g. searching "chewett.co.uk pogoapi
  <topic>" surfaced `/blog/2717/pokemon-go-api-friendship-level-settings-api/` and
  `/blog/2712/pokemon-go-api-raid-settings-api/`).
- **Uniquely covers**: dated (2020-era), field-name-and-example-value writeups of several pogoapi.net
  settings endpoints, useful as a **historical anchor** to check whether a value has changed since a
  known date, distinct from re-reading pogoapi's own always-live JSON.
- **Reliability**: `[community-consensus]`, single independent blogger, but transparent about
  exact field names (useful for confirming a pogoapi field's real name before searching for it
  blind).
- **Known failure modes**: post dates (2020-11-28, 2020-12-26 for the two confirmed pages) are old
  relative to 2026 — don't treat an example value shown on the page as necessarily still current
  without a fresh pogoapi fetch; unclear whether the post embeds a live-refreshed API call or a
  frozen 2020 snapshot (see the `remote_damage_modifier` tension noted under pogoapi.net above).
- **Raid vs PvP**: raid/gym-side settings only, per the two pages found.
- **Verify**: both URLs above directly fetched and live-confirmed 2026-09-09 (the friendship one
  corrects an earlier, wrong guessed URL — always re-search rather than reuse a remembered
  chewett.co.uk path, the numeric IDs aren't memorable/derivable).

---

## Tier 5 — Journalism / SEO guide sites (situational, weakest reliable tier)

### Sportskeeda / Dexerto / Massively Overpowered
- **Access**: standard news-site URLs.
- **Uniquely covers**: fast turnaround on datamine leaks and Niantic support-account statements
  before an official post exists.
- **Reliability**: `[community-consensus]` at best, frequently **one report propagating through
  several outlets** rather than independent confirmations — this project has caught this pattern
  repeatedly (the Sept 2024 rework numbers, the raid-boss charged-move-cadence figures) where 3-4
  outlets all repeat near-identical wording, traceable to one Silph Road/PokeMiners post.
- **Known failure modes**: **Sportskeeda returns HTTP 405 to direct WebFetch in this environment**
  (confirmed multiple times) — any Sportskeeda-attributed claim in this project's memory came via
  WebSearch's synthesized summary, a materially weaker evidence form than a direct fetch; flag it
  as such rather than upgrading it on reuse.
- **Raid vs PvP**: no systematic pattern found either way; check per-article.
- **Verify**: Dexerto and Massively Overpowered content has been directly fetched successfully in
  prior sessions; Sportskeeda has not been successfully directly fetched at all as of 2026-09-09.

### poketory.com, getgodex.com, hundo-hunter.com, mein-mmo.de, destructoid.com
- **Access**: standard guide-site URLs, used specifically for Super Mega Raid shield-mechanic
  detail this session.
- **Uniquely covers**: per-boss Super Mega Raid shield counts (a real table, e.g. Mega Mewtwo/
  Dragonite = 10 shields, most others 7-8) not found in any official source.
- **Reliability**: `[community-consensus]`, mixed self-awareness — **getgodex.com is a good model
  of honest sourcing**: its own article text discloses "The developer has not published a hard
  trainer count or the exact shield stat values. The figures below come from community coverage...
  treat them as well-supported estimates" — trust a site that hedges like this more, not less. By
  contrast, hundo-hunter.com states a contradicting claim ("takes no damage from regular attacks")
  with no hedge and no citation.
- **Known failure modes**: numbers on this exact mechanic are **actively contested between sites**
  (2x atk/4x def vs. flat immunity) with no official source to arbitrate — don't average or pick
  one arbitrarily; report the contest itself.
- **Raid vs PvP**: raid-only content (Super Mega Raids don't have a PvP equivalent).
- **Verify**: all five fetched directly 2026-09-09.

### Low-tier SEO sites (pokeep.com, boostroom.com, theclick.gg, and similar)
- **Access**: standard guide-site URLs, encountered via WebSearch when hunting for numbers no
  higher-tier source publishes (e.g. Super Max's "+2 effective levels" CP claim).
- **Uniquely covers**: nothing that should be trusted as unique — these are the sites that show up
  when a number genuinely isn't published anywhere better, which is itself informative (a signal
  the number is unconfirmed, not a reason to accept it).
- **Reliability**: `[speculative/unverified]` — **do not cite without independent corroboration at
  a higher tier.** This project has one live example of exactly this trap almost working: the
  "+2 effective levels for Super Max" figure lived only on this tier for two research rounds before
  a GitHub gist comment (also not first-party, but a different, more technical lineage) happened to
  independently state the same magnitude — worth upgrading confidence on independent convergence,
  but never on this tier alone.
- **Known failure modes**: no primary-source citation, ever, on any page checked.
- **Verify**: not individually re-verified as "sources" — recorded here as a category to recognize
  and downweight on sight, not a set of URLs to reuse.

---

## Known-dead or blocked — don't re-attempt without a specific new reason

| Source | Failure mode | Confirmed |
|---|---|---|
| `pokemongo.gamepress.gg`, `gamepress.gg/pokemongo/*`, `pogo.gamepress.gg` | 301-redirects to a generic landing page (`pokebase.app/pokemon-go`), which itself 403s; older subdomain DNS-fails outright | 2026-09-09, multiple paths tried |
| `pokemongo.fandom.com` | HTTP 402 Payment Required on every path tried (rendered and `?action=raw`) | 2+ independent sessions, most recently 2026-09-07 |
| `thesilphroad.com` | TLS certificate expired | 2026-09-08 |
| `x.com` / Twitter, `reddit.com` | Blocked outright by this tool | repeated, multiple sessions |
| `web.archive.org` | Tool cannot fetch this domain at all | 2026-09-09 |
| `grep.app` | HTTP 429 (rate-limited), reproduced twice on different days | 2026-09-08, 2026-09-09 |
| `sourcegraph.com` | HTTP 403 | 2026-09-09 |
| `github.com/search?type=code`, `api.github.com/search/code` | Requires authentication, unavailable to this tool | 2026-09-09 |
| `pogo-gamer.fr` | DNS resolution failure (`ENOTFOUND`) — domain appears gone entirely | 2026-09-09 |
| `github.com/ccev/pogoinfo`, `github.com/ReuschelCGN/pogoinfo` | Looks live/structured but is empirically stale — zero species overlap with the real live raid roster when checked | 2026-09-07 |
| `gist.github.com/pekingduck/...raid-bosses.json` | Frozen 2023 snapshot, no update mechanism | 2026-09-07 |
| Niantic Helpshift FAQ pages (`nianticlabs.com`/support subdomains) | HTTP 403 | 2026-09-05 |

---

## Cross-cutting traps (apply regardless of which source you're using)

- **WebSearch's AI-summary layer fabricates citation-sounding claims.** Caught three separate
  times this project: (1) a paragraph attributing detailed energy-mechanic numbers to a real but
  wrong Niantic post (a 2017 EX-raid post, unrelated to the claimed content); (2) a "PvPoke Tera
  Raid tool" claim — Tera isn't even a Pokémon GO mechanic; (3) a "100 Rare Candy → 1 Rare Candy XL"
  conversion mechanic that doesn't exist in either article WebSearch cited for it. **Always
  directly WebFetch the specific page a WebSearch summary names before citing its claim as sourced
  to that page** — the summary layer will confidently attribute things to real URLs that don't
  actually say what's claimed.
- **Shared-disclaimer trap**: `doctorpokegogo.com` and `dittobase.com` both carry a verbatim-near-
  identical "+10% per Mega Level tier, our own estimate" disclaimer on every "+"-move page. Two
  sites agreeing on a number when both display the identical hedge text is **one guess stated
  twice**, not independent corroboration — check whether agreeing text is a copy-paste template
  (visible verbatim across many pages on one or both sites) before counting it as two sources.
- **Same-upstream trap, mapped instances**: ScrapedDuck and `pokemon-go-api` are both ultimately
  LeekDuck-sourced for raid rosters (the latter discloses this directly via its own
  `LeekduckParser`); GoBattleSim's own README states GamePress's "Comprehensive DPS Spreadsheet"
  was its own extension, standalone-ified — one engine, not two; Sportskeeda/Dexerto/Pokémon GO
  Hub/Massively Overpowered's Sept-2024-rework coverage all trace to one PokeMiners datamine +
  one Silph Road analysis — four outlets repeating one report, not four confirmations.
  **Before treating agreement across "different" sites as corroboration, ask whether they could
  both be reading the same original leak/post.**
- **A source can be excellent for one field and broken for another on the exact same page** —
  don't discard or trust a whole site; qualify at the field level (dittobase: duration/PvP good,
  raid-energy bad; doctorpokegogo: qualitative claims and official-anchored numbers good,
  unanchored specific numbers need a same-session recheck).
- **WebFetch's page-summarization introduces small transcription noise on precise many-digit
  numeric tables** — don't trust a single WebFetch pass for exact many-decimal figures (CPM tables
  are the concrete example: two passes at the same pogoapi.net page produced different 6th-decimal
  digits). Prefer raw wikitext (`?action=raw`) or a raw JSON endpoint over a rendered/summarized
  page whenever exact precision matters, and cross-validate against a known formula/identity in
  this project's own code if one exists.

---

## Gaps this catalog still does NOT close (re-checked 2026-09-09, still open)

- **Super Max "greatly enhanced CP" mechanism** (formula/CPM-table mechanism, not just the ~+2-
  level magnitude, which is community-consensus already). Checked again this pass via
  `db.pokemongohub.net` search — came up empty, consistent with three prior rounds across Niantic's
  own post, Bulbapedia, and doctorpokegogo. No new candidate source found.
- **Historical raid-boss rosters, 2023-2026.** Bulbapedia's archive stops at 2022; `pokemongo.
  fandom.com` is the one plausible candidate and remains access-blocked (HTTP 402), not
  content-ruled-out.
- **The LIVE 2026 value of raid-boss energy-per-damage-taken (`energyDeltaPerHealthLost`) and
  charged-move fire probability.** Field names are now schema-confirmed (Hackage), but no source
  gives a current populated value — only a 2024-09-07 historical datamine figure (0.02→0.5, 50%→
  always-fire, since partially reverted per Niantic's own statement with no replacement number
  given). The raw GAME_MASTER dump that would settle this is the same one blocked by the 10MB cap.
- **`retargetSeconds` and `swapDurationMs` semantics.** Schema-confirmed field names, zero sources
  (official or community) found that explain what either governs beyond circumstantial inference.
