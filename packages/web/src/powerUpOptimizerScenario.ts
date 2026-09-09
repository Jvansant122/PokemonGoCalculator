import { fromBase64Url, toBase64Url, type DodgeBehavior, type IVSpread, type WeatherCondition } from "@pogo-analyzer/engine";
import type { BossChargedMoveCadence } from "./bossCadence.js";

/**
 * Which resource column the ranked candidate table is sorted by — a
 * display-only choice (never changes what optimizePowerUps computes, only
 * how the rows are ordered), same "still a real setting, still shareable"
 * reasoning as SpeciesReportScenario's own sortMode.
 */
export type PowerUpRankBy = "stardust" | "candy" | "xlCandy";

/** One roster slot's own configuration — mirrors PowerUpSlotAssumption exactly, field for field. */
export interface PowerUpScenarioSlot {
  speciesId: string | null;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  isMega: boolean;
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
  /** Always exactly MAX_TEAM_RAID_SLOTS entries, in fight order — pad with empty slots rather than shortening the array, same convention as TeamScenario.slots. */
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
  target: string;
  bossFastMoveId: string | null;
  bossChargedMoveId: string | null;
  dodgeModel: DodgeBehavior;
  dodgeFastAttacks: boolean;
  holdChargedMoveUntilSafe: boolean;
  weather: WeatherCondition;
  bossChargedMoveFrequencySeconds: number;
  /** See bossCadence.tsx's BOSS_CADENCE_HINT. Optional so a link shared before this field existed decodes via `??` rather than surfacing `undefined`. */
  bossChargedMoveCadence?: BossChargedMoveCadence;
  bossStartsPrimed: boolean;
  bossStartingEnergyFraction: number;
  raidTimerSeconds: number;
  swapCostSeconds: number;
  reviveCostSeconds: number;
  /** Which resource column the ranked table is sorted by — see PowerUpRankBy. */
  rankBy: PowerUpRankBy;
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
