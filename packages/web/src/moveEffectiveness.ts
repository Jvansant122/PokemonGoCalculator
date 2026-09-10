import { NEUTRAL, NOT_VERY_EFFECTIVE, NO_EFFECT, SUPER_EFFECTIVE, typeEffectiveness, type PokemonType } from "@pogo-analyzer/engine";

/**
 * Move-picker type-effectiveness classification (MoveSelect.tsx) — added
 * 2026-09-10 so a move's closed-control row can show "is this move super
 * effective / neutral / resisted against the relevant opponent(s)" in the
 * freed-up space left by hiding the damage/duration/DPS/energy numbers
 * (those move to the open list only — see MoveSelect.tsx's own doc comment).
 *
 * This module never reimplements the type chart itself — every multiplier
 * comes from the engine's own `typeEffectiveness` (typeChart.ts). All this
 * file does is bucket that already-correct number into a human-readable
 * tier for display, which is why the bucket boundaries below are derived
 * from the engine's own exported constants (SUPER_EFFECTIVE /
 * NOT_VERY_EFFECTIVE / NO_EFFECT / NEUTRAL) rather than hand-typed
 * independently — if the engine's chart values ever change, these
 * thresholds move with them instead of silently drifting out of sync.
 */

export type EffectivenessTone = "double-super" | "super" | "neutral" | "resisted" | "very-resisted" | "extreme";

export interface EffectivenessTier {
  /**
   * The exact multiplier this was classified from, never rounded away for
   * classification purposes — only formatted (up to 3 decimal places,
   * trailing zeros trimmed) for `multiplierLabel`. A double weakness
   * (2.56x) is a materially different decision input than a single one
   * (1.6x), and 0.244x reads worse than 0.39x — collapsing either pair
   * into one bucket would hide a real number the tool exists to surface.
   */
  multiplier: number;
  /** e.g. "2.56x", "1x", "0.625x" — see formatMultiplier's own comment for why 3 decimal places rather than a fixed 2. */
  multiplierLabel: string;
  /** e.g. "2x Super Effective", "Neutral", "Very Ineffective". */
  label: string;
  /**
   * A plain-text, color-independent glyph carrying the same "how good/bad"
   * signal `tone`'s color alone would, so the indicator still reads
   * correctly without relying on color perception. Not an icon/image asset
   * — this project's "no charting/UI library, hand-rolled only" convention
   * extends to skipping SVG icons here too, since plain characters already
   * carry enough signal at this size.
   */
  glyph: string;
  /** CSS class-suffix hook (see styles.css's move-effectiveness-* rules) — not a raw color, so the actual hues stay defined once in styles.css rather than duplicated here. */
  tone: EffectivenessTone;
}

/**
 * Math.round(m * 1000) / 1000 then plain template-literal interpolation —
 * NOT toFixed, which would pad "1.6" out to "1.60" and "1" out to "1.00".
 * JS's own Number-to-String conversion already prints the shortest decimal
 * that round-trips to the same double, so this both absorbs the float
 * noise that repeated multiplication of SUPER_EFFECTIVE (1.6, not exactly
 * representable in binary) produces AND keeps trailing zeros off without a
 * second trimming step.
 */
function formatMultiplier(multiplier: number): string {
  const rounded = Math.round(multiplier * 1000) / 1000;
  return `${rounded}x`;
}

function geometricMean(a: number, b: number): number {
  return Math.sqrt(a * b);
}

// The 6 finite "rungs" a real (single- or dual-typed) defender can actually
// produce, ascending:
//   [NOT_VERY_EFFECTIVE x NO_EFFECT] < NO_EFFECT < NOT_VERY_EFFECTIVE
//     < NEUTRAL < SUPER_EFFECTIVE < [SUPER_EFFECTIVE squared]
// NOT_VERY_EFFECTIVE squared lands exactly on NO_EFFECT (both equal
// 0.390625) — presumably why the game reuses NO_EFFECT as the single-type
// "old core-series immunity, converted to a double-resist" constant; see
// typeChart.ts's own comment on why Pokemon GO has no true combat
// immunities. SUPER_EFFECTIVE x NOT_VERY_EFFECTIVE also lands within float
// noise of exactly NEUTRAL, which is why the neutral bucket below is a
// wide range around 1, not a point match. A threshold between two adjacent
// rungs is their geometric mean, so classification is exact for every
// value this game's chart can actually produce and tolerant of the float
// rounding noise SUPER_EFFECTIVE (1.6, not exactly representable in binary)
// introduces when squared, without a hand-picked epsilon.
const DOUBLE_SUPER_EFFECTIVE = SUPER_EFFECTIVE * SUPER_EFFECTIVE;
const WORST_RUNG = NOT_VERY_EFFECTIVE * NO_EFFECT;

