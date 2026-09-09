import { describe, expect, it } from "vitest";
import { calculateDamage } from "../src/damage.js";
import { bossEnergyFromDamageTaken } from "../src/energy.js";
import {
  BOSS_CHARGED_MOVE_USE_PROBABILITY,
  simulateStepwiseBattle,
  type StepwiseAttacker,
  type StepwiseBoss,
} from "../src/simulate.js";
import type { ChargedMove, FastMove } from "../src/types.js";

/**
 * Tests for StepwiseBoss.chargedMoveCadence = "energy-driven" — the boss-side
 * energy accumulation + 50% instant-decision model described in MECHANICS.md's
 * "Raid boss behaviour" section. Every fixture here uses hand-picked round
 * numbers (not real species stats) so expected damage/energy values can be
 * computed inline rather than needing a hypothetical-duo-style shared fixture.
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

function makeBoss(energyCost: number, durationSeconds = 2): StepwiseBoss {
  return {
    attackStat: 10,
    defenseStat: 50,
    fastMove: BOSS_FAST_NO_ENERGY,
    damageOut: NO_MODIFIERS,
    chargedMove: bossCharged(energyCost, durationSeconds),
    chargedMoveDamageOut: NO_MODIFIERS,
    chargedMoveCadence: "energy-driven",
  };
}

/** Exact per-hit damage the attacker's fast move deals to this boss, given makeAttacker/makeBoss's fixed stat setup (attackStat=50, boss.defenseStat=50). */
function attackerFastDamage(power: number): number {
  return calculateDamage({ power, attackerAttackStat: 50, defenderDefenseStat: 50, ...NO_MODIFIERS });
}

