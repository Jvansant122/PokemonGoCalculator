import { describe, expect, it } from "vitest";
import { powerUpCostTableFromGameMaster, type PowerUpCostTable } from "../src/powerUp.js";
import {
  evolutionEndpoints,
  gatedEvolutionNotices,
  planRosterBudget,
  runRosterPlanner,
  type HypotheticalCatchCandidate,
  type RosterBudgetInputs,
  type RosterEntry,
  type RosterPlannerInputs,
  type RosterPlannerProgressEvent,
} from "../src/rosterPlanner.js";
import type { IVSpread } from "../src/types.js";
import { NO_MODIFIERS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, RAW_POKEMON_UPGRADE_SETTINGS } from "./fixtures/powerUpCosts.js";
import {
  BOSS_ONE,
  BOSS_TWO,
  BRANCH_FORM_A_SPECIES,
  BRANCH_FORM_B_SPECIES,
  BRANCH_SPECIES,
  CHAIN_FINAL_SPECIES,
  CHAIN_MID_SPECIES,
  CHAIN_PRE_SPECIES,
  EVOLVED_FORM_SPECIES,
  GATED_EVOLVED_FORM_SPECIES,
  GATED_ONLY_SPECIES,
  HYPOTHETICAL_CATCH_SPECIES,
  MIXED_EVOLUTIONS_SPECIES,
  STRONG_SPECIES,
  UNEVOLVED_SPECIES,
  UNEVOLVED_WITH_EVOLUTIONS_SPECIES,
} from "./fixtures/rosterPlannerFixtures.js";

/**
 * Covers three IDEAS.md items landed together (Lane A, 2026-09-10):
 *  - #9 "evolve, then power up to L" as ONE priced candidate
 *    (runRosterPlanner) / an informational recommendation (planRosterBudget)
 *  - #3 "add a 7th" hypothetical-catch comparisons (runRosterPlanner only)
 *  - #13 a real onProgress hook (both entry points)
 *
 * Reuses the SAME test-only fixtures as rosterPlanner.test.ts/rosterBudget.test.ts.
 */

const TABLE: PowerUpCostTable = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
const IVS: IVSpread = { attack: 15, defense: 15, stamina: 15 };

function entry(id: string, species: RosterEntry["species"], level: number, overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    entryId: id,
    species,
    fastMoveId: null,
    chargedMoveId: null,
    level,
    ivs: IVS,
    costModifiers: NO_MODIFIERS,
    canMega: false,
    ivsAreApproximate: false,
    levelIsApproximate: false,
    movesetIsDefaulted: false,
    candyFamilyId: `FAMILY_${id.toUpperCase()}`,
    ...overrides,
  };
}

function baseInputs(overrides: Partial<RosterPlannerInputs> = {}): Omit<RosterPlannerInputs, "pool" | "targets"> {
  return {
    costTable: TABLE,
    stardustOnHand: 1_000_000,
    candyByFamilyId: {},
    dodge: { kind: "none" },
    bossChargedMoveMeanIntervalSeconds: 3,
    raidTimerSeconds: 300,
    screenIterations: 4,
    iterations: 5,
    swapCostSeconds: 0,
    ...overrides,
  };
}

function budgetBaseInputs(overrides: Partial<RosterBudgetInputs> = {}): Omit<RosterBudgetInputs, "pool" | "targets"> {
  return {
    costTable: TABLE,
    stardustOnHand: 1_000_000,
    candyByFamilyId: {},
    dodge: { kind: "none" },
    bossChargedMoveMeanIntervalSeconds: 3,
    raidTimerSeconds: 300,
    screenIterations: 4,
    iterations: 5,
    ...overrides,
  };
}

function strongTeam(level = 20): RosterEntry[] {
  return STRONG_SPECIES.map((sp, i) => entry(`strong-${i}`, sp, level));
}

function generousCandyFor(pool: RosterEntry[]): Record<string, { candy: number; xlCandy: number }> {
  const out: Record<string, { candy: number; xlCandy: number }> = {};
  for (const e of pool) out[e.candyFamilyId!] = { candy: 1_000_000, xlCandy: 1_000_000 };
  return out;
}

