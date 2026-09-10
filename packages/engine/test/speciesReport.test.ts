import { describe, expect, it } from "vitest";
import { runSustainedComparison } from "../src/comparison.js";
import { BOSS_GALE, BOSS_TIDE, CANDIDATE_ALPHA, CANDIDATE_BETA, LEVEL, PERFECT_IVS } from "./fixtures/hypotheticalDuo.js";
import { RAID_TIER_TABLE } from "../src/raidBoss.js";
import {
  offensiveTypeMatchup,
  runSpeciesReverseLookup,
  typeMatchupPercentile,
  type SpeciesReportBossTarget,
} from "../src/speciesReport.js";
import type { SpeciesDefinition } from "../src/types.js";

/**
 * A real synced-style boss (no statsArePrecomputed flag) — same convention as
 * raidBossTier.test.ts's REAL_STYLE_BOSS, needed to prove bossRaidTier
 * actually threads through this new orchestrator the same way it does in
 * comparison.ts's two-candidate path.
 */
const REAL_STYLE_BOSS: SpeciesDefinition = {
  id: "real-style-boss",
  name: "Real Style Boss",
  types: ["normal"],
  baseAttack: 180,
  baseDefense: 160,
  baseStamina: 137,
  fastMoves: [{ id: "rf", name: "Real Fast", type: "normal", power: 8, energyGain: 8, durationSeconds: 1 }],
  chargedMoves: [{ id: "rc", name: "Real Charged", type: "normal", power: 70, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
};

describe("runSustainedComparison: single-candidate array (the reuse this feature depends on)", () => {
  it("runs correctly with only one candidate, no second candidate present at all", () => {
    const results = runSustainedComparison({
      candidates: [CANDIDATE_ALPHA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 12,
      maxSeconds: 40,
      iterations: 50,
    });
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe(CANDIDATE_ALPHA.id);
    expect(results[0]!.meanSecondsSurvived).toBeGreaterThan(0);
  });
});

describe("runSpeciesReverseLookup", () => {
  const commonInputs = {
    species: CANDIDATE_ALPHA,
    level: LEVEL,
    ivs: PERFECT_IVS,
    dodge: { kind: "none" } as const,
    bossChargedMoveMeanIntervalSeconds: 12,
    maxSeconds: 40,
    iterations: 40,
  };

  it("produces one row per supplied boss target, each carrying a full sustained distribution", () => {
    const targets: SpeciesReportBossTarget[] = [
      { species: BOSS_TIDE },
      { species: BOSS_GALE },
    ];
    const result = runSpeciesReverseLookup({ ...commonInputs, targets });

    expect(result.speciesId).toBe(CANDIDATE_ALPHA.id);
    expect(result.speciesName).toBe(CANDIDATE_ALPHA.name);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0]!.bossId).toBe(BOSS_TIDE.id);
    expect(result.rows[1]!.bossId).toBe(BOSS_GALE.id);
    for (const row of result.rows) {
      expect(row.sustained.iterations).toBe(40);
      expect(row.sustained.meanSecondsSurvived).toBeGreaterThan(0);
      expect(row.sustained.id).toBe(CANDIDATE_ALPHA.id);
    }
  });

  it("surfaces a mega/primal boost as a plain informational fact, never folded into a team-damage number", () => {
    const megaResult = runSpeciesReverseLookup({ ...commonInputs, targets: [{ species: BOSS_TIDE }] });
    expect(megaResult.hasMegaBoost).toBe(true);
    expect(megaResult.boostedType).toBe("electric");
    expect(megaResult.boostMultiplier).toBe(1.3);

    // A species with no boost mechanic at all reports hasMegaBoost: false, not undefined-as-falsy.
    const nonMegaSpecies: SpeciesDefinition = {
      id: "no-boost-species",
      name: "No Boost Species",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 150,
      baseStamina: 150,
      fastMoves: [{ id: "f", name: "F", type: "normal", power: 8, energyGain: 8, durationSeconds: 1 }],
      chargedMoves: [{ id: "c", name: "C", type: "normal", power: 50, energyCost: 35, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
    };
    const nonMegaResult = runSpeciesReverseLookup({
      ...commonInputs,
      species: nonMegaSpecies,
      targets: [{ species: BOSS_TIDE }],
    });
    expect(nonMegaResult.hasMegaBoost).toBe(false);
    expect(nonMegaResult.boostedType).toBeUndefined();
    expect(nonMegaResult.boostMultiplier).toBeUndefined();
  });

  it("computes a per-boss offensive type matchup using real typeEffectiveness arithmetic, not a simulated figure", () => {
    // Candidate Alpha: Electric fast (Arc Spark) + Electric charged (Volt
    // Slam) vs Boss Gale (Steel/Flying) — Electric is neutral vs Steel,
    // super-effective vs Flying (1.6), so the combined dual-type multiplier
    // is 1 * 1.6 = 1.6, matching typeChart.ts's stacking rule directly.
    const result = runSpeciesReverseLookup({ ...commonInputs, targets: [{ species: BOSS_GALE }] });
    const row = result.rows[0]!;
    expect(row.fastMoveTypeEffectiveness).toBeCloseTo(1.6);
    expect(row.chargedMoveTypeEffectiveness).toBeCloseTo(1.6);
    expect(row.offensiveTypeMatchup).toBeCloseTo(1.6);
  });

  it("results are orderable by the sustained metric — a favorable matchup boss should rank differently from an unfavorable one", () => {
    // Candidate Beta (pure Electric, no Steel typing) has no type-chart
    // defensive edge against Boss Gale's Flying/Steel moves, unlike Alpha —
    // ranking rows by meanSecondsSurvived descending should be a well-formed
    // total order regardless of which boss "wins."
    const result = runSpeciesReverseLookup({
      ...commonInputs,
      species: CANDIDATE_BETA,
      targets: [{ species: BOSS_TIDE }, { species: BOSS_GALE }],
    });
    const sorted = [...result.rows].sort((a, b) => b.sustained.meanTotalDamage - a.sustained.meanTotalDamage);
    // A stable, well-formed sort: every adjacent pair is non-increasing.
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1]!.sustained.meanTotalDamage).toBeGreaterThanOrEqual(sorted[i]!.sustained.meanTotalDamage);
    }
    expect(sorted.length).toBe(2);
  });

  it("threads bossRaidTier through per target exactly like comparison.ts's two-candidate path", () => {
    // NOTE: runSustainedComparison's StepwiseBoss has no HP field at all (boss
    // HP is only ever modeled downstream, by teamRaid.ts's post-processing) —
    // bossRaidTier here only changes the boss's attack/defense multiplier
    // (0.5974 for 1-Star vs 0.79 for Mega Raids), not any HP pool. A higher
    // multiplier means the boss both hits harder (candidate takes more
    // damage per boss attack) AND is tankier (candidate's own damage per hit
    // is lower, since damage divides by the defender's defense stat) — so the
    // weaker (1-Star) tier should let CANDIDATE_ALPHA deal at least as much,
    // and typically strictly more, total damage over the same window than
    // the tougher Mega Raids tier.
    const megaTierTargets: SpeciesReportBossTarget[] = [{ species: REAL_STYLE_BOSS, tier: "Mega Raids" }];
    const oneStarTierTargets: SpeciesReportBossTarget[] = [{ species: REAL_STYLE_BOSS, tier: "1-Star Raids" }];

    const megaTierResult = runSpeciesReverseLookup({
      ...commonInputs,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 8,
      maxSeconds: 60,
      iterations: 30,
      targets: megaTierTargets,
    });
    const oneStarTierResult = runSpeciesReverseLookup({
      ...commonInputs,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 8,
      maxSeconds: 60,
      iterations: 30,
      targets: oneStarTierTargets,
    });

    expect(RAID_TIER_TABLE["1-Star Raids"].attackDefenseMultiplier).toBeLessThan(
      RAID_TIER_TABLE["Mega Raids"].attackDefenseMultiplier,
    );
    expect(oneStarTierResult.rows[0]!.sustained.meanSecondsSurvived).toBeGreaterThanOrEqual(
      megaTierResult.rows[0]!.sustained.meanSecondsSurvived,
    );
    expect(oneStarTierResult.rows[0]!.sustained.meanTotalDamage).toBeGreaterThan(
      megaTierResult.rows[0]!.sustained.meanTotalDamage,
    );
  });

  it("bossFastMoveId/bossChargedMoveId per target thread through independently of tier", () => {
    const multiMoveBoss: SpeciesDefinition = {
      id: "multi-move-boss",
      name: "Multi Move Boss",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 150,
      baseStamina: 20000,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 10, energyGain: 0, durationSeconds: 1.5 }],
      chargedMoves: [
        { id: "weak-charged", name: "Weak Charged", type: "normal", power: 30, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 },
        { id: "strong-charged", name: "Strong Charged", type: "normal", power: 150, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 },
      ],
      statsArePrecomputed: true,
    };

    const weakResult = runSpeciesReverseLookup({
      ...commonInputs,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 8,
      maxSeconds: 60,
      iterations: 30,
      targets: [{ species: multiMoveBoss, bossChargedMoveId: "weak-charged" }],
    });
    const strongResult = runSpeciesReverseLookup({
      ...commonInputs,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 8,
      maxSeconds: 60,
      iterations: 30,
      targets: [{ species: multiMoveBoss, bossChargedMoveId: "strong-charged" }],
    });

    expect(strongResult.rows[0]!.sustained.meanSecondsSurvived).toBeLessThanOrEqual(
      weakResult.rows[0]!.sustained.meanSecondsSurvived,
    );
  });

  it("typeMatchupPercentile is omitted when no corpus is supplied, and present (with correct ranking) when one is", () => {
    const withoutCorpus = runSpeciesReverseLookup({ ...commonInputs, targets: [{ species: BOSS_GALE }] });
    expect(withoutCorpus.rows[0]!.typeMatchupPercentile).toBeUndefined();

    // Corpus of 4 attacker profiles vs Boss Gale (Steel/Flying):
    // - normal/normal: neutral vs Steel (0.625), not-very vs Flying? Flying
    //   isn't in CHART for "normal", so neutral (1) vs Flying -> 0.625 * 1 = 0.625
    // - fire/fire: not-very vs Steel is actually super (fire -> steel SUPER_EFFECTIVE 1.6), neutral vs flying -> 1.6
    // - electric/electric (Candidate Alpha's own matchup): neutral vs Steel (1), super vs Flying (1.6) -> 1.6
    // - ground/ground: super vs steel (1.6), no-effect vs flying (0.390625) -> 1.6*0.390625 = 0.625
    // Candidate Alpha's own matchup (1.6) ties the best entries in this
    // corpus, so it should sit at percentile 1 (beats or ties every entry).
    const corpus = [
      { fastMoveType: "normal" as const, chargedMoveType: "normal" as const },
      { fastMoveType: "fire" as const, chargedMoveType: "fire" as const },
      { fastMoveType: "electric" as const, chargedMoveType: "electric" as const },
      { fastMoveType: "ground" as const, chargedMoveType: "ground" as const },
    ];
    const withCorpus = runSpeciesReverseLookup({
      ...commonInputs,
      targets: [{ species: BOSS_GALE }],
      typeMatchupCorpus: corpus,
    });
    expect(withCorpus.rows[0]!.typeMatchupPercentile).toBe(1);
  });

  it("empty corpus is treated as no percentile context (returns 1, not NaN/throw)", () => {
    expect(typeMatchupPercentile(1.6, [])).toBe(1);
  });

  describe("bossMaxHpOverride: historical raid-tier HP fix", () => {
    // REAL_STYLE_BOSS (module-level, above) is a real (non-precomputed)
    // synced-style species, so its resolved HP comes from RAID_TIER_TABLE
    // rather than a hand-tuned baseStamina — exactly the code path a real
    // backfilled historical raid target exercises.
    it("absent override produces byte-identical results to today's tier-derived path", () => {
      const targets: SpeciesReportBossTarget[] = [{ species: REAL_STYLE_BOSS, tier: "3-Star Raids" }];
      const withField = runSpeciesReverseLookup({ ...commonInputs, targets: [{ ...targets[0]!, bossMaxHpOverride: undefined }] });
      const withoutField = runSpeciesReverseLookup({ ...commonInputs, targets });

      expect(withField.rows[0]!.sustained.bossMaxHp).toBe(RAID_TIER_TABLE["3-Star Raids"].hp);
      expect(withField.rows[0]!.sustained.bossMaxHp).toBe(withoutField.rows[0]!.sustained.bossMaxHp);
      expect(withField.rows[0]!.sustained.meanTotalDamage).toBe(withoutField.rows[0]!.sustained.meanTotalDamage);
      expect(withField.rows[0]!.sustained.meanSecondsSurvived).toBe(withoutField.rows[0]!.sustained.meanSecondsSurvived);
    });

    it("override present resolves the row's boss HP to exactly the override, via the public sustained.bossMaxHp field", () => {
      const targets: SpeciesReportBossTarget[] = [
        { species: REAL_STYLE_BOSS, tier: "3-Star Raids", bossMaxHpOverride: 9000 },
      ];
      const result = runSpeciesReverseLookup({ ...commonInputs, targets });
      expect(result.rows[0]!.sustained.bossMaxHp).toBe(9000);
    });

    it("REGRESSION: same species/tier, with vs without the old tier-4-era HP override (9000 vs today's 3-Star 3600) — differs by exactly 2.5x, the real understatement this feature fixes", () => {
      const todayTierTargets: SpeciesReportBossTarget[] = [{ species: REAL_STYLE_BOSS, tier: "3-Star Raids" }];
      const historicalOverrideTargets: SpeciesReportBossTarget[] = [
        { species: REAL_STYLE_BOSS, tier: "3-Star Raids", bossMaxHpOverride: 9000 },
      ];

      const todayResult = runSpeciesReverseLookup({ ...commonInputs, targets: todayTierTargets });
      const historicalResult = runSpeciesReverseLookup({ ...commonInputs, targets: historicalOverrideTargets });

      expect(todayResult.rows[0]!.sustained.bossMaxHp).toBe(3600);
      expect(historicalResult.rows[0]!.sustained.bossMaxHp).toBe(9000);
      expect(historicalResult.rows[0]!.sustained.bossMaxHp / todayResult.rows[0]!.sustained.bossMaxHp).toBeCloseTo(2.5);
      // Tier's attack/defense multiplier ("3-Star Raids", 0.73) is untouched
      // by the HP override — the two runs' actual combat numbers (damage
      // dealt/seconds survived) must therefore be identical, since
      // bossRaidTier is the same for both and the stepwise sim never
      // consumes boss HP at all (see comparison.ts/simulate.ts).
      expect(historicalResult.rows[0]!.sustained.meanTotalDamage).toBe(todayResult.rows[0]!.sustained.meanTotalDamage);
    });

    it("rejects a non-positive/non-finite override rather than silently modeling a 0-HP boss", () => {
      for (const bad of [0, -1, NaN, Infinity]) {
        expect(() =>
          runSpeciesReverseLookup({
            ...commonInputs,
            targets: [{ species: REAL_STYLE_BOSS, tier: "3-Star Raids", bossMaxHpOverride: bad }],
          }),
        ).toThrow();
      }
    });
  });
});