describe("energy-driven boss charged-move cadence", () => {
  it("with the model OFF (default), results are byte-identical to the fixed-interval path", () => {
    const attacker = makeAttacker(20);
    const bossEnergyDriven = makeBoss(20);
    const bossDefaultCadence: StepwiseBoss = { ...bossEnergyDriven, chargedMoveCadence: undefined };
    const bossExplicitlyFixed: StepwiseBoss = { ...bossEnergyDriven, chargedMoveCadence: "fixed-interval" };

    // Neither has chargedMoveMeanIntervalSeconds set, so both should fall
    // back to the pre-existing "no charged-move timing configured" behavior
    // (boss never uses its charged move at all) — proving the new field is
    // additive, not a behavior change by mere presence.
    const a = simulateStepwiseBattle({ attacker, boss: bossDefaultCadence, seed: 7, maxSeconds: 30 });
    const b = simulateStepwiseBattle({ attacker, boss: bossExplicitlyFixed, seed: 7, maxSeconds: 30 });
    expect(a).toEqual(b);
    expect(a.bossChargedHitsTaken).toBe(0);
  });

  it("boss energy accrues from damage taken, not just its own fast moves", () => {
    // Boss's own fast move grants it 0 energy (BOSS_FAST_NO_ENERGY). An
    // attacker dealing only 1 damage per hit contributes bossEnergyFromDamageTaken(1) = 0
    // (floor(0.5) = 0) — so with power: 0, the boss's energy can NEVER reach
    // its cost, and the decision gate (bossEnergy >= cost) is never satisfied,
    // so rng() is never even called. This must hold deterministically for
    // every seed.
    const harmlessAttacker = makeAttacker(0);
    const boss = makeBoss(20);
    for (const seed of [1, 2, 3, 4, 5]) {
      const result = simulateStepwiseBattle({ attacker: harmlessAttacker, boss, seed, maxSeconds: 60 });
      expect(result.bossChargedHitsTaken).toBe(0);
    }

    // The SAME boss config, but the attacker now deals real damage per hit —
    // this is the only thing that changed, and it's damage TAKEN (the boss's
    // own fast move still grants 0 energy). Energy-per-hit exceeds the boss's
    // cost of 20 immediately (see attackerFastDamage(50) below), so across
    // many seeds the boss should fire its charged move at least once in most
    // runs.
    const realAttacker = makeAttacker(100);
    expect(bossEnergyFromDamageTaken(attackerFastDamage(100))).toBeGreaterThanOrEqual(20);
    let firedAtLeastOnce = 0;
    const iterations = 50;
    for (let seed = 1; seed <= iterations; seed++) {
      const result = simulateStepwiseBattle({ attacker: realAttacker, boss, seed, maxSeconds: 30 });
      if (result.bossChargedHitsTaken > 0) firedAtLeastOnce += 1;
    }
    // The trigger is the BOSS's own move-completion boundaries (its fast
    // move lands once per second here, via BOSS_FAST_NO_ENERGY's
    // durationSeconds: 1), not "once per attacker hit" — but this fixture's
    // boss fast-move cadence happens to equal the attacker's (both 1s), so
    // there are still ~29 independent decision opportunities per 30s run.
    // Energy accumulated from the attacker's hit up through the PREVIOUS
    // tick is what's visible at each boundary (a same-tick hit lands after
    // the boss's own decision check runs — see simulate.ts's module doc
    // comment on tick-quantization), so the chance of a run with ZERO fires
    // is still astronomically small — this should be at/near 50/50.
    expect(firedAtLeastOnce).toBeGreaterThan(iterations * 0.9);
  });

  it("a higher-DPS attacker causes measurably more boss charged moves in the same window — the headline behavior", () => {
    const boss = makeBoss(20, 2);
    const lowDpsAttacker = makeAttacker(5); // attackerFastDamage(5) is small
    const highDpsAttacker = makeAttacker(100); // attackerFastDamage(100) is large

    const iterations = 60;
    const maxSeconds = 60;
    let lowDpsTotalCharged = 0;
    let highDpsTotalCharged = 0;
    for (let seed = 1; seed <= iterations; seed++) {
      lowDpsTotalCharged += simulateStepwiseBattle({ attacker: lowDpsAttacker, boss, seed, maxSeconds }).bossChargedHitsTaken;
      highDpsTotalCharged += simulateStepwiseBattle({ attacker: highDpsAttacker, boss, seed, maxSeconds }).bossChargedHitsTaken;
    }
    const meanLowDps = lowDpsTotalCharged / iterations;
    const meanHighDps = highDpsTotalCharged / iterations;

    expect(meanHighDps).toBeGreaterThan(meanLowDps);
    // Not just "more" — meaningfully more, since this is the product's
    // headline penalize-the-glass-cannon effect, not a rounding artifact.
    expect(meanHighDps).toBeGreaterThan(meanLowDps * 2);
  });

  it("the 50% roll is honoured statistically, and is reproducible for a fixed seed", () => {
    // Constructed so exactly ONE decision opportunity exists per run: the
    // trigger is a boss MOVE-COMPLETION BOUNDARY (see
    // StepwiseBoss.chargedMoveCadence), not "energy changed" or "attacker
    // just hit" — so this fixture starts the boss already sitting exactly at
    // its charged move's energy cost (startingEnergy) and lets its own FIRST
    // fast-move landing (t=1s, from BOSS_FAST_NO_ENERGY's durationSeconds: 1)
    // be that one boundary. maxSeconds ends the run immediately after, so
    // bossChargedHitsTaken is 0 or 1 per run — a direct sample of the
    // BOSS_CHARGED_MOVE_USE_PROBABILITY coin flip.
    const attacker = makeAttacker(0);
    const energyCost = 20;
    const boss: StepwiseBoss = { ...makeBoss(energyCost, 2), startingEnergy: energyCost };

    const iterations = 2000;
    let fired = 0;
    for (let seed = 1; seed <= iterations; seed++) {
      const result = simulateStepwiseBattle({ attacker, boss, seed, maxSeconds: 1.05 });
      expect(result.bossChargedHitsTaken).toBeLessThanOrEqual(1);
      if (result.bossChargedHitsTaken === 1) fired += 1;
    }
    const empiricalRate = fired / iterations;
    // 2000 samples of a p=0.5 Bernoulli has a standard deviation of
    // ~0.011 — +/-0.05 is a > 4-sigma band, generous enough to not be flaky
    // while still meaningfully testing the rate isn't, say, 0% or 100%.
    expect(empiricalRate).toBeGreaterThan(BOSS_CHARGED_MOVE_USE_PROBABILITY - 0.05);
    expect(empiricalRate).toBeLessThan(BOSS_CHARGED_MOVE_USE_PROBABILITY + 0.05);

    // Reproducibility: the same seed always reproduces the same outcome.
    const a = simulateStepwiseBattle({ attacker, boss, seed: 42, maxSeconds: 1.05 });
    const b = simulateStepwiseBattle({ attacker, boss, seed: 42, maxSeconds: 1.05 });
    expect(a).toEqual(b);
  });

  it("never permanently stalls once boss energy pins at MAX_ENERGY — the deadlock regression", () => {
    // Reproduces the reported bug scenario: an attacker overwhelming enough
    // that the boss's energy re-caps at MAX_ENERGY (100) after every single
    // damage-taken tick, so it is ALWAYS at or above its charged move's cost
    // at every one of its own move-completion boundaries. Under the old
    // "only re-roll when bossEnergy changes since the last attempt" trigger,
    // the first failed roll left the boss pinned and it could never roll
    // again for the rest of the fight (measured: 101/200 seeded 60s runs
    // with zero charged moves fired). Under the move-completion-boundary
    // trigger, the boss's own fast move keeps completing on schedule
    // regardless of its energy total, so a fresh decision opportunity always
    // arrives — no run should ever end with zero charged moves fired.
    const boss = makeBoss(20, 2);
    const overwhelmingAttacker = makeAttacker(500);

    const iterations = 200;
    const maxSeconds = 60;
    let totalFires = 0;
    let sawAZeroFireRun = false;
    for (let seed = 1; seed <= iterations; seed++) {
      const result = simulateStepwiseBattle({ attacker: overwhelmingAttacker, boss, seed, maxSeconds });
      totalFires += result.bossChargedHitsTaken;
      if (result.bossChargedHitsTaken === 0) sawAZeroFireRun = true;
    }
    expect(sawAZeroFireRun).toBe(false);
    // Not just "at least once" — repeated firing across the 60s window,
    // proving the boss keeps getting fresh decision opportunities rather
    // than firing once and then going silent for the rest of the fight.
    expect(totalFires / iterations).toBeGreaterThan(5);
  });

  it("does not inflate the per-tick fire rate — bounded by the cadence floor, nowhere near 100%/second", () => {
    // Same overwhelming-attacker setup as the deadlock regression above (the
    // boss is eligible to roll at essentially every one of its own
    // move-completion boundaries), which is exactly the condition an
    // accidental per-tick re-roll (rather than per-event) would inflate most
    // visibly. The structural cadence floor (a new cast can't start before
    // the previous one's durationSeconds has elapsed) caps the maximum
    // possible charged hits in `maxSeconds` at maxSeconds / durationSeconds —
    // nowhere near the ~600 a 100ms-tick re-roll over 60s could produce.
    const chargedMoveDurationSeconds = 2;
    const boss = makeBoss(20, chargedMoveDurationSeconds);
    const overwhelmingAttacker = makeAttacker(500);
    const maxSeconds = 60;
    const structuralMax = maxSeconds / chargedMoveDurationSeconds;

    for (let seed = 1; seed <= 50; seed++) {
      const result = simulateStepwiseBattle({ attacker: overwhelmingAttacker, boss, seed, maxSeconds });
      expect(result.bossChargedHitsTaken).toBeLessThanOrEqual(structuralMax);
    }
  });

  it("chains back-to-back charged moves when damage-taken energy completes the requirement mid-cast, and never violates the cadence floor", () => {
    // A long cast (durationSeconds: 3) relative to the attacker's fast-move
    // cadence (1s) means several fast hits land WHILE the boss is casting,
    // very plausibly leaving the boss already energy-ready the instant its
    // cast ends — the real-game mechanism MECHANICS.md documents (Kyogre's
    // five Surfs at ~2.5s apart, three consecutive Hydro Pumps).
    const boss = makeBoss(10, 3);
    const attacker = makeAttacker(30);
    const chargedDamage = calculateDamage({ power: 50, attackerAttackStat: 10, defenderDefenseStat: 100, ...NO_MODIFIERS });
    const fastDamageToAttacker = calculateDamage({ power: 0, attackerAttackStat: 10, defenderDefenseStat: 100, ...NO_MODIFIERS });

    let sawBackToBack = false;
    let minObservedGap = Infinity;
    for (let seed = 1; seed <= 200; seed++) {
      const result = simulateStepwiseBattle({ attacker, boss, seed, maxSeconds: 60 });
      // Reconstruct the timestamps of boss CHARGED hits from
      // damageTakenTrajectory by their per-step damage delta, which is
      // exactly chargedDamage for a charged hit and exactly
      // fastDamageToAttacker (much smaller) for a fast hit — both are
      // deterministic given this fixture's fixed stats.
      const chargedHitTimes: number[] = [];
      let previousCumulative = 0;
      for (const point of result.damageTakenTrajectory) {
        const delta = point.cumulativeDamage - previousCumulative;
        if (delta === chargedDamage) chargedHitTimes.push(point.atSeconds);
        previousCumulative = point.cumulativeDamage;
      }
      expect(fastDamageToAttacker).not.toBe(chargedDamage); // sanity: the two are distinguishable
      for (let i = 1; i < chargedHitTimes.length; i++) {
        const gap = chargedHitTimes[i]! - chargedHitTimes[i - 1]!;
        minObservedGap = Math.min(minObservedGap, gap);
        // The cadence floor: a boss can never begin a new cast before its
        // previous one finished.
        expect(gap).toBeGreaterThanOrEqual(boss.chargedMove!.durationSeconds - 1e-9);
        if (Math.abs(gap - boss.chargedMove!.durationSeconds) < 1e-9) sawBackToBack = true;
      }
    }
    expect(sawBackToBack).toBe(true);
  });

  it("a boss starting at 100 energy with a 50-cost move can fire a second time on leftover energy alone, with zero further damage-driven energy gain", () => {
    // Regression coverage for the 2026-09-08 user decision: on firing,
    // attemptBossChargedMoveDecision now SUBTRACTS the move's energy cost
    // (bossEnergy -= energyCost) instead of resetting bossEnergy to 0, to
    // match GoBattleSim's open-source boss AI and this project's own
    // "energy-gated-interval" sibling model (which already subtracted) — see
    // MECHANICS.md's "Raid boss behaviour" section and
    // StepwiseBoss.chargedMoveCadence's doc comment. Under the OLD reset-to-0
    // behavior this exact fixture could never re-fire without new
    // damage-taken energy, because 100 - 50 = 0 would need the full 50 again;
    // under the new subtract-cost rule, 100 - 50 = 50 is ALREADY back at the
    // move's own cost, so the boss can fire a second time purely off leftover
    // energy the moment another move-completion boundary rolls successfully.
    //
    // The attacker's own fast move deals power: 0 (attackerFastDamage(0) = the
    // damage formula's floor(...)+1 = 1 per hit), and
    // bossEnergyFromDamageTaken(1) = floor(0.5) = 0 — so across the whole run
    // the boss's energy total is fully explained by startingEnergy (100) and
    // the two subtractions (-50, -50), with ZERO contribution from damage
    // taken. Seed 1 verified (via a throwaway tsx scratch script against the
    // real engine, deleted after use) to fire exactly twice within 10s and
    // end at exactly 0 energy — a fully deterministic, non-statistical pin.
    const attacker = makeAttacker(0);
    const boss: StepwiseBoss = { ...makeBoss(50, 2), startingEnergy: 100 };
    expect(bossEnergyFromDamageTaken(attackerFastDamage(0))).toBe(0); // sanity: no energy leaks in from damage taken

    const result = simulateStepwiseBattle({ attacker, boss, seed: 1, maxSeconds: 10 });

    expect(result.bossChargedHitsTaken).toBe(2);
    // 100 - 50 (first fire) - 50 (second fire) = 0, not reset-to-0-then-stuck
    // and not left at some non-zero remainder from a botched subtraction.
    expect(result.bossEndingEnergy).toBe(0);
  });
});
