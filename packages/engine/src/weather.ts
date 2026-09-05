import type { PokemonType } from "./types.js";

/**
 * The real game's 8 in-game weather conditions (7 that boost damage, plus
 * "none" for indoor/unset). `"none"` is the engine's default everywhere a
 * caller omits this — matches today's implicit "no weather modeled" behavior
 * before this field existed, so every pre-existing test/fixture is unaffected.
 */
export type WeatherCondition =
  | "none"
  | "sunny"
  | "rainy"
  | "windy"
  | "cloudy"
  | "fog"
  | "snow"
  | "partly_cloudy";

/**
 * Weather -> boosted move type(s). [community-consensus] — Pokémon GO Fandom
 * wiki, PogoWeather, Pokemon GO Hub, Switchblade Gaming, Hundo Hunter, per a
 * 2026-09-05 research pass (see
 * .claude/agent-memory/pogo-researcher/fact_weather_boost_mechanic.md); no
 * primary/official Niantic source was found this pass. Treat with the same
 * discipline as shadow.ts's SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER
 * — replace with a primary source if one ever surfaces. This mapping has been
 * stable for years across every source checked, with no conflicting dates.
 */
export const WEATHER_BOOSTED_TYPES: Record<WeatherCondition, readonly PokemonType[]> = {
  none: [],
  sunny: ["ground", "fire", "grass"],
  rainy: ["water", "electric", "bug"],
  windy: ["dragon", "flying", "psychic"],
  cloudy: ["fairy"],
  fog: ["dark", "ghost"],
  snow: ["ice", "steel"],
  partly_cloudy: ["normal", "rock"],
};

/**
 * Whether a move of `moveType` receives the active weather's damage boost.
 * Scoped to the MOVE's own type, never the attacking species' type — matches
 * damage.ts's `DamageInputs.weatherBoosted` doc ("whether the move's type
 * matches the currently active weather boost") and applies identically to
 * either side of a fight (a boss's own moves are checked the same way a
 * candidate's are — see comparison.ts).
 *
 * KNOWN SIMPLIFICATION: real Pokémon GO weather also treats the attacking
 * Pokémon as if it were +5 effective levels higher (a stat-level effect on
 * top of the 1.2x damage multiplier below), per
 * fact_weather_boost_mechanic.md. This engine models ONLY the 1.2x
 * WEATHER_BOOST_MULTIPLIER (damage.ts) — the +5-effective-levels stat bump is
 * NOT implemented (would require conditionally recomputing effective stats at
 * level+5 per move, a bigger change deferred as a deliberate v1 scope call).
 * Documented here rather than silently under-modeled, matching this project's
 * discipline for other documented gaps (e.g. bossChargedMoveReadySeconds not
 * modeling boss energy-from-damage-taken).
 */
export function isWeatherBoosted(moveType: PokemonType, weather: WeatherCondition): boolean {
  return WEATHER_BOOSTED_TYPES[weather].includes(moveType);
}
