/**
 * Fetch + cache helpers: reading already-cached raw pogoapi files under
 * data/raw/, and the handful of endpoints this pipeline fetches and re-caches
 * live on every run (mega_pokemon.json, the ScrapedDuck active-raids feed,
 * the GAME_MASTER mega/primal-override slice, and per-species mega/primal
 * sprite URLs). Split out of sync-data.ts as part of a 2026-09-06
 * code-simplifier-prompted reorg — see that file's module docstring for the
 * overall pipeline shape and CLAUDE.md's "Known gap: raid bosses" for the
 * product-level reasoning behind the raid-feed fallback below.
 *
 * Every function here takes `rawDir`/`repoRoot` explicitly rather than
 * recomputing them from `import.meta.url` itself, so there remains exactly
 * one source of truth for those paths (computed once in sync-data.ts).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { RawMegaPokemonEntry, RawRaidEntry, RawGameMasterEntry } from "./rawShapes.ts";

export function readJson<T>(rawDir: string, filename: string): T {
  return JSON.parse(readFileSync(join(rawDir, filename), "utf-8")) as T;
}

interface RawFetchMeta {
  fetchedAt: string;
  bytes: number;
}

/**
 * Records/updates a single filename's fetch timestamp + byte size in
 * data/raw/_meta.json, preserving whatever entries are already there for
 * files this script doesn't itself fetch (see sync-data.ts's module
 * docstring).
 */
export function recordFetchMeta(rawDir: string, filename: string, bytes: number): void {
  const metaPath = join(rawDir, "_meta.json");
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
 * pipeline fetches itself rather than assuming pre-cached — see sync-data.ts's
 * module docstring. Only a single request is made here, so the project
 * convention of a short delay between sequential fetches doesn't apply
 * (nothing to space out against).
 */
export async function fetchAndCacheMegaPokemon(rawDir: string): Promise<RawMegaPokemonEntry[]> {
  const response = await fetch(MEGA_POKEMON_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${MEGA_POKEMON_URL}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
  writeFileSync(join(rawDir, "mega_pokemon.json"), text);
  recordFetchMeta(rawDir, "mega_pokemon.json", Buffer.byteLength(text, "utf-8"));
  return JSON.parse(text) as RawMegaPokemonEntry[];
}

const SCRAPEDDUCK_RAIDS_URL = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.json";

export function raidFallbackPathFor(repoRoot: string): string {
  return join(repoRoot, "data", "raid-bosses.json");
}

interface RaidFallbackFile {
  /**
   * Documented schema for the project-owned override file used only when
   * the live ScrapedDuck feed is unreachable or returns an unexpected shape
   * (see fetchAndCacheRaids below and CLAUDE.md's "Known gap: raid bosses").
   * Each entry has the same shape pogoapi/ScrapedDuck give this pipeline
   * (RawRaidEntry) so it slots into the rest of the pipeline unchanged.
   * Update by hand, or repoint `SCRAPEDDUCK_RAIDS_URL`-equivalent logic at a
   * replacement community feed, if this file is ever actually needed.
   */
  bosses: RawRaidEntry[];
}

export interface RaidFetchResult {
  entries: RawRaidEntry[];
  source: "scrapedduck" | "fallback-file" | "fallback-file-created-empty";
  error?: string;
}

/**
 * Fetches the ScrapedDuck active-raids feed live and re-caches it under
 * data/raw/raids.json on EVERY sync run (unlike the other pogoapi endpoints,
 * which this pipeline assumes are already cached from an earlier pass — see
 * sync-data.ts's module docstring). Raid rotations are confirmed to change
 * intraday (2026-09-06 freshness check), so treating this one as "fetch once,
 * reuse forever" silently produces a stale activeRaids.json.
 *
 * Falls back to a project-owned override file (data/raid-bosses.json, repo
 * root — NOT data/raw/) if the feed is unreachable or its shape has changed
 * (not just any non-2xx — a malformed/non-array body also triggers the
 * fallback rather than silently feeding garbage into raid matching). If that
 * fallback file doesn't exist either, creates it with a documented empty
 * `bosses` array and reports (via the returned `source`) that it needs
 * populating, per CLAUDE.md's "Known gap: raid bosses" — this pipeline never
 * invents raid-boss data itself.
 */
export async function fetchAndCacheRaids(rawDir: string, repoRoot: string): Promise<RaidFetchResult> {
  const raidFallbackPath = raidFallbackPathFor(repoRoot);
  try {
    const response = await fetch(SCRAPEDDUCK_RAIDS_URL);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("unexpected shape: response body is not an array");
    }
    if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "raids.json"), text);
    recordFetchMeta(rawDir, "raids.json", Buffer.byteLength(text, "utf-8"));
    return { entries: parsed as RawRaidEntry[], source: "scrapedduck" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (existsSync(raidFallbackPath)) {
      try {
        const fallback = JSON.parse(readFileSync(raidFallbackPath, "utf-8")) as RaidFallbackFile;
        return { entries: fallback.bosses ?? [], source: "fallback-file", error: message };
      } catch {
        // Fallback file itself is malformed — fall through to treating it as absent.
      }
    }
    if (!existsSync(dirname(raidFallbackPath))) mkdirSync(dirname(raidFallbackPath), { recursive: true });
    const emptyFallback: RaidFallbackFile = { bosses: [] };
    writeFileSync(raidFallbackPath, JSON.stringify(emptyFallback, null, 2));
    return { entries: [], source: "fallback-file-created-empty", error: message };
  }
}

