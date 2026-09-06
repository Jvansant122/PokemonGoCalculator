import { useMemo, useState } from "react";
import {
  DEFAULT_REAL_RAID_TIER,
  WEATHER_BOOSTED_TYPES,
  bossEffectiveStats,
  compareIvSpreads,
  isWeatherBoosted,
  resolveMove,
  typeEffectiveness,
  type DodgeBehavior,
  type IVSpread,
  type IvComparisonResult,
  type IvComparisonRow,
  type RaidTier,
  type SpeciesDefinition,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import { MoveSelect } from "./MoveSelect.js";
import { SpeciesPicker } from "./SpeciesPicker.js";
import {
  buildIvBreakpointsScenarioUrl,
  parseIvBreakpointsScenarioFromUrl,
  type IvBreakpointsScenario,
} from "./ivBreakpointsScenario.js";
import {
  allSpeciesOptions,
  candidatePickerOptions,
  raidTierForSpeciesId,
  speciesRegistry,
  targetPickerOptions,
  unmatchedActiveRaids,
} from "./registry.js";

// Same weather-option construction as AssumptionPanel.tsx/TeamAssumptionPanel.tsx/
// SpeciesReportView.tsx — duplicated rather than imported, matching the
// precedent those three already set (a small, cheap, self-contained constant).
const WEATHER_LABELS: Record<WeatherCondition, string> = {
  none: "None",
  sunny: "Sunny/Clear",
  rainy: "Rain",
  windy: "Windy",
  cloudy: "Cloudy",
  fog: "Fog",
  snow: "Snow",
  partly_cloudy: "Partly Cloudy",
};
const WEATHER_OPTIONS: { value: WeatherCondition; label: string }[] = (
  Object.keys(WEATHER_BOOSTED_TYPES) as WeatherCondition[]
).map((value) => {
  const boosted = WEATHER_BOOSTED_TYPES[value];
  return {
    value,
    label: boosted.length === 0 ? WEATHER_LABELS[value] : `${WEATHER_LABELS[value]} (boosts ${boosted.join("/")})`,
  };
});

/**
 * Numeric Niantic/Bulbapedia raid difficulty tier for each of this project's
 * `RaidTier` label strings. `RaidTier` itself (engine/src/raidBoss.ts) carries
 * no numeric field, only the label strings the live raid feed emits — this
 * map exists purely so the web layer can bucket/filter by tier without the
 * engine needing to grow a field no combat formula actually needs. Sourced
 * from Bulbapedia's "Raid Battle (GO)" difficulty table, the SAME page
 * raidBoss.ts's own `RAID_TIER_TABLE` already cites for its HP/multiplier
 * figures [community-consensus] — not a fresh guess, just adding the numeric
 * column that table's own doc comment didn't need to carry: 1-Star Raids = 1,
 * 3-Star Raids = 3, Mega Raids = 4, 5-Star Raids = 5, Legendary Mega Raids and
 * Primal Raids both = 6 (six-star tier), Super Mega Raids = 7.
 */
const RAID_TIER_NUMERIC: Record<RaidTier, number> = {
  "1-Star Raids": 1,
  "3-Star Raids": 3,
  "Mega Raids": 4,
  "5-Star Raids": 5,
  "Legendary Mega Raids": 6,
  "Primal Raids": 6,
  "Super Mega Raids": 7,
};

/**
 * "Tier 4 and higher" per the numeric map above — derived from it (filtered
 * on the numbers) rather than hand-listing the 5 label strings a second time,
 * so the two can't silently drift apart if a tier's number ever needs
 * correcting. Excludes "1-Star Raids"/"3-Star Raids" only.
 */
const TIER_4_PLUS_LABELS = new Set<RaidTier>(
  (Object.keys(RAID_TIER_NUMERIC) as RaidTier[]).filter((tier) => RAID_TIER_NUMERIC[tier] >= 4),
);

/**
 * This tab deliberately restricts its whole sweep (single-target per-level
 * table AND the all-species report below) to levels 35 through 50 inclusive,
 * in the same 0.5 steps `CPM_TABLE` (packages/engine/src/cpm.ts) uses — NOT
 * `compareIvSpreads`'s own default of every registered level (1 through 50
 * as of the level-50 cap extension). This is a fixed product decision (same
 * as "check every level" was previously a fixed decision, just a narrower
 * fixed range now), not a user-adjustable setting, so it's a plain module
 * constant rather than an `IvBreakpointsScenario` field. Built with a loop
 * rather than 31 hand-typed literals so it can't drift from the intended
 * range. `(50 - 35) / 0.5 + 1 === 31` levels total.
 */
const LEVELS_35_TO_50: number[] = (() => {
  const levels: number[] = [];
  for (let level = 35; level <= 50; level += 0.5) {
    levels.push(level);
  }
  return levels;
})();

// The motivating real case this tab was built for: a real user's two owned
// Delphox, wondering which spread is worth the candy/stardust to power up.
const DEFAULT_SPECIES_ID = "delphox";
const DEFAULT_IV_A: IVSpread = { attack: 14, defense: 15, stamina: 15 };
const DEFAULT_IV_B: IVSpread = { attack: 15, defense: 13, stamina: 15 };
// A real, currently-active raid boss (Mega Steelix, "Mega Raids" tier as of
// this data sync) — same "ready-to-run on first load" convention as the other
// three tabs' own DEFAULT_CANDIDATE_A_ID/DEFAULT_TARGET_ID/DEFAULT_SPECIES_ID.
const DEFAULT_TARGET_ID = "steelix-mega";

export interface IvBreakpointsAssumptions {
  speciesId: string;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  ivA: IVSpread;
  ivB: IVSpread;
  targetId: string;
  bossFastMoveId: string | null;
  dodge: DodgeBehavior;
  weather: WeatherCondition;
}

const DEFAULT_ASSUMPTIONS: IvBreakpointsAssumptions = {
  speciesId: DEFAULT_SPECIES_ID,
  fastMoveId: null,
  chargedMoveId: null,
  ivA: DEFAULT_IV_A,
  ivB: DEFAULT_IV_B,
  targetId: DEFAULT_TARGET_ID,
  bossFastMoveId: null,
  dodge: { kind: "none" },
  weather: "none",
};

function assumptionsToScenario(a: IvBreakpointsAssumptions): IvBreakpointsScenario {
  return {
    speciesId: a.speciesId,
    fastMoveId: a.fastMoveId,
    chargedMoveId: a.chargedMoveId,
    ivA: a.ivA,
    ivB: a.ivB,
    targetId: a.targetId,
    bossFastMoveId: a.bossFastMoveId,
    dodgeModel: a.dodge,
    weather: a.weather,
  };
}

function scenarioToAssumptions(s: IvBreakpointsScenario): IvBreakpointsAssumptions {
  return {
    speciesId: s.speciesId,
    fastMoveId: s.fastMoveId ?? null,
    chargedMoveId: s.chargedMoveId ?? null,
    ivA: s.ivA ?? DEFAULT_ASSUMPTIONS.ivA,
    ivB: s.ivB ?? DEFAULT_ASSUMPTIONS.ivB,
    targetId: s.targetId,
    bossFastMoveId: s.bossFastMoveId ?? null,
    // `??` guards a scenario URL encoded before a field existed rather than
    // surfacing `undefined` into a controlled input — same discipline as
    // App.tsx's/SpeciesReportView's scenarioToAssumptions.
    dodge: s.dodgeModel ?? DEFAULT_ASSUMPTIONS.dodge,
    weather: s.weather ?? DEFAULT_ASSUMPTIONS.weather,
  };
}

function initialAssumptions(): IvBreakpointsAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parseIvBreakpointsScenarioFromUrl(window.location.href);
  return fromUrl ? scenarioToAssumptions(fromUrl) : DEFAULT_ASSUMPTIONS;
}

