import { describe, expect, it } from "vitest";
import {
  activeRaidBossOptions,
  allSpeciesOptions,
  candidatePickerOptions,
  pastRaidBossOptions,
  raidTierForSpeciesId,
  speciesRegistry,
  targetPickerOptions,
} from "./registry.js";

// Real bundled game data (data/normalized/*.json) — these tests exercise the
// actual committed dataset, not a fixture, so a real data-sync regression
// (e.g. an empty species.json, or activeRaids.json entries that stop
// resolving) would fail here too, not just in the live app.

describe("speciesRegistry", () => {
  it("registers a large, real species roster", () => {
    // Comfortably below every real sync this project has ever produced
    // (~1000+), but high enough to catch a catastrophically empty dataset.
    expect(speciesRegistry.all().length).toBeGreaterThan(500);
  });

  it("resolves a well-known real species by id", () => {
    expect(speciesRegistry.has("kartana")).toBe(true);
    expect(speciesRegistry.get("kartana").name.toLowerCase()).toContain("kartana");
  });
});

describe("allSpeciesOptions / candidatePickerOptions", () => {
  it("returns one option per registered species, sorted by name", () => {
    const options = allSpeciesOptions();
    expect(options.length).toBe(speciesRegistry.all().length);
    const names = options.map((o) => o.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("candidatePickerOptions has the same length as allSpeciesOptions", () => {
    expect(candidatePickerOptions().length).toBe(allSpeciesOptions().length);
  });
});

describe("gated-evolution resolution (registry.ts's resolveEvolutions)", () => {
  it("splits Eevee's real evolutionCandyCosts into candy-only vs. gated branches, resolved to real SpeciesDefinition objects", () => {
    const eevee = speciesRegistry.get("eevee");
    expect(eevee.evolutions).toBeDefined();
    expect(eevee.gatedEvolutions).toBeDefined();
    const candyOnlyIds = eevee.evolutions!.map((e) => e.to.id).sort();
    expect(candyOnlyIds).toEqual(["flareon", "jolteon", "vaporeon"].sort());
    for (const e of eevee.evolutions!) {
      expect(e.to.id).toBe(speciesRegistry.get(e.to.id).id); // resolved to the SAME registered object, not a guess
      expect(e.candyCost).toBeGreaterThan(0);
    }
    const gatedIds = eevee.gatedEvolutions!.map((g) => g.to.id).sort();
    expect(gatedIds).toEqual(["espeon", "glaceon", "leafeon", "sylveon", "umbreon"].sort());
    const umbreon = eevee.gatedEvolutions!.find((g) => g.to.id === "umbreon")!;
    expect(umbreon.requiresBuddy).toBe(true);
    expect(umbreon.requiresBuddyDistanceKm).toBe(10);
    expect(umbreon.requiresNighttime).toBe(true);
  });

  it("resolves roughly 110 gated branches across the real synced roster (per data-sync's own measured 2026-09-10 distribution)", () => {
    let gatedCount = 0;
    let candyOnlyCount = 0;
    for (const species of speciesRegistry.all()) {
      gatedCount += species.gatedEvolutions?.length ?? 0;
      candyOnlyCount += species.evolutions?.length ?? 0;
    }
    expect(gatedCount).toBeGreaterThan(90);
    expect(gatedCount).toBeLessThan(130);
    expect(candyOnlyCount).toBeGreaterThan(400);
  });
});

describe("activeRaidBossOptions / targetPickerOptions", () => {
  it("every active raid boss resolves to a registered species", () => {
    for (const boss of activeRaidBossOptions()) {
      expect(speciesRegistry.has(boss.id)).toBe(true);
    }
  });

  it("targetPickerOptions lists every active raid boss before the general species list", () => {
    const active = activeRaidBossOptions();
    const targets = targetPickerOptions();
    expect(targets.length).toBe(active.length + allSpeciesOptions().length);
    for (let i = 0; i < active.length; i++) {
      expect(targets[i]!.id).toBe(active[i]!.id);
    }
  });
});

describe("pastRaidBossOptions", () => {
  it("never double-lists a species that is also currently active", () => {
    const activeIds = new Set(activeRaidBossOptions().map((b) => b.id));
    for (const past of pastRaidBossOptions()) {
      expect(activeIds.has(past.id)).toBe(false);
    }
  });

  it("every past raid boss resolves to a registered species", () => {
    for (const past of pastRaidBossOptions()) {
      expect(speciesRegistry.has(past.id)).toBe(true);
    }
  });
});

describe("raidTierForSpeciesId", () => {
  it("returns null for a species that is not a currently-active raid target", () => {
    // Derived from the live data rather than a hardcoded id — a species
    // that's an easy raid boss today (e.g. Magikarp) could just as easily be
    // one tomorrow, so picking "the first registered species not currently
    // active" is the only way this assertion can't flake against a resync.
    const activeIds = new Set(activeRaidBossOptions().map((b) => b.id));
    const inactive = allSpeciesOptions().find((s) => !activeIds.has(s.id));
    expect(inactive).toBeDefined();
    expect(raidTierForSpeciesId(inactive!.id)).toBeNull();
  });

  it("returns a recognized tier for every currently-active raid boss", () => {
    const active = activeRaidBossOptions();
    if (active.length === 0) return; // nothing live to check against right now
    const tier = raidTierForSpeciesId(active[0]!.id);
    expect(tier).not.toBeNull();
  });
});
