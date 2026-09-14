import {
  SpeciesRegistry,
  defaultRaidTierForSpecies,
  isKnownRaidTier,
  type ChargedMove,
  type EvolutionOption,
  type FastMove,
  type GatedEvolutionOption,
  type PowerUpCostTable,
  type RaidTier,
  type SpeciesDefinition,
} from "@pogo-analyzer/engine";

// Bundled at build time from the data layer's normalized output (data-sync's
// job, not this package's — see CLAUDE.md). 1012 real species (964 Normal-form
// + 48 real mega/primal attackers) plus the 12 currently-active raid bosses
// from a live community raid feed. Vite supports JSON module imports out of
// the box; the relative path reaches outside packages/web on purpose (see
// vite.config.ts's server.fs.allow and this package's tsconfig.json for the
// matching allowances).
//
// species.json itself is NOT imported here (PLAN_species_moves_split.md
// Stage 1b) — it remains the canonical, byte-for-byte source of truth for
// every other script/checker, but this registry now reads its two derived
// siblings instead: speciesCore.json (species.json minus fastMoves/
// chargedMoves) and speciesMoves.json (a deduped move dictionary plus
// per-species id lists). scripts/check-species-split.mjs (npm run check)
// asserts the pair re-joins to exactly species.json, so the split can't
// silently drift. Both imports are still STATIC — Stage 2 (making the moves
// payload a dynamic import behind a loading gate) is a deliberately separate,
// not-yet-started piece of work; see the plan before changing that.
import speciesCoreData from "../../../data/normalized/speciesCore.json";
import speciesMovesData from "../../../data/normalized/speciesMoves.json";
import activeRaidsData from "../../../data/normalized/activeRaids.json";
import raidHistoryData from "../../../data/normalized/raidHistory.json";
// The Power-Up Optimizer's cost table — the engine's own PowerUpCostTable
// shape plus two provenance-only fields (sourceUrl/fetchedAt) this module
// strips before exporting, since PowerUpCostTable itself declares neither.
import powerUpCostsData from "../../../data/normalized/powerUpCosts.json";
// activeRaids.json's freshness sibling (data-sync, 2026-09-14) — see that
// file's own generation comment in scripts/sync-data.ts for exactly what
// each field means. Bundled at build time same as every other file above:
// this is a STATIC site, so "how current is the raid roster I'm showing"
// freezes at build time too, and this is the one place that fact can be
// read from without a network call. Surfaced via raidDataFreshness() below.
import normalizedMetaData from "../../../data/normalized/_meta.json";

export interface RawActiveRaidEntry {
  raidName: string;
  tier: string;
  speciesId: string | null;
  isApproximate: boolean;
}

/**
 * One row of the accumulate-only raid-history log data-sync started writing
 * 2026-09-07 — see raidHistory.json's own generation in scripts/sync-data.ts.
 * `source` is provenance, not decoration — never flatten these three into a
 * single label (see pastRaidBossOptions' badge guidance):
 *
 * - "live-feed": this pipeline actually observed the raid in the live feed
 *   at some point — firstSeenAt/lastSeenAt are real dates.
 * - "researched-tier": seeded from a hand-researched `lastKnownRaidTier`
 *   citation, never actually seen live by this pipeline.
 * - "pogoapi-previous": a real, sourced historical encounter pulled from
 *   pogoapi's raid_bosses.json `previous` archive block — a genuine past
 *   raid boss, but never observed live BY THIS PIPELINE, and carrying no
 *   date information at all (pogoapi's archive doesn't record when a past
 *   raid was active). Do not assume firstSeenAt/lastSeenAt on one of these
 *   rows means anything chronological — see pastRaidBossOptions' sort
 *   comment.
 * - "bulbapedia-archive": added 2026-09-07 alongside the era-HP backfill
 *   task — a real, sourced historical encounter parsed from Bulbapedia's
 *   "List of Raid Boss changes" archive pages. Same evidentiary shape as
 *   "pogoapi-previous" (a genuine past encounter, never observed live by
 *   this pipeline, no real date — see the same identical-placeholder-
 *   timestamp caveat) and treated identically everywhere below
 *   (resolvePastRaidTier, pastRaidBossOptions' sort, and the UI's "past
 *   (archive)" badge) rather than given a third parallel branch, since the
 *   two sources make the same kind of claim about the same kind of fact.
 *   data-sync's own union-resolution step picks whichever of the two
 *   sources reports the HIGHER (more historically-accurate) tier per
 *   species when both exist for it — see sync-data.ts's
 *   archiveUnionResolved — so a given species is never double-listed under
 *   both sources here.
 * - "pokebattler-legacy": added 2026-09-08 (65 rows) — a real past raid
 *   appearance recorded in Pokebattler's own historical archive. Same
 *   evidentiary shape as "pogoapi-previous"/"bulbapedia-archive" (a genuine
 *   past encounter, never observed live by this pipeline, no real date) and
 *   folded into the same archive handling everywhere below for that reason.
 *   Where it differs from those two: Pokebattler re-maps its history onto
 *   TODAY's tier labels rather than preserving the tier/HP that was actually
 *   live at the time, so it carries neither a real date NOR a usable
 *   `eraHp` — confirmed 0 of 65 rows have one. Its `tier` is still trusted
 *   as the recorded fact for this encounter (see resolvePastRaidTier), but
 *   there is no historical-HP claim to pass through, so `eraHp` is simply
 *   never set for these rows (falls through to the engine's ordinary
 *   tier-based HP, same as any archive row that lacks one).
 *
 * `eraHp` (added 2026-09-07, era-HP backfill task): the real historical max
 * HP for THIS specific recorded encounter, when a source could resolve one
 * — currently only ever set by "pogoapi-previous"/"bulbapedia-archive" rows
 * (neither "live-feed"/"researched-tier" has ever supplied one, and
 * "pokebattler-legacy" structurally can't — see above; see
 * RaidHistoryEntry.eraHp's own doc comment in scripts/sync-data.ts for the
 * full provenance). Absent (never `0`/`null`) means no source recorded a
 * usable HP for this row — see PastRaidBossOption.eraHp for how that
 * absence is handled downstream (never defaulted to a current-tier guess
 * here; that's the caller's job, and only at the one point it actually
 * needs a number to hand the engine).
 */