describe("evolutionEndpoints — the recursive chain/branch walker (IDEAS.md #9)", () => {
  it("returns [] for an already-fully-evolved species (nothing to walk)", () => {
    expect(evolutionEndpoints(STRONG_SPECIES[0]!)).toEqual([]);
  });

  it("returns [] when isFullyEvolved is false but no `evolutions` data is present (the real-world default today)", () => {
    expect(evolutionEndpoints(UNEVOLVED_SPECIES)).toEqual([]);
  });

  it("resolves a single direct branch with its own candy cost", () => {
    const endpoints = evolutionEndpoints(UNEVOLVED_WITH_EVOLUTIONS_SPECIES);
    expect(endpoints).toEqual([{ to: EVOLVED_FORM_SPECIES, candyCost: 50 }]);
  });

  it("walks a multi-stage chain to its FINAL form, summing candy across every hop", () => {
    const endpoints = evolutionEndpoints(CHAIN_PRE_SPECIES);
    // 12 (PRE->MID) + 25 (MID->FINAL) = 37 — never stops at the still-unevolved MID stage.
    expect(endpoints).toEqual([{ to: CHAIN_FINAL_SPECIES, candyCost: 37 }]);
    expect(CHAIN_MID_SPECIES.isFullyEvolved).toBe(false);
  });

  it("resolves every branch of a branching evolution (Eevee-shaped) independently", () => {
    const endpoints = evolutionEndpoints(BRANCH_SPECIES);
    expect(endpoints).toHaveLength(2);
    expect(endpoints).toEqual(
      expect.arrayContaining([
        { to: BRANCH_FORM_A_SPECIES, candyCost: 25 },
        { to: BRANCH_FORM_B_SPECIES, candyCost: 25 },
      ]),
    );
  });
});

describe("gatedEvolutionNotices — a gated branch is described, never dropped (schema follow-up, 2026-09-10)", () => {
  it("returns [] for a species with no gatedEvolutions data", () => {
    expect(gatedEvolutionNotices(UNEVOLVED_WITH_EVOLUTIONS_SPECIES)).toEqual([]);
  });

  it("describes an item-gated branch with no candy component named separately", () => {
    const notices = gatedEvolutionNotices(GATED_ONLY_SPECIES);
    expect(notices).toEqual([
      { toSpeciesId: GATED_EVOLVED_FORM_SPECIES.id, toSpeciesName: GATED_EVOLVED_FORM_SPECIES.name, requirementSummary: "needs Metal Coat, 50 candy" },
    ]);
  });

  it("describes a buddy/time-of-day/quest-gated branch (Espeon-shaped) with every known requirement", () => {
    const notices = gatedEvolutionNotices(MIXED_EVOLUTIONS_SPECIES);
    expect(notices).toEqual([
      {
        toSpeciesId: GATED_EVOLVED_FORM_SPECIES.id,
        toSpeciesName: GATED_EVOLVED_FORM_SPECIES.name,
        requirementSummary: "needs to be your buddy for 10km, daytime only, a field/special research quest",
      },
    ]);
  });
});

