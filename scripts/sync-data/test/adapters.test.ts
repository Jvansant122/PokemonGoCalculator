import { describe, expect, it } from "vitest";
import { toPokemonType, toRawGameMasterMove, toRawGameMasterMoveFromMoveSettings, spriteUrlForDexId } from "../adapters.ts";
import type { GameMasterMoveRecord } from "../rawShapes.ts";

describe("toPokemonType", () => {
  it("lowercases a bare type string", () => {
    expect(toPokemonType("FIRE")).toBe("fire");
  });

  it("strips a pokemon_type_ prefix", () => {
    expect(toPokemonType("POKEMON_TYPE_WATER")).toBe("water");
  });
});

describe("toRawGameMasterMove", () => {
  it("maps a pogoapi move entry field-for-field into the engine's RawGameMasterMove shape", () => {
    const result = toRawGameMasterMove({ move_id: 14, name: "Vine Whip", type: "grass", power: 6, energy_delta: 5, duration: 500 });
    expect(result).toEqual({ move_id: "14", name: "Vine Whip", type: "grass", power: 6, energy_delta: 5, duration_ms: 500 });
  });
});

describe("toRawGameMasterMoveFromMoveSettings", () => {
  it("synthesizes a display name from the movementId and defaults an absent pokemonType to Normal", () => {
    const record: GameMasterMoveRecord = { movementId: "PSYCHO_CUT_FAST", power: 6, energyDelta: 12, durationMs: 700 };
    const result = toRawGameMasterMoveFromMoveSettings("PSYCHO_CUT_FAST", record, true);
    expect(result).toEqual({
      move_id: "PSYCHO_CUT_FAST",
      name: "Psycho Cut",
      type: "POKEMON_TYPE_NORMAL",
      power: 6,
      energy_delta: 12,
      duration_ms: 700,
    });
  });

  it("preserves a real pokemonType when present", () => {
    const record: GameMasterMoveRecord = { movementId: "DRAGON_CLAW", pokemonType: "POKEMON_TYPE_DRAGON", power: 50, energyDelta: 0, durationMs: 1500 };
    const result = toRawGameMasterMoveFromMoveSettings("DRAGON_CLAW", record, false);
    expect(result.type).toBe("POKEMON_TYPE_DRAGON");
    expect(result.name).toBe("Dragon Claw");
  });
});

describe("spriteUrlForDexId", () => {
  it("builds the PokeAPI sprites mirror URL for a dex id", () => {
    expect(spriteUrlForDexId(1)).toBe("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png");
  });
});