function resolveSpecies(id: string): SpeciesDefinition | null {
  return speciesRegistry.has(id) ? speciesRegistry.get(id) : null;
}

function speciesLabel(s: SpeciesDefinition): string {
  return s.isHypothetical ? `${s.name} (hypothetical)` : s.name;
}

function SpeciesIcon({ s }: { s: SpeciesDefinition }) {
  return s.imageUrl ? <img src={s.imageUrl} alt="" className="species-icon" /> : null;
}

function ivLabel(iv: IVSpread): string {
  return `${iv.attack}/${iv.defense}/${iv.stamina}`;
}

/**
 * Tallies, across every (level, metric) instance in one target's full
 * `compareIvSpreads` result, which spread had the strictly higher value —
 * `fastMoveDamage`/`chargedMoveDamage`/`timeToFaintSeconds` are all "higher is
 * better", so no sign conflict between them. A tie at a given level/metric
 * (including "both spreads outlast the scan window") increments neither.
 * `timeToFaintSeconds: null` means "outlasted the scan window" — treated as
 * beating any finite value, same `?? Infinity` convention the per-level table
 * below already uses for its own winner-bolding.
 */
function tallyIvSpreadWins(rows: IvComparisonRow[]): { winsA: number; winsB: number } {
  let winsA = 0;
  let winsB = 0;
  for (const row of rows) {
    if (row.ivA.fastMoveDamage !== row.ivB.fastMoveDamage) {
      row.ivA.fastMoveDamage > row.ivB.fastMoveDamage ? winsA++ : winsB++;
    }
    if (row.ivA.chargedMoveDamage !== row.ivB.chargedMoveDamage) {
      row.ivA.chargedMoveDamage > row.ivB.chargedMoveDamage ? winsA++ : winsB++;
    }
    const ttfA = row.ivA.timeToFaintSeconds ?? Infinity;
    const ttfB = row.ivB.timeToFaintSeconds ?? Infinity;
    if (ttfA !== ttfB) {
      ttfA > ttfB ? winsA++ : winsB++;
    }
  }
  return { winsA, winsB };
}

/**
 * Aggregate verdict across every registered species this tool can target
 * (the full roster from `allSpeciesOptions()` — same species reachable via
 * the "Raid boss / target" picker's tail below the active-raid entries;
 * exact count drifts with each data-sync, deliberately not hardcoded here)
 * — NOT an attempt
 * to invent an "every raid boss ever" historical dataset (speciesReport.ts's
 * own doc comments document why that dataset doesn't exist); this just
 * broadens "which targets to sweep" from "currently live in the raid
 * rotation" to "every species this tool already lets a user pick as a
 * target".
 */
/** Win tallies for one bucket of targets (either "all tiers" or one specific tier). */
interface IvSweepBucket {
  total: number;
  countA: number;
  countB: number;
  ties: number;
}

/** One populated tier's bucket, carrying its own numeric tier alongside the label for display/sort. */
interface IvSweepTierRow extends IvSweepBucket {
  tier: RaidTier;
  tierNumeric: number;
}

