/** Same-type attack bonus. */
export const STAB_MULTIPLIER = 1.2;

/** No bonus applied — used as the default for optional modifiers below. */
export const NO_BONUS = 1;

/** Weather boost applied when the move's type matches the active boosted weather. */
export const WEATHER_BOOST_MULTIPLIER = 1.2;

/** Best-friend attack bonus (trainer battles only; raids/gyms do not apply this). */
export const FRIENDSHIP_BEST_BUDDY_MULTIPLIER = 1.1;

export interface DamageInputs {
  power: number;
  attackerAttackStat: number;
  defenderDefenseStat: number;
  /** Whether the move's type matches one of the attacker's own types. */
  stab: boolean;
  /** Full type-effectiveness multiplier (see typeChart.ts), typically 1 unless supplied. */
  typeEffectiveness?: number;
  /** Whether the move's type matches the currently active weather boost. */
  weatherBoosted?: boolean;
  /** Whether the attacker is a Best Buddy of its trainer. */
  bestBuddy?: boolean;
  /** Mega/Primal boost multiplier, applied while the attacker's boosted form is active. */
  megaBoostMultiplier?: number;
}

/**
 * Standard Pokémon GO raid/gym damage formula:
 *   floor(0.5 * power * (atk/def) * STAB * effectiveness * weather * friendship * megaBoost) + 1
 * All modifiers are named inputs so no magic numbers appear at call sites.
 */
export function calculateDamage(inputs: DamageInputs): number {
  const {
    power,
    attackerAttackStat,
    defenderDefenseStat,
    stab,
    typeEffectiveness = NEUTRAL_EFFECTIVENESS,
    weatherBoosted = false,
    bestBuddy = false,
    megaBoostMultiplier = NO_BONUS,
  } = inputs;

  const stabMultiplier = stab ? STAB_MULTIPLIER : NO_BONUS;
  const weatherMultiplier = weatherBoosted ? WEATHER_BOOST_MULTIPLIER : NO_BONUS;
  const friendshipMultiplier = bestBuddy ? FRIENDSHIP_BEST_BUDDY_MULTIPLIER : NO_BONUS;

  const raw =
    0.5 *
    power *
    (attackerAttackStat / defenderDefenseStat) *
    stabMultiplier *
    typeEffectiveness *
    weatherMultiplier *
    friendshipMultiplier *
    megaBoostMultiplier;

  return Math.floor(raw) + 1;
}

const NEUTRAL_EFFECTIVENESS = 1;
