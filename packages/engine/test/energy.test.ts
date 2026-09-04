import { describe, expect, it } from "vitest";
import { accumulateEnergy, energyFromDamageTaken, energyFromFastMove } from "../src/energy.js";

describe("energy model", () => {
  it("grants energy from fast moves", () => {
    expect(energyFromFastMove(8)).toBe(8);
  });

  it("grants energy from damage taken", () => {
    expect(energyFromDamageTaken(33)).toBe(16);
  });

  it("accumulates energy from both sources in time order and reports readiness", () => {
    const { readyAtSeconds, finalEnergy } = accumulateEnergy(
      [
        { atSeconds: 5, amount: 16, source: "damage-taken" },
        { atSeconds: 1.6, amount: 3, source: "fast-move" },
        { atSeconds: 7.5, amount: 16, source: "damage-taken" },
      ],
      35,
    );
    expect(readyAtSeconds).toBe(7.5);
    expect(finalEnergy).toBe(35);
  });

  it("returns null readiness when the energy cost is never reached", () => {
    const { readyAtSeconds } = accumulateEnergy([{ atSeconds: 1, amount: 10, source: "fast-move" }], 50);
    expect(readyAtSeconds).toBeNull();
  });
});
