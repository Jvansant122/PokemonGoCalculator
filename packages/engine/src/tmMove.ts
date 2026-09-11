import { bossEffectiveHp, resolveMove } from "./comparison.js";
import {
  noiseFloorFor,
  summarizeResults,
  type PowerUpEncounterSummary,
  type PowerUpResourceCost,
} from "./powerUp.js";
import { runTeamRaid, type TeamRaidInputs, type TeamRaidSlotInput } from "./teamRaid.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "./types.js";

/**
 * Engine half of PLAN_tm_move_change_optimizer.md — pricing and paired-
 * simulation evaluation for the two DETERMINISTIC move-change actions only:
 * unlocking a species' SECOND charged move, and applying an Elite Fast/
 * Charged TM. Both price/behave deterministically once a target move is
 * picked, so both reuse the exact same paired-team-raid evaluator
 * (evaluateMoveChangeTargets below) that runs runTeamRaid twice (baseline vs
 * one move swapped) with common random numbers — the same machinery
 * powerUp.ts's optimizePowerUps already uses for a power-up candidate, no
 * new combat math anywhere in this module.
 *
 * NOT built here, deliberately (see PLAN_tm_move_change_optimizer.md and
 * MECHANICS.md's "Changing a move: the four TM items" / "Frustration is
 * event-gated" entries):
 *
 *   - The regular (non-Elite) Fast/Charged TM. Its outcome is a RANDOM,
 *     guaranteed-different move from a non-legacy pool whose distribution is
 *     NOT confirmed uniform by any source — ranking it would mean either
 *     collapsing a real distribution into one misleading number (against
 *     this project's own "never collapse a distribution" discipline — see
 *     uptime.ts/breakpoints.ts's DodgeBehavior, or the Power-Up Optimizer's
 *     own stardust-vs-candy split) or building a full [worst, expected, best]
 *     band, which the plan explicitly defers. It is also destructive and
 *     irreversible (a legacy move it overwrites can only be restored by an
 *     Elite TM), which argues for even more caution than an ordinary
 *     power-up.
 *
 *     Recommendation: build it only as an explicit [worst, expected, best]
 *     band (never a blended EV), computed by evaluating EVERY reachable
 *     non-legacy move in the pool with evaluateMoveChangeTargets below (the
 *     primitive already generalizes to it) and reporting the min/mean/max
 *     deltaTeamDps across that set — worst-case here is a real risk (a
 *     regular TM can land on a strictly worse move than what's currently
 *     known), unlike a power-up or an Elite TM, which can never make a
 *     Pokémon worse. In roster mode specifically, honestly modelling this
 *     means simulating every reachable move per candidate per boss, which
 *     may make it computationally infeasible at the ~164-entry x ~13-boss
 *     scale rosterPlanner.ts already runs at (the plan flags this explicitly
 *     — budget/measure before building, don't assume it's affordable just
 *     because single-raid mode is).
 *
 *   - Frustration removal. Calendar-gated (a real but infrequent "Taken
 *     Over" event, roughly quarterly) — the plan is explicit that this
 *     should be surfaced as a STATIC "only actionable during a Taken Over
 *     event" label, never a live is-an-event-on check (which would make a
 *     share link's answer depend on when it's opened, violating this
 *     project's URL-is-the-source-of-truth model). Purely informational;
 *     nothing to compute.
 *
 * COST MODEL SOURCING — second charged move (MECHANICS.md, "Second charged
 * move unlock", 2026-09-08, [community-consensus] Pokémon GO Fandom /
 * Pokémon GO Hub, no first-party Niantic table found): tiered by the
 * family's real buddy-walking distance (1/3/5/20 km), with starters and
 * babies (except Toxel) flat-rated regardless of their own walking distance,
 * and 16 named species barred entirely unless Shadow or Purified.
 *
 * ⚠️ TRAP, called out explicitly in both the plan and MECHANICS.md: Shadow
 * is x1.2 for both resources here (same as powerUp.ts), but PURIFIED IS x0.8
 * HERE, NOT the x0.9 powerUp.ts's PowerUpCostModifiers correctly uses for an
 * ordinary power-up. Do not reuse PowerUpCostModifiers/its multipliers for
 * this module — SecondChargedMoveCostModifiers is its own, deliberately
 * separate, type for exactly this reason.
 *
 * BUDDY DISTANCE IS TAKEN AS A CALLER-SUPPLIED INPUT, never read directly off
 * SpeciesDefinition inside this module's own functions — this was written
 * concurrently with a `data-sync` pass adding `kmBuddyDistance` to the
 * normalized species record, so this module didn't depend on that field
 * landing, or on its exact name/shape, to stay testable and unblocked.
 * `SpeciesDefinition.kmBuddyDistance` DOES now exist (types.ts, added the
 * same day once data-sync's raw-data research made its shape and provenance
 * clear) — a caller should pass `species.kmBuddyDistance` straight through
 * to `secondChargedMovePricingInput.kmBuddyDistance` below.
 *
 * STARTER/BABY FLAT RATE IS RESOLVED BY THIS MODULE ITSELF as of 2026-09-10,
 * NOT pushed onto the caller. An earlier version of this module took
 * `isStarterOrBabyFlatRate` as a required caller-supplied boolean on the
 * grounds that no such categorization exists in this project's data model —
 * true, but it meant a hand-authored, MECHANICS-cited game fact would have
 * been hardcoded in `packages/web` instead (probably twice: once for
 * single-raid mode, once for roster mode), untested against the mechanic it
 * encodes, and silently wrong (a starter priced at 50,000/50 instead of
 * 10,000/25) whenever a caller forgot or guessed. `SECOND_CHARGED_MOVE_STARTER_SPECIES_NAMES`/
 * `SECOND_CHARGED_MOVE_BABY_SPECIES_NAMES` below are the same shape of fact
 * as `SECOND_CHARGED_MOVE_INELIGIBLE_SPECIES_NAMES` (the 16-species block a
 * few lines down) and now live in the same place, for the same reason.
 * `isStarterOrBabyFlatRate` remains available as an explicit override on
 * `SecondChargedMovePricingInput`, but it is NOT the primary path — omitted
 * (the default), `secondChargedMoveCost` resolves it itself from the
 * `species` field via `isSecondChargedMoveStarterOrBabyFlatRate`. A caller
 * only needs the override to correct a specific known-wrong case (e.g. this
 * table going stale before a newly-released starter is added to it).
 */

