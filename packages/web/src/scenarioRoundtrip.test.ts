import { describe, expect, it } from "vitest";
import { buildScenarioUrl, buildTeamScenarioUrl, parseScenarioFromUrl, parseTeamScenarioFromUrl } from "@pogo-analyzer/engine";
import {
  assumptionsToScenario as comparatorAssumptionsToScenario,
  DEFAULT_ASSUMPTIONS as COMPARATOR_DEFAULTS,
  scenarioToAssumptions as comparatorScenarioToAssumptions,
  type ComparatorScenario,
} from "./ComparatorView.js";
import type { Assumptions } from "./AssumptionPanel.js";
import {
  assumptionsToTeamScenario,
  DEFAULT_TEAM_ASSUMPTIONS,
  teamScenarioToAssumptions,
  type TeamScenarioWithShadow,
} from "./TeamRaidView.js";
import type { TeamAssumptions } from "./TeamAssumptionPanel.js";
import {
  assumptionsToScenario as speciesReportAssumptionsToScenario,
  DEFAULT_ASSUMPTIONS as SPECIES_REPORT_DEFAULTS,
  scenarioToAssumptions as speciesReportScenarioToAssumptions,
  type SpeciesReportAssumptions,
} from "./SpeciesReportView.js";
import { buildSpeciesReportScenarioUrl, parseSpeciesReportScenarioFromUrl, type SpeciesReportScenario } from "./speciesReportScenario.js";
import {
  assumptionsToScenario as ivAssumptionsToScenario,
  DEFAULT_ASSUMPTIONS as IV_DEFAULTS,
  scenarioToAssumptions as ivScenarioToAssumptions,
  type IvBreakpointsAssumptions,
} from "./IvBreakpointsView.js";
import { buildIvBreakpointsScenarioUrl, parseIvBreakpointsScenarioFromUrl, type IvBreakpointsScenario } from "./ivBreakpointsScenario.js";
import {
  assumptionsToScenario as adbAssumptionsToScenario,
  DEFAULT_ASSUMPTIONS as ADB_DEFAULTS,
  scenarioToAssumptions as adbScenarioToAssumptions,
  type AttackDefenseBreakpointsAssumptions,
} from "./AttackDefenseBreakpointsView.js";
import {
  buildAttackDefenseBreakpointsScenarioUrl,
  parseAttackDefenseBreakpointsScenarioFromUrl,
  type AttackDefenseBreakpointsScenario,
} from "./attackDefenseBreakpointsScenario.js";
import {
  assumptionsToScenario as puAssumptionsToScenario,
  DEFAULT_ASSUMPTIONS as PU_DEFAULTS,
  scenarioToAssumptions as puScenarioToAssumptions,
} from "./PowerUpOptimizerView.js";
import type { PowerUpOptimizerAssumptions } from "./PowerUpOptimizerAssumptionPanel.js";
import { buildPowerUpOptimizerScenarioUrl, parsePowerUpOptimizerScenarioFromUrl, type PowerUpOptimizerScenario } from "./powerUpOptimizerScenario.js";

// This is the VALUE-level round-trip check scripts/check-scenario-roundtrip.mjs
// explicitly says it isn't (it only checks field NAMES appear in both
// directions): build a fully-populated, entirely non-default scenario, run it
// through encode -> URL -> parse -> decode, and assert deep equality with the
// original. Every tab also gets a "garbage/old link" case: a minimal scenario
// carrying only the fields that were never optional (i.e. predate this
// project's add-scenario-assumption discipline), confirming every OTHER field
// decodes to its documented default rather than surfacing `undefined` or
// throwing.

