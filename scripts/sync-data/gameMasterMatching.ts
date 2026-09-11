/**
 * GAME_MASTER species/move matching helpers, added as part of the 2026-09-06
 * full pipeline switch (GAME_MASTER — PokeMiners' mirror of Niantic's own
 * client-side dump — is now the PRIMARY source for every real species'
 * stats/typing/moveset/rarity, not just a mega/primal-stat gap-filler; see
 * sync-data.ts's module docstring). Split out as its own module because
 * unlike ./adapters.ts's one-liners, this needs real multi-step resolution
 * chains with documented fallback behavior — pogoapi's (pokemon_id,
 * pokemon_name, form) identity does NOT map onto GAME_MASTER's own enum +
 * form-string convention by any single deterministic rule.
 */

import type { PokemonRarity } from "@pogo-analyzer/engine";

import type { GameMasterPokemonRecord } from "./rawShapes.ts";

/**
 * Whether ANY of a pokemonId enum's own GAME_MASTER templates carries a REAL
 * (non-mega/primal) evolution branch — i.e. whether this species still has
 * somewhere to evolve. Checks the UNION of every candidate template sharing
 * the enum (not just whichever one a specific normalized species entry
 * happened to match against), because a costume-only template (e.g.
 * `BULBASAUR_FALL_2019`) can legitimately carry no evolutionBranch data at
 * all while that same enum's bare/`_NORMAL` template does — checking only
 * one arbitrarily-picked template would risk a false "no evolution branch
 * found" for the wrong reason. Confirmed safe by direct inspection of the
 * live 2026-09-08 dump: every sampled species' bare and `_NORMAL` templates
 * carry byte-identical evolutionBranch content, and non-`_NORMAL` regional
 * forms that evolve differently (e.g. Shellos West/East Sea -> the matching
 * Gastrodon form) each carry their OWN correct branch too, so the union
 * never manufactures a false positive here — it only ever adds coverage a
 * single-template check could miss.
 *
 * THE TRAP this function exists to avoid: `record.evolutionBranch.length > 0`
 * is NOT sufficient on its own to mean "can still evolve" — 123 of 1107
 * templates with a non-empty evolutionBranch in the 2026-09-06 audit had ONLY
 * temporary (mega/primal) evolution entries in it, including Venusaur,
 * Charizard, Blastoise, Beedrill and Metagross (Metagross's entire branch is
 * a single `TEMP_EVOLUTION_MEGA` entry). Getting this wrong marks a fully-
 * evolved species as still-evolvable, which — for
 * PLAN_multi_raid_roster_optimizer.md §3.6's "unevolved Pokémon are not
 * power-up candidates" filter this feeds — silently deletes the species'
 * best attackers from the candidate set while looking like the feature is
 * working. This is why `GameMasterPokemonRecord.evolutionBranch` (see
 * rawShapes.ts) is filtered to REAL evolution entries only at extraction time
 * (fetchGameMasterData in ./fetchCache.ts, not here) — checking its `.length`
 * is correct only because that filtering already happened upstream.
 */
export function isFullyEvolved(candidatesForEnum: readonly GameMasterPokemonRecord[]): boolean {
  return !candidatesForEnum.some((c) => c.evolutionBranch.length > 0);
}

/**
 * One resolved (deduped) real evolution target off a specific matched
 * GameMasterPokemonRecord — see realEvolutionTargets. The requirement fields
 * below (added 2026-09-10, data-sync's "Normalize evolution candy costs"
 * task) are passed through verbatim from GameMasterEvolutionBranchRecord —
 * see RawGameMasterEvolutionBranchFull's doc comment (rawShapes.ts) for what
 * each one means.
 */
export interface EvolutionTarget {
  /** The pokemonId enum this branch evolves into, e.g. "METANG". */
  evolutionEnum: string;
  /** GAME_MASTER's own form key for the evolved species, e.g. "METANG_NORMAL" — undefined for the handful of real branches that don't carry one (e.g. Totodile -> Croconaw). */
  form?: string;
  candyCost?: number;
  candyCostPurified?: number;
  evolutionItemRequirement?: string;
  evolutionItemRequirementCost?: number;
  lureItemRequirement?: string;
  mustBeBuddy?: boolean;
  kmBuddyDistanceRequirement?: number;
  genderRequirement?: string;
  onlyDaytime?: boolean;
  onlyNighttime?: boolean;
  onlyDuskPeriod?: boolean;
  onlyFullMoon?: boolean;
  onlyUpsideDown?: boolean;
  requiresQuest?: boolean;
  noCandyCostViaTrade?: boolean;
}

