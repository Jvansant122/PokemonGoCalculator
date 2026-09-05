import { describe, expect, it } from "vitest";
import { convertUptimeToTeamDamage, findCrossoverPartySize, DEFAULT_MEGA_BOOST_MULTIPLIER, OFF_TYPE_MEGA_BOOST_MULTIPLIER } from "../src/uptime.js";

describe("convertUptimeToTeamDamage", () => {
  it("matches the spec's worked example: ~3s extra uptime, 4 teammates at ~26.5 DPS, all matching type", () => {
    const damage = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: DEFAULT_MEGA_BOOST_MULTIPLIER,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
    });
    // 3 * 26.5 * 4 * 1.3 = 413.4 (the boosted total damage during the extra window)
    expect(damage).toBeCloseTo(413.4, 5);
  });

  it("gives every off-type teammate the flat OFF_TYPE_MEGA_BOOST_MULTIPLIER, not zero", () => {
    const damage = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: DEFAULT_MEGA_BOOST_MULTIPLIER,
      teammateCount: 4,
      matchingTeammateCount: 0,
      teammateDps: 26.5,
    });
    // The real game gives every party member at least a flat team boost
    // regardless of type — an earlier version of this engine gave off-type
    // teammates 1x (no boost at all), which understated their contribution.
    expect(damage).toBeCloseTo(3 * 26.5 * 4 * OFF_TYPE_MEGA_BOOST_MULTIPLIER, 5);
    expect(damage).toBeGreaterThan(3 * 26.5 * 4); // strictly more than "no boost at all"
  });

  it("splits contribution proportionally for a mixed team (some matching, some not)", () => {
    const damage = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: DEFAULT_MEGA_BOOST_MULTIPLIER,
      teammateCount: 4,
      matchingTeammateCount: 1,
      teammateDps: 26.5,
    });
    const expected = 3 * (1 * 26.5 * DEFAULT_MEGA_BOOST_MULTIPLIER + 3 * 26.5 * OFF_TYPE_MEGA_BOOST_MULTIPLIER);
    expect(damage).toBeCloseTo(expected, 5);
  });

  it("clamps matchingTeammateCount to teammateCount rather than over-crediting", () => {
    const overstated = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: DEFAULT_MEGA_BOOST_MULTIPLIER,
      teammateCount: 4,
      matchingTeammateCount: 99,
      teammateDps: 26.5,
    });
    const allMatching = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: DEFAULT_MEGA_BOOST_MULTIPLIER,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
    });
    expect(overstated).toBe(allMatching);
  });

  it("using 1.1 instead of 1.3 produces materially less contribution (the invalidating-assumption case)", () => {
    const at13 = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: 1.3,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
    });
    const at11 = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: 1.1,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
    });
    expect(at11).toBeLessThan(at13);
  });

  it("without persistsThroughFaint, the boost window still caps at secondsSurvived even when fightDurationSeconds is longer (default/standard-mega behavior, unchanged)", () => {
    const withoutFlag = convertUptimeToTeamDamage({
      secondsSurvived: 10,
      boostMultiplier: 1.3,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
      fightDurationSeconds: 180,
    });
    const noFightDuration = convertUptimeToTeamDamage({
      secondsSurvived: 10,
      boostMultiplier: 1.3,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
    });
    expect(withoutFlag).toBe(noFightDuration);
  });

  it("with persistsThroughFaint true, the boost window extends to fightDurationSeconds instead of stopping at secondsSurvived (Primal Groudon/Kyogre, Mega Rayquaza)", () => {
    const persisting = convertUptimeToTeamDamage({
      secondsSurvived: 10,
      boostMultiplier: 1.3,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
      persistsThroughFaint: true,
      fightDurationSeconds: 180,
    });
    // 180 * 4 * 26.5 * 1.3 (the full fight, not just the 10s this candidate survived)
    expect(persisting).toBeCloseTo(180 * 4 * 26.5 * 1.3, 5);
  });

  it("persistsThroughFaint never shrinks the window below secondsSurvived even if fightDurationSeconds is somehow shorter", () => {
    const persisting = convertUptimeToTeamDamage({
      secondsSurvived: 50,
      boostMultiplier: 1.3,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
      persistsThroughFaint: true,
      fightDurationSeconds: 30, // implausible (survived longer than the fight), but shouldn't shrink the window
    });
    const notPersisting = convertUptimeToTeamDamage({
      secondsSurvived: 50,
      boostMultiplier: 1.3,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
    });
    expect(persisting).toBe(notPersisting);
  });
});

describe("findCrossoverPartySize", () => {
  it("finds the party size where a lower-DPS-but-tankier candidate overtakes", () => {
    const x = { id: "X", secondsSurvived: 13, boostMultiplier: 1.3, boostedType: "electric" as const, ownDamage: 190 };
    const y = { id: "Y", secondsSurvived: 10, boostMultiplier: 1.3, boostedType: "electric" as const, ownDamage: 221 };

    const crossover = findCrossoverPartySize(x, y, 2, { a: 1, b: 1 });
    expect(crossover.partySize).toBe(4);
    expect(crossover.leaderAtOrAbove).toBe("X");
    expect(crossover.leaderBelow).toBe("Y");
  });

  it("a persistsThroughFaint candidate can overtake an equally-tanky non-persisting candidate purely from the extended boost window", () => {
    // Same secondsSurvived and ownDamage on both sides, so with
    // persistsThroughFaint false on both this would never cross (identical
    // totals at every party size) — X wins at every size purely because its
    // boost keeps running for the rest of a much longer fight.
    const x = {
      id: "X",
      secondsSurvived: 10,
      boostMultiplier: 1.3,
      boostedType: "water" as const,
      ownDamage: 200,
      persistsThroughFaint: true,
    };
    const y = { id: "Y", secondsSurvived: 10, boostMultiplier: 1.3, boostedType: "water" as const, ownDamage: 200 };

    const withoutFightDuration = findCrossoverPartySize(x, y, 26.5, { a: 1, b: 1 });
    expect(withoutFightDuration.partySize).toBeNull(); // identical totals everywhere -> no flip, ties keep the initial null leader

    const fightDurationSeconds = 180;
    const withFightDuration = findCrossoverPartySize(x, y, 26.5, { a: 1, b: 1 }, undefined, fightDurationSeconds);
    // X should now lead at every swept party size (>= 1) since its boost
    // window is 180s instead of 10s — no crossover to find because X never
    // trails Y once the extended window applies from party size 1 onward.
    expect(withFightDuration.leaderAtOrAbove ?? withFightDuration.leaderBelow).toBe("X");
  });
});
