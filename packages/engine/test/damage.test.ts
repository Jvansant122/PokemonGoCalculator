import { describe, expect, it } from "vitest";
import { calculateDamage, FRIENDSHIP_ATTACK_BONUS_MULTIPLIER } from "../src/damage.js";

describe("FRIENDSHIP_ATTACK_BONUS_MULTIPLIER", () => {
  it("carries the real 5-tier GAME_MASTER ladder plus 'none', 1.00 through 1.12", () => {
    expect(FRIENDSHIP_ATTACK_BONUS_MULTIPLIER).toEqual({
      none: 1.0,
      good: 1.03,
      great: 1.05,
      ultra: 1.07,
      best: 1.1,
      forever: 1.12,
    });
  });
});

describe("calculateDamage's friendshipLevel", () => {
  const base = {
    power: 100,
    attackerAttackStat: 200,
    defenderDefenseStat: 150,
    stab: false,
  };

  it("defaults to no bonus (identical to 'none') when omitted", () => {
    const omitted = calculateDamage(base);
    const explicitNone = calculateDamage({ ...base, friendshipLevel: "none" });
    expect(omitted).toBe(explicitNone);
  });

  it("scales damage up monotonically from 'none' through 'forever'", () => {
    const tiers = ["none", "good", "great", "ultra", "best", "forever"] as const;
    const damages = tiers.map((friendshipLevel) => calculateDamage({ ...base, friendshipLevel }));
    for (let i = 1; i < damages.length; i++) {
      expect(damages[i]!).toBeGreaterThanOrEqual(damages[i - 1]!);
    }
    // At least the top tier must be strictly greater than no bonus at all —
    // monotonic-non-decreasing alone wouldn't catch the bonus being dead code.
    expect(damages[damages.length - 1]!).toBeGreaterThan(damages[0]!);
  });

  it("'best' tier reproduces the real Best Friend multiplier (1.10) exactly", () => {
    // power=40 chosen so the 10% bonus crosses a floor boundary cleanly:
    // floor(0.5*40) + 1 = 21 without the bonus, floor(0.5*40*1.1) + 1 = 23 with it.
    const inputs = { power: 40, attackerAttackStat: 100, defenderDefenseStat: 100, stab: false };
    const withoutBonus = calculateDamage(inputs);
    const withBest = calculateDamage({ ...inputs, friendshipLevel: "best" });
    expect(withoutBonus).toBe(Math.floor(0.5 * 40) + 1);
    expect(withBest).toBe(Math.floor(0.5 * 40 * 1.1) + 1);
    expect(withBest).toBeGreaterThan(withoutBonus);
  });

  it("stacks multiplicatively with every other modifier, not additively", () => {
    const inputs = {
      power: 100,
      attackerAttackStat: 300,
      defenderDefenseStat: 100,
      stab: true,
      typeEffectiveness: 1.6,
      weatherBoosted: true,
      megaBoostMultiplier: 1.3,
    };
    const withoutFriendship = calculateDamage(inputs);
    const withForever = calculateDamage({ ...inputs, friendshipLevel: "forever" });
    const expectedRaw =
      0.5 * inputs.power * (inputs.attackerAttackStat / inputs.defenderDefenseStat) * 1.2 * 1.6 * 1.2 * 1.12 * 1.3;
    expect(withForever).toBe(Math.floor(expectedRaw) + 1);
    expect(withForever).toBeGreaterThan(withoutFriendship);
  });
});
