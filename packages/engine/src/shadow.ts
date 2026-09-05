import type { SpeciesDefinition } from "./types.js";

/**
 * Shadow Pokémon Attack/Defense stat multipliers (Stamina is untouched).
 * [community-consensus], NOT Niantic-published — GamePress-adjacent guides,
 * Fandom's wiki, and datamine-derived community sources converge on
 * approximately these values since the Shadow rework (Feb 2021), but no
 * primary/official source has ever surfaced. Some sources render the defense
 * multiplier as the fraction 5/6 (~0.8333) rather than the flat decimal 0.83
 * used here — the two are close enough that this project's fixtures don't
 * currently depend on which one is "more correct"; revisit if a primary
 * source ever turns up (same discipline this project already applies to
 * hand-authored fixture stats after the Mega Skarmory baseAttack incident).
 */
export const SHADOW_ATTACK_MULTIPLIER = 1.2;
export const SHADOW_DEFENSE_MULTIPLIER = 0.83;

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
