import { describe, expect, it } from "vitest";
import { cpmForLevel } from "../src/cpm.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import { calculateDamage } from "../src/damage.js";
import { typeEffectiveness } from "../src/typeChart.js";
import { simulateOpeningBurst } from "../src/combat.js";
import { RAID_BOSS_CPM, RAID_BOSS_IVS } from "../src/raidBoss.js";
import {
  ARC_SPARK,
  BOSS_TIDE,
  CANDIDATE_ALPHA,
  CANDIDATE_BETA,
  LEVEL,
  PERFECT_IVS,
  VOLT_SLAM,
} from "./fixtures/hypotheticalDuo.js";

/**
 * Acceptance tests / regression guards for this engine's core formula
 * pipeline, pinned against fresh, hand-authored, clearly-hypothetical
 * fixtures (see test/fixtures/hypotheticalDuo.ts's doc comment for why these
 * replaced the project's original 4 shared hypothetical species — the user
 * explicitly authorized deleting MEGA_RAICHU_X/Y, PRIMAL_KYOGRE, and
 * MEGA_SKARMORY, since they'd leaked into packages/web's live species
 * picker). The numbers below (150 HP, a 5/6 fast-move damage split across
 * attack IV 13-15, 171/189 charged-move split after surviving exactly 7.5s,
 * 10.53% delta) were derived fresh against THIS engine's own formulas (not
 * from any external spec) — if a refactor breaks one of these, the flooring
 * stage in stats.ts is still the first place to look (see the "nested
 * FLOOR() problem" note there).
 */
