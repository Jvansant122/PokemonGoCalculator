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
 * Scope (documented limitation, see completion report / WARNINGS output):
 * this pass only normalizes `form === "Normal"` entries. Regional forms,
 * costumes, and event forms (Alola, Galarian, Fall_2019, etc.) are out of
 * scope for now — pokemon_stats.json alone carries 273 distinct form values.
 *
 * Fetching: `pokemon_stats`/`pokemon_types`/`fast_moves`/`charged_moves`/
 * `current_pokemon_moves`/`cp_multiplier`/the ScrapedDuck raids feed are
 * assumed already cached under data/raw/ by an earlier fetch pass this
 * project has been through (see data/raw/_meta.json fetch timestamps) — this
 * script only reads and normalizes them. `mega_pokemon.json` is the one
 * exception: this script fetches and caches it directly (see
 * fetchAndCacheMegaPokemon below), since it was identified as a needed
 * endpoint after that earlier pass. mega_pokemon.json models a mega/primal
 * Pokémon as a real trainer-owned ATTACKER (run through the standard
 * level/IV/CPM pipeline) — not as a raid boss (see packages/engine/src/
 * raidBoss.ts's separate, simplified pipeline) — so its 48 entries are added
 * to species.json as ordinary (non-hypothetical) species, under ids derived
 * from `mega_name` rather than `pokemon_name`/`form`, disambiguated against
 * any existing id (see megaSpeciesIdFor below).
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
  MEGA_RAICHU_X,
  MEGA_RAICHU_Y,
  PRIMAL_KYOGRE,
  MEGA_SKARMORY,
  DEFAULT_MEGA_BOOST_MULTIPLIER,
  type PokemonType,
  type RawGameMasterMove,
  type SpeciesDefinition,
  type FastMove,
  type ChargedMove,
} from "@pogo-analyzer/engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const RAW_DIR = join(REPO_ROOT, "data", "raw");
const NORMALIZED_DIR = join(REPO_ROOT, "data", "normalized");

// ---------------------------------------------------------------------------
// Raw pogoapi shapes (subset of fields this script reads)
// ---------------------------------------------------------------------------

interface RawPokemonStatsEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  base_attack: number;
  base_defense: number;
  base_stamina: number;
}

interface RawPokemonTypesEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  type: string[];
}

interface RawMoveEntry {
  move_id: number;
  name: string;
  type: string;
  power: number;
  energy_delta: number;
  duration: number;
}

interface RawCurrentMovesEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  fast_moves: string[];
  charged_moves: string[];
  elite_fast_moves: string[];
  elite_charged_moves: string[];
}

interface RawRaidEntry {
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
 */
interface RawMegaPokemonEntry {
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

interface ActiveRaidEntry {
  raidName: string;
  tier: string;
  speciesId: string | null;
  isApproximate: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(RAW_DIR, filename), "utf-8")) as T;
}

/**
 * Mirrors the exact one-liner `toPokemonType` in packages/engine/src/gamemaster.ts
 * (lowercase, strip a "pokemon_type_" prefix if present). That helper is not
 * exported from the engine — fromGameMaster expects already-converted
 * PokemonType values for its `types` parameter — so this script replicates
 * the single line rather than duplicating any real transform logic. Keep this
 * in sync with gamemaster.ts if that function ever changes.
 */
function toPokemonType(type: string): PokemonType {
  return type.toLowerCase().replace(/^pokemon_type_/, "") as PokemonType;
}

function toRawGameMasterMove(m: RawMoveEntry): RawGameMasterMove {
  return {
    move_id: String(m.move_id),
    name: m.name,
    type: m.type,
    power: m.power,
    energy_delta: m.energy_delta,
    duration_ms: m.duration,
  };
}

interface RawFetchMeta {
  fetchedAt: string;
  bytes: number;
}

/**
 * Records/updates a single filename's fetch timestamp + byte size in
 * data/raw/_meta.json, preserving whatever entries are already there for
 * files this script doesn't itself fetch (see module docstring).
 */