/**
 * The deduped list of real evolution targets a SPECIFIC matched
 * GameMasterPokemonRecord's own evolutionBranch names. Deliberately reads
 * only the ONE record actually matched for a given normalized species (unlike
 * isFullyEvolved above, which unions across the whole enum) so a per-form
 * evolution target resolves to the correct sibling form — e.g. Shellos West
 * Sea's own template evolves to Gastrodon WEST Sea specifically, not East Sea
 * (confirmed 2026-09-08: GAME_MASTER stores a distinct `form`-qualified
 * branch per Shellos form, not one shared branch for the whole species).
 *
 * Returns `[]` for a record with no real evolution branch — which can mean
 * either "this species is genuinely fully evolved" OR "this specific
 * template happens to carry no evolutionBranch data even though a sibling
 * template for the same enum does" (a costume/placeholder template). Callers
 * that need to distinguish those two cases should cross-check against
 * `isFullyEvolved(candidatesForThisEnum)` — an empty result here alongside
 * `isFullyEvolved(...) === false` is a real inconsistency worth logging
 * loudly (per this project's "report loudly, never silently wrong"
 * discipline — see CLAUDE.md), not a signal to fall back to
 * `isFullyEvolved: true`.
 */
export function realEvolutionTargets(record: GameMasterPokemonRecord): EvolutionTarget[] {
  const seen = new Set<string>();
  const targets: EvolutionTarget[] = [];
  for (const branch of record.evolutionBranch) {
    const key = `${branch.evolution}|${branch.form ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      evolutionEnum: branch.evolution,
      form: branch.form,
      candyCost: branch.candyCost,
      candyCostPurified: branch.candyCostPurified,
      evolutionItemRequirement: branch.evolutionItemRequirement,
      evolutionItemRequirementCost: branch.evolutionItemRequirementCost,
      lureItemRequirement: branch.lureItemRequirement,
      mustBeBuddy: branch.mustBeBuddy,
      kmBuddyDistanceRequirement: branch.kmBuddyDistanceRequirement,
      genderRequirement: branch.genderRequirement,
      onlyDaytime: branch.onlyDaytime,
      onlyNighttime: branch.onlyNighttime,
      onlyDuskPeriod: branch.onlyDuskPeriod,
      onlyFullMoon: branch.onlyFullMoon,
      onlyUpsideDown: branch.onlyUpsideDown,
      requiresQuest: branch.requiresQuest,
      noCandyCostViaTrade: branch.noCandyCostViaTrade,
    });
  }
  return targets;
}

/**
 * GAME_MASTER's own pokemonId enum is USUALLY derivable from pokemon_name by
 * one of the two mechanical transforms below (see resolvePokemonEnum) —
 * confirmed by direct inspection 2026-09-06 across the full 1024-species
 * roster (1022/1024 resolved mechanically). Only Nidoran's gender symbols
 * (♀/♂) needed a hand-authored override: they carry real information
 * GAME_MASTER encodes as separate enums (NIDORAN_FEMALE/NIDORAN_MALE) that no
 * generic transform of the symbol itself could recover.
 */
export const POKEMON_ENUM_OVERRIDES: Record<number, string> = {
  29: "NIDORAN_FEMALE", // Nidoran♀
  32: "NIDORAN_MALE", // Nidoran♂
};

/**
 * Uppercases and collapses any run of non-alphanumeric characters to a single
 * underscore (e.g. "Ho-Oh" -> "HO_OH", "Mr. Mime" -> "MR_MIME", "Tapu Koko"
 * -> "TAPU_KOKO"). Correct for the large majority of multi-word/punctuated
 * names (confirmed 2026-09-06: this alone resolves 991/1024).
 */
export function underscoreEnumFor(pokemonName: string): string {
  return pokemonName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Uppercases and drops non-alphanumeric characters entirely with NO
 * separator (e.g. "Great Tusk" -> "GREATTUSK", "Farfetch'd" -> "FARFETCHD",
 * "Wo-Chien" -> "WOCHIEN"). Needed because GAME_MASTER's own naming has no
 * single consistent convention across every species (confirmed 2026-09-06:
 * some multi-word names keep underscores between words, some concatenate
 * with none, with no rule that predicts which — both transforms must be
 * tried against the actual known enum set).
 */
export function strippedEnumFor(pokemonName: string): string {
  return pokemonName.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Resolves pogoapi's pokemon_name (plus pokemon_id, for the two Nidoran
 * exceptions) onto GAME_MASTER's own pokemonId enum, trying, in order: the
 * hand-authored override map, the underscore-separated transform, then the
 * fully-stripped transform — each checked against the real set of enums
 * GAME_MASTER's own dump actually contains, never assumed valid on faith.
 * Returns null if none match (not observed for any of the 1024 currently-
 * released species in the 2026-09-06 audit, but the caller must still handle
 * it — see the "fall back to pogoapi" path in sync-data.ts).
 */
export function resolvePokemonEnum(
  pokemonId: number,
  pokemonName: string,
  knownEnums: ReadonlySet<string>,
): string | null {
  const override = POKEMON_ENUM_OVERRIDES[pokemonId];
  if (override) return override;
  const underscored = underscoreEnumFor(pokemonName);
  if (knownEnums.has(underscored)) return underscored;
  const stripped = strippedEnumFor(pokemonName);
  if (knownEnums.has(stripped)) return stripped;
  return null;
}

/**
 * Resolves the ONE GAME_MASTER pokemonSettings template matching a given
 * (enum, pogoapi-form-string) pair, in priority order:
 *
 * 1. Exact form-key match (`${enum}_${form.toUpperCase()}`) — covers the
 *    overwhelming majority (991/1024 in the 2026-09-06 audit), including
 *    every FORM_OVERRIDES entry (confirmed: GAME_MASTER's own form suffixes
 *    use the identical uppercased-with-underscores spelling as pogoapi's own
 *    form strings for every case checked, e.g. "West_sea" -> "WEST_SEA",
 *    "Fifty_percent" -> "FIFTY_PERCENT").
 * 2. `${enum}_NORMAL` — covers species whose chosen form is "Normal" but
 *    whose specific `_NORMAL`-suffixed template differs in content from the
 *    same-species BARE (no-suffix) template (confirmed via Dugtrio: the bare
 *    template carries stale pre-rebalance base_defense a same-species
 *    `_NORMAL` template doesn't — pogoapi's own "Normal" row matches the
 *    `_NORMAL` template, not the bare one).
 * 3. The bare/no-suffix template (present for all 1024 GAME_MASTER
 *    pokemonId enums, confirmed 2026-09-06) — covers species with no
 *    `_NORMAL`-suffixed template at all, including the single-form-only
 *    Galarian-native species (Obstagoon/Perrserker/Sirfetch'd/Mr. Rime/
 *    Runerigus) whose sole pogoapi-listed form string is "Galarian" but
 *    which GAME_MASTER doesn't distinguish from a base/"Normal" form at all
 *    (there is no alternate form to disambiguate from in the live game).
 *
 * Returns null (caller must fall back to pogoapi's own value + WARN) only if
 * none of the three match — not observed for any of the 1024 currently-
 * released species in the 2026-09-06 audit (1016 resolved via #1, 5 via #2,
 * 3 via #3), but budgeted for regardless of future roster changes.
 */
export function resolveGameMasterPokemonRecord(
  candidates: GameMasterPokemonRecord[],
  enumName: string,
  pogoapiForm: string,
): GameMasterPokemonRecord | null {
  const formKey = `${enumName}_${pogoapiForm.toUpperCase()}`;
  return (
    candidates.find((c) => c.form === formKey) ??
    candidates.find((c) => c.form === `${enumName}_NORMAL`) ??
    candidates.find((c) => !c.form) ??
    null
  );
}

/**
 * GAME_MASTER's own `pokemonClass` field replaces pogoapi's separate
 * pokemon_rarity.json fetch entirely as of the 2026-09-06 pipeline switch:
 * confirmed by direct inspection that pokemonClass's per-species Legendary/
 * Mythic/Ultra-Beast counts (77/23/11, deduplicated by pokemonId) match
 * pokemon_rarity.json's own unique-pokemon_id counts EXACTLY. Absence of
 * pokemonClass means "Standard" — there is no explicit
 * POKEMON_CLASS_STANDARD enum value in GAME_MASTER, Standard is simply
 * whatever isn't one of the other three. Throws on an unrecognized non-empty
 * value (mirrors the old toPokemonRarity's strictness) so an upstream
 * vocabulary change surfaces loudly rather than silently misclassifying.
 */
export function pokemonClassToRarity(pokemonClass: string | undefined): PokemonRarity {
  if (!pokemonClass) return "STANDARD";
  switch (pokemonClass) {
    case "POKEMON_CLASS_LEGENDARY":
      return "LEGENDARY";
    case "POKEMON_CLASS_MYTHIC":
      return "MYTHIC";
    case "POKEMON_CLASS_ULTRA_BEAST":
      return "ULTRA_BEAST";
    default:
      throw new Error(`pokemonClassToRarity: unrecognized GAME_MASTER pokemonClass "${pokemonClass}"`);
  }
}

/**
 * Splits `value` on any run of underscores and title-cases each resulting
 * word (e.g. "PSYCHO_CUT" -> "Psycho Cut", "Crowned_sword" -> "Crowned
 * Sword", "west_sea" -> "West Sea") — the shared word-transform behind BOTH
 * displayNameForMovementId (movementIds, always ALL_CAPS input) and
 * formDisplayName below (pogoapi/GAME_MASTER form suffixes, which arrive
 * already-mixed-case, e.g. "Crowned_sword"), each layering its own
 * field-specific handling on top (movementId's `_FAST` stripping) rather
 * than duplicating this split-and-title-case logic a third time. Explicitly
 * upper-cases each word's first character (not just relying on it already
 * being upper-case), so both all-caps and mixed-case input converge on the
 * identical correct output.
 */
function titleCaseUnderscoredWords(value: string): string {
  return value
    .split("_")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

/**
 * Converts a GAME_MASTER movementId (e.g. "PSYCHO_CUT_FAST") into the same
 * human-readable display name pogoapi.net's own move `name` field would give
 * it (e.g. "Psycho Cut") — GAME_MASTER's `moveSettings` table has no display
 * name field of its own, only this identifier. Verified 2026-09-06 to
 * reconstruct pogoapi's exact current display name for 308/317 synced moves
 * with ZERO mismatches wherever a GAME_MASTER moveSettings entry for that
 * move existed at all; the 9 non-matches were all moves GAME_MASTER doesn't
 * currently expose under a matching movementId (Dynamax-exclusive/very-rare
 * signature moves, none referenced by any released species' moveset) — not
 * naming-convention mismatches. One confirmed case where this is actually
 * MORE correct than pogoapi's own data: pogoapi's "Myst Fire" is a truncated/
 * typo'd display name for what GAME_MASTER (and the real game) calls
 * "Mystical Fire".
 */
export function displayNameForMovementId(movementId: string, isFast: boolean): string {
  const trimmed = isFast && movementId.endsWith("_FAST") ? movementId.slice(0, -5) : movementId;
  return titleCaseUnderscoredWords(trimmed);
}

/**
 * Cleans a pogoapi/GAME_MASTER form suffix (e.g. "Crowned_sword", "West_sea",
 * "Paldea_aqua", "Fifty_percent") into the natural display text a species
 * name composes it into ("Crowned Sword", "West Sea", "Paldea Aqua", "Fifty
 * Percent") — 2026-09-10 fix for 21 species whose `SpeciesDefinition.name`
 * carried a raw underscore straight through (e.g. "Zacian (Crowned_sword)").
 * See titleCaseUnderscoredWords above for the shared transform.
 *
 * NEVER apply this to the raw `form` string used anywhere else in this
 * pipeline — GAME_MASTER form-key matching (`${enum}_${form.toUpperCase()}`),
 * pokemon_stats.json row lookups, and `fromGameMaster`'s own `speciesIdFor`
 * (packages/engine/src/gamemaster.ts) all need the RAW underscored form
 * verbatim; `speciesIdFor` in particular is what derives a species' `.id`,
 * which must never change (ids are embedded in every shared scenario URL).
 * This function exists ONLY to recompute a cleaned `.name` on a
 * SpeciesDefinition `fromGameMaster` has already returned — see
 * applyCleanFormDisplayName in sync-data.ts (the primary caller),
 * qualifiedRosterName in ./pokebattlerRaids.ts, and the pogoapi-previous
 * raidHistory backfill's own qualified-name construction in sync-data.ts —
 * every place that independently reconstructs this project's "Name (Form)"
 * display convention for a LOOKUP (not just a log message) needs this same
 * cleanup or it silently stops matching the now-cleaned roster name.
 */
export function formDisplayName(rawForm: string): string {
  return titleCaseUnderscoredWords(rawForm)
    .split(" ")
    .map((word, index) => (index > 0 && LOWERCASE_FORM_PARTICLES.has(word.toLowerCase()) ? word.toLowerCase() : word))
    .join(" ");
}

/**
 * Words a real form name leaves lowercase when they aren't the first word —
 * so Maushold's "FAMILY_OF_FOUR" reads "Family of Four", the way the game
 * itself writes it, rather than the "Family Of Four" a naive per-word title
 * case produces. Exactly one of the 21 forms this cleanup touches needs it
 * today; the set is kept minimal and additive rather than importing a general
 * English title-case rule, because every extra word here is a new chance to
 * lowercase something that is genuinely part of a name.
 *
 * Deliberately applied ONLY in formDisplayName, never in
 * titleCaseUnderscoredWords itself — that shared helper also backs
 * displayNameForMovementId, whose output is validated to reconstruct
 * pogoapi's exact move display names (308/317, zero mismatches). Moving this
 * rule up into the shared helper would put that validation at risk to fix a
 * cosmetic issue in a different namespace.
 */
const LOWERCASE_FORM_PARTICLES = new Set(["of"]);

/**
 * The same reverse transform in the opposite direction: guesses the
 * GAME_MASTER movementId a pogoapi move display name would correspond to
 * (e.g. "Psycho Cut" + isFast -> "PSYCHO_CUT_FAST"). Used only to build the
 * pogoapi-sourced fallback move tables consulted when a specific movementId
 * a species' GAME_MASTER moveset references has no matching moveSettings
 * entry (see sync-data.ts's move-resolution — a per-move safety net, not the
 * primary path). This is the literal inverse of displayNameForMovementId and
 * shares its 2026-09-06 validation (0 reconstruction mismatches wherever
 * both sides existed).
 */
export function guessMovementIdForDisplayName(displayName: string, isFast: boolean): string {
  const base = underscoreEnumFor(displayName);
  return isFast ? `${base}_FAST` : base;
}

/**
 * Result of resolving one mega/primal tempEvo (Mega/Mega X/Mega Y/Primal)
 * against GAME_MASTER's own tempEvoOverrides data for a species. `ambiguous`
 * true means 2+ of the species' own GAME_MASTER templates carry CONFLICTING
 * tempEvoOverrides blocks for the same tempEvoId (mirrors the pre-existing
 * gap-filling code's conflict check) — caller should treat this the same as
 * "not found" and fall back to pogoapi, logging the conflict rather than
 * silently picking one.
 */
export interface MegaResolution {
  ambiguous: boolean;
  baseAttack: number;
  baseDefense: number;
  baseStamina: number;
  /** GAME_MASTER-raw type strings (e.g. "POKEMON_TYPE_STEEL"), 1 or 2 entries. */
  types: string[];
  firstTimeMegaEnergyRequired?: number;
  megaEnergyRequired?: number;
}

/**
 * Resolves a mega/primal form's base stats + typing directly from
 * GAME_MASTER's tempEvoOverrides, given the ALREADY-RESOLVED base species'
 * GAME_MASTER pokemonId enum and templates. See
 * GameMasterTempEvoOverrideRecord's doc comment (rawShapes.ts) for the
 * `hasTypeOverride` type-resolution nuance (a single-type override — e.g.
 * Mega Aggron losing its Rock typing — must NOT fall back to the base
 * species' type2, confirmed via a 2026-09-06 cross-check against pogoapi's
 * already-real mega_pokemon.json entry). Returns null if no candidate
 * carries a tempEvoOverrides block for the requested tempEvoId at all (the
 * mega/primal genuinely isn't in this GAME_MASTER dump under this species).
 */
export function resolveMegaFromGameMaster(
  candidates: GameMasterPokemonRecord[],
  tempEvoId: string,
): MegaResolution | null {
  const matches = candidates.flatMap((record) =>
    record.tempEvoOverrides.filter((o) => o.tempEvoId === tempEvoId).map((override) => ({ record, override })),
  );
  if (matches.length === 0) return null;

  const distinctKeys = new Set(
    matches.map(
      ({ override }) =>
        `${override.baseAttack}/${override.baseDefense}/${override.baseStamina}/${override.typeOverride1 ?? ""}/${override.typeOverride2 ?? ""}/${override.hasTypeOverride}`,
    ),
  );
  // matches.length === 0 returned above, so matches[0] is provably present here.
  const { record, override } = matches[0]!;
  const types = override.hasTypeOverride
    ? [override.typeOverride1, override.typeOverride2].filter((t): t is string => Boolean(t))
    : [record.type, record.type2].filter((t): t is string => Boolean(t));

  return {
    ambiguous: distinctKeys.size > 1,
    baseAttack: override.baseAttack,
    baseDefense: override.baseDefense,
    baseStamina: override.baseStamina,
    types,
    firstTimeMegaEnergyRequired: override.firstTimeMegaEnergyRequired,
    megaEnergyRequired: override.megaEnergyRequired,
  };
}
