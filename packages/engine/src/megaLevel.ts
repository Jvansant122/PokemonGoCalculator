import type { ChargedMove, SpeciesDefinition } from "./types.js";

/**
 * The real four-tier Mega Level ladder (Bulbapedia "Mega Evolution (GO)";
 * see .claude/agent-memory/pogo-researcher/fact_mega_level_system_2026_update.md
 * and fact_super_max_plus_move_mechanics_detail.md). Repeatedly Mega
 * Evolving THAT SAME INDIVIDUAL POKÉMON raises THAT Pokémon's own Mega
 * Level (max once a day). Base/High/Max (the pre-2026 ladder) only ever
 * reduce the OWNER's own re-Mega Energy cost and rest-period cooldown —
 * Bulbapedia's own "CP Level Bonus" column is blank for all three, so they
 * have NO combat-stat effect. Super Max (added Feb 2026, launched at
 * Pokémon GO Tour: Kalos) additionally grants "Greatly enhanced CP" (see
 * SUPER_MAX_EFFECTIVE_LEVEL_BONUS below) and, as of 2026-08-31, unlocks a
 * "+" move on eligible species (see MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER
 * and chargedMoveAtMegaLevel below).
 *
 * CORRECTED 2026-09-10: this comment previously said the ladder was raised
 * "per-species, not account-wide" — that clause was wrong and has been
 * removed. It traced back to a Bulbapedia paraphrase; the user corrected it
 * directly from their own account, first-hand: two Pokémon of the SAME
 * species can legitimately sit at different Mega Levels. A first-hand
 * account observation outranks a wiki paraphrase here — see MECHANICS.md's
 * "Mega Level: Base / High / Max / Super Max" section for the full
 * correction and provenance, and do not restore the per-species reading
 * without new first-party evidence; that page has already misled this
 * project once.
 *
 * This is a per-INDIVIDUAL-Pokémon investment level (how far THIS specific
 * caught/raised Pokémon has been Mega Evolved), not a species trait — model
 * it as a per-candidate/per-slot scenario input (comparison.ts's
 * candidateMegaLevel, teamRaid.ts's TeamRaidSlotInput.megaLevel,
 * speciesReport.ts's SpeciesReportInputs.megaLevel), never as a
 * SpeciesDefinition field. `undefined`/`null` everywhere this is consumed
 * means "no Mega Level investment assumed" — treated identically to `"base"`
 * (a single, fresh Mega Evolution: multiplier 1.0, +0 effective levels) so
 * every existing scenario/test/share link that predates this feature is
 * byte-for-byte unchanged.
 *
 * Consequence worth stating positively, since a future pass could otherwise
 * "fix" this into a bug: because Mega Level tracks one individual Pokémon's
 * own Mega Evolution history rather than a species-wide trait, two roster
 * slots/candidates holding the SAME species (e.g. two separately-Mega-
 * Evolved copies of one species in the Team Raid Simulator's 6-slot roster,
 * or in the Power-Up Optimizer's multi-raid roster) may legitimately carry
 * DIFFERENT `megaLevel` values. That is correct, observed real-account
 * behaviour to preserve — not an inconsistency to collapse into one shared
 * per-species value.
 */
export type MegaLevel = "base" | "high" | "max" | "super-max";

