/**
 * Raw pogoapi/ScrapedDuck/GAME_MASTER shapes (subset of fields sync-data.ts
 * and its helper modules read) plus the pipeline-internal bookkeeping types
 * built on top of them. Pure type declarations only — split out of
 * sync-data.ts as part of a 2026-09-06 code-simplifier-prompted reorg (see
 * that file's module docstring); no behavior lives here.
 */

export interface RawPokemonStatsEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  base_attack: number;
  base_defense: number;
  base_stamina: number;
}

export interface RawPokemonTypesEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  type: string[];
}

export interface RawMoveEntry {
  move_id: number;
  name: string;
  type: string;
  power: number;
  energy_delta: number;
  duration: number;
}

export interface RawCurrentMovesEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  fast_moves: string[];
  charged_moves: string[];
  elite_fast_moves: string[];
  elite_charged_moves: string[];
}

export interface RawRaidEntry {
  name: string;
  tier: string;
  canBeShiny?: boolean;
  types?: { name: string }[];
}

/**
 * Shape of a single entry from https://pogoapi.net/api/v1/mega_pokemon.json.
 * `pokemon_id`/`pokemon_name`/`form` describe the BASE (non-mega) species —
 * that's what current_pokemon_moves.json and fast/charged move learnsets are
 * keyed on, since a mega form doesn't get its own separate learnset in the
 * live game. `mega_name` and `stats` describe the mega/primal form itself.
 */
export interface RawMegaPokemonEntry {
  first_time_mega_energy_required: number;
  form: string;
  mega_energy_required: number;
  mega_name: string;
  pokemon_id: number;
  pokemon_name: string;
  stats: {
    base_attack: number;
    base_defense: number;
    base_stamina: number;
  };
  type: string[];
}

export interface ActiveRaidEntry {
  raidName: string;
  tier: string;
  speciesId: string | null;
  isApproximate: boolean;
}

/**
 * Minimal shape read out of a GAME_MASTER dump (PokeMiners' mirror of
 * Niantic's own client-side file — see GAME_MASTER_URL in fetchCache.ts).
 * Only used as a fallback for a mega/primal a currently-live raid references
 * that pogoapi.net's mega_pokemon.json doesn't yet cover (see the
 * "GAME_MASTER fallback" section in sync-data.ts for the gating logic and why
 * gating on liveness matters here specifically).
 */
export interface RawGameMasterTempEvoOverride {
  tempEvoId?: string;
  stats?: { baseStamina: number; baseAttack: number; baseDefense: number };
  typeOverride1?: string;
  typeOverride2?: string;
}

export interface RawGameMasterEvolutionBranch {
  temporaryEvolution?: string;
  temporaryEvolutionEnergyCost?: number;
  temporaryEvolutionEnergyCostSubsequent?: number;
}

export interface RawGameMasterPokemonSettings {
  pokemonId: string;
  type?: string;
  type2?: string;
  tempEvoOverrides?: RawGameMasterTempEvoOverride[];
  evolutionBranch?: RawGameMasterEvolutionBranch[];
}

export interface RawGameMasterEntry {
  templateId?: string;
  data?: {
    pokemonSettings?: RawGameMasterPokemonSettings;
  };
}
