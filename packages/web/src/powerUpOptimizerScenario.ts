import {
  fromBase64Url,
  toBase64Url,
  type DodgeBehavior,
  type IVSpread,
  type MegaLevel,
  type RosterSignificanceMode,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import type { BossChargedMoveCadence } from "./bossCadence.js";

/**
 * Which resource column the ranked candidate table is sorted by — a
 * display-only choice (never changes what optimizePowerUps computes, only
 * how the rows are ordered), same "still a real setting, still shareable"
 * reasoning as SpeciesReportScenario's own sortMode.
 */
export type PowerUpRankBy = "stardust" | "candy" | "xlCandy";

/**
 * Which of the tab's two computations this scenario drives — see
 * PLAN_multi_raid_roster_optimizer.md §4.1. "single-raid" is the ORIGINAL
 * behavior and must decode byte-for-byte unchanged for a pre-existing share
 * link (see decodePowerUpOptimizerScenario's own `mode ?? "single-raid"`
 * fallback in PowerUpOptimizerView.tsx's scenarioToAssumptions). "multi-raid"
 * ranks power-ups across a whole imported roster (rosterPool.ts, kept OUT of
 * this scenario — see §3.2) against a SET of raid bosses (see
 * multiRaidBossIds below) instead of one 6-slot roster vs. one boss.
 */
export type PowerUpOptimizerMode = "single-raid" | "multi-raid";

/** One roster slot's own configuration — mirrors PowerUpSlotAssumption exactly, field for field. */
export interface PowerUpScenarioSlot {
  speciesId: string | null;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  isMega: boolean;
  /**
   * This slot's own Mega Level (see megaLevelSelect.tsx / packages/engine/src/megaLevel.ts)
   * — mirrors PowerUpSlotAssumption.megaLevel exactly, single-raid mode
   * only. `null` means no Mega Level investment assumed (identical to
   * `"base"`).
   */
  megaLevel: MegaLevel | null;
  isShadow: boolean;
  isPurified: boolean;
  isLucky: boolean;
  level: number;
  ivs: IVSpread;
  candyOnHand: number;
  xlCandyOnHand: number;
}

/**
 * The complete, shareable description of one Power-Up Optimizer run — a
 * sibling of scenario.ts's `Scenario`/teamScenario.ts's `TeamScenario`/
 * speciesReportScenario.ts's `SpeciesReportScenario`, not an extension of any
 * of them (this tab's own 6-slot-roster-plus-resources shape doesn't match
 * any existing one). Lives in packages/web (like SpeciesReportScenario), not
 * packages/engine — web-developer does not edit packages/engine, and the
 * base64url-JSON transport (toBase64Url/fromBase64Url) is reused directly
 * from the engine's own scenario.ts export rather than forked again.
 */
export interface PowerUpOptimizerScenario {
  /**
   * Which computation this scenario drives — see PowerUpOptimizerMode.
   * Optional so a link built before multi-raid mode existed decodes as
   * "single-raid" via `s.mode ?? "single-raid"` (PowerUpOptimizerView.tsx's
   * scenarioToAssumptions) rather than surfacing `undefined` — the ORIGINAL
   * single-raid behavior must stay byte-for-byte unchanged for such a link.
   */
  mode?: PowerUpOptimizerMode;
  /** Always exactly MAX_TEAM_RAID_SLOTS entries, in fight order — pad with empty slots rather than shortening the array, same convention as TeamScenario.slots. Only used in "single-raid" mode. */
  slots: PowerUpScenarioSlot[];
  stardustOnHand: number;
  /**
   * A shared, fungible Rare Candy pool (account-wide, not per-species) —
   * consumed only by the fixed-budget planner (planPowerUpBudget), which
   * spends a slot's own candyOnHand first and only draws on this pool once
   * that runs out. Rare Candy converts 1:1 into any species' regular Candy
   * and can NEVER become XL Candy (see powerUp.ts's RARE_CANDY_TO_CANDY_RATIO
   * and MECHANICS.md's "Fungible candy currencies" entry). Optional so a link
   * shared before this field existed decodes via `??` rather than surfacing
   * `undefined`.
   */
  rareCandyOnHand?: number;
  /** Same shared-pool mechanic as rareCandyOnHand, but for the wholly separate Rare Candy XL item (1:1 into XL Candy only — see RARE_CANDY_XL_TO_XL_CANDY_RATIO). Optional for the same old-link reason. */
  rareCandyXlOnHand?: number;
  /** Single-raid mode only. */
  target: string;
  /** Single-raid mode only. */
  bossFastMoveId: string | null;
  /** Single-raid mode only. */
  bossChargedMoveId: string | null;
  /** Shared by both modes. */
  dodgeModel: DodgeBehavior;
  dodgeFastAttacks: boolean;
  holdChargedMoveUntilSafe: boolean;
  weather: WeatherCondition;
  bossChargedMoveFrequencySeconds: number;
  /** See bossCadence.tsx's BOSS_CADENCE_HINT. Optional so a link shared before this field existed decodes via `??` rather than surfacing `undefined`. */
  bossChargedMoveCadence?: BossChargedMoveCadence;
  /** Single-raid mode only — RosterPlannerInputs (multi-raid) has no equivalent "boss starts primed" field. */
  bossStartsPrimed: boolean;
  /** Single-raid mode only. */
  bossStartingEnergyFraction: number;
  /** Shared by both modes. */
  raidTimerSeconds: number;
  swapCostSeconds: number;
  reviveCostSeconds: number;
  /** Which resource column the ranked table is sorted by — see PowerUpRankBy. Single-raid mode only (the multi-raid ranked table has no equivalent rank-by control this phase — see PLAN §5 Phase 3's deliberately basic results UI). */
  rankBy: PowerUpRankBy;
  /**
   * The RESOLVED, authoritative boss id list for multi-raid mode — see
   * multiRaidBossSet.ts's own doc comment and PLAN §3.1. NEVER re-derived
   * from `multiRaidIncludePastRaids`/`multiRaidIncludedTiers`/
   * `multiRaidMaxBossCount` below on load; those three exist ONLY to restore
   * the filter UI's display state, and this array is what the sweep actually
   * runs against. Optional/defaults to `[]` so a pre-multi-raid link decodes
   * cleanly (that link's `mode` is also absent, so this never mattered to it
   * anyway).
   */
  multiRaidBossIds?: string[];
  /** Display-only restoration of the boss-set filter UI — see multiRaidBossIds above for why this is NEVER what the sweep itself reads. Optional, defaults to false. */
  multiRaidIncludePastRaids?: boolean;
  /** See multiRaidIncludePastRaids. null = every tier; an array is an explicit checked-tier allow-list. Optional, defaults to null. */
  multiRaidIncludedTiers?: string[] | null;
  /** See multiRaidIncludePastRaids. Optional, defaults to 30. */
  multiRaidMaxBossCount?: number;
  /**
   * Candy on hand, pooled per `candyFamilyId` — see
   * RosterPlannerInputs.candyByFamilyId in rosterPlanner.ts and PLAN §3.4's
   * "UPDATE 2026-09-09" note (pooled per FAMILY, not per species, since 25+
   * families hold more than one roster entry on a real export). A family
   * absent from this map means "unknown," never "0" — every candidate
   * drawing on that family is reported `costUnverified: true` rather than
   * silently treated as unaffordable. Optional/defaults to `{}` (every
   * family unknown) so a pre-multi-raid link decodes cleanly.
   */
  candyByFamilyId?: Record<string, { candy: number; xlCandy: number } | undefined>;
  /**
   * Multi-raid mode only — see PowerUpOptimizerAssumptions.multiRaidMegaLevel
   * for the full contract (a single roster-wide setting, unlike single-raid
   * mode's per-slot `slots[].megaLevel` above) and it is applied for real:
   * `rosterPlanner.ts` takes it as `RosterPlannerInputs.megaLevel`, and both
   * planner entry points feed it into the simulated team DPS.
   * Optional/defaults to `null` so a pre-existing link decodes cleanly.
   */
  multiRaidMegaLevel?: MegaLevel | null;
  /**
   * Multi-raid mode only — which candidates QUALIFY as significant in the
   * ranked sweep and the fixed-budget plan (see rosterPlanner.ts's own
   * `RosterSignificanceMode` doc comment). Never changes what's REPORTED —
   * `bestBossDeltaTeamDps`/`significantBossCount` stay on every row either
   * way, per CLAUDE.md's ranking-flip thesis.
   *
   * Optional so a link built before this field existed decodes to
   * `DEFAULT_ASSUMPTIONS.multiRaidSignificanceMode` (`"aggregate-only"`),
   * same plain fallback as every other field (PowerUpOptimizerView.tsx's
   * scenarioToAssumptions). Used to invert to `"aggregate-or-per-boss"` so
   * an old link's meaning never silently changed; that requirement is gone
   * — see CLAUDE.md's "Backward compatibility with OLD share links is NOT
   * required" (2026-09-10).
   */
  multiRaidSignificanceMode?: RosterSignificanceMode;
  /**
   * Multi-raid mode only — IDEAS.md #11, see
   * PowerUpOptimizerAssumptions.multiRaidUseBestAvailableMoveset for the full
   * contract. Optional/defaults to `false` (today's implicit behavior: every
   * entry simulates on its recorded, possibly-defaulted moveset) so a link
   * shared before this field existed decodes cleanly.
   */
  multiRaidUseBestAvailableMoveset?: boolean;
  /**
   * TM inventory (PLAN_tm_move_change_optimizer.md web half) — account-wide,
   * like rareCandyOnHand/rareCandyXlOnHand, not per-slot. `null` (the
   * default) means UNKNOWN, never 0 — the same "don't gate the sweep on a
   * typed number the field researcher would have to alt-tab to look up"
   * convention as multiRaidBossIds' own candyByFamilyId. Second-charged-move
   * and Elite TM candidates are computed and ranked regardless of whether
   * these are filled in; a filled-in count only changes the "within your
   * stock" framing shown alongside the Elite TM candidates (this field is
   * otherwise purely informational — no regular-TM lottery is modeled, see
   * PLAN's "Regular TMs — do not build the lottery"). Optional so a link
   * shared before these fields existed decodes via `?? null`.
   */
  fastTmOnHand?: number | null;
  chargedTmOnHand?: number | null;
  /** See fastTmOnHand. Frames the Elite Fast TM candidate section's "your N Elite TMs, best N targets" heading — never gates which candidates are generated. */
  eliteFastTmOnHand?: number | null;
  /** See fastTmOnHand/eliteFastTmOnHand, for Elite Charged TM. */
  eliteChargedTmOnHand?: number | null;
}

export function encodePowerUpOptimizerScenario(scenario: PowerUpOptimizerScenario): string {
  const json = JSON.stringify(scenario);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodePowerUpOptimizerScenario(encoded: string): PowerUpOptimizerScenario {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  return JSON.parse(json) as PowerUpOptimizerScenario;
}

/**
 * A separate query param from every other tab's own ("s"/"ts"/"sr"/"ivc"/
 * "adb") — see App.tsx's tab-switcher, which stamps a matching `view=` param
 * onto every generated share link.
 */
const POWER_UP_OPTIMIZER_SCENARIO_QUERY_PARAM = "pu";

export function buildPowerUpOptimizerScenarioUrl(baseUrl: string, scenario: PowerUpOptimizerScenario): string {
  const url = new URL(baseUrl);
  url.searchParams.set(POWER_UP_OPTIMIZER_SCENARIO_QUERY_PARAM, encodePowerUpOptimizerScenario(scenario));
  return url.toString();
}

export function parsePowerUpOptimizerScenarioFromUrl(url: string): PowerUpOptimizerScenario | null {
  const encoded = new URL(url).searchParams.get(POWER_UP_OPTIMIZER_SCENARIO_QUERY_PARAM);
  return encoded ? decodePowerUpOptimizerScenario(encoded) : null;
}
