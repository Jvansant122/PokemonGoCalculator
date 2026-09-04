import type { ChargedMove, FastMove, PokemonType, SpeciesDefinition } from "./types.js";

/**
 * Shape of a single entry from a GameMaster-style species dump (this matches the
 * `pokemon_stats.json` endpoint shape published by pogoapi.net: pokemon_id,
 * pokemon_name, base_attack, base_defense, base_stamina, form). Only the fields
 * this engine actually consumes are required; a real dump carries more.
 */
export interface RawGameMasterSpecies {
  pokemon_id: number;
  pokemon_name: string;
  form?: string;
  base_attack: number;
  base_defense: number;
  base_stamina: number;
  types?: string[];
}

export interface RawGameMasterMove {
  move_id: string;
  name: string;
  type: string;
  power: number;
  energy_delta: number;
  duration_ms?: number;
}

function toPokemonType(type: string): PokemonType {
  const normalized = type.toLowerCase().replace(/^pokemon_type_/, "") as PokemonType;
  return normalized;
}

export function speciesIdFor(raw: Pick<RawGameMasterSpecies, "pokemon_name" | "form">): string {
  const form = raw.form && raw.form !== "Normal" ? `-${raw.form.toLowerCase()}` : "";
  return `${raw.pokemon_name.toLowerCase()}${form}`;
}

/**
 * Converts a raw GameMaster/pogoapi-shaped species record plus its resolved
 * moveset into this engine's SpeciesDefinition. This is the on-ramp for real,
 * live-game data.
 */
export function fromGameMaster(
  raw: RawGameMasterSpecies,
  types: [PokemonType] | [PokemonType, PokemonType],
  fastMoves: FastMove[],
  chargedMoves: ChargedMove[],
): SpeciesDefinition {
  return {
    id: speciesIdFor(raw),
    name: raw.form && raw.form !== "Normal" ? `${raw.pokemon_name} (${raw.form})` : raw.pokemon_name,
    types,
    baseAttack: raw.base_attack,
    baseDefense: raw.base_defense,
    baseStamina: raw.base_stamina,
    fastMoves,
    chargedMoves,
  };
}

export function fromGameMasterMove(raw: RawGameMasterMove): FastMove & ChargedMove {
  const durationSeconds = (raw.duration_ms ?? 0) / 1000;
  return {
    id: raw.move_id,
    name: raw.name,
    type: toPokemonType(raw.type),
    power: raw.power,
    energyGain: Math.max(raw.energy_delta, 0),
    energyCost: Math.max(-raw.energy_delta, 0),
    durationSeconds,
    vulnerableWindowSeconds: durationSeconds,
  };
}

/**
 * A species registry that starts from GameMaster-sourced entries but is equally
 * happy to hold user-defined hypothetical entries (custom base stats, typings,
 * movesets) — required because the scenarios this tool exists to compare
 * (Mega Raichu X/Y, Mega Skarmory) aren't live content and never will be.
 */
export class SpeciesRegistry {
  private readonly byId = new Map<string, SpeciesDefinition>();

  register(species: SpeciesDefinition): void {
    this.byId.set(species.id, species);
  }

  registerHypothetical(species: SpeciesDefinition): void {
    this.register({ ...species, isHypothetical: true });
  }

  get(id: string): SpeciesDefinition {
    const found = this.byId.get(id);
    if (!found) {
      throw new Error(`Unknown species id: ${id}`);
    }
    return found;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): SpeciesDefinition[] {
    return [...this.byId.values()];
  }
}
