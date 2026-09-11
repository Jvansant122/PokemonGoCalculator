/**
 * Raw pogoapi/ScrapedDuck/GAME_MASTER shapes (subset of fields sync-data.ts
 * and its helper modules read) plus the pipeline-internal bookkeeping types
 * built on top of them. Pure type declarations only — split out of
 * sync-data.ts as part of a 2026-09-06 code-simplifier-prompted reorg (see
 * that file's module docstring); no behavior lives here.
 */

export interface RawPokemonStatsEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  base_attack: number;
  base_defense: number;
  base_stamina: number;
}

export interface RawPokemonTypesEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  type: string[];
}

export interface RawMoveEntry {
  move_id: number;
  name: string;
  type: string;
  power: number;
  energy_delta: number;
  duration: number;
}

export interface RawCurrentMovesEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  fast_moves: string[];
  charged_moves: string[];
  elite_fast_moves: string[];
  elite_charged_moves: string[];
}

export interface RawRaidEntry {
  name: string;
  tier: string;
  canBeShiny?: boolean;
  types?: { name: string }[];
}

/**
 * Shape of a single entry from https://pogoapi.net/api/v1/mega_pokemon.json.
 * `pokemon_id`/`pokemon_name`/`form` describe the BASE (non-mega) species —
 * that's what current_pokemon_moves.json and fast/charged move learnsets are
 * keyed on, since a mega form doesn't get its own separate learnset in the
 * live game. `mega_name` and `stats` describe the mega/primal form itself.
 *
 * As of the 2026-09-06 GAME_MASTER pipeline switch, this endpoint's `stats`/
 * `type` fields are no longer the primary source of truth for a mega/primal's
 * base stats/typing (GAME_MASTER's own tempEvoOverrides are, via
 * resolveMegaFromGameMaster in ./gameMasterMatching.ts) — this file's role is
 * now purely the RELEASED-content roster/allowlist (which (pokemon_id,
 * mega-form-suffix) pairs are real, live content), with `stats`/`type` kept
 * only as a same-shape fallback for the rare case GAME_MASTER has no matching
 * tempEvoOverrides block for one of these (not observed in the 2026-09-06
 * audit — all 48 matched exactly — but budgeted for regardless).
 */

export interface RawMegaPokemonEntry {
  first_time_mega_energy_required: number;
  form: string;
  mega_energy_required: number;
  mega_name: string;
  pokemon_id: number;
  pokemon_name: string;
  stats: {
    base_attack: number;
    base_defense: number;
    base_stamina: number;
  };
  type: string[];
}

export interface ActiveRaidEntry {
  raidName: string;
  tier: string;
  speciesId: string | null;
  isApproximate: boolean;
}

/**
 * A single row of data/normalized/raidHistory.json — an append-only,
 * ever-growing record of every species this pipeline has ever confirmed as a
 * real raid boss, kept because activeRaids.json is a full-replace snapshot
 * (a rotated-out boss vanishes from it with no trace) whereas this file never
 * deletes. See the "Raid history" section of sync-data.ts for how it's built.
 * Schema is pinned (packages/web is written against these exact field names
 * in parallel) — do not rename fields here without updating that consumer.
 */