interface IvSweepAggregate {
  /** Species successfully computed (excludes any lacking usable move data). */
  totalComputed: number;
  errorCount: number;
  /** Species where Spread A's summed win-tally across all levels/metrics is strictly higher. */
  countA: number;
  /** Species where Spread B's summed win-tally is strictly higher. */
  countB: number;
  /** Species where the tallies are equal (including both zero, i.e. never diverges). */
  ties: number;
  /**
   * The same win tallies as above, but bucketed by each target's own
   * resolved raid tier (`raidTierForSpeciesId(id) ?? DEFAULT_REAL_RAID_TIER`
   * — identical resolution used to build that target's boss stats). Only
   * tiers with at least one computed target are present, sorted by numeric
   * tier ascending. There are at most 7 possible entries here.
   */
  byTier: IvSweepTierRow[];
  /**
   * The headline verdict, restricted to targets whose resolved tier is
   * "Mega Raids"/"5-Star Raids"/"Legendary Mega Raids"/"Primal Raids"/
   * "Super Mega Raids" (numeric tier 4+, see TIER_4_PLUS_LABELS) — excludes
   * "1-Star Raids"/"3-Star Raids" targets entirely, per the user's request
   * that the single headline sentence not be diluted by low-tier trash
   * raids nobody is actually deciding an IV spread against.
   */
  tier4Plus: IvSweepBucket;
}

/**
 * "First becomes different at level X" — deliberately NOT "from level X
 * onward", since divergence between two IV spreads is not monotonic across
 * levels (floor-rounding can close a gap back up at a higher level even after
 * it opened lower down — see ivComparison.ts's own doc comment on
 * IvComparisonResult.firstDivergenceLevel). The full per-level table below is
 * the source of truth; this sentence is a headline pointer into it, not a
 * summary that replaces it.
 */
/**
 * The "Spread X outperforms Spread Y in N of M raids..." sentence, factored
 * out so both the tier-4+ headline and (if ever needed) an all-tiers sentence
 * can share the exact same wording/tie-handling rather than drifting apart —
 * `scopeIntro` is the sentence up through "...this tool can model" (already
 * carrying its own target count), this function only appends the comparison
 * clause.
 */
function bucketVerdictSentence(bucket: IvSweepBucket, ivA: IVSpread, ivB: IVSpread, scopeIntro: string): string {
  if (bucket.total === 0) return `${scopeIntro}, but none could be computed for this matchup.`;
  if (bucket.countA === bucket.countB) {
    return `${scopeIntro}, Spread A (${ivLabel(ivA)}) and Spread B (${ivLabel(ivB)}) each come out ahead in ${bucket.countA} of them — neither spread outperforms the other more often overall (${bucket.ties} show no meaningful difference either way).`;
  }
  const aWins = bucket.countA > bucket.countB;
  const winnerLabel = aWins ? "A" : "B";
  const winnerIv = ivLabel(aWins ? ivA : ivB);
  const loserLabel = aWins ? "B" : "A";
  const loserIv = ivLabel(aWins ? ivB : ivA);
  const winnerCount = aWins ? bucket.countA : bucket.countB;
  const loserCount = aWins ? bucket.countB : bucket.countA;
  return `${scopeIntro}, Spread ${winnerLabel} (${winnerIv}) outperforms Spread ${loserLabel} (${loserIv}) in ${winnerCount} of them, versus ${loserCount} where Spread ${loserLabel} comes out ahead (${bucket.ties} show no meaningful difference either way) — Spread ${winnerLabel} outperforms Spread ${loserLabel} in ${winnerCount - loserCount} more raids overall.`;
}

function headline(result: IvComparisonResult, ivA: IVSpread, ivB: IVSpread): string {
  const { fastMoveDamage, chargedMoveDamage, timeToFaint } = result.firstDivergenceLevel;
  if (fastMoveDamage === null && chargedMoveDamage === null && timeToFaint === null) {
    return `Spread A (${ivLabel(ivA)}) and Spread B (${ivLabel(ivB)}) are functionally identical at every level scanned against this target — no fast-move damage, charged-move damage, or time-to-faint difference appears anywhere in range. Powering up whichever spread is cheaper for you costs nothing here.`;
  }
  const parts: string[] = [];
  if (fastMoveDamage !== null) parts.push(`fast-move damage first becomes different at level ${fastMoveDamage}`);
  if (chargedMoveDamage !== null) parts.push(`charged-move damage first becomes different at level ${chargedMoveDamage}`);
  if (timeToFaint !== null) parts.push(`time-to-faint first becomes different at level ${timeToFaint}`);
  return `${parts.join("; ")}. This is the FIRST level any gap appears, not a permanent split — a gap can open and then close again at a higher level purely from floor-rounding, so check each row below rather than assuming the difference holds from this level on.`;
}

