import type { DodgeBehavior } from "./breakpoints.js";
import type { MegaLevel } from "./megaLevel.js";
import {
  isBoolean,
  isDodgeBehavior,
  isFiniteNumber,
  isIVSpread,
  isMegaLevel,
  isString,
  isStringArray,
  isStringOrNull,
  isTuple2,
  isWeatherCondition,
  orNull,
  sanitizeKnownFields,
  tryParseJsonObject,
  type FieldValidators,
} from "./scenarioValidation.js";
import type { IVSpread } from "./types.js";
import type { WeatherCondition } from "./weather.js";

/**
 * A scenario is the complete, shareable description of one comparison: which
 * candidates, against what, at what level/IVs, under what dodge assumptions,
 * feeding how large and fast a party. Every field here is one of the
 * assumptions Phase 4's panel must always show alongside any conclusion.
 *
 * There is deliberately no user-selectable "combat phase" (opening-burst vs
 * sustained) — the fight is one continuous simulation, and whether the boss
 * has thrown a charged move yet is a computed fact (see
 * bossChargedMoveReadySeconds in combat.ts), not a mode the user picks. An
 * earlier version exposed that as a toggle; it was removed because "does the
 * boss have a charged move ready" isn't a strategic choice a player makes.
 */
export interface Scenario {
  candidates: string[];
  /** Per-candidate fast-move selection, matched by index to `candidates`. null means "use that species' first fast move" (today's implicit default). */
  candidateFastMoveIds: [string | null, string | null];
  /** Per-candidate charged-move selection — see candidateFastMoveIds. */
  candidateChargedMoveIds: [string | null, string | null];
  /**
   * Per-candidate "pretend this species has no mega/primal boost mechanic at
   * all", matched by index to `candidates` — lets a user compare a mega
   * candidate's DPS fairly against a non-mega one. true disables BOTH that
   * candidate's own-damage boost AND its team-damage attribution entirely
   * (see comparison.ts's SustainedComparisonInputs.candidateMegaBoostDisabled and
   * uptime.ts's convertUptimeToTeamDamage) — a full toggle, not partial.
   * Defaults to [false, false] (today's implicit behavior: every candidate's
   * boost, if any, is always active).
   */
  candidateMegaBoostDisabled: [boolean, boolean];
  /**
   * Per-candidate Mega Level (see megaLevel.ts), matched by index to
   * `candidates` — `null` means no Mega Level effect assumed for that
   * candidate (identical to `"base"`: no Super Max effective-level CP bonus,
   * and any selected "+" charged move reads at its stored Base-tier power).
   * Silently has no effect for a candidate whose species has no mega/primal
   * `boost` mechanic at all (see comparison.ts's resolveCandidateMegaLevel).
   * Defaults to `[null, null]` (today's implicit behavior) so a scenario URL
   * encoded before this field existed still decodes to the same result it
   * always gave.
   */
  candidateMegaLevel: [MegaLevel | null, MegaLevel | null];
  target: string;
  /** Boss fast-move selection. null means "use the boss's first fast move" (today's implicit default). */
  bossFastMoveId: string | null;
  /** Boss charged-move selection. null means "use the boss's first charged move" (today's implicit default). */
  bossChargedMoveId: string | null;
  level: number;
  ivs: IVSpread;
  /** Governs dodging the boss's CHARGED attacks only. */
  dodgeModel: DodgeBehavior;
  /** Whether the candidate also attempts to dodge the boss's fast attacks — a separate yes/no from dodgeModel, since dodging every fast attack costs DODGE_COST_SECONDS and usually isn't worth it. */
  dodgeFastAttacks: boolean;
  /**
   * Per-candidate override for dodgeModel above, matched by index to
   * `candidates` — lets a user compare a bulky candidate played with no
   * dodging against a glass cannon played with perfect dodging, a real
   * A-vs-B question this product's ranking-flip thesis depends on (see
   * comparison.ts's SustainedComparisonInputs.candidateDodge). `null` means
   * "use the shared dodgeModel above" for that candidate. Defaults to
   * [null, null] (today's implicit behavior: both candidates always use the
   * shared dodgeModel) so a scenario URL encoded before this field existed
   * still decodes to the same result it always gave.
   */
  candidateDodge: [DodgeBehavior | null, DodgeBehavior | null];
  /**
   * Per-candidate override for dodgeFastAttacks above — see candidateDodge.
   * `null` means "use the shared dodgeFastAttacks above" for that candidate,
   * NOT "false". Defaults to [null, null].
   */
  candidateDodgeFastAttacks: [boolean | null, boolean | null];
  /** Hold the charged move for a safer moment (right after dodging a boss charged hit, or when energy caps) instead of firing immediately. */
  holdChargedMoveUntilSafe: boolean;
  /** Extends the damage-over-time chart's window beyond the auto-computed natural minimum (never below it) — 0 means no override. */
  minFightLengthSeconds: number;
  partySize: number;
  teammateDps: number;
  /**
   * How many of partySize's teammates share the lead candidate's boosted
   * type and so get the full mega-boost multiplier — the rest still get
   * OFF_TYPE_MEGA_BOOST_MULTIPLIER (never zero; see uptime.ts). Real teams
   * are rarely all-or-nothing on type, so this is a count, not a single
   * yes/no for the whole party. 0 <= matchingTeammateCount <= partySize.
   */
  matchingTeammateCount: number;
  /** Mean seconds between the boss's charged moves once it starts using them. */
  bossChargedMoveFrequencySeconds: number;
  /** Whether the boss starts the fight already partway charged (see bossStartingEnergyFraction). */
  bossStartsPrimed: boolean;
  /** Fraction (0-1) of the boss's first charged move's energy cost it starts with, when bossStartsPrimed is true. */
  bossStartingEnergyFraction: number;
  /**
   * The active weather condition, applied per-move (checked against that
   * move's own type, not either combatant's species type) to BOTH the
   * candidate's and the boss's damage output independently — see weather.ts's
   * isWeatherBoosted. Defaults to "none" (today's implicit behavior: no
   * weather modeled) so a scenario URL encoded before this field existed
   * still decodes to the same result it always gave.
   */
  weather: WeatherCondition;
  /**
   * Whether the Comparator's UI shows its advanced/detailed assumption
   * controls — the dodge model (`dodgeModel`), `dodgeFastAttacks`, the
   * per-candidate `candidateDodge`/`candidateDodgeFastAttacks` overrides,
   * `holdChargedMoveUntilSafe`, and the "extend simulated window" override
   * (`minFightLengthSeconds`) — or collapses them behind a single "advanced"
   * toggle. `TeamScenario` (teamScenario.ts) carries the same field for the
   * Team Raid Simulator. This field is PURE UI STATE as far as this package
   * is concerned — nothing in comparison.ts reads it, and it has zero effect
   * on any computed number. It exists here only so a shared link preserves
   * which panel section the sender had open/relied on, per this project's
   * standing "every user-facing assumption round-trips through Scenario"
   * rule. Whether packages/web derives a different value for any gated field
   * when this is false is entirely a web-side decision this field does not
   * constrain. `decodeScenario` performs no VALUE-level defaulting of its own
   * (same as every sibling field on this interface) — as of 2026-09-14 it
   * does validate this field is actually a `boolean` and drops it back to
   * "absent" if not (see scenarioValidation.ts), but that is type-shape
   * checking, not choosing a default; an absent/rejected value still falls
   * back to packages/web's own `DEFAULT_ASSUMPTIONS` in its
   * `scenarioToAssumptions`, the same plain fallback as every other field.
   */
  showDetailedAssumptions: boolean;
}