/**
 * "+" move power multiplier by Mega Level tier, applied to a "+" move's
 * Base-tier `power` (ChargedMove.power when isPlusMove is true — see
 * types.ts). base: 1.0 (Base-tier power stored on the move IS this
 * reading), high: 1.1, max: 1.2, super-max: 1.3.
 *
 * CONFIDENCE — EXISTENCE: CONFIRMED, via direct first-hand in-game
 * observation (user, 2026-09-10), not just community write-ups — the user's
 * own account owns one or more Mega-Evolved Mewtwo at a raised Mega Level
 * ("lvl 3 mewtwo"), and the in-game move-info screen displays a numeric
 * power figure next to its "+" move that visibly changes as that Pokémon's
 * Mega Level changes. So "a '+' move's displayed power scales with Mega
 * Level, and the game itself surfaces that number" is a confirmed real
 * mechanic, not a fabricated or purely-inferred one — do not frame the
 * existence of scaling itself as in doubt.
 *
 * CONFIDENCE — MAGNITUDE: still `[community-estimate]` ONLY. The above
 * observation confirms a displayed number moves with Mega Level; it does
 * NOT confirm it moves by exactly +10% per tier. This "+10% per tier"
 * formula's only written sourcing remains two independently-run community
 * sites (doctorpokegogo.com, dittobase.com), but on inspecting multiple move
 * pages on each site, the disclaimer text is VERBATIM-IDENTICAL across every
 * "+"-move page on a given site ("This formula is our own estimate based on
 * in-game measurement" / "The multipliers are community-observed and may
 * change..."). That means this is two sites' own SITE-WIDE TEMPLATE
 * ASSUMPTION, not two independently-derived per-move data points converging
 * — i.e. ONE shared guess wearing two names, not real corroboration on the
 * MAGNITUDE specifically. NO official, LeekDuck, PvPoke, or Silph Road
 * source confirms this exact formula, despite repeated direct search across
 * three research rounds
 * (.claude/agent-memory/pogo-researcher/fact_super_max_plus_move_mechanics_detail.md).
 * The user has explicitly approved shipping this multiplier table PROVIDED
 * it is labelled as an estimate everywhere it surfaces in the UI — do not
 * let this comment's rigor stand in for that on-screen labelling; every
 * consumer of this constant (web-developer's badge, data-sync's per-move
 * metadata) must carry the same "estimate" framing forward.
 *
 * DIRECTLY CHECKABLE FUTURE TEST: this magnitude estimate can be RETIRED
 * (replaced with a confirmed number) by a single clean reading of the
 * in-game move-info screen — record (1) the exact move name, (2) the exact
 * Mega Level tier as labelled in the client UI at the moment of reading
 * (needed to pin which of this file's four MegaLevel tiers it corresponds
 * to — the client's own tier numbering/naming was not itself confirmed by
 * the 2026-09-10 observation, only that a number changes), and (3) the
 * exact displayed power figure. One such reading against this record's
 * already-known Base-tier power (PlusMovePowerConfidence in types.ts) pins
 * the real multiplier for that tier directly, no estimate needed.
 *
 * What IS well-evidenced independent of the above (do not confuse with the
 * magnitude question): the Base-tier `power` value itself, for the moves
 * that have one at all — see PlusMovePowerConfidence in types.ts. This
 * record only speculates about how that confirmed Base-tier number scales
 * at the other three tiers.
 *
 * NUMERIC-COINCIDENCE WARNING: `MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER["super-max"]`
 * (1.3) is IDENTICAL to uptime.ts's `DEFAULT_MEGA_BOOST_MULTIPLIER` (the
 * load-bearing team-wide mega/primal damage boost — CLAUDE.md standing
 * decision, a real conclusion in this project flips at 1.1, NEVER treat it
 * as a cosmetic tuning knob). These are two completely unrelated real-game
 * facts that happen to share a value: one is Super Max's "+"-move power
 * multiplier (a community estimate, as documented above); the other is the
 * team-wide damage boost applied to OTHER TRAINERS in the same raid lobby
 * (see uptime.ts's own doc comment — it never reaches the mega-bringer's own
 * party). They MUST stay two independently-defined constants in two
 * separate files — do not derive one from the other, do not fold them into
 * a shared constant, so a future tuning correction to either (e.g. if a
 * first-party source ever pins the real "+"-move multiplier at a different
 * number) cannot silently move the other.
 */
export const MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER: Record<MegaLevel, number> = {
  base: 1,
  high: 1.1,
  max: 1.2,
  "super-max": 1.3,
};

