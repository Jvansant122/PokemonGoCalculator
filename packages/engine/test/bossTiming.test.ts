import { describe, expect, it } from "vitest";
import { bossChargedMoveReadySeconds } from "../src/combat.js";
import { WATERFALL, HYDRO_PUMP } from "../src/fixtures/scenarioA.js";
import type { ChargedMove, FastMove } from "../src/types.js";

describe("bossChargedMoveReadySeconds", () => {
  it("derives Primal Kyogre's real fixture timing: ceil(100/8) * 2.5 = 32.5s", () => {
    expect(bossChargedMoveReadySeconds(WATERFALL, HYDRO_PUMP)).toBe(32.5);
  });

  it("returns 0 immediately when starting energy already meets the cost", () => {
    expect(bossChargedMoveReadySeconds(WATERFALL, HYDRO_PUMP, 100)).toBe(0);
    expect(bossChargedMoveReadySeconds(WATERFALL, HYDRO_PUMP, 250)).toBe(0);
  });

  it("shortens as starting energy increases, never going below 0", () => {
    const zero = bossChargedMoveReadySeconds(WATERFALL, HYDRO_PUMP, 0);
    const half = bossChargedMoveReadySeconds(WATERFALL, HYDRO_PUMP, 50);
    expect(half).toBeLessThan(zero);
    expect(half).toBeGreaterThanOrEqual(0);
  });

  it("returns Infinity for a fast move that grants no energy", () => {
    const noEnergyFastMove: FastMove = { id: "f", name: "F", type: "normal", power: 5, energyGain: 0, durationSeconds: 1 };
    const charged: ChargedMove = { id: "c", name: "C", type: "normal", power: 50, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 };
    expect(bossChargedMoveReadySeconds(noEnergyFastMove, charged)).toBe(Infinity);
  });
});
