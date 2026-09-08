/**
 * Pure "assumptions in -> results out" computation for the IV Breakpoints
 * tab — see runComparator.ts's own doc comment for why this extraction
 * exists and the conventions it follows. React-free: takes
 * IvBreakpointsView's own `IvBreakpointsAssumptions` plus a SpeciesRegistry,
 * and returns exactly the data IvBreakpointsView.tsx renders (the
 * single-target per-level comparison AND the full-roster sweep aggregate).
 */
import {
  bossEffectiveStats,
  compareIvSpreads,
  defaultRaidTierForSpecies,
  isWeatherBoosted,
  resolveMove,
  typeEffectiveness,
  type IvComparisonResult,
  type RaidTier,
  type SpeciesDefinition,
  type SpeciesRegistry,
} from "@pogo-analyzer/engine";
import type { IvBreakpointsAssumptions } from "../IvBreakpointsView.js";
import { applyShadowToggle } from "../shadowToggle.js";
import {
  LEVELS_35_TO_50,
  RAID_TIER_NUMERIC,
  TIER_4_PLUS_LABELS,
  tallyIvSpreadWins,
  type IvSweepAggregate,
  type IvSweepBucket,
  type IvSweepTierRow,
} from "../ivBreakpointsHelpers.js";
import { allSpeciesOptions, raidTierForSpeciesId } from "../registry.js";

type ResolvedMove = NonNullable<ReturnType<typeof resolveMove>>;

export interface IvBreakpointsRunResult {
  species: SpeciesDefinition | null;
  boss: SpeciesDefinition | null;
  bossRaidTier: RaidTier | undefined;
  /** Non-null only when `species` has at least one fast AND one charged move — used by the view to decide whether the sweep report can render at all. */
  resolvedAttackerMoves: { fastMove: ResolvedMove; chargedMove: ResolvedMove } | null;
  data: IvComparisonResult | null;
  error: string | null;
  sweepAggregate: IvSweepAggregate;
}

const EMPTY_AGGREGATE: IvSweepAggregate = {
  totalComputed: 0,
  errorCount: 0,
  countA: 0,
  countB: 0,
  ties: 0,
  byTier: [],
  tier4Plus: { total: 0, countA: 0, countB: 0, ties: 0 },
};