// ---------------------------------------------------------------------------
// Part A — second charged move: eligibility and cost
// ---------------------------------------------------------------------------

/** Real Pokémon GO buddy-walking-distance tiers — the only four that exist. */
export type SecondChargedMoveBuddyDistanceKm = 1 | 3 | 5 | 20;

const RECOGNIZED_BUDDY_DISTANCES: ReadonlySet<number> = new Set([1, 3, 5, 20]);

export interface SecondChargedMoveResourceCost {
  stardust: number;
  candy: number;
}

/** Base (unmodified) cost per buddy-distance tier. [community-consensus], see this module's top doc comment. */
export const SECOND_CHARGED_MOVE_COST_BY_BUDDY_DISTANCE_KM: Readonly<
  Record<SecondChargedMoveBuddyDistanceKm, SecondChargedMoveResourceCost>
> = {
  1: { stardust: 10_000, candy: 25 },
  3: { stardust: 50_000, candy: 50 },
  5: { stardust: 75_000, candy: 75 },
  20: { stardust: 100_000, candy: 100 },
};

/** Starters and babies (except Toxel) pay this flat rate regardless of their family's actual buddy distance. */
export const SECOND_CHARGED_MOVE_STARTER_OR_BABY_FLAT_RATE: SecondChargedMoveResourceCost = {
  stardust: 10_000,
  candy: 25,
};

/** Same x1.2/x1.2 Shadow multiplier powerUp.ts uses for an ordinary power-up. */
export const SECOND_CHARGED_MOVE_SHADOW_MULTIPLIER: SecondChargedMoveResourceCost = { stardust: 1.2, candy: 1.2 };

/**
 * ⚠️ x0.8, NOT powerUp.ts's x0.9 — see this module's top doc comment. The
 * single easiest thing to get wrong when building this feature.
 */
export const SECOND_CHARGED_MOVE_PURIFIED_MULTIPLIER: SecondChargedMoveResourceCost = { stardust: 0.8, candy: 0.8 };

/**
 * The 16 species that cannot learn a second charged move AT ALL unless
 * Shadow or Purified [community-consensus, MECHANICS.md's "Second charged
 * move unlock", 2026-09-08]. Matched against SpeciesDefinition.name
 * (lower-cased) rather than `.id`, since a name is stable across every
 * caller (real synced species, hand-authored test fixtures) the way an id
 * format is not guaranteed to be.
 */
export const SECOND_CHARGED_MOVE_INELIGIBLE_SPECIES_NAMES: ReadonlySet<string> = new Set(
  [
    "Caterpie",
    "Metapod",
    "Weedle",
    "Kakuna",
    "Magikarp",
    "Ditto",
    "Wynaut",
    "Wobbuffet",
    "Smeargle",
    "Wurmple",
    "Silcoon",
    "Cascoon",
    "Taillow",
    "Feebas",
    "Beldum",
    "Kricketot",
  ].map((n) => n.toLowerCase()),
);

