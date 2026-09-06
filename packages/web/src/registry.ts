import {
  SpeciesRegistry,
  isKnownRaidTier,
  type RaidTier,
  type SpeciesDefinition,
} from "@pogo-analyzer/engine";

// Bundled at build time from the data layer's normalized output (data-sync's
// job, not this package's — see CLAUDE.md). 1012 real species (964 Normal-form
// + 48 real mega/primal attackers) plus the 12 currently-active raid bosses
// from a live community raid feed. Vite supports JSON module imports out of
// the box; the relative path reaches outside packages/web on purpose (see
// vite.config.ts's server.fs.allow and this package's tsconfig.json for the
// matching allowances).
import speciesData from "../../../data/normalized/species.json";
import activeRaidsData from "../../../data/normalized/activeRaids.json";

export interface RawActiveRaidEntry {
  raidName: string;
  tier: string;
  speciesId: string | null;
  isApproximate: boolean;
}

const RAW_SPECIES = speciesData as unknown as SpeciesDefinition[];
const RAW_ACTIVE_RAIDS = activeRaidsData as unknown as RawActiveRaidEntry[];

/**
 * Single memoized registry for the whole app: every real species from the
 * data layer's normalized output, registered as-is. This project previously
 * also registered 4 hand-defined hypothetical fixtures (Mega Raichu X/Y,
 * Mega Skarmory, Primal Kyogre) via `registerHypothetical` — those fixtures
 * have since been deleted from the engine entirely (product direction: no
 * replacement), so nothing is registered as hypothetical here anymore. The
 * `isHypothetical` field and its picker badge remain generic infrastructure
 * on `SpeciesDefinition`/`SpeciesRegistry` for any future speculative real
 * data, not dead code tied to these 4 specifically.
 */
function buildRegistry(): SpeciesRegistry {
  const registry = new SpeciesRegistry();
  for (const species of RAW_SPECIES) {
    registry.register(species);
  }
  return registry;
}

export const speciesRegistry = buildRegistry();

export interface SpeciesOption {
  id: string;
  name: string;
  isHypothetical?: boolean;
  /** See SpeciesDefinition.isShadow — no real synced species carries this yet (data-sync's follow-up), but the picker badge is wired ahead of that data landing. */
  isShadow?: boolean;
  imageUrl?: string;
}

/** All ~1016 registered species, for a generic searchable picker. */
export function allSpeciesOptions(): SpeciesOption[] {
  return speciesRegistry
    .all()
    .map((s) => ({ id: s.id, name: s.name, isHypothetical: s.isHypothetical, isShadow: s.isShadow, imageUrl: s.imageUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface RaidBossOption {
  id: string;
  raidName: string;
  tier: string;
  isApproximate: boolean;
  imageUrl?: string;
}

/**
 * The currently-active raid roster, filtered to entries that resolve to a
 * registered species (a `speciesId: null` entry means no usable stat data
 * exists yet; a resync could also produce an id this registry no longer has —
 * both cases are dropped here so nothing selectable can crash the app).
 */
export function activeRaidBossOptions(): RaidBossOption[] {
  return RAW_ACTIVE_RAIDS.filter(
    (r): r is RawActiveRaidEntry & { speciesId: string } => r.speciesId !== null && speciesRegistry.has(r.speciesId),
  ).map((r) => ({
    id: r.speciesId,
    raidName: r.raidName,
    tier: r.tier,
    isApproximate: r.isApproximate,
    imageUrl: speciesRegistry.get(r.speciesId).imageUrl,
  }));
}

/** Active raid entries with no usable stat data yet — shown disabled, never selectable. */
export function unmatchedActiveRaids(): { raidName: string; tier: string }[] {
  return RAW_ACTIVE_RAIDS.filter((r) => r.speciesId === null || !speciesRegistry.has(r.speciesId)).map((r) => ({
    raidName: r.raidName,
    tier: r.tier,
  }));
}

/**
 * Which real raid tier a species currently counts as, per the live raid
 * feed — feeds comparison.ts's ComparisonInputs.bossRaidTier/
 * SustainedComparisonInputs.bossRaidTier so a real (non-precomputed) boss's
 * effective attack/defense/HP use the correct per-tier numbers (see
 * raidBoss.ts's RAID_TIER_TABLE) instead of always assuming
 * DEFAULT_REAL_RAID_TIER. Returns null when the species isn't a CURRENTLY
 * active raid target at all (e.g. picked from the general species picker
 * rather than the live raid list, or a hypothetical fixture) — the caller
 * falls back to the engine's own DEFAULT_REAL_RAID_TIER in that case, same
 * as omitting bossRaidTier entirely.
 *
 * Deliberately NOT surfaced as a Scenario field: a boss's tier is derived
 * data about the target (same as its baseAttack/imageUrl/etc, all resolved
 * fresh from `target` on every load), not an independent user-facing
 * setting with its own control in the UI — there is no tier picker to
 * round-trip. If a future request adds an explicit tier override control,
 * that setting (not this derivation) is what would need a new Scenario
 * field.
 */
export function raidTierForSpeciesId(id: string): RaidTier | null {
  const entry = RAW_ACTIVE_RAIDS.find((r) => r.speciesId === id);
  if (!entry) return null;
  return isKnownRaidTier(entry.tier) ? entry.tier : null;
}

export interface TargetPickerOption {
  id: string;
  label: string;
  badge?: "hypothetical" | "approximate" | "shadow";
  imageUrl?: string;
}

/**
 * The target picker's option list: currently-active raid bosses pinned to the
 * top (so "what's live right now" is the default browsing experience), then
 * every other registered species below (reachable by search).
 *
 * Badge priority when more than one could apply: approximate/hypothetical
 * beats shadow, since those two are mutually exclusive with each other and
 * both take priority as "this data itself is speculative", a stronger claim
 * than "this is a mechanically-different but otherwise solid stat line".
 */
export function targetPickerOptions(): TargetPickerOption[] {
  const raidOptions: TargetPickerOption[] = activeRaidBossOptions().map((r) => ({
    id: r.id,
    label: `${r.raidName} — ${r.tier}`,
    badge: r.isApproximate ? "approximate" : speciesRegistry.get(r.id).isShadow ? "shadow" : undefined,
    imageUrl: r.imageUrl,
  }));
  const speciesOptions: TargetPickerOption[] = allSpeciesOptions().map((s) => ({
    id: s.id,
    label: s.name,
    badge: s.isHypothetical ? "hypothetical" : s.isShadow ? "shadow" : undefined,
    imageUrl: s.imageUrl,
  }));
  return [...raidOptions, ...speciesOptions];
}

export function candidatePickerOptions(): TargetPickerOption[] {
  return allSpeciesOptions().map((s) => ({
    id: s.id,
    label: s.name,
    badge: s.isHypothetical ? "hypothetical" : s.isShadow ? "shadow" : undefined,
    imageUrl: s.imageUrl,
  }));
}
