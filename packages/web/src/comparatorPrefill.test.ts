import { describe, expect, it } from "vitest";
import type { ComparatorPrefill } from "./comparatorPrefill.js";

// comparatorPrefill.ts declares only a type (no runtime code) — the "start
// from a Pokémon" hand-off payload from SpeciesReportView to ComparatorView.
// Nothing to unit-test behaviorally, but pinning its shape here means a
// future field rename/removal on this type shows up as a compile error in
// this test file rather than only being caught by hand in the two views that
// actually pass this object across the tab boundary.
describe("ComparatorPrefill shape", () => {
  it("accepts the fields ComparatorView's initialAssumptions expects", () => {
    const prefill: ComparatorPrefill = {
      targetId: "latios-mega",
      candidateAId: "kartana",
      candidateAFastMoveId: null,
      candidateAChargedMoveId: "leaf-blade",
    };
    expect(Object.keys(prefill).sort()).toEqual(
      ["candidateAChargedMoveId", "candidateAFastMoveId", "candidateAId", "targetId"].sort(),
    );
  });
});
