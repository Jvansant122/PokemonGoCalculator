/**
 * Pure "assumptions in -> results out" computation for the Species Report
 * (reverse-lookup) tab — see runComparator.ts's own doc comment for why this
 * extraction exists and the conventions it follows. React-free: takes
 * SpeciesReportView's own `SpeciesReportAssumptions` plus a SpeciesRegistry,
 * and returns exactly the sweep data SpeciesReportView.tsx renders (before
 * the view's own cheap, display-only sort — see sortRows below, also moved
 * here so the CLI/tests can reuse it without importing the view component).
 *
 * Deliberately does NOT debounce anything — that's a UI-only concern
 * (SpeciesReportView's own useDebouncedValue) that has no meaning for a
 * one-shot CLI invocation or a synchronous test.
 */
import {
  runSpeciesReverseLookup,
  type AttackerTypeProfile,
  type SpeciesDefinition,
  type SpeciesRegistry,
  type SpeciesReportBossTarget,
  type SpeciesReportResult,
  type SpeciesReportRow,
} from "@pogo-analyzer/engine";
import type { SpeciesReportAssumptions } from "../SpeciesReportView.js";
import type { SpeciesReportSortMode } from "../speciesReportScenario.js";
import { activeRaidBossOptions, pastRaidBossOptions, raidTierForSpeciesId } from "../registry.js";

function tierIsIncluded(tiers: string[] | null, tier: string): boolean {
  return tiers === null || tiers.includes(tier);
}

/**
 * Guards registry.ts's raw, unvalidated `PastRaidBossOption.eraHp` against
 * the engine's actual bossMaxHpOverride contract (a non-finite or
 * non-positive value THROWS) before it's ever handed to
 * runSpeciesReverseLookup — see SpeciesReportView's identical guard for the
 * full doc comment on why this degrades one bad row rather than crashing the
 * whole sweep.
 */
export function validEraHp(eraHp: number | undefined): number | undefined {
  return typeof eraHp === "number" && Number.isFinite(eraHp) && eraHp > 0 ? eraHp : undefined;
}

export interface SpeciesReportRunResult {
  species: SpeciesDefinition | null;
  targets: SpeciesReportBossTarget[];
  activeTargetCount: number;
  pastTargetCount: number;
  data: SpeciesReportResult | null;
  error: string | null;
}

export function runSpeciesReportScenario(a: SpeciesReportAssumptions, registry: SpeciesRegistry): SpeciesReportRunResult {
  const species = registry.has(a.speciesId) ? registry.get(a.speciesId) : null;

  const bossOptions = activeRaidBossOptions();
  const pastRaidOptions = pastRaidBossOptions();
  const pastIds = new Set(pastRaidOptions.map((r) => r.id));

  const activeTargets: SpeciesReportBossTarget[] = bossOptions
    .filter((b) => tierIsIncluded(a.includedTiers, b.tier))
    .map((b) => ({ species: registry.get(b.id), tier: raidTierForSpeciesId(b.id) ?? undefined }));

  const pastTargets: SpeciesReportBossTarget[] = a.includePastRaids
    ? pastRaidOptions
        .filter((r) => tierIsIncluded(a.includedTiers, r.tier))
        .map((r) => ({ species: registry.get(r.id), tier: r.tier, bossMaxHpOverride: validEraHp(r.eraHp) }))
    : [];

  const targets = [...activeTargets, ...pastTargets];
  const pastTargetCount = targets.filter((t) => pastIds.has(t.species.id)).length;
  const activeTargetCount = targets.length - pastTargetCount;

  // Every registered species' own default fast/charged move TYPES — the
  // cheap, no-simulation corpus for the type-matchup-percentile stat.
  const typeMatchupCorpus: AttackerTypeProfile[] = registry
    .all()
    .filter((s) => s.fastMoves.length > 0 && s.chargedMoves.length > 0)
    .map((s) => ({ fastMoveType: s.fastMoves[0]!.type, chargedMoveType: s.chargedMoves[0]!.type }));

  let data: SpeciesReportResult | null = null;
  let error: string | null = null;
  if (species) {
    try {
      data = runSpeciesReverseLookup({
        species,
        fastMoveId: a.fastMoveId,
        chargedMoveId: a.chargedMoveId,
        level: a.level,
        ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
        dodge: a.dodge,
        dodgeFastAttacks: a.dodgeFastAttacks,
        weather: a.weather,
        bossChargedMoveMeanIntervalSeconds: a.bossChargedMoveFrequencySeconds,
        bossChargedMoveCadence: a.bossChargedMoveCadence,
        targets,
        typeMatchupCorpus,
      });
    } catch (err) {
      error = (err as Error).message;
    }
  }

  return { species, targets, activeTargetCount, pastTargetCount, data, error };
}

/**
 * `typeMatchupPercentile` (a 0-1 fraction) and `offensiveTypeMatchup` (a raw
 * ~0.39-2.56 type-effectiveness multiplier) are two different scales — see
 * SpeciesReportView's own doc comment for why the scale is decided once for
 * the whole array rather than per-row.
 */
export function sortRows(rows: SpeciesReportRow[], mode: SpeciesReportSortMode): SpeciesReportRow[] {
  const copy = rows.slice();
  if (mode === "typeMatchup") {
    const allHavePercentile = rows.every((r) => r.typeMatchupPercentile !== undefined);
    copy.sort((a, b) =>
      allHavePercentile ? b.typeMatchupPercentile! - a.typeMatchupPercentile! : b.offensiveTypeMatchup - a.offensiveTypeMatchup,
    );
  } else {
    copy.sort((a, b) => b.sustained.meanTotalDamage - a.sustained.meanTotalDamage);
  }
  return copy;
}
