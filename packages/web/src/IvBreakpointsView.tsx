import { useMemo, useState } from "react";
import {
  type DodgeBehavior,
  type IVSpread,
  type IvComparisonRow,
  type SpeciesDefinition,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { IvBreakpointsAssumptionPanel } from "./IvBreakpointsAssumptionPanel.js";
import { IvPerLevelTable } from "./IvPerLevelTable.js";
import { IvSweepReport } from "./IvSweepReport.js";
import { ivLabel } from "./ivBreakpointsHelpers.js";
import {
  buildIvBreakpointsScenarioUrl,
  parseIvBreakpointsScenarioFromUrl,
  type IvBreakpointsScenario,
} from "./ivBreakpointsScenario.js";
import { SpeciesBadges } from "./SpeciesBadges.js";
import { effectiveIsShadow } from "./shadowToggle.js";
import { getBaseUrl } from "./urlUtils.js";
import { candidatePickerOptions, speciesRegistry, targetPickerOptions, unmatchedActiveRaids } from "./registry.js";
import { runIvBreakpointsScenario } from "./run/runIvBreakpoints.js";

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
  /** See IvBreakpointsScenario.isShadow — one shared toggle for both spreads (same species/moveset). */
  isShadow: boolean;
}

export const DEFAULT_ASSUMPTIONS: IvBreakpointsAssumptions = {
  speciesId: DEFAULT_SPECIES_ID,
  fastMoveId: null,
  chargedMoveId: null,
  ivA: DEFAULT_IV_A,
  ivB: DEFAULT_IV_B,
  targetId: DEFAULT_TARGET_ID,
  bossFastMoveId: null,
  dodge: { kind: "perfect" },
  weather: "none",
  isShadow: false,
};

export function assumptionsToScenario(a: IvBreakpointsAssumptions): IvBreakpointsScenario {
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
    isShadow: a.isShadow,
  };
}

export function scenarioToAssumptions(s: IvBreakpointsScenario): IvBreakpointsAssumptions {
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
    isShadow: s.isShadow ?? DEFAULT_ASSUMPTIONS.isShadow,
  };
}

/** Forces isShadow back to false whenever the currently-selected species carries a mega/primal boost — same discipline as ComparatorView's normalizeAssumptions/TeamRaidView's normalizeTeamAssumptions. */
export function normalizeAssumptions(a: IvBreakpointsAssumptions): IvBreakpointsAssumptions {
  const sp = resolveSpecies(a.speciesId);
  if (!sp?.boost || !a.isShadow) return a;
  return { ...a, isShadow: false };
}

function initialAssumptions(): IvBreakpointsAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parseIvBreakpointsScenarioFromUrl(window.location.href);
  return fromUrl ? normalizeAssumptions(scenarioToAssumptions(fromUrl)) : DEFAULT_ASSUMPTIONS;
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
  const [assumptions, setAssumptionsRaw] = useState<IvBreakpointsAssumptions>(initialAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function setAssumptions(next: IvBreakpointsAssumptions) {
    setAssumptionsRaw(normalizeAssumptions(next));
  }

  const speciesOptions = useMemo(() => candidatePickerOptions(), []);
  const targetOptions = useMemo(() => targetPickerOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);

  // The entire engine-facing computation (species resolution, Shadow
  // application, the single-target per-level comparison, AND the
  // full-roster sweep aggregate) lives in runIvBreakpointsScenario
  // (run/runIvBreakpoints.ts) — a pure, React-free function shared with the
  // run-scenario CLI and this tab's own vitest smoke test. Aliased back to
  // their original names so the render code below needs no changes at all.
  const runResult = useMemo(() => runIvBreakpointsScenario(assumptions, speciesRegistry), [assumptions]);
  const species = runResult.species;
  const boss = runResult.boss;
  const resolvedAttackerMoves = runResult.resolvedAttackerMoves;
  const result = { data: runResult.data, error: runResult.error };
  const sweepAggregate = runResult.sweepAggregate;

  function handleShare() {
    const url = new URL(buildIvBreakpointsScenarioUrl(getBaseUrl(), assumptionsToScenario(assumptions)));
    url.searchParams.set("view", "iv-breakpoints");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  const overallError = result.error;
  const rows: IvComparisonRow[] = useMemo(() => runResult.data?.rows ?? [], [runResult.data]);
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
            <SpeciesBadges isHypothetical={species.isHypothetical} isShadow={effectiveIsShadow(species, assumptions.isShadow)} />
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
          <p className="error-text">Could not compute this comparison: {overallError}</p>
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

      <CollapsibleSection id="iv-breakpoints-known-caveats" heading="Known caveats" defaultOpen={false}>
        <p className="caveats note-block">
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
      </CollapsibleSection>
    </>
  );
}
