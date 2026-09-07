import { useMemo, useState } from "react";
import {
  bossEffectiveStats,
  compareIvSpreads,
  defaultRaidTierForSpecies,
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
import { IvBreakpointsAssumptionPanel } from "./IvBreakpointsAssumptionPanel.js";
import { IvPerLevelTable } from "./IvPerLevelTable.js";
import { IvSweepReport } from "./IvSweepReport.js";
import {
  LEVELS_35_TO_50,
  RAID_TIER_NUMERIC,
  TIER_4_PLUS_LABELS,
  bucketVerdictSentence,
  headline,
  ivLabel,
  tallyIvSpreadWins,
  type IvSweepAggregate,
  type IvSweepBucket,
  type IvSweepTierRow,
} from "./ivBreakpointsHelpers.js";
import {
  buildIvBreakpointsScenarioUrl,
  parseIvBreakpointsScenarioFromUrl,
  type IvBreakpointsScenario,
} from "./ivBreakpointsScenario.js";
import { getBaseUrl } from "./urlUtils.js";
import {
  allSpeciesOptions,
  candidatePickerOptions,
  raidTierForSpeciesId,
  speciesRegistry,
  targetPickerOptions,
  unmatchedActiveRaids,
} from "./registry.js";

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

// ivLabel, tallyIvSpreadWins, IvSweepBucket/IvSweepTierRow/IvSweepAggregate,
// bucketVerdictSentence, and headline all now live in ivBreakpointsHelpers.ts
// (imported above) — relocated, not removed, so IvSweepReport.tsx/
// IvPerLevelTable.tsx can reuse them without importing from this view file.

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
  // per-rarity `defaultRaidTierForSpecies` for anything not currently live —
  // STANDARD species default to "3-Star Raids", LEGENDARY to "5-Star Raids",
  // mega/primal-boosted to "Mega Raids", everything else to the old blanket
  // "5-Star Raids" last resort. This tier is resolved explicitly here (unlike
  // the single-target `result` above, which passes `?? undefined` and lets
  // bossEffectiveStats apply the same default internally) because bucketing
  // below needs the ACTUAL resolved tier as a map key, not `undefined`.
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
        // Live tier if this target is currently an active raid boss; otherwise
        // the engine's own per-rarity default for this specific species (see
        // the comment above this loop) — passing it explicitly here changes
        // nothing about the computed stats vs. bossEffectiveStats' own
        // internal fallback, since that's the same function.
        const tier = raidTierForSpeciesId(opt.id) ?? defaultRaidTierForSpecies(bossSpecies);
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
    const url = new URL(buildIvBreakpointsScenarioUrl(getBaseUrl(), assumptionsToScenario(assumptions)));
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

      <IvBreakpointsAssumptionPanel
        assumptions={assumptions}
        setAssumptions={setAssumptions}
        speciesOptions={speciesOptions}
        targetOptions={targetOptions}
        unmatchedRaids={unmatchedRaids}
        species={species}
        boss={boss}
      />

      {species && resolvedAttackerMoves && sweepAggregate.totalComputed > 0 && (
        <IvSweepReport sweepAggregate={sweepAggregate} ivA={assumptions.ivA} ivB={assumptions.ivB} />
      )}

      {overallError && (
        <section className="panel">
          <p style={{ color: "#ff6b6b" }}>Could not compute this comparison: {overallError}</p>
        </section>
      )}

      {result.data && species && (
        <IvPerLevelTable
          data={result.data}
          ivA={assumptions.ivA}
          ivB={assumptions.ivB}
          rows={rows}
          rowsForTable={rowsForTable}
          divergingCounts={divergingCounts}
        />
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
