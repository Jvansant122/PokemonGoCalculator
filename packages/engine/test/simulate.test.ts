import { describe, expect, it } from "vitest";
import { simulateOpeningBurst } from "../src/combat.js";
import {
  boundedJitteredChargedMoveInterval,
  DEFAULT_DODGE_ERROR_MISSED_FRACTIONS,
  HOLD_CHARGED_MOVE_DODGE_ATTEMPTS,
  isTickAlignedDuration,
  runStepwiseDistribution,
  simulateStepwiseBattle,
  sweepDodgeExecutionError,
} from "../src/simulate.js";
import { DODGE_COST_SECONDS } from "../src/breakpoints.js";
import { typeEffectiveness } from "../src/typeChart.js";
import {
  ARC_SPARK,
  BOSS_TIDE,
  CANDIDATE_ALPHA,
  LEVEL,
  PERFECT_IVS,
  VOLT_SLAM,
} from "./fixtures/hypotheticalDuo.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import { RAID_BOSS_CPM, RAID_BOSS_IVS } from "../src/raidBoss.js";

const alphaStats = effectiveStatsAtLevel(CANDIDATE_ALPHA, PERFECT_IVS, LEVEL);
const bossAttack = Math.floor((BOSS_TIDE.baseAttack + RAID_BOSS_IVS.attack) * RAID_BOSS_CPM);
const bossDefense = Math.floor((BOSS_TIDE.baseDefense + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
const bossVsAlpha = typeEffectiveness(BOSS_TIDE.types[0]!, CANDIDATE_ALPHA.types);
const alphaVsBoss = typeEffectiveness("electric", BOSS_TIDE.types);

const attacker = {
  hp: alphaStats.stamina,
  defenseStat: alphaStats.defense,
  attackStat: alphaStats.attack,
  fastMove: ARC_SPARK,
  chargedMove: VOLT_SLAM,
  // Arc Spark and Volt Slam are both Electric, so the same type-effectiveness applies to both.
  fastDamageOut: { stab: true, typeEffectiveness: alphaVsBoss, megaBoostMultiplier: CANDIDATE_ALPHA.boost!.multiplier },
  chargedDamageOut: { stab: true, typeEffectiveness: alphaVsBoss, megaBoostMultiplier: CANDIDATE_ALPHA.boost!.multiplier },
};

const bossNoChargedMove = {
  attackStat: bossAttack,
  defenseStat: bossDefense,
  fastMove: BOSS_TIDE.fastMoves[0]!,
  damageOut: { stab: true, typeEffectiveness: bossVsAlpha },
};

describe("simulateStepwiseBattle", () => {
  it("matches simulateOpeningBurst's death timing, but reveals the charged attack never actually lands once its cast time is modeled", () => {
    // simulateOpeningBurst (Phase 1) treats charged moves as instant once
    // energy is ready — a simplification the spec itself flags as a known
    // caveat ("the attacker is likely to die during its own charged-move
    // animation"). Here, energy is ready at t=5.0s but the cast takes 3.5s
    // (finishing at t=8.5s), and the third Tidal Surge hit kills at exactly
    // t=7.5s — so the more realistic model shows the attack never lands at
    // all, which the simplified model silently assumed away.
    const openingBurst = simulateOpeningBurst(attacker, bossNoChargedMove);
    const stepwise = simulateStepwiseBattle({ attacker, boss: bossNoChargedMove });

    expect(openingBurst.faintedAtSeconds).toBe(7.5);
    expect(openingBurst.chargedAttacksLanded).toBe(1);

    expect(stepwise.faintedAtSeconds).toBe(7.5);
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
    // The boss here never uses a charged move, so `dodge` (charged-attack-only)
    // has no effect at all — dodgeFastAttacks is what's under test. A dodge
    // input can't be thrown while locked into your own charged-move cast, and
    // even if it could, a dodge's ~0.7s reduction window can't cover a
    // multi-second animation.
    //
    // dodgeFastAttacks also costs DODGE_COST_SECONDS (0.5s) per attempt: the
    // t=1 boss hit is dodged (attacker not yet mid-cast), which pushes the
    // attacker's own first fast move from t=1 to t=1.5 — so the resulting
    // 3s cast runs [1.5, 4.5), not [1, 4). That's why the boss hits at
    // t=2, t=3, AND t=4 (not just t=2/t=3) all land squarely inside the cast
    // window and must deal full (undodged) damage.
    const dodgeAttacker = {
      hp: 100000,
      defenseStat: 100,
      attackStat: 100,
      fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 100, durationSeconds: 1 },
      chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 10, energyCost: 100, durationSeconds: 3, vulnerableWindowSeconds: 3 },
      fastDamageOut: { stab: false },
      chargedDamageOut: { stab: false },
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
      dodgeFastAttacks: true,
      maxSeconds: 4,
    });

    // Full damage per hit is floor(0.5*10*(100/100))+1 = 6; dodged is floor(6*0.25) = 1.
    // t=1 (dodged, before the cast starts): 1. t=2, t=3, t=4 (all inside the
    // delayed [1.5, 4.5) cast window): 6 each.
    expect(result.totalDamageTaken).toBe(1 + 6 + 6 + 6);
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
      fastDamageOut: { stab: false },
      chargedDamageOut: { stab: false },
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

  describe("holdChargedMoveUntilSafe", () => {
    it("fires right after successfully dodging one of the boss's charged hits, not the instant energy allows it, and before the energy cap would force it anyway", () => {
      const attacker = {
        hp: 100000,
        defenseStat: 100,
        attackStat: 100,
        // energyGain=35, cost=30: ready (>=cost) at t=1, but not yet at
        // MAX_ENERGY (100) until t=3 (35, 70, 100) — so a dodge landing
        // strictly between t=1 and t=3 can only be explained by the
        // safe-window trigger, not the energy-cap fallback.
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 35, durationSeconds: 1 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 10, energyCost: 30, durationSeconds: 2, vulnerableWindowSeconds: 2 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
        holdChargedMoveUntilSafe: true,
      };
      const boss = {
        attackStat: 100,
        defenseStat: 100,
        fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 1, energyGain: 0, durationSeconds: 10 },
        damageOut: { stab: false },
        // durationSeconds deliberately kept below the mean's lowest possible
        // jittered sample (mean=0.5 * 0.6 = 0.3) so simulate.ts's physical
        // "can't recast before the last cast finished" floor
        // (boundedJitteredChargedMoveInterval) never actually engages here —
        // this test is exercising holdChargedMoveUntilSafe's timing, not that
        // floor (see the dedicated "physically impossible cadence" describe
        // block further down for that).
        chargedMove: { id: "boss-charged", name: "Boss Charged", type: "normal" as const, power: 1, energyCost: 9999, durationSeconds: 0.2, vulnerableWindowSeconds: 0.2 },
        chargedMoveDamageOut: { stab: false },
        // The boss's first charged hit lands at chargedMoveWarmupSeconds +
        // jitteredInterval(chargedMoveMeanIntervalSeconds) — NOT at the
        // warmup value alone. With warmup=1.2 and mean=0.5 (jittered
        // +/-40%, i.e. *[0.6, 1.4]), the first hit lands somewhere in
        // [1.2+0.3, 1.2+0.7] = [1.5, 1.9] — comfortably inside the (1, 3)
        // window established above.
        chargedMoveMeanIntervalSeconds: 0.5,
        chargedMoveWarmupSeconds: 1.2,
      };

      // Baseline: with dodging disabled and the boss hit pushed far out of
      // range, the only trigger left is the t=3 energy cap — cast starts at
      // t=3, completes (lands) at t=3+2=5. This also validates the cap
      // fallback mechanism itself, not just the absence of an earlier fire.
      const capForced = simulateStepwiseBattle({
        attacker,
        boss: { ...boss, chargedMoveWarmupSeconds: 1000 },
        dodge: { kind: "none" },
        maxSeconds: 6,
      });
      expect(capForced.chargedAttacksLanded).toBe(1);
      // A single fast hit (power 5, floor(0.5*5)+1=3 damage) lands at every
      // integer second before the cast starts — the first trajectory point
      // past that flat per-hit value marks the charged move (power 10,
      // floor(0.5*10)+1=6) actually landing, isolating it from fast-move
      // noise now that the trajectory is a combined fast+charged total.
      const capForcedLandedAt = capForced.ownDamageTrajectory.find((p) => p.cumulativeDamage > 3 * Math.floor(p.atSeconds))!.atSeconds;
      expect(capForcedLandedAt).toBe(5);

      // With the boss's charged hit landing in [1.5, 1.9] and dodged, the
      // safe-window trigger fires well before t=3 — so its cast (also 2s)
      // lands well before the cap-forced case's t=5, even though the exact
      // start time (and so the exact landing time) is only known to within
      // the jitter range.
      const held = simulateStepwiseBattle({ attacker, boss, dodge: { kind: "perfect" }, maxSeconds: 6 });
      expect(held.chargedAttacksLanded).toBe(1);
      const heldLandedAt = held.ownDamageTrajectory.find((p) => p.cumulativeDamage > 3 * Math.floor(p.atSeconds))!.atSeconds;
      expect(heldLandedAt).toBeGreaterThan(2);
      expect(heldLandedAt).toBeLessThan(4);
    });

    it("is forced to fire once energy hits MAX_ENERGY, even with no dodging configured at all", () => {
      const attacker = {
        hp: 100000,
        defenseStat: 100,
        attackStat: 100,
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 25, durationSeconds: 1 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 10, energyCost: 30, durationSeconds: 1, vulnerableWindowSeconds: 1 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
        holdChargedMoveUntilSafe: true,
      };
      const boss = {
        attackStat: 100,
        defenseStat: 100,
        fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 1, energyGain: 0, durationSeconds: 10 },
        damageOut: { stab: false },
      };

      // Energy: 25, 50, 75, 100 at t=1,2,3,4 (capped at MAX_ENERGY=100) —
      // energy reaches the 30 cost at t=2, but with no dodge ever available
      // (dodge: "none", no boss charged move at all) the only way it ever
      // fires is being forced at the t=4 energy cap. The 1s cast started at
      // t=4 completes at t=5, so maxSeconds must extend past that for
      // chargedAttacksLanded to reflect it.
      const result = simulateStepwiseBattle({ attacker, boss, dodge: { kind: "none" }, maxSeconds: 5.2 });
      expect(result.chargedAttacksLanded).toBe(1);
      // Fast hits (power 5, floor(0.5*5)+1=3 damage each) land every integer
      // second up through the cast start — isolate the charged move's
      // landing (power 10, floor(0.5*10)+1=6) from that fast-move noise now
      // that the trajectory is a combined fast+charged total.
      const landedAt = result.ownDamageTrajectory.find((p) => p.cumulativeDamage > 3 * Math.floor(p.atSeconds));
      expect(landedAt?.atSeconds).toBe(5);
    });

    it("dodging around a held charged move costs an EXTRA DODGE_COST_SECONDS per dodged boss charged hit, slipping the attacker's own fast-move cadence later", () => {
      // The attacker's own charged move is deliberately unreachable
      // (energyCost far above MAX_ENERGY) so holdChargedMoveUntilSafe's OTHER
      // effect — holding the attacker's OWN cast for a safe window — never
      // engages here at all. That isolates this test to exactly the one thing
      // under test: the extra per-dodge time cost this setting adds around
      // the boss's CHARGED hits.
      const attacker = {
        hp: 1_000_000,
        defenseStat: 100,
        attackStat: 100,
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 0, durationSeconds: 1 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 10, energyCost: 99999, durationSeconds: 1, vulnerableWindowSeconds: 1 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
      };
      // Boss fires its charged move on a "fixed-interval" schedule that is
      // fully independent of the attacker's own timeline (no energy check in
      // that mode — see simulate.ts), so this schedule is byte-identical
      // between the two runs below regardless of the attacker's
      // holdChargedMoveUntilSafe flag. The boss's own fast move is pushed
      // far out of range so only its charged hits are in play.
      const boss = {
        attackStat: 100,
        defenseStat: 100,
        fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 1, energyGain: 0, durationSeconds: 1000 },
        damageOut: { stab: false },
        chargedMove: { id: "boss-charged", name: "Boss Charged", type: "normal" as const, power: 1, energyCost: 9999, durationSeconds: 0.5, vulnerableWindowSeconds: 0.5 },
        chargedMoveDamageOut: { stab: false },
        chargedMoveMeanIntervalSeconds: 3,
        chargedMoveWarmupSeconds: 1,
      };

      const notHeld = simulateStepwiseBattle({
        attacker: { ...attacker, holdChargedMoveUntilSafe: false },
        boss,
        dodge: { kind: "perfect" },
        maxSeconds: 30,
      });
      const held = simulateStepwiseBattle({
        attacker: { ...attacker, holdChargedMoveUntilSafe: true },
        boss,
        dodge: { kind: "perfect" },
        maxSeconds: 30,
      });

      // Sanity check: the boss's own schedule really is identical across
      // both runs (as argued above) — several charged hits land in a 30s
      // window at a mean-3s cadence.
      expect(held.bossChargedHitsTaken).toBe(notHeld.bossChargedHitsTaken);
      expect(held.bossChargedHitsTaken).toBeGreaterThan(0);

      // Every one of those dodged charged hits costs an extra
      // DODGE_COST_SECONDS under holdChargedMoveUntilSafe (2x instead of 1x
      // per attempt — see HOLD_CHARGED_MOVE_DODGE_ATTEMPTS), which can only
      // ever push the attacker's own fast-move cadence LATER, never earlier
      // — so strictly fewer (or equal, never more) fast-move damage lands.
      expect(held.totalFastMoveDamage).toBeLessThan(notHeld.totalFastMoveDamage);

      // IDEAS.md #20 — the placeholder cost is now surfaced as its own
      // value, not just baked into the fast-move-cadence effect above. Every
      // boss charged hit here is dodged (dodge:"perfect", attacker never
      // mid-own-animation since its own charged move is unreachable), so
      // every one of them is a hold-cast-protection event.
      expect(held.holdChargedMoveDodgeCostEvents).toBe(held.bossChargedHitsTaken);
      expect(held.holdChargedMoveDodgeCostSeconds).toBeCloseTo(
        held.bossChargedHitsTaken * HOLD_CHARGED_MOVE_DODGE_ATTEMPTS * DODGE_COST_SECONDS,
      );
      // notHeld never engages the placeholder at all (holdChargedMoveUntilSafe
      // is false), so both fields stay at their zero default.
      expect(notHeld.holdChargedMoveDodgeCostEvents).toBe(0);
      expect(notHeld.holdChargedMoveDodgeCostSeconds).toBe(0);
    });

    it("does NOT add the extra dodge-cost time when dodge.kind is \"none\" — a charged hit that isn't actually dodged costs the ordinary single DODGE_COST_SECONDS (zero here, since no dodge is attempted at all)", () => {
      // Same isolation trick as above: the attacker's own charged move is
      // unreachable, so holdChargedMoveUntilSafe's "hold my own cast" effect
      // never engages, and the ONLY thing that could possibly differ between
      // holdChargedMoveUntilSafe true/false is the extra dodge-cost branch —
      // which itself is gated on attemptingDodge, already false whenever
      // dodge.kind === "none". So the two full run results must be
      // byte-identical (a stronger claim than just "cadence matches").
      const attacker = {
        hp: 1_000_000,
        defenseStat: 100,
        attackStat: 100,
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 0, durationSeconds: 1 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 10, energyCost: 99999, durationSeconds: 1, vulnerableWindowSeconds: 1 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
      };
      const boss = {
        attackStat: 100,
        defenseStat: 100,
        fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 1, energyGain: 0, durationSeconds: 1000 },
        damageOut: { stab: false },
        chargedMove: { id: "boss-charged", name: "Boss Charged", type: "normal" as const, power: 1, energyCost: 9999, durationSeconds: 0.5, vulnerableWindowSeconds: 0.5 },
        chargedMoveDamageOut: { stab: false },
        chargedMoveMeanIntervalSeconds: 3,
        chargedMoveWarmupSeconds: 1,
      };

      const notHeld = simulateStepwiseBattle({
        attacker: { ...attacker, holdChargedMoveUntilSafe: false },
        boss,
        dodge: { kind: "none" },
        maxSeconds: 30,
      });
      const held = simulateStepwiseBattle({
        attacker: { ...attacker, holdChargedMoveUntilSafe: true },
        boss,
        dodge: { kind: "none" },
        maxSeconds: 30,
      });

      expect(held.bossChargedHitsTaken).toBeGreaterThan(0);
      expect(held).toEqual(notHeld);
    });
  });

  describe("meanHoldChargedMoveDodgeCostSeconds (DistributionSummary)", () => {
    it("is 0 by default and positive once holdChargedMoveUntilSafe actually triggers the placeholder", () => {
      const attacker = {
        hp: 1_000_000,
        defenseStat: 100,
        attackStat: 100,
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 0, durationSeconds: 1 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 10, energyCost: 99999, durationSeconds: 1, vulnerableWindowSeconds: 1 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
      };
      const boss = {
        attackStat: 100,
        defenseStat: 100,
        fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 1, energyGain: 0, durationSeconds: 1000 },
        damageOut: { stab: false },
        chargedMove: { id: "boss-charged", name: "Boss Charged", type: "normal" as const, power: 1, energyCost: 9999, durationSeconds: 0.5, vulnerableWindowSeconds: 0.5 },
        chargedMoveDamageOut: { stab: false },
        chargedMoveMeanIntervalSeconds: 3,
        chargedMoveWarmupSeconds: 1,
      };

      const notHeldDist = runStepwiseDistribution(
        { attacker: { ...attacker, holdChargedMoveUntilSafe: false }, boss, dodge: { kind: "perfect" }, maxSeconds: 30 },
        20,
      );
      const heldDist = runStepwiseDistribution(
        { attacker: { ...attacker, holdChargedMoveUntilSafe: true }, boss, dodge: { kind: "perfect" }, maxSeconds: 30 },
        20,
      );

      expect(notHeldDist.meanHoldChargedMoveDodgeCostSeconds).toBe(0);
      expect(heldDist.meanHoldChargedMoveDodgeCostSeconds).toBeGreaterThan(0);
    });
  });

  describe("sweepDodgeExecutionError (IDEAS.md #21)", () => {
    // A synthetic matchup where the boss's charged move is both survivable
    // and worth dodging, so execution error actually moves the numbers.
    const attacker = {
      hp: 400,
      defenseStat: 100,
      attackStat: 120,
      fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 8, energyGain: 10, durationSeconds: 1 },
      chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 60, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 },
      fastDamageOut: { stab: false },
      chargedDamageOut: { stab: false },
    };
    const boss = {
      attackStat: 150,
      defenseStat: 100,
      fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 6, energyGain: 6, durationSeconds: 1.5 },
      damageOut: { stab: false },
      chargedMove: { id: "boss-charged", name: "Boss Charged", type: "normal" as const, power: 90, energyCost: 50, durationSeconds: 2.5, vulnerableWindowSeconds: 2.5 },
      chargedMoveDamageOut: { stab: false },
      chargedMoveMeanIntervalSeconds: 5,
      chargedMoveWarmupSeconds: 3,
    };

    it("returns one point per requested missedFraction, in the same order", () => {
      const sweep = sweepDodgeExecutionError({ attacker, boss, maxSeconds: 30 }, [0, 0.2, 0.5], 30);
      expect(sweep.map((p) => p.missedFraction)).toEqual([0, 0.2, 0.5]);
      expect(sweep).toHaveLength(3);
    });

    it("defaults to DEFAULT_DODGE_ERROR_MISSED_FRACTIONS when no explicit list is given", () => {
      const sweep = sweepDodgeExecutionError({ attacker, boss, maxSeconds: 30 }, undefined, 10);
      expect(sweep.map((p) => p.missedFraction)).toEqual(DEFAULT_DODGE_ERROR_MISSED_FRACTIONS);
    });

    it("the missedFraction=0 endpoint is BYTE-IDENTICAL to dodge:{kind:\"perfect\"} at a matching seed — both are RNG-free on the dodge axis", () => {
      const perfect = runStepwiseDistribution({ attacker, boss, dodge: { kind: "perfect" }, maxSeconds: 30 }, 30);
      const [zeroMissedPoint] = sweepDodgeExecutionError({ attacker, boss, maxSeconds: 30 }, [0], 30);
      expect(zeroMissedPoint!.distribution).toEqual(perfect);
    });

    it("the missedFraction=1 endpoint deals identical incoming damage to dodge:{kind:\"none\"} (both always full-damage), but is NOT byte-identical overall — it still THROWS a dodge input every time, wasting DODGE_COST_SECONDS the {kind:\"none\"} run never spends, so its own fast-move output is strictly worse", () => {
      const none = runStepwiseDistribution({ attacker, boss, dodge: { kind: "none" }, maxSeconds: 30 }, 30);
      const [oneMissedPoint] = sweepDodgeExecutionError({ attacker, boss, maxSeconds: 30 }, [1], 30);
      const always = oneMissedPoint!.distribution;

      // The boss's own hit schedule here is "fixed-interval" (independent of
      // the attacker) and dodgeFastAttacks is off, so every incoming hit in
      // BOTH runs lands at full (undodged) damage at the same simulated
      // times — the representative run's total damage taken is a pure
      // function of the boss's own timeline, with no dependence on the
      // attacker's dodge setting at all.
      expect(always.representativeRun.totalDamageTaken).toBe(none.representativeRun.totalDamageTaken);
      // But every one of those charged hits still costs an attempt under
      // percentage-missed (it just always misses) — {kind:"none"} never
      // attempts at all — so the attacker's own fast-move cadence slips
      // later under missedFraction:1, landing strictly less fast-move
      // damage over the same window. This is the concrete case backing the
      // function doc comment's claim that missedFraction:1 is measurably
      // WORSE than {kind:"none"}, not a redundant alias for it.
      expect(always.meanFastMoveDamage).toBeLessThan(none.meanFastMoveDamage);
    });

    it("renders a band: worse execution (higher missedFraction) never makes mean survival BETTER than perfect execution", () => {
      // Not asserting strict monotonicity at every step (a percentage-missed
      // interleaving isn't guaranteed to be perfectly monotonic run-to-run
      // for every possible cadence — see dodgeMultiplierForHit's own
      // deterministic-period model), just the band's overall direction: the
      // worst end (never dodges) must not outlive the best end (always
      // dodges).
      const sweep = sweepDodgeExecutionError({ attacker, boss, maxSeconds: 60 }, [0, 0.25, 0.5, 0.75, 1], 100);
      const perfectEnd = sweep[0]!.distribution.meanSecondsSurvived;
      const worstEnd = sweep[sweep.length - 1]!.distribution.meanSecondsSurvived;
      expect(worstEnd).toBeLessThanOrEqual(perfectEnd);
    });
  });

  describe("ChargedMove.perfectlyDodgeable", () => {
    it("forces full (undodged) damage regardless of DodgeBehavior when the boss's charged move is flagged not perfectly dodgeable", () => {
      // Both the attacker's own fast/charged moves are set up to never fire
      // within the 3s window (long duration / effectively unreachable energy
      // cost), so the only thing landing is boss charged hits — isolating
      // exactly what dodgeMultiplierForHit's new third argument changes, with
      // no other noise in totalDamageTaken. The two runs share the same seed
      // and identical boss schedule (only `perfectlyDodgeable` differs), so
      // they land the exact same number of hits N — full damage (6/hit) vs.
      // perfectly-dodged (1/hit) means undodgeable's total must be exactly
      // 6x dodgeable's, whatever N turns out to be.
      const attacker = {
        hp: 100000,
        defenseStat: 100,
        attackStat: 100,
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 100, durationSeconds: 10 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 1, energyCost: 9999, durationSeconds: 1, vulnerableWindowSeconds: 1 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
      };
      // durationSeconds deliberately kept below the mean's lowest possible
      // jittered sample (mean=0.5 * 0.6 = 0.3) so simulate.ts's physical
      // "can't recast before the last cast finished" floor
      // (boundedJitteredChargedMoveInterval) never engages here — this test
      // is exercising perfectlyDodgeable's damage-multiplier override, not
      // that floor.
      const bossChargedMove = {
        id: "boss-charged",
        name: "Boss Charged",
        type: "normal" as const,
        power: 10,
        energyCost: 1,
        durationSeconds: 0.2,
        vulnerableWindowSeconds: 0.2,
      };
      const boss = {
        attackStat: 100,
        defenseStat: 100,
        fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 1, energyGain: 0, durationSeconds: 100 },
        damageOut: { stab: false },
        chargedMove: bossChargedMove,
        chargedMoveDamageOut: { stab: false },
        chargedMoveMeanIntervalSeconds: 0.5,
        chargedMoveWarmupSeconds: 1,
      };

      // Full damage: floor(0.5*10*(100/100))+1 = 6. Perfect dodge quarters it: floor(6*0.25) = 1.
      const dodgeable = simulateStepwiseBattle({ attacker, boss, dodge: { kind: "perfect" }, maxSeconds: 3, seed: 1 });
      const undodgeable = simulateStepwiseBattle({
        attacker,
        boss: { ...boss, chargedMove: { ...bossChargedMove, perfectlyDodgeable: false } },
        dodge: { kind: "perfect" },
        maxSeconds: 3,
        seed: 1,
      });

      expect(dodgeable.bossChargedHitsTaken).toBeGreaterThan(0);
      expect(undodgeable.bossChargedHitsTaken).toBe(dodgeable.bossChargedHitsTaken);
      expect(undodgeable.totalDamageTaken).toBe(dodgeable.totalDamageTaken * 6);
    });
  });

  describe("damageTakenTrajectory", () => {
    it("accumulates a point per boss hit (post-dodge-multiplier), starts at {0,0}, and matches totalDamageTaken at its final point", () => {
      // Same dodgeAttacker/dodgeBoss setup as the dodge-during-own-animation
      // test above: t=1 dodged (damage 1), t=2/3/4 undodged (damage 6 each,
      // inside the delayed cast window) — a known, hand-checked per-hit
      // sequence to assert the trajectory against directly, not just the total.
      const dodgeAttacker = {
        hp: 100000,
        defenseStat: 100,
        attackStat: 100,
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 100, durationSeconds: 1 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 10, energyCost: 100, durationSeconds: 3, vulnerableWindowSeconds: 3 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
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
        dodgeFastAttacks: true,
        maxSeconds: 4,
      });

      expect(result.damageTakenTrajectory).toEqual([
        { atSeconds: 0, cumulativeDamage: 0 },
        { atSeconds: 1, cumulativeDamage: 1 },
        { atSeconds: 2, cumulativeDamage: 7 },
        { atSeconds: 3, cumulativeDamage: 13 },
        { atSeconds: 4, cumulativeDamage: 19 },
      ]);
      const lastPoint = result.damageTakenTrajectory[result.damageTakenTrajectory.length - 1]!;
      expect(lastPoint.cumulativeDamage).toBe(result.totalDamageTaken);
    });

    it("pads a final point out to the run's actual end time, mirroring ownDamageTrajectory's tail-padding", () => {
      // Reuses the module's first scenario (attacker vs bossNoChargedMove),
      // which faints at exactly t=7.5 with the last boss hit landing on
      // that same tick — so the trajectory's last real point is already at
      // t=7.5 and no extra padding point is needed; this pins that the array
      // ends exactly at faintedAtSeconds either way (whether via a real hit
      // or the padding branch), matching ownDamageTrajectory's behavior.
      const stepwise = simulateStepwiseBattle({ attacker, boss: bossNoChargedMove });
      const lastPoint = stepwise.damageTakenTrajectory[stepwise.damageTakenTrajectory.length - 1]!;
      expect(lastPoint.atSeconds).toBe(stepwise.faintedAtSeconds);
      expect(lastPoint.cumulativeDamage).toBe(stepwise.totalDamageTaken);
      expect(stepwise.damageTakenTrajectory[0]).toEqual({ atSeconds: 0, cumulativeDamage: 0 });
    });

    it("is present on runStepwiseDistribution's representativeRun, alongside ownDamageTrajectory", () => {
      const distribution = runStepwiseDistribution({ attacker, boss: bossNoChargedMove }, 5);
      expect(distribution.representativeRun.damageTakenTrajectory.length).toBeGreaterThan(1);
      expect(distribution.representativeRun.damageTakenTrajectory[0]).toEqual({ atSeconds: 0, cumulativeDamage: 0 });
    });
  });

  describe("tick-alignment validation", () => {
    it("isTickAlignedDuration accepts every real move duration (multiples of 0.1s) and rejects a non-multiple", () => {
      expect(isTickAlignedDuration(3.5, 0.1)).toBe(true);
      expect(isTickAlignedDuration(1, 0.1)).toBe(true);
      expect(isTickAlignedDuration(2.2, 0.1)).toBe(true);
      // The exact case a naive `durationSeconds % tickSeconds === 0` check
      // would get wrong: 3.5 / 0.1 is not exactly 35 in IEEE 754 floating
      // point, so this must be checked in milliseconds, not raw division.
      expect(3.5 % 0.1).not.toBe(0);
      expect(isTickAlignedDuration(0.35, 0.1)).toBe(false);
    });

    it("throws when a move's durationSeconds isn't an exact multiple of the tick, instead of silently quantizing it", () => {
      const attacker = {
        hp: 1000,
        defenseStat: 100,
        attackStat: 100,
        // 0.35s doesn't divide evenly into a 0.1s tick.
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 5, energyGain: 10, durationSeconds: 0.35 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 10, energyCost: 9999, durationSeconds: 2, vulnerableWindowSeconds: 2 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
      };
      const boss = {
        attackStat: 100,
        defenseStat: 100,
        fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 5, energyGain: 0, durationSeconds: 1 },
        damageOut: { stab: false },
      };

      expect(() => simulateStepwiseBattle({ attacker, boss, maxSeconds: 2 })).toThrow(/durationSeconds=0.35/);
    });
  });

  describe("diedDuringOwnChargedMoveAnimation does not imply zero total charged damage", () => {
    it("lands one charged attack, then dies mid a SECOND cast fueled purely by damage-taken energy — the run's charged damage stays nonzero", () => {
      // Reproduces a skeptic-reported "contradiction" seen on the live
      // Comparator's default scenario (Rayquaza vs. Mega Latios,
      // 2026-09-06): the result card showed "died mid own-animation: 100%"
      // alongside a nonzero mean charged damage, which looked like a bug
      // given the app's own caveat text ("a candidate who dies mid-animation
      // lands 0 charged damage that run"). Investigation (a throwaway tsx
      // trace against the real default scenario) showed this is NOT an
      // engine bug: the attacker's own fast move here contributes zero
      // energy (energyGain=0), so all its energy comes from
      // ENERGY_PER_DAMAGE_TAKEN — enough to fire a charged move, land it,
      // and then immediately re-enter a second cast (fed by more
      // damage-taken energy accumulated mid-animation) before fainting
      // during THAT second cast. The caveat text's blanket claim is the
      // actual bug (a web-developer fix, not an engine one) — this test
      // pins the correct invariant so no future engine change "fixes" this
      // by zeroing out totalChargedDamage whenever
      // diedDuringOwnChargedMoveAnimation is true.
      //
      // Hand-traced tick-by-tick (attackStat=defenseStat=100 throughout, so
      // damage = floor(0.5*power)+1):
      //   t=1,2,3: boss fast hits (power 38 -> 20 dmg each) grant
      //     floor(20*0.5)=10 energy each; energy reaches 30 (chargedMove's
      //     cost) exactly at t=3 -> first cast starts, ends at t=5.
      //   t=4: mid-animation boss hit still lands (20 dmg) and still grants
      //     energy (10) — mid-animation only gates dodging, never the hit or
      //     the energy grant.
      //   t=5: first cast resolves (lands, power 50 -> 26 dmg), THEN this
      //     tick's boss hit lands (another +10 energy, running total 20).
      //   t=6: boss hit brings energy to 30 again -> second cast starts
      //     immediately, ends at t=8.
      //   t=7: hp has taken exactly 7*20=140 damage against hp=140 -> fatal,
      //     strictly mid the second (t=6..t=8) cast.
      const attacker = {
        hp: 140,
        defenseStat: 100,
        attackStat: 100,
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 1, energyGain: 0, durationSeconds: 1 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 50, energyCost: 30, durationSeconds: 2, vulnerableWindowSeconds: 2 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
      };
      const boss = {
        attackStat: 100,
        defenseStat: 100,
        fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 38, energyGain: 0, durationSeconds: 1 },
        damageOut: { stab: false },
      };

      const result = simulateStepwiseBattle({ attacker, boss, dodge: { kind: "none" }, maxSeconds: 10 });

      expect(result.faintedAtSeconds).toBe(7);
      expect(result.diedDuringOwnChargedMoveAnimation).toBe(true);
      // The contradiction the skeptic flagged, pinned as the CORRECT
      // combination rather than "fixed" to force totalChargedDamage to 0:
      expect(result.chargedAttacksLanded).toBe(1);
      expect(result.totalChargedDamage).toBe(26);
      expect(result.totalChargedDamage).toBeGreaterThan(0);

      // A distribution over this same (fully deterministic — no boss
      // charged move, no jitter) matchup reproduces the exact live-app
      // symptom: 100% "died mid own-animation" alongside nonzero mean
      // charged damage, across every seed, not just one unlucky run.
      const distribution = runStepwiseDistribution({ attacker, boss, dodge: { kind: "none" }, maxSeconds: 10 }, 50);
      expect(distribution.fractionDiedDuringOwnAnimation).toBe(1);
      expect(distribution.meanChargedDamage).toBe(26);
    });
  });

  describe("same-tick tie between the attacker's own charged-move animation completing and a fatal boss hit", () => {
    it("credits the charged attack landing before applying the fatal boss hit, rather than silently discarding it", () => {
      // attacker fires its own fast move at t=1 (energyGain=100 >= chargedMove
      // energyCost=100), immediately starting its 2s cast — which completes
      // (attackerAnimationEndsAt) at exactly t=3. The boss's 1s-cadence fast
      // move deals a fixed 6 damage/hit (floor(0.5*10*(100/100))+1), landing
      // at t=1,2,3 — hp=18 means the THIRD hit, at t=3, is exactly fatal, the
      // same tick the attacker's own cast finishes. isMidOwnAnimation already
      // uses a strict `<` (so a hit landing exactly at attackerAnimationEndsAt
      // is treated as "no longer mid-animation"), which only makes sense if
      // the cast is considered complete by this tick — so the charged attack
      // must be credited even though the attacker faints on the very same tick.
      const attacker = {
        hp: 18,
        defenseStat: 100,
        attackStat: 100,
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 1, energyGain: 100, durationSeconds: 1 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 50, energyCost: 100, durationSeconds: 2, vulnerableWindowSeconds: 2 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
      };
      const boss = {
        attackStat: 100,
        defenseStat: 100,
        fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 10, energyGain: 0, durationSeconds: 1 },
        damageOut: { stab: false },
      };

      const result = simulateStepwiseBattle({ attacker, boss, dodge: { kind: "none" }, maxSeconds: 5 });

      expect(result.faintedAtSeconds).toBe(3);
      expect(result.chargedAttacksLanded).toBe(1);
      expect(result.totalChargedDamage).toBeGreaterThan(0);
      // The landing wasn't mid-animation (the cast finished on this exact
      // tick) — it just happened to coincide with the fatal hit.
      expect(result.diedDuringOwnChargedMoveAnimation).toBe(false);
    });
  });

  describe("boundedJitteredChargedMoveInterval (physically impossible cadence floor)", () => {
    // rng is injected directly here (not mulberry32) so the jitter factor
    // (0.6 + rng()*0.8, i.e. the documented +/-40% range) is pinned exactly,
    // rather than depending on a seed's actual output.
    it("is a no-op when even the LOWEST possible jittered sample (mean*0.6) is already >= the floor", () => {
      const result = boundedJitteredChargedMoveInterval(10, 5, () => 0); // raw = 10*0.6 = 6
      expect(result.seconds).toBe(6);
      expect(result.wasClamped).toBe(false);
    });

    it("clamps up to exactly the floor when even the HIGHEST possible jittered sample is still below it", () => {
      const result = boundedJitteredChargedMoveInterval(1, 2, () => 1); // raw = 1*1.4 = 1.4
      expect(result.seconds).toBe(2);
      expect(result.wasClamped).toBe(true);
    });

    it("clamps to exactly the floor (never overshoots it) regardless of how far below the raw sample was", () => {
      const nearFloor = boundedJitteredChargedMoveInterval(1, 2, () => 1); // raw 1.4
      const farBelowFloor = boundedJitteredChargedMoveInterval(1, 2, () => 0); // raw 0.6
      expect(nearFloor.seconds).toBe(2);
      expect(farBelowFloor.seconds).toBe(2);
      expect(farBelowFloor.wasClamped).toBe(true);
    });
  });

  describe("physically impossible boss charged-move cadence (a boss cannot recast before its current cast finishes)", () => {
    // A shared attacker across this whole block: fast move chips 1 damage/sec
    // (floor(0.5*1)+1) and never contributes energy, and the attacker's own
    // charged move has an unreachable energy cost — so nothing this attacker
    // does complicates the boss-side timing under test. hp is set per test.
    function chipAttacker(hp: number) {
      return {
        hp,
        defenseStat: 100,
        attackStat: 100,
        fastMove: { id: "fast", name: "Fast", type: "normal" as const, power: 1, energyGain: 0, durationSeconds: 1 },
        chargedMove: { id: "charged", name: "Charged", type: "normal" as const, power: 1, energyCost: 9999, durationSeconds: 1, vulnerableWindowSeconds: 1 },
        fastDamageOut: { stab: false },
        chargedDamageOut: { stab: false },
      };
    }

    // durationSeconds=2, requested mean=1 (physically impossible: even the
    // jitter's highest possible sample, 1*1.4=1.4, is still below the 2s cast
    // time) — so every sampled interval is deterministically clamped up to
    // exactly 2s, regardless of seed. warmup=2 makes the first fire land at
    // EXACTLY t=4 (2 + 2), not somewhere in the un-clamped [2.6, 3.4] range a
    // mean of 1 would otherwise produce — this determinism is what lets this
    // whole describe block assert exact numbers instead of a distribution.
    const bossShortDuration = {
      attackStat: 100,
      defenseStat: 100,
      fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 1, energyGain: 0, durationSeconds: 1 },
      damageOut: { stab: false },
      chargedMove: { id: "boss-charged", name: "Boss Charged", type: "normal" as const, power: 100, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 },
      chargedMoveDamageOut: { stab: false },
      chargedMoveMeanIntervalSeconds: 1,
      chargedMoveWarmupSeconds: 2,
    };

    // A second boss with a DIFFERENT charged-move duration (4s, not 2s), so
    // the fix is proven against more than one hardcoded duration — mean=1.5
    // is likewise physically impossible (highest sample 1.5*1.4=2.1 < 4s),
    // clamped deterministically to exactly 4s every time. First fire lands at
    // EXACTLY t=7 (3 + 4).
    const bossLongDuration = {
      attackStat: 100,
      defenseStat: 100,
      fastMove: { id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 1, energyGain: 0, durationSeconds: 1 },
      damageOut: { stab: false },
      chargedMove: { id: "boss-charged", name: "Boss Charged", type: "normal" as const, power: 100, energyCost: 50, durationSeconds: 4, vulnerableWindowSeconds: 4 },
      chargedMoveDamageOut: { stab: false },
      chargedMoveMeanIntervalSeconds: 1.5,
      chargedMoveWarmupSeconds: 3,
    };

    it("a cadence at/above the move's own duration is unaffected (never clamps) — the default 15s UI cadence against any real move duration", () => {
      // mean=10 against a 2s cast: the lowest possible jittered sample is
      // 10*0.6=6, comfortably above the 2s floor, so this can NEVER clamp —
      // not just "didn't happen to clamp in this run." Swept across many
      // seeds via runStepwiseDistribution to make that "never" claim over
      // the actual sampling path, not just a single lucky seed.
      const bossAboveFloor = { ...bossShortDuration, chargedMoveMeanIntervalSeconds: 10 };
      const distribution = runStepwiseDistribution(
        { attacker: chipAttacker(100000), boss: bossAboveFloor, maxSeconds: 60 },
        50,
      );
      expect(distribution.bossChargedMoveCadenceClamped).toBe(false);
      expect(distribution.bossChargedMoveEffectiveMinIntervalSeconds).toBe(10);
    });

    it("a cadence below the move's own duration is clamped: the boss's charged hits land durationSeconds apart, not at the requested (impossible) cadence, and the clamp is reported on the result", () => {
      const result = simulateStepwiseBattle({
        attacker: chipAttacker(100000), // never faints — isolates the boss's own hit timing
        boss: bossShortDuration,
        dodge: { kind: "none" },
        maxSeconds: 12,
      });

      expect(result.bossChargedMoveCadenceClamped).toBe(true);

      // Charged hits (undodged: floor(0.5*100)+1 = 51) are the only jumps
      // this large — the fast-move chip is always exactly 1 damage/hit — so
      // filtering the trajectory for 51-sized jumps recovers the boss's
      // actual charged-move firing times.
      const chargedHitTimes: number[] = [];
      for (let i = 1; i < result.damageTakenTrajectory.length; i++) {
        const jump = result.damageTakenTrajectory[i]!.cumulativeDamage - result.damageTakenTrajectory[i - 1]!.cumulativeDamage;
        if (jump === 51) chargedHitTimes.push(result.damageTakenTrajectory[i]!.atSeconds);
      }

      // Requested cadence was 1s; the physical floor is this move's own 2s
      // cast time. If the bug were still present, the first hit would land
      // somewhere in the un-clamped [2.6, 3.4] window and subsequent hits
      // would be ~1s apart — landing exactly on 2s multiples starting at t=4
      // is only possible because of the clamp.
      expect(chargedHitTimes).toEqual([4, 6, 8, 10, 12]);

      const distribution = runStepwiseDistribution({ attacker: chipAttacker(100000), boss: bossShortDuration, maxSeconds: 12 }, 20);
      expect(distribution.bossChargedMoveCadenceClamped).toBe(true);
      expect(distribution.bossChargedMoveEffectiveMinIntervalSeconds).toBe(2); // max(requested 1, duration 2)
    });

    it("REGRESSION: dodge:perfect now measurably outperforms dodge:none at an impossible sub-duration cadence, across two bosses with different charged-move durations", () => {
      // Before this fix, a cadence below the charged move's own cast time
      // let casts overlap with no gap between them, making a dodge land
      // during what the model treated as an already-resolved hit window —
      // netting an identical outcome to not dodging at all. This is the
      // exact defect reported against Regirock's 2.5s Stone Edge requested
      // at a 2s cadence, reproduced here with two distinct synthetic
      // durations (2s and 4s) instead of hardcoding 2.5s.
      for (const [boss, hp, maxSeconds] of [
        [bossShortDuration, 180, 20] as const,
        [bossLongDuration, 100, 25] as const,
      ]) {
        const withoutDodge = simulateStepwiseBattle({
          attacker: chipAttacker(hp),
          boss,
          dodge: { kind: "none" },
          maxSeconds,
        });
        const withPerfectDodge = simulateStepwiseBattle({
          attacker: chipAttacker(hp),
          boss,
          dodge: { kind: "perfect" },
          maxSeconds,
        });

        expect(withoutDodge.bossChargedMoveCadenceClamped).toBe(true);
        expect(withPerfectDodge.bossChargedMoveCadenceClamped).toBe(true);

        // Undodged charged hits alone vastly exceed hp well before maxSeconds;
        // perfectly-dodged charged hits (quartered) plus the 1/sec chip stay
        // comfortably under hp for the whole window — a wide enough margin
        // that this holds regardless of exactly which tick each hit resolves
        // on, without needing to hand-derive the full tick-by-tick sequence.
        expect(withoutDodge.survivedFullWindow).toBe(false);
        expect(withPerfectDodge.survivedFullWindow).toBe(true);
      }
    });
  });

  describe("dodgeFastAttacksLockout", () => {
    // Reported against Mega Tyranitar's Bite (real durationMs: 500, i.e.
    // exactly DODGE_COST_SECONDS) — an attacker with dodgeFastAttacks:true
    // appeared to do literally nothing. Diagnosis: correct, not a bug. Every
    // dodge attempt pushes the attacker's own next fast-move eligibility
    // later by DODGE_COST_SECONDS (see the main hit-handling block above);
    // if the boss's fast move recycles at least that often, that push
    // arrives at least as fast as real time elapses, so eligibility can
    // never catch up on its own — only the attacker's own charged-move cast
    // (which doesn't attempt to dodge while it plays out) can close the gap.
    // quickBossFastMove mirrors Bite's real numbers (power 6, 500ms) against
    // this file's shared `attacker`/BOSS_TIDE stats.
    const quickBossFastMove = (power: number, durationSeconds: number) => ({
      id: `test-quick-fast-${power}-${durationSeconds}`,
      name: "Test Quick Fast",
      type: "water" as const,
      power,
      energyGain: 4,
      durationSeconds,
    });
    const quickBoss = (power: number, durationSeconds: number) => ({
      attackStat: bossAttack,
      defenseStat: bossDefense,
      fastMove: quickBossFastMove(power, durationSeconds),
      damageOut: { stab: true, typeEffectiveness: bossVsAlpha },
    });

    it("flags true, and this specific matchup provably does zero fast AND zero charged damage for the whole run", () => {
      // power=6 mirrors Bite. Chip energy from dodged hits (floor(floor(15*0.25)*0.5) = 1/hit)
      // does accumulate, but by the time it reaches Volt Slam's 45-energy
      // cost the attacker has already spent 135 of its 150 HP getting
      // there (dodged damage taken en route) — leaving only 15 HP of margin
      // against the FULL, UNDODGED damage a boss hit deals while the
      // attacker is mid-own-cast (see the "never lets a dodge reduce
      // damage... mid-animation" test above), which is fatal before the
      // cast can complete. Zero fast attacks AND zero charged attacks is a
      // real, reachable outcome, not just a theoretical limit.
      const result = simulateStepwiseBattle({
        attacker,
        boss: quickBoss(6, 0.5),
        dodge: { kind: "none" },
        dodgeFastAttacks: true,
        seed: 1,
      });
      expect(result.dodgeFastAttacksLockout).toBe(true);
      expect(result.totalFastMoveDamage).toBe(0);
      expect(result.chargedAttacksLanded).toBe(0);
      expect(result.totalChargedDamage).toBe(0);
      expect(result.diedDuringOwnChargedMoveAnimation).toBe(true);
      expect(result.survivedFullWindow).toBe(false);
      expect(result.faintedAtSeconds).toBe(23);
    });

    it("is false for the identical boss when dodgeFastAttacks is off — the flag reflects the CONFIGURATION, not just this boss", () => {
      const result = simulateStepwiseBattle({
        attacker,
        boss: quickBoss(6, 0.5),
        dodge: { kind: "none" },
        dodgeFastAttacks: false,
        seed: 1,
      });
      expect(result.dodgeFastAttacksLockout).toBe(false);
    });

    it("does NOT imply zero fast-move damage in general — a charged-move cast that survives to completion lets attacks through around it", () => {
      // Same 0.5s cadence (still exactly at the DODGE_COST_SECONDS boundary,
      // so still flagged), but a weaker fast move (power 3 instead of 6)
      // leaves enough HP margin for the attacker's charged-move cast to
      // survive to completion: one Arc Spark and one Volt Slam land before
      // it eventually faints to accumulated chip damage.
      const result = simulateStepwiseBattle({
        attacker,
        boss: quickBoss(3, 0.5),
        dodge: { kind: "none" },
        dodgeFastAttacks: true,
        seed: 1,
      });
      expect(result.dodgeFastAttacksLockout).toBe(true);
      expect(result.totalFastMoveDamage).toBeGreaterThan(0);
      expect(result.totalFastMoveDamage).toBe(5); // one Arc Spark hit
      expect(result.chargedAttacksLanded).toBe(1);
      expect(result.totalChargedDamage).toBe(171); // one Volt Slam hit
      expect(result.diedDuringOwnChargedMoveAnimation).toBe(false);
      expect(result.faintedAtSeconds).toBe(28.5);
    });

    it("flips off, and fast-move throughput meaningfully recovers, just above the DODGE_COST_SECONDS boundary", () => {
      const result = simulateStepwiseBattle({
        attacker,
        boss: quickBoss(6, 0.6),
        dodge: { kind: "none" },
        dodgeFastAttacks: true,
        seed: 1,
      });
      expect(result.dodgeFastAttacksLockout).toBe(false);
      expect(result.totalFastMoveDamage).toBeGreaterThan(0);
    });

    it("is a config-level fact, not a per-seed sample — aggregated onto DistributionSummary the same way for every run", () => {
      const distribution = runStepwiseDistribution(
        { attacker, boss: quickBoss(6, 0.5), dodge: { kind: "none" }, dodgeFastAttacks: true, maxSeconds: 30 },
        5,
      );
      expect(distribution.dodgeFastAttacksLockout).toBe(true);
      expect(distribution.representativeRun.dodgeFastAttacksLockout).toBe(true);
    });
  });
});
