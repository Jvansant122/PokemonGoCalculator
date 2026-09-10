import { describe, expect, it } from "vitest";
import {
  SHADOW_ATTACK_MULTIPLIER,
  SHADOW_DEFENSE_MULTIPLIER,
  SHADOW_ENRAGE_ATTACK_MULTIPLIER,
  SHADOW_ENRAGE_ATTACK_OFFSET,
  SHADOW_ENRAGE_DEFENSE_MULTIPLIER,
  SHADOW_ENRAGE_DEFENSE_OFFSET,
  SHADOW_ENRAGE_HP_FRACTION,
  SHADOW_SUBDUE_HP_FRACTION,
  shadowAdjustedBaseStats,
  shadowEnragedStats,
  shadowEnragePhaseForHpFraction,
} from "../src/shadow.js";
import { effectiveStat, effectiveStatsAtLevel } from "../src/stats.js";
import { cpmForLevel } from "../src/cpm.js";
import type { SpeciesDefinition } from "../src/types.js";

describe("shadowAdjustedBaseStats", () => {
  it("leaves base stats untouched when isShadow is not set", () => {
    expect(shadowAdjustedBaseStats({ baseAttack: 200, baseDefense: 150 })).toEqual({
      baseAttack: 200,
      baseDefense: 150,
    });
  });

  it("applies SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER to raw base stats when isShadow is true", () => {
    const result = shadowAdjustedBaseStats({ baseAttack: 200, baseDefense: 150, isShadow: true });
    expect(result.baseAttack).toBeCloseTo(200 * SHADOW_ATTACK_MULTIPLIER, 10);
    expect(result.baseDefense).toBeCloseTo(150 * SHADOW_DEFENSE_MULTIPLIER, 10);
    // Attack multiplier is a boost, defense is a penalty — the "glass cannon" trade.
    expect(SHADOW_ATTACK_MULTIPLIER).toBeGreaterThan(1);
    expect(SHADOW_DEFENSE_MULTIPLIER).toBeLessThan(1);
  });

  it("throws when a species is flagged both isShadow and carries a mega/primal boost", () => {
    expect(() =>
      shadowAdjustedBaseStats({
        baseAttack: 200,
        baseDefense: 150,
        isShadow: true,
        boost: { multiplier: 1.3, boostedType: "water" },
      }),
    ).toThrow(/Shadow Pok.mon cannot Mega Evolve|Shadow.*Mega/i);
  });

  it("does NOT floor the shadow-adjusted stat itself — that's stats.ts's job, applied exactly once downstream", () => {
    // A base stat chosen so base*multiplier is fractional, proving this
    // function hands back a raw (non-integer) number rather than pre-flooring.
    const result = shadowAdjustedBaseStats({ baseAttack: 201, baseDefense: 151, isShadow: true });
    expect(Number.isInteger(result.baseAttack)).toBe(false);
  });
});

describe("effectiveStatsAtLevel with isShadow", () => {
  it("applies the shadow multiplier before stats.ts's single FLOOR(), not after", () => {
    const species: SpeciesDefinition = {
      id: "shadow-test",
      name: "Shadow Test",
      types: ["normal"],
      baseAttack: 200,
      baseDefense: 150,
      baseStamina: 180,
      fastMoves: [],
      chargedMoves: [],
      isShadow: true,
    };
    const ivs = { attack: 15, defense: 15, stamina: 15 };
    const level = 30;
    const cpm = cpmForLevel(level);

    const stats = effectiveStatsAtLevel(species, ivs, level);
    expect(stats.attack).toBe(effectiveStat(200 * SHADOW_ATTACK_MULTIPLIER, 15, cpm));
    expect(stats.defense).toBe(effectiveStat(150 * SHADOW_DEFENSE_MULTIPLIER, 15, cpm));
    // Stamina is untouched by the shadow multiplier.
    expect(stats.stamina).toBe(effectiveStat(180, 15, cpm));
  });

  it("a Shadow attacker has strictly higher attack and strictly lower defense than its non-Shadow counterpart", () => {
    const base: Omit<SpeciesDefinition, "isShadow"> = {
      id: "normal-test",
      name: "Normal Test",
      types: ["normal"],
      baseAttack: 200,
      baseDefense: 150,
      baseStamina: 180,
      fastMoves: [],
      chargedMoves: [],
    };
    const ivs = { attack: 15, defense: 15, stamina: 15 };
    const level = 30;

    const normalStats = effectiveStatsAtLevel(base, ivs, level);
    const shadowStats = effectiveStatsAtLevel({ ...base, isShadow: true }, ivs, level);

    expect(shadowStats.attack).toBeGreaterThan(normalStats.attack);
    expect(shadowStats.defense).toBeLessThan(normalStats.defense);
    expect(shadowStats.stamina).toBe(normalStats.stamina);
  });

  it("throws for a species flagged both isShadow and boost, instead of silently combining them", () => {
    const impossibleSpecies: SpeciesDefinition = {
      id: "shadow-mega-impossible",
      name: "Shadow Mega (impossible)",
      types: ["normal"],
      baseAttack: 200,
      baseDefense: 150,
      baseStamina: 180,
      fastMoves: [],
      chargedMoves: [],
      isShadow: true,
      boost: { multiplier: 1.3, boostedType: "normal" },
    };
    expect(() => effectiveStatsAtLevel(impossibleSpecies, { attack: 15, defense: 15, stamina: 15 }, 30)).toThrow();
  });
});

