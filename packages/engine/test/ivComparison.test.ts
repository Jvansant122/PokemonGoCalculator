import { describe, expect, it } from "vitest";
import { compareIvSpreads } from "../src/ivComparison.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";

// All expected numbers below were verified by actually running compareIvSpreads
// in a throwaway scratch script (per this project's discipline for pinned
// numbers), not derived by hand arithmetic alone.

const fastMove: FastMove = { id: "f", name: "f", type: "normal", power: 10, energyGain: 10, durationSeconds: 1 };
const chargedMove: ChargedMove = {
  id: "c",
  name: "c",
  type: "normal",
  power: 50,
  energyCost: 50,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};

function makeSpecies(overrides: Partial<SpeciesDefinition> = {}): SpeciesDefinition {
  return {
    id: "test-species",
    name: "TestSpecies",
    types: ["normal"],
    baseAttack: 100,
    baseDefense: 100,
    baseStamina: 100,
    fastMoves: [fastMove],
    chargedMoves: [chargedMove],
    ...overrides,
  };
}

describe("compareIvSpreads", () => {
  it("finds a genuine fast-move damage breakpoint from an attack-IV difference, including reconvergence", () => {
    const result = compareIvSpreads({
      species: makeSpecies(),
      fastMove,
      chargedMove,
      ivA: { attack: 0, defense: 10, stamina: 10 },
      ivB: { attack: 15, defense: 10, stamina: 10 },
      levels: [1, 10, 20, 30, 40],
      bossDefenseStat: 150,
      fastMoveDamageModifiers: { stab: true },
      chargedMoveDamageModifiers: { stab: true },
      bossAttackStat: 100,
      bossFastMovePower: 8,
      bossFastMoveDurationSeconds: 2,
      incomingDamageModifiers: { stab: false },
      dodge: { kind: "none" },
      maxSeconds: 120,
    });

    const byLevel = new Map(result.rows.map((r) => [r.level, r]));

    // Identical rounded fast-move damage at low levels...
    expect(byLevel.get(1)!.fastMoveDamageDiffers).toBe(false);
    expect(byLevel.get(1)!.ivA.fastMoveDamage).toBe(1);
    expect(byLevel.get(1)!.ivB.fastMoveDamage).toBe(1);
    expect(byLevel.get(20)!.fastMoveDamageDiffers).toBe(false);

    // ...a genuine breakpoint opens up at level 30...
    expect(byLevel.get(30)!.fastMoveDamageDiffers).toBe(true);
    expect(byLevel.get(30)!.ivA.fastMoveDamage).toBe(3);
    expect(byLevel.get(30)!.ivB.fastMoveDamage).toBe(4);

    // ...and floor rounding closes it again by level 40 — a real, non-monotonic
    // outcome this function must report plainly rather than smoothing over.
    expect(byLevel.get(40)!.fastMoveDamageDiffers).toBe(false);
    expect(byLevel.get(40)!.ivA.fastMoveDamage).toBe(4);
    expect(byLevel.get(40)!.ivB.fastMoveDamage).toBe(4);

    expect(result.firstDivergenceLevel.fastMoveDamage).toBe(30);
  });

  it("reports no divergence anywhere in range for a close IV spread that never changes rounded output", () => {
    const result = compareIvSpreads({
      species: makeSpecies(),
      fastMove,
      chargedMove,
      ivA: { attack: 5, defense: 5, stamina: 5 },
      ivB: { attack: 6, defense: 5, stamina: 5 },
      levels: [1, 1.5, 2, 2.5, 3],
      bossDefenseStat: 150,
      fastMoveDamageModifiers: { stab: true },
      chargedMoveDamageModifiers: { stab: true },
      bossAttackStat: 100,
      bossFastMovePower: 8,
      bossFastMoveDurationSeconds: 2,
      incomingDamageModifiers: { stab: false },
      dodge: { kind: "none" },
      maxSeconds: 120,
    });

    // This is a real, likely outcome for close IV spreads — not an error case.
    for (const row of result.rows) {
      expect(row.fastMoveDamageDiffers).toBe(false);
      expect(row.chargedMoveDamageDiffers).toBe(false);
      expect(row.timeToFaintDiffers).toBe(false);
    }
    expect(result.firstDivergenceLevel.fastMoveDamage).toBeNull();
    expect(result.firstDivergenceLevel.chargedMoveDamage).toBeNull();
    expect(result.firstDivergenceLevel.timeToFaint).toBeNull();
  });

  it("finds a bulk/survivability divergence from a defense-IV difference even when outgoing damage never differs", () => {
    const species = makeSpecies({ baseAttack: 150, baseDefense: 100, baseStamina: 150 });
    const result = compareIvSpreads({
      species,
      fastMove,
      chargedMove,
      // Same attack and stamina IVs — only defense differs.
      ivA: { attack: 10, defense: 0, stamina: 10 },
      ivB: { attack: 10, defense: 15, stamina: 10 },
      levels: [1, 5, 10, 15, 20, 25, 30, 35, 40],
      bossDefenseStat: 150,
      fastMoveDamageModifiers: { stab: true },
      chargedMoveDamageModifiers: { stab: true },
      bossAttackStat: 250,
      bossFastMovePower: 12,
      bossFastMoveDurationSeconds: 1.5,
      incomingDamageModifiers: { stab: false },
      dodge: { kind: "none" },
      maxSeconds: 120,
    });

    const byLevel = new Map(result.rows.map((r) => [r.level, r]));

    // Identical attack IV means outgoing damage never diverges anywhere in range.
    for (const row of result.rows) {
      expect(row.fastMoveDamageDiffers).toBe(false);
      expect(row.chargedMoveDamageDiffers).toBe(false);
    }

    // But the tankier spread (higher defense IV) survives longer starting at level 10...
    expect(byLevel.get(10)!.timeToFaintDiffers).toBe(true);
    expect(byLevel.get(10)!.ivA.timeToFaintSeconds).toBe(3);
    expect(byLevel.get(10)!.ivB.timeToFaintSeconds).toBe(4.5);

    // ...and (like the fast-move breakpoint case) can transiently reconverge —
    // level 35 lands back on an identical rounded time-to-faint.
    expect(byLevel.get(35)!.timeToFaintDiffers).toBe(false);
    expect(byLevel.get(35)!.ivA.timeToFaintSeconds).toBe(10.5);
    expect(byLevel.get(35)!.ivB.timeToFaintSeconds).toBe(10.5);

    expect(result.firstDivergenceLevel.timeToFaint).toBe(10);
    expect(result.firstDivergenceLevel.fastMoveDamage).toBeNull();
    expect(result.firstDivergenceLevel.chargedMoveDamage).toBeNull();
  });
});
