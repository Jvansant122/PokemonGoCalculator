/**
 * Small pure adapters between raw pogoapi record shapes and the engine's own
 * GameMaster-transform input types, plus the (no-request-needed) dex-id
 * sprite URL helper. Split out of sync-data.ts as part of a 2026-09-06
 * code-simplifier-prompted reorg.
 */

import type { PokemonType, RawGameMasterMove } from "@pogo-analyzer/engine";

import type { RawMoveEntry, GameMasterMoveRecord } from "./rawShapes.ts";
import { displayNameForMovementId } from "./gameMasterMatching.ts";

/**
 * Mirrors the exact one-liner `toPokemonType` in packages/engine/src/gamemaster.ts
 * (lowercase, strip a "pokemon_type_" prefix if present). That helper is not
 * exported from the engine — fromGameMaster expects already-converted
 * PokemonType values for its `types` parameter — so this replicates the
 * single line rather than duplicating any real transform logic. Keep this in
 * sync with gamemaster.ts if that function ever changes.
 */
export function toPokemonType(type: string): PokemonType {
  return type.toLowerCase().replace(/^pokemon_type_/, "") as PokemonType;
}

export function toRawGameMasterMove(m: RawMoveEntry): RawGameMasterMove {
  return {
    move_id: String(m.move_id),
    name: m.name,
    type: m.type,
    power: m.power,
    energy_delta: m.energy_delta,
    duration_ms: m.duration,
  };
}

/**
 * Converts a GAME_MASTER moveSettings record (see fetchGameMasterData in
 * ./fetchCache.ts) into the engine's RawGameMasterMove input shape. Unlike
 * pogoapi's own move endpoints, GAME_MASTER's `moveSettings` table has no
 * human-readable display name field at all — only `movementId`
 * (e.g. "PSYCHO_CUT_FAST") — so `name` is synthesized via
 * displayNameForMovementId, confirmed 2026-09-06 to exactly reconstruct
 * pogoapi's own current display name for every move checked (see that
 * function's doc comment).
 */
export function toRawGameMasterMoveFromMoveSettings(
  movementId: string,
  record: GameMasterMoveRecord,
  isFast: boolean,
): RawGameMasterMove {
  return {
    move_id: movementId,
    name: displayNameForMovementId(movementId, isFast),
    type: record.pokemonType ?? "POKEMON_TYPE_NORMAL",
    power: record.power,
    energy_delta: record.energyDelta,
    duration_ms: record.durationMs,
  };
}

/**
 * National-dex sprite from the PokeAPI sprites mirror on GitHub — no API call
 * needed, just the dex id we already have from pokemon_stats.json.
 */
export function spriteUrlForDexId(pokemonId: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonId}.png`;
}

// toPokemonRarity (pogoapi pokemon_rarity.json category -> PokemonRarity) was
// removed as part of the 2026-09-06 GAME_MASTER pipeline switch: GAME_MASTER's
// own `pokemonClass` field replaces that fetch entirely (confirmed exact
// count match against pokemon_rarity.json's own categories) — see
// pokemonClassToRarity in ./gameMasterMatching.ts.
