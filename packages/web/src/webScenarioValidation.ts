import {
  FRIENDSHIP_ATTACK_BONUS_MULTIPLIER,
  isFiniteNumber,
  isPlainObject,
  sanitizeKnownFields,
  type FieldValidators,
  type FriendshipLevel,
  type BossChargedMoveCadence,
  type RosterSignificanceMode,
} from "@pogo-analyzer/engine";

/**
 * Web-side siblings of `packages/engine`'s `scenarioValidation.ts` primitives
 * (`isDodgeBehavior`/`isMegaLevel`/`isWeatherCondition`/`isIVSpread`/
 * `isStringArray`/`orNull`/`sanitizeKnownFields`/`tryParseJsonObject` are
 * reused directly from there — never re-declared here). This file exists
 * ONLY for types that live in `packages/web`, never `packages/engine`, so the
 * engine's own file has no reason to know about them: the five web-owned
 * scenario enums (`SpeciesReportSortMode`/`AttackDefenseBreakpointsMode`/
 * `PowerUpOptimizerMode`/`PowerUpRankBy`/`RosterSortBy`), the two
 * engine-typed-but-ungarded-there values (`FriendshipLevel`/
 * `BossChargedMoveCadence`/`RosterSignificanceMode` — each engine-owned as a
 * TYPE, but with no matching `isX` guard exported since scenarioValidation.ts
 * only guards fields `Scenario`/`TeamScenario` themselves declare), and the
 * generic nested-array-of-objects sanitizer every web scenario with a
 * `slots`-shaped field needs (mirrors `teamScenario.ts`'s own
 * `sanitizeSlots`, generalized since none of the five web scenarios share
 * `TeamScenario.slots`'s "exact length or reject the whole field" rule — see
 * `sanitizeObjectArray`'s own doc comment below for why).
 *
 * WHY THIS EXISTS (2026-09-14): mirrors packages/engine's scenarioValidation.ts
 * — see that file's own "WHY THIS EXISTS" for the full incident context
 * (every one of this project's seven `decodeXScenario` functions was a bare
 * `JSON.parse(...) as X` with zero runtime checking, so an invalid base64
 * string, valid-base64-non-JSON text, or structurally-valid-but-wrong-shape
 * payload crashed the whole tab instead of degrading). The engine's two
 * scenarios (`Scenario`/`TeamScenario`) got this treatment first
 * (`957999d`); this file is what lets the five WEB-owned scenarios
 * (`SpeciesReportScenario`/`IvBreakpointsScenario`/
 * `AttackDefenseBreakpointsScenario`/`PowerUpOptimizerScenario`/
 * `RosterScenario`) get the identical treatment without duplicating the
 * engine's own primitives.
 */

/** Generic `value is one of these exact literals` guard — usable for both string and numeric literal unions (e.g. `PowerUpHypotheticalCatchScenario.level`'s `20 | 25`), unlike a string-only `Set.has` helper. */
export function isLiteralUnion<T extends string | number>(allowed: readonly T[]): (value: unknown) => value is T {
  const allowedSet: ReadonlySet<unknown> = new Set(allowed);
  return (value): value is T => allowedSet.has(value);
}

const FRIENDSHIP_LEVELS: ReadonlySet<string> = new Set(Object.keys(FRIENDSHIP_ATTACK_BONUS_MULTIPLIER));

/** `FriendshipLevel` is engine-typed (damage.ts) but the engine's own scenarioValidation.ts has no guard for it — neither `Scenario` nor `TeamScenario` declares a friendshipLevel field, only the five WEB scenarios do. Derived from `FRIENDSHIP_ATTACK_BONUS_MULTIPLIER`'s own keys rather than a second hardcoded list, so a new tier added there is automatically accepted here. */
export function isFriendshipLevel(value: unknown): value is FriendshipLevel {
  return typeof value === "string" && FRIENDSHIP_LEVELS.has(value);
}

/** See simulate.ts's `BossChargedMoveCadence` (engine-typed, web-guarded for the same reason as isFriendshipLevel above). */
export const isBossChargedMoveCadence = isLiteralUnion<BossChargedMoveCadence>([
  "fixed-interval",
  "energy-driven",
  "energy-gated-interval",
]);

/** See rosterPlanner.ts's `RosterSignificanceMode` (engine-typed, web-guarded for the same reason as isFriendshipLevel above). */
export const isRosterSignificanceMode = isLiteralUnion<RosterSignificanceMode>(["aggregate-only", "aggregate-or-per-boss"]);

/** `Record<string, { candy: number; xlCandy: number } | undefined>` — PowerUpOptimizerScenario.candyByFamilyId. A dictionary, not a fixed-shape object, so it needs its own shape check rather than sanitizeKnownFields' per-field table. Any single bad entry rejects the WHOLE map (same "field present but wrong shape, drop it" rule as everywhere else in this file) rather than trying to salvage individual family ids — a partially-sanitized candy map is exactly the kind of "half-restored but looks whole" result this project's decode hardening exists to avoid presenting as trustworthy. */
export function isCandyByFamilyIdMap(value: unknown): value is Record<string, { candy: number; xlCandy: number } | undefined> {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every(
    (entry) => entry === undefined || (isPlainObject(entry) && isFiniteNumber(entry.candy) && isFiniteNumber(entry.xlCandy)),
  );
}

/**
 * Sanitizes an array-of-plain-objects field (e.g. `PowerUpOptimizerScenario.slots`/
 * `.multiRaidHypotheticalCatches`) item-by-item, mirroring `teamScenario.ts`'s
 * own `sanitizeSlots` — EXCEPT none of the five web scenarios' array fields
 * carry `TeamScenario.slots`'s "the array's LENGTH is itself meaningful"
 * constraint (a fixed fight-order position per index), so there is no
 * "exact length or reject the whole field" gate here: a wrong-length array
 * is sanitized item-by-item same as a right-length one, and each view's own
 * `scenarioToAssumptions` already pads/truncates defensively downstream
 * (same convention as `TeamRaidView`'s `teamScenarioToAssumptions`). A raw
 * value that isn't even an array rejects the whole field, same as any other
 * shape mismatch elsewhere in this file.
 */
export function sanitizeObjectArray<T extends object>(
  rawArray: unknown,
  validators: FieldValidators<T>,
  fieldName: string,
): { value: T[] | undefined; rejectedFields: string[] } {
  if (!Array.isArray(rawArray)) {
    return { value: undefined, rejectedFields: [fieldName] };
  }
  const rejectedFields: string[] = [];
  const items = rawArray.map((rawItem, index): T => {
    if (!isPlainObject(rawItem)) {
      rejectedFields.push(`${fieldName}[${index}]`);
      return {} as T;
    }
    const { result, rejectedFields: itemRejected } = sanitizeKnownFields<T>(rawItem, validators);
    for (const field of itemRejected) rejectedFields.push(`${fieldName}[${index}].${field}`);
    return result as unknown as T;
  });
  return { value: items, rejectedFields };
}