export interface RawRaidHistoryEntry {
  speciesId: string;
  raidName: string;
  tier: string;
  firstSeenAt: string;
  lastSeenAt: string;
  source: "live-feed" | "researched-tier" | "pogoapi-previous" | "bulbapedia-archive" | "pokebattler-legacy";
  eraHp?: number;
}

/**
 * data-sync's own per-branch shape for `evolutionCandyCosts` on the SYNCED
 * (pre-engine) species record — NOT part of the engine's `SpeciesDefinition`
 * at all (see that interface's `evolutions`/`gatedEvolutions` fields' own
 * "RESOLUTION CONTRACT" doc comments in packages/engine/src/types.ts). Mirrors
 * scripts/sync-data.ts's `EvolutionCandyCostEntry` exactly — this interface
 * exists purely so this module can type the extra JSON field before splitting
 * it into `.evolutions` (candyCostOnly: true) / `.gatedEvolutions`
 * (candyCostOnly: false). `noCandyCostViaTrade` is read here but deliberately
 * never carried into `GatedEvolutionOption` — see that interface's own doc
 * comment for why (this project has no "was this individual traded" input).
 */
interface RawEvolutionCandyCostEntry {
  toId: string;
  form?: string;
  candyCost?: number;
  candyCostPurified?: number;
  candyCostOnly: boolean;
  noCandyCostViaTrade?: boolean;
  requiresItem?: string;
  requiresItemCount?: number;
  requiresLureItem?: string;
  requiresBuddy?: boolean;
  requiresBuddyDistanceKm?: number;
  requiresGender?: string;
  requiresDaytime?: boolean;
  requiresNighttime?: boolean;
  requiresDuskPeriod?: boolean;
  requiresFullMoon?: boolean;
  requiresUpsideDown?: boolean;
  requiresQuest?: boolean;
}

type RawSpeciesRecord = SpeciesDefinition & { evolutionCandyCosts?: RawEvolutionCandyCostEntry[] };

/**
 * `speciesCore.json`'s per-entry shape: exactly `RawSpeciesRecord` minus the
 * two move arrays, which live in `speciesMoves.json` instead (see
 * RawSpeciesMovesPayload below and `fillSpeciesMoves`'s doc comment for the
 * join). Every other field — including `evolutionCandyCosts`, which
 * `resolveEvolutions` still reads off these objects — is untouched.
 */
type RawSpeciesCoreRecord = Omit<RawSpeciesRecord, "fastMoves" | "chargedMoves">;

/**
 * `speciesMoves.json`'s shape — a deduped move dictionary plus per-species id
 * lists, split out of `species.json` at build time by
 * `scripts/sync-data/speciesSplit.ts`'s `deriveSpeciesSplit` (see
 * PLAN_species_moves_split.md Stage 1). 308 distinct move objects (80 fast +
 * 228 charged) cover all 13,061 (species, move) occurrences in the synced
 * data — `deriveSpeciesSplit` ASSERTS every occurrence of a given move id is
 * byte-identical JSON across every species that carries it and throws the
 * sync if not; that assertion is the precondition that makes sharing move
 * OBJECT REFERENCES across species (see `fillSpeciesMoves` below) safe.
 * `bySpecies[id].f`/`.c` list that species' fast/charged move ids in their
 * original `species.json` array order.
 */
interface RawSpeciesMovesPayload {
  fastMoves: Record<string, FastMove>;
  chargedMoves: Record<string, ChargedMove>;
  bySpecies: Record<string, { f: string[]; c: string[] }>;
}