export interface RaidHistoryEntry {
  /** Registered species id, e.g. "skarmory-mega". Never null — an entry with no resolvable species is not recorded at all. */
  speciesId: string;
  /** The raid name as the live feed presented it, e.g. "Mega Skarmory". For a seeded entry with no feed observation, falls back to the species' own `name`. */
  raidName: string;
  /** A tier string. Prefer one this project's RaidTier union recognizes; see `source` for provenance. */
  tier: string;
  /** ISO timestamp of the first sync run that recorded this entry. */
  firstSeenAt: string;
  /** ISO timestamp of the most recent sync run that observed it in the live feed. For a "researched-tier" seed never yet seen live, equal to firstSeenAt. */
  lastSeenAt: string;
  /**
   * Provenance, so the UI can be honest about how strong the evidence is:
   *  - "live-feed": this pipeline actually observed it in data/raw/raids.json on some run.
   *  - "researched-tier": seeded from species.lastKnownRaidTier without this pipeline ever having seen it live (e.g. from RELEASED_MEGA_PRIMAL_ALLOWLIST's hand-researched citations).
   *  - "pogoapi-previous": seeded from pogoapi.net's raid_bosses.json `previous` list (2026-09-07 backfill) — a real historical raid-boss appearance this pipeline never itself observed live and that carries no hand-researched citation either.
   *  - "bulbapedia-archive": seeded from Bulbapedia's "List of Raid Boss changes in ..." archive pages (2026-09-07 union backfill) — the same kind of real historical appearance as "pogoapi-previous", from an independent community archive that covers ~26 base species pogoapi's own `previous` list is missing entirely (Heatran among them).
   *  - "pokebattler-legacy": seeded from Pokebattler's `_LEGACY` raid tiers (fight.pokebattler.com, 2026-09-08 import — see scripts/sync-data/pokebattlerRaids.ts's top-of-file doc comment) — a third independent historical archive, larger than the pogoapi+Bulbapedia union (~741 distinct species). NEVER carries `eraHp`: Pokebattler re-maps its own history onto MODERN tier labels with no era fidelity (confirmed 2026-09-08 — e.g. its `RAID_LEVEL_4_LEGACY` holds Community Day four-star bosses, not the real pre-2020 tier 4), so an HP value derived from it would misrepresent history exactly the way this field exists to avoid.
   * "pogoapi-previous", "bulbapedia-archive", and "pokebattler-legacy" are peers, jointly the lowest-precedence tier: between each other, whichever's tier maps to the higher RAID_TIER_TABLE HP wins on a same-species conflict (see sync-data.ts's "archive union" / "Pokebattler legacy archive backfill" sections for the conflict counts this produces); any of the three can be upgraded in place by another on a later run without that counting as an overwrite of a "live-feed"/"researched-tier" entry. None of the three ever overwrites a "live-feed" or "researched-tier" entry, and "live-feed" always wins if an entry is later observed live.
   */
  source: "live-feed" | "researched-tier" | "pogoapi-previous" | "bulbapedia-archive" | "pokebattler-legacy";
  /**
   * The real boss max HP recorded for this specific historical encounter
   * (2026-09-07 era-HP backfill task) — NOT today's `raidTierStats(tier).hp`,
   * which has changed over time for the same `tier` label (the 2020-08-27
   * merge folded the old tier-2/tier-4 HP values into tier-1/tier-3; tier-3's
   * own HP separately changed 3000->3600 on 2019-02-03; Mega's changed
   * 15000->9000(ish)/back on various dates — see this task's own research
   * notes). Sourced ONLY from a Bulbapedia `{{lop/raid/GO|...}}` archive
   * row's own positional HP field, for the specific row whose resolved tier
   * won this species' highest-tier collapse (see sync-data.ts's "Bulbapedia
   * archive union" section) — never mixed with a tier resolved from a
   * different row/era. Every captured value is validated against the closed
   * set of plausible raid-HP magnitudes (600/1800/3000/3600/9000/12500/
   * 15000/20000/22500/25000); a row whose positional HP field doesn't match
   * is treated as unparseable and never stored (see sync-data's WARNINGS for
   * a count).
   *
   * pogoapi.net's `previous` list (the OTHER archive source feeding
   * "pogoapi-previous" entries) carries no HP field and no dates at all, so
   * this is undefined — genuinely absent, not a laundered
   * `raidTierStats(tier).hp` — for any species Bulbapedia's archive doesn't
   * also cover. Undefined means "no era HP known; fall back to the tier's
   * current stats," not "zero HP."
   *
   * Deliberately NOT gated on `source === "bulbapedia-archive"`: a species
   * covered by BOTH archive sources keeps whichever source's TIER won the
   * union (so `source` may read "pogoapi-previous"), but if Bulbapedia's own
   * archive independently resolved to that exact same real tier for this
   * species, its HP is still attached here — maximum honest era-HP coverage,
   * not coverage tied to which source's label happened to win.
   */
  eraHp?: number;
}

/**
 * One entry from the `previous` bucket of
 * https://pogoapi.net/api/v1/raid_bosses.json — pogoapi's own historical
 * record of every raid boss it has ever scraped, grouped by tier key
 * ("1"|"2"|"3"|"4"|"5"|"6"|"ex"|"mega"|"mega_legendary"). No date field
 * exists on these entries — pogoapi does not record WHEN a boss was active,
 * only THAT it was. `form` is "Normal" for most species but also carries
 * real distinguishing values: region variants ("Alola"/"Galarian"/
 * "Hisuian"), Unown's per-letter forms, Deoxys's formes, and — for `mega`/
 * `mega_legendary` entries specifically — the mega-form suffix itself
 * ("X"/"Y" for a two-mega species like Charizard, "Normal" for a
 * single-mega/primal species), matching mega_pokemon.json's own `form`
 * field convention exactly. See sync-data.ts's raidHistory "pogoapi-previous
 * backfill" section for how a `mega`/`mega_legendary` entry's `name` (the
 * BASE species, e.g. "Kyogre") + `form` gets resolved to the correct
 * mega/primal species id (e.g. "kyogre-primal") rather than the base one.
 */
export interface RawRaidBossesPreviousEntry {
  name: string;
  form: string;
  tier: number | string;
  type: string[];
}

/** Shape of the full https://pogoapi.net/api/v1/raid_bosses.json response — `current` (this pipeline doesn't use it; the ScrapedDuck feed is the live-raid source) plus `previous`, this pipeline's raidHistory.json backfill source (see RawRaidBossesPreviousEntry). */
export interface RawRaidBossesResponse {
  current: Record<string, RawRaidBossesPreviousEntry[]>;
  previous: Record<string, RawRaidBossesPreviousEntry[]>;
}