describe("ComparatorScenario round-trip", () => {
  const nonDefault: Assumptions = {
    candidateAId: "rayquaza",
    candidateBId: "kartana",
    targetId: "kyogre-primal",
    candidateAFastMoveId: "dragon-tail",
    candidateAChargedMoveId: "outrage",
    candidateBFastMoveId: "air-slash",
    candidateBChargedMoveId: "leaf-blade",
    bossFastMoveId: "waterfall",
    bossChargedMoveId: "origin-pulse",
    candidateMegaBoostDisabled: [true, false],
    candidateMegaLevel: ["super-max", "high"],
    candidateShadow: [false, true],
    level: 42.5,
    ivAttack: 10,
    ivDefense: 11,
    ivStamina: 12,
    dodge: { kind: "percentage-missed", missedFraction: 0.3 },
    dodgeFastAttacks: true,
    // Non-default: A overridden to Perfect dodge (plus an explicit "yes"
    // fast-attack-dodge override), B left null (uses the shared dodge/
    // dodgeFastAttacks above) — proves the per-candidate override AND the
    // "null means inherit" half both survive a round-trip, not just one.
    candidateDodge: [{ kind: "perfect" }, null],
    candidateDodgeFastAttacks: [true, null],
    holdChargedMoveUntilSafe: true,
    minFightLengthSeconds: 25,
    bossChargedMoveFrequencySeconds: 20,
    bossChargedMoveCadence: "energy-driven",
    partySize: 6,
    teammateDps: 33.3,
    matchingTeammateCount: 2,
    bossStartsPrimed: true,
    bossStartingEnergyFraction: 0.75,
    weather: "rainy",
    // Non-default: DEFAULT_ASSUMPTIONS's own value is `false` (the tidy
    // default for a fresh scenario) — see the dedicated absent-decode test
    // below for the OTHER, inverted-default direction this field needs.
    showDetailedAssumptions: true,
  };

  it("round-trips a fully populated non-default scenario through the URL transport", () => {
    const scenario = comparatorAssumptionsToScenario(nonDefault);
    const url = buildScenarioUrl("http://example.test/", scenario);
    const decoded = parseScenarioFromUrl(url) as ComparatorScenario | null;
    expect(decoded).not.toBeNull();
    const roundTripped = comparatorScenarioToAssumptions(decoded!);
    expect(roundTripped).toEqual(nonDefault);
  });

  it("round-trips the energy-gated-interval boss cadence value (a third cadence option, not just energy-driven)", () => {
    const withGatedCadence: Assumptions = { ...nonDefault, bossChargedMoveCadence: "energy-gated-interval" };
    const scenario = comparatorAssumptionsToScenario(withGatedCadence);
    const url = buildScenarioUrl("http://example.test/", scenario);
    const decoded = parseScenarioFromUrl(url) as ComparatorScenario | null;
    expect(decoded).not.toBeNull();
    const roundTripped = comparatorScenarioToAssumptions(decoded!);
    expect(roundTripped).toEqual(withGatedCadence);
  });

  it("decodes a minimal (old-link-shaped) scenario to documented defaults without throwing", () => {
    const minimal = {
      candidates: ["kartana", "rayquaza"],
      target: "latios-mega",
      level: 35,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodgeModel: { kind: "none" },
      partySize: 4,
      teammateDps: 26.5,
    } as unknown as ComparatorScenario;
    let result: Assumptions | undefined;
    expect(() => {
      result = comparatorScenarioToAssumptions(minimal);
    }).not.toThrow();
    expect(result).toEqual({
      ...COMPARATOR_DEFAULTS,
      candidateAId: "kartana",
      candidateBId: "rayquaza",
      targetId: "latios-mega",
      level: 35,
      ivAttack: 15,
      ivDefense: 15,
      ivStamina: 15,
      dodge: { kind: "none" },
      partySize: 4,
      teammateDps: 26.5,
      // A link this old predates the advanced/simple split existing at all —
      // every field it gates was simply always visible, so the sender's
      // stored bossChargedMoveFrequencySeconds (COMPARATOR_DEFAULTS's own
      // 15, since `minimal` above doesn't set it either) WAS the real number
      // in force. Decodes to `true`, not COMPARATOR_DEFAULTS's `false` — see
      // comparatorScenarioToAssumptions's own comment on this `??` guard.
      showDetailedAssumptions: true,
    });
  });

  it("decodes an absent showDetailedAssumptions to true, not DEFAULT_ASSUMPTIONS's false (an old link's stored bossChargedMoveFrequencySeconds must not silently swap for the derived value)", () => {
    const withoutDetailFlag = { ...comparatorAssumptionsToScenario(nonDefault) } as Partial<ComparatorScenario>;
    delete withoutDetailFlag.showDetailedAssumptions;
    const url = buildScenarioUrl("http://example.test/", withoutDetailFlag as ComparatorScenario);
    const decoded = parseScenarioFromUrl(url) as ComparatorScenario | null;
    expect(decoded).not.toBeNull();
    const roundTripped = comparatorScenarioToAssumptions(decoded!);
    expect(roundTripped.showDetailedAssumptions).toBe(true);
  });
});

