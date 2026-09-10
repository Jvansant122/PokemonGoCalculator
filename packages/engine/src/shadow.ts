import type { SpeciesDefinition } from "./types.js";

/**
 * Shadow Pokémon Attack/Defense stat multipliers (Stamina is untouched).
 * [community-consensus], NOT Niantic-published — GamePress-adjacent guides,
 * Fandom's wiki, and datamine-derived community sources converge on
 * approximately these values since the Shadow rework (Feb 2021), but no
 * primary/official source has ever surfaced. Defense is the fraction 5/6
 * (~0.8333) rather than the flat decimal 0.83 some sources use — picked
 * deliberately after a cross-check against an external raid-DPS
 * calculator's own published methodology used exactly this fraction;
 * revisit if a primary source ever turns up (same discipline this project
 * already applies to hand-authored fixture stats after the Mega Skarmory
 * baseAttack incident).
 */
export const SHADOW_ATTACK_MULTIPLIER = 1.2;
export const SHADOW_DEFENSE_MULTIPLIER = 5 / 6;

/**
 * Applies the Shadow Attack/Defense multipliers to a species' RAW base
 * stats — i.e. the value that then feeds stats.ts's effectiveStat(), which
 * applies this engine's single FLOOR(). Never apply this to an
 * already-floored effective stat instead; that would silently skew the
 * result low a second time (see stats.ts's "nested FLOOR() problem" note).
 *
 * Shadow and mega/primal boost are mutually exclusive in the real game — a
 * Shadow Pokémon cannot Mega Evolve until Purified first. A species flagged
 * both `isShadow` and carrying a `boost` is invalid data, not a combination
 * this engine will silently run the math on; it throws instead so the bad
 * data gets fixed at the source (a hand-authored fixture or a data-sync
 * mapping bug), the same way this project already treats other
 * too-implausible-to-silently-accept fixture mistakes.
 */
export function shadowAdjustedBaseStats(
  species: Pick<SpeciesDefinition, "baseAttack" | "baseDefense" | "isShadow" | "boost">,
): { baseAttack: number; baseDefense: number } {
  if (species.isShadow && species.boost) {
    throw new Error(
      "Species is flagged isShadow and also carries a mega/primal boost — impossible in the real game (a Shadow Pokémon cannot Mega Evolve without being Purified first). Fix the source SpeciesDefinition rather than combining both.",
    );
  }
  if (!species.isShadow) {
    return { baseAttack: species.baseAttack, baseDefense: species.baseDefense };
  }
  return {
    baseAttack: species.baseAttack * SHADOW_ATTACK_MULTIPLIER,
    baseDefense: species.baseDefense * SHADOW_DEFENSE_MULTIPLIER,
  };
}

/**
 * Shadow raid enrage — a mid-fight HP-threshold stat swap unique to Shadow
 * raid bosses. [community-consensus], Bulbapedia's `Shadow_Raid` raw
 * wikitext + corroborating community guides (fetched 2026-09-09); see
 * MECHANICS.md's "Shadow raids" section for the full sourcing. No
 * first-party source states any of these numbers.
 *
 * A Shadow raid boss enrages once its remaining HP drops to 60% or below
 * (`attack = 1.81 * baseAttack + 15`, `defense = 3 * baseDefense + 15`), and
 * automatically SUBDUES back to its normal, non-enraged stats once remaining
 * HP drops to 15% or below — solo-reachable, since the subdue is automatic
 * and carries no multi-trainer Purified Gem requirement (Purified Gems exist
 * to subdue it EARLIER than 15%, a separate, deliberately-unmodeled
 * multi-trainer mechanic — see MECHANICS.md).
 */
export const SHADOW_ENRAGE_HP_FRACTION = 0.6;
export const SHADOW_SUBDUE_HP_FRACTION = 0.15;

/**
 * The enrage formula's own multiplier/offset, verbatim from the sourcing
 * above: `attack = 1.81 * baseAttack + 15`, `defense = 3 * baseDefense + 15`.
 * The `+15` on both is very likely the same perfect-IV-15 term
 * `raidBoss.ts`'s `REAL_RAID_BOSS_IV` already adds for a boss's NORMAL
 * (non-enraged) stats — just added AFTER the multiplier here instead of
 * before it (contrast `effectiveStat`'s `(base + iv) * cpm`) — but no source
 * states that explicitly, and the enrage formula is otherwise a totally
 * different shape (no tier `attackDefenseMultiplier` term at all), so this is
 * kept as its own literal rather than importing raidBoss.ts's constant and
 * asserting a connection nothing actually confirms.
 */
