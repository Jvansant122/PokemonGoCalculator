import { describe, expect, it } from "vitest";
import { convertUptimeToTeamDamage, findCrossoverPartySize, DEFAULT_MEGA_BOOST_MULTIPLIER } from "../src/uptime.js";

describe("convertUptimeToTeamDamage", () => {
  it("matches the spec's worked example: ~3s extra uptime, 4 teammates at ~26.5 DPS", () => {
    const damage = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: DEFAULT_MEGA_BOOST_MULTIPLIER,
      teammateCount: 4,
      teammateDps: 26.5,
      typeMatches: true,
    });
    // 3 * 26.5 * 4 * 1.3 = 413.4 (the boosted total damage during the extra window)
    expect(damage).toBeCloseTo(413.4, 5);
  });

  it("gives zero benefit when the party's attack type doesn't match the boost", () => {
    const damage = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: DEFAULT_MEGA_BOOST_MULTIPLIER,
      teammateCount: 4,
      teammateDps: 26.5,
      typeMatches: false,
    });
    expect(damage).toBeCloseTo(3 * 26.5 * 4, 5);
  });

  it("using 1.1 instead of 1.3 produces materially less contribution (the invalidating-assumption case)", () => {
    const at13 = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: 1.3,
      teammateCount: 4,
      teammateDps: 26.5,
      typeMatches: true,
    });
    const at11 = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: 1.1,
      teammateCount: 4,
      teammateDps: 26.5,
      typeMatches: true,
    });
    expect(at11).toBeLessThan(at13);
  });
});

describe("findCrossoverPartySize", () => {
  it("finds the party size where a lower-DPS-but-tankier candidate overtakes", () => {
    const x = { id: "X", secondsSurvived: 13, boostMultiplier: 1.3, boostedType: "electric" as const, ownDamage: 190 };
    const y = { id: "Y", secondsSurvived: 10, boostMultiplier: 1.3, boostedType: "electric" as const, ownDamage: 221 };

    const crossover = findCrossoverPartySize(x, y, 2, { a: true, b: true });
    expect(crossover.partySize).toBe(4);
    expect(crossover.leaderAtOrAbove).toBe("X");
    expect(crossover.leaderBelow).toBe("Y");
  });
});
