import { describe, expect, it } from "vitest";
import { simulateOpeningBurst } from "../src/combat.js";
import { runStepwiseDistribution, simulateStepwiseBattle } from "../src/simulate.js";
import { typeEffectiveness } from "../src/typeChart.js";
import {
  MEGA_RAICHU_X,
  PRIMAL_KYOGRE,
  SCENARIO_A_LEVEL,
  SCENARIO_A_PERFECT_IVS,
  STATIC_SHOCK,
  WILD_CHARGE,
} from "../src/fixtures/scenarioA.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import { RAID_BOSS_CPM, RAID_BOSS_IVS } from "../src/raidBoss.js";

const xStats = effectiveStatsAtLevel(MEGA_RAICHU_X, SCENARIO_A_PERFECT_IVS, SCENARIO_A_LEVEL);
const bossAttack = Math.floor((PRIMAL_KYOGRE.baseAttack + RAID_BOSS_IVS.attack) * RAID_BOSS_CPM);
const bossDefense = Math.floor((PRIMAL_KYOGRE.baseDefense + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
const bossVsX = typeEffectiveness(PRIMAL_KYOGRE.types[0]!, MEGA_RAICHU_X.types);
const xVsBoss = typeEffectiveness("electric", PRIMAL_KYOGRE.types);

const attacker = {
  hp: xStats.stamina,
  defenseStat: xStats.defense,
  attackStat: xStats.attack,
  fastMove: STATIC_SHOCK,
  chargedMove: WILD_CHARGE,
  damageOut: { stab: true, typeEffectiveness: xVsBoss, megaBoostMultiplier: MEGA_RAICHU_X.boost!.multiplier },
};

const bossNoChargedMove = {
  attackStat: bossAttack,
  defenseStat: bossDefense,
  fastMove: PRIMAL_KYOGRE.fastMoves[0]!,
  damageOut: { stab: true, typeEffectiveness: bossVsX },
};

describe("simulateStepwiseBattle", () => {
  it("matches simulateOpeningBurst's death timing, but reveals the charged attack never actually lands once its cast time is modeled", () => {
    // simulateOpeningBurst (Phase 1) treats charged moves as instant once
    // energy is ready — a simplification the spec itself flags as a known
    // caveat ("both forms are likely to die during their own 3.5-second
    // charged-move animation"). Here, energy is ready at t=7.5s but the cast
    // takes 3.5s (finishing at t=11.0s), and the fourth Waterfall hit kills
    // at exactly t=10.0s — so the more realistic model shows the attack
    // never lands at all, which the simplified model silently assumed away.
    const openingBurst = simulateOpeningBurst(attacker, bossNoChargedMove);
    const stepwise = simulateStepwiseBattle({ attacker, boss: bossNoChargedMove });

    expect(openingBurst.faintedAtSeconds).toBe(10.0);
    expect(openingBurst.chargedAttacksLanded).toBe(1);

    expect(stepwise.faintedAtSeconds).toBe(10.0);
    expect(stepwise.chargedAttacksLanded).toBe(0);
    expect(stepwise.totalChargedDamage).toBe(0);
    expect(stepwise.diedDuringOwnChargedMoveAnimation).toBe(true);
  });

  it("lands the charged attack when the animation finishes before the fatal hit", () => {
    // Same matchup, but with more HP the attacker survives long enough for
    // its cast (started once energy is ready) to actually complete.
    const tankyAttacker = { ...attacker, hp: attacker.hp * 3 };
    const stepwise = simulateStepwiseBattle({ attacker: tankyAttacker, boss: bossNoChargedMove });

    expect(stepwise.chargedAttacksLanded).toBeGreaterThanOrEqual(1);
    expect(stepwise.totalChargedDamage).toBeGreaterThan(0);
    expect(stepwise.diedDuringOwnChargedMoveAnimation).toBe(false);
  });

  it("is deterministic for a fixed seed", () => {
    const bossWithCharged = {
      ...bossNoChargedMove,
      chargedMove: { id: "hydro-pump", name: "Hydro Pump", type: "water" as const, power: 130, energyCost: 100, durationSeconds: 3.5, vulnerableWindowSeconds: 3.5 },
      chargedMoveMeanIntervalSeconds: 4,
      chargedMoveWarmupSeconds: 2,
    };
    const a = simulateStepwiseBattle({ attacker, boss: bossWithCharged, seed: 42 });
    const b = simulateStepwiseBattle({ attacker, boss: bossWithCharged, seed: 42 });
    expect(a).toEqual(b);
  });

  it("never lets a dodge reduce damage from a hit landing during the attacker's own charged-move animation", () => {
    // A dodge input can't be thrown while locked into your own charged-move
    // cast, and even if it could, a dodge's ~0.7s reduction window can't
    // cover a multi-second animation. So under "perfect" dodge: the attacker
    // gets full energy from its first fast move at t=1s (ready immediately,
    // energyGain=100=cost) and casts a 3s animation from t=1 to t=4. Boss
    // fast-move hits at t=2 and t=3 land squarely inside that window and
    // must deal full (undodged) damage; the hits at t=1 and t=4 are outside
    // it and get the normal 0.25x "perfect dodge" reduction.
    const dodgeAttacker = {
      hp: 100000,
      defenseStat: 100,
      attackStat: 100,
      fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 100, durationSeconds: 1 },
      chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 10, energyCost: 100, durationSeconds: 3, vulnerableWindowSeconds: 3 },
      damageOut: { stab: false },
    };
    const dodgeBoss = {
      attackStat: 100,
      defenseStat: 100,
      fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 10, energyGain: 0, durationSeconds: 1 },
      damageOut: { stab: false },
    };

    const result = simulateStepwiseBattle({
      attacker: dodgeAttacker,
      boss: dodgeBoss,
      dodge: { kind: "perfect" },
      maxSeconds: 4,
    });

    // Full damage per hit is floor(0.5*10*(100/100))+1 = 6; dodged is floor(6*0.25) = 1.
    // t=1 (outside window): 1, t=2 & t=3 (inside window): 6 each, t=4 (window just closed): 1.
    expect(result.totalDamageTaken).toBe(1 + 6 + 6 + 1);
  });

  it("models dying mid-animation as a real, non-assumed-away outcome across a distribution", () => {
    // A synthetic matchup built so death is dominated by a randomly-timed
    // boss charged move that sometimes overlaps the attacker's own cast
    // window and sometimes doesn't — producing genuine run-to-run variance
    // in whether the attacker's charged attack lands.
    const syntheticAttacker = {
      hp: 100,
      defenseStat: 100,
      attackStat: 200,
      fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 5, durationSeconds: 1 },
      chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 100, energyCost: 50, durationSeconds: 3, vulnerableWindowSeconds: 3 },
      damageOut: { stab: false },
    };
    const syntheticBoss = {
      attackStat: 100,
      defenseStat: 100,
      fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 5, energyGain: 5, durationSeconds: 1.5 },
      damageOut: { stab: false },
      chargedMove: { id: "boss-charged", name: "Boss Charged", type: "normal" as const, power: 80, energyCost: 100, durationSeconds: 3, vulnerableWindowSeconds: 3 },
      chargedMoveDamageOut: { stab: false },
      chargedMoveMeanIntervalSeconds: 6,
      chargedMoveWarmupSeconds: 2,
    };

    const distribution = runStepwiseDistribution({ attacker: syntheticAttacker, boss: syntheticBoss, maxSeconds: 30 }, 200);

    expect(distribution.iterations).toBe(200);
    expect(distribution.fractionDiedDuringOwnAnimation).toBeGreaterThan(0);
    expect(distribution.fractionDiedDuringOwnAnimation).toBeLessThan(1);
    // A distribution, not a point estimate: some spread across seeds is expected.
    expect(distribution.p90TotalDamage).toBeGreaterThanOrEqual(distribution.medianTotalDamage);
    expect(distribution.medianTotalDamage).toBeGreaterThanOrEqual(distribution.p10TotalDamage);
  });
});