describe("runRosterPlanner — a gated branch is never silently dropped (schema follow-up, 2026-09-10)", () => {
  it("a species with ONLY a gated branch (evolutionEndpoints: []) names the gate in neverCompetitive instead of a generic message", () => {
    const result = runRosterPlanner({
      ...baseInputs(),
      pool: [...strongTeam(), entry("gated-only", GATED_ONLY_SPECIES, 20)],
      targets: [{ species: BOSS_ONE }],
    });
    expect(evolutionEndpoints(GATED_ONLY_SPECIES)).toEqual([]);
    const row = result.neverCompetitive.find((n) => n.entryId === "gated-only");
    expect(row).toBeDefined();
    expect(row!.reason).toMatch(/Metal Coat/);
    expect(row!.gatedEvolutions).toEqual([
      { toSpeciesId: GATED_EVOLVED_FORM_SPECIES.id, toSpeciesName: GATED_EVOLVED_FORM_SPECIES.name, requirementSummary: "needs Metal Coat, 50 candy" },
    ]);
  });

  it("a species with a priceable AND a gated branch (Eevee-shaped) still names the gated one on the priced candidate", () => {
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 5, iterations: 5, maxCandidates: 500 }),
      pool: [...strongTeam(25), entry("mixed", MIXED_EVOLUTIONS_SPECIES, 1)],
      targets: [{ species: BOSS_ONE }],
    });

    // Never excluded outright — the candy-only branch (to EVOLVED_FORM_SPECIES) is real and priced.
    expect(result.neverCompetitive.some((n) => n.entryId === "mixed")).toBe(false);
    const evolveCandidates = result.candidates.filter((c) => c.viaEvolution?.fromEntryId === "mixed");
    expect(evolveCandidates.length).toBeGreaterThan(0);
    for (const c of evolveCandidates) {
      expect(c.speciesId).toBe(EVOLVED_FORM_SPECIES.id); // the PRICED side is the candy-only endpoint
      expect(c.viaEvolution!.otherGatedOptions).toEqual([
        { toSpeciesId: GATED_EVOLVED_FORM_SPECIES.id, toSpeciesName: GATED_EVOLVED_FORM_SPECIES.name, requirementSummary: expect.stringContaining("buddy") },
      ]);
    }
  });
});

describe("planRosterBudget — a gated branch is named in excludedEntries too (schema follow-up, 2026-09-10)", () => {
  it("names the gate for a species with ONLY a gated branch", () => {
    const pool = [...strongTeam(25), entry("gated-only", GATED_ONLY_SPECIES, 20)];
    const plan = planRosterBudget({
      ...budgetBaseInputs({ candyByFamilyId: generousCandyFor(pool) }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });
    const row = plan.excludedEntries.find((e) => e.entryId === "gated-only");
    expect(row).toBeDefined();
    expect(row!.reason).toMatch(/Metal Coat/);
    expect(row!.gatedEvolutions).toEqual([
      { toSpeciesId: GATED_EVOLVED_FORM_SPECIES.id, toSpeciesName: GATED_EVOLVED_FORM_SPECIES.name, requirementSummary: "needs Metal Coat, 50 candy" },
    ]);
    // Never committed — this planner never spends against a gated OR a candy-only evolution.
    expect(plan.steps.some((s) => s.entryId === "gated-only")).toBe(false);
  });
});

describe("runRosterPlanner — evolve, then power up to L (IDEAS.md #9)", () => {
  it("UNEVOLVED_SPECIES (no evolutions data) still falls back to the plain 'evolve first' advisory, unchanged", () => {
    const result = runRosterPlanner({
      ...baseInputs(),
      pool: [...strongTeam(), entry("unevolved", UNEVOLVED_SPECIES, 20)],
      targets: [{ species: BOSS_ONE }],
    });
    expect(result.candidates.some((c) => c.entryId === "unevolved")).toBe(false);
    const row = result.neverCompetitive.find((n) => n.entryId === "unevolved");
    expect(row).toBeDefined();
    expect(row!.reason).toMatch(/evolve first/i);
    expect(row!.evolutionRecommendation).toBeUndefined();
  });

  it("an unevolved entry WITH real evolutions data gets a real priced 'evolve, then power up' candidate that provably overtakes a full baseline team", () => {
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 5, iterations: 5, maxCandidates: 500 }),
      pool: [...strongTeam(25), entry("evolver", UNEVOLVED_WITH_EVOLUTIONS_SPECIES, 1)],
      targets: [{ species: BOSS_ONE }],
    });

    // Never excluded outright — real candidates exist.
    expect(result.neverCompetitive.some((n) => n.entryId === "evolver")).toBe(false);

    const evolveCandidates = result.candidates.filter((c) => c.viaEvolution?.fromEntryId === "evolver");
    expect(evolveCandidates.length).toBeGreaterThan(0);

    for (const c of evolveCandidates) {
      // The row's own id/species describe the EVOLVED side.
      expect(c.speciesId).toBe(EVOLVED_FORM_SPECIES.id);
      expect(c.entryId).not.toBe("evolver"); // synthetic id — see viaEvolution's own doc comment
      expect(c.viaEvolution).toEqual({
        fromEntryId: "evolver",
        fromSpeciesId: UNEVOLVED_WITH_EVOLUTIONS_SPECIES.id,
        fromSpeciesName: UNEVOLVED_WITH_EVOLUTIONS_SPECIES.name,
        evolutionCandyCost: 50,
      });
      // The evolution candy cost is folded straight into cost.candy.
      expect(c.cost.candy).toBeGreaterThanOrEqual(50);
    }

    const entering = evolveCandidates.filter((c) => c.bossesNewlyFielded.length > 0);
    expect(entering.length).toBeGreaterThan(0);
    const best = entering.reduce((a, b) => (b.meanDeltaTeamDps > a.meanDeltaTeamDps ? b : a));
    expect(best.meanDeltaTeamDps).toBeGreaterThan(0);
    expect(best.bossesNewlyFielded).toEqual(["test-roster-boss-one"]);
  });

  it("evolve-then-power-up rows never collide with the base entry's OWN (still-unevolved) fielded row", () => {
    // The unevolved entry is strong enough on its OWN to make the team —
    // regression guard for the synthetic-entryId collision bug found while
    // building this feature (see viaEvolution's doc comment).
    const strongUnevolved: RosterEntry = entry("evolver", UNEVOLVED_WITH_EVOLUTIONS_SPECIES, 40, {
      species: { ...UNEVOLVED_WITH_EVOLUTIONS_SPECIES, baseAttack: 260, baseDefense: 150, baseStamina: 200 },
    });
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 5, iterations: 5, maxCandidates: 500 }),
      pool: [...strongTeam(20), strongUnevolved],
      targets: [{ species: BOSS_ONE }],
    });

    // The unevolved species is genuinely fielded, in its OWN unevolved form.
    expect(result.baselinePerBoss[0]!.team).toContain("evolver");

    const evolveCandidates = result.candidates.filter((c) => c.viaEvolution?.fromEntryId === "evolver");
    for (const c of evolveCandidates) {
      // Every evolve candidate's own species is the EVOLVED form, never the
      // still-unevolved baseline species leaking through from a collided id.
      expect(c.speciesId).toBe(EVOLVED_FORM_SPECIES.id);
    }
  });
});

