/**
 * Pokebattler (https://fight.pokebattler.com/raids) raid-roster parsing +
 * name resolution — added 2026-09-07 for two tasks (see sync-data.ts's
 * "Pokebattler" sections for how these feed into the pipeline):
 *
 * 1. An independent LIVE cross-check of ScrapedDuck's current raid roster
 *    (data/raw/raids.json) — a second source to detect drift/staleness in
 *    either feed, never a replacement for ScrapedDuck as the primary source
 *    for activeRaids.json. IMPLEMENTED 2026-09-07 — see
 *    pokebattlerDisplayNameForCrossCheck below and sync-data.ts's own
 *    "Pokebattler live cross-check" section.
 * 2. Folding Pokebattler's `_LEGACY` tiers (a historical archive, confirmed
 *    2026-09-07: 796 entries across 741 distinct species — more than the
 *    486-species pogoapi+Bulbapedia union) into raidHistory.json under a new
 *    source label, "pokebattler-legacy".
 *
 * SCOPE NOTE (2026-09-08): task 2 above (the legacy-archive import) is now
 * WIRED IN — see sync-data.ts's "Pokebattler legacy archive backfill"
 * section, added once the data-quality audit that motivated deferring it
 * (2026-09-07) was completed. Every legacy-import helper below
 * (isArchivableLegacyTier, POKEBATTLER_LEGACY_NUMERIC_TIER_MAP,
 * POKEBATTLER_LEGACY_MEGA_TIERS, POKEBATTLER_LEGACY_EXCLUDED_TIERS,
 * resolveMegaLegacyTier, and resolvePokebattlerPokemonId) feeds that section
 * directly, under the `"pokebattler-legacy"` RaidHistoryEntry source. Task 1
 * (the live cross-check) remains wired in separately; it reuses
 * isCurrentRotationTier and buildEnumToPogoapiName from this file but
 * resolves display names via the separate, more lenient
 * pokebattlerDisplayNameForCrossCheck below instead of
 * resolvePokebattlerPokemonId — see that function's own doc comment for why.
 *
 * PROVENANCE CAVEAT (honest, not just for task 2): neither ScrapedDuck (a
 * LeekDuck scrape) nor Pokebattler discloses HOW it detects the current raid
 * rotation. They're different companies with no LeekDuck attribution on
 * Pokebattler's side, so their agreement is circumstantial independence, not
 * proven independence — two sources that never disclose their own detection
 * method can still both be wrong the same way (e.g. both scraping the same
 * upstream Niantic announcement). Two-sources-that-agree is therefore weaker
 * evidence than it looks; the real value of running both arrives the first
 * time they DISAGREE (see sync-data.ts's cross-check report for a live
 * instance of exactly that — Mega raids diverged materially on 2026-09-07).
 *
 * Pure — no I/O, no shared pipeline state; see fetchAndCachePokebattlerRaids
 * in ./fetchCache.ts for the live fetch this operates on.
 *
 * Two verified traps this module's tier classification exists specifically
 * to avoid (both confirmed 2026-09-07 by direct inspection of the live
 * response, 66 top-level tier objects):
 * - `_FUTURE` tiers (e.g. `RAID_LEVEL_5_FUTURE`, which currently contains
 *   Arceus) are Niantic-announced UPCOMING raids, not live or historical —
 *   isCurrentRotationTier/isArchivableLegacyTier both exclude any tier whose
 *   name contains "_FUTURE", full stop.
 * - `RAID_LEVEL_UNSET` contains 2192 raid entries (confirmed 2026-09-07) —
 *   nearly the entire Pokédex. This is NOT a real raid-rotation tier; it's
 *   Pokebattler's own internal "every possible custom-raid defender" catalog
 *   for its damage calculator UI. isCurrentRotationTier explicitly excludes
 *   it by name — treating it as "current" would make the live cross-check
 *   meaningless (nearly everything would show up as "only in Pokebattler").
 * - `_MAX` tiers (Dynamax/Gigantamax) are excluded from BOTH the current and
 *   legacy classifications — this project doesn't model that raid format at
 *   all (a real, deliberate scope decision, not an oversight).
 *
 * Pokebattler's own `pokemon` ids are UPPERCASE enum-style identifiers (e.g.
 * "SNEASEL_HISUIAN_FORM", "CHARIZARD_MEGA_X", "ABRA_SHADOW_FORM", "HO_OH")
 * that, confirmed by direct inspection 2026-09-07, share the exact same
 * BASE-name vocabulary as GAME_MASTER's own pokemonId enums —
 * resolvePokemonEnum (./gameMasterMatching.ts) already reverses pogoapi's
 * display name onto that same enum for 1022/1024 species, so this module
 * reuses it (via buildEnumToPogoapiName) rather than inventing a second
 * naming convention, then peels known suffix tokens (`_MEGA[_X/_Y]`,
 * `_PRIMAL`, `_SHADOW_FORM`, or an arbitrary `_<FORM_WORDS>_FORM`) off the
 * raw id before matching the remainder.
 */