describe("TeamScenario round-trip", () => {
  const nonDefault: TeamAssumptions = {
    slots: [
      { speciesId: "rayquaza", fastMoveId: "dragon-tail", chargedMoveId: "outrage", isMega: false, megaLevel: "max", isShadow: true },
      { speciesId: "kartana", fastMoveId: "air-slash", chargedMoveId: "leaf-blade", isMega: false, megaLevel: null, isShadow: false },
      { speciesId: "latios-mega", fastMoveId: null, chargedMoveId: null, isMega: true, megaLevel: "super-max", isShadow: false },
      { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null, isShadow: false },
      { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null, isShadow: false },
      { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null, isShadow: false },
    ],
    targetId: "kyogre-primal",
    bossFastMoveId: "waterfall",
    bossChargedMoveId: "origin-pulse",
    level: 47.5,
    ivAttack: 3,
    ivDefense: 4,
    ivStamina: 5,
    dodge: { kind: "percentage-missed", missedFraction: 0.6 },
    dodgeFastAttacks: true,
    holdChargedMoveUntilSafe: true,
    weather: "windy",
    bossChargedMoveFrequencySeconds: 22,
    bossChargedMoveCadence: "energy-driven",
    bossStartsPrimed: true,
    bossStartingEnergyFraction: 0.4,
    raidTimerSeconds: 180,
    swapCostSeconds: 3,
    reviveCostSeconds: 13,
    showDetailedAssumptions: true,
  };

  it("round-trips a fully populated non-default scenario through the URL transport", () => {
    const scenario = assumptionsToTeamScenario(nonDefault);
    const url = buildTeamScenarioUrl("http://example.test/", scenario);
    const decoded = parseTeamScenarioFromUrl(url) as TeamScenarioWithShadow | null;
    expect(decoded).not.toBeNull();
    const roundTripped = teamScenarioToAssumptions(decoded!);
    expect(roundTripped).toEqual(nonDefault);
  });

  it("round-trips the energy-gated-interval boss cadence value (a third cadence option, not just energy-driven)", () => {
    const withGatedCadence: TeamAssumptions = { ...nonDefault, bossChargedMoveCadence: "energy-gated-interval" };
    const scenario = assumptionsToTeamScenario(withGatedCadence);
    const url = buildTeamScenarioUrl("http://example.test/", scenario);
    const decoded = parseTeamScenarioFromUrl(url) as TeamScenarioWithShadow | null;
    expect(decoded).not.toBeNull();
    const roundTripped = teamScenarioToAssumptions(decoded!);
    expect(roundTripped).toEqual(withGatedCadence);
  });

  it("decodes a minimal (old-link-shaped) scenario to documented defaults without throwing", () => {
    const minimal = {
      slots: [],
      target: "tyranitar-mega",
      level: 40,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodgeModel: { kind: "none" },
    } as unknown as TeamScenarioWithShadow;
    let result: TeamAssumptions | undefined;
    expect(() => {
      result = teamScenarioToAssumptions(minimal);
    }).not.toThrow();
    expect(result).toEqual({
      ...DEFAULT_TEAM_ASSUMPTIONS,
      slots: DEFAULT_TEAM_ASSUMPTIONS.slots.map(() => ({
        speciesId: null,
        fastMoveId: null,
        chargedMoveId: null,
        isMega: false,
        megaLevel: null,
        isShadow: false,
      })),
      targetId: "tyranitar-mega",
      // A link this minimal has no boss-move fields at all — decodes to
      // `null` (teamScenarioToAssumptions's own `s.bossFastMoveId ?? null`),
      // NOT DEFAULT_TEAM_ASSUMPTIONS's own resolved boss moves (which exist
      // only because that default roster's own boss target happens to also
      // be "tyranitar-mega" — the decode fallback is unconditional, not
      // target-aware, so this must be asserted explicitly rather than
      // inherited from the `...DEFAULT_TEAM_ASSUMPTIONS` spread above).
      bossFastMoveId: null,
      bossChargedMoveId: null,
      level: 40,
      ivAttack: 15,
      ivDefense: 15,
      ivStamina: 15,
      dodge: { kind: "none" },
      // A link this old predates swapCostSeconds/reviveCostSeconds existing
      // at all — back when this tab really did assume 0 (fastest-possible
      // play), not today's 0.5s/15s placeholder defaults. See
      // teamScenarioToAssumptions's own comment on these two `??` guards.
      swapCostSeconds: 0,
      reviveCostSeconds: 0,
      // Same reasoning, inverted: an absent showDetailedAssumptions means
      // this link predates the simple/derived-frequency mode, so the
      // sender's stored bossChargedMoveFrequencySeconds was the real number
      // in force — decodes to `true`, not DEFAULT_TEAM_ASSUMPTIONS's `false`.
      showDetailedAssumptions: true,
    });
  });

  it("decodes an absent showDetailedAssumptions to true, not DEFAULT_TEAM_ASSUMPTIONS's false (an old link's stored bossChargedMoveFrequencySeconds must not silently swap for the derived value)", () => {
    const withoutDetailFlag = { ...assumptionsToTeamScenario(nonDefault) } as Partial<TeamScenarioWithShadow>;
    delete withoutDetailFlag.showDetailedAssumptions;
    const url = buildTeamScenarioUrl("http://example.test/", withoutDetailFlag as TeamScenarioWithShadow);
    const decoded = parseTeamScenarioFromUrl(url) as TeamScenarioWithShadow | null;
    expect(decoded).not.toBeNull();
    const roundTripped = teamScenarioToAssumptions(decoded!);
    expect(roundTripped.showDetailedAssumptions).toBe(true);
  });
});