/**
 * Every core-series STARTER Pokémon — every evolutionary stage of each
 * region's three-Pokémon trio, matched against `SpeciesDefinition.name`
 * lower-cased (same convention as `SECOND_CHARGED_MOVE_INELIGIBLE_SPECIES_NAMES`
 * above). This is general Pokémon-franchise knowledge (Bulbapedia's
 * per-region "starter Pokémon" pages), not something MECHANICS.md's "Second
 * charged move unlock" entry itself enumerates — that entry names the RULE
 * ("starters and babies... flat 10,000/25") but not the roster, so this list
 * is hand-authored here, the same way the 16-species ineligibility block is.
 *
 * Current THROUGH GENERATION 9 (Paldea: Sprigatito/Fuecoco/Quaxly, Pokémon
 * GO debut 2023). Mega forms are deliberately NOT listed as separate
 * entries: a mega has no movepool of its own (see
 * `SpeciesDefinition.kmBuddyDistance`'s doc comment making the same point
 * for buddy distance), so a second charged move is always bought against
 * the base form, which IS listed here.
 *
 * ⚠️ THIS WILL GO STALE the day Pokémon GO adds a Generation 10 starter
 * trio, and nothing in this codebase will flag it — there is no
 * `generation` field on `SpeciesDefinition` to diff against. A newly-added
 * starter line will silently price at its real buddy-distance tier instead
 * of the flat rate until a future pass extends this set. Whoever notices
 * (most likely `pogo-researcher` or `skeptic` flagging a mispriced
 * candidate) should add the three new species names here, not invent a
 * parallel list elsewhere.
 */
export const SECOND_CHARGED_MOVE_STARTER_SPECIES_NAMES: ReadonlySet<string> = new Set(
  [
    // Kanto (Gen 1)
    "Bulbasaur", "Ivysaur", "Venusaur",
    "Charmander", "Charmeleon", "Charizard",
    "Squirtle", "Wartortle", "Blastoise",
    // Johto (Gen 2)
    "Chikorita", "Bayleef", "Meganium",
    "Cyndaquil", "Quilava", "Typhlosion",
    "Totodile", "Croconaw", "Feraligatr",
    // Hoenn (Gen 3)
    "Treecko", "Grovyle", "Sceptile",
    "Torchic", "Combusken", "Blaziken",
    "Mudkip", "Marshtomp", "Swampert",
    // Sinnoh (Gen 4)
    "Turtwig", "Grotle", "Torterra",
    "Chimchar", "Monferno", "Infernape",
    "Piplup", "Prinplup", "Empoleon",
    // Unova (Gen 5)
    "Snivy", "Servine", "Serperior",
    "Tepig", "Pignite", "Emboar",
    "Oshawott", "Dewott", "Samurott",
    // Kalos (Gen 6)
    "Chespin", "Quilladin", "Chesnaught",
    "Fennekin", "Braixen", "Delphox",
    "Froakie", "Frogadier", "Greninja",
    // Alola (Gen 7)
    "Rowlet", "Dartrix", "Decidueye",
    "Litten", "Torracat", "Incineroar",
    "Popplio", "Brionne", "Primarina",
    // Galar (Gen 8)
    "Grookey", "Thwackey", "Rillaboom",
    "Scorbunny", "Raboot", "Cinderace",
    "Sobble", "Drizzile", "Inteleon",
    // Paldea (Gen 9)
    "Sprigatito", "Floragato", "Meowscarada",
    "Fuecoco", "Crocalor", "Skeledirge",
    "Quaxly", "Quaxwell", "Quaquaval",
  ].map((n) => n.toLowerCase()),
);

/**
 * Every "Baby Pokémon" — Bulbapedia's own franchise-wide term (introduced
 * Gen 2): a pre-evolution obtainable only via breeding/Incense that has no
 * earlier stage of its own. This is a closed, stable list (no new members
 * added since Gen 8's Toxel) unlike the starter table above, but is still
 * hand-authored the same way for the same reason — matched against
 * `SpeciesDefinition.name` lower-cased.
 *
 * TOXEL IS DELIBERATELY INCLUDED HERE (it genuinely is a baby Pokémon) even
 * though MECHANICS.md documents it as the one exception to the flat rate —
 * `isSecondChargedMoveStarterOrBabyFlatRate` below carves it back out by
 * name. Omitting Toxel from this set entirely would look identical to "not
 * a baby" instead of "a baby, deliberately excluded," which is the wrong
 * failure mode if this table is ever read for anything other than pricing.
 */
export const SECOND_CHARGED_MOVE_BABY_SPECIES_NAMES: ReadonlySet<string> = new Set(
  [
    "Pichu", "Cleffa", "Igglybuff", "Togepi", "Tyrogue", "Smoochum",
    "Elekid", "Magby", "Azurill", "Wynaut", "Budew", "Chingling",
    "Bonsly", "Mime Jr.", "Happiny", "Munchlax", "Riolu", "Mantyke",
    "Toxel",
  ].map((n) => n.toLowerCase()),
);

/**
 * Whether `species` qualifies for the starter/baby flat rate: any starter
 * (any stage), or any baby EXCEPT Toxel (MECHANICS.md's documented
 * exception — see `SECOND_CHARGED_MOVE_BABY_SPECIES_NAMES`'s doc comment).
 * This is `secondChargedMoveCost`'s own default resolution of
 * `isStarterOrBabyFlatRate` — a caller no longer needs to classify a species
 * itself; see this module's top doc comment for the override escape hatch.
 */
export function isSecondChargedMoveStarterOrBabyFlatRate(species: SpeciesDefinition): boolean {
  const name = species.name.toLowerCase();
  if (name === "toxel") return false;
  return SECOND_CHARGED_MOVE_STARTER_SPECIES_NAMES.has(name) || SECOND_CHARGED_MOVE_BABY_SPECIES_NAMES.has(name);
}

