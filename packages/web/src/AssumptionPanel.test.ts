import { describe, expect, it } from "vitest";
import { setCandidateDodgeOverriding } from "./AssumptionPanel.js";
import type { Assumptions } from "./AssumptionPanel.js";
import { DEFAULT_ASSUMPTIONS } from "./ComparatorView.js";

// setCandidateDodgeOverriding is the pure core of the per-candidate dodge
// override checkbox (CandidateDodgeOverride in AssumptionPanel.tsx) —
// covered directly here, without rendering, per the task's explicit request
// for "coverage for the derived-checkbox behaviour (check -> seeds from
// shared; uncheck -> returns both to null)".

function baseValue(overrides: Partial<Assumptions> = {}): Assumptions {
  return { ...DEFAULT_ASSUMPTIONS, ...overrides };
}

describe("setCandidateDodgeOverriding", () => {
  it("checking ON seeds BOTH override fields from the current SHARED dodge/dodgeFastAttacks values", () => {
    const value = baseValue({
      dodge: { kind: "percentage-missed", missedFraction: 0.25 },
      dodgeFastAttacks: true,
      candidateDodge: [null, null],
      candidateDodgeFastAttacks: [null, null],
    });
    const next = setCandidateDodgeOverriding(value, 0, true);
    expect(next.candidateDodge[0]).toEqual({ kind: "percentage-missed", missedFraction: 0.25 });
    expect(next.candidateDodgeFastAttacks[0]).toBe(true);
    // The OTHER candidate's override is untouched — checking A's box never
    // turns on an override for B.
    expect(next.candidateDodge[1]).toBeNull();
    expect(next.candidateDodgeFastAttacks[1]).toBeNull();
  });

  it("checking ON never itself changes the shared setting it seeds from", () => {
    const value = baseValue({ dodge: { kind: "perfect" }, dodgeFastAttacks: false });
    const next = setCandidateDodgeOverriding(value, 1, true);
    expect(next.dodge).toEqual(value.dodge);
    expect(next.dodgeFastAttacks).toBe(value.dodgeFastAttacks);
  });

  it("unchecking OFF returns BOTH override fields to null together, never a stale half-set pair", () => {
    const value = baseValue({
      candidateDodge: [{ kind: "perfect" }, { kind: "none" }],
      candidateDodgeFastAttacks: [true, false],
    });
    const next = setCandidateDodgeOverriding(value, 0, false);
    expect(next.candidateDodge[0]).toBeNull();
    expect(next.candidateDodgeFastAttacks[0]).toBeNull();
    // Candidate B's own, independent override survives untouched.
    expect(next.candidateDodge[1]).toEqual({ kind: "none" });
    expect(next.candidateDodgeFastAttacks[1]).toBe(false);
  });

  it("does not mutate the input value's arrays", () => {
    const value = baseValue({ candidateDodge: [null, null], candidateDodgeFastAttacks: [null, null] });
    const originalDodge = value.candidateDodge;
    const originalFast = value.candidateDodgeFastAttacks;
    setCandidateDodgeOverriding(value, 0, true);
    expect(value.candidateDodge).toBe(originalDodge);
    expect(value.candidateDodgeFastAttacks).toBe(originalFast);
    expect(originalDodge).toEqual([null, null]);
    expect(originalFast).toEqual([null, null]);
  });
});