export function runIvBreakpointsScenario(a: IvBreakpointsAssumptions, registry: SpeciesRegistry): IvBreakpointsRunResult {
  const species = registry.has(a.speciesId) ? registry.get(a.speciesId) : null;
  const boss = registry.has(a.targetId) ? registry.get(a.targetId) : null;
  const bossRaidTier = raidTierForSpeciesId(a.targetId) ?? undefined;

  // `species` stays the RAW registry object — the Shadow toggle is applied
  // ONLY here, at the boundary into compareIvSpreads (both the single-target
  // `data` below and the all-active-bosses `sweepAggregate`).
  const attackerForCalc = applyShadowToggle(species, a.isShadow);

  const resolvedAttackerMoves = species
    ? (() => {
        const fastMove = resolveMove(species.fastMoves, a.fastMoveId);
        const chargedMove = resolveMove(species.chargedMoves, a.chargedMoveId);
        return fastMove && chargedMove ? { fastMove, chargedMove } : null;
      })()
    : null;

  let data: IvComparisonResult | null = null;
  let error: string | null = null;
  if (species && boss && attackerForCalc) {
    try {
      if (!resolvedAttackerMoves) throw new Error(`${species.name} needs at least one fast move and one charged move.`);
      const { fastMove, chargedMove } = resolvedAttackerMoves;
      const bossFastMove = resolveMove(boss.fastMoves, a.bossFastMoveId);
      if (!bossFastMove) throw new Error(`${boss.name} has no fast move defined.`);

      const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(boss, bossRaidTier);

      data = compareIvSpreads({
        species: attackerForCalc,
        fastMove,
        chargedMove,
        ivA: a.ivA,
        ivB: a.ivB,
        bossDefenseStat,
        fastMoveDamageModifiers: {
          stab: species.types.includes(fastMove.type),
          typeEffectiveness: typeEffectiveness(fastMove.type, boss.types),
          weatherBoosted: isWeatherBoosted(fastMove.type, a.weather),
        },
        chargedMoveDamageModifiers: {
          stab: species.types.includes(chargedMove.type),
          typeEffectiveness: typeEffectiveness(chargedMove.type, boss.types),
          weatherBoosted: isWeatherBoosted(chargedMove.type, a.weather),
        },
        bossAttackStat,
        bossFastMovePower: bossFastMove.power,
        bossFastMoveDurationSeconds: bossFastMove.durationSeconds,
        incomingDamageModifiers: {
          stab: boss.types.includes(bossFastMove.type),
          typeEffectiveness: typeEffectiveness(bossFastMove.type, species.types),
          weatherBoosted: isWeatherBoosted(bossFastMove.type, a.weather),
        },
        dodge: a.dodge,
        levels: LEVELS_35_TO_50,
      });
    } catch (err) {
      error = (err as Error).message;
    }
  }

  // The full-roster sweep — every registered species this tool can target
  // (not just the currently-active raid roster), each with its OWN first
  // fast move and per-tier effective attack/defense.
  let sweepAggregate: IvSweepAggregate = EMPTY_AGGREGATE;
  if (species && attackerForCalc && resolvedAttackerMoves) {
    const { fastMove, chargedMove } = resolvedAttackerMoves;
    let totalComputed = 0;
    let errorCount = 0;
    let countA = 0;
    let countB = 0;
    let ties = 0;
    const tierBuckets = new Map<RaidTier, IvSweepBucket>();
    const tier4Plus: IvSweepBucket = { total: 0, countA: 0, countB: 0, ties: 0 };

    for (const opt of allSpeciesOptions()) {
      const bossSpecies = registry.has(opt.id) ? registry.get(opt.id) : null;
      if (!bossSpecies) {
        errorCount++;
        continue;
      }
      try {
        const tier = raidTierForSpeciesId(opt.id) ?? defaultRaidTierForSpecies(bossSpecies);
        const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(bossSpecies, tier);
        const bossFastMove = resolveMove(bossSpecies.fastMoves, null);
        if (!bossFastMove) throw new Error(`${bossSpecies.name} has no fast move defined.`);

        const cmp = compareIvSpreads({
          species: attackerForCalc,
          fastMove,
          chargedMove,
          ivA: a.ivA,
          ivB: a.ivB,
          bossDefenseStat,
          fastMoveDamageModifiers: {
            stab: species.types.includes(fastMove.type),
            typeEffectiveness: typeEffectiveness(fastMove.type, bossSpecies.types),
            weatherBoosted: isWeatherBoosted(fastMove.type, a.weather),
          },
          chargedMoveDamageModifiers: {
            stab: species.types.includes(chargedMove.type),
            typeEffectiveness: typeEffectiveness(chargedMove.type, bossSpecies.types),
            weatherBoosted: isWeatherBoosted(chargedMove.type, a.weather),
          },
          bossAttackStat,
          bossFastMovePower: bossFastMove.power,
          bossFastMoveDurationSeconds: bossFastMove.durationSeconds,
          incomingDamageModifiers: {
            stab: bossSpecies.types.includes(bossFastMove.type),
            typeEffectiveness: typeEffectiveness(bossFastMove.type, species.types),
            weatherBoosted: isWeatherBoosted(bossFastMove.type, a.weather),
          },
          dodge: a.dodge,
          levels: LEVELS_35_TO_50,
        });

        const { winsA, winsB } = tallyIvSpreadWins(cmp.rows);
        totalComputed++;
        let bucket = tierBuckets.get(tier);
        if (!bucket) {
          bucket = { total: 0, countA: 0, countB: 0, ties: 0 };
          tierBuckets.set(tier, bucket);
        }
        bucket.total++;
        const inTier4Plus = TIER_4_PLUS_LABELS.has(tier);
        if (inTier4Plus) tier4Plus.total++;
        if (winsA > winsB) {
          countA++;
          bucket.countA++;
          if (inTier4Plus) tier4Plus.countA++;
        } else if (winsB > winsA) {
          countB++;
          bucket.countB++;
          if (inTier4Plus) tier4Plus.countB++;
        } else {
          ties++;
          bucket.ties++;
          if (inTier4Plus) tier4Plus.ties++;
        }
      } catch {
        errorCount++;
      }
    }

    const byTier: IvSweepTierRow[] = [...tierBuckets.entries()]
      .map(([tier, bucket]) => ({ tier, tierNumeric: RAID_TIER_NUMERIC[tier], ...bucket }))
      .sort((x, y) => x.tierNumeric - y.tierNumeric);
    sweepAggregate = { totalComputed, errorCount, countA, countB, ties, byTier, tier4Plus };
  }

  return { species, boss, bossRaidTier, resolvedAttackerMoves, data, error, sweepAggregate };
}