const RAW_SPECIES_CORE = speciesCoreData as unknown as RawSpeciesCoreRecord[];
const RAW_SPECIES_MOVES = speciesMovesData as unknown as RawSpeciesMovesPayload;
const RAW_ACTIVE_RAIDS = activeRaidsData as unknown as RawActiveRaidEntry[];
const RAW_RAID_HISTORY = raidHistoryData as unknown as RawRaidHistoryEntry[];

/**
 * Splits every registered species' `evolutionCandyCosts` (data-sync's raw,
 * unresolved per-branch array — see RawEvolutionCandyCostEntry's own doc
 * comment) into `SpeciesDefinition.evolutions` (candyCostOnly branches,
 * unconditionally committable) and `.gatedEvolutions` (everything else —
 * gated on an item, a lure, buddy distance, gender, time-of-day, or a quest),
 * resolving each branch's `toId` into the ALREADY-REGISTERED full
 * `SpeciesDefinition` object — the same id-to-object resolution pattern
 * `resolveMegaBaseCandyFamilyId`/`resolveMegaBaseKmBuddyDistance` already use
 * below. MUST run AFTER every species is registered (a branch can point
 * forward or backward in `RAW_SPECIES_CORE`' own array order — Eevee's branches
 * all point forward to its eeveelutions, for instance), and mutates the
 * ALREADY-REGISTERED species objects in place (`SpeciesRegistry.register`
 * stores the exact reference handed to it, never a copy — see gamemaster.ts),
 * so every `EvolutionOption`/`GatedEvolutionOption.to` reference below and
 * every OTHER reader of `speciesRegistry.get(id)` observe the same mutated
 * object.
 *
 * A `toId` that fails to resolve (a resync dropped/renamed a target species)
 * is silently skipped for that one branch — never guessed, never thrown —
 * matching this module's existing "degrade a stale reference rather than
 * crash the app" convention (activeRaidBossOptions, resolveBossTarget, etc).
 */
function resolveEvolutions(registry: SpeciesRegistry, rawSpecies: RawSpeciesCoreRecord[]): void {
  for (const raw of rawSpecies) {
    const rawCosts = raw.evolutionCandyCosts;
    if (!rawCosts || rawCosts.length === 0) continue;
    if (!registry.has(raw.id)) continue;
    const species = registry.get(raw.id);

    const evolutions: EvolutionOption[] = [];
    const gatedEvolutions: GatedEvolutionOption[] = [];
    for (const branch of rawCosts) {
      if (!registry.has(branch.toId)) continue;
      const to = registry.get(branch.toId);
      if (branch.candyCostOnly) {
        // EvolutionOption.candyCost is required (never gated) — every real
        // candyCostOnly:true branch in the synced data carries a candyCost
        // (confirmed 467/467, 2026-09-10), but fall back to 0 rather than
        // `undefined` if a future sync ever omits it, since this array is
        // trusted as "unconditionally committable" everywhere it's read.
        evolutions.push({ to, candyCost: branch.candyCost ?? 0 });
      } else {
        gatedEvolutions.push({
          to,
          candyCost: branch.candyCost,
          requiresItem: branch.requiresItem,
          requiresItemCount: branch.requiresItemCount,
          requiresLureItem: branch.requiresLureItem,
          requiresBuddy: branch.requiresBuddy,
          requiresBuddyDistanceKm: branch.requiresBuddyDistanceKm,
          requiresGender: branch.requiresGender,
          requiresDaytime: branch.requiresDaytime,
          requiresNighttime: branch.requiresNighttime,
          requiresDuskPeriod: branch.requiresDuskPeriod,
          requiresFullMoon: branch.requiresFullMoon,
          requiresUpsideDown: branch.requiresUpsideDown,
          requiresQuest: branch.requiresQuest,
        });
      }
    }
    if (evolutions.length > 0) species.evolutions = evolutions;
    if (gatedEvolutions.length > 0) species.gatedEvolutions = gatedEvolutions;
  }
}

/**
 * Fills every already-registered species' `fastMoves`/`chargedMoves` arrays
 * from `speciesMoves.json`'s deduped dictionaries (RawSpeciesMovesPayload) —
 * PLAN_species_moves_split.md Stage 1b, the `registry.ts` half of the split
 * whose data half (`speciesCore.json`/`speciesMoves.json` themselves) landed
 * in Stage 1a. Sits beside `resolveEvolutions` and inherits its contract
 * VERBATIM: `SpeciesRegistry.register` stores the exact reference handed to
 * it, never a copy, so mutating an already-registered species object in
 * place here is observed by every other reader of `speciesRegistry.get(id)`.
 * MUST run after every species is registered (`buildRegistry` calls this
 * after the register loop, same ordering requirement as `resolveEvolutions`).
 *
 * A `bySpecies[id].f`/`.c` entry that resolves to no dictionary entry (a
 * resync dropped/renamed a move) is skipped for that ONE move only — never
 * guessed, never thrown — matching `resolveEvolutions`' "degrade a stale
 * reference rather than crash the app" convention. A species with no
 * `bySpecies` entry at all keeps whatever it was registered with (empty
 * arrays — see `buildRegistry`).
 *
 * ⚠️ **The 308 move objects here are SHARED BY REFERENCE across every
 * species that carries that move id** — that sharing IS the saving (13,061
 * per-species occurrences collapse to 308 objects; see speciesMoves.json's
 * own generation comment in scripts/sync-data.ts for the dedup-safety
 * assertion this relies on). Nothing in this codebase mutates a move object
 * today — confirmed: `megaLevel.ts`'s `chargedMoveAtMegaLevel` returns a
 * COPY (`{...move, power}`), never mutates in place. **If that ever changes,
 * an in-place mutation of a move object would silently corrupt every other
 * species that carries that same move.** Copy before mutating, always.
 */
