import type { ChargedMove, FastMove, SpeciesDefinition } from "../../src/types.js";

/**
 * TEST-ONLY fixtures for rosterPlanner.test.ts — same discipline as
 * fixtures/hypotheticalDuo.ts (hand-authored, deliberately NOT under src/,
 * never re-exported from src/index.ts). Every attacker shares one moveset
 * and one type ("normal", neutral against itself) so STAB/type-effectiveness
 * is identical and constant across every fixture, isolating ranking purely
 * to baseAttack/baseDefense/baseStamina/level — the same simplification
 * hypotheticalDuo.ts's CANDIDATE_ALPHA/BETA pair uses, just extended to a
 * whole small roster here instead of a matched pair.
 */

export const FAST_MOVE: FastMove = {
  id: "test-tackle",
  name: "Test Tackle",
  type: "normal",
  power: 10,
  energyGain: 8,
  durationSeconds: 1,
};

export const CHARGED_MOVE: ChargedMove = {
  id: "test-slam",
  name: "Test Slam",
  type: "normal",
  power: 70,
  energyCost: 35,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};

export const BOSS_ONE: SpeciesDefinition = {
  id: "test-roster-boss-one",
  name: "Test Roster Boss One",
  types: ["normal"],
  baseAttack: 200,
  baseDefense: 150,
  baseStamina: 8000,
  fastMoves: [FAST_MOVE],
  chargedMoves: [CHARGED_MOVE],
  isHypothetical: true,
  statsArePrecomputed: true,
};

export const BOSS_TWO: SpeciesDefinition = {
  ...BOSS_ONE,
  id: "test-roster-boss-two",
  name: "Test Roster Boss Two",
  baseAttack: 220,
  baseDefense: 160,
  baseStamina: 9000,
};

/** Builds a hand-authored attacker SpeciesDefinition, all sharing FAST_MOVE/CHARGED_MOVE and pure-normal typing — see this file's top doc comment. */
export function makeAttacker(
  id: string,
  baseAttack: number,
  baseDefense: number,
  baseStamina: number,
  overrides: Partial<SpeciesDefinition> = {},
): SpeciesDefinition {
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

/** Six identical strong attackers — deterministically fill BOTH bosses' baseline 6-slot teams by themselves (same score, so ties keep array order), leaving every other fixture species genuinely benched unless powered up far enough to overtake one. */
export const STRONG_SPECIES: SpeciesDefinition[] = ["a", "b", "c", "d", "e", "f"].map((letter) =>
  makeAttacker(`test-strong-${letter}`, 220, 120, 180),
);

/** Weak at its starting level, but with the SAME base stats family as STRONG_SPECIES — powering it up far enough should let it overtake a strong slot (see "a benched Pokémon provably enters the team" test). */
export const WEAK_BENCH_SPECIES: SpeciesDefinition = makeAttacker("test-weak-bench", 220, 120, 180);

/** A further evolution exists — must be excluded from candidate generation entirely (isFullyEvolved: false), reported in neverCompetitive naming evolvesToIds. */
export const UNEVOLVED_SPECIES: SpeciesDefinition = makeAttacker("test-unevolved", 220, 120, 180, {
  isFullyEvolved: false,
  evolvesToIds: ["test-evolved-form"],
});

/** So weak (and so tightly stardust-bounded in its own test) that no affordable level ever lets it crack a team already full of STRONG_SPECIES — used for the "changes no team, delta exactly 0" case. */
export const TINY_SPECIES: SpeciesDefinition = makeAttacker("test-tiny", 40, 40, 60);

/** Same base-stat family as STRONG_SPECIES, but carries `.boost` — mega/primal-capable, for RosterPlannerInputs.megaLevel (roster-wide) tests. A RosterEntry using this species must set `canMega: true` (runRosterPlanner/planRosterBudget both throw otherwise — see RosterEntry.canMega). */
export const MEGA_BENCH_SPECIES: SpeciesDefinition = makeAttacker("test-mega-bench", 220, 120, 180, {
  boost: { multiplier: 1.3, boostedType: "normal" },
});