/**
 * Exported (not just module-private) so teamScenario.ts's TeamScenario
 * encode/decode can reuse the exact same base64url-JSON transport rather
 * than forking a second copy of it.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(encoded: string): Uint8Array {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encodes a scenario into a URL-safe string (base64url JSON) so a comparison
 * can be shared as a link rather than re-explained. No I/O here — the engine
 * only produces/consumes the string; packages/web attaches it to `location`.
 * Uses TextEncoder/atob/btoa (not Buffer) so this runs unmodified in a browser
 * or in Node, matching the "engine has no I/O, no UI, but must run standalone
 * in either" constraint.
 */
export function encodeScenario(scenario: Scenario): string {
  const json = JSON.stringify(scenario);
  return toBase64Url(new TextEncoder().encode(json));
}

/**
 * One validator per top-level `Scenario` field — see scenarioValidation.ts's
 * `FieldValidators`/`sanitizeKnownFields` for how this is applied. Keep this
 * in sync with `Scenario` itself; a field added to the interface without a
 * matching entry here type-checks fine (nothing enforces the two stay in
 * sync beyond `FieldValidators<Scenario>`'s own mapped type, which DOES fail
 * to compile if a key is missing) but is worth double-checking on review.
 */
const SCENARIO_FIELD_VALIDATORS: FieldValidators<Scenario> = {
  candidates: isStringArray,
  candidateFastMoveIds: isTuple2(isStringOrNull),
  candidateChargedMoveIds: isTuple2(isStringOrNull),
  candidateMegaBoostDisabled: isTuple2(isBoolean),
  candidateMegaLevel: isTuple2(orNull(isMegaLevel)),
  target: isString,
  bossFastMoveId: isStringOrNull,
  bossChargedMoveId: isStringOrNull,
  level: isFiniteNumber,
  ivs: isIVSpread,
  dodgeModel: isDodgeBehavior,
  dodgeFastAttacks: isBoolean,
  candidateDodge: isTuple2(orNull(isDodgeBehavior)),
  candidateDodgeFastAttacks: isTuple2(orNull(isBoolean)),
  holdChargedMoveUntilSafe: isBoolean,
  minFightLengthSeconds: isFiniteNumber,
  partySize: isFiniteNumber,
  teammateDps: isFiniteNumber,
  matchingTeammateCount: isFiniteNumber,
  bossChargedMoveFrequencySeconds: isFiniteNumber,
  bossStartsPrimed: isBoolean,
  bossStartingEnergyFraction: isFiniteNumber,
  weather: isWeatherCondition,
  showDetailedAssumptions: isBoolean,
};

