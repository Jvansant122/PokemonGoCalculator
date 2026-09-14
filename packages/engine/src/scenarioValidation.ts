import type { DodgeBehavior } from "./breakpoints.js";
import type { MegaLevel } from "./megaLevel.js";
import type { IVSpread } from "./types.js";
import type { WeatherCondition } from "./weather.js";

/**
 * Small, dependency-free runtime type guards shared by scenario.ts's and
 * teamScenario.ts's defensive decoders (`decodeScenario`/`decodeTeamScenario`
 * and their `*WithDiagnostics` siblings). Nothing here names a specific
 * `Scenario`/`TeamScenario` field — each of those two files owns its own
 * per-field validator table built out of these primitives (see
 * `FieldValidators`/`sanitizeKnownFields` below), so adding a new top-level
 * field to either interface never requires touching this file.
 *
 * WHY THIS EXISTS (2026-09-14): before this file, every decoder in this
 * package was a bare `JSON.parse(...) as Scenario` with zero runtime
 * checking. A share link is untrusted input in exactly the way any other
 * network/user input is — a chat client can mangle it, a user can hand-edit
 * a query param, a byte can flip in transit — and every one of those failure
 * shapes crashed the whole tab instead of degrading (see
 * `packages/web/src/TabErrorBoundary.tsx`'s doc comment for the three real
 * crash shapes that motivated this: invalid base64, a base64-valid-but-
 * non-JSON string, and a structurally-valid-but-wrong-shape JSON object).
 * The fix is per-field: a field present with the WRONG type/shape is treated
 * exactly like a field that's simply ABSENT — this project's long-established
 * "an older link predates this field" convention (every
 * `decodes a scenario encoded before X existed` test in scenario.test.ts)
 * already relies on downstream consumers (`packages/web`'s
 * `scenarioToAssumptions`) treating `undefined` as "use the default." A
 * wrong-typed field is made to look identical to that same, already-handled
 * case — never coerced, never guessed at, never silently kept with the wrong
 * shape.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Rejects NaN/Infinity too, not just non-numbers — a share link with a
 * broken numeric field should degrade exactly like any other malformed
 * field, not silently carry a non-finite value into damage math three
 * modules downstream where it would be far harder to trace back to "the
 * link was bad."
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * Wraps a validator so `null` also passes — the "no per-X override, use the
 * shared value" convention used throughout `Scenario`/`TeamScenario`
 * (`candidateDodge`, `candidateMegaLevel`, `TeamScenarioSlot.megaLevel`, ...).
 */
export function orNull<T>(validator: (value: unknown) => value is T): (value: unknown) => value is T | null {
  return (value): value is T | null => value === null || validator(value);
}

export function isIVSpread(value: unknown): value is IVSpread {
  return (
    isPlainObject(value) &&
    isFiniteNumber(value.attack) &&
    isFiniteNumber(value.defense) &&
    isFiniteNumber(value.stamina)
  );
}

const MEGA_LEVELS: ReadonlySet<string> = new Set<MegaLevel>(["base", "high", "max", "super-max"]);

export function isMegaLevel(value: unknown): value is MegaLevel {
  return typeof value === "string" && MEGA_LEVELS.has(value);
}

const WEATHER_CONDITIONS: ReadonlySet<string> = new Set<WeatherCondition>([
  "none",
  "sunny",
  "rainy",
  "windy",
  "cloudy",
  "fog",
  "snow",
  "partly_cloudy",
]);

export function isWeatherCondition(value: unknown): value is WeatherCondition {
  return typeof value === "string" && WEATHER_CONDITIONS.has(value);
}

export function isDodgeBehavior(value: unknown): value is DodgeBehavior {
  if (!isPlainObject(value)) return false;
  switch (value.kind) {
    case "none":
    case "perfect":
      return true;
    case "percentage-missed":
      return isFiniteNumber(value.missedFraction);
    default:
      return false;
  }
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

/**
 * Exactly a 2-tuple, matching `Scenario`'s own hard 2-candidate fields
 * (`candidateFastMoveIds`, `candidateMegaLevel`, ...) — NOT a generic "array
 * of length >= 2" check. An array of the wrong length fails validation
 * entirely (the whole field is dropped, same as any other shape mismatch),
 * since a 1- or 3-element array has no sound per-index meaning to salvage.
 */
export function isTuple2<T>(validator: (value: unknown) => value is T): (value: unknown) => value is [T, T] {
  return (value): value is [T, T] =>
    Array.isArray(value) && value.length === 2 && validator(value[0]) && validator(value[1]);
}

/** One validator per field of `T`, keyed by `T`'s own field names. */
export type FieldValidators<T> = { [K in keyof T]: (value: unknown) => boolean };

export interface SanitizeResult {
  /**
   * A shallow copy of `raw` with only the RECOGNIZED-but-INVALID fields
   * removed. Deliberately NOT limited to `validators`' own keys — any field
   * `raw` carries that `validators` has no entry for is copied through
   * completely untouched. This matters concretely: `packages/web`'s
   * `ComparatorScenario` extends the engine's `Scenario` with a web-only
   * `candidateShadow` field living in the exact same JSON blob (see that
   * file's own doc comment — "round-trips through the exact same shared
   * base64url transport... without any packages/engine change"). If this
   * function stripped unrecognized keys, that extension mechanism would
   * silently break the moment this file shipped. An unrecognized key is not
   * evidence of corruption — it's just a field this package doesn't know
   * about, exactly as an older/newer version of this same package would see
   * a field it doesn't (yet) declare.
   */
  result: Record<string, unknown>;
  /**
   * Field names present in `raw` (i.e. NOT simply absent) but removed
   * because their value failed that field's validator — reported so a
   * caller can distinguish "this link predates the field" (silent, always
   * has been) from "this link claimed to set the field but the value was
   * unusable" (now silent in the RESULT, but visible here).
   */
  rejectedFields: string[];
}

/**
 * Applies `validators` to `raw` field-by-field. A field absent from `raw` is
 * left absent — today's long-established "older link predates this field"
 * behavior, byte-for-byte unchanged. A field present but failing its
 * validator is deleted from the result (treated identically to absent) and
 * its key recorded in `rejectedFields` rather than silently carried through
 * with the wrong shape into a caller that trusts the declared TypeScript
 * type.
 */
export function sanitizeKnownFields<T extends object>(
  raw: Record<string, unknown>,
  validators: FieldValidators<T>,
): SanitizeResult {
  const result: Record<string, unknown> = { ...raw };
  const rejectedFields: string[] = [];
  for (const key of Object.keys(validators) as (keyof T)[]) {
    const keyStr = key as string;
    if (!Object.prototype.hasOwnProperty.call(raw, keyStr)) continue;
    const validate = validators[key];
    if (!validate(raw[keyStr])) {
      delete result[keyStr];
      rejectedFields.push(keyStr);
    }
  }
  return { result, rejectedFields };
}

/**
 * Decodes a base64url string into a JSON object, or `null` if ANY step
 * fails: invalid base64 (bad alphabet/padding), valid base64 that doesn't
 * decode to valid JSON text, or valid JSON whose top-level value isn't a
 * plain object (an array, string, number, boolean, or `null`). This is the
 * ONE place "the payload is entirely unusable" is decided for both
 * scenario.ts and teamScenario.ts — see each file's own `decodeScenario`/
 * `decodeTeamScenario` for how that `null` propagates to their callers.
 */
export function tryParseJsonObject(fromBase64Url: (encoded: string) => Uint8Array, encoded: string): Record<string, unknown> | null {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(encoded);
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  return isPlainObject(parsed) ? parsed : null;
}
