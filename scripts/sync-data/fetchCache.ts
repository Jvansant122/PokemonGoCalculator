/**
 * Fetch + cache helpers: reading already-cached raw pogoapi files under
 * data/raw/, and the handful of endpoints this pipeline fetches and re-caches
 * live on every run (mega_pokemon.json, the ScrapedDuck active-raids feed,
 * the full GAME_MASTER species+move slice, and per-species mega/primal
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

import type {
  RawMegaPokemonEntry,
  RawRaidEntry,
  RawGameMasterFullEntry,
  GameMasterPokemonRecord,
  GameMasterMoveRecord,
} from "./rawShapes.ts";

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

// fetchAndCachePokemonRarity (pogoapi's pokemon_rarity.json) was removed as
// part of the 2026-09-06 GAME_MASTER pipeline switch: GAME_MASTER's own
// `pokemonClass` field (see fetchGameMasterData below and
// pokemonClassToRarity in ./gameMasterMatching.ts) replaces this fetch
// entirely — confirmed by direct inspection that pokemonClass's per-species
// Legendary/Mythic/Ultra-Beast counts match pokemon_rarity.json's own
// unique-pokemon_id counts EXACTLY (77/23/11).

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

export interface GameMasterFetchResult {
  pokemon: GameMasterPokemonRecord[];
  moves: GameMasterMoveRecord[];
  source: "live" | "error";
  error?: string;
  /** movementIds recovered from a moveSettings entry's own templateId because its `movementId` field was itself malformed (see doc comment below). */
  recoveredMoveIds: string[];
  /** moveSettings entries with a malformed `movementId` this pipeline couldn't recover at all (dropped, not fatal — see doc comment below). */
  droppedMoveCount: number;
}

/**
 * PRIMARY source for every real species' base stats/typing/moveset/rarity as
 * of the 2026-09-06 full pipeline switch (previously this function —
 * fetchGameMasterMegaOverrides — only extracted mega/primal tempEvoOverrides
 * blocks as a narrow fallback; see git history for that version). Fetches
 * the full live GAME_MASTER dump (PokeMiners' long-running, actively-
 * maintained mirror of Niantic's own client-side file — the authoritative
 * upstream pogoapi.net itself ultimately derives from) exactly once per sync
 * run, then extracts and caches ONLY a compact slice — every `pokemonSettings`
 * template's stats/typing/moveset/rarity/tempEvoOverrides, and every
 * `moveSettings` (PvE — raids/gyms/wild battles) entry's power/energy/
 * duration — to data/raw/game_master.json, rather than committing the full
 * ~19-20MB upstream dump to data/raw/ on every sync (same "cache only the
 * slice you use" convention this project already followed for the narrower
 * mega-only extraction this replaces).
 *
 * Deliberately reads `moveSettings`, NEVER `combatMove` — GAME_MASTER carries
 * TWO separate move-stat tables for the same move name: `moveSettings` (PvE,
 * what this engine's raid/gym damage math needs) and `combatMove` (PvP/
 * Trainer-Battle-only, confirmed via direct inspection 2026-09-06 to carry
 * DIFFERENT power/energy numbers for the same move, e.g. Psychic is 95
 * power/-50 energy in moveSettings vs. 75 power/-55 energy in combatMove).
 *
 * Two GAME_MASTER data-quality quirks this extraction actively works around
 * (both confirmed live 2026-09-06, neither is a bug in this project's own
 * parsing):
 * - 22 `moveSettings` entries have a raw NUMERIC `movementId` instead of the
 *   real string identifier (e.g. `{movementId: 406, ...}` for what should be
 *   "AURA_WHEEL_ELECTRIC"). This function recovers the real id from that
 *   same entry's own `templateId` (`V0406_MOVE_AURA_WHEEL_ELECTRIC` ->
 *   "AURA_WHEEL_ELECTRIC") whenever the templateId matches that pattern;
 *   the remaining handful that don't (a few internal "VM_MOVE_TEMP_EVOLUTION_
 *   MEGA_..." placeholder-looking entries, confirmed NOT referenced by any
 *   real species' moveset) are dropped and counted in `droppedMoveCount`
 *   rather than crashing the sync.
 * - A mega/primal tempEvoOverrides block that sets `typeOverride1` but
 *   OMITS `typeOverride2` means "this form has only one type", not "keep the
 *   base species' type2" — see GameMasterTempEvoOverrideRecord's doc comment
 *   in rawShapes.ts for the Mega Aggron cross-check that caught this.
 *
 * IMPORTANT reliability caveat (confirmed live 2026-09-06, carried over from
 * the narrower mega-only version this replaces): GAME_MASTER carries
 * tempEvoOverrides stat blocks for mega forms Niantic has coded client-side
 * but NEVER actually released or put into rotation — e.g. Mega Falinks/
 * Malamar/Chesnaught/Delphox/Greninja all have real, well-formed
 * tempEvoOverrides entries despite not existing in pogoapi.net's list, not
 * appearing in any current or past raid rotation, and (for the non-Kalos-
 * starter cases) not being real Mega Evolutions in the mainline games at all
 * — Niantic's client preloading data for unannounced future content, a known
 * datamining phenomenon. This is exactly why sync-data.ts still gates every
 * mega/primal species it builds against a RELEASED-content allowlist
 * (pogoapi's mega_pokemon.json, plus the ScrapedDuck active-raids feed for
 * gap-filling) rather than surfacing every tempEvoOverrides block GAME_MASTER
 * happens to carry — this function itself does no such gating, it's a pure
 * extraction step.
 */
