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
 *
 * As of the 2026-09-06 GAME_MASTER pipeline switch, this endpoint's `stats`/
 * `type` fields are no longer the primary source of truth for a mega/primal's
 * base stats/typing (GAME_MASTER's own tempEvoOverrides are, via
 * resolveMegaFromGameMaster in ./gameMasterMatching.ts) — this file's role is
 * now purely the RELEASED-content roster/allowlist (which (pokemon_id,
 * mega-form-suffix) pairs are real, live content), with `stats`/`type` kept
 * only as a same-shape fallback for the rare case GAME_MASTER has no matching
 * tempEvoOverrides block for one of these (not observed in the 2026-09-06
 * audit — all 48 matched exactly — but budgeted for regardless).
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
 * Raw shapes read directly off a live GAME_MASTER dump (PokeMiners' mirror of
 * Niantic's own client-side file — see GAME_MASTER_URL in fetchCache.ts).
 * As of the 2026-09-06 full-pipeline switch, GAME_MASTER is the PRIMARY
 * source for every real species' stats/typing/moveset/rarity (not just a
 * mega/primal-stat-gap fallback) — see fetchGameMasterData in fetchCache.ts,
 * which extracts these into the far more compact GameMasterPokemonRecord/
 * GameMasterMoveRecord shapes below for caching and downstream use, so these
 * "Raw*Full" types are only ever seen during that one extraction pass, never
 * held onto or written to data/raw/ in this full shape.
 */
export interface RawGameMasterTempEvoOverrideFull {
  tempEvoId?: string;
  stats?: { baseStamina: number; baseAttack: number; baseDefense: number };
  typeOverride1?: string;
  typeOverride2?: string;
}

export interface RawGameMasterEvolutionBranchFull {
  temporaryEvolution?: string;
  temporaryEvolutionEnergyCost?: number;
  temporaryEvolutionEnergyCostSubsequent?: number;
}

export interface RawGameMasterPokemonSettingsFull {
  pokemonId: string;
  /**
   * GAME_MASTER's own form field, e.g. "GIRATINA_ALTERED" — already includes
   * the pokemonId enum as a prefix. Undefined for the "bare" template every
   * pokemonId has at least one of (see resolveGameMasterPokemonRecord in
   * ./gameMasterMatching.ts).
   */
  form?: string;
  type?: string;
  type2?: string;
  stats?: { baseStamina: number; baseAttack: number; baseDefense: number };
  quickMoves?: string[];
  cinematicMoves?: string[];
  eliteQuickMove?: string[];
  eliteCinematicMove?: string[];
  /** e.g. "POKEMON_CLASS_LEGENDARY" — absent means Standard. See pokemonClassToRarity. */
  pokemonClass?: string;
  tempEvoOverrides?: RawGameMasterTempEvoOverrideFull[];
  evolutionBranch?: RawGameMasterEvolutionBranchFull[];
}

export interface RawGameMasterMoveSettingsFull {
  /**
   * Almost always a string (e.g. "PSYCHO_CUT_FAST") but confirmed 2026-09-06
   * to be a raw malformed NUMBER on 22 real GAME_MASTER entries (a GAME_MASTER
   * data-quality issue, not a parsing bug on this project's end) — see
   * fetchGameMasterData's templateId-recovery fallback in fetchCache.ts.
   */
  movementId?: string | number;
  pokemonType?: string;
  power?: number;
  energyDelta?: number;
  durationMs?: number;
}

export interface RawGameMasterFullEntry {
  templateId?: string;
  data?: {
    pokemonSettings?: RawGameMasterPokemonSettingsFull;
    moveSettings?: RawGameMasterMoveSettingsFull;
  };
}

/**
 * One mega/primal tempEvoOverrides block, extracted and slightly reshaped
 * from RawGameMasterTempEvoOverrideFull (see fetchGameMasterData). `hasTypeOverride`
 * matters because a tempEvo that redefines typing but ends up single-type
 * (e.g. Mega Aggron: Steel/Rock -> pure Steel) sets typeOverride1 with NO
 * typeOverride2 — that absence means "this form only has one type", NOT
 * "keep the base species' type2" (confirmed 2026-09-06 via Mega Aggron
 * cross-check against pogoapi's already-real mega_pokemon.json entry: base
 * Aggron is Steel/Rock, pogoapi's Mega Aggron is pure Steel, and GAME_MASTER
 * only matches that if the fallback-to-base-type2 is suppressed whenever ANY
 * type override is present at all). See resolveMegaFromGameMaster in
 * ./gameMasterMatching.ts for the consuming logic.
 */
export interface GameMasterTempEvoOverrideRecord {
  tempEvoId: string;
  baseAttack: number;
  baseDefense: number;
  baseStamina: number;
  typeOverride1?: string;
  typeOverride2?: string;
  hasTypeOverride: boolean;
  firstTimeMegaEnergyRequired?: number;
  megaEnergyRequired?: number;
}

/** Compact per-template species record cached to data/raw/game_master.json. */
export interface GameMasterPokemonRecord {
  pokemonId: string;
  form?: string;
  type?: string;
  type2?: string;
  baseAttack: number;
  baseDefense: number;
  baseStamina: number;
  quickMoves: string[];
  cinematicMoves: string[];
  eliteQuickMoves: string[];
  eliteCinematicMoves: string[];
  pokemonClass?: string;
  tempEvoOverrides: GameMasterTempEvoOverrideRecord[];
}

/** Compact per-move record cached to data/raw/game_master.json — this is GAME_MASTER's `moveSettings` (PvE) table, NEVER `combatMove` (PvP/Trainer-Battle-only, different balance numbers for the same move name — verified 2026-09-06 by direct inspection of both tables). */
export interface GameMasterMoveRecord {
  movementId: string;
  pokemonType?: string;
  power: number;
  energyDelta: number;
  durationMs: number;
}
