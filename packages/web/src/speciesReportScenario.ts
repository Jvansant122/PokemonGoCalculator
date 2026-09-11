import { fromBase64Url, toBase64Url, type DodgeBehavior, type IVSpread, type MegaLevel, type WeatherCondition } from "@pogo-analyzer/engine";
import type { BossChargedMoveCadence } from "./bossCadence.js";

/**
 * Which column the results table is ranked by — a display-only choice (it
 * never changes what runSpeciesReverseLookup computes, only how the rows are
 * ordered), but still a real user-facing setting and therefore still part of
 * the shareable scenario. See SpeciesReportView.tsx's sortRows.
 */
export type SpeciesReportSortMode = "damage" | "typeMatchup";

/**
 * The complete, shareable description of one Species Report (reverse-lookup)
 * run — a sibling of scenario.ts's `Scenario` and teamScenario.ts's
 * `TeamScenario`, not an extension of either. Per
 * .claude/agent-memory/pogo-researcher/proposal_species_reverse_lookup.md
 * section 4: this view has a genuinely different shape (one species, no
 * second candidate, no boss/target picker since every currently-active raid
 * boss is swept rather than chosen) so it gets its own type rather than being
 * forced into either existing one.
 *
 * Unlike its two siblings, this type (and its codec below) lives in
 * packages/web rather than packages/engine — web-developer does not edit
 * packages/engine. The base64url-JSON transport itself (toBase64Url/
 * fromBase64Url) is still reused directly from the engine's own scenario.ts
 * export rather than forked a second time.
 */
export interface SpeciesReportScenario {
  speciesId: string;
  /** null = use this species' first fast move. */
  fastMoveId: string | null;
  /** null = use this species' first charged move. */
  chargedMoveId: string | null;
  level: number;
  ivs: IVSpread;
  /** Governs dodging each swept boss's CHARGED attacks. */
  dodgeModel: DodgeBehavior;
  /** Whether the species also attempts to dodge each boss's fast attacks. */
  dodgeFastAttacks: boolean;
  /** Active weather, applied per-move to both sides against every boss swept — see weather.ts. */
  weather: WeatherCondition;
  /** Mean seconds between each boss's charged moves once it starts using them — one shared assumption swept across every boss, same field name/meaning as Scenario's own bossChargedMoveFrequencySeconds. */
  bossChargedMoveFrequencySeconds: number;
  /**
   * Which model derives every swept boss's charged-move timing — see
   * bossCadence.tsx's BOSS_CADENCE_HINT for the full sourcing/caveat story.
   * Unlike scenario.ts's Scenario/teamScenario.ts's TeamScenario (which live
   * in packages/engine, so web-developer extends them locally rather than
   * editing packages/engine — see ComparatorView.tsx's ComparatorScenario),
   * SpeciesReportScenario already lives in packages/web, so this field is
   * declared directly here rather than through an extension type. Optional
   * so a link shared before this field existed decodes via `??` below rather
   * than surfacing `undefined`.
   */
  bossChargedMoveCadence?: BossChargedMoveCadence;
  /**
   * The selected species' own Mega Level (see megaLevelSelect.tsx /
   * packages/engine/src/megaLevel.ts) — mirrors
   * SpeciesReportInputs.megaLevel exactly. Like bossChargedMoveCadence above,
   * this type already lives in packages/web, so the field is declared
   * directly here rather than through an extension type. Optional so a link
   * shared before this field existed decodes via `??` below rather than
   * surfacing `undefined`. `null`/undefined mean no Mega Level investment
   * assumed (identical to `"base"`); silently has no effect for a species
   * with no mega/primal `boost` mechanic at all.
   */
  megaLevel?: MegaLevel | null;
  /** Which column the results table is sorted by — see SpeciesReportSortMode. */
  sortMode: SpeciesReportSortMode;
  /**
   * Raid tiers to include in the sweep, keyed by the raw feed/history tier
   * label (e.g. "5-Star Raids"). `null` means "every tier" — including one
   * that only appears in the feed LATER, after this link was shared — and is
   * therefore the default; an array is an explicit allow-list a user checked
   * off in the tier filter. Deliberately not an exclusion list: inverting it
   * would silently drop a future tier the sharer never saw or opted out of.
   */
  includedTiers: string[] | null;
  /**
   * Whether to also sweep bosses this pipeline has recorded before but that
   * are not part of the currently-active raid roster (see registry.ts's
   * pastRaidBossOptions) alongside the always-included active roster.
   * Defaults to false, i.e. today's "currently-active only" behavior.
   */
  includePastRaids: boolean;
}

function encodeSpeciesReportScenario(scenario: SpeciesReportScenario): string {
  const json = JSON.stringify(scenario);
  return toBase64Url(new TextEncoder().encode(json));
}

function decodeSpeciesReportScenario(encoded: string): SpeciesReportScenario {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  return JSON.parse(json) as SpeciesReportScenario;
}

/**
 * A separate query param from both Scenario's "s" and TeamScenario's "ts" —
 * a shared link needs to be able to identify which of the three tabs it's
 * for. See App.tsx's tab-switcher, which stamps a matching `view=` param
 * onto every generated share link.
 */
const SPECIES_REPORT_SCENARIO_QUERY_PARAM = "sr";

export function buildSpeciesReportScenarioUrl(baseUrl: string, scenario: SpeciesReportScenario): string {
  const url = new URL(baseUrl);
  url.searchParams.set(SPECIES_REPORT_SCENARIO_QUERY_PARAM, encodeSpeciesReportScenario(scenario));
  return url.toString();
}

export function parseSpeciesReportScenarioFromUrl(url: string): SpeciesReportScenario | null {
  const encoded = new URL(url).searchParams.get(SPECIES_REPORT_SCENARIO_QUERY_PARAM);
  return encoded ? decodeSpeciesReportScenario(encoded) : null;
}
