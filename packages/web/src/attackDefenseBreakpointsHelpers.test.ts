import { describe, expect, it } from "vitest";
import { IVS_0_TO_15, LEVELS_25_TO_50 } from "./attackDefenseBreakpointsHelpers.js";

describe("LEVELS_25_TO_50", () => {
  it("covers levels 25 through 50 inclusive in 0.5 steps (51 total), ascending", () => {
    expect(LEVELS_25_TO_50.length).toBe(51);
    expect(LEVELS_25_TO_50[0]).toBe(25);
    expect(LEVELS_25_TO_50[1]).toBe(25.5);
    expect(LEVELS_25_TO_50[LEVELS_25_TO_50.length - 1]).toBe(50);
  });
});

describe("IVS_0_TO_15", () => {
  it("covers every IV value 0 through 15 inclusive", () => {
    expect(IVS_0_TO_15).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});