/** Whether `species` can learn a second charged move at all WITHOUT the Shadow/Purified exception. */
export function isSecondChargedMoveEligibleByDefault(species: SpeciesDefinition): boolean {
  return !SECOND_CHARGED_MOVE_INELIGIBLE_SPECIES_NAMES.has(species.name.toLowerCase());
}

/** Whether `species`, given Shadow/Purified status, can learn a second charged move at all — the 16-species block, with its documented exception. */
export function canLearnSecondChargedMove(
  species: SpeciesDefinition,
  modifiers: { isShadow: boolean; isPurified: boolean },
): boolean {
  if (isSecondChargedMoveEligibleByDefault(species)) return true;
  return modifiers.isShadow || modifiers.isPurified;
}

export interface SecondChargedMoveCostModifiers {
  isShadow: boolean;
  isPurified: boolean;
}

export interface SecondChargedMovePricingInput {
  /**
   * This family's real buddy-walking distance in km, if known.
   * null/undefined means UNKNOWN — never silently priced against a default
   * tier (this project's "keep unknown distinguishable from zero" rule; a
   * real buddy distance is never 0, so 0 itself is treated as an invalid
   * value, not as "unknown"). Ignored when `isStarterOrBabyFlatRate` is
   * true.
   */
  kmBuddyDistance: number | null | undefined;
  /**
   * The species being priced. Used ONLY to resolve the starter/baby flat
   * rate automatically via `isSecondChargedMoveStarterOrBabyFlatRate`, when
   * `isStarterOrBabyFlatRate` below is not explicitly supplied — required in
   * that case (`secondChargedMoveCost` throws if both are missing, the same
   * "never silently default" discipline as its kmBuddyDistance/Shadow+Purified
   * validation below).
   */
  species?: SpeciesDefinition;
  /**
   * Escape-hatch override: force the flat rate on/off regardless of what
   * `isSecondChargedMoveStarterOrBabyFlatRate(species)` would say. Omitted
   * (the default, PRIMARY path) means `secondChargedMoveCost` resolves this
   * itself from `species` — see this module's top doc comment for why the
   * engine now owns this determination rather than a caller. Only provide
   * this to correct a specific known-wrong case (most likely this table
   * going stale before a newly-released starter is added to it); it is not
   * meant to be a caller's everyday path.
   */
  isStarterOrBabyFlatRate?: boolean;
  modifiers: SecondChargedMoveCostModifiers;
}

export type SecondChargedMoveCostResult =
  | { known: true; cost: SecondChargedMoveResourceCost }
  | { known: false; reason: string };

/**
 * Prices ONE second-charged-move unlock. Ceils stardust/candy independently
 * per resource, same rounding convention as powerUp.ts's powerUpStepCost.
 * Throws on Shadow+Purified together (the same mutual-exclusion invariant
 * shadow.ts's shadowAdjustedBaseStats and powerUp.ts's powerUpStepCost
 * already enforce), on a `kmBuddyDistance` that isn't one of the four real
 * tiers (1/3/5/20) or one of {null, undefined} — a silently-mis-typed
 * distance would silently mis-price every downstream candidate — and on
 * neither `species` nor an explicit `isStarterOrBabyFlatRate` being
 * supplied (nothing to resolve the flat-rate question from).
 */
export function secondChargedMoveCost(input: SecondChargedMovePricingInput): SecondChargedMoveCostResult {
  const { kmBuddyDistance, species, modifiers } = input;
  if (modifiers.isShadow && modifiers.isPurified) {
    throw new Error(
      "A Pokémon cannot be both Shadow and Purified at once — the same mutual-exclusion rule as shadow.ts's shadowAdjustedBaseStats / powerUp.ts's powerUpStepCost.",
    );
  }

  let isStarterOrBabyFlatRate: boolean;
  if (input.isStarterOrBabyFlatRate !== undefined) {
    isStarterOrBabyFlatRate = input.isStarterOrBabyFlatRate;
  } else if (species) {
    isStarterOrBabyFlatRate = isSecondChargedMoveStarterOrBabyFlatRate(species);
  } else {
    throw new Error(
      "secondChargedMoveCost needs either `species` (to resolve the starter/baby flat rate itself) or an explicit `isStarterOrBabyFlatRate` override.",
    );
  }

  let base: SecondChargedMoveResourceCost;
  if (isStarterOrBabyFlatRate) {
    base = SECOND_CHARGED_MOVE_STARTER_OR_BABY_FLAT_RATE;
  } else if (kmBuddyDistance == null) {
    return {
      known: false,
      reason: "Buddy walking distance is unknown for this species/family — cannot price a second charged move without it.",
    };
  } else {
    if (!RECOGNIZED_BUDDY_DISTANCES.has(kmBuddyDistance)) {
      throw new Error(
        `kmBuddyDistance must be one of 1, 3, 5, 20 (the only real buddy-distance tiers) — got ${kmBuddyDistance}.`,
      );
    }
    base = SECOND_CHARGED_MOVE_COST_BY_BUDDY_DISTANCE_KM[kmBuddyDistance as SecondChargedMoveBuddyDistanceKm];
  }

  let stardustMultiplier = 1;
  let candyMultiplier = 1;
  if (modifiers.isShadow) {
    stardustMultiplier *= SECOND_CHARGED_MOVE_SHADOW_MULTIPLIER.stardust;
    candyMultiplier *= SECOND_CHARGED_MOVE_SHADOW_MULTIPLIER.candy;
  }
  if (modifiers.isPurified) {
    stardustMultiplier *= SECOND_CHARGED_MOVE_PURIFIED_MULTIPLIER.stardust;
    candyMultiplier *= SECOND_CHARGED_MOVE_PURIFIED_MULTIPLIER.candy;
  }

  return {
    known: true,
    cost: {
      stardust: Math.ceil(base.stardust * stardustMultiplier),
      candy: Math.ceil(base.candy * candyMultiplier),
    },
  };
}

