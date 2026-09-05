import { describe, expect, it } from "vitest";
import { buildScenarioUrl, decodeScenario, encodeScenario, parseScenarioFromUrl, type Scenario } from "../src/scenario.js";

const sampleScenario: Scenario = {
  candidates: ["raichu-mega-x", "raichu-mega-y"],
  candidateFastMoveIds: [null, null],
  candidateChargedMoveIds: [null, null],
  target: "kyogre-primal",
  bossFastMoveId: null,
  bossChargedMoveId: null,
  level: 35,
  ivs: { attack: 15, defense: 15, stamina: 15 },
  dodgeModel: { kind: "none" },
  partySize: 4,
  teammateDps: 26.5,
  matchingTeammateCount: 4,
  bossChargedMoveFrequencySeconds: 15,
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0,
  dodgeFastAttacks: false,
  holdChargedMoveUntilSafe: false,
  minFightLengthSeconds: 0,
};

describe("scenario serialization", () => {
  it("round-trips through encode/decode", () => {
    expect(decodeScenario(encodeScenario(sampleScenario))).toEqual(sampleScenario);
  });

  it("produces a URL-safe string with no padding characters", () => {
    const encoded = encodeScenario(sampleScenario);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("round-trips through a full shareable URL", () => {
    const url = buildScenarioUrl("https://pogo-analyzer.example/compare", sampleScenario);
    expect(parseScenarioFromUrl(url)).toEqual(sampleScenario);
  });

  it("returns null when the URL carries no scenario", () => {
    expect(parseScenarioFromUrl("https://pogo-analyzer.example/compare")).toBeNull();
  });

  it("round-trips a non-default matchingTeammateCount rather than silently reverting to the full party", () => {
    // Regression guard: the boolean predecessor of this field was previously
    // missing from Scenario entirely, so a shared link always restored the
    // default no matter what the sharer had selected — silently changing
    // which candidate the chart favored.
    const partialMatch: Scenario = { ...sampleScenario, matchingTeammateCount: 1 };
    expect(decodeScenario(encodeScenario(partialMatch)).matchingTeammateCount).toBe(1);
    expect(parseScenarioFromUrl(buildScenarioUrl("https://pogo-analyzer.example/compare", partialMatch))!.matchingTeammateCount).toBe(1);
  });

  it("round-trips bossChargedMoveFrequencySeconds/bossStartsPrimed/bossStartingEnergyFraction rather than reverting to defaults", () => {
    const primed: Scenario = {
      ...sampleScenario,
      bossChargedMoveFrequencySeconds: 9,
      bossStartsPrimed: true,
      bossStartingEnergyFraction: 0.75,
    };
    const decoded = decodeScenario(encodeScenario(primed));
    expect(decoded.bossChargedMoveFrequencySeconds).toBe(9);
    expect(decoded.bossStartsPrimed).toBe(true);
    expect(decoded.bossStartingEnergyFraction).toBe(0.75);
  });

  it("round-trips dodgeFastAttacks/holdChargedMoveUntilSafe/minFightLengthSeconds rather than reverting to defaults", () => {
    const custom: Scenario = {
      ...sampleScenario,
      dodgeFastAttacks: true,
      holdChargedMoveUntilSafe: true,
      minFightLengthSeconds: 45,
    };
    const decoded = decodeScenario(encodeScenario(custom));
    expect(decoded.dodgeFastAttacks).toBe(true);
    expect(decoded.holdChargedMoveUntilSafe).toBe(true);
    expect(decoded.minFightLengthSeconds).toBe(45);
  });

  it("round-trips non-default candidate/boss move selections rather than reverting to each species' first move", () => {
    // Regression guard, same shape as the others above: a moveset choice is
    // exactly the kind of field that's silently reverted on a shared link if
    // it's ever missing from Scenario.
    const customMoves: Scenario = {
      ...sampleScenario,
      candidateFastMoveIds: ["thunder-shock", null],
      candidateChargedMoveIds: [null, "wild-charge"],
      bossFastMoveId: "waterfall",
      bossChargedMoveId: "hydro-pump",
    };
    const decoded = decodeScenario(encodeScenario(customMoves));
    expect(decoded.candidateFastMoveIds).toEqual(["thunder-shock", null]);
    expect(decoded.candidateChargedMoveIds).toEqual([null, "wild-charge"]);
    expect(decoded.bossFastMoveId).toBe("waterfall");
    expect(decoded.bossChargedMoveId).toBe("hydro-pump");
  });
});