describe("SpeciesReportScenario round-trip", () => {
  const nonDefault: SpeciesReportAssumptions = {
    speciesId: "rayquaza",
    fastMoveId: "dragon-tail",
    chargedMoveId: "outrage",
    level: 33.5,
    ivAttack: 1,
    ivDefense: 2,
    ivStamina: 3,
    megaLevel: "high",
    dodge: { kind: "perfect" },
    dodgeFastAttacks: true,
    weather: "snow",
    bossChargedMoveFrequencySeconds: 9,
    bossChargedMoveCadence: "energy-driven",
    sortMode: "typeMatchup",
    includedTiers: ["5-Star Raids", "Mega Raids"],
    includePastRaids: true,
  };

  it("round-trips a fully populated non-default scenario through the URL transport", () => {
    const scenario = speciesReportAssumptionsToScenario(nonDefault);
    const url = buildSpeciesReportScenarioUrl("http://example.test/", scenario);
    const decoded = parseSpeciesReportScenarioFromUrl(url);
    expect(decoded).not.toBeNull();
    const roundTripped = speciesReportScenarioToAssumptions(decoded!);
    expect(roundTripped).toEqual(nonDefault);
  });

  it("decodes a minimal (old-link-shaped) scenario to documented defaults without throwing", () => {
    const minimal = {
      speciesId: "kartana",
      level: 40,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodgeModel: { kind: "none" },
    } as unknown as SpeciesReportScenario;
    let result: SpeciesReportAssumptions | undefined;
    expect(() => {
      result = speciesReportScenarioToAssumptions(minimal);
    }).not.toThrow();
    expect(result).toEqual({
      ...SPECIES_REPORT_DEFAULTS,
      speciesId: "kartana",
      level: 40,
      ivAttack: 15,
      ivDefense: 15,
      ivStamina: 15,
      dodge: { kind: "none" },
    });
  });
});

