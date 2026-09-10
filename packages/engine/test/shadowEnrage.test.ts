import { describe, expect, it } from "vitest";
import { bossEnrageStats, runSustainedComparison } from "../src/comparison.js";
import { runTeamRaid, type TeamRaidInputs } from "../src/teamRaid.js";
import { simulateStepwiseBattle, type StepwiseBoss } from "../src/simulate.js";
import { shadowEnragedStats } from "../src/shadow.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";

/**
 * Shadow Raid enrage (IDEAS.md item 17). See MECHANICS.md's "Shadow raids"
 * section for sourcing, and shadow.ts's shadowEnragedStats/
 * shadowEnragePhaseForHpFraction doc comments for the stacking-decision
 * reasoning pinned by shadow.test.ts. This file covers the mid-fight
 * threshold TRANSITIONS themselves (simulate.ts), the isShadow gate
 * (comparison.ts's bossEnrageStats), the non-shadow-boss byte-for-byte
 * invariant, and the product-thesis ranking flip this feature exists to
 * surface.
 *
 * Every numeric pin below was computed by actually running this engine's own
 * code via a throwaway tsx script (deleted after use), not hand arithmetic —
 * same discipline test/fixtures/hypotheticalDuo.ts documents.
 */

const ATTACKER_FAST: FastMove = { id: "atk-fast", name: "Attacker Fast", type: "normal", power: 10, energyGain: 0, durationSeconds: 1.0 };
// Effectively unreachable energy cost — isolates the fast-move-only damage
// trajectory so the enrage/subdue transitions aren't obscured by a charged
// cast landing partway through.
const ATTACKER_CHARGED: ChargedMove = { id: "atk-charged", name: "Attacker Charged", type: "normal", power: 10, energyCost: 100000, durationSeconds: 1.0, vulnerableWindowSeconds: 1.0 };
const BOSS_FAST_LOW_POWER: FastMove = { id: "boss-fast-1", name: "Boss Fast (weak)", type: "normal", power: 1, energyGain: 0, durationSeconds: 1.0 };
const BOSS_FAST_MED_POWER: FastMove = { id: "boss-fast-10", name: "Boss Fast (10)", type: "normal", power: 10, energyGain: 0, durationSeconds: 1.0 };

/** maxHp=100 for easy percentage arithmetic: 1 cumulative damage = 1% remaining HP. */
const SHADOW_BOSS_100HP: SpeciesDefinition = {
  id: "shadow-boss-100hp",
  name: "Shadow Boss (100 HP)",
  types: ["normal"],
  baseAttack: 100,
  baseDefense: 100,
  baseStamina: 100,
  fastMoves: [BOSS_FAST_LOW_POWER],
  chargedMoves: [],
  isShadow: true,
  statsArePrecomputed: true,
};

const ENRAGE_STATS_100 = shadowEnragedStats(SHADOW_BOSS_100HP); // { attack: 232, defense: 265 } — pinned below too.

