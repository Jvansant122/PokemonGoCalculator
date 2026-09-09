import { describe, expect, it } from "vitest";
import { activeRaidBossOptions, pastRaidBossOptions } from "./registry.js";
import { DEFAULT_MULTI_RAID_BOSS_FILTERS, multiRaidTiersPresent, resolveMultiRaidBossIds } from "./multiRaidBossSet.js";

describe("resolveMultiRaidBossIds", () => {
  it("defaults to every currently-active raid boss, capped at maxBossCount", () => {
    const ids = resolveMultiRaidBossIds(DEFAULT_MULTI_RAID_BOSS_FILTERS);
    const active = activeRaidBossOptions();
    expect(ids.length).toBe(Math.min(active.length, DEFAULT_MULTI_RAID_BOSS_FILTERS.maxBossCount));
    expect(ids).toEqual(active.map((b) => b.id).slice(0, DEFAULT_MULTI_RAID_BOSS_FILTERS.maxBossCount));
  });

  it("never includes a past/inactive boss when includePastRaids is false", () => {
    const pastIds = new Set(pastRaidBossOptions().map((r) => r.id));
    const ids = resolveMultiRaidBossIds({ includePastRaids: false, includedTiers: null, maxBossCount: 1000 });
    expect(ids.some((id) => pastIds.has(id) && !activeRaidBossOptions().some((b) => b.id === id))).toBe(false);
  });

  it("includes past/inactive bosses, after every active one, when includePastRaids is true", () => {
    const active = activeRaidBossOptions();
    const ids = resolveMultiRaidBossIds({ includePastRaids: true, includedTiers: null, maxBossCount: 1000 });
    expect(ids.slice(0, active.length)).toEqual(active.map((b) => b.id));
    expect(ids.length).toBeGreaterThan(active.length);
  });

  it("respects an explicit tier allow-list", () => {
    const active = activeRaidBossOptions();
    const someTier = active[0]?.tier;
    if (!someTier) return; // no active raids in this data snapshot — nothing to assert
    const ids = resolveMultiRaidBossIds({ includePastRaids: false, includedTiers: [someTier], maxBossCount: 1000 });
    const expected = active.filter((b) => b.tier === someTier).map((b) => b.id);
    expect(ids).toEqual(expected);
  });

  it("trims to maxBossCount, never returning more than asked for", () => {
    const ids = resolveMultiRaidBossIds({ includePastRaids: true, includedTiers: null, maxBossCount: 5 });
    expect(ids.length).toBeLessThanOrEqual(5);
  });

  it("returns an empty list for maxBossCount 0, never a negative slice", () => {
    expect(resolveMultiRaidBossIds({ includePastRaids: true, includedTiers: null, maxBossCount: 0 })).toEqual([]);
    expect(resolveMultiRaidBossIds({ includePastRaids: true, includedTiers: null, maxBossCount: -5 })).toEqual([]);
  });
});

describe("multiRaidTiersPresent", () => {
  it("only reflects active-raid tiers when includePastRaids is false", () => {
    const activeTiers = new Set(activeRaidBossOptions().map((b) => b.tier));
    expect(new Set(multiRaidTiersPresent(false))).toEqual(activeTiers);
  });

  it("is a superset of the active-only tiers when includePastRaids is true", () => {
    const activeTiers = multiRaidTiersPresent(false);
    const allTiers = multiRaidTiersPresent(true);
    for (const t of activeTiers) expect(allTiers).toContain(t);
  });
});