export async function fetchGameMasterData(rawDir: string): Promise<GameMasterFetchResult> {
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

    const pokemon: GameMasterPokemonRecord[] = [];
    const moves: GameMasterMoveRecord[] = [];
    const recoveredMoveIds: string[] = [];
    let droppedMoveCount = 0;

    for (const entry of parsed as RawGameMasterFullEntry[]) {
      const ps = entry?.data?.pokemonSettings;
      if (ps?.pokemonId && ps.stats) {
        pokemon.push({
          pokemonId: ps.pokemonId,
          form: ps.form,
          type: ps.type,
          type2: ps.type2,
          baseAttack: ps.stats.baseAttack,
          baseDefense: ps.stats.baseDefense,
          baseStamina: ps.stats.baseStamina,
          quickMoves: ps.quickMoves ?? [],
          cinematicMoves: ps.cinematicMoves ?? [],
          eliteQuickMoves: ps.eliteQuickMove ?? [],
          eliteCinematicMoves: ps.eliteCinematicMove ?? [],
          pokemonClass: ps.pokemonClass,
          tempEvoOverrides: (ps.tempEvoOverrides ?? [])
            .filter((o) => o.stats && o.tempEvoId)
            .map((o) => {
              const branch = ps.evolutionBranch?.find((b) => b.temporaryEvolution === o.tempEvoId);
              const hasTypeOverride = o.typeOverride1 !== undefined || o.typeOverride2 !== undefined;
              return {
                tempEvoId: o.tempEvoId as string,
                baseAttack: (o.stats as NonNullable<typeof o.stats>).baseAttack,
                baseDefense: (o.stats as NonNullable<typeof o.stats>).baseDefense,
                baseStamina: (o.stats as NonNullable<typeof o.stats>).baseStamina,
                typeOverride1: o.typeOverride1,
                typeOverride2: o.typeOverride2,
                hasTypeOverride,
                firstTimeMegaEnergyRequired: branch?.temporaryEvolutionEnergyCost,
                megaEnergyRequired: branch?.temporaryEvolutionEnergyCostSubsequent,
              };
            }),
        });
      }

      const ms = entry?.data?.moveSettings;
      if (ms && typeof ms.power === "number" && typeof ms.durationMs === "number") {
        let movementId = ms.movementId;
        if (typeof movementId !== "string") {
          const recovered = entry.templateId?.match(/^V\d+_MOVE_(.+)$/)?.[1];
          if (!recovered) {
            droppedMoveCount++;
            continue;
          }
          movementId = recovered;
          recoveredMoveIds.push(movementId);
        }
        moves.push({
          movementId,
          pokemonType: ms.pokemonType,
          power: ms.power,
          energyDelta: ms.energyDelta ?? 0,
          durationMs: ms.durationMs,
        });
      }
    }

    if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
    const cacheBody = JSON.stringify(
      { sourceUrl: GAME_MASTER_URL, fetchedAt: new Date().toISOString(), pokemon, moves },
      null,
      2,
    );
    writeFileSync(join(rawDir, "game_master.json"), cacheBody);
    recordFetchMeta(rawDir, "game_master.json", Buffer.byteLength(cacheBody, "utf-8"));
    return { pokemon, moves, source: "live", recoveredMoveIds, droppedMoveCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { pokemon: [], moves: [], source: "error", error: message, recoveredMoveIds: [], droppedMoveCount: 0 };
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