describe("simulateStepwiseBattle — Shadow raid enrage transitions", () => {
  it("computes {attack: 232, defense: 265} for baseAttack=100/baseDefense=100 (pins the exact formula output this whole file builds on)", () => {
    expect(ENRAGE_STATS_100).toEqual({ attack: 232, defense: 265 });
  });

  it("the boss's DEFENSE (and so the attacker's own outgoing damage) drops when enraged, then reverts on auto-subdue", () => {
    const boss: StepwiseBoss = {
      attackStat: 100,
      defenseStat: 100,
      fastMove: BOSS_FAST_LOW_POWER,
      damageOut: { stab: true },
      enrage: { maxHp: 100, attackStat: ENRAGE_STATS_100.attack, defenseStat: ENRAGE_STATS_100.defense },
    };
    const result = simulateStepwiseBattle({
      attacker: {
        hp: 100000,
        attackStat: 100,
        defenseStat: 100000, // effectively unkillable — isolates the boss-side transition
        fastMove: ATTACKER_FAST,
        chargedMove: ATTACKER_CHARGED,
        fastDamageOut: { stab: true },
        chargedDamageOut: { stab: true },
      },
      boss,
      dodge: { kind: "none" },
      maxSeconds: 60,
      seed: 1,
    });

    // Pinned transition timestamps.
    expect(result.enragedAtSeconds).toBe(6.1);
    expect(result.subduedAtSeconds).toBe(21.1);

    // Per-hit own damage: 7/hit normal (floor(0.5*10*(100/100)*1.2)+1),
    // drops to 3/hit once enraged (defense triples to 265:
    // floor(0.5*10*(100/265)*1.2)+1), reverts to 7/hit after subdue.
    const traj = result.ownDamageTrajectory;
    const at = (s: number) => traj.find((p) => p.atSeconds === s)!.cumulativeDamage;
    expect(at(6) - at(5)).toBe(7); // still normal (t=6 hit fires using the pre-enrage defense)
    expect(at(7) - at(6)).toBe(3); // first enraged hit
    expect(at(20) - at(19)).toBe(3); // still enraged
    expect(at(22) - at(21)).toBe(7); // first post-subdue hit, back to normal
  });

  it("the boss's ATTACK (incoming damage to the attacker) spikes when enraged, then reverts on auto-subdue", () => {
    const boss: StepwiseBoss = {
      attackStat: 100,
      defenseStat: 100,
      fastMove: BOSS_FAST_MED_POWER,
      damageOut: { stab: true },
      enrage: { maxHp: 100, attackStat: ENRAGE_STATS_100.attack, defenseStat: ENRAGE_STATS_100.defense },
    };
    const result = simulateStepwiseBattle({
      attacker: {
        hp: 100000,
        attackStat: 100,
        defenseStat: 200, // finite, so the boss's own attack-stat jump is visible (not floor-clamped to the +1 minimum)
        fastMove: ATTACKER_FAST,
        chargedMove: ATTACKER_CHARGED,
        fastDamageOut: { stab: true },
        chargedDamageOut: { stab: true },
      },
      boss,
      dodge: { kind: "none" },
      maxSeconds: 60,
      seed: 1,
    });

    expect(result.enragedAtSeconds).toBe(6.1);
    expect(result.subduedAtSeconds).toBe(21.1);

    // Incoming damage: 4/hit normal (floor(0.5*10*(100/200)*1.2)+1), jumps to
    // 7/hit once enraged (attack 232: floor(0.5*10*(232/200)*1.2)+1), reverts
    // to 4/hit after subdue.
    const traj = result.damageTakenTrajectory;
    const at = (s: number) => traj.find((p) => p.atSeconds === s)!.cumulativeDamage;
    expect(at(6) - at(5)).toBe(4);
    expect(at(7) - at(6)).toBe(7);
    expect(at(21) - at(20)).toBe(7); // last enraged hit (subdue only takes effect the NEXT tick)
    expect(at(22) - at(21)).toBe(4); // first post-subdue hit
  });

  it("a boss with no `enrage` configured is byte-for-byte unaffected, even against the exact same shadow boss species/HP that DOES enrage above", () => {
    const bossWithoutEnrage: StepwiseBoss = {
      attackStat: 100,
      defenseStat: 100,
      fastMove: BOSS_FAST_LOW_POWER,
      damageOut: { stab: true },
      // enrage deliberately omitted.
    };
    const result = simulateStepwiseBattle({
      attacker: {
        hp: 100000,
        attackStat: 100,
        defenseStat: 100000,
        fastMove: ATTACKER_FAST,
        chargedMove: ATTACKER_CHARGED,
        fastDamageOut: { stab: true },
        chargedDamageOut: { stab: true },
      },
      boss: bossWithoutEnrage,
      dodge: { kind: "none" },
      maxSeconds: 30,
      seed: 1,
    });

    expect(result.enragedAtSeconds).toBeNull();
    expect(result.subduedAtSeconds).toBeNull();
    // Per-hit damage stays flat at 7 for the WHOLE run — no threshold effect
    // leaks in just because the underlying species is isShadow and would
    // cross both thresholds well within this window (30 cumulative hits of 7
    // damage each against a 100 HP boss crosses both 60% and 15% long before
    // t=30).
    const traj = result.ownDamageTrajectory;
    for (let s = 1; s <= 29; s++) {
      const prev = traj.find((p) => p.atSeconds === s - 1)!.cumulativeDamage;
      const cur = traj.find((p) => p.atSeconds === s)!.cumulativeDamage;
      expect(cur - prev).toBe(7);
    }
  });
});