describe("planRosterBudget — evolutionRecommendation is informational only (IDEAS.md #9)", () => {
  it("never commits a step for an evolution-blocked entry, but surfaces a REAL simulated recommendation when data is available", () => {
    const pool = [...strongTeam(25), entry("evolver", UNEVOLVED_WITH_EVOLUTIONS_SPECIES, 1)];
    const plan = planRosterBudget({
      ...budgetBaseInputs({ candyByFamilyId: generousCandyFor(pool), stardustOnHand: 2_000_000, screenIterations: 5, iterations: 8 }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });

    // Never committed, never in finalLevels — eligiblePool never included it.
    expect(plan.steps.some((s) => s.entryId === "evolver")).toBe(false);
    expect(plan.finalLevels.some((f) => f.entryId === "evolver")).toBe(false);

    const row = plan.excludedEntries.find((e) => e.entryId === "evolver");
    expect(row).toBeDefined();
    expect(row!.evolutionRecommendation).toBeDefined();
    expect(row!.evolutionRecommendation!.toSpeciesId).toBe(EVOLVED_FORM_SPECIES.id);
    expect(row!.evolutionRecommendation!.evolutionCandyCost).toBe(50);
    expect(typeof row!.evolutionRecommendation!.meanDeltaTeamDps).toBe("number");
    expect(row!.evolutionRecommendation!.meanDeltaTeamDps).toBeGreaterThan(0);
  });

  it("UNEVOLVED_SPECIES (no evolutions data) reports no recommendation, exactly as before", () => {
    const pool = [...strongTeam(25), entry("unevolved", UNEVOLVED_SPECIES, 20)];
    const plan = planRosterBudget({
      ...budgetBaseInputs({ candyByFamilyId: generousCandyFor(pool) }),
      pool,
      targets: [{ species: BOSS_ONE }],
    });
    const row = plan.excludedEntries.find((e) => e.entryId === "unevolved");
    expect(row).toBeDefined();
    expect(row!.evolutionRecommendation).toBeUndefined();
  });
});

describe("runRosterPlanner — hypothetical catches, 'add a 7th' (IDEAS.md #3)", () => {
  it("a strong fresh catch provably enters a full baseline team, reported ONLY in hypotheticalCatches", () => {
    const pool = strongTeam(20);
    const catches: HypotheticalCatchCandidate[] = [
      { id: "hypothetical:strong", species: HYPOTHETICAL_CATCH_SPECIES, level: 25, ivs: IVS, fastMoveId: null, chargedMoveId: null },
    ];
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 5, iterations: 5 }),
      pool,
      targets: [{ species: BOSS_ONE }],
      hypotheticalCatches: catches,
    });

    expect(result.hypotheticalCatches).toHaveLength(1);
    const row = result.hypotheticalCatches[0]!;
    expect(row.id).toBe("hypothetical:strong");
    expect(row.speciesId).toBe(HYPOTHETICAL_CATCH_SPECIES.id);
    expect(row.level).toBe(25);
    expect(row.bossesNewlyFielded).toEqual(["test-roster-boss-one"]);
    expect(row.meanDeltaTeamDps).toBeGreaterThan(0);
    for (const p of row.perBoss) expect(p.rankBefore).toBeNull();

    // Never leaks into any of the priced/owned-entry outputs.
    expect(result.candidates.some((c) => c.entryId === "hypothetical:strong")).toBe(false);
    expect(result.benchedButPromising.some((c) => c.entryId === "hypothetical:strong")).toBe(false);
    expect(result.neverCompetitive.some((c) => c.entryId === "hypothetical:strong")).toBe(false);
  });

  it("a hopelessly weak fresh catch gets a real, unsimulated 0 — never touches the team", () => {
    const pool = strongTeam(50);
    const catches: HypotheticalCatchCandidate[] = [
      {
        id: "hypothetical:weak",
        species: { ...HYPOTHETICAL_CATCH_SPECIES, id: "test-hypothetical-weak", baseAttack: 10, baseDefense: 10, baseStamina: 10 },
        level: 1,
        ivs: { attack: 0, defense: 0, stamina: 0 },
        fastMoveId: null,
        chargedMoveId: null,
      },
    ];
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 5, iterations: 5 }),
      pool,
      targets: [{ species: BOSS_ONE }],
      hypotheticalCatches: catches,
    });
    const row = result.hypotheticalCatches[0]!;
    expect(row.meanDeltaTeamDps).toBe(0);
    expect(row.bossesNewlyFielded).toEqual([]);
    expect(row.perBoss[0]!.simulated).toBe(false);
  });

  it("throws when a hypothetical catch id collides with a real RosterEntry.entryId", () => {
    const pool = [entry("dupe-id", STRONG_SPECIES[0]!, 20)];
    expect(() =>
      runRosterPlanner({
        ...baseInputs(),
        pool,
        targets: [{ species: BOSS_ONE }],
        hypotheticalCatches: [{ id: "dupe-id", species: HYPOTHETICAL_CATCH_SPECIES, level: 20, ivs: IVS, fastMoveId: null, chargedMoveId: null }],
      }),
    ).toThrow(/collides/i);
  });

  it("defaults to an empty array when omitted", () => {
    const result = runRosterPlanner({ ...baseInputs(), pool: strongTeam(), targets: [{ species: BOSS_ONE }] });
    expect(result.hypotheticalCatches).toEqual([]);
  });
});

