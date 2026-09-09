import { activeRaidBossOptions, pastRaidBossOptions } from "./registry.js";

/**
 * The live filter state that DRIVES boss-set resolution for the Power-Up
 * Optimizer's multi-raid mode — see PLAN_multi_raid_roster_optimizer.md §3.1.
 * Kept as its own small type (rather than inlined into
 * `PowerUpOptimizerAssumptions`) so `resolveMultiRaidBossIds` below has one
 * clear, testable input shape independent of the rest of that much larger
 * interface.
 */
export interface MultiRaidBossFilters {
  /** Also sweep bosses this pipeline has recorded before but that aren't part of the currently-active roster — same toggle/semantics as SpeciesReportView's includePastRaids. */
  includePastRaids: boolean;
  /** null = every tier; an array is an explicit checked-tier allow-list. Same semantics as SpeciesReportAssumptions.includedTiers. */
  includedTiers: string[] | null;
  /** Trims the resolved list to at most this many bosses — default 30 (PLAN §2/§3.1's measured compute budget assumes this cap). */
  maxBossCount: number;
}

export const DEFAULT_MULTI_RAID_BOSS_FILTERS: MultiRaidBossFilters = {
  includePastRaids: false,
  includedTiers: null,
  maxBossCount: 30,
};

function tierIsIncluded(tiers: string[] | null, tier: string): boolean {
  return tiers === null || tiers.includes(tier);
}

/**
 * Every raid tier currently present in the boss pool this filter set could
 * possibly select from — active raids always, plus past raids too once that
 * toggle is on. Drives the tier-checkbox group in BossSetPanel.tsx (one
 * checkbox per tier actually available to pick from, same "don't render a
 * checkbox for a tier nothing uses" precedent as SpeciesReportView's
 * allTiersPresent).
 */
export function multiRaidTiersPresent(includePastRaids: boolean): string[] {
  const tiers = new Set(activeRaidBossOptions().map((b) => b.tier));
  if (includePastRaids) {
    for (const r of pastRaidBossOptions()) tiers.add(r.tier);
  }
  return [...tiers].sort();
}

/**
 * Resolves the AUTHORITATIVE boss id list for a multi-raid sweep from live
 * filter state — active raids first (registry.ts's own order), then
 * past/inactive raids when included (registry.ts's own dated-first-then-
 * alphabetical order), capped at `maxBossCount`.
 *
 * CRITICAL — see PLAN_multi_raid_roster_optimizer.md §3.1: this function's
 * OUTPUT (a concrete list of species ids), never the filter state itself, is
 * what gets encoded into a share link and fed to `runRosterPlannerScenario`.
 * Call this ONLY in direct response to an explicit user action that changes
 * the filters (BossSetPanel's own onChange handlers, or turning multi-raid
 * mode on for the first time with no boss set yet) — NEVER on every render,
 * and NEVER when restoring a scenario from a URL. A decoded share link's own
 * `multiRaidBossIds` must be trusted AS-IS; re-deriving it here on load would
 * silently sweep whatever bosses are active THIS session instead of the ones
 * the sender actually ran (the active raid roster rotates — the whole reason
 * this function's result gets encoded rather than the phrase "active raids").
 */
export function resolveMultiRaidBossIds(filters: MultiRaidBossFilters): string[] {
  const active = activeRaidBossOptions().filter((b) => tierIsIncluded(filters.includedTiers, b.tier));
  const past = filters.includePastRaids ? pastRaidBossOptions().filter((r) => tierIsIncluded(filters.includedTiers, r.tier)) : [];
  const ids = [...active.map((b) => b.id), ...past.map((r) => r.id)];
  return ids.slice(0, Math.max(0, filters.maxBossCount));
}