function fillSpeciesMoves(registry: SpeciesRegistry, payload: RawSpeciesMovesPayload): void {
  for (const id of Object.keys(payload.bySpecies)) {
    if (!registry.has(id)) continue;
    const ids = payload.bySpecies[id];
    if (!ids) continue;

    const fastMoves: FastMove[] = [];
    for (const moveId of ids.f) {
      const move = payload.fastMoves[moveId];
      if (move) fastMoves.push(move);
    }
    const chargedMoves: ChargedMove[] = [];
    for (const moveId of ids.c) {
      const move = payload.chargedMoves[moveId];
      if (move) chargedMoves.push(move);
    }

    const species = registry.get(id);
    species.fastMoves = fastMoves;
    species.chargedMoves = chargedMoves;
  }
}

/**
 * Single memoized registry for the whole app: every real species from the
 * data layer's normalized output, registered as-is. This project previously
 * also registered 4 hand-defined hypothetical fixtures (Mega Raichu X/Y,
 * Mega Skarmory, Primal Kyogre) via `registerHypothetical` — those fixtures
 * have since been deleted from the engine entirely (product direction: no
 * replacement), so nothing is registered as hypothetical here anymore. The
 * `isHypothetical` field and its picker badge remain generic infrastructure
 * on `SpeciesDefinition`/`SpeciesRegistry` for any future speculative real
 * data, not dead code tied to these 4 specifically.
 *
 * Each species is registered with EMPTY `fastMoves`/`chargedMoves` arrays
 * (`speciesCore.json` doesn't carry them at all — see RawSpeciesCoreRecord),
 * then `resolveEvolutions` and `fillSpeciesMoves` each run AFTER every
 * species is registered, mutating the registered objects in place — see
 * their own doc comments for why order matters and what each mutates. Still
 * fully synchronous, same as before the split: both `speciesCoreData` and
 * `speciesMovesData` are static imports (Stage 2 of the plan, making the
 * moves payload a dynamic import behind a loading gate, has not started).
 */
function buildRegistry(): SpeciesRegistry {
  const registry = new SpeciesRegistry();
  for (const core of RAW_SPECIES_CORE) {
    const species: RawSpeciesRecord = { ...core, fastMoves: [], chargedMoves: [] };
    registry.register(species);
  }
  resolveEvolutions(registry, RAW_SPECIES_CORE);
  fillSpeciesMoves(registry, RAW_SPECIES_MOVES);
  return registry;
}

export const speciesRegistry = buildRegistry();

/** data/normalized/_meta.json's one entry today — see that file's generation comment (scripts/sync-data.ts) for the fetchedAt/writtenAt distinction. */
export interface RaidDataFreshness {
  /**
   * When the live ScrapedDuck feed was last successfully fetched — null only
   * if it has never once succeeded on this checkout. On a run that fell back
   * to a cached file (source !== "scrapedduck"), this is NOT "now" — it
   * stays whatever an earlier successful run recorded, so a stale fallback
   * correctly reads as stale.
   */
  fetchedAt: string | null;
  /** When activeRaids.json was last (re)written to disk — always "now" for whichever sync produced the currently-committed file, regardless of source. */
  writtenAt: string;
  /**
   * "scrapedduck": the live feed itself succeeded this sync. "fallback-file":
   * the live feed failed but a previously-cached roster file was reused.
   * "fallback-file-created-empty": the live feed AND the local fallback both
   * failed — the roster below may be missing entries entirely, not just
   * stale ones.
   *
   * NOTE: deliberately placed here rather than right after the imports
   * (where it originally lived) — `check-raid-history-sources.mjs` locates
   * `RawActiveRaidEntry`'s sibling `RawRaidHistoryEntry.source` union via a
   * naive "first `source: \"...\" | \"...\";` match in this file" regex, and
   * this interface's OWN `source` field (a completely different, much
   * smaller union) matched first when declared earlier in the file —
   * confirmed live, a real false-positive FAIL this move fixes.
   */
  source: "scrapedduck" | "fallback-file" | "fallback-file-created-empty";
}

const NORMALIZED_META = normalizedMetaData as unknown as { "activeRaids.json": RaidDataFreshness };

/** How current the active-raid roster (activeRaidBossOptions/targetPickerOptions/BossSetPanel) is — see RaidDataFreshness's own field docs. */
export function raidDataFreshness(): RaidDataFreshness {
  return NORMALIZED_META["activeRaids.json"];
}

