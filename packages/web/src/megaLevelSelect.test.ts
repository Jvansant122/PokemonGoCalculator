import { describe, expect, it } from "vitest";
import type { ChargedMove } from "@pogo-analyzer/engine";
import { megaLevelEligibility, megaLevelOptionLabel, selectableMegaLevels } from "./megaLevelSelect.js";

// Minimal-but-complete fixtures matching packages/engine/test/megaLevel.test.ts's
// own convention (canReachSuperMax only reads `isPlusMove`, but ChargedMove's
// other fields are required by the type).
const ordinaryMove: ChargedMove = {
  id: "ordinary-charged",
  name: "Ordinary Charged",
  type: "normal",
  power: 100,
  energyCost: 50,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};

const plusMove: ChargedMove = {
  id: "SOME_MOVE_PLUS",
  name: "Some Move+",
  type: "dark",
  power: 150,
  energyCost: 50,
  durationSeconds: 3,
  vulnerableWindowSeconds: 3,
  isPlusMove: true,
  plusMovePowerConfidence: "official",
};

describe("megaLevelEligibility", () => {
  it("is 'unknown' for a null or undefined species (the roster-wide forceVisible case)", () => {
    expect(megaLevelEligibility(null)).toBe("unknown");
    expect(megaLevelEligibility(undefined)).toBe("unknown");
  });

  it("is 'ineligible' for a species with no \"+\" move at all", () => {
    expect(megaLevelEligibility({ chargedMoves: [] })).toBe("ineligible");
    expect(megaLevelEligibility({ chargedMoves: [ordinaryMove] })).toBe("ineligible");
  });

  it("is 'eligible' the moment ANY charged move carries isPlusMove", () => {
    expect(megaLevelEligibility({ chargedMoves: [plusMove] })).toBe("eligible");
    expect(megaLevelEligibility({ chargedMoves: [ordinaryMove, plusMove] })).toBe("eligible");
  });
});

describe("selectableMegaLevels", () => {
  it("offers the full four-tier ladder for an eligible species regardless of currentValue", () => {
    expect(selectableMegaLevels("eligible", null)).toEqual(["base", "high", "max", "super-max"]);
    expect(selectableMegaLevels("eligible", "super-max")).toEqual(["base", "high", "max", "super-max"]);
  });

  it("offers the full four-tier ladder for 'unknown' (roster-wide) regardless of currentValue", () => {
    expect(selectableMegaLevels("unknown", null)).toEqual(["base", "high", "max", "super-max"]);
    expect(selectableMegaLevels("unknown", "high")).toEqual(["base", "high", "max", "super-max"]);
  });

  it("drops 'super-max' for an ineligible species when it isn't already the current value", () => {
    expect(selectableMegaLevels("ineligible", null)).toEqual(["base", "high", "max"]);
    expect(selectableMegaLevels("ineligible", "base")).toEqual(["base", "high", "max"]);
    expect(selectableMegaLevels("ineligible", "high")).toEqual(["base", "high", "max"]);
    expect(selectableMegaLevels("ineligible", "max")).toEqual(["base", "high", "max"]);
  });

  it("keeps 'super-max' selectable for an ineligible species when it is ALREADY the current value (a stale share link)", () => {
    expect(selectableMegaLevels("ineligible", "super-max")).toEqual(["base", "high", "max", "super-max"]);
  });
});

describe("megaLevelOptionLabel", () => {
  it("labels 'super-max' as not reachable only when eligibility is 'ineligible'", () => {
    expect(megaLevelOptionLabel("super-max", "ineligible")).toBe("Super Max (not reachable here)");
    expect(megaLevelOptionLabel("super-max", "eligible")).toBe("Super Max");
    expect(megaLevelOptionLabel("super-max", "unknown")).toBe("Super Max");
  });

  it("leaves base/high/max unaffected by eligibility", () => {
    for (const eligibility of ["eligible", "ineligible", "unknown"] as const) {
      expect(megaLevelOptionLabel("base", eligibility)).toBe("Base");
      expect(megaLevelOptionLabel("high", eligibility)).toBe("High");
      expect(megaLevelOptionLabel("max", eligibility)).toBe("Max");
    }
  });
});
