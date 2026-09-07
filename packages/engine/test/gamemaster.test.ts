import { describe, expect, it } from "vitest";
import {
  SpeciesRegistry,
  fromGameMaster,
  fromGameMasterMove,
  speciesIdFor,
  type RawGameMasterMove,
  type RawGameMasterSpecies,
} from "../src/gamemaster.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";

describe("speciesIdFor", () => {
  it("drops the 'Normal' form from the id", () => {
    expect(speciesIdFor({ pokemon_name: "Raichu", form: "Normal" })).toBe("raichu");
  });

  it("lowercases and hyphen-appends a non-Normal form", () => {
    expect(speciesIdFor({ pokemon_name: "Raichu", form: "Mega X" })).toBe("raichu-mega x");
    expect(speciesIdFor({ pokemon_name: "Skarmory", form: "MEGA" })).toBe("skarmory-mega");
  });

  it("lowercases the base name even with no form", () => {
    expect(speciesIdFor({ pokemon_name: "Kyogre" })).toBe("kyogre");
  });

  it("treats a missing form the same as a Normal form", () => {
    expect(speciesIdFor({ pokemon_name: "Kyogre", form: undefined })).toBe("kyogre");
  });
});

describe("fromGameMaster", () => {
  const types: [SpeciesDefinition["types"][number]] = ["water"];
  const fastMoves: FastMove[] = [
    { id: "waterfall", name: "Waterfall", type: "water", power: 12, energyGain: 7, durationSeconds: 1.2 },
  ];
  const chargedMoves: ChargedMove[] = [
    {
      id: "hydro-pump",
      name: "Hydro Pump",
      type: "water",
      power: 130,
      energyCost: 75,
      durationSeconds: 3.6,
      vulnerableWindowSeconds: 3.6,
    },
  ];

  it("maps base stats through unchanged, with no flooring or transformation", () => {
    const raw: RawGameMasterSpecies = {
      pokemon_id: 382,
      pokemon_name: "Kyogre",
      base_attack: 270.5, // deliberately non-integer to prove no floor/round is applied here
      base_defense: 251.1,
      base_stamina: 205.9,
    };
    const species = fromGameMaster(raw, types, fastMoves, chargedMoves);
    expect(species.baseAttack).toBe(270.5);
    expect(species.baseDefense).toBe(251.1);
    expect(species.baseStamina).toBe(205.9);
  });

  it("passes types/fastMoves/chargedMoves through verbatim", () => {
    const raw: RawGameMasterSpecies = {
      pokemon_id: 382,
      pokemon_name: "Kyogre",
      base_attack: 270,
      base_defense: 251,
      base_stamina: 205,
    };
    const species = fromGameMaster(raw, types, fastMoves, chargedMoves);
    expect(species.types).toBe(types);
    expect(species.fastMoves).toBe(fastMoves);
    expect(species.chargedMoves).toBe(chargedMoves);
  });

  it("computes id via speciesIdFor", () => {
    const raw: RawGameMasterSpecies = {
      pokemon_id: 382,
      pokemon_name: "Kyogre",
      form: "Primal",
      base_attack: 270,
      base_defense: 251,
      base_stamina: 205,
    };
    const species = fromGameMaster(raw, types, fastMoves, chargedMoves);
    expect(species.id).toBe(speciesIdFor(raw));
    expect(species.id).toBe("kyogre-primal");
  });

  it("does NOT suffix the name for a Normal form", () => {
    const raw: RawGameMasterSpecies = {
      pokemon_id: 25,
      pokemon_name: "Raichu",
      form: "Normal",
      base_attack: 218,
      base_defense: 193,
      base_stamina: 155,
    };
    const species = fromGameMaster(raw, types, fastMoves, chargedMoves);
    expect(species.name).toBe("Raichu");
  });

  it("does NOT suffix the name when form is entirely absent", () => {
    const raw: RawGameMasterSpecies = {
      pokemon_id: 25,
      pokemon_name: "Raichu",
      base_attack: 218,
      base_defense: 193,
      base_stamina: 155,
    };
    const species = fromGameMaster(raw, types, fastMoves, chargedMoves);
    expect(species.name).toBe("Raichu");
  });

  it("adds a ' (Form)' suffix to the name for a non-Normal form", () => {
    const raw: RawGameMasterSpecies = {
      pokemon_id: 25,
      pokemon_name: "Raichu",
      form: "Mega X",
      base_attack: 277,
      base_defense: 203,
      base_stamina: 155,
    };
    const species = fromGameMaster(raw, types, fastMoves, chargedMoves);
    expect(species.name).toBe("Raichu (Mega X)");
  });
});

