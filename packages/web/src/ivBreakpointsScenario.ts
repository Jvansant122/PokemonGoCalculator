import { fromBase64Url, toBase64Url, type DodgeBehavior, type IVSpread, type MegaLevel, type WeatherCondition } from "@pogo-analyzer/engine";

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
}

export function encodeIvBreakpointsScenario(scenario: IvBreakpointsScenario): string {
  const json = JSON.stringify(scenario);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeIvBreakpointsScenario(encoded: string): IvBreakpointsScenario {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  return JSON.parse(json) as IvBreakpointsScenario;
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
