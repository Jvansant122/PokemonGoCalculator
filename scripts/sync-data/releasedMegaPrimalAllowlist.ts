/**
 * Hand-curated allowlist of mega/primal forms confirmed REAL, RELEASED
 * Pokémon GO content that fall through BOTH of scripts/sync-data.ts's other
 * released-content gates: pogoapi.net's mega_pokemon.json roster (updated on
 * pogoapi's own cadence, confirmed missing these as of this sync's fetch) AND
 * the currently-active ScrapedDuck raid rotation (`megaOrPrimalRaidGaps` in
 * sync-data.ts only fires for a mega/primal that's raiding RIGHT NOW). A real
 * mega whose debut was a single dedicated raid-day event needs a third way
 * in, since Mega Evolution unlocks are permanent per-trainer once earned —
 * the mega itself doesn't stop being real, released content just because its
 * one-day debut event ended and it may not raid again for months. Same
 * spirit as FORM_OVERRIDES in sync-data.ts: a short, hand-reviewed,
 * per-entry-justified table for a case the automated raid-gap/pogoapi-roster
 * logic structurally can't cover — add an entry here (with its own citation)
 * the moment a similar gap is spotted; this is NOT a place to speculatively
 * list unreleased content (see fetchGameMasterData's reliability caveat in
 * scripts/sync-data/fetchCache.ts for why GAME_MASTER's own tempEvoOverrides
 * can't be trusted alone as "released").
 *
 * Names are parsed by the exact same parseMegaOrPrimalRaidName/tempEvoIdFor
 * machinery `megaOrPrimalRaidGaps` already uses in sync-data.ts, so
 * "confirmed real mega name" is the only thing this table needs to supply —
 * GAME_MASTER still supplies (and sync-data.ts still cross-checks against
 * independent community sources, see gameMasterCrossChecks there) the actual
 * stat values.
 *
 * Each entry also optionally carries `lastKnownRaidTier` — this form's REAL
 * confirmed historical/debut raid tier (2026-09-07 research pass, see
 * per-entry citations below), written onto the resulting SpeciesDefinition's
 * `lastKnownRaidTier` field (see the mega-species build loop in sync-data.ts)
 * so raidBoss.ts's defaultRaidTierForSpecies() has a real observation to
 * prefer over its rarity/boost-keyed guess (which would otherwise assign
 * every STANDARD-rarity mega here the generic "Mega Raids" tier — wrong for
 * a form that actually debuted at the harder "Super Mega Raids" tier). Left
 * `undefined` for a form no confirmed tier was found for after genuine
 * research effort — an absent field honestly falls through to the existing
 * heuristic; a wrong guess would not be honest.
 *
 * WHY THIS LIVES IN ITS OWN MODULE rather than directly in sync-data.ts
 * (where its citations were originally authored and where the reasoning
 * above still applies verbatim): sync-data.ts runs real network fetches at
 * MODULE SCOPE via top-level `await` (fetchAndCacheMegaPokemon,
 * fetchAndCacheRaids, fetchGameMasterData, fetchMegaSpriteUrls) — it is not
 * gated behind a `main()` guard. Importing anything from that file — even
 * just a const — executes the entire live sync pipeline as a side effect of
 * the import. scripts/check-mega-gates.ts needs this allowlist as data only,
 * with zero network access (it's a pure-local, no-network audit) — so the
 * allowlist was extracted to this standalone module and re-imported from
 * both sync-data.ts (the authoritative home of the citations above) and
 * check-mega-gates.ts (a read-only consumer). Do not move this back into
 * sync-data.ts without first removing that file's top-level awaits, and do
 * not regex-scrape sync-data.ts's source text as a substitute for this
 * import — that would silently under-report the moment the literal's
 * formatting changes.
 */

import type { RaidTier } from "@pogo-analyzer/engine";

export interface ReleasedMegaPrimalAllowlistEntry {
  name: string;
  lastKnownRaidTier?: RaidTier;
}

