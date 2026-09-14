import {
  fromBase64Url,
  isBoolean,
  isDodgeBehavior,
  isIVSpread,
  isMegaLevel,
  isString,
  isStringOrNull,
  isWeatherCondition,
  orNull,
  sanitizeKnownFields,
  toBase64Url,
  tryParseJsonObject,
  type DodgeBehavior,
  type FieldValidators,
  type FriendshipLevel,
  type IVSpread,
  type MegaLevel,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import { isFriendshipLevel } from "./webScenarioValidation.js";

/**
 * The complete, shareable description of one "IV Breakpoints" run — a sibling
 * of scenario.ts's `Scenario`, teamScenario.ts's `TeamScenario`, and
 * speciesReportScenario.ts's `SpeciesReportScenario`, not an extension of any
 * of them. Genuinely different shape: ONE species/moveset, TWO IV spreads of
 * that same species (not two candidates), and one boss target — the
 * IV/level-investment analogue of this project's "where does the ranking
 * flip" thesis (see packages/engine/src/ivComparison.ts's own doc comment).
 *
 * Like SpeciesReportScenario, this type (and its codec below) lives in
 * packages/web rather than packages/engine, since web-developer never edits
 * packages/engine and the engine's already-shipped ivComparison.ts correctly
 * has no URL-sharing concern baked into it. Reuses the engine's own
 * toBase64Url/fromBase64Url transport rather than forking a fourth copy of it.
 */
export interface IvBreakpointsScenario {
  speciesId: string;
  /** null = use this species' first fast move. */
  fastMoveId: string | null;
  /** null = use this species' first charged move. */
  chargedMoveId: string | null;
  /** "Spread A" — attack/defense/stamina IVs, 0-15 each. */
  ivA: IVSpread;
  /** "Spread B" — the IV spread being compared against Spread A. */
  ivB: IVSpread;
  /** The boss/target species this comparison is run against. */
  targetId: string;
  /** null = use the target's first fast move. Only the target's FAST move matters here — this simplified per-level model has no charged-move combat at all, see ivComparison.ts's timeToFaint. */
  bossFastMoveId: string | null;
  /** Governs dodging the target's incoming (fast-move) attacks. */
  dodgeModel: DodgeBehavior;
  /** Active weather, applied per-move to both sides — see weather.ts. */
  weather: WeatherCondition;
  /**
   * The species' own Mega Level (see megaLevelSelect.tsx /
   * packages/engine/src/megaLevel.ts) — applied identically to BOTH IV
   * spreads (same species/moveset, differing only in IVs — see
   * ivComparison.ts's compareIvSpreads own megaLevel doc comment). Optional
   * so a link shared before this field existed decodes via `??` rather than
   * surfacing `undefined`. `null`/undefined mean no Mega Level investment
   * assumed (identical to `"base"`); silently has no effect for a species
   * with no mega/primal `boost` mechanic at all.
   */
  megaLevel?: MegaLevel | null;
  /**
   * "Treat this species as Shadow" — applies shadow.ts's
   * SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER to its raw base stats
   * for BOTH spreads (this tab compares two IV spreads of the SAME
   * species/moveset, so there is only one Shadow toggle, not one per
   * spread). Mutually exclusive with a mega/primal boost — forced back to
   * false whenever the selected species carries a `boost`, see
   * IvBreakpointsView's normalizeAssumptions.
   */
  isShadow: boolean;
  /**
   * The species' own friendship tier (see FriendshipSelect.tsx /
   * packages/engine/src/damage.ts's FRIENDSHIP_ATTACK_BONUS_MULTIPLIER) —
   * applied to BOTH spreads' fast/charged OUTGOING damage only (same species/
   * moveset, differing only in IVs), never to the target's incoming fast
   * move (see IvBreakpointsView.tsx's own note on why `incomingDamageModifiers`
   * must not read this). Measured 2026-09-12 (engine-developer's
   * measurement_friendship_bonus_breakpoint_impact.md): this tab's per-level
   * damage cells are exact floored values, and friendship moves at least one
   * breakpoint in 32-100% of tested matchups even at the weakest real tier
   * (Good Friend) — a real control, not a cosmetic one. Optional so a link
   * shared before this field existed decodes via `??` rather than surfacing
   * `undefined` into the friendship `<select>`. Defaults to `"none"`,
   * matching today's implicit (no bonus) behavior.
   */
  friendshipLevel?: FriendshipLevel;
}

function encodeIvBreakpointsScenario(scenario: IvBreakpointsScenario): string {
  const json = JSON.stringify(scenario);
  return toBase64Url(new TextEncoder().encode(json));
}

/** See scenario.ts's `SCENARIO_FIELD_VALIDATORS` — same per-field validator table convention, for this tab's own scenario shape. */
const IV_BREAKPOINTS_SCENARIO_FIELD_VALIDATORS: FieldValidators<IvBreakpointsScenario> = {
  speciesId: isString,
  fastMoveId: isStringOrNull,
  chargedMoveId: isStringOrNull,
  ivA: isIVSpread,
  ivB: isIVSpread,
  targetId: isString,
  bossFastMoveId: isStringOrNull,
  dodgeModel: isDodgeBehavior,
  weather: isWeatherCondition,
  megaLevel: orNull(isMegaLevel),
  isShadow: isBoolean,
  friendshipLevel: isFriendshipLevel,
};

/** See scenario.ts's `ScenarioDecodeResult` — identical shape and rationale, just for `IvBreakpointsScenario`. */
export interface IvBreakpointsScenarioDecodeResult {
  scenario: IvBreakpointsScenario;
  rejectedFields: string[];
}

/** Defensive decode: never throws. See scenario.ts's `decodeScenarioWithDiagnostics` for the full contract this mirrors. */
export function decodeIvBreakpointsScenarioWithDiagnostics(encoded: string): IvBreakpointsScenarioDecodeResult | null {
  const payload = tryParseJsonObject(fromBase64Url, encoded);
  if (payload === null) return null;
  const { result, rejectedFields } = sanitizeKnownFields<IvBreakpointsScenario>(
    payload,
    IV_BREAKPOINTS_SCENARIO_FIELD_VALIDATORS,
  );
  return { scenario: result as unknown as IvBreakpointsScenario, rejectedFields };
}

function decodeIvBreakpointsScenario(encoded: string): IvBreakpointsScenario | null {
  return decodeIvBreakpointsScenarioWithDiagnostics(encoded)?.scenario ?? null;
}

/**
 * A separate query param from Scenario's "s", TeamScenario's "ts", and
 * SpeciesReportScenario's "sr" — see App.tsx's tab-switcher, which stamps a
 * matching `view=` param onto every generated share link.
 */
const IV_BREAKPOINTS_SCENARIO_QUERY_PARAM = "ivc";

export function buildIvBreakpointsScenarioUrl(baseUrl: string, scenario: IvBreakpointsScenario): string {
  const url = new URL(baseUrl);
  url.searchParams.set(IV_BREAKPOINTS_SCENARIO_QUERY_PARAM, encodeIvBreakpointsScenario(scenario));
  return url.toString();
}

export function parseIvBreakpointsScenarioFromUrl(url: string): IvBreakpointsScenario | null {
  const encoded = new URL(url).searchParams.get(IV_BREAKPOINTS_SCENARIO_QUERY_PARAM);
  return encoded ? decodeIvBreakpointsScenario(encoded) : null;
}
