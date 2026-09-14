import { describe, expect, it } from "vitest";
import { parseScenarioFromUrl, parseTeamScenarioFromUrl, toBase64Url } from "@pogo-analyzer/engine";
import {
  assumptionsToScenario as speciesReportAssumptionsToScenario,
  DEFAULT_ASSUMPTIONS as SPECIES_REPORT_DEFAULTS,
  scenarioToAssumptions as speciesReportScenarioToAssumptions,
} from "./SpeciesReportView.js";
import {
  decodeSpeciesReportScenarioWithDiagnostics,
  parseSpeciesReportScenarioFromUrl,
  type SpeciesReportScenario,
} from "./speciesReportScenario.js";
import { assumptionsToScenario as ivAssumptionsToScenario, DEFAULT_ASSUMPTIONS as IV_DEFAULTS } from "./IvBreakpointsView.js";
import { decodeIvBreakpointsScenarioWithDiagnostics, type IvBreakpointsScenario } from "./ivBreakpointsScenario.js";
import { assumptionsToScenario as adbAssumptionsToScenario, DEFAULT_ASSUMPTIONS as ADB_DEFAULTS } from "./AttackDefenseBreakpointsView.js";
import {
  decodeAttackDefenseBreakpointsScenarioWithDiagnostics,
  type AttackDefenseBreakpointsScenario,
} from "./attackDefenseBreakpointsScenario.js";
import {
  assumptionsToScenario as puAssumptionsToScenario,
  DEFAULT_ASSUMPTIONS as PU_DEFAULTS,
  decodePowerUpOptimizerScenarioWithDiagnostics,
  scenarioToAssumptions as puScenarioToAssumptions,
  type PowerUpOptimizerScenario,
} from "./powerUpOptimizerScenario.js";
import { assumptionsToScenario as rosterAssumptionsToScenario, DEFAULT_ASSUMPTIONS as ROSTER_DEFAULTS } from "./RosterView.js";
import { decodeRosterScenarioWithDiagnostics, parseRosterScenarioFromUrl, type RosterScenario } from "./rosterScenario.js";
import {
  DEFAULT_ASSUMPTIONS as COMPARATOR_DEFAULTS,
  scenarioToAssumptions as comparatorScenarioToAssumptions,
  type ComparatorScenario,
} from "./ComparatorView.js";
import {
  DEFAULT_TEAM_ASSUMPTIONS,
  teamScenarioToAssumptions,
  type TeamScenarioWithShadow,
} from "./TeamRaidView.js";

/**
 * Mirrors packages/engine's test/scenario.test.ts (`decodeScenarioWithDiagnostics`
 * describe block) for the five WEB-owned codecs `957999d`'s degrade-not-throw
 * treatment didn't originally reach — see this project's own
 * `webScenarioValidation.ts` doc comment for the full "WHY THIS EXISTS"
 * context. Each of the five gets the same handful of representative cases
 * scenario.test.ts already established rather than every permutation per
 * tab: invalid base64/non-JSON/non-object payloads all decode to `null`
 * without throwing, a present-but-wrong-typed field is dropped and reported
 * in `rejectedFields` while every other field on the same payload survives,
 * an unrecognized extra key rides through untouched, and a fully valid
 * scenario is completely unaffected (zero rejected fields).
 */