/**
 * Raw shapes read directly off a live GAME_MASTER dump (PokeMiners' mirror of
 * Niantic's own client-side file — see GAME_MASTER_URL in fetchCache.ts).
 * As of the 2026-09-06 full-pipeline switch, GAME_MASTER is the PRIMARY
 * source for every real species' stats/typing/moveset/rarity (not just a
 * mega/primal-stat-gap fallback) — see fetchGameMasterData in fetchCache.ts,
 * which extracts these into the far more compact GameMasterPokemonRecord/
 * GameMasterMoveRecord shapes below for caching and downstream use, so these
 * "Raw*Full" types are only ever seen during that one extraction pass, never
 * held onto or written to data/raw/ in this full shape.
 */
export interface RawGameMasterTempEvoOverrideFull {
  tempEvoId?: string;
  stats?: { baseStamina: number; baseAttack: number; baseDefense: number };
  typeOverride1?: string;
  typeOverride2?: string;
}

/**
 * One entry of a pokemonSettings template's `evolutionBranch` array. Widened
 * 2026-09-08 (Phase 0 of PLAN_multi_raid_roster_optimizer.md) beyond the
 * original three `temporaryEvolution*` fields to also model a REAL (non-mega/
 * primal) evolution branch — confirmed directly against the live 2026-09-08
 * GAME_MASTER dump: a branch carries EITHER a real `evolution` target (e.g.
 * Beldum -> `{ evolution: "METANG", candyCost: 25, form: "METANG_NORMAL",
 * candyCostPurified: 22 }`) OR a `temporaryEvolution` id (mega/primal), never
 * both on the same entry. `form` is present on most real branches but not all
 * (e.g. Totodile -> Croconaw carries no `form`). See
 * GameMasterEvolutionBranchRecord below and isFullyEvolved's doc comment in
 * ./gameMasterMatching.ts for the trap this exists to avoid: a template's
 * ENTIRE evolutionBranch array can hold ONLY temporaryEvolution entries
 * (confirmed for Venusaur/Charizard/Blastoise/Beedrill/Metagross among 123 of
 * 1107 templates carrying a branch at all in the 2026-09-06 audit), so
 * `evolutionBranch.length > 0` alone is NOT "has a real evolution left."
 *
 * Widened again 2026-09-10 (data-sync's "Normalize evolution candy costs"
 * task) with the full set of REAL requirement-gating fields a live branch can
 * carry beyond `candyCost` — confirmed by direct inspection of the live
 * 2026-09-10 dump (fetched fresh from PokeMiners, not this project's own
 * narrowed `data/raw/game_master.json` cache, which never carried these
 * fields to begin with): 84 branches need an `evolutionItemRequirement`
 * (Gloom -> Bellossom needs a Sun Stone; Onix -> Steelix needs a Metal Coat;
 * 5 of those 84 — Zygarde's two form branches, Gimmighoul -> Gholdengo —
 * carry NO `candyCost` at all, gated on item count alone), 15 need a
 * `lureItemRequirement` (Magneton -> Magnezone needs a Magnetic Lure Module
 * active on a nearby Pokéstop), 4 need `mustBeBuddy`/`kmBuddyDistanceRequirement`
 * (Eevee -> Espeon/Umbreon), 28 carry a `genderRequirement` (Kirlia -> Gallade
 * needs a male Kirlia), and a further ~26 are time/event-gated
 * (`onlyDaytime`/`onlyNighttime`/`onlyDuskPeriod`/`onlyFullMoon`/
 * `onlyUpsideDown`). `questDisplay` marks a branch gated behind a special-
 * research-style quest (e.g. Sylveon's own quest, on top of its plain 25
 * candy) — this project only records WHETHER one is present, never the quest
 * template's own content (no source for that here). `noCandyCostViaTrade` is
 * the one real exception to "these only ever ADD a requirement": Kadabra ->
 * Alakazam and the 3 other real GO trade-evolution species (a real, live GO
 * mechanic — trading a Pokémon and then evolving it waives the candy cost)
 * can only ever make a branch CHEAPER than its stated `candyCost`, never
 * pricier or blocked, so data-sync's `candyCostOnly` derivation (see
 * sync-data.ts's evolution-resolution pass) deliberately does NOT treat it as
 * a non-candy requirement — see that derivation's own doc comment.
 */
