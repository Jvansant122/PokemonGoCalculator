import { describe, expect, it } from "vitest";
import { bossEffectiveHp, bossEffectiveStats } from "../src/comparison.js";
import { effectiveStat } from "../src/stats.js";
import {
  DEFAULT_REAL_RAID_TIER,
  RAID_BOSS_CPM,
  RAID_BOSS_IVS,
  RAID_TIER_TABLE,
  REAL_RAID_BOSS_IV,
  isKnownRaidTier,
  raidTierStats,
  type RaidTier,
} from "../src/raidBoss.js";
import type { SpeciesDefinition } from "../src/types.js";

/**
 * A real synced-style species used as a raid boss — plain base stats, no
 * statsArePrecomputed flag, exactly like every species produced by
 * fromGameMaster. baseStamina (137) is deliberately far from any real tier's
 * fixed HP figure specifically so a regression that wrongly runs it through
 * effectiveStat/CPM (instead of the fixed per-tier lookup) is unmistakable
 * rather than a coincidental match.
 */
const REAL_STYLE_BOSS: SpeciesDefinition = {
  id: "real-style-boss",
  name: "Real Style Boss",
  types: ["normal"],
  baseAttack: 180,
  baseDefense: 160,
  baseStamina: 137,
  fastMoves: [{ id: "rf", name: "Real Fast", type: "normal", power: 8, energyGain: 8, durationSeconds: 1 }],
  chargedMoves: [{ id: "rc", name: "Real Charged", type: "normal", power: 70, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
};

describe("RAID_TIER_TABLE", () => {
  it("matches the researched Bulbapedia Difficulty table exactly", () => {
    expect(RAID_TIER_TABLE["1-Star Raids"]).toEqual({ hp: 600, attackDefenseMultiplier: 0.5974 });
    expect(RAID_TIER_TABLE["3-Star Raids"]).toEqual({ hp: 3600, attackDefenseMultiplier: 0.73 });
    expect(RAID_TIER_TABLE["Mega Raids"]).toEqual({ hp: 9000, attackDefenseMultiplier: 0.79 });
    expect(RAID_TIER_TABLE["5-Star Raids"]).toEqual({ hp: 15000, attackDefenseMultiplier: 0.79 });
    expect(RAID_TIER_TABLE["Legendary Mega Raids"]).toEqual({ hp: 22500, attackDefenseMultiplier: 0.79 });
    expect(RAID_TIER_TABLE["Super Mega Raids"]).toEqual({ hp: 25000, attackDefenseMultiplier: 0.79 });
    expect(RAID_TIER_TABLE["Primal Raids"]).toEqual({ hp: 22500, attackDefenseMultiplier: 0.79 });
  });

  it("raidTierStats/isKnownRaidTier agree with the table", () => {
    for (const tier of Object.keys(RAID_TIER_TABLE) as RaidTier[]) {
      expect(raidTierStats(tier)).toEqual(RAID_TIER_TABLE[tier]);
      expect(isKnownRaidTier(tier)).toBe(true);
    }
    expect(isKnownRaidTier("Not A Real Tier")).toBe(false);
  });
});

describe("bossEffectiveStats / bossEffectiveHp: real vs precomputed bosses", () => {
  it("gives a real (non-precomputed) species real tier-based attack/defense, not a raw base-stat pass-through", () => {
    const { attack, defense } = bossEffectiveStats(REAL_STYLE_BOSS, "Mega Raids");
    const multiplier = RAID_TIER_TABLE["Mega Raids"].attackDefenseMultiplier;
    expect(attack).toBe(effectiveStat(REAL_STYLE_BOSS.baseAttack, REAL_RAID_BOSS_IV, multiplier));
    expect(defense).toBe(effectiveStat(REAL_STYLE_BOSS.baseDefense, REAL_RAID_BOSS_IV, multiplier));
    // Sanity: this must NOT equal the old iv=0/cpm=1.0 pass-through (which
    // would just be the raw base stat, since floor((x+0)*1.0) === x for an
    // integer base stat) — confirms the real formula actually engaged.
    expect(attack).not.toBe(REAL_STYLE_BOSS.baseAttack);
    expect(defense).not.toBe(REAL_STYLE_BOSS.baseDefense);
  });

  it("defaults to DEFAULT_REAL_RAID_TIER (5-Star Raids) when no tier is supplied for a real species", () => {
    const withDefault = bossEffectiveStats(REAL_STYLE_BOSS);
    const explicit = bossEffectiveStats(REAL_STYLE_BOSS, DEFAULT_REAL_RAID_TIER);
    expect(withDefault).toEqual(explicit);
    expect(DEFAULT_REAL_RAID_TIER).toBe("5-Star Raids");
  });

  it("gives a real species' HP as the tier's FIXED pool, not baseStamina run through effectiveStat/CPM (the critical regression this feature must guard)", () => {
    const hp = bossEffectiveHp(REAL_STYLE_BOSS, "Mega Raids");
    // Must be exactly the tier's flat number...
    expect(hp).toBe(9000);
    // ...NOT the species' own baseStamina...
    expect(hp).not.toBe(REAL_STYLE_BOSS.baseStamina);
    // ...and NOT effectiveStat(baseStamina, iv, multiplier) either — the
    // literal wrong "fix" this must not regress into.
    const wrongIfCpmAppliedToHp = effectiveStat(REAL_STYLE_BOSS.baseStamina, REAL_RAID_BOSS_IV, RAID_TIER_TABLE["Mega Raids"].attackDefenseMultiplier);
    expect(hp).not.toBe(wrongIfCpmAppliedToHp);
  });

  it("HP varies correctly across every real tier", () => {
    expect(bossEffectiveHp(REAL_STYLE_BOSS, "1-Star Raids")).toBe(600);
    expect(bossEffectiveHp(REAL_STYLE_BOSS, "3-Star Raids")).toBe(3600);
    expect(bossEffectiveHp(REAL_STYLE_BOSS, "5-Star Raids")).toBe(15000);
    expect(bossEffectiveHp(REAL_STYLE_BOSS, "Super Mega Raids")).toBe(25000);
    expect(bossEffectiveHp(REAL_STYLE_BOSS, "Primal Raids")).toBe(22500);
  });

  it("a precomputed synthetic boss is completely unaffected by tier — still the old iv=0/cpm=1.0 pass-through", () => {
    // A second hand-authored synthetic boss, flagged statsArePrecomputed —
    // same convention as REAL_STYLE_BOSS above, just the opposite branch.
    const PRECOMPUTED_STYLE_BOSS: SpeciesDefinition = {
      id: "precomputed-style-boss",
      name: "Precomputed Style Boss",
      types: ["normal"],
      baseAttack: 200,
      baseDefense: 180,
      baseStamina: 15000,
      fastMoves: [{ id: "pf", name: "Precomputed Fast", type: "normal", power: 8, energyGain: 8, durationSeconds: 1 }],
      chargedMoves: [{ id: "pc", name: "Precomputed Charged", type: "normal", power: 70, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
      statsArePrecomputed: true,
    };

    // Confirms the branch: statsArePrecomputed must short-circuit BEFORE any
    // tier lookup, so passing a tier here must change nothing at all.
    for (const tier of ["1-Star Raids", "Mega Raids", "Primal Raids"] as RaidTier[]) {
      const { attack, defense } = bossEffectiveStats(PRECOMPUTED_STYLE_BOSS, tier);
      expect(attack).toBe(effectiveStat(PRECOMPUTED_STYLE_BOSS.baseAttack, RAID_BOSS_IVS.attack, RAID_BOSS_CPM));
      expect(defense).toBe(effectiveStat(PRECOMPUTED_STYLE_BOSS.baseDefense, RAID_BOSS_IVS.defense, RAID_BOSS_CPM));
      expect(bossEffectiveHp(PRECOMPUTED_STYLE_BOSS, tier)).toBe(PRECOMPUTED_STYLE_BOSS.baseStamina);
    }
    // Sanity: this fixture's real tier ("Primal Raids", HP 22500) is
    // DIFFERENT from its precomputed HP (15000) — proves this test would
    // actually catch a regression that stopped short-circuiting.
    expect(bossEffectiveHp(PRECOMPUTED_STYLE_BOSS, "Primal Raids")).not.toBe(RAID_TIER_TABLE["Primal Raids"].hp);
    expect(PRECOMPUTED_STYLE_BOSS.baseStamina).toBe(15000);
  });

  it("a second precomputed synthetic boss with a different baseStamina is likewise unaffected by a supplied real tier", () => {
    const ANOTHER_PRECOMPUTED_STYLE_BOSS: SpeciesDefinition = {
      id: "another-precomputed-style-boss",
      name: "Another Precomputed Style Boss",
      types: ["normal"],
      baseAttack: 210,
      baseDefense: 210,
      baseStamina: 12000,
      fastMoves: [{ id: "af2", name: "Another Fast", type: "normal", power: 8, energyGain: 8, durationSeconds: 1 }],
      chargedMoves: [{ id: "ac2", name: "Another Charged", type: "normal", power: 70, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
      statsArePrecomputed: true,
    };
    const { attack, defense } = bossEffectiveStats(ANOTHER_PRECOMPUTED_STYLE_BOSS, "Mega Raids");
    expect(attack).toBe(effectiveStat(ANOTHER_PRECOMPUTED_STYLE_BOSS.baseAttack, RAID_BOSS_IVS.attack, RAID_BOSS_CPM));
    expect(defense).toBe(effectiveStat(ANOTHER_PRECOMPUTED_STYLE_BOSS.baseDefense, RAID_BOSS_IVS.defense, RAID_BOSS_CPM));
    expect(bossEffectiveHp(ANOTHER_PRECOMPUTED_STYLE_BOSS, "Mega Raids")).toBe(ANOTHER_PRECOMPUTED_STYLE_BOSS.baseStamina);
    // This fixture's real tier HP (9000) differs from its hand-tuned 12000 —
    // the branch must actually matter here.
    expect(ANOTHER_PRECOMPUTED_STYLE_BOSS.baseStamina).not.toBe(RAID_TIER_TABLE["Mega Raids"].hp);
  });
});
