/**
 * Data-sync script: as of the 2026-09-06 full pipeline switch, this script's
 * PRIMARY source for every real species' base stats/typing/moveset/rarity is
 * a live GAME_MASTER dump (PokeMiners' mirror of Niantic's own client-side
 * game master file — see fetchGameMasterData in scripts/sync-data/
 * fetchCache.ts) rather than pogoapi.net's own per-endpoint JSON
 * (pokemon_stats/pokemon_types/fast_moves/charged_moves/
 * current_pokemon_moves.json). This means a real stat/move/typing change
 * shows up as soon as GAME_MASTER updates, rather than waiting on pogoapi's
 * own re-scrape cadence.
 *
 * pogoapi's own endpoints are NOT gone, though — they're still read from
 * data/raw/ (already cached by an earlier fetch pass) for two purposes that
 * remain genuinely theirs:
 *
 * 1. THE RELEASED-CONTENT ROSTER/ALLOWLIST. GAME_MASTER's `pokemonSettings`
 *    templates cover species/forms Niantic has never actually released in
 *    Pokémon GO at all (see fetchGameMasterData's reliability caveat) — so
 *    this pipeline still uses pogoapi's pokemon_stats.json to decide WHICH
 *    (pokemon_id, form) pairs are real, live content, then pulls the actual
 *    field VALUES for each of those pairs from the matching GAME_MASTER
 *    template instead of from pogoapi's own value. Same allowlist role for
 *    mega/primal (pogoapi's mega_pokemon.json + the ScrapedDuck live-raid
 *    feed, unchanged from before this switch — see the mega/primal section
 *    below).
 * 2. A PER-SPECIES/PER-MOVE FALLBACK. If a released (pokemon_id, form) pair
 *    from pogoapi has NO matching GAME_MASTER template (checked via
 *    scripts/sync-data/gameMasterMatching.ts's resolvePokemonEnum +
 *    resolveGameMasterPokemonRecord — not observed for any of the 1024
 *    currently-released species in the 2026-09-06 audit, but budgeted for),
 *    or a specific move a species' GAME_MASTER moveset references has no
 *    matching `moveSettings` entry (not observed for any currently-released
 *    species' moveset either, after working around a GAME_MASTER
 *    movementId-encoding quirk — see fetchGameMasterData), this pipeline
 *    falls back to that one species'/move's pogoapi-sourced value rather
 *    than crashing the whole sync — logged in WARNINGS, never silent.
 *
 * This script does NOT re-derive the GameMaster transform — it imports and
 * calls `fromGameMaster` / `fromGameMasterMove` from `@pogo-analyzer/engine`
 * directly, so there is exactly one place (the engine) that knows how a raw
 * record becomes a SpeciesDefinition. See CLAUDE.md's "single code path"
 * philosophy and packages/engine/src/gamemaster.ts. GAME_MASTER's own raw
 * shapes don't match `fromGameMaster`/`fromGameMasterMove`'s pogoapi-shaped
 * input types, so scripts/sync-data/gameMasterMatching.ts and
 * scripts/sync-data/adapters.ts translate between them — those input types
 * themselves were deliberately left unchanged (no schema gap was hit; every
 * GAME_MASTER field this pipeline needs maps cleanly onto them).
 *
 * `pokemon_rarity.json` (a separate pogoapi endpoint this pipeline used to
 * fetch) is GONE as of this switch: GAME_MASTER's own `pokemonClass` field
 * on each pokemonSettings template gives the exact same classification
 * (confirmed 2026-09-06: pokemonClass's per-species Legendary/Mythic/
 * Ultra-Beast counts match pokemon_rarity.json's own unique-pokemon_id
 * counts EXACTLY: 77/23/11) — see pokemonClassToRarity in
 * scripts/sync-data/gameMasterMatching.ts.
 *
 * As of a 2026-09-06 code-simplifier-prompted reorg (predating the pipeline
 * switch above), this file is the orchestrator only — the fetch/cache
 * functions, raw shapes, GAME_MASTER matching helpers, mega/primal
 * name-parsing helpers, Shadow-variant synthesis, and prev-vs-next diffing
 * each live in their own module under scripts/sync-data/ (see the imports
 * below). What's left here is the sequential, heavily-stateful pipeline
 * itself: loading raw data, building the normalized species list (and its
 * mega/primal/Shadow-variant extensions), matching active raids against it,
 * validating, writing output, and reporting — all of which share enough
 * local state (maps built once and read by several later steps) that
 * splitting it further would trade real cohesion for indirection, not
 * reduce it.
 *
 * Scope (documented limitation, see completion report / WARNINGS output):
 * this pass only normalizes ONE form per species — `"Normal"` where a species
 * has one, else a documented fallback (see defaultFormByPokemonId below).
 * Regional forms, costumes, and event forms (Alola, Galarian, Fall_2019, etc.)
 * are out of scope for now — pokemon_stats.json alone carries 273 distinct
 * form values.
 *
 * Fallback-form species (confirmed via a 2026-09-05 audit, 59 of 1024 distinct
 * pokemon_id values in pokemon_stats.json): species like Giratina that have NO
 * row labeled "Normal" at all were previously silently dropped from
 * species.json entirely (not skipped-with-reason, just absent — a real bug,
 * since e.g. Giratina is a common raid boss). See defaultFormByPokemonId for
 * the fix: when a species has no "Normal" row, its first-listed form in
 * pokemon_stats.json is used instead. This happens to match the real in-game
 * default forme for every spot-checked case (Giratina -> Altered, Tornadus/
 * Thundurus/Landorus/Enamorus -> Incarnate, Keldeo -> Ordinary, Meloetta ->
 * Aria) but is a heuristic, not a per-species lookup table — it is NOT
 * guaranteed correct for every one of the 59 (e.g. Zygarde's first-listed row
 * is "Complete", not its actual in-game default "Fifty_percent"/50% Forme).
 * Species picked up this way are logged separately in the WARNINGS output so
 * a future pass can special-case any that turn out wrong.
 *
 * Fetching: `pokemon_stats`/`pokemon_types`/`fast_moves`/`charged_moves`/
 * `current_pokemon_moves`/`cp_multiplier` are assumed already cached under
 * data/raw/ by an earlier fetch pass this project has been through (see
 * data/raw/_meta.json fetch timestamps) — this script only reads them, now
 * purely as the released-content roster + per-species/per-move fallback (see
 * above), not the primary value source. `mega_pokemon.json`, the full
 * GAME_MASTER species+move slice, and the ScrapedDuck active-raids feed
 * (`raids.json`) are fetched and re-cached live on EVERY run (see
 * fetchAndCacheMegaPokemon / fetchGameMasterData / fetchAndCacheRaids in
 * scripts/sync-data/fetchCache.ts) — raid rotations change intraday, and
 * GAME_MASTER being the whole point of this pipeline switch, a stale cache
 * of either would defeat the purpose. mega_pokemon.json models a mega/primal
 * Pokémon as a real trainer-owned ATTACKER (run through the standard
 * level/IV/CPM pipeline) — not as a raid boss (see
 * packages/engine/src/raidBoss.ts's separate, simplified pipeline) — so its
 * 48 entries are added to species.json as ordinary (non-hypothetical)
 * species, under ids derived from `mega_name` rather than `pokemon_name`/
 * `form` (disambiguated against any existing id — see megaSpeciesIdFor in
 * scripts/sync-data/megaPrimalParsing.ts).
 *
 * Run via: npm run sync-data (from repo root) -> tsx scripts/sync-data.ts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  fromGameMaster,
  fromGameMasterMove,
  speciesIdFor,
  DEFAULT_MEGA_BOOST_MULTIPLIER,
  isKnownRaidTier,
  type PokemonType,
  type PokemonRarity,
  type RaidTier,
  type SpeciesDefinition,
  type FastMove,
  type ChargedMove,
} from "@pogo-analyzer/engine";

import type {
  RawPokemonStatsEntry,
  RawPokemonTypesEntry,
  RawMoveEntry,
  RawCurrentMovesEntry,
  RawMegaPokemonEntry,
  ActiveRaidEntry,
  GameMasterPokemonRecord,
} from "./sync-data/rawShapes.ts";
import {
  fetchAndCacheMegaPokemon,
  fetchAndCacheRaids,
  fetchGameMasterData,
  fetchMegaSpriteUrls,
  raidFallbackPathFor,
} from "./sync-data/fetchCache.ts";
import { toPokemonType, toRawGameMasterMove, toRawGameMasterMoveFromMoveSettings, spriteUrlForDexId } from "./sync-data/adapters.ts";
import {
  resolvePokemonEnum,
  resolveGameMasterPokemonRecord,
  resolveMegaFromGameMaster,
  pokemonClassToRarity,
  guessMovementIdForDisplayName,
} from "./sync-data/gameMasterMatching.ts";
import { megaSpeciesIdFor, parseMegaOrPrimalRaidName, tempEvoIdFor } from "./sync-data/megaPrimalParsing.ts";
import { getOrCreateShadowVariant } from "./sync-data/shadowVariant.ts";
import { diffSpecies, diffRaids } from "./sync-data/diff.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const RAW_DIR = join(REPO_ROOT, "data", "raw");
const NORMALIZED_DIR = join(REPO_ROOT, "data", "normalized");

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(RAW_DIR, filename), "utf-8")) as T;
}

// ---------------------------------------------------------------------------
// Load raw data
// ---------------------------------------------------------------------------

const rawMegaPokemon = await fetchAndCacheMegaPokemon(RAW_DIR);
await new Promise((resolve) => setTimeout(resolve, 150)); // short delay between sequential live fetches, per project convention
const raidFetchResult = await fetchAndCacheRaids(RAW_DIR, REPO_ROOT);
const rawRaids = raidFetchResult.entries;
await new Promise((resolve) => setTimeout(resolve, 150)); // short delay between sequential live fetches, per project convention

// PRIMARY source for stats/typing/moveset/rarity as of the 2026-09-06
// pipeline switch (see module docstring). Fetched unconditionally every run
// — unlike the old mega-only extraction this replaces, the whole species
// list now depends on it, not just a rare gap-fill.
const gameMasterFetchResult = await fetchGameMasterData(RAW_DIR);
const gameMasterAvailable = gameMasterFetchResult.source === "live";

const gameMasterPokemonByEnum = new Map<string, GameMasterPokemonRecord[]>();
for (const p of gameMasterFetchResult.pokemon) {
  if (!gameMasterPokemonByEnum.has(p.pokemonId)) gameMasterPokemonByEnum.set(p.pokemonId, []);
  gameMasterPokemonByEnum.get(p.pokemonId)!.push(p);
}
const gameMasterKnownEnums = new Set(gameMasterPokemonByEnum.keys());

const gameMasterMoveByMovementId = new Map(gameMasterFetchResult.moves.map((m) => [m.movementId, m]));

const rawStats = readJson<RawPokemonStatsEntry[]>("pokemon_stats.json");
const rawTypes = readJson<RawPokemonTypesEntry[]>("pokemon_types.json");
const rawFastMoves = readJson<RawMoveEntry[]>("fast_moves.json");
const rawChargedMoves = readJson<RawMoveEntry[]>("charged_moves.json");
const rawCurrentMoves = readJson<RawCurrentMovesEntry[]>("current_pokemon_moves.json");

/**
 * pogoapi-sourced move tables, kept for two fallback roles now (see module
 * docstring): (a) the full per-species fallback path when a species' own
 * GAME_MASTER template can't be resolved at all — same pogoapi-name-keyed
 * lookup this pipeline always used; (b) a per-MOVE fallback, keyed by the
 * GAME_MASTER movementId a pogoapi move's own display name would guess to
 * (see guessMovementIdForDisplayName), consulted only when a species' own
 * GAME_MASTER template resolves fine but ONE specific move it references has
 * no matching `moveSettings` entry.
 */
