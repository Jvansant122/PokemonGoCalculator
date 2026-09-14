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

/**
 * Same "normal"-type, hand-authored family as BOSS_ONE/BOSS_TWO, but with HP
 * so large a 6-attacker team never clears it within any raidTimerSeconds
 * used in these tests (`clearRate` measured exactly 0 against every
 * STRONG_SPECIES-based team this file's tests use). Required for any
 * regression test comparing two levels/flags of the SAME team (e.g. IDEAS.md
 * #5's Best Buddy roster mode) — see
 * `.claude/agent-memory/engine-developer/measurement_best_buddy_roster_mode_impact.md`
 * for why a CLEARING boss is unsafe here: `summarizeResults` quantizes a
 * cleared fight's teamDps by discrete cast count, which can make a real,
 * nonzero per-hit damage difference between two variants read as an
 * IDENTICAL teamDps purely by coincidence (this project has hit that trap
 * twice already). `BOSS_ONE`/`BOSS_TWO` above are deliberately kept
 * clearable — most of this file's pre-existing tests rely on that — so this
 * is a separate, additive fixture rather than a change to either.
 */
export const TOUGH_BOSS: SpeciesDefinition = {
  ...BOSS_ONE,
  id: "test-roster-boss-tough",
  name: "Test Roster Boss Tough",
  baseStamina: 10_000_000,
};

/**
 * Same never-clears family as TOUGH_BOSS, but with a lower own Attack —
 * paired with TOUGH_BOSS_HIGH_ATTACK below so a Best Buddy candidate's real,
 * measured per-boss delta differs enough in magnitude between the two to
 * demonstrate the "significant on one boss, diluted in the weighted
 * aggregate" case (rosterBestBuddy.test.ts) — the SAME shape of finding that
 * justified `RosterSignificanceMode`'s aggregate-or-per-boss default
 * existing at all. The specific Attack values (150/260) were found by direct
 * measurement (a scratch script sweeping boss Attack against a fixed
 * STRONG_SPECIES team and comparing each boss's own measured Best Buddy
 * delta/noise floor), not guessed or hand-derived from first principles.
 */
export const TOUGH_BOSS_LOW_ATTACK: SpeciesDefinition = {
  ...TOUGH_BOSS,
  id: "test-roster-boss-tough-low-atk",
  name: "Test Roster Boss Tough Low Attack",
  baseAttack: 150,
};

/** See TOUGH_BOSS_LOW_ATTACK. */
export const TOUGH_BOSS_HIGH_ATTACK: SpeciesDefinition = {
  ...TOUGH_BOSS,
  id: "test-roster-boss-tough-high-atk",
  name: "Test Roster Boss Tough High Attack",
  baseAttack: 260,
};

/**
 * A fast move at EXACTLY DODGE_COST_SECONDS (0.5s) — the just-above-boundary
 * `fastMoveCadenceTooFastToDodge` case breakpoints.ts's own doc comment calls
 * out (`<=`, not `<`). `data/normalized/species.json` has no 0.6s fast move
 * at all (real durations are 500ms-aligned), so there is no real synced
 * species that can stand in for this case — see
 * rosterPlanner's dodge-lockout tests.
 */
export const HALF_SECOND_FAST_MOVE: FastMove = { ...FAST_MOVE, id: "test-tackle-half-second", durationSeconds: 0.5 };

