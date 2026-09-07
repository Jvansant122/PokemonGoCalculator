import { describe, expect, it } from "vitest";
import { attackDamageGrid, defenseDamageGrid, findFastMoveBreakpoints, timeToFaint } from "../src/breakpoints.js";
import { calculateDamage } from "../src/damage.js";
import { CPM_TABLE } from "../src/cpm.js";
import { effectiveStat } from "../src/stats.js";

describe("findFastMoveBreakpoints", () => {
  it("returns only the levels where damage actually changes, per IV", () => {
    const rows = findFastMoveBreakpoints({
      baseAttack: 150,
      power: 10,
      defenderDefenseStat: 120,
      damageModifiers: { stab: true },
      ivRange: [0, 15],
      levels: [1, 10, 20, 30, 40],
    });

    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.ivAttack === rows[i - 1]!.ivAttack) {
        expect(rows[i]!.damage).not.toBe(rows[i - 1]!.damage);
      }
    }
    expect(rows.some((r) => r.ivAttack === 0)).toBe(true);
    expect(rows.some((r) => r.ivAttack === 15)).toBe(true);
  });
});

describe("attackDamageGrid", () => {
  it("matches a hand-verified calculateDamage value at a specific iv/level cell", () => {
    const grid = attackDamageGrid({
      baseAttack: 150,
      defenderDefenseStat: 120,
      power: 10,
      damageModifiers: { stab: true },
      ivRange: [10],
      levels: [20],
    });

    expect(grid).toHaveLength(1);
    const cpm = CPM_TABLE[20]!;
    const expectedStat = effectiveStat(150, 10, cpm);
    const expectedDamage = calculateDamage({
      power: 10,
      attackerAttackStat: expectedStat,
      defenderDefenseStat: 120,
      stab: true,
    });
    expect(grid[0]).toEqual({ iv: 10, level: 20, stat: expectedStat, damage: expectedDamage });
  });

  it("returns a full unfiltered grid: 16 IVs x every requested level, no filtering", () => {
    const levels = [1, 10, 20, 30, 40];
    const grid = attackDamageGrid({
      baseAttack: 150,
      defenderDefenseStat: 120,
      power: 10,
      damageModifiers: { stab: true },
    });
    const gridWithExplicitLevels = attackDamageGrid({
      baseAttack: 150,
      defenderDefenseStat: 120,
      power: 10,
      damageModifiers: { stab: true },
      levels,
    });

    // default ivRange (0-15) x default levels (full CPM_TABLE range)
    expect(new Set(grid.map((c) => c.iv)).size).toBe(16);
    expect(gridWithExplicitLevels).toHaveLength(16 * levels.length);
    for (const iv of [0, 15]) {
      for (const level of levels) {
        expect(gridWithExplicitLevels.some((c) => c.iv === iv && c.level === level)).toBe(true);
      }
    }
  });
});

describe("defenseDamageGrid", () => {
  it("matches a hand-verified calculateDamage value at a specific iv/level cell", () => {
    const grid = defenseDamageGrid({
      baseDefense: 140,
      attackerAttackStat: 200,
      power: 12,
      damageModifiers: { stab: false },
      ivRange: [7],
      levels: [25],
    });

    expect(grid).toHaveLength(1);
    const cpm = CPM_TABLE[25]!;
    const expectedStat = effectiveStat(140, 7, cpm);
    const expectedDamage = calculateDamage({
      power: 12,
      attackerAttackStat: 200,
      defenderDefenseStat: expectedStat,
      stab: false,
    });
    expect(grid[0]).toEqual({ iv: 7, level: 25, stat: expectedStat, damage: expectedDamage });
  });

  it("returns a full unfiltered grid: 16 defense IVs x every requested level", () => {
    const levels = [1, 15, 30, 45];
    const grid = defenseDamageGrid({
      baseDefense: 140,
      attackerAttackStat: 200,
      power: 12,
      damageModifiers: { stab: false },
      levels,
    });

    expect(grid).toHaveLength(16 * levels.length);
    expect(new Set(grid.map((c) => c.iv)).size).toBe(16);
  });

  it("shares the same underlying formula as attackDamageGrid (swapped roles produce symmetric results)", () => {
    // If we sweep "attack" with a base stat and fixed opposing stat, then
    // sweep "defense" with the roles reversed (same numbers, opposite
    // slots), the resulting damage values at matching iv/level cells must
    // be computable by a single direct calculateDamage call in each case —
    // proving both roles route through one shared formula, not two
    // independently-drifting ones.
    const baseStat = 180;
    const fixedOpposing = 160;
    const power = 15;
    const iv = 12;
    const level = 30;
    const cpm = CPM_TABLE[level]!;
    const swept = effectiveStat(baseStat, iv, cpm);

    const attackerRole = attackDamageGrid({
      baseAttack: baseStat,
      defenderDefenseStat: fixedOpposing,
      power,
      damageModifiers: { stab: true },
      ivRange: [iv],
      levels: [level],
    })[0]!;
    const defenderRole = defenseDamageGrid({
      baseDefense: baseStat,
      attackerAttackStat: fixedOpposing,
      power,
      damageModifiers: { stab: true },
      ivRange: [iv],
      levels: [level],
    })[0]!;

    const directAttackerDamage = calculateDamage({
      power,
      attackerAttackStat: swept,
      defenderDefenseStat: fixedOpposing,
      stab: true,
    });
    const directDefenderDamage = calculateDamage({
      power,
      attackerAttackStat: fixedOpposing,
      defenderDefenseStat: swept,
      stab: true,
    });

    expect(attackerRole.damage).toBe(directAttackerDamage);
    expect(defenderRole.damage).toBe(directDefenderDamage);
    expect(attackerRole.stat).toBe(swept);
    expect(defenderRole.stat).toBe(swept);
  });
});

describe("timeToFaint", () => {
  it("survives roughly 4x longer under perfect dodging than no dodging", () => {
    const params = {
      hp: 130,
      defenseStat: 125,
      bossAttackStat: 250,
      bossFastMovePower: 27,
      bossFastMoveDurationSeconds: 2.5,
      damageModifiers: { stab: true },
      maxSeconds: 120,
    };
    const noDodge = timeToFaint({ ...params, dodge: { kind: "none" } });
    const perfectDodge = timeToFaint({ ...params, dodge: { kind: "perfect" } });
    expect(noDodge).toBe(10);
    expect(perfectDodge).not.toBeNull();
    expect(perfectDodge! / noDodge!).toBeGreaterThan(3.5);
  });
});