/**
 * Converts to powerUp.ts's PowerUpResourceCost shape (xlCandy always 0 — a
 * second charged move is never paid in XL Candy) so a caller can fold a
 * second-charged-move candidate's cost straight into the SAME stardust/candy
 * ledger a power-up candidate uses (addResourceCosts, planPowerUpBudget's
 * ledger, etc.) — per the plan's explicit rule that second-charged-move
 * candidates compete in that budget, unlike Elite TM candidates.
 */
export function toPowerUpResourceCost(cost: SecondChargedMoveResourceCost): PowerUpResourceCost {
  return { stardust: cost.stardust, candy: cost.candy, xlCandy: 0 };
}

// ---------------------------------------------------------------------------
// Part B — un-TM-able moves and species (shared by both actions)
// ---------------------------------------------------------------------------

/**
 * Names are matched lower-cased. Frustration/Return are excluded
 * UNCONDITIONALLY here (not just "outside a Taken Over event") — this module
 * deliberately never performs a live is-an-event-on check (see this file's
 * top doc comment and PLAN_tm_move_change_optimizer.md's "Hard constraints"),
 * so the always-safe, always-correct-outside-the-rare-event choice is to
 * never generate a candidate that touches Frustration/Return at all, in
 * either direction (can't be replaced BY these two actions, and can't be
 * replaced FROM — the Taken Over exception is a red herring for this
 * codebase either way, since Frustration removal itself is explicitly out of
 * scope, informational-only).
 */
const NEVER_TM_TARGETABLE_MOVE_NAMES: ReadonlySet<string> = new Set(
  ["Frustration", "Return", "Behemoth Bash", "Behemoth Blade", "Dynamax Cannon", "Secret Sword"].map((n) =>
    n.toLowerCase(),
  ),
);

/**
 * Whether `move` could ever be the RESULT of a TM (Elite or, if ever built,
 * regular) or a second-charged-move unlock — i.e. it's not a signature move,
 * not Frustration/Return, and not a Super Max "+" move (additive, granted
 * only by Mega Evolving, never a member of any TM-reachable pool in either
 * direction — types.ts's ChargedMove.isPlusMove). Also used symmetrically to
 * check whether a CURRENTLY held move can be replaced at all — see this
 * module's top doc comment.
 */
export function isTmTargetableMove(move: FastMove | ChargedMove): boolean {
  if (NEVER_TM_TARGETABLE_MOVE_NAMES.has(move.name.toLowerCase())) return false;
  if ("isPlusMove" in move && move.isPlusMove) return false;
  return true;
}

/** Smeargle's moveset is fixed at catch — no TM of any kind (Elite or otherwise) can touch it. */
export function isSpeciesTmEligible(species: SpeciesDefinition): boolean {
  return species.name.toLowerCase() !== "smeargle";
}

// ---------------------------------------------------------------------------
// Part C — the shared paired-simulation evaluator
// ---------------------------------------------------------------------------

/** One proposed move change: slot `slotIndex`'s `field` becomes `newMoveId`. */
export interface MoveChangeTarget {
  slotIndex: number;
  field: "fastMoveId" | "chargedMoveId";
  newMoveId: string;
}

export interface MoveChangeEvaluationInputs extends TeamRaidInputs {
  /** How many full team-raid runs to average per candidate (and for the baseline). Same convention/default as powerUp.ts's PowerUpOptimizerInputs.iterations — see that field for the full reasoning (common-random-numbers pairing, per-seed offset). Defaults to 3. */
  iterations?: number;
}

export interface EvaluatedMoveChange {
  target: MoveChangeTarget;
  summary: PowerUpEncounterSummary;
  deltaTeamDps: number;
  /** `Math.abs(deltaTeamDps) > noiseFloorTeamDps` — see powerUp.ts's PowerUpCandidate.deltaExceedsNoise for the identical reasoning (a move change, like a level change, shifts when the boss's charged-move RNG is consumed). */
  deltaExceedsNoise: boolean;
}

export interface MoveChangeEvaluationResult {
  baseline: PowerUpEncounterSummary;
  noiseFloorTeamDps: number;
  results: EvaluatedMoveChange[];
}

