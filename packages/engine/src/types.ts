export type PokemonType =
  | "normal" | "fire" | "water" | "electric" | "grass" | "ice"
  | "fighting" | "poison" | "ground" | "flying" | "psychic" | "bug"
  | "rock" | "ghost" | "dragon" | "dark" | "steel" | "fairy";

export interface IVSpread {
  attack: number;
  defense: number;
  stamina: number;
}

export interface FastMove {
  id: string;
  name: string;
  type: PokemonType;
  power: number;
  /** Energy gained by the user each time this move completes. */
  energyGain: number;
  /** Total move duration in seconds, including the animation lockout. */
  durationSeconds: number;
}

export interface ChargedMove {
  id: string;
  name: string;
  type: PokemonType;
  power: number;
  /** Energy required to fire this move. */
  energyCost: number;
  durationSeconds: number;
  /**
   * Portion of the move's duration, starting from move start, during which the
   * user is vulnerable to incoming damage (cannot dodge/be interrupted out of it).
   * Used to model the "died mid-animation" failure mode from the source analysis.
   */
  vulnerableWindowSeconds: number;
}

export interface SpeciesDefinition {
  id: string;
  name: string;
  types: [PokemonType] | [PokemonType, PokemonType];
  baseAttack: number;
  baseDefense: number;
  baseStamina: number;
  fastMoves: FastMove[];
  chargedMoves: ChargedMove[];
  /** True mega/primal forms apply a party-wide or self boost multiplier while active. */
  boost?: {
    multiplier: number;
    /** The type whose damage output (attacker or teammates) receives the boost. */
    boostedType: PokemonType;
  };
  /**
   * Marks data the user supplied directly rather than sourced from a GameMaster
   * dump — hypothetical mega forms, custom raid bosses, etc.
   */
  isHypothetical?: boolean;
}

export interface Combatant {
  species: SpeciesDefinition;
  level: number;
  ivs: IVSpread;
  fastMove: FastMove;
  chargedMove: ChargedMove;
}

export interface EffectiveStats {
  attack: number;
  defense: number;
  stamina: number;
}