describe("fromGameMasterMove", () => {
  it("a positive energy_delta becomes energyGain, with energyCost 0 (fast move convention)", () => {
    const raw: RawGameMasterMove = {
      move_id: "WATER_GUN_FAST",
      name: "Water Gun",
      type: "POKEMON_TYPE_WATER",
      power: 5,
      energy_delta: 6,
      duration_ms: 500,
    };
    const move = fromGameMasterMove(raw);
    expect(move.energyGain).toBe(6);
    expect(move.energyCost).toBe(0);
  });

  it("a negative energy_delta becomes a positive energyCost, with energyGain 0 (charged move convention)", () => {
    const raw: RawGameMasterMove = {
      move_id: "HYDRO_PUMP",
      name: "Hydro Pump",
      type: "POKEMON_TYPE_WATER",
      power: 130,
      energy_delta: -75,
      duration_ms: 3600,
    };
    const move = fromGameMasterMove(raw);
    expect(move.energyCost).toBe(75);
    expect(move.energyGain).toBe(0);
  });

  it("converts duration_ms to durationSeconds by dividing by 1000", () => {
    const raw: RawGameMasterMove = {
      move_id: "TACKLE_FAST",
      name: "Tackle",
      type: "POKEMON_TYPE_NORMAL",
      power: 3,
      energy_delta: 4,
      duration_ms: 500,
    };
    const move = fromGameMasterMove(raw);
    expect(move.durationSeconds).toBe(0.5);
  });

  it("defaults durationSeconds to 0 when duration_ms is missing", () => {
    const raw: RawGameMasterMove = {
      move_id: "TACKLE_FAST",
      name: "Tackle",
      type: "POKEMON_TYPE_NORMAL",
      power: 3,
      energy_delta: 4,
    };
    const move = fromGameMasterMove(raw);
    expect(move.durationSeconds).toBe(0);
  });

  // Documented approximation: neither GAME_MASTER's cached move slice nor
  // pogoapi carries frame-level "damage window" timing, so fromGameMasterMove
  // sets vulnerableWindowSeconds to the move's full durationSeconds as the
  // honest stand-in, rather than a real sub-window. This is pinned here so a
  // future change to this approximation is a deliberate, visible decision.
  it("sets vulnerableWindowSeconds equal to the full durationSeconds (documented approximation, not real frame data)", () => {
    const raw: RawGameMasterMove = {
      move_id: "HYDRO_PUMP",
      name: "Hydro Pump",
      type: "POKEMON_TYPE_WATER",
      power: 130,
      energy_delta: -75,
      duration_ms: 3600,
    };
    const move = fromGameMasterMove(raw);
    expect(move.vulnerableWindowSeconds).toBe(move.durationSeconds);
    expect(move.vulnerableWindowSeconds).toBe(3.6);
  });

  it("normalizes a 'POKEMON_TYPE_FIRE'-style raw type to 'fire'", () => {
    const raw: RawGameMasterMove = {
      move_id: "EMBER_FAST",
      name: "Ember",
      type: "POKEMON_TYPE_FIRE",
      power: 10,
      energy_delta: 10,
      duration_ms: 1000,
    };
    const move = fromGameMasterMove(raw);
    expect(move.type).toBe("fire");
  });

  it("normalizes a plain 'Fire'-style raw type to 'fire' too", () => {
    const raw: RawGameMasterMove = {
      move_id: "EMBER_FAST",
      name: "Ember",
      type: "Fire",
      power: 10,
      energy_delta: 10,
      duration_ms: 1000,
    };
    const move = fromGameMasterMove(raw);
    expect(move.type).toBe("fire");
  });

  it("passes id/name/power through unchanged", () => {
    const raw: RawGameMasterMove = {
      move_id: "HYDRO_PUMP",
      name: "Hydro Pump",
      type: "POKEMON_TYPE_WATER",
      power: 130,
      energy_delta: -75,
      duration_ms: 3600,
    };
    const move = fromGameMasterMove(raw);
    expect(move.id).toBe("HYDRO_PUMP");
    expect(move.name).toBe("Hydro Pump");
    expect(move.power).toBe(130);
  });
});

describe("SpeciesRegistry", () => {
  const makeSpecies = (id: string): SpeciesDefinition => ({
    id,
    name: id,
    types: ["normal"],
    baseAttack: 150,
    baseDefense: 150,
    baseStamina: 150,
    fastMoves: [{ id: "f", name: "Fast", type: "normal", power: 8, energyGain: 8, durationSeconds: 1 }],
    chargedMoves: [
      { id: "c", name: "Charged", type: "normal", power: 70, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 },
    ],
  });

  it("register/get round-trips a species by id", () => {
    const registry = new SpeciesRegistry();
    const species = makeSpecies("test-species");
    registry.register(species);
    expect(registry.get("test-species")).toBe(species);
  });

  it("has() reflects registration state", () => {
    const registry = new SpeciesRegistry();
    expect(registry.has("test-species")).toBe(false);
    registry.register(makeSpecies("test-species"));
    expect(registry.has("test-species")).toBe(true);
  });

  it("get() on an unknown id throws", () => {
    const registry = new SpeciesRegistry();
    expect(() => registry.get("unknown-id")).toThrow(/Unknown species id/);
  });

  it("all() returns every registered species", () => {
    const registry = new SpeciesRegistry();
    const a = makeSpecies("a");
    const b = makeSpecies("b");
    registry.register(a);
    registry.register(b);
    expect(registry.all()).toHaveLength(2);
    expect(registry.all()).toEqual(expect.arrayContaining([a, b]));
  });

  it("registerHypothetical sets isHypothetical: true", () => {
    const registry = new SpeciesRegistry();
    registry.registerHypothetical(makeSpecies("hypothetical-species"));
    expect(registry.get("hypothetical-species").isHypothetical).toBe(true);
  });

  it("plain register leaves isHypothetical unset", () => {
    const registry = new SpeciesRegistry();
    registry.register(makeSpecies("plain-species"));
    expect(registry.get("plain-species").isHypothetical).toBeUndefined();
  });
});
