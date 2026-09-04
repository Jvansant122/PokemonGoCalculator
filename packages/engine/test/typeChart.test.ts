import { describe, expect, it } from "vitest";
import { typeEffectiveness, SUPER_EFFECTIVE, NOT_VERY_EFFECTIVE } from "../src/typeChart.js";

describe("typeEffectiveness", () => {
  it("is neutral for an unlisted matchup", () => {
    expect(typeEffectiveness("normal", ["normal"])).toBe(1);
  });

  it("applies a single super-effective matchup", () => {
    expect(typeEffectiveness("electric", ["water"])).toBe(SUPER_EFFECTIVE);
  });

  it("stacks dual typing multiplicatively, not as a single lookup", () => {
    // Ice vs Dragon/Flying: both of the defender's types are weak to Ice.
    const multiplier = typeEffectiveness("ice", ["dragon", "flying"]);
    expect(multiplier).toBeCloseTo(SUPER_EFFECTIVE * SUPER_EFFECTIVE, 10);
  });

  it("lets a resistance and a weakness cancel partially", () => {
    const multiplier = typeEffectiveness("fire", ["water", "grass"]);
    expect(multiplier).toBeCloseTo(NOT_VERY_EFFECTIVE * SUPER_EFFECTIVE, 10);
  });
});
