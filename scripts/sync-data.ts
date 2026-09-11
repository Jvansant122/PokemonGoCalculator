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
  DEFAULT_MEGA_BOOST_MULTIPLIER,
  isKnownRaidTier,
  RAID_TIER_TABLE,
  defaultRaidTierForSpecies,
  // 2026-09-08, Power-Up Optimizer data source (see IDEAS.md's "Power-Up
  // Optimizer" entry). Written in parallel with engine-developer's own work —
  // this export does not exist yet as of this script's authoring; expect a
  // "no exported member" type error until engine-developer lands
  // packages/engine/src/powerUp.ts and re-exports it from index.ts. Never
  // worked around locally (e.g. by re-deriving the table here) — the engine
  // owns this interpretation, same as fromGameMaster/fromGameMasterMove.
  powerUpCostTableFromGameMaster,
  type PokemonType,
  type PokemonRarity,
  type RaidTier,
  type SpeciesDefinition,
  type FastMove,
  type ChargedMove,
  type PowerUpCostTable,
} from "@pogo-analyzer/engine";

import type {
  RawPokemonStatsEntry,
  RawPokemonTypesEntry,
  RawMoveEntry,
  RawCurrentMovesEntry,
  RawMegaPokemonEntry,
  ActiveRaidEntry,
  RaidHistoryEntry,
  GameMasterPokemonRecord,
  RawRaidBossesPreviousEntry,
} from "./sync-data/rawShapes.ts";
import {
  fetchAndCacheMegaPokemon,
  fetchAndCacheRaids,
  fetchAndCacheRaidBossesPrevious,
  fetchAndCacheBulbapediaRaidArchive,
  fetchAndCacheBulbapediaShadowRaidArchive,
  fetchAndCachePokebattlerRaids,
  fetchGameMasterData,
  fetchMegaSpriteUrls,
  raidFallbackPathFor,
} from "./sync-data/fetchCache.ts";
import {
  parseBulbapediaRaidRows,
  parseBulbapediaShadowRaidPage,
  buildBaseNameIndex,
  resolveBulbapediaRow,
} from "./sync-data/bulbapediaRaidArchive.ts";
import {
  isCurrentRotationTier,
  buildEnumToPogoapiName,
  pokebattlerDisplayNameForCrossCheck,
  isArchivableLegacyTier,
  POKEBATTLER_LEGACY_NUMERIC_TIER_MAP,
  POKEBATTLER_LEGACY_MEGA_TIERS,
  POKEBATTLER_LEGACY_EXCLUDED_TIERS,
  resolvePokebattlerPokemonId,
  resolveMegaLegacyTier,
  type PokebattlerResolutionContext,
} from "./sync-data/pokebattlerRaids.ts";
import { toPokemonType, toRawGameMasterMove, toRawGameMasterMoveFromMoveSettings, spriteUrlForDexId } from "./sync-data/adapters.ts";
import {
  resolvePokemonEnum,
  resolveGameMasterPokemonRecord,
  resolveMegaFromGameMaster,
  pokemonClassToRarity,
  guessMovementIdForDisplayName,
  // Phase 0 of PLAN_multi_raid_roster_optimizer.md §3.6/§3.4/§4.2 — the
  // "unevolved Pokémon are not power-up candidates" filter's data source.
  isFullyEvolved,
  realEvolutionTargets,
  type EvolutionTarget,
  // 2026-09-10 fix for 21 species whose name carried a raw underscored form
  // straight through (e.g. "Zacian (Crowned_sword)") — see
  // applyCleanFormDisplayName below and formDisplayName's own doc comment.
  formDisplayName,
} from "./sync-data/gameMasterMatching.ts";
import {
  megaSpeciesIdFor,
  parseMegaOrPrimalRaidName,
  tempEvoIdFor,
  resolveMegaSpeciesIdCollision,
  spriteLookupIdFor,
} from "./sync-data/megaPrimalParsing.ts";
import { getOrCreateShadowVariant } from "./sync-data/shadowVariant.ts";
import { matchRaidName } from "./sync-data/raidNameMatching.ts";
import { diffSpecies, diffRaids } from "./sync-data/diff.ts";
import { RELEASED_MEGA_PRIMAL_ALLOWLIST } from "./sync-data/releasedMegaPrimalAllowlist.ts";
import { SUPER_MAX_PLUS_MOVES, attachSuperMaxPlusMoves } from "./sync-data/superMaxPlusMoves.ts";

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
await new Promise((resolve) => setTimeout(resolve, 150)); // short delay between sequential live fetches, per project convention

// pogoapi.net's raid_bosses.json `previous` list — 2026-09-07 raidHistory
// backfill task (see the "pogoapi-previous historical backfill" section
// below for how this is consumed). Best-effort: a fetch failure here just
// means zero "pogoapi-previous" entries get added this run (logged in
// WARNINGS), never a failed sync — see fetchAndCacheRaidBossesPrevious's own
// doc comment in ./sync-data/fetchCache.ts.
const raidBossesPreviousFetchResult = await fetchAndCacheRaidBossesPrevious(RAW_DIR);
await new Promise((resolve) => setTimeout(resolve, 150)); // short delay between sequential live fetches, per project convention

// Bulbapedia's raid-archive pages — 2026-09-07 raidHistory Bulbapedia union
// backfill (see the "Bulbapedia archive union" section below). Independent of
// and additive to raidBossesPreviousFetchResult above; same best-effort
// discipline (a fetch failure here just means zero "bulbapedia-archive"
// entries get added/upgraded this run, logged in WARNINGS, never a failed
// sync) — see fetchAndCacheBulbapediaRaidArchive's own doc comment.
const bulbapediaRaidArchiveFetchResult = await fetchAndCacheBulbapediaRaidArchive(RAW_DIR);
await new Promise((resolve) => setTimeout(resolve, 150)); // short delay between sequential live fetches, per project convention

// The single Bulbapedia "List of Shadow Raid Boss changes" page — 2026-09-08
// shadow-variant durability task (see the "Shadow-variant durable synthesis"
// section below and fetchAndCacheBulbapediaShadowRaidArchive's own doc
// comment in ./sync-data/fetchCache.ts). Thin corroboration only, same
// best-effort discipline as every other archive fetch above.
const bulbapediaShadowRaidArchiveFetchResult = await fetchAndCacheBulbapediaShadowRaidArchive(RAW_DIR);
await new Promise((resolve) => setTimeout(resolve, 150)); // short delay between sequential live fetches, per project convention

// Pokebattler's raid roster — feeds TWO tasks now (see
// ./sync-data/pokebattlerRaids.ts's top-of-file note): (1) the 2026-09-07
// LIVE cross-check against ScrapedDuck, and (2) the 2026-09-08 `_LEGACY`
// archive import into raidHistory.json's "pokebattler-legacy" source (see
// the "Pokebattler legacy archive backfill" section further down this file).
// Best-effort for both: a fetch failure here just means the cross-check is
// skipped AND zero "pokebattler-legacy" rows are added this run (logged in
// WARNINGS), never a failed sync — see fetchAndCachePokebattlerRaids's own
// doc comment in ./sync-data/fetchCache.ts. ScrapedDuck (raidFetchResult
// above) remains the sole source for activeRaids.json regardless of what
// the live cross-check finds.
const pokebattlerFetchResult = await fetchAndCachePokebattlerRaids(RAW_DIR);

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

/**
 * Per-(pokemon_id, form) lookups, unlike typesByPokemonId/movesByPokemonId
 * above which only ever keep the ONE row matching each id's chosen default
 * form. Needed by the "mechanically-distinct extra forms" pass below (2026-
 * 09-08, AUDIT_2026-09-08.md Defect 1) as the pogoapi fallback path for a
 * specific non-default form when GAME_MASTER has no exact template for it —
 * not observed for any of the 83 extra-form candidates in the 2026-09-08
 * audit (all 83 resolved via an exact GAME_MASTER form-key match), but
 * budgeted for regardless, same discipline as every other fallback in this
 * file.
 */
const typesByPokemonIdAndForm = new Map<string, RawPokemonTypesEntry>();
for (const t of rawTypes) typesByPokemonIdAndForm.set(`${t.pokemon_id}|${t.form}`, t);

const movesByPokemonIdAndForm = new Map<string, RawCurrentMovesEntry>();
for (const c of rawCurrentMoves) movesByPokemonIdAndForm.set(`${c.pokemon_id}|${c.form}`, c);

/** Builds the `[PokemonType]|[PokemonType,PokemonType]` shape fromGameMaster expects from either a GAME_MASTER or pogoapi raw type-string list; returns null for an empty list (caller skips the species, same as before this switch). */
function buildTypesArray(rawTypeStrings: string[]): [PokemonType] | [PokemonType, PokemonType] | null {
  const converted = rawTypeStrings.map(toPokemonType);
  if (converted.length === 0) return null;
  const [primary, secondary] = converted;
  return secondary !== undefined ? [primary as PokemonType, secondary] : [primary as PokemonType];
}

/**
 * fromGameMaster composes `.name` as `` `${pokemon_name} (${raw.form})` ``
 * using the SAME raw form string that (correctly) drives `.id` via
 * speciesIdFor (packages/engine/src/gamemaster.ts) — and that id must NEVER
 * change (species ids are embedded in every shared scenario URL). So this
 * cleanup runs AFTER fromGameMaster has already returned, overwriting ONLY
 * `.name` with the same pokemon_name plus a title-cased form
 * (formDisplayName, ./sync-data/gameMasterMatching.ts) — never touching
 * `.id`, never touching the raw `form` value passed into fromGameMaster
 * itself (still needed, unmodified, for GAME_MASTER form-key matching and
 * pokemon_stats.json row lookups elsewhere in this file).
 *
 * 2026-09-10 fix for 21 species whose name carried a raw underscore straight
 * through, e.g. "Zacian (Crowned_sword)" -> "Zacian (Crowned Sword)".
 * Deliberately NOT a change to packages/engine/src/gamemaster.ts itself —
 * fromGameMaster's `.id`/`.name` share one input field by design, and
 * reaching in from outside to fix only the display half keeps that
 * single-source-of-truth transform in the engine untouched.
 *
 * A no-op for the "Normal" form (fromGameMaster already omits the
 * parenthetical entirely in that case) and for a form with no underscore at
 * all (formDisplayName is idempotent on those — title-casing a single word
 * already spelled "Hero" or "Shield" reproduces it unchanged).
 */
function applyCleanFormDisplayName(definition: SpeciesDefinition, pokemonName: string, rawForm: string | undefined): void {
  if (rawForm && rawForm !== "Normal") {
    definition.name = `${pokemonName} (${formDisplayName(rawForm)})`;
  }
}

/**
 * sync-data.ts-local extension of `SpeciesDefinition`, used ONLY to carry
 * `kmBuddyDistance` (GAME_MASTER's own first-party buddy-walking-distance
 * tiering key, see GameMasterPokemonRecord.kmBuddyDistance's doc comment in
 * ./sync-data/rawShapes.ts) through to data/normalized/species.json ahead of
 * a formal `SpeciesDefinition` field — that's a schema decision this script
 * does not own (CLAUDE.md's "When the schema itself needs to change"; see
 * data-sync's own operating rule of the same name). data/normalized/
 * species.json is plain JSON on the way out (`JSON.stringify(species, ...)`
 * below), never re-imported as `SpeciesDefinition` at compile time, so this
 * cast doesn't misrepresent what `fromGameMaster`'s real return type
 * promises any other caller. Set only where a matched GAME_MASTER template
 * is available — same two call sites, same discipline, as
 * `definition.candyFamilyId` right next to each use below.
 */
type SpeciesWithKmBuddyDistance = SpeciesDefinition & { kmBuddyDistance?: number };
function setKmBuddyDistance(definition: SpeciesDefinition, kmBuddyDistance: number | undefined): void {
  (definition as SpeciesWithKmBuddyDistance).kmBuddyDistance = kmBuddyDistance;
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
/**
 * pokemon_id -> the default form's resolved type array, populated as the
 * primary loop below builds each species. Read by the "mechanically-distinct
 * extra forms" pass further down this file so a candidate form's typing can
 * be compared against its OWN default form's typing (not re-derived from
 * scratch), the same way that pass already compares base_attack/defense/
 * stamina against baseRow.
 */
const typesByDefaultForm = new Map<number, [PokemonType] | [PokemonType, PokemonType]>();

/**
 * GAME_MASTER form key (e.g. "METANG_NORMAL", already enum-prefixed — see
 * GameMasterPokemonRecord.form's doc comment) -> the species id built for
 * that exact matched template, populated as each species below is pushed
 * (both the primary loop and the "mechanically-distinct extra forms" pass
 * further down). Phase 0 of PLAN_multi_raid_roster_optimizer.md §3.6/§3.4/
 * §4.2: resolves a REAL evolution branch's `EvolutionTarget.form` (see
 * realEvolutionTargets in ./sync-data/gameMasterMatching.ts) to the species
 * id it actually evolves into. Only ever set for a species that resolved a
 * real GAME_MASTER template — a species that fell all the way back to
 * pogoapi has no GAME_MASTER form key to register under.
 */
const speciesIdByGameMasterFormKey = new Map<string, string>();
/**
 * GAME_MASTER pokemonId enum -> the DEFAULT-form species id built for that
 * enum (primary loop only — the extra-forms pass deliberately never writes
 * here, since every species it builds is by definition a non-default form).
 * Fallback target for resolveEvolutionTargetSpeciesId below when a branch's
 * own `form` doesn't exactly match any registered template, mirroring
 * resolveGameMasterPokemonRecord's own NORMAL/bare-template fallback
 * priority used everywhere else in this file for the identical
 * (enum, form) -> record identity problem.
 */
const speciesIdByGameMasterEnum = new Map<string, string>();
/**
 * Every species built this run that resolved a real GAME_MASTER template,
 * paired with that exact matched record — read by the evolution-resolution
 * pass immediately after the "mechanically-distinct extra forms" loop below,
 * once speciesIdByGameMasterFormKey/speciesIdByGameMasterEnum are fully
 * populated. Deliberately a second pass rather than resolving inline per
 * species: a target species can be built LATER in pokemon_stats.json's own
 * row order than the species evolving into it (e.g. Beldum's row precedes
 * Metang's), so resolution must wait until every species this run is going
 * to build (short of mega/primal/Shadow, which no real evolution branch ever
 * targets) has actually been built.
 */
const pendingEvolutionResolution: { definition: SpeciesDefinition; gmRecord: GameMasterPokemonRecord }[] = [];
/**
 * Evolution branches whose target enum/form never resolved to a registered
 * species id — reported loudly in WARNINGS below, never silently dropped
 * (a dropped branch is the dangerous direction: it reads exactly like a
 * genuinely fully-evolved species, which would let the Power-Up Optimizer
 * recommend powering up something that should be evolved first instead).
 * Expected to stay empty or near-empty: Phase 0's own groundwork measured
 * 859 distinct real evolution edges, all resolving at the enum level.
 */
const unresolvedEvolutionBranches: string[] = [];
/**
 * The OTHER inconsistency realEvolutionTargets's own doc comment (see
 * ./sync-data/gameMasterMatching.ts) explicitly calls out for a caller like
 * this one to cross-check: `isFullyEvolved(candidatesForEnum) === false`
 * (the UNION across every template sharing this enum found a real branch
 * SOMEWHERE) but `realEvolutionTargets(gmRecord)` on the SPECIFIC matched
 * template returns `[]` (that one template's own branch is empty). Confirmed
 * in the live 2026-09-09 dump for two genuinely different reasons, neither a
 * bug in isFullyEvolved itself: (1) a regional-form-gated evolution — e.g.
 * base/Kantonian Farfetch'd never evolves, only its Galarian sibling (->
 * Sirfetch'd) does, same pattern for Mr. Mime/Qwilfish/Corsola/Linoone — so
 * the union correctly flags the ENUM as "has an evolution somewhere" but
 * that's not actually reachable from THIS specific matched form; (2) a
 * multi-stage single-enum chain where a LATER stage has already reached its
 * own final form — Zygarde Complete/Complete_ten_percent are matched exactly
 * and carry no branch of their own, but Zygarde 10%/50%'s branches (elsewhere
 * under the same ZYGARDE enum) make the union say false for every Zygarde
 * form including Complete. Per that doc comment: NEVER silently fall back to
 * isFullyEvolved: true for these — isFullyEvolved stays exactly as
 * isFullyEvolved() computed it (the safe-er direction: worst case an already-
 * final form is wrongly excluded from candidate generation, never the
 * reverse) — but it must be reported loudly rather than left as an
 * unexplained empty evolvesToIds.
 */
const isFullyEvolvedRealEvolutionTargetsInconsistencies: string[] = [];

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
  typesByDefaultForm.set(pokemonId, pokemonTypes);

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
  // 2026-09-10 fix — see applyCleanFormDisplayName's own doc comment. Never
  // touches `definition.id`, only the composed display name.
  applyCleanFormDisplayName(definition, stat.pokemon_name, stat.form);
  // National-dex sprite, keyed by the pokemon_id we already have — no extra
  // network call needed for any of the Normal-form-or-fallback-form species
  // handled here (unlike the 48 mega entries below, which need a per-species
  // PokeAPI lookup for their own distinct internal ID).
  definition.imageUrl = spriteUrlForDexId(stat.pokemon_id);
  definition.rarity = rarity;
  // Phase 0 of PLAN_multi_raid_roster_optimizer.md §5: dexNumber is available
  // regardless of whether this species resolved a real GAME_MASTER template
  // (pokemon_stats.json's own pokemon_id, already in scope) — the remaining
  // three fields need GAME_MASTER's own evolutionBranch/familyId data, so
  // they stay undefined for a species that fell all the way back to pogoapi
  // (already logged above in speciesFallenBackToPogoapi).
  definition.dexNumber = stat.pokemon_id;
  if (gmRecord && enumName) {
    definition.isFullyEvolved = isFullyEvolved(gameMasterPokemonByEnum.get(enumName) ?? []);
    definition.candyFamilyId = gmRecord.familyId;
    setKmBuddyDistance(definition, gmRecord.kmBuddyDistance);
    if (gmRecord.form) speciesIdByGameMasterFormKey.set(gmRecord.form, definition.id);
    speciesIdByGameMasterEnum.set(enumName, definition.id);
    pendingEvolutionResolution.push({ definition, gmRecord });
  }

  species.push(definition);
}