function recordFetchMeta(filename: string, bytes: number): void {
  const metaPath = join(RAW_DIR, "_meta.json");
  let meta: Record<string, RawFetchMeta> = {};
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    } catch {
      meta = {};
    }
  }
  meta[filename] = { fetchedAt: new Date().toISOString(), bytes };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

const MEGA_POKEMON_URL = "https://pogoapi.net/api/v1/mega_pokemon.json";

/**
 * Fetches mega_pokemon.json live and caches the raw response under data/raw/
 * with a fetch timestamp (see recordFetchMeta). This is the one endpoint this
 * script fetches itself rather than assuming pre-cached — see module
 * docstring. Only a single request is made here, so the project convention of
 * a short delay between sequential fetches doesn't apply (nothing to space
 * out against).
 */
async function fetchAndCacheMegaPokemon(): Promise<RawMegaPokemonEntry[]> {
  const response = await fetch(MEGA_POKEMON_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${MEGA_POKEMON_URL}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });
  writeFileSync(join(RAW_DIR, "mega_pokemon.json"), text);
  recordFetchMeta("mega_pokemon.json", Buffer.byteLength(text, "utf-8"));
  return JSON.parse(text) as RawMegaPokemonEntry[];
}

// ---------------------------------------------------------------------------
// Load raw data
// ---------------------------------------------------------------------------

const rawMegaPokemon = await fetchAndCacheMegaPokemon();

const rawStats = readJson<RawPokemonStatsEntry[]>("pokemon_stats.json");
const rawTypes = readJson<RawPokemonTypesEntry[]>("pokemon_types.json");
const rawFastMoves = readJson<RawMoveEntry[]>("fast_moves.json");
const rawChargedMoves = readJson<RawMoveEntry[]>("charged_moves.json");
const rawCurrentMoves = readJson<RawCurrentMovesEntry[]>("current_pokemon_moves.json");
const rawRaids = readJson<RawRaidEntry[]>("raids.json");

const fastMoveByName = new Map<string, FastMove>();
for (const m of rawFastMoves) {
  fastMoveByName.set(m.name, fromGameMasterMove(toRawGameMasterMove(m)));
}

const chargedMoveByName = new Map<string, ChargedMove>();
for (const m of rawChargedMoves) {
  chargedMoveByName.set(m.name, fromGameMasterMove(toRawGameMasterMove(m)));
}

const typesByPokemonId = new Map<number, RawPokemonTypesEntry>();
for (const t of rawTypes) {
  if (t.form === "Normal") typesByPokemonId.set(t.pokemon_id, t);
}

const movesByPokemonId = new Map<number, RawCurrentMovesEntry>();
for (const c of rawCurrentMoves) {
  if (c.form === "Normal") movesByPokemonId.set(c.pokemon_id, c);
}

// ---------------------------------------------------------------------------
// Build normalized species list (Normal form only)
// ---------------------------------------------------------------------------

const normalStats = rawStats.filter((s) => s.form === "Normal");

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

  species.push(definition);
}

const HYPOTHETICAL_FIXTURES: SpeciesDefinition[] = [MEGA_RAICHU_X, MEGA_RAICHU_Y, PRIMAL_KYOGRE, MEGA_SKARMORY];

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
// Id scheme: megaSpeciesIdFor() strips the base pokemon_name out of mega_name
// to get a suffix (e.g. "Mega Charizard X" - "Charizard" -> "mega-x"), then
// builds `${pokemon_name}-${suffix}` (e.g. "charizard-mega-x"), matching this
// project's existing raichu-mega-x / skarmory-mega hypothetical-fixture
// naming convention. If that id already exists (in the real Normal-form
// species built above, or in HYPOTHETICAL_FIXTURES), "-attacker" is appended
// to disambiguate. This is specifically needed for Primal Kyogre: its natural
// id "kyogre-primal" would otherwise collide with the existing
// hand-defined raid-boss fixture of the same id (scenarioA.ts's
// PRIMAL_KYOGRE) even though the two model completely different things
// (attacker vs. boss stat pipeline) — the real attacker-mode entry ends up at
// "kyogre-primal-attacker" instead.