describe("IvBreakpointsScenario round-trip", () => {
  const nonDefault: IvBreakpointsAssumptions = {
    speciesId: "rayquaza",
    fastMoveId: "dragon-tail",
    chargedMoveId: "outrage",
    ivA: { attack: 0, defense: 1, stamina: 2 },
    ivB: { attack: 15, defense: 14, stamina: 13 },
    targetId: "kyogre-primal",
    bossFastMoveId: "waterfall",
    dodge: { kind: "perfect" },
    weather: "cloudy",
    megaLevel: "max",
    isShadow: true,
  };

  it("round-trips a fully populated non-default scenario through the URL transport", () => {
    const scenario = ivAssumptionsToScenario(nonDefault);
    const url = buildIvBreakpointsScenarioUrl("http://example.test/", scenario);
    const decoded = parseIvBreakpointsScenarioFromUrl(url);
    expect(decoded).not.toBeNull();
    const roundTripped = ivScenarioToAssumptions(decoded!);
    expect(roundTripped).toEqual(nonDefault);
  });

  it("decodes a minimal (old-link-shaped) scenario to documented defaults without throwing", () => {
    const minimal = { speciesId: "delphox", targetId: "steelix-mega" } as unknown as IvBreakpointsScenario;
    let result: IvBreakpointsAssumptions | undefined;
    expect(() => {
      result = ivScenarioToAssumptions(minimal);
    }).not.toThrow();
    expect(result).toEqual({ ...IV_DEFAULTS, speciesId: "delphox", targetId: "steelix-mega" });
  });
});

describe("AttackDefenseBreakpointsScenario round-trip", () => {
  const nonDefault: AttackDefenseBreakpointsAssumptions = {
    speciesId: "rayquaza",
    fastMoveId: "dragon-tail",
    chargedMoveId: "outrage",
    targetId: "kyogre-primal",
    bossFastMoveId: "waterfall",
    bossChargedMoveId: "origin-pulse",
    weather: "fog",
    mode: "defense",
    megaLevel: "super-max",
    isShadow: true,
  };

  it("round-trips a fully populated non-default scenario through the URL transport", () => {
    const scenario = adbAssumptionsToScenario(nonDefault);
    const url = buildAttackDefenseBreakpointsScenarioUrl("http://example.test/", scenario);
    const decoded = parseAttackDefenseBreakpointsScenarioFromUrl(url);
    expect(decoded).not.toBeNull();
    const roundTripped = adbScenarioToAssumptions(decoded!);
    expect(roundTripped).toEqual(nonDefault);
  });

  it("decodes a minimal (old-link-shaped) scenario to documented defaults without throwing", () => {
    const minimal = { speciesId: "delphox", targetId: "steelix-mega" } as unknown as AttackDefenseBreakpointsScenario;
    let result: AttackDefenseBreakpointsAssumptions | undefined;
    expect(() => {
      result = adbScenarioToAssumptions(minimal);
    }).not.toThrow();
    expect(result).toEqual({ ...ADB_DEFAULTS, speciesId: "delphox", targetId: "steelix-mega" });
  });
});