const fastMoveByName = new Map<string, FastMove>();
const fastMoveByGuessedMovementId = new Map<string, FastMove>();
for (const m of rawFastMoves) {
  const move = fromGameMasterMove(toRawGameMasterMove(m));
  fastMoveByName.set(m.name, move);
  fastMoveByGuessedMovementId.set(guessMovementIdForDisplayName(m.name, true), move);
}

const chargedMoveByName = new Map<string, ChargedMove>();
const chargedMoveByGuessedMovementId = new Map<string, ChargedMove>();
for (const m of rawChargedMoves) {
  const move = fromGameMasterMove(toRawGameMasterMove(m));
  chargedMoveByName.set(m.name, move);
  chargedMoveByGuessedMovementId.set(guessMovementIdForDisplayName(m.name, false), move);
}

const moveFallenBackToPogoapi = new Set<string>();

/** Resolves a species' GAME_MASTER-referenced moveset names against the GAME_MASTER move table first, falling back per-move to a pogoapi-sourced move if GAME_MASTER has no matching `moveSettings` entry (see module docstring). */
function resolveGameMasterMoves<T extends FastMove | ChargedMove>(
  movementIds: string[],
  isFast: boolean,
  unresolved: Set<string>,
): T[] {
  const resolved: T[] = [];
  for (const id of movementIds) {
    const gmMove = gameMasterMoveByMovementId.get(id);
    if (gmMove) {
      resolved.push(fromGameMasterMove(toRawGameMasterMoveFromMoveSettings(id, gmMove, isFast)) as T);
      continue;
    }
    const pogoapiMove = (isFast ? fastMoveByGuessedMovementId : chargedMoveByGuessedMovementId).get(id);
    if (pogoapiMove) {
      resolved.push(pogoapiMove as unknown as T);
      moveFallenBackToPogoapi.add(id);
      continue;
    }
    unresolved.add(`${isFast ? "fast" : "charged"}:${id} (GAME_MASTER movementId, no pogoapi fallback either)`);
  }
  return resolved;
}

/**
 * Per-species overrides for the "first-listed form" fallback (see
 * defaultFormByPokemonId below), keyed by pokemon_id. The generic fallback is
 * just "whichever form pokemon_stats.json happens to list first" (effectively
 * alphabetical, since pogoapi's forms come in that order) — that's right for
 * some species by luck (e.g. Giratina -> Altered, Keldeo -> Ordinary) but
 * demonstrably wrong for others whose real in-game default form doesn't sort
 * first. Audited 2026-09-05 against all 59 fallback-form species (real
 * in-game default forme per Bulbapedia/GamePress/PoGo release notes, cross-
 * checked against actual per-form stats in pokemon_stats.json); every entry
 * below is a confirmed mismatch, not a guess. Two sub-categories:
 *
 * - Real stat/type impact if left un-overridden (the important ones):
 *   Zygarde (previously known-wrong: fell back to "Complete", a 389-stamina
 *   outlier vs the real default "Fifty_percent"'s 239), Darmanitan (fell back
 *   to the Ice-type Galarian_standard instead of the original Fire-type
 *   Standard — same base stats as it happens, but wrong type entirely),
 *   Aegislash (fell back to Blade Forme's 272/97/155 instead of Shield
 *   Forme's 97/272/155 — Blade is a temporary in-battle-only stance per
 *   Bulbapedia, never the resting form), Lycanroc (Dusk instead of the
 *   standard-evolution Midday), Wishiwashi (fell back to School Form's
 *   255/242/128 instead of Solo Form's tiny 46/43/128 — School is a
 *   conditional in-battle transformation, never the resting form), Zacian /
 *   Zamazenta (fell back to the restricted, Iron-Head-gated Crowned Sword/
 *   Shield formes instead of the standard, transferable Hero of Many Battles
 *   form), Palafin (fell back to Hero Form's 322/196/225 instead of Zero
 *   Form's 143/144/225 — Hero is a battle-only transformation per Bulbapedia,
 *   the caught/stored form is always Zero).
 * - Cosmetic-only mismatches (identical stats/type across forms, confirmed via
 *   pokemon_stats.json — fixed anyway since it's a one-line change and the
 *   picked form does still surface in SpeciesDefinition.name): Shellos /
 *   Gastrodon (West_sea, not East_sea, is Bulbapedia's default-displayed
 *   form), Deerling / Sawsbuck (Spring, the only wild-encounterable form in
 *   recent games, not Autumn), Flabébé / Floette / Florges (Red, Bulbapedia's
 *   default flower color, not Blue), Mimikyu (Disguised, its permanent
 *   resting form, not the battle-only Busted), Sinistea / Polteageist
 *   (Phony, the common form — Antique is an intentionally-rare variant, not
 *   Antique), Poltchageist / Sinistcha (Counterfeit / Unremarkable, their
 *   respective common forms, not the rare Artisan / Masterpiece), Dudunsparce
 *   (Two-Segment, the common ~99% form, not the rare Three-Segment).
 *
 * Explicitly NOT overridden despite also having 2+ candidate forms, because
 * there is no single correct "real default" to fall back to (both forms are
 * independently, equally released/obtainable in the live game, per a
 * Bulbapedia/GO-focused source check) — left as whatever the generic
 * fallback happens to pick: Urshifu (Single Strike vs Rapid Strike — both
 * real, separately evolved/caught forms), Indeedee (Male vs Female — both
 * real, separately caught, with genuinely different stat spreads), Basculin
 * (Red- vs Blue-Striped — version-exclusive counterparts, Bulbapedia treats
 * neither as primary). Also not touched: species where every candidate form
 * has identical stats/type AND no single form is clearly the conventional
 * default either (Unown, Spinda, Scatterbug/Spewpa/Vivillon, Furfrou, Minior,
 * Squawkabilly, Tatsugiri, Toxtricity, Maushold — already picked its correct
 * common "Family_of_four") — per this audit's instructions, not worth
 * overthinking a cosmetic-only pick with no real default.
 */
const FORM_OVERRIDES: Record<number, string> = {
  422: "West_sea", // Shellos
  423: "West_sea", // Gastrodon
  555: "Standard", // Darmanitan
  585: "Spring", // Deerling
  586: "Spring", // Sawsbuck
  669: "Red", // Flabébé
  670: "Red", // Floette
  671: "Red", // Florges
  681: "Shield", // Aegislash
  718: "Fifty_percent", // Zygarde
  745: "Midday", // Lycanroc
  746: "Solo", // Wishiwashi
  778: "Disguised", // Mimikyu
  854: "Phony", // Sinistea
  855: "Phony", // Polteageist
  888: "Hero", // Zacian
  889: "Hero", // Zamazenta
  964: "Zero", // Palafin
  982: "Two", // Dudunsparce
  1012: "Counterfeit", // Poltchageist
  1013: "Unremarkable", // Sinistcha
};

/**
 * Determines the ONE form each pokemon_id normalizes to this pass: "Normal"
 * if pokemon_stats.json has a row so labeled for that id, else that species'
 * first-listed form in the raw file (see module docstring's "Fallback-form
 * species" note for why this is a reasonable default and its known limits) —
 * unless FORM_OVERRIDES above names a specific form for that pokemon_id, in
 * which case the override always wins (checked against the id's actual rows
 * so a typo'd override form can't silently select nothing). Computed once
 * from pokemon_stats.json (the species list's source of truth — still the
 * released-content ROSTER even though GAME_MASTER now supplies the actual
 * field values, see module docstring) and then reused to select the matching
 * FALLBACK row out of pokemon_types.json and current_pokemon_moves.json too,
 * so all three stay keyed to the same form per species rather than each
 * independently guessing "Normal".
 */
const defaultFormByPokemonId = new Map<number, string>();
for (const s of rawStats) {
  if (!defaultFormByPokemonId.has(s.pokemon_id)) {
    defaultFormByPokemonId.set(s.pokemon_id, s.form); // first-listed form, provisional
  }
  if (s.form === "Normal") {
    defaultFormByPokemonId.set(s.pokemon_id, "Normal"); // "Normal" always wins if present anywhere
  }
}
const formOverrideMismatches: { pokemon_id: number; wanted: string }[] = [];
for (const [idStr, wantedForm] of Object.entries(FORM_OVERRIDES)) {
  const id = Number(idStr);
  const hasMatchingRow = rawStats.some((s) => s.pokemon_id === id && s.form === wantedForm);
  if (hasMatchingRow) {
    defaultFormByPokemonId.set(id, wantedForm);
  } else {
    formOverrideMismatches.push({ pokemon_id: id, wanted: wantedForm });
  }
}
const fallbackFormPokemonIds = new Set(
  [...defaultFormByPokemonId.entries()].filter(([, form]) => form !== "Normal").map(([id]) => id),
);

const typesByPokemonId = new Map<number, RawPokemonTypesEntry>();
for (const t of rawTypes) {
  if (t.form === defaultFormByPokemonId.get(t.pokemon_id)) typesByPokemonId.set(t.pokemon_id, t);
}

const movesByPokemonId = new Map<number, RawCurrentMovesEntry>();
for (const c of rawCurrentMoves) {
  if (c.form === defaultFormByPokemonId.get(c.pokemon_id)) movesByPokemonId.set(c.pokemon_id, c);
}

/** Builds the `[PokemonType]|[PokemonType,PokemonType]` shape fromGameMaster expects from either a GAME_MASTER or pogoapi raw type-string list; returns null for an empty list (caller skips the species, same as before this switch). */
function buildTypesArray(rawTypeStrings: string[]): [PokemonType] | [PokemonType, PokemonType] | null {
  const converted = rawTypeStrings.map(toPokemonType);
  if (converted.length === 0) return null;
  const [primary, secondary] = converted;
  return secondary !== undefined ? [primary as PokemonType, secondary] : [primary as PokemonType];
}