import type { RaidTier, SpeciesDefinition } from "@pogo-analyzer/engine";
import { formDisplayName } from "./gameMasterMatching.ts";

export interface RawPokebattlerRaidBossEntry {
  pokemon: string;
  pokemonId?: string;
}

export interface RawPokebattlerTier {
  tier: string;
  raids?: RawPokebattlerRaidBossEntry[];
}

export interface RawPokebattlerResponse {
  tiers: RawPokebattlerTier[];
}

/**
 * True for a tier this project treats as part of Pokémon GO's historical
 * archive (2026-09-07 legacy backfill) — every "_LEGACY" tier EXCEPT the
 * Dynamax/Gigantamax "_MAX" ones, which this project doesn't model at all.
 */
export function isArchivableLegacyTier(tier: string): boolean {
  return tier.includes("_LEGACY") && !tier.includes("_MAX");
}

/**
 * `RAID_LEVEL_MEGA`/`RAID_LEVEL_4_MEGA_ENHANCED` are a mega-raid ROTATION
 * POOL, not a live list — confirmed 2026-09-08 (AUDIT_2026-09-08.md Defect
 * 2): `RAID_LEVEL_MEGA` still contained `SKARMORY_MEGA` on the exact day
 * Mega Skarmory's real rotation demonstrably ended (the same event that made
 * it vanish from species.json, see CLAUDE.md "Standing decisions"), plus
 * `RAICHU_MEGA_X`/`RAICHU_MEGA_Y`, also not live at the time. Treating either
 * tier as "current" made the live cross-check report ~11 PHANTOM Mega
 * disagreements every single run — a check that cries wolf every run gets
 * ignored, defeating the point of running a second source at all. Excluded
 * from isCurrentRotationTier below; if a future need arises to surface these
 * as an ADVISORY signal, do so on a clearly-separate line from the real
 * disagreement count, never folded into it — do not "helpfully" add them
 * back to the current-tier check without re-verifying this rotation-pool
 * behavior first.
 */
export const POKEBATTLER_MEGA_POOL_TIERS = new Set(["RAID_LEVEL_MEGA", "RAID_LEVEL_4_MEGA_ENHANCED"]);

/**
 * True for a tier this project treats as part of the CURRENT live roster —
 * see this module's doc comment for why "_FUTURE", "_MAX", and the
 * "RAID_LEVEL_UNSET" catalog bucket are all excluded, and
 * POKEBATTLER_MEGA_POOL_TIERS's own doc comment for why the two Mega tiers
 * are excluded too (a rotation pool, not a live list — confirmed via the
 * Mega Skarmory evidence there).
 */
export function isCurrentRotationTier(tier: string): boolean {
  if (tier === "RAID_LEVEL_UNSET") return false;
  if (POKEBATTLER_MEGA_POOL_TIERS.has(tier)) return false;
  return !tier.includes("_LEGACY") && !tier.includes("_FUTURE") && !tier.includes("_MAX");
}

