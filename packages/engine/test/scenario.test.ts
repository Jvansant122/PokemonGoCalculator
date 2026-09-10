import { describe, expect, it } from "vitest";
import { buildScenarioUrl, decodeScenario, encodeScenario, parseScenarioFromUrl, toBase64Url, type Scenario } from "../src/scenario.js";

const sampleScenario: Scenario = {
  candidates: ["raichu-mega-x", "raichu-mega-y"],
  candidateFastMoveIds: [null, null],
  candidateChargedMoveIds: [null, null],
  candidateMegaBoostDisabled: [false, false],
  candidateMegaLevel: [null, null],
  target: "kyogre-primal",
  bossFastMoveId: null,
  bossChargedMoveId: null,
  level: 35,
  ivs: { attack: 15, defense: 15, stamina: 15 },
  dodgeModel: { kind: "none" },
  candidateDodge: [null, null],
  candidateDodgeFastAttacks: [null, null],
  partySize: 4,
  teammateDps: 26.5,
  matchingTeammateCount: 4,
  bossChargedMoveFrequencySeconds: 15,
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0,
  dodgeFastAttacks: false,
  holdChargedMoveUntilSafe: false,
  minFightLengthSeconds: 0,
  weather: "none",
  showDetailedAssumptions: true,
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

  it("round-trips a non-default weather condition rather than silently reverting to none", () => {
    // Regression guard, same shape as the others above.
    const rainy: Scenario = { ...sampleScenario, weather: "rainy" };
    expect(decodeScenario(encodeScenario(rainy)).weather).toBe("rainy");
    expect(parseScenarioFromUrl(buildScenarioUrl("https://pogo-analyzer.example/compare", rainy))!.weather).toBe("rainy");
  });

  it("round-trips a non-default candidateMegaBoostDisabled rather than silently reverting to both-enabled", () => {
    // Regression guard, same shape as the others above: a disabled-boost
    // toggle that reverts to "boost enabled" on a shared link would silently
    // misrepresent an intentionally fair (non-boosted) comparison as boosted.
    const oneDisabled: Scenario = { ...sampleScenario, candidateMegaBoostDisabled: [true, false] };
    expect(decodeScenario(encodeScenario(oneDisabled)).candidateMegaBoostDisabled).toEqual([true, false]);
    expect(
      parseScenarioFromUrl(buildScenarioUrl("https://pogo-analyzer.example/compare", oneDisabled))!.candidateMegaBoostDisabled,
    ).toEqual([true, false]);
  });

  it("round-trips a non-default per-candidate dodge override rather than silently reverting to the shared dodgeModel", () => {
    // Regression guard, same shape as the others above: a per-candidate
    // override that reverts to "use the shared dodgeModel" on a shared link
    // would silently misrepresent an intentionally asymmetric play-style
    // comparison (e.g. bulky-no-dodge vs glass-cannon-perfect-dodge) as
    // symmetric.
    const perCandidateOverride: Scenario = {
      ...sampleScenario,
      candidateDodge: [{ kind: "perfect" }, null],
      candidateDodgeFastAttacks: [true, null],
    };
    const decoded = decodeScenario(encodeScenario(perCandidateOverride));
    expect(decoded.candidateDodge).toEqual([{ kind: "perfect" }, null]);
    expect(decoded.candidateDodgeFastAttacks).toEqual([true, null]);
    expect(
      parseScenarioFromUrl(buildScenarioUrl("https://pogo-analyzer.example/compare", perCandidateOverride))!.candidateDodge,
    ).toEqual([{ kind: "perfect" }, null]);
  });

  it("round-trips a non-default candidateMegaLevel rather than silently reverting to no Mega Level assumed", () => {
    // Regression guard, same shape as the others above: a Mega Level
    // assumption that reverts to "no Mega Level" on a shared link would
    // silently understate a candidate's real investment (a scaled '+' move
    // and/or the Super Max effective-level CP bonus both disappearing).
    const withMegaLevel: Scenario = { ...sampleScenario, candidateMegaLevel: ["super-max", "high"] };
    const decoded = decodeScenario(encodeScenario(withMegaLevel));
    expect(decoded.candidateMegaLevel).toEqual(["super-max", "high"]);
    expect(
      parseScenarioFromUrl(buildScenarioUrl("https://pogo-analyzer.example/compare", withMegaLevel))!.candidateMegaLevel,
    ).toEqual(["super-max", "high"]);
  });

  it("decodes a scenario encoded before candidateMegaLevel existed without throwing", () => {
    // Same "older build never had this key" simulation as the
    // candidateDodge test below, for the same reason: decodeScenario does no
    // schema validation/defaulting of its own.
    const { candidateMegaLevel: _candidateMegaLevel, ...legacyShape } = sampleScenario;
    const legacyJson = JSON.stringify(legacyShape);
    const legacyEncoded = toBase64Url(new TextEncoder().encode(legacyJson));

    expect(() => decodeScenario(legacyEncoded)).not.toThrow();
    const decoded = decodeScenario(legacyEncoded);
    expect(decoded.candidateMegaLevel).toBeUndefined();
    expect(decoded.target).toBe(sampleScenario.target);
  });

  it("round-trips showDetailedAssumptions in both directions rather than collapsing to one value", () => {
    // Regression guard, same shape as the others above: this is a pure
    // boolean UI-visibility flag, but it still must survive a share link
    // faithfully in EITHER state — a sender who deliberately collapsed (or
    // deliberately expanded) the advanced panel before sharing must not have
    // that choice silently flipped for the recipient.
    const collapsed: Scenario = { ...sampleScenario, showDetailedAssumptions: false };
    const expanded: Scenario = { ...sampleScenario, showDetailedAssumptions: true };
    expect(decodeScenario(encodeScenario(collapsed)).showDetailedAssumptions).toBe(false);
    expect(decodeScenario(encodeScenario(expanded)).showDetailedAssumptions).toBe(true);
    expect(
      parseScenarioFromUrl(buildScenarioUrl("https://pogo-analyzer.example/compare", collapsed))!.showDetailedAssumptions,
    ).toBe(false);
    expect(
      parseScenarioFromUrl(buildScenarioUrl("https://pogo-analyzer.example/compare", expanded))!.showDetailedAssumptions,
    ).toBe(true);
  });

  it("decodes a scenario encoded before showDetailedAssumptions existed to undefined, not a runtime-enforced default", () => {
    // Same "older build never had this key" simulation as the
    // candidateMegaLevel/candidateDodge tests above. decodeScenario itself
    // does no schema validation/defaulting — it stays a bare JSON.parse cast
    // — so the field reads back `undefined` despite the interface typing it
    // as a required `boolean`. The recommended consumer fallback for that
    // `undefined` is `?? true` (NOT `?? false`), documented on the field's
    // own comment in scenario.ts and asserted here so the reasoning has a
    // pinned, executable check: an old link predates the advanced/simple
    // split entirely, so "show everything" is the only reading that
    // reproduces what that link actually showed and meant.
    const { showDetailedAssumptions: _showDetailedAssumptions, ...legacyShape } = sampleScenario;
    const legacyJson = JSON.stringify(legacyShape);
    const legacyEncoded = toBase64Url(new TextEncoder().encode(legacyJson));

    expect(() => decodeScenario(legacyEncoded)).not.toThrow();
    const decoded = decodeScenario(legacyEncoded);
    expect(decoded.showDetailedAssumptions).toBeUndefined();
    expect(decoded.showDetailedAssumptions ?? true).toBe(true);
    // Every other field the legacy payload did carry survives untouched.
    expect(decoded.target).toBe(sampleScenario.target);
  });

  it("decodes a scenario encoded before candidateDodge/candidateDodgeFastAttacks existed without throwing", () => {
    // Simulates a share link generated by an older build: the JSON simply
    // never had these keys. decodeScenario does no schema validation/
    // defaulting of its own (matching candidateMegaBoostDisabled's own
    // history) — callers downstream (packages/web) are responsible for
    // treating a missing/undefined value the same as [null, null], the same
    // pattern already used for candidateMegaBoostDisabled's `?? [false, false]`.
    const { candidateDodge: _candidateDodge, candidateDodgeFastAttacks: _candidateDodgeFastAttacks, ...legacyShape } =
      sampleScenario;
    const legacyJson = JSON.stringify(legacyShape);
    const legacyEncoded = toBase64Url(new TextEncoder().encode(legacyJson));

    expect(() => decodeScenario(legacyEncoded)).not.toThrow();
    const decoded = decodeScenario(legacyEncoded);
    expect(decoded.candidateDodge).toBeUndefined();
    expect(decoded.candidateDodgeFastAttacks).toBeUndefined();
    // Every other field the legacy payload did carry survives untouched.
    expect(decoded.target).toBe(sampleScenario.target);
  });
});
