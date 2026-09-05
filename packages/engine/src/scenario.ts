import type { DodgeBehavior } from "./breakpoints.js";
import type { IVSpread } from "./types.js";

export type CombatPhase = "opening-burst" | "sustained";

/**
 * A scenario is the complete, shareable description of one comparison: which
 * candidates, against what, at what level/IVs, under what dodge/phase
 * assumptions, feeding how large and fast a party. Every field here is one of
 * the assumptions Phase 4's panel must always show alongside any conclusion.
 */
export interface Scenario {
  candidates: string[];
  target: string;
  level: number;
  ivs: IVSpread;
  dodgeModel: DodgeBehavior;
  partySize: number;
  teammateDps: number;
  /** Whether the party's attacking type matches the lead candidate's boost type — see convertUptimeToTeamDamage. */
  teammateTypeMatches: boolean;
  phase: CombatPhase;
  /** Mean seconds between the boss's charged moves once the sustained phase begins. */
  bossChargedMoveFrequencySeconds: number;
  /** Whether the boss starts the fight already partway charged (see bossStartingEnergyFraction). */
  bossStartsPrimed: boolean;
  /** Fraction (0-1) of the boss's first charged move's energy cost it starts with, when bossStartsPrimed is true. */
  bossStartingEnergyFraction: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): Uint8Array {
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

export function decodeScenario(encoded: string): Scenario {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  return JSON.parse(json) as Scenario;
}

const SCENARIO_QUERY_PARAM = "s";

export function buildScenarioUrl(baseUrl: string, scenario: Scenario): string {
  const url = new URL(baseUrl);
  url.searchParams.set(SCENARIO_QUERY_PARAM, encodeScenario(scenario));
  return url.toString();
}

export function parseScenarioFromUrl(url: string): Scenario | null {
  const encoded = new URL(url).searchParams.get(SCENARIO_QUERY_PARAM);
  return encoded ? decodeScenario(encoded) : null;
}