export interface RawGameMasterEvolutionBranchFull {
  /** The pokemonId enum this branch evolves into, e.g. "METANG" — present only on a REAL evolution branch, never a temporaryEvolution one. */
  evolution?: string;
  /** Candy cost of this real evolution (e.g. 25 for Beldum -> Metang). Undefined on a temporaryEvolution branch AND on the handful of real branches gated on a non-candy item count instead (Zygarde's own forms, Gimmighoul -> Gholdengo). */
  candyCost?: number;
  /** Purified-Pokémon candy cost for this same real evolution (Bulbapedia: ×0.8 discount — NOT the ×0.9 this project's power-up cost table uses for power-ups, see MECHANICS.md). Undefined on a temporaryEvolution branch. */
  candyCostPurified?: number;
  /** GAME_MASTER's own form key for the evolved species, e.g. "METANG_NORMAL". Present on most real branches, absent on a few (e.g. Totodile -> Croconaw). */
  form?: string;
  temporaryEvolution?: string;
  temporaryEvolutionEnergyCost?: number;
  temporaryEvolutionEnergyCostSubsequent?: number;
  /** e.g. "ITEM_SUN_STONE", "ITEM_METAL_COAT" — an evolution item the trainer must hold, beyond candy. */
  evolutionItemRequirement?: string;
  /** How many of `evolutionItemRequirement` are consumed (e.g. Gimmighoul Coins) — only meaningful alongside that field; most item-gated branches consume exactly 1 and omit this. */
  evolutionItemRequirementCost?: number;
  /** e.g. "ITEM_TROY_DISK_MAGNETIC" — must be evolved while this specific Lure Module is active on a nearby Pokéstop. */
  lureItemRequirement?: string;
  /** True only for Eevee -> Espeon/Umbreon: the evolving Pokémon must currently be the trainer's set buddy. */
  mustBeBuddy?: boolean;
  /** Cumulative buddy-walking km required alongside `mustBeBuddy` (Eevee -> Espeon/Umbreon: 10). */
  kmBuddyDistanceRequirement?: number;
  /** "MALE" or "FEMALE" — the evolving individual's gender must match (e.g. Kirlia -> Gallade: MALE only). */
  genderRequirement?: string;
  /** Must be evolved during real-world daytime (local device clock) — Eevee -> Espeon. */
  onlyDaytime?: boolean;
  /** Must be evolved during real-world nighttime — Eevee -> Umbreon. */
  onlyNighttime?: boolean;
  /** Must be evolved during the dusk window (Rockruff's one-time Dusk-form Lycanroc pick). */
  onlyDuskPeriod?: boolean;
  /** Must be evolved during a real-world full moon (Ursaring -> Ursaluna). */
  onlyFullMoon?: boolean;
  /** Must be evolved with the device held upside-down (Inkay -> Malamar). */
  onlyUpsideDown?: boolean;
  /** Present (any non-empty array) marks a branch gated behind a special-research-style quest on top of its stated candyCost (e.g. Sylveon) — only presence is recorded, never the quest template's own content. */
  questDisplay?: unknown[];
  /** Real GO mechanic (not a mainline-only vestige): waives the candy cost entirely if the evolving Pokémon was received via an in-game trade (Kadabra/Machoke/Graveler/Haunter and a few others). Never makes a branch MORE expensive — see this interface's own doc comment for why `candyCostOnly` ignores it. */
  noCandyCostViaTrade?: boolean;
}

/**
 * One group within a `formChange[].moveReassignment.cinematicMoves`/
 * `.quickMoves` array — see MECHANICS.md's "Form-change `moveReassignment`
 * grants moves that appear in no movepool array" and
 * scripts/sync-data/formChangeMoveGrants.ts for the full semantics:
 * `existingMoves` names moves the DECLARING form (the pokemonSettings
 * template this formChange entry sits on) holds; `replacementMoves` names
 * moves the TARGET form (formChange[].availableForm) holds after the
 * transition. Either key can be absent ENTIRELY (confirmed live: the
 * Necrozma/Kyurem FUSE entries carry only `replacementMoves` — not an empty
 * array, the key itself is missing).
 */
export interface RawGameMasterMoveReassignmentGroupFull {
  existingMoves?: string[];
  replacementMoves?: string[];
}

/** `formChange[].moveReassignment` — carries `cinematicMoves` (observed live, 2026-09-10 audit) and, structurally, `quickMoves` (never observed live as of that audit, handled anyway per this pipeline's "route each to the right movepool" requirement — see formChangeMoveGrants.ts). */
export interface RawGameMasterMoveReassignmentFull {
  cinematicMoves?: RawGameMasterMoveReassignmentGroupFull[];
  quickMoves?: RawGameMasterMoveReassignmentGroupFull[];
}

/**
 * One entry of a pokemonSettings template's `formChange` array — a form-
 * TRANSITION table (Crowned Sword <-> Hero, Kyurem fusion/un-fusion, Necrozma
 * fusion/un-fusion), NOT a movepool. Most of its real fields (candyCost,
 * item, componentPokemonSettings, locationCardSettings,
 * requiredCinematicMoves, formChangeBonusAttributes, requiredBreadMoves,
 * priority) govern the in-game form-change UI/requirements and are
 * irrelevant to this pipeline — only `availableForm` (the target form this
 * entry transitions TO) and `moveReassignment` (see above) are extracted.
 * See fetchGameMasterData's doc comment (./fetchCache.ts) for the extraction
 * pass and formChangeMoveGrants.ts for the resolution pass built on this.
 */
export interface RawGameMasterFormChangeFull {
  availableForm?: string[];
  moveReassignment?: RawGameMasterMoveReassignmentFull;
}