/**
 * The result of a defensive decode: `scenario` is always the best-effort
 * result (never a lie about what actually decoded — a rejected field is
 * simply absent from it, exactly like an older link that never had that
 * field), and `rejectedFields` names anything that HAD to be dropped because
 * its value didn't match — see scenarioValidation.ts's `SanitizeResult` doc
 * comment for the full "absent vs. rejected" distinction. Returned instead
 * of a bare `Scenario` specifically so a caller can't accidentally treat a
 * half-restored scenario as if it were a clean one (CLAUDE.md's "the tool
 * confidently asserting something untrue" failure mode) — `decodeScenario`
 * below is the convenience wrapper for a caller that doesn't care.
 */
export interface ScenarioDecodeResult {
  scenario: Scenario;
  rejectedFields: string[];
}

/**
 * Defensive decode: never throws. Returns `null` only when the payload is
 * ENTIRELY unusable — invalid base64, base64 that doesn't decode to valid
 * JSON, or JSON whose top-level value isn't even an object (an array,
 * string, number, `null`, ...) — see scenarioValidation.ts's
 * `tryParseJsonObject`. Anything short of that (a plain object, however
 * sparse or however many of its fields are the wrong shape) decodes to a
 * real, non-null result: every recognized field that fails its validator
 * (`SCENARIO_FIELD_VALIDATORS`) is dropped rather than kept with the wrong
 * shape, exactly like a field this build's `Scenario` doesn't declare at
 * all — the same "older link predates this field" degrade this package has
 * always relied on for a genuinely missing key, just applied per-field to a
 * present-but-invalid one too. Unrecognized keys (e.g. `packages/web`'s
 * `ComparatorScenario.candidateShadow` riding the same blob) are preserved
 * untouched, never reported as rejected.
 */
export function decodeScenarioWithDiagnostics(encoded: string): ScenarioDecodeResult | null {
  const payload = tryParseJsonObject(fromBase64Url, encoded);
  if (payload === null) return null;
  const { result, rejectedFields } = sanitizeKnownFields<Scenario>(payload, SCENARIO_FIELD_VALIDATORS);
  return { scenario: result as unknown as Scenario, rejectedFields };
}

/**
 * Convenience wrapper over `decodeScenarioWithDiagnostics` for a caller that
 * only wants the (possibly partial, never throwing) `Scenario` and doesn't
 * need to know WHICH fields, if any, were rejected. Prefer
 * `decodeScenarioWithDiagnostics` for any UI that should tell the user "this
 * link had settings we couldn't read" rather than silently presenting a
 * partially-restored scenario as fully restored.
 */
export function decodeScenario(encoded: string): Scenario | null {
  return decodeScenarioWithDiagnostics(encoded)?.scenario ?? null;
}

const SCENARIO_QUERY_PARAM = "s";

export function buildScenarioUrl(baseUrl: string, scenario: Scenario): string {
  const url = new URL(baseUrl);
  url.searchParams.set(SCENARIO_QUERY_PARAM, encodeScenario(scenario));
  return url.toString();
}

/**
 * `null` covers BOTH "no `s` query param at all" and "an `s` param present
 * but entirely unusable" (see `decodeScenarioWithDiagnostics`) — a caller
 * already treats those two identically today (fall back to defaults), so
 * collapsing them here is not a loss of information a caller needs. Use
 * `parseScenarioFromUrlWithDiagnostics` instead when the caller DOES want to
 * distinguish "nothing shared" from "something shared but unreadable," or
 * wants to know which individual fields (if any) were rejected out of an
 * otherwise-readable payload.
 */
export function parseScenarioFromUrl(url: string): Scenario | null {
  const encoded = new URL(url).searchParams.get(SCENARIO_QUERY_PARAM);
  return encoded ? decodeScenario(encoded) : null;
}

/** See `parseScenarioFromUrl`'s doc comment for when to prefer this over it. */
export function parseScenarioFromUrlWithDiagnostics(url: string): ScenarioDecodeResult | null {
  const encoded = new URL(url).searchParams.get(SCENARIO_QUERY_PARAM);
  return encoded ? decodeScenarioWithDiagnostics(encoded) : null;
}
