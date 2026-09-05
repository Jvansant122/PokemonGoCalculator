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
  /**
   * Whether an opponent can reliably perfectly-dodge THIS move landing on
   * them. Undefined/omitted means true (dodgeable) — this is the honest
   * default because pogoapi.net (this project's data source) has no
   * frame-level "damage window" timing for any move, so there's no real data
   * basis to mark any of the 1000+ synced moves false. Only ever hand-set to
   * false on a specific move once actually identified as undodgeable in
   * practice, the same way vulnerableWindowSeconds and fixture base stats are
   * hand-authored elsewhere in this project. See breakpoints.ts's
   * dodgeMultiplierForHit for where this is consumed.
   */
  perfectlyDodgeable?: boolean;
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
    /**
     * Whether this boost keeps applying to teammates for the rest of the
     * fight even after this Pokémon has fainted, as long as it's still in
     * the raid party (not swapped out) — true for Primal Groudon/Kyogre and
     * Mega Rayquaza specifically; every other standard mega's boost ends the
     * instant it faints. [community-consensus] (Bulbapedia, citing a March
     * 2023 Reddit crowd-test — not an official Niantic statement). Defaults
     * to false/undefined, matching every standard mega's real behavior.
     * Consumed by uptime.ts's convertUptimeToTeamDamage, which uses this to
     * decide whether the boost's team-damage window is capped at
     * secondsSurvived (false) or extends to the full fight duration (true).
     */
    persistsThroughFaint?: boolean;
  };
  /**
   * Marks data the user supplied directly rather than sourced from a GameMaster
   * dump — hypothetical mega forms, custom raid bosses, etc.
   */
  isHypothetical?: boolean;
  /**
   * Marks this species as its Shadow form — applies shadow.ts's
   * SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER to its raw base stats
   * (see stats.ts's effectiveStatsAtLevel). [community-consensus], not
   * Niantic-published — see shadow.ts for sourcing detail. Mutually
   * exclusive with `boost`: a Shadow Pokémon cannot Mega Evolve in the real
   * game without being Purified first, so a species carrying both is treated
   * as invalid data (shadow.ts's shadowAdjustedBaseStats throws rather than
   * silently combining them). Defaults to false/undefined (today's
   * behavior: no Shadow modeling).
   */
  isShadow?: boolean;
  /**
   * A sprite/icon URL for this species, if one was resolved (see
   * scripts/sync-data.ts for real species; hand-set on the hypothetical
   * fixtures). Not fetched by the engine itself (no I/O here) — this is
   * plain data set by whoever constructs the SpeciesDefinition.
   */
  imageUrl?: string;
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