describe("Acceptance: Candidate Alpha vs Beta vs Boss Tide (level 35, no dodging)", () => {
  function bossEffectiveStats() {
    // Raid bosses don't use the trainer CPM table (see raidBoss.ts) — build
    // their effective stats directly from RAID_BOSS_CPM instead of a level.
    const cpm = RAID_BOSS_CPM;
    return {
      attack: Math.floor((BOSS_TIDE.baseAttack + RAID_BOSS_IVS.attack) * cpm),
      defense: Math.floor((BOSS_TIDE.baseDefense + RAID_BOSS_IVS.defense) * cpm),
    };
  }

  it("both candidates compute to exactly 150 HP at level 35 with perfect stamina IV", () => {
    const alpha = effectiveStatsAtLevel(CANDIDATE_ALPHA, PERFECT_IVS, LEVEL);
    const beta = effectiveStatsAtLevel(CANDIDATE_BETA, PERFECT_IVS, LEVEL);
    expect(alpha.stamina).toBe(150);
    expect(beta.stamina).toBe(150);
  });

  it("Beta's fast move deals 6 damage and Alpha's deals 5 at level 35 across attack IVs 13-15", () => {
    const boss = bossEffectiveStats();
    const cpm = cpmForLevel(LEVEL);

    for (const ivAttack of [13, 14, 15]) {
      const alphaAttackStat = Math.floor((CANDIDATE_ALPHA.baseAttack + ivAttack) * cpm);
      const betaAttackStat = Math.floor((CANDIDATE_BETA.baseAttack + ivAttack) * cpm);

      const alphaDamage = calculateDamage({
        power: ARC_SPARK.power,
        attackerAttackStat: alphaAttackStat,
        defenderDefenseStat: boss.defense,
        stab: true,
        typeEffectiveness: typeEffectiveness("electric", BOSS_TIDE.types),
        megaBoostMultiplier: CANDIDATE_ALPHA.boost!.multiplier,
      });
      const betaDamage = calculateDamage({
        power: ARC_SPARK.power,
        attackerAttackStat: betaAttackStat,
        defenderDefenseStat: boss.defense,
        stab: true,
        typeEffectiveness: typeEffectiveness("electric", BOSS_TIDE.types),
        megaBoostMultiplier: CANDIDATE_BETA.boost!.multiplier,
      });

      expect(alphaDamage).toBe(5);
      expect(betaDamage).toBe(6);
    }
  });

  it("both survive exactly 7.5s, land exactly 1 charged attack, Alpha=171 Beta=189 (delta 10.53%)", () => {
    const boss = bossEffectiveStats();
    const alphaStats = effectiveStatsAtLevel(CANDIDATE_ALPHA, PERFECT_IVS, LEVEL);
    const betaStats = effectiveStatsAtLevel(CANDIDATE_BETA, PERFECT_IVS, LEVEL);

    const bossVsAlpha = typeEffectiveness(BOSS_TIDE.types[0]!, CANDIDATE_ALPHA.types);
    const bossVsBeta = typeEffectiveness(BOSS_TIDE.types[0]!, CANDIDATE_BETA.types);
    const electricVsBoss = typeEffectiveness("electric", BOSS_TIDE.types);

    const alphaResult = simulateOpeningBurst(
      {
        hp: alphaStats.stamina,
        defenseStat: alphaStats.defense,
        attackStat: alphaStats.attack,
        fastMove: ARC_SPARK,
        chargedMove: VOLT_SLAM,
        // Arc Spark and Volt Slam are both Electric, so the same type-effectiveness applies to both.
        fastDamageOut: { stab: true, typeEffectiveness: electricVsBoss, megaBoostMultiplier: CANDIDATE_ALPHA.boost!.multiplier },
        chargedDamageOut: { stab: true, typeEffectiveness: electricVsBoss, megaBoostMultiplier: CANDIDATE_ALPHA.boost!.multiplier },
      },
      {
        attackStat: boss.attack,
        defenseStat: boss.defense,
        fastMove: BOSS_TIDE.fastMoves[0]!,
        damageOut: { stab: true, typeEffectiveness: bossVsAlpha },
      },
    );

    const betaResult = simulateOpeningBurst(
      {
        hp: betaStats.stamina,
        defenseStat: betaStats.defense,
        attackStat: betaStats.attack,
        fastMove: ARC_SPARK,
        chargedMove: VOLT_SLAM,
        fastDamageOut: { stab: true, typeEffectiveness: electricVsBoss, megaBoostMultiplier: CANDIDATE_BETA.boost!.multiplier },
        chargedDamageOut: { stab: true, typeEffectiveness: electricVsBoss, megaBoostMultiplier: CANDIDATE_BETA.boost!.multiplier },
      },
      {
        attackStat: boss.attack,
        defenseStat: boss.defense,
        fastMove: BOSS_TIDE.fastMoves[0]!,
        damageOut: { stab: true, typeEffectiveness: bossVsBeta },
      },
    );

    expect(alphaResult.faintedAtSeconds).toBe(7.5);
    expect(betaResult.faintedAtSeconds).toBe(7.5);
    expect(alphaResult.chargedAttacksLanded).toBe(1);
    expect(betaResult.chargedAttacksLanded).toBe(1);
    expect(alphaResult.totalChargedDamage).toBe(171);
    expect(betaResult.totalChargedDamage).toBe(189);

    const delta = (betaResult.totalChargedDamage - alphaResult.totalChargedDamage) / alphaResult.totalChargedDamage;
    expect(Math.round(delta * 10000) / 100).toBe(10.53);
  });
});

/**
 * BOSS_TIDE's boost.persistsThroughFaint is fixture metadata, only consumed
 * if this species is ever used as a candidate (attacker) rather than in its
 * usual boss role above — boss-mode damage calc never reads
 * SpeciesDefinition.boost at all, so this can't affect any of the pinned
 * numbers asserted above.
 */
describe("BOSS_TIDE fixture: boost.persistsThroughFaint", () => {
  it("is flagged true, matching the persists-through-fainting mega/primal mechanic", () => {
    expect(BOSS_TIDE.boost).toBeDefined();
    expect(BOSS_TIDE.boost!.persistsThroughFaint).toBe(true);
    expect(BOSS_TIDE.boost!.boostedType).toBe("water");
  });
});
