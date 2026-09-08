import { describe, expect, it } from "vitest";
import { applyShadowToggle, effectiveIsShadow, shadowToggledBaseStats, shadowToggleUiState } from "./shadowToggle.js";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";

function fakeSpecies(overrides: Partial<SpeciesDefinition> = {}): SpeciesDefinition {
  return {
    id: "test-species",
    name: "Test Species",
    types: ["normal"],
    baseAttack: 200,
    baseDefense: 180,
    baseStamina: 160,
    fastMoves: [],
    chargedMoves: [],
    ...overrides,
  } as SpeciesDefinition;
}

describe("applyShadowToggle", () => {
  it("clones with isShadow: true when the toggle is on and the species is eligible", () => {
    const species = fakeSpecies();
    const toggled = applyShadowToggle(species, true);
    expect(toggled).not.toBe(species);
    expect(toggled!.isShadow).toBe(true);
  });

  it("returns the SAME reference when the toggle is off", () => {
    const species = fakeSpecies();
    expect(applyShadowToggle(species, false)).toBe(species);
  });

  it("returns the SAME reference when the species is already isShadow (avoids double-applying the multiplier)", () => {
    const species = fakeSpecies({ isShadow: true });
    expect(applyShadowToggle(species, true)).toBe(species);
  });

  it("returns the SAME reference when the species carries a mega/primal boost (mutually exclusive)", () => {
    const species = fakeSpecies({ boost: { multiplier: 1.3, boostedType: "dragon" } });
    expect(applyShadowToggle(species, true)).toBe(species);
  });

  it("passes null/undefined through unchanged", () => {
    expect(applyShadowToggle(null, true)).toBeNull();
    expect(applyShadowToggle(undefined, true)).toBeUndefined();
  });
});

describe("effectiveIsShadow", () => {
  it("is true if the species is already registry-flagged Shadow, regardless of the toggle", () => {
    expect(effectiveIsShadow({ isShadow: true, boost: undefined }, false)).toBe(true);
  });

  it("is true if the toggle is on and the species has no boost", () => {
    expect(effectiveIsShadow({ isShadow: false, boost: undefined }, true)).toBe(true);
  });

  it("is false if the toggle is on but the species carries a boost (ineligible)", () => {
    expect(effectiveIsShadow({ isShadow: false, boost: { multiplier: 1.3, boostedType: "dragon" } }, true)).toBe(false);
  });

  it("is false for a null species when the toggle is off", () => {
    expect(effectiveIsShadow(null, false)).toBe(false);
  });

  it("is true for a null species when the toggle is ON — null has no `boost` to make it ineligible, so it reads as eligible", () => {
    // A real, slightly surprising case found while writing this test (not
    // assumed): effectiveIsShadow's `!species?.boost` guard treats "no
    // species selected" the same as "a boost-free species," so the toggle
    // alone decides the result. In practice every caller resolves a species
    // before checking this, so a null species is not reachable from the UI
    // with the toggle already on — but the function itself doesn't special-
    // case it, so pin the real behavior rather than an assumed one.
    expect(effectiveIsShadow(null, true)).toBe(true);
  });
});

describe("shadowToggledBaseStats", () => {
  it("applies the Shadow multipliers when toggled on and eligible", () => {
    const species = fakeSpecies();
    const adjusted = shadowToggledBaseStats(species, true);
    expect(adjusted.baseAttack).toBeGreaterThan(species.baseAttack);
    expect(adjusted.baseDefense).toBeLessThan(species.baseDefense);
  });

  it("leaves stats unchanged when the toggle is off", () => {
    const species = fakeSpecies();
    const adjusted = shadowToggledBaseStats(species, false);
    expect(adjusted).toEqual({ baseAttack: species.baseAttack, baseDefense: species.baseDefense });
  });

  it("does not double-apply when the species is already isShadow", () => {
    const species = fakeSpecies({ isShadow: true });
    const already = shadowToggledBaseStats(species, false);
    const toggledToo = shadowToggledBaseStats(species, true);
    expect(toggledToo).toEqual(already);
  });
});

describe("shadowToggleUiState", () => {
  it("disables and force-checks for an already-Shadow species", () => {
    const state = shadowToggleUiState({ isShadow: true, boost: undefined });
    expect(state.disabled).toBe(true);
    expect(state.forcedOn).toBe(true);
  });

  it("disables (unchecked) for a boost-carrying species", () => {
    const state = shadowToggleUiState({ isShadow: false, boost: { multiplier: 1.3, boostedType: "dragon" } });
    expect(state.disabled).toBe(true);
    expect(state.forcedOn).toBe(false);
  });

  it("is enabled and unchecked for an ordinary species", () => {
    const state = shadowToggleUiState({ isShadow: false, boost: undefined });
    expect(state.disabled).toBe(false);
    expect(state.forcedOn).toBe(false);
  });
});
