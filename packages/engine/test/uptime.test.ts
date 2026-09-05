import { describe, expect, it } from "vitest";
import { convertUptimeToTeamDamage, findCrossoverPartySize, DEFAULT_MEGA_BOOST_MULTIPLIER, OFF_TYPE_MEGA_BOOST_MULTIPLIER } from "../src/uptime.js";

describe("convertUptimeToTeamDamage", () => {
  it("matches the spec's worked example, ATTRIBUTABLE portion only: ~3s extra uptime, 4 teammates at ~26.5 DPS, all matching type", () => {
    const damage = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: DEFAULT_MEGA_BOOST_MULTIPLIER,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
    });
    // 3 * 26.5 * 4 * (1.3 - 1) = 95.4 — the EXTRA damage the boost itself
    // contributes (marginal), not the teammates' full 413.4 total output
    // while boosted. A teammate doing 10 DPS boosted to 13 DPS should show
    // up here as 3, not 13.
    expect(damage).toBeCloseTo(95.4, 5);
  });

  it("returns 0 when boostMultiplier is undefined — no boost mechanic active at all (genuinely non-mega, or explicitly disabled)", () => {
    const damage = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: undefined,
      teammateCount: 4,
      matchingTeammateCount: 4,
      teammateDps: 26.5,
    });
    expect(damage).toBe(0);
  });

  it("gives every off-type teammate a nonzero attributable contribution (OFF_TYPE_MEGA_BOOST_MULTIPLIER - 1), not zero", () => {
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
    // This is the marginal (attributable) contribution, so it's
    // (OFF_TYPE_MEGA_BOOST_MULTIPLIER - 1), not the full multiplier.
    expect(damage).toBeCloseTo(3 * 26.5 * 4 * (OFF_TYPE_MEGA_BOOST_MULTIPLIER - 1), 5);
    expect(damage).toBeGreaterThan(0); // strictly more than "no boost at all" (which contributes exactly 0)
  });

  it("splits contribution proportionally for a mixed team (some matching, some not)", () => {
    const damage = convertUptimeToTeamDamage({
      secondsSurvived: 3,
      boostMultiplier: DEFAULT_MEGA_BOOST_MULTIPLIER,
      teammateCount: 4,
      matchingTeammateCount: 1,
      teammateDps: 26.5,
    });
    const expected =
      3 * (1 * 26.5 * (DEFAULT_MEGA_BOOST_MULTIPLIER - 1) + 3 * 26.5 * (OFF_TYPE_MEGA_BOOST_MULTIPLIER - 1));
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
    // 180 * 4 * 26.5 * (1.3 - 1) — the full fight's ATTRIBUTABLE contribution
    // (not the teammates' total output), using the full fight window rather
    // than just the 10s this candidate survived.
    expect(persisting).toBeCloseTo(180 * 4 * 26.5 * (1.3 - 1), 5);
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

    // Re-derived for the delta-only (attributable-contribution) formula: each
    // teammate now only contributes secondsSurvived * partySize * teammateDps
    // * (boostMultiplier - 1) instead of the old total-output formula, so the
    // crossover point (where X's longer uptime overtakes Y's raw-damage lead)
    // lands at a materially larger party size than before (was 4 under the
    // old, overstated formula) — totalX(p) = 190 + 13*p*2*0.3,
    // totalY(p) = 221 + 10*p*2*0.3, crossing between p=17 and p=18.
    const crossover = findCrossoverPartySize(x, y, 2, { a: 1, b: 1 });
    expect(crossover.partySize).toBe(18);
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