function encode(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

const speciesReportSample = speciesReportAssumptionsToScenario(SPECIES_REPORT_DEFAULTS);
const ivSample = ivAssumptionsToScenario(IV_DEFAULTS);
const adbSample = adbAssumptionsToScenario(ADB_DEFAULTS);
const puSample = puAssumptionsToScenario(PU_DEFAULTS);
const rosterSample = rosterAssumptionsToScenario(ROSTER_DEFAULTS);

describe("web-owned scenario codecs never throw on malformed input", () => {
  it.each([
    ["Species Report", () => decodeSpeciesReportScenarioWithDiagnostics("not valid base64!!!")],
    ["IV Breakpoints", () => decodeIvBreakpointsScenarioWithDiagnostics("not valid base64!!!")],
    ["Attack/Defense", () => decodeAttackDefenseBreakpointsScenarioWithDiagnostics("not valid base64!!!")],
    ["Power-Up Optimizer", () => decodePowerUpOptimizerScenarioWithDiagnostics("not valid base64!!!")],
    ["Roster", () => decodeRosterScenarioWithDiagnostics("not valid base64!!!")],
  ])("%s: invalid base64 decodes to null, never throws", (_label, decode) => {
    expect(decode).not.toThrow();
    expect(decode()).toBeNull();
  });

  it.each([
    ["Species Report", () => decodeSpeciesReportScenarioWithDiagnostics("AAAAAAAAAA")],
    ["IV Breakpoints", () => decodeIvBreakpointsScenarioWithDiagnostics("AAAAAAAAAA")],
    ["Attack/Defense", () => decodeAttackDefenseBreakpointsScenarioWithDiagnostics("AAAAAAAAAA")],
    ["Power-Up Optimizer", () => decodePowerUpOptimizerScenarioWithDiagnostics("AAAAAAAAAA")],
    ["Roster", () => decodeRosterScenarioWithDiagnostics("AAAAAAAAAA")],
  ])("%s: valid base64 that isn't valid JSON decodes to null, never throws", (_label, decode) => {
    expect(decode).not.toThrow();
    expect(decode()).toBeNull();
  });

  it.each([
    ["Species Report", () => decodeSpeciesReportScenarioWithDiagnostics(encode([1, 2, 3]))],
    ["IV Breakpoints", () => decodeIvBreakpointsScenarioWithDiagnostics(encode("just a string"))],
    ["Attack/Defense", () => decodeAttackDefenseBreakpointsScenarioWithDiagnostics(encode(null))],
    ["Power-Up Optimizer", () => decodePowerUpOptimizerScenarioWithDiagnostics(encode(42))],
    ["Roster", () => decodeRosterScenarioWithDiagnostics(encode(["nope"]))],
  ])("%s: valid JSON whose top level isn't an object decodes to null", (_label, decode) => {
    expect(decode()).toBeNull();
  });

  it("Species Report: a structurally-valid-but-wrong-shape payload decodes cleanly with every recognized field absent, not thrown", () => {
    const result = decodeSpeciesReportScenarioWithDiagnostics(encode({ foo: "bar" }));
    expect(result).not.toBeNull();
    expect(result!.scenario.speciesId).toBeUndefined();
    expect(result!.rejectedFields).toEqual([]);
  });

  it("Species Report: a wrong-typed field is dropped and reported, every other field on the same payload survives", () => {
    const raw = { ...speciesReportSample, level: "abc", includePastRaids: "yes" } as unknown as Record<string, unknown>;
    const result = decodeSpeciesReportScenarioWithDiagnostics(encode(raw))!;
    expect(result.scenario.level).toBeUndefined();
    expect(result.scenario.includePastRaids).toBeUndefined();
    expect(result.rejectedFields.sort()).toEqual(["includePastRaids", "level"]);
    expect(result.scenario.speciesId).toBe(speciesReportSample.speciesId);
    expect(result.scenario.dodgeModel).toEqual(speciesReportSample.dodgeModel);
  });

  it("Species Report: an unrecognized enum value is dropped, not passed through", () => {
    const raw = { ...speciesReportSample, sortMode: "alphabetical" } as unknown as Record<string, unknown>;
    const result = decodeSpeciesReportScenarioWithDiagnostics(encode(raw))!;
    expect(result.scenario.sortMode).toBeUndefined();
    expect(result.rejectedFields).toEqual(["sortMode"]);
  });

  it("Species Report: a fully valid scenario is completely unaffected (zero rejected fields)", () => {
    const result = decodeSpeciesReportScenarioWithDiagnostics(encode(speciesReportSample))!;
    expect(result.rejectedFields).toEqual([]);
    expect(result.scenario).toEqual(speciesReportSample);
  });

  it("Species Report: preserves an unrecognized extra key untouched", () => {
    const raw = { ...speciesReportSample, someFutureField: 123 };
    const result = decodeSpeciesReportScenarioWithDiagnostics(encode(raw))!;
    expect(result.rejectedFields).toEqual([]);
    expect((result.scenario as unknown as { someFutureField: number }).someFutureField).toBe(123);
  });

  it("Species Report: parseSpeciesReportScenarioFromUrl returns null for an unusable ?sr= the same way as a missing one", () => {
    expect(parseSpeciesReportScenarioFromUrl("https://pogo-analyzer.example/?view=species-report&sr=not%20valid")).toBeNull();
    expect(parseSpeciesReportScenarioFromUrl("https://pogo-analyzer.example/?view=species-report")).toBeNull();
  });

  it("IV Breakpoints: a wrong-typed nested ivA is dropped, ivB and every other field survive", () => {
    const raw = { ...ivSample, ivA: { attack: "fifteen", defense: 15, stamina: 15 } } as unknown as Record<string, unknown>;
    const result = decodeIvBreakpointsScenarioWithDiagnostics(encode(raw))!;
    expect(result.scenario.ivA).toBeUndefined();
    expect(result.rejectedFields).toEqual(["ivA"]);
    expect(result.scenario.ivB).toEqual(ivSample.ivB);
    expect(result.scenario.speciesId).toBe(ivSample.speciesId);
  });

  it("IV Breakpoints: a fully valid scenario is completely unaffected", () => {
    const result = decodeIvBreakpointsScenarioWithDiagnostics(encode(ivSample))!;
    expect(result.rejectedFields).toEqual([]);
    expect(result.scenario).toEqual(ivSample);
  });

  it("Attack/Defense: an invalid mode is dropped, not passed through as a wrong string", () => {
    const raw = { ...adbSample, mode: "sideways" } as unknown as Record<string, unknown>;
    const result = decodeAttackDefenseBreakpointsScenarioWithDiagnostics(encode(raw))!;
    expect(result.scenario.mode).toBeUndefined();
    expect(result.rejectedFields).toEqual(["mode"]);
  });

  it("Attack/Defense: a fully valid scenario is completely unaffected", () => {
    const result = decodeAttackDefenseBreakpointsScenarioWithDiagnostics(encode(adbSample))!;
    expect(result.rejectedFields).toEqual([]);
    expect(result.scenario).toEqual(adbSample);
  });

  it("Power-Up Optimizer: a fully valid scenario is completely unaffected", () => {
    const result = decodePowerUpOptimizerScenarioWithDiagnostics(encode(puSample))!;
    expect(result.rejectedFields).toEqual([]);
    expect(result.scenario).toEqual(puSample);
  });

  it("Power-Up Optimizer: a bad field inside ONE slot only costs that slot's field, the other five slots and every top-level field survive", () => {
    const raw = structuredClone(puSample) as unknown as PowerUpOptimizerScenario;
    (raw.slots[2] as unknown as Record<string, unknown>).level = "not a number";
    const result = decodePowerUpOptimizerScenarioWithDiagnostics(encode(raw))!;
    expect(result.scenario.slots[2]!.level).toBeUndefined();
    expect(result.rejectedFields).toEqual(["slots[2].level"]);
    // Every other slot, and every other field on slot 2 itself, is untouched.
    expect(result.scenario.slots[0]).toEqual(puSample.slots[0]);
    expect(result.scenario.slots[2]!.speciesId).toBe(puSample.slots[2]!.speciesId);
    expect(result.scenario.target).toBe(puSample.target);
  });

  it("Power-Up Optimizer: a non-array slots field rejects the whole field rather than throwing on downstream .map", () => {
    const raw = { ...puSample, slots: "not an array" } as unknown as Record<string, unknown>;
    const result = decodePowerUpOptimizerScenarioWithDiagnostics(encode(raw))!;
    expect(result.scenario.slots).toBeUndefined();
    expect(result.rejectedFields).toEqual(["slots"]);
  });

  it("Power-Up Optimizer: a malformed candyByFamilyId map is dropped as a whole, not partially trusted", () => {
    const raw = {
      ...puSample,
      candyByFamilyId: { pikachu: { candy: "lots", xlCandy: 3 } },
    } as unknown as Record<string, unknown>;
    const result = decodePowerUpOptimizerScenarioWithDiagnostics(encode(raw))!;
    expect(result.scenario.candyByFamilyId).toBeUndefined();
    expect(result.rejectedFields).toEqual(["candyByFamilyId"]);
  });

  it("Power-Up Optimizer: a bad entry inside multiRaidHypotheticalCatches costs only that entry", () => {
    const raw: PowerUpOptimizerScenario = {
      ...puSample,
      multiRaidHypotheticalCatches: [
        { speciesId: "mewtwo", level: 25 },
        { speciesId: "dialga", level: 99 as unknown as 20 | 25 },
      ],
    };
    const result = decodePowerUpOptimizerScenarioWithDiagnostics(encode(raw))!;
    expect(result.scenario.multiRaidHypotheticalCatches?.[0]).toEqual({ speciesId: "mewtwo", level: 25 });
    expect(result.scenario.multiRaidHypotheticalCatches?.[1]!.level).toBeUndefined();
    expect(result.rejectedFields).toEqual(["multiRaidHypotheticalCatches[1].level"]);
  });

  it("Roster: a fully valid scenario is completely unaffected", () => {
    const result = decodeRosterScenarioWithDiagnostics(encode(rosterSample))!;
    expect(result.rejectedFields).toEqual([]);
    expect(result.scenario).toEqual(rosterSample);
  });

  it("Roster: an invalid sortBy is dropped rather than surfacing a bogus value into the <select>", () => {
    const raw = { ...rosterSample, sortBy: "alphabetical" } as unknown as Record<string, unknown>;
    const result = decodeRosterScenarioWithDiagnostics(encode(raw))!;
    expect(result.scenario.sortBy).toBeUndefined();
    expect(result.rejectedFields).toEqual(["sortBy"]);
  });

  it("Roster: parseRosterScenarioFromUrl returns null for an unusable ?rt= the same way as a missing one", () => {
    expect(parseRosterScenarioFromUrl("https://pogo-analyzer.example/?view=roster&rt=not%20valid")).toBeNull();
    expect(parseRosterScenarioFromUrl("https://pogo-analyzer.example/?view=roster")).toBeNull();
  });

  /**
   * A "valid JSON, decodes to SOME object, but none of this tab's expected
   * top-level keys are present" share link — a corrupted/truncated paste
   * that still parses as an object. The engine's/web's own
   * decode*WithDiagnostics degrades this correctly already (every recognized
   * field just comes back `undefined`, `rejectedFields` stays empty since
   * nothing was PRESENT-but-wrong-typed to reject) — the bug this covers was
   * one step downstream, in each view's own scenarioToAssumptions merge,
   * where a handful of fields were dereferenced without the `?.`/`??` guard
   * every sibling field in the same function already had (`s.candidates[0]`,
   * `s.ivs.attack`, `s.slots.map(...)`, `s.dodgeModel`). Real repro links:
   * see the four `?view=...&PARAM=eyJmb28iOiJiYXIiLCJuZXN0ZWQiOnsiYSI6MX19`
   * URLs this exact payload encodes to.
   */
  const malformedPayload = { foo: "bar", nested: { a: 1 } };

  it("Comparator: a structurally-valid-but-wrong-shape payload degrades to defaults instead of throwing", () => {
    const url = `https://pogo-analyzer.example/?view=comparator&s=${encode(malformedPayload)}`;
    const decoded = parseScenarioFromUrl(url) as ComparatorScenario | null;
    expect(decoded).not.toBeNull();
    expect(() => comparatorScenarioToAssumptions(decoded!)).not.toThrow();
    const assumptions = comparatorScenarioToAssumptions(decoded!);
    expect(assumptions.candidateAId).toBe(COMPARATOR_DEFAULTS.candidateAId);
    expect(assumptions.candidateBId).toBe(COMPARATOR_DEFAULTS.candidateBId);
    expect(assumptions.targetId).toBe(COMPARATOR_DEFAULTS.targetId);
    // `level` is required on the engine's own `Scenario` — an absent value
    // here previously reached `cpmForLevel` downstream as literal `undefined`
    // and threw "No CPM entry for level undefined" (caught, so not a crash,
    // but an unusable "Could not compute this scenario" result rather than a
    // real one — live-confirmed via this exact test's own payload shape).
    expect(assumptions.level).toBe(COMPARATOR_DEFAULTS.level);
    expect(assumptions.partySize).toBe(COMPARATOR_DEFAULTS.partySize);
    expect(assumptions.teammateDps).toBe(COMPARATOR_DEFAULTS.teammateDps);
    expect(assumptions.matchingTeammateCount).toBe(COMPARATOR_DEFAULTS.matchingTeammateCount);
    expect(assumptions.ivAttack).toBe(COMPARATOR_DEFAULTS.ivAttack);
    expect(assumptions.ivDefense).toBe(COMPARATOR_DEFAULTS.ivDefense);
    expect(assumptions.ivStamina).toBe(COMPARATOR_DEFAULTS.ivStamina);
    expect(assumptions.dodge).toEqual(COMPARATOR_DEFAULTS.dodge);
  });

  it("Team Raid: a structurally-valid-but-wrong-shape payload degrades to defaults instead of throwing", () => {
    const url = `https://pogo-analyzer.example/?view=team-raid&ts=${encode(malformedPayload)}`;
    const decoded = parseTeamScenarioFromUrl(url) as TeamScenarioWithShadow | null;
    expect(decoded).not.toBeNull();
    expect(() => teamScenarioToAssumptions(decoded!)).not.toThrow();
    const assumptions = teamScenarioToAssumptions(decoded!);
    expect(assumptions.slots).toHaveLength(DEFAULT_TEAM_ASSUMPTIONS.slots.length);
    expect(assumptions.slots.every((s) => s.speciesId === null)).toBe(true);
    expect(assumptions.level).toBe(DEFAULT_TEAM_ASSUMPTIONS.level);
    expect(assumptions.ivAttack).toBe(DEFAULT_TEAM_ASSUMPTIONS.ivAttack);
    expect(assumptions.ivDefense).toBe(DEFAULT_TEAM_ASSUMPTIONS.ivDefense);
    expect(assumptions.ivStamina).toBe(DEFAULT_TEAM_ASSUMPTIONS.ivStamina);
    expect(assumptions.dodge).toEqual(DEFAULT_TEAM_ASSUMPTIONS.dodge);
  });

  it("Species Report: a structurally-valid-but-wrong-shape payload degrades to defaults instead of throwing", () => {
    const url = `https://pogo-analyzer.example/?view=species-report&sr=${encode(malformedPayload)}`;
    const decoded = parseSpeciesReportScenarioFromUrl(url);
    expect(decoded).not.toBeNull();
    expect(() => speciesReportScenarioToAssumptions(decoded!)).not.toThrow();
    const assumptions = speciesReportScenarioToAssumptions(decoded!);
    expect(assumptions.level).toBe(SPECIES_REPORT_DEFAULTS.level);
    expect(assumptions.ivAttack).toBe(SPECIES_REPORT_DEFAULTS.ivAttack);
    expect(assumptions.ivDefense).toBe(SPECIES_REPORT_DEFAULTS.ivDefense);
    expect(assumptions.ivStamina).toBe(SPECIES_REPORT_DEFAULTS.ivStamina);
    expect(assumptions.dodge).toEqual(SPECIES_REPORT_DEFAULTS.dodge);
  });

  it("Power-Up Optimizer: a structurally-valid-but-wrong-shape payload degrades to defaults instead of throwing", () => {
    const result = decodePowerUpOptimizerScenarioWithDiagnostics(encode(malformedPayload));
    expect(result).not.toBeNull();
    expect(() => puScenarioToAssumptions(result!.scenario)).not.toThrow();
    const assumptions = puScenarioToAssumptions(result!.scenario);
    expect(assumptions.targetId).toBe(PU_DEFAULTS.targetId);
    expect(assumptions.dodge).toEqual(PU_DEFAULTS.dodge);
    expect(assumptions.slots).toHaveLength(PU_DEFAULTS.slots.length);
  });
});

// Referenced only for type-level assurance that the sample builders above
// still match each scenario's own interface — keeps this file failing to
// COMPILE (not just failing at runtime) if a codec's shape ever drifts from
// its own Assumptions/Scenario pairing.
void ((): SpeciesReportScenario => speciesReportSample)();
void ((): IvBreakpointsScenario => ivSample)();
void ((): AttackDefenseBreakpointsScenario => adbSample)();
void ((): RosterScenario => rosterSample)();