/**
 * Super Max's "Greatly enhanced CP" (Niantic's own phrase,
 * pokemongo.com/news/mega-evolution-2026-update), modelled as +2 EFFECTIVE
 * LEVELS stacked on top of whatever level the Pokémon was actually powered
 * up to (a level-50 Pokémon at Super Max combat-computes as if it were
 * level 52; a level-49.5 one as level 51.5) — see effectiveLevelForMegaLevel
 * below, and cpm.ts's CPM_TABLE, which was extended specifically to carry
 * lookup targets for this.
 *
 * CONFIDENCE — MAGNITUDE: `[community-consensus]`, upgraded from a single
 * low-tier SEO cluster (pokeep.com, boostroom.com, theclick.gg — none cite a
 * primary source) by a SECOND, independent-ish source found while
 * researching an unrelated question: a GitHub gist comment
 * (gist.github.com/Mygod/71ac34368f66f0d3de469fbaeed386c4) states Mega Level
 * 4 ("Super Max") "brings them up to level 52 (level 53 with best buddy
 * bonus)" — the same +2 magnitude, converged on independently. Bulbapedia
 * (a higher-tier wiki source) independently confirms the CLAIM ("Mega-Evolved
 * Pokémon at Super Max Level will have higher CP") but gives zero
 * mechanism/formula detail.
 *
 * CONFIDENCE — MECHANISM: UNCONFIRMED by any first-party source (Niantic's
 * own 2026 post and LeekDuck's companion writeup both state the CP increase
 * exists without explaining HOW). There is also a MILD NEGATIVE SIGNAL:
 * doctorpokegogo.com's own per-species raid pages carefully model
 * Mega-Level-dependent "+"-move scaling (full DPS-by-level breakdowns) but
 * show ZERO corresponding CP/Attack/DPS difference for that same Pokémon's
 * ORDINARY moves across Mega Levels anywhere on the page — suggestive, not
 * proof, that community raid calculators aren't treating this as a real,
 * DPS-relevant CPM change at all.
 *
 * The user has explicitly chosen to model this despite the above, provided
 * it is labelled at this exact confidence wherever it surfaces. Applied as a
 * STEP, not a gradient: base/high/max all give +0 (Bulbapedia's own
 * "CP Level Bonus" column is blank for all three — Mega Level historically
 * never touched combat stats before Super Max) — only "super-max" gives
 * this bonus. Do not interpolate a partial bonus for high/max.
 */
export const SUPER_MAX_EFFECTIVE_LEVEL_BONUS = 2;

/**
 * A "+" move's `durationSeconds`/`energyCost` — NOT modelled by any function
 * in this file, because there is nothing to compute: `data-sync` (phase 2)
 * is expected to carry BOTH straight through, unchanged, from the base move's
 * own real GAME_MASTER template (via the existing `fromGameMasterMove` on-ramp
 * — resolve the base move's raw record, then spread `id`/`name`/`power`/
 * `isPlusMove`/`plusMovePowerConfidence` overrides on top; see
 * test/megaLevel.test.ts's "built from the base move's GLOBAL GAME_MASTER
 * template" describe block for the exact pattern). `chargedMoveAtMegaLevel`
 * below only ever touches `power` — it passes `durationSeconds`/`energyCost`
 * through completely untouched at every tier.
 *
 * These two carried-through values sit at TWO DELIBERATELY DIFFERENT
 * confidence levels — recorded here, in prose, because (unlike `power`)
 * neither has its own per-move confidence-tier FIELD on ChargedMove: this
 * project only puts a runtime confidence badge on a value the engine itself
 * computes/scales (see PlusMovePowerConfidence in types.ts); a value that's
 * simply copied verbatim needs no such field, only an honest comment.
 * DO NOT let the stronger of the two below launder the weaker one's
 * confidence — they are unrelated claims about unrelated fields.
 *
 * - DURATION: `[well-evidenced]`. 11 of 11 community-reported "+" move
 *   durations (doctorpokegogo.com/dittobase.com) matched this project's own
 *   already-synced base-move `durationSeconds` for that species' base move
 *   EXACTLY, zero exceptions — the best evidenced assumption available by a
 *   wide margin, though still an inference from a clean pattern, not a
 *   directly-stated rule from any source.
 * - ENERGY COST: a MUCH weaker, `[reasoned-by-analogy]` call. Raid-context
 *   energy is genuinely UNPUBLISHED for all 16 known "+" moves — no source
 *   states one that survives cross-checking. The sole basis for "unchanged
 *   from the base move" is analogy to the only precedent Niantic has ever
 *   shipped for this kind of move upgrade: Apex Lugia's
 *   AEROBLAST/_PLUS/_PLUS_PLUS and Apex Ho-Oh's SACRED_FIRE family, both of
 *   which keep `energyDelta` IDENTICAL across every power tier (verifiable
 *   directly in data/raw/game_master.json). One community site (dittobase)
 *   does print a raid-context energy figure, but it reads a flat -100 for
 *   every move checked regardless of that move's own real base value — an
 *   unreliable template default, not sourced data; do not use it as a
 *   contrary data point.
 */

