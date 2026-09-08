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
  // prefixMatch[2] is this regex's mandatory `(.+)` capture group — always
  // present whenever prefixMatch itself is truthy.
  let baseName = prefixMatch[2]!;
  let suffix: "X" | "Y" | undefined;
  const suffixMatch = baseName.match(/^(.+) (X|Y)$/);
  if (suffixMatch) {
    // suffixMatch[1] is this regex's mandatory `(.+)` capture group — always
    // present whenever suffixMatch itself is truthy.
    baseName = suffixMatch[1]!;
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

/**
 * Resolves a mega/primal species' natural id (megaSpeciesIdFor's output)
 * against the set of ids already reserved by species built earlier in the
 * same sync run, appending "-attacker" on collision rather than overwriting
 * or dropping either entry — see sync-data.ts's mega-species build loop for
 * the caller and CLAUDE.md's "Species images" note on why the RENAMED id
 * must never be used for a PokeAPI sprite lookup (PokeAPI has never heard of
 * it; look up the natural, pre-collision name instead — see
 * spriteLookupIdFor below).
 *
 * Extracted 2026-09-08 (data-sync test-scaffolding task) from what was
 * previously an inline ternary directly in sync-data.ts's top-level script
 * body, purely so it's importable/unit-testable without triggering that
 * file's live network fetches — behavior is otherwise unchanged.
 */
export function resolveMegaSpeciesIdCollision(
  naturalId: string,
  reservedSpeciesIds: ReadonlySet<string>,
): { finalId: string; collided: boolean } {
  const collided = reservedSpeciesIds.has(naturalId);
  return { finalId: collided ? `${naturalId}-attacker` : naturalId, collided };
}

/**
 * Given a (possibly `-attacker`-renamed) final species id and the collision
 * map built from resolveMegaSpeciesIdCollision's outputs (finalId ->
 * naturalId, for every id that WAS renamed), returns the id that should be
 * used for a PokeAPI sprite lookup — always the natural, pre-collision name,
 * never the renamed one. Returns `finalId` unchanged when it was never
 * renamed (not present in `collisionRenames`).
 */
export function spriteLookupIdFor(finalId: string, collisionRenames: ReadonlyMap<string, string>): string {
  return collisionRenames.get(finalId) ?? finalId;
}
