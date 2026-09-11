import type { ChargedMove, FastMove, SpeciesDefinition } from "../../src/types.js";
import { BOSS_ONE } from "./rosterPlannerFixtures.js";

/**
 * TEST-ONLY fixtures for rosterMoveChange.test.ts — same discipline as
 * rosterPlannerFixtures.ts (hand-authored, deliberately NOT under src/,
 * never re-exported from src/index.ts). Unlike that file's own species
 * (deliberately ONE fast/ONE charged move each — irrelevant to what those
 * tests check), everything here needs a real MULTI-MOVE pool to exercise
 * second-charged-move/Elite TM candidate generation at all.
 */

export const FAST_MOVE_WEAK: FastMove = { id: "tm-fast-weak", name: "Weak Fast", type: "normal", power: 5, energyGain: 6, durationSeconds: 1 };
export const FAST_MOVE_STRONG: FastMove = { id: "tm-fast-strong", name: "Strong Fast", type: "normal", power: 12, energyGain: 8, durationSeconds: 1 };

export const CHARGED_MOVE_WEAK: ChargedMove = {
  id: "tm-charged-weak",
  name: "Weak Charged",
  type: "normal",
  power: 40,
  energyCost: 35,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};
export const CHARGED_MOVE_STRONG: ChargedMove = {
  id: "tm-charged-strong",
  name: "Strong Charged",
  type: "normal",
  power: 110,
  energyCost: 50,
  durationSeconds: 2.5,
  vulnerableWindowSeconds: 2.5,
};
export const CHARGED_MOVE_THIRD: ChargedMove = {
  id: "tm-charged-third",
  name: "Third Charged",
  type: "normal",
  power: 90,
  energyCost: 45,
  durationSeconds: 2.2,
  vulnerableWindowSeconds: 2.2,
};

/** A species with TWO fast moves and THREE charged moves (weak/strong/third) — enough to exercise every action this module generates. kmBuddyDistance: 3 for second-charged-move pricing (SECOND_CHARGED_MOVE_COST_BY_BUDDY_DISTANCE_KM[3] = 50,000/50). */
export function makeMultiMoveSpecies(id: string, overrides: Partial<SpeciesDefinition> = {}): SpeciesDefinition {
  return {
    id,
    name: id,
    types: ["normal"],
    baseAttack: 200,
    baseDefense: 120,
    baseStamina: 180,
    fastMoves: [FAST_MOVE_WEAK, FAST_MOVE_STRONG],
    chargedMoves: [CHARGED_MOVE_WEAK, CHARGED_MOVE_STRONG, CHARGED_MOVE_THIRD],
    kmBuddyDistance: 3,
    candyFamilyId: `FAMILY_${id.toUpperCase()}`,
    isHypothetical: true,
    ...overrides,
  };
}

/** Six identical multi-move attackers — deterministically fill a boss's baseline 6-slot team (same score, ties keep array order), currently fielded WITH the weak charged move active (leaves real headroom for a TM/second-move candidate to improve on). */
export const MULTI_MOVE_TEAM_SPECIES: SpeciesDefinition[] = ["a", "b", "c", "d", "e", "f"].map((letter) =>
  makeMultiMoveSpecies(`tm-team-${letter}`),
);

/** Deliberately weaker than MULTI_MOVE_TEAM_SPECIES so it starts BENCHED — but a TM onto its strong charged move should be able to close the gap far enough to matter for a benched-candidate test. */
export const MULTI_MOVE_BENCH_SPECIES: SpeciesDefinition = makeMultiMoveSpecies("tm-bench", { baseAttack: 195, baseDefense: 118, baseStamina: 176 });

/** A real mega/primal boost — same shape used by megaLevel.ts/uptime.ts. Only ever attached to a species a test explicitly wants `canMega: true` for (see the "at-most-one-mega" describe block in rosterMoveChange.test.ts). */
export const MEGA_BOOST = { multiplier: 1.3, boostedType: "normal" as const };

/**
 * A team where slot 0 is mega-capable (same base stats as its 5 siblings,
 * PLUS the boost — scores highest, so runRosterPlanner's own `selectTeam`
 * reliably picks IT as the team's one mega, never one of the other 5).
 * Regression fixture for the "benched mega-capable candidate vs an
 * already-fielded mega" bug (rosterMoveChange.ts, 2026-09-10/11) — see that
 * module's own "At most one Mega" doc-comment section.
 */
export const MULTI_MOVE_TEAM_MEGA_SPECIES: SpeciesDefinition[] = MULTI_MOVE_TEAM_SPECIES.map((sp, i) =>
  i === 0 ? { ...sp, boost: MEGA_BOOST } : sp,
);

/**
 * Mega-capable AND weaker in raw stats than MULTI_MOVE_TEAM_MEGA_SPECIES's
 * own slot-0 mega, so `selectTeam` always claims the mega slot for the
 * FIELDED team first and skips this one — guaranteeing it starts BENCHED
 * (not merely likely) regardless of exact score arithmetic, since
 * `selectTeam` skips ANY second `canMega` entry outright once the mega slot
 * is claimed, independent of its own score.
 */
export const MULTI_MOVE_BENCH_MEGA_SPECIES: SpeciesDefinition = makeMultiMoveSpecies("tm-bench-mega", {
  baseAttack: 195,
  baseDefense: 118,
  baseStamina: 176,
  boost: MEGA_BOOST,
});

export { BOSS_ONE };