function megaSpeciesIdFor(pokemonName: string, megaName: string): string {
  const suffix = megaName
    .replace(pokemonName, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return `${pokemonName.toLowerCase()}-${suffix}`;
}

const reservedSpeciesIds = new Set<string>([
  ...species.map((s) => s.id),
  ...HYPOTHETICAL_FIXTURES.map((s) => s.id),
]);

const megaSpecies: SpeciesDefinition[] = [];
const megaIdCollisions: { megaName: string; wouldBeId: string; usedId: string }[] = [];

for (const m of rawMegaPokemon) {
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

  megaSpecies.push(definition);
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
const hypotheticalLookupPool = HYPOTHETICAL_FIXTURES.map((s) => ({ id: s.id, name: s.name }));

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
    // Priority 2: hand-defined hypothetical fixtures (Mega Raichu X/Y, Mega
    // Skarmory — not in mega_pokemon.json's 48, confirmed).
    const exactHypothetical = findByExactName(raid.name, hypotheticalLookupPool);
    if (exactHypothetical) {
      speciesId = exactHypothetical;
    } else {
      // Priority 3: exact match against the full normalized species pool
      // (Normal-form real species, and now mega species too, though anything
      // in megaSpeciesLookupPool was already tried above).
      const exactNormalized = findByExactName(raid.name, speciesLookupPool);
      if (exactNormalized) {
        speciesId = exactNormalized;
      } else {
        // Priority 4 (fallback, approximate): strip a known prefix (e.g.
        // "Shadow ") and match the base species' Normal-form stats as a
        // stand-in. Still legitimately needed for Shadow-prefixed raids,
        // since this project doesn't model the real Shadow atk/def
        // multiplier — see CLAUDE.md/task notes.
        for (const prefix of KNOWN_PREFIXES) {
          if (raid.name.startsWith(prefix)) {
            const baseName = raid.name.slice(prefix.length);
            const baseMatch = findByExactName(baseName, speciesLookupPool);
            if (baseMatch) {
              speciesId = baseMatch;
              isApproximate = true;
              break;
            }
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

function diffSpecies(prev: SpeciesDefinition[] | null, next: SpeciesDefinition[]): string[] {
  if (!prev) return ["initial sync (no previous species.json baseline)"];
  const diffs: string[] = [];
  const prevById = new Map(prev.map((s) => [s.id, s]));
  const nextById = new Map(next.map((s) => [s.id, s]));
  for (const [id, ns] of nextById) {
    const ps = prevById.get(id);
    if (!ps) {
      diffs.push(`+ ${id} (new species)`);
      continue;
    }
    if (JSON.stringify(ps) !== JSON.stringify(ns)) {
      diffs.push(`~ ${id} changed`);
    }
  }
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) diffs.push(`- ${id} (removed)`);
  }
  return diffs;
}

function diffRaids(prev: ActiveRaidEntry[] | null, next: ActiveRaidEntry[]): string[] {
  if (!prev) return ["initial sync (no previous activeRaids.json baseline)"];
  const diffs: string[] = [];
  const prevByName = new Map(prev.map((r) => [r.raidName, r]));
  const nextByName = new Map(next.map((r) => [r.raidName, r]));
  for (const [name, nr] of nextByName) {
    const pr = prevByName.get(name);
    if (!pr) {
      diffs.push(`+ ${name} (new raid entry)`);
      continue;
    }
    if (JSON.stringify(pr) !== JSON.stringify(nr)) {
      diffs.push(`~ ${name} changed (${JSON.stringify(pr)} -> ${JSON.stringify(nr)})`);
    }
  }
  for (const name of prevByName.keys()) {
    if (!nextByName.has(name)) diffs.push(`- ${name} (no longer an active raid)`);
  }
  return diffs;
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

const raidsWithNullSpecies = activeRaids.filter((r) => r.speciesId === null).length;
const raidsApproximate = activeRaids.filter((r) => r.isApproximate).length;

console.log(`SYNCED: pokemon_stats, pokemon_types, fast_moves, charged_moves, current_pokemon_moves, cp_multiplier, mega_pokemon, scrapedduck-raids (${species.length} species [${species.length - megaSpecies.length} Normal-form + ${megaSpecies.length} mega/primal], ${fastMoveByName.size + chargedMoveByName.size} moves)`);
console.log(`CHANGED (species.json): ${speciesDiffs.length > 0 ? speciesDiffs.join("; ") : "none"}`);
console.log(`CHANGED (activeRaids.json): ${raidDiffs.length > 0 ? raidDiffs.join("; ") : "none"}`);
console.log(`AFFECTS SCENARIOS: none (no saved scenarios reference normalized species yet; scenarioA.ts fixtures untouched)`);
console.log(`WARNINGS:`);
console.log(`  - Scope limitation: only form === "Normal" entries were normalized from pokemon_stats.json (${normalStats.length} candidates out of ${rawStats.length} total rows spanning 273 distinct forms), plus all ${rawMegaPokemon.length} mega_pokemon.json entries. Other regional/costume/event forms are still out of scope this pass.`);
console.log(`  - Skipped ${skippedSpecies.length} species for missing typing/moveset data: ${skippedSpecies.map((s) => `${s.pokemon_name} (${s.reason})`).join(", ") || "none"}`);
console.log(`  - Unresolved move names referenced by current_pokemon_moves but absent from fast_moves/charged_moves.json (likely retired/legacy moves, filtered out silently per-species): ${[...unresolvedMoveNames].join(", ") || "none"}`);
console.log(`  - Raid entries with no usable stat data (speciesId: null): ${raidsWithNullSpecies} of ${activeRaids.length}`);
console.log(`  - Raid entries matched approximately (base/Normal-form stats standing in for a Shadow/regional/mega variant, since this project doesn't model the real Shadow atk/def multiplier or lack real mega data for that species): ${raidsApproximate}`);
console.log(`  - Speculative/hypothetical species in use for raid matching: Mega Raichu X, Mega Raichu Y, Mega Skarmory (all isHypothetical/no real stat source) — flagged speciesId points at hand-defined fixtures, not fetched data. (Primal Kyogre's raid-boss fixture from scenarioA.ts is not used for any current raid match, but stays registered as a boss-mode hypothetical alongside the new real attacker-mode entry.)`);
console.log(`  - mega_pokemon.json entries are REAL data (not flagged speculative) but model an ATTACKER (standard level/IV/CPM pipeline), not a raid boss — do not confuse the new "${reservedSpeciesIds.has("kyogre-primal-attacker") ? "kyogre-primal-attacker" : "kyogre-primal"}" species entry with the pre-existing hand-tuned boss-mode PRIMAL_KYOGRE fixture (id "kyogre-primal") in packages/engine/src/fixtures/scenarioA.ts — both now coexist under different ids by design.`);
console.log(`  - Mega/primal species id collisions resolved by appending "-attacker": ${megaIdCollisions.length > 0 ? megaIdCollisions.map((c) => `${c.megaName} (${c.wouldBeId} -> ${c.usedId})`).join(", ") : "none"}`);
console.log(`  - mega_pokemon.json has no per-species boosted-type data, so each of the ${megaSpecies.length} mega/primal entries gets boost = { multiplier: DEFAULT_MEGA_BOOST_MULTIPLIER (1.3), boostedType: <its primary listed type> } — comparison.ts only applies a mega boost when \`species.boost\` is explicitly set (its fallback is 1, not 1.3), so this was required, not cosmetic.`);
if (validationErrors.length > 0) {
  console.log(`  - VALIDATION ERRORS: ${validationErrors.join("; ")}`);
}