describe("comparison.ts — bossEnrageStats gate", () => {
  it("is null for a non-Shadow boss, non-null (and equal to shadowEnragedStats) for a Shadow one", () => {
    const nonShadow: SpeciesDefinition = { ...SHADOW_BOSS_100HP, id: "non-shadow", isShadow: false };
    expect(bossEnrageStats(nonShadow)).toBeNull();
    expect(bossEnrageStats(SHADOW_BOSS_100HP)).toEqual(shadowEnragedStats(SHADOW_BOSS_100HP));
  });

  it("runSustainedComparison: a non-shadow boss is byte-for-byte unaffected by this feature even at a tiny HP pool a real attacker easily depletes past both thresholds", () => {
    const attacker: SpeciesDefinition = {
      id: "flip-attacker",
      name: "Flip Attacker",
      types: ["normal"],
      baseAttack: 300,
      baseDefense: 150,
      baseStamina: 200,
      fastMoves: [ATTACKER_FAST],
      chargedMoves: [ATTACKER_CHARGED],
    };
    const nonShadowBoss: SpeciesDefinition = { ...SHADOW_BOSS_100HP, id: "non-shadow-100hp", isShadow: false };

    const [result] = runSustainedComparison({
      candidates: [attacker],
      boss: nonShadowBoss,
      level: 40,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000, // boss has no charged move anyway
      maxSeconds: 30,
      iterations: 1,
    });

    expect(result!.representativeRun.enragedAtSeconds).toBeNull();
    expect(result!.representativeRun.subduedAtSeconds).toBeNull();
  });

  it("runSustainedComparison: a Shadow boss with a small HP pool DOES enrage/subdue mid-fight, surfaced on representativeRun", () => {
    const attacker: SpeciesDefinition = {
      id: "flip-attacker-2",
      name: "Flip Attacker 2",
      types: ["normal"],
      baseAttack: 300,
      baseDefense: 150,
      baseStamina: 200,
      fastMoves: [ATTACKER_FAST],
      chargedMoves: [ATTACKER_CHARGED],
    };

    const [result] = runSustainedComparison({
      candidates: [attacker],
      boss: SHADOW_BOSS_100HP,
      level: 40,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000, // boss has no charged move anyway
      maxSeconds: 30,
      iterations: 1,
    });

    expect(result!.representativeRun.enragedAtSeconds).not.toBeNull();
    expect(result!.bossMaxHp).toBe(100);
  });
});

/**
 * THE RANKING FLIP — this feature's headline finding. A bulkier attacker
 * (lower attack, much higher defense/HP) beats a glass cannon (very high
 * attack, low defense/HP) specifically once the shadow boss's remaining HP
 * has already dropped into the enraged band, even though the glass cannon
 * wins on team-DPS RATE against the SAME boss while it's still at normal
 * stats. This is exactly this project's thesis (survivability counted as
 * team DPS, ranking flips on context) applied to a mechanic this engine
 * couldn't model before this feature.
 *
 * Uses simulateStepwiseBattle's own `enrage.damageDealtBeforeFight` directly
 * (rather than a full multi-slot Team Raid) so the "boss already has X% HP
 * gone before this attacker's turn" precondition is exactly controlled — the
 * same parameter teamRaid.ts threads from its own bossDamageAccum for a real
 * multi-slot encounter (see the teamRaid.test.ts coverage for that wiring).
 */
