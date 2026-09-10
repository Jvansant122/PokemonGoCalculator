import type { CSSProperties } from "react";

/**
 * Shared numeric `<input type="number">` used across every assumption panel
 * in this app. Wraps two behaviors every numeric field needs, which used to
 * be hand-rolled (or, worse, skipped) independently at each call site:
 *
 *  1. Select-all-on-focus, so clicking once into a pre-filled field and
 *     typing REPLACES the value instead of appending to it. Without this, a
 *     "Candy on hand" field reading 100, clicked once and typed "50",
 *     silently becomes 10050 -- no error, and every downstream
 *     afford/can't-afford verdict and budget-plan step is then computed off
 *     a candy pool 100x too large, presented with total on-screen
 *     confidence (a real, reported bug, 2026-09-10). See SpeciesPicker.tsx
 *     for the identical fix already applied to the species search box.
 *  2. A best-effort clamp to [min, max], applied ONLY on blur, never on
 *     every keystroke -- clamping on change is hostile, because typing
 *     toward "50" passes through "5", which would clamp mid-keystroke.
 *     A field with no natural game-rule upper bound (candy, stardust) should
 *     be given no `max` at all -- pass `warnAbove` instead for a soft,
 *     non-blocking sanity hint rather than inventing a fake ceiling.
 *
 * An in-progress invalid/unparseable value (e.g. a lone "-" while typing a
 * negative) is left alone on blur rather than forced to some default -- for
 * a field with a real minimum enforced downstream (like Level), the
 * engine's own validation already surfaces a bad value loudly ("No CPM
 * entry for level ..."), which is the right place for that error, not a
 * UI-level guess made here.
 */
export interface NumberFieldProps {
  id?: string;
  className?: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  title?: string;
  placeholder?: string;
  style?: CSSProperties;
  /**
   * Only for fields that track "nothing entered yet" as a real, distinct
   * state (e.g. the Power-Up Optimizer's per-candy-family pools, which
   * render "unknown" rather than defaulting to 0) -- lets the field clear to
   * `undefined` on an empty box instead of collapsing it to 0.
   */
  allowEmpty?: boolean;
  /**
   * Soft, non-blocking sanity threshold for a field with no natural
   * game-rule upper bound. Never clamps the value -- just renders
   * `warnMessage` (or a generic default) once `value` exceeds it, so an
   * honest large number is never silently rejected.
   */
  warnAbove?: number;
  warnMessage?: string;
}

/**
 * Pure helper behind the onBlur clamp, exported and unit-tested
 * independently of the DOM.
 *
 * Returns `null` when the text doesn't parse to a number at all (e.g.
 * mid-typing "-" or "1e") -- the field should be left alone, not forced to
 * some guessed value. Returns `undefined` to mean "clear to empty" (only
 * reachable with `allowEmpty`). Otherwise returns the value to commit,
 * clamped into [min, max] wherever those are defined.
 */
export function resolveNumberFieldBlurValue(
  rawText: string,
  options: { min?: number; max?: number; allowEmpty?: boolean } = {},
): number | undefined | null {
  const { min, max, allowEmpty } = options;
  if (allowEmpty && rawText.trim() === "") return undefined;
  const parsed = Number(rawText);
  if (Number.isNaN(parsed)) return null;
  let clamped = parsed;
  if (min !== undefined) clamped = Math.max(min, clamped);
  if (max !== undefined) clamped = Math.min(max, clamped);
  return clamped;
}

export function NumberField({
  id,
  className,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  title,
  placeholder,
  style,
  allowEmpty,
  warnAbove,
  warnMessage,
}: NumberFieldProps) {
  return (
    <>
      <input
        id={id}
        className={className}
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        title={title}
        placeholder={placeholder}
        style={style}
        value={value === undefined || Number.isNaN(value) ? "" : value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const raw = e.target.value;
          if (allowEmpty && raw.trim() === "") {
            onChange(undefined);
            return;
          }
          onChange(Number(raw));
        }}
        onBlur={(e) => {
          const resolved = resolveNumberFieldBlurValue(e.target.value, { min, max, allowEmpty });
          if (resolved === null) return;
          onChange(resolved);
        }}
      />
      {warnAbove !== undefined && value !== undefined && value > warnAbove && (
        <p className="species-picker-hint">
          {warnMessage ?? "That's a large number to have on hand — double check a stray digit didn't sneak in."}
        </p>
      )}
    </>
  );
}
