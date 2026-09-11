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
  GameMasterUpgradeSettingsRecord,
  GameMasterEvolutionBranchRecord,
  RawRaidBossesPreviousEntry,
  RawRaidBossesResponse,
} from "./rawShapes.ts";
import type { RawPokebattlerResponse, RawPokebattlerTier } from "./pokebattlerRaids.ts";
import { resolveFormChangeMoveGrants, type FormChangeMoveGrantReport } from "./formChangeMoveGrants.ts";

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

const POKEBATTLER_RAIDS_URL = "https://fight.pokebattler.com/raids";
const POKEBATTLER_USER_AGENT = "pogo-analyzer-data-sync pokebattler-live-cross-check (advisory, non-commercial)";

export interface PokebattlerRaidsFetchResult {
  tiers: RawPokebattlerTier[];
  source: "live" | "error";
  error?: string;
}

/**
 * Fetches Pokebattler's own raid roster (https://fight.pokebattler.com/raids,
 * ~673KB) live and caches the raw response under
 * data/raw/pokebattler_raids.json (same discipline as every other endpoint —
 * see recordFetchMeta). Added 2026-09-07 for an independent LIVE cross-check
 * of ScrapedDuck's current raid roster (data/raw/raids.json) — see
 * scripts/sync-data/pokebattlerRaids.ts's module doc comment for the tier-
 * classification traps (`_FUTURE`/`_MAX`/`RAID_LEVEL_UNSET`) the consumer
 * must filter out itself, and sync-data.ts's "Pokebattler live cross-check"
 * section for how the two feeds are compared and reported.
 *
 * ScrapedDuck remains the sole, authoritative source for activeRaids.json —
 * this endpoint never adds, removes, or overwrites a single active raid; its
 * entire value is DETECTING divergence between the two feeds, reported loudly
 * rather than silently reconciled (see CLAUDE.md's "Known gap: raid bosses").
 *
 * Best-effort, same philosophy as fetchAndCacheRaidBossesPrevious/
 * fetchAndCacheBulbapediaRaidArchive: an unreachable/malformed response here
 * must never fail the whole sync. Returns an error result instead of
 * throwing; the caller logs a WARNING and simply skips the cross-check this
 * run.
 */
