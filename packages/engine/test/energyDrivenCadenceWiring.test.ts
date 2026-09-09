import { describe, expect, it } from "vitest";
import { runSustainedComparison, type SustainedComparisonInputs } from "../src/comparison.js";
import { runSpeciesReverseLookup, type SpeciesReportInputs } from "../src/speciesReport.js";
import { simulateStepwiseBattle, type StepwiseAttacker, type StepwiseBoss } from "../src/simulate.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import { runTeamRaid, type TeamRaidInputs } from "../src/teamRaid.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";

/**
 * Tests for wiring StepwiseBoss.chargedMoveCadence ("fixed-interval" |
 * "energy-driven" | "energy-gated-interval") through the three simulating
 * entry points (runSustainedComparison, runSpeciesReverseLookup,
 * runTeamRaid). The "fixed-interval"/"energy-driven" coverage below shipped
 * from PLAN_energy_driven_boss_cadence.md, which was deleted on completion
 * per this repo's convention — see HANDOFF.md for the outcome and
 * MECHANICS.md for the sourcing behind the model. The "energy-gated-interval"
 * coverage at the bottom of this file was added alongside the model itself
 * (2026-09-08). The underlying models themselves are already covered by
 * test/energyDrivenBossCadence.test.ts and
 * test/energyGatedIntervalBossCadence.test.ts (low-level
 * simulateStepwiseBattle) — this file is specifically about the plumbing: the
 * option reaching every entry point, staying a no-op by default, and (the one
 * genuine design problem) the boss's accumulated energy — AND, under
 * "energy-gated-interval", its pending post-eligibility delay too — surviving
 * a TeamRaid slot handoff and a wipe-and-revive instead of silently
 * resetting.
 */

const LEVEL = 30;
const IVS = { attack: 15, defense: 15, stamina: 15 } as const;

const STRONG_FAST: FastMove = { id: "strong-fast", name: "Strong Fast", type: "normal", power: 15, energyGain: 3, durationSeconds: 1 };
const UNREACHABLE_CHARGED: ChargedMove = {
  id: "unreachable-charged",
  name: "Unreachable",
  type: "normal",
  power: 10,
  energyCost: 1_000_000,
  durationSeconds: 1,
  vulnerableWindowSeconds: 1,
};

/**
 * A fixture tuned (via a throwaway tsx scratch script against the real
 * engine, deleted after use, per this project's verification discipline) so
 * that a SINGLE fight's own damage-taken energy (bossEnergyFromDamageTaken of
 * one STRONG_FAST hit against ENERGY_BOSS's defenseStat=50) is exactly 14 —
 * below ENERGY_BOSS's chargedMove.energyCost of 20, so one slot alone can
 * NEVER make the boss eligible to fire, but two slots' worth (28) can. HP=40
 * against the boss's own fast move (dealing exactly 25 with
 * BOSS_FAST_POWER=19) means this attacker survives exactly one of its own
 * fast hits before fainting on the boss's second fast hit (40 - 25 = 15 > 0,
 * survives hit 1 and gets its own attack in; 15 - 25 <= 0, dies to hit 2
 * before it can attack again) — i.e. exactly one banked energy contribution
 * per fight, deterministically, regardless of seed.
 */
const GLASS_CANNON: SpeciesDefinition = {
  id: "glass-cannon-cadence-wiring-test",
  name: "Glass Cannon Cadence Wiring Test",
  types: ["normal"],
  baseAttack: 200,
  baseDefense: 50,
  baseStamina: 40,
  fastMoves: [STRONG_FAST],
  chargedMoves: [UNREACHABLE_CHARGED],
};

const ENERGY_BOSS_FAST: FastMove = { id: "energy-boss-fast", name: "Energy Boss Fast", type: "normal", power: 19, energyGain: 0, durationSeconds: 1 };
const ENERGY_BOSS_CHARGED: ChargedMove = {
  id: "energy-boss-charged",
  name: "Energy Boss Charged",
  type: "normal",
  power: 50,
  energyCost: 20,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};

