import { describe, expect, it } from "vitest";
import { buildScenarioUrl, decodeScenario, encodeScenario, parseScenarioFromUrl, type Scenario } from "../src/scenario.js";

const sampleScenario: Scenario = {
  candidates: ["raichu-mega-x", "raichu-mega-y"],
  target: "kyogre-primal",
  level: 35,
  ivs: { attack: 15, defense: 15, stamina: 15 },
  dodgeModel: { kind: "none" },
  partySize: 4,
  teammateDps: 26.5,
  teammateTypeMatches: true,
  phase: "opening-burst",
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

  it("round-trips a non-default teammateTypeMatches rather than silently reverting to true", () => {
    // Regression guard: this field was previously missing from Scenario
    // entirely, so a shared link always restored the default (true) no
    // matter what the sharer had selected — silently changing which
    // candidate the crossover chart favored.
    const offType: Scenario = { ...sampleScenario, teammateTypeMatches: false };
    expect(decodeScenario(encodeScenario(offType)).teammateTypeMatches).toBe(false);
    expect(parseScenarioFromUrl(buildScenarioUrl("https://pogo-analyzer.example/compare", offType))!.teammateTypeMatches).toBe(false);
  });
});