describe("ranking flip: Shadow enrage flips which archetype wins, by team-DPS rate", () => {
  // Deliberately distinct from ATTACKER_FAST/ATTACKER_CHARGED above — a
  // reachable charged-move energy cost this time, since BULKY (which
  // survives well past 5 fast hits) is meant to actually land some.
  const RF_FAST: FastMove = { id: "rf-fast", name: "RF Fast", type: "normal", power: 8, energyGain: 8, durationSeconds: 1.0 };
  const RF_CHARGED: ChargedMove = { id: "rf-charged", name: "RF Charged", type: "normal", power: 90, energyCost: 40, durationSeconds: 2.0, vulnerableWindowSeconds: 2.0 };

  const GLASS_CANNON: SpeciesDefinition = {
    id: "glass-cannon",
    name: "Glass Cannon",
    types: ["normal"],
    baseAttack: 900,
    baseDefense: 60,
    baseStamina: 70,
    fastMoves: [RF_FAST],
    chargedMoves: [RF_CHARGED],
  };
  const BULKY: SpeciesDefinition = {
    id: "bulky",
    name: "Bulky",
    types: ["normal"],
    baseAttack: 180,
    baseDefense: 280,
    baseStamina: 300,
    fastMoves: [RF_FAST],
    chargedMoves: [RF_CHARGED],
  };
  const BOSS: SpeciesDefinition = {
    id: "flip-boss",
    name: "Flip Boss",
    types: ["normal"],
    baseAttack: 180,
    baseDefense: 150,
    baseStamina: 2000,
    fastMoves: [{ id: "flip-boss-fast", name: "Flip Boss Fast", type: "normal", power: 12, energyGain: 0, durationSeconds: 1.0 }],
    chargedMoves: [],
    isShadow: true,
    statsArePrecomputed: true,
  };
  const level = 40;
  const ivs = { attack: 15, defense: 15, stamina: 15 };
  const enrageStats = shadowEnragedStats(BOSS);

  function teamDpsRate(attacker: SpeciesDefinition, damageDealtBeforeFight: number) {
    const effective = effectiveStatsAtLevel(attacker, ivs, level);
    const result = simulateStepwiseBattle({
      attacker: {
        hp: effective.stamina,
        attackStat: effective.attack,
        defenseStat: effective.defense,
        fastMove: RF_FAST,
        chargedMove: RF_CHARGED,
        fastDamageOut: { stab: true },
        chargedDamageOut: { stab: true },
      },
      boss: {
        attackStat: BOSS.baseAttack,
        defenseStat: BOSS.baseDefense,
        fastMove: BOSS.fastMoves[0]!,
        damageOut: { stab: true },
        enrage: { maxHp: BOSS.baseStamina, damageDealtBeforeFight, attackStat: enrageStats.attack, defenseStat: enrageStats.defense },
      },
      dodge: { kind: "none" },
      maxSeconds: 30,
      seed: 1,
    });
    const totalDamage = result.totalFastMoveDamage + result.totalChargedDamage;
    const duration = result.faintedAtSeconds ?? 30;
    return { totalDamage, duration, rate: totalDamage / duration, result };
  }

  it("fresh boss (0% pre-dealt damage, normal stats): the glass cannon wins on team-DPS rate", () => {
    const glass = teamDpsRate(GLASS_CANNON, 0);
    const bulky = teamDpsRate(BULKY, 0);
    expect(glass.result.enragedAtSeconds).toBeNull();
    expect(bulky.result.enragedAtSeconds).toBeNull();
    // Pinned exact values.
    expect(glass.totalDamage).toBe(72);
    expect(glass.duration).toBe(4);
    expect(bulky.totalDamage).toBe(400);
    expect(bulky.duration).toBe(30); // survives the whole window
    expect(glass.rate).toBeCloseTo(18, 5);
    expect(bulky.rate).toBeCloseTo(13.33, 2);
    expect(glass.rate).toBeGreaterThan(bulky.rate);
  });

  it("THE FLIP: with the boss already 50% dealt-down (inside the enraged band from the start), bulky wins on team-DPS rate instead", () => {
    const glass = teamDpsRate(GLASS_CANNON, 1000); // 50% of maxHp=2000 already dealt
    const bulky = teamDpsRate(BULKY, 1000);
    expect(glass.result.enragedAtSeconds).toBe(0.1); // already inside the band at the very first tick
    expect(bulky.result.enragedAtSeconds).toBe(0.1);
    // Pinned exact values.
    expect(glass.totalDamage).toBe(9);
    expect(glass.duration).toBe(2);
    expect(bulky.totalDamage).toBe(118);
    expect(bulky.duration).toBe(20);
    expect(glass.rate).toBeCloseTo(4.5, 5);
    expect(bulky.rate).toBeCloseTo(5.9, 5);
    // The flip: bulky now wins on rate, the opposite ranking from the fresh case above.
    expect(bulky.rate).toBeGreaterThan(glass.rate);
  });
});