/**
 * Whether `species` can reach Super Max Mega Level AT ALL — confirmed
 * in-game observation (user, 2026-09-10, relaying direct play experience):
 * "not every mega can get to super mega level its only the ones with plus
 * moves unlocked." Purely data-driven off the species' own `chargedMoves`
 * list (never a hand-maintained species allowlist/count) — a species
 * becomes eligible the moment ANY data-sync-authored "+" move lands in its
 * `chargedMoves`, with zero engine code change required. As of 2026-09-10
 * this is a MINORITY of released mega/primal forms (15 "+" moves exist
 * across the whole roster vs. ~54+ released mega/primal species) — do not
 * assume a random mega/primal candidate is eligible without checking.
 *
 * A species that fails this check can still Mega Evolve and hold
 * Base/High/Max Mega Level (those three tiers only ever reduce the owner's
 * own re-Mega Energy cost and rest-period cooldown — see this file's own
 * MegaLevel doc comment above; NO combat-stat effect at all) — it just can
 * never reach Super Max, so it never gets Super Max's "+2 effective level"
 * CP bonus (SUPER_MAX_EFFECTIVE_LEVEL_BONUS below) or a third charged move.
 *
 * Consumed by comparison.ts's `resolveCandidateMegaLevel` — the shared gate
 * every orchestration call site routes through (or, for breakpoints.ts,
 * explicitly CANNOT route through — see that module's own megaLevel doc
 * comment for why) — to CLAMP an illegal `"super-max"` request down to
 * `"max"` (the highest tier this species can actually reach) rather than
 * throwing: an old share link or a stale scenario should degrade gracefully,
 * not error or silently keep an illegal bonus.
 *
 * NOT consumed by `chargedMoveAtMegaLevel` below, and deliberately so: that
 * function is already inherently safe to call on a non-eligible species
 * without any gate, because it keys off the MOVE's own `isPlusMove` flag,
 * not the species — a species that fails this predicate structurally has no
 * `isPlusMove` move in its `chargedMoves` for `chargedMoveAtMegaLevel` to
 * ever be called on in the first place, so it is always a no-op there
 * regardless. This predicate exists specifically to gate
 * `effectiveLevelForMegaLevel`'s CP bump, which — unlike
 * `chargedMoveAtMegaLevel` — is species-blind by design (see its own doc
 * comment below) and so has no way to protect itself.
 */
export function canReachSuperMax(species: Pick<SpeciesDefinition, "chargedMoves">): boolean {
  return species.chargedMoves.some((move) => move.isPlusMove === true);
}