/**
 * The one shared primitive both second-charged-move and Elite TM candidate
 * generation build on: runs the roster's CURRENT moveset once as a paired
 * baseline, then once more per `target` with that one slot's one move field
 * swapped — reusing runTeamRaid/summarizeResults/noiseFloorFor completely
 * unchanged (the exact same functions powerUp.ts's optimizePowerUps uses for
 * a power-up candidate), with the SAME per-iteration seed set shared across
 * the baseline and every target (common random numbers), exactly as
 * optimizePowerUps already does.
 *
 * Deliberately generic over `TeamRaidInputs`/`TeamRaidSlotInput` rather than
 * anything Power-Up-Optimizer- or roster-planner-specific, so it is directly
 * reusable from BOTH single-raid mode (packages/web's runPowerUpOptimizer.ts,
 * alongside optimizePowerUps) and multi-raid/roster mode (rosterPlanner.ts
 * already builds the same TeamRaidInputs/TeamRaidSlotInput shape per (entry,
 * boss) pair for its own Stage 4 — see that module's own use of runTeamRaid)
 * without this module needing to import or modify either.
 */
export function evaluateMoveChangeTargets(
  inputs: MoveChangeEvaluationInputs,
  targets: MoveChangeTarget[],
): MoveChangeEvaluationResult {
  const { slots, iterations = 3, seed = 1, ...rest } = inputs;
  const seeds = Array.from({ length: iterations }, (_, i) => seed + i * 7919);
  // rest.bossMaxHpOverride (inherited via MoveChangeEvaluationInputs extends
  // TeamRaidInputs) flows through to every runTeamRaid call below via
  // `...rest` — this module's OWN bossHp (summarizeResults' non-cleared
  // fallback denominator) has to honor it too, same fix as powerUp.ts's two
  // equivalent call sites.
  const bossHp = bossEffectiveHp(rest.boss, rest.bossRaidTier, rest.bossMaxHpOverride);

  const baselineResults = seeds.map((s) => runTeamRaid({ ...rest, slots, seed: s }));
  const baseline = summarizeResults(baselineResults, bossHp, rest.raidTimerSeconds);
  const noiseFloorTeamDps = noiseFloorFor(baseline, iterations);

  const results: EvaluatedMoveChange[] = targets.map((target) => {
    const modifiedSlots: TeamRaidSlotInput[] = slots.map((slot, i) =>
      i === target.slotIndex ? { ...slot, [target.field]: target.newMoveId } : slot,
    );
    const modifiedResults = seeds.map((s) => runTeamRaid({ ...rest, slots: modifiedSlots, seed: s }));
    const summary = summarizeResults(modifiedResults, bossHp, rest.raidTimerSeconds);
    const deltaTeamDps = summary.teamDps - baseline.teamDps;
    return { target, summary, deltaTeamDps, deltaExceedsNoise: Math.abs(deltaTeamDps) > noiseFloorTeamDps };
  });

  return { baseline, noiseFloorTeamDps, results };
}

// ---------------------------------------------------------------------------
// Part D — second charged move candidates
// ---------------------------------------------------------------------------

export interface SecondChargedMoveEligibility {
  eligible: boolean;
  reason?: string;
}

/**
 * Gates a second-charged-move candidate on the "only for a KNOWN moveset"
 * rule: `currentChargedMoveIds` must be EXACTLY the moveset this tool
 * actually observed. A length other than 1 is never eligible — 0 means the
 * moveset (or at least this species' charged-move count) is unknown and must
 * never be priced against (PLAN_tm_move_change_optimizer.md's central rule),
 * and 2 means a second charged move is already unlocked, so this action does
 * not apply at all (not an error — just nothing left to buy here).
 */
export function secondChargedMoveEligibility(params: {
  species: SpeciesDefinition;
  currentChargedMoveIds: string[];
  modifiers: SecondChargedMoveCostModifiers;
}): SecondChargedMoveEligibility {
  const { species, currentChargedMoveIds, modifiers } = params;
  if (currentChargedMoveIds.length !== 1) {
    return {
      eligible: false,
      reason:
        currentChargedMoveIds.length >= 2
          ? `${species.name} already knows a second charged move — nothing to unlock.`
          : `${species.name}'s current charged-move count is unknown — a second charged move can only be priced against a KNOWN moveset.`,
    };
  }
  if (!canLearnSecondChargedMove(species, modifiers)) {
    return {
      eligible: false,
      reason: `${species.name} cannot learn a second charged move unless it is Shadow or Purified.`,
    };
  }
  return { eligible: true };
}

export interface SecondChargedMoveCandidate {
  slotIndex: number;
  speciesId: string;
  speciesName: string;
  newChargedMoveId: string;
  newChargedMoveName: string;
  cost: SecondChargedMoveResourceCost;
  summary: PowerUpEncounterSummary;
  deltaTeamDps: number;
  /** Null when cost.stardust is 0 (cannot currently happen, but mirrors powerUp.ts's PowerUpCandidate convention). */
  deltaTeamDpsPer1000Stardust: number | null;
  /** Null when cost.candy is 0. */
  deltaTeamDpsPerCandy: number | null;
  deltaExceedsNoise: boolean;
}

