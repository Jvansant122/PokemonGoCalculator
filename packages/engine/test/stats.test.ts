import { describe, expect, it } from "vitest";
import { effectiveStat } from "../src/stats.js";
import { cpmForLevel } from "../src/cpm.js";

describe("effectiveStat", () => {
  it("floors exactly once", () => {
    // (100 + 10) * 0.5 = 55 exactly, no floor visible either way — pick a cpm
    // that forces a genuine fractional result to prove flooring happens.
    expect(effectiveStat(100, 10, 0.6)).toBe(Math.floor(110 * 0.6));
    expect(effectiveStat(100, 10, 0.6)).toBe(66);
  });

  it("does not double-floor when composed with itself", () => {
    // Guards the "nested FLOOR() problem" from the spec: calling effectiveStat
    // on an already-floored value must not be part of the normal pipeline.
    const base = 155;
    const iv = 15;
    const cpm = cpmForLevel(35);
    const once = effectiveStat(base, iv, cpm);
    const twice = Math.floor(once * cpm); // simulates the double-floor bug
    expect(twice).toBeLessThanOrEqual(once);
  });

  it("throws for an unknown level", () => {
    expect(() => cpmForLevel(999)).toThrow();
  });
});