// ---------------------------------------------------------------------------
// Mechanically-distinct EXTRA forms (2026-09-08 fix for AUDIT_2026-09-08.md
// Defect 1; widened same-day after the Hisuian Sneasel incident below). The
// loop above normalizes exactly ONE form per pokemon_id (see this file's
// "Scope (documented limitation)" note up top) — every OTHER form
// pokemon_stats.json carries for that same pokemon_id was previously dropped
// outright, with no distinction between a COSMETIC variant (Pikachu
// costumes, Vivillon patterns, seasonal Deerling/Sawsbuck — genuinely
// identical base stats AND typing, correctly excluded) and a
// MECHANICALLY-DISTINCT one (Hisuian Lilligant 208/159/172 vs Normal
// Lilligant's 214/155/172, Calyrex Shadow Rider 324/194/205 vs base
// Calyrex's 162/162/225, etc. — a real, separately-real Pokémon whose exact
// stats were sitting unused in this same raw cache). That silent drop was
// also why a live raid boss for one of these forms fell back to the wrong
// (base-form) stats via the "strip a known prefix" approximate-match
// fallback further down this file, flagged `isApproximate: true` even when
// exact stats were available all along.
//
// The discriminator is: this row's base_attack/base_defense/base_stamina
// OR its type array differs from the SAME default-form row the primary loop
// above already picked for that pokemon_id (baseRow) — TYPING ALONE IS
// SUFFICIENT, deliberately. A first pass (2026-09-08) used a stats-only
// discriminator and missed 57 real forms whose stats are identical to their
// default form's but whose typing is completely different — Hisuian Sneasel
// (fighting/poison vs. base Sneasel's dark/ice), Alolan Vulpix (ice vs.
// fire), Galarian Ponyta (psychic vs. fire), Alolan Golem (rock/electric vs.
// rock/ground), and 53 others. Hisuian Sneasel was a LIVE 3-star raid boss at
// the time, silently resolving to base Sneasel's dark/ice stats and moves —
// type effectiveness swings a simulated fight far harder than a same-
// magnitude stat-line difference does: measured against the real
// (fighting/poison) Hisuian Sneasel at L40 15/15/15, Metagross's sustained
// TDO was off by +167% (715 shown vs. 1913 correct) under the stats-only
// version of this check. Do not narrow this discriminator back to
// stats-only — a form matching its default form's stats exactly but not its
// typing is not cosmetic, and the cost of getting this wrong is a
// silently-wrong combat simulation, not a cosmetic-only species miscount.
//
// Resolution reuses the exact same GAME_MASTER-primary / pogoapi-fallback
// machinery as the primary loop above, but deliberately restricted to an
// EXACT GAME_MASTER form-key match (`${enum}_${form.toUpperCase()}`) —
// resolveGameMasterPokemonRecord's own NORMAL/bare-template fallback
// priorities (#2/#3) exist to pick a sensible default for a species with no
// better option, and would silently misattribute another form's stats/type/
// moves here (e.g. Zygarde's bare template is its Fifty_percent data, not
// Complete_ten_percent's) — a real, checked risk, not a hypothetical one.
// Every one of the 83 candidates resolved via this exact-match path in the
// 2026-09-08 audit (0 needed the pogoapi per-form fallback below), but the
// fallback is kept for the same reason every other one in this file is:
// logged in WARNINGS, never silent, never fabricated.
//
// Id/name convention is IDENTICAL to the one this project already uses for a
// species' sole default form when that isn't "Normal" — fromGameMaster's own
// speciesIdFor (packages/engine/src/gamemaster.ts) gives id
// `${pokemon_name}-${form}` (lowercased) and name `${pokemon_name} (${form})`,
// e.g. "lilligant-hisuian" / "Lilligant (Hisuian)" — matching this project's
// existing giratina-altered / shellos-west_sea / landorus-incarnate
// convention exactly. No second scheme is invented here.
// ---------------------------------------------------------------------------

/**
 * `${raw pogoapi form string}` -> the adjective ScrapedDuck's live raid feed
 * prefixes onto a regional form's BASE name instead of this project's own
 * "(Form)" suffix convention (e.g. "Hisuian Lilligant", not "Lilligant
 * (Hisuian)") — confirmed 2026-09-08 by direct inspection of data/raw/
 * raids.json. Consulted only by the raid-matching section further down this
 * file (regionalFormSpeciesByPrefixAndBase) so a raid named in ScrapedDuck's
 * convention can still find the species built here under this project's own
 * convention, without changing either naming scheme. Deliberately small and
 * exact (not a generalized "adjective of a region" transform) — extend only
 * once a live raid actually needs a form not listed here.
 */
const REGIONAL_FORM_TO_RAID_PREFIX: Record<string, string> = {
  Hisuian: "hisuian",
  Galarian: "galarian",
  Alola: "alolan",
};

/** `${raid-prefix}|${base pokemon_name, lowercased}` -> the extra-form species id built below, e.g. "hisuian|lilligant" -> "lilligant-hisuian". Populated below, read by the raid-matching section further down this file. */
const regionalFormSpeciesByPrefixAndBase = new Map<string, string>();

const statsByPokemonId = new Map<number, RawPokemonStatsEntry[]>();
for (const s of rawStats) {
  if (!statsByPokemonId.has(s.pokemon_id)) statsByPokemonId.set(s.pokemon_id, []);
  statsByPokemonId.get(s.pokemon_id)!.push(s);
}

const skippedExtraForms: { pokemon_id: number; pokemon_name: string; form: string; reason: string }[] = [];
let extraFormSpeciesCount = 0;
/** Every extra-form species actually added this pass, with which side of the stats-OR-types discriminator qualified it — read by the WARNINGS output below so a sync run's diff is auditable, not just a count. */
const extraFormSpeciesAdded: { id: string; name: string; statsDiffer: boolean; typesDiffer: boolean }[] = [];

