import { describe, expect, it } from "vitest";
import {
  attackDamageGrid,
  defenseDamageGrid,
  DODGE_COST_SECONDS,
  fastMoveCadenceTooFastToDodge,
  findFastMoveBreakpoints,
  timeToFaint,
  timeToFaintTable,
} from "../src/breakpoints.js";
import { calculateDamage } from "../src/damage.js";
import { CPM_TABLE } from "../src/cpm.js";
import { effectiveLevelForMegaLevel } from "../src/megaLevel.js";
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

describe("default level sweeps stay capped at 50, never CPM_TABLE's effective-level-only entries past it", () => {
  it("attackDamageGrid", () => {
    const grid = attackDamageGrid({ baseAttack: 150, defenderDefenseStat: 120, power: 10, damageModifiers: { stab: true } });
    expect(Math.max(...grid.map((c) => c.level))).toBe(50);
  });

  it("defenseDamageGrid", () => {
    const grid = defenseDamageGrid({ baseDefense: 140, attackerAttackStat: 200, power: 12, damageModifiers: { stab: false } });
    expect(Math.max(...grid.map((c) => c.level))).toBe(50);
  });

  it("findFastMoveBreakpoints", () => {
    const rows = findFastMoveBreakpoints({ baseAttack: 150, power: 10, defenderDefenseStat: 120, damageModifiers: { stab: true } });
    expect(Math.max(...rows.map((r) => r.level))).toBeLessThanOrEqual(50);
  });

  it("timeToFaintTable", () => {
    const rows = timeToFaintTable({
      baseStamina: 200,
      baseDefense: 140,
      ivStamina: 15,
      bossAttackStat: 150,
      bossFastMovePower: 10,
      bossFastMoveDurationSeconds: 2,
      damageModifiers: { stab: false },
      dodge: { kind: "none" },
    });
    expect(Math.max(...rows.map((r) => r.level))).toBe(50);
  });
});

describe("megaLevel threading (Super Max's effective-level CP bonus)", () => {
  it("attackDamageGrid shifts the swept Attack-stat lookup, but the cell's own `level` stays the real power-up level", () => {
    const base = attackDamageGrid({ baseAttack: 150, defenderDefenseStat: 120, power: 10, damageModifiers: { stab: true }, ivRange: [15], levels: [50] })[0]!;
    const superMax = attackDamageGrid({
      baseAttack: 150,
      defenderDefenseStat: 120,
      power: 10,
      damageModifiers: { stab: true },
      ivRange: [15],
      levels: [50],
      megaLevel: "super-max",
    })[0]!;

    expect(superMax.level).toBe(50); // unchanged — the real power-up level
    expect(superMax.stat).toBe(effectiveStat(150, 15, CPM_TABLE[effectiveLevelForMegaLevel(50, "super-max")]!));
    expect(superMax.stat).toBeGreaterThan(base.stat);
    expect(superMax.damage).toBeGreaterThanOrEqual(base.damage);
  });

  it("base/high/max all give +0 — attackDamageGrid is byte-identical across all three", () => {
    const cellFor = (megaLevel: "base" | "high" | "max" | undefined) =>
      attackDamageGrid({ baseAttack: 150, defenderDefenseStat: 120, power: 10, damageModifiers: { stab: true }, ivRange: [15], levels: [50], megaLevel })[0]!;
    const omitted = cellFor(undefined);
    expect(cellFor("base")).toEqual(omitted);
    expect(cellFor("high")).toEqual(omitted);
    expect(cellFor("max")).toEqual(omitted);
  });

  it("defenseDamageGrid shifts the swept Defense-stat lookup the same way", () => {
    const base = defenseDamageGrid({ baseDefense: 140, attackerAttackStat: 200, power: 12, damageModifiers: { stab: false }, ivRange: [7], levels: [50] })[0]!;
    const superMax = defenseDamageGrid({
      baseDefense: 140,
      attackerAttackStat: 200,
      power: 12,
      damageModifiers: { stab: false },
      ivRange: [7],
      levels: [50],
      megaLevel: "super-max",
    })[0]!;
    expect(superMax.stat).toBe(effectiveStat(140, 7, CPM_TABLE[effectiveLevelForMegaLevel(50, "super-max")]!));
    expect(superMax.stat).toBeGreaterThan(base.stat);
    // A higher Defense stat means LESS incoming damage, never more.
    expect(superMax.damage).toBeLessThanOrEqual(base.damage);
  });

  it("findFastMoveBreakpoints shifts the Attack-stat lookup used to compute damage, per level", () => {
    const baseRows = findFastMoveBreakpoints({ baseAttack: 150, power: 10, defenderDefenseStat: 120, damageModifiers: { stab: true }, ivRange: [15], levels: [50] });
    const superMaxRows = findFastMoveBreakpoints({
      baseAttack: 150,
      power: 10,
      defenderDefenseStat: 120,
      damageModifiers: { stab: true },
      ivRange: [15],
      levels: [50],
      megaLevel: "super-max",
    });
    expect(superMaxRows[0]!.level).toBe(50);
    expect(superMaxRows[0]!.attackStat).toBe(effectiveStat(150, 15, CPM_TABLE[effectiveLevelForMegaLevel(50, "super-max")]!));
    expect(superMaxRows[0]!.attackStat).toBeGreaterThan(baseRows[0]!.attackStat);
  });

  it("timeToFaintTable shifts BOTH hp and defenseStat's lookup together (same defending species/level)", () => {
    const params = {
      baseStamina: 200,
      baseDefense: 140,
      ivStamina: 15,
      bossAttackStat: 150,
      bossFastMovePower: 10,
      bossFastMoveDurationSeconds: 2,
      damageModifiers: { stab: false },
      dodge: { kind: "none" as const },
      ivDefenseRange: [15],
      levels: [50],
    };
    const base = timeToFaintTable(params)[0]!;
    const superMax = timeToFaintTable({ ...params, megaLevel: "super-max" as const })[0]!;
    const expectedCpm = CPM_TABLE[effectiveLevelForMegaLevel(50, "super-max")]!;
    expect(superMax.level).toBe(50);
    expect(superMax.hp).toBe(effectiveStat(200, 15, expectedCpm));
    expect(superMax.hp).toBeGreaterThan(base.hp);
  });
});

describe("fastMoveCadenceTooFastToDodge", () => {
  it("is true at exactly DODGE_COST_SECONDS — an exact tie is still a permanent, not a near-miss", () => {
    expect(fastMoveCadenceTooFastToDodge(DODGE_COST_SECONDS)).toBe(true);
    expect(fastMoveCadenceTooFastToDodge(0.5)).toBe(true);
  });

  it("is true for any cadence faster than DODGE_COST_SECONDS", () => {
    expect(fastMoveCadenceTooFastToDodge(0.1)).toBe(true);
    expect(fastMoveCadenceTooFastToDodge(0.4)).toBe(true);
  });

  it("is false for any cadence slower than DODGE_COST_SECONDS", () => {
    expect(fastMoveCadenceTooFastToDodge(0.6)).toBe(false);
    expect(fastMoveCadenceTooFastToDodge(1.0)).toBe(false);
    expect(fastMoveCadenceTooFastToDodge(2.5)).toBe(false);
  });
});