// ---------------------------------------------------------------------------
// Build normalized species list (one form per species — "Normal", or the
// documented fallback above). VALUES now come primarily from GAME_MASTER,
// falling back to pogoapi per-species/per-move as documented in the module
// docstring.
// ---------------------------------------------------------------------------

const normalStats = rawStats.filter((s) => s.form === defaultFormByPokemonId.get(s.pokemon_id));

const species: SpeciesDefinition[] = [];
const skippedSpecies: { pokemon_id: number; pokemon_name: string; reason: string }[] = [];
const unresolvedMoveNames = new Set<string>();
const speciesFallenBackToPogoapi: string[] = [];
const rarityFallenBackToStandard: string[] = [];

for (const stat of normalStats) {
  const pokemonId = stat.pokemon_id;
  const form = defaultFormByPokemonId.get(pokemonId)!;

  const enumName = gameMasterAvailable ? resolvePokemonEnum(pokemonId, stat.pokemon_name, gameMasterKnownEnums) : null;
  const gmRecord = enumName
    ? resolveGameMasterPokemonRecord(gameMasterPokemonByEnum.get(enumName) ?? [], enumName, form)
    : null;

  let baseAttack: number;
  let baseDefense: number;
  let baseStamina: number;
  let rawTypeStrings: string[];
  let rarity: PokemonRarity;
  let fastNames: string[];
  let chargedNames: string[];

  if (gmRecord) {
    baseAttack = gmRecord.baseAttack;
    baseDefense = gmRecord.baseDefense;
    baseStamina = gmRecord.baseStamina;
    rawTypeStrings = [gmRecord.type, gmRecord.type2].filter((t): t is string => Boolean(t));
    rarity = pokemonClassToRarity(gmRecord.pokemonClass);
    fastNames = [...gmRecord.quickMoves, ...gmRecord.eliteQuickMoves];
    chargedNames = [...gmRecord.cinematicMoves, ...gmRecord.eliteCinematicMoves];
  } else {
    speciesFallenBackToPogoapi.push(`${stat.pokemon_name} (${form})`);
    const typesEntry = typesByPokemonId.get(pokemonId);
    const movesEntry = movesByPokemonId.get(pokemonId);
    if (!typesEntry) {
      skippedSpecies.push({ pokemon_id: pokemonId, pokemon_name: stat.pokemon_name, reason: "no typing data" });
      continue;
    }
    if (!movesEntry) {
      skippedSpecies.push({ pokemon_id: pokemonId, pokemon_name: stat.pokemon_name, reason: "no moveset data" });
      continue;
    }
    baseAttack = stat.base_attack;
    baseDefense = stat.base_defense;
    baseStamina = stat.base_stamina;
    rawTypeStrings = typesEntry.type;
    // No independent rarity source once pokemon_rarity.json is retired in
    // favor of GAME_MASTER's pokemonClass (see module docstring) — a species
    // that falls all the way back to pogoapi for its stats has no rarity
    // signal at all, so it defaults to "STANDARD" (least-surprising, matches
    // this project's pre-existing default) and is logged below rather than
    // silently assumed correct.
    rarity = "STANDARD";
    rarityFallenBackToStandard.push(`${stat.pokemon_name} (${form})`);
    fastNames = [...movesEntry.fast_moves, ...movesEntry.elite_fast_moves];
    chargedNames = [...movesEntry.charged_moves, ...movesEntry.elite_charged_moves];
  }

  const pokemonTypes = buildTypesArray(rawTypeStrings);
  if (!pokemonTypes) {
    skippedSpecies.push({ pokemon_id: pokemonId, pokemon_name: stat.pokemon_name, reason: "empty typing array" });
    continue;
  }

  let resolvedFast: FastMove[];
  let resolvedCharged: ChargedMove[];
  if (gmRecord) {
    resolvedFast = resolveGameMasterMoves<FastMove>(fastNames, true, unresolvedMoveNames);
    resolvedCharged = resolveGameMasterMoves<ChargedMove>(chargedNames, false, unresolvedMoveNames);
  } else {
    resolvedFast = [];
    for (const name of fastNames) {
      const move = fastMoveByName.get(name);
      if (move) resolvedFast.push(move);
      else unresolvedMoveNames.add(`fast:${name}`);
    }
    resolvedCharged = [];
    for (const name of chargedNames) {
      const move = chargedMoveByName.get(name);
      if (move) resolvedCharged.push(move);
      else unresolvedMoveNames.add(`charged:${name}`);
    }
  }

  if (resolvedFast.length === 0 || resolvedCharged.length === 0) {
    skippedSpecies.push({
      pokemon_id: pokemonId,
      pokemon_name: stat.pokemon_name,
      reason:
        resolvedFast.length === 0 && resolvedCharged.length === 0
          ? "no resolvable fast or charged moves"
          : resolvedFast.length === 0
            ? "no resolvable fast moves"
            : "no resolvable charged moves",
    });
    continue;
  }

  const definition = fromGameMaster(
    {
      pokemon_id: stat.pokemon_id,
      pokemon_name: stat.pokemon_name,
      form: stat.form,
      base_attack: baseAttack,
      base_defense: baseDefense,
      base_stamina: baseStamina,
    },
    pokemonTypes,
    resolvedFast,
    resolvedCharged,
  );
  // National-dex sprite, keyed by the pokemon_id we already have — no extra
  // network call needed for any of the Normal-form-or-fallback-form species
  // handled here (unlike the 48 mega entries below, which need a per-species
  // PokeAPI lookup for their own distinct internal ID).
  definition.imageUrl = spriteUrlForDexId(stat.pokemon_id);
  definition.rarity = rarity;

  species.push(definition);
}

// This project's 4 hand-authored hypothetical fixtures (Mega Raichu X/Y,
// Primal Kyogre, Mega Skarmory) were deleted from the engine entirely at the
// user's explicit request (2026-09-06, see CLAUDE.md "Standing decisions") —
// they used to live here as HYPOTHETICAL_FIXTURES so raid-matching and
// mega-id-collision logic below could account for them. They no longer exist
// as importable exports (packages/engine/src/index.ts never re-exports them;
// replacements, if any, live under packages/engine/test/fixtures/ only, which
// this script deliberately does not import from). Nothing in this script
// stands in for them anymore.

// ---------------------------------------------------------------------------
// Build normalized mega/primal species entries (mega_pokemon.json)
// ---------------------------------------------------------------------------
//
// mega_pokemon.json's 48 entries are REAL data (real mega/primal Pokémon,
// currently in rotation) — no speculative/hypothetical flag is set on them,
// unlike HYPOTHETICAL_FIXTURES above. They model a mega/primal Pokémon as a
// normal trainer-owned ATTACKER meant for the standard level/IV/CPM stat
// pipeline (fromGameMaster / effectiveStat), which is a fundamentally
// different thing from this project's raid-boss fixtures (see
// packages/engine/src/fixtures/scenarioA.ts's PRIMAL_KYOGRE, modeled via the
// separate iv=0/CPM=1.0 raidBoss.ts pipeline) — both may legitimately exist
// side by side, registered under different ids, and must never collide or
// overwrite each other.
//
// As of the 2026-09-06 pipeline switch, this endpoint's role narrowed to
// RELEASED-CONTENT ALLOWLIST only — the actual base_attack/base_defense/
// base_stamina/type VALUES come from GAME_MASTER's own tempEvoOverrides
// (resolveMegaFromGameMaster in scripts/sync-data/gameMasterMatching.ts),
// falling back to this endpoint's own stats/type only if GAME_MASTER has no
// matching tempEvoOverrides block for one of these 48 (not observed in the
// 2026-09-06 audit — all 48 matched exactly, see WARNINGS output).
//
// A mega form doesn't get its own separate learnset in the live game — it
// keeps its base (non-mega) form's real moves — so moves are resolved via the
// same movesByPokemonId/GAME_MASTER-record lookup (keyed by base pokemon_id +
// "Normal" form) used for ordinary species above, not a mega-specific lookup.
//
// Id scheme: megaSpeciesIdFor() (scripts/sync-data/megaPrimalParsing.ts)
// strips the base pokemon_name out of mega_name to get a suffix (e.g. "Mega
// Charizard X" - "Charizard" -> "mega-x"), then builds
// `${pokemon_name}-${suffix}` (e.g. "charizard-mega-x"). If that id already
// exists (in the real Normal-form species built above), "-attacker" is
// appended to disambiguate. This used to be specifically needed for Primal
// Kyogre, whose natural id "kyogre-primal" collided with a hand-defined
// raid-boss fixture of the same id (scenarioA.ts's PRIMAL_KYOGRE) even though
// the two modeled completely different things (attacker vs. boss stat
// pipeline) — that fixture has since been deleted from the engine's
// product-reachable exports entirely (see CLAUDE.md "Standing decisions"),
// so this collision no longer occurs in practice; the id-collision guard
// below is kept as general-purpose defensive logic, not because a specific
// collision is currently expected.

const megaValueFallbacks: string[] = [];

/**
 * Resolves ONE mega/primal roster entry's actual base_attack/base_defense/
 * base_stamina/type against GAME_MASTER's tempEvoOverrides, falling back to
 * the roster entry's own pogoapi-sourced stats/type (always present for a
 * mega_pokemon.json entry, unlike the raid-gap case below) if GAME_MASTER
 * can't resolve it — logged in `megaValueFallbacks`, never silent.
 */
function resolveMegaValues(m: RawMegaPokemonEntry): {
  base_attack: number;
  base_defense: number;
  base_stamina: number;
  type: string[];
  first_time_mega_energy_required: number;
  mega_energy_required: number;
} {
  const parsed = parseMegaOrPrimalRaidName(m.mega_name);
  if (parsed && gameMasterAvailable) {
    const enumName = resolvePokemonEnum(m.pokemon_id, m.pokemon_name, gameMasterKnownEnums);
    if (enumName) {
      const candidates = gameMasterPokemonByEnum.get(enumName) ?? [];
      const wantedTempEvoId = tempEvoIdFor(parsed.prefix, parsed.suffix);
      const resolution = resolveMegaFromGameMaster(candidates, wantedTempEvoId);
      if (resolution && !resolution.ambiguous) {
        return {
          base_attack: resolution.baseAttack,
          base_defense: resolution.baseDefense,
          base_stamina: resolution.baseStamina,
          type: resolution.types,
          first_time_mega_energy_required: resolution.firstTimeMegaEnergyRequired ?? m.first_time_mega_energy_required,
          mega_energy_required: resolution.megaEnergyRequired ?? m.mega_energy_required,
        };
      }
    }
  }
  megaValueFallbacks.push(m.mega_name);
  return {
    base_attack: m.stats.base_attack,
    base_defense: m.stats.base_defense,
    base_stamina: m.stats.base_stamina,
    type: m.type,
    first_time_mega_energy_required: m.first_time_mega_energy_required,
    mega_energy_required: m.mega_energy_required,
  };
}

