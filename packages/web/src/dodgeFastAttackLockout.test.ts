import { describe, expect, it } from "vitest";
import { dodgeFastAttackLockoutResultNote, dodgeFastAttackLockoutWarning } from "./dodgeFastAttackLockout.js";

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