export interface RawGameMasterPokemonSettingsFull {
  pokemonId: string;
  /**
   * GAME_MASTER's own form field, e.g. "GIRATINA_ALTERED" — already includes
   * the pokemonId enum as a prefix. Undefined for the "bare" template every
   * pokemonId has at least one of (see resolveGameMasterPokemonRecord in
   * ./gameMasterMatching.ts).
   */
  form?: string;
  type?: string;
  type2?: string;
  stats?: { baseStamina: number; baseAttack: number; baseDefense: number };
  quickMoves?: string[];
  cinematicMoves?: string[];
  eliteQuickMove?: string[];
  eliteCinematicMove?: string[];
  /** e.g. "POKEMON_CLASS_LEGENDARY" — absent means Standard. See pokemonClassToRarity. */
  pokemonClass?: string;
  /**
   * GAME_MASTER's own evolutionary-family grouping key, e.g. "FAMILY_BELDUM"
   * for Beldum/Metang/Metagross — confirmed present on all 2472
   * pokemonSettings templates in the 2026-09-08 audit, identical across every
   * template sharing a pokemonId enum. Added 2026-09-08 for
   * PLAN_multi_raid_roster_optimizer.md §3.4's candy-family pooling (not yet
   * consumed by the pipeline itself — see GameMasterPokemonRecord.familyId).
   */
  familyId?: string;
  /**
   * Buddy-walking distance (km) required to earn a candy for this SPECIFIC
   * template's pokemonId, e.g. `20` for Zacian. Added 2026-09-10 for the
   * Power-Up Optimizer's second-charged-move cost model (see MECHANICS.md's
   * "Second charged move unlock" — previously `[community-consensus]` for
   * the tiering key itself; this is the first-party source for it). Present
   * on all 2472 pokemonSettings templates with a `stats` block in the
   * 2026-09-10 dump (no observed missing case) and always one of {1, 3, 5,
   * 20} — see GameMasterPokemonRecord.kmBuddyDistance's doc comment for the
   * per-species-not-per-family caveat this implies for a family-keyed cost
   * lookup.
   */
  kmBuddyDistance?: number;
  tempEvoOverrides?: RawGameMasterTempEvoOverrideFull[];
  evolutionBranch?: RawGameMasterEvolutionBranchFull[];
  /**
   * A form-TRANSITION table (see RawGameMasterFormChangeFull above) — added
   * 2026-09-10, previously discarded entirely at fetch time (see
   * fetchGameMasterData's doc comment in ./fetchCache.ts). Kept through to
   * GameMasterPokemonRecord.formChange (filtered to move-bearing entries
   * only) rather than consumed here directly, since a formChange entry's
   * TARGET form may be a template this extraction pass hasn't visited yet.
   */
  formChange?: RawGameMasterFormChangeFull[];
}

export interface RawGameMasterMoveSettingsFull {
  /**
   * Almost always a string (e.g. "PSYCHO_CUT_FAST") but confirmed 2026-09-06
   * to be a raw malformed NUMBER on 22 real GAME_MASTER entries (a GAME_MASTER
   * data-quality issue, not a parsing bug on this project's end) — see
   * fetchGameMasterData's templateId-recovery fallback in fetchCache.ts.
   */
  movementId?: string | number;
  pokemonType?: string;
  power?: number;
  energyDelta?: number;
  durationMs?: number;
}

/**
 * Raw shape of the SINGLE `templateId: "POKEMON_UPGRADE_SETTINGS"` entry in
 * GAME_MASTER — the universal per-level candy/stardust power-up cost table,
 * previously discarded entirely by fetchGameMasterData's extraction (see its
 * doc comment). Fields are typed optional here because this is the raw,
 * unvalidated shape straight off the wire; fetchGameMasterData is what
 * decides whether a parsed instance is usable (see GameMasterUpgradeSettingsRecord
 * below) — never assume this template is well-formed just because it's present.
 * `xlCandyCost`/`xlCandyMinPlayerLevel`/`xlCandyMinPokemonLevel` govern XL candy,
 * only relevant above `maxNormalUpgradeLevel`.
 *
 * Also reused verbatim (same field shape) as the raw type for a per-species
 * OVERRIDE entry (`POKEMON_UPGRADE_OVERRIDE_SETTINGS_V####_POKEMON_<NAME>`,
 * e.g. `..._V0890_POKEMON_ETERNATUS`) — see
 * RawGameMasterPokemonUpgradeOverrideFull/GameMasterUpgradeOverrideRecord
 * below. As of 2026-09-10 this data IS extracted (data-sync's "per-species
 * power-up cost overrides" task) into
 * GameMasterFetchResult.perSpeciesUpgradeOverrides and
 * data/normalized/powerUpCosts.json's `perSpeciesUpgradeOverrides`, RAW and
 * uninterpreted — see that field's own doc comment. The universal-vs-override
 * disambiguation is now by exact `templateId` match
 * (`=== "POKEMON_UPGRADE_SETTINGS"`), NOT merely "this entry has a
 * `data.pokemonUpgrades` object" — an override entry's `data.pokemonUpgrades`
 * has the exact same shape and would otherwise satisfy the old, looser check
 * too (confirmed 2026-09-10: in a live dump the Eternatus override entry
 * happens to precede the universal template by one array position, so the
 * old loose check was overwritten back to the universal table by the time
 * the loop finished and never actually corrupted output — but this was
 * ordering-dependent luck, not a guarantee, so the guard was tightened as
 * part of this same change rather than left latent).
 */
