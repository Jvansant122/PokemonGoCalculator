import { describe, expect, it } from "vitest";
import { energyFromDamageTaken } from "../src/energy.js";

describe("energy model", () => {
  it("grants energy from damage taken", () => {
    expect(energyFromDamageTaken(33)).toBe(16);
  });
});
