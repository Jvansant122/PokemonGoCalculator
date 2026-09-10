import { describe, expect, it } from "vitest";
import type { TeamRaidPrefill } from "./teamRaidPrefill.js";

// teamRaidPrefill.ts declares only a type (no runtime code) — the "start from
// a Pokémon" hand-off payload from SpeciesReportView to TeamRaidView. Same
// precedent as comparatorPrefill.test.ts: nothing to unit-test behaviorally,
// but pinning its shape here means a future field rename/removal shows up as
// a compile error in this test file rather than only being caught by hand in
// the two views that actually pass this object across the tab boundary.
describe("TeamRaidPrefill shape", () => {
  it("accepts the fields TeamRaidView's initialTeamAssumptions expects", () => {
    const prefill: TeamRaidPrefill = {
      targetId: "tyranitar-mega",
      speciesId: "kartana",
      fastMoveId: null,
      chargedMoveId: "leaf-blade",
    };
    expect(Object.keys(prefill).sort()).toEqual(["chargedMoveId", "fastMoveId", "speciesId", "targetId"].sort());
  });
});
