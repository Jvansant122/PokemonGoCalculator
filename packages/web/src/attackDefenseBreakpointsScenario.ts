import { fromBase64Url, toBase64Url, type WeatherCondition } from "@pogo-analyzer/engine";

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
}

export function encodeAttackDefenseBreakpointsScenario(scenario: AttackDefenseBreakpointsScenario): string {
  const json = JSON.stringify(scenario);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeAttackDefenseBreakpointsScenario(encoded: string): AttackDefenseBreakpointsScenario {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  return JSON.parse(json) as AttackDefenseBreakpointsScenario;
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