const THRESHOLD_SUPER_TO_DOUBLE_SUPER = geometricMean(SUPER_EFFECTIVE, DOUBLE_SUPER_EFFECTIVE);
const THRESHOLD_NEUTRAL_TO_SUPER = geometricMean(NEUTRAL, SUPER_EFFECTIVE);
const THRESHOLD_RESISTED_TO_NEUTRAL = geometricMean(NOT_VERY_EFFECTIVE, NEUTRAL);
const THRESHOLD_VERY_RESISTED_TO_RESISTED = geometricMean(NO_EFFECT, NOT_VERY_EFFECTIVE);
const THRESHOLD_EXTREME_TO_VERY_RESISTED = geometricMean(WORST_RUNG, NO_EFFECT);

/**
 * Classifies a raw type-effectiveness multiplier (from the engine's
 * typeEffectiveness) into a display tier. Six tiers, not three, per the
 * explicit requirement that a double weakness (2.56x) read as visibly
 * different from a single one (1.6x), and that immunity-adjacent values
 * (~0.39x, ~0.24x) read as increasingly (not identically) bad rather than
 * both flattening into one undifferentiated "not effective."
 */
export function classifyEffectiveness(multiplier: number): EffectivenessTier {
  const multiplierLabel = formatMultiplier(multiplier);
  if (multiplier >= THRESHOLD_SUPER_TO_DOUBLE_SUPER) {
    return { multiplier, multiplierLabel, label: "2x Super Effective", glyph: "▲▲", tone: "double-super" };
  }
  if (multiplier >= THRESHOLD_NEUTRAL_TO_SUPER) {
    return { multiplier, multiplierLabel, label: "Super Effective", glyph: "▲", tone: "super" };
  }
  if (multiplier >= THRESHOLD_RESISTED_TO_NEUTRAL) {
    return { multiplier, multiplierLabel, label: "Neutral", glyph: "●", tone: "neutral" };
  }
  if (multiplier >= THRESHOLD_VERY_RESISTED_TO_RESISTED) {
    return { multiplier, multiplierLabel, label: "Not Very Effective", glyph: "▽", tone: "resisted" };
  }
  if (multiplier >= THRESHOLD_EXTREME_TO_VERY_RESISTED) {
    return { multiplier, multiplierLabel, label: "Very Ineffective", glyph: "▼", tone: "very-resisted" };
  }
  return { multiplier, multiplierLabel, label: "Extremely Ineffective", glyph: "▼▼", tone: "extreme" };
}

/**
 * One opponent to classify a move against — `label` is a short identifying
 * tag ("A"/"B", "1".."6") used only when 2+ opponents are given at once
 * (see effectivenessAgainstEach); a single-opponent call site can pass any
 * placeholder label since renderers are expected to drop the tag in that
 * case (MoveSelect.tsx's own rendering does exactly this).
 */
export interface EffectivenessOpponent {
  label: string;
  types: readonly PokemonType[];
}

/**
 * Deliberately NOT `extends EffectivenessTier` with its own `label` field —
 * `EffectivenessTier.label` is already taken (the semantic tier text, e.g.
 * "Super Effective") and a naive `{ ...tier, label: opponent.label }` spread
 * would silently overwrite it with the opponent's short tag instead of
 * combining the two, losing the tier's own label entirely. Nesting `tier`
 * keeps both unambiguous: `opponentLabel` ("A" / "3") and `tier.label`
 * ("Super Effective") are never at risk of colliding again.
 */
export interface DefenderEffectiveness {
  opponentLabel: string;
  tier: EffectivenessTier;
}

/**
 * A move's type against each of `opponents`' types independently (a
 * dual-typed defender's own two types already stack multiplicatively
 * inside typeEffectiveness itself — see typeChart.ts). Empty input yields
 * empty output, so a call site with no single meaningful opponent (e.g.
 * Species Report's sweep across every raid boss at once, which has no one
 * target to measure against) can pass nothing and get nothing rendered,
 * rather than a wrong or invented matchup.
 */
export function effectivenessAgainstEach(
  moveType: PokemonType,
  opponents: readonly EffectivenessOpponent[],
): DefenderEffectiveness[] {
  return opponents.map((opponent) => ({
    opponentLabel: opponent.label,
    tier: classifyEffectiveness(typeEffectiveness(moveType, opponent.types)),
  }));
}
