import { describe, expect, it } from "vitest";
import { findFastMoveBreakpoints, timeToFaint } from "../src/breakpoints.js";

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