/**
 * "IV Breakpoints" — the IV/level-investment analogue of this project's core
 * "where does the ranking flip" thesis: compares TWO IV spreads of the SAME
 * species/moveset across levels 35 through 50 (see LEVELS_35_TO_50 — the
 * practically-relevant power-up range for a Pokémon a player already owns
 * and is deciding whether to keep investing in, not the full 1-50 range
 * `compareIvSpreads` supports by default), to answer "is it worth spending
 * candy/stardust to power up spread A over spread B, and if so starting at
 * what level". Built for a real motivating case: a user's two owned Delphox
 * (14/15/15 and 15/13/15) — see DEFAULT_IV_A/DEFAULT_IV_B.
 *
 * Thin UI over packages/engine/src/ivComparison.ts's compareIvSpreads
 * (already built and tested) — this view supplies the damage-modifier
 * objects (STAB/type-effectiveness/weather) that function needs, computed
 * with the exact same exported primitives (typeEffectiveness/isWeatherBoosted/
 * bossEffectiveStats/resolveMove) that comparison.ts's runSustainedComparison
 * uses internally, rather than re-deriving type effectiveness by hand.
 */
export function IvBreakpointsView() {
  const [assumptions, setAssumptions] = useState<IvBreakpointsAssumptions>(initialAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const speciesOptions = useMemo(() => candidatePickerOptions(), []);
  const targetOptions = useMemo(() => targetPickerOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);
  const allTargetOptions = useMemo(() => allSpeciesOptions(), []);

  const species = useMemo(() => resolveSpecies(assumptions.speciesId), [assumptions.speciesId]);
  const boss = useMemo(() => resolveSpecies(assumptions.targetId), [assumptions.targetId]);
  const bossRaidTier = useMemo(() => raidTierForSpeciesId(assumptions.targetId) ?? undefined, [assumptions.targetId]);

  // The attacker's resolved fast/charged move objects — shared by the
  // single-target `result` computation below AND the all-active-bosses sweep
  // (`bossSweep`), so both stay derived from the exact same move resolution
  // rather than two copies that could drift apart.
  const resolvedAttackerMoves = useMemo(() => {
    if (!species) return null;
    const fastMove = resolveMove(species.fastMoves, assumptions.fastMoveId);
    const chargedMove = resolveMove(species.chargedMoves, assumptions.chargedMoveId);
    if (!fastMove || !chargedMove) return null;
    return { fastMove, chargedMove };
  }, [species, assumptions.fastMoveId, assumptions.chargedMoveId]);

  // There is no user-selectable "combat phase" here either, same standing
  // decision as every other tab — though this simplified per-level model has
  // no phased combat at all (see the caveats section below): it treats the
  // target's incoming damage as its fast move landing repeatedly, forever,
  // with no charged-move combat modeled on either side of the matchup.
  const result = useMemo(() => {
    if (!species || !boss) return { data: null as IvComparisonResult | null, error: null as string | null };
    try {
      if (!resolvedAttackerMoves) throw new Error(`${species.name} needs at least one fast move and one charged move.`);
      const { fastMove, chargedMove } = resolvedAttackerMoves;
      const bossFastMove = resolveMove(boss.fastMoves, assumptions.bossFastMoveId);
      if (!bossFastMove) throw new Error(`${boss.name} has no fast move defined.`);

      const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(boss, bossRaidTier);

      const fastMoveDamageModifiers = {
        stab: species.types.includes(fastMove.type),
        typeEffectiveness: typeEffectiveness(fastMove.type, boss.types),
        weatherBoosted: isWeatherBoosted(fastMove.type, assumptions.weather),
      };
      const chargedMoveDamageModifiers = {
        stab: species.types.includes(chargedMove.type),
        typeEffectiveness: typeEffectiveness(chargedMove.type, boss.types),
        weatherBoosted: isWeatherBoosted(chargedMove.type, assumptions.weather),
      };
      const incomingDamageModifiers = {
        stab: boss.types.includes(bossFastMove.type),
        typeEffectiveness: typeEffectiveness(bossFastMove.type, species.types),
        weatherBoosted: isWeatherBoosted(bossFastMove.type, assumptions.weather),
      };

      return {
        data: compareIvSpreads({
          species,
          fastMove,
          chargedMove,
          ivA: assumptions.ivA,
          ivB: assumptions.ivB,
          bossDefenseStat,
          fastMoveDamageModifiers,
          chargedMoveDamageModifiers,
          bossAttackStat,
          bossFastMovePower: bossFastMove.power,
          bossFastMoveDurationSeconds: bossFastMove.durationSeconds,
          incomingDamageModifiers,
          dodge: assumptions.dodge,
          levels: LEVELS_35_TO_50,
        }),
        error: null as string | null,
      };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }, [
    species,
    boss,
    bossRaidTier,
    resolvedAttackerMoves,
    assumptions.bossFastMoveId,
    assumptions.ivA,
    assumptions.ivB,
    assumptions.dodge,
    assumptions.weather,
  ]);

  // The full-roster sweep: loops the exact same inline damage-modifier
  // construction the single-target `result` computation above uses
  // (STAB/type-effectiveness/weather via the same exported primitives), once
  // per EVERY registered species (not just the currently-active raid roster —
  // see IvSweepAggregate's doc comment), each with its OWN first fast move and
  // per-tier effective attack/defense (falling back to the engine's own
  // DEFAULT_REAL_RAID_TIER for anything not currently live, same convention
  // as bossEffectiveStats/SustainedComparisonInputs.bossRaidTier use
  // everywhere else — raidTierForSpeciesId returning null already triggers
  // that fallback via bossEffectiveStats' own `tier ?? DEFAULT_REAL_RAID_TIER`
  // default, so nothing extra needs importing here). No per-target move picker
  // exists for this sweep — that would be a UI control per species, which
  // this report deliberately doesn't need. Answers "which spread wins more
  // often across every raid target this tool can model" as a single tallied
  // verdict, not a per-target table — see tallyIvSpreadWins's doc comment for
  // exactly how one target's "winner" is decided.
  const sweepAggregate = useMemo<IvSweepAggregate>(() => {
    const empty: IvSweepAggregate = {
      totalComputed: 0,
      errorCount: 0,
      countA: 0,
      countB: 0,
      ties: 0,
      byTier: [],
      tier4Plus: { total: 0, countA: 0, countB: 0, ties: 0 },
    };
    if (!species || !resolvedAttackerMoves) return empty;
    const { fastMove, chargedMove } = resolvedAttackerMoves;
    let totalComputed = 0;
    let errorCount = 0;
    let countA = 0;
    let countB = 0;
    let ties = 0;
    // Per-tier buckets, keyed by the SAME resolved-tier string used to build
    // each target's boss stats below — populated lazily so only tiers that
    // actually have at least one computed target ever appear.
    const tierBuckets = new Map<RaidTier, IvSweepBucket>();
    const tier4Plus: IvSweepBucket = { total: 0, countA: 0, countB: 0, ties: 0 };
    for (const opt of allTargetOptions) {
      const bossSpecies = resolveSpecies(opt.id);
      if (!bossSpecies) {
        errorCount++;
        continue;
      }
      try {
        // Exact same resolution used everywhere else to build this target's
        // boss stats — required here too since bucketing needs the ACTUAL
        // resolved tier, not `undefined` (bossEffectiveStats' own internal
        // `?? DEFAULT_REAL_RAID_TIER` default is this same constant, so
        // passing it explicitly changes nothing about the computed stats).
        const tier = raidTierForSpeciesId(opt.id) ?? DEFAULT_REAL_RAID_TIER;
        const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(bossSpecies, tier);
        const bossFastMove = resolveMove(bossSpecies.fastMoves, null);
        if (!bossFastMove) throw new Error(`${bossSpecies.name} has no fast move defined.`);

        const fastMoveDamageModifiers = {
          stab: species.types.includes(fastMove.type),
          typeEffectiveness: typeEffectiveness(fastMove.type, bossSpecies.types),
          weatherBoosted: isWeatherBoosted(fastMove.type, assumptions.weather),
        };
        const chargedMoveDamageModifiers = {
          stab: species.types.includes(chargedMove.type),
          typeEffectiveness: typeEffectiveness(chargedMove.type, bossSpecies.types),
          weatherBoosted: isWeatherBoosted(chargedMove.type, assumptions.weather),
        };
        const incomingDamageModifiers = {
          stab: bossSpecies.types.includes(bossFastMove.type),
          typeEffectiveness: typeEffectiveness(bossFastMove.type, species.types),
          weatherBoosted: isWeatherBoosted(bossFastMove.type, assumptions.weather),
        };

        const cmp = compareIvSpreads({
          species,
          fastMove,
          chargedMove,
          ivA: assumptions.ivA,
          ivB: assumptions.ivB,
          bossDefenseStat,
          fastMoveDamageModifiers,
          chargedMoveDamageModifiers,
          bossAttackStat,
          bossFastMovePower: bossFastMove.power,
          bossFastMoveDurationSeconds: bossFastMove.durationSeconds,
          incomingDamageModifiers,
          dodge: assumptions.dodge,
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
      .sort((a, b) => a.tierNumeric - b.tierNumeric);
    return { totalComputed, errorCount, countA, countB, ties, byTier, tier4Plus };
  }, [species, resolvedAttackerMoves, allTargetOptions, assumptions.ivA, assumptions.ivB, assumptions.dodge, assumptions.weather]);

  function handleShare() {
    const url = new URL(
      buildIvBreakpointsScenarioUrl(window.location.href.split("?")[0]!, assumptionsToScenario(assumptions)),
    );
    url.searchParams.set("view", "iv-breakpoints");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  const overallError = result.error;
  const rows: IvComparisonRow[] = result.data?.rows ?? [];
  const divergingCounts = useMemo(
    () => ({
      fastMoveDamage: rows.filter((r) => r.fastMoveDamageDiffers).length,
      chargedMoveDamage: rows.filter((r) => r.chargedMoveDamageDiffers).length,
      timeToFaint: rows.filter((r) => r.timeToFaintDiffers).length,
    }),
    [rows],
  );
  // Display-order only — highest level first, per request. `compareIvSpreads`
  // itself always returns ascending; `rows` (used for the counts above and
  // the headline) is left untouched so nothing downstream of the raw
  // computation changes, only how the table below iterates it.
  const rowsForTable = useMemo(() => [...rows].reverse(), [rows]);

  return (
    <>
      <p className="subtitle">
        {species ? (
          <>
            <SpeciesIcon s={species} /> {speciesLabel(species)}
          </>
        ) : (
          "Pick a Pokémon"
        )}{" "}
        — Spread A ({ivLabel(assumptions.ivA)}) vs Spread B ({ivLabel(assumptions.ivB)}) vs{" "}
        {boss ? (
          <>
            <SpeciesIcon s={boss} /> {speciesLabel(boss)}
          </>
        ) : (
          "a target"
        )}{" "}
        — is it worth powering up one spread over the other, and starting at what level?
      </p>

      <section className="panel">
        <h2>Assumptions</h2>
        <div className="assumption-grid">
          <div>
            <SpeciesPicker
              idPrefix="iv-breakpoints-species"
              label="Pokémon (both spreads share this species and moveset)"
              options={speciesOptions}
              value={assumptions.speciesId}
              onChange={(id) =>
                // A previously-picked move id almost certainly doesn't exist
                // on the new species — reset both back to "use first move" in
                // the same update, same convention as the other three tabs.
                setAssumptions({ ...assumptions, speciesId: id, fastMoveId: null, chargedMoveId: null })
              }
            />
            {species && (
              <>
                <MoveSelect
                  idPrefix="iv-breakpoints-fast"
                  label="Fast move"
                  moves={species.fastMoves}
                  kind="fast"
                  value={assumptions.fastMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, fastMoveId: id })}
                />
                <MoveSelect
                  idPrefix="iv-breakpoints-charged"
                  label="Charged move"
                  moves={species.chargedMoves}
                  kind="charged"
                  value={assumptions.chargedMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, chargedMoveId: id })}
                />
              </>
            )}
          </div>

          <div>
            <p className="field-group-label">Spread A</p>
            <div className="iv-row">
              <div className="field">
                <label htmlFor="iv-breakpoints-a-attack">Attack IV</label>
                <input
                  id="iv-breakpoints-a-attack"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivA.attack}
                  onChange={(e) => setAssumptions({ ...assumptions, ivA: { ...assumptions.ivA, attack: Number(e.target.value) } })}
                />
              </div>
              <div className="field">
                <label htmlFor="iv-breakpoints-a-defense">Defense IV</label>
                <input
                  id="iv-breakpoints-a-defense"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivA.defense}
                  onChange={(e) => setAssumptions({ ...assumptions, ivA: { ...assumptions.ivA, defense: Number(e.target.value) } })}
                />
              </div>
              <div className="field">
                <label htmlFor="iv-breakpoints-a-stamina">Stamina IV</label>
                <input
                  id="iv-breakpoints-a-stamina"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivA.stamina}
                  onChange={(e) => setAssumptions({ ...assumptions, ivA: { ...assumptions.ivA, stamina: Number(e.target.value) } })}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="field-group-label">Spread B</p>
            <div className="iv-row">
              <div className="field">
                <label htmlFor="iv-breakpoints-b-attack">Attack IV</label>
                <input
                  id="iv-breakpoints-b-attack"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivB.attack}
                  onChange={(e) => setAssumptions({ ...assumptions, ivB: { ...assumptions.ivB, attack: Number(e.target.value) } })}
                />
              </div>
              <div className="field">
                <label htmlFor="iv-breakpoints-b-defense">Defense IV</label>
                <input
                  id="iv-breakpoints-b-defense"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivB.defense}
                  onChange={(e) => setAssumptions({ ...assumptions, ivB: { ...assumptions.ivB, defense: Number(e.target.value) } })}
                />
              </div>
              <div className="field">
                <label htmlFor="iv-breakpoints-b-stamina">Stamina IV</label>
                <input
                  id="iv-breakpoints-b-stamina"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivB.stamina}
                  onChange={(e) => setAssumptions({ ...assumptions, ivB: { ...assumptions.ivB, stamina: Number(e.target.value) } })}
                />
              </div>
            </div>
          </div>

          <div>
            <SpeciesPicker
              idPrefix="iv-breakpoints-target"
              label="Raid boss / target"
              options={targetOptions}
              value={assumptions.targetId}
              onChange={(id) => setAssumptions({ ...assumptions, targetId: id, bossFastMoveId: null })}
            />
            {boss && (
              <MoveSelect
                idPrefix="iv-breakpoints-boss-fast"
                label="Target's fast move"
                moves={boss.fastMoves}
                kind="fast"
                value={assumptions.bossFastMoveId}
                onChange={(id) => setAssumptions({ ...assumptions, bossFastMoveId: id })}
              />
            )}
          </div>

          <div className="field">
            <label htmlFor="iv-breakpoints-dodge">Dodge the target's attacks</label>
            <select
              id="iv-breakpoints-dodge"
              value={assumptions.dodge.kind}
              onChange={(e) => {
                const kind = e.target.value as DodgeBehavior["kind"];
                setAssumptions({
                  ...assumptions,
                  dodge: kind === "percentage-missed" ? { kind, missedFraction: 0.5 } : ({ kind } as DodgeBehavior),
                });
              }}
            >
              <option value="none">None</option>
              <option value="perfect">Perfect</option>
              <option value="percentage-missed">Percentage missed</option>
            </select>
          </div>

          {assumptions.dodge.kind === "percentage-missed" && (
            <div className="field">
              <label htmlFor="iv-breakpoints-missedFraction">Fraction of hits NOT dodged</label>
              <input
                id="iv-breakpoints-missedFraction"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={assumptions.dodge.missedFraction}
                onChange={(e) =>
                  setAssumptions({ ...assumptions, dodge: { kind: "percentage-missed", missedFraction: Number(e.target.value) } })
                }
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="iv-breakpoints-weather">Weather</label>
            <select
              id="iv-breakpoints-weather"
              value={assumptions.weather}
              onChange={(e) => setAssumptions({ ...assumptions, weather: e.target.value as WeatherCondition })}
              title="Boosts damage 1.2x for moves whose type matches the active weather — applies independently to this species' and the target's own moves, checked per move's own type."
            >
              {WEATHER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {unmatchedRaids.length > 0 && (
          <p className="species-picker-hint" title="These raids are currently active but have no usable stat data yet.">
            Other raids currently live in-game that this tool can't target yet (no stat data available):{" "}
            {unmatchedRaids.map((r) => `${r.raidName} (${r.tier})`).join(", ")}
          </p>
        )}
      </section>

      {species && resolvedAttackerMoves && sweepAggregate.totalComputed > 0 && (
        <section className="panel">
          <h2>Impact across every raid target this tool can model</h2>
          <p className="crossover-note">
            {bucketVerdictSentence(
              sweepAggregate.tier4Plus,
              assumptions.ivA,
              assumptions.ivB,
              `Across the ${sweepAggregate.tier4Plus.total} tier-4-and-higher raid targets this tool can model (Mega Raids, 5-Star Raids, Legendary Mega Raids, Primal Raids, and Super Mega Raids — 1-Star and 3-Star Raids excluded)`,
            )}
          </p>

          <p className="field-group-label" style={{ marginTop: 12 }}>
            Breakdown by raid tier (every tier, not just tier 4+)
          </p>
          <div style={{ overflowX: "auto", margin: "4px 0 12px" }}>
            <table className="time-series-table">
              <thead>
                <tr>
                  <th>Raid tier</th>
                  <th>Targets</th>
                  <th>Spread A wins</th>
                  <th>Spread B wins</th>
                  <th>Ties</th>
                </tr>
              </thead>
              <tbody>
                {sweepAggregate.byTier.map((row) => (
                  <tr key={row.tier}>
                    <td>
                      {row.tier} (tier {row.tierNumeric}){!TIER_4_PLUS_LABELS.has(row.tier) && " — excluded from headline above"}
                    </td>
                    <td>{row.total}</td>
                    <td>{row.countA}</td>
                    <td>{row.countB}</td>
                    <td>{row.ties}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="caveats" style={{ margin: "8px 0 12px" }}>
            "Outperforms" here means: for every level and every one of fast-move damage/charged-move damage/
            time-to-faint (all three "higher is better"), tally which spread has the strictly higher value at that
            level (a tie contributes to neither), then sum those tallies across all levels for that target — whichever
            spread has the higher total tally is the winner for that target; equal tallies (including never
            diverging at all) count as a tie. This is summed and counted once per target species, then partitioned by
            each target's own resolved raid tier (<code>raidTierForSpeciesId(id) ?? DEFAULT_REAL_RAID_TIER</code> — the
            same resolution used to build that target's boss stats everywhere else in this tool). The headline
            sentence above only aggregates the tier-4-and-higher buckets from the table; the table itself shows every
            tier this sweep actually populated, including 1-Star/3-Star. This is NOT a claim about every raid boss
            that has ever existed — see the caveats section below.
            {sweepAggregate.errorCount > 0 &&
              ` ${sweepAggregate.errorCount} registered species could not be computed (missing moveset data) and are excluded from the totals above.`}
          </p>
          <p className="caveats" style={{ margin: "8px 0 12px" }}>
            Honest limitation: any species that isn't a currently-active real raid boss defaults to the standard
            5-Star Raids tier (see the engine's <code>DEFAULT_REAL_RAID_TIER</code>) — itself already tier 5, already
            inside the tier-4-and-up scope above — so this tier restriction's practical effect on today's numbers is
            narrow. It excludes {sweepAggregate.totalComputed - sweepAggregate.tier4Plus.total} of the{" "}
            {sweepAggregate.totalComputed} modeled targets above, all of them 1-Star/3-Star entries from the handful
            of raids currently live in the real rotation — the remaining {sweepAggregate.tier4Plus.total} targets
            (the vast majority of the sweep) were never going to be excluded by this filter regardless, since a
            species with no live raid data defaults straight to tier 5, not to an unknown tier.
          </p>
        </section>
      )}

      {overallError && (
        <section className="panel">
          <p style={{ color: "#ff6b6b" }}>Could not compute this comparison: {overallError}</p>
        </section>
      )}

      {result.data && species && (
        <section className="panel">
          <h2>Per-level breakdown</h2>
          <p className="crossover-note">{headline(result.data, assumptions.ivA, assumptions.ivB)}</p>
          <p className="caveats" style={{ margin: "8px 0 12px" }}>
            {divergingCounts.fastMoveDamage} of {rows.length} levels show a fast-move damage difference,{" "}
            {divergingCounts.chargedMoveDamage} of {rows.length} show a charged-move damage difference, and{" "}
            {divergingCounts.timeToFaint} of {rows.length} show a time-to-faint difference. Divergent cells are
            highlighted below, with the higher value in each diverging pair bolded.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="time-series-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Level</th>
                  <th colSpan={5} className="time-series-th-x">
                    Spread A ({ivLabel(assumptions.ivA)})
                  </th>
                  <th colSpan={5} className="time-series-th-y">
                    Spread B ({ivLabel(assumptions.ivB)})
                  </th>
                </tr>
                <tr>
                  <th className="time-series-th-x">Atk/Def/HP</th>
                  <th className="time-series-th-x">Fast dmg</th>
                  <th className="time-series-th-x">Charged dmg</th>
                  <th className="time-series-th-x" colSpan={2}>
                    Time to faint
                  </th>
                  <th className="time-series-th-y">Atk/Def/HP</th>
                  <th className="time-series-th-y">Fast dmg</th>
                  <th className="time-series-th-y">Charged dmg</th>
                  <th className="time-series-th-y" colSpan={2}>
                    Time to faint
                  </th>
                </tr>
              </thead>
              <tbody>
                {rowsForTable.map((row) => {
                  const fmtTtf = (v: number | null) => (v === null ? `>${60}s` : `${v.toFixed(1)}s`);
                  const fastWinner =
                    row.fastMoveDamageDiffers && row.ivA.fastMoveDamage !== row.ivB.fastMoveDamage
                      ? row.ivA.fastMoveDamage > row.ivB.fastMoveDamage
                        ? "a"
                        : "b"
                      : null;
                  const chargedWinner =
                    row.chargedMoveDamageDiffers && row.ivA.chargedMoveDamage !== row.ivB.chargedMoveDamage
                      ? row.ivA.chargedMoveDamage > row.ivB.chargedMoveDamage
                        ? "a"
                        : "b"
                      : null;
                  const ttfWinner =
                    row.timeToFaintDiffers
                      ? (row.ivA.timeToFaintSeconds ?? Infinity) > (row.ivB.timeToFaintSeconds ?? Infinity)
                        ? "a"
                        : (row.ivA.timeToFaintSeconds ?? Infinity) < (row.ivB.timeToFaintSeconds ?? Infinity)
                          ? "b"
                          : null
                      : null;
                  return (
                    <tr key={row.level}>
                      <td>{row.level}</td>
                      <td>
                        {row.ivA.attackStat}/{row.ivA.defenseStat}/{row.ivA.hp}
                      </td>
                      <td className={row.fastMoveDamageDiffers ? "iv-cell-diverges" : undefined}>
                        <span className={fastWinner === "a" ? "iv-cell-winner" : undefined}>{row.ivA.fastMoveDamage}</span>
                      </td>
                      <td className={row.chargedMoveDamageDiffers ? "iv-cell-diverges" : undefined}>
                        <span className={chargedWinner === "a" ? "iv-cell-winner" : undefined}>{row.ivA.chargedMoveDamage}</span>
                      </td>
                      <td className={row.timeToFaintDiffers ? "iv-cell-diverges" : undefined} colSpan={2}>
                        <span className={ttfWinner === "a" ? "iv-cell-winner" : undefined}>{fmtTtf(row.ivA.timeToFaintSeconds)}</span>
                      </td>
                      <td>
                        {row.ivB.attackStat}/{row.ivB.defenseStat}/{row.ivB.hp}
                      </td>
                      <td className={row.fastMoveDamageDiffers ? "iv-cell-diverges" : undefined}>
                        <span className={fastWinner === "b" ? "iv-cell-winner" : undefined}>{row.ivB.fastMoveDamage}</span>
                      </td>
                      <td className={row.chargedMoveDamageDiffers ? "iv-cell-diverges" : undefined}>
                        <span className={chargedWinner === "b" ? "iv-cell-winner" : undefined}>{row.ivB.chargedMoveDamage}</span>
                      </td>
                      <td className={row.timeToFaintDiffers ? "iv-cell-diverges" : undefined} colSpan={2}>
                        <span className={ttfWinner === "b" ? "iv-cell-winner" : undefined}>{fmtTtf(row.ivB.timeToFaintSeconds)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Share this scenario</h2>
        <div className="share-row">
          <button onClick={handleShare}>Build link</button>
          {shareUrl && <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />}
        </div>
      </section>

      <section className="panel">
        <h2>Known caveats</h2>
        <p className="caveats">
          Both the per-level table below and the all-raid-targets report above only check levels 35 through 50 (in
          the usual 0.5 steps, 31 levels total) — the range a player already investing candy/stardust into a
          specific Pokémon actually cares about, not the full 1-50 range this engine can compute. This is a fixed
          scope for this tab, not a setting.
        </p>
        <p className="caveats">
          This is a deliberately simpler model than the Comparator/Team Raid/Species Report tabs' full randomized
          stepwise simulator: the target's incoming damage here is modeled as its FAST move landing repeatedly,
          forever (see engine's ivComparison.ts/breakpoints.ts timeToFaint) — there is no charged-move combat on
          either side of this matchup, and no randomized boss charged-move timing to average over. That's what makes
          it cheap enough to sweep every level in one pass; for a full simulated fight at one specific level, use the
          Comparator tab instead. "Time to faint" shows "&gt;60s" when a spread would outlast this model's 60-second
          scan window. Divergence between two spreads is NOT monotonic across levels — floor-rounding can make two
          different raw stats collapse to the same floored effective stat (or the same floored damage) at one level
          and then diverge again at the next, so a gap opening at one level is not a promise it stays open above it;
          the per-level table is the source of truth, not the headline sentence above it. This view does not model a
          mega/primal species' own-damage boost multiplier at all — pick a non-mega, non-primal species for an exact
          match, or use the Comparator/Species Report tabs for a mega-form species. Raid targets marked "approximate"
          use a documented stand-in species' stats because no better data exists yet — treat those results as
          directional, not exact. The "impact across every raid target this tool can model" report above sweeps
          every registered species (not just the currently-active raid roster) using each target's OWN first fast
          move (there is no per-target fast-move picker for that sweep, unlike the single selected target below
          which honors your explicit fast-move pick) — if a target normally uses several fast moves in rotation,
          only the first one registered for it is checked there. That report is a count of how many modelable
          targets each spread comes out ahead against, not a historical "every raid boss that has ever existed"
          dataset — no such dataset exists for this tool (see the Species Report tab's own documented scope for the
          same limitation).
        </p>
      </section>
    </>
  );
}