const rawMegaPokemonWithGameMasterValues: RawMegaPokemonEntry[] = rawMegaPokemon.map((m) => {
  const resolved = resolveMegaValues(m);
  return {
    ...m,
    stats: {
      base_attack: resolved.base_attack,
      base_defense: resolved.base_defense,
      base_stamina: resolved.base_stamina,
    },
    type: resolved.type,
    first_time_mega_energy_required: resolved.first_time_mega_energy_required,
    mega_energy_required: resolved.mega_energy_required,
  };
});

// ---------------------------------------------------------------------------
// GAME_MASTER gap-fill: a CURRENTLY-LIVE raid may name a mega/primal
// pogoapi.net's mega_pokemon.json doesn't cover at all (no fallback stats
// exist for these — unlike the 48 roster entries above). General mechanism
// (any future pogoapi gap gets checked here), not special-cased to any one
// species — see fetchGameMasterData's doc comment (scripts/sync-data/
// fetchCache.ts) for the reliability caveat this gating protects against.
// ---------------------------------------------------------------------------

const pokemonIdByName = new Map<string, number>();
for (const s of rawStats) {
  if (!pokemonIdByName.has(s.pokemon_name)) pokemonIdByName.set(s.pokemon_name, s.pokemon_id);
}

const pogoApiMegaNames = new Set(rawMegaPokemon.map((m) => m.mega_name.toLowerCase()));
const megaOrPrimalRaidGaps = rawRaids.filter(
  (r) => /^(Mega|Primal) /.test(r.name) && !pogoApiMegaNames.has(r.name.toLowerCase()),
);

/**
 * Hand-curated allowlist of mega/primal forms confirmed REAL, RELEASED
 * Pokémon GO content that fall through BOTH of this pipeline's other
 * released-content gates: pogoapi.net's mega_pokemon.json roster (updated on
 * pogoapi's own cadence, confirmed missing these as of this sync's fetch) AND
 * the currently-active ScrapedDuck raid rotation (`megaOrPrimalRaidGaps`
 * above only fires for a mega/primal that's raiding RIGHT NOW). A real mega
 * whose debut was a single dedicated raid-day event needs a third way in,
 * since Mega Evolution unlocks are permanent per-trainer once earned — the
 * mega itself doesn't stop being real, released content just because its
 * one-day debut event ended and it may not raid again for months. Same
 * spirit as FORM_OVERRIDES above: a short, hand-reviewed, per-entry-justified
 * table for a case the automated raid-gap/pogoapi-roster logic structurally
 * can't cover — add an entry here (with its own citation) the moment a
 * similar gap is spotted; this is NOT a place to speculatively list unreleased
 * content (see fetchGameMasterData's reliability caveat in
 * scripts/sync-data/fetchCache.ts for why GAME_MASTER's own tempEvoOverrides
 * can't be trusted alone as "released").
 *
 * Names are parsed by the exact same parseMegaOrPrimalRaidName/tempEvoIdFor
 * machinery `megaOrPrimalRaidGaps` already uses below, so "confirmed real
 * mega name" is the only thing this table needs to supply — GAME_MASTER still
 * supplies (and this pipeline still cross-checks against independent
 * community sources, see gameMasterCrossChecks below) the actual stat values.
 *
 * Each entry also optionally carries `lastKnownRaidTier` — this form's REAL
 * confirmed historical/debut raid tier (2026-09-07 research pass, see
 * per-entry citations below), written onto the resulting SpeciesDefinition's
 * `lastKnownRaidTier` field (see the mega-species build loop below) so
 * raidBoss.ts's defaultRaidTierForSpecies() has a real observation to prefer
 * over its rarity/boost-keyed guess (which would otherwise assign every
 * STANDARD-rarity mega here the generic "Mega Raids" tier — wrong for a form
 * that actually debuted at the harder "Super Mega Raids" tier). Left
 * `undefined` for a form no confirmed tier was found for after genuine
 * research effort — an absent field honestly falls through to the existing
 * heuristic; a wrong guess would not be honest.
 */
const RELEASED_MEGA_PRIMAL_ALLOWLIST: { name: string; lastKnownRaidTier?: RaidTier }[] = [
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

  // Debuted 2026-05-24 per Bulbapedia, alongside Mega Mewtwo Y (Y is
  // deliberately NOT added here — as of this sync's fetch it's already
  // covered by the live ScrapedDuck raid-gap gate on its own, confirmed
  // currently in Super Mega Raid rotation via leekduck.com/raid-bosses/,
  // checked 2026-09-06). Confirmed via Serebii.net (Psychic/Fighting, Max CP
  // 6910) and Pokémon GO Hub's raid guide (base Attack/Defense/Stamina), both
  // checked 2026-09-06, both independent of GAME_MASTER.
  //
  // lastKnownRaidTier "Super Mega Raids" (2026-09-07 research pass):
  // pokemongohub.net/post/raid-guide/mega-mewtwo-x-raid-guide/ states "Mega
  // Mewtwo X is a Psychic and Fighting type Super Mega Raid boss." — matches
  // sibling Mega Mewtwo Y's own currently-live "Super Mega Raids" tier
  // (leekduck.com/raid-bosses/, checked 2026-09-07), consistent with both X
  // and Y debuting together per the comment above.
  { name: "Mega Mewtwo X", lastKnownRaidTier: "Super Mega Raids" },

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
  // wired up in the gap-fill loop below (see the "Mega Skarmory" branch in
  // gameMasterCrossChecks, comparing against Dittobase + Pokémon GO Hub DB,
  // both agreeing exactly, checked 2026-09-06) — that check already runs for
  // every mega-gap candidate regardless of which gate let it through, so it
  // still applies here.
  //
  // lastKnownRaidTier "Mega Raids": this pipeline's own 2026-09-07 live-feed
  // observation (data/raw/raids.json, "Mega Skarmory | Mega Raids") — a real
  // observation, not a guess.
  { name: "Mega Skarmory", lastKnownRaidTier: "Mega Raids" },
];

const megaOrPrimalAllowlistGaps = RELEASED_MEGA_PRIMAL_ALLOWLIST.filter(
  (entry) =>
    !pogoApiMegaNames.has(entry.name.toLowerCase()) &&
    !megaOrPrimalRaidGaps.some((r) => r.name.toLowerCase() === entry.name.toLowerCase()),
).map((entry) => entry.name);

/** Per-mega-name lookup of the researched lastKnownRaidTier above (case-insensitive on `mega_name`, the same string this pipeline already matches raid/allowlist names on elsewhere) — consulted once the mega-species build loop below has a `mega_name` in hand. */
const allowlistTierByMegaName = new Map(
  RELEASED_MEGA_PRIMAL_ALLOWLIST.filter((e): e is { name: string; lastKnownRaidTier: RaidTier } => e.lastKnownRaidTier !== undefined).map(
    (e) => [e.name.toLowerCase(), e.lastKnownRaidTier],
  ),
);

const gameMasterDerivedMega: RawMegaPokemonEntry[] = [];
const gameMasterUnresolvedGaps: string[] = [];
const gameMasterCrossChecks: string[] = [];

/**
 * Unified worklist for the GAME_MASTER gap-fill loop below: every raid-gap
 * name plus every still-uncovered allowlist name, each tagged with where it
 * came from purely for WARNINGS reporting — resolution logic downstream
 * doesn't care which gate let a given name through.
 */
const megaOrPrimalGapCandidates: { name: string; source: "active-raid" | "released-content-allowlist" }[] = [
  ...megaOrPrimalRaidGaps.map((r) => ({ name: r.name, source: "active-raid" as const })),
  ...megaOrPrimalAllowlistGaps.map((name) => ({ name, source: "released-content-allowlist" as const })),
];