/** statsArePrecomputed test boss — see raidBoss.ts. attackStat=100/defenseStat=50 pass through unchanged (iv=0/cpm=1.0). Huge baseStamina so it's never actually cleared — these tests are about boss charged-move cadence/energy, not outcome. */
const ENERGY_BOSS: SpeciesDefinition = {
  id: "energy-boss-cadence-wiring-test",
  name: "Energy Boss Cadence Wiring Test",
  types: ["normal"],
  baseAttack: 100,
  baseDefense: 50,
  baseStamina: 10_000_000,
  fastMoves: [ENERGY_BOSS_FAST],
  chargedMoves: [ENERGY_BOSS_CHARGED],
  statsArePrecomputed: true,
};

const glassCannonStats = effectiveStatsAtLevel(GLASS_CANNON, IVS, LEVEL);

function standaloneAttacker(): StepwiseAttacker {
  return {
    hp: glassCannonStats.stamina,
    defenseStat: glassCannonStats.defense,
    attackStat: glassCannonStats.attack,
    fastMove: STRONG_FAST,
    chargedMove: UNREACHABLE_CHARGED,
    fastDamageOut: { stab: true, typeEffectiveness: 1 },
    chargedDamageOut: { stab: true, typeEffectiveness: 1 },
  };
}

function standaloneBoss(startingEnergy: number): StepwiseBoss {
  return {
    attackStat: 100,
    defenseStat: 50,
    fastMove: ENERGY_BOSS_FAST,
    damageOut: { stab: true, typeEffectiveness: 1 },
    chargedMove: ENERGY_BOSS_CHARGED,
    chargedMoveDamageOut: { stab: true, typeEffectiveness: 1 },
    chargedMoveCadence: "energy-driven",
    startingEnergy,
  };
}