export type SecondChargedMoveCandidateResult =
  | { blocked: true; reason: string }
  | { blocked: false; candidates: SecondChargedMoveCandidate[] };

/**
 * Generates every second-charged-move candidate for one fielded slot: one
 * per learnable charged move other than the one(s) already known, evaluated
 * against the boss/roster in `inputs` via evaluateMoveChangeTargets. The
 * candidate's own SIMULATED active charged move becomes the new one being
 * evaluated (this engine only ever simulates a fight with ONE active charged
 * move per slot — see teamRaid.ts's TeamRaidSlotInput.chargedMoveId — so
 * "unlock a second charged move and use whichever of the two is best against
 * THIS boss" is, for a single-boss DPS comparison, exactly the same
 * computation as "swap the active move to the candidate"; the real-world
 * value of KEEPING the original move for other future bosses is a
 * flexibility benefit this single-boss evaluation does not, and does not
 * need to, capture).
 *
 * Returns `{ blocked: true, reason }` (never an empty/silent result) when the
 * slot is empty, the moveset isn't KNOWN (currentChargedMoveIds.length !==
 * 1), the species can't learn a second move at all (the 16-species block),
 * or the buddy distance is unknown — every one of these must be reported to
 * the user, never silently dropped, per the plan's central rule.
 */
export function generateSecondChargedMoveCandidates(params: {
  inputs: MoveChangeEvaluationInputs;
  slotIndex: number;
  /** The KNOWN charged-move id(s) this slot's Pokémon actually has — must have length 1 (see secondChargedMoveEligibility). */
  currentChargedMoveIds: string[];
  pricing: SecondChargedMovePricingInput;
}): SecondChargedMoveCandidateResult {
  const { inputs, slotIndex, currentChargedMoveIds, pricing } = params;
  const slot = inputs.slots[slotIndex];
  const species = slot?.species;
  if (!species) return { blocked: true, reason: "This slot is empty." };

  const eligibility = secondChargedMoveEligibility({ species, currentChargedMoveIds, modifiers: pricing.modifiers });
  if (!eligibility.eligible) return { blocked: true, reason: eligibility.reason! };

  // `species` is always the slot's own species here — a caller no longer
  // needs to pass `species`/`isStarterOrBabyFlatRate` in `pricing` at all
  // (unless deliberately exercising the override escape hatch, which this
  // spread still allows through).
  const costResult = secondChargedMoveCost({ ...pricing, species });
  if (!costResult.known) return { blocked: true, reason: costResult.reason };
  const { cost } = costResult;

  // Pin the baseline's simulated active move to the one known move, so a
  // caller who left slot.chargedMoveId out of sync with the actually-known
  // moveset can't silently skew the delta.
  const knownMoveId = currentChargedMoveIds[0]!;
  const pinnedSlots: TeamRaidSlotInput[] = inputs.slots.map((s, i) =>
    i === slotIndex ? { ...s, chargedMoveId: knownMoveId } : s,
  );
  const pinnedInputs: MoveChangeEvaluationInputs = { ...inputs, slots: pinnedSlots };

  const targetMoves = species.chargedMoves.filter(
    (m) => !currentChargedMoveIds.includes(m.id) && isTmTargetableMove(m),
  );
  if (targetMoves.length === 0) return { blocked: false, candidates: [] };

  const targets: MoveChangeTarget[] = targetMoves.map((m) => ({
    slotIndex,
    field: "chargedMoveId",
    newMoveId: m.id,
  }));
  const { results } = evaluateMoveChangeTargets(pinnedInputs, targets);

  const candidates: SecondChargedMoveCandidate[] = results.map((r) => {
    const move = species.chargedMoves.find((m) => m.id === r.target.newMoveId)!;
    return {
      slotIndex,
      speciesId: species.id,
      speciesName: species.name,
      newChargedMoveId: move.id,
      newChargedMoveName: move.name,
      cost,
      summary: r.summary,
      deltaTeamDps: r.deltaTeamDps,
      deltaTeamDpsPer1000Stardust: cost.stardust > 0 ? (r.deltaTeamDps / cost.stardust) * 1000 : null,
      deltaTeamDpsPerCandy: cost.candy > 0 ? r.deltaTeamDps / cost.candy : null,
      deltaExceedsNoise: r.deltaExceedsNoise,
    };
  });

  return { blocked: false, candidates };
}

// ---------------------------------------------------------------------------
// Part E — Elite TM candidates
// ---------------------------------------------------------------------------

export type EliteTmKind = "fast" | "charged";

export interface EliteTmCandidate {
  slotIndex: number;
  speciesId: string;
  speciesName: string;
  kind: EliteTmKind;
  currentMoveId: string;
  currentMoveName: string;
  newMoveId: string;
  newMoveName: string;
  summary: PowerUpEncounterSummary;
  deltaTeamDps: number;
  deltaExceedsNoise: boolean;
  /**
   * Always 1 — an Elite [Fast|Charged] TM is a single-digit-supply item, NOT
   * stardust/candy (see PowerUpResourceCost) and NOT the same item as the
   * other `kind` — this is its own, third-through-fourth, non-fungible
   * currency (per CLAUDE.md/the plan's "TM candidates need their own axis"
   * rule). Present explicitly so a caller can render "spends 1 Elite Charged
   * TM" without having to infer it from `kind`, and so this type can never be
   * accidentally summed into a stardust or candy total the way a shared
   * "cost" field might invite.
   */
  eliteTmItemsSpent: 1;
}

