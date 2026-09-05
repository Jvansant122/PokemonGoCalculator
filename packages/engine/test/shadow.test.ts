import { describe, expect, it } from "vitest";
import { SHADOW_ATTACK_MULTIPLIER, SHADOW_DEFENSE_MULTIPLIER, shadowAdjustedBaseStats } from "../src/shadow.js";
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
