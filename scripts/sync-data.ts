/**
 * Data-sync script: pulls pogoapi.net species/move data (already cached under
 * data/raw/ by the surrounding fetch step) plus the community-maintained
 * ScrapedDuck active-raids feed, and writes normalized output the engine (and
 * eventually the web UI) can consume without ever touching the network at
 * runtime.
 *
 * This script does NOT re-derive the GameMaster transform — it imports and
 * calls `fromGameMaster` / `fromGameMasterMove` from `@pogo-analyzer/engine`
 * directly, so there is exactly one place (the engine) that knows how a raw
 * pogoapi record becomes a SpeciesDefinition. See CLAUDE.md's "single code
 * path" philosophy and packages/engine/src/gamemaster.ts.
 *
 * As of a 2026-09-06 code-simplifier-prompted reorg, this file is the
 * orchestrator only — the fetch/cache functions, raw pogoapi/GAME_MASTER
 * shapes, mega/primal name-parsing helpers, Shadow-variant synthesis, and
 * prev-vs-next diffing each moved to their own module under
 * scripts/sync-data/ (see the imports below). What's left here is the
 * sequential, heavily-stateful pipeline itself: loading raw data, building
 * the normalized species list (and its mega/primal/Shadow-variant
 * extensions), matching active raids against it, validating, writing output,
 * and reporting — all of which share enough local state (maps built once and
 * read by several later steps) that splitting it further would trade real
 * cohesion for indirection, not reduce it.
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
 * data/raw/_meta.json fetch timestamps) — this script only reads and
 * normalizes them. `mega_pokemon.json` and the ScrapedDuck active-raids feed
 * (`raids.json`) are the two exceptions: this script fetches and re-caches
 * BOTH live on every run (see fetchAndCacheMegaPokemon / fetchAndCacheRaids
 * in scripts/sync-data/fetchCache.ts), since raid rotations change intraday
 * and a stale cached raids.json silently produces a stale activeRaids.json
 * otherwise (confirmed live, 2026-09-06 — see WARNINGS for the fallback-file
 * behavior if the feed ever goes dark or changes shape). mega_pokemon.json
 * models a mega/primal Pokémon as a real trainer-owned ATTACKER (run through
 * the standard level/IV/CPM pipeline) — not as a raid boss (see
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
  type PokemonType,
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
  RawPokemonRarityResponse,
  PokemonRarity,
  ActiveRaidEntry,
} from "./sync-data/rawShapes.ts";
import {
  fetchAndCacheMegaPokemon,
  fetchAndCacheRaids,
  fetchAndCachePokemonRarity,
  fetchGameMasterMegaOverrides,
  fetchMegaSpriteUrls,
  raidFallbackPathFor,
  type GameMasterFetchResult,
} from "./sync-data/fetchCache.ts";
import { toPokemonType, toRawGameMasterMove, spriteUrlForDexId, toPokemonRarity } from "./sync-data/adapters.ts";
import {
  megaSpeciesIdFor,
  parseMegaOrPrimalRaidName,
  gameMasterEnumFor,
  tempEvoIdFor,
} from "./sync-data/megaPrimalParsing.ts";
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

let rawPokemonRarityResponse: RawPokemonRarityResponse | null = null;
let pokemonRarityFetchError: string | null = null;
try {
  rawPokemonRarityResponse = await fetchAndCachePokemonRarity(RAW_DIR);
} catch (err) {
  pokemonRarityFetchError = err instanceof Error ? err.message : String(err);
}

/**
 * pokemon_id -> normalized rarity, flattened from pogoapi's own
 * category-keyed response shape (see RawPokemonRarityResponse's doc comment).
 * Confirmed 2026-09-06 (direct inspection of a full live fetch): a given
 * pokemon_id NEVER disagrees on rarity across its own listed forms (e.g.
 * Galarian Articuno and Normal-form Articuno are both "Legendary") — so this
 * intentionally keys on pokemon_id alone, ignoring `form` entirely, rather
 * than needing to match the exact per-species form this pass normalizes (see
 * defaultFormByPokemonId below) the way typesByPokemonId/movesByPokemonId do.
 * Any species pokemon_stats.json lists that pokemon_rarity.json doesn't
 * (none found in the same 2026-09-06 check — full 1024/1024 coverage) falls
 * back to "STANDARD", the least-surprising default per pogo-researcher's
 * proposal (most species really are Standard-tier).
 */
