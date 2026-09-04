import { describe, expect, it } from "vitest";
import { cpmForLevel } from "../src/cpm.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import { calculateDamage } from "../src/damage.js";
import { typeEffectiveness } from "../src/typeChart.js";
import { simulateOpeningBurst } from "../src/combat.js";
import { RAID_BOSS_CPM, RAID_BOSS_IVS } from "../src/raidBoss.js";
import {
  MEGA_RAICHU_X,
  MEGA_RAICHU_Y,
  PRIMAL_KYOGRE,
  SCENARIO_A_LEVEL,
  SCENARIO_A_PERFECT_IVS,
  STATIC_SHOCK,
  WILD_CHARGE,
} from "../src/fixtures/scenarioA.js";

/**
 * These are the acceptance tests called out in the build spec as regression
 * guards: the numbers 190, 221, 10.0s, and 130 HP are verified outputs from the
 * source analysis. If a refactor breaks any of these, the flooring stage in
 * stats.ts is the first place to look (see the "nested FLOOR() problem" note).
 */
describe("Scenario A: Mega Raichu X vs Y vs Primal Kyogre (level 35, no dodging)", () => {
  function bossEffectiveStats() {
    // Raid bosses don't use the trainer CPM table (see raidBoss.ts) — build
    // their effective stats directly from RAID_BOSS_CPM instead of a level.
    const cpm = RAID_BOSS_CPM;
    return {
      attack: Math.floor((PRIMAL_KYOGRE.baseAttack + RAID_BOSS_IVS.attack) * cpm),
      defense: Math.floor((PRIMAL_KYOGRE.baseDefense + RAID_BOSS_IVS.defense) * cpm),
    };
  }

  it("both forms compute to ~130 HP at level 35 with perfect stamina IV", () => {
    const x = effectiveStatsAtLevel(MEGA_RAICHU_X, SCENARIO_A_PERFECT_IVS, SCENARIO_A_LEVEL);
    const y = effectiveStatsAtLevel(MEGA_RAICHU_Y, SCENARIO_A_PERFECT_IVS, SCENARIO_A_LEVEL);
    expect(x.stamina).toBe(130);
    expect(y.stamina).toBe(130);
  });

  it("Y's fast move deals 5 damage and X's deals 4 at level 35 across attack IVs 13-15", () => {
    const boss = bossEffectiveStats();
    const cpm = cpmForLevel(SCENARIO_A_LEVEL);

    for (const ivAttack of [13, 14, 15]) {
      const xAttackStat = Math.floor((MEGA_RAICHU_X.baseAttack + ivAttack) * cpm);
      const yAttackStat = Math.floor((MEGA_RAICHU_Y.baseAttack + ivAttack) * cpm);

      const xDamage = calculateDamage({
        power: STATIC_SHOCK.power,
        attackerAttackStat: xAttackStat,
        defenderDefenseStat: boss.defense,
        stab: true,
        typeEffectiveness: typeEffectiveness("electric", PRIMAL_KYOGRE.types),
        megaBoostMultiplier: MEGA_RAICHU_X.boost!.multiplier,
      });
      const yDamage = calculateDamage({
        power: STATIC_SHOCK.power,
        attackerAttackStat: yAttackStat,
        defenderDefenseStat: boss.defense,
        stab: true,
        typeEffectiveness: typeEffectiveness("electric", PRIMAL_KYOGRE.types),
        megaBoostMultiplier: MEGA_RAICHU_Y.boost!.multiplier,
      });

      expect(xDamage).toBe(4);
      expect(yDamage).toBe(5);
    }
  });

  it("both survive exactly 10.0s, land exactly 1 charged attack, X=190 Y=221 (delta 16.32%)", () => {
    const boss = bossEffectiveStats();
    const xStats = effectiveStatsAtLevel(MEGA_RAICHU_X, SCENARIO_A_PERFECT_IVS, SCENARIO_A_LEVEL);
    const yStats = effectiveStatsAtLevel(MEGA_RAICHU_Y, SCENARIO_A_PERFECT_IVS, SCENARIO_A_LEVEL);

    const bossVsX = typeEffectiveness(PRIMAL_KYOGRE.types[0], MEGA_RAICHU_X.types);
    const bossVsY = typeEffectiveness(PRIMAL_KYOGRE.types[0], MEGA_RAICHU_Y.types);
    const electricVsBoss = typeEffectiveness("electric", PRIMAL_KYOGRE.types);

    const xResult = simulateOpeningBurst(
      {
        hp: xStats.stamina,
        defenseStat: xStats.defense,
        attackStat: xStats.attack,
        fastMove: STATIC_SHOCK,
        chargedMove: WILD_CHARGE,
        damageOut: { stab: true, typeEffectiveness: electricVsBoss, megaBoostMultiplier: MEGA_RAICHU_X.boost!.multiplier },
      },
      {
        attackStat: boss.attack,
        defenseStat: boss.defense,
        fastMove: PRIMAL_KYOGRE.fastMoves[0]!,
        damageOut: { stab: true, typeEffectiveness: bossVsX },
      },
    );

    const yResult = simulateOpeningBurst(
      {
        hp: yStats.stamina,
        defenseStat: yStats.defense,
        attackStat: yStats.attack,
        fastMove: STATIC_SHOCK,
        chargedMove: WILD_CHARGE,
        damageOut: { stab: true, typeEffectiveness: electricVsBoss, megaBoostMultiplier: MEGA_RAICHU_Y.boost!.multiplier },
      },
      {
        attackStat: boss.attack,
        defenseStat: boss.defense,
        fastMove: PRIMAL_KYOGRE.fastMoves[0]!,
        damageOut: { stab: true, typeEffectiveness: bossVsY },
      },
    );

    expect(xResult.faintedAtSeconds).toBe(10.0);
    expect(yResult.faintedAtSeconds).toBe(10.0);
    expect(xResult.chargedAttacksLanded).toBe(1);
    expect(yResult.chargedAttacksLanded).toBe(1);
    expect(xResult.totalChargedDamage).toBe(190);
    expect(yResult.totalChargedDamage).toBe(221);

    const delta = (yResult.totalChargedDamage - xResult.totalChargedDamage) / xResult.totalChargedDamage;
    expect(Math.round(delta * 10000) / 100).toBe(16.32);
  });
});