export interface SpeciesOption {
  id: string;
  name: string;
  isHypothetical?: boolean;
  /** See SpeciesDefinition.isShadow — 8 real synced species carry this (Shadow raid targets synthesized from the live feed); separately, every attacker picker has a general Shadow toggle that applies the multipliers to any species. */
  isShadow?: boolean;
  imageUrl?: string;
}

/** All ~1016 registered species, for a generic searchable picker. */
export function allSpeciesOptions(): SpeciesOption[] {
  return speciesRegistry
    .all()
    .map((s) => ({ id: s.id, name: s.name, isHypothetical: s.isHypothetical, isShadow: s.isShadow, imageUrl: s.imageUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface RaidBossOption {
  id: string;
  raidName: string;
  tier: string;
  isApproximate: boolean;
  imageUrl?: string;
}

/**
 * The currently-active raid roster, filtered to entries that resolve to a
 * registered species (a `speciesId: null` entry means no usable stat data
 * exists yet; a resync could also produce an id this registry no longer has —
 * both cases are dropped here so nothing selectable can crash the app).
 */
export function activeRaidBossOptions(): RaidBossOption[] {
  return RAW_ACTIVE_RAIDS.filter(
    (r): r is RawActiveRaidEntry & { speciesId: string } => r.speciesId !== null && speciesRegistry.has(r.speciesId),
  ).map((r) => ({
    id: r.speciesId,
    raidName: r.raidName,
    tier: r.tier,
    isApproximate: r.isApproximate,
    imageUrl: speciesRegistry.get(r.speciesId).imageUrl,
  }));
}

export interface PastRaidBossOption {
  id: string;
  raidName: string;
  /**
   * The tier this boss will actually be SIMULATED at, and the same value the
   * tier checkbox filter matches against and the table renders — that
   * three-way invariant (filtered-on tier === displayed tier === simulated
   * tier) holds for every row here regardless of source. HOW it's resolved
   * differs by source, and that split is deliberate, not an inconsistency:
   *
   * - "live-feed" / "researched-tier": resolved through the engine's own
   *   defaultRaidTierForSpecies, i.e. the identical value every OTHER tab
   *   (IV Breakpoints / Attack-Defense / Comparator / Team Raid) lands on
   *   for this same species today. Deliberately NOT raidHistory.json's own
   *   stored tier string — see recordedTier. Those two agree today, but they
   *   are independently maintained and can permanently diverge: sync-data.ts's
   *   history seed step skips any species already present (`if
   *   (raidHistoryById.has(s.id)) continue`), so a "researched-tier" row is
   *   frozen at whatever lastKnownRaidTier said the day it was first written
   *   and is never refreshed, while species.lastKnownRaidTier keeps tracking
   *   a corrected allowlist citation. Trusting the frozen string would make
   *   the Species Report simulate a boss at a different tier than every
   *   other tab uses for that same boss right now — and tier drives raid HP
   *   (9000 vs 25000) and the attack/defense multiplier, so that would be a
   *   large silent disagreement, not a rounding difference. Resolving it
   *   here keeps every tab in agreement by construction.
   *
   * - "pogoapi-previous" / "bulbapedia-archive" / "pokebattler-legacy": the
   *   OPPOSITE reasoning applies, on purpose. All three sources each model
   *   one specific real historical encounter (pulled from pogoapi's
   *   raid_bosses.json `previous` archive, parsed from Bulbapedia's
   *   raid-boss-change pages, or pulled from Pokebattler's own historical
   *   archive) — the RECORDED tier IS the fact being modelled (a species
   *   that was a 3-Star boss in that encounter should simulate at 3,600 HP,
   *   not whatever tier the species happens to default to today). So this
   *   branch trusts `recordedTier` directly (falling back to
   *   defaultRaidTierForSpecies only if the raw tier string is somehow one
   *   this engine doesn't recognize — a defensive fallback, not the expected
   *   path). See resolvePastRaidTier. Confirmed this isn't cosmetic for ANY
   *   of the three, not just assumed: a one-off check against the real data
   *   found 203/470 "pogoapi-previous" rows, 32/75 "bulbapedia-archive"
   *   rows, and 26/65 "pokebattler-legacy" rows actually disagree with
   *   defaultRaidTierForSpecies today — all real, load-bearing divergence
   *   rates, not theoretically-different code that happens to always agree.
   *
   *   A DOCUMENTED consequence of this split: one of these rows' `tier` can
   *   legitimately differ from what the IV Breakpoints/Attack-Defense/
   *   Comparator/Team Raid tabs show for the SAME species today — because
   *   those tabs answer "what tier is this species right now," while a row
   *   here answers "what tier was THIS PAST ENCOUNTER." Two different
   *   questions that happen to share a species. That is an intentional
   *   divergence, not a bug to "fix" by unifying it with the other two
   *   sources' resolution — don't be tempted to simplify this branch away
   *   later.
   */
  tier: RaidTier;
  /**
   * The raw tier string raidHistory.json recorded when this boss was last
   * observed/seeded — provenance only. For "live-feed"/"researched-tier" this
   * is never fed to the simulation (kept only so a divergence from `tier`
   * stays visible rather than silently discarded); for "pogoapi-previous"/
   * "bulbapedia-archive"/"pokebattler-legacy" it IS what `tier` resolves to
   * (see above), so the two agree by construction for all three of those
   * archive sources.
   */
  recordedTier: string;
  /**
   * The real historical max HP for THIS specific recorded encounter, passed
   * straight through from RawRaidHistoryEntry.eraHp with zero interpretation
   * — see that field's own doc comment for exactly which sources ever set
   * it. Absent (never `0`/`null`) means no source recorded a usable HP for
   * this encounter; the correct handling of that absence is "no override at
   * all" (letting the engine's ordinary tier-based HP apply), decided by
   * SpeciesReportView.tsx at the one point it actually calls the engine —
   * NEVER defaulted to a raidTierStats value here, which would launder
   * today's guessed number as if it had been sourced, exactly the failure
   * mode this field exists to avoid. Named `eraHp`, not e.g. `bossMaxHp` or
   * `hp`, specifically so it reads as obviously distinct from `tier`/
   * `recordedTier` above — this is a raw HP number, not a tier label, and
   * per the engine's own bossMaxHpOverride contract it affects ONLY the
   * boss's max HP, never the attack/defense multiplier `tier` drives.
   */
  eraHp?: number;
  lastSeenAt: string;
  source: "live-feed" | "researched-tier" | "pogoapi-previous" | "bulbapedia-archive" | "pokebattler-legacy";
  imageUrl?: string;
}

/**
 * Resolves the tier one raid-history row should be simulated/filtered/
 * displayed at — see PastRaidBossOption.tier for the full two-branch
 * reasoning this implements. Split into its own function (rather than
 * inlined in the `.map` below) so the source-dependent branch is the one
 * place this logic lives, not duplicated at every call site.
 */
function resolvePastRaidTier(entry: RawRaidHistoryEntry): RaidTier {
  if (
    (entry.source === "pogoapi-previous" || entry.source === "bulbapedia-archive" || entry.source === "pokebattler-legacy") &&
    isKnownRaidTier(entry.tier)
  ) {
    return entry.tier;
  }
  return defaultRaidTierForSpecies(speciesRegistry.get(entry.speciesId));
}

/**
 * Bosses this pipeline has RECORDED before and that are NOT part of the
 * currently-active roster right now — i.e. "raids that recently rotated out,
 * were seeded from research, or appear in a historical archive, that this
 * tool still has usable stat data for." Five provenance tiers coexist here,
 * from strongest to weakest evidence (see RawRaidHistoryEntry's `source` doc
 * comment for the full per-value description):
 *
 * - "live-feed": this pipeline's own live raid feed actually observed it,
 *   accumulating since 2026-09-07 only. Has real firstSeenAt/lastSeenAt dates.
 * - "pogoapi-previous" / "bulbapedia-archive" / "pokebattler-legacy": real,
 *   sourced historical encounters backfilled from pogoapi's
 *   raid_bosses.json `previous` archive, Bulbapedia's raid-boss-change
 *   pages, and Pokebattler's own historical archive respectively — together
 *   these are what make this list roughly comprehensive (~500+ entries)
 *   rather than the live-feed-only ~15. None of the three carries real date
 *   information (all stamp every row with the sync run's own placeholder
 *   timestamp), and all exclude EX Raids (no modern tier equivalent exists
 *   to simulate them at). Most "pogoapi-previous"/"bulbapedia-archive" rows
 *   also carry a real `eraHp` — "pokebattler-legacy" never does, since
 *   Pokebattler re-maps its history onto today's tier labels rather than
 *   preserving the HP that was actually live at the time — see
 *   PastRaidBossOption.eraHp.
 * - "researched-tier": seeded from a hand-researched lastKnownRaidTier
 *   citation — never observed live and not present in any archive either
 *   (typically a very recent mega/primal debut no source has caught up to
 *   yet).
 *
 * A gap in this list (a species that really was a past boss but isn't here
 * at all) means none of these five sources ever recorded it — not "it was
 * never a real raid boss."
 *
 * Same defensive filtering as activeRaidBossOptions — a resync could produce
 * a speciesId this registry no longer has, and that must never crash the
 * app — plus the additional filter against the CURRENT active roster, so a
 * boss that is live right now is never double-listed as also "past."
 */
const DATELESS_RAID_HISTORY_SOURCES = new Set<RawRaidHistoryEntry["source"]>([
  "pogoapi-previous",
  "bulbapedia-archive",
  "pokebattler-legacy",
]);

export function pastRaidBossOptions(): PastRaidBossOption[] {
  const activeIds = new Set(activeRaidBossOptions().map((r) => r.id));
  return RAW_RAID_HISTORY.filter((r) => speciesRegistry.has(r.speciesId) && !activeIds.has(r.speciesId))
    .sort((a, b) => {
      // All archive sources carry no real chronology (see the doc comment
      // above) — sorting them by lastSeenAt would either be meaningless (if
      // data-sync fills in some placeholder timestamp) or, worse, would
      // interleave them among the genuinely-dated live-feed/researched-tier
      // rows as if their date were comparable. Instead: real-dated rows sort
      // first (newest lastSeenAt first, today's behavior, unchanged), then
      // every dateless archive row after them, ordered alphabetically by raid
      // name for a stable, readable list rather than an arbitrary one.
      const aDated = !DATELESS_RAID_HISTORY_SOURCES.has(a.source);
      const bDated = !DATELESS_RAID_HISTORY_SOURCES.has(b.source);
      if (aDated !== bDated) return aDated ? -1 : 1;
      if (aDated) return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      return a.raidName.localeCompare(b.raidName);
    })
    .map((r) => ({
      id: r.speciesId,
      raidName: r.raidName,
      tier: resolvePastRaidTier(r),
      recordedTier: r.tier,
      // Passed through as-is — never defaulted here (see the field's own doc
      // comment on why "absent" must stay absent all the way to the one call
      // site that turns it into an engine override).
      eraHp: r.eraHp,
      lastSeenAt: r.lastSeenAt,
      source: r.source,
      imageUrl: speciesRegistry.get(r.speciesId).imageUrl,
    }));
}

/** Active raid entries with no usable stat data yet — shown disabled, never selectable. */
export function unmatchedActiveRaids(): { raidName: string; tier: string }[] {
  return RAW_ACTIVE_RAIDS.filter((r) => r.speciesId === null || !speciesRegistry.has(r.speciesId)).map((r) => ({
    raidName: r.raidName,
    tier: r.tier,
  }));
}

/**
 * Which real raid tier a species currently counts as, per the live raid
 * feed — feeds comparison.ts's SustainedComparisonInputs.bossRaidTier so a
 * real (non-precomputed) boss's effective attack/defense/HP use the correct
 * per-tier numbers (see raidBoss.ts's RAID_TIER_TABLE) instead of always
 * assuming DEFAULT_REAL_RAID_TIER. Returns null when the species isn't a CURRENTLY
 * active raid target at all (e.g. picked from the general species picker
 * rather than the live raid list, or a hypothetical fixture) — the caller
 * falls back to the engine's own DEFAULT_REAL_RAID_TIER in that case, same
 * as omitting bossRaidTier entirely.
 *
 * Deliberately NOT surfaced as a Scenario field: a boss's tier is derived
 * data about the target (same as its baseAttack/imageUrl/etc, all resolved
 * fresh from `target` on every load), not an independent user-facing
 * setting with its own control in the UI — there is no tier picker to
 * round-trip. If a future request adds an explicit tier override control,
 * that setting (not this derivation) is what would need a new Scenario
 * field.
 */
export function raidTierForSpeciesId(id: string): RaidTier | null {
  const entry = RAW_ACTIVE_RAIDS.find((r) => r.speciesId === id);
  if (!entry) return null;
  return isKnownRaidTier(entry.tier) ? entry.tier : null;
}

/**
 * Strips one of the four real mega/primal id suffixes (`-mega`, `-mega-x`,
 * `-mega-y`, `-primal`) to get a species id's BASE form's id — `null` when
 * `id` doesn't carry one of those suffixes at all (not a mega/primal id).
 * WEB-LAYER, string-convention resolution only — see
 * `resolveMegaBaseSpecies`'s own doc comment for why this can't live in the
 * no-I/O engine layer instead.
 */
function megaBaseSpeciesId(id: string): string | null {
  const baseId = id.replace(/-primal$/, "").replace(/-mega-x$/, "").replace(/-mega-y$/, "").replace(/-mega$/, "");
  return baseId === id ? null : baseId;
}

/**
 * Resolves a mega/primal `SpeciesDefinition`'s BASE species — `undefined`
 * when `species.id` doesn't carry a recognized mega/primal suffix, or when
 * the stripped base id isn't itself registered (never guesses). This is a
 * WEB-LAYER, string-convention resolution, not an engine capability: a mega
 * draws its BASE species' candy, but `SpeciesDefinition` carries no
 * `baseSpeciesId` link the no-I/O engine layer could resolve on its own (see
 * `rosterPlanner.ts`'s `RosterEntry.candyFamilyId` doc comment). Confirmed
 * against all 61 real mega/primal species in the current data (2026-09-09):
 * 61/61 resolve to a registered base species via this exact suffix
 * convention.
 */
export function resolveMegaBaseSpecies(species: SpeciesDefinition): SpeciesDefinition | undefined {
  const baseId = megaBaseSpeciesId(species.id);
  return baseId && speciesRegistry.has(baseId) ? speciesRegistry.get(baseId) : undefined;
}

/**
 * Resolves a mega/primal species' candy family from its BASE species'
 * `candyFamilyId` — `SpeciesDefinition.candyFamilyId` is `undefined` for
 * every one of the 61 real mega/primal species today (see
 * `resolveMegaBaseSpecies`'s own doc comment). Falls back to `undefined`
 * (the same honest "candy unverified" default as before this existed) when
 * `resolveMegaBaseSpecies` can't resolve a base species at all — never
 * guesses.
 */
export function resolveMegaBaseCandyFamilyId(species: SpeciesDefinition): string | undefined {
  if (species.candyFamilyId) return species.candyFamilyId;
  return resolveMegaBaseSpecies(species)?.candyFamilyId;
}

/**
 * Same gap, same fix, for `kmBuddyDistance` — confirmed empirically (e.g.
 * `lucario-mega` carries `kmBuddyDistance: undefined` while `lucario` itself
 * carries `5`) for the same reason `resolveMegaBaseCandyFamilyId` exists: a
 * mega/primal species record has no buddy-walking history of its own (it's
 * never the form actually walked), so this data layer only ever populates
 * the field on the base form. Used by `tmMove.ts`'s second-charged-move
 * pricing (`SecondChargedMovePricingInput.kmBuddyDistance`) — without this,
 * every mega/primal slot would show "buddy distance unknown" and never get a
 * second-charged-move candidate at all, even though the underlying base
 * form's distance is known and (per CLAUDE.md's standing decision "a TM on
 * the base form is a TM on the mega") applies identically.
 */
export function resolveMegaBaseKmBuddyDistance(species: SpeciesDefinition): number | undefined {
  if (species.kmBuddyDistance != null) return species.kmBuddyDistance;
  return resolveMegaBaseSpecies(species)?.kmBuddyDistance;
}

export interface TargetPickerOption {
  id: string;
  label: string;
  badge?: "hypothetical" | "approximate" | "shadow";
  imageUrl?: string;
}

/**
 * The target picker's option list: currently-active raid bosses pinned to the
 * top (so "what's live right now" is the default browsing experience), then
 * every other registered species below (reachable by search).
 *
 * Badge priority when more than one could apply: approximate/hypothetical
 * beats shadow, since those two are mutually exclusive with each other and
 * both take priority as "this data itself is speculative", a stronger claim
 * than "this is a mechanically-different but otherwise solid stat line".
 */
export function targetPickerOptions(): TargetPickerOption[] {
  const raidOptions: TargetPickerOption[] = activeRaidBossOptions().map((r) => ({
    id: r.id,
    label: `${r.raidName} — ${r.tier}`,
    badge: r.isApproximate ? "approximate" : speciesRegistry.get(r.id).isShadow ? "shadow" : undefined,
    imageUrl: r.imageUrl,
  }));
  const speciesOptions: TargetPickerOption[] = allSpeciesOptions().map((s) => ({
    id: s.id,
    label: s.name,
    badge: s.isHypothetical ? "hypothetical" : s.isShadow ? "shadow" : undefined,
    imageUrl: s.imageUrl,
  }));
  return [...raidOptions, ...speciesOptions];
}

export function candidatePickerOptions(): TargetPickerOption[] {
  return allSpeciesOptions().map((s) => ({
    id: s.id,
    label: s.name,
    badge: s.isHypothetical ? "hypothetical" : s.isShadow ? "shadow" : undefined,
    imageUrl: s.imageUrl,
  }));
}

/**
 * The Power-Up Optimizer's universal levels-1-50 candy/XL-candy/stardust cost
 * table (see powerUp.ts's top doc comment for full sourcing/derivation) —
 * `data/normalized/powerUpCosts.json` IS the engine's own PowerUpCostTable
 * shape plus two provenance-only fields (`sourceUrl`/`fetchedAt`) this
 * export strips, so `powerUpCostTable` can be handed straight to
 * `optimizePowerUps`/`powerUpCost`/`powerUpDamageLadder` without any
 * reshaping at the call site. `powerUpCostsFetchedAt` is kept separately as a
 * footnote string (when this table was last pulled from GAME_MASTER), not
 * folded into the strict engine type.
 */
const RAW_POWER_UP_COSTS = powerUpCostsData as unknown as PowerUpCostTable & { sourceUrl: string; fetchedAt: string };
export const powerUpCostTable: PowerUpCostTable = {
  steps: RAW_POWER_UP_COSTS.steps,
  maxLevel: RAW_POWER_UP_COSTS.maxLevel,
  shadowStardustMultiplier: RAW_POWER_UP_COSTS.shadowStardustMultiplier,
  shadowCandyMultiplier: RAW_POWER_UP_COSTS.shadowCandyMultiplier,
  purifiedStardustMultiplier: RAW_POWER_UP_COSTS.purifiedStardustMultiplier,
  purifiedCandyMultiplier: RAW_POWER_UP_COSTS.purifiedCandyMultiplier,
  luckyStardustMultiplier: RAW_POWER_UP_COSTS.luckyStardustMultiplier,
};
export const powerUpCostsFetchedAt: string = RAW_POWER_UP_COSTS.fetchedAt;
