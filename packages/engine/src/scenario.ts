import type { DodgeBehavior } from "./breakpoints.js";
import type { IVSpread } from "./types.js";

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