describe("PowerUpOptimizerScenario round-trip", () => {
  const nonDefault: PowerUpOptimizerAssumptions = {
    mode: "multi-raid",
    slots: [
      {
        speciesId: "rayquaza",
        fastMoveId: "dragon-tail",
        chargedMoveId: "outrage",
        isMega: false,
        megaLevel: "high",
        isShadow: true,
        isPurified: false,
        isLucky: true,
        level: 27.5,
        ivAttack: 1,
        ivDefense: 2,
        ivStamina: 3,
        candyOnHand: 40,
        xlCandyOnHand: 5,
      },
      {
        speciesId: "latios-mega",
        fastMoveId: null,
        chargedMoveId: null,
        isMega: true,
        megaLevel: "super-max",
        isShadow: false,
        isPurified: false,
        isLucky: false,
        level: 30,
        ivAttack: 15,
        ivDefense: 15,
        ivStamina: 15,
        candyOnHand: 0,
        xlCandyOnHand: 0,
      },
      { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null, isShadow: false, isPurified: false, isLucky: false, level: 20, ivAttack: 15, ivDefense: 15, ivStamina: 15, candyOnHand: 0, xlCandyOnHand: 0 },
      { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null, isShadow: false, isPurified: false, isLucky: false, level: 20, ivAttack: 15, ivDefense: 15, ivStamina: 15, candyOnHand: 0, xlCandyOnHand: 0 },
      { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null, isShadow: false, isPurified: false, isLucky: false, level: 20, ivAttack: 15, ivDefense: 15, ivStamina: 15, candyOnHand: 0, xlCandyOnHand: 0 },
      { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null, isShadow: false, isPurified: false, isLucky: false, level: 20, ivAttack: 15, ivDefense: 15, ivStamina: 15, candyOnHand: 0, xlCandyOnHand: 0 },
    ],
    stardustOnHand: 12345,
    rareCandyOnHand: 25,
    rareCandyXlOnHand: 7,
    targetId: "kyogre-primal",
    bossFastMoveId: "waterfall",
    bossChargedMoveId: "origin-pulse",
    dodge: { kind: "perfect" },
    dodgeFastAttacks: true,
    holdChargedMoveUntilSafe: true,
    weather: "partly_cloudy",
    bossChargedMoveFrequencySeconds: 11,
    bossChargedMoveCadence: "energy-driven",
    bossStartsPrimed: true,
    bossStartingEnergyFraction: 0.9,
    raidTimerSeconds: 180,
    swapCostSeconds: 2,
    reviveCostSeconds: 14,
    rankBy: "candy",
    multiRaidBossIds: ["kyogre-primal", "tyranitar-mega", "rayquaza"],
    multiRaidIncludePastRaids: true,
    multiRaidIncludedTiers: ["Tier 5", "Mega"],
    multiRaidMaxBossCount: 12,
    candyByFamilyId: { FAMILY_HOUNDOUR: { candy: 40, xlCandy: 3 } },
    multiRaidMegaLevel: "high",
    // Non-default: PU_DEFAULTS is "aggregate-only".
    multiRaidSignificanceMode: "aggregate-or-per-boss",
  };

  it("round-trips a fully populated non-default scenario through the URL transport", () => {
    const scenario = puAssumptionsToScenario(nonDefault);
    const url = buildPowerUpOptimizerScenarioUrl("http://example.test/", scenario);
    const decoded = parsePowerUpOptimizerScenarioFromUrl(url);
    expect(decoded).not.toBeNull();
    const roundTripped = puScenarioToAssumptions(decoded!);
    expect(roundTripped).toEqual(nonDefault);
  });

  it("decodes a minimal (old-link-shaped) scenario to documented defaults without throwing", () => {
    const minimal = {
      slots: [],
      target: "tyranitar-mega",
      dodgeModel: { kind: "none" },
    } as unknown as PowerUpOptimizerScenario;
    let result: PowerUpOptimizerAssumptions | undefined;
    expect(() => {
      result = puScenarioToAssumptions(minimal);
    }).not.toThrow();
    expect(result).toEqual({
      ...PU_DEFAULTS,
      slots: PU_DEFAULTS.slots.map(() => ({
        speciesId: null,
        fastMoveId: null,
        chargedMoveId: null,
        isMega: false,
        megaLevel: null,
        isShadow: false,
        isPurified: false,
        isLucky: false,
        level: 20,
        ivAttack: 15,
        ivDefense: 15,
        ivStamina: 15,
        candyOnHand: 0,
        xlCandyOnHand: 0,
      })),
      targetId: "tyranitar-mega",
      dodge: { kind: "none" },
      // A link this old predates the significance-mode toggle existing at
      // all — every candidate that cleared a single boss's own noise floor
      // simply counted, so decode to "aggregate-or-per-boss", not
      // PU_DEFAULTS's own stricter "aggregate-only" — see
      // puScenarioToAssumptions's own comment on this `??` guard.
      multiRaidSignificanceMode: "aggregate-or-per-boss",
    });
  });

  it('decodes an absent multiRaidSignificanceMode to "aggregate-or-per-boss", not PU_DEFAULTS\'s "aggregate-only" (an old link\'s per-boss-significant candidates must not silently vanish from the table)', () => {
    const withoutModeFlag = { ...puAssumptionsToScenario(nonDefault) } as Partial<PowerUpOptimizerScenario>;
    delete withoutModeFlag.multiRaidSignificanceMode;
    const url = buildPowerUpOptimizerScenarioUrl("http://example.test/", withoutModeFlag as PowerUpOptimizerScenario);
    const decoded = parsePowerUpOptimizerScenarioFromUrl(url);
    expect(decoded).not.toBeNull();
    const roundTripped = puScenarioToAssumptions(decoded!);
    expect(roundTripped.multiRaidSignificanceMode).toBe("aggregate-or-per-boss");
  });
});