describe("shadowEnragePhaseForHpFraction", () => {
  it("is normal above the 60% enrage threshold", () => {
    expect(shadowEnragePhaseForHpFraction(1)).toBe("normal");
    expect(shadowEnragePhaseForHpFraction(0.61)).toBe("normal");
  });

  it("is enraged from 60% down to (exclusive) the 15% subdue threshold", () => {
    expect(shadowEnragePhaseForHpFraction(SHADOW_ENRAGE_HP_FRACTION)).toBe("enraged");
    expect(shadowEnragePhaseForHpFraction(0.3)).toBe("enraged");
    expect(shadowEnragePhaseForHpFraction(SHADOW_SUBDUE_HP_FRACTION + 0.01)).toBe("enraged");
  });

  it("auto-subdues back to normal at/below 15%", () => {
    expect(shadowEnragePhaseForHpFraction(SHADOW_SUBDUE_HP_FRACTION)).toBe("normal");
    expect(shadowEnragePhaseForHpFraction(0.05)).toBe("normal");
    expect(shadowEnragePhaseForHpFraction(0)).toBe("normal");
  });
});

describe("shadowEnragedStats — the stacking decision", () => {
  it("applies the enrage formula to the ALREADY shadow-adjusted base stat (one Shadow-multiplier application, not two)", () => {
    // baseAttack=100/baseDefense=100 chosen so the shadow-adjustment step is
    // easy to hand-verify: shadowAdjustedBaseStats gives {100*1.2, 100*5/6}
    // = {120, 83.333...}. If this function instead read the RAW base stat
    // (skipping shadowAdjustedBaseStats entirely) it would compute
    // floor(1.81*100+15)=196 / floor(3*100+15)=315 instead — a materially
    // different pair, so this test actually distinguishes the two readings
    // rather than passing either way.
    const species = { baseAttack: 100, baseDefense: 100, isShadow: true };
    const result = shadowEnragedStats(species);
    const adjusted = shadowAdjustedBaseStats(species);
    expect(result.attack).toBe(Math.floor(SHADOW_ENRAGE_ATTACK_MULTIPLIER * adjusted.baseAttack + SHADOW_ENRAGE_ATTACK_OFFSET));
    expect(result.defense).toBe(Math.floor(SHADOW_ENRAGE_DEFENSE_MULTIPLIER * adjusted.baseDefense + SHADOW_ENRAGE_DEFENSE_OFFSET));
    // Pinned exact values (verified via a throwaway tsx script against this
    // engine's own formula, not hand arithmetic) — see this feature's
    // engine-developer report for the derivation trail.
    expect(result).toEqual({ attack: 232, defense: 265 });
  });

  it("both enraged Attack and enraged Defense are strictly higher than the SAME species' normal (non-enraged) shadow-adjusted stats", () => {
    // Not a tautology of the multiplier alone — the enrage formula's shape
    // (multiplier + flat offset) differs enough from effectiveStat's
    // (base+iv)*cpm that this is worth checking directly rather than assumed.
    const species = { baseAttack: 200, baseDefense: 150, isShadow: true };
    const adjusted = shadowAdjustedBaseStats(species);
    const enraged = shadowEnragedStats(species);
    expect(enraged.attack).toBeGreaterThan(adjusted.baseAttack);
    expect(enraged.defense).toBeGreaterThan(adjusted.baseDefense);
  });

  it("throws for a species flagged both isShadow and boost, same as shadowAdjustedBaseStats (inherited, not reimplemented)", () => {
    expect(() =>
      shadowEnragedStats({
        baseAttack: 200,
        baseDefense: 150,
        isShadow: true,
        boost: { multiplier: 1.3, boostedType: "water" },
      }),
    ).toThrow();
  });

  it("a non-Shadow species still computes an enrage transform if asked directly (the isShadow GATE lives one level up, in comparison.ts's bossEnrageStats)", () => {
    // shadowEnragedStats itself has no isShadow branch of its own — it just
    // reuses shadowAdjustedBaseStats, which passes non-Shadow stats through
    // unchanged. The real "only Shadow bosses enrage" rule is enforced by
    // comparison.ts's bossEnrageStats (see comparison.test.ts), not here.
    const species = { baseAttack: 100, baseDefense: 100, isShadow: false };
    const result = shadowEnragedStats(species);
    expect(result).toEqual({
      attack: Math.floor(SHADOW_ENRAGE_ATTACK_MULTIPLIER * 100 + SHADOW_ENRAGE_ATTACK_OFFSET),
      defense: Math.floor(SHADOW_ENRAGE_DEFENSE_MULTIPLIER * 100 + SHADOW_ENRAGE_DEFENSE_OFFSET),
    });
  });
});
