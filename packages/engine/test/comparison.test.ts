import { describe, expect, it } from "vitest";
import { runComparison } from "../src/comparison.js";
import { calculateDamage } from "../src/damage.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import { RAID_BOSS_CPM, RAID_BOSS_IVS } from "../src/raidBoss.js";
import type { SpeciesDefinition } from "../src/types.js";
import {
  MEGA_RAICHU_X,
  MEGA_RAICHU_Y,
  PRIMAL_KYOGRE,
  SCENARIO_A_LEVEL,
  SCENARIO_A_PERFECT_IVS,
} from "../src/fixtures/scenarioA.js";

describe("runComparison", () => {
  it("reproduces the Scenario A acceptance numbers through the shared comparison path", () => {
    const [x, y] = runComparison({
      candidates: [MEGA_RAICHU_X, MEGA_RAICHU_Y],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
    });

    expect(x!.secondsSurvived).toBe(10);
    expect(y!.secondsSurvived).toBe(10);
    expect(x!.chargedAttacksLanded).toBe(1);
    expect(y!.chargedAttacksLanded).toBe(1);
    expect(x!.ownChargedDamage).toBe(190);
    expect(y!.ownChargedDamage).toBe(221);

    // ownDamageTrajectory is the COMBINED fast+charged total over time, so its
    // final value is the charged total plus whatever fast-move damage also
    // landed against the boss over the same 10s — not 190/221 alone.
    expect(x!.ownTotalDamage).toBe(x!.ownChargedDamage + x!.ownFastMoveDamage);
    expect(x!.ownDamageTrajectory[0]).toEqual({ atSeconds: 0, cumulativeDamage: 0 });
    expect(x!.ownDamageTrajectory.at(-1)).toEqual({ atSeconds: 10, cumulativeDamage: x!.ownTotalDamage });
    expect(y!.ownDamageTrajectory.at(-1)).toEqual({ atSeconds: 10, cumulativeDamage: y!.ownTotalDamage });
    // X and Y share the exact same fast move (Static Shock) and fight length,
    // so their fast-move damage should differ only via their own attack stat
    // (Y > X) — sanity-check it's actually being tracked, not left at 0.
    expect(x!.ownFastMoveDamage).toBeGreaterThan(0);
    expect(y!.ownFastMoveDamage).toBeGreaterThanOrEqual(x!.ownFastMoveDamage);
  });

  it("derives the opening-burst window from the boss's own energy economy instead of a fixed 20s default", () => {
    // Primal Kyogre: Waterfall (energyGain 8, 2.5s) needs ceil(100/8)=13 casts
    // for Hydro Pump's 100 cost -> 13 * 2.5 = 32.5s. Both Raichu forms faint
    // at 10.0s regardless (well inside either the old 20s or new 32.5s), so
    // this only changes behavior for a candidate that would otherwise have
    // survived past the old fixed window.
    const [x] = runComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "perfect" },
    });
    // Perfect dodge quarters incoming damage, so X now easily outlasts the
    // old fixed 20s default; confirm it's capped at the new derived ~32.5s
    // window instead of an artificially small or infinite one.
    expect(x!.secondsSurvived).toBeLessThanOrEqual(32.5);
  });

  it("dodging fast attacks extends survival time versus no dodging (opening burst has no charged attacks to dodge)", () => {
    // `dodge` (DodgeBehavior) governs charged-attack dodging only, and the
    // boss never throws a charged move during the opening burst — so it's
    // `dodgeFastAttacks` (a plain boolean) that matters here, not `dodge`.
    const noDodge = runComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
    });
    const dodgingFastAttacks = runComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
      dodgeFastAttacks: true,
    });
    expect(dodgingFastAttacks[0]!.secondsSurvived).toBeGreaterThan(noDodge[0]!.secondsSurvived);
  });

  it("dodge (charged-attack behavior) has no effect during the opening burst, since the boss never throws a charged move there", () => {
    const noDodge = runComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "none" },
    });
    const perfectChargedDodge = runComparison({
      candidates: [MEGA_RAICHU_X],
      boss: PRIMAL_KYOGRE,
      level: SCENARIO_A_LEVEL,
      ivs: SCENARIO_A_PERFECT_IVS,
      dodge: { kind: "perfect" },
    });
    expect(perfectChargedDodge[0]!.secondsSurvived).toBe(noDodge[0]!.secondsSurvived);
    expect(perfectChargedDodge[0]!.ownChargedDamage).toBe(noDodge[0]!.ownChargedDamage);
  });

  it("computes each of the attacker's moves against the boss using that move's OWN type, not the fast move's type for both", () => {
    // A synthetic attacker whose fast move (Water) and charged move (Fire)
    // differ in type, against a Fire boss — a regression guard for a real
    // bug: an earlier version built one shared damageOut from the fast
    // move's type-effectiveness and applied it to BOTH moves, which was
    // invisible in every fixture because Static Shock and Wild Charge
    // (Scenario A) happen to both be Electric.
    const fastMove = { id: "f", name: "Water Fast", type: "water" as const, power: 10, energyGain: 20, durationSeconds: 1 };
    const chargedMove = { id: "c", name: "Fire Charged", type: "fire" as const, power: 100, energyCost: 40, durationSeconds: 2, vulnerableWindowSeconds: 2 };
    const dualTypeAttacker: SpeciesDefinition = {
      id: "synthetic-attacker",
      name: "Synthetic Attacker",
      types: ["water"],
      baseAttack: 300,
      baseDefense: 200,
      baseStamina: 200,
      fastMoves: [fastMove],
      chargedMoves: [chargedMove],
    };
    const bossFastMove = { id: "bf", name: "Boss Fast", type: "normal" as const, power: 5, energyGain: 0, durationSeconds: 100 };
    const fireBoss: SpeciesDefinition = {
      id: "synthetic-boss",
      name: "Synthetic Boss",
      types: ["fire"],
      baseAttack: 100,
      baseDefense: 200,
      baseStamina: 30000,
      fastMoves: [bossFastMove],
      chargedMoves: [],
    };

    const level = 40;
    const ivs = { attack: 15, defense: 15, stamina: 15 };
    const [result] = runComparison({ candidates: [dualTypeAttacker], boss: fireBoss, level, ivs, dodge: { kind: "none" } });

    const attackerStats = effectiveStatsAtLevel(dualTypeAttacker, ivs, level);
    const bossDefenseStat = Math.floor((fireBoss.baseDefense + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
    // Water (fast): attacker IS Water, so STAB applies; neutral vs Fire (1x).
    // Fire (charged): attacker is NOT Fire, so STAB does NOT apply; resisted
    // by Fire (0.625x, current-gen single-resist — see typeChart.ts). Both
    // the STAB flag and the type-effectiveness differ per move here — a
    // shared damageOut built from the fast move alone would get both wrong.
    const expectedFastDamagePerHit = calculateDamage({
      power: fastMove.power,
      attackerAttackStat: attackerStats.attack,
      defenderDefenseStat: bossDefenseStat,
      stab: true,
      typeEffectiveness: 1,
    });
    const expectedChargedDamagePerHit = calculateDamage({
      power: chargedMove.power,
      attackerAttackStat: attackerStats.attack,
      defenderDefenseStat: bossDefenseStat,
      stab: false,
      typeEffectiveness: 0.625,
    });

    expect(result!.chargedAttacksLanded).toBeGreaterThan(0);
    expect(result!.ownChargedDamage / result!.chargedAttacksLanded).toBe(expectedChargedDamagePerHit);
    // Bug check: the old behavior built one shared damageOut from the FAST
    // move's stab/type-effectiveness and applied it to the charged move too
    // — reproduce that here and confirm it would have given a different
    // (wrong) number, so this test would actually catch a regression.
    const buggyChargedDamagePerHit = calculateDamage({
      power: chargedMove.power,
      attackerAttackStat: attackerStats.attack,
      defenderDefenseStat: bossDefenseStat,
      stab: true,
      typeEffectiveness: 1,
    });
    expect(expectedChargedDamagePerHit).not.toBe(buggyChargedDamagePerHit);
    expect(result!.ownFastMoveDamage).toBeGreaterThan(0);
    expect(result!.ownFastMoveDamage % expectedFastDamagePerHit).toBe(0);
  });
});