export const SHADOW_ENRAGE_ATTACK_MULTIPLIER = 1.81;
export const SHADOW_ENRAGE_ATTACK_OFFSET = 15;
export const SHADOW_ENRAGE_DEFENSE_MULTIPLIER = 3;
export const SHADOW_ENRAGE_DEFENSE_OFFSET = 15;

export type ShadowEnragePhase = "normal" | "enraged";

/**
 * Which Attack/Defense band applies at a given remaining-HP fraction (0-1).
 * A pure function of the CURRENT fraction, not a one-way state machine or a
 * hysteresis loop — a raid boss's HP only ever decreases within a single
 * fight (this engine never models healing), so recomputing this fresh every
 * tick from the live fraction is equivalent to, and simpler than, tracking a
 * separate "have we enraged yet" flag. The two thresholds are directly
 * nested (15% subdue sits INSIDE the wider [0, 60%] band the naive enrage
 * check alone would cover), so subdue is checked first and wins at the
 * boundary — matching the real sequence (enrage engages first as HP falls
 * past 60%, then auto-subdues later as HP keeps falling past 15%).
 */
export function shadowEnragePhaseForHpFraction(remainingHpFraction: number): ShadowEnragePhase {
  if (remainingHpFraction <= SHADOW_SUBDUE_HP_FRACTION) return "normal";
  if (remainingHpFraction <= SHADOW_ENRAGE_HP_FRACTION) return "enraged";
  return "normal";
}

/**
 * Enraged Attack/Defense for a Shadow raid boss.
 *
 * STACKING DECISION (2026-09-10), the open sub-question this feature's task
 * explicitly flagged: does `1.81 * baseAttack + 15` read `baseAttack` as the
 * species' RAW base stat, or as the already Shadow-adjusted one (`* 1.2` /
 * `* 5/6`, see `shadowAdjustedBaseStats` above)? Bulbapedia's wording alone
 * doesn't say. Resolved from the codebase's own existing architecture rather
 * than guessed: `shadowAdjustedBaseStats` is the SINGLE place this engine
 * ever applies the Shadow multiplier, always pre-floor to the raw base stat,
 * reused unchanged by every consumer (`stats.ts`'s `effectiveStatsAtLevel`
 * for trainer-owned Shadow Pokémon, `comparison.ts`'s `bossEffectiveStats`
 * for a Shadow boss's NORMAL tier-multiplied stats). `damage.ts` carries NO
 * separate Shadow multiplier term at all — there is no second application
 * point anywhere in this engine that could double it. The enrage formula
 * below is architecturally just a second TRANSFORM of that same
 * shadow-adjusted base stat (swapping in for the tier-multiplier transform
 * `bossEffectiveStats` uses for the normal case), so it reuses
 * `shadowAdjustedBaseStats`'s output as its `baseAttack`/`baseDefense` input
 * — exactly one Shadow-multiplier application, same as every other stat this
 * engine computes for a Shadow Pokémon.
 *
 * This is NOT a coin-flip "pick the conservative reading and move on" case:
 * inventing a SECOND application point (e.g. multiplying this function's
 * output by 1.2/5-6ths again) would require adding a call site nothing in
 * this codebase's existing shape supports, and is exactly the "compounds two
 * multipliers and inflates the boss badly" failure this feature's task
 * warned against by name. For what it's worth the two orderings are also
 * numerically close for this particular formula (both multiplier and offset
 * are linear, so pre- vs post-multiplying by a constant differs only in
 * whether the `+15` term itself gets scaled) — so even a wrong guess here
 * would not have been wildly off — but the architectural answer is
 * unambiguous regardless.
 */
export function shadowEnragedStats(
  species: Pick<SpeciesDefinition, "baseAttack" | "baseDefense" | "isShadow" | "boost">,
): { attack: number; defense: number } {
  const { baseAttack, baseDefense } = shadowAdjustedBaseStats(species);
  return {
    attack: Math.floor(SHADOW_ENRAGE_ATTACK_MULTIPLIER * baseAttack + SHADOW_ENRAGE_ATTACK_OFFSET),
    defense: Math.floor(SHADOW_ENRAGE_DEFENSE_MULTIPLIER * baseDefense + SHADOW_ENRAGE_DEFENSE_OFFSET),
  };
}