/** Same shape as BOSS_ONE, but its fast move is exactly at the fast-dodge lockout boundary (see HALF_SECOND_FAST_MOVE). */
export const BOSS_HALF_SECOND_FAST_MOVE: SpeciesDefinition = {
  ...BOSS_ONE,
  id: "test-roster-boss-half-second",
  name: "Test Roster Boss Half Second",
  fastMoves: [HALF_SECOND_FAST_MOVE],
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

/** A further evolution exists — must be excluded from candidate generation entirely (isFullyEvolved: false), reported in neverCompetitive naming evolvesToIds. Deliberately carries NO `evolutions` data (the real-world default as of this field's introduction — data-sync doesn't populate it yet) so every PRE-EXISTING test exercising this fixture keeps exercising the plain "evolve first" fallback unchanged. */
export const UNEVOLVED_SPECIES: SpeciesDefinition = makeAttacker("test-unevolved", 220, 120, 180, {
  isFullyEvolved: false,
  evolvesToIds: ["test-evolved-form"],
});

/**
 * The evolved form `UNEVOLVED_WITH_EVOLUTIONS_SPECIES` below evolves into —
 * deliberately far stronger than STRONG_SPECIES so that "evolve, then power
 * up" can provably overtake a full 6-slot baseline team, the same "provably
 * enters after a power-up" shape as WEAK_BENCH_SPECIES/STRONG_SPECIES.
 */
export const EVOLVED_FORM_SPECIES: SpeciesDefinition = makeAttacker("test-evolved-form-real", 260, 140, 200);

/**
 * Same "further evolution exists" shape as UNEVOLVED_SPECIES, but carries
 * REAL `evolutions` data (IDEAS.md #9) — a single branch to
 * EVOLVED_FORM_SPECIES at a real, hand-picked candy cost. Distinct id from
 * UNEVOLVED_SPECIES so both fixtures can be used side by side in one test to
 * show the "no data -> old fallback" vs. "data present -> real candidate"
 * split.
 */
export const UNEVOLVED_WITH_EVOLUTIONS_SPECIES: SpeciesDefinition = makeAttacker("test-unevolved-with-evolutions", 220, 120, 180, {
  isFullyEvolved: false,
  evolvesToIds: [EVOLVED_FORM_SPECIES.id],
  evolutions: [{ to: EVOLVED_FORM_SPECIES, candyCost: 50 }],
});

/** The target of a GATED-only branch (item-gated, Steelix-shaped) — never reachable via `evolutionEndpoints` (nothing in `.evolutions`), only via `gatedEvolutionNotices`. */
export const GATED_EVOLVED_FORM_SPECIES: SpeciesDefinition = makeAttacker("test-gated-evolved-form", 270, 200, 190);

/** Unevolved with ONLY a gated branch (no `.evolutions` entry at all) — evolutionEndpoints must return `[]`, and the gate must still be named (never a bare generic "evolve first"). */
export const GATED_ONLY_SPECIES: SpeciesDefinition = makeAttacker("test-gated-only", 200, 120, 160, {
  isFullyEvolved: false,
  evolvesToIds: [GATED_EVOLVED_FORM_SPECIES.id],
  // Raw GAME_MASTER constant, same shape data-sync actually writes (never a
  // pre-humanized string) — describeEvolutionRequirement is what turns this
  // into "a Metal Coat".
  gatedEvolutions: [{ to: GATED_EVOLVED_FORM_SPECIES, candyCost: 50, requiresItem: "ITEM_METAL_COAT" }],
});

/** Eevee-shaped: ONE priceable candy-only branch (to EVOLVED_FORM_SPECIES) alongside a real GATED sibling branch — the gated one must still be named on every candidate/never-competitive row this species produces, never omitted just because a priceable option exists. */
export const MIXED_EVOLUTIONS_SPECIES: SpeciesDefinition = makeAttacker("test-mixed-evolutions", 220, 120, 180, {
  isFullyEvolved: false,
  evolvesToIds: [EVOLVED_FORM_SPECIES.id, GATED_EVOLVED_FORM_SPECIES.id],
  evolutions: [{ to: EVOLVED_FORM_SPECIES, candyCost: 50 }],
  gatedEvolutions: [
    { to: GATED_EVOLVED_FORM_SPECIES, requiresBuddy: true, requiresBuddyDistanceKm: 10, requiresDaytime: true, requiresQuest: true },
  ],
});

/** Two-hop chain (PRE -> MID -> FINAL) for evolutionEndpoints' recursive-walk test — MID is itself unevolved, so a naive one-hop reading of PRE's branch would wrongly stop at MID. */
export const CHAIN_FINAL_SPECIES: SpeciesDefinition = makeAttacker("test-chain-final", 300, 150, 220);
export const CHAIN_MID_SPECIES: SpeciesDefinition = makeAttacker("test-chain-mid", 240, 130, 190, {
  isFullyEvolved: false,
  evolvesToIds: [CHAIN_FINAL_SPECIES.id],
  evolutions: [{ to: CHAIN_FINAL_SPECIES, candyCost: 25 }],
});
export const CHAIN_PRE_SPECIES: SpeciesDefinition = makeAttacker("test-chain-pre", 220, 120, 180, {
  isFullyEvolved: false,
  evolvesToIds: [CHAIN_MID_SPECIES.id],
  evolutions: [{ to: CHAIN_MID_SPECIES, candyCost: 12 }],
});

/** Branching evolution (Eevee-shaped) — two mutually exclusive terminal forms, both fully evolved, for evolutionEndpoints' branching test. */
export const BRANCH_FORM_A_SPECIES: SpeciesDefinition = makeAttacker("test-branch-form-a", 250, 150, 180);
export const BRANCH_FORM_B_SPECIES: SpeciesDefinition = makeAttacker("test-branch-form-b", 180, 250, 220);
export const BRANCH_SPECIES: SpeciesDefinition = makeAttacker("test-branch-base", 200, 120, 160, {
  isFullyEvolved: false,
  evolvesToIds: [BRANCH_FORM_A_SPECIES.id, BRANCH_FORM_B_SPECIES.id],
  evolutions: [
    { to: BRANCH_FORM_A_SPECIES, candyCost: 25 },
    { to: BRANCH_FORM_B_SPECIES, candyCost: 25 },
  ],
});

/** A real, achievable "fresh catch" for HypotheticalCatchCandidate tests (IDEAS.md #3) — deliberately far stronger than STRONG_SPECIES so it can provably beat a fielded slot at a raid-catch level. */
export const HYPOTHETICAL_CATCH_SPECIES: SpeciesDefinition = makeAttacker("test-hypothetical-catch", 260, 150, 200);

/** So weak (and so tightly stardust-bounded in its own test) that no affordable level ever lets it crack a team already full of STRONG_SPECIES — used for the "changes no team, delta exactly 0" case. */
export const TINY_SPECIES: SpeciesDefinition = makeAttacker("test-tiny", 40, 40, 60);

/**
 * Same base-stat family as STRONG_SPECIES, but carries `.boost` AND a "+"
 * move — mega/primal-capable AND Super Max-eligible (see megaLevel.ts's
 * canReachSuperMax), for RosterPlannerInputs.megaLevel (roster-wide) tests.
 * The "+" move REPLACES the shared CHARGED_MOVE (a single chargedMoves
 * entry, not an added second one) with the exact same power/energyCost/
 * duration, so `chargedMoveId: null`'s default-move resolution
 * (chargedMoves[0]) still exercises one unambiguous move, and this is
 * otherwise invisible to anything that doesn't specifically probe Super Max
 * eligibility. A RosterEntry using this species must set `canMega: true`
 * (runRosterPlanner/planRosterBudget both throw otherwise — see
 * RosterEntry.canMega).
 */
export const MEGA_BENCH_SPECIES: SpeciesDefinition = makeAttacker("test-mega-bench", 220, 120, 180, {
  chargedMoves: [{ ...CHARGED_MOVE, id: "test-slam-plus", isPlusMove: true, plusMovePowerConfidence: "community-estimate" }],
  boost: { multiplier: 1.3, boostedType: "normal" },
});
