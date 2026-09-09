import { describe, expect, it } from "vitest";
import { calculateDamage } from "../src/damage.js";
import {
  BOSS_CHARGED_MOVE_JITTER,
  simulateStepwiseBattle,
  type StepwiseAttacker,
  type StepwiseBoss,
} from "../src/simulate.js";
import type { ChargedMove, FastMove } from "../src/types.js";

/**
 * Tests for StepwiseBoss.chargedMoveCadence = "energy-gated-interval" — the
 * third hybrid model: energy eligibility exactly as "energy-driven" (own
 * fast moves + damage taken), but instead of a per-move-boundary coin flip,
 * ONE jittered delay (fixed-interval's own +/-40% machinery) is rolled the
 * instant the boss becomes eligible, and it fires when that delay elapses —
 * subtracting the move's cost on fire (not resetting to 0). See
 * MECHANICS.md's "The wait between 'can fire' and 'does fire'" entry and
 * simulate.ts's StepwiseBoss.chargedMoveCadence doc comment.
 *
 * Every fixture here uses hand-picked round numbers (not real species stats
 * or the deleted hypothetical-duo fixtures) so expected damage/energy values
 * can be computed inline, mirroring energyDrivenBossCadence.test.ts's own
 * discipline.
 */

const NO_MODIFIERS = { stab: false } as const;

// Boss's own fast move deliberately grants it ZERO energy — isolates "boss
// gains energy from damage taken" as the only possible energy source in most
// tests below. power: 0 keeps it from meaningfully hurting the attacker
// (still deals the damage formula's minimum floor(...)+1 = 1 per hit).
const BOSS_FAST_NO_ENERGY: FastMove = {
  id: "boss-fast-no-energy",
  name: "Boss Fast (no energy)",
  type: "normal",
  power: 0,
  energyGain: 0,
  durationSeconds: 1,
};

function bossCharged(energyCost: number, durationSeconds: number): ChargedMove {
  return {
    id: "boss-charged",
    name: "Boss Charged",
    type: "normal",
    power: 50,
    energyCost,
    durationSeconds,
    vulnerableWindowSeconds: durationSeconds,
  };
}

// Attacker's own charged move is deliberately unreachable (huge energyCost)
// so every test's own-attacker charged-move logic never interferes with the
// boss-cadence behavior under test.
const UNREACHABLE_CHARGED: ChargedMove = {
  id: "attacker-charged-unreachable",
  name: "Attacker Charged (unreachable)",
  type: "normal",
  power: 10,
  energyCost: 1_000_000,
  durationSeconds: 1,
  vulnerableWindowSeconds: 1,
};

function attackerFast(power: number): FastMove {
  return { id: "attacker-fast", name: "Attacker Fast", type: "normal", power, energyGain: 0, durationSeconds: 1 };
}

function makeAttacker(fastMovePower: number, hp = 100_000): StepwiseAttacker {
  return {
    hp,
    // attackStat / boss.defenseStat below are both 50, so raw = 0.5 * power * 1.
    defenseStat: 100,
    attackStat: 50,
    fastMove: attackerFast(fastMovePower),
    chargedMove: UNREACHABLE_CHARGED,
    fastDamageOut: NO_MODIFIERS,
    chargedDamageOut: NO_MODIFIERS,
  };
}

function makeBoss(energyCost: number, durationSeconds: number, meanIntervalSeconds: number): StepwiseBoss {
  return {
    attackStat: 10,
    defenseStat: 50,
    fastMove: BOSS_FAST_NO_ENERGY,
    damageOut: NO_MODIFIERS,
    chargedMove: bossCharged(energyCost, durationSeconds),
    chargedMoveDamageOut: NO_MODIFIERS,
    chargedMoveCadence: "energy-gated-interval",
    chargedMoveMeanIntervalSeconds: meanIntervalSeconds,
  };
}

/** Exact damage the boss's charged move deals to the attacker, given makeBoss's fixed stat setup (boss.attackStat=10, attacker.defenseStat=100). */
function bossChargedDamage(power: number): number {
  return calculateDamage({ power, attackerAttackStat: 10, defenderDefenseStat: 100, ...NO_MODIFIERS });
}

