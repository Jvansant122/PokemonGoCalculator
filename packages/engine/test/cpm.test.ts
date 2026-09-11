import { describe, expect, it } from "vitest";
import { CPM_TABLE, cpmForLevel, MAX_POKEMON_POWER_UP_LEVEL } from "../src/cpm.js";
import { effectiveStat } from "../src/stats.js";

describe("CPM_TABLE levels 41-50", () => {
  it("accepts level 45 with the verified GAME_MASTER value", () => {
    expect(cpmForLevel(45)).toBeCloseTo(0.8153, 10);
  });

  it("accepts level 50 with the verified GAME_MASTER value", () => {
    expect(cpmForLevel(50)).toBeCloseTo(0.8403, 10);
  });

  it("accepts a half-level in the new range (45.5)", () => {
    expect(cpmForLevel(45.5)).toBeCloseTo(0.8178038212187566, 10);
  });

  it("produces the expected effective stat at level 50", () => {
    // 200 base + 15 IV = 215, floor(215 * 0.8403) = 180
    expect(effectiveStat(200, 15, cpmForLevel(50))).toBe(Math.floor(215 * 0.8403));
  });

  it("rejects level 0", () => {
    expect(() => cpmForLevel(0)).toThrow();
  });
});

describe("CPM_TABLE levels 50.5-53 (effective-level lookup targets for bonus stacking, NOT power-up targets)", () => {
  // This supersedes an earlier "rejects level 50.5 and beyond" test — that
  // was correct for the OLD decision (table stopped at 50) but the decision
  // has since deliberately changed (Super Max Mega Level's +2-effective-level
  // CP bonus needs these as lookup targets — see cpm.ts's own doc comment and
  // megaLevel.ts's SUPER_MAX_EFFECTIVE_LEVEL_BONUS). The real power-up
  // ceiling itself is UNCHANGED — see MAX_POKEMON_POWER_UP_LEVEL below and
  // test/megaLevelPowerUpCeiling.test.ts for the regression guard proving
  // powerUp.ts/rosterPlanner.ts never actually offer these as a target.
  //
  // EXTENDED 2026-09-10 from 52 to 53 (see cpm.ts's updated doc comment) —
  // the Best Buddy CP Boost's +1 effective level (megaLevel.ts's
  // BEST_BUDDY_EFFECTIVE_LEVEL_BONUS) stacks with Super Max's +2, so a
  // level-50 Super Max mega that is ALSO its trainer's Best Buddy needs
  // exactly level 53.
  it("accepts levels 51, 52 and 53 with the verified real GAME_MASTER whole-level values", () => {
    expect(cpmForLevel(51)).toBeCloseTo(0.8453, 10);
    expect(cpmForLevel(52)).toBeCloseTo(0.8503, 10);
    expect(cpmForLevel(53)).toBeCloseTo(0.8553, 10);
  });

  it("accepts half-levels 50.5, 51.5 and 52.5, computed via this file's own established half-level formula", () => {
    // Verified by actually running CPM(n+0.5) = sqrt((CPM(n)^2 + CPM(n+1)^2)/2)
    // against the whole-level values above (a throwaway script, not hand
    // arithmetic — see this project's pinned-number discipline).
    expect(cpmForLevel(50.5)).toBeCloseTo(0.842803707870344, 10);
    expect(cpmForLevel(51.5)).toBeCloseTo(0.8478036860028387, 10);
    expect(cpmForLevel(52.5)).toBeCloseTo(0.8528036644423769, 10);
  });

  it("still rejects level 53.5 and beyond — no modelled bonus ever needs to shift a level that far", () => {
    expect(() => cpmForLevel(53.5)).toThrow();
    expect(() => cpmForLevel(54)).toThrow();
  });

  it("MAX_POKEMON_POWER_UP_LEVEL stays 50 even though CPM_TABLE's own keys now extend to 53", () => {
    expect(MAX_POKEMON_POWER_UP_LEVEL).toBe(50);
    expect(Math.max(...Object.keys(CPM_TABLE).map(Number))).toBe(53);
  });
});