describe("onProgress — genuine, real per-boss/per-candidate progress (IDEAS.md #13)", () => {
  it("runRosterPlanner reports one 'baseline' event per target and 'candidates' events reaching its own real total", () => {
    const events: RosterPlannerProgressEvent[] = [];
    const result = runRosterPlanner({
      ...baseInputs({ screenIterations: 5, iterations: 5, maxCandidates: 500, onProgress: (e) => events.push(e) }),
      pool: [...strongTeam(25), entry("weak-bench", UNEVOLVED_WITH_EVOLUTIONS_SPECIES, 1)],
      targets: [{ species: BOSS_ONE }, { species: BOSS_TWO }],
    });

    const baselineEvents = events.filter((e) => e.stage === "baseline");
    expect(baselineEvents).toHaveLength(2);
    expect(baselineEvents.map((e) => e.completed)).toEqual([1, 2]);
    expect(baselineEvents.every((e) => e.total === 2)).toBe(true);
    expect(baselineEvents.map((e) => e.bossId)).toEqual(["test-roster-boss-one", "test-roster-boss-two"]);

    const candidateEvents = events.filter((e) => e.stage === "candidates");
    expect(candidateEvents.length).toBeGreaterThan(0);
    // Every event reports the SAME real total (candidatesToSimulate.length),
    // and completed strictly increases to exactly that total on the last one.
    const total = candidateEvents[0]!.total;
    expect(candidateEvents.every((e) => e.total === total)).toBe(true);
    expect(candidateEvents.at(-1)!.completed).toBe(total);
    // Real completed work, not a fabricated fraction — bounded by however
    // many rows actually got simulated (candidates + benchedButPromising, at
    // most, since the two sets can overlap).
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(result.candidates.length + result.benchedButPromising.length);

    // hypotheticalCatches stage never fires when the input is empty/omitted.
    expect(events.some((e) => e.stage === "hypotheticalCatches")).toBe(false);
  });

  it("runRosterPlanner reports one 'hypotheticalCatches' event per comparison when supplied", () => {
    const events: RosterPlannerProgressEvent[] = [];
    runRosterPlanner({
      ...baseInputs({ onProgress: (e) => events.push(e) }),
      pool: strongTeam(20),
      targets: [{ species: BOSS_ONE }],
      hypotheticalCatches: [
        { id: "hc-1", species: HYPOTHETICAL_CATCH_SPECIES, level: 25, ivs: IVS, fastMoveId: null, chargedMoveId: null },
        { id: "hc-2", species: HYPOTHETICAL_CATCH_SPECIES, level: 20, ivs: IVS, fastMoveId: null, chargedMoveId: null },
      ],
    });
    const hcEvents = events.filter((e) => e.stage === "hypotheticalCatches");
    expect(hcEvents.map((e) => e.completed)).toEqual([1, 2]);
    expect(hcEvents.every((e) => e.total === 2)).toBe(true);
  });

  it("planRosterBudget reports one 'baseline' event per target and 'rounds' events for every COMMITTED step only", () => {
    const events: RosterPlannerProgressEvent[] = [];
    const pool = [...strongTeam(25), entry("weak-bench", UNEVOLVED_WITH_EVOLUTIONS_SPECIES, 1)];
    const plan = planRosterBudget({
      ...budgetBaseInputs({
        candyByFamilyId: generousCandyFor(pool),
        stardustOnHand: 2_000_000,
        screenIterations: 5,
        iterations: 8,
        onProgress: (e) => events.push(e),
      }),
      pool,
      targets: [{ species: BOSS_ONE }, { species: BOSS_TWO }],
    });

    const baselineEvents = events.filter((e) => e.stage === "baseline");
    expect(baselineEvents).toHaveLength(2);
    expect(baselineEvents.map((e) => e.bossId)).toEqual(["test-roster-boss-one", "test-roster-boss-two"]);

    expect(plan.steps.length).toBeGreaterThan(0);
    const roundEvents = events.filter((e) => e.stage === "rounds");
    // One "rounds" event per COMMITTED step — never one per round attempted
    // (a round that finds nothing significant doesn't fabricate an event).
    expect(roundEvents).toHaveLength(plan.steps.length);
    expect(roundEvents.every((e) => e.total === 200)).toBe(true); // maxRounds default
    // completed is the round index — strictly increasing, bounded by maxRounds.
    for (let i = 1; i < roundEvents.length; i++) expect(roundEvents[i]!.completed).toBeGreaterThan(roundEvents[i - 1]!.completed);
  });
});