if (megaOrPrimalGapCandidates.length > 0) {
  for (const { name: candidateName } of megaOrPrimalGapCandidates) {
    const parsed = parseMegaOrPrimalRaidName(candidateName);
    if (!parsed) {
      gameMasterUnresolvedGaps.push(`${candidateName} (couldn't parse a base species name out of the name)`);
      continue;
    }
    const pokemonId = pokemonIdByName.get(parsed.baseName);
    const pokemonName = pokemonIdByName.has(parsed.baseName) ? parsed.baseName : undefined;
    if (pokemonId === undefined || pokemonName === undefined) {
      gameMasterUnresolvedGaps.push(`${candidateName} (base species "${parsed.baseName}" not found in pokemon_stats.json)`);
      continue;
    }
    if (!gameMasterAvailable) {
      gameMasterUnresolvedGaps.push(`${candidateName} (GAME_MASTER fetch failed: ${gameMasterFetchResult.error})`);
      continue;
    }

    const enumName = resolvePokemonEnum(pokemonId, pokemonName, gameMasterKnownEnums);
    if (!enumName) {
      gameMasterUnresolvedGaps.push(`${candidateName} (couldn't resolve a GAME_MASTER pokemonId enum for "${pokemonName}")`);
      continue;
    }
    const candidates = gameMasterPokemonByEnum.get(enumName) ?? [];
    const wantedTempEvoId = tempEvoIdFor(parsed.prefix, parsed.suffix);
    const resolution = resolveMegaFromGameMaster(candidates, wantedTempEvoId);
    if (!resolution) {
      gameMasterUnresolvedGaps.push(`${candidateName} (no GAME_MASTER tempEvoOverrides entry for ${enumName}/${wantedTempEvoId})`);
      continue;
    }
    if (resolution.ambiguous) {
      gameMasterUnresolvedGaps.push(
        `${candidateName} (GAME_MASTER has CONFLICTING tempEvoOverrides entries for ${enumName}/${wantedTempEvoId} across its own templates — not applying any, needs manual review)`,
      );
      continue;
    }
    const megaName = parsed.suffix ? `${parsed.prefix} ${pokemonName} ${parsed.suffix}` : `${parsed.prefix} ${pokemonName}`;
    gameMasterDerivedMega.push({
      first_time_mega_energy_required: resolution.firstTimeMegaEnergyRequired ?? 0,
      form: parsed.suffix ?? "Normal",
      mega_energy_required: resolution.megaEnergyRequired ?? 0,
      mega_name: megaName,
      pokemon_id: pokemonId,
      pokemon_name: pokemonName,
      stats: { base_attack: resolution.baseAttack, base_defense: resolution.baseDefense, base_stamina: resolution.baseStamina },
      type: resolution.types,
    });

    // Task-specific sanity check (not special-cased logic, just reporting):
    // cross-check against two independent, hand-checked community sources
    // for Mega Skarmory specifically (Dittobase + Pokémon GO Hub DB, both
    // agreeing exactly, checked 2026-09-06) rather than trusting GAME_MASTER
    // blindly.
    if (pokemonName === "Skarmory" && parsed.prefix === "Mega" && !parsed.suffix) {
      const expected = { baseAttack: 273, baseDefense: 228, baseStamina: 163 };
      const isMatch =
        resolution.baseAttack === expected.baseAttack &&
        resolution.baseDefense === expected.baseDefense &&
        resolution.baseStamina === expected.baseStamina;
      gameMasterCrossChecks.push(
        `Mega Skarmory: GAME_MASTER gives atk ${resolution.baseAttack}/def ${resolution.baseDefense}/sta ${resolution.baseStamina} vs. community cross-check (Dittobase + Pokémon GO Hub DB, both agree exactly) atk ${expected.baseAttack}/def ${expected.baseDefense}/sta ${expected.baseStamina} -> ${isMatch ? "MATCH" : "MISMATCH — flagged, NOT applied blindly, needs manual review"}`,
      );
      if (!isMatch) {
        gameMasterDerivedMega.pop(); // don't apply a disputed stat block
        gameMasterUnresolvedGaps.push(`${candidateName} (GAME_MASTER value disagreed with community cross-check — see gameMasterCrossChecks)`);
      }
    }

    // Same task-specific sanity check pattern, for the RELEASED_MEGA_PRIMAL_ALLOWLIST's
    // Mega Raichu X/Y entries: cross-check against two sources independent of
    // GAME_MASTER (poketory.com's raid guide + PvPoke's own separately-
    // maintained gamemaster.json — both derived independently of PokeMiners'
    // GAME_MASTER mirror this pipeline reads), checked 2026-09-06.
    if (pokemonName === "Raichu" && parsed.prefix === "Mega" && (parsed.suffix === "X" || parsed.suffix === "Y")) {
      const expected =
        parsed.suffix === "X"
          ? { baseAttack: 277, baseDefense: 203, baseStamina: 155 }
          : { baseAttack: 339, baseDefense: 157, baseStamina: 155 };
      const isMatch =
        resolution.baseAttack === expected.baseAttack &&
        resolution.baseDefense === expected.baseDefense &&
        resolution.baseStamina === expected.baseStamina;
      gameMasterCrossChecks.push(
        `Mega Raichu ${parsed.suffix}: GAME_MASTER gives atk ${resolution.baseAttack}/def ${resolution.baseDefense}/sta ${resolution.baseStamina} vs. independent community cross-check (poketory.com raid guide + PvPoke's own gamemaster.json, both agree exactly) atk ${expected.baseAttack}/def ${expected.baseDefense}/sta ${expected.baseStamina} -> ${isMatch ? "MATCH" : "MISMATCH — flagged, NOT applied blindly, needs manual review"}`,
      );
      if (!isMatch) {
        gameMasterDerivedMega.pop(); // don't apply a disputed stat block
        gameMasterUnresolvedGaps.push(`${candidateName} (GAME_MASTER value disagreed with community cross-check — see gameMasterCrossChecks)`);
      }
    }

    // Same task-specific sanity check pattern, for the 9 newly-added
    // RELEASED_MEGA_PRIMAL_ALLOWLIST entries from the 2026-09-06
    // check-mega-gaps.ts diff (see that constant's doc comment for full
    // per-species citations). Five of these have a full independent
    // atk/def/sta triple to check against (Serebii.net + Pokémon GO Hub raid
    // guides, both checked 2026-09-06); the other four (Falinks, Chesnaught,
    // Delphox, Greninja) only have an independent TYPE to check (no
    // independent stat-triple source found yet for those), flagged as
    // "type-only" below rather than silently skipped.
    const fullStatCrossCheck: Record<string, { baseAttack: number; baseDefense: number; baseStamina: number }> = {
      Victreebel: { baseAttack: 265, baseDefense: 181, baseStamina: 190 },
      Dragonite: { baseAttack: 299, baseDefense: 255, baseStamina: 209 },
      Malamar: { baseAttack: 208, baseDefense: 222, baseStamina: 200 },
      Mewtwo: { baseAttack: 399, baseDefense: 215, baseStamina: 228 }, // Mega Mewtwo X only (see allowlist comment)
      Starmie: { baseAttack: 276, baseDefense: 229, baseStamina: 155 },
    };
    const typeOnlyCrossCheck: Record<string, string[]> = {
      Falinks: ["fighting"],
      Chesnaught: ["grass", "fighting"],
      Delphox: ["fire", "psychic"],
      Greninja: ["water", "dark"],
    };
    if (parsed.prefix === "Mega" && pokemonName === "Mewtwo" && parsed.suffix === "X" && fullStatCrossCheck.Mewtwo) {
      const expected = fullStatCrossCheck.Mewtwo;
      const isMatch =
        resolution.baseAttack === expected.baseAttack &&
        resolution.baseDefense === expected.baseDefense &&
        resolution.baseStamina === expected.baseStamina;
      gameMasterCrossChecks.push(
        `Mega Mewtwo X: GAME_MASTER gives atk ${resolution.baseAttack}/def ${resolution.baseDefense}/sta ${resolution.baseStamina} vs. independent cross-check (Serebii.net + Pokémon GO Hub raid guide, both agree exactly) atk ${expected.baseAttack}/def ${expected.baseDefense}/sta ${expected.baseStamina} -> ${isMatch ? "MATCH" : "MISMATCH — flagged, NOT applied blindly, needs manual review"}`,
      );
      if (!isMatch) {
        gameMasterDerivedMega.pop();
        gameMasterUnresolvedGaps.push(`${candidateName} (GAME_MASTER value disagreed with independent cross-check — see gameMasterCrossChecks)`);
      }
    } else if (parsed.prefix === "Mega" && !parsed.suffix && pokemonName && fullStatCrossCheck[pokemonName]) {
      const expected = fullStatCrossCheck[pokemonName];
      const isMatch =
        resolution.baseAttack === expected.baseAttack &&
        resolution.baseDefense === expected.baseDefense &&
        resolution.baseStamina === expected.baseStamina;
      gameMasterCrossChecks.push(
        `Mega ${pokemonName}: GAME_MASTER gives atk ${resolution.baseAttack}/def ${resolution.baseDefense}/sta ${resolution.baseStamina} vs. independent cross-check (Serebii.net + Pokémon GO Hub raid guide, both agree exactly) atk ${expected.baseAttack}/def ${expected.baseDefense}/sta ${expected.baseStamina} -> ${isMatch ? "MATCH" : "MISMATCH — flagged, NOT applied blindly, needs manual review"}`,
      );
      if (!isMatch) {
        gameMasterDerivedMega.pop();
        gameMasterUnresolvedGaps.push(`${candidateName} (GAME_MASTER value disagreed with independent cross-check — see gameMasterCrossChecks)`);
      }
    } else if (parsed.prefix === "Mega" && !parsed.suffix && pokemonName && typeOnlyCrossCheck[pokemonName]) {
      const expectedTypes = typeOnlyCrossCheck[pokemonName];
      const normalizedTypes = resolution.types.map(toPokemonType);
      const isMatch =
        normalizedTypes.length === expectedTypes.length && normalizedTypes.every((t, i) => t === expectedTypes[i]);
      gameMasterCrossChecks.push(
        `Mega ${pokemonName} (type-only, no independent stat-triple source found yet): GAME_MASTER gives type [${normalizedTypes.join("/")}] vs. independent cross-check (Serebii.net) type [${expectedTypes.join("/")}] -> ${isMatch ? "MATCH" : "MISMATCH — flagged, NOT applied blindly, needs manual review"}`,
      );
      if (!isMatch) {
        gameMasterDerivedMega.pop();
        gameMasterUnresolvedGaps.push(`${candidateName} (GAME_MASTER type disagreed with independent cross-check — see gameMasterCrossChecks)`);
      }
    }
  }
}

const rawMegaPokemonCombined: RawMegaPokemonEntry[] = [...rawMegaPokemonWithGameMasterValues, ...gameMasterDerivedMega];

const reservedSpeciesIds = new Set<string>(species.map((s) => s.id));

const megaSpecies: SpeciesDefinition[] = [];
const megaIdCollisions: { megaName: string; wouldBeId: string; usedId: string }[] = [];