export interface RawGameMasterPokemonUpgradeSettingsFull {
  upgradesPerLevel?: number;
  allowedLevelsAbovePlayer?: number;
  candyCost?: number[];
  stardustCost?: number[];
  shadowStardustMultiplier?: number;
  shadowCandyMultiplier?: number;
  purifiedStardustMultiplier?: number;
  purifiedCandyMultiplier?: number;
  maxNormalUpgradeLevel?: number;
  defaultCpBoostAdditionalLevel?: number;
  xlCandyMinPlayerLevel?: number;
  xlCandyCost?: number[];
  xlCandyMinPokemonLevel?: number;
}

/** Alias — see RawGameMasterPokemonUpgradeSettingsFull's doc comment for why this is the identical shape reused for a per-species override entry's `data.pokemonUpgrades`. */
export type RawGameMasterPokemonUpgradeOverrideFull = RawGameMasterPokemonUpgradeSettingsFull;

/** Raw shape of the SINGLE `templateId: "LUCKY_POKEMON_SETTINGS"` entry in GAME_MASTER — only `powerUpStardustDiscountPercent` (a Lucky Pokémon's power-up Stardust discount) is consumed by this pipeline. */
export interface RawGameMasterLuckyPokemonSettingsFull {
  powerUpStardustDiscountPercent?: number;
}

export interface RawGameMasterFullEntry {
  templateId?: string;
  data?: {
    pokemonSettings?: RawGameMasterPokemonSettingsFull;
    moveSettings?: RawGameMasterMoveSettingsFull;
    pokemonUpgrades?: RawGameMasterPokemonUpgradeSettingsFull | RawGameMasterPokemonUpgradeOverrideFull;
    luckyPokemonSettings?: RawGameMasterLuckyPokemonSettingsFull;
  };
}

/**
 * One mega/primal tempEvoOverrides block, extracted and slightly reshaped
 * from RawGameMasterTempEvoOverrideFull (see fetchGameMasterData). `hasTypeOverride`
 * matters because a tempEvo that redefines typing but ends up single-type
 * (e.g. Mega Aggron: Steel/Rock -> pure Steel) sets typeOverride1 with NO
 * typeOverride2 — that absence means "this form only has one type", NOT
 * "keep the base species' type2" (confirmed 2026-09-06 via Mega Aggron
 * cross-check against pogoapi's already-real mega_pokemon.json entry: base
 * Aggron is Steel/Rock, pogoapi's Mega Aggron is pure Steel, and GAME_MASTER
 * only matches that if the fallback-to-base-type2 is suppressed whenever ANY
 * type override is present at all). See resolveMegaFromGameMaster in
 * ./gameMasterMatching.ts for the consuming logic.
 */
export interface GameMasterTempEvoOverrideRecord {
  tempEvoId: string;
  baseAttack: number;
  baseDefense: number;
  baseStamina: number;
  typeOverride1?: string;
  typeOverride2?: string;
  hasTypeOverride: boolean;
  firstTimeMegaEnergyRequired?: number;
  megaEnergyRequired?: number;
}

/**
 * One REAL (non-mega/primal) evolution branch off a GAME_MASTER pokemonSettings
 * template, extracted alongside tempEvoOverrides in the SAME pass over the
 * live dump (see fetchGameMasterData in ./fetchCache.ts) — mega/primal
 * temporaryEvolution branches are deliberately excluded from this array
 * entirely (they're already captured in tempEvoOverrides), so every entry
 * here always has a real `evolution` target. Added 2026-09-08, Phase 0 of
 * PLAN_multi_raid_roster_optimizer.md §3.6 (the Power-Up Optimizer's
 * "unevolved Pokémon are not power-up candidates" filter) — see
 * isFullyEvolved's doc comment in ./gameMasterMatching.ts for why a
 * template's evolutionBranch being non-empty is NOT itself sufficient to
 * conclude a species can still evolve (that's exactly the trap this
 * pre-filtered shape avoids downstream).
 */
export interface GameMasterEvolutionBranchRecord {
  evolution: string;
  form?: string;
  candyCost?: number;
  candyCostPurified?: number;
  /** See RawGameMasterEvolutionBranchFull's own field-by-field doc comment — these 12 fields are passed through verbatim by fetchGameMasterData's extraction (./fetchCache.ts), added 2026-09-10 for data-sync's "Normalize evolution candy costs" task. */
  evolutionItemRequirement?: string;
  evolutionItemRequirementCost?: number;
  lureItemRequirement?: string;
  mustBeBuddy?: boolean;
  kmBuddyDistanceRequirement?: number;
  genderRequirement?: string;
  onlyDaytime?: boolean;
  onlyNighttime?: boolean;
  onlyDuskPeriod?: boolean;
  onlyFullMoon?: boolean;
  onlyUpsideDown?: boolean;
  requiresQuest?: boolean;
  noCandyCostViaTrade?: boolean;
}

/** Compact echo of RawGameMasterMoveReassignmentGroupFull, cached verbatim as part of GameMasterFormChangeEntryRecord below. */
export interface GameMasterMoveReassignmentGroupRecord {
  existingMoves?: string[];
  replacementMoves?: string[];
}