/**
 * `RAID_LEVEL_<N>[_SHADOW]_LEGACY` -> this project's real, current-scheme
 * RaidTier — ONLY the tiers this project's RaidTier union can honestly
 * represent (1/3/5-star, shadow or not; RaidTier itself has no separate
 * "Shadow" tier — a Shadow raid shares its base tier's HP/multiplier, same
 * as ScrapedDuck's own `tier` field already does for live Shadow raids).
 * RAID_LEVEL_2_LEGACY (1 entry: Carbink, confirmed 2026-09-07), _4_LEGACY
 * (31 entries, confirmed to be MODERN Community-Day-style four-star bosses —
 * Boldore/Braixen/Brionne/Chansey/Charjabug/etc. — NOT the old pre-2020 tier
 * 4 that pogoapi's own "4"->"3-star" merge already covers),
 * RAID_LEVEL_ULTRA_BEAST_LEGACY (9), and RAID_LEVEL_ELITE_LEGACY (4) have NO
 * honest mapping onto this project's RaidTier union at all today (no
 * "2-Star"/"4-Star"/"Ultra Beast"/"Elite" raid concept exists in it) —
 * POKEBATTLER_LEGACY_EXCLUDED_TIERS below excludes them outright, per this
 * project's "never fabricate a tier" rule (same discipline as the
 * pogoapi-previous backfill's "ex"/"6" exclusions). This is a real product
 * gap (Pokémon GO does have a real four-star Community Day raid format) —
 * reported in WARNINGS for engine-developer to consider modeling as a new
 * RaidTier someday, not silently worked around here.
 */
export const POKEBATTLER_LEGACY_NUMERIC_TIER_MAP: Record<string, RaidTier> = {
  RAID_LEVEL_1_LEGACY: "1-Star Raids",
  RAID_LEVEL_3_LEGACY: "3-Star Raids",
  RAID_LEVEL_5_LEGACY: "5-Star Raids",
  RAID_LEVEL_1_SHADOW_LEGACY: "1-Star Raids",
  RAID_LEVEL_3_SHADOW_LEGACY: "3-Star Raids",
  RAID_LEVEL_5_SHADOW_LEGACY: "5-Star Raids",
};

/**
 * Mega/primal legacy tiers — resolved via the matched SPECIES' own
 * defaultRaidTierForSpecies() classification rather than trusting a raw
 * "MEGA" vs "MEGA_5" label distinction (same wikitext-is-unreliable
 * precedent bulbapediaRaidArchive.ts already established for its own
 * "Mega|6"/"Primal|5" head tokens — see that module's doc comment).
 */
export const POKEBATTLER_LEGACY_MEGA_TIERS = new Set(["RAID_LEVEL_MEGA_LEGACY", "RAID_LEVEL_MEGA_5_LEGACY"]);

/** See POKEBATTLER_LEGACY_NUMERIC_TIER_MAP's doc comment for why each of these is excluded rather than mapped. RAID_LEVEL_6_LEGACY/RAID_LEVEL_4_5_LEGACY are confirmed always-empty in the live feed (2026-09-07) but excluded on principle regardless — no "6-star"/"4.5-star" RaidTier exists either. */
export const POKEBATTLER_LEGACY_EXCLUDED_TIERS = new Set([
  "RAID_LEVEL_2_LEGACY",
  "RAID_LEVEL_4_LEGACY",
  "RAID_LEVEL_6_LEGACY",
  "RAID_LEVEL_4_5_LEGACY",
  "RAID_LEVEL_ULTRA_BEAST_LEGACY",
  "RAID_LEVEL_ELITE_LEGACY",
]);

/** Builds the enum->pogoapi-display-name reverse map resolvePokebattlerPokemonId needs, from this pipeline's own already-computed pokemonIdByName + resolvePokemonEnum (gameMasterMatching.ts) + the real known-enum set — built ONCE by the caller (sync-data.ts), not per lookup. */
export function buildEnumToPogoapiName(
  pokemonIdByName: ReadonlyMap<string, number>,
  resolvePokemonEnum: (id: number, name: string, known: ReadonlySet<string>) => string | null,
  gameMasterKnownEnums: ReadonlySet<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [name, id] of pokemonIdByName) {
    const enumName = resolvePokemonEnum(id, name, gameMasterKnownEnums);
    if (enumName && !map.has(enumName)) map.set(enumName, name);
  }
  return map;
}

