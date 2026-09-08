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

export interface RawGameMasterEvolutionBranchFull {
  temporaryEvolution?: string;
  temporaryEvolutionEnergyCost?: number;
  temporaryEvolutionEnergyCostSubsequent?: number;
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
  tempEvoOverrides?: RawGameMasterTempEvoOverrideFull[];
  evolutionBranch?: RawGameMasterEvolutionBranchFull[];
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
 * only relevant above `maxNormalUpgradeLevel`. Deliberately NOT modeled here:
 * a per-species override block (`POKEMON_UPGRADE_OVERRIDE_SETTINGS_V0890_
 * POKEMON_ETERNATUS`, 30x candy) — v1 of this pipeline's power-up cost table
 * is universal-only, see fetchGameMasterData's doc comment for why that
 * override is deliberately ignored rather than modeled.
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

/** Raw shape of the SINGLE `templateId: "LUCKY_POKEMON_SETTINGS"` entry in GAME_MASTER — only `powerUpStardustDiscountPercent` (a Lucky Pokémon's power-up Stardust discount) is consumed by this pipeline. */
export interface RawGameMasterLuckyPokemonSettingsFull {
  powerUpStardustDiscountPercent?: number;
}

export interface RawGameMasterFullEntry {
  templateId?: string;
  data?: {
    pokemonSettings?: RawGameMasterPokemonSettingsFull;
    moveSettings?: RawGameMasterMoveSettingsFull;
    pokemonUpgrades?: RawGameMasterPokemonUpgradeSettingsFull;
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
