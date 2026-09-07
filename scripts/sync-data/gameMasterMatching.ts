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
  return trimmed
    .split("_")
    .map((word) => (word.length > 0 ? word[0] + word.slice(1).toLowerCase() : word))
    .join(" ");
}

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
  const { record, override } = matches[0];
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
