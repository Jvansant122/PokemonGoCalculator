import { useMemo } from "react";
import {
  MAX_TEAM_RAID_SLOTS,
  type EliteTmCandidate,
  type EliteTmKind,
  type PowerUpCandidate,
  type SpeciesDefinition,
} from "@pogo-analyzer/engine";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { BOSS_CADENCE_HINT } from "./bossCadence.js";
import { MEGA_LEVEL_HINT } from "./megaLevelSelect.js";
import { efficiencyForRankBy } from "./powerUpCandidateSort.js";
import type { PowerUpRankBy } from "./powerUpOptimizerScenario.js";
import {
  blockedCandidateSentence,
  budgetStopReasonSentence,
  formatResourceSplit,
  noAffordableImprovementSentence,
  rankByLabel,
  speciesLabel,
} from "./powerUpOptimizerSentences.js";
import { getBaseUrl } from "./urlUtils.js";
import { powerUpCostsFetchedAt } from "./registry.js";
import type {
  EliteTmBlockedSlot,
  PowerUpOptimizerRunResult,
  SecondChargedMoveBlockedSlot,
  SecondChargedMoveCandidateDisplay,
} from "./run/runPowerUpOptimizer.js";

/**
 * Single-raid mode's ranked-candidate row model (`RankedCandidateRow` and its
 * two builders/comparator) plus its whole results area (fixed-budget plan +
 * baseline/ladder/recommendation/ranked-candidates/Elite-TM/known-caveats) —
 * extracted from PowerUpOptimizerView.tsx 2026-09-14 as a navigability pass
 * over a 2,984-line view file, no behavior change. Mirrors how multi-raid
 * mode's own results already live in MultiRaidResultsSection.tsx rather than
 * inline. Kept together (rather than splitting the row model from the
 * section that renders it) because `PowerUpOptimizerView()` itself only
 * touches these to build `visibleCandidates` before handing it straight to
 * `SingleRaidResultsSection` below — same "row-building and its one consumer
 * belong in one file" reasoning as MultiRaidResultsSection.tsx's own
 * `MULTI_RAID_TABLE_INITIAL_ROWS`/`rosterCandidateEfficiency`.
 */

/**
 * A single row of the "Ranked power-up candidates" table, normalized from
 * EITHER a `PowerUpCandidate` (an ordinary power-up step) OR a
 * `SecondChargedMoveCandidateDisplay` (a second-charged-move unlock) — the
 * two draw on the SAME stardust/candy budget (PLAN_tm_move_change_optimizer.md's
 * own framing for why they belong in one ranked list), unlike an Elite TM
 * candidate, which spends a wholly separate, non-fungible item and gets its
 * own section below instead (never merged here — see CLAUDE.md's standing
 * decision against blending non-fungible resources into one score).
 */
export interface RankedCandidateRow {
  key: string;
  kind: "power-up" | "second-charged-move";
  slotIndex: number;
  speciesName: string;
  /** "25 → 25.5" for a power-up, "—" for a second-charged-move unlock (no level change). */
  levelRange: string;
  /** null for a power-up (nothing to name); "2nd charged move: Icy Wind" for a move change. */
  change: string | null;
  deltaTeamDps: number;
  deltaExceedsNoise: boolean;
  deltaTeamDpsPer1000Stardust: number | null;
  deltaTeamDpsPerCandy: number | null;
  deltaTeamDpsPerXlCandy: number | null;
  cost: { stardust: number; candy: number; xlCandy: number };
  affordable: boolean;
  crossesFastBreakpoint: boolean;
  crossesChargedBreakpoint: boolean;
}

export function powerUpCandidateToRow(c: PowerUpCandidate): RankedCandidateRow {
  return {
    key: `pu-${c.slotIndex}-${c.toLevel}`,
    kind: "power-up",
    slotIndex: c.slotIndex,
    speciesName: c.speciesName,
    levelRange: `${c.fromLevel} → ${c.toLevel}`,
    change: null,
    deltaTeamDps: c.deltaTeamDps,
    deltaExceedsNoise: c.deltaExceedsNoise,
    deltaTeamDpsPer1000Stardust: c.deltaTeamDpsPer1000Stardust,
    deltaTeamDpsPerCandy: c.deltaTeamDpsPerCandy,
    deltaTeamDpsPerXlCandy: c.deltaTeamDpsPerXlCandy,
    cost: c.cost,
    affordable: c.affordable,
    crossesFastBreakpoint: c.crossesFastBreakpoint,
    crossesChargedBreakpoint: c.crossesChargedBreakpoint,
  };
}

export function secondChargedMoveCandidateToRow(c: SecondChargedMoveCandidateDisplay): RankedCandidateRow {
  return {
    key: `scm-${c.slotIndex}-${c.newChargedMoveId}`,
    kind: "second-charged-move",
    slotIndex: c.slotIndex,
    speciesName: c.speciesName,
    levelRange: "—",
    change: `2nd charged move: ${c.newChargedMoveName}`,
    deltaTeamDps: c.deltaTeamDps,
    deltaExceedsNoise: c.deltaExceedsNoise,
    deltaTeamDpsPer1000Stardust: c.deltaTeamDpsPer1000Stardust,
    deltaTeamDpsPerCandy: c.deltaTeamDpsPerCandy,
    // A second charged move is never paid in XL Candy — see toPowerUpResourceCost.
    deltaTeamDpsPerXlCandy: null,
    cost: { stardust: c.cost.stardust, candy: c.cost.candy, xlCandy: 0 },
    affordable: c.affordable,
    crossesFastBreakpoint: false,
    crossesChargedBreakpoint: false,
  };
}