for (const m of rawMegaPokemonCombined) {
  // A mega form's moveset (and rarity, see below) is the BASE species'
  // own — resolved the same way ordinary species above are: via the base
  // species' own GAME_MASTER template when resolvable (giving mega Pokémon
  // the same GAME_MASTER-sourced move power/energy/duration freshness as
  // every other species), falling back to pogoapi's current_pokemon_moves.json
  // + fast_moves/charged_moves.json only if the base species has no
  // resolvable GAME_MASTER template at all.
  const baseForm = defaultFormByPokemonId.get(m.pokemon_id) ?? "Normal";
  const baseEnumName = gameMasterAvailable ? resolvePokemonEnum(m.pokemon_id, m.pokemon_name, gameMasterKnownEnums) : null;
  const baseGmRecord = baseEnumName
    ? resolveGameMasterPokemonRecord(gameMasterPokemonByEnum.get(baseEnumName) ?? [], baseEnumName, baseForm)
    : null;

  let resolvedFast: FastMove[];
  let resolvedCharged: ChargedMove[];

  if (baseGmRecord) {
    const fastNames = [...baseGmRecord.quickMoves, ...baseGmRecord.eliteQuickMoves];
    const chargedNames = [...baseGmRecord.cinematicMoves, ...baseGmRecord.eliteCinematicMoves];
    resolvedFast = resolveGameMasterMoves<FastMove>(fastNames, true, unresolvedMoveNames);
    resolvedCharged = resolveGameMasterMoves<ChargedMove>(chargedNames, false, unresolvedMoveNames);
  } else {
    const movesEntry = movesByPokemonId.get(m.pokemon_id);
    if (!movesEntry) {
      skippedSpecies.push({ pokemon_id: m.pokemon_id, pokemon_name: m.mega_name, reason: "no moveset data for base species" });
      continue;
    }
    const fastNames = [...movesEntry.fast_moves, ...movesEntry.elite_fast_moves];
    const chargedNames = [...movesEntry.charged_moves, ...movesEntry.elite_charged_moves];
    resolvedFast = [];
    for (const name of fastNames) {
      const move = fastMoveByName.get(name);
      if (move) resolvedFast.push(move);
      else unresolvedMoveNames.add(`fast:${name}`);
    }
    resolvedCharged = [];
    for (const name of chargedNames) {
      const move = chargedMoveByName.get(name);
      if (move) resolvedCharged.push(move);
      else unresolvedMoveNames.add(`charged:${name}`);
    }
  }

  if (resolvedFast.length === 0 || resolvedCharged.length === 0) {
    skippedSpecies.push({
      pokemon_id: m.pokemon_id,
      pokemon_name: m.mega_name,
      reason:
        resolvedFast.length === 0 && resolvedCharged.length === 0
          ? "no resolvable fast or charged moves"
          : resolvedFast.length === 0
            ? "no resolvable fast moves"
            : "no resolvable charged moves",
    });
    continue;
  }

  const typesArr = m.type.map(toPokemonType);
  if (typesArr.length === 0) {
    skippedSpecies.push({ pokemon_id: m.pokemon_id, pokemon_name: m.mega_name, reason: "empty typing array" });
    continue;
  }
  const [primaryType, secondaryType] = typesArr;
  const pokemonTypes: [PokemonType] | [PokemonType, PokemonType] =
    secondaryType !== undefined ? [primaryType as PokemonType, secondaryType] : [primaryType as PokemonType];

  const definition = fromGameMaster(
    {
      pokemon_id: m.pokemon_id,
      pokemon_name: m.pokemon_name,
      form: m.form,
      base_attack: m.stats.base_attack,
      base_defense: m.stats.base_defense,
      base_stamina: m.stats.base_stamina,
    },
    pokemonTypes,
    resolvedFast,
    resolvedCharged,
  );

  const naturalId = megaSpeciesIdFor(m.pokemon_name, m.mega_name);
  const finalId = reservedSpeciesIds.has(naturalId) ? `${naturalId}-attacker` : naturalId;
  if (finalId !== naturalId) {
    megaIdCollisions.push({ megaName: m.mega_name, wouldBeId: naturalId, usedId: finalId });
  }
  definition.id = finalId;
  definition.name = m.mega_name;
  // Task 2 of the 2026-09-07 lastKnownRaidTier work: apply the hand-researched
  // tier from RELEASED_MEGA_PRIMAL_ALLOWLIST, if this mega_name has one (see
  // that constant's per-entry citations) — a real, specifically-confirmed
  // historical/debut tier, strictly better evidence than the rarity/boost
  // heuristic defaultRaidTierForSpecies() would otherwise fall back to. May be
  // overwritten below by the active-raid-matching loop's own live-feed
  // observation (Task 1) if this exact mega happens to also be raiding RIGHT
  // NOW under a possibly-different tier — that's intentional: a live
  // observation from THIS run is strictly fresher evidence than a historical
  // debut record, matching this file's documented "whatever this run observed
  // most recently wins" scope for lastKnownRaidTier.
  const allowlistTier = allowlistTierByMegaName.get(m.mega_name.toLowerCase());
  if (allowlistTier) definition.lastKnownRaidTier = allowlistTier;
  // Every real mega/primal Pokémon gets the same-type mega-boost multiplier in
  // the live game. comparison.ts reads this per-species (`species.boost?.multiplier
  // ?? 1`, both for the candidate's own damage output and for team-boost math in
  // uptime.ts) — DEFAULT_MEGA_BOOST_MULTIPLIER is only a fallback *parameter*
  // default, never applied unless a caller omits the argument entirely, which
  // comparison.ts never does. Without this, every one of these 48 entries would
  // silently simulate as an unboosted Pokémon. Neither pogoapi's mega_pokemon.json
  // nor GAME_MASTER's tempEvoOverrides publish a boosted-type per species, so
  // (matching this project's existing convention for dual-typed hypothetical
  // megas, e.g. MEGA_RAICHU_X) the primary listed type stands in for "the type
  // this mega's boost applies to."
  definition.boost = { multiplier: DEFAULT_MEGA_BOOST_MULTIPLIER, boostedType: pokemonTypes[0] };
  reservedSpeciesIds.add(finalId);
  // Mega/primal rarity is keyed on the BASE species' pokemon_id, same as
  // moves above — a species' rarity classification describes the species,
  // not the mega form specifically (and every real mega/primal is itself
  // Standard- or Legendary-rarity depending on its base species). Reuses the
  // baseGmRecord already resolved above for moveset purposes.
  if (!baseGmRecord) rarityFallenBackToStandard.push(`${m.mega_name} (base species rarity)`);
  definition.rarity = baseGmRecord ? pokemonClassToRarity(baseGmRecord.pokemonClass) : "STANDARD";

  megaSpecies.push(definition);
}

// Look up sprites by the NATURAL id (PokeAPI's real slug, e.g. "kyogre-primal")
// rather than the possibly-renamed `finalId` used to avoid a collision with an
// existing hypothetical fixture (e.g. "kyogre-primal-attacker") — the rename
// is purely an internal disambiguation, PokeAPI has never heard of it.
const collisionRenames = new Map(megaIdCollisions.map((c) => [c.usedId, c.wouldBeId]));
const spriteLookupIds = megaSpecies.map((m) => collisionRenames.get(m.id) ?? m.id);
const megaSpriteUrls = await fetchMegaSpriteUrls(RAW_DIR, spriteLookupIds);
for (const m of megaSpecies) {
  const lookupId = collisionRenames.get(m.id) ?? m.id;
  const url = megaSpriteUrls[lookupId];
  if (url) m.imageUrl = url;
}

species.push(...megaSpecies);

// ---------------------------------------------------------------------------
// Build normalized active raids list
// ---------------------------------------------------------------------------

const KNOWN_PREFIXES = [
  "Shadow ",
  "Mega ",
  "Primal ",
  "Alolan ",
  "Galarian ",
  "Hisuian ",
  "Dynamax ",
  "Gigantamax ",
];

function findByExactName(name: string, pool: { id: string; name: string }[]): string | null {
  const lower = name.toLowerCase();
  const hit = pool.find((s) => s.name.toLowerCase() === lower);
  return hit ? hit.id : null;
}

const megaSpeciesLookupPool = megaSpecies.map((s) => ({ id: s.id, name: s.name }));
const speciesLookupPool = species.map((s) => ({ id: s.id, name: s.name }));
const speciesById = new Map(species.map((s) => [s.id, s]));

/**
 * Cached per base species id so e.g. two "Shadow Slowpoke" raid tiers don't
 * synthesize two entries — see getOrCreateShadowVariant
 * (scripts/sync-data/shadowVariant.ts) for the synthesis itself.
 */
const shadowSpeciesByBaseId = new Map<string, SpeciesDefinition>();

const activeRaids: ActiveRaidEntry[] = [];
let unmatchedRaidCount = 0;

for (const raid of rawRaids) {
  let speciesId: string | null = null;
  let isApproximate = false;

  // Priority 1: exact case-insensitive match against a real mega_pokemon.json
  // `mega_name` — the real mega/primal's own real stats, never approximate.
  const exactMega = findByExactName(raid.name, megaSpeciesLookupPool);
  if (exactMega) {
    speciesId = exactMega;
  } else {
    // Priority 2: exact match against the full normalized species pool
    // (Normal-form real species, and now mega species too, though anything
    // in megaSpeciesLookupPool was already tried above). This used to also
    // check a hand-defined hypothetical-fixtures pool (Mega Raichu X/Y, Mega
    // Skarmory) between this step and Priority 1 above — those fixtures were
    // deleted from the engine's product-reachable exports entirely (see
    // CLAUDE.md "Standing decisions", 2026-09-06), so there is nothing left
    // to match against there.
    const exactNormalized = findByExactName(raid.name, speciesLookupPool);
    if (exactNormalized) {
      speciesId = exactNormalized;
    } else {
      // Priority 3 (fallback, approximate): strip a known prefix (e.g.
      // "Shadow ") and match the base species' Normal-form stats as a
      // stand-in. Still legitimately needed for Shadow-prefixed raids,
      // since this project doesn't model the real Shadow atk/def
      // multiplier — see CLAUDE.md/task notes.
      for (const prefix of KNOWN_PREFIXES) {
        if (raid.name.startsWith(prefix)) {
          const baseName = raid.name.slice(prefix.length);
          const baseMatch = findByExactName(baseName, speciesLookupPool);
          if (baseMatch) {
            if (prefix === "Shadow ") {
              // Real, not approximate: synthesize (or reuse) a distinct
              // Shadow-variant SpeciesDefinition with isShadow: true rather
              // than standing in the unboosted base species — see
              // getOrCreateShadowVariant above.
              const baseSpecies = speciesById.get(baseMatch);
              if (baseSpecies) {
                const shadowVariant = getOrCreateShadowVariant(baseSpecies, shadowSpeciesByBaseId);
                speciesId = shadowVariant.id;
                isApproximate = false;
                break;
              }
            }
            speciesId = baseMatch;
            isApproximate = true;
            break;
          }
        }
      }
    }
  }

  if (!speciesId) unmatchedRaidCount++;

  // Live-feed tier capture (Task 1 of the 2026-09-07 lastKnownRaidTier work):
  // whenever a species is successfully matched against a raid entry (exact
  // mega, exact normalized, Shadow-variant synthesis, OR the approximate
  // prefix-stripped fallback above — every branch that assigns speciesId),
  // persist that raid entry's own real `tier` string onto the matched
  // species' `lastKnownRaidTier` field, so raidBoss.ts's
  // defaultRaidTierForSpecies() has a real observation to prefer over its
  // rarity/boost-keyed guess next time this species isn't in the live feed.
  // Only a `tier` string this project's RaidTier union actually recognizes is
  // written (isKnownRaidTier) — an unrecognized/new tier label from the feed
  // is left alone rather than silently widening the type. No run-over-run
  // history is kept: if the same species is matched at two different tiers
  // within this one run (e.g. two separate raid entries), whichever one this
  // loop reaches LAST wins — "whatever this run observed most recently" is
  // the documented scope, not a full history log.
  if (speciesId && isKnownRaidTier(raid.tier)) {
    // speciesById only has ordinary/mega species built before this loop
    // started; a freshly-synthesized Shadow variant (keyed in
    // shadowSpeciesByBaseId by its BASE species id, not its own "-shadow" id)
    // needs a value lookup instead.
    const matchedSpecies = speciesById.get(speciesId) ?? [...shadowSpeciesByBaseId.values()].find((s) => s.id === speciesId);
    if (matchedSpecies) matchedSpecies.lastKnownRaidTier = raid.tier;
  }

  activeRaids.push({
    raidName: raid.name,
    tier: raid.tier,
    speciesId,
    isApproximate,
  });
}

