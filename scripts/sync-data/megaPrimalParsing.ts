/**
 * Pure name-parsing/id-generation helpers for mega/primal species — no I/O,
 * no shared pipeline state. Split out of sync-data.ts as part of a
 * 2026-09-06 code-simplifier-prompted reorg; see that file for how these are
 * used (megaSpeciesIdFor when building species ids off mega_pokemon.json,
 * the rest inside the GAME_MASTER-fallback gap-filling block).
 */

/**
 * Id scheme: strips the base pokemon_name out of mega_name to get a suffix
 * (e.g. "Mega Charizard X" - "Charizard" -> "mega-x"), then builds
 * `${pokemon_name}-${suffix}` (e.g. "charizard-mega-x"). Collision handling
 * against already-reserved ids (appending "-attacker") is the caller's job —
 * see sync-data.ts's megaIdCollisions handling.
 */
export function megaSpeciesIdFor(pokemonName: string, megaName: string): string {
  const suffix = megaName
    .replace(pokemonName, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return `${pokemonName.toLowerCase()}-${suffix}`;
}

export interface MegaOrPrimalRaidNameParts {
  prefix: "Mega" | "Primal";
  baseName: string;
  suffix?: "X" | "Y";
}

export function parseMegaOrPrimalRaidName(name: string): MegaOrPrimalRaidNameParts | null {
  const prefixMatch = name.match(/^(Mega|Primal) (.+)$/);
  if (!prefixMatch) return null;
  const prefix = prefixMatch[1] as "Mega" | "Primal";
  let baseName = prefixMatch[2];
  let suffix: "X" | "Y" | undefined;
  const suffixMatch = baseName.match(/^(.+) (X|Y)$/);
  if (suffixMatch) {
    baseName = suffixMatch[1];
    suffix = suffixMatch[2] as "X" | "Y";
  }
  return { prefix, baseName, suffix };
}

// gameMasterEnumFor (a single-transform GAME_MASTER enum guesser) was
// replaced by resolvePokemonEnum in ./gameMasterMatching.ts as part of the
// 2026-09-06 pipeline switch — that version tries both of GAME_MASTER's real
// naming conventions plus a hand-authored override map, checked against the
// actual known enum set, since a single deterministic transform doesn't
// cover every species (see that function's doc comment).

export function tempEvoIdFor(prefix: "Mega" | "Primal", suffix?: "X" | "Y"): string {
  if (prefix === "Primal") return "TEMP_EVOLUTION_PRIMAL";
  return suffix ? `TEMP_EVOLUTION_MEGA_${suffix}` : "TEMP_EVOLUTION_MEGA";
}