export function rankedRowEfficiency(row: RankedCandidateRow, rankBy: PowerUpRankBy): number | null {
  return efficiencyForRankBy(rankBy, row.deltaTeamDpsPer1000Stardust, row.deltaTeamDpsPerCandy, row.deltaTeamDpsPerXlCandy);
}

export const CANDIDATE_TABLE_INITIAL_ROWS = 30;

interface SingleRaidBudgetPlanSectionProps {
  plan: NonNullable<PowerUpOptimizerRunResult["plan"]>;
  slotSpecies: (SpeciesDefinition | null)[];
  /** See SingleRaidResultsSectionProps' own field of the same name — this section shares the exact same lockout state, since it's re-simulating the same roster/boss/toggle pairing. */
  dodgeFastAttacksLockoutActive: boolean;
  fastAttackLockoutResultNote: string | null;
}

/**
 * Single-raid mode's fixed-budget power-up plan — extracted verbatim from
 * what used to render inline in PowerUpOptimizerView's own JSX (no behavior
 * change), mirroring how MultiRaidBudgetPlanSection is its own component
 * alongside MultiRaidResultsSection. Rendered by SingleRaidResultsSection at
 * the EXACT position it always occupied (between "Recommendation" and
 * "Ranked power-up candidates") rather than hoisted to a trailing sibling
 * section the way multi-raid's budget plan is — unlike multi-raid, this
 * plan has always appeared inline between those two, and moving it after
 * the ranked table would be a real, if small, ordering change.
 */