for (const [pokemonId, rows] of statsByPokemonId) {
  const defaultForm = defaultFormByPokemonId.get(pokemonId);
  const baseRow = rows.find((r) => r.form === defaultForm);
  if (!baseRow) continue; // shouldn't happen — defaultFormByPokemonId is derived from these same rows

  for (const row of rows) {
    if (row.form === defaultForm) continue; // already normalized by the primary loop above

    const statsDiffer =
      row.base_attack !== baseRow.base_attack ||
      row.base_defense !== baseRow.base_defense ||
      row.base_stamina !== baseRow.base_stamina;

    const enumName = gameMasterAvailable ? resolvePokemonEnum(pokemonId, row.pokemon_name, gameMasterKnownEnums) : null;
    const candidates = enumName ? (gameMasterPokemonByEnum.get(enumName) ?? []) : [];
    const exactFormKey = enumName ? `${enumName}_${row.form.toUpperCase()}` : null;
    const gmExactRecord = exactFormKey ? (candidates.find((c) => c.form === exactFormKey) ?? null) : null;
    const fallbackTypesEntry = typesByPokemonIdAndForm.get(`${pokemonId}|${row.form}`);

    // This row's own type array, resolved via the same GAME_MASTER-exact /
    // pogoapi-per-form sources the rest of this pass uses below — computed up
    // front so the cosmetic-vs-real decision right below never has to guess.
    const candidateRawTypeStrings: string[] | null = gmExactRecord
      ? [gmExactRecord.type, gmExactRecord.type2].filter((t): t is string => Boolean(t))
      : (fallbackTypesEntry?.type ?? null);
    const candidateTypes = candidateRawTypeStrings ? buildTypesArray(candidateRawTypeStrings) : null;
    const baseTypes = typesByDefaultForm.get(pokemonId) ?? null;
    const typesDiffer =
      candidateTypes !== null &&
      baseTypes !== null &&
      (candidateTypes.length !== baseTypes.length || candidateTypes.some((t, i) => t !== baseTypes[i]));

    // QUALIFYING CONDITION: stats differ OR types differ — types ALONE are
    // sufficient, deliberately, since 2026-09-08's Hisuian Sneasel incident.
    // Hisuian Sneasel's base stats are IDENTICAL to base Sneasel's, but its
    // typing is completely different (fighting/poison vs. base Sneasel's
    // dark/ice) — under the old stats-only version of this discriminator it
    // was silently excluded as "cosmetic" and a live 3-star raid boss kept
    // resolving to base Sneasel's dark/ice stats and moves. Type
    // effectiveness swings a simulated fight far harder than a same-magnitude
    // stat-line difference does: measured against the real (fighting/poison)
    // Hisuian Sneasel at L40 15/15/15, Metagross's sustained TDO was off by
    // +167% (715 shown vs. 1913 correct) under the stats-only version of this
    // check. Do not narrow this back to stats-only — a form matching its
    // default form's stats exactly but not its typing is not cosmetic.
    if (!statsDiffer && !typesDiffer) continue; // cosmetic variant (identical stats AND types) — correctly excluded, unchanged

    let baseAttack: number;
    let baseDefense: number;
    let baseStamina: number;
    let rawTypeStrings: string[];
    let rarity: PokemonRarity;
    let fastNames: string[];
    let chargedNames: string[];

    if (gmExactRecord) {
      baseAttack = gmExactRecord.baseAttack;
      baseDefense = gmExactRecord.baseDefense;
      baseStamina = gmExactRecord.baseStamina;
      rawTypeStrings = candidateRawTypeStrings!; // non-null here — gmExactRecord is set, so the hoisted lookup above always populated it
      rarity = pokemonClassToRarity(gmExactRecord.pokemonClass);
      fastNames = [...gmExactRecord.quickMoves, ...gmExactRecord.eliteQuickMoves];
      chargedNames = [...gmExactRecord.cinematicMoves, ...gmExactRecord.eliteCinematicMoves];
    } else {
      speciesFallenBackToPogoapi.push(`${row.pokemon_name} (${row.form}) [extra form]`);
      const typesEntry = fallbackTypesEntry;
      const movesEntry = movesByPokemonIdAndForm.get(`${pokemonId}|${row.form}`);
      if (!typesEntry) {
        skippedExtraForms.push({
          pokemon_id: pokemonId,
          pokemon_name: row.pokemon_name,
          form: row.form,
          reason: "no typing data (no exact GAME_MASTER template and no pogoapi fallback)",
        });
        continue;
      }
      if (!movesEntry) {
        skippedExtraForms.push({
          pokemon_id: pokemonId,
          pokemon_name: row.pokemon_name,
          form: row.form,
          reason: "no moveset data (no exact GAME_MASTER template and no pogoapi fallback)",
        });
        continue;
      }
      baseAttack = row.base_attack;
      baseDefense = row.base_defense;
      baseStamina = row.base_stamina;
      rawTypeStrings = typesEntry.type;
      rarity = "STANDARD";
      rarityFallenBackToStandard.push(`${row.pokemon_name} (${row.form}) [extra form]`);
      fastNames = [...movesEntry.fast_moves, ...movesEntry.elite_fast_moves];
      chargedNames = [...movesEntry.charged_moves, ...movesEntry.elite_charged_moves];
    }

    const pokemonTypes = buildTypesArray(rawTypeStrings);
    if (!pokemonTypes) {
      skippedExtraForms.push({ pokemon_id: pokemonId, pokemon_name: row.pokemon_name, form: row.form, reason: "empty typing array" });
      continue;
    }

    let resolvedFast: FastMove[];
    let resolvedCharged: ChargedMove[];
    if (gmExactRecord) {
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
      skippedExtraForms.push({
        pokemon_id: pokemonId,
        pokemon_name: row.pokemon_name,
        form: row.form,
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
        pokemon_id: pokemonId,
        pokemon_name: row.pokemon_name,
        form: row.form,
        base_attack: baseAttack,
        base_defense: baseDefense,
        base_stamina: baseStamina,
      },
      pokemonTypes,
      resolvedFast,
      resolvedCharged,
    );
    // 2026-09-10 fix — see applyCleanFormDisplayName's own doc comment. Never
    // touches `definition.id`, only the composed display name; the
    // collision check right below still compares the untouched `.id`.
    applyCleanFormDisplayName(definition, row.pokemon_name, row.form);

    if (species.some((s) => s.id === definition.id)) {
      skippedExtraForms.push({
        pokemon_id: pokemonId,
        pokemon_name: row.pokemon_name,
        form: row.form,
        reason: `id collision with an already-built species "${definition.id}" — not overwriting either`,
      });
      continue;
    }

    definition.imageUrl = spriteUrlForDexId(pokemonId);
    definition.rarity = rarity;
    // Same Phase 0 wiring as the primary loop above — see that site's
    // comment for the field-by-field rationale. `candidates` here is the
    // full candidate array for this row's own enum, already resolved above
    // for the stats/types-differ discriminator.
    definition.dexNumber = pokemonId;
    if (gmExactRecord) {
      definition.isFullyEvolved = isFullyEvolved(candidates);
      definition.candyFamilyId = gmExactRecord.familyId;
      setKmBuddyDistance(definition, gmExactRecord.kmBuddyDistance);
      if (gmExactRecord.form) speciesIdByGameMasterFormKey.set(gmExactRecord.form, definition.id);
      pendingEvolutionResolution.push({ definition, gmRecord: gmExactRecord });
      // Deliberately NOT registered in speciesIdByGameMasterEnum — that map
      // is reserved for each enum's DEFAULT-form species only (see its own
      // doc comment above); this loop only ever builds a non-default form.
    }
    species.push(definition);
    extraFormSpeciesCount++;
    extraFormSpeciesAdded.push({ id: definition.id, name: definition.name, statsDiffer, typesDiffer });

    const raidPrefix = REGIONAL_FORM_TO_RAID_PREFIX[row.form];
    if (raidPrefix) {
      regionalFormSpeciesByPrefixAndBase.set(`${raidPrefix}|${row.pokemon_name.toLowerCase()}`, definition.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Evolution-target resolution (Phase 0 of PLAN_multi_raid_roster_optimizer.md
// §3.6/§4.3's "unevolved Pokémon are not power-up candidates" filter). Runs as
// its own pass now that BOTH species-building loops above have finished (not
// mega/primal or Shadow below — no real evolution branch ever targets one of
// those), so speciesIdByGameMasterFormKey/speciesIdByGameMasterEnum are fully
// populated regardless of pokemon_stats.json's own row order.
// ---------------------------------------------------------------------------

/**
 * Resolves one EvolutionTarget (off a specific matched species' own real
 * evolution branch — see realEvolutionTargets) to a registered species id,
 * preferring an exact GAME_MASTER form-key match and falling back to that
 * enum's own default-form species when no exact match exists — mirrors
 * resolveGameMasterPokemonRecord's own form-key -> NORMAL/bare-template
 * priority chain used everywhere else in this file for the identical
 * (enum, form) -> record identity problem. Returns null (never guesses) when
 * neither resolves; the caller reports that loudly rather than silently
 * dropping the branch.
 */
function resolveEvolutionTargetSpeciesId(target: EvolutionTarget): string | null {
  if (target.form) {
    const byFormKey = speciesIdByGameMasterFormKey.get(target.form);
    if (byFormKey) return byFormKey;
  }
  return speciesIdByGameMasterEnum.get(target.evolutionEnum) ?? null;
}

for (const { definition, gmRecord } of pendingEvolutionResolution) {
  if (definition.isFullyEvolved) {
    definition.evolvesToIds = [];
    continue;
  }
  const targets = realEvolutionTargets(gmRecord);
  if (targets.length === 0) {
    // isFullyEvolved(...) said false (a sibling GAME_MASTER template for this
    // enum carries a real branch) but THIS species' own matched template
    // carries none — see isFullyEvolvedRealEvolutionTargetsInconsistencies's
    // doc comment above for why this happens and why isFullyEvolved is
    // deliberately NOT overridden to true here.
    isFullyEvolvedRealEvolutionTargetsInconsistencies.push(`${definition.name} (${definition.id})`);
    definition.evolvesToIds = [];
    continue;
  }
  const resolvedIds = new Set<string>();
  for (const target of targets) {
    const resolvedId = resolveEvolutionTargetSpeciesId(target);
    if (resolvedId) {
      resolvedIds.add(resolvedId);
    } else {
      unresolvedEvolutionBranches.push(
        `${definition.name} (${definition.id}) -> ${target.evolutionEnum}${target.form ? ` [${target.form}]` : ""} (no registered species id found for this evolution target — evolvesToIds omits it; isFullyEvolved stays correctly false regardless, computed independently)`,
      );
    }
  }
  definition.evolvesToIds = [...resolvedIds];
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

// ---------------------------------------------------------------------------
// Pokebattler live cross-check (2026-09-07). ScrapedDuck (rawRaids, cached
// above) remains the ONLY source for activeRaids.json — nothing here adds,
// removes, or overwrites a single active raid. This section exists purely to
// DETECT and report divergence between the two feeds; see
// ./sync-data/pokebattlerRaids.ts's top-of-file doc comment for the
// provenance caveat (neither feed discloses its own detection method, so
// agreement is circumstantial, not proven independence) and for why the
// separate `_LEGACY` archive-import task is deliberately deferred rather than
// wired in here.
//
// Two traps this comparison deliberately avoids (see isCurrentRotationTier's
// own doc comment for the third, RAID_LEVEL_UNSET):
// - `_FUTURE` tiers (e.g. RAID_LEVEL_5_FUTURE, currently Arceus) are
//   Niantic-announced UPCOMING raids, not live ones — isCurrentRotationTier
//   excludes them outright. Including them would report phantom
//   disagreements and imply unreleased bosses are already live.
// - `attackMultiplier`/`defenseMultiplier`/`staminaMultiplier` on each tier
//   are confirmed to be event modifiers (all `1` on every one of the 66 live
//   tiers, 2026-09-07) — NOT raid-tier stats. They are never read here and
//   never used to populate or "verify" RAID_TIER_TABLE.
//
// Name resolution deliberately uses pokebattlerDisplayNameForCrossCheck, NOT
// resolvePokebattlerPokemonId — see that function's own doc comment for why
// the stricter, roster-gated resolver would produce false disagreements for
// real regional-form raids (e.g. Hisuian Sneasel) this project's
// one-form-per-species scope simply doesn't carry.
const enumToPogoapiName = buildEnumToPogoapiName(pokemonIdByName, resolvePokemonEnum, gameMasterKnownEnums);

function normalizeRaidNameForCrossCheck(name: string): string {
  // Strips a trailing parenthetical (e.g. "Shadow Giratina (Altered)" ->
  // "shadow giratina") so a ScrapedDuck name carrying this project's own
  // "(Form)" convention still compares equal to Pokebattler's bare-base-name
  // reconstruction, which never includes one.
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase();
}

interface PokebattlerCrossCheckEntry {
  rawName: string;
  tier: string;
  normalized: string;
}

/**
 * True for a ScrapedDuck raid tier this project's own RaidTier union
 * classifies as Mega/Primal ("Mega Raids", "Legendary Mega Raids", "Super
 * Mega Raids", "Primal Raids" — see types.ts's RaidTier union). Used to
 * exclude Mega/Primal raids from BOTH sides of the live cross-check below,
 * symmetrically with POKEBATTLER_MEGA_POOL_TIERS's own exclusion — see that
 * constant's doc comment (2026-09-08, AUDIT_2026-09-08.md Defect 2) for why
 * Pokebattler's own Mega tiers are a rotation POOL, not a live list.
 * Excluding only the Pokebattler side (which an earlier version of this fix
 * did) is NOT enough on its own: a genuinely-live Mega raid ScrapedDuck
 * reports (e.g. Mega Gyarados) would then have nothing on the Pokebattler
 * side left to match against, turning into a brand-new PHANTOM "only in
 * ScrapedDuck" disagreement — the exact cry-wolf failure mode this fix
 * exists to remove, just relocated rather than fixed. Excluding Mega/Primal
 * from both sides means this cross-check makes no claim about Mega raids at
 * all (reported as a separate advisory line, never folded into the real
 * disagreement count) rather than a wrong one.
 */
function isMegaOrPrimalRaidTier(tier: string): boolean {
  return /mega|primal/i.test(tier);
}

const scrapedDuckMegaOrPrimalExcludedFromCrossCheck = rawRaids
  .filter((r) => isMegaOrPrimalRaidTier(r.tier))
  .map((r) => `${r.name} [${r.tier}]`);

const scrapedDuckCrossCheckEntries: PokebattlerCrossCheckEntry[] = rawRaids
  .filter((r) => !isMegaOrPrimalRaidTier(r.tier))
  .map((r) => ({
    rawName: r.name,
    tier: r.tier,
    normalized: normalizeRaidNameForCrossCheck(r.name),
  }));

const pokebattlerCrossCheckEntries: PokebattlerCrossCheckEntry[] = [];
const pokebattlerCrossCheckUnresolved: string[] = [];
if (pokebattlerFetchResult.source === "live") {
  for (const tier of pokebattlerFetchResult.tiers) {
    if (!isCurrentRotationTier(tier.tier)) continue;
    for (const raid of tier.raids ?? []) {
      const displayName = pokebattlerDisplayNameForCrossCheck(raid.pokemon, enumToPogoapiName);
      if (!displayName) {
        pokebattlerCrossCheckUnresolved.push(`${raid.pokemon} [${tier.tier}]`);
        continue;
      }
      pokebattlerCrossCheckEntries.push({
        rawName: displayName,
        tier: tier.tier,
        normalized: normalizeRaidNameForCrossCheck(displayName),
      });
    }
  }
}

const scrapedDuckNormalizedSet = new Set(scrapedDuckCrossCheckEntries.map((e) => e.normalized));
const pokebattlerNormalizedSet = new Set(pokebattlerCrossCheckEntries.map((e) => e.normalized));
const pokebattlerCrossCheckMatched = scrapedDuckCrossCheckEntries.filter((e) => pokebattlerNormalizedSet.has(e.normalized));
const pokebattlerCrossCheckOnlyInScrapedDuck = scrapedDuckCrossCheckEntries.filter((e) => !pokebattlerNormalizedSet.has(e.normalized));
const pokebattlerCrossCheckOnlyInPokebattler = pokebattlerCrossCheckEntries.filter((e) => !scrapedDuckNormalizedSet.has(e.normalized));

const pogoApiMegaNames = new Set(rawMegaPokemon.map((m) => m.mega_name.toLowerCase()));
const megaOrPrimalRaidGaps = rawRaids.filter(
  (r) => /^(Mega|Primal) /.test(r.name) && !pogoApiMegaNames.has(r.name.toLowerCase()),
);

// RELEASED_MEGA_PRIMAL_ALLOWLIST: hand-curated, per-entry-cited allowlist of real,
// released mega/primal content that falls through both the pogoapi roster and
// the live-raid gate. Lives in ./sync-data/releasedMegaPrimalAllowlist.ts (see
// that module's own header for the full citations and WHY it is a separate
// module rather than defined here) so scripts/check-mega-gates.ts can import
// it without triggering this file's top-level network fetches.

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

/**
 * `${base pokemon_name}|${mega-form suffix}` -> real mega_name, e.g.
 * "kyogre|Normal" -> "Primal Kyogre", "charizard|X" -> "Mega Charizard X".
 * Used only by the pogoapi-previous raidHistory backfill below to resolve a
 * `mega`/`mega_legendary` raid_bosses.json entry (which names the BASE
 * species plus a mega-form-suffix `form` field in this exact convention —
 * confirmed 2026-09-07 by direct comparison against mega_pokemon.json's own
 * `form` field for Charizard/Kyogre/Groudon/Latios/Latias) to the real mega
 * name, which is then looked up against the built species list's own `name`
 * field to get the final (possibly `-attacker`-renamed) species id.
 */
const megaPokemonKeyToMegaName = new Map<string, string>(
  rawMegaPokemonCombined.map((m) => [`${m.pokemon_name.toLowerCase()}|${m.form}`, m.mega_name]),
);

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
  const { finalId, collided } = resolveMegaSpeciesIdCollision(naturalId, reservedSpeciesIds);
  if (collided) {
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
const spriteLookupIds = megaSpecies.map((m) => spriteLookupIdFor(m.id, collisionRenames));
const megaSpriteUrls = await fetchMegaSpriteUrls(RAW_DIR, spriteLookupIds);
for (const m of megaSpecies) {
  const lookupId = spriteLookupIdFor(m.id, collisionRenames);
  const url = megaSpriteUrls[lookupId];
  if (url) m.imageUrl = url;
}

species.push(...megaSpecies);

// Super Max "+" charged moves (2026-09-09 task) — a genuinely additional
// third charged move for a hand-curated set of mega species, sourced from
// ./sync-data/superMaxPlusMoves.ts (see that module's own doc comment for
// full per-entry citations and the two confidence-tier caveats on
// duration/energy). Runs here, right after `megaSpecies` is fully built and
// pushed into `species`, so every real mega/primal this run produced is a
// match candidate — the Mega Staraptor entry there is expected to resolve
// to nothing until that species actually syncs in (skippedUnknownSpecies),
// which is by design, not a failure.
const superMaxPlusMoveResult = attachSuperMaxPlusMoves(species, gameMasterMoveByMovementId);

// ---------------------------------------------------------------------------
// Build normalized active raids list
//
// The raid-name -> species resolution cascade itself (KNOWN_PREFIXES,
// findByExactName, matchRaidName — exact mega, exact species, regional-form
// same-prefix, the "Shadow " + regional compound case, Shadow-variant
// resolution, approximate generic-prefix stand-in) now lives in
// ./sync-data/raidNameMatching.ts, shared verbatim by this loop and
// resolveRaidNameForHistoryMigration below — see that module's own doc
// comment for why (2026-09-09, the "Shadow Alolan Sandslash" compound-prefix
// fix).
// ---------------------------------------------------------------------------

const megaSpeciesLookupPool = megaSpecies.map((s) => ({ id: s.id, name: s.name }));
const speciesLookupPool = species.map((s) => ({ id: s.id, name: s.name }));
const speciesById = new Map(species.map((s) => [s.id, s]));

/**
 * Cached per base species id so e.g. two "Shadow Slowpoke" raid tiers don't
 * synthesize two entries — see getOrCreateShadowVariant
 * (scripts/sync-data/shadowVariant.ts) for the synthesis itself.
 */
const shadowSpeciesByBaseId = new Map<string, SpeciesDefinition>();

// ---------------------------------------------------------------------------
// Shadow-variant durable synthesis (2026-09-08 fix). Before this fix, a
// Shadow-variant species (getOrCreateShadowVariant, just above) was
// synthesized ONLY inside the activeRaids-matching loop below — i.e. only
// for a species raiding as Shadow RIGHT NOW on this run's live ScrapedDuck
// feed. That is the exact same live-raid-gate fragility that produced the
// Mega Skarmory/Mega Mewtwo Y incidents (see CLAUDE.md "Standing decisions"):
// the moment a Shadow raid rotation ends, nothing could ever regenerate that
// species again, and Pokebattler's 105-entry `_SHADOW_LEGACY` archive could
// never resolve against this roster at all (there was no shadow species for
// it to resolve TO — see resolvePokebattlerPokemonId's shadow branch, now
// updated to prefer the variant this section creates).
//
// This section synthesizes a Shadow variant for every species with RECORDED
// EVIDENCE of a shadow raid appearance from up to three sources (a fourth,
// the live feed, is still handled by the activeRaids loop below, unchanged —
// "keep it" per this task), in order of durability:
//   1. raidHistory.json's OWN already-persisted shadow rows (speciesId
//      ending "-shadow") — the durable anchor. That file is accumulate-only
//      and never shrinks, so once a shadow appearance is recorded there this
//      species must keep being regenerated on every future run, forever,
//      regardless of what any live feed or third-party archive says later.
//   2. Pokebattler's RAID_LEVEL_{1,3,5}_SHADOW_LEGACY tiers (105 raw entries,
//      confirmed 2026-09-08) — the bulk of the backfill.
//   3. Bulbapedia's "List of Shadow Raid Boss changes" page (18 rows / 17
//      distinct species, Seasons 10-11) — thin corroboration (confirmed
//      2026-09-08: every one of its 17 species is already a subset of
//      Pokebattler's 105), wired in anyway since it's cheap given the
//      existing {{lop/raid/GO}} row parser.
//
// MUST run before this file's Pokebattler-legacy and Bulbapedia archive-
// resolution passes further down (both do, unconditionally, being later in
// this sequential script) — otherwise Pokebattler's shadow-legacy rows would
// fail to resolve against a real Shadow-variant species again, exactly as
// they did before this fix.
//
// EVIDENCE-GATED ONLY (this task's explicit non-negotiable): a species with
// ZERO shadow evidence from any of the sources above (or the live feed,
// below) never gets a "-shadow" entry. This is not a blanket dex-wide
// synthesis.
// ---------------------------------------------------------------------------

const SHADOW_ID_SUFFIX = "-shadow";

// Evidence 1: raidHistory.json's own accumulated shadow rows. Read
// defensively (same discipline as every other raidHistory.json read in this
// file) directly from disk here — a second, narrow read of the same file the
// main raidHistory-building section (below, near "Step 1.5") also loads into
// `previousRaidHistory`/`raidHistoryById`; reading it twice is simpler and
// safer than restructuring this 2600+ line sequential script's ordering just
// to share one array, and costs nothing (the file is small).
const raidHistoryPathForShadowSeed = join(NORMALIZED_DIR, "raidHistory.json");
let raidHistoryForShadowSeed: unknown[] = [];
if (existsSync(raidHistoryPathForShadowSeed)) {
  try {
    const parsed = JSON.parse(readFileSync(raidHistoryPathForShadowSeed, "utf-8"));
    if (Array.isArray(parsed)) raidHistoryForShadowSeed = parsed;
  } catch {
    raidHistoryForShadowSeed = [];
  }
}
const shadowSeedBaseIdsFromHistory = new Set<string>();
for (const entry of raidHistoryForShadowSeed) {
  const speciesId = (entry as { speciesId?: unknown } | null)?.speciesId;
  if (typeof speciesId === "string" && speciesId.endsWith(SHADOW_ID_SUFFIX)) {
    shadowSeedBaseIdsFromHistory.add(speciesId.slice(0, -SHADOW_ID_SUFFIX.length));
  }
}

// Evidence 2 (Pokebattler `_SHADOW_LEGACY` tiers) needs a name->id lookup
// over the roster AS IT EXISTS RIGHT NOW (ordinary + extra-form + mega/primal
// species, no Shadow variants yet — none exist yet at this point in the
// pipeline) so resolvePokebattlerPokemonId's shadow branch resolves to the
// BASE species id (there being no Shadow-variant entry in this map yet for
// it to prefer instead) — exactly what this seeding step needs to feed
// getOrCreateShadowVariant below. The FINAL speciesIdByNameLower built later
// in this file (after Shadow variants exist) is what the real Pokebattler-
// legacy backfill pass further down uses to resolve to the variant itself.
const speciesIdByNameLowerForShadowSeed = new Map(species.map((s) => [s.name.toLowerCase(), s.id]));
const shadowSeedPokebattlerCtx: PokebattlerResolutionContext = {
  pokemonIdByName,
  defaultFormByPokemonId,
  enumToPogoapiName,
  speciesIdByNameLower: speciesIdByNameLowerForShadowSeed,
};
const shadowSeedBaseIdsFromPokebattler = new Set<string>();
const shadowSeedPokebattlerUnresolved: string[] = [];
if (pokebattlerFetchResult.source === "live") {
  for (const tier of pokebattlerFetchResult.tiers) {
    if (!tier.tier.includes("_SHADOW_LEGACY")) continue;
    for (const raid of tier.raids ?? []) {
      const resolved = resolvePokebattlerPokemonId(raid.pokemon, shadowSeedPokebattlerCtx);
      if (resolved && resolved.bucket === "shadow") {
        shadowSeedBaseIdsFromPokebattler.add(resolved.speciesId);
      } else {
        shadowSeedPokebattlerUnresolved.push(`${raid.pokemon} [${tier.tier}]`);
      }
    }
  }
}

// Evidence 3: Bulbapedia's dedicated Shadow Raid Boss changes page — every
// row names a bare base species (see parseBulbapediaShadowRaidPage's doc
// comment), resolved the same way resolveBulbapediaRow's own base-name
// fallback does (exact qualified name first, then the unique-base-name
// index — safe because this pipeline's roster is one-form-per-species).
const shadowSeedBaseIdsFromBulbapedia = new Set<string>();
const shadowSeedBulbapediaUnresolved: string[] = [];
if (bulbapediaShadowRaidArchiveFetchResult.wikitext) {
  const shadowSeedBaseNameIndex = buildBaseNameIndex(species);
  for (const row of parseBulbapediaShadowRaidPage(bulbapediaShadowRaidArchiveFetchResult.wikitext)) {
    const key = row.name.toLowerCase();
    const resolvedId = shadowSeedBaseNameIndex.byQualifiedName.get(key) ?? shadowSeedBaseNameIndex.byUniqueBaseName.get(key);
    if (resolvedId) {
      shadowSeedBaseIdsFromBulbapedia.add(resolvedId);
    } else {
      shadowSeedBulbapediaUnresolved.push(row.name);
    }
  }
}

const shadowSeedAllBaseIds = new Set<string>([
  ...shadowSeedBaseIdsFromHistory,
  ...shadowSeedBaseIdsFromPokebattler,
  ...shadowSeedBaseIdsFromBulbapedia,
]);

// Never fabricate: a base id named by evidence above that ISN'T a real,
// currently-registered species (e.g. a stale raidHistory.json row from a
// species removed for an unrelated reason) is reported, never invented.
const shadowSeedUnresolvedBaseIds: string[] = [];
for (const baseId of shadowSeedAllBaseIds) {
  const baseSpecies = speciesById.get(baseId);
  if (!baseSpecies) {
    shadowSeedUnresolvedBaseIds.push(baseId);
    continue;
  }
  // Copies raw base stats unmultiplied (see getOrCreateShadowVariant's own
  // doc comment) — the engine applies SHADOW_ATTACK_MULTIPLIER/
  // SHADOW_DEFENSE_MULTIPLIER at effective-stat time, never pre-multiplied
  // here.
  getOrCreateShadowVariant(baseSpecies, shadowSpeciesByBaseId);
}
const shadowSeedDurableCount = shadowSpeciesByBaseId.size;

const activeRaids: ActiveRaidEntry[] = [];

// This loop OWNS species.json, so its resolveShadowVariant always
// synthesizes (or reuses) a real Shadow-variant SpeciesDefinition — never
// returns null — matching matchRaidName's documented contract for the
// caller allowed to mutate species.json (see raidNameMatching.ts).
const resolveShadowVariantForActiveRaids = (baseSpeciesId: string): string | null => {
  const baseSpecies = speciesById.get(baseSpeciesId);
  if (!baseSpecies) return null; // not expected — baseSpeciesId always comes from a pool built off speciesById's own keys
  return getOrCreateShadowVariant(baseSpecies, shadowSpeciesByBaseId).id;
};

for (const raid of rawRaids) {
  const match = matchRaidName(
    raid.name,
    { megaSpeciesLookupPool, speciesLookupPool, regionalFormSpeciesByPrefixAndBase },
    resolveShadowVariantForActiveRaids,
  );
  const speciesId = match.speciesId;
  const isApproximate = match.isApproximate;

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

// Phase 0 of PLAN_multi_raid_roster_optimizer.md §5 — population counts for
// the four fields wired in this pass, computed over the FINAL species list
// (so Shadow variants, which inherit all four fields unchanged from their
// base species via getOrCreateShadowVariant's spread, are correctly counted
// too; mega/primal never get any of the four — no real evolution branch ever
// targets a mega/primal form, and this pass doesn't wire that build site).
const fullyEvolvedCount = species.filter((s) => s.isFullyEvolved === true).length;
const notFullyEvolvedCount = species.filter((s) => s.isFullyEvolved === false).length;
const dexNumberCount = species.filter((s) => s.dexNumber !== undefined).length;
const candyFamilyIdCount = species.filter((s) => s.candyFamilyId !== undefined).length;
const evolvesToIdsPopulatedCount = species.filter((s) => (s.evolvesToIds?.length ?? 0) > 0).length;

// 2026-09-10, kmBuddyDistance (see setKmBuddyDistance's own doc comment
// above) — same population-counting discipline as the Phase 0 fields just
// above, computed over the FINAL species list so Shadow variants (inherited
// via spread) count correctly. Distribution reported by value since a
// missing count alone doesn't say whether "missing" is rare or common (see
// this task's own requirement) — every value observed live 2026-09-10 was
// one of {1, 3, 5, 20}, so an "other" bucket exists here purely as a canary
// for a future GAME_MASTER change, not because one is expected.
const kmBuddyDistanceSpecies = species.filter((s) => (s as SpeciesWithKmBuddyDistance).kmBuddyDistance !== undefined);
const kmBuddyDistanceCount = kmBuddyDistanceSpecies.length;
const kmBuddyDistanceMissingCount = species.length - kmBuddyDistanceCount;
const kmBuddyDistanceDistribution = new Map<number, number>();
for (const s of kmBuddyDistanceSpecies) {
  const v = (s as SpeciesWithKmBuddyDistance).kmBuddyDistance!;
  kmBuddyDistanceDistribution.set(v, (kmBuddyDistanceDistribution.get(v) ?? 0) + 1);
}

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
// types.ts and RELEASED_MEGA_PRIMAL_ALLOWLIST's doc comment in
// ./sync-data/releasedMegaPrimalAllowlist.ts for steps
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
// Raid history (data/normalized/raidHistory.json) — an append-only, ever-
// growing record of every species this pipeline has ever confirmed as a real
// raid boss, so the web app can offer "previously active (now inactive)" raid
// bosses on the Species Report tab. activeRaids.json is a full-replace
// snapshot regenerated every run — a boss that rotates out vanishes from it
// with no trace — so this file exists specifically to keep that trace. Two
// ways a species enters it (see RaidHistoryEntry's doc comment in
// scripts/sync-data/rawShapes.ts for the pinned schema packages/web is
// written against):
//   - "live-feed": THIS run's own activeRaids (built above from
//     data/raw/raids.json) observed it. Always wins if a species is ever
//     observed live again after being seeded as researched-tier only.
//   - "researched-tier": seeded from species.lastKnownRaidTier (by this point
//     in the file, already carrying this run's live-raid observation, a
//     RELEASED_MEGA_PRIMAL_ALLOWLIST citation, or a carried-forward value
//     from a previous run's species.json — see the precedence doc comment
//     above) for a species this pipeline's OWN raid-history file has never
//     itself recorded a live observation for.
// Loaded defensively (same discipline as the lastKnownRaidTier carry-forward
// above) so a missing or malformed raidHistory.json never fails the run —
// this is the very first sync to produce the file, so previousRaidHistory
// will be empty on that run, same as previousSpecies/previousRaids on this
// project's first-ever sync. Never deletes an entry; only grows.
// ---------------------------------------------------------------------------

const raidHistoryOutPath = join(NORMALIZED_DIR, "raidHistory.json");

let previousRaidHistory: RaidHistoryEntry[] = [];
if (existsSync(raidHistoryOutPath)) {
  try {
    const parsed = JSON.parse(readFileSync(raidHistoryOutPath, "utf-8"));
    if (Array.isArray(parsed)) previousRaidHistory = parsed;
  } catch {
    previousRaidHistory = [];
  }
}

const SYNC_TIMESTAMP = new Date().toISOString();

// ---------------------------------------------------------------------------
// Power-up (level-up) cost table (2026-09-08, Power-Up Optimizer tab data
// source — see IDEAS.md's "Power-Up Optimizer" entry). GAME_MASTER's own
// POKEMON_UPGRADE_SETTINGS/LUCKY_POKEMON_SETTINGS templates carry the
// universal per-level candy/stardust power-up cost table this pipeline
// previously discarded entirely (see fetchGameMasterData's doc comment in
// ./sync-data/fetchCache.ts) — GAME_MASTER already has this data, so
// pogoapi's own pokemon_powerup_requirements.json (named as the fallback
// source in IDEAS.md's step 1) is not needed at all here. The engine
// (powerUpCostTableFromGameMaster, packages/engine/src/powerUp.ts) owns the
// interpretation of the raw settings into a per-level PowerUpCostTable — this
// script only fetches/validates/writes, same division of responsibility as
// fromGameMaster/fromGameMasterMove above. A missing/malformed source, or a
// validation failure inside powerUpCostTableFromGameMaster itself, means no
// table is produced THIS run — data/normalized/powerUpCosts.json (if one
// already exists from an earlier successful run) is left completely
// untouched rather than overwritten with something worse, and the reason is
// reported in WARNINGS, never silent and never a failed sync.
// ---------------------------------------------------------------------------

const powerUpCostsOutPath = join(NORMALIZED_DIR, "powerUpCosts.json");
const POWER_UP_COSTS_SOURCE_URL =
  "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json (POKEMON_UPGRADE_SETTINGS + LUCKY_POKEMON_SETTINGS templates)";

let previousPowerUpCosts: (PowerUpCostTable & { sourceUrl: string; fetchedAt: string }) | null = null;
if (existsSync(powerUpCostsOutPath)) {
  try {
    previousPowerUpCosts = JSON.parse(readFileSync(powerUpCostsOutPath, "utf-8"));
  } catch {
    previousPowerUpCosts = null;
  }
}

let powerUpCostTable: PowerUpCostTable | null = null;
let powerUpCostTableError: string | null = null;
if (!gameMasterAvailable) {
  powerUpCostTableError = "GAME_MASTER fetch failed this run — see the GAME_MASTER WARNINGS line above";
} else if (!gameMasterFetchResult.upgradeSettings) {
  powerUpCostTableError =
    "POKEMON_UPGRADE_SETTINGS template not found (or missing its candyCost/stardustCost arrays) in this run's GAME_MASTER dump";
} else if (gameMasterFetchResult.luckyStardustDiscountPercent === null) {
  powerUpCostTableError = "LUCKY_POKEMON_SETTINGS template (powerUpStardustDiscountPercent) not found in this run's GAME_MASTER dump";
} else {
  try {
    powerUpCostTable = powerUpCostTableFromGameMaster(
      gameMasterFetchResult.upgradeSettings,
      gameMasterFetchResult.luckyStardustDiscountPercent,
    );
  } catch (err) {
    powerUpCostTableError = `powerUpCostTableFromGameMaster validation failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const raidHistoryById = new Map<string, RaidHistoryEntry>();
for (const entry of previousRaidHistory) {
  if (entry && typeof entry.speciesId === "string") raidHistoryById.set(entry.speciesId, entry);
}

// One-time self-heal (2026-09-08, same day as the "pokebattler-legacy"
// source's introduction): an earlier, buggy version of the Pokebattler
// legacy-archive-backfill step below could persist a row with
// `source: "pokebattler-legacy"` that ALSO carried a pre-existing `eraHp`
// forward from the archive entry it upgraded — violating this task's
// invariant that a pokebattler-legacy row never carries an eraHp (see that
// section's own doc comment; the invariant is now enforced going forward by
// construction, so this should never recur). Any row already in that
// impossible state on disk is dropped here (not repaired in place, since the
// pre-upgrade tier/source it should revert to isn't recoverable from the
// corrupted row alone) so the normal precedence steps below (live-feed /
// researched-tier / pogoapi-previous+Bulbapedia archive union /
// pokebattler-legacy) re-derive it fresh this run, exactly as if this
// species had no history row yet.
const raidHistorySelfHealed: string[] = [];
for (const [speciesId, entry] of [...raidHistoryById.entries()]) {
  if (entry.source === "pokebattler-legacy" && entry.eraHp !== undefined) {
    raidHistoryById.delete(speciesId);
    raidHistorySelfHealed.push(`${speciesId} (was "${entry.tier}", eraHp ${entry.eraHp})`);
  }
}

// ---------------------------------------------------------------------------
// Step 1.5: re-resolve stale rows (2026-09-07 raidHistory re-resolution fix).
//
// raidHistory.json is accumulate-only, which means it durably preserves past
// MIS-resolutions exactly as well as it preserves facts. Before the extra-
// forms/type-distinct-forms work, a live raid literally named "Hisuian
// Sneasel" resolved to base species "sneasel" (dark/ice) because
// "sneasel-hisuian" (fighting/poison) didn't exist yet; that row was written
// to history with source "live-feed" and never revisited once the matcher
// got smarter — the Species Report went on rendering it as a second,
// PAST-badged "Hisuian Sneasel" row that was actually base Sneasel's stats
// under Hisuian Sneasel's name, the exact wrong-typing bug the extra-forms
// fix was supposed to eliminate. This step re-resolves every stored row's
// OWN `raidName` through the current matcher (resolveRaidNameForHistoryMigration
// below, kept in sync with the activeRaids matching loop's priorities) and,
// when it now resolves to a different, real, CONFIDENT (non-approximate) id,
// migrates the row there — merging into an already-correct row at that id if
// one exists, rather than leaving both.
//
// Two guards keep this from over-correcting:
//   - A raidName that no longer resolves to anything at all is left
//     completely untouched (absent evidence is not evidence of error) — this
//     is what protects a row whose species was later renamed/removed from
//     species.json for an unrelated reason.
//   - A raidName that resolves to a species whose id is a LESS specific form
//     of the already-stored id (stored.startsWith(resolved + "-")) is left
//     alone too — this is the benign "furfrou-dandy" case: raidName "Furfrou"
//     is a generic archive name for a row we already know (from elsewhere)
//     was the specific Dandy trim, not a wrong id needing correction. Only
//     the opposite direction — resolved is a MORE specific form of stored
//     (resolved.startsWith(stored + "-")), or resolved is simply a different
//     id entirely — counts as a correction.
// ---------------------------------------------------------------------------

/**
 * Re-resolves a historical raidHistory row's stored `raidName` through the
 * exact SAME cascade the activeRaids matching loop above uses (matchRaidName
 * in ./sync-data/raidNameMatching.ts) — used only by the Step 1.5 migration
 * above. Deliberately does NOT synthesize a brand-new Shadow-variant
 * species (unlike the activeRaids loop, which creates one on demand):
 * migration must only ever move/merge raidHistory rows, never mutate
 * species.json, so a Shadow-prefixed raidName (plain OR the "Shadow " +
 * regional compound case) with no ALREADY-existing shadow variant falls
 * through to whatever else the cascade offers instead — see
 * matchRaidName's own resolveShadowVariant contract.
 */
function resolveRaidNameForHistoryMigration(raidName: string): { speciesId: string | null; isApproximate: boolean } {
  return matchRaidName(
    raidName,
    { megaSpeciesLookupPool, speciesLookupPool, regionalFormSpeciesByPrefixAndBase },
    (baseSpeciesId) => shadowSpeciesByBaseId.get(baseSpeciesId)?.id ?? null,
  );
}

/** Source strength for the Step 1.5 merge below — mirrors RaidHistoryEntry.source's own doc-comment precedence (live-feed > researched-tier > the three archive sources, which are peers). */
const RAID_HISTORY_SOURCE_STRENGTH: Record<RaidHistoryEntry["source"], number> = {
  "live-feed": 3,
  "researched-tier": 2,
  "pogoapi-previous": 1,
  "bulbapedia-archive": 1,
  "pokebattler-legacy": 1,
};

/** Merges a stale row being migrated into an already-correct row at the resolved id — never loses a `firstSeenAt`, a `lastSeenAt`, an `eraHp`, or the strongest recorded `source`, per this task's design notes. */
function mergeRaidHistoryEntries(existing: RaidHistoryEntry, stale: RaidHistoryEntry, speciesId: string): RaidHistoryEntry {
  const winner =
    RAID_HISTORY_SOURCE_STRENGTH[existing.source] >= RAID_HISTORY_SOURCE_STRENGTH[stale.source] ? existing : stale;
  const loser = winner === existing ? stale : existing;
  return {
    speciesId,
    raidName: winner.raidName,
    tier: winner.tier,
    firstSeenAt: existing.firstSeenAt < stale.firstSeenAt ? existing.firstSeenAt : stale.firstSeenAt,
    lastSeenAt: existing.lastSeenAt > stale.lastSeenAt ? existing.lastSeenAt : stale.lastSeenAt,
    source: winner.source,
    eraHp: winner.eraHp ?? loser.eraHp,
  };
}

const raidHistoryMigrations: { from: string; to: string; raidName: string; merged: boolean }[] = [];
/** speciesId whose own `lastKnownRaidTier` was cleared alongside a Step 1.5 migration (see the loop below) — reported in WARNINGS so this is never a silent mutation. */
const raidHistoryMigrationClearedTiers: string[] = [];

for (const [storedId, entry] of [...raidHistoryById.entries()]) {
  const resolution = resolveRaidNameForHistoryMigration(entry.raidName);
  if (!resolution.speciesId || resolution.isApproximate) continue; // no confident re-resolution — leave untouched
  const resolvedId = resolution.speciesId;
  if (resolvedId === storedId) continue; // already correct
  if (storedId.startsWith(`${resolvedId}-`)) continue; // stored id is already a MORE specific form than the generic raidName resolves to (e.g. furfrou-dandy / "Furfrou") — benign, not a mis-resolution

  const existingTarget = raidHistoryById.get(resolvedId);
  raidHistoryById.delete(storedId);
  if (existingTarget) {
    raidHistoryById.set(resolvedId, mergeRaidHistoryEntries(existingTarget, entry, resolvedId));
    raidHistoryMigrations.push({ from: storedId, to: resolvedId, raidName: entry.raidName, merged: true });
  } else {
    raidHistoryById.set(resolvedId, { ...entry, speciesId: resolvedId });
    raidHistoryMigrations.push({ from: storedId, to: resolvedId, raidName: entry.raidName, merged: false });
  }

  // The stale row's own speciesId (storedId) is very likely also carrying a
  // `lastKnownRaidTier` set by this exact same historical mis-resolution
  // (species.lastKnownRaidTier is populated by the very same raid-matching
  // pass this migration is correcting — see the tier-capture side effect on
  // the activeRaids loop further down this file). Left alone, Step 3 below
  // (which seeds a "researched-tier" row for any species carrying a
  // lastKnownRaidTier with no history row yet) would immediately recreate an
  // equally-wrong row under storedId's generic name the moment this loop
  // deletes it above — resurrecting the exact bug this migration exists to
  // fix. Only cleared when the value is IDENTICAL to the migrated tier (the
  // strongest available evidence it's the same artifact, not a separate real
  // fact about storedId) — never a blind clear.
  const staleSpecies = speciesById.get(storedId);
  if (staleSpecies && staleSpecies.lastKnownRaidTier === entry.tier) {
    delete staleSpecies.lastKnownRaidTier;
    raidHistoryMigrationClearedTiers.push(storedId);
  }
}

// ---------------------------------------------------------------------------
// Step 1.6: clean up a "researched-tier" phantom left behind by a Step 1.5
// migration on an EARLIER run, before this species.json tier-clearing existed
// in the same pass. This is the exact same failure mode Step 1.5 exists to
// fix, one layer deeper: if a base species' `lastKnownRaidTier` was ever
// carried forward from an older mis-resolution (e.g. base "sneasel" once
// wrongly credited with Hisuian Sneasel's raid tier) and a Step 1.5 migration
// on some prior run deleted that species' history row WITHOUT yet clearing
// the tier (because this cleanup didn't exist yet), Step 3 below would have
// immediately re-seeded a "researched-tier" row for the base species under
// its own bare name — a real row in the file, but standing for a raid
// appearance the base species never actually had.
//
// Deliberately scoped ONLY to the exact regional-form/Shadow-variant family
// Step 1.5 already governs (regionalFormSpeciesByPrefixAndBase /
// shadowSpeciesByBaseId), never a generic "any base+suffix pair" rule — this
// project has many completely legitimate base+suffix history pairs (e.g.
// "gyarados"/"gyarados-mega", "deoxys"/"deoxys-attack") that really did have
// independent raid appearances and must never be pruned. Only fires when:
//   - this row is "researched-tier" (never a real live/allowlist observation
//     on its own, by definition — see RaidHistoryEntry.source's doc comment)
//   - its raidName is exactly the species' own bare name (the Step 3 seeding
//     signature, not a real feed-observed name)
//   - a sibling id that IS a confidently-resolved regional/Shadow extra form
//     of this exact species already carries the identical tier under
//     stronger evidence (anything other than "researched-tier")
// ---------------------------------------------------------------------------

const confidentExtraFormIds = new Set<string>([
  ...regionalFormSpeciesByPrefixAndBase.values(),
  ...[...shadowSpeciesByBaseId.values()].map((s) => s.id),
]);

const raidHistoryPhantomTierCleanups: string[] = [];

for (const [storedId, entry] of [...raidHistoryById.entries()]) {
  if (entry.source !== "researched-tier") continue;
  const ownSpecies = speciesById.get(storedId);
  if (!ownSpecies || entry.raidName !== ownSpecies.name) continue; // not a Step-3-shaped seed at all — leave alone

  const strongerSibling = [...raidHistoryById.entries()].find(
    ([siblingId, siblingEntry]) =>
      siblingId.startsWith(`${storedId}-`) &&
      confidentExtraFormIds.has(siblingId) &&
      siblingEntry.source !== "researched-tier" &&
      siblingEntry.tier === entry.tier,
  );
  if (!strongerSibling) continue;

  raidHistoryById.delete(storedId);
  if (ownSpecies.lastKnownRaidTier === entry.tier) delete ownSpecies.lastKnownRaidTier;
  raidHistoryPhantomTierCleanups.push(`${storedId} (superseded by ${strongerSibling[0]})`);
}

const registeredSpeciesIds = new Set(species.map((s) => s.id));
const raidHistoryNewlyAdded: string[] = [];

// Step 2: this run's live-feed observations always win over whatever was
// there before (a fresher live observation, or a weaker researched-tier
// seed), and always overwrite tier/raidName/source on an existing entry.
for (const raid of activeRaids) {
  if (!raid.speciesId || !registeredSpeciesIds.has(raid.speciesId)) continue;
  const existing = raidHistoryById.get(raid.speciesId);
  if (!existing) raidHistoryNewlyAdded.push(raid.speciesId);
  raidHistoryById.set(raid.speciesId, {
    speciesId: raid.speciesId,
    raidName: raid.raidName,
    tier: raid.tier,
    firstSeenAt: existing?.firstSeenAt ?? SYNC_TIMESTAMP,
    lastSeenAt: SYNC_TIMESTAMP,
    source: "live-feed",
  });
}

// Step 3: seed a researched-tier entry for any species this run's live feed
// didn't already cover (step 2, just above) but that carries a
// lastKnownRaidTier from some other source (this run's allowlist match, or a
// carry-forward from a previous run's species.json — see the precedence
// chain above this section).
for (const s of species) {
  if (!s.lastKnownRaidTier) continue;
  if (raidHistoryById.has(s.id)) continue;
  raidHistoryNewlyAdded.push(s.id);
  raidHistoryById.set(s.id, {
    speciesId: s.id,
    raidName: s.name,
    tier: s.lastKnownRaidTier,
    firstSeenAt: SYNC_TIMESTAMP,
    lastSeenAt: SYNC_TIMESTAMP,
    source: "researched-tier",
  });
}

// ---------------------------------------------------------------------------
// Step 4: pogoapi-previous historical backfill (2026-09-07 raidHistory
// backfill task). raidHistory.json started this project life with only 31
// entries (all megas) — a real gap, since Pokémon GO has had hundreds of
// raid bosses. pogoapi.net's raid_bosses.json `previous` list (fetched above
// by fetchAndCacheRaidBossesPrevious) is a source this project already
// depends on elsewhere, is machine-readable, and needs no scraping — 696
// historical entries across ~552 distinct species+form+tier-bucket
// combinations (tiers 1-6, "ex", "mega", "mega_legendary"; see the grouping
// key below for why "tier-bucket", not just species+form). Lowest-precedence
// source: only fills in a species this run's live-feed (step 2) or
// researched-tier (step 3) — or an EARLIER run's own raidHistory.json,
// reloaded into raidHistoryById at the top of this section — hasn't already
// covered. Never overwrites an existing entry.
//
// Two tiers are excluded outright rather than mapped, per this task's "never
// fabricate a tier" rule:
//   - "ex" (1 entry: Regidrago). EX Raids have no modern tier equivalent in
//     this project's RaidTier union (Niantic retired the format entirely) —
//     any tier assigned here would be invented, not sourced.
//   - "6" (2 entries: Darkrai, Mewtwo). pogoapi's own schema reserves a "6"
//     tier key (present, usually empty, in `current` too — confirmed
//     2026-09-07), but nothing in Niantic's real raid-tier history documents
//     a tier above 5 outside EX raids, and no independent source found
//     during this pass confirms what "6" is actually meant to denote.
//     Investigating further: BOTH Darkrai and Mewtwo ALSO have a separate
//     "5" entry in this same `previous` list, at the EXACT SAME max_boosted_cp
//     as their "6" entry (Darkrai 2671, Mewtwo 2984, confirmed by direct
//     inspection) — i.e. "6" looks like a duplicate record of an appearance
//     already captured under "5" for the same species+form, not a distinct
//     higher difficulty. Since both species are already covered via their
//     "5" -> "5-Star Raids" entry regardless, excluding "6" costs zero real
//     coverage either way — an honest exclusion beats a plausible guess,
//     and here it happens to be a free one.
// ---------------------------------------------------------------------------

const POGOAPI_PREVIOUS_TIER_MAP: Record<string, RaidTier> = {
  "1": "1-Star Raids",
  "2": "1-Star Raids", // pre-2020-08-26 tier, merged into Tier 1 (Niantic Support + corroborating community outlets)
  "3": "3-Star Raids",
  "4": "3-Star Raids", // pre-2020-08-26 tier, merged into Tier 3
  "5": "5-Star Raids",
  mega: "Mega Raids",
  mega_legendary: "Legendary Mega Raids",
  // "6" and "ex" deliberately absent — see reasoning above.
};

const raidBossesPreviousFetchFailed = raidBossesPreviousFetchResult.source === "error";
const raidBossesPreviousExcludedExCount = (raidBossesPreviousFetchResult.previous.ex ?? []).length;
const raidBossesPreviousExcludedTier6Count = (raidBossesPreviousFetchResult.previous["6"] ?? []).length;

interface PogoapiPreviousGroupEntry {
  bucket: "normal" | "mega";
  name: string;
  form: string;
  mappedTier: RaidTier;
}

const pogoapiPreviousGroups = new Map<string, PogoapiPreviousGroupEntry>();
for (const [tierKey, entries] of Object.entries(raidBossesPreviousFetchResult.previous)) {
  const mappedTier = POGOAPI_PREVIOUS_TIER_MAP[tierKey];
  if (!mappedTier) continue; // "6" and "ex" — excluded, see above
  const bucket: "normal" | "mega" = tierKey === "mega" || tierKey === "mega_legendary" ? "mega" : "normal";
  for (const entry of entries as RawRaidBossesPreviousEntry[]) {
    // Grouping key MUST include `bucket`, not just name+form: a mega/primal
    // raid_bosses.json entry conflates the base species with its mega form
    // via `form: "Normal"` (see RawRaidBossesPreviousEntry's doc comment) —
    // confirmed 2026-09-07 that e.g. "Venusaur"/"Normal" appears BOTH as a
    // real base-species Tier-3/4 raid AND as the "mega" tier's stand-in for
    // Mega Venusaur (35 such real collisions found across
    // Glalie/Manectric/Slowbro/Aerodactyl/Medicham/Salamence/Gengar/Absol/
    // Venusaur/Charizard/Blastoise/Aggron/Alakazam/Lopunny/Banette/
    // Kangaskhan/Ampharos/Abomasnow/Houndoom/Pidgeot/Gyarados/Groudon/
    // Kyogre/Latias/Latios). Collapsing across bucket would silently merge a
    // real base-species raid tier with its mega/primal counterpart's tier —
    // exactly the trap this task's instructions called out.
    const key = `${bucket}|${entry.name}|${entry.form}`;
    const existing = pogoapiPreviousGroups.get(key);
    if (!existing || RAID_TIER_TABLE[mappedTier].hp > RAID_TIER_TABLE[existing.mappedTier].hp) {
      pogoapiPreviousGroups.set(key, { bucket, name: entry.name, form: entry.form, mappedTier });
    }
  }
}

/** `${species name}`.toLowerCase() -> registered species id, built from the FULL final roster (ordinary + mega/primal + Shadow) so both this backfill's normal-bucket and mega-bucket resolution can share one lookup. */
const speciesIdByNameLower = new Map(species.map((s) => [s.name.toLowerCase(), s.id]));

interface ArchiveResolution {
  raidName: string;
  tier: RaidTier;
  /** Real era HP for this specific historical encounter (2026-09-07 era-HP backfill task) — see RaidHistoryEntry.eraHp's doc comment in ./sync-data/rawShapes.ts. pogoapi's `previous` list never sets this (raid_bosses.json's `previous` entries carry no HP field at all); only a Bulbapedia-sourced resolution ever does. */
  eraHp?: number;
}

const raidHistoryPogoapiPreviousUnresolved: string[] = [];
const pogoapiResolvedBySpeciesId = new Map<string, ArchiveResolution>();

for (const group of pogoapiPreviousGroups.values()) {
  let resolvedSpeciesId: string | null = null;
  let resolvedRaidName: string | null = null;

  if (group.bucket === "normal") {
    // Same qualified-name convention fromGameMaster itself uses to build
    // SpeciesDefinition.name: bare name for the "Normal" form, "Name (Form)"
    // otherwise (see gamemaster.ts's fromGameMaster) — pogoapi's own form
    // strings are exactly what stat.form/RawGameMasterSpecies.form already
    // carry, since both this project's species roster and raid_bosses.json
    // come from the same pogoapi.net form-naming convention. `group.form`
    // itself is RAW (possibly underscored, e.g. "West_sea") — cleaned via
    // formDisplayName (2026-09-10 fix) to match the roster's own now-cleaned
    // `.name`, same as applyCleanFormDisplayName above and
    // qualifiedRosterName in ./sync-data/pokebattlerRaids.ts; the raw
    // `group.form` itself is untouched (only this display string is built
    // from a cleaned copy).
    const qualifiedName = group.form === "Normal" ? group.name : `${group.name} (${formDisplayName(group.form)})`;
    resolvedRaidName = qualifiedName;
    resolvedSpeciesId = speciesIdByNameLower.get(qualifiedName.toLowerCase()) ?? null;
  } else {
    const megaName = megaPokemonKeyToMegaName.get(`${group.name.toLowerCase()}|${group.form}`);
    if (megaName) {
      resolvedRaidName = megaName;
      resolvedSpeciesId = speciesIdByNameLower.get(megaName.toLowerCase()) ?? null;
    }
  }

  if (!resolvedSpeciesId) {
    raidHistoryPogoapiPreviousUnresolved.push(
      `${group.bucket === "mega" ? (resolvedRaidName ?? `${group.name}/${group.form} (no mega_pokemon.json/GAME_MASTER match)`) : (resolvedRaidName ?? `${group.name}/${group.form}`)} (tier ${group.mappedTier})`,
    );
    continue;
  }

  // A single pogoapi-previous run can independently produce both a "normal"
  // and a "mega" resolution for the SAME species id in rare cases (none
  // currently known, but the bucket-keyed grouping above doesn't itself rule
  // it out) — keep the higher-HP tier rather than letting iteration order
  // decide, same rule the Bulbapedia union below uses.
  const existing = pogoapiResolvedBySpeciesId.get(resolvedSpeciesId);
  if (!existing || RAID_TIER_TABLE[group.mappedTier].hp > RAID_TIER_TABLE[existing.tier].hp) {
    pogoapiResolvedBySpeciesId.set(resolvedSpeciesId, { raidName: resolvedRaidName ?? resolvedSpeciesId, tier: group.mappedTier });
  }
}

// ---------------------------------------------------------------------------
// Bulbapedia archive union (2026-09-07 raidHistory backfill task, phase 2).
// pogoapi's own `previous` list (just above) is missing ~26 base species
// entirely (Heatran among them — a marquee 5-star legendary, so a real gap,
// not an edge case) that Bulbapedia's own "List of Raid Boss changes in ..."
// archive pages DO carry. Resolved independently here (see
// scripts/sync-data/bulbapediaRaidArchive.ts for the parsing/matching this
// wraps), then UNIONED against pogoapiResolvedBySpeciesId above by resolved
// species id — not by raw name/form key, since the two sources use
// completely different form-wording vocabularies (pogoapi: "Altered";
// Bulbapedia: "Altered Form") and only converge once both are matched down to
// this project's own species ids. On a same-species conflict the higher-HP
// tier wins and the conflict is counted+sampled for the sync report — an
// intentional read on how often the two independent sources disagree, not
// just a silent pick.
// ---------------------------------------------------------------------------

const bulbapediaRaidArchiveFetchFailed = bulbapediaRaidArchiveFetchResult.source === "error";
const { rows: bulbapediaRawRows, invalidHpSamples: bulbapediaInvalidHpSamples } = parseBulbapediaRaidRows(
  bulbapediaRaidArchiveFetchResult.pages,
);
const bulbapediaBaseNameIndex = buildBaseNameIndex(species);

const bulbapediaResolvedBySpeciesId = new Map<string, ArchiveResolution>();
const bulbapediaUnresolved: string[] = [];
let bulbapediaViaBaseNameFallbackCount = 0;

for (const row of bulbapediaRawRows) {
  const resolved = resolveBulbapediaRow(row, bulbapediaBaseNameIndex, speciesById, defaultRaidTierForSpecies);
  if (!resolved) {
    bulbapediaUnresolved.push(`${row.name}${row.form ? `/${row.form}` : ""} (${row.bucket})`);
    continue;
  }
  if (resolved.viaBaseNameFallback) bulbapediaViaBaseNameFallbackCount++;
  const existing = bulbapediaResolvedBySpeciesId.get(resolved.speciesId);
  const resolvedHp = RAID_TIER_TABLE[resolved.tier].hp;
  const existingHp = existing ? RAID_TIER_TABLE[existing.tier].hp : -1;
  if (!existing || resolvedHp > existingHp) {
    // Strictly higher real (mapped) tier wins outright — unchanged tier-
    // selection behavior. Also seeds eraHp from this same winning row, if it
    // has one (2026-09-07 era-HP backfill task).
    bulbapediaResolvedBySpeciesId.set(resolved.speciesId, { raidName: resolved.raidName, tier: resolved.tier, eraHp: resolved.eraHp });
  } else if (resolvedHp === existingHp && existing!.eraHp === undefined && resolved.eraHp !== undefined) {
    // Same resolved (mapped) tier as an already-seen row for this species,
    // AND no era HP captured for it yet — 2026-09-07 era-HP backfill task.
    // Rows are processed in chronological page order (see
    // BULBAPEDIA_RAID_ARCHIVE_PAGES in ./sync-data/fetchCache.ts), so this
    // fills in the FIRST row (chronologically) that has a parseable HP
    // (KNOWN_ERA_HP_VALUES) for that already-established tier — covering the
    // real case where the very first row ever seen for a species had an
    // out-of-set HP (e.g. Tyranitar's earliest, 2017-2018 tier-4 rows record
    // 7500, a real but out-of-scope value — see KNOWN_ERA_HP_VALUES's doc
    // comment — so the first-VALID row, 2019's 9000, is what gets kept).
    //
    // Once set, eraHp is intentionally LOCKED for the rest of this loop
    // (never overwritten by a LATER same-mapped-tier row) — this is the
    // deliberate fix for the tier-2->1 / tier-4->3 collapse: Tyranitar's old
    // tier-4 rows (real HP 9000) and its later, post-merge tier-3
    // reappearances (real HP 3600) BOTH map to today's "3-Star Raids", but
    // the old tier-4 rows come first chronologically and get locked in,
    // preserving the historically-significant 9000 rather than letting a
    // later, lower-difficulty reappearance quietly overwrite it. The same
    // logic naturally holds a currently-recurring mega's pre-2022-04-28
    // 15000 HP (its own first-ever resolved row) rather than its later,
    // lower 9000-HP reappearances, since a mega/primal row's `tier` is
    // always the same value for a given species (derived from
    // defaultRaidTierForSpecies, not from wikitext) — every later row is
    // necessarily a "same tier" case here.
    bulbapediaResolvedBySpeciesId.set(resolved.speciesId, { ...existing!, eraHp: resolved.eraHp });
  }
}
// De-duplicate the unresolved list (thousands of raw rows collapse to a
// small, repeated set of unresolved name/form pairs across many pages).
const bulbapediaUnresolvedDistinct = [...new Set(bulbapediaUnresolved)].sort();

interface ArchiveConflictExample {
  speciesId: string;
  pogoapiTier: RaidTier;
  bulbapediaTier: RaidTier;
  winner: "pogoapi-previous" | "bulbapedia-archive";
}

const archiveUnionConflicts: ArchiveConflictExample[] = [];
const archiveUnionResolved = new Map<string, { resolution: ArchiveResolution; source: "pogoapi-previous" | "bulbapedia-archive" }>();

for (const [speciesId, pogoapiRes] of pogoapiResolvedBySpeciesId) {
  archiveUnionResolved.set(speciesId, { resolution: pogoapiRes, source: "pogoapi-previous" });
}
for (const [speciesId, bulbapediaRes] of bulbapediaResolvedBySpeciesId) {
  const existing = archiveUnionResolved.get(speciesId);
  if (!existing) {
    archiveUnionResolved.set(speciesId, { resolution: bulbapediaRes, source: "bulbapedia-archive" });
    continue;
  }
  const existingHp = RAID_TIER_TABLE[existing.resolution.tier].hp;
  const bulbapediaHp = RAID_TIER_TABLE[bulbapediaRes.tier].hp;
  if (bulbapediaHp === existingHp) {
    // Agree — keep the existing (pogoapi-previous) entry's tier/raidName/
    // source, nothing to report. But Bulbapedia's own row independently
    // resolved to this EXACT SAME real tier for this species, so its era HP
    // (2026-09-07 backfill task) is honestly attachable here too — pogoapi's
    // own `previous` list never carries an HP field at all, so this can only
    // ever ADD an eraHp, never overwrite/mix one from a different tier. This
    // is the documented case where the persisted entry's `source` reads
    // "pogoapi-previous" yet still carries a real `eraHp`.
    if (bulbapediaRes.eraHp !== undefined && existing.resolution.eraHp === undefined) {
      archiveUnionResolved.set(speciesId, { resolution: { ...existing.resolution, eraHp: bulbapediaRes.eraHp }, source: existing.source });
    }
    continue;
  }
  const winner: "pogoapi-previous" | "bulbapedia-archive" = bulbapediaHp > existingHp ? "bulbapedia-archive" : "pogoapi-previous";
  archiveUnionConflicts.push({
    speciesId,
    pogoapiTier: existing.resolution.tier,
    bulbapediaTier: bulbapediaRes.tier,
    winner,
  });
  if (winner === "bulbapedia-archive") archiveUnionResolved.set(speciesId, { resolution: bulbapediaRes, source: "bulbapedia-archive" });
}

let raidHistoryArchiveNewlyAddedCount = 0;
let raidHistoryArchiveUpgradedCount = 0;
const raidHistoryArchiveUpgraded: string[] = [];
let raidHistoryEraHpBackfilledCount = 0;

for (const [speciesId, { resolution, source }] of archiveUnionResolved) {
  const existing = raidHistoryById.get(speciesId);
  if (existing && (existing.source === "live-feed" || existing.source === "researched-tier")) continue; // never overwrites higher precedence

  if (!existing) {
    raidHistoryNewlyAdded.push(speciesId);
    raidHistoryArchiveNewlyAddedCount++;
    raidHistoryById.set(speciesId, {
      speciesId,
      raidName: resolution.raidName,
      tier: resolution.tier,
      firstSeenAt: SYNC_TIMESTAMP,
      lastSeenAt: SYNC_TIMESTAMP,
      source,
      eraHp: resolution.eraHp,
    });
    continue;
  }

  // existing.source is "pogoapi-previous" or "bulbapedia-archive" (an earlier
  // run's own archive entry) — accumulate-only: upgrade in place if this
  // run's union resolved a strictly higher tier, otherwise leave untouched.
  // Never downgrades, never deletes. existing.tier is a persisted plain
  // string (RaidHistoryEntry's field is deliberately untyped, see its doc
  // comment) rather than the narrower RaidTier this run's own resolution
  // carries — isKnownRaidTier narrows it the same way the live-feed capture
  // above does; every row this pipeline has ever written passes it in
  // practice, so this is not expected to ever short-circuit the upgrade.
  if (isKnownRaidTier(existing.tier) && RAID_TIER_TABLE[resolution.tier].hp > RAID_TIER_TABLE[existing.tier].hp) {
    raidHistoryArchiveUpgradedCount++;
    raidHistoryArchiveUpgraded.push(`${speciesId} ${existing.tier} -> ${resolution.tier}`);
    raidHistoryById.set(speciesId, {
      ...existing,
      raidName: resolution.raidName,
      tier: resolution.tier,
      lastSeenAt: SYNC_TIMESTAMP,
      source,
      eraHp: resolution.eraHp,
    });
  } else if (existing.eraHp === undefined && resolution.eraHp !== undefined) {
    // Era-HP-only backfill (2026-09-07 task): the tier itself didn't change
    // (this species' correct tier was already recorded by an earlier run, or
    // by the newly-added-entry branch above on a PRIOR run before eraHp
    // existed as a field at all), but this run's union resolution now
    // carries a real era HP for it that the persisted entry has never had.
    // Attach it without touching tier/raidName/source/firstSeenAt/lastSeenAt
    // — purely additive, never downgrades or invents a tier.
    raidHistoryEraHpBackfilledCount++;
    raidHistoryById.set(speciesId, { ...existing, eraHp: resolution.eraHp });
  }
}

// ---------------------------------------------------------------------------
// Pokebattler legacy archive backfill (2026-09-08 task — see
// ./sync-data/pokebattlerRaids.ts's top-of-file doc comment for why this was
// deferred until now, and RaidHistoryEntry.source's own doc comment in
// ./sync-data/rawShapes.ts for the "pokebattler-legacy" provenance value's
// pinned name). A THIRD independent historical archive, unioned in as a peer
// of "pogoapi-previous"/"bulbapedia-archive" — never overwrites a "live-feed"
// or "researched-tier" entry, and among the three archive peers the highest-
// HP resolved tier wins on a same-species conflict, same discipline as the
// pogoapi-vs-Bulbapedia union above.
//
// NEVER sets `eraHp` from a Pokebattler row (non-negotiable, confirmed
// 2026-09-08: Pokebattler re-maps its own history onto MODERN tier labels
// with no era fidelity — its `RAID_LEVEL_4_LEGACY` holds Community-Day-style
// four-star bosses, not the real pre-2020 tier 4, and `RAID_LEVEL_3_LEGACY`
// holds Tyranitar even though Bulbapedia records its historical tier as 4).
// Every write below either omits eraHp entirely (new row) or explicitly
// carries the PRE-EXISTING entry's own eraHp forward unchanged (tier
// upgrade) — never `resolution.eraHp`, which doesn't exist on this source at
// all.
//
// Tier mapping is deliberately conservative per this task's "never fabricate
// a tier" rule: RAID_LEVEL_ELITE_LEGACY (Bulbapedia's Elite Raid difficulty
// table: 20000 HP) has no equivalent anywhere in this project's RaidTier
// union and is excluded outright. RAID_LEVEL_ULTRA_BEAST_LEGACY's real-world
// HP (15000) happens to numerically match "5-Star Raids"/"Legendary Mega
// Raids", but Ultra Wormhole encounters were a Special-Research-gated event
// format, not standard raid-egg rotation content — the HP coincidence alone
// isn't independent confirmation the two are the same content type this
// project's RaidTier union is meant to classify, so it stays excluded too
// (see POKEBATTLER_LEGACY_EXCLUDED_TIERS's doc comment in
// ./sync-data/pokebattlerRaids.ts). Both exclusions, and their raw entry
// counts, are reported below.
// ---------------------------------------------------------------------------

interface PokebattlerLegacyResolution {
  raidName: string;
  tier: RaidTier;
}

const pokebattlerLegacyResolvedBySpeciesId = new Map<string, PokebattlerLegacyResolution>();
const pokebattlerLegacyUnresolved: string[] = [];
const pokebattlerLegacyExcludedTierCounts: Record<string, number> = {};
let pokebattlerLegacyTotalConsidered = 0;
let pokebattlerLegacyResolvedRawCount = 0;

if (pokebattlerFetchResult.source === "live") {
  const pokebattlerLegacyCtx: PokebattlerResolutionContext = {
    pokemonIdByName,
    defaultFormByPokemonId,
    enumToPogoapiName,
    speciesIdByNameLower,
  };

  for (const tier of pokebattlerFetchResult.tiers) {
    if (!isArchivableLegacyTier(tier.tier)) continue; // not a "_LEGACY" tier, or a "_MAX" one — out of scope, see isArchivableLegacyTier's doc comment
    if (POKEBATTLER_LEGACY_EXCLUDED_TIERS.has(tier.tier)) {
      pokebattlerLegacyExcludedTierCounts[tier.tier] = (tier.raids ?? []).length;
      continue;
    }
    const isMegaTier = POKEBATTLER_LEGACY_MEGA_TIERS.has(tier.tier);
    for (const raid of tier.raids ?? []) {
      pokebattlerLegacyTotalConsidered++;
      const resolved = resolvePokebattlerPokemonId(raid.pokemon, pokebattlerLegacyCtx);
      if (!resolved) {
        pokebattlerLegacyUnresolved.push(`${raid.pokemon} [${tier.tier}]`);
        continue;
      }
      const mappedTier = isMegaTier
        ? resolveMegaLegacyTier(resolved.speciesId, speciesById, defaultRaidTierForSpecies)
        : (POKEBATTLER_LEGACY_NUMERIC_TIER_MAP[tier.tier] ?? null);
      if (!mappedTier) {
        // Should never happen (resolveMegaLegacyTier only returns null for a
        // speciesId this same resolution just produced from the live
        // roster) — defensive, reported rather than silently dropped.
        pokebattlerLegacyUnresolved.push(`${raid.pokemon} [${tier.tier}] (resolved to species "${resolved.speciesId}" but no tier mapping)`);
        continue;
      }
      pokebattlerLegacyResolvedRawCount++;
      // Shadow-bucket entries resolve `resolved.speciesId` to the actual
      // Shadow-variant species id as of the 2026-09-08 durability fix (see
      // resolvePokebattlerPokemonId's doc comment) — the sync-data.ts
      // "Shadow-variant durable synthesis" section pre-creates that variant
      // from this exact tier BEFORE this loop runs, so `resolvedToShadowVariant`
      // is expected true here. `raidName` keeps the full "Shadow <Base>" name
      // in that case (it names the actual matched species now, not a stand-
      // in); only the defensive base-species-fallback branch (no variant
      // registered, `resolvedToShadowVariant` unset) strips the prefix,
      // matching this pipeline's existing "historical archive entry falls
      // back to the base species" convention (same as resolveBulbapediaRow's).
      const raidName =
        resolved.bucket === "shadow" && !resolved.resolvedToShadowVariant
          ? resolved.displayName.replace(/^Shadow /, "")
          : resolved.displayName;
      const existing = pokebattlerLegacyResolvedBySpeciesId.get(resolved.speciesId);
      if (!existing || RAID_TIER_TABLE[mappedTier].hp > RAID_TIER_TABLE[existing.tier].hp) {
        pokebattlerLegacyResolvedBySpeciesId.set(resolved.speciesId, { raidName, tier: mappedTier });
      }
    }
  }
}

let raidHistoryPokebattlerLegacyNewlyAddedCount = 0;
let raidHistoryPokebattlerLegacyUpgradedCount = 0;
const raidHistoryPokebattlerLegacyUpgraded: string[] = [];
let raidHistoryPokebattlerLegacySkippedEraHpCount = 0;
const raidHistoryPokebattlerLegacySkippedEraHp: string[] = [];

for (const [speciesId, resolution] of pokebattlerLegacyResolvedBySpeciesId) {
  const existing = raidHistoryById.get(speciesId);
  if (existing && (existing.source === "live-feed" || existing.source === "researched-tier")) continue; // never overwrites higher precedence

  if (!existing) {
    raidHistoryNewlyAdded.push(speciesId);
    raidHistoryPokebattlerLegacyNewlyAddedCount++;
    raidHistoryById.set(speciesId, {
      speciesId,
      raidName: resolution.raidName,
      tier: resolution.tier,
      firstSeenAt: SYNC_TIMESTAMP,
      lastSeenAt: SYNC_TIMESTAMP,
      source: "pokebattler-legacy",
      // eraHp deliberately omitted — never set from a Pokebattler row, see this section's doc comment.
    });
    continue;
  }

  // existing.source is "pogoapi-previous" | "bulbapedia-archive" |
  // "pokebattler-legacy" (a peer archive entry, this run's or an earlier
  // run's). Never touches a row that already carries a real eraHp at all —
  // relabeling its `source` to "pokebattler-legacy" while carrying an eraHp
  // forward would violate BOTH this task's non-negotiables at once (a
  // pokebattler-legacy row must never carry an eraHp — this source has no
  // era fidelity — AND an existing eraHp must never be stripped); the only
  // way to honor both simultaneously is to leave such a row completely
  // alone, even when this resolution's tier is technically higher. Only a
  // row with NO eraHp yet is eligible for the peer tier-upgrade, same
  // discipline as the pogoapi-vs-Bulbapedia union above: upgrade in place
  // only on a strictly higher resolved tier, never downgrade, never delete.
  if (existing.eraHp !== undefined) {
    raidHistoryPokebattlerLegacySkippedEraHpCount++;
    raidHistoryPokebattlerLegacySkippedEraHp.push(`${speciesId} (kept ${existing.source} "${existing.tier}", eraHp ${existing.eraHp})`);
    continue;
  }
  // existing.tier is RaidHistoryEntry's persisted plain string, narrowed via
  // isKnownRaidTier the same way as the archive-upgrade branch above.
  if (isKnownRaidTier(existing.tier) && RAID_TIER_TABLE[resolution.tier].hp > RAID_TIER_TABLE[existing.tier].hp) {
    raidHistoryPokebattlerLegacyUpgradedCount++;
    raidHistoryPokebattlerLegacyUpgraded.push(`${speciesId} ${existing.tier} -> ${resolution.tier}`);
    raidHistoryById.set(speciesId, {
      ...existing,
      raidName: resolution.raidName,
      tier: resolution.tier,
      lastSeenAt: SYNC_TIMESTAMP,
      source: "pokebattler-legacy",
      // eraHp intentionally absent from this new object entirely (not even
      // `undefined` copied from existing, which is already undefined here
      // given the guard above) — a pokebattler-legacy row never carries one.
    });
  }
  // else: existing tier's HP already >= this resolution's — leave completely untouched.
}

const pokebattlerLegacyUnresolvedDistinct = [...new Set(pokebattlerLegacyUnresolved)].sort();

const raidHistory = [...raidHistoryById.values()].sort((a, b) => a.speciesId.localeCompare(b.speciesId));
const raidHistoryLiveFeedCount = raidHistory.filter((r) => r.source === "live-feed").length;
const raidHistoryResearchedCount = raidHistory.filter((r) => r.source === "researched-tier").length;
const raidHistoryPogoapiPreviousCount = raidHistory.filter((r) => r.source === "pogoapi-previous").length;
const raidHistoryBulbapediaArchiveCount = raidHistory.filter((r) => r.source === "bulbapedia-archive").length;
const raidHistoryPokebattlerLegacyCount = raidHistory.filter((r) => r.source === "pokebattler-legacy").length;
// 2026-09-07 era-HP backfill task reporting.
const raidHistoryWithEraHp = raidHistory.filter((r) => r.eraHp !== undefined);
const raidHistoryEraHpBySource = {
  "live-feed": raidHistoryWithEraHp.filter((r) => r.source === "live-feed").length,
  "researched-tier": raidHistoryWithEraHp.filter((r) => r.source === "researched-tier").length,
  "pogoapi-previous": raidHistoryWithEraHp.filter((r) => r.source === "pogoapi-previous").length,
  "bulbapedia-archive": raidHistoryWithEraHp.filter((r) => r.source === "bulbapedia-archive").length,
  "pokebattler-legacy": raidHistoryWithEraHp.filter((r) => r.source === "pokebattler-legacy").length,
};
const raidHistoryEraHpDistribution: Record<number, number> = {};
for (const r of raidHistoryWithEraHp) {
  raidHistoryEraHpDistribution[r.eraHp!] = (raidHistoryEraHpDistribution[r.eraHp!] ?? 0) + 1;
}
const bulbapediaInvalidHpSamplesDistinct = [...new Set(bulbapediaInvalidHpSamples)].sort();

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

if (!existsSync(NORMALIZED_DIR)) mkdirSync(NORMALIZED_DIR, { recursive: true });

writeFileSync(speciesOutPath, JSON.stringify(species, null, 2));
writeFileSync(raidsOutPath, JSON.stringify(activeRaids, null, 2));
writeFileSync(raidHistoryOutPath, JSON.stringify(raidHistory, null, 2));
// See this file's "Power-up (level-up) cost table" section above for why a
// missing/invalid table this run intentionally leaves any existing file untouched.
if (powerUpCostTable) {
  writeFileSync(
    powerUpCostsOutPath,
    JSON.stringify({ sourceUrl: POWER_UP_COSTS_SOURCE_URL, fetchedAt: SYNC_TIMESTAMP, ...powerUpCostTable }, null, 2),
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const RAID_FALLBACK_PATH = raidFallbackPathFor(REPO_ROOT);
const SCRAPEDDUCK_RAIDS_URL = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.json";

const raidsWithNullSpecies = activeRaids.filter((r) => r.speciesId === null).length;
const raidsApproximate = activeRaids.filter((r) => r.isApproximate).length;

console.log(`SYNCED: GAME_MASTER (primary), pokemon_stats/pokemon_types/fast_moves/charged_moves/current_pokemon_moves (roster + fallback), cp_multiplier, mega_pokemon, scrapedduck-raids, pokebattler-raids (live cross-check + "_LEGACY" archive backfill, see WARNINGS), raid_bosses.previous + bulbapedia-raid-archive + pokebattler-legacy (raidHistory backfill) (${species.length} species [${species.length - megaSpecies.length - shadowSpecies.length - extraFormSpeciesCount} single-form (Normal, or fallback — see WARNINGS) + ${extraFormSpeciesCount} mechanically-distinct extra form (see WARNINGS) + ${megaSpecies.length} mega/primal + ${shadowSpecies.length} Shadow variant (${shadowSeedDurableCount} durably from evidence [raidHistory.json/Pokebattler-legacy/Bulbapedia], ${shadowSpecies.length - shadowSeedDurableCount} from this run's live feed only, isShadow: true, real base stats untouched — see WARNINGS)], ${fastMoveByName.size + chargedMoveByName.size} pogoapi-fallback moves cached + ${gameMasterFetchResult.moves.length} GAME_MASTER moveSettings entries), power-up cost table (${powerUpCostTable ? `${powerUpCostTable.steps.length} steps, see WARNINGS` : "skipped this run, see WARNINGS"})`);
console.log(`CHANGED (species.json): ${speciesDiffs.length > 0 ? speciesDiffs.join("; ") : "none"}`);
console.log(`CHANGED (activeRaids.json): ${raidDiffs.length > 0 ? raidDiffs.join("; ") : "none"}`);
console.log(
  `CHANGED (raidHistory.json): ${raidHistory.length} total entries (${raidHistoryLiveFeedCount} live-feed, ${raidHistoryResearchedCount} researched-tier, ${raidHistoryPogoapiPreviousCount} pogoapi-previous, ${raidHistoryBulbapediaArchiveCount} bulbapedia-archive, ${raidHistoryPokebattlerLegacyCount} pokebattler-legacy); newly added this run: ${raidHistoryNewlyAdded.length > 0 ? raidHistoryNewlyAdded.join(", ") : "none"}; archive-vs-archive tier upgrades this run: ${raidHistoryArchiveUpgradedCount > 0 ? raidHistoryArchiveUpgraded.join(", ") : "none"}; pokebattler-legacy tier upgrades this run: ${raidHistoryPokebattlerLegacyUpgradedCount > 0 ? raidHistoryPokebattlerLegacyUpgraded.join(", ") : "none"}; stale-row re-resolutions this run: ${raidHistoryMigrations.length > 0 ? raidHistoryMigrations.map((m) => `${m.from} -> ${m.to} (raidName "${m.raidName}"${m.merged ? ", merged into existing correct row" : ""})`).join("; ") : "none"}; species.json lastKnownRaidTier cleared alongside a migration (same-value contamination from the same old mis-resolution): ${raidHistoryMigrationClearedTiers.length > 0 ? raidHistoryMigrationClearedTiers.join(", ") : "none"}; phantom researched-tier rows superseded by a confidently-resolved extra form and removed: ${raidHistoryPhantomTierCleanups.length > 0 ? raidHistoryPhantomTierCleanups.join(", ") : "none"}`,
);
console.log(
  `CHANGED (powerUpCosts.json): ${
    !powerUpCostTable
      ? `skipped this run (${powerUpCostTableError}) — see WARNINGS`
      : !previousPowerUpCosts
        ? "created (no previous file)"
        : JSON.stringify(previousPowerUpCosts) === JSON.stringify({ sourceUrl: POWER_UP_COSTS_SOURCE_URL, fetchedAt: previousPowerUpCosts.fetchedAt, ...powerUpCostTable })
          ? "none"
          : "cost table or multipliers changed vs previous sync"
  }`,
);
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
  `  - Form-change moveReassignment grants (2026-09-10, MECHANICS.md "Form-change moveReassignment grants moves that appear in no movepool array" — pokemonSettings.formChange[].moveReassignment entries this pipeline now reads instead of discarding at fetch time; see resolveFormChangeMoveGrants in scripts/sync-data/formChangeMoveGrants.ts): ${
    gameMasterFetchResult.formChangeMoveGrants.length === 0
      ? "none applied this run"
      : gameMasterFetchResult.formChangeMoveGrants
          .map((g) => {
            const added = [...g.addedCinematicMoves, ...g.addedQuickMoves];
            const skipped = [...g.skippedCinematicMoves, ...g.skippedQuickMoves];
            return `${g.pokemonId}${g.form ? ` (${g.form})` : ""}${added.length > 0 ? `: +${added.join(", ")}` : ""}${skipped.length > 0 ? ` [SKIPPED, no moveSettings match this run: ${skipped.join(", ")}]` : ""}`;
          })
          .join("; ")
  }.${gameMasterFetchResult.unmatchedFormChangeTargets.length > 0 ? ` UNMATCHED target form(s) (named by a formChange entry but no matching pokemonSettings template this run): ${gameMasterFetchResult.unmatchedFormChangeTargets.join(", ")}.` : ""}`,
);
if (powerUpCostTable) {
  // Field names below are the engine's own PowerUpCostTable (packages/engine/src/powerUp.ts) — luckyStardustMultiplier is 1 - GAME_MASTER's powerUpStardustDiscountPercent.
  const step1 = powerUpCostTable.steps.find((s) => s.fromLevel === 1);
  const step40 = powerUpCostTable.steps.find((s) => s.fromLevel === 40);
  const step495 = powerUpCostTable.steps.find((s) => s.fromLevel === 49.5);
  console.log(
    `  - Power-up cost table (data/normalized/powerUpCosts.json, 2026-09-08 Power-Up Optimizer data source — GAME_MASTER's POKEMON_UPGRADE_SETTINGS + LUCKY_POKEMON_SETTINGS templates, pogoapi's pokemon_powerup_requirements.json not needed since GAME_MASTER already has this data): ${powerUpCostTable.steps.length} steps, maxLevel ${powerUpCostTable.maxLevel}. Sample step costs — level 1: ${step1 ? `${step1.stardust} stardust / ${step1.candy} candy${step1.xlCandy ? ` / ${step1.xlCandy} XL candy` : ""}` : "not found (unexpected)"}; level 40: ${step40 ? `${step40.stardust} stardust / ${step40.candy} candy${step40.xlCandy ? ` / ${step40.xlCandy} XL candy` : ""}` : "not found (unexpected)"}; level 49.5: ${step495 ? `${step495.stardust} stardust / ${step495.candy} candy${step495.xlCandy ? ` / ${step495.xlCandy} XL candy` : ""}` : "not found (unexpected)"}. Multipliers — shadow: ${powerUpCostTable.shadowStardustMultiplier}x stardust / ${powerUpCostTable.shadowCandyMultiplier}x candy; purified: ${powerUpCostTable.purifiedStardustMultiplier}x stardust / ${powerUpCostTable.purifiedCandyMultiplier}x candy; lucky: ${powerUpCostTable.luckyStardustMultiplier}x stardust (candy unaffected).`,
  );
} else {
  console.log(
    `  - VALIDATION: power-up cost table NOT produced this run (${powerUpCostTableError}) — data/normalized/powerUpCosts.json left untouched${existsSync(powerUpCostsOutPath) ? " (existing file from an earlier run still stands)" : " (no existing file — Power-Up Optimizer data source is still unpopulated)"}. Re-run once the missing GAME_MASTER template is reachable/well-formed again.`,
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
console.log(`  - Deliberately NOT overridden (multiple real, independently-released forms with no single correct "default" per a Bulbapedia/GO-focused check): Urshifu (Single Strike vs Rapid Strike), Indeedee (Male vs Female — stats genuinely differ, no canonical default; Male now also normalizes as its own species, see the extra-forms line below), Basculin (Red- vs Blue-Striped). Also left alone: species where every candidate form has identical stats/type and no clearly-conventional default exists either (Unown, Spinda, Scatterbug/Spewpa/Vivillon, Furfrou, Minior, Squawkabilly, Tatsugiri, Toxtricity, Maushold, Koraidon, Miraidon, and the single-form-only Galarian-native species: Obstagoon, Perrserker, Sirfetch'd, Mr. Rime, Runerigus) — this pass's fallback pick for all of these was confirmed correct or inconsequential.`);
const extraFormsStatsOnly = extraFormSpeciesAdded.filter((f) => f.statsDiffer && !f.typesDiffer);
const extraFormsTypesOnly = extraFormSpeciesAdded.filter((f) => !f.statsDiffer && f.typesDiffer);
const extraFormsBoth = extraFormSpeciesAdded.filter((f) => f.statsDiffer && f.typesDiffer);
console.log(`  - MECHANICALLY-DISTINCT EXTRA FORMS (2026-09-08 fix for AUDIT_2026-09-08.md Defect 1, widened same-day to stats-OR-types after the Hisuian Sneasel incident — see the "extra forms" pass's own doc comment above the primary species-build loop): of the ${rawStats.length - normalStats.length} non-default-form rows in pokemon_stats.json, ${extraFormSpeciesCount} had base stats and/or typing genuinely differing from their pokemon_id's own default-form baseline and were normalized as their own species (id/name convention identical to the existing giratina-altered/shellos-west_sea style, e.g. "lilligant-hisuian" / "Lilligant (Hisuian)") — ${extraFormsBoth.length} differ in both stats and typing, ${extraFormsStatsOnly.length} in stats only, ${extraFormsTypesOnly.length} in typing only (types-only additions this pass: ${extraFormsTypesOnly.length > 0 ? extraFormsTypesOnly.map((f) => f.name).join(", ") : "none"}); the rest matched their baseline exactly on BOTH stats and typing (cosmetic — Pikachu costumes, Vivillon patterns, seasonal Deerling/Sawsbuck, etc.) and stay correctly excluded, unchanged. ${skippedExtraForms.length > 0 ? `${skippedExtraForms.length} distinct candidate(s) could not be normalized and were skipped (reported, not fabricated): ${skippedExtraForms.map((s) => `${s.pokemon_name} (${s.form}): ${s.reason}`).join("; ")}.` : "None were skipped — every distinct candidate resolved a full type + moveset."}`);
if (formOverrideMismatches.length > 0) {
  console.log(`  - VALIDATION: FORM_OVERRIDES named a form pokemon_stats.json doesn't actually have a row for (override skipped, generic fallback used instead — check for a typo or an upstream form-name rename): ${formOverrideMismatches.map((m) => `pokemon_id ${m.pokemon_id} -> "${m.wanted}"`).join(", ")}`);
}
console.log(`  - Skipped ${skippedSpecies.length} species for missing typing/moveset data: ${skippedSpecies.map((s) => `${s.pokemon_name} (${s.reason})`).join(", ") || "none"}`);
console.log(`  - Unresolved move names referenced by a species' moveset but absent from BOTH GAME_MASTER's moveSettings AND pogoapi's fast_moves/charged_moves.json (likely retired/legacy/Dynamax-only moves, filtered out silently per-species): ${[...unresolvedMoveNames].join(", ") || "none"}`);
console.log(
  `  - Phase 0 of PLAN_multi_raid_roster_optimizer.md (evolution/candy-family/dex-number data, this run): isFullyEvolved set on ${fullyEvolvedCount + notFullyEvolvedCount}/${species.length} species (${fullyEvolvedCount} fully evolved, ${notFullyEvolvedCount} not); evolvesToIds is non-empty on ${evolvesToIdsPopulatedCount} of those ${notFullyEvolvedCount} not-fully-evolved species; candyFamilyId set on ${candyFamilyIdCount}/${species.length}; dexNumber set on ${dexNumberCount}/${species.length}. All four are set only via the primary and "mechanically-distinct extra forms" species-build loops (not mega/primal or Shadow — no real evolution branch ever targets one of those, and Shadow variants instead inherit all four fields unchanged from their base species via getOrCreateShadowVariant's spread, including a base-species-id evolvesToIds that intentionally does NOT repoint to the Shadow sibling); a species that fell all the way back to pogoapi-sourced data (see the fallback line above) gets dexNumber only, since the other three need GAME_MASTER's own evolutionBranch/familyId. ${unresolvedEvolutionBranches.length === 0 ? "Every real evolution branch resolved to a registered species id this run (Phase 0's own groundwork measured 859 distinct real evolution edges, all resolving at the enum level)." : `${unresolvedEvolutionBranches.length} evolution branch(es) could NOT be resolved to a registered species id this run (reported, not silently dropped — isFullyEvolved stays correctly false for the source species regardless, since it's computed independently of resolution success): ${unresolvedEvolutionBranches.join("; ")}`} ${isFullyEvolvedRealEvolutionTargetsInconsistencies.length === 0 ? "No isFullyEvolved/realEvolutionTargets inconsistencies this run (see gameMasterMatching.ts's realEvolutionTargets doc comment for what this would mean)." : `${isFullyEvolvedRealEvolutionTargetsInconsistencies.length} species have isFullyEvolved: false (a SIBLING GAME_MASTER template for their enum carries a real branch) but their OWN matched template carries none — evolvesToIds is [] for these, isFullyEvolved deliberately NOT overridden to true (see isFullyEvolvedRealEvolutionTargetsInconsistencies's doc comment in this file): ${isFullyEvolvedRealEvolutionTargetsInconsistencies.join(", ")}`}`,
);
console.log(
  `  - kmBuddyDistance (2026-09-10, MECHANICS.md "Second charged move unlock" tiering key): set on ${kmBuddyDistanceCount}/${species.length} species, missing on ${kmBuddyDistanceMissingCount} (same "no matched GAME_MASTER template" population as candyFamilyId's own gap above). Distribution: ${
    [...kmBuddyDistanceDistribution.entries()]
      .sort(([a], [b]) => a - b)
      .map(([km, count]) => `${km}km: ${count}`)
      .join(", ") || "none"
  }. Per-species (pokemonId-enum), NOT per-candy-family — see GameMasterPokemonRecord.kmBuddyDistance's doc comment in ./sync-data/rawShapes.ts for the 4 confirmed within-family disagreements (Qwilfish/Sneasel/Stantler/Zigzagoon lines, each a regional-evolution split).`,
);
console.log(`  - Raid entries with no usable stat data (speciesId: null): ${raidsWithNullSpecies} of ${activeRaids.length}`);
console.log(`  - Raid entries matched approximately (base/Normal-form stats standing in for a regional/mega variant this project lacks real per-form stat data for): ${raidsApproximate}`);
if (raidHistorySelfHealed.length > 0) {
  console.log(
    `  - VALIDATION: self-healed ${raidHistorySelfHealed.length} raidHistory.json row(s) found in the impossible "pokebattler-legacy" + eraHp state (artifact of an earlier, already-fixed bug in this same 2026-09-08 task, never shipped) — dropped and re-derived fresh this run via the normal precedence steps: ${raidHistorySelfHealed.join(", ")}.`,
  );
}
console.log(`  - raidHistory.json (append-only "ever a boss" record, never deletes): ${raidHistory.length} total entries (${raidHistoryLiveFeedCount} live-feed, ${raidHistoryResearchedCount} researched-tier, ${raidHistoryPogoapiPreviousCount} pogoapi-previous, ${raidHistoryBulbapediaArchiveCount} bulbapedia-archive, ${raidHistoryPokebattlerLegacyCount} pokebattler-legacy); newly added this run: ${raidHistoryNewlyAdded.length > 0 ? raidHistoryNewlyAdded.join(", ") : "none"}.`);
console.log(
  `  - raidHistory.json pogoapi-previous backfill (2026-09-07 task, source: pogoapi.net/api/v1/raid_bosses.json "previous" list): ${raidBossesPreviousFetchFailed ? `fetch FAILED (${raidBossesPreviousFetchResult.error}) — added 0 pogoapi-previous entries this run.` : `fetch succeeded, data/raw/raid_bosses.json cached. ${pogoapiPreviousGroups.size} distinct species+form(+tier-bucket) groups after collapsing 696 raw entries to their highest tier; excluded outright: ${raidBossesPreviousExcludedExCount} "ex" entry (Regidrago — no modern tier equivalent, would be fabricated) and ${raidBossesPreviousExcludedTier6Count} "6"-tier entries (Darkrai, Mewtwo — undocumented tier, but both are exact-CP duplicates of their own "5"-tier entry for the same species+form, so excluding them costs zero real coverage). Resolved ${pogoapiResolvedBySpeciesId.size} distinct species id(s). Unresolved (${raidHistoryPogoapiPreviousUnresolved.length} — all real historical bosses in a form outside this pipeline's documented one-form-per-species scope: regional variants Alola/Galarian/Hisuian, non-default Unown letters, etc.): ${raidHistoryPogoapiPreviousUnresolved.length > 0 ? raidHistoryPogoapiPreviousUnresolved.join(", ") : "none"}.`}`,
);
console.log(
  `  - raidHistory.json Bulbapedia archive backfill (2026-09-07 task, source: 16 "List of Raid Boss changes in ..." pages, see BULBAPEDIA_RAID_ARCHIVE_PAGES in ./sync-data/fetchCache.ts): ${bulbapediaRaidArchiveFetchFailed ? `fetch FAILED (${bulbapediaRaidArchiveFetchResult.error}) — added 0 bulbapedia-archive entries this run.` : `${Object.keys(bulbapediaRaidArchiveFetchResult.pages).length}/16 pages fetched (${bulbapediaRaidArchiveFetchResult.failedPages.length > 0 ? `FAILED: ${bulbapediaRaidArchiveFetchResult.failedPages.join(", ")}` : "none failed"}), cached to data/raw/bulbapedia_raid_history.json. ${bulbapediaRawRows.length} raw rows parsed, resolved to ${bulbapediaResolvedBySpeciesId.size} distinct species id(s) (${bulbapediaViaBaseNameFallbackCount} via the base-name/costume fallback — see resolveBulbapediaRow's doc comment in ./sync-data/bulbapediaRaidArchive.ts). Unresolved, distinct name/form pairs (${bulbapediaUnresolvedDistinct.length} — all real alternate forms (regional Alolan/Galarian/Hisuian, Origin/Therian/Attack/Defense/Speed Forme, Armored Mewtwo, Shellos East Sea, Burmy Sandy/Trash Cloak) outside this pipeline's one-form-per-species scope, plus one accepted marginal miss (Furfrou "Natural Form" — contains the word "form" so is conservatively treated as a possible real alt form rather than guessed into the roster's "(Dandy)" entry)): ${bulbapediaUnresolvedDistinct.join(", ")}.`}`,
);
console.log(
  `  - raidHistory.json pogoapi-vs-Bulbapedia archive union (2026-09-07 task): ${archiveUnionConflicts.length} same-species tier conflict(s) between the two independent archive sources${archiveUnionConflicts.length > 0 ? ` — ${archiveUnionConflicts.map((c) => `${c.speciesId}: pogoapi "${c.pogoapiTier}" vs Bulbapedia "${c.bulbapediaTier}" (winner: ${c.winner})`).join("; ")}` : ""}. This run: ${raidHistoryArchiveNewlyAddedCount} new archive-sourced entries, ${raidHistoryArchiveUpgradedCount} existing archive entries upgraded to a higher tier${raidHistoryArchiveUpgradedCount > 0 ? ` (${raidHistoryArchiveUpgraded.join(", ")})` : ""}.`,
);
console.log(
  `  - raidHistory.json era-HP backfill (2026-09-07 task, RaidHistoryEntry.eraHp — see its doc comment in ./sync-data/rawShapes.ts): ${raidHistoryWithEraHp.length}/${raidHistory.length} total entries carry a real era HP, by source: ${raidHistoryEraHpBySource["live-feed"]} live-feed, ${raidHistoryEraHpBySource["researched-tier"]} researched-tier, ${raidHistoryEraHpBySource["pogoapi-previous"]} pogoapi-previous, ${raidHistoryEraHpBySource["bulbapedia-archive"]} bulbapedia-archive, ${raidHistoryEraHpBySource["pokebattler-legacy"]} pokebattler-legacy (always 0 by construction — a pokebattler-legacy row is never allowed to carry an eraHp, see the "Pokebattler legacy archive backfill" section's doc comment). Value distribution: ${JSON.stringify(raidHistoryEraHpDistribution)}. This run backfilled eraHp onto ${raidHistoryEraHpBackfilledCount} existing entry(ies) whose tier didn't change. Bulbapedia rows whose positional HP field didn't match a plausible raid-HP magnitude (never stored, per this task's "never fabricate/launder an HP" rule) — ${bulbapediaInvalidHpSamplesDistinct.length} distinct: ${bulbapediaInvalidHpSamplesDistinct.length > 0 ? bulbapediaInvalidHpSamplesDistinct.join("; ") : "none"}.`,
);
console.log(
  `  - raidHistory.json Pokebattler legacy archive backfill (2026-09-08 task, source: fight.pokebattler.com's "_LEGACY" raid tiers, data/raw/pokebattler_raids.json): ${
    pokebattlerFetchResult.source !== "live"
      ? `fetch FAILED (${pokebattlerFetchResult.error}) — added 0 pokebattler-legacy entries this run.`
      : `${pokebattlerLegacyTotalConsidered} raw entries considered across ${Object.keys(POKEBATTLER_LEGACY_NUMERIC_TIER_MAP).length + POKEBATTLER_LEGACY_MEGA_TIERS.size} in-scope legacy tiers; excluded outright (see this section's doc comment for why): ${Object.entries(pokebattlerLegacyExcludedTierCounts).map(([t, n]) => `${n} in ${t}`).join(", ") || "none"}. Resolved ${pokebattlerLegacyResolvedRawCount}/${pokebattlerLegacyTotalConsidered} raw entries (${(100 * pokebattlerLegacyResolvedRawCount / Math.max(pokebattlerLegacyTotalConsidered, 1)).toFixed(1)}%) to ${pokebattlerLegacyResolvedBySpeciesId.size} distinct species id(s). Unresolved (${pokebattlerLegacyUnresolvedDistinct.length} distinct raw id[tier] pairs — expected to be real alternate forms outside this pipeline's one-form-per-species scope, same family as the pogoapi-previous/Bulbapedia unresolved lists above): ${pokebattlerLegacyUnresolvedDistinct.length > 0 ? pokebattlerLegacyUnresolvedDistinct.join(", ") : "none"}. This run: ${raidHistoryPokebattlerLegacyNewlyAddedCount} new pokebattler-legacy entries, ${raidHistoryPokebattlerLegacyUpgradedCount} existing archive entries upgraded to a higher tier${raidHistoryPokebattlerLegacyUpgradedCount > 0 ? ` (${raidHistoryPokebattlerLegacyUpgraded.join(", ")})` : ""}, ${raidHistoryPokebattlerLegacySkippedEraHpCount} tier-upgrade candidate(s) deliberately LEFT UNTOUCHED because the existing row already carries a real eraHp (relabeling to "pokebattler-legacy" — a source with no era fidelity — would either strip that eraHp or misattribute it; this task's two non-negotiables can only both hold by leaving these alone entirely)${raidHistoryPokebattlerLegacySkippedEraHpCount > 0 ? `: ${raidHistoryPokebattlerLegacySkippedEraHp.join(", ")}` : ""}.`
  }`,
);
if (pokebattlerFetchResult.source === "live") {
  console.log(
    `  - Pokebattler legacy tiers EXCLUDED rather than mapped, per this task's "never fabricate a tier" rule: RAID_LEVEL_2_LEGACY (${pokebattlerLegacyExcludedTierCounts["RAID_LEVEL_2_LEGACY"] ?? 0} entries) and RAID_LEVEL_4_LEGACY (${pokebattlerLegacyExcludedTierCounts["RAID_LEVEL_4_LEGACY"] ?? 0}) — confirmed Pokebattler re-maps these onto MODERN content (RAID_LEVEL_4_LEGACY holds Community-Day-style four-star bosses, not the real pre-2020 tier 4 pogoapi's own "4"->"3-Star" merge already covers), so folding them in would fabricate history rather than record it. RAID_LEVEL_6_LEGACY/RAID_LEVEL_4_5_LEGACY (0 each, confirmed always-empty) excluded on principle regardless. RAID_LEVEL_ELITE_LEGACY (${pokebattlerLegacyExcludedTierCounts["RAID_LEVEL_ELITE_LEGACY"] ?? 0}): Bulbapedia's own difficulty table puts Elite Raids at 20000 HP, which has no equivalent anywhere in this project's RaidTier union — excluded, no honest mapping exists. RAID_LEVEL_ULTRA_BEAST_LEGACY (${pokebattlerLegacyExcludedTierCounts["RAID_LEVEL_ULTRA_BEAST_LEGACY"] ?? 0}): its real HP (15000) numerically matches "5-Star Raids"/"Legendary Mega Raids", but Ultra Wormhole encounters were a Special-Research-gated event format, not standard raid-egg rotation content — an HP coincidence alone isn't independent confirmation the two are the same content type this project's RaidTier union exists to classify, so this one also stays excluded (judgement call, not a blind default) rather than mapped on a numeric coincidence.`,
  );
}
console.log(`  - GAME_MASTER gap-fill for mega/primal stats beyond pogoapi.net's 48-entry mega_pokemon.json list, from two independent gates (a currently-live raid naming one, OR a hand-curated RELEASED_MEGA_PRIMAL_ALLOWLIST entry for a real-but-not-currently-raiding mega — see PokeMiners' GAME_MASTER mirror doc comment in scripts/sync-data/fetchCache.ts and RELEASED_MEGA_PRIMAL_ALLOWLIST's doc comment in ./sync-data/releasedMegaPrimalAllowlist.ts): ${megaOrPrimalGapCandidates.length === 0 ? "not needed this run (no active Mega/Primal raid outside pogoapi's 48-entry list, and no allowlist entry currently needed)" : `${megaOrPrimalGapCandidates.length} gap(s) found (${megaOrPrimalGapCandidates.map((c) => `${c.name} [${c.source}]`).join(", ")}); resolved via GAME_MASTER: ${gameMasterDerivedMega.length > 0 ? gameMasterDerivedMega.map((m) => m.mega_name).join(", ") : "none"}${gameMasterUnresolvedGaps.length > 0 ? `; UNRESOLVED (no fallback data exists for these — pogoapi's mega_pokemon.json doesn't cover them at all, so they're simply absent from species.json this run): ${gameMasterUnresolvedGaps.join("; ")}` : ""}`}`);
console.log(`  - RELEASED_MEGA_PRIMAL_ALLOWLIST mechanism (hand-curated, see its own doc comment in ./sync-data/releasedMegaPrimalAllowlist.ts): exists to catch a real, released mega/primal that's neither in pogoapi's mega_pokemon.json roster nor in the current raid rotation (e.g. a mega whose debut was a single past raid-day event) — currently lists ${RELEASED_MEGA_PRIMAL_ALLOWLIST.length} entry(ies): ${RELEASED_MEGA_PRIMAL_ALLOWLIST.map((e) => e.name).join(", ")}. ${megaOrPrimalAllowlistGaps.length === 0 ? "None of these were needed via this specific gate this run (already covered by pogoapi's roster or the live raid feed instead)." : `${megaOrPrimalAllowlistGaps.length} of them were resolved via this gate this run: ${megaOrPrimalAllowlistGaps.join(", ")}.`}`);
console.log(
  `  - lastKnownRaidTier backfill (2026-09-07 research pass, see RELEASED_MEGA_PRIMAL_ALLOWLIST's per-entry citations): ${RELEASED_MEGA_PRIMAL_ALLOWLIST.filter((e) => e.lastKnownRaidTier !== undefined).map((e) => `${e.name} -> "${e.lastKnownRaidTier}"`).join(", ") || "none"}. Left unset after genuine research effort (falls through to the rarity/boost heuristic instead of a guess): ${RELEASED_MEGA_PRIMAL_ALLOWLIST.filter((e) => e.lastKnownRaidTier === undefined).map((e) => e.name).join(", ") || "none"}.`,
);
console.log(
  `  - lastKnownRaidTier carried forward from the previous species.json (precedence step 3 — this run set neither a fresh live-raid observation nor an allowlist tier for these, see the doc comment above the carry-forward step in this file): ${lastKnownRaidTierCarriedForward.length === 0 ? "none" : lastKnownRaidTierCarriedForward.map((c) => `${c.id} -> "${c.tier}"`).join(", ")}.`,
);
if (gameMasterCrossChecks.length > 0) {
  console.log(`  - GAME_MASTER cross-check against independent community sources: ${gameMasterCrossChecks.join("; ")}`);
}
console.log(`  - Shadow raid entries (${shadowSpecies.length} distinct species synthesized total): each gets its own SpeciesDefinition (id "<base>-shadow") with isShadow: true and unmultiplied base stats copied from the real base species; the engine's shadowAdjustedBaseStats (packages/engine/src/shadow.ts) applies SHADOW_ATTACK_MULTIPLIER (1.2)/SHADOW_DEFENSE_MULTIPLIER (0.83) at effective-stat time. A Shadow-matched raid is a real, not approximate, match against its own species (previously flagged isApproximate: true against the unboosted base species).`);
console.log(
  `  - SHADOW-VARIANT DURABILITY (2026-09-08 fix — see the "Shadow-variant durable synthesis" section in this file): ${shadowSeedDurableCount} of the ${shadowSpecies.length} total were synthesized DURABLY (i.e. would survive this species also dropping out of the live raid feed), from evidence gated on: ${shadowSeedBaseIdsFromHistory.size} already-recorded shadow row(s) in raidHistory.json, ${shadowSeedBaseIdsFromPokebattler.size} distinct species from Pokebattler's RAID_LEVEL_{1,3,5}_SHADOW_LEGACY tiers (${pokebattlerFetchResult.source === "live" ? "fetched live" : "fetch FAILED this run, 0 contributed"}), ${shadowSeedBaseIdsFromBulbapedia.size} distinct species from Bulbapedia's "List of Shadow Raid Boss changes" page (${bulbapediaShadowRaidArchiveFetchResult.wikitext ? "fetched live, thin corroboration" : `fetch FAILED this run (${bulbapediaShadowRaidArchiveFetchResult.error}), 0 contributed`}). ${shadowSpecies.length - shadowSeedDurableCount} additional species were synthesized ONLY from this run's own live raid feed (not yet durable — will be durable from the NEXT run onward once this run's raidHistory.json write lands, per evidence source 1 above; relies on Map's insertion-order iteration to slice these off the end of shadowSpeciesByBaseId, since the pre-seed loop above runs to completion before the activeRaids loop can append any more): ${shadowSpecies.slice(shadowSeedDurableCount).map((s) => s.name).join(", ") || "none"}. Unresolved (reported, never fabricated): ${shadowSeedUnresolvedBaseIds.length} stale raidHistory.json base id(s) (${shadowSeedUnresolvedBaseIds.join(", ") || "none"}), ${shadowSeedPokebattlerUnresolved.length} Pokebattler shadow-legacy raw id(s) (${shadowSeedPokebattlerUnresolved.join(", ") || "none"}), ${shadowSeedBulbapediaUnresolved.length} Bulbapedia shadow-page name(s) (${shadowSeedBulbapediaUnresolved.join(", ") || "none"}).`,
);
console.log(`  - Speculative/hypothetical species in use for raid matching: none. This project's 4 hand-authored hypothetical fixtures (Mega Raichu X/Y, Primal Kyogre, Mega Skarmory) were deleted from the engine's product-reachable exports entirely (CLAUDE.md "Standing decisions", 2026-09-06); this sync no longer imports or matches against them. Note separately: GAME_MASTER can in general carry real, well-formed tempEvoOverrides blocks for mega forms Niantic hasn't released YET (a known datamining phenomenon) — this pipeline never surfaces those on their own, since every mega/primal species it builds is still gated against pogoapi's mega_pokemon.json roster, a currently-live ScrapedDuck raid, or the hand-curated RELEASED_MEGA_PRIMAL_ALLOWLIST, never GAME_MASTER's tempEvoOverrides alone. (Falinks/Malamar/Chesnaught/Delphox/Greninja were flagged here as examples of this in an earlier sync's WARNINGS — all 5 have since genuinely shipped and moved to RELEASED_MEGA_PRIMAL_ALLOWLIST this run, see that constant's doc comment for citations; no other specific example is currently known.)`);
console.log(`  - mega_pokemon.json entries are REAL data (not flagged speculative) but model an ATTACKER (standard level/IV/CPM pipeline), not a raid boss — the real Primal Kyogre entry now normalizes to id "${reservedSpeciesIds.has("kyogre-primal-attacker") ? "kyogre-primal-attacker" : "kyogre-primal"}" (previously forced to "-attacker" to avoid colliding with a hand-tuned boss-mode fixture of the same id that has since been deleted from product data — see above).`);
console.log(`  - Mega/primal species id collisions resolved by appending "-attacker": ${megaIdCollisions.length > 0 ? megaIdCollisions.map((c) => `${c.megaName} (${c.wouldBeId} -> ${c.usedId})`).join(", ") : "none"}`);
console.log(`  - mega_pokemon.json/GAME_MASTER's tempEvoOverrides have no per-species boosted-type data, so each of the ${megaSpecies.length} mega/primal entries gets boost = { multiplier: DEFAULT_MEGA_BOOST_MULTIPLIER (1.3), boostedType: <its primary listed type> } — comparison.ts only applies a mega boost when \`species.boost\` is explicitly set (its fallback is 1, not 1.3), so this was required, not cosmetic.`);
const megaSpeciesWithoutImage = megaSpecies.filter((m) => !m.imageUrl).map((m) => m.name);
console.log(`  - Mega/primal species image lookups (PokeAPI, cached to data/raw/mega_sprite_urls.json): ${megaSpecies.length - megaSpeciesWithoutImage.length}/${megaSpecies.length} resolved${megaSpeciesWithoutImage.length > 0 ? `; no image found for: ${megaSpeciesWithoutImage.join(", ")}` : ""}. All Normal-form-or-fallback-form species get a dex-id sprite URL with no extra request.`);
console.log(
  `  - Super Max "+" charged moves (hand-curated, see SUPER_MAX_PLUS_MOVES's own per-entry citations in ./sync-data/superMaxPlusMoves.ts): ${SUPER_MAX_PLUS_MOVES.length} table entries. Attached this run: ${superMaxPlusMoveResult.attached.length > 0 ? superMaxPlusMoveResult.attached.join(", ") : "none"}. Skipped — species not yet synced (expected for Mega Staraptor until its 2026-09-19 debut, not a failure): ${superMaxPlusMoveResult.skippedUnknownSpecies.length > 0 ? superMaxPlusMoveResult.skippedUnknownSpecies.join(", ") : "none"}. Skipped — base move missing from this run's GAME_MASTER moveSettings table (unexpected, investigate if non-empty): ${superMaxPlusMoveResult.skippedMissingBaseMove.length > 0 ? superMaxPlusMoveResult.skippedMissingBaseMove.join(", ") : "none"}.`,
);
if (pokebattlerFetchResult.source === "live") {
  const disagreementCount = pokebattlerCrossCheckOnlyInScrapedDuck.length + pokebattlerCrossCheckOnlyInPokebattler.length;
  console.log(
    `  - POKEBATTLER LIVE CROSS-CHECK (2026-09-07, live-only — see ./sync-data/pokebattlerRaids.ts's provenance-caveat doc comment; ScrapedDuck remains the sole source for activeRaids.json regardless of this comparison's outcome): fetched ${pokebattlerFetchResult.tiers.length} tiers, data/raw/pokebattler_raids.json cached. Current-rotation entries (isCurrentRotationTier — excludes _LEGACY/_FUTURE/_MAX/RAID_LEVEL_UNSET, AND RAID_LEVEL_MEGA/RAID_LEVEL_4_MEGA_ENHANCED as of 2026-09-08 — see POKEBATTLER_MEGA_POOL_TIERS's doc comment: those two are a rotation POOL, not a live list, confirmed via Mega Skarmory/Raichu X/Y still appearing there after their real rotations ended): ${pokebattlerCrossCheckEntries.length} resolved to a display name${pokebattlerCrossCheckUnresolved.length > 0 ? ` (${pokebattlerCrossCheckUnresolved.length} UNRESOLVED, likely a form this project's naming can't reconstruct: ${pokebattlerCrossCheckUnresolved.join(", ")})` : ""} vs. ScrapedDuck's ${scrapedDuckCrossCheckEntries.length} current NON-Mega/Primal entries (Mega/Primal excluded from BOTH sides — see isMegaOrPrimalRaidTier's doc comment — and reported as a separate ADVISORY line below, never folded into this disagreement count). MATCHED: ${pokebattlerCrossCheckMatched.length} (${pokebattlerCrossCheckMatched.map((e) => `${e.rawName} [${e.tier}]`).join(", ") || "none"}).${
      disagreementCount > 0
        ? ` *** DISAGREEMENT (${disagreementCount}) ***  Only in ScrapedDuck (${pokebattlerCrossCheckOnlyInScrapedDuck.length}): ${pokebattlerCrossCheckOnlyInScrapedDuck.map((e) => `${e.rawName} [${e.tier}]`).join(", ") || "none"}. Only in Pokebattler (${pokebattlerCrossCheckOnlyInPokebattler.length}): ${pokebattlerCrossCheckOnlyInPokebattler.map((e) => `${e.rawName} [${e.tier}]`).join(", ") || "none"}. This is exactly the signal this cross-check exists to surface, not a bug to silently fix — see the provenance-caveat doc comment for why two never-mutually-disclosed feeds are expected to drift.`
        : ` No disagreement this run — both feeds agree exactly on the current (non-Mega/Primal) roster.`
    }`,
  );
  console.log(
    `  - POKEBATTLER CROSS-CHECK ADVISORY (Mega/Primal, excluded from the disagreement count above — see isMegaOrPrimalRaidTier's doc comment): ${scrapedDuckMegaOrPrimalExcludedFromCrossCheck.length} ScrapedDuck Mega/Primal raid(s) this run, NOT cross-checked against Pokebattler at all (its RAID_LEVEL_MEGA/RAID_LEVEL_4_MEGA_ENHANCED tiers are a rotation pool, not reliably "currently live" — see POKEBATTLER_MEGA_POOL_TIERS): ${scrapedDuckMegaOrPrimalExcludedFromCrossCheck.join(", ") || "none"}.`,
  );
} else {
  console.log(
    `  - POKEBATTLER LIVE CROSS-CHECK: fetch FAILED this run (${pokebattlerFetchResult.error}) — cross-check skipped, zero effect on activeRaids.json (ScrapedDuck-sourced regardless).`,
  );
}
if (validationErrors.length > 0) {
  console.log(`  - VALIDATION ERRORS: ${validationErrors.join("; ")}`);
}