// Fold synthesized Shadow-variant species into the output list, now that raid
// matching (the only thing that triggers synthesizing one) has finished.
const shadowSpecies = [...shadowSpeciesByBaseId.values()];
species.push(...shadowSpecies);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const validationErrors: string[] = [];
for (const s of species) {
  if (!s.types) validationErrors.push(`${s.id}: missing typing`);
  for (const m of s.fastMoves) {
    if (typeof m.power !== "number" || typeof m.durationSeconds !== "number") {
      validationErrors.push(`${s.id}: fast move ${m.name} missing power/duration`);
    }
  }
  for (const m of s.chargedMoves) {
    if (typeof m.power !== "number" || typeof m.durationSeconds !== "number") {
      validationErrors.push(`${s.id}: charged move ${m.name} missing power/duration`);
    }
  }
}

const rawCpm = readJson<{ level: number; multiplier: number }[]>("cp_multiplier.json");
const levels = new Set(rawCpm.map((c) => c.level));
// Sanity check only (cpm.ts is the engine's own hand-verified table, not consumed here).
const hasHalfLevels = rawCpm.some((c) => !Number.isInteger(c.level));
if (!hasHalfLevels) {
  validationErrors.push("cp_multiplier.json: no half-levels found (unexpected)");
}

// ---------------------------------------------------------------------------
// Diffing against previous sync
// ---------------------------------------------------------------------------

const speciesOutPath = join(NORMALIZED_DIR, "species.json");
const raidsOutPath = join(NORMALIZED_DIR, "activeRaids.json");

let previousSpecies: SpeciesDefinition[] | null = null;
let previousRaids: ActiveRaidEntry[] | null = null;
if (existsSync(speciesOutPath)) {
  try {
    previousSpecies = JSON.parse(readFileSync(speciesOutPath, "utf-8"));
  } catch {
    previousSpecies = null;
  }
}
if (existsSync(raidsOutPath)) {
  try {
    previousRaids = JSON.parse(readFileSync(raidsOutPath, "utf-8"));
  } catch {
    previousRaids = null;
  }
}

// ---------------------------------------------------------------------------
// lastKnownRaidTier carry-forward (precedence step 3 of 4 — see
// SpeciesDefinition.lastKnownRaidTier's doc comment in packages/engine/src/
// types.ts and RELEASED_MEGA_PRIMAL_ALLOWLIST's doc comment above for steps
// 1/2). Without this, lastKnownRaidTier is rebuilt from scratch every run
// from only (1) this run's own live-raid observation and (2) the
// hand-researched allowlist — so a species that was observed raiding in some
// EARLIER run, is not in the allowlist, and isn't raiding again THIS run
// silently loses the field the moment it rotates out (a real regression
// caught 2026-09-07: steelix-mega/aggron-mega/glalie-mega lost "Mega Raids"
// on the very rotation this field exists to survive). Fix: carry forward the
// PREVIOUS run's species.json value for any species this run produced no
// fresher signal for. Precedence (highest wins, matches the field's doc
// comment and the mega-build-loop comment above it):
//   1. This run's own live-raid-feed observation (already applied above,
//      both in the mega-build loop's post-allowlist overwrite and in the
//      raid-matching loop) — freshest evidence, already wins by construction
//      since it's applied before this step ever runs.
//   2. RELEASED_MEGA_PRIMAL_ALLOWLIST's hand-researched tier (already applied
//      in the mega-build loop, before this step).
//   3. THIS carry-forward: the previous species.json's own lastKnownRaidTier,
//      reused verbatim if this run set neither 1 nor 2.
//   4. Nothing — left undefined, so raidBoss.ts's defaultRaidTierForSpecies()
//      falls through to its rarity/boost heuristic rather than guessing.
// Reuses `previousSpecies` (already loaded above for diffSpecies/diffRaids)
// rather than a second read of species.json. A first-ever run (previousSpecies
// null, no existing species.json) simply carries forward nothing — no crash.
// ---------------------------------------------------------------------------

const previousLastKnownRaidTierById = new Map<string, RaidTier>();
if (previousSpecies) {
  for (const p of previousSpecies) {
    if (p.lastKnownRaidTier) previousLastKnownRaidTierById.set(p.id, p.lastKnownRaidTier);
  }
}
const lastKnownRaidTierCarriedForward: { id: string; tier: RaidTier }[] = [];
for (const s of species) {
  if (s.lastKnownRaidTier === undefined) {
    const carried = previousLastKnownRaidTierById.get(s.id);
    if (carried) {
      s.lastKnownRaidTier = carried;
      lastKnownRaidTierCarriedForward.push({ id: s.id, tier: carried });
    }
  }
}

const speciesDiffs = diffSpecies(previousSpecies, species);
const raidDiffs = diffRaids(previousRaids, activeRaids);

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

if (!existsSync(NORMALIZED_DIR)) mkdirSync(NORMALIZED_DIR, { recursive: true });

writeFileSync(speciesOutPath, JSON.stringify(species, null, 2));
writeFileSync(raidsOutPath, JSON.stringify(activeRaids, null, 2));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const RAID_FALLBACK_PATH = raidFallbackPathFor(REPO_ROOT);
const SCRAPEDDUCK_RAIDS_URL = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.json";

const raidsWithNullSpecies = activeRaids.filter((r) => r.speciesId === null).length;
const raidsApproximate = activeRaids.filter((r) => r.isApproximate).length;