/**
 * Compact per-declaring-template formChange entry, kept ONLY when it carries
 * a non-empty moveReassignment (every OTHER formChange entry — a plain
 * UNFUSE with no move data, or one whose moveReassignment has neither a
 * cinematicMoves nor a quickMoves group at all — is dropped at extraction
 * time; this pipeline models the move-grant facet of formChange only, never
 * the whole form-change UI/requirements). Cached verbatim to
 * data/raw/game_master.json under each GameMasterPokemonRecord.formChange so
 * the source data behind a granted move stays auditable, separate from the
 * RESOLVED grants applied onto quickMoves/cinematicMoves by
 * resolveFormChangeMoveGrants (./formChangeMoveGrants.ts) — see that module
 * and MECHANICS.md's "Form-change `moveReassignment` grants moves that
 * appear in no movepool array" for the full rule.
 */
export interface GameMasterFormChangeEntryRecord {
  /** GAME_MASTER's own form key(s) this entry transitions to, e.g. ["ZACIAN_CROWNED_SWORD"]. Always length 1 in the 18 real entries found in the 2026-09-10 audit, but the raw field is an array. */
  availableForm: string[];
  cinematicMoves: GameMasterMoveReassignmentGroupRecord[];
  quickMoves: GameMasterMoveReassignmentGroupRecord[];
}

/** Compact per-template species record cached to data/raw/game_master.json. */
export interface GameMasterPokemonRecord {
  pokemonId: string;
  form?: string;
  type?: string;
  type2?: string;
  baseAttack: number;
  baseDefense: number;
  baseStamina: number;
  quickMoves: string[];
  cinematicMoves: string[];
  eliteQuickMoves: string[];
  eliteCinematicMoves: string[];
  pokemonClass?: string;
  tempEvoOverrides: GameMasterTempEvoOverrideRecord[];
  /**
   * GAME_MASTER's own evolutionary-family grouping key (e.g. "FAMILY_BELDUM"),
   * identical across every template sharing this pokemonId enum. Added
   * 2026-09-08 for PLAN_multi_raid_roster_optimizer.md §3.4's candy-family
   * pooling — see RawGameMasterPokemonSettingsFull.familyId. Not yet consumed
   * by sync-data.ts's species-building pass itself — carrying this through
   * data/normalized/species.json needs a SpeciesDefinition schema addition
   * this script does not own; see PLAN_multi_raid_roster_optimizer.md §5
   * "Phase 0" for the scope this was cut from and why.
   */
  familyId?: string;
  /**
   * This template's own REAL evolution branches (already filtered to exclude
   * mega/primal — see GameMasterEvolutionBranchRecord). Added 2026-09-08,
   * same task as `familyId` above and same "not yet wired into
   * species.json" caveat.
   */
  evolutionBranch: GameMasterEvolutionBranchRecord[];
  /**
   * Buddy-walking distance (km) required to earn a candy for THIS template's
   * pokemonId — see RawGameMasterPokemonSettingsFull.kmBuddyDistance's doc
   * comment for provenance/completeness. Added 2026-09-10, carried onto
   * data/normalized/species.json (via a sync-data.ts-local type extension,
   * not a SpeciesDefinition schema change — that's engine-developer's call,
   * see CLAUDE.md's "When the schema itself needs to change") for the
   * Power-Up Optimizer's cost model.
   *
   * IMPORTANT: this is keyed to the pokemonId ENUM (one evolutionary stage),
   * NOT the candy family — candy is pooled across a whole family (MECHANICS.md),
   * but kmBuddyDistance is NOT always uniform across one. Confirmed live
   * 2026-09-10: 4 of 541 families disagree between evolutionary stages
   * (Qwilfish 3km -> Overqwil 5km; Sneasel/Weavile 3km -> Sneasler 5km;
   * Stantler 3km -> Wyrdeer 5km; Zigzagoon/Linoone 1km -> Obstagoon 3km — all
   * four are the species that regionally-evolve into a form base Game Freak
   * treats as a materially different Pokémon). It IS uniform across every
   * FORM of the same pokemonId (e.g. base/Hisuian Sneasel both 3km, Zacian
   * Hero/Crowned Sword both 20km) — a per-(pokemonId, form) cost lookup is
   * safe, a per-familyId one is not without picking a specific stage.
   */
  kmBuddyDistance?: number;
  /**
   * This template's own formChange entries, already filtered to move-bearing
   * ones only (see GameMasterFormChangeEntryRecord). Added 2026-09-10.
   * OPTIONAL (unlike tempEvoOverrides/evolutionBranch above, which are
   * required-but-usually-empty arrays) specifically so every existing
   * GameMasterPokemonRecord fixture literal elsewhere in this codebase keeps
   * type-checking unchanged — the overwhelming majority of templates carry
   * none of this data at all (18 real entries across 6 forms, out of ~2472
   * templates in the 2026-09-10 audit). Consumers must read
   * `record.formChange ?? []` — see resolveFormChangeMoveGrants
   * (./formChangeMoveGrants.ts), the sole consumer.
   */
  formChange?: GameMasterFormChangeEntryRecord[];
}

