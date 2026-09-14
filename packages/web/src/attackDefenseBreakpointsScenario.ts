import {
  fromBase64Url,
  isBoolean,
  isMegaLevel,
  isString,
  isStringOrNull,
  isWeatherCondition,
  orNull,
  sanitizeKnownFields,
  toBase64Url,
  tryParseJsonObject,
  type FieldValidators,
  type FriendshipLevel,
  type MegaLevel,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import { isFriendshipLevel, isLiteralUnion } from "./webScenarioValidation.js";

/** Which half of the tab is currently rendering — see AttackDefenseBreakpointsView.tsx's own doc comment. */
export type AttackDefenseBreakpointsMode = "attack" | "defense";

/**
 * The complete, shareable description of one "Attack/Defense Breakpoints" run
 * — a sibling of scenario.ts's `Scenario`, teamScenario.ts's `TeamScenario`,
 * speciesReportScenario.ts's `SpeciesReportScenario`, and
 * ivBreakpointsScenario.ts's `IvBreakpointsScenario`, not an extension of any
 * of them. Like those last two, this type (and its codec below) lives in
 * packages/web rather than packages/engine — web-developer never edits
 * packages/engine, and the engine's already-shipped attackDamageGrid/
 * defenseDamageGrid (breakpoints.ts) correctly have no URL-sharing concern
 * baked into them.
 *
 * No dodge field, deliberately: this tab renders raw single-hit damage
 * tables (one IV x one level = one fixed damage number), not a time-based
 * survival/fight simulation. Dodge behavior only has meaning as "a fraction
 * of hits over time that land at reduced damage" — there is no "over time"
 * quantity anywhere in a static per-hit grid for it to reduce. If this tab
 * ever grows a time-to-faint-style extension, dodge would need to be added
 * back in at that point (see IvBreakpointsScenario.dodgeModel for the
 * pattern to copy), but it's out of scope for the plain damage tables this
 * tab renders today. Documented again in the view's own caveats section so
 * this isn't a silent omission.
 */
export interface AttackDefenseBreakpointsScenario {
  speciesId: string;
  /** null = use this species' first fast move. Only consumed in Attack mode. */
  fastMoveId: string | null;
  /** null = use this species' first charged move. Only consumed in Attack mode. */
  chargedMoveId: string | null;
  /** The boss/target species this species' own damage output (Attack mode) or incoming damage (Defense mode) is checked against. */
  targetId: string;
  /** null = use the target's first fast move. Only consumed in Defense mode. */
  bossFastMoveId: string | null;
  /**
   * null = use the target's first charged move. New field — no existing
   * scenario tracks a boss's charged move id (IvBreakpointsScenario's
   * timeToFaint model has no charged-move combat at all to need one). Only
   * consumed in Defense mode.
   */
  bossChargedMoveId: string | null;
  /** Active weather, applied per-move to whichever side's move is being evaluated — see weather.ts. */
  weather: WeatherCondition;
  /** Attack Breakpoints (this species' own output) vs Defense Breakpoints (damage this species takes) — must round-trip like any other user-facing setting. */
  mode: AttackDefenseBreakpointsMode;
  /**
   * The species' own Mega Level (see megaLevelSelect.tsx /
   * packages/engine/src/megaLevel.ts) — applied in BOTH modes (shifts the
   * swept Attack-stat lookup in Attack mode, the swept Defense-stat lookup
   * in Defense mode; see breakpoints.ts's attackDamageGrid/defenseDamageGrid
   * own megaLevel doc comments). Optional so a link shared before this field
   * existed decodes via `??` rather than surfacing `undefined`. `null`/
   * undefined mean no Mega Level investment assumed (identical to `"base"`);
   * silently has no effect for a species with no mega/primal `boost`
   * mechanic at all.
   */
  megaLevel?: MegaLevel | null;
  /**
   * "Treat this species as Shadow" — applies shadow.ts's
   * SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER to its raw base stats
   * in BOTH modes (Attack mode uses the adjusted baseAttack, Defense mode
   * uses the adjusted baseDefense — same toggle, same species, just a
   * different one of the two adjusted numbers consumed). Mutually exclusive
   * with a mega/primal boost — forced back to false whenever the selected
   * species carries a `boost`, see AttackDefenseBreakpointsView's
   * normalizeAssumptions.
   */
  isShadow: boolean;
  /**
   * The species' own friendship tier (see FriendshipSelect.tsx /
   * packages/engine/src/damage.ts's FRIENDSHIP_ATTACK_BONUS_MULTIPLIER) —
   * consumed ONLY by the Attack-mode grids (this species' own outgoing
   * damage). Deliberately does NOT reach the Defense-mode grids: a
   * co-participating friend boosts only the attacker whose friendship tier
   * this is, and in Defense mode the "attacker" is the BOSS, whose damage
   * this engine never scales by the player's own friendship (see
   * AttackDefenseBreakpointsView's "Known caveats" section). Measured
   * 2026-09-12 (engine-developer's measurement_friendship_bonus_breakpoint_impact.md):
   * this tab's cells are exact floored values, and friendship moves at least
   * one breakpoint in 32-100% of tested matchups even at the weakest real
   * tier (Good Friend) — a real control, not a cosmetic one. Optional so a
   * link shared before this field existed decodes via `??` rather than
   * surfacing `undefined`. Defaults to `"none"`, matching today's implicit
   * (no bonus) behavior.
   */
  friendshipLevel?: FriendshipLevel;
}

function encodeAttackDefenseBreakpointsScenario(scenario: AttackDefenseBreakpointsScenario): string {
  const json = JSON.stringify(scenario);
  return toBase64Url(new TextEncoder().encode(json));
}

const isAttackDefenseBreakpointsMode = isLiteralUnion<AttackDefenseBreakpointsMode>(["attack", "defense"]);

/** See scenario.ts's `SCENARIO_FIELD_VALIDATORS` — same per-field validator table convention, for this tab's own scenario shape. */
const ATTACK_DEFENSE_BREAKPOINTS_SCENARIO_FIELD_VALIDATORS: FieldValidators<AttackDefenseBreakpointsScenario> = {
  speciesId: isString,
  fastMoveId: isStringOrNull,
  chargedMoveId: isStringOrNull,
  targetId: isString,
  bossFastMoveId: isStringOrNull,
  bossChargedMoveId: isStringOrNull,
  weather: isWeatherCondition,
  mode: isAttackDefenseBreakpointsMode,
  megaLevel: orNull(isMegaLevel),
  isShadow: isBoolean,
  friendshipLevel: isFriendshipLevel,
};

/** See scenario.ts's `ScenarioDecodeResult` — identical shape and rationale, just for `AttackDefenseBreakpointsScenario`. */
export interface AttackDefenseBreakpointsScenarioDecodeResult {
  scenario: AttackDefenseBreakpointsScenario;
  rejectedFields: string[];
}

/** Defensive decode: never throws. See scenario.ts's `decodeScenarioWithDiagnostics` for the full contract this mirrors. */
export function decodeAttackDefenseBreakpointsScenarioWithDiagnostics(
  encoded: string,
): AttackDefenseBreakpointsScenarioDecodeResult | null {
  const payload = tryParseJsonObject(fromBase64Url, encoded);
  if (payload === null) return null;
  const { result, rejectedFields } = sanitizeKnownFields<AttackDefenseBreakpointsScenario>(
    payload,
    ATTACK_DEFENSE_BREAKPOINTS_SCENARIO_FIELD_VALIDATORS,
  );
  return { scenario: result as unknown as AttackDefenseBreakpointsScenario, rejectedFields };
}

function decodeAttackDefenseBreakpointsScenario(encoded: string): AttackDefenseBreakpointsScenario | null {
  return decodeAttackDefenseBreakpointsScenarioWithDiagnostics(encoded)?.scenario ?? null;
}

/**
 * A separate query param from Scenario's "s", TeamScenario's "ts",
 * SpeciesReportScenario's "sr", and IvBreakpointsScenario's "ivc" — see
 * App.tsx's tab-switcher, which stamps a matching `view=` param onto every
 * generated share link.
 */
const ATTACK_DEFENSE_BREAKPOINTS_SCENARIO_QUERY_PARAM = "adb";

export function buildAttackDefenseBreakpointsScenarioUrl(baseUrl: string, scenario: AttackDefenseBreakpointsScenario): string {
  const url = new URL(baseUrl);
  url.searchParams.set(ATTACK_DEFENSE_BREAKPOINTS_SCENARIO_QUERY_PARAM, encodeAttackDefenseBreakpointsScenario(scenario));
  return url.toString();
}

export function parseAttackDefenseBreakpointsScenarioFromUrl(url: string): AttackDefenseBreakpointsScenario | null {
  const encoded = new URL(url).searchParams.get(ATTACK_DEFENSE_BREAKPOINTS_SCENARIO_QUERY_PARAM);
  return encoded ? decodeAttackDefenseBreakpointsScenario(encoded) : null;
}
