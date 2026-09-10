import type { ChargedMove, FastMove, SpeciesDefinition } from "../../src/types.js";

/**
 * TEST-ONLY fixtures for lineupBuilder.test.ts — same discipline as
 * fixtures/hypotheticalDuo.ts / fixtures/rosterPlannerFixtures.ts
 * (hand-authored, deliberately NOT under src/, never re-exported from
 * src/index.ts). Every attacker shares one moveset/type so ranking is
 * isolated to base-stat/level differences, same simplification the other
 * fixture files already use.
 *
 * CLOSER/WEAK/ORDER_BOSS were tuned via a throwaway scratch script (per this
 * project's verification discipline — never hand arithmetic) specifically so
 * that FIGHT ORDER changes the outcome in a clean, deterministic way: with
 * `bossHp: 250` and `raidTimerSeconds: 60`, fielding CLOSER first clears in
 * ~15.1s (score ~16.6 team-DPS) while fielding it last clears in ~43.0s
 * (score ~5.8) — a >2x swing purely from reordering an otherwise-identical
 * roster. This happens because CLOSER's own attack stat is high enough to
 * solo most of ORDER_BOSS's HP quickly by itself; delaying it behind five
 * much-weaker WEAK clones (who each barely dent the boss before fainting)
 * wastes most of the fight on low output. See lineupBuilder.test.ts's
 * "finds the true best order" describe block for the exact numbers this
 * produces and the brute-force comparison.
 */

export const FAST_MOVE: FastMove = { id: "test-lb-fast", name: "Test Fast", type: "normal", power: 10, energyGain: 8, durationSeconds: 1.2 };
export const CHARGED_MOVE: ChargedMove = {
  id: "test-lb-charged",
  name: "Test Charged",
  type: "normal",
  power: 70,
  energyCost: 40,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};

function makeSpecies(id: string, baseAttack: number, baseDefense: number, baseStamina: number, overrides: Partial<SpeciesDefinition> = {}): SpeciesDefinition {
  return {
    id,
    name: id,
    types: ["normal"],
    baseAttack,
    baseDefense,
    baseStamina,
    fastMoves: [FAST_MOVE],
    chargedMoves: [CHARGED_MOVE],
    isHypothetical: true,
    ...overrides,
  };
}

/** A precomputed boss — see raidBoss.ts's statsArePrecomputed branch. HP tuned per this file's top doc comment. */
export const ORDER_BOSS: SpeciesDefinition = makeSpecies("test-lb-order-boss", 110, 110, 250, { statsArePrecomputed: true });

/** High attack, moderate bulk — clears most of ORDER_BOSS's HP alone when fielded first. See this file's top doc comment. */
export const CLOSER: SpeciesDefinition = makeSpecies("test-lb-closer", 260, 110, 140);

/** Low attack, barely dents ORDER_BOSS before fainting — five identical copies are used as filler in lineupBuilder.test.ts's order test (interchangeable with each other, so any permutation among them ties). */
export const WEAK: SpeciesDefinition = makeSpecies("test-lb-weak", 70, 100, 140);

/** A generic, tougher boss for the non-order-sensitive tests (small-roster, mega-constraint, per-slot-level, determinism) — no special tuning needed there. */
export const GENERIC_BOSS: SpeciesDefinition = makeSpecies("test-lb-generic-boss", 180, 150, 1400, { statsArePrecomputed: true });

/** A solid, generic attacker for tests that don't care about exact ranking, just that a search runs. */
export const GENERIC_ATTACKER: SpeciesDefinition = makeSpecies("test-lb-generic-attacker", 200, 120, 160);

/** Mega-capable — carries `.boost`, required for `canMega: true` pool entries (see runLineupBuilder's validation). */
export const MEGA_ONE: SpeciesDefinition = makeSpecies("test-lb-mega-one", 230, 130, 170, {
  boost: { multiplier: 1.3, boostedType: "normal" },
});

/** A second, independently-stronger mega-capable species — used to confirm only ONE mega ever survives into a built lineup even when several would otherwise screen well. */
export const MEGA_TWO: SpeciesDefinition = makeSpecies("test-lb-mega-two", 240, 130, 170, {
  boost: { multiplier: 1.3, boostedType: "normal" },
});