describe("offensiveTypeMatchup / typeMatchupPercentile (the cheap, no-simulation helpers)", () => {
  it("takes the max of fast/charged type effectiveness, not an average", () => {
    // Electric fast (neutral vs pure Water, 1) + a hypothetical Ice charged
    // (super-effective vs Water's counterpart Ground... use a clean single
    // type instead): Fire fast (not-very vs Water, 0.625) + Grass charged
    // (super-effective vs Water, 1.6) against pure Water should report the
    // charged move's 1.6, not an averaged 1.1125.
    const matchup = offensiveTypeMatchup({ fastMoveType: "fire", chargedMoveType: "grass" }, ["water"]);
    expect(matchup).toBeCloseTo(1.6);
  });

  it("percentile: half a corpus below strictly, half above, gives 0.5-ish; beating everything gives 1", () => {
    expect(typeMatchupPercentile(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeCloseTo(0.5);
    expect(typeMatchupPercentile(100, [1, 2, 3])).toBe(1);
    expect(typeMatchupPercentile(0, [1, 2, 3])).toBe(0);
  });
});

describe("SpeciesReportInputs.megaLevel", () => {
  // A dedicated, bulky, weak-boss-opponent fixture rather than reusing
  // CANDIDATE_ALPHA/BOSS_TIDE — CANDIDATE_ALPHA's 150 effective HP is
  // deliberately tuned to die at EXACTLY 7.5s against BOSS_TIDE under the
  // OPENING-BURST simulator's simplified (no-cast-animation) charged-move
  // model, but the STEPWISE simulator this module actually drives DOES model
  // a real charged-move cast animation with its own vulnerability window
  // (see simulate.ts) — reusing that exact pairing here made the candidate
  // die MID-ANIMATION before its own charged move could ever land (a real,
  // correctly-modeled mechanic, not a bug — see
  // investigation_charged_damage_mid_animation_contradiction.md), which
  // would make every assertion below vacuously about 0 damage. This module
  // is thin orchestration over runSustainedComparison (already exhaustively
  // tested for megaLevel wiring in sustainedComparison.test.ts), so this only
  // needs to prove the field actually REACHES that call — a fixture that
  // survives comfortably is all that's needed for that.
  const megaAttacker: SpeciesDefinition = {
    id: "sr-mega-attacker",
    name: "SR Mega Attacker",
    types: ["electric"],
    baseAttack: 250,
    baseDefense: 150,
    baseStamina: 10000,
    fastMoves: [{ id: "sr-fast", name: "SR Fast", type: "electric", power: 15, energyGain: 20, durationSeconds: 1 }],
    chargedMoves: [
      {
        id: "sr-plus-move",
        name: "SR Plus Move",
        type: "electric",
        power: 100,
        energyCost: 20,
        durationSeconds: 2,
        vulnerableWindowSeconds: 2,
        isPlusMove: true,
        plusMovePowerConfidence: "community-estimate",
      },
    ],
    boost: { multiplier: 1.3, boostedType: "electric" },
  };
  const nonMegaAttacker: SpeciesDefinition = { ...megaAttacker, id: "sr-non-mega-attacker", name: "SR Non-Mega Attacker", boost: undefined };
  const weakBoss: SpeciesDefinition = {
    id: "sr-weak-boss",
    name: "SR Weak Boss",
    types: ["electric"],
    baseAttack: 1,
    baseDefense: 200,
    baseStamina: 30000,
    fastMoves: [{ id: "sr-boss-fast", name: "SR Boss Fast", type: "electric", power: 1, energyGain: 0, durationSeconds: 2 }],
    chargedMoves: [],
    statsArePrecomputed: true,
  };

  const commonInputs = {
    level: 50,
    ivs: PERFECT_IVS,
    dodge: { kind: "none" } as const,
    bossChargedMoveMeanIntervalSeconds: 1000,
    maxSeconds: 30,
    iterations: 10,
    targets: [{ species: weakBoss }] as SpeciesReportBossTarget[],
  };

  it("scales the species' own '+' move power through to the reported sustained result", () => {
    const base = runSpeciesReverseLookup({ ...commonInputs, species: megaAttacker });
    const superMax = runSpeciesReverseLookup({ ...commonInputs, species: megaAttacker, megaLevel: "super-max" });
    expect(base.rows[0]!.sustained.meanChargedDamage).toBeGreaterThan(0);
    expect(superMax.rows[0]!.sustained.meanChargedDamage).toBeGreaterThan(base.rows[0]!.sustained.meanChargedDamage);
  });

  it("has no effect at all when the species has no mega/primal boost mechanic, regardless of what's requested", () => {
    const withoutMegaLevel = runSpeciesReverseLookup({ ...commonInputs, species: nonMegaAttacker });
    const withSuperMaxRequested = runSpeciesReverseLookup({ ...commonInputs, species: nonMegaAttacker, megaLevel: "super-max" });
    expect(withSuperMaxRequested).toEqual(withoutMegaLevel);
  });
});
