import { describe, expect, it } from "vitest";
import { compareAcrossBossChargedMoves, runSustainedComparison } from "../src/comparison.js";
import { calculateDamage } from "../src/damage.js";
import { chargedMoveAtMegaLevel } from "../src/megaLevel.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import { BOSS_GALE, BOSS_TIDE, CANDIDATE_ALPHA, CANDIDATE_BETA, LEVEL, PERFECT_IVS } from "./fixtures/hypotheticalDuo.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";

describe("runSustainedComparison", () => {
  it("returns a distribution (not a point estimate) per candidate once the boss starts using charged moves", () => {
    const [x, y] = runSustainedComparison({
      candidates: [CANDIDATE_ALPHA, CANDIDATE_BETA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
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

    // Boss Tide's Maelstrom is lethal on its own against these HP totals, so
    // adding it to the fight should shorten survival versus Scenario A's
    // fast-move-only opening burst (7.5s) at least some of the time.
    expect(x!.meanSecondsSurvived).toBeLessThanOrEqual(40);
    expect(y!.meanSecondsSurvived).toBeLessThanOrEqual(40);

    // representativeRun exposes one concrete, reproducible trajectory alongside the distribution.
    expect(x!.representativeRun.ownDamageTrajectory[0]).toEqual({ atSeconds: 0, cumulativeDamage: 0 });
    expect(x!.representativeRun.ownDamageTrajectory.length).toBeGreaterThan(0);
  });

  it("derives bossChargedMoveWarmupSeconds from the boss's own energy economy when omitted, instead of firing at t=0", () => {
    const [x] = runSustainedComparison({
      candidates: [CANDIDATE_ALPHA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 12,
      // bossChargedMoveWarmupSeconds intentionally omitted.
      iterations: 50,
    });
    // Without a physically-derived warmup, the boss could fire Maelstrom
    // (100 cost) almost immediately; with it (~25.0s minimum), X should
    // survive at least as long as the plain fast-move-only fight (7.5s),
    // since no run's boss charged move can land before ~25.0s.
    expect(x!.meanSecondsSurvived).toBeGreaterThanOrEqual(7.5);
  });

  it("no longer produces degenerate all-zero output for a too-small caller-supplied window (the fixed bug)", () => {
    // Previously, a small maxSeconds (e.g. from a UI field that shouldn't
    // have existed) meant the tick loop never ran at all, silently reporting
    // survivedFullWindow at 100% with every stat at 0 — indistinguishable
    // from a real result. This confirms the default (DEFAULT_STEPWISE_MAX_SECONDS)
    // is generous enough that omitting maxSeconds entirely never does this
    // for a normal matchup.
    const [x, y] = runSustainedComparison({
      candidates: [CANDIDATE_ALPHA, CANDIDATE_BETA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
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
    // Both Candidate Alpha (Arc Spark/Volt Slam, Electric) and Boss Tide
    // (Tidal Surge/Maelstrom, Water) have moves boosted by "rainy" — a real
    // "boosts both sides at once" case, not a synthetic one.
    const noWeather = runSustainedComparison({
      candidates: [CANDIDATE_ALPHA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 20,
      bossChargedMoveWarmupSeconds: 40,
      maxSeconds: 30,
      iterations: 50,
    });
    const rainy = runSustainedComparison({
      candidates: [CANDIDATE_ALPHA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
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
      candidates: [CANDIDATE_ALPHA, CANDIDATE_BETA],
      boss: BOSS_GALE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 12,
      maxSeconds: 40,
      iterations: 30,
    });

    // BOSS_GALE's fixture only has one charged move (Sky Crash) today, so
    // this sweep is a single-entry array — still exercises the plumbing
    // (id/name resolution, results shape) without depending on a second
    // charged move existing on this hypothetical fixture.
    expect(sweep.length).toBe(BOSS_GALE.chargedMoves.length);
    expect(sweep.length).toBeGreaterThan(0);
    for (const variant of sweep) {
      expect(variant.chargedMoveId).toBeTruthy();
      expect(variant.chargedMoveName).toBeTruthy();
      expect(variant.results.length).toBe(2);
      for (const result of variant.results) {
        expect(result.meanSecondsSurvived).toBeGreaterThan(0);
      }
    }
    expect(sweep[0]!.chargedMoveId).toBe(BOSS_GALE.chargedMoves[0]!.id);
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
      statsArePrecomputed: true,
    };

    const sweep = compareAcrossBossChargedMoves({
      candidates: [CANDIDATE_ALPHA],
      boss: multiMoveBoss,
      level: LEVEL,
      ivs: PERFECT_IVS,
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
      statsArePrecomputed: true,
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

describe("runSustainedComparison: candidateMegaLevel (Super Max effective-level CP bonus and '+'-move power scaling)", () => {
  // The boss deals exactly 1 damage per fast hit (a deliberately tiny attack
  // stat against this candidate's much larger defense — see calculateDamage's
  // own "+1" floor, which a raw value near 0 always rounds up to) — 1 damage
  // floors to 0 energy via energy.ts's ENERGY_PER_DAMAGE_TAKEN, so damage
  // taken contributes NOTHING to the candidate's own energy trajectory
  // regardless of a small defense-stat shift between megaLevel tiers. The
  // boss also has NO charged move at all, so `simulateStepwiseBattle` never
  // calls its seeded RNG — the whole run is 100% deterministic, letting
  // `iterations: 1` stand in for an exact, noise-free result. Net effect:
  // every tick's timing is bit-for-bit identical across every megaLevel
  // tier tested here (attack/defense/power changes affect DAMAGE MAGNITUDE
  // only, never cadence) — so a fast/charged hit count derived from one run
  // reliably predicts every other run's hit count too.
  const megaFastMove: FastMove = { id: "smc-fast", name: "SMC Fast", type: "normal", power: 15, energyGain: 20, durationSeconds: 1 };
  const megaPlusMove: ChargedMove = {
    id: "smc-plus-move",
    name: "SMC Plus Move",
    type: "normal",
    power: 100, // Base-tier, hypothetical for this test only
    energyCost: 20,
    durationSeconds: 2,
    vulnerableWindowSeconds: 2,
    isPlusMove: true,
    plusMovePowerConfidence: "community-estimate",
  };
  const megaAttacker: SpeciesDefinition = {
    id: "smc-mega-attacker",
    name: "SMC Mega Attacker",
    types: ["normal"],
    baseAttack: 250,
    baseDefense: 150,
    baseStamina: 10000, // never faints inside maxSeconds
    fastMoves: [megaFastMove],
    chargedMoves: [megaPlusMove],
    boost: { multiplier: 1.3, boostedType: "normal" },
  };
  const nonMegaAttacker: SpeciesDefinition = { ...megaAttacker, id: "smc-non-mega-attacker", name: "SMC Non-Mega Attacker", boost: undefined };
  const boss: SpeciesDefinition = {
    id: "smc-weak-boss",
    name: "SMC Weak Boss",
    types: ["normal"],
    baseAttack: 1,
    baseDefense: 200,
    baseStamina: 30000,
    fastMoves: [{ id: "smc-boss-fast", name: "SMC Boss Fast", type: "normal", power: 1, energyGain: 0, durationSeconds: 2 }],
    chargedMoves: [],
    statsArePrecomputed: true,
  };

  const level = 50;
  const ivs = { attack: 15, defense: 15, stamina: 15 };
  const common = {
    boss,
    level,
    ivs,
    dodge: { kind: "none" } as const,
    bossChargedMoveMeanIntervalSeconds: 1000, // no boss charged move exists at all — irrelevant, but required
    maxSeconds: 30,
    iterations: 1, // safe/exact — see this describe block's own doc comment (zero RNG calls)
  };

  function expectedPerFastHit(effectiveLevel: number): number {
    const stats = effectiveStatsAtLevel(megaAttacker, ivs, effectiveLevel);
    return calculateDamage({
      power: megaFastMove.power,
      attackerAttackStat: stats.attack,
      defenderDefenseStat: 200,
      stab: true,
      typeEffectiveness: 1,
      megaBoostMultiplier: 1.3,
    });
  }

  function expectedPerChargedHit(effectiveLevel: number, megaLevel: Parameters<typeof chargedMoveAtMegaLevel>[1]): number {
    const stats = effectiveStatsAtLevel(megaAttacker, ivs, effectiveLevel);
    const scaledMove = chargedMoveAtMegaLevel(megaPlusMove, megaLevel);
    return calculateDamage({
      power: scaledMove.power,
      attackerAttackStat: stats.attack,
      defenderDefenseStat: 200,
      stab: true,
      typeEffectiveness: 1,
      megaBoostMultiplier: 1.3,
    });
  }

  it("base/high/max all give +0 effective levels — meanFastMoveDamage is byte-identical across all three", () => {
    const [base] = runSustainedComparison({ ...common, candidates: [megaAttacker], candidateMegaLevel: [null, null] });
    const [high] = runSustainedComparison({ ...common, candidates: [megaAttacker], candidateMegaLevel: ["high", null] });
    const [max] = runSustainedComparison({ ...common, candidates: [megaAttacker], candidateMegaLevel: ["max", null] });

    expect(base!.meanFastMoveDamage).toBeGreaterThan(0);
    expect(base!.meanFastMoveDamage % expectedPerFastHit(50)).toBe(0); // sanity: an exact multiple of one hit's damage
    expect(high!.meanFastMoveDamage).toBe(base!.meanFastMoveDamage);
    expect(max!.meanFastMoveDamage).toBe(base!.meanFastMoveDamage);
  });

  it("super-max raises meanFastMoveDamage via the +2 effective-level CP bonus, by exactly the hit-count-scaled predicted amount", () => {
    const [base] = runSustainedComparison({ ...common, candidates: [megaAttacker], candidateMegaLevel: [null, null] });
    const [superMax] = runSustainedComparison({ ...common, candidates: [megaAttacker], candidateMegaLevel: ["super-max", null] });

    const fastHitCount = base!.meanFastMoveDamage / expectedPerFastHit(50);
    expect(Number.isInteger(fastHitCount)).toBe(true);
    expect(fastHitCount).toBeGreaterThan(0);
    expect(superMax!.meanFastMoveDamage).toBe(expectedPerFastHit(52) * fastHitCount);
    expect(superMax!.meanFastMoveDamage).toBeGreaterThan(base!.meanFastMoveDamage);
  });

  it("scales meanChargedDamage by tier via the '+' move's power (isolated from the level bonus at high/max)", () => {
    const [base] = runSustainedComparison({ ...common, candidates: [megaAttacker], candidateMegaLevel: [null, null] });
    const [high] = runSustainedComparison({ ...common, candidates: [megaAttacker], candidateMegaLevel: ["high", null] });
    const [max] = runSustainedComparison({ ...common, candidates: [megaAttacker], candidateMegaLevel: ["max", null] });
    const [superMax] = runSustainedComparison({ ...common, candidates: [megaAttacker], candidateMegaLevel: ["super-max", null] });

    const chargedHitCount = base!.meanChargedDamage / expectedPerChargedHit(50, "base");
    expect(Number.isInteger(chargedHitCount)).toBe(true);
    expect(chargedHitCount).toBeGreaterThan(0);
    expect(high!.meanChargedDamage).toBe(expectedPerChargedHit(50, "high") * chargedHitCount);
    expect(max!.meanChargedDamage).toBe(expectedPerChargedHit(50, "max") * chargedHitCount);
    expect(superMax!.meanChargedDamage).toBe(expectedPerChargedHit(52, "super-max") * chargedHitCount);

    expect(base!.meanChargedDamage).toBeLessThan(high!.meanChargedDamage);
    expect(high!.meanChargedDamage).toBeLessThan(max!.meanChargedDamage);
    expect(max!.meanChargedDamage).toBeLessThan(superMax!.meanChargedDamage);
  });

  it("has no effect at all on a candidate with no mega/primal boost mechanic, regardless of what's requested", () => {
    const [withoutMegaLevel] = runSustainedComparison({ ...common, candidates: [nonMegaAttacker] });
    const [withSuperMaxRequested] = runSustainedComparison({ ...common, candidates: [nonMegaAttacker], candidateMegaLevel: ["super-max", null] });
    expect(withSuperMaxRequested).toEqual(withoutMegaLevel);
  });
});

describe("runSustainedComparison: candidateDodge / candidateDodgeFastAttacks per-candidate override", () => {
  // CANDIDATE_ALPHA/BETA's pinned 150 effective HP dies to BOSS_TIDE's fast
  // move alone by 7.5s (see scenarioA.test.ts) — well before any charged-move
  // dodge behavior could matter, so a much bulkier variant is needed here to
  // actually observe a dodge-driven survival difference. Only baseStamina
  // differs from the pinned fixture.
  const bulkyAlpha = { ...CANDIDATE_ALPHA, id: "bulky-test-candidate-alpha", baseStamina: 1000 };

  const common = {
    candidates: [bulkyAlpha, CANDIDATE_BETA],
    boss: BOSS_TIDE,
    level: LEVEL,
    ivs: PERFECT_IVS,
    bossChargedMoveMeanIntervalSeconds: 10,
    bossChargedMoveWarmupSeconds: 3,
    maxSeconds: 60,
    iterations: 60,
  };

  it("omitting candidateDodge/candidateDodgeFastAttacks is byte-identical to today's shared-dodge behavior", () => {
    const withoutField = runSustainedComparison({ ...common, dodge: { kind: "none" } });
    const explicitlyNull = runSustainedComparison({
      ...common,
      dodge: { kind: "none" },
      candidateDodge: [null, null],
      candidateDodgeFastAttacks: [null, null],
    });

    expect(explicitlyNull).toEqual(withoutField);
  });

  it("a per-candidate dodge override changes only that candidate's result, leaving the other candidate byte-identical to the shared-dodge baseline", () => {
    const baseline = runSustainedComparison({ ...common, dodge: { kind: "none" } });
    const overridden = runSustainedComparison({
      ...common,
      dodge: { kind: "none" },
      candidateDodge: [{ kind: "perfect" }, null],
    });

    // Candidate B (index 1) used `null` -> falls back to the shared "none"
    // dodge, so its whole result is untouched by A's override — each
    // candidate is simulated independently, so this also guards against a
    // future refactor accidentally sharing state across candidates.
    expect(overridden[1]).toEqual(baseline[1]);

    // Candidate A (index 0) now perfectly dodges the boss's charged
    // attacks, so it should survive strictly longer than the shared-"none"
    // baseline.
    expect(overridden[0]!.meanSecondsSurvived).toBeGreaterThan(baseline[0]!.meanSecondsSurvived);
    expect(overridden[0]).not.toEqual(baseline[0]);
  });

  it("candidateDodgeFastAttacks overrides only that candidate's fast-attack dodging, preserving an explicit false rather than treating it as null", () => {
    const noFastDodge = runSustainedComparison({
      ...common,
      dodge: { kind: "none" },
      dodgeFastAttacks: true, // shared default: both candidates dodge fast attacks
      candidateDodgeFastAttacks: [false, null], // A explicitly opts out
    });
    const bothDodgeFast = runSustainedComparison({
      ...common,
      dodge: { kind: "none" },
      dodgeFastAttacks: true,
    });

    // B (null -> shared true) is unaffected by A's explicit override.
    expect(noFastDodge[1]).toEqual(bothDodgeFast[1]);
    // A (explicit false) differs from the shared-true baseline.
    expect(noFastDodge[0]).not.toEqual(bothDodgeFast[0]);
  });
});

describe("runSustainedComparison: bossMaxHp / bossMaxHpOverride", () => {
  const common = {
    candidates: [CANDIDATE_ALPHA],
    boss: BOSS_TIDE,
    level: LEVEL,
    ivs: PERFECT_IVS,
    dodge: { kind: "none" } as const,
    bossChargedMoveMeanIntervalSeconds: 12,
    maxSeconds: 40,
    iterations: 30,
  };

  it("surfaces bossMaxHp resolved exactly like bossEffectiveHp, with zero effect on the existing distribution numbers when omitted", () => {
    const withoutField = runSustainedComparison(common);
    const explicitlyUndefined = runSustainedComparison({ ...common, bossMaxHpOverride: undefined });

    // BOSS_TIDE is statsArePrecomputed, so its resolved HP is baseStamina.
    expect(withoutField[0]!.bossMaxHp).toBe(BOSS_TIDE.baseStamina);
    // Purely additive: every other field is untouched by this field's mere presence/absence.
    expect(explicitlyUndefined[0]!.meanTotalDamage).toBe(withoutField[0]!.meanTotalDamage);
    expect(explicitlyUndefined[0]!.meanSecondsSurvived).toBe(withoutField[0]!.meanSecondsSurvived);
    expect(explicitlyUndefined[0]!.bossMaxHp).toBe(withoutField[0]!.bossMaxHp);
  });

  it("bossMaxHpOverride is reflected exactly in bossMaxHp, without perturbing any other distribution number (the sim never consumes boss HP)", () => {
    const overridden = runSustainedComparison({ ...common, bossMaxHpOverride: 1800 });
    const baseline = runSustainedComparison(common);

    expect(overridden[0]!.bossMaxHp).toBe(1800);
    expect(overridden[0]!.bossMaxHp).not.toBe(baseline[0]!.bossMaxHp);
    // Same seeds/inputs otherwise -> identical simulated combat numbers,
    // since simulate.ts's stepwise engine has no boss-HP field at all.
    expect(overridden[0]!.meanTotalDamage).toBe(baseline[0]!.meanTotalDamage);
    expect(overridden[0]!.meanSecondsSurvived).toBe(baseline[0]!.meanSecondsSurvived);
  });

  it("rejects a non-positive/non-finite bossMaxHpOverride", () => {
    expect(() => runSustainedComparison({ ...common, bossMaxHpOverride: 0 })).toThrow();
    expect(() => runSustainedComparison({ ...common, bossMaxHpOverride: -5 })).toThrow();
    expect(() => runSustainedComparison({ ...common, bossMaxHpOverride: NaN })).toThrow();
  });
});
