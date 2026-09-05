import { describe, expect, it } from "vitest";
import { simulateOpeningBurst } from "../src/combat.js";
import { isTickAlignedDuration, runStepwiseDistribution, simulateStepwiseBattle } from "../src/simulate.js";
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
  // Static Shock and Wild Charge are both Electric, so the same type-effectiveness applies to both.
  fastDamageOut: { stab: true, typeEffectiveness: xVsBoss, megaBoostMultiplier: MEGA_RAICHU_X.boost!.multiplier },
  chargedDamageOut: { stab: true, typeEffectiveness: xVsBoss, megaBoostMultiplier: MEGA_RAICHU_X.boost!.multiplier },
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
        chargedMove: { id: "boss-charged", name: "Boss Charged", type: "normal" as const, power: 1, energyCost: 9999, durationSeconds: 1, vulnerableWindowSeconds: 1 },
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
      const bossChargedMove = {
        id: "boss-charged",
        name: "Boss Charged",
        type: "normal" as const,
        power: 10,
        energyCost: 1,
        durationSeconds: 100,
        vulnerableWindowSeconds: 100,
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
      // which faints at exactly t=10.0 with the last boss hit landing on
      // that same tick — so the trajectory's last real point is already at
      // t=10 and no extra padding point is needed; this pins that the array
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
});
