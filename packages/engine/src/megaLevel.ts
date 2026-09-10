import type { ChargedMove } from "./types.js";

/**
 * The real four-tier Mega Level ladder (Bulbapedia "Mega Evolution (GO)";
 * see .claude/agent-memory/pogo-researcher/fact_mega_level_system_2026_update.md
 * and fact_super_max_plus_move_mechanics_detail.md). Repeatedly Mega
 * Evolving the SAME species raises THAT species' own Mega Level (max once a
 * day; per-species, not account-wide). Base/High/Max (the pre-2026 ladder)
 * only ever reduce the OWNER's own re-Mega Energy cost and rest-period
 * cooldown — Bulbapedia's own "CP Level Bonus" column is blank for all
 * three, so they have NO combat-stat effect. Super Max (added Feb 2026,
 * launched at Pokémon GO Tour: Kalos) additionally grants "Greatly enhanced
 * CP" (see SUPER_MAX_EFFECTIVE_LEVEL_BONUS below) and, as of 2026-08-31,
 * unlocks a "+" move on eligible species (see
 * MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER and chargedMoveAtMegaLevel below).
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
 */
export type MegaLevel = "base" | "high" | "max" | "super-max";

/**
 * "+" move power multiplier by Mega Level tier, applied to a "+" move's
 * Base-tier `power` (ChargedMove.power when isPlusMove is true — see
 * types.ts). base: 1.0 (Base-tier power stored on the move IS this
 * reading), high: 1.1, max: 1.2, super-max: 1.3.
 *
 * CRITICAL — CONFIDENCE: this "+10% per tier" formula is
 * `[community-estimate]` ONLY. Two independently-run community sites
 * (doctorpokegogo.com, dittobase.com) each publish it, but on inspecting
 * multiple move pages on each site, the disclaimer text is
 * VERBATIM-IDENTICAL across every "+"-move page on a given site ("This
 * formula is our own estimate based on in-game measurement" /
 * "The multipliers are community-observed and may change..."). That means
 * this is two sites' own SITE-WIDE TEMPLATE ASSUMPTION, not two
 * independently-derived per-move data points converging — i.e. ONE shared
 * guess wearing two names, not real corroboration. NO official, LeekDuck,
 * PvPoke, or Silph Road source confirms this formula, despite repeated
 * direct search across three research rounds
 * (.claude/agent-memory/pogo-researcher/fact_super_max_plus_move_mechanics_detail.md).
 * The user has explicitly approved shipping this multiplier table PROVIDED
 * it is labelled as an estimate everywhere it surfaces in the UI — do not
 * let this comment's rigor stand in for that on-screen labelling; every
 * consumer of this constant (web-developer's badge, data-sync's per-move
 * metadata) must carry the same "estimate" framing forward.
 *
 * What IS well-evidenced (do not confuse with the above): the Base-tier
 * `power` value itself, for the moves that have one at all — see
 * PlusMovePowerConfidence in types.ts. This record only speculates about
 * how that confirmed Base-tier number scales at the other three tiers.
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
 * The level to actually look up in cpm.ts's CPM_TABLE for a Pokémon's
 * effective stats, given its REAL power-up level and its current Mega
 * Level — i.e. `level` unchanged for every tier except "super-max", which
 * adds SUPER_MAX_EFFECTIVE_LEVEL_BONUS. `undefined`/`null` (no Mega Level
 * investment assumed, or not applicable — e.g. a non-mega species) behaves
 * identically to `"base"`: returns `level` unchanged.
 *
 * Deliberately a PURE, species-agnostic level/level function — it has no
 * concept of "is this species even mega-capable" (that gate belongs to each
 * orchestration call site, which has `SpeciesDefinition.boost` on hand; see
 * comparison.ts/teamRaid.ts/speciesReport.ts/ivComparison.ts/breakpoints.ts,
 * all of which only ever pass a non-null megaLevel through for a candidate
 * whose species actually carries `.boost`). Passing a level whose shifted
 * result isn't a real cpm.ts CPM_TABLE key (i.e. `level` itself isn't a
 * valid half-level, independent of this function) will surface as
 * cpmForLevel's own "No CPM entry" error at the call site, not here — this
 * function does no table lookup itself, only arithmetic.
 */
export function effectiveLevelForMegaLevel(level: number, megaLevel: MegaLevel | null | undefined): number {
  return megaLevel === "super-max" ? level + SUPER_MAX_EFFECTIVE_LEVEL_BONUS : level;
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
