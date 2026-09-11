/** Same-type attack bonus. */
export const STAB_MULTIPLIER = 1.2;

/** No bonus applied — used as the default for optional modifiers below. */
export const NO_BONUS = 1;

/** Weather boost applied when the move's type matches the active boosted weather. */
export const WEATHER_BOOST_MULTIPLIER = 1.2;

/**
 * The friendship attack bonus — read straight from GAME_MASTER's
 * `FRIENDSHIP_LEVEL_0..5` templates (`attackBonusPercentage`, fetched
 * 2026-09-09, `[first-party]`; see MECHANICS.md's "The friendship attack
 * bonus is a RAID/GYM mechanic, not PvP"). This applies **in Gym and Raid
 * Battles**, when a friend at this tier is actually co-participating in that
 * battle (only the single HIGHEST tier present counts — no stacking/
 * averaging across multiple friends), and is zero when soloing.
 * `FRIENDSHIP_LEVEL_0`'s own multiplier is 1.0 (no bonus), which is exactly
 * what soloing produces. `"none"` is `DamageInputs.friendshipLevel`'s default
 * (identical to omitting the field).
 *
 * CORRECTED 2026-09-10 — the single-value constant this table replaces
 * (`FRIENDSHIP_BEST_BUDDY_MULTIPLIER`, previously the only representation of
 * this mechanic) carried a comment reading "trainer battles only; raids/gyms
 * do not apply this" — the exact reverse of the sourced scope (PvP trainer
 * battles never apply this bonus at all; that is a completely separate,
 * unrelated mechanic). That constant, and the boolean `bestBuddy` field that
 * read it, are REMOVED (not just corrected) rather than kept alongside this
 * table — their name collided with the unrelated Best Buddy CP Boost
 * (`+1` effective level, see megaLevel.ts's `BEST_BUDDY_EFFECTIVE_LEVEL_BONUS`),
 * a completely different mechanic MECHANICS.md explicitly warns not to
 * conflate. `friendshipLevel` below is now the only representation.
 *
 * This is ALSO a single-trainer-scoped mechanic like weather.ts's
 * `WeatherCondition` — never a team-wide boost like the mega/primal
 * `boostMultiplier` (which never reaches the boosting Pokémon's own party,
 * see uptime.ts). A friendship bonus instead depends on which OTHER trainer
 * is present in the SAME lobby, which this engine has no concept of at all
 * (no multi-trainer modelling anywhere — see CLAUDE.md's standing decision
 * ruling out a "Teambuilding Analyzer"). So every call site that sets this
 * is asserting "assume the highest-tier friend bonus this scenario asks for
 * is present," not deriving it from anything else in the fight.
 */
export const FRIENDSHIP_ATTACK_BONUS_MULTIPLIER = {
  none: 1.0,
  good: 1.03,
  great: 1.05,
  ultra: 1.07,
  best: 1.1,
  forever: 1.12,
} as const;

export type FriendshipLevel = keyof typeof FRIENDSHIP_ATTACK_BONUS_MULTIPLIER;

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
  /**
   * Which friendship tier's co-participating-friend bonus applies to this
   * hit — see FRIENDSHIP_ATTACK_BONUS_MULTIPLIER's doc comment for the real
   * Gym/Raid scope this represents (never PvP, never a solo fight).
   * `undefined`/omitted means no friend bonus (identical to `"none"`).
   */
  friendshipLevel?: FriendshipLevel;
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
    friendshipLevel = "none",
    megaBoostMultiplier = NO_BONUS,
  } = inputs;

  const stabMultiplier = stab ? STAB_MULTIPLIER : NO_BONUS;
  const weatherMultiplier = weatherBoosted ? WEATHER_BOOST_MULTIPLIER : NO_BONUS;
  const friendshipMultiplier = FRIENDSHIP_ATTACK_BONUS_MULTIPLIER[friendshipLevel];

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