const GAME_MASTER_URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json";

/**
 * A single mega/primal stat block extracted from GAME_MASTER, keyed by GAME_MASTER's
 * own SCREAMING_SNAKE_CASE pokemon enum (e.g. "SKARMORY") and its tempEvoId
 * (e.g. "TEMP_EVOLUTION_MEGA") rather than this project's own id scheme —
 * translated into this project's RawMegaPokemonEntry shape by the caller.
 */
export interface GameMasterMegaOverrideRecord {
  pokemonId: string;
  tempEvoId: string;
  baseAttack: number;
  baseDefense: number;
  baseStamina: number;
  type1?: string;
  type2?: string;
  firstTimeMegaEnergyRequired?: number;
  megaEnergyRequired?: number;
}

export interface GameMasterFetchResult {
  records: GameMasterMegaOverrideRecord[];
  source: "live" | "error";
  error?: string;
}

/**
 * Second, fallback source for mega/primal base stats, consulted only when a
 * currently-live raid (per the ScrapedDuck feed) names a mega/primal
 * pogoapi.net's mega_pokemon.json doesn't cover — see sync-data.ts's
 * "GAME_MASTER fallback" block for the gating logic and why gating on
 * liveness matters here specifically.
 *
 * GAME_MASTER_URL is PokeMiners' long-running, actively-maintained mirror of
 * Niantic's own client-side GAME_MASTER dump — the authoritative upstream
 * pogoapi.net itself ultimately derives from. The live file is ~19-20MB and
 * changes shape/size with every game update; this function fetches it live
 * but extracts and caches ONLY a compact slice (every pokemonSettings entry
 * that carries a tempEvoOverrides block, i.e. every mega/primal-*capable*
 * species, released or not) to data/raw/game_master_mega_overrides.json,
 * rather than committing the full multi-megabyte upstream dump to data/raw/
 * on every sync — that would bloat this repo's history for a source this
 * project only consults as a rare fallback. No lighter official mega/primal-
 * only mirror of GAME_MASTER was found to exist (checked 2026-09-06) —
 * PokeMiners publishes the full dump only.
 *
 * IMPORTANT reliability caveat (confirmed live 2026-09-06): GAME_MASTER
 * carries tempEvoOverrides stat blocks for mega forms Niantic has coded
 * client-side but NEVER actually released or put into rotation — e.g. Mega
 * Falinks/Malamar/Chesnaught/Delphox/Greninja all have real, well-formed
 * tempEvoOverrides entries despite not existing in pogoapi.net's list, not
 * appearing in any current or past raid rotation, and (for the non-Kalos-
 * starter cases) not being real Mega Evolutions in the mainline games at all
 * — this is Niantic's client preloading data for unannounced future content,
 * a known datamining phenomenon. This is exactly why this pipeline never
 * mines GAME_MASTER speculatively: a record is only ever used to fill a gap
 * for a raid name the live ScrapedDuck feed says is ACTUALLY rotating right
 * now (see megaOrPrimalRaidGaps in sync-data.ts) — that gating is the whole
 * safeguard against surfacing unreleased/speculative stats as real ones.
 */