/**
 * The level to actually look up in cpm.ts's CPM_TABLE for a Pokémon's
 * effective stats, given its REAL power-up level and its current Mega
 * Level — i.e. `level` unchanged for every tier except "super-max", which
 * adds SUPER_MAX_EFFECTIVE_LEVEL_BONUS. `undefined`/`null` (no Mega Level
 * investment assumed, or not applicable — e.g. a non-mega species) behaves
 * identically to `"base"`: returns `level` unchanged.
 *
 * Deliberately a PURE, species-agnostic level/level function — it has no
 * concept of "is this species even mega-capable" (`.boost`) OR "can this
 * species actually reach super-max" (`canReachSuperMax` above); BOTH gates
 * belong to each orchestration call site (comparison.ts's
 * resolveCandidateMegaLevel is the shared one; see that function's own doc
 * comment, and breakpoints.ts's for the one call site that structurally
 * cannot share it). Every caller of THIS function is expected to have
 * already resolved/clamped `megaLevel` through one of those gates — this
 * function trusts whatever it's given. Passing a level whose shifted result
 * isn't a real cpm.ts CPM_TABLE key (i.e. `level` itself isn't a valid
 * half-level, independent of this function) will surface as cpmForLevel's
 * own "No CPM entry" error at the call site, not here — this function does
 * no table lookup itself, only arithmetic.
 */
export function effectiveLevelForMegaLevel(level: number, megaLevel: MegaLevel | null | undefined): number {
  return megaLevel === "super-max" ? level + SUPER_MAX_EFFECTIVE_LEVEL_BONUS : level;
}

/**
 * The Best Buddy CP Boost — `POKEMON_UPGRADE_SETTINGS.defaultCpBoostAdditionalLevel`
 * (GAME_MASTER, fetched 2026-09-09, `[first-party]`; see MECHANICS.md's
 * "Power-up (level-up) costs" section). A free, cost-less `+1` EFFECTIVE
 * LEVEL granted while a Pokémon is currently its trainer's active buddy at
 * the "Best Buddy" friendship tier — completely UNRELATED to the friendship
 * ATTACK bonus (damage.ts's FRIENDSHIP_ATTACK_BONUS_MULTIPLIER, a Gym/Raid
 * co-participating-friend mechanic). Two entirely different real mechanics
 * share the "Best Buddy" name; do not conflate them, and note damage.ts
 * deliberately removed a `bestBuddy` boolean field once already because its
 * name collided with THIS mechanic (see that file's own history).
 *
 * Unlike Super Max's effective-level bonus, this is NOT gated on `.boost`,
 * `canReachSuperMax`, or any mega/primal mechanic at all — Best Buddy is a
 * property of the Pokémon-trainer relationship, orthogonal to Mega
 * Evolution, and applies to any species whatsoever (a non-mega attacker can
 * be a Best Buddy too). `effectiveLevelForBestBuddy` below is therefore a
 * PURE, species-agnostic, ungated function exactly like
 * `effectiveLevelForMegaLevel` — no gate belongs in this file at all; a
 * caller composes the two by chaining
 * `effectiveLevelForMegaLevel(effectiveLevelForBestBuddy(level, isBestBuddy), megaLevel)`.
 *
 * STACKING WITH SUPER MAX — `[community-consensus]`, single independent
 * source: a GitHub gist comment (gist.github.com/Mygod/71ac34368f66f0d3de469fbaeed386c4,
 * the SAME source already cited for SUPER_MAX_EFFECTIVE_LEVEL_BONUS's own
 * magnitude) states Mega Level 4 ("Super Max") "brings them up to level 52
 * (level 53 with best buddy bonus)" — i.e. the two bonuses ADD (+2 then +1,
 * or +1 then +1 for a level-50 Pokémon and its trainer's Best Buddy, both at
 * Super Max: 50+2+1=53). This is the ONLY source this project has found that
 * states the stacking explicitly; it is the same tier of evidence as the
 * Super Max bonus's own magnitude (one community source, not first-party,
 * not independently corroborated a second time for the STACKING claim
 * specifically — the magnitude of the Super Max bonus alone has a second,
 * independent corroborating source; the stacking behavior does not). Treat
 * this as `[community-consensus, single-source]` — weaker than the Super Max
 * magnitude claim it rides alongside. cpm.ts's CPM_TABLE was extended to 53
 * specifically to make this stacked lookup resolvable; if the stacking claim
 * is ever contradicted, that extension (52.5/53) becomes dead — SEE cpm.ts's
 * own doc comment before removing it, since 51-52.5 stay load-bearing for
 * Super Max alone regardless.
 */