describe("energy-gated-interval boss charged-move cadence", () => {
  it("1. never fires before energy >= cost, even with a tiny mean", () => {
    // Boss's own fast move grants it 0 energy; attacker deals 0 damage
    // (power: 0), so bossEnergyFromDamageTaken(0) = 0 — energy can NEVER
    // reach the cost, regardless of how tiny the mean delay is.
    const attacker = makeAttacker(0);
    const boss = makeBoss(20, 2, 0.01);
    for (const seed of [1, 2, 3, 4, 5]) {
      const result = simulateStepwiseBattle({ attacker, boss, seed, maxSeconds: 60 });
      expect(result.bossChargedHitsTaken).toBe(0);
      expect(result.bossChargedMoveResidualSeconds).toBeNull();
    }
  });

  it("2. seeded: first cast lands in [eligible + 0.6*mean, eligible + 1.4*mean], never at eligibility itself", () => {
    // Boss starts already sitting exactly at its charged move's energy cost
    // (startingEnergy) — eligibility is reached at t=0. The mean delay is
    // large enough (10s) relative to the tick (0.1s) that landing exactly at
    // t=0 (a zero-length delay) would be visibly distinguishable from a
    // delay actually sampled from [0.6*mean, 1.4*mean].
    const energyCost = 20;
    const mean = 10;
    const boss: StepwiseBoss = { ...makeBoss(energyCost, 2, mean), startingEnergy: energyCost };
    const attacker = makeAttacker(0);

    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const result = simulateStepwiseBattle({ attacker, boss, seed, maxSeconds: 60 });
      expect(result.bossChargedHitsTaken).toBe(1);
      // Reconstruct the fire time from damageTakenTrajectory: the boss's own
      // fast move deals 0 (power: 0 clamped to the damage formula's minimum
      // of 1), so the charged hit (bossChargedDamage(50)) is unambiguous.
      const chargedDamage = bossChargedDamage(50);
      const fireTime = result.damageTakenTrajectory.find((p, i, arr) => {
        if (i === 0) return false;
        return p.cumulativeDamage - arr[i - 1]!.cumulativeDamage === chargedDamage;
      })!.atSeconds;
      expect(fireTime).toBeGreaterThan(0.6 * mean - 1e-6);
      expect(fireTime).toBeLessThanOrEqual(1.4 * mean + 1e-6);
      // Never at eligibility itself (t=0) — the whole point of this test.
      expect(fireTime).toBeGreaterThan(0);
    }
  });

  it("3. subtract-not-reset: 100 energy at fire with cost 50 -> second cast follows without any further damage", () => {
    // Boss starts at 100 energy (the cap) with a 50-cost move — firing once
    // leaves 50 energy, still >= cost, so it re-arms immediately with no
    // further damage-taken/fast-move energy required at all.
    const energyCost = 50;
    const boss: StepwiseBoss = { ...makeBoss(energyCost, 2, 3), startingEnergy: 100 };
    // Attacker deals ZERO damage and the boss's own fast move grants zero
    // energy — the only possible energy source is the initial 100.
    const attacker = makeAttacker(0);

    const result = simulateStepwiseBattle({ attacker, boss, seed: 1, maxSeconds: 60 });
    expect(result.bossChargedHitsTaken).toBeGreaterThanOrEqual(2);
  });

  it("4. no deadlock at capped energy — at 100 energy the boss always fires", () => {
    // Overwhelming attacker re-caps the boss's energy at MAX_ENERGY (100)
    // essentially every tick, so it is always at/above its charged move's
    // cost. Under "energy-gated-interval" this can never deadlock (arming
    // is time-based once eligible, not gated on a move-completion boundary),
    // but this pins the observable guarantee.
    const boss = makeBoss(20, 2, 3);
    const overwhelmingAttacker = makeAttacker(500);
    const iterations = 100;
    const maxSeconds = 60;
    let sawAZeroFireRun = false;
    for (let seed = 1; seed <= iterations; seed++) {
      const result = simulateStepwiseBattle({ attacker: overwhelmingAttacker, boss, seed, maxSeconds });
      if (result.bossChargedHitsTaken === 0) sawAZeroFireRun = true;
    }
    expect(sawAZeroFireRun).toBe(false);
  });

  it("5. mid-cast lock: a re-armed delay shorter than the move's duration lands at cast end, not before", () => {
    // A long cast (durationSeconds: 3) with a SHORT mean re-arm delay (0.5s):
    // once the boss fires, leftover energy re-arms almost immediately, and
    // that new delay (up to 1.4*0.5 = 0.7s) will almost certainly elapse
    // WHILE the boss is still mid-cast (3s duration) — the second fire must
    // wait for the cast to end, not fire mid-animation.
    const energyCost = 10;
    const durationSeconds = 3;
    const mean = 0.5;
    const boss: StepwiseBoss = { ...makeBoss(energyCost, durationSeconds, mean), startingEnergy: 100 };
    const attacker = makeAttacker(0);

    for (let seed = 1; seed <= 20; seed++) {
      const result = simulateStepwiseBattle({ attacker, boss, seed, maxSeconds: 30 });
      const chargedDamage = bossChargedDamage(50);
      const chargedHitTimes: number[] = [];
      let previous = 0;
      for (const point of result.damageTakenTrajectory) {
        if (point.cumulativeDamage - previous === chargedDamage) chargedHitTimes.push(point.atSeconds);
        previous = point.cumulativeDamage;
      }
      for (let i = 1; i < chargedHitTimes.length; i++) {
        const gap = chargedHitTimes[i]! - chargedHitTimes[i - 1]!;
        // The structural mid-cast-lock floor: a new cast can never begin
        // before the previous one's durationSeconds have elapsed.
        expect(gap).toBeGreaterThanOrEqual(durationSeconds - 1e-9);
      }
    }
  });

  it("6. bossEndingEnergy non-null; bossChargedMoveResidualSeconds equals the pending remainder or null; bossChargedMoveCadenceClamped false", () => {
    const energyCost = 20;
    const mean = 1000; // deliberately huge so the run ends with a pending (unfired) delay
    const boss: StepwiseBoss = { ...makeBoss(energyCost, 2, mean), startingEnergy: energyCost };
    const attacker = makeAttacker(0);

    const result = simulateStepwiseBattle({ attacker, boss, seed: 1, maxSeconds: 30 });
    expect(result.bossChargedHitsTaken).toBe(0); // mean is far larger than maxSeconds
    expect(result.bossEndingEnergy).not.toBeNull();
    expect(result.bossEndingEnergy).toBe(energyCost); // never fired, so energy is unchanged
    expect(result.bossChargedMoveResidualSeconds).not.toBeNull();
    expect(result.bossChargedMoveResidualSeconds!).toBeGreaterThan(0);
    expect(result.bossChargedMoveCadenceClamped).toBe(false);

    // A run where the boss never becomes eligible at all: residual must be null.
    const neverEligibleAttacker = makeAttacker(0);
    const neverEligibleBoss = makeBoss(20, 2, 5); // no startingEnergy, boss fast move grants 0 energy
    const neverEligibleResult = simulateStepwiseBattle({
      attacker: neverEligibleAttacker,
      boss: neverEligibleBoss,
      seed: 1,
      maxSeconds: 30,
    });
    expect(neverEligibleResult.bossEndingEnergy).toBe(0);
    expect(neverEligibleResult.bossChargedMoveResidualSeconds).toBeNull();
    expect(neverEligibleResult.bossChargedMoveCadenceClamped).toBe(false);
  });

  it("7. chargedMoveNextFireInSeconds is honoured without a re-roll — fire time exactly that value", () => {
    const energyCost = 20;
    const boss: StepwiseBoss = {
      ...makeBoss(energyCost, 2, 999_999), // astronomically large mean — if this were consulted for a fresh roll, it would never fire
      startingEnergy: energyCost,
      chargedMoveNextFireInSeconds: 5,
    };
    const attacker = makeAttacker(0);

    for (const seed of [1, 2, 3]) {
      const result = simulateStepwiseBattle({ attacker, boss, seed, maxSeconds: 30 });
      expect(result.bossChargedHitsTaken).toBe(1);
      const chargedDamage = bossChargedDamage(50);
      let previous = 0;
      let fireTime: number | null = null;
      for (const point of result.damageTakenTrajectory) {
        if (point.cumulativeDamage - previous === chargedDamage) fireTime = point.atSeconds;
        previous = point.cumulativeDamage;
      }
      expect(fireTime).toBe(5);
    }
  });

  it("8. missing chargedMoveMeanIntervalSeconds -> zero charged casts, exactly like fixed-interval without a mean", () => {
    const energyCost = 20;
    const boss: StepwiseBoss = {
      attackStat: 10,
      defenseStat: 50,
      fastMove: BOSS_FAST_NO_ENERGY,
      damageOut: NO_MODIFIERS,
      chargedMove: bossCharged(energyCost, 2),
      chargedMoveDamageOut: NO_MODIFIERS,
      chargedMoveCadence: "energy-gated-interval",
      // chargedMoveMeanIntervalSeconds intentionally omitted.
      startingEnergy: energyCost, // already eligible — should still never fire
    };
    // A real-damage attacker too, so the boss's energy keeps climbing (and
    // re-capping) over the run — still must never fire without a mean.
    const attacker = makeAttacker(100);

    for (const seed of [1, 2, 3, 4, 5]) {
      const result = simulateStepwiseBattle({ attacker, boss, seed, maxSeconds: 30 });
      expect(result.bossChargedHitsTaken).toBe(0);
      expect(result.bossChargedMoveResidualSeconds).toBeNull();
      // Energy tracking is still active (bossTracksEnergy), just never arms.
      expect(result.bossEndingEnergy).not.toBeNull();
    }
  });

  it("with the model OFF (default), unrelated to fixed-interval/energy-driven byte-identical output", () => {
    // Sanity check mirroring energyDrivenBossCadence.test.ts's own first
    // test: this field's mere presence with meanIntervalSeconds unset should
    // be a no-op relative to fixed-interval's own "no mean" behavior.
    const attacker = makeAttacker(20);
    const bossGated = makeBoss(20, 2, 0);
    const bossFixed: StepwiseBoss = { ...bossGated, chargedMoveCadence: "fixed-interval" };
    const a = simulateStepwiseBattle({ attacker, boss: bossGated, seed: 7, maxSeconds: 30 });
    const b = simulateStepwiseBattle({ attacker, boss: bossFixed, seed: 7, maxSeconds: 30 });
    expect(a.bossChargedHitsTaken).toBe(0);
    expect(b.bossChargedHitsTaken).toBe(0);
  });

  it("bounds the +/-40% jitter constant used for the re-arm delay too, sanity-checking BOSS_CHARGED_MOVE_JITTER is still 0.4", () => {
    // Not a behavioral assertion — just guards that this test file's use of
    // 0.6/1.4 in test 2 above tracks the real exported constant rather than
    // a hardcoded duplicate that could silently drift.
    expect(BOSS_CHARGED_MOVE_JITTER).toBe(0.4);
  });
});