export type EliteTmCandidateResult = { blocked: true; reason: string } | { blocked: false; candidates: EliteTmCandidate[] };

/**
 * Generates every Elite Fast or Elite Charged TM candidate for one fielded
 * slot: one per learnable move (of the requested `kind`) other than the one
 * currently simulated as active, each evaluated via evaluateMoveChangeTargets.
 *
 * Unlike the second-charged-move action, this REPLACES the slot's one active
 * move (an Elite TM always overwrites, never adds) — modelled directly via
 * TeamRaidSlotInput.fastMoveId/chargedMoveId, which is exactly what this
 * engine already treats as "the move this slot fights with."
 *
 * `currentMoveId`/`currentMoveName` are resolved from `slot.fastMoveId`/
 * `chargedMoveId` via comparison.ts's resolveMove (falls back to the
 * species' first move of that kind, same convention as every other caller of
 * resolveMove in this engine) — an Elite TM candidate does not need an
 * explicit "known moveset" input the way second-charged-move does, since the
 * roster/scenario already commits to ONE fast and ONE charged move per slot
 * everywhere else in this engine; if that commitment itself is unknown, the
 * caller must exclude the slot before calling this function at all (the same
 * rule the plan states for second-charged-move, applied one layer up).
 *
 * Returns `{ blocked: true, reason }` for an empty slot, a species that can
 * never be TM'd at all (Smeargle), or a currently-active move that can never
 * be replaced by ANY TM (Frustration/Return, a signature move, a Super Max
 * "+" move) — see isTmTargetableMove.
 */
export function generateEliteTmCandidates(params: {
  inputs: MoveChangeEvaluationInputs;
  slotIndex: number;
  kind: EliteTmKind;
}): EliteTmCandidateResult {
  const { inputs, slotIndex, kind } = params;
  const slot = inputs.slots[slotIndex];
  const species = slot?.species;
  if (!species) return { blocked: true, reason: "This slot is empty." };
  if (!isSpeciesTmEligible(species)) {
    return { blocked: true, reason: `${species.name}'s moveset is fixed at capture — no TM of any kind can change it.` };
  }

  // Branched (not a ternary picking `pool`) so TypeScript keeps the pool and
  // its move-id field bound to the SAME concrete move type (FastMove xor
  // ChargedMove) all the way through — a ternary-selected `FastMove[] |
  // ChargedMove[]` union doesn't satisfy resolveMove's `T extends { id:
  // string }` single-type-parameter generic.
  if (kind === "fast") {
    return buildEliteTmCandidateResult(species, slotIndex, species.fastMoves, slot.fastMoveId, "fastMoveId", "fast", inputs);
  }
  return buildEliteTmCandidateResult(
    species,
    slotIndex,
    species.chargedMoves,
    slot.chargedMoveId,
    "chargedMoveId",
    "charged",
    inputs,
  );
}

function buildEliteTmCandidateResult<T extends FastMove | ChargedMove>(
  species: SpeciesDefinition,
  slotIndex: number,
  pool: T[],
  currentMoveIdInput: string | null | undefined,
  field: "fastMoveId" | "chargedMoveId",
  kind: EliteTmKind,
  inputs: MoveChangeEvaluationInputs,
): EliteTmCandidateResult {
  const currentMove = resolveMove(pool, currentMoveIdInput);
  if (!currentMove) return { blocked: true, reason: `${species.name} has no ${kind} move defined.` };
  if (!isTmTargetableMove(currentMove)) {
    return {
      blocked: true,
      reason: `${currentMove.name} cannot be replaced by any TM (Frustration/Return require a "Taken Over" event this tool does not model live; signature and Super Max "+" moves can never be TM'd).`,
    };
  }

  const targetMoves = pool.filter((m) => m.id !== currentMove.id && isTmTargetableMove(m));
  if (targetMoves.length === 0) return { blocked: false, candidates: [] };

  const targets: MoveChangeTarget[] = targetMoves.map((m) => ({ slotIndex, field, newMoveId: m.id }));
  const { results } = evaluateMoveChangeTargets(inputs, targets);

  const candidates: EliteTmCandidate[] = results.map((r) => {
    const move = pool.find((m) => m.id === r.target.newMoveId)!;
    return {
      slotIndex,
      speciesId: species.id,
      speciesName: species.name,
      kind,
      currentMoveId: currentMove.id,
      currentMoveName: currentMove.name,
      newMoveId: move.id,
      newMoveName: move.name,
      summary: r.summary,
      deltaTeamDps: r.deltaTeamDps,
      deltaExceedsNoise: r.deltaExceedsNoise,
      eliteTmItemsSpent: 1,
    };
  });

  return { blocked: false, candidates };
}