export interface PokebattlerResolutionContext {
  /** pogoapi display name -> pokemon_id, e.g. "Sneasel" -> 215. */
  pokemonIdByName: ReadonlyMap<string, number>;
  /** This pipeline's own single normalized form per pokemon_id (see sync-data.ts's defaultFormByPokemonId). */
  defaultFormByPokemonId: ReadonlyMap<number, string>;
  /** GAME_MASTER pokemonId enum -> pogoapi display name (see buildEnumToPogoapiName). */
  enumToPogoapiName: ReadonlyMap<string, string>;
  /** Full final roster's own `name` (lowercased) -> registered species id — same pool sync-data.ts's own speciesIdByNameLower already builds. */
  speciesIdByNameLower: ReadonlyMap<string, string>;
}

function normalizeFormToken(w: string): string {
  return w.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * This project's own fromGameMaster qualified-name convention: bare name for
 * the roster's single normalized "Normal" form, "Name (Form)" otherwise.
 * `defaultFormByPokemonId` holds the RAW pogoapi form string (possibly
 * underscored, e.g. "West_sea") — cleaned via formDisplayName (2026-09-10
 * fix) so this reconstructed name matches the roster's own now-cleaned
 * `.name` field (see that function's doc comment in ./gameMasterMatching.ts
 * for why every independent reconstruction of this convention needs the same
 * treatment).
 */
function qualifiedRosterName(pokemonName: string, pokemonId: number, ctx: PokebattlerResolutionContext): string {
  const form = ctx.defaultFormByPokemonId.get(pokemonId) ?? "Normal";
  return form === "Normal" ? pokemonName : `${pokemonName} (${formDisplayName(form)})`;
}

function finalizeBase(
  baseName: string,
  formWords: string | null,
  ctx: PokebattlerResolutionContext,
): { speciesId: string; displayName: string } | null {
  const pokemonId = ctx.pokemonIdByName.get(baseName);
  if (pokemonId === undefined) return null;
  const rosterForm = ctx.defaultFormByPokemonId.get(pokemonId) ?? "Normal";
  // formWords === null means "no form suffix at all was present on the raw
  // id" (the bare-enum case) — always accepted regardless of rosterForm.
  // Otherwise the peeled form word(s) MUST match this pipeline's own single
  // normalized form for that species (case/punctuation-insensitive) — see
  // resolvePokebattlerPokemonId's doc comment for why a mismatch here is a
  // real alternate form outside this project's one-form-per-species scope,
  // reported unresolved rather than guessed.
  if (formWords !== null && normalizeFormToken(rosterForm) !== normalizeFormToken(formWords)) return null;
  const qualifiedName = qualifiedRosterName(baseName, pokemonId, ctx);
  const speciesId = ctx.speciesIdByNameLower.get(qualifiedName.toLowerCase());
  if (!speciesId) return null;
  return { speciesId, displayName: qualifiedName };
}

/**
 * Resolves a raw Pokebattler id with NO recognized Mega/Primal/Shadow suffix
 * (or the pre-shadow-stripped remainder of one, see resolvePokebattlerPokemonId)
 * against this pipeline's roster. Tries the id as a whole base enum first
 * (covers base names that themselves contain underscores, e.g.
 * "NIDORAN_FEMALE", "HO_OH", "TAPU_KOKO"); otherwise, for a trailing
 * "_FORM"-suffixed id, peels ONE underscore-token off the right at a time
 * until the remainder matches a KNOWN base enum — at that point resolution
 * is terminal (match or real-alt-form mismatch), never backtracking to try a
 * different split. Verified against all 601 real "normal"-bucket 2026-09-07
 * Pokebattler-legacy entries this way: 539 resolved, 62 failures, every
 * single failure a genuine real alternate form this pipeline's
 * one-form-per-species scope doesn't carry (regional Alolan/Galarian/
 * Hisuian/Paldean forms, Deoxys/Genesect/Necrozma formes, Origin Giratina/
 * Dialga/Palkia, Therian-vs-Incarnate, Zacian/Zamazenta Crowned, Armored
 * Mewtwo, etc.) — zero false positives or false negatives spot-checked.
 */
function resolveNormalOrRegionalId(
  rawId: string,
  ctx: PokebattlerResolutionContext,
): { speciesId: string; displayName: string } | null {
  const bareName = ctx.enumToPogoapiName.get(rawId);
  if (bareName) return finalizeBase(bareName, null, ctx);

  if (!rawId.endsWith("_FORM")) return null;
  let remaining = rawId.slice(0, -"_FORM".length);
  const peeled: string[] = [];
  while (remaining.length > 0) {
    const baseName = ctx.enumToPogoapiName.get(remaining);
    if (baseName) {
      const formWords = [...peeled].reverse().join("_");
      return finalizeBase(baseName, formWords, ctx);
    }
    const idx = remaining.lastIndexOf("_");
    if (idx === -1) {
      break;
    }
    peeled.push(remaining.slice(idx + 1));
    remaining = remaining.slice(0, idx);
  }
  return null;
}

export interface ResolvedPokebattlerEntry {
  speciesId: string;
  /** This project's own roster display name (possibly "Shadow "-prefixed for the shadow bucket, or "Mega "/"Primal "-prefixed for the mega bucket) — NOT the raw Pokebattler id. Used only for reporting. */
  displayName: string;
  bucket: "normal" | "shadow" | "mega";
  /**
   * True only for a "shadow" bucket entry that resolved `speciesId` to an
   * actual, already-registered Shadow-variant species id (see
   * getOrCreateShadowVariant in ./shadowVariant.ts) rather than falling back
   * to the unboosted base species — see this function's own doc comment,
   * bucket 2, for why the fallback still exists. Always false/undefined for
   * "normal"/"mega" buckets, which never have a Shadow-variant concept.
   */
  resolvedToShadowVariant?: boolean;
}

/**
 * Resolves ONE raw Pokebattler `pokemon` id (e.g. "SNEASEL_HISUIAN_FORM",
 * "CHARIZARD_MEGA_X", "ABRA_SHADOW_FORM", "REGICE") against this pipeline's
 * own registered species roster, or returns null — the caller is expected to
 * log the raw id as unresolved (by name and tier), never silently drop it,
 * matching this pipeline's existing pogoapi-previous/Bulbapedia-archive
 * discipline.
 *
 * Three suffix buckets, checked in order:
 * 1. Mega/primal: trailing `_MEGA`, `_MEGA_X`, `_MEGA_Y`, or `_PRIMAL` ->
 *    reconstructs "Mega <Base>[ X/Y]"/"Primal <Base>" and looks it up
 *    DIRECTLY against the full roster's own `name` field — this project's
 *    real mega/primal species are named exactly this way (see
 *    megaSpeciesIdFor/fromGameMaster's naming convention), so no
 *    (pokemon_id, form) round-trip is needed the way the pogoapi-previous
 *    backfill's mega bucket requires.
 * 2. Shadow: trailing `_SHADOW_FORM` -> resolves the base species first, then
 *    prefers an already-registered Shadow-variant species id for it (see
 *    ./shadowVariant.ts's getOrCreateShadowVariant) if `ctx.speciesIdByNameLower`
 *    has one under "Shadow <Base>" — which, as of the 2026-09-08 durability
 *    fix, it always will for a rawId reached from a `_SHADOW_LEGACY` tier,
 *    since sync-data.ts's shadow-durability pass pre-synthesizes a variant
 *    for every such tier's species BEFORE this resolver ever runs (see that
 *    section's own doc comment for the exact ordering requirement). Falls
 *    back to the unboosted base species id (this function's older,
 *    documented behavior, matching resolveBulbapediaRow's own precedent in
 *    ./bulbapediaRaidArchive.ts) only if no such variant is registered —
 *    defensive, not expected to fire for a `_SHADOW_LEGACY` caller.
 * 3. Everything else -> resolveNormalOrRegionalId.
 */
export function resolvePokebattlerPokemonId(
  rawId: string,
  ctx: PokebattlerResolutionContext,
): ResolvedPokebattlerEntry | null {
  const megaMatch = rawId.match(/^(.+)_(MEGA_X|MEGA_Y|MEGA|PRIMAL)$/);
  if (megaMatch) {
    const [, baseEnum, suffix] = megaMatch;
    // baseEnum is this regex's mandatory first capture group `(.+)` — always
    // present whenever megaMatch itself is truthy.
    const baseName = ctx.enumToPogoapiName.get(baseEnum!);
    if (!baseName) return null;
    const megaName =
      suffix === "PRIMAL"
        ? `Primal ${baseName}`
        : suffix === "MEGA_X"
          ? `Mega ${baseName} X`
          : suffix === "MEGA_Y"
            ? `Mega ${baseName} Y`
            : `Mega ${baseName}`;
    const speciesId = ctx.speciesIdByNameLower.get(megaName.toLowerCase());
    if (!speciesId) return null;
    return { speciesId, displayName: megaName, bucket: "mega" };
  }

  if (rawId.endsWith("_SHADOW_FORM")) {
    const stripped = rawId.slice(0, -"_SHADOW_FORM".length);
    const resolved = resolveNormalOrRegionalId(stripped, ctx);
    if (!resolved) return null;
    const shadowDisplayName = `Shadow ${resolved.displayName}`;
    const shadowSpeciesId = ctx.speciesIdByNameLower.get(shadowDisplayName.toLowerCase());
    if (shadowSpeciesId) {
      return { speciesId: shadowSpeciesId, displayName: shadowDisplayName, bucket: "shadow", resolvedToShadowVariant: true };
    }
    return { speciesId: resolved.speciesId, displayName: shadowDisplayName, bucket: "shadow" };
  }

  const resolved = resolveNormalOrRegionalId(rawId, ctx);
  if (!resolved) return null;
  return { speciesId: resolved.speciesId, displayName: resolved.displayName, bucket: "normal" };
}

/**
 * Resolves a mega/primal-bucket legacy entry's real RaidTier via the matched
 * species' own defaultRaidTierForSpecies() (see POKEBATTLER_LEGACY_MEGA_TIERS'
 * doc comment for why the raw MEGA/MEGA_5 label isn't trusted directly).
 * Returns null if `speciesId` isn't a currently-registered species (should
 * never happen given resolvePokebattlerPokemonId's mega branch only ever
 * resolves against a name already present in the roster, but defensive
 * regardless).
 */
export function resolveMegaLegacyTier(
  speciesId: string,
  speciesById: ReadonlyMap<string, SpeciesDefinition>,
  defaultRaidTierForSpecies: (species: SpeciesDefinition) => RaidTier,
): RaidTier | null {
  const species = speciesById.get(speciesId);
  if (!species) return null;
  return defaultRaidTierForSpecies(species);
}

/**
 * Peels ONE underscore-token off the right of `rawId` at a time until the
 * remainder matches a known base enum in `enumToPogoapiName` — same mechanics
 * as resolveNormalOrRegionalId's inner loop, factored out separately (rather
 * than shared) because this one is used ONLY by
 * pokebattlerDisplayNameForCrossCheck below, which deliberately does NOT
 * apply that function's roster-form gate (see that function's doc comment for
 * why). Returns the matched base name plus the peeled tokens in original
 * left-to-right order (e.g. "SNEASEL_HISUIAN_FORM" minus its "_FORM" suffix
 * -> `{ baseName: "Sneasel", formWords: ["HISUIAN"] }`).
 */
function peelToBaseNameForCrossCheck(
  rawIdWithoutFormSuffix: string,
  enumToPogoapiName: ReadonlyMap<string, string>,
): { baseName: string; formWords: string[] } | null {
  const bare = enumToPogoapiName.get(rawIdWithoutFormSuffix);
  if (bare) return { baseName: bare, formWords: [] };
  let remaining = rawIdWithoutFormSuffix;
  const peeled: string[] = [];
  while (remaining.length > 0) {
    const baseName = enumToPogoapiName.get(remaining);
    if (baseName) return { baseName, formWords: [...peeled].reverse() };
    const idx = remaining.lastIndexOf("_");
    if (idx === -1) break;
    peeled.push(remaining.slice(idx + 1));
    remaining = remaining.slice(0, idx);
  }
  return null;
}

/**
 * Resolves ONE raw Pokebattler `pokemon` id to a human-readable display name
 * for the LIVE cross-check ONLY (task 1 in this module's top-of-file doc
 * comment) — deliberately NOT the same function as resolvePokebattlerPokemonId,
 * and deliberately never checked against this pipeline's registered species
 * roster at all.
 *
 * Why: resolvePokebattlerPokemonId's whole point (feeding the registered
 * roster, task 2) is to REJECT a real alternate form this project's
 * one-form-per-species scope doesn't carry (e.g. Hisuian Sneasel, when this
 * roster's single normalized Sneasel is the base/Normal form) — correct for
 * that job. Applying that same gate here would make the live cross-check
 * actively misleading: Hisuian Sneasel is a genuinely live raid boss on BOTH
 * feeds simultaneously (confirmed 2026-09-07), so rejecting it here would
 * report a false "only in ScrapedDuck" disagreement caused by this pipeline's
 * own documented scope limitation, not by the two feeds actually disagreeing
 * about what's raiding. This function instead reconstructs a ScrapedDuck-
 * style display name (prefix form, e.g. "Hisuian Sneasel", matching
 * ScrapedDuck's own `name` field convention) directly from the raw enum id,
 * for NAME-only text comparison — never written to species.json or any
 * registered id.
 */
export function pokebattlerDisplayNameForCrossCheck(
  rawId: string,
  enumToPogoapiName: ReadonlyMap<string, string>,
): string | null {
  const megaMatch = rawId.match(/^(.+)_(MEGA_X|MEGA_Y|MEGA|PRIMAL)$/);
  if (megaMatch) {
    const [, baseEnum, suffix] = megaMatch;
    // baseEnum is this regex's mandatory first capture group `(.+)` — always
    // present whenever megaMatch itself is truthy.
    const baseName = enumToPogoapiName.get(baseEnum!);
    if (!baseName) return null;
    return suffix === "PRIMAL"
      ? `Primal ${baseName}`
      : suffix === "MEGA_X"
        ? `Mega ${baseName} X`
        : suffix === "MEGA_Y"
          ? `Mega ${baseName} Y`
          : `Mega ${baseName}`;
  }

  if (rawId.endsWith("_SHADOW_FORM")) {
    const stripped = rawId.slice(0, -"_SHADOW_FORM".length);
    const remainder = stripped.endsWith("_FORM") ? stripped.slice(0, -"_FORM".length) : stripped;
    const resolved = peelToBaseNameForCrossCheck(remainder, enumToPogoapiName);
    if (!resolved) return null;
    return `Shadow ${resolved.baseName}`;
  }

  const remainder = rawId.endsWith("_FORM") ? rawId.slice(0, -"_FORM".length) : rawId;
  const resolved = peelToBaseNameForCrossCheck(remainder, enumToPogoapiName);
  if (!resolved) return null;
  if (resolved.formWords.length === 0) return resolved.baseName;
  // ScrapedDuck's own convention for a regional/alt form raid is "<Form>
  // <Base>" (e.g. "Hisuian Sneasel"), not this project's roster convention
  // ("Sneasel (Hisuian)") — reconstruct that shape from the peeled tokens
  // (title-cased) since this is compared directly against ScrapedDuck's raw
  // `name` field, never against species.json.
  const formWord = resolved.formWords.map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
  return `${formWord} ${resolved.baseName}`;
}
