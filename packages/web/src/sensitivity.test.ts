import { describe, expect, it } from "vitest";
import { computeSensitivity } from "./sensitivity.js";
import { DEFAULT_ASSUMPTIONS } from "./ComparatorView.js";
import { speciesRegistry } from "./registry.js";

// Runs against the REAL registry/data — computeSensitivity's whole job is
// re-simulating runSustainedComparison many times over, so a fixture-only
// test would miss a real regression in that call chain.
describe("computeSensitivity", () => {
  it("returns one check per scanned assumption, sorted nearest-flip-first", () => {
    const candidateA = speciesRegistry.get(DEFAULT_ASSUMPTIONS.candidateAId);
    const candidateB = speciesRegistry.get(DEFAULT_ASSUMPTIONS.candidateBId);
    const boss = speciesRegistry.get(DEFAULT_ASSUMPTIONS.targetId);

    const checks = computeSensitivity([candidateA, candidateB], boss, DEFAULT_ASSUMPTIONS, undefined);

    // 1 (party size) + 1 (matching count) + 1 (boost) + 1 (dodge) + 1 (level)
    // + 1 (teammate DPS) + 1 (cadence) + 3 (IVs) = 10 checks.
    expect(checks.length).toBe(10);
    const labels = checks.map((c) => c.label);
    expect(labels).toContain("Other trainers in this raid");
    expect(labels).toContain("Level");
    expect(labels).toContain("Attack IV");
    expect(labels).toContain("Defense IV");
    expect(labels).toContain("Stamina IV");

    // Sorted ascending by distance (closer-to-a-flip first) — Infinity (no
    // flip found) must sort last.
    for (let i = 1; i < checks.length; i++) {
      expect(checks[i]!.distance).toBeGreaterThanOrEqual(checks[i - 1]!.distance);
    }
  }, 20_000);

  it("reports the mega-boost check as inapplicable when a candidate's boost is disabled", () => {
    const candidateA = speciesRegistry.get(DEFAULT_ASSUMPTIONS.candidateAId);
    const candidateB = speciesRegistry.get(DEFAULT_ASSUMPTIONS.candidateBId);
    const boss = speciesRegistry.get(DEFAULT_ASSUMPTIONS.targetId);

    const withBoostDisabled = { ...DEFAULT_ASSUMPTIONS, candidateMegaBoostDisabled: [true, true] as [boolean, boolean] };
    const checks = computeSensitivity([candidateA, candidateB], boss, withBoostDisabled, undefined);
    const boostCheck = checks.find((c) => c.label === "Mega boost multiplier");
    expect(boostCheck).toBeDefined();
    expect(boostCheck!.flips).toBe(false);
    expect(boostCheck!.currentValue).toContain("n/a");
  }, 20_000);
});