function SingleRaidBudgetPlanSection({
  plan,
  slotSpecies,
  dodgeFastAttacksLockoutActive,
  fastAttackLockoutResultNote,
}: SingleRaidBudgetPlanSectionProps) {
  return (
    <CollapsibleSection id="pu-single-budget-plan" heading="Fixed-budget power-up plan" defaultOpen>
      <p className="caveats" style={{ marginBottom: 12 }}>
        A DIFFERENT question than the ranked table below: given your WHOLE stardust/Rare
        Candy/Rare Candy XL budget across every fielded slot at once (not one candidate at
        a time), what SET of power-ups should you make? A greedy multi-slot search — a
        step is only committed once its own marginal team-DPS gain measurably beats the
        noise floor. That floor is re-measured from the roster's own seed-to-seed variance
        after every committed step rather than fixed once at the start, because powering a
        roster up changes how much it varies run to run — so steps within one plan can be
        held to different bars, and each step below shows the one it actually had to clear.
        The ±{plan.noiseFloorTeamDps.toFixed(2)} quoted elsewhere in this section is
        the FINAL floor, in effect when the search stopped.
      </p>

      {dodgeFastAttacksLockoutActive && fastAttackLockoutResultNote && (
        <p className="species-picker-warning">{fastAttackLockoutResultNote}</p>
      )}

      {plan.bestBlockedCandidate ? (
        <div className="blocked-gain-callout">
          <strong>Blocked, not done</strong>
          {blockedCandidateSentence(plan.bestBlockedCandidate)} This plan stopped
          here because that upgrade isn't affordable yet — not because it wouldn't help.
        </div>
      ) : dodgeFastAttacksLockoutActive ? (
        <div className="blocked-gain-callout">
          <strong>Can&rsquo;t be judged right now</strong>
          Every simulated step above reads as ≈0 team DPS because of the dodge lockout
          noted above, not because this plan is genuinely finished — resolve the lockout
          (or turn off &ldquo;Also dodge boss&rsquo;s fast attacks?&rdquo;) before trusting
          this &ldquo;nothing further helps&rdquo; conclusion.
        </div>
      ) : (
        <div className="blocked-gain-callout">
          <strong>Nothing further measurably helps</strong>
          Beyond the steps below, no further useful power-up anywhere on this roster clears
          the ±{plan.noiseFloorTeamDps.toFixed(2)} team-DPS noise floor against this
          boss and budget — this plan is genuinely done, not just out of money.
        </div>
      )}

      {plan.bestBuddyRecommendation && (
        <div className="blocked-gain-callout" style={{ borderLeftColor: "var(--info)" }}>
          <strong style={{ color: "var(--info)" }}>Best Buddy recommendation (free — no stardust/candy)</strong>
          Slot {plan.bestBuddyRecommendation.slotIndex + 1} ({plan.bestBuddyRecommendation.speciesName}): +
          {plan.bestBuddyRecommendation.deltaTeamDps.toFixed(2)} team DPS if made your active Best Buddy, evaluated
          against the roster AFTER every step above. This is the single, joint pick — honoring the real one-Best-Buddy-
          per-trainer limit the ranked list above deliberately does not enforce. &ldquo;Free&rdquo; means no
          stardust/candy cost tracked here; the real walking distance to earn it is not modelled.
        </div>
      )}

      <div className="result-card">
        <dl>
          <dt>Baseline team DPS (roster as-is)</dt>
          <dd>{plan.baseline.teamDps.toFixed(2)}</dd>
          <dt>Final team DPS (after this plan)</dt>
          <dd>{plan.final.teamDps.toFixed(2)}</dd>
          <dt>Change</dt>
          <dd>
            {plan.final.teamDps >= plan.baseline.teamDps ? "+" : ""}
            {(plan.final.teamDps - plan.baseline.teamDps).toFixed(2)} team DPS
            {plan.baseline.teamDps > 0 &&
              ` (${(((plan.final.teamDps - plan.baseline.teamDps) / plan.baseline.teamDps) * 100).toFixed(1)}% over baseline)`}
          </dd>
          <dt title="Fraction of simulated runs that clear the boss within the raid timer, BEFORE this plan">Baseline clear rate</dt>
          <dd>{(plan.baseline.clearRate * 100).toFixed(0)}%</dd>
          <dt title="Fraction of simulated runs that clear the boss within the raid timer, AFTER committing every step below — the question this plan's stardust/candy spend actually answers, not just its DPS gain">
            Clear rate after this plan
          </dt>
          <dd>
            {(plan.final.clearRate * 100).toFixed(0)}%
            {plan.final.clearRate === 0 && " — still doesn't clear"}
            {plan.final.meanTimeToClearSeconds !== null && ` (avg ${plan.final.meanTimeToClearSeconds.toFixed(1)}s to clear)`}
          </dd>
          <dt>Stardust spent</dt>
          <dd>
            {plan.ledger.stardust.spent.toLocaleString()} ({plan.ledger.stardust.remaining.toLocaleString()}{" "}
            left)
          </dd>
          <dt>Shared Rare Candy spent</dt>
          <dd>
            {plan.ledger.sharedRareCandy.spent} ({plan.ledger.sharedRareCandy.remaining} left)
          </dd>
          <dt>Shared Rare Candy XL spent</dt>
          <dd>
            {plan.ledger.sharedRareCandyXl.spent} ({plan.ledger.sharedRareCandyXl.remaining} left)
          </dd>
        </dl>
      </div>

      {plan.steps.length > 0 ? (
        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table className="time-series-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Slot</th>
                <th>Species</th>
                <th>Level</th>
                <th>Stardust</th>
                <th>Candy</th>
                <th>XL candy</th>
                <th>Δ team DPS</th>
                <th>Noise floor cleared</th>
                <th>Team DPS after</th>
              </tr>
            </thead>
            <tbody>
              {plan.steps.map((step, i) => (
                <tr key={`${step.slotIndex}-${step.toLevel}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{step.slotIndex + 1}</td>
                  <td>{step.speciesName}</td>
                  <td>
                    {step.fromLevel} → {step.toLevel}
                  </td>
                  <td>{step.cost.stardust.toLocaleString()}</td>
                  <td>{formatResourceSplit(step.ownCandySpent, step.sharedCandySpent, "Rare")}</td>
                  <td>{formatResourceSplit(step.ownXlCandySpent, step.sharedXlCandySpent, "Rare XL")}</td>
                  <td>
                    +{step.deltaTeamDps.toFixed(2)}
                  </td>
                  {/* The floor in effect for THIS step's round, not the plan's final
                      one — re-measured from the roster's variance after every commit,
                      so it legitimately differs down the table. */}
                  <td title="The noise floor this step had to beat, measured from the roster as it stood at that point in the plan">
                    ±{step.noiseFloorTeamDps.toFixed(2)}
                  </td>
                  <td>{step.cumulativeTeamDps.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="caveats" style={{ marginTop: 12, color: "var(--text)" }}>
          No power-up was added to this plan.
        </p>
      )}

      <p className="caveats" style={{ marginTop: 12, color: "var(--text)" }}>
        {budgetStopReasonSentence(plan.stopReason, plan.noiseFloorTeamDps)}
      </p>

      <h3 style={{ marginTop: 16 }}>What's left, per slot</h3>
      <div className="result-row" style={{ flexWrap: "wrap" }}>
        {slotSpecies.map((species, i) => {
          const finalLevel = plan.finalLevels[i];
          const ownCandy = plan.ledger.ownCandy[i];
          const ownXl = plan.ledger.ownXlCandy[i];
          if (!species || !finalLevel || !ownCandy || !ownXl) return null;
          return (
            <div className="result-card" key={i} style={{ minWidth: 220 }}>
              <h3>
                Slot {i + 1}: {species.name}
              </h3>
              <dl>
                <dt>Level</dt>
                <dd>
                  {finalLevel.fromLevel} → {finalLevel.toLevel}
                </dd>
                <dt>Own candy remaining</dt>
                <dd>{ownCandy.remaining}</dd>
                <dt>Own XL candy remaining</dt>
                <dd>{ownXl.remaining}</dd>
              </dl>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

interface SingleRaidResultsSectionProps {
  error: string | null;
  bossSpecies: SpeciesDefinition | null;
  hasFieldedSlot: boolean;
  slotSpecies: (SpeciesDefinition | null)[];
  data: PowerUpOptimizerRunResult["data"];
  plan: PowerUpOptimizerRunResult["plan"];
  isOptimizerPending: boolean;
  rankBy: PowerUpRankBy;
  showAllCandidates: boolean;
  onToggleShowAllCandidates: () => void;
  visibleCandidates: RankedCandidateRow[];
  sortedCandidatesCount: number;
  secondChargedMoveBlocked: SecondChargedMoveBlockedSlot[];
  eliteTmCandidates: EliteTmCandidate[];
  eliteTmBlocked: EliteTmBlockedSlot[];
  eliteFastTmOnHand: number | null;
  eliteChargedTmOnHand: number | null;
  /** See dodgeFastAttackLockout.ts and noAffordableImprovementSentence's own doc comment — computed once in the top-level view (from assumptions + bossSpecies alone, never from `data`) and threaded down here and into SingleRaidBudgetPlanSection so both surfaces agree. */
  dodgeFastAttacksLockoutActive: boolean;
  fastAttackLockoutResultNote: string | null;
}

/**
 * "your 2 Elite Fast TMs, best 2 targets" / "unknown Elite Fast TM count —
 * showing every ranked candidate" — the plan's own explicit framing (PLAN
 * §"Elite TM"). `onHand === null` (unknown) never hides a row, only changes
 * the heading and which rows get the "within your stock" marker.
 */
function eliteTmHeading(kind: EliteTmKind, onHand: number | null, count: number): string {
  const label = kind === "fast" ? "Elite Fast TM" : "Elite Charged TM";
  if (count === 0) return `${label} candidates`;
  if (onHand === null) return `${label} candidates — unknown ${label} count, showing every ranked target`;
  return `${label} candidates — your ${onHand} ${label}${onHand === 1 ? "" : "s"}, best ${Math.min(onHand, count)} target${Math.min(onHand, count) === 1 ? "" : "s"}`;
}

/**
 * One Elite TM section (fast or charged — never merged, separate
 * single-digit-supply items). Ranked by raw Δ team DPS (not a per-resource
 * efficiency — an Elite TM's "cost" is always exactly 1 item, so there is no
 * ratio to compute; see EliteTmCandidate.eliteTmItemsSpent's own doc
 * comment). Rows within `onHand` (when known) are marked "within your
 * stock"; the rest are still shown, framed as "would need another Elite TM."
 */
function EliteTmSection({ kind, candidates, onHand }: { kind: EliteTmKind; candidates: EliteTmCandidate[]; onHand: number | null }) {
  const sorted = useMemo(() => [...candidates].sort((a, b) => b.deltaTeamDps - a.deltaTeamDps), [candidates]);
  if (sorted.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3>{eliteTmHeading(kind, onHand, sorted.length)}</h3>
      <div className="table-scroll">
        <table className="time-series-table">
          <thead>
            <tr>
              <th>Slot</th>
              <th>Species</th>
              <th>Current move</th>
              <th>New move</th>
              <th>Δ team DPS</th>
              <th>Within stock?</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={`${c.slotIndex}-${c.newMoveId}`} style={{ opacity: c.deltaExceedsNoise ? 1 : 0.6 }}>
                <td>{c.slotIndex + 1}</td>
                <td>{c.speciesName}</td>
                <td>{c.currentMoveName}</td>
                <td>{c.newMoveName}</td>
                <td>
                  {c.deltaExceedsNoise ? (
                    <>
                      {c.deltaTeamDps >= 0 ? "+" : ""}
                      {c.deltaTeamDps.toFixed(2)}
                    </>
                  ) : (
                    "≈0 (no measurable change)"
                  )}
                </td>
                <td>{onHand === null ? "unknown" : i < onHand ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Single-raid mode's whole results area — baseline card, per-slot damage
 * ladder, recommendation, the fixed-budget plan (SingleRaidBudgetPlanSection,
 * rendered inline at its original position), the ranked-candidates table,
 * and the always-visible "Known caveats" block. Extracted verbatim from what
 * used to render inline in PowerUpOptimizerView's own top-level JSX (no
 * behavior change) — mirrors how multi-raid mode's own results already live
 * in MultiRaidResultsSection/MultiRaidBudgetPlanSection rather than inline,
 * shrinking PowerUpOptimizerView itself from ~837 to a thin orchestrator.
 */
export function SingleRaidResultsSection({
  error,
  bossSpecies,
  hasFieldedSlot,
  slotSpecies,
  data,
  plan,
  isOptimizerPending,
  rankBy,
  showAllCandidates,
  onToggleShowAllCandidates,
  visibleCandidates,
  sortedCandidatesCount,
  secondChargedMoveBlocked,
  eliteTmCandidates,
  eliteTmBlocked,
  eliteFastTmOnHand,
  eliteChargedTmOnHand,
  dodgeFastAttacksLockoutActive,
  fastAttackLockoutResultNote,
}: SingleRaidResultsSectionProps) {
  return (
    <>
      {error && (
        <section className="panel">
          <p className="error-text">Could not compute this optimizer run: {error}</p>
        </section>
      )}

      {!bossSpecies && (
        <section className="panel">
          <p className="caveats">Pick a raid target above to see ranked power-up candidates.</p>
        </section>
      )}

      {bossSpecies && !hasFieldedSlot && (
        <section className="panel">
          <p className="caveats">
            Add at least one Pokémon to the roster above to see ranked power-up candidates — or switch to Multi-raid
            mode (in Assumptions) to rank your whole imported roster instead, built on the{" "}
            <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a>.
          </p>
        </section>
      )}

      {data && (
        <>
          <CollapsibleSection
            id="pu-baseline"
            heading={
              <>
                Baseline — roster as-is
                {isOptimizerPending && (
                  <span
                    className="badge badge-pending"
                    title="Inputs have changed since this was last computed — it still reflects the previous roster/boss/assumption settings and will refresh automatically a moment after you stop changing them."
                  >
                    recomputing…
                  </span>
                )}
              </>
            }
            defaultOpen
          >
            <div className="result-card" style={{ opacity: isOptimizerPending ? 0.55 : 1, transition: "opacity 0.15s ease" }}>
              <div className="stat-tile-headline">
                <span className="stat-tile-value">{data.baseline.teamDps.toFixed(1)}</span>
                <span className="stat-tile-unit">team DPS</span>
              </div>
              {dodgeFastAttacksLockoutActive && fastAttackLockoutResultNote && (
                <p className="species-picker-warning">{fastAttackLockoutResultNote}</p>
              )}
              <dl>
                <dt>Boss HP</dt>
                <dd>{data.bossHp.toLocaleString()}</dd>
                <dt>Clear rate</dt>
                <dd>{(data.baseline.clearRate * 100).toFixed(0)}%</dd>
                <dt>Mean time to clear</dt>
                <dd>
                  {data.baseline.meanTimeToClearSeconds === null
                    ? "never (in these simulated runs)"
                    : `${data.baseline.meanTimeToClearSeconds.toFixed(1)}s`}
                </dd>
                <dt>Team DPS</dt>
                <dd>{data.baseline.teamDps.toFixed(1)}</dd>
                <dt
                  title={`A candidate's |delta team DPS| below this band is indistinguishable from seed-to-seed jitter in these ${data.iterations} simulated runs, not a real effect — see the ranked table below for how this is applied.`}
                >
                  Noise floor
                </dt>
                <dd>
                  ±{data.noiseFloorTeamDps.toFixed(2)} team DPS ({data.iterations} seeds)
                </dd>
              </dl>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="pu-per-slot-ladder"
            heading={`Per-slot damage ladder against ${bossSpecies ? speciesLabel(bossSpecies) : "this boss"}`}
            defaultOpen={false}
          >
            <p className="caveats" style={{ marginBottom: 12 }}>
              Real Pokémon GO damage is floored per hit — a power-up can raise Attack and change nothing until it
              crosses a real breakpoint here. "No further breakpoint before level 50" means every remaining power-up
              for that move is cost with zero per-hit damage change against THIS boss's real Defense stat.
            </p>
            <p className="caveats" style={{ marginBottom: 12 }}>
              This ladder honors each slot&rsquo;s own Mega Level — Super Max&rsquo;s effective-level bump feeds the
              Attack stat shown, and a &ldquo;+&rdquo; charged move&rsquo;s power is scaled for the selected tier — so
              its breakpoints agree with the Δ team DPS numbers in the ranked table below, which come from a full
              re-simulation.
            </p>
            <div className="result-row" style={{ flexWrap: "wrap" }}>
              {slotSpecies.map((species, i) => {
                const ladder = data.ladders[i];
                if (!species || !ladder) return null;
                return (
                  <div className="result-card" key={i} style={{ minWidth: 340 }}>
                    <h3>
                      Slot {i + 1}: {species.name} (Lv {ladder.current.level})
                    </h3>
                    <dl>
                      <dt>Fast move dmg/hit now</dt>
                      <dd>{ladder.current.fastMoveDamage}</dd>
                      <dt>Next fast breakpoint</dt>
                      <dd>
                        {ladder.nextFastBreakpoint
                          ? `Lv ${ladder.nextFastBreakpoint.level} (${ladder.nextFastBreakpoint.fastMoveDamage} dmg) — ${ladder.nextFastBreakpoint.cumulativeCost.stardust.toLocaleString()} stardust, ${ladder.nextFastBreakpoint.cumulativeCost.candy} candy${ladder.nextFastBreakpoint.cumulativeCost.xlCandy > 0 ? `, ${ladder.nextFastBreakpoint.cumulativeCost.xlCandy} XL` : ""}`
                          : "no further breakpoint before level 50"}
                      </dd>
                      <dt>Charged move dmg/hit now</dt>
                      <dd>{ladder.current.chargedMoveDamage}</dd>
                      <dt>Next charged breakpoint</dt>
                      <dd>
                        {ladder.nextChargedBreakpoint
                          ? `Lv ${ladder.nextChargedBreakpoint.level} (${ladder.nextChargedBreakpoint.chargedMoveDamage} dmg) — ${ladder.nextChargedBreakpoint.cumulativeCost.stardust.toLocaleString()} stardust, ${ladder.nextChargedBreakpoint.cumulativeCost.candy} candy${ladder.nextChargedBreakpoint.cumulativeCost.xlCandy > 0 ? `, ${ladder.nextChargedBreakpoint.cumulativeCost.xlCandy} XL` : ""}`
                          : "no further breakpoint before level 50"}
                      </dd>
                    </dl>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          <CollapsibleSection id="pu-recommendation" heading="Recommendation" defaultOpen>
            <p className="caveats" style={{ color: "var(--text)" }}>
              {!data.bestAffordableByDelta && !data.bestAffordableByStardustEfficiency
                ? noAffordableImprovementSentence(data.noiseFloorTeamDps, dodgeFastAttacksLockoutActive, fastAttackLockoutResultNote)
                : (
                    <>
                      {data.bestAffordableByStardustEfficiency && (
                        <>
                          Best stardust efficiency: Slot {data.bestAffordableByStardustEfficiency.slotIndex + 1} (
                          {data.bestAffordableByStardustEfficiency.speciesName}) Lv{" "}
                          {data.bestAffordableByStardustEfficiency.fromLevel} → {data.bestAffordableByStardustEfficiency.toLevel}{" "}
                          (+{data.bestAffordableByStardustEfficiency.deltaTeamDps.toFixed(2)} team DPS,{" "}
                          {data.bestAffordableByStardustEfficiency.deltaTeamDpsPer1000Stardust?.toFixed(3)} per 1000 stardust).{" "}
                        </>
                      )}
                      {data.bestAffordableByDelta && (
                        <>
                          Biggest raw team-DPS gain: Slot {data.bestAffordableByDelta.slotIndex + 1} (
                          {data.bestAffordableByDelta.speciesName}) Lv {data.bestAffordableByDelta.fromLevel} →{" "}
                          {data.bestAffordableByDelta.toLevel} (+{data.bestAffordableByDelta.deltaTeamDps.toFixed(2)} team
                          DPS)
                          {data.bestAffordableByDelta.slotIndex === data.bestAffordableByStardustEfficiency?.slotIndex &&
                          data.bestAffordableByDelta.toLevel === data.bestAffordableByStardustEfficiency?.toLevel
                            ? " — the same candidate as above."
                            : " — a DIFFERENT candidate than the most stardust-efficient one above, since a bigger absolute gain doesn't have to be the cheapest one."}
                        </>
                      )}
                    </>
                  )}
            </p>
          </CollapsibleSection>

          {data.bestBuddyCandidates.length > 0 && (
            <CollapsibleSection id="pu-best-buddy" heading="Best Buddy candidates (no stardust/candy cost)" defaultOpen>
              <p className="caveats" style={{ marginBottom: 12 }}>
                Best Buddy&rsquo;s +1 effective level costs ZERO stardust and ZERO candy, so it can&rsquo;t be ranked
                by either of this tab&rsquo;s cost-efficiency axes and never appears in the ranked table below —
                these rows are its own free-standing list. &ldquo;No cost&rdquo; means no stardust/candy specifically
                — the real walking distance to actually earn Best Buddy status is real and simply not modelled here.
                Each row is a real paired simulation with ONLY that one slot&rsquo;s Best Buddy flag flipped on,
                evaluated INDEPENDENTLY as if it were the only Best Buddy candidate — but only ONE Pokémon can be
                your trainer&rsquo;s active Best Buddy at a time in the real game, so more than one row can show a
                gain here without all being simultaneously achievable. The fixed-budget plan below picks at most one.
              </p>
              {(() => {
                const best = data.bestBuddyCandidates.reduce((a, b) => (b.deltaTeamDps > a.deltaTeamDps ? b : a));
                return (
                  <p className="caveats" style={{ color: "var(--text)", marginBottom: 12 }}>
                    Biggest gain: Slot {best.slotIndex + 1} ({best.speciesName}), {best.deltaTeamDps >= 0 ? "+" : ""}
                    {best.deltaTeamDps.toFixed(2)} team DPS as Best Buddy
                    {best.deltaExceedsNoise ? "" : " — but this is within this run's noise floor, not a confirmed real gain"}.
                  </p>
                );
              })()}
              <div className="table-scroll">
                <table className="time-series-table">
                  <thead>
                    <tr>
                      <th>Slot</th>
                      <th>Species</th>
                      <th>Δ team DPS as Best Buddy</th>
                      <th>Clears noise floor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bestBuddyCandidates.map((c) => (
                      <tr key={c.slotIndex}>
                        <td>{c.slotIndex + 1}</td>
                        <td>{c.speciesName}</td>
                        <td>
                          {c.deltaTeamDps >= 0 ? "+" : ""}
                          {c.deltaTeamDps.toFixed(2)}
                        </td>
                        <td>
                          {c.deltaExceedsNoise ? (
                            <span className="badge badge-free">free — real gain</span>
                          ) : (
                            "≈0 (within noise)"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}

          {plan && (
            <SingleRaidBudgetPlanSection
              plan={plan}
              slotSpecies={slotSpecies}
              dodgeFastAttacksLockoutActive={dodgeFastAttacksLockoutActive}
              fastAttackLockoutResultNote={fastAttackLockoutResultNote}
            />
          )}

          <CollapsibleSection
            id="pu-ranked-candidates"
            heading={
              <>
                Ranked power-up candidates
                <span className="species-picker-hint" style={{ marginLeft: 8 }}>
                  grouped: measurable gains first (sorted by {rankByLabel(rankBy)}, descending), then within-noise
                  rows (cheapest first), then measurable losses last (worst first)
                </span>
              </>
            }
            defaultOpen
          >
            <p className="caveats" style={{ marginBottom: 12 }}>
              Rows with no {rankBy === "stardust" ? "stardust" : rankBy === "candy" ? "candy" : "XL candy"} cost
              (e.g. a pure-XL step has no regular-candy cost, and vice versa) show "—" for that column's efficiency and sink to the
              bottom of the first group — there is nothing to divide by, not a zero result. A row whose |Δ team DPS| is inside this
              run's ±{data.noiseFloorTeamDps.toFixed(2)} noise floor shows "≈0" instead of a signed number and "—" for every
              efficiency column, and sorts into the middle group by stardust cost (cheapest first) — the measured delta is
              indistinguishable from seed-to-seed jitter, not a real gain or loss.
            </p>
            <p className="caveats" style={{ marginBottom: 12 }}>
              "2nd charged move" rows compete in this SAME stardust/candy ranking (they draw on the same budget as a
              power-up) — Elite TM candidates do NOT, since an Elite TM is a separate, single-digit-supply item; see
              "Elite TM candidates" below instead.
            </p>
            <div className="table-scroll" style={{ opacity: isOptimizerPending ? 0.55 : 1, transition: "opacity 0.15s ease" }}>
              <table className="time-series-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Slot</th>
                    <th>Species</th>
                    <th>Level</th>
                    <th>Change</th>
                    <th>Δ team DPS</th>
                    <th>/1000 stardust</th>
                    <th>/candy</th>
                    <th>/XL candy</th>
                    <th>Stardust</th>
                    <th>Candy</th>
                    <th>XL candy</th>
                    <th>Affordable</th>
                    <th>Breakpoints</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCandidates.map((c) => (
                    <tr key={c.key} style={{ opacity: c.affordable ? 1 : 0.5 }}>
                      <td>{c.kind === "power-up" ? "Power-up" : "2nd charged move"}</td>
                      <td>{c.slotIndex + 1}</td>
                      <td>{c.speciesName}</td>
                      <td>{c.levelRange}</td>
                      <td>{c.change ?? "—"}</td>
                      <td
                        title={
                          c.deltaExceedsNoise
                            ? undefined
                            : `Within this candidate's own noise floor; the measured delta was ${c.deltaTeamDps >= 0 ? "+" : ""}${c.deltaTeamDps.toFixed(2)}`
                        }
                      >
                        {c.deltaExceedsNoise ? (
                          <>
                            {c.deltaTeamDps >= 0 ? "+" : ""}
                            {c.deltaTeamDps.toFixed(2)}
                          </>
                        ) : (
                          "≈0"
                        )}
                      </td>
                      <td>{!c.deltaExceedsNoise || c.deltaTeamDpsPer1000Stardust === null ? "—" : c.deltaTeamDpsPer1000Stardust.toFixed(3)}</td>
                      <td>{!c.deltaExceedsNoise || c.deltaTeamDpsPerCandy === null ? "—" : c.deltaTeamDpsPerCandy.toFixed(3)}</td>
                      <td>{!c.deltaExceedsNoise || c.deltaTeamDpsPerXlCandy === null ? "—" : c.deltaTeamDpsPerXlCandy.toFixed(3)}</td>
                      <td>{c.cost.stardust.toLocaleString()}</td>
                      <td>{c.cost.candy || "—"}</td>
                      <td>{c.cost.xlCandy || "—"}</td>
                      <td>{c.affordable ? "✓" : "✗"}</td>
                      <td>
                        {c.crossesFastBreakpoint && <span className="badge badge-breakpoint">fast</span>}
                        {c.crossesChargedBreakpoint && <span className="badge badge-breakpoint">charged</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedCandidatesCount > CANDIDATE_TABLE_INITIAL_ROWS && (
              <button type="button" style={{ marginTop: 8 }} onClick={onToggleShowAllCandidates}>
                {showAllCandidates ? `Show top ${CANDIDATE_TABLE_INITIAL_ROWS} only` : `Show all ${sortedCandidatesCount}`}
              </button>
            )}
            {secondChargedMoveBlocked.length > 0 && (
              <p className="caveats" style={{ marginTop: 12 }}>
                No second-charged-move candidate for: {secondChargedMoveBlocked.map((b) => `${b.speciesName} (${b.reason})`).join("; ")}
              </p>
            )}
          </CollapsibleSection>

          <CollapsibleSection id="pu-elite-tm-candidates" heading="Elite TM candidates" defaultOpen>
            <p className="caveats" style={{ marginBottom: 12 }}>
              A SEPARATE section on purpose — an Elite Fast/Elite Charged TM is a single-digit-supply item, not
              stardust/candy, so it never competes in the ranked table above (CLAUDE.md's standing rule against
              blending non-fungible resources into one score). Every reachable move is evaluated regardless of how
              many Elite TMs you actually have on hand; fill those counts in above to see which rows are within your
              current stock.
            </p>
            <EliteTmSection kind="fast" candidates={eliteTmCandidates.filter((c) => c.kind === "fast")} onHand={eliteFastTmOnHand} />
            <EliteTmSection kind="charged" candidates={eliteTmCandidates.filter((c) => c.kind === "charged")} onHand={eliteChargedTmOnHand} />
            {eliteTmCandidates.length === 0 && eliteTmBlocked.length === 0 && (
              <p className="caveats">No Elite TM candidates for the current roster.</p>
            )}
            {eliteTmBlocked.length > 0 && (
              <p className="caveats">
                No Elite TM candidate for: {eliteTmBlocked.map((b) => `${b.speciesName} ${b.kind} (${b.reason})`).join("; ")}
              </p>
            )}
          </CollapsibleSection>
        </>
      )}

      <CollapsibleSection id="pu-known-caveats-single" heading="Known caveats" defaultOpen={false}>
        <div className="note-block">
        <details className="prose-details">
          <summary>Roster scope</summary>
          <p>
          A team can field fewer than {MAX_TEAM_RAID_SLOTS} Pokémon — leave any slot empty ("clear" it) and it simply
          never enters the fight and never contributes a power-up candidate. Every power-up candidate below is a
          SINGLE-SLOT power-up run through a full paired team-raid simulation against the other 5 slots exactly as
          configured — no multi-slot power-up plans and no "add a hypothetical 7th Pokémon" candidates in this v1.
          </p>
        </details>
        <details className="prose-details">
          <summary>Mega Level</summary>
          <p>
          Mega Level (per slot, above): every number on this tab honors each slot's own selected Mega Level —
          baseline, ranked candidates' Δ team DPS, the fixed-budget plan, and the per-slot damage ladder's
          breakpoint check alike. Super Max additionally applies a +2 effective-level bump, whose magnitude is a
          community-consensus figure rather than a published one; a "+" charged move's power scaling by tier is a
          weaker community estimate still. Both are flagged where they surface.
          </p>
          <p>{MEGA_LEVEL_HINT}</p>
        </details>
        <details className="prose-details">
          <summary>Boss charged-move cadence model</summary>
          <p>{BOSS_CADENCE_HINT}</p>
        </details>
        <details className="prose-details">
          <summary>Ranking display</summary>
          <p>
          "Rank candidates by" is display-only — never changes which candidates exist or their own numbers, only the
          sort order of the ranked table (both modes). Stardust and candy are deliberately kept as two separate
          efficiency numbers rather than one blended score, since they aren't fungible resources for a real player.
          </p>
        </details>
        <details className="prose-details">
          <summary>Raid timer</summary>
          <p>Real, documented per-tier raid countdown — see raidBoss.ts's RAID_TIER_TABLE.</p>
        </details>
        <details className="prose-details">
          <summary>Scope, noise floor &amp; cost-table gaps</summary>
          <p>
          v1, rudimentary scope: every candidate above is a SINGLE-SLOT power-up — no multi-slot plans (e.g. "power up
          two Pokémon together") and no "add a hypothetical 7th Pokémon" candidates. Each candidate/baseline number is
          the mean of {data ? data.iterations : 20} paired-seed (common-random-numbers) team-raid runs, not one
          run — a level change shifts WHEN the boss's own charged-move RNG gets consumed, which decorrelates the
          "same seed" runs more than a typical paired comparison, so this tool also computes a conservative noise floor
          (shown on the baseline card and applied to the ranked table above) and treats any candidate whose |Δ team DPS|
          falls inside it as "no measurable change" rather than a signed number. A candidate CAN still show a genuine
          small negative delta beyond that floor, and that isn't necessarily a bug: with swap/revive costs at 0 a
          bulkier, lower-DPS slot that gains no extra charged move from the power-up just delays the roster's stronger
          slots behind it for no compensating survival benefit — it's the revive cost above (15s by default) that makes
          a slot's extra bulk pay for itself by avoiding a paid full-roster wipe. The power-up cost table (universal
          levels 1-50,
          fetched {powerUpCostsFetchedAt.slice(0, 10)} from GAME_MASTER) DOES apply Eternatus's known per-species
          candy-cost override (candy/XL-candy only — stardust is genuinely unchanged at every level) via a generic
          per-species override mechanism; Eternatus is the only entry the live GAME_MASTER dump carries one for, so
          this mechanism is untested against a second overridden species. Best Buddy status (a real +1 level beyond
          the normal level-50 cap) is now surfaced as its own free, no-stardust/no-candy candidate list (&ldquo;Best
          Buddy candidates&rdquo; above, and the fixed-budget plan&rsquo;s own at-most-one recommendation) — it still
          never competes on either cost-efficiency axis, since it costs neither. The Shadow-side
          candy rounding rule is [inferred from the Purified rule, not independently confirmed] — see powerUp.ts's own
          top doc comment. Stardust and candy/XL-candy efficiency are kept as two separate numbers on purpose (see the
          "Rank by" control) — they are not fungible resources for a real player, so this tool never blends them into
          one composite score. Every full-roster wipe costs the revive-and-rejoin time above (15s by default) of raid
          clock in which nothing is dealt, and team DPS is the damage dealt within the raid timer divided by the timer
          (or boss HP divided by time-to-clear when the roster clears) — so a slot's extra bulk only counts when it
          buys damage, or avoids a paid revive. Team Raid v1's other assumptions carry over unchanged: unlimited
          healing items on a full wipe, and no cap on wipe-and-rejoin cycles other than a purely-engineering safety guard. A raid target badged
          "approximate" in the picker is one the live raid feed named but whose exact form this data layer couldn't
          resolve, so a documented stand-in species' stats are used instead — treat those runs as directional.
          </p>
        </details>
        <details className="prose-details">
          <summary>Move changes (second charged move &amp; TMs)</summary>
          <p>
          Second-charged-move pricing is [community-consensus] (no first-party Niantic table found), tiered by the
          family's real buddy-walking distance, with starters/babies flat-rated and 16 named species barred entirely
          unless Shadow or Purified. Purified is a 0.8x stardust/candy discount HERE, NOT the 0.9x an ordinary
          power-up uses — a deliberately separate rate, not a copy/paste of the power-up table. A slot whose species'
          buddy distance isn't in this data layer yet shows no second-charged-move candidate at all rather than
          guessing a tier. Elite TM candidates are deterministic once a target move is picked, so every reachable
          move is evaluated regardless of how many Elite TMs you actually hold — the TM-count fields above only
          label which rows are "within your stock." A REGULAR (non-Elite) Fast/Charged TM is deliberately NOT
          modelled at all: its outcome is a random, guaranteed-different move from a pool whose real distribution
          Niantic has never published, and it can irreversibly overwrite a legacy/event move that only an Elite TM
          could restore — ranking a candidate here would mean either fabricating a distribution or collapsing real
          uncertainty into one misleading number. Frustration/Return, signature moves, and Super Max "+" moves can
          never be targeted by any TM of any kind (real game rule). Frustration removal itself needs a real,
          roughly-quarterly "Taken Over" event and is not modelled here at all. Every candidate above assumes this
          tab's own 6-slot roster, whose species/move pickers always resolve to a concrete move — the "unknown
          moveset" exclusion above only applies to your separately-imported Roster-tab pool, which this tab's TM
          ranking does not draw candidates from yet.
          </p>
        </details>
        </div>
      </CollapsibleSection>
    </>
  );
}