/** Compact per-move record cached to data/raw/game_master.json — this is GAME_MASTER's `moveSettings` (PvE) table, NEVER `combatMove` (PvP/Trainer-Battle-only, different balance numbers for the same move name — verified 2026-09-06 by direct inspection of both tables). */
export interface GameMasterMoveRecord {
  movementId: string;
  pokemonType?: string;
  power: number;
  energyDelta: number;
  durationMs: number;
}

/**
 * Compact, VALIDATED slice of the `POKEMON_UPGRADE_SETTINGS` template, cached
 * to data/raw/game_master.json alongside `pokemon`/`moves` (2026-09-08,
 * Power-Up Optimizer data source — see IDEAS.md's "Power-Up Optimizer" entry
 * and fetchGameMasterData's doc comment in ./fetchCache.ts). Every field here
 * is required and defaulted at extraction time (see fetchGameMasterData) —
 * unlike RawGameMasterPokemonUpgradeSettingsFull above, this is never a
 * half-formed intermediate.
 *
 * Deliberately shaped to match the engine's own `GameMasterPokemonUpgradeSettings`
 * input interface (packages/engine/src/powerUp.ts, `powerUpCostTableFromGameMaster`)
 * FIELD-FOR-FIELD, so a value of this type can be passed there directly with
 * no adapter — once that engine export exists, prefer importing its type
 * from `@pogo-analyzer/engine` instead of this local duplicate; this one only
 * exists because this script was written in parallel with that engine work.
 */
export interface GameMasterUpgradeSettingsRecord {
  upgradesPerLevel: number;
  maxNormalUpgradeLevel: number;
  xlCandyMinPokemonLevel: number;
  stardustCost: number[];
  candyCost: number[];
  xlCandyCost: number[];
  shadowStardustMultiplier: number;
  shadowCandyMultiplier: number;
  purifiedStardustMultiplier: number;
  purifiedCandyMultiplier: number;
}

/**
 * One species-scoped power-up cost override — a
 * `POKEMON_UPGRADE_OVERRIDE_SETTINGS_V####_POKEMON_<NAME>` GAME_MASTER entry
 * (e.g. `..._V0890_POKEMON_ETERNATUS`), extracted by TEMPLATE-ID PATTERN
 * (`^POKEMON_UPGRADE_OVERRIDE_SETTINGS_V\d+_POKEMON_(.+)$`), never a
 * hardcoded species name — see fetchGameMasterData's doc comment
 * (./fetchCache.ts) — so a second one appearing in a future dump is picked
 * up automatically. `pokemonId` is that pattern's captured `<NAME>` group,
 * confirmed 2026-09-10 to match `GameMasterPokemonRecord.pokemonId`
 * byte-for-byte for the one live example (Eternatus) with no form
 * component; a future override scoped to a specific FORM rather than a
 * whole pokemonId is not representable by this pattern as observed and
 * would need this shape (and the pattern) extended — none seen as of this
 * extraction (exactly 1 `*_UPGRADE_OVERRIDE_*`-pattern template in the
 * 2026-09-10 dump, Eternatus).
 *
 * Every field below is OPTIONAL and passed through VERBATIM/RAW (never
 * defaulted, never merged with the universal table's values, never
 * interpreted) — deliberately unlike GameMasterUpgradeSettingsRecord above,
 * so a consumer can tell "this override doesn't mention the field" (should
 * fall back to the universal table) apart from "this override explicitly
 * repeats the universal value." Confirmed live 2026-09-10 for the one real
 * example (Eternatus): `candyCost` and `xlCandyCost` are each an
 * INDEPENDENT REPLACEMENT ARRAY, NOT a fixed multiplier of the universal
 * table (the oft-quoted "30x candy" only holds exactly at level 1; by
 * level 39->40 it's ~59x, and XL candy ranges ~10x-44.5x across its table) —
 * while `stardustCost` and every multiplier/threshold field this override
 * entry carries are BYTE-IDENTICAL to the universal template. See
 * MECHANICS.md's "Per-species cost overrides" for the full comparison and
 * data-sync's report for this task. This project does NOT interpret this
 * data into an actual cost table — `powerUpCostTableFromGameMaster`
 * (packages/engine/src/powerUp.ts) is the sole interpreter, and does not
 * yet consume this field at all (engine-developer's call, see CLAUDE.md's
 * "When the schema itself needs to change").
 */
export interface GameMasterUpgradeOverrideRecord {
  pokemonId: string;
  /** The full source templateId this override was extracted from, e.g. `"POKEMON_UPGRADE_OVERRIDE_SETTINGS_V0890_POKEMON_ETERNATUS"` — kept for auditability. */
  sourceTemplateId: string;
  upgradesPerLevel?: number;
  allowedLevelsAbovePlayer?: number;
  candyCost?: number[];
  stardustCost?: number[];
  shadowStardustMultiplier?: number;
  shadowCandyMultiplier?: number;
  purifiedStardustMultiplier?: number;
  purifiedCandyMultiplier?: number;
  maxNormalUpgradeLevel?: number;
  defaultCpBoostAdditionalLevel?: number;
  xlCandyMinPlayerLevel?: number;
  xlCandyCost?: number[];
  xlCandyMinPokemonLevel?: number;
}
