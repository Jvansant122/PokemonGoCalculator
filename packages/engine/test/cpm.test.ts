import { describe, expect, it } from "vitest";
import { cpmForLevel } from "../src/cpm.js";
import { effectiveStat } from "../src/stats.js";

describe("CPM_TABLE levels 41-50", () => {
  it("accepts level 45 with the verified GAME_MASTER value", () => {
    expect(cpmForLevel(45)).toBeCloseTo(0.8153, 10);
  });

  it("accepts level 50 with the verified GAME_MASTER value", () => {
    expect(cpmForLevel(50)).toBeCloseTo(0.8403, 10);
  });

  it("accepts a half-level in the new range (45.5)", () => {
    expect(cpmForLevel(45.5)).toBeCloseTo(0.8178038212187566, 10);
  });

  it("produces the expected effective stat at level 50", () => {
    // 200 base + 15 IV = 215, floor(215 * 0.8403) = 180
    expect(effectiveStat(200, 15, cpmForLevel(50))).toBe(Math.floor(215 * 0.8403));
  });

  it("rejects level 50.5 and beyond (not a live-reachable Pokémon level)", () => {
    expect(() => cpmForLevel(50.5)).toThrow();
    expect(() => cpmForLevel(51)).toThrow();
  });

  it("rejects level 0", () => {
    expect(() => cpmForLevel(0)).toThrow();
  });
});
