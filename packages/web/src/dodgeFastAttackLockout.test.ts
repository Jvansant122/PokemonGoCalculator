import { describe, expect, it } from "vitest";
import {
  dodgeFastAttackLockoutResultNote,
  dodgeFastAttackLockoutWarning,
  multiRaidLockoutConclusionGuard,
} from "./dodgeFastAttackLockout.js";

// Real data point cited throughout this fix — Mega Tyranitar's Bite is
// exactly on the DODGE_COST_SECONDS (0.5s) boundary (see MECHANICS.md's "A
// boss fast move at <=0.5s cannot be fast-dodged at all").
const BITE = { name: "Bite", durationSeconds: 0.5 };
// Two normal, safely-dodgeable fast moves (above 0.5s) for the negative case.
const SAFE_MOVE = { name: "Dragon Breath", durationSeconds: 1.0 };
const CLEARLY_SAFE_MOVE = { name: "Mud Shot", durationSeconds: 0.7 };

describe("dodgeFastAttackLockoutWarning", () => {
  it("returns null for undefined/null input (fast move not resolved yet)", () => {
    expect(dodgeFastAttackLockoutWarning(undefined)).toBeNull();
    expect(dodgeFastAttackLockoutWarning(null)).toBeNull();
  });

  it("returns null for a fast move safely above the 0.5s threshold", () => {
    expect(dodgeFastAttackLockoutWarning(CLEARLY_SAFE_MOVE)).toBeNull();
    expect(dodgeFastAttackLockoutWarning(SAFE_MOVE)).toBeNull();
  });

  it("warns for a fast move at exactly the 0.5s threshold, naming the real move and duration", () => {
    const warning = dodgeFastAttackLockoutWarning(BITE);
    expect(warning).not.toBeNull();
    expect(warning).toContain("Bite");
    expect(warning).toContain("0.5s");
  });

  it("warns for a fast move faster than the threshold too", () => {
    expect(dodgeFastAttackLockoutWarning({ name: "Fast Move", durationSeconds: 0.4 })).not.toBeNull();
  });
});

describe("dodgeFastAttackLockoutResultNote", () => {
  it("returns null when the pairing is safe", () => {
    expect(dodgeFastAttackLockoutResultNote(CLEARLY_SAFE_MOVE)).toBeNull();
  });

  it("names the real move/duration and reads as an already-applied fact, not a heads-up", () => {
    const note = dodgeFastAttackLockoutResultNote(BITE);
    expect(note).not.toBeNull();
    expect(note).toContain("Bite");
    expect(note).toContain("Dodge lockout active");
  });
});

describe("multiRaidLockoutConclusionGuard", () => {
  it("suppresses the conclusion when every swept boss is locked", () => {
    const guard = multiRaidLockoutConclusionGuard(3, 3);
    expect(guard.suppress).toBe(true);
    expect(guard.qualifier).toBeNull();
  });

  it("does not suppress and has no qualifier when no boss is locked", () => {
    const guard = multiRaidLockoutConclusionGuard(0, 5);
    expect(guard.suppress).toBe(false);
    expect(guard.qualifier).toBeNull();
  });

  it("keeps the conclusion but names the count when only some bosses are locked, with plural phrasing for count > 1", () => {
    const guard = multiRaidLockoutConclusionGuard(2, 5);
    expect(guard.suppress).toBe(false);
    expect(guard.qualifier).not.toBeNull();
    expect(guard.qualifier).toContain("2 of 5");
    expect(guard.qualifier).toContain("3");
    expect(guard.qualifier).toContain("are dodge-locked");
    expect(guard.qualifier).toContain("their own fast moves recycle");
  });

  it("does not suppress on a zero-boss sweep (nothing to be locked)", () => {
    const guard = multiRaidLockoutConclusionGuard(0, 0);
    expect(guard.suppress).toBe(false);
    expect(guard.qualifier).toBeNull();
  });

  it("uses singular phrasing for exactly one locked boss out of several", () => {
    const guard = multiRaidLockoutConclusionGuard(1, 4);
    expect(guard.qualifier).toContain("1 of 4 boss");
    expect(guard.qualifier).toContain("is dodge-locked");
    expect(guard.qualifier).toContain("its own fast move recycles");
  });
});