const rarityByPokemonId = new Map<number, PokemonRarity>();
const rarityParseFailures: string[] = [];
if (rawPokemonRarityResponse) {
  for (const category of Object.values(rawPokemonRarityResponse)) {
    for (const entry of category) {
      if (rarityByPokemonId.has(entry.pokemon_id)) continue; // already set from another form; forms agree, confirmed above
      try {
        rarityByPokemonId.set(entry.pokemon_id, toPokemonRarity(entry.rarity));
      } catch (err) {
        rarityParseFailures.push(err instanceof Error ? err.message : String(err));
      }
    }
  }
}
function rarityFor(pokemonId: number): PokemonRarity {
  return rarityByPokemonId.get(pokemonId) ?? "STANDARD";
}
const pokemonIdsMissingFromRarityData = new Set<number>();

const rawStats = readJson<RawPokemonStatsEntry[]>("pokemon_stats.json");
const rawTypes = readJson<RawPokemonTypesEntry[]>("pokemon_types.json");
const rawFastMoves = readJson<RawMoveEntry[]>("fast_moves.json");
const rawChargedMoves = readJson<RawMoveEntry[]>("charged_moves.json");
const rawCurrentMoves = readJson<RawCurrentMovesEntry[]>("current_pokemon_moves.json");

const fastMoveByName = new Map<string, FastMove>();
for (const m of rawFastMoves) {
  fastMoveByName.set(m.name, fromGameMasterMove(toRawGameMasterMove(m)));
}

