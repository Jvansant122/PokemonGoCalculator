import { describe, expect, it } from "vitest";
import { bossChargedMoveReadySeconds } from "../src/combat.js";
import { MAELSTROM, TIDAL_SURGE } from "./fixtures/hypotheticalDuo.js";
import type { ChargedMove, FastMove } from "../src/types.js";

describe("bossChargedMoveReadySeconds", () => {
  it("derives Boss Tide's real fixture timing: ceil(100/10) * 2.5 = 25.0s", () => {
    expect(bossChargedMoveReadySeconds(TIDAL_SURGE, MAELSTROM)).toBe(25.0);
  });

  it("returns 0 immediately when starting energy already meets the cost", () => {
    expect(bossChargedMoveReadySeconds(TIDAL_SURGE, MAELSTROM, 100)).toBe(0);
    expect(bossChargedMoveReadySeconds(TIDAL_SURGE, MAELSTROM, 250)).toBe(0);
  });

  it("shortens as starting energy increases, never going below 0", () => {
    const zero = bossChargedMoveReadySeconds(TIDAL_SURGE, MAELSTROM, 0);
    const half = bossChargedMoveReadySeconds(TIDAL_SURGE, MAELSTROM, 50);
    expect(half).toBeLessThan(zero);
    expect(half).toBeGreaterThanOrEqual(0);
  });

  it("returns Infinity for a fast move that grants no energy", () => {
    const noEnergyFastMove: FastMove = { id: "f", name: "F", type: "normal", power: 5, energyGain: 0, durationSeconds: 1 };
    const charged: ChargedMove = { id: "c", name: "C", type: "normal", power: 50, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 };
    expect(bossChargedMoveReadySeconds(noEnergyFastMove, charged)).toBe(Infinity);
  });
});
