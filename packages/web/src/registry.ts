import {
  MEGA_RAICHU_X,
  MEGA_RAICHU_Y,
  MEGA_SKARMORY,
  PRIMAL_KYOGRE,
  SpeciesRegistry,
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
 * Single memoized registry for the whole app: 1012 real species (registered
 * as-is) plus the 4 hand-defined hypothetical fixtures that power this
 * project's pinned default scenario (Scenario A) — registered via
 * `registerHypothetical` so they keep carrying `isHypothetical: true` all the
 * way to the UI, exactly as they do today.
 */
function buildRegistry(): SpeciesRegistry {
  const registry = new SpeciesRegistry();
  for (const species of RAW_SPECIES) {
    registry.register(species);
  }
  for (const hypothetical of [MEGA_RAICHU_X, MEGA_RAICHU_Y, PRIMAL_KYOGRE, MEGA_SKARMORY]) {
    registry.registerHypothetical(hypothetical);
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

export interface TargetPickerOption {
  id: string;
  label: string;
  badge?: "hypothetical" | "approximate" | "shadow";
  imageUrl?: string;
}

/**
 * The target picker's option list: currently-active raid bosses pinned to the
 * top (so "what's live right now" is the default browsing experience), then
 * every other registered species below (reachable by search) — this is how
 * this project's own hypothetical bosses (Primal Kyogre, Mega Skarmory) stay
 * selectable even though they will never appear in a live raid feed.
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