describe("StepwiseBoss.chargedMoveCadence wiring", () => {
  describe("runSustainedComparison", () => {
    // Separate, larger-scale fixture: the attacker survives the whole
    // window (huge HP) so a single continuous fight gets MANY of the boss's
    // own move-completion boundaries, each one energy-eligible on its own
    // (chargedMove.energyCost=10 < a single hit's banked energy of 14) —
    // unlike the GLASS_CANNON fixture above (deliberately built for the
    // TeamRaid carryover tests, where only ONE decision opportunity exists
    // per fight). bossChargedMoveMeanIntervalSeconds is set astronomically
    // high so "fixed-interval" deterministically never fires within
    // maxSeconds, isolating "energy-driven" as the only thing that could
    // possibly cause a difference.
    const TANKY_ATTACKER: SpeciesDefinition = {
      id: "tanky-attacker-cadence-wiring-test",
      name: "Tanky Attacker Cadence Wiring Test",
      types: ["normal"],
      baseAttack: 200,
      baseDefense: 50,
      baseStamina: 100_000,
      fastMoves: [STRONG_FAST],
      chargedMoves: [UNREACHABLE_CHARGED],
    };
    const LOW_COST_BOSS_CHARGED: ChargedMove = { ...ENERGY_BOSS_CHARGED, energyCost: 10 };
    const LOW_COST_BOSS: SpeciesDefinition = {
      ...ENERGY_BOSS,
      id: "low-cost-energy-boss",
      fastMoves: [{ ...ENERGY_BOSS_FAST, power: 5 }], // weak, so the tanky attacker survives the whole window
      chargedMoves: [LOW_COST_BOSS_CHARGED],
    };

    function base(overrides: Partial<SustainedComparisonInputs>): SustainedComparisonInputs {
      return {
        candidates: [TANKY_ATTACKER],
        boss: LOW_COST_BOSS,
        level: LEVEL,
        ivs: IVS,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: 100_000,
        maxSeconds: 30,
        iterations: 1,
        ...overrides,
      };
    }

    it("omitted and explicit 'fixed-interval' are byte-identical", () => {
      const omitted = runSustainedComparison(base({}));
      const explicitFixed = runSustainedComparison(base({ bossChargedMoveCadence: "fixed-interval" }));
      expect(omitted).toEqual(explicitFixed);
      // Sanity: this fixture's astronomically-high mean interval means the
      // boss genuinely never fires under fixed-interval within 30s — a
      // meaningful baseline, not a trivial "both are empty" comparison.
      expect(omitted[0]!.representativeRun.bossChargedHitsTaken).toBe(0);
    });

    it("'energy-driven' reaches the simulator — observable difference from fixed-interval", () => {
      const energyDriven = runSustainedComparison(base({ bossChargedMoveCadence: "energy-driven" }));
      const fixed = runSustainedComparison(base({ bossChargedMoveCadence: "fixed-interval" }));
      expect(fixed[0]!.representativeRun.bossChargedHitsTaken).toBe(0);
      // Many independent decision opportunities, each eligible on its own —
      // firing zero times across the whole 30s window is astronomically
      // unlikely (matching this project's established statistical-test
      // convention elsewhere in energyDrivenBossCadence.test.ts).
      expect(energyDriven[0]!.representativeRun.bossChargedHitsTaken).toBeGreaterThan(0);
      expect(energyDriven[0]!.representativeRun.bossEndingEnergy).not.toBeNull();
    });
  });

  describe("runSpeciesReverseLookup", () => {
    const TANKY_ATTACKER: SpeciesDefinition = {
      id: "tanky-attacker-cadence-wiring-test-2",
      name: "Tanky Attacker Cadence Wiring Test 2",
      types: ["normal"],
      baseAttack: 200,
      baseDefense: 50,
      baseStamina: 100_000,
      fastMoves: [STRONG_FAST],
      chargedMoves: [UNREACHABLE_CHARGED],
    };
    const LOW_COST_BOSS: SpeciesDefinition = {
      ...ENERGY_BOSS,
      id: "low-cost-energy-boss-2",
      fastMoves: [{ ...ENERGY_BOSS_FAST, power: 5 }],
      chargedMoves: [{ ...ENERGY_BOSS_CHARGED, energyCost: 10 }],
    };

    function base(overrides: Partial<SpeciesReportInputs>): SpeciesReportInputs {
      return {
        species: TANKY_ATTACKER,
        level: LEVEL,
        ivs: IVS,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: 100_000,
        maxSeconds: 30,
        iterations: 1,
        targets: [{ species: LOW_COST_BOSS }],
        ...overrides,
      };
    }

    it("omitted and explicit 'fixed-interval' are byte-identical", () => {
      const omitted = runSpeciesReverseLookup(base({}));
      const explicitFixed = runSpeciesReverseLookup(base({ bossChargedMoveCadence: "fixed-interval" }));
      expect(omitted).toEqual(explicitFixed);
      expect(omitted.rows[0]!.sustained.representativeRun.bossChargedHitsTaken).toBe(0);
    });

    it("'energy-driven' reaches the simulator through the reverse-lookup pass-through", () => {
      const energyDriven = runSpeciesReverseLookup(base({ bossChargedMoveCadence: "energy-driven" }));
      expect(energyDriven.rows[0]!.sustained.representativeRun.bossChargedHitsTaken).toBeGreaterThan(0);
    });
  });

  describe("runTeamRaid — fixed-interval unaffected by the new field's mere presence", () => {
    const WEAK_FAST: FastMove = { id: "weak-fast", name: "Weak Fast", type: "normal", power: 3, energyGain: 3, durationSeconds: 0.5 };
    const WEAK_CHARGED: ChargedMove = {
      id: "weak-charged",
      name: "Weak Charged",
      type: "normal",
      power: 20,
      energyCost: 30,
      durationSeconds: 1,
      vulnerableWindowSeconds: 1,
    };
    const HARD_HITTER: SpeciesDefinition = {
      id: "hard-hitter-cadence-wiring-test",
      name: "Hard Hitter Cadence Wiring Test",
      types: ["normal"],
      baseAttack: 300,
      baseDefense: 150,
      baseStamina: 200,
      fastMoves: [WEAK_FAST],
      chargedMoves: [WEAK_CHARGED],
    };
    const boss: SpeciesDefinition = {
      id: "weak-boss-cadence-wiring-test",
      name: "Weak Boss Cadence Wiring Test",
      types: ["normal"],
      baseAttack: 20,
      baseDefense: 50,
      baseStamina: 500,
      fastMoves: [WEAK_FAST],
      chargedMoves: [],
      statsArePrecomputed: true,
    };

    function base(overrides: Partial<TeamRaidInputs>): TeamRaidInputs {
      return {
        slots: [{ species: HARD_HITTER }],
        boss,
        level: LEVEL,
        ivs: IVS,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: 1000,
        raidTimerSeconds: 180,
        ...overrides,
      };
    }

    it("omitted and explicit 'fixed-interval' are byte-identical", () => {
      const omitted = runTeamRaid(base({}));
      const explicitFixed = runTeamRaid(base({ bossChargedMoveCadence: "fixed-interval" }));
      expect(omitted).toEqual(explicitFixed);
    });
  });

  describe("runTeamRaid — energy-driven boss-energy carryover", () => {
    function baseTwoSlot(overrides: Partial<TeamRaidInputs>): TeamRaidInputs {
      return {
        slots: [{ species: GLASS_CANNON }, { species: GLASS_CANNON }],
        boss: ENERGY_BOSS,
        level: LEVEL,
        ivs: IVS,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: 1000, // irrelevant under energy-driven
        bossChargedMoveCadence: "energy-driven",
        raidTimerSeconds: 10,
        seed: 1,
        ...overrides,
      };
    }

    it("carries the boss's accumulated energy across a slot handoff — asserted directly on the energy value, not inferred from an aggregate", () => {
      // Reproduce slot 1's fight standalone, exactly as runTeamRaid builds it
      // internally (seed + fightIndex(0)*7919 = seed unchanged for the very
      // first fight). This fixture is built so a single fight ends with the
      // attacker fainting having banked exactly ONE hit's worth of boss
      // energy — see GLASS_CANNON's doc comment.
      const slot1Standalone = simulateStepwiseBattle({ attacker: standaloneAttacker(), boss: standaloneBoss(0), seed: 1, maxSeconds: 30 });
      expect(slot1Standalone.bossChargedHitsTaken).toBe(0); // one hit's energy (14) is below energyCost (20) — never eligible alone
      expect(slot1Standalone.bossEndingEnergy).toBe(14); // the DIRECT numeric value under test

      // The actual system under test. This never-clearable boss means the
      // roster wipes and revives repeatedly (raidTimerSeconds=10 doesn't
      // stop it after one pass) — result.slots[0]/[1] are still cycle 0's
      // two slots regardless, which is all this test needs.
      const result = runTeamRaid(baseTwoSlot({}));
      expect(result.slots.length).toBeGreaterThanOrEqual(2);
      expect(result.slots[0]!.cycleIndex).toBe(0);
      expect(result.slots[0]!.slotIndex).toBe(0);
      expect(result.slots[1]!.cycleIndex).toBe(0);
      expect(result.slots[1]!.slotIndex).toBe(1);
      expect(result.slots[0]!.bossChargedHitsTaken).toBe(0);

      // Reproduce slot 2's fight standalone TWICE: once carrying forward the
      // real bossEndingEnergy value just asserted above (14), and once
      // pretending it reset to 0 (the bug this test guards against — see
      // simulate.ts's StepwiseRunResult.bossEndingEnergy doc comment). Only
      // the carried-forward value is capable of reaching ENERGY_BOSS's
      // chargedMove.energyCost (20) within this fight's single decision
      // opportunity (14 (carried) + 14 (this fight's own hit) = 28 >= 20;
      // 0 + 14 = 14 < 20) — so this is a deterministic fork, not a
      // probabilistic one, on the ELIGIBILITY question, even though whether
      // the boss's 50% roll actually fires is still a coin flip for this one
      // specific seed.
      const seedForSlot2 = 1 + 7919; // fightIndex 1's seed, matching runTeamRaid's own convention
      const slot2Carried = simulateStepwiseBattle({
        attacker: standaloneAttacker(),
        boss: standaloneBoss(slot1Standalone.bossEndingEnergy!),
        seed: seedForSlot2,
        maxSeconds: 30,
      });
      const slot2Reset = simulateStepwiseBattle({
        attacker: standaloneAttacker(),
        boss: standaloneBoss(0),
        seed: seedForSlot2,
        maxSeconds: 30,
      });
      // For seed=1 specifically (pinned, not a statistical claim): the
      // carried-energy fork fires, the reset fork never becomes eligible at
      // all. This is what actually distinguishes correct plumbing from the
      // "silently resets on handoff" bug the plan flagged as the likely
      // failure mode.
      expect(slot2Carried.bossChargedHitsTaken).toBe(1);
      expect(slot2Reset.bossChargedHitsTaken).toBe(0);

      // The real runTeamRaid output must match the CARRIED reproduction, not
      // the reset one.
      expect(result.slots[1]!.bossChargedHitsTaken).toBe(slot2Carried.bossChargedHitsTaken);
      expect(result.slots[1]!.faintedAtSeconds).toBe(slot2Carried.faintedAtSeconds);
    });

    it("carries the boss's accumulated energy across a wipe-and-revive, not just an ordinary same-cycle slot handoff", () => {
      // A single-slot roster (the SAME slot re-fielded every cycle after
      // each wipe) against the same never-clearable boss. Deliberately
      // reuses the exact same fixture/seed as the slot-handoff test above —
      // this is the point: the code carries bossEnergy across ANY fight
      // boundary via the same untouched variable, so a wipe-and-revive
      // boundary (cycle 0 -> cycle 1) behaves identically to an ordinary
      // same-cycle slot handoff. See this module's — teamRaid.ts's — doc
      // comment for the explicit decision this pins: energy DOES carry
      // across a wipe, for the same "one continuous encounter from the
      // boss's side" reasoning already applied to the fixed-interval
      // cooldown.
      const result = runTeamRaid(
        baseTwoSlot({
          slots: [{ species: GLASS_CANNON }],
          raidTimerSeconds: 20,
          reviveCostSeconds: 1,
        }),
      );

      expect(result.wipeCount).toBeGreaterThan(0);
      const cycle0 = result.slots.find((s) => s.cycleIndex === 0)!;
      const cycle1 = result.slots.find((s) => s.cycleIndex === 1)!;
      expect(cycle0).toBeDefined();
      expect(cycle1).toBeDefined();
      expect(cycle0.bossChargedHitsTaken).toBe(0); // one fight alone never reaches eligibility (same reasoning as slot 1 above)

      // Pinned for seed=1 (the default): the SAME reproduction technique as
      // the handoff test above, just carried across a wipe boundary instead
      // of an ordinary handoff. If wipe-and-revive silently reset the boss's
      // energy (the bug this test guards against), cycle 1 would be an exact
      // repeat of cycle 0's deterministic "never eligible" outcome — 0, not 1.
      expect(cycle1.bossChargedHitsTaken).toBe(1);
    });
  });

  describe("runTeamRaid — the thesis-relevant behaviour: higher DPS forces more boss charged moves", () => {
    function attackerSpecies(power: number, id: string): SpeciesDefinition {
      return {
        id,
        name: id,
        types: ["normal"],
        baseAttack: 200,
        baseDefense: 50,
        baseStamina: 100_000, // survives the whole window, for a fair like-for-like comparison
        fastMoves: [{ id: `${id}-fast`, name: `${id} fast`, type: "normal", power, energyGain: 3, durationSeconds: 1 }],
        chargedMoves: [UNREACHABLE_CHARGED],
      };
    }
    const LOW_DPS = attackerSpecies(2, "low-dps-cadence-wiring-test");
    const HIGH_DPS = attackerSpecies(15, "high-dps-cadence-wiring-test");
    const LOW_COST_BOSS: SpeciesDefinition = {
      ...ENERGY_BOSS,
      id: "low-cost-energy-boss-3",
      fastMoves: [{ ...ENERGY_BOSS_FAST, power: 5 }], // weak, so neither roster ever faints within the window
      chargedMoves: [{ ...ENERGY_BOSS_CHARGED, energyCost: 10 }],
    };

    function totalBossChargedHits(species: SpeciesDefinition, seed: number): number {
      const result = runTeamRaid({
        slots: [{ species }],
        boss: LOW_COST_BOSS,
        level: LEVEL,
        ivs: IVS,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: 100_000,
        bossChargedMoveCadence: "energy-driven",
        raidTimerSeconds: 60,
        seed,
      });
      return result.slots.reduce((sum, s) => sum + s.bossChargedHitsTaken, 0);
    }

    it("a high-DPS roster makes the boss fire measurably more charged moves than a low-DPS one over the same encounter", () => {
      const iterations = 20;
      let lowTotal = 0;
      let highTotal = 0;
      for (let seed = 1; seed <= iterations; seed++) {
        lowTotal += totalBossChargedHits(LOW_DPS, seed);
        highTotal += totalBossChargedHits(HIGH_DPS, seed);
      }
      const lowMean = lowTotal / iterations;
      const highMean = highTotal / iterations;
      expect(highMean).toBeGreaterThan(lowMean);
      // Not a marginal difference — this is the product's headline
      // ranking-flip axis, not a rounding artifact — measured at -15% to -34%
      // survival across real species, and it reorders Species Report's rankings
      // outright (see HANDOFF.md's 2026-09-08 entry).
      expect(highMean).toBeGreaterThan(lowMean * 1.5);
    });
  });

  describe("StepwiseBoss.chargedMoveCadence = 'energy-gated-interval' wiring", () => {
    // Reuses the same TANKY_ATTACKER/LOW_COST_BOSS shape as the
    // "energy-driven" describe blocks above (huge attacker HP so it survives
    // the whole window; a weak boss fast move + low charged-move cost so
    // eligibility is reached quickly and repeatedly) — only the cadence value
    // and a REQUIRED chargedMoveMeanIntervalSeconds differ (this mode, unlike
    // "energy-driven", actually consults that field — as the mean delay after
    // becoming eligible, not the mean seconds between casts).
    const TANKY_ATTACKER: SpeciesDefinition = {
      id: "tanky-attacker-gated-wiring-test",
      name: "Tanky Attacker Gated Wiring Test",
      types: ["normal"],
      baseAttack: 200,
      baseDefense: 50,
      baseStamina: 100_000,
      fastMoves: [STRONG_FAST],
      chargedMoves: [UNREACHABLE_CHARGED],
    };
    const LOW_COST_BOSS: SpeciesDefinition = {
      ...ENERGY_BOSS,
      id: "low-cost-energy-boss-gated",
      fastMoves: [{ ...ENERGY_BOSS_FAST, power: 5 }],
      chargedMoves: [{ ...ENERGY_BOSS_CHARGED, energyCost: 10 }],
    };

    it("reaches runSustainedComparison — observable difference from fixed-interval", () => {
      function base(overrides: Partial<SustainedComparisonInputs>): SustainedComparisonInputs {
        return {
          candidates: [TANKY_ATTACKER],
          boss: LOW_COST_BOSS,
          level: LEVEL,
          ivs: IVS,
          dodge: { kind: "none" },
          bossChargedMoveMeanIntervalSeconds: 2,
          maxSeconds: 30,
          iterations: 1,
          ...overrides,
        };
      }
      const gated = runSustainedComparison(base({ bossChargedMoveCadence: "energy-gated-interval" }));
      const fixed = runSustainedComparison(base({ bossChargedMoveCadence: "fixed-interval", bossChargedMoveMeanIntervalSeconds: 100_000 }));
      expect(fixed[0]!.representativeRun.bossChargedHitsTaken).toBe(0);
      // Many independent eligibility-crossing opportunities over 30s at this
      // DPS/cost ratio — zero fires would be astronomically unlikely.
      expect(gated[0]!.representativeRun.bossChargedHitsTaken).toBeGreaterThan(0);
      expect(gated[0]!.representativeRun.bossEndingEnergy).not.toBeNull();
    });

    it("reaches runSpeciesReverseLookup through the reverse-lookup pass-through", () => {
      function base(overrides: Partial<SpeciesReportInputs>): SpeciesReportInputs {
        return {
          species: TANKY_ATTACKER,
          level: LEVEL,
          ivs: IVS,
          dodge: { kind: "none" },
          bossChargedMoveMeanIntervalSeconds: 2,
          maxSeconds: 30,
          iterations: 1,
          targets: [{ species: LOW_COST_BOSS }],
          ...overrides,
        };
      }
      const gated = runSpeciesReverseLookup(base({ bossChargedMoveCadence: "energy-gated-interval" }));
      expect(gated.rows[0]!.sustained.representativeRun.bossChargedHitsTaken).toBeGreaterThan(0);
    });

    // The two carryover tests below use a dedicated fixture (energyCost: 14
    // — exactly what GLASS_CANNON's own single hit banks, so eligibility is
    // reached the instant that hit lands, not merely "eventually") and
    // hand-picked seeds, verified against the real engine via a throwaway
    // tsx scratch script (deleted after use, per this project's verification
    // discipline) rather than derived by hand — the exact seconds/energy
    // values below are its output, not arithmetic.
    const GATED_ENERGY_BOSS: SpeciesDefinition = {
      ...ENERGY_BOSS,
      id: "energy-boss-cadence-wiring-test-gated",
      chargedMoves: [{ ...ENERGY_BOSS_CHARGED, energyCost: 14 }],
    };

    function standaloneBossGated(startingEnergy: number, mean: number, chargedMoveNextFireInSeconds?: number): StepwiseBoss {
      return {
        attackStat: 100,
        defenseStat: 50,
        fastMove: ENERGY_BOSS_FAST,
        damageOut: { stab: true, typeEffectiveness: 1 },
        chargedMove: { ...ENERGY_BOSS_CHARGED, energyCost: 14 },
        chargedMoveDamageOut: { stab: true, typeEffectiveness: 1 },
        chargedMoveCadence: "energy-gated-interval",
        chargedMoveMeanIntervalSeconds: mean,
        startingEnergy,
        chargedMoveNextFireInSeconds,
      };
    }

    it("carries BOTH the boss's accumulated energy AND its pending post-eligibility delay across a slot handoff", () => {
      const mean = 2;
      // Slot 1: a single GLASS_CANNON hit banks exactly 14 energy — precisely
      // this boss's charged-move cost, so it becomes eligible and arms a
      // delay the instant that hit lands, but (for this seed) the delay
      // outlasts the ~1s of fight remaining, so it never actually fires —
      // leaving a real, non-null pending delay to carry forward, not just
      // energy.
      const slot1Standalone = simulateStepwiseBattle({ attacker: standaloneAttacker(), boss: standaloneBossGated(0, mean), seed: 8, maxSeconds: 30 });
      expect(slot1Standalone.bossChargedHitsTaken).toBe(0);
      expect(slot1Standalone.bossEndingEnergy).toBe(14);
      expect(slot1Standalone.bossChargedMoveResidualSeconds).not.toBeNull();
      expect(slot1Standalone.bossChargedMoveResidualSeconds!).toBeCloseTo(0.45, 2);

      const result = runTeamRaid({
        slots: [{ species: GLASS_CANNON }, { species: GLASS_CANNON }],
        boss: GATED_ENERGY_BOSS,
        level: LEVEL,
        ivs: IVS,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: mean,
        bossChargedMoveCadence: "energy-gated-interval",
        raidTimerSeconds: 10,
        seed: 8,
      });
      expect(result.slots.length).toBeGreaterThanOrEqual(2);
      expect(result.slots[0]!.bossChargedHitsTaken).toBe(0);

      // Reproduce slot 2 standalone THREE ways for the same seed: CARRIED
      // (both the real bossEndingEnergy AND the real bossChargedMoveResidualSeconds
      // just asserted above), ENERGY-ONLY-RESET (energy carried, but the
      // delay re-rolled from scratch — the specific bug this test guards
      // against: silently re-arming instead of honouring the carried delay),
      // and FULLY-RESET (neither carried, the "silently restarts from
      // nothing" bug fixed-interval already guards against).
      const seedForSlot2 = 8 + 7919; // fightIndex 1's seed, matching runTeamRaid's own convention
      const slot2Carried = simulateStepwiseBattle({
        attacker: standaloneAttacker(),
        boss: standaloneBossGated(slot1Standalone.bossEndingEnergy!, mean, slot1Standalone.bossChargedMoveResidualSeconds!),
        seed: seedForSlot2,
        maxSeconds: 30,
      });
      const slot2EnergyOnlyReset = simulateStepwiseBattle({
        attacker: standaloneAttacker(),
        boss: standaloneBossGated(slot1Standalone.bossEndingEnergy!, mean), // no chargedMoveNextFireInSeconds -> fresh roll
        seed: seedForSlot2,
        maxSeconds: 30,
      });
      const slot2FullyReset = simulateStepwiseBattle({
        attacker: standaloneAttacker(),
        boss: standaloneBossGated(0, mean),
        seed: seedForSlot2,
        maxSeconds: 30,
      });
      // Pinned for seed=8 specifically (not a statistical claim): carrying
      // the real delay fires; re-rolling a fresh delay from the same
      // (already-eligible) energy does not, within this short a fight — the
      // exact fork this test exists to catch. Fully resetting both fields
      // never even reaches eligibility at all (same reasoning as slot 1).
      expect(slot2Carried.bossChargedHitsTaken).toBe(1);
      expect(slot2EnergyOnlyReset.bossChargedHitsTaken).toBe(0);
      expect(slot2FullyReset.bossChargedHitsTaken).toBe(0);

      // The real runTeamRaid output must match the CARRIED reproduction.
      expect(result.slots[1]!.bossChargedHitsTaken).toBe(slot2Carried.bossChargedHitsTaken);
      expect(result.slots[1]!.faintedAtSeconds).toBe(slot2Carried.faintedAtSeconds);
    });

    it("carries BOTH the boss's accumulated energy AND its pending delay across a wipe-and-revive, not just an ordinary same-cycle slot handoff", () => {
      // A single-slot roster (the SAME slot re-fielded every cycle after
      // each wipe) against the same never-clearable boss, mirroring the
      // "energy-driven" wipe test above. Pinned for seed=1 (the default),
      // found via the same throwaway scratch-script search as the handoff
      // test above.
      const result = runTeamRaid({
        slots: [{ species: GLASS_CANNON }],
        boss: GATED_ENERGY_BOSS,
        level: LEVEL,
        ivs: IVS,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: 2,
        bossChargedMoveCadence: "energy-gated-interval",
        raidTimerSeconds: 20,
        reviveCostSeconds: 1,
        seed: 1,
      });

      expect(result.wipeCount).toBeGreaterThan(0);
      const cycle0 = result.slots.find((s) => s.cycleIndex === 0)!;
      const cycle1 = result.slots.find((s) => s.cycleIndex === 1)!;
      expect(cycle0).toBeDefined();
      expect(cycle1).toBeDefined();
      // One fight alone never reaches a within-fight fire (arms the delay
      // but never lets it elapse before fainting) — same reasoning as slot 1
      // above.
      expect(cycle0.bossChargedHitsTaken).toBe(0);
      // If wipe-and-revive silently reset either the boss's energy or its
      // pending delay (the bug this test guards against), cycle 1 would
      // repeat cycle 0's deterministic "arms but never fires" outcome — 0,
      // not 1.
      expect(cycle1.bossChargedHitsTaken).toBe(1);
    });
  });
});
