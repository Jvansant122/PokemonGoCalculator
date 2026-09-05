import { describe, expect, it } from "vitest";
import { isWeatherBoosted, WEATHER_BOOSTED_TYPES, type WeatherCondition } from "../src/weather.js";
import type { PokemonType } from "../src/types.js";

describe("weather", () => {
  it("'none' boosts nothing", () => {
    const allTypes: PokemonType[] = [
      "normal", "fire", "water", "electric", "grass", "ice",
      "fighting", "poison", "ground", "flying", "psychic", "bug",
      "rock", "ghost", "dragon", "dark", "steel", "fairy",
    ];
    for (const type of allTypes) {
      expect(isWeatherBoosted(type, "none")).toBe(false);
    }
  });

  it("matches the community-sourced weather-to-type mapping", () => {
    expect(isWeatherBoosted("water", "rainy")).toBe(true);
    expect(isWeatherBoosted("electric", "rainy")).toBe(true);
    expect(isWeatherBoosted("bug", "rainy")).toBe(true);
    expect(isWeatherBoosted("fire", "rainy")).toBe(false);

    expect(isWeatherBoosted("fire", "sunny")).toBe(true);
    expect(isWeatherBoosted("ground", "sunny")).toBe(true);
    expect(isWeatherBoosted("grass", "sunny")).toBe(true);
    expect(isWeatherBoosted("water", "sunny")).toBe(false);

    expect(isWeatherBoosted("dragon", "windy")).toBe(true);
    expect(isWeatherBoosted("flying", "windy")).toBe(true);
    expect(isWeatherBoosted("psychic", "windy")).toBe(true);

    expect(isWeatherBoosted("fairy", "cloudy")).toBe(true);
    expect(isWeatherBoosted("dark", "fog")).toBe(true);
    expect(isWeatherBoosted("ghost", "fog")).toBe(true);
    expect(isWeatherBoosted("ice", "snow")).toBe(true);
    expect(isWeatherBoosted("steel", "snow")).toBe(true);
    expect(isWeatherBoosted("normal", "partly_cloudy")).toBe(true);
    expect(isWeatherBoosted("rock", "partly_cloudy")).toBe(true);
  });

  it("checks the move's own type, not implying anything about a species' type", () => {
    // isWeatherBoosted only ever takes a bare PokemonType — this test just
    // documents that the function has no species-level concept at all, so a
    // caller cannot accidentally pass a species and get a per-type-array
    // answer back.
    const weather: WeatherCondition = "rainy";
    expect(WEATHER_BOOSTED_TYPES[weather]).toEqual(["water", "electric", "bug"]);
  });
});