export const BEST_BUDDY_EFFECTIVE_LEVEL_BONUS = 1;

/**
 * The level to actually look up for a Pokémon's Best Buddy CP Boost — see
 * BEST_BUDDY_EFFECTIVE_LEVEL_BONUS's doc comment for the full mechanic,
 * scope and stacking-with-Super-Max evidence. `isBestBuddy` of
 * `false`/`null`/`undefined` returns `level` unchanged. Deliberately has no
 * species/boost gate at all (see that doc comment) — apply this BEFORE
 * `effectiveLevelForMegaLevel` when composing the two, e.g.
 * `effectiveLevelForMegaLevel(effectiveLevelForBestBuddy(level, isBestBuddy), megaLevel)`
 * (order doesn't actually matter mathematically — both are a flat `+N`
 * shift — but this is the convention every call site in this engine uses).
 */
export function effectiveLevelForBestBuddy(level: number, isBestBuddy: boolean | null | undefined): number {
  return isBestBuddy ? level + BEST_BUDDY_EFFECTIVE_LEVEL_BONUS : level;
}

/**
 * Returns `move` as it would read at `megaLevel` — i.e. with `power` scaled
 * by MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER when `move.isPlusMove` is true,
 * rounded to the nearest whole number (real move power values in this game
 * are always integers; the underlying multiplier table is already a
 * community estimate, so exact-tie rounding behavior here is not a
 * meaningfully separate source of error). A non-"+" move (isPlusMove
 * undefined/false — every ordinary fast/charged move, including a mega's
 * own normal two charged moves) is returned COMPLETELY UNCHANGED regardless
 * of megaLevel — this function is always safe to call on any ChargedMove.
 *
 * `megaLevel` of `null`/`undefined` resolves to `"base"` (multiplier 1.0,
 * i.e. the move's stored power unscaled) — matching
 * .claude/agent-memory/pogo-researcher/fact_super_max_plus_move_mechanics_detail.md's
 * Q4 finding that having a "+" move at all requires only a single Mega
 * Evolution, "regardless of current Mega Level," so an attacker whose Mega
 * Level isn't otherwise specified still gets the move at its Base-tier
 * reading, not zero/unavailable.
 *
 * This is NOT the same FLOOR() this project treats as load-bearing
 * elsewhere (stats.ts's effectiveStat) — `power` is a move's own printed
 * strength number, not a stat derived from (base + iv) * cpm, and this
 * rounding happens well before damage.ts's calculateDamage applies its own
 * single floor to the final damage total. Do not read this as a second
 * application of that invariant.
 *
 * Every call site that builds an attacker's charged move for damage
 * purposes must route the RESOLVED move through this function before using
 * it (comparison.ts, teamRaid.ts, ivComparison.ts — see each module's own
 * megaLevel wiring) — resolving a move via comparison.ts's `resolveMove`
 * alone is not enough once a species can carry a "+" move.
 */
export function chargedMoveAtMegaLevel(move: ChargedMove, megaLevel: MegaLevel | null | undefined): ChargedMove {
  if (!move.isPlusMove) return move;
  const multiplier = MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER[megaLevel ?? "base"];
  return { ...move, power: Math.round(move.power * multiplier) };
}