export const RELEASED_MEGA_PRIMAL_ALLOWLIST: ReleasedMegaPrimalAllowlistEntry[] = [
  // Debuted 2026-07-18 via a dedicated "Super Mega Raid Day" event — real,
  // permanently-unlockable content, just not currently in pogoapi's roster or
  // in raid rotation. Sources: pokemongo.com/news/raichu-super-mega-raid-day-2026,
  // leekduck.com/events/raichu-super-mega-raid-day-2026, rotomlabs.net/article/
  // raichu-super-mega-raid-day. Stats cross-checked below against two sources
  // independent of GAME_MASTER (poketory.com's raid guide + PvPoke's own
  // separately-maintained gamemaster.json), both agreeing exactly with
  // GAME_MASTER's tempEvoOverrides — see gameMasterCrossChecks.
  //
  // lastKnownRaidTier "Super Mega Raids": directly confirmed by
  // leekduck.com/events/raichu-super-mega-raid-day-2026 ("Mega Raichu X and
  // Mega Raichu Y will make their Pokémon GO debut in Super Mega Raids"),
  // re-checked 2026-09-07.
  { name: "Mega Raichu X", lastKnownRaidTier: "Super Mega Raids" },
  { name: "Mega Raichu Y", lastKnownRaidTier: "Super Mega Raids" },

  // 9 more real, released megas found missing by scripts/check-mega-gaps.ts
  // (a Bulbapedia "Mega Evolution (GO)" diff) this session (2026-09-06). Every
  // one below was independently verified (not just trusted off the Bulbapedia
  // scrape) against at least one source distinct from both Bulbapedia and
  // GAME_MASTER before being added here — see per-entry citations. This is the
  // SAME pattern as Raichu above (real content this pipeline's other gates
  // haven't caught up to), not a case of blindly re-adding the "known
  // unreleased/datamined" names this file's sibling fetchCache.ts used to warn
  // about (Falinks/Malamar/Chesnaught/Delphox/Greninja) — those specific 5
  // have genuinely shipped since that comment was written; see fetchCache.ts's
  // updated fetchGameMasterData doc comment.
  //
  // Debuted 2026-02-20 per Bulbapedia. Confirmed via two sources independent
  // of both Bulbapedia and GAME_MASTER, checked 2026-09-06: Serebii.net's
  // Pokémon GO Mega Evolution list (type + Max CP, serebii.net/pokemongo/
  // megaevolution.shtml) and Pokémon GO Hub's own raid guide (base
  // Attack/Defense/Stamina) — both agree with each other and with GAME_MASTER's
  // tempEvoOverrides on type and stats; see gameMasterCrossChecks.
  //
  // lastKnownRaidTier "Super Mega Raids" for all three (2026-09-07 research
  // pass): pokemongohub.net's per-species raid guides state this explicitly —
  // "Mega Dragonite is a Dragon and Flying type Super Mega Raid boss" (also:
  // "Super Mega Dragonite Raids require a minimum of 10 Trainers"),
  // "Super Mega Raids require a minimum of 8 trainers to defeat them" (Mega
  // Victreebel's guide), "Mega Malamar is a Dark and Psychic type Super Mega
  // Raid boss." (pokemongohub.net/post/raid-guide/mega-{dragonite,victreebel,
  // malamar}-raid-guide/, all checked 2026-09-07). Note: leekduck.com's own
  // "Mega Ascension" event page, fetched the same day, only says "Mega Raids
  // will make up the majority of raids during the Mega Ascension event" in
  // generic terms and doesn't call out these three specifically — not treated
  // as contradicting the three explicit, per-species Pokémon GO Hub quotes
  // above, since it's a generic event-wide summary line, not a per-boss tier
  // list.
  { name: "Mega Victreebel", lastKnownRaidTier: "Super Mega Raids" },
  { name: "Mega Dragonite", lastKnownRaidTier: "Super Mega Raids" },
  { name: "Mega Malamar", lastKnownRaidTier: "Super Mega Raids" },

  // Debuted 2026-05-23 per Bulbapedia — a Pokémon-GO-exclusive mega (Falinks
  // doesn't mega evolve in the mainline games at all). Confirmed via
  // Serebii.net's Mega Evolution list (Fighting type, Max CP 4149), checked
  // 2026-09-06. No independent raid-guide base-stat breakdown was found for
  // this one (unlike the two above/below it), so only a type-level
  // cross-check against GAME_MASTER is applied below, not a full stat
  // assertion — flagged in gameMasterCrossChecks as "type-only".
  //
  // lastKnownRaidTier left UNSET (2026-09-07 research pass): no
  // pokemongohub.net raid guide exists for Mega Falinks (search returned "No
  // posts to display"), and no other independent source naming a specific
  // raid tier for it was found after a genuine search (leekduck.com's events
  // list has no Falinks-named event at all, Bing search returned nothing
  // relevant). Left unset rather than guessed — falls through to the
  // rarity/boost heuristic (STANDARD-rarity mega -> "Mega Raids").
  { name: "Mega Falinks" },

  // Debuted 2026-05-24 per Bulbapedia, alongside Mega Mewtwo Y. Confirmed via
  // Serebii.net (Psychic/Fighting, Max CP 6910) and Pokémon GO Hub's raid
  // guide (base Attack/Defense/Stamina), both checked 2026-09-06, both
  // independent of GAME_MASTER.
  //
  // lastKnownRaidTier "Super Mega Raids" (2026-09-07 research pass):
  // pokemongohub.net/post/raid-guide/mega-mewtwo-x-raid-guide/ states "Mega
  // Mewtwo X is a Psychic and Fighting type Super Mega Raid boss." — matches
  // sibling Mega Mewtwo Y's own tier below.
  { name: "Mega Mewtwo X", lastKnownRaidTier: "Super Mega Raids" },

  // Added 2026-09-07 after the SAME regression class as Mega Skarmory below:
  // Mega Mewtwo Y was previously reachable ONLY through the live ScrapedDuck
  // raid-gap gate (never through this allowlist, and data/raw/mega_pokemon.json
  // has zero Mewtwo entries of any kind). It was live in this morning's raid
  // rotation ("Mega Mewtwo Y | Super Mega Raids"), its rotation ended later
  // the same day, and it silently vanished from species.json the moment the
  // raid gate stopped firing for it — despite being one of the earliest,
  // unambiguously real, permanently-unlockable megas in Pokémon GO (debuted
  // 2026-05-24 per Bulbapedia, alongside sibling Mega Mewtwo X above).
  //
  // No further independent cross-check needed beyond the stat cross-check
  // already wired up in the gap-fill loop in sync-data.ts (runs for every
  // mega-gap candidate regardless of which gate let it through).
  //
  // lastKnownRaidTier "Super Mega Raids": this pipeline's OWN cached
  // data/raw/raids.json from earlier the same day (2026-09-07T14:07:00.318Z
  // fetch, i.e. this project's own first-hand live-feed observation, not a
  // third-party claim — see git history for that file) lists "Mega Mewtwo Y |
  // Super Mega Raids". Same evidence class as the Mega Skarmory entry below.
  // Matches sibling Mega Mewtwo X's own "Super Mega Raids" tier above.
  { name: "Mega Mewtwo Y", lastKnownRaidTier: "Super Mega Raids" },

  // Debuted 2026-08-22 per Bulbapedia. Confirmed via Serebii.net
  // (Water/Psychic, Max CP 4184) and Pokémon GO Hub's raid guide (base
  // Attack/Defense/Stamina), both checked 2026-09-06.
  //
  // lastKnownRaidTier "Super Mega Raids" (2026-09-07 research pass):
  // pokemongohub.net/post/raid-guide/mega-starmie-raid-guide/ states "Mega
  // Starmie is a Water and Psychic type Super Mega Raid boss."
  { name: "Mega Starmie", lastKnownRaidTier: "Super Mega Raids" },

  // Debuted 2026-08-28 (Pokémon World Championships) and again 2026-09-05/06
  // (Pokémon GO Fest 2026: Mega Finale, confirmed live via leekduck.com/events/
  // as of 2026-09-06) as part of the Kalos-starter-trio mega reveal, per
  // Bulbapedia. Confirmed via Serebii.net's Mega Evolution list (type + Max
  // CP), checked 2026-09-06. No independent raid-guide base-stat breakdown
  // was found yet for these three (recent enough that community sites hadn't
  // published one as of this sync), so only a type-level cross-check against
  // GAME_MASTER is applied below for each — flagged in gameMasterCrossChecks
  // as "type-only".
  //
  // lastKnownRaidTier left UNSET for all three (2026-09-07 research pass):
  // leekduck.com/events/pokemon-go-fest-2026-mega-finale/ (checked 2026-09-07)
  // describes these three as obtained via GO Pass progression — "Trainers can
  // choose Chespin, Fennekin, or Froakie to begin a Mega Evolution–focused
  // journey leading to Mega Evolving them into Mega Chesnaught, Mega Delphox,
  // or Mega Greninja" — not via a raid encounter at all, so there is no
  // confirmed raid tier to record for their debut. No pokemongohub.net raid
  // guide exists for any of the three either. Left unset rather than
  // guessed — falls through to the rarity/boost heuristic.
  { name: "Mega Chesnaught" },
  { name: "Mega Delphox" },
  { name: "Mega Greninja" },

  // Added 2026-09-07 after a real regression this specific gap-fill mechanism
  // exists to prevent: today's ScrapedDuck rotation flipped away from the
  // "Mega Ascension" raid set (Mega Steelix/Skarmory/Aggron/Glalie) to a new
  // set (Mega Raichu Y/Sableye/Mawile/Audino), and Mega Skarmory dropped out
  // of species.json entirely — it is absent from pogoapi.net's
  // mega_pokemon.json roster (confirmed missing as of this sync's fetch) and,
  // once the rotation ended, was no longer a currently-live raid either, so it
  // fell through BOTH of this pipeline's other released-content gates
  // simultaneously. It is real, released content regardless: this pipeline's
  // OWN cached data/raw/raids.json from earlier the same day (2026-09-07,
  // 05:01 UTC fetch, i.e. this project's own first-hand live-feed
  // observation, not a third-party claim) lists "Mega Skarmory | Mega Raids"
  // — it was raiding just hours before this rotation. Previously reachable
  // only through the raid gate (megaOrPrimalRaidGaps), never through this
  // allowlist, which is exactly why it silently vanished the moment the raid
  // gate stopped firing for it.
  //
  // No further independent cross-check beyond the stat cross-check already
  // wired up in the gap-fill loop in sync-data.ts (see the "Mega Skarmory"
  // branch in gameMasterCrossChecks, comparing against Dittobase + Pokémon GO
  // Hub DB, both agreeing exactly, checked 2026-09-06) — that check already
  // runs for every mega-gap candidate regardless of which gate let it
  // through, so it still applies here.
  //
  // lastKnownRaidTier "Mega Raids": this pipeline's own 2026-09-07 live-feed
  // observation (data/raw/raids.json, "Mega Skarmory | Mega Raids") — a real
  // observation, not a guess.
  { name: "Mega Skarmory", lastKnownRaidTier: "Mega Raids" },
];
