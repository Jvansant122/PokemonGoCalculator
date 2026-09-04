import type { PokemonType } from "./types.js";

export const SUPER_EFFECTIVE = 1.6;
export const NOT_VERY_EFFECTIVE = 0.625;
export const NO_EFFECT = 0.390625;
export const NEUTRAL = 1;

/**
 * attackingType -> defendingType -> multiplier, for a single type matchup.
 * Values follow current-generation Pokémon GO multipliers (1.6 / 0.625 / 0.390625
 * per step rather than the older 2 / 0.5 / 0.25 core-series values).
 */
const CHART: Partial<Record<PokemonType, Partial<Record<PokemonType, number>>>> = {
  normal: { rock: NOT_VERY_EFFECTIVE, ghost: NO_EFFECT, steel: NOT_VERY_EFFECTIVE },
  fire: { fire: NOT_VERY_EFFECTIVE, water: NOT_VERY_EFFECTIVE, grass: SUPER_EFFECTIVE, ice: SUPER_EFFECTIVE, bug: SUPER_EFFECTIVE, rock: NOT_VERY_EFFECTIVE, dragon: NOT_VERY_EFFECTIVE, steel: SUPER_EFFECTIVE },
  water: { fire: SUPER_EFFECTIVE, water: NOT_VERY_EFFECTIVE, grass: NOT_VERY_EFFECTIVE, ground: SUPER_EFFECTIVE, rock: SUPER_EFFECTIVE, dragon: NOT_VERY_EFFECTIVE },
  electric: { water: SUPER_EFFECTIVE, electric: NOT_VERY_EFFECTIVE, grass: NOT_VERY_EFFECTIVE, ground: NO_EFFECT, flying: SUPER_EFFECTIVE, dragon: NOT_VERY_EFFECTIVE },
  grass: { fire: NOT_VERY_EFFECTIVE, water: SUPER_EFFECTIVE, grass: NOT_VERY_EFFECTIVE, poison: NOT_VERY_EFFECTIVE, ground: SUPER_EFFECTIVE, flying: NOT_VERY_EFFECTIVE, bug: NOT_VERY_EFFECTIVE, rock: SUPER_EFFECTIVE, dragon: NOT_VERY_EFFECTIVE, steel: NOT_VERY_EFFECTIVE },
  ice: { fire: NOT_VERY_EFFECTIVE, water: NOT_VERY_EFFECTIVE, grass: SUPER_EFFECTIVE, ice: NOT_VERY_EFFECTIVE, ground: SUPER_EFFECTIVE, flying: SUPER_EFFECTIVE, dragon: SUPER_EFFECTIVE, steel: NOT_VERY_EFFECTIVE, fighting: NOT_VERY_EFFECTIVE },
  fighting: { normal: SUPER_EFFECTIVE, ice: SUPER_EFFECTIVE, poison: NOT_VERY_EFFECTIVE, flying: NOT_VERY_EFFECTIVE, psychic: NOT_VERY_EFFECTIVE, bug: NOT_VERY_EFFECTIVE, rock: SUPER_EFFECTIVE, ghost: NO_EFFECT, dark: SUPER_EFFECTIVE, steel: SUPER_EFFECTIVE, fairy: NOT_VERY_EFFECTIVE },
  poison: { grass: SUPER_EFFECTIVE, poison: NOT_VERY_EFFECTIVE, ground: NOT_VERY_EFFECTIVE, rock: NOT_VERY_EFFECTIVE, ghost: NOT_VERY_EFFECTIVE, steel: NO_EFFECT, fairy: SUPER_EFFECTIVE },
  ground: { fire: SUPER_EFFECTIVE, electric: SUPER_EFFECTIVE, grass: NOT_VERY_EFFECTIVE, poison: SUPER_EFFECTIVE, flying: NO_EFFECT, bug: NOT_VERY_EFFECTIVE, rock: SUPER_EFFECTIVE, steel: SUPER_EFFECTIVE },
  flying: { electric: NOT_VERY_EFFECTIVE, grass: SUPER_EFFECTIVE, fighting: SUPER_EFFECTIVE, bug: SUPER_EFFECTIVE, rock: NOT_VERY_EFFECTIVE, steel: NOT_VERY_EFFECTIVE },
  psychic: { fighting: SUPER_EFFECTIVE, poison: SUPER_EFFECTIVE, psychic: NOT_VERY_EFFECTIVE, dark: NO_EFFECT, steel: NOT_VERY_EFFECTIVE },
  bug: { fire: NOT_VERY_EFFECTIVE, grass: SUPER_EFFECTIVE, fighting: NOT_VERY_EFFECTIVE, poison: NOT_VERY_EFFECTIVE, flying: NOT_VERY_EFFECTIVE, psychic: SUPER_EFFECTIVE, ghost: NOT_VERY_EFFECTIVE, dark: SUPER_EFFECTIVE, steel: NOT_VERY_EFFECTIVE, fairy: NOT_VERY_EFFECTIVE },
  rock: { fire: SUPER_EFFECTIVE, ice: SUPER_EFFECTIVE, fighting: NOT_VERY_EFFECTIVE, ground: NOT_VERY_EFFECTIVE, flying: SUPER_EFFECTIVE, bug: SUPER_EFFECTIVE, steel: NOT_VERY_EFFECTIVE },
  ghost: { normal: NO_EFFECT, psychic: SUPER_EFFECTIVE, ghost: SUPER_EFFECTIVE, dark: NOT_VERY_EFFECTIVE },
  dragon: { dragon: SUPER_EFFECTIVE, steel: NOT_VERY_EFFECTIVE, fairy: NO_EFFECT },
  dark: { fighting: NOT_VERY_EFFECTIVE, psychic: SUPER_EFFECTIVE, ghost: SUPER_EFFECTIVE, dark: NOT_VERY_EFFECTIVE, fairy: NOT_VERY_EFFECTIVE },
  steel: { fire: NOT_VERY_EFFECTIVE, water: NOT_VERY_EFFECTIVE, electric: NOT_VERY_EFFECTIVE, ice: SUPER_EFFECTIVE, rock: SUPER_EFFECTIVE, steel: NOT_VERY_EFFECTIVE, fairy: SUPER_EFFECTIVE },
  fairy: { fire: NOT_VERY_EFFECTIVE, fighting: SUPER_EFFECTIVE, poison: NOT_VERY_EFFECTIVE, dragon: SUPER_EFFECTIVE, dark: SUPER_EFFECTIVE, steel: NOT_VERY_EFFECTIVE },
};

function singleTypeMultiplier(attacking: PokemonType, defending: PokemonType): number {
  return CHART[attacking]?.[defending] ?? NEUTRAL;
}

/**
 * Full type-effectiveness multiplier for an attacking type against a (possibly
 * dual-typed) defender. Dual typing stacks multiplicatively across both of the
 * defender's types, matching in-game behavior (e.g. a 4x weakness is two
 * separate 1.6x steps against the current-gen chart, not a single 2.56x lookup).
 */
export function typeEffectiveness(
  attackingType: PokemonType,
  defendingTypes: readonly PokemonType[],
): number {
  return defendingTypes.reduce(
    (multiplier, defendingType) => multiplier * singleTypeMultiplier(attackingType, defendingType),
    1,
  );
}
