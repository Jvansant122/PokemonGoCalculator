import { describe, expect, it } from "vitest";
import { resolveCandidateMegaLevel } from "../src/comparison.js";
import type { SpeciesDefinition } from "../src/types.js";
import { CANDIDATE_ALPHA } from "./fixtures/hypotheticalDuo.js";

describe("resolveCandidateMegaLevel", () => {
  // CANDIDATE_ALPHA's own chargedMoves ([VOLT_SLAM]) carries no "+" move, so
  // it is NOT Super Max-eligible (see megaLevel.ts's canReachSuperMax) —
  // exactly the common case (most megas have no "+" move at all). A locally
  // "+"-move-carrying variant is used wherever a test needs to observe
  // "super-max" actually being honored, rather than clamped.
  const eligibleMega: SpeciesDefinition = {
    ...CANDIDATE_ALPHA,
    chargedMoves: [{ ...CANDIDATE_ALPHA.chargedMoves[0]!, isPlusMove: true, plusMovePowerConfidence: "community-estimate" }],
  };

  it("passes a supplied megaLevel through unchanged for a species with .boost that CAN reach super-max", () => {
    expect(resolveCandidateMegaLevel(eligibleMega, "super-max")).toBe("super-max");
    expect(resolveCandidateMegaLevel(eligibleMega, "high")).toBe("high");
  });

  it("clamps super-max down to max for a species with .boost but NO '+' move (cannot reach Super Max) — the confirmed 2026-09-10 mechanic", () => {
    const mega: SpeciesDefinition = { ...CANDIDATE_ALPHA }; // has .boost, no isPlusMove charged move
    expect(resolveCandidateMegaLevel(mega, "super-max")).toBe("max");
    // The clamp is invisible for every other tier — only "super-max" is ever touched.
    expect(resolveCandidateMegaLevel(mega, "high")).toBe("high");
    expect(resolveCandidateMegaLevel(mega, "max")).toBe("max");
  });

  it("a species that gains a '+' move becomes super-max-eligible with zero code changes — same species, same request, different chargedMoves", () => {
    const ineligible: SpeciesDefinition = { ...CANDIDATE_ALPHA };
    const nowEligible: SpeciesDefinition = {
      ...CANDIDATE_ALPHA,
      chargedMoves: [{ ...CANDIDATE_ALPHA.chargedMoves[0]!, isPlusMove: true, plusMovePowerConfidence: "community-estimate" }],
    };
    expect(resolveCandidateMegaLevel(ineligible, "super-max")).toBe("max");
    expect(resolveCandidateMegaLevel(nowEligible, "super-max")).toBe("super-max");
  });

  it("resolves undefined/null to null for a species with .boost (identical to base) — clamp-independent", () => {
    const mega: SpeciesDefinition = { ...CANDIDATE_ALPHA };
    expect(resolveCandidateMegaLevel(mega, undefined)).toBeNull();
    expect(resolveCandidateMegaLevel(mega, null)).toBeNull();
  });

  it("forces null regardless of what's supplied for a species with NO .boost at all, even one that WOULD otherwise be super-max-eligible", () => {
    const nonMega: SpeciesDefinition = { ...eligibleMega, boost: undefined };
    expect(resolveCandidateMegaLevel(nonMega, "super-max")).toBeNull();
    expect(resolveCandidateMegaLevel(nonMega, "high")).toBeNull();
  });
});