export async function fetchGameMasterMegaOverrides(rawDir: string): Promise<GameMasterFetchResult> {
  try {
    const response = await fetch(GAME_MASTER_URL);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("unexpected shape: response body is not an array");
    }
    const records: GameMasterMegaOverrideRecord[] = [];
    for (const entry of parsed as RawGameMasterEntry[]) {
      const ps = entry?.data?.pokemonSettings;
      if (!ps?.tempEvoOverrides || !ps.pokemonId) continue;
      for (const override of ps.tempEvoOverrides) {
        if (!override.stats || !override.tempEvoId) continue;
        const branch = ps.evolutionBranch?.find((b) => b.temporaryEvolution === override.tempEvoId);
        records.push({
          pokemonId: ps.pokemonId,
          tempEvoId: override.tempEvoId,
          baseAttack: override.stats.baseAttack,
          baseDefense: override.stats.baseDefense,
          baseStamina: override.stats.baseStamina,
          type1: override.typeOverride1 ?? ps.type,
          type2: override.typeOverride2 ?? ps.type2,
          firstTimeMegaEnergyRequired: branch?.temporaryEvolutionEnergyCost,
          megaEnergyRequired: branch?.temporaryEvolutionEnergyCostSubsequent,
        });
      }
    }
    if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
    const cacheBody = JSON.stringify(
      { sourceUrl: GAME_MASTER_URL, fetchedAt: new Date().toISOString(), records },
      null,
      2,
    );
    writeFileSync(join(rawDir, "game_master_mega_overrides.json"), cacheBody);
    recordFetchMeta(rawDir, "game_master_mega_overrides.json", Buffer.byteLength(cacheBody, "utf-8"));
    return { records, source: "live" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { records: [], source: "error", error: message };
  }
}

/**
 * Mega/primal forms each have their own internal PokeAPI id (not derivable
 * from the national dex number), so unlike a dex-id sprite URL this needs one
 * PokeAPI request per species — looked up by name, and this project's own
 * generated ids (e.g. "venusaur-mega", "charizard-mega-x") happen to match
 * PokeAPI's slug convention exactly (confirmed live for several, including —
 * surprisingly — the hypothetical fixtures: pokeapi.co has real sprite data
 * for "raichu-mega-x"/"raichu-mega-y"/"skarmory-mega" even though those
 * forms aren't released, see HANDOFF.md). Results are cached to
 * data/raw/mega_sprite_urls.json so a re-sync doesn't re-fetch 48 sprites
 * every time; a lookup that 404s or errors just leaves that species without
 * an image rather than failing the whole sync.
 */
export async function fetchMegaSpriteUrls(rawDir: string, speciesIds: string[]): Promise<Record<string, string>> {
  const cachePath = join(rawDir, "mega_sprite_urls.json");
  let cache: Record<string, string> = {};
  if (existsSync(cachePath)) {
    try {
      cache = JSON.parse(readFileSync(cachePath, "utf-8"));
    } catch {
      cache = {};
    }
  }
  const missing = speciesIds.filter((id) => !cache[id]);
  for (const id of missing) {
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      if (res.ok) {
        const json = (await res.json()) as { sprites?: { front_default?: string | null } };
        if (json.sprites?.front_default) cache[id] = json.sprites.front_default;
      }
    } catch {
      // Best-effort — a missing sprite just means no image for that species, not a sync failure.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  return cache;
}
