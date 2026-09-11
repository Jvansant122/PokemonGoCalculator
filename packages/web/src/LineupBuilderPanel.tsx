import type { LineupBuilderResult, LineupSlot } from "@pogo-analyzer/engine";
import { CollapsibleSection } from "./CollapsibleSection.js";
import type { LineupBuilderBlockedReason } from "./lineupBuilderAction.js";

export type LineupBuilderPanelState =
  | { kind: "idle" }
  | { kind: "blocked"; reason: LineupBuilderBlockedReason }
  | { kind: "error"; message: string }
  | { kind: "result"; result: LineupBuilderResult; rosterSize: number };

interface Props {
  state: LineupBuilderPanelState;
  onBuild: () => void;
}

function lineupSlotLabel(slot: LineupSlot): string {
  return `${slot.speciesName}${slot.isMega ? " (mega)" : ""} Lv${slot.level}`;
}

function LineupSummary({ label, slots }: { label: string; slots: LineupSlot[] }) {
  return (
    <p>
      <strong>{label}:</strong> {slots.length > 0 ? slots.map(lineupSlotLabel).join(" → ") : "(empty — no eligible entries)"}
    </p>
  );
}

/**
 * Renders one built lineup's own real (filler-free) measurement — see
 * lineupBuilder.ts's LineupCandidateResult.summary doc comment. Shared by
 * the winner and the (optional) runner-up so the two are visually
 * comparable at a glance, not just described in prose.
 */
function LineupStats({ result }: { result: LineupBuilderResult["winner"] }) {
  return (
    <dl>
      <dt>Team DPS</dt>
      <dd>{result.summary.teamDps.toFixed(1)}</dd>
      <dt>Clear rate</dt>
      <dd>{(result.summary.clearRate * 100).toFixed(0)}%</dd>
      <dt>Mean time to clear (cleared runs only)</dt>
      <dd>{result.summary.meanTimeToClearSeconds !== null ? `${result.summary.meanTimeToClearSeconds.toFixed(1)}s` : "never clears"}</dd>
    </dl>
  );
}

function LineupBuilderResultView({ result, rosterSize }: { result: LineupBuilderResult; rosterSize: number }) {
  return (
    <div className="note-block">
      <p className="species-picker-hint">
        Considered all {rosterSize} imported entries (see screening below); the top {result.shortlist.length} made the
        search shortlist. Compared {result.beamWidth}-wide, {result.iterations} paired seeds per full-lineup
        evaluation.
      </p>

      <div className="result-card">
        <LineupSummary label="Best lineup (filled below)" slots={result.winner.slots} />
        <LineupStats result={result.winner} />
      </div>

      {result.runnerUp && result.margin ? (
        <div className="result-card" style={{ marginTop: 10 }}>
          <LineupSummary label="Runner-up" slots={result.runnerUp.slots} />
          <LineupStats result={result.runnerUp} />
          <p className={result.margin.exceedsNoise ? undefined : "boss-moveset-risk"}>
            {result.margin.exceedsNoise ? (
              <>
                The winner leads the runner-up by <strong>{result.margin.teamDpsDelta.toFixed(1)} team DPS</strong>
                {result.margin.teamDpsDeltaFraction !== null && ` (+${(result.margin.teamDpsDeltaFraction * 100).toFixed(1)}%)`}
                {" "}— a real, distinguishable gap.
              </>
            ) : (
              <>
                The winner leads by only {result.margin.teamDpsDelta.toFixed(1)} team DPS
                {result.margin.teamDpsDeltaFraction !== null && ` (${(result.margin.teamDpsDeltaFraction * 100).toFixed(1)}%)`} —{" "}
                <strong>within this search's own noise floor</strong>. Treat the winner and runner-up as
                effectively tied; either is a defensible pick.
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="species-picker-hint">
          No distinct runner-up found — the search either ran at its minimum beam width or the roster/one-mega
          constraint left only one valid lineup. Nothing to compare it against.
        </p>
      )}
    </div>
  );
}

/**
 * Entry point for the single-trainer lineup builder — see
 * PLAN_lineup_builder.md at the repo root. Fills Team Raid Simulator's own
 * six slots from the caller's imported roster pool (rosterPool.ts,
 * localStorage-only), searching over ORDER as well as which six to bring
 * (packages/engine/src/lineupBuilder.ts). Placed ABOVE the assumption panel
 * since a successful build overwrites the roster it configures.
 */
export function LineupBuilderPanel({ state, onBuild }: Props) {
  return (
    <CollapsibleSection id="team-raid-lineup-builder" heading="Lineup Builder" defaultOpen>
      <p className="species-picker-hint">
        Builds the best 6-slot lineup — which Pokémon, in what order, each at its OWN roster level — from your
        imported roster against the raid target selected below, then fills the roster with it. Order matters: the
        lead absorbs the boss's opening damage and every faint shifts the rest of the fight, so this is a real
        search, not just "your strongest six."
      </p>
      <div style={{ marginBottom: 10 }}>
        <button type="button" onClick={onBuild}>
          Build best lineup from my imported roster
        </button>
      </div>

      {state.kind === "blocked" && state.reason === "no-roster" && (
        <p className="error-text">
          No imported roster — import a Poke Genie CSV, hand-add Pokémon, or load a save code on the Roster tab
          first, then come back here. No lineup to build without one.
        </p>
      )}
      {state.kind === "blocked" && state.reason === "no-boss" && (
        <p className="error-text">Pick a valid raid target below first.</p>
      )}
      {state.kind === "error" && <p className="error-text">Could not build a lineup: {state.message}</p>}
      {state.kind === "result" && <LineupBuilderResultView result={state.result} rosterSize={state.rosterSize} />}
    </CollapsibleSection>
  );
}
