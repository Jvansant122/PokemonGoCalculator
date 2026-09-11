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
  /** Shared roster-wide default — see TeamScenarioSlot.level for the per-slot override that takes priority over this when present. */
  level: number;
  /** Shared roster-wide default — see TeamScenarioSlot.ivs for the per-slot override that takes priority over this when present. */
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
   * Seconds of raid clock a forced post-faint swap-in costs. A real,
   * first-party value now exists — `BATTLE_SETTINGS.swapDurationMs = 1000`
   * (see teamRaid.ts's `DEFAULT_SWAP_COST_SECONDS` and MECHANICS.md's
   * "Swapping Pokémon costs a real, first-party 1.0s") — but this FIELD
   * remains required with no default of its own (a `TeamScenario` is always
   * fully decoded from an explicit value; only `runTeamRaid`'s own optional
   * `TeamRaidInputs.swapCostSeconds` has a default). Which literal
   * `packages/web` seeds a NEW, never-before-configured Team Raid scenario
   * with is that package's own call — as of 2026-09-10 that number should be
   * `DEFAULT_SWAP_COST_SECONDS` (1.0), not the previous 0.5s placeholder.
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
  /**
   * Whether the UI's "more detailed assumptions" panel is expanded — folded
   * onto this type 2026-09-10 so the Team Raid tab works the same way as the
   * Comparator's own `Scenario.showDetailedAssumptions`, instead of Team
   * Raid growing a second, `packages/web`-only bolt-on shape for an
   * identical concept (see `TeamScenarioWithShadow`'s previous local
   * `showDetailedAssumptions?: boolean` field in `TeamRaidView.tsx`, which
   * this replaces — that file's own comment flagged folding it into the
   * engine as this agent's call).
   *
   * REQUIRED, not optional, matching `Scenario`'s established convention for
   * every late-added field even though `decodeTeamScenario` does zero
   * runtime validation — see scenario.ts's `showDetailedAssumptions` for the
   * precedent this mirrors.
   *
   * Defaults to a single plain `false` on both directions of the round trip
   * (`packages/web`'s own `DEFAULT_TEAM_ASSUMPTIONS.showDetailedAssumptions`
   * was already `false`, so this is byte-identical to today's behavior) —
   * deliberately NOT the inverted "absent decodes true" pattern the
   * Comparator's sibling field used, per CLAUDE.md's 2026-09-10 standing
   * decision that backward compatibility with old share links is no longer
   * required and that pattern should not be reintroduced. There was never a
   * previously-shipped Team Raid share link with this field on the ENGINE
   * type at all (it only ever existed as web's own bolt-on), so there is no
   * history to preserve either way.
   */
  showDetailedAssumptions: boolean;
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
  /**
   * Per-slot override for TeamScenario.level — this slot fights at ITS OWN
   * level instead of the roster-wide shared one. `undefined`/omitted means
   * "use the shared TeamScenario.level" (today's behavior, byte-identical) —
   * NOT a default number of its own. Mirrors teamRaid.ts's
   * TeamRaidSlotInput.level exactly; that field already exists and is
   * already consumed by runTeamRaid (built for the Power-Up Optimizer's
   * mixed-level rosters), so this only closes the gap in the ROUND-TRIPPABLE
   * scenario shape, not in the simulator itself.
   *
   * Independent of `ivs` below by design: a slot can override its level
   * while still inheriting the shared IV spread, or vice versa. This exactly
   * matches TeamRaidSlotInput's own independence (`level`/`ivs` are two
   * separate optional fields there too, each with its own fallback) — a
   * paired-only override would be a strictly weaker restriction invented at
   * this layer for no mechanical reason, and would force a caller who only
   * wants to correct e.g. a hand-copied level to also restate perfect IVs it
   * may not actually know.
   */
  level?: number;
  /**
   * Per-slot override for TeamScenario.ivs — see `level` above for the same
   * fallback convention, motivation, and independence rationale. Mirrors
   * teamRaid.ts's TeamRaidSlotInput.ivs exactly.
   */
  ivs?: IVSpread;
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
