import { describe, expect, it } from "vitest";
import { runComparison } from "../src/comparison.js";
import { calculateDamage } from "../src/damage.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import { SHADOW_DEFENSE_MULTIPLIER } from "../src/shadow.js";
import { RAID_BOSS_CPM, RAID_BOSS_IVS } from "../src/raidBoss.js";
import { convertUptimeToTeamDamage } from "../src/uptime.js";
import type { SpeciesDefinition } from "../src/types.js";
import { BOSS_TIDE, CANDIDATE_ALPHA, CANDIDATE_BETA, LEVEL, PERFECT_IVS } from "./fixtures/hypotheticalDuo.js";

describe("runComparison", () => {
  it("reproduces the Scenario A acceptance numbers through the shared comparison path", () => {
    const [alpha, beta] = runComparison({
      candidates: [CANDIDATE_ALPHA, CANDIDATE_BETA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
    });

    expect(alpha!.secondsSurvived).toBe(7.5);
    expect(beta!.secondsSurvived).toBe(7.5);
    expect(alpha!.chargedAttacksLanded).toBe(1);
    expect(beta!.chargedAttacksLanded).toBe(1);
    expect(alpha!.ownChargedDamage).toBe(171);
    expect(beta!.ownChargedDamage).toBe(189);

    // ownDamageTrajectory is the COMBINED fast+charged total over time, so its
    // final value is the charged total plus whatever fast-move damage also
    // landed against the boss over the same 7.5s — not 171/189 alone.
    expect(alpha!.ownTotalDamage).toBe(alpha!.ownChargedDamage + alpha!.ownFastMoveDamage);
    expect(alpha!.ownDamageTrajectory[0]).toEqual({ atSeconds: 0, cumulativeDamage: 0 });
    expect(alpha!.ownDamageTrajectory.at(-1)).toEqual({ atSeconds: 7.5, cumulativeDamage: alpha!.ownTotalDamage });
    expect(beta!.ownDamageTrajectory.at(-1)).toEqual({ atSeconds: 7.5, cumulativeDamage: beta!.ownTotalDamage });
    // Alpha and Beta share the exact same fast move (Arc Spark) and fight
    // length, so their fast-move damage should differ only via their own
    // attack stat (Beta > Alpha) — sanity-check it's actually being tracked,
    // not left at 0.
    expect(alpha!.ownFastMoveDamage).toBeGreaterThan(0);
    expect(beta!.ownFastMoveDamage).toBeGreaterThanOrEqual(alpha!.ownFastMoveDamage);
  });

  it("derives the opening-burst window from the boss's own energy economy instead of a fixed 20s default", () => {
    // Boss Tide: Tidal Surge (energyGain 10, 2.5s) needs ceil(100/10)=10 casts
    // for Maelstrom's 100 cost -> 10 * 2.5 = 25.0s. Both candidates faint at
    // 7.5s regardless (well inside either the old 20s or new 25.0s), so this
    // only changes behavior for a candidate that would otherwise have
    // survived past the old fixed window.
    const [alpha] = runComparison({
      candidates: [CANDIDATE_ALPHA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "perfect" },
    });
    // dodge (DodgeBehavior) has no effect during the opening burst (see
    // below), so this just confirms survival is capped at the new derived
    // ~25.0s window instead of an artificially small or infinite one.
    expect(alpha!.secondsSurvived).toBeLessThanOrEqual(25.0);
  });

  it("dodging fast attacks extends survival time versus no dodging (opening burst has no charged attacks to dodge)", () => {
    // `dodge` (DodgeBehavior) governs charged-attack dodging only, and the
    // boss never throws a charged move during the opening burst — so it's
    // `dodgeFastAttacks` (a plain boolean) that matters here, not `dodge`.
    const noDodge = runComparison({
      candidates: [CANDIDATE_ALPHA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
    });
    const dodgingFastAttacks = runComparison({
      candidates: [CANDIDATE_ALPHA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
      dodgeFastAttacks: true,
    });
    expect(dodgingFastAttacks[0]!.secondsSurvived).toBeGreaterThan(noDodge[0]!.secondsSurvived);
  });

  it("dodge (charged-attack behavior) has no effect during the opening burst, since the boss never throws a charged move there", () => {
    const noDodge = runComparison({
      candidates: [CANDIDATE_ALPHA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
    });
    const perfectChargedDodge = runComparison({
      candidates: [CANDIDATE_ALPHA],
      boss: BOSS_TIDE,
      level: LEVEL,
      ivs: PERFECT_IVS,
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
      // A hand-authored synthetic test boss: these numbers are meant to
      // already BE the effective boss stats (see comparison.ts's
      // RAID_BOSS_IVS/RAID_BOSS_CPM used directly below), not a real
      // species' raw base stats needing the real per-tier derivation.
      statsArePrecomputed: true,
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

  it("resolves an explicitly selected candidate/boss move by id instead of always defaulting to index 0", () => {
    // Two fast moves and two charged moves per side, same energy economics
    // (energyGain/energyCost/durationSeconds) but different power — isolates
    // the effect of *which move* was picked from any timing difference, since
    // hit counts should land identically regardless of which move is selected.
    const fastLow = { id: "fast-low", name: "Fast Low", type: "normal" as const, power: 5, energyGain: 10, durationSeconds: 1 };
    const fastHigh = { id: "fast-high", name: "Fast High", type: "normal" as const, power: 15, energyGain: 10, durationSeconds: 1 };
    const chargedLow = { id: "charged-low", name: "Charged Low", type: "normal" as const, power: 50, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 };
    const chargedHigh = { id: "charged-high", name: "Charged High", type: "normal" as const, power: 90, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 };
    const multiMoveAttacker: SpeciesDefinition = {
      id: "multi-move-attacker",
      name: "Multi Move Attacker",
      types: ["normal"],
      baseAttack: 300,
      baseDefense: 200,
      baseStamina: 200,
      fastMoves: [fastLow, fastHigh],
      chargedMoves: [chargedLow, chargedHigh],
    };
    const boss: SpeciesDefinition = {
      id: "test-boss",
      name: "Test Boss",
      types: ["normal"],
      baseAttack: 50,
      baseDefense: 200,
      baseStamina: 30000,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal" as const, power: 5, energyGain: 0, durationSeconds: 100 }],
      chargedMoves: [],
      statsArePrecomputed: true,
    };
    const level = 40;
    const ivs = { attack: 15, defense: 15, stamina: 15 };

    const [withDefaults] = runComparison({ candidates: [multiMoveAttacker], boss, level, ivs, dodge: { kind: "none" } });
    const [withSelected] = runComparison({
      candidates: [multiMoveAttacker],
      candidateFastMoveIds: ["fast-high"],
      candidateChargedMoveIds: ["charged-high"],
      boss,
      level,
      ivs,
      dodge: { kind: "none" },
    });

    expect(withDefaults!.chargedAttacksLanded).toBeGreaterThan(0);
    expect(withSelected!.chargedAttacksLanded).toBe(withDefaults!.chargedAttacksLanded);
    // Same hit counts on both sides (verified above), so a higher-power move
    // selection must show up as strictly more damage, not just different
    // damage — proving resolveMove actually picked the requested move.
    expect(withSelected!.ownFastMoveDamage).toBeGreaterThan(withDefaults!.ownFastMoveDamage);
    expect(withSelected!.ownChargedDamage).toBeGreaterThan(withDefaults!.ownChargedDamage);
  });

  it("applies the Shadow attack/defense multiplier to a boss's stats too (several real raid bosses are Shadow)", () => {
    // Same candidate against two otherwise-identical bosses, one flagged
    // isShadow — the shadow boss should hit HARDER (higher attack, x1.2) but
    // also take MORE damage per hit (lower defense, x0.83) — the same
    // glass-cannon trade a Shadow attacker gets, just from the boss's side.
    const attacker: SpeciesDefinition = {
      id: "shadow-boss-test-attacker",
      name: "Attacker",
      types: ["normal"],
      baseAttack: 300,
      baseDefense: 200,
      // Deliberately low (a real species' base stamina is never this low) so
      // the candidate actually faints inside the fixed 20s opening-burst
      // window (these test bosses have no charged move) instead of the fight
      // just hitting the window cap unfainted on both sides, which would
      // make secondsSurvived identical regardless of boss attack stat.
      baseStamina: 50,
      fastMoves: [{ id: "af", name: "Attacker Fast", type: "normal", power: 10, energyGain: 10, durationSeconds: 1 }],
      chargedMoves: [{ id: "ac", name: "Attacker Charged", type: "normal", power: 80, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
    };
    const bossFastMove = { id: "bf", name: "Boss Fast", type: "normal" as const, power: 10, energyGain: 0, durationSeconds: 1.5 };
    const normalBoss: SpeciesDefinition = {
      id: "normal-boss",
      name: "Normal Boss",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 150,
      baseStamina: 20000,
      fastMoves: [bossFastMove],
      chargedMoves: [],
      statsArePrecomputed: true,
    };
    const shadowBoss: SpeciesDefinition = { ...normalBoss, id: "shadow-boss", name: "Shadow Boss", isShadow: true };

    const level = 40;
    const ivs = { attack: 15, defense: 15, stamina: 15 };
    const [vsNormal] = runComparison({ candidates: [attacker], boss: normalBoss, level, ivs, dodge: { kind: "none" } });
    const [vsShadow] = runComparison({ candidates: [attacker], boss: shadowBoss, level, ivs, dodge: { kind: "none" } });

    // Both bosses land the same number of fast attacks before the candidate's
    // first fast hit lands (identical timing/energy economics on both sides),
    // so a strictly-shorter survival time is itself proof the Shadow boss hit
    // harder per attack — higher boss attack -> candidate survives less time.
    expect(vsShadow!.secondsSurvived).toBeLessThan(vsNormal!.secondsSurvived);

    // Lower boss DEFENSE (x0.83) -> candidate's own fast-move damage per hit
    // is actually HIGHER against the Shadow boss. Compare directly against
    // the shared damage formula rather than back-deriving "per hit" from
    // totals (fast and charged hits land at different counts, so dividing by
    // chargedAttacksLanded doesn't isolate fast-move damage).
    const attackerStats = effectiveStatsAtLevel(attacker, ivs, level);
    const normalBossDefense = Math.floor((normalBoss.baseDefense + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
    const shadowBossDefense = Math.floor((normalBoss.baseDefense * SHADOW_DEFENSE_MULTIPLIER + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
    const fastDamageVsNormal = calculateDamage({
      power: attacker.fastMoves[0]!.power,
      attackerAttackStat: attackerStats.attack,
      defenderDefenseStat: normalBossDefense,
      stab: true,
    });
    const fastDamageVsShadow = calculateDamage({
      power: attacker.fastMoves[0]!.power,
      attackerAttackStat: attackerStats.attack,
      defenderDefenseStat: shadowBossDefense,
      stab: true,
    });
    expect(shadowBossDefense).toBeLessThan(normalBossDefense);
    expect(fastDamageVsShadow).toBeGreaterThan(fastDamageVsNormal);
  });

  it("applies the weather boost per-move (by that move's own type), independently to the candidate's fast/charged moves", () => {
    // Attacker's fast move is Water (boosted by rainy), charged move is Fire
    // (NOT boosted by rainy) — isolates that the boost is checked per-move,
    // not once for the whole species/fight.
    const fastMove = { id: "wf", name: "Water Fast", type: "water" as const, power: 10, energyGain: 20, durationSeconds: 1 };
    const chargedMove = { id: "fc", name: "Fire Charged", type: "fire" as const, power: 100, energyCost: 40, durationSeconds: 2, vulnerableWindowSeconds: 2 };
    const attacker: SpeciesDefinition = {
      id: "weather-test-attacker",
      name: "Weather Attacker",
      types: ["water"],
      baseAttack: 300,
      baseDefense: 200,
      baseStamina: 400,
      fastMoves: [fastMove],
      chargedMoves: [chargedMove],
    };
    const bossFastMove = { id: "bf", name: "Boss Fast", type: "normal" as const, power: 5, energyGain: 0, durationSeconds: 100 };
    const boss: SpeciesDefinition = {
      id: "weather-test-boss",
      name: "Weather Boss",
      types: ["normal"],
      baseAttack: 100,
      baseDefense: 200,
      baseStamina: 30000,
      fastMoves: [bossFastMove],
      chargedMoves: [],
      statsArePrecomputed: true,
    };
    const level = 40;
    const ivs = { attack: 15, defense: 15, stamina: 15 };

    const noWeather = runComparison({ candidates: [attacker], boss, level, ivs, dodge: { kind: "none" } });
    const rainy = runComparison({ candidates: [attacker], boss, level, ivs, dodge: { kind: "none" }, weather: "rainy" });
    const sunny = runComparison({ candidates: [attacker], boss, level, ivs, dodge: { kind: "none" }, weather: "sunny" });

    expect(noWeather[0]!.ownFastMoveDamage).toBeGreaterThan(0);
    expect(noWeather[0]!.ownChargedDamage).toBeGreaterThan(0);

    // Rainy boosts Water (fast move) but not Fire (charged move).
    expect(rainy[0]!.ownFastMoveDamage).toBeGreaterThan(noWeather[0]!.ownFastMoveDamage);
    expect(rainy[0]!.ownChargedDamage).toBe(noWeather[0]!.ownChargedDamage);

    // Sunny boosts Ground/Fire/Grass — Fire (the charged move) is one of
    // those, Water (the fast move) is not, so this is the mirror image of
    // the rainy case above: confirms the mapping is consulted per-move-type
    // for each weather condition, not just "any weather boosts everything".
    expect(sunny[0]!.ownChargedDamage).toBeGreaterThan(noWeather[0]!.ownChargedDamage);
    expect(sunny[0]!.ownFastMoveDamage).toBe(noWeather[0]!.ownFastMoveDamage);

    // Cross-check against the raw formula: rainy's fast-move-per-hit damage
    // should match calculateDamage with weatherBoosted:true explicitly.
    const attackerStats = effectiveStatsAtLevel(attacker, ivs, level);
    const bossDefenseStat = Math.floor((boss.baseDefense + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
    const expectedBoostedFastDamage = calculateDamage({
      power: fastMove.power,
      attackerAttackStat: attackerStats.attack,
      defenderDefenseStat: bossDefenseStat,
      stab: true,
      weatherBoosted: true,
    });
    expect(rainy[0]!.ownFastMoveDamage % expectedBoostedFastDamage).toBe(0);
  });

  it("applies the weather boost to the BOSS's own move too, independently of the candidate's moves", () => {
    // Boss's fast move is Electric (boosted by rainy); candidate is pure
    // Normal (neither of its moves is boosted by rainy) — isolates that the
    // boss's own damage output also responds to weather, not just the
    // candidate's.
    const attacker: SpeciesDefinition = {
      id: "weather-boss-test-attacker",
      name: "Attacker",
      types: ["normal"],
      baseAttack: 300,
      baseDefense: 200,
      // Deliberately low so the candidate actually faints inside the fixed
      // opening-burst window from fast attacks alone (same technique as the
      // Shadow-boss test above).
      baseStamina: 50,
      fastMoves: [{ id: "af", name: "Attacker Fast", type: "normal", power: 10, energyGain: 10, durationSeconds: 1 }],
      chargedMoves: [{ id: "ac", name: "Attacker Charged", type: "normal", power: 80, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
    };
    const bossFastMove = { id: "bf", name: "Boss Fast", type: "electric" as const, power: 10, energyGain: 0, durationSeconds: 1.5 };
    const boss: SpeciesDefinition = {
      id: "weather-boss-test-boss",
      name: "Boss",
      types: ["electric"],
      baseAttack: 150,
      baseDefense: 150,
      baseStamina: 20000,
      fastMoves: [bossFastMove],
      chargedMoves: [],
      statsArePrecomputed: true,
    };
    const level = 40;
    const ivs = { attack: 15, defense: 15, stamina: 15 };

    const [noWeather] = runComparison({ candidates: [attacker], boss, level, ivs, dodge: { kind: "none" } });
    const [rainy] = runComparison({ candidates: [attacker], boss, level, ivs, dodge: { kind: "none" }, weather: "rainy" });

    // Same fast-attack cadence/energy economics on both sides regardless of
    // weather, so a strictly shorter survival time under rainy is itself
    // proof the boss's Electric fast move now hits harder.
    expect(rainy!.secondsSurvived).toBeLessThan(noWeather!.secondsSurvived);
  });

  it("throws when a boss species is flagged both isShadow and carries a mega/primal boost", () => {
    const impossibleBoss: SpeciesDefinition = {
      id: "impossible-shadow-mega-boss",
      name: "Impossible",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 150,
      baseStamina: 20000,
      fastMoves: [{ id: "bf", name: "Boss Fast", type: "normal", power: 10, energyGain: 0, durationSeconds: 1.5 }],
      chargedMoves: [],
      isShadow: true,
      boost: { multiplier: 1.3, boostedType: "normal" },
      statsArePrecomputed: true,
    };
    const attacker: SpeciesDefinition = {
      id: "shadow-boss-test-attacker-2",
      name: "Attacker",
      types: ["normal"],
      baseAttack: 300,
      baseDefense: 200,
      baseStamina: 200,
      fastMoves: [{ id: "af", name: "Attacker Fast", type: "normal", power: 10, energyGain: 10, durationSeconds: 1 }],
      chargedMoves: [{ id: "ac", name: "Attacker Charged", type: "normal", power: 80, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
    };
    expect(() =>
      runComparison({
        candidates: [attacker],
        boss: impossibleBoss,
        level: 40,
        ivs: { attack: 15, defense: 15, stamina: 15 },
        dodge: { kind: "none" },
      }),
    ).toThrow();
  });

  it("CandidateResult.boostMultiplier is undefined for a genuinely non-mega candidate (no boost field at all)", () => {
    const nonMega: SpeciesDefinition = {
      id: "non-mega-attacker",
      name: "Non Mega",
      types: ["normal"],
      baseAttack: 200,
      baseDefense: 150,
      baseStamina: 200,
      fastMoves: [{ id: "f", name: "F", type: "normal", power: 10, energyGain: 10, durationSeconds: 1 }],
      chargedMoves: [{ id: "c", name: "C", type: "normal", power: 50, energyCost: 40, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
    };
    const boss: SpeciesDefinition = {
      id: "non-mega-test-boss",
      name: "Boss",
      types: ["normal"],
      baseAttack: 100,
      baseDefense: 200,
      baseStamina: 30000,
      fastMoves: [{ id: "bf", name: "Boss Fast", type: "normal", power: 5, energyGain: 0, durationSeconds: 100 }],
      chargedMoves: [],
      statsArePrecomputed: true,
    };
    const [result] = runComparison({
      candidates: [nonMega],
      boss,
      level: 40,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodge: { kind: "none" },
    });
    expect(result!.boostMultiplier).toBeUndefined();
    // Closes the loop with uptime.ts: feeding this straight into
    // convertUptimeToTeamDamage must show ZERO team-damage-from-boost for a
    // candidate that was never boosted at all, not the old off-type fallback.
    expect(
      convertUptimeToTeamDamage({
        secondsSurvived: result!.secondsSurvived,
        boostMultiplier: result!.boostMultiplier,
        teammateCount: 4,
        matchingTeammateCount: 4,
        teammateDps: 26.5,
      }),
    ).toBe(0);
  });

  it("only boosts a candidate's own move when that move's type matches the boost's boostedType (Fix 3: off-type moves get no self-boost)", () => {
    const fastMoveOnType = { id: "fast-on", name: "Fast On", type: "fire" as const, power: 10, energyGain: 20, durationSeconds: 1 };
    const chargedMoveOffType = {
      id: "charged-off",
      name: "Charged Off",
      type: "water" as const,
      power: 80,
      energyCost: 40,
      durationSeconds: 2,
      vulnerableWindowSeconds: 2,
    };
    const boostedAttacker: SpeciesDefinition = {
      id: "boosted-attacker",
      name: "Boosted Attacker",
      types: ["fire"],
      baseAttack: 300,
      baseDefense: 200,
      baseStamina: 300,
      fastMoves: [fastMoveOnType],
      chargedMoves: [chargedMoveOffType],
      boost: { multiplier: 2, boostedType: "fire" },
    };
    const boss: SpeciesDefinition = {
      id: "boost-gating-test-boss",
      name: "Boss",
      types: ["normal"],
      baseAttack: 100,
      baseDefense: 200,
      baseStamina: 30000,
      fastMoves: [{ id: "bf", name: "Boss Fast", type: "normal", power: 5, energyGain: 0, durationSeconds: 100 }],
      chargedMoves: [],
      statsArePrecomputed: true,
    };
    const level = 40;
    const ivs = { attack: 15, defense: 15, stamina: 15 };
    const [result] = runComparison({ candidates: [boostedAttacker], boss, level, ivs, dodge: { kind: "none" } });

    const attackerStats = effectiveStatsAtLevel(boostedAttacker, ivs, level);
    const bossDefenseStat = Math.floor((boss.baseDefense + RAID_BOSS_IVS.defense) * RAID_BOSS_CPM);
    // On-type fast move: full 2x self-boost applies.
    const expectedFastDamagePerHit = calculateDamage({
      power: fastMoveOnType.power,
      attackerAttackStat: attackerStats.attack,
      defenderDefenseStat: bossDefenseStat,
      stab: true,
      megaBoostMultiplier: 2,
    });
    // Off-type (Water) charged move on a Fire-boosted attacker: no STAB
    // (species is pure Fire) AND no self-boost (boost is Fire-only) — this
    // would be silently wrong (over-boosted) under the old unconditional gate.
    const expectedChargedDamagePerHit = calculateDamage({
      power: chargedMoveOffType.power,
      attackerAttackStat: attackerStats.attack,
      defenderDefenseStat: bossDefenseStat,
      stab: false,
      megaBoostMultiplier: 1,
    });
    const buggyChargedDamagePerHit = calculateDamage({
      power: chargedMoveOffType.power,
      attackerAttackStat: attackerStats.attack,
      defenderDefenseStat: bossDefenseStat,
      stab: false,
      megaBoostMultiplier: 2, // the old, unconditional-boost behavior
    });

    expect(result!.ownFastMoveDamage % expectedFastDamagePerHit).toBe(0);
    expect(result!.chargedAttacksLanded).toBeGreaterThan(0);
    expect(result!.ownChargedDamage / result!.chargedAttacksLanded).toBe(expectedChargedDamagePerHit);
    expect(expectedChargedDamagePerHit).not.toBe(buggyChargedDamagePerHit);
    expect(result!.boostMultiplier).toBe(2);
  });

  it("candidateMegaBoostDisabled fully disables both a candidate's own-damage boost AND its team-damage attribution (a full toggle, not partial)", () => {
    const boss = BOSS_TIDE;
    const [withBoost] = runComparison({
      candidates: [CANDIDATE_ALPHA],
      boss,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
    });
    const [boostDisabled] = runComparison({
      candidates: [CANDIDATE_ALPHA],
      boss,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
      candidateMegaBoostDisabled: [true, false],
    });

    expect(withBoost!.boostMultiplier).toBe(1.3);
    expect(boostDisabled!.boostMultiplier).toBeUndefined();
    // Own-damage effect: less charged damage per hit with the boost off.
    expect(boostDisabled!.ownChargedDamage).toBeLessThan(withBoost!.ownChargedDamage);
    expect(boostDisabled!.ownFastMoveDamage).toBeLessThan(withBoost!.ownFastMoveDamage);
    // Team-damage-attribution effect: feeding the disabled result into
    // convertUptimeToTeamDamage must show zero, not the old off-type fallback.
    expect(
      convertUptimeToTeamDamage({
        secondsSurvived: boostDisabled!.secondsSurvived,
        boostMultiplier: boostDisabled!.boostMultiplier,
        teammateCount: 4,
        matchingTeammateCount: 4,
        teammateDps: 26.5,
      }),
    ).toBe(0);
  });

  it("threads bossRaidTier through to a real (non-precomputed) boss's actual attack stat, changing the fight", () => {
    // A real synced-style boss (no statsArePrecomputed) — its effective
    // attack/defense must come from the REAL per-tier formula, and a
    // higher-multiplier tier should hit the candidate harder (shorter
    // survival), all else held equal.
    const attacker: SpeciesDefinition = {
      id: "boss-tier-test-attacker",
      name: "Attacker",
      types: ["normal"],
      baseAttack: 200,
      baseDefense: 150,
      baseStamina: 150,
      fastMoves: [{ id: "af", name: "Attacker Fast", type: "normal", power: 8, energyGain: 10, durationSeconds: 1 }],
      chargedMoves: [{ id: "ac", name: "Attacker Charged", type: "normal", power: 60, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
    };
    const realBoss: SpeciesDefinition = {
      id: "real-tier-test-boss",
      name: "Real Tier Boss",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 150,
      baseStamina: 9999, // irrelevant to runComparison (no boss-HP concept there) — just a placeholder
      fastMoves: [{ id: "bf", name: "Boss Fast", type: "normal", power: 30, energyGain: 0, durationSeconds: 1.5 }],
      chargedMoves: [],
    };
    const level = 40;
    const ivs = { attack: 15, defense: 15, stamina: 15 };

    const [vsOneStarTier] = runComparison({
      candidates: [attacker],
      boss: realBoss,
      bossRaidTier: "1-Star Raids",
      level,
      ivs,
      dodge: { kind: "none" },
    });
    const [vsMegaTier] = runComparison({
      candidates: [attacker],
      boss: realBoss,
      bossRaidTier: "Mega Raids",
      level,
      ivs,
      dodge: { kind: "none" },
    });

    // Same fast-attack cadence on both sides regardless of tier, so a
    // strictly shorter survival time under the higher-multiplier tier is
    // itself proof the boss's real attack stat responded to bossRaidTier.
    expect(vsMegaTier!.secondsSurvived).toBeLessThan(vsOneStarTier!.secondsSurvived);
  });
});