console.log(`SYNCED: GAME_MASTER (primary), pokemon_stats/pokemon_types/fast_moves/charged_moves/current_pokemon_moves (roster + fallback), cp_multiplier, mega_pokemon, scrapedduck-raids (${species.length} species [${species.length - megaSpecies.length - shadowSpecies.length} single-form (Normal, or fallback — see WARNINGS) + ${megaSpecies.length} mega/primal + ${shadowSpecies.length} Shadow variant (synthesized for Shadow raid matches, isShadow: true, real base stats untouched — see WARNINGS)], ${fastMoveByName.size + chargedMoveByName.size} pogoapi-fallback moves cached + ${gameMasterFetchResult.moves.length} GAME_MASTER moveSettings entries)`);
console.log(`CHANGED (species.json): ${speciesDiffs.length > 0 ? speciesDiffs.join("; ") : "none"}`);
console.log(`CHANGED (activeRaids.json): ${raidDiffs.length > 0 ? raidDiffs.join("; ") : "none"}`);
console.log(`AFFECTS SCENARIOS: none (no saved scenarios reference normalized species yet; scenarioA.ts fixtures untouched)`);
console.log(`WARNINGS:`);
if (gameMasterAvailable) {
  console.log(
    `  - GAME_MASTER (PRIMARY source as of the 2026-09-06 pipeline switch): live fetch succeeded, data/raw/game_master.json cached (${gameMasterFetchResult.pokemon.length} pokemonSettings templates, ${gameMasterFetchResult.moves.length} moveSettings entries extracted from the ~19-20MB upstream dump — read moveSettings [PvE], never combatMove [PvP], confirmed via direct inspection they carry different power/energy numbers for the same move name).${gameMasterFetchResult.recoveredMoveIds.length > 0 ? ` Recovered ${gameMasterFetchResult.recoveredMoveIds.length} move(s) whose raw movementId field was malformed (a numeric id instead of the string identifier — a GAME_MASTER data-quality quirk, not a parsing bug here) by reading their real id off their own templateId: ${gameMasterFetchResult.recoveredMoveIds.join(", ")}.` : ""}${gameMasterFetchResult.droppedMoveCount > 0 ? ` Dropped ${gameMasterFetchResult.droppedMoveCount} moveSettings entries whose movementId couldn't be recovered at all (confirmed not referenced by any released species' moveset).` : ""}`,
  );
} else {
  console.log(
    `  - VALIDATION: GAME_MASTER fetch FAILED this run (${gameMasterFetchResult.error}) — every species this run fell all the way back to pogoapi-sourced stats/typing/moveset, and rarity defaulted to "STANDARD" across the board (pokemon_rarity.json is no longer fetched independently — see below). Re-run once GAME_MASTER is reachable again.`,
  );
}
console.log(
  `  - pokemon_rarity.json is no longer fetched: GAME_MASTER's own \`pokemonClass\` field replaces it entirely (confirmed 2026-09-06: pokemonClass's per-species Legendary/Mythic/Ultra-Beast counts — 77/23/11 — match pokemon_rarity.json's own unique-pokemon_id counts EXACTLY). ${rarityFallenBackToStandard.length === 0 ? "Every species this run had a resolvable GAME_MASTER rarity signal — no STANDARD-by-default fallbacks needed." : `${rarityFallenBackToStandard.length} species/mega had no resolvable GAME_MASTER record at all this run and defaulted to "STANDARD" rarity (no independent signal left to check against): ${rarityFallenBackToStandard.join(", ")}`}`,
);
console.log(
  `  - Species that fell back to pogoapi-sourced stats/typing/moveset entirely this run (no matching GAME_MASTER pokemonSettings template resolved via enum + form matching — see resolvePokemonEnum/resolveGameMasterPokemonRecord in scripts/sync-data/gameMasterMatching.ts): ${speciesFallenBackToPogoapi.length === 0 ? "none (100% GAME_MASTER coverage this run)" : speciesFallenBackToPogoapi.join(", ")}`,
);
console.log(
  `  - Individual moves that fell back to a pogoapi-sourced value (species' own GAME_MASTER template resolved fine, but this specific movementId had no matching moveSettings entry): ${moveFallenBackToPogoapi.size === 0 ? "none (100% GAME_MASTER move coverage this run)" : [...moveFallenBackToPogoapi].join(", ")}`,
);
console.log(
  `  - Mega/primal roster entries (of pogoapi's ${rawMegaPokemon.length}) whose stats/type fell back to pogoapi's own mega_pokemon.json value (no GAME_MASTER tempEvoOverrides match resolved): ${megaValueFallbacks.length === 0 ? "none (all matched GAME_MASTER exactly this run, cross-checked 2026-09-06)" : megaValueFallbacks.join(", ")}`,
);
if (raidFetchResult.source === "scrapedduck") {
  console.log(`  - Active-raids source: live ScrapedDuck feed (${SCRAPEDDUCK_RAIDS_URL}), re-fetched and re-cached this run (data/raw/raids.json).`);
} else if (raidFetchResult.source === "fallback-file") {
  console.log(`  - VALIDATION: ScrapedDuck raids feed unreachable/malformed this run (${raidFetchResult.error}) — fell back to the project-owned override file at ${RAID_FALLBACK_PATH}. Active-raids data may be stale until the feed recovers or that file is updated by hand.`);
} else {
  console.log(`  - VALIDATION: ScrapedDuck raids feed unreachable/malformed this run (${raidFetchResult.error}), AND no project-owned override file existed yet — created an empty one at ${RAID_FALLBACK_PATH} (schema: { bosses: RawRaidEntry[] }). activeRaids.json is EMPTY this run until that file is populated by hand or the feed recovers.`);
}
console.log(`  - Scope limitation: only one form per species (form === "Normal", or a documented fallback — see next line) was normalized from pokemon_stats.json (${normalStats.length} candidates out of ${rawStats.length} total rows spanning 273 distinct forms), plus all ${rawMegaPokemon.length} mega_pokemon.json entries. Other regional/costume/event forms are still out of scope this pass.`);
console.log(`  - Fallback-form species (no row labeled "Normal" in pokemon_stats.json; ${fallbackFormPokemonIds.size} of ${defaultFormByPokemonId.size} distinct pokemon_id values): normalized under their first-listed form, or a FORM_OVERRIDES entry when the first-listed form was confirmed wrong (see below). Full audit completed 2026-09-05 against all 59 species named in the previous sync's report (Bulbapedia/GamePress/PoGo-release-status cross-check, not just a spot-check): ${[...fallbackFormPokemonIds].map((id) => `${rawStats.find((s) => s.pokemon_id === id)?.pokemon_name} (${defaultFormByPokemonId.get(id)})`).join(", ")}`);
console.log(`  - FORM_OVERRIDES applied (${Object.keys(FORM_OVERRIDES).length} species, see scripts/sync-data.ts's FORM_OVERRIDES doc comment for the full per-species reasoning): Shellos/Gastrodon -> West_sea, Darmanitan -> Standard, Deerling/Sawsbuck -> Spring, Flabébé/Floette/Florges -> Red, Aegislash -> Shield, Zygarde -> Fifty_percent, Lycanroc -> Midday, Wishiwashi -> Solo, Mimikyu -> Disguised, Sinistea/Polteageist -> Phony, Zacian/Zamazenta -> Hero, Palafin -> Zero, Dudunsparce -> Two, Poltchageist -> Counterfeit, Sinistcha -> Unremarkable.`);
console.log(`  - Deliberately NOT overridden (multiple real, independently-released forms with no single correct "default" per a Bulbapedia/GO-focused check): Urshifu (Single Strike vs Rapid Strike), Indeedee (Male vs Female — stats genuinely differ, no canonical default), Basculin (Red- vs Blue-Striped). Also left alone: species where every candidate form has identical stats/type and no clearly-conventional default exists either (Unown, Spinda, Scatterbug/Spewpa/Vivillon, Furfrou, Minior, Squawkabilly, Tatsugiri, Toxtricity, Maushold, Koraidon, Miraidon, and the single-form-only Galarian-native species: Obstagoon, Perrserker, Sirfetch'd, Mr. Rime, Runerigus) — this pass's fallback pick for all of these was confirmed correct or inconsequential.`);
if (formOverrideMismatches.length > 0) {
  console.log(`  - VALIDATION: FORM_OVERRIDES named a form pokemon_stats.json doesn't actually have a row for (override skipped, generic fallback used instead — check for a typo or an upstream form-name rename): ${formOverrideMismatches.map((m) => `pokemon_id ${m.pokemon_id} -> "${m.wanted}"`).join(", ")}`);
}
console.log(`  - Skipped ${skippedSpecies.length} species for missing typing/moveset data: ${skippedSpecies.map((s) => `${s.pokemon_name} (${s.reason})`).join(", ") || "none"}`);
console.log(`  - Unresolved move names referenced by a species' moveset but absent from BOTH GAME_MASTER's moveSettings AND pogoapi's fast_moves/charged_moves.json (likely retired/legacy/Dynamax-only moves, filtered out silently per-species): ${[...unresolvedMoveNames].join(", ") || "none"}`);
console.log(`  - Raid entries with no usable stat data (speciesId: null): ${raidsWithNullSpecies} of ${activeRaids.length}`);
console.log(`  - Raid entries matched approximately (base/Normal-form stats standing in for a regional/mega variant this project lacks real per-form stat data for): ${raidsApproximate}`);
console.log(`  - GAME_MASTER gap-fill for mega/primal stats beyond pogoapi.net's 48-entry mega_pokemon.json list, from two independent gates (a currently-live raid naming one, OR a hand-curated RELEASED_MEGA_PRIMAL_ALLOWLIST entry for a real-but-not-currently-raiding mega — see PokeMiners' GAME_MASTER mirror doc comment in scripts/sync-data/fetchCache.ts and RELEASED_MEGA_PRIMAL_ALLOWLIST's doc comment in this file): ${megaOrPrimalGapCandidates.length === 0 ? "not needed this run (no active Mega/Primal raid outside pogoapi's 48-entry list, and no allowlist entry currently needed)" : `${megaOrPrimalGapCandidates.length} gap(s) found (${megaOrPrimalGapCandidates.map((c) => `${c.name} [${c.source}]`).join(", ")}); resolved via GAME_MASTER: ${gameMasterDerivedMega.length > 0 ? gameMasterDerivedMega.map((m) => m.mega_name).join(", ") : "none"}${gameMasterUnresolvedGaps.length > 0 ? `; UNRESOLVED (no fallback data exists for these — pogoapi's mega_pokemon.json doesn't cover them at all, so they're simply absent from species.json this run): ${gameMasterUnresolvedGaps.join("; ")}` : ""}`}`);
console.log(`  - RELEASED_MEGA_PRIMAL_ALLOWLIST mechanism (hand-curated, see this file's doc comment on that constant): exists to catch a real, released mega/primal that's neither in pogoapi's mega_pokemon.json roster nor in the current raid rotation (e.g. a mega whose debut was a single past raid-day event) — currently lists ${RELEASED_MEGA_PRIMAL_ALLOWLIST.length} entry(ies): ${RELEASED_MEGA_PRIMAL_ALLOWLIST.map((e) => e.name).join(", ")}. ${megaOrPrimalAllowlistGaps.length === 0 ? "None of these were needed via this specific gate this run (already covered by pogoapi's roster or the live raid feed instead)." : `${megaOrPrimalAllowlistGaps.length} of them were resolved via this gate this run: ${megaOrPrimalAllowlistGaps.join(", ")}.`}`);
console.log(
  `  - lastKnownRaidTier backfill (2026-09-07 research pass, see RELEASED_MEGA_PRIMAL_ALLOWLIST's per-entry citations): ${RELEASED_MEGA_PRIMAL_ALLOWLIST.filter((e) => e.lastKnownRaidTier !== undefined).map((e) => `${e.name} -> "${e.lastKnownRaidTier}"`).join(", ") || "none"}. Left unset after genuine research effort (falls through to the rarity/boost heuristic instead of a guess): ${RELEASED_MEGA_PRIMAL_ALLOWLIST.filter((e) => e.lastKnownRaidTier === undefined).map((e) => e.name).join(", ") || "none"}.`,
);
console.log(
  `  - lastKnownRaidTier carried forward from the previous species.json (precedence step 3 — this run set neither a fresh live-raid observation nor an allowlist tier for these, see the doc comment above the carry-forward step in this file): ${lastKnownRaidTierCarriedForward.length === 0 ? "none" : lastKnownRaidTierCarriedForward.map((c) => `${c.id} -> "${c.tier}"`).join(", ")}.`,
);
if (gameMasterCrossChecks.length > 0) {
  console.log(`  - GAME_MASTER cross-check against independent community sources: ${gameMasterCrossChecks.join("; ")}`);
}
console.log(`  - Shadow raid entries (${shadowSpecies.length} distinct species synthesized: ${shadowSpecies.map((s) => s.name).join(", ") || "none"}): now real, not approximate, matches — each gets its own SpeciesDefinition (id "<base>-shadow") with isShadow: true and unmultiplied base stats copied from the real base species; the engine's shadowAdjustedBaseStats (packages/engine/src/shadow.ts) applies SHADOW_ATTACK_MULTIPLIER (1.2)/SHADOW_DEFENSE_MULTIPLIER (0.83) at effective-stat time. Previously these were flagged isApproximate: true against the unboosted base species.`);
console.log(`  - Speculative/hypothetical species in use for raid matching: none. This project's 4 hand-authored hypothetical fixtures (Mega Raichu X/Y, Primal Kyogre, Mega Skarmory) were deleted from the engine's product-reachable exports entirely (CLAUDE.md "Standing decisions", 2026-09-06); this sync no longer imports or matches against them. Note separately: GAME_MASTER can in general carry real, well-formed tempEvoOverrides blocks for mega forms Niantic hasn't released YET (a known datamining phenomenon) — this pipeline never surfaces those on their own, since every mega/primal species it builds is still gated against pogoapi's mega_pokemon.json roster, a currently-live ScrapedDuck raid, or the hand-curated RELEASED_MEGA_PRIMAL_ALLOWLIST, never GAME_MASTER's tempEvoOverrides alone. (Falinks/Malamar/Chesnaught/Delphox/Greninja were flagged here as examples of this in an earlier sync's WARNINGS — all 5 have since genuinely shipped and moved to RELEASED_MEGA_PRIMAL_ALLOWLIST this run, see that constant's doc comment for citations; no other specific example is currently known.)`);
console.log(`  - mega_pokemon.json entries are REAL data (not flagged speculative) but model an ATTACKER (standard level/IV/CPM pipeline), not a raid boss — the real Primal Kyogre entry now normalizes to id "${reservedSpeciesIds.has("kyogre-primal-attacker") ? "kyogre-primal-attacker" : "kyogre-primal"}" (previously forced to "-attacker" to avoid colliding with a hand-tuned boss-mode fixture of the same id that has since been deleted from product data — see above).`);
console.log(`  - Mega/primal species id collisions resolved by appending "-attacker": ${megaIdCollisions.length > 0 ? megaIdCollisions.map((c) => `${c.megaName} (${c.wouldBeId} -> ${c.usedId})`).join(", ") : "none"}`);
console.log(`  - mega_pokemon.json/GAME_MASTER's tempEvoOverrides have no per-species boosted-type data, so each of the ${megaSpecies.length} mega/primal entries gets boost = { multiplier: DEFAULT_MEGA_BOOST_MULTIPLIER (1.3), boostedType: <its primary listed type> } — comparison.ts only applies a mega boost when \`species.boost\` is explicitly set (its fallback is 1, not 1.3), so this was required, not cosmetic.`);
const megaSpeciesWithoutImage = megaSpecies.filter((m) => !m.imageUrl).map((m) => m.name);
console.log(`  - Mega/primal species image lookups (PokeAPI, cached to data/raw/mega_sprite_urls.json): ${megaSpecies.length - megaSpeciesWithoutImage.length}/${megaSpecies.length} resolved${megaSpeciesWithoutImage.length > 0 ? `; no image found for: ${megaSpeciesWithoutImage.join(", ")}` : ""}. All Normal-form-or-fallback-form species get a dex-id sprite URL with no extra request.`);
if (validationErrors.length > 0) {
  console.log(`  - VALIDATION ERRORS: ${validationErrors.join("; ")}`);
}
