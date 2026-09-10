import type { DodgeBehavior } from "./breakpoints.js";
import type { MegaLevel } from "./megaLevel.js";
import { fromBase64Url, toBase64Url } from "./scenario.js";
import type { IVSpread } from "./types.js";
import type { WeatherCondition } from "./weather.js";

/**
 * The complete, shareable description of one Team Raid Simulator run — the
 * sibling of scenario.ts's `Scenario`, not an extension of it.
 * `Scenario.candidates`/`candidateFastMoveIds`/`candidateChargedMoveIds` are
 * hard 2-tuples by type; a 6-slot ordered roster (with a per-slot `isMega`
 * flag that has no 2-candidate equivalent at all) needs a genuinely
 * different shape, so this is a new, separate type rather than a forced
 * migration of the existing one (per
 * .claude/agent-memory/pogo-researcher/proposal_sequential_team_raid_tab.md
 * section 6). Every user-facing assumption this feature introduces must
 * round-trip through here — a setting that works live but silently reverts
 * to a default on a shared link is a real, recurring bug class in this
 * project.
 *
 * There is deliberately no user-selectable "combat phase" here either, same
 * standing decision as `Scenario` — whether the boss has thrown a charged
 * move yet is a computed fact, not a mode to pick.
 */
export interface TeamScenario {
  /**
   * Exactly MAX_TEAM_RAID_SLOTS (6) entries, in fight order — pad unused
   * trailing/interior slots with speciesId: null rather than a shorter
   * array, so a slot's position in this array always means the same fight
   * position regardless of how many are actually filled.
   */
  slots: TeamScenarioSlot[];
  target: string;
  /** Boss fast-move selection. null means "use the boss's first fast move". */
  bossFastMoveId: string | null;
  /** Boss charged-move selection. null means "use the boss's first charged move". */
  bossChargedMoveId: string | null;
  level: number;
  ivs: IVSpread;
  /** Governs dodging the boss's CHARGED attacks only — one shared assumption for the whole roster. */
  dodgeModel: DodgeBehavior;
  /** Whether the roster also attempts to dodge the boss's fast attacks. */
  dodgeFastAttacks: boolean;
  /** Hold the charged move for a safer moment instead of firing immediately — applies to every slot identically. */
  holdChargedMoveUntilSafe: boolean;
  /**
   * The active weather condition, applied per-move to both the active
   * slot's and the boss's damage output independently — see weather.ts's
   * isWeatherBoosted.
   */
  weather: WeatherCondition;
  /** Mean seconds between the boss's charged moves once it starts using them. */
  bossChargedMoveFrequencySeconds: number;
  /** Whether the boss starts the fight already partway charged (see bossStartingEnergyFraction). Only affects slot 1's charged-move warmup — every later slot's warmup is always the previous slot's carried-forward residual cooldown. */
  bossStartsPrimed: boolean;
  /** Fraction (0-1) of the boss's first charged move's energy cost it starts with, when bossStartsPrimed is true. */
  bossStartingEnergyFraction: number;
  /**
   * Real-world raid countdown for whichever tier the boss belongs to: 180s
   * for Tier 1/3, 300s for Mega/Legendary/Primal raids (community-consensus
   * real numbers — see the design doc's Sources section).
   */
  raidTimerSeconds: number;
  /**
   * Seconds of raid clock a forced post-faint swap-in costs. No real fixed
   * value is documented for this in-game, so this type declares no default of
   * its own. packages/web's Team Raid Simulator seeds it at 0.5s, behind that
   * tab's "More detailed assumptions" checkbox — an explicit,
   * honestly-uncertain user-adjustable knob rather than a silently fabricated
   * "realistic" default.
   */
  swapCostSeconds: number;
  /**
   * Seconds of raid clock a full-roster wipe-and-rejoin costs — paid once
   * every time every fielded slot has fainted, before restarting from the
   * first fielded slot (see teamRaid.ts's runTeamRaid and its
   * MAX_TEAM_RAID_CYCLES safety cap). Per
   * proposal_sequential_team_raid_tab.md Section 9: a full team wipe is NOT
   * a loss condition in the real game — the trainer heals via Bag items
   * (v1 assumes unlimited healing items) and rejoins the SAME raid attempt,
   * so this cost is real but distinct from swapCostSeconds (which is paid
   * per individual mid-roster faint, no lobby return involved). No official
   * fixed value exists, so this type declares no default of its own, the same
   * honesty precedent as swapCostSeconds. A community-sourced ~12-15s
   * estimate exists (Pokémon GO Hub, "Tips for short-manning raids");
   * packages/web seeds this at 15s — the top of that range, chosen to allow
   * for user error — behind the same "More detailed assumptions" checkbox.
   * That figure must not be hardcoded here as a confirmed constant.
   */
  reviveCostSeconds: number;
}

export interface TeamScenarioSlot {
  /** null means this slot is empty and never enters the fight. */
  speciesId: string | null;
  /** null means "use that species' first fast move". */
  fastMoveId: string | null;
  /** null means "use that species' first charged move". */
  chargedMoveId: string | null;
  /**
   * Whether this slot is THE one Mega/Primal-evolved Pokémon for the whole
   * encounter — at most one slot across the roster may set this true (see
   * teamRaid.ts's runTeamRaid, which validates and throws on a violation
   * rather than silently ignoring it).
   */
  isMega: boolean;
  /**
   * This slot's own Mega Level (see megaLevel.ts) — `null` means no Mega
   * Level effect (identical to `"base"`). Orthogonal to `isMega` above; see
   * teamRaid.ts's TeamRaidSlotInput.megaLevel for the full contract this
   * mirrors (same gate: silently inert for a slot whose species has no
   * `.boost` at all).
   */
  megaLevel: MegaLevel | null;
}

/**
 * Encodes a team scenario into a URL-safe string (base64url JSON), mirroring
 * scenario.ts's encodeScenario exactly — same base64url-JSON transport, same
 * round-trip discipline, just a different shape underneath.
 */
export function encodeTeamScenario(scenario: TeamScenario): string {
  const json = JSON.stringify(scenario);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeTeamScenario(encoded: string): TeamScenario {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  return JSON.parse(json) as TeamScenario;
}

/**
 * A separate query param from Scenario's "s" — a shared link needs to be
 * able to identify which tab it's for. Which param a given UI actually uses
 * (and whether both could ever coexist on one URL) is a web-developer
 * routing decision; this is just the engine-owned default.
 */
const TEAM_SCENARIO_QUERY_PARAM = "ts";

export function buildTeamScenarioUrl(baseUrl: string, scenario: TeamScenario): string {
  const url = new URL(baseUrl);
  url.searchParams.set(TEAM_SCENARIO_QUERY_PARAM, encodeTeamScenario(scenario));
  return url.toString();
}

export function parseTeamScenarioFromUrl(url: string): TeamScenario | null {
  const encoded = new URL(url).searchParams.get(TEAM_SCENARIO_QUERY_PARAM);
  return encoded ? decodeTeamScenario(encoded) : null;
}