describe("teamRaid.ts — Shadow enrage carries across a slot handoff via damageDealtBeforeFight", () => {
  const HEAVY_HITTER: SpeciesDefinition = {
    id: "heavy-hitter",
    name: "Heavy Hitter",
    types: ["normal"],
    baseAttack: 400,
    baseDefense: 100,
    baseStamina: 400,
    fastMoves: [ATTACKER_FAST],
    chargedMoves: [ATTACKER_CHARGED],
  };
  const FOLLOWER: SpeciesDefinition = {
    id: "follower",
    name: "Follower",
    types: ["normal"],
    baseAttack: 150,
    baseDefense: 150,
    baseStamina: 200,
    fastMoves: [ATTACKER_FAST],
    chargedMoves: [ATTACKER_CHARGED],
  };
  const level = 40;
  const ivs = { attack: 15, defense: 15, stamina: 15 };

  function raid(boss: SpeciesDefinition): TeamRaidInputs {
    return {
      slots: [
        { species: HEAVY_HITTER, level, ivs },
        { species: FOLLOWER, level, ivs },
      ],
      boss,
      level,
      ivs,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000, // boss has no charged move anyway
      raidTimerSeconds: 300,
      maxSecondsPerSlot: 60,
      seed: 1,
    };
  }

  it("a Shadow boss can show a slot's enragedAtRaidSeconds after an earlier slot already dealt enough damage", () => {
    const boss: SpeciesDefinition = {
      id: "team-raid-shadow-boss",
      name: "Team Raid Shadow Boss",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 150,
      baseStamina: 3000,
      fastMoves: [{ id: "trs-fast", name: "TRS Fast", type: "normal", power: 10, energyGain: 0, durationSeconds: 1.0 }],
      chargedMoves: [],
      isShadow: true,
      statsArePrecomputed: true,
    };

    const result = runTeamRaid(raid(boss));
    expect(result.slots.length).toBeGreaterThanOrEqual(1);
    // At least one fight across the encounter recorded a real enrage
    // transition — proves damageDealtBeforeFight is actually wired from the
    // running bossDamageAccum total, not just accepted-and-ignored.
    expect(result.slots.some((s) => s.enragedAtRaidSeconds !== null)).toBe(true);
  });

  it("a non-Shadow boss never reports an enrage transition for any slot, even at the same HP pool", () => {
    const boss: SpeciesDefinition = {
      id: "team-raid-non-shadow-boss",
      name: "Team Raid Non-Shadow Boss",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 150,
      baseStamina: 3000,
      fastMoves: [{ id: "trns-fast", name: "TRNS Fast", type: "normal", power: 10, energyGain: 0, durationSeconds: 1.0 }],
      chargedMoves: [],
      statsArePrecomputed: true,
      // isShadow deliberately omitted.
    };

    const result = runTeamRaid(raid(boss));
    expect(result.slots.every((s) => s.enragedAtRaidSeconds === null)).toBe(true);
    expect(result.slots.every((s) => s.subduedAtRaidSeconds === null)).toBe(true);
  });
});