export async function fetchAndCachePokebattlerRaids(rawDir: string): Promise<PokebattlerRaidsFetchResult> {
  try {
    const response = await fetch(POKEBATTLER_RAIDS_URL, { headers: { "User-Agent": POKEBATTLER_USER_AGENT } });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    const parsed = JSON.parse(text) as RawPokebattlerResponse;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tiers)) {
      throw new Error("unexpected shape: response body has no `tiers` array");
    }
    if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "pokebattler_raids.json"), text);
    recordFetchMeta(rawDir, "pokebattler_raids.json", Buffer.byteLength(text, "utf-8"));
    return { tiers: parsed.tiers, source: "live" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { tiers: [], source: "error", error: message };
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
  /**
   * The SINGLE `POKEMON_UPGRADE_SETTINGS` template, validated and defaulted
   * (2026-09-08, Power-Up Optimizer data source — see doc comment below).
   * `null` if that template is missing from this run's GAME_MASTER dump, or
   * present but missing its `candyCost`/`stardustCost` arrays — never thrown,
   * always reported by the caller (sync-data.ts) in WARNINGS.
   */
  upgradeSettings: GameMasterUpgradeSettingsRecord | null;
  /**
   * `LUCKY_POKEMON_SETTINGS`'s `powerUpStardustDiscountPercent` (2026-09-08,
   * same task as `upgradeSettings` above). `null` under the same "missing or
   * malformed, never thrown" discipline.
   */
  luckyStardustDiscountPercent: number | null;
  /**
   * Forms whose movepool gained (or would have gained but skipped) a move
   * via formChange[].moveReassignment resolution this run (2026-09-10) — see
   * resolveFormChangeMoveGrants (./formChangeMoveGrants.ts) and MECHANICS.md's
   * "Form-change `moveReassignment` grants moves that appear in no movepool
   * array". Empty array (never undefined) when nothing was applied, including
   * on the error path below.
   */
  formChangeMoveGrants: FormChangeMoveGrantReport[];
  /** Target form keys named by a formChange entry with no matching pokemonSettings template this run — see resolveFormChangeMoveGrants. Empty array (never undefined) when there were none, including on the error path below. */
  unmatchedFormChangeTargets: string[];
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
 * template's stats/typing/moveset/rarity/tempEvoOverrides, every
 * `moveSettings` (PvE — raids/gyms/wild battles) entry's power/energy/
 * duration — to data/raw/game_master.json, rather than committing the full
 * ~19-20MB upstream dump to data/raw/ on every sync (same "cache only the
 * slice you use" convention this project already followed for the narrower
 * mega-only extraction this replaces). As of 2026-09-08 (Power-Up Optimizer
 * data source, see IDEAS.md's "Power-Up Optimizer" entry) this cached slice
 * ALSO carries the SINGLE `POKEMON_UPGRADE_SETTINGS` template (the universal
 * per-level candy/stardust power-up cost table, `data.pokemonUpgrades`) and
 * the SINGLE `LUCKY_POKEMON_SETTINGS` template's
 * `powerUpStardustDiscountPercent` (`data.luckyPokemonSettings`) — extracted
 * in the SAME single pass over the GAME_MASTER array as the pokemonSettings/
 * moveSettings extraction below, not a second pass. Both are `null` (never
 * thrown) if that specific template is missing or malformed this run;
 * sync-data.ts reports that in WARNINGS and skips writing
 * data/normalized/powerUpCosts.json that run rather than failing the sync.
 *
 * Also as of 2026-09-08 (Phase 0 of PLAN_multi_raid_roster_optimizer.md),
 * each pokemonSettings template's `familyId` and REAL (non-mega/primal)
 * `evolutionBranch` entries are retained too (GameMasterPokemonRecord.
 * familyId/evolutionBranch — see that type's doc comment in rawShapes.ts),
 * in the SAME per-template extraction as tempEvoOverrides just below, not a
 * second pass over `ps.evolutionBranch`. Both are cached to
 * data/raw/game_master.json AND consumed by this script's species-building
 * pass, which writes `isFullyEvolved`/`evolvesToIds`/`candyFamilyId` onto
 * every real species in data/normalized/species.json (see sync-data.ts's own
 * `definition.isFullyEvolved = isFullyEvolved(...)` assignments and
 * gameMasterMatching.ts's `isFullyEvolved`/`realEvolutionTargets`).
 *
 * `isFullyEvolved` is derived from "has a branch carrying an `evolution`
 * field," NOT from `evolutionBranch` being non-empty — 123 templates carry a
 * branch whose only entries are TEMPORARY (mega) evolutions, Charizard and
 * Metagross among them, and the naive check marks those unevolved. See
 * MECHANICS.md, "Evolution: candy-only".
 *
 * As of 2026-09-10, each pokemonSettings template's `formChange` entries are
 * ALSO retained (filtered to move-bearing ones only — see
 * GameMasterFormChangeEntryRecord's doc comment in rawShapes.ts), previously
 * discarded entirely. `formChange` is a form-TRANSITION table, and some
 * forms' real signature moves (Zacian/Zamazenta's Crowned forms, Necrozma's
 * Dusk Mane/Dawn Wings, Kyurem Black/White) are granted ONLY through a
 * `formChange[].moveReassignment` entry, never appearing in that form's own
 * `quickMoves`/`cinematicMoves`/elite arrays at all — see MECHANICS.md's
 * "Form-change `moveReassignment` grants moves that appear in no movepool
 * array". Once this loop finishes collecting every template,
 * resolveFormChangeMoveGrants (./formChangeMoveGrants.ts) resolves and
 * applies those grants onto the correct forms' `cinematicMoves`/
 * `quickMoves` arrays in place — see that call site below and its own doc
 * comment for the full resolution rule.
 * Deliberately NOT extracted: `POKEMON_UPGRADE_OVERRIDE_SETTINGS_V0890_
 * POKEMON_ETERNATUS`, a real per-species override (30x candy cost) — v1 of
 * the power-up cost table this feeds only models the universal table (see
 * RawGameMasterPokemonUpgradeSettingsFull's doc comment in rawShapes.ts).
 *
 * As of 2026-09-10, each pokemonSettings template's `kmBuddyDistance` is ALSO
 * retained (GameMasterPokemonRecord.kmBuddyDistance) — the FIRST-PARTY
 * tiering key behind MECHANICS.md's "Second charged move unlock" cost table,
 * previously entirely `[community-consensus]` including which distance
 * bucket a species falls into. The cost FIGURES per bucket (10,000/25 at
 * 1km, etc.) remain community-sourced — this only makes "which bucket" a
 * derived fact instead of a guess. See that field's own doc comment for the
 * per-species (pokemonId-enum-keyed), not per-candy-family, caveat.
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
 * IMPORTANT reliability caveat (general risk, still real as of 2026-09-06):
 * GAME_MASTER can carry tempEvoOverrides stat blocks for mega forms Niantic
 * has coded client-side but NOT YET actually released or put into rotation —
 * Niantic's client preloading data for unannounced future content, a known
 * datamining phenomenon. This is exactly why sync-data.ts still gates every
 * mega/primal species it builds against a RELEASED-content allowlist
 * (pogoapi's mega_pokemon.json, plus the ScrapedDuck active-raids feed for
 * gap-filling, plus a hand-curated RELEASED_MEGA_PRIMAL_ALLOWLIST for real
 * content that's missed both of those — see that constant's doc comment in
 * sync-data.ts) rather than surfacing every tempEvoOverrides block GAME_MASTER
 * happens to carry — this function itself does no such gating, it's a pure
 * extraction step.
 *
 * UPDATE 2026-09-06: this comment previously named Mega Falinks/Malamar/
 * Chesnaught/Delphox/Greninja specifically as examples of tempEvoOverrides
 * blocks for content Niantic had coded but never released. All 5 have
 * genuinely shipped since that was written (Victreebel/Dragonite/Malamar
 * 2026-02-20, Falinks 2026-05-23, Mewtwo X/Y 2026-05-24, Starmie 2026-08-22,
 * and the Kalos-starter trio Chesnaught/Delphox/Greninja 2026-08-28 at the
 * Pokémon World Championships, reprised 2026-09-05/06 at Pokémon GO Fest 2026:
 * Mega Finale — independently confirmed via Bulbapedia's "Mega Evolution (GO)"
 * page, Serebii.net's Mega Evolution list, and (for 5 of the 9) Pokémon GO
 * Hub's own raid guides; see RELEASED_MEGA_PRIMAL_ALLOWLIST's doc comment in
 * sync-data.ts for full per-species citations and cross-checks) — so they no
 * longer belong in this "known unreleased" category and have been added to
 * that allowlist instead. The GENERAL caveat above (GAME_MASTER can carry
 * real tempEvoOverrides for content that hasn't shipped YET, for some OTHER
 * species) remains true and is not specific to these 5 anymore — there is no
 * currently-known named example of it as of this update; treat any future
 * tempEvoOverrides-only mega with the same "verify before trusting" rigor
 * these 9 got, not as an automatic red flag.
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
    // Power-Up Optimizer data source (2026-09-08, see this function's doc
    // comment) — at most one entry in the whole GAME_MASTER array carries
    // each of these two templateIds, so these stay singular (not arrays) and
    // simply get overwritten if somehow seen twice (never observed).
    let upgradeSettings: GameMasterUpgradeSettingsRecord | null = null;
    let luckyStardustDiscountPercent: number | null = null;

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
          // 2026-09-10, Power-Up Optimizer cost-model data source — see
          // GameMasterPokemonRecord.kmBuddyDistance's doc comment
          // (rawShapes.ts) for the per-species-vs-per-family caveat.
          kmBuddyDistance: ps.kmBuddyDistance,
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
          // 2026-09-08, Phase 0 of PLAN_multi_raid_roster_optimizer.md — same
          // `ps.evolutionBranch` access as tempEvoOverrides just above, not a
          // second pass. Deliberately keeps ONLY entries with a real
          // `evolution` target (drops temporaryEvolution/mega entries, which
          // are already captured above) — see GameMasterEvolutionBranchRecord's
          // doc comment for why an unfiltered evolutionBranch.length is the
          // wrong check (Venusaur/Charizard/Blastoise/Beedrill/Metagross all
          // carry a non-empty evolutionBranch that is ENTIRELY temporary-
          // evolution entries).
          familyId: ps.familyId,
          evolutionBranch: (ps.evolutionBranch ?? []).reduce<GameMasterEvolutionBranchRecord[]>((acc, b) => {
            if (b.evolution) {
              acc.push({ evolution: b.evolution, form: b.form, candyCost: b.candyCost, candyCostPurified: b.candyCostPurified });
            }
            return acc;
          }, []),
          // 2026-09-10 fix for MECHANICS.md's "Form-change `moveReassignment`
          // grants moves that appear in no movepool array" — kept only as the
          // RAW source data (not yet resolved/applied; see
          // resolveFormChangeMoveGrants below, called once this whole loop
          // finishes). Filters out every formChange entry with no
          // moveReassignment group at all (candyCost/item/UNFUSE-only
          // entries etc.) — this pipeline models the move-grant facet of
          // formChange only.
          formChange: (ps.formChange ?? [])
            .map((fc) => ({
              availableForm: fc.availableForm ?? [],
              cinematicMoves: (fc.moveReassignment?.cinematicMoves ?? []).map((g) => ({
                existingMoves: g.existingMoves,
                replacementMoves: g.replacementMoves,
              })),
              quickMoves: (fc.moveReassignment?.quickMoves ?? []).map((g) => ({
                existingMoves: g.existingMoves,
                replacementMoves: g.replacementMoves,
              })),
            }))
            .filter((fc) => fc.cinematicMoves.length > 0 || fc.quickMoves.length > 0),
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

      // POKEMON_UPGRADE_SETTINGS: the universal per-level power-up cost table
      // (2026-09-08, Power-Up Optimizer data source — see this function's doc
      // comment). Requires both cost arrays to actually be present to count
      // as a usable template; every other field falls back to its documented
      // real-game default (matching this project's "never silently fabricate,
      // but a reasonable documented default beats discarding good data over a
      // missing minor field" discipline used elsewhere in this same loop, e.g.
      // `ps.quickMoves ?? []` above) rather than rejecting the whole template.
      const upgrades = entry?.data?.pokemonUpgrades;
      if (upgrades && Array.isArray(upgrades.candyCost) && Array.isArray(upgrades.stardustCost)) {
        upgradeSettings = {
          upgradesPerLevel: upgrades.upgradesPerLevel ?? 2,
          maxNormalUpgradeLevel: upgrades.maxNormalUpgradeLevel ?? 50,
          xlCandyMinPokemonLevel: upgrades.xlCandyMinPokemonLevel ?? 40,
          stardustCost: upgrades.stardustCost,
          candyCost: upgrades.candyCost,
          xlCandyCost: upgrades.xlCandyCost ?? [],
          shadowStardustMultiplier: upgrades.shadowStardustMultiplier ?? 1.2,
          shadowCandyMultiplier: upgrades.shadowCandyMultiplier ?? 1.2,
          purifiedStardustMultiplier: upgrades.purifiedStardustMultiplier ?? 0.9,
          purifiedCandyMultiplier: upgrades.purifiedCandyMultiplier ?? 0.9,
        };
      }

      // LUCKY_POKEMON_SETTINGS: only `powerUpStardustDiscountPercent` is
      // consumed by this pipeline (same 2026-09-08 task as upgradeSettings
      // above).
      const lucky = entry?.data?.luckyPokemonSettings;
      if (lucky && typeof lucky.powerUpStardustDiscountPercent === "number") {
        luckyStardustDiscountPercent = lucky.powerUpStardustDiscountPercent;
      }
    }

    // Form-change moveReassignment resolution (2026-09-10) — see
    // resolveFormChangeMoveGrants's own doc comment (./formChangeMoveGrants.ts)
    // and MECHANICS.md's "Form-change `moveReassignment` grants moves that
    // appear in no movepool array". Runs ONCE, here, now that `pokemon` and
    // `moves` are both complete — a formChange entry's TARGET form can be a
    // template the main loop above visited before OR after the one declaring
    // the grant, so this can't run inside that loop. Mutates the relevant
    // records' own cinematicMoves/quickMoves arrays in place, so both the
    // cached data/raw/game_master.json body below AND the in-memory `pokemon`
    // this function returns (which sync-data.ts builds species.json from
    // directly, never re-reading the cache file) already reflect the
    // resolved grants.
    const { grants: formChangeMoveGrants, unmatchedFormChangeTargets } = resolveFormChangeMoveGrants(pokemon, moves);

    if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
    const cacheBody = JSON.stringify(
      {
        sourceUrl: GAME_MASTER_URL,
        fetchedAt: new Date().toISOString(),
        pokemon,
        moves,
        upgradeSettings,
        luckyStardustDiscountPercent,
      },
      null,
      2,
    );
    writeFileSync(join(rawDir, "game_master.json"), cacheBody);
    recordFetchMeta(rawDir, "game_master.json", Buffer.byteLength(cacheBody, "utf-8"));
    return {
      pokemon,
      moves,
      source: "live",
      recoveredMoveIds,
      droppedMoveCount,
      upgradeSettings,
      luckyStardustDiscountPercent,
      formChangeMoveGrants,
      unmatchedFormChangeTargets,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      pokemon: [],
      moves: [],
      source: "error",
      error: message,
      recoveredMoveIds: [],
      droppedMoveCount: 0,
      upgradeSettings: null,
      luckyStardustDiscountPercent: null,
      formChangeMoveGrants: [],
      unmatchedFormChangeTargets: [],
    };
  }
}

const RAID_BOSSES_URL = "https://pogoapi.net/api/v1/raid_bosses.json";

export interface RaidBossesPreviousFetchResult {
  /** The `previous` bucket — keyed by tier ("1".."6"/"ex"/"mega"/"mega_legendary"). */
  previous: Record<string, RawRaidBossesPreviousEntry[]>;
  /**
   * The `current` bucket, same shape — originally fetched-and-discarded
   * (this pipeline's live-raid source is ScrapedDuck, not this endpoint) but
   * now ALSO consumed by the 2026-09-07 Pokebattler-cross-check task: pogoapi's
   * own "current" snapshot is confirmed stale (verified 2026-09-07: zero
   * species overlap with the real live ScrapedDuck roster — e.g. this bucket's
   * lone "5" entry, Heatran, was NOT actually raiding that day) and is
   * therefore folded into raidHistory.json as historical data too, same as
   * `previous` (see sync-data.ts's "pogoapi-previous backfill" section, which
   * now iterates both buckets together under the one "pogoapi-previous"
   * source label — same file, same reliability characteristics, equally
   * historical despite pogoapi's own "current" naming).
   */
  current: Record<string, RawRaidBossesPreviousEntry[]>;
  source: "live" | "error";
  error?: string;
}

/**
 * Fetches pogoapi.net's raid_bosses.json live and caches the raw response
 * under data/raw/raid_bosses.json (same discipline as every other endpoint —
 * see recordFetchMeta). This pipeline already depends on pogoapi.net for the
 * released-content roster/allowlist and per-species fallback (see
 * sync-data.ts's module docstring); this is a second, independent endpoint
 * from that same source, used ONLY to backfill data/normalized/
 * raidHistory.json's `previous` list (2026-09-07 raidHistory backfill task —
 * see that section of sync-data.ts) with real historical raid-boss
 * appearances neither the live ScrapedDuck feed nor
 * RELEASED_MEGA_PRIMAL_ALLOWLIST already covers. Fetched live on every run
 * (not assumed pre-cached) since this pipeline has no prior cached copy of
 * it and pogoapi's own scrape of it can grow over time as new raids rotate
 * through and get recorded into `previous`.
 *
 * Best-effort: unlike fetchAndCacheMegaPokemon (whose roster this pipeline's
 * released-content GATE depends on, so a fetch failure there should be
 * loud), this endpoint is purely an ADDITIVE historical enrichment — a
 * failure here should never fail the whole sync. Returns an error result
 * instead of throwing (same pattern as fetchGameMasterData/
 * fetchAndCacheRaids's fallback path) so the caller can log a WARNING and
 * simply add zero "pogoapi-previous" entries this run rather than crash.
 */
export async function fetchAndCacheRaidBossesPrevious(rawDir: string): Promise<RaidBossesPreviousFetchResult> {
  try {
    const response = await fetch(RAID_BOSSES_URL);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    const parsed = JSON.parse(text) as RawRaidBossesResponse;
    if (!parsed || typeof parsed !== "object" || typeof parsed.previous !== "object") {
      throw new Error("unexpected shape: response body has no `previous` object");
    }
    if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "raid_bosses.json"), text);
    recordFetchMeta(rawDir, "raid_bosses.json", Buffer.byteLength(text, "utf-8"));
    return { previous: parsed.previous, current: parsed.current ?? {}, source: "live" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { previous: {}, current: {}, source: "error", error: message };
  }
}

/**
 * The 16 Bulbapedia "List of Raid Boss changes in ..." archive pages this
 * project's raidHistory.json Bulbapedia backfill (2026-09-07) is built from —
 * see sync-data.ts's "Bulbapedia archive union" section. Coverage ends at
 * 2023: Niantic-era Bulbapedia editors stopped maintaining a dedicated page
 * per year/season after that, and there is no 2024/2025/2026 page to add.
 * Deliberately the `in <page>` title form, NOT `(<page>)` — the parenthetical
 * form is a redirect page that returns no usable wikitext via `action=raw`
 * (confirmed 2026-09-07; see git history for the earlier attempt this
 * tripped up).
 */
export const BULBAPEDIA_RAID_ARCHIVE_PAGES = [
  "2017-2018",
  "2019",
  "2020",
  "2021",
  "2022",
  "Season_1",
  "Season_2",
  "Season_3",
  "Season_4",
  "Season_5",
  "Season_6",
  "Season_7",
  "Season_8",
  "Season_9",
  "Season_10",
  "Season_11",
] as const;

const BULBAPEDIA_USER_AGENT = "pogo-analyzer-data-sync raid-history-bulbapedia-archive (advisory, non-commercial)";

export interface BulbapediaRaidArchiveFetchResult {
  /** Page slug -> raw wikitext, only for pages that fetched successfully. */
  pages: Record<string, string>;
  /** Page slugs that failed to fetch or came back empty — logged as a WARNING, never fatal. */
  failedPages: string[];
  source: "live" | "partial" | "error";
  error?: string;
}

/**
 * Fetches all 16 Bulbapedia raid-archive pages (BULBAPEDIA_RAID_ARCHIVE_PAGES)
 * live and caches the combined result under data/raw/bulbapedia_raid_history.json
 * (same discipline as every other endpoint — see recordFetchMeta), one
 * fetch per page with the project's standard 150ms delay between sequential
 * live fetches. Best-effort per page, same philosophy as
 * fetchAndCacheRaidBossesPrevious: this is a purely ADDITIVE historical
 * enrichment (see sync-data.ts's "Bulbapedia archive union" section), so one
 * bad page should never fail the whole sync — a page that 404s, errors, or
 * comes back empty is skipped and named in `failedPages` rather than thrown.
 * `source` is "live" only if every page succeeded, "partial" if some did,
 * "error" only if literally none did (in which case the Bulbapedia archive
 * contributes zero entries this run, exactly like a fetchAndCacheRaidBossesPrevious
 * failure does for its own source).
 */
export async function fetchAndCacheBulbapediaRaidArchive(rawDir: string): Promise<BulbapediaRaidArchiveFetchResult> {
  const pages: Record<string, string> = {};
  const failedPages: string[] = [];

  for (const page of BULBAPEDIA_RAID_ARCHIVE_PAGES) {
    const url = `https://bulbapedia.bulbagarden.net/w/index.php?title=List_of_Raid_Boss_changes_in_${page}&action=raw`;
    try {
      const response = await fetch(url, { headers: { "User-Agent": BULBAPEDIA_USER_AGENT } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const text = await response.text();
      if (!text || text.trim().length === 0) throw new Error("empty response body");
      pages[page] = text;
    } catch {
      failedPages.push(page);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  if (Object.keys(pages).length === 0) {
    return { pages: {}, failedPages, source: "error", error: "all 16 Bulbapedia raid-archive pages failed to fetch" };
  }

  if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
  const cacheBody = JSON.stringify({ fetchedAt: new Date().toISOString(), failedPages, pages }, null, 2);
  writeFileSync(join(rawDir, "bulbapedia_raid_history.json"), cacheBody);
  recordFetchMeta(rawDir, "bulbapedia_raid_history.json", Buffer.byteLength(cacheBody, "utf-8"));

  return { pages, failedPages, source: failedPages.length === 0 ? "live" : "partial" };
}

/**
 * The single Bulbapedia "List of Shadow Raid Boss changes" page — 2026-09-08
 * shadow-variant durability task (see sync-data.ts's "Shadow-variant durable
 * synthesis" section). Unlike BULBAPEDIA_RAID_ARCHIVE_PAGES' 16 per-year/
 * season pages, Shadow Raids are recent enough (debuted Season 10, 2023) to
 * fit on one page — confirmed 2026-09-08 by direct wikitext inspection: 18
 * `{{Lop/raid/GO|...}}` rows / 17 distinct species across two `==Season==`
 * sections, each species row carrying `shadow=yes` and a bare (non-"Shadow
 * "-prefixed) name — the "Shadow" head token appears once per tier group
 * instead (`{{lop/raid/GO-head|Shadow|1}}`, `|3}}`, `|5}}`), a shape
 * `BULBAPEDIA_RAID_ARCHIVE_PAGES`' own head-token parser (which expects a
 * bare "1".."5" or "Mega"/"Primal" token) doesn't recognize — hence the
 * dedicated, deliberately simpler parseBulbapediaShadowRaidPage in
 * ./bulbapediaRaidArchive.ts rather than teaching the general parser a third
 * head shape for a single page. Treated as thin CORROBORATION only (all 17
 * distinct species independently confirmed 2026-09-08 to already be a subset
 * of Pokebattler's own 105-entry `_SHADOW_LEGACY` archive) — never the sole
 * evidence source a shadow variant depends on, though the pipeline doesn't
 * special-case that; it just adds to the same evidence set.
 */
export const BULBAPEDIA_SHADOW_RAID_ARCHIVE_PAGE = "List_of_Shadow_Raid_Boss_changes";

export interface BulbapediaShadowRaidArchiveFetchResult {
  wikitext: string | null;
  source: "live" | "error";
  error?: string;
}

/**
 * Fetches the single BULBAPEDIA_SHADOW_RAID_ARCHIVE_PAGE live and caches it
 * to data/raw/bulbapedia_shadow_raid_history.json (same discipline as
 * fetchAndCacheBulbapediaRaidArchive) — best-effort: a fetch failure here
 * just means zero corroboration from this source this run, never a failed
 * sync (see sync-data.ts's shadow-durability section for how the other two
 * evidence sources cover this independently).
 */
export async function fetchAndCacheBulbapediaShadowRaidArchive(rawDir: string): Promise<BulbapediaShadowRaidArchiveFetchResult> {
  const url = `https://bulbapedia.bulbagarden.net/w/index.php?title=${BULBAPEDIA_SHADOW_RAID_ARCHIVE_PAGE}&action=raw`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": BULBAPEDIA_USER_AGENT } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const text = await response.text();
    if (!text || text.trim().length === 0) throw new Error("empty response body");

    if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
    const cacheBody = JSON.stringify({ fetchedAt: new Date().toISOString(), wikitext: text }, null, 2);
    writeFileSync(join(rawDir, "bulbapedia_shadow_raid_history.json"), cacheBody);
    recordFetchMeta(rawDir, "bulbapedia_shadow_raid_history.json", Buffer.byteLength(cacheBody, "utf-8"));

    return { wikitext: text, source: "live" };
  } catch (e) {
    return { wikitext: null, source: "error", error: e instanceof Error ? e.message : String(e) };
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
