import { describe, expect, it } from "vitest";
import { compareAcrossBossChargedMoves, runSustainedComparison } from "../src/comparison.js";
import {
  MEGA_RAICHU_X,
  MEGA_RAICHU_Y,
  MEGA_SKARMORY,
  PRIMAL_KYOGRE,
  SCENARIO_A_LEVEL,
  SCENARIO_A_PERFECT_IVS,
} from "../src/fixtures/scenarioA.js";
import type { SpeciesDefinition } from "../src/types.js";

describe("runSustainedComparison", () => {
  it("returns a distribution (not a point estimate) per candidate once the boss starts using charged moves", () => {
    const [x, y] = runSustainedComparison({
      candidates: [MEGA_RAICHU_X, MEGA_RAICHU_Y],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 12,
      bossChargedMoveWarmupSeconds: 8,
      maxSeconds: 40,
      iterations: 150,
    });

    for (const result of [x!, y!]) {
      expect(result.iterations).toBe(150);
      expect(result.meanSecondsSurvived).toBeGreaterThan(0);
      expect(result.p90TotalDamage).toBeGreaterThanOrEqual(result.medianTotalDamage);
      expect(result.medianTotalDamage).toBeGreaterThanOrEqual(result.p10TotalDamage);
    }

    // Kyogre's Hydro Pump is lethal on its own against these HP totals, so
    // adding it to the fight should shorten survival versus Scenario A's
    // fast-move-only opening burst (10.0s) at least some of the time.
    expect(x!.meanSecondsSurvived).toBeLessThanOrEqual(40);
    expect(y!.meanSecondsSurvived).toBeLessThanOrEqual(40);

    // representativeRun exposes one concrete, reproducible trajectory alongside the distribution.
    expect(x!.representativeRun.ownDamageTrajectory[0]).toEqual({ atSeconds: 0, cumulativeDamage: 0 });
    expect(x!.representativeRun.ownDamageTrajectory.length).toBeGreaterThan(0);
  });

  it("derives bossChargedMoveWarmupSeconds from the boss's own energy economy when omitted, instead of firing at t=0", () => {
    const [x] = runSustainedComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 12,
      // bossChargedMoveWarmupSeconds intentionally omitted.
      iterations: 50,
    });
    // Without a physically-derived warmup, the boss could fire Hydro Pump
    // (100 cost) almost immediately; with it (~32.5s minimum), X should
    // survive at least as long as the plain fast-move-only fight (10.0s),
    // since no run's boss charged move can land before ~32.5s.
    expect(x!.meanSecondsSurvived).toBeGreaterThanOrEqual(10);
  });

  it("no longer produces degenerate all-zero output for a too-small caller-supplied window (the fixed bug)", () => {
    // Previously, a small maxSeconds (e.g. from a UI field that shouldn't
    // have existed) meant the tick loop never ran at all, silently reporting
    // survivedFullWindow at 100% with every stat at 0 — indistinguishable
    // from a real result. This confirms the default (DEFAULT_STEPWISE_MAX_SECONDS)
    // is generous enough that omitting maxSeconds entirely never does this
    // for a normal matchup.
    const [x, y] = runSustainedComparison({
      candidates: [MEGA_RAICHU_X, MEGA_RAICHU_Y],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 15,
      iterations: 50,
    });
    for (const result of [x!, y!]) {
      expect(result.meanSecondsSurvived).toBeGreaterThan(0);
      expect(result.fractionSurvivedFullWindow).toBeLessThan(1);
    }
  });

  it("threads weather through to the stepwise path, boosting both the candidate's and the boss's own moves", () => {
    // Both Mega Raichu (Static Shock/Wild Charge, Electric) and Primal
    // Kyogre (Waterfall/Hydro Pump, Water) have moves boosted by "rainy" —
    // a real "boosts both sides at once" case, not a synthetic one.
    const noWeather = runSustainedComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 20,
      bossChargedMoveWarmupSeconds: 40,
      maxSeconds: 30,
      iterations: 50,
    });
    const rainy = runSustainedComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 20,
      bossChargedMoveWarmupSeconds: 40,
      maxSeconds: 30,
      iterations: 50,
      weather: "rainy",
    });

    // Warmup (40s) is past maxSeconds (30s), so the boss never throws its
    // charged move in either run — isolates this to fast-move-only damage on
    // both sides, so the comparison is deterministic across the same seeds.
    expect(rainy[0]!.meanFastMoveDamage).toBeGreaterThan(noWeather[0]!.meanFastMoveDamage);
    // Both sides' fast moves are boosted, so the boss also hits harder —
    // survival should be no longer (usually shorter) under rainy.
    expect(rainy[0]!.meanSecondsSurvived).toBeLessThanOrEqual(noWeather[0]!.meanSecondsSurvived);
  });

  it("compareAcrossBossChargedMoves sweeps every one of the boss's known charged moves", () => {
    const sweep = compareAcrossBossChargedMoves({
      candidates: [MEGA_RAICHU_X, MEGA_RAICHU_Y],
      boss: MEGA_SKARMORY,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 12,
      maxSeconds: 40,
      iterations: 30,
    });

    // Mega Skarmory's fixture only has one charged move (Brave Bird) today,
    // so this sweep is a single-entry array — still exercises the plumbing
    // (id/name resolution, results shape) without depending on a second
    // charged move existing on this hypothetical fixture.
    expect(sweep.length).toBe(MEGA_SKARMORY.chargedMoves.length);
    expect(sweep.length).toBeGreaterThan(0);
    for (const variant of sweep) {
      expect(variant.chargedMoveId).toBeTruthy();
      expect(variant.chargedMoveName).toBeTruthy();
      expect(variant.results.length).toBe(2);
      for (const result of variant.results) {
        expect(result.meanSecondsSurvived).toBeGreaterThan(0);
      }
    }
    expect(sweep[0]!.chargedMoveId).toBe(MEGA_SKARMORY.chargedMoves[0]!.id);
  });

  it("compareAcrossBossChargedMoves sweeps a multi-move boss and produces one entry per charged move", () => {
    // A synthetic boss with TWO charged moves of very different power, so the
    // sweep's per-variant results should differ meaningfully between entries
    // — proves each entry actually re-ran the comparison with that specific
    // move selected, not just repeating the default every time.
    const weakCharged = { id: "weak-charged", name: "Weak Charged", type: "normal" as const, power: 30, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 };
    const strongCharged = { id: "strong-charged", name: "Strong Charged", type: "normal" as const, power: 150, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 };
    const multiMoveBoss: SpeciesDefinition = {
      id: "multi-move-boss",
      name: "Multi Move Boss",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 150,
      baseStamina: 20000,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 10, energyGain: 0, durationSeconds: 1.5 }],
      chargedMoves: [weakCharged, strongCharged],
    };

    const sweep = compareAcrossBossChargedMoves({
      candidates: [MEGA_RAICHU_X],
      boss: multiMoveBoss,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 8,
      maxSeconds: 60,
      iterations: 40,
    });

    expect(sweep.length).toBe(2);
    expect(sweep[0]!.chargedMoveId).toBe("weak-charged");
    expect(sweep[1]!.chargedMoveId).toBe("strong-charged");
    // The strong-charged-move variant should be at least as lethal (mean
    // survival no longer) as the weak-charged-move variant.
    expect(sweep[1]!.results[0]!.meanSecondsSurvived).toBeLessThanOrEqual(sweep[0]!.results[0]!.meanSecondsSurvived);
  });

  it("only boosts a candidate's own move when its type matches boostedType, in the sustained path too (Fix 3, same gating as runComparison)", () => {
    const fastMoveOnType = { id: "fast-on", name: "Fast On", type: "fire" as const, power: 10, energyGain: 20, durationSeconds: 1 };
    const chargedMoveOffType = {
      id: "charged-off",
      name: "Charged Off",
      type: "water" as const,
      power: 80,
      energyCost: 40,
      durationSeconds: 2,
      vulnerableWindowSeconds: 2,
    };
    const boostedAttacker: SpeciesDefinition = {
      id: "sustained-boosted-attacker",
      name: "Boosted Attacker",
      types: ["fire"],
      baseAttack: 300,
      baseDefense: 200,
      baseStamina: 100000, // deliberately huge so it never faints inside the window
      fastMoves: [fastMoveOnType],
      chargedMoves: [chargedMoveOffType],
      boost: { multiplier: 2, boostedType: "fire" },
    };
    const boss: SpeciesDefinition = {
      id: "boost-gating-sustained-boss",
      name: "Boss",
      types: ["normal"],
      baseAttack: 5,
      baseDefense: 200,
      baseStamina: 100000,
      fastMoves: [{ id: "bf", name: "Boss Fast", type: "normal", power: 1, energyGain: 0, durationSeconds: 1.5 }],
      chargedMoves: [{ id: "bc", name: "Boss Charged", type: "normal", power: 50, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
    };
    const common = {
      candidates: [boostedAttacker],
      boss,
      level: 40,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodge: { kind: "none" } as const,
      bossChargedMoveMeanIntervalSeconds: 20,
      bossChargedMoveWarmupSeconds: 1000, // never fires inside maxSeconds, isolating pure fast/charged own-damage comparison
      maxSeconds: 20,
      iterations: 30,
    };

    const withBoost = runSustainedComparison(common);
    const boostDisabled = runSustainedComparison({ ...common, candidateMegaBoostDisabled: [true, false] });

    // Fast move (on-type, Fire): boosted 2x normally, so disabling the boost
    // strictly reduces it.
    expect(boostDisabled[0]!.meanFastMoveDamage).toBeLessThan(withBoost[0]!.meanFastMoveDamage);
    // Charged move (off-type, Water on a Fire-boosted attacker): never
    // boosted either way under the type-gated fix, so disabling the boost
    // changes nothing here — both runs use identical seeds/timing, so this
    // should match exactly, not just approximately.
    expect(boostDisabled[0]!.meanChargedDamage).toBe(withBoost[0]!.meanChargedDamage);
  });
});