const chargedMoveByName = new Map<string, ChargedMove>();
for (const m of rawChargedMoves) {
  chargedMoveByName.set(m.name, fromGameMasterMove(toRawGameMasterMove(m)));
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
 * from pokemon_stats.json (the species list's source of truth) and then
 * reused to select the matching row out of pokemon_types.json and
 * current_pokemon_moves.json too, so all three stay keyed to the same form
 * per species rather than each independently guessing "Normal".
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

// ---------------------------------------------------------------------------
// Build normalized species list (one form per species — "Normal", or the
// documented fallback above)
// ---------------------------------------------------------------------------

const normalStats = rawStats.filter((s) => s.form === defaultFormByPokemonId.get(s.pokemon_id));

const species: SpeciesDefinition[] = [];
const skippedSpecies: { pokemon_id: number; pokemon_name: string; reason: string }[] = [];
const unresolvedMoveNames = new Set<string>();

for (const stat of normalStats) {
  const typesEntry = typesByPokemonId.get(stat.pokemon_id);
  const movesEntry = movesByPokemonId.get(stat.pokemon_id);

  if (!typesEntry) {
    skippedSpecies.push({ pokemon_id: stat.pokemon_id, pokemon_name: stat.pokemon_name, reason: "no typing data" });
    continue;
  }
  if (!movesEntry) {
    skippedSpecies.push({ pokemon_id: stat.pokemon_id, pokemon_name: stat.pokemon_name, reason: "no moveset data" });
    continue;
  }

  const fastNames = [...movesEntry.fast_moves, ...movesEntry.elite_fast_moves];
  const chargedNames = [...movesEntry.charged_moves, ...movesEntry.elite_charged_moves];

  const resolvedFast: FastMove[] = [];
  for (const name of fastNames) {
    const move = fastMoveByName.get(name);
    if (move) resolvedFast.push(move);
    else unresolvedMoveNames.add(`fast:${name}`);
  }

  const resolvedCharged: ChargedMove[] = [];
  for (const name of chargedNames) {
    const move = chargedMoveByName.get(name);
    if (move) resolvedCharged.push(move);
    else unresolvedMoveNames.add(`charged:${name}`);
  }

  if (resolvedFast.length === 0 || resolvedCharged.length === 0) {
    skippedSpecies.push({
      pokemon_id: stat.pokemon_id,
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

  const typesArr = typesEntry.type.map(toPokemonType);
  if (typesArr.length === 0) {
    skippedSpecies.push({ pokemon_id: stat.pokemon_id, pokemon_name: stat.pokemon_name, reason: "empty typing array" });
    continue;
  }
  const [primaryType, secondaryType] = typesArr;
  const pokemonTypes: [PokemonType] | [PokemonType, PokemonType] =
    secondaryType !== undefined ? [primaryType as PokemonType, secondaryType] : [primaryType as PokemonType];

  const definition = fromGameMaster(
    {
      pokemon_id: stat.pokemon_id,
      pokemon_name: stat.pokemon_name,
      form: stat.form,
      base_attack: stat.base_attack,
      base_defense: stat.base_defense,
      base_stamina: stat.base_stamina,
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
  // `rarity` is NOT yet a field @pogo-analyzer/engine's SpeciesDefinition type
  // declares (see this file's `rarity`-related WARNINGS output for the
  // escalation to engine-developer) — attached via a local cast rather than
  // editing packages/engine/src/types.ts from this script, per this project's
  // "schema decisions belong to engine-developer" convention.
  if (!rarityByPokemonId.has(stat.pokemon_id)) pokemonIdsMissingFromRarityData.add(stat.pokemon_id);
  (definition as SpeciesDefinition & { rarity?: PokemonRarity }).rarity = rarityFor(stat.pokemon_id);

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
// mega_pokemon.json's 48 entries are REAL data (real mega/primal base stats
// for real Pokémon) — no speculative/hypothetical flag is set on them, unlike
// HYPOTHETICAL_FIXTURES above. They model a mega/primal Pokémon as a normal
// trainer-owned ATTACKER meant for the standard level/IV/CPM stat pipeline
// (fromGameMaster / effectiveStat), which is a fundamentally different thing
// from this project's raid-boss fixtures (see packages/engine/src/
// fixtures/scenarioA.ts's PRIMAL_KYOGRE, modeled via the separate
// iv=0/CPM=1.0 raidBoss.ts pipeline) — both may legitimately exist side by
// side, registered under different ids, and must never collide or overwrite
// each other.
//
// A mega form doesn't get its own separate learnset in the live game — it
// keeps its base (non-mega) form's real moves — so moves are resolved via the
// same movesByPokemonId map (keyed by base pokemon_id + "Normal" form) used
// for ordinary species above, not a mega-specific lookup.
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

// ---------------------------------------------------------------------------
// GAME_MASTER fallback: fill gaps where a CURRENTLY-LIVE raid names a
// mega/primal pogoapi.net's mega_pokemon.json doesn't cover. General
// mechanism (any future pogoapi gap gets checked here), not special-cased to
// any one species — see fetchGameMasterMegaOverrides's doc comment
// (scripts/sync-data/fetchCache.ts) for the reliability caveat this gating
// protects against.
// ---------------------------------------------------------------------------

const pokemonIdByName = new Map<string, number>();
for (const s of rawStats) {
  if (!pokemonIdByName.has(s.pokemon_name)) pokemonIdByName.set(s.pokemon_name, s.pokemon_id);
}

const pogoApiMegaNames = new Set(rawMegaPokemon.map((m) => m.mega_name.toLowerCase()));
const megaOrPrimalRaidGaps = rawRaids.filter(
  (r) => /^(Mega|Primal) /.test(r.name) && !pogoApiMegaNames.has(r.name.toLowerCase()),
);

const gameMasterDerivedMega: RawMegaPokemonEntry[] = [];
const gameMasterUnresolvedGaps: string[] = [];
const gameMasterCrossChecks: string[] = [];
let gameMasterFetchResult: GameMasterFetchResult | null = null;

if (megaOrPrimalRaidGaps.length > 0) {
  gameMasterFetchResult = await fetchGameMasterMegaOverrides(RAW_DIR);
  await new Promise((resolve) => setTimeout(resolve, 150)); // short delay between sequential live fetches, per project convention

  for (const raid of megaOrPrimalRaidGaps) {
    const parsed = parseMegaOrPrimalRaidName(raid.name);
    if (!parsed) {
      gameMasterUnresolvedGaps.push(`${raid.name} (couldn't parse a base species name out of the raid name)`);
      continue;
    }
    const pokemonId = pokemonIdByName.get(parsed.baseName);
    const pokemonName = pokemonIdByName.has(parsed.baseName) ? parsed.baseName : undefined;
    if (pokemonId === undefined || pokemonName === undefined) {
      gameMasterUnresolvedGaps.push(`${raid.name} (base species "${parsed.baseName}" not found in pokemon_stats.json)`);
      continue;
    }
    if (gameMasterFetchResult.source !== "live") {
      gameMasterUnresolvedGaps.push(`${raid.name} (GAME_MASTER fetch failed: ${gameMasterFetchResult.error})`);
      continue;
    }

    const enumName = gameMasterEnumFor(pokemonName);
    const wantedTempEvoId = tempEvoIdFor(parsed.prefix, parsed.suffix);
    const matches = gameMasterFetchResult.records.filter(
      (r) => r.pokemonId === enumName && r.tempEvoId === wantedTempEvoId,
    );
    if (matches.length === 0) {
      gameMasterUnresolvedGaps.push(`${raid.name} (no GAME_MASTER tempEvoOverrides entry for ${enumName}/${wantedTempEvoId})`);
      continue;
    }
    // GAME_MASTER lists the same base species under several template aliases
    // (e.g. a "_NORMAL" copy) that can each independently carry a
    // tempEvoOverrides block — verify they agree rather than silently
    // picking whichever one happened to be listed first.
    const distinctStatKeys = new Set(matches.map((r) => `${r.baseAttack}/${r.baseDefense}/${r.baseStamina}/${r.type1}/${r.type2}`));
    if (distinctStatKeys.size > 1) {
      gameMasterUnresolvedGaps.push(
        `${raid.name} (GAME_MASTER has ${distinctStatKeys.size} CONFLICTING tempEvoOverrides entries for ${enumName}/${wantedTempEvoId} — not applying any, needs manual review)`,
      );
      continue;
    }
    const record = matches[0];
    const megaName = parsed.suffix ? `${parsed.prefix} ${pokemonName} ${parsed.suffix}` : `${parsed.prefix} ${pokemonName}`;
    gameMasterDerivedMega.push({
      first_time_mega_energy_required: record.firstTimeMegaEnergyRequired ?? 0,
      form: parsed.suffix ?? "Normal",
      mega_energy_required: record.megaEnergyRequired ?? 0,
      mega_name: megaName,
      pokemon_id: pokemonId,
      pokemon_name: pokemonName,
      stats: { base_attack: record.baseAttack, base_defense: record.baseDefense, base_stamina: record.baseStamina },
      type: [record.type1, record.type2].filter((t): t is string => Boolean(t)),
    });

    // Task-specific sanity check (not special-cased logic, just reporting):
    // cross-check against two independent, hand-checked community sources
    // for Mega Skarmory specifically (Dittobase + Pokémon GO Hub DB, both
    // agreeing exactly, checked 2026-09-06) rather than trusting GAME_MASTER
    // blindly.
    if (pokemonName === "Skarmory" && parsed.prefix === "Mega" && !parsed.suffix) {
      const expected = { baseAttack: 273, baseDefense: 228, baseStamina: 163 };
      const isMatch =
        record.baseAttack === expected.baseAttack &&
        record.baseDefense === expected.baseDefense &&
        record.baseStamina === expected.baseStamina;
      gameMasterCrossChecks.push(
        `Mega Skarmory: GAME_MASTER gives atk ${record.baseAttack}/def ${record.baseDefense}/sta ${record.baseStamina} vs. community cross-check (Dittobase + Pokémon GO Hub DB, both agree exactly) atk ${expected.baseAttack}/def ${expected.baseDefense}/sta ${expected.baseStamina} -> ${isMatch ? "MATCH" : "MISMATCH — flagged, NOT applied blindly, needs manual review"}`,
      );
      if (!isMatch) {
        gameMasterDerivedMega.pop(); // don't apply a disputed stat block
        gameMasterUnresolvedGaps.push(`${raid.name} (GAME_MASTER value disagreed with community cross-check — see gameMasterCrossChecks)`);
      }
    }
  }
}

const rawMegaPokemonCombined: RawMegaPokemonEntry[] = [...rawMegaPokemon, ...gameMasterDerivedMega];

const reservedSpeciesIds = new Set<string>(species.map((s) => s.id));

const megaSpecies: SpeciesDefinition[] = [];
const megaIdCollisions: { megaName: string; wouldBeId: string; usedId: string }[] = [];

for (const m of rawMegaPokemonCombined) {
  const movesEntry = movesByPokemonId.get(m.pokemon_id);
  if (!movesEntry) {
    skippedSpecies.push({ pokemon_id: m.pokemon_id, pokemon_name: m.mega_name, reason: "no moveset data for base species" });
    continue;
  }

  const fastNames = [...movesEntry.fast_moves, ...movesEntry.elite_fast_moves];
  const chargedNames = [...movesEntry.charged_moves, ...movesEntry.elite_charged_moves];

  const resolvedFast: FastMove[] = [];
  for (const name of fastNames) {
    const move = fastMoveByName.get(name);
    if (move) resolvedFast.push(move);
    else unresolvedMoveNames.add(`fast:${name}`);
  }

  const resolvedCharged: ChargedMove[] = [];
  for (const name of chargedNames) {
    const move = chargedMoveByName.get(name);
    if (move) resolvedCharged.push(move);
    else unresolvedMoveNames.add(`charged:${name}`);
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
  // Every real mega/primal Pokémon gets the same-type mega-boost multiplier in
  // the live game. comparison.ts reads this per-species (`species.boost?.multiplier
  // ?? 1`, both for the candidate's own damage output and for team-boost math in
  // uptime.ts) — DEFAULT_MEGA_BOOST_MULTIPLIER is only a fallback *parameter*
  // default, never applied unless a caller omits the argument entirely, which
  // comparison.ts never does. Without this, every one of these 48 entries would
  // silently simulate as an unboosted Pokémon. mega_pokemon.json doesn't publish
  // a boosted-type per species, so (matching this project's existing convention
  // for dual-typed hypothetical megas, e.g. MEGA_RAICHU_X) the primary listed
  // type stands in for "the type this mega's boost applies to."
  definition.boost = { multiplier: DEFAULT_MEGA_BOOST_MULTIPLIER, boostedType: pokemonTypes[0] };
  reservedSpeciesIds.add(finalId);
  // Mega/primal rarity is keyed on the BASE species' pokemon_id, same as
  // moves/types above — pokemon_rarity.json classifies the species, not the
  // mega form specifically (and every real mega/primal is itself Standard-
  // or Legendary-rarity depending on its base species, which pokemon_id
  // captures fine). See the normal-species loop above for the same pattern.
  if (!rarityByPokemonId.has(m.pokemon_id)) pokemonIdsMissingFromRarityData.add(m.pokemon_id);
  (definition as SpeciesDefinition & { rarity?: PokemonRarity }).rarity = rarityFor(m.pokemon_id);

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

console.log(`SYNCED: pokemon_stats, pokemon_types, fast_moves, charged_moves, current_pokemon_moves, cp_multiplier, mega_pokemon, scrapedduck-raids, pokemon_rarity (${species.length} species [${species.length - megaSpecies.length - shadowSpecies.length} single-form (Normal, or fallback — see WARNINGS) + ${megaSpecies.length} mega/primal + ${shadowSpecies.length} Shadow variant (synthesized for Shadow raid matches, isShadow: true, real base stats untouched — see WARNINGS)], ${fastMoveByName.size + chargedMoveByName.size} moves)`);
console.log(`CHANGED (species.json): ${speciesDiffs.length > 0 ? speciesDiffs.join("; ") : "none"}`);
console.log(`CHANGED (activeRaids.json): ${raidDiffs.length > 0 ? raidDiffs.join("; ") : "none"}`);
console.log(`AFFECTS SCENARIOS: none (no saved scenarios reference normalized species yet; scenarioA.ts fixtures untouched)`);
console.log(`WARNINGS:`);
if (raidFetchResult.source === "scrapedduck") {
  console.log(`  - Active-raids source: live ScrapedDuck feed (${SCRAPEDDUCK_RAIDS_URL}), re-fetched and re-cached this run (data/raw/raids.json).`);
} else if (raidFetchResult.source === "fallback-file") {
  console.log(`  - VALIDATION: ScrapedDuck raids feed unreachable/malformed this run (${raidFetchResult.error}) — fell back to the project-owned override file at ${RAID_FALLBACK_PATH}. Active-raids data may be stale until the feed recovers or that file is updated by hand.`);
} else {
  console.log(`  - VALIDATION: ScrapedDuck raids feed unreachable/malformed this run (${raidFetchResult.error}), AND no project-owned override file existed yet — created an empty one at ${RAID_FALLBACK_PATH} (schema: { bosses: RawRaidEntry[] }). activeRaids.json is EMPTY this run until that file is populated by hand or the feed recovers.`);
}
if (pokemonRarityFetchError) {
  console.log(`  - VALIDATION: pokemon_rarity.json fetch failed (${pokemonRarityFetchError}) — every species' rarity field this run defaulted to "STANDARD" (least-surprising fallback, per pogo-researcher's proposal), NOT sourced from live data. Re-run once the endpoint recovers.`);
} else {
  console.log(`  - pokemon_rarity.json fetched live and re-cached this run (data/raw/pokemon_rarity.json). Confirmed 2026-09-06: pogoapi's response is an object keyed by rarity category ("Legendary"/"Mythic"/"Standard"/"Ultra beast"), flattened here by pokemon_id (form ignored — a given pokemon_id never disagrees on rarity across its own listed forms, confirmed by direct inspection). ${rarityParseFailures.length > 0 ? `VALIDATION: ${rarityParseFailures.length} unrecognized rarity value(s) encountered (upstream vocabulary may have changed — see toPokemonRarity in scripts/sync-data/adapters.ts): ${rarityParseFailures.join("; ")}` : "All rarity values recognized."}`);
}
console.log(`  - pokemon_id values present in pokemon_stats.json/mega_pokemon.json but absent from pokemon_rarity.json (defaulted to "STANDARD"): ${pokemonIdsMissingFromRarityData.size === 0 ? "none (full coverage this run)" : [...pokemonIdsMissingFromRarityData].join(", ")}`);
console.log(`  - SCHEMA GAP for engine-developer: every species.json entry now carries a \`rarity: "STANDARD" | "LEGENDARY" | "MYTHIC" | "ULTRA_BEAST"\` field (attached via a local cast in scripts/sync-data.ts, NOT yet declared on @pogo-analyzer/engine's SpeciesDefinition type in packages/engine/src/types.ts) — this is data-sync's half of fixing raidBoss.ts's DEFAULT_REAL_RAID_TIER blanket "5-Star Raids" fallback (see .claude/agent-memory/pogo-researcher/proposal_default_raid_tier_fallback.md); the engine-side type declaration + DEFAULT_REAL_RAID_TIER consumption change is intentionally NOT made by this script.`);
console.log(`  - Scope limitation: only one form per species (form === "Normal", or a documented fallback — see next line) was normalized from pokemon_stats.json (${normalStats.length} candidates out of ${rawStats.length} total rows spanning 273 distinct forms), plus all ${rawMegaPokemon.length} mega_pokemon.json entries. Other regional/costume/event forms are still out of scope this pass.`);
console.log(`  - Fallback-form species (no row labeled "Normal" in pokemon_stats.json; ${fallbackFormPokemonIds.size} of ${defaultFormByPokemonId.size} distinct pokemon_id values): normalized under their first-listed form, or a FORM_OVERRIDES entry when the first-listed form was confirmed wrong (see below). Full audit completed 2026-09-05 against all 59 species named in the previous sync's report (Bulbapedia/GamePress/PoGo-release-status cross-check, not just a spot-check): ${[...fallbackFormPokemonIds].map((id) => `${rawStats.find((s) => s.pokemon_id === id)?.pokemon_name} (${defaultFormByPokemonId.get(id)})`).join(", ")}`);
console.log(`  - FORM_OVERRIDES applied (${Object.keys(FORM_OVERRIDES).length} species, see scripts/sync-data.ts's FORM_OVERRIDES doc comment for the full per-species reasoning): Shellos/Gastrodon -> West_sea, Darmanitan -> Standard, Deerling/Sawsbuck -> Spring, Flabébé/Floette/Florges -> Red, Aegislash -> Shield, Zygarde -> Fifty_percent, Lycanroc -> Midday, Wishiwashi -> Solo, Mimikyu -> Disguised, Sinistea/Polteageist -> Phony, Zacian/Zamazenta -> Hero, Palafin -> Zero, Dudunsparce -> Two, Poltchageist -> Counterfeit, Sinistcha -> Unremarkable.`);
console.log(`  - Deliberately NOT overridden (multiple real, independently-released forms with no single correct "default" per a Bulbapedia/GO-focused check): Urshifu (Single Strike vs Rapid Strike), Indeedee (Male vs Female — stats genuinely differ, no canonical default), Basculin (Red- vs Blue-Striped). Also left alone: species where every candidate form has identical stats/type and no clearly-conventional default exists either (Unown, Spinda, Scatterbug/Spewpa/Vivillon, Furfrou, Minior, Squawkabilly, Tatsugiri, Toxtricity, Maushold, Koraidon, Miraidon, and the single-form-only Galarian-native species: Obstagoon, Perrserker, Sirfetch'd, Mr. Rime, Runerigus) — this pass's fallback pick for all of these was confirmed correct or inconsequential.`);
if (formOverrideMismatches.length > 0) {
  console.log(`  - VALIDATION: FORM_OVERRIDES named a form pokemon_stats.json doesn't actually have a row for (override skipped, generic fallback used instead — check for a typo or an upstream form-name rename): ${formOverrideMismatches.map((m) => `pokemon_id ${m.pokemon_id} -> "${m.wanted}"`).join(", ")}`);
}
console.log(`  - Skipped ${skippedSpecies.length} species for missing typing/moveset data: ${skippedSpecies.map((s) => `${s.pokemon_name} (${s.reason})`).join(", ") || "none"}`);
console.log(`  - Unresolved move names referenced by current_pokemon_moves but absent from fast_moves/charged_moves.json (likely retired/legacy moves, filtered out silently per-species): ${[...unresolvedMoveNames].join(", ") || "none"}`);
console.log(`  - Raid entries with no usable stat data (speciesId: null): ${raidsWithNullSpecies} of ${activeRaids.length}`);
console.log(`  - Raid entries matched approximately (base/Normal-form stats standing in for a regional/mega variant this project lacks real per-form stat data for): ${raidsApproximate}`);
console.log(`  - GAME_MASTER fallback for mega/primal stats pogoapi.net's mega_pokemon.json doesn't cover (second automated source, PokeMiners' GAME_MASTER mirror, see fetchGameMasterMegaOverrides in scripts/sync-data/fetchCache.ts): ${megaOrPrimalRaidGaps.length === 0 ? "not needed this run (no active Mega/Primal raid outside pogoapi's 48-entry list)" : `${megaOrPrimalRaidGaps.length} gap(s) found (${megaOrPrimalRaidGaps.map((r) => r.name).join(", ")}); GAME_MASTER fetch ${gameMasterFetchResult?.source === "live" ? `succeeded (data/raw/game_master_mega_overrides.json cached, ${gameMasterFetchResult.records.length} tempEvoOverrides records extracted)` : `FAILED: ${gameMasterFetchResult?.error}`}; resolved via GAME_MASTER: ${gameMasterDerivedMega.length > 0 ? gameMasterDerivedMega.map((m) => m.mega_name).join(", ") : "none"}${gameMasterUnresolvedGaps.length > 0 ? `; UNRESOLVED (fell through to the existing approximate base-stat fallback instead): ${gameMasterUnresolvedGaps.join("; ")}` : ""}`}`);
if (gameMasterCrossChecks.length > 0) {
  console.log(`  - GAME_MASTER cross-check against independent community sources: ${gameMasterCrossChecks.join("; ")}`);
}
console.log(`  - Shadow raid entries (${shadowSpecies.length} distinct species synthesized: ${shadowSpecies.map((s) => s.name).join(", ") || "none"}): now real, not approximate, matches — each gets its own SpeciesDefinition (id "<base>-shadow") with isShadow: true and unmultiplied base stats copied from the real base species; the engine's shadowAdjustedBaseStats (packages/engine/src/shadow.ts) applies SHADOW_ATTACK_MULTIPLIER (1.2)/SHADOW_DEFENSE_MULTIPLIER (0.83) at effective-stat time. Previously these were flagged isApproximate: true against the unboosted base species.`);
console.log(`  - Speculative/hypothetical species in use for raid matching: none. This project's 4 hand-authored hypothetical fixtures (Mega Raichu X/Y, Primal Kyogre, Mega Skarmory) were deleted from the engine's product-reachable exports entirely (CLAUDE.md "Standing decisions", 2026-09-06); this sync no longer imports or matches against them.`);
console.log(`  - mega_pokemon.json entries are REAL data (not flagged speculative) but model an ATTACKER (standard level/IV/CPM pipeline), not a raid boss — the real Primal Kyogre entry now normalizes to id "${reservedSpeciesIds.has("kyogre-primal-attacker") ? "kyogre-primal-attacker" : "kyogre-primal"}" (previously forced to "-attacker" to avoid colliding with a hand-tuned boss-mode fixture of the same id that has since been deleted from product data — see above).`);
console.log(`  - Mega/primal species id collisions resolved by appending "-attacker": ${megaIdCollisions.length > 0 ? megaIdCollisions.map((c) => `${c.megaName} (${c.wouldBeId} -> ${c.usedId})`).join(", ") : "none"}`);
console.log(`  - mega_pokemon.json has no per-species boosted-type data, so each of the ${megaSpecies.length} mega/primal entries gets boost = { multiplier: DEFAULT_MEGA_BOOST_MULTIPLIER (1.3), boostedType: <its primary listed type> } — comparison.ts only applies a mega boost when \`species.boost\` is explicitly set (its fallback is 1, not 1.3), so this was required, not cosmetic.`);
const megaSpeciesWithoutImage = megaSpecies.filter((m) => !m.imageUrl).map((m) => m.name);
console.log(`  - Mega/primal species image lookups (PokeAPI, cached to data/raw/mega_sprite_urls.json): ${megaSpecies.length - megaSpeciesWithoutImage.length}/${megaSpecies.length} resolved${megaSpeciesWithoutImage.length > 0 ? `; no image found for: ${megaSpeciesWithoutImage.join(", ")}` : ""}. All Normal-form-or-fallback-form species get a dex-id sprite URL with no extra request.`);
if (validationErrors.length > 0) {
  console.log(`  - VALIDATION ERRORS: ${validationErrors.join("; ")}`);
}
