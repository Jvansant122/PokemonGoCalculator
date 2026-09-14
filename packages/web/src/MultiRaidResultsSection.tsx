import { useMemo, useState } from "react";
import type {
  GatedEvolutionNotice,
  RosterHypotheticalCatchImpact,
  RosterNeverCompetitiveEntry,
  RosterPerBossImpact,
  RosterPlannerProgressEvent,
  RosterPowerUpCandidate,
  RosterSignificanceMode,
} from "@pogo-analyzer/engine";
import { CollapsibleSection } from "./CollapsibleSection.js";
import type { PowerUpRankBy } from "./powerUpOptimizerScenario.js";
import { rankByLabel } from "./powerUpOptimizerSentences.js";
import { efficiencyForRankBy, sortCandidatesByEfficiency } from "./powerUpCandidateSort.js";
import { getBaseUrl } from "./urlUtils.js";
import type { RosterPlannerRunResult } from "./run/runRosterPlanner.js";
import {
  dedupeInterchangeableBestBuddyCandidates,
  dedupeInterchangeableCandidates,
  type DedupedRosterBestBuddyGroup,
  type DedupedRosterCandidateGroup,
} from "./rosterCandidateDedupe.js";
import type { MovesetDefaultBadgeInfo } from "./rosterMovesetBadge.js";
import type { RosterEntry as ImportedRosterEntry } from "./import/pokeGenieMatch.js";

/**
 * The multi-raid sweep's ranked-candidate results cluster — the per-boss
 * breakdown table, the ranked/benched/hypothetical-catch candidate rows, the
 * "not silently dropped" excluded-entries table, and the top-level
 * `MultiRaidResultsSection` that assembles them. Extracted from
 * PowerUpOptimizerView.tsx 2026-09-14 as a navigability pass over a
 * 2,984-line view file, no behavior change — kept together per that file's
 * own note that these are "one coherent cluster." `MultiRaidPerBossTable`,
 * `ExcludedEntriesTable`, and `rosterProgressSentence` are also reused by
 * `MultiRaidBudgetStepRow`/`MultiRaidBudgetPlanSection` in
 * PowerUpOptimizerView.tsx itself (the fixed-budget-plan sibling, not moved
 * here), so they stay exported rather than folded to file-local.
 */

/** Same idea as `rankedRowEfficiency` in PowerUpOptimizerView.tsx (single-raid), for multi-raid's differently-named fields — see powerUpCandidateSort.ts's own doc comment on why the two shapes need separate call sites into the same shared resolver. */
function rosterCandidateEfficiency(c: RosterPowerUpCandidate, rankBy: PowerUpRankBy): number | null {
  return efficiencyForRankBy(rankBy, c.deltaPer1000Stardust, c.deltaPerCandy, c.deltaPerXlCandy);
}

/** Row-count cap shared by every multi-raid table below before a "Show all" toggle — see CANDIDATE_TABLE_INITIAL_ROWS in PowerUpOptimizerView.tsx for the single-raid sibling constant (kept separate, not shared, since the two tables' typical row counts differ by an order of magnitude). Exported: also used by MultiRaidBudgetStepRow/MultiRaidBudgetPlanSection in PowerUpOptimizerView.tsx. */
export const MULTI_RAID_TABLE_INITIAL_ROWS = 30;

/**
 * One boss's real, computed effect of a candidate power-up (or budget-plan
 * step) — the expandable detail under each `MultiRaidCandidateRow` (Phase
 * 3b) AND each `MultiRaidBudgetStepRow` (Phase 4 — `RosterBudgetStep.perBoss`
 * is the SAME `RosterPerBossImpact[]` shape as `RosterPowerUpCandidate.perBoss`,
 * so this table takes the array directly rather than a full candidate,
 * letting both callers share it). Per CLAUDE.md's own headline thesis: the
 * interesting output is WHERE the ranking flips, not one collapsed number.
 * Sorted by |Δ team DPS| descending — the bosses this power-up actually
 * matters for, first.
 */
export function MultiRaidPerBossTable({ perBoss, columnCount }: { perBoss: RosterPerBossImpact[]; columnCount: number }) {
  const sorted = useMemo(() => [...perBoss].sort((a, b) => Math.abs(b.deltaTeamDps) - Math.abs(a.deltaTeamDps)), [perBoss]);
  return (
    <tr>
      <td colSpan={columnCount} style={{ padding: "4px 0 10px" }}>
        <div className="table-scroll">
          <table className="time-series-table">
            <thead>
              <tr>
                <th>Boss</th>
                <th>Δ team DPS</th>
                <th>Rank before</th>
                <th>Rank after</th>
                <th>What changed</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.bossId}>
                  <td>{p.bossName}</td>
                  <td>
                    {p.simulated ? (
                      <>
                        {p.deltaTeamDps >= 0 ? "+" : ""}
                        {p.deltaTeamDps.toFixed(3)}
                      </>
                    ) : (
                      "0.000"
                    )}
                  </td>
                  <td>{p.rankBefore ?? "—"}</td>
                  <td>{p.rankAfter ?? "—"}</td>
                  <td>
                    {!p.simulated && (
                      <span className="species-picker-hint">
                        not fielded before or after — a real computed zero, this boss was never re-simulated
                      </span>
                    )}
                    {p.simulated && p.rankBefore === null && p.rankAfter !== null && (
                      <span className="badge badge-breakpoint">enters team</span>
                    )}
                    {p.simulated && p.rankBefore !== null && p.rankAfter === null && (
                      <span className="badge badge-approximate">drops from team</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

const MULTI_RAID_ROW_COLUMN_COUNT = 12;

/**
 * One row of the multi-raid ranked/benched candidate tables — shared so the
 * two tables (and their column meanings) stay in sync. Renders a DEDUPED
 * `group` (see rosterCandidateDedupe.ts), not a raw candidate — `group.count
 * > 1` means several interchangeable pool entries collapsed into this one
 * row, and either satisfies the recommendation equally (they're identical in
 * every way this planner's own math can see). Expandable via the species
 * name button to reveal the per-boss breakdown (MultiRaidPerBossTable),
 * collapsed by default so 30 rows doesn't become 30 tables on load.
 *
 * `identity` is not decoration: a real imported roster holds MANY entries of
 * the same species (the reference Poke Genie export has 4 Mewtwo, 12 Houndour
 * and 11 Inkay, and 27 species duplicated overall), so a row reading only
 * "Mewtwo 20 → 26.5" can appear twice with DIFFERENT deltas and leaves the
 * user unable to tell which of their four Mewtwo to actually power up. The
 * IV spread is what makes a recommendation actionable. Two entries that are
 * still identical after dedup ARE genuinely interchangeable, so either one
 * satisfies the recommendation — hence a count, not a list of which ones.
 *
 * `movesetBadge` is a web-only join, not something `group.representative`
 * itself carries — see rosterMovesetBadge.ts's own top doc comment for why
 * (the engine's `RosterPowerUpCandidate` has no import-time provenance at
 * all). When the deduped group has `count > 1`, this reads as true for its
 * REPRESENTATIVE pool entry specifically — the same "good enough for a
 * collapsed row" caveat `identity` above already accepts, since the dedup
 * key doesn't distinguish "explicitly matched this exact move" from
 * "defaulted to the exact same move" (both resolve to the same
 * fastMoveId/chargedMoveId).
 */
function MultiRaidCandidateRow({
  group,
  identity,
  movesetBadge,
}: {
  group: DedupedRosterCandidateGroup;
  identity?: string;
  movesetBadge?: MovesetDefaultBadgeInfo;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = group.representative;
  // "—" when this candidate isn't significant (aggregate OR per-boss — see
  // RosterPowerUpCandidate.exceedsNoise's own doc comment) or the resource
  // cost behind that column is 0 (deltaPerX is null) — same convention as
  // single-raid's deltaExceedsNoise-gated efficiency columns.
  const showEfficiency = c.exceedsNoise;
  return (
    <>
      <tr style={{ opacity: c.exceedsNoise ? 1 : 0.6 }}>
        <td>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title="Show the per-boss breakdown — where this power-up actually helps, not just the averaged headline number."
            style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
          >
            {expanded ? "▾" : "▸"} {c.speciesName}
          </button>
          {group.count > 1 && (
            <span className="species-picker-hint">
              {" "}
              ×{group.count} interchangeable entries
            </span>
          )}
          {identity && (
            <span className="caveats" style={{ display: "block", fontSize: "0.85em" }}>
              {identity}
            </span>
          )}
          {movesetBadge && (
            <span className="badge badge-approximate" title={movesetBadge.title}>
              {movesetBadge.label}
            </span>
          )}
          {c.costUnverified && (
            <span className="badge badge-approximate" title="This entry's candy family has no known candy-on-hand — ranked normally, but this cost can't be confirmed affordable.">
              candy unverified
            </span>
          )}
          {c.viaEvolution && (
            <div className="species-picker-hint" style={{ marginTop: 2 }}>
              via evolution from {c.viaEvolution.fromSpeciesName} (+{c.viaEvolution.evolutionCandyCost} candy, folded into
              the cost at left)
              {c.viaEvolution.otherGatedOptions && c.viaEvolution.otherGatedOptions.length > 0 && (
                <>
                  <div style={{ marginTop: 2 }}>Also possible from {c.viaEvolution.fromSpeciesName}, not priced by this tool:</div>
                  <GatedEvolutionList options={c.viaEvolution.otherGatedOptions} />
                </>
              )}
            </div>
          )}
        </td>
        <td>
          {c.fromLevel} → {c.toLevel}
        </td>
        <td>{c.cost.stardust.toLocaleString()}</td>
        <td>{c.cost.candy || "—"}</td>
        <td>{c.cost.xlCandy || "—"}</td>
        <td>
          {c.exceedsNoise ? (
            <>
              {c.meanDeltaTeamDps >= 0 ? "+" : ""}
              {c.meanDeltaTeamDps.toFixed(3)}
            </>
          ) : (
            "≈0 (no measurable change)"
          )}
        </td>
        <td>{!showEfficiency || c.deltaPer1000Stardust === null ? "—" : c.deltaPer1000Stardust.toFixed(3)}</td>
        <td>{!showEfficiency || c.deltaPerCandy === null ? "—" : c.deltaPerCandy.toFixed(3)}</td>
        <td>{!showEfficiency || c.deltaPerXlCandy === null ? "—" : c.deltaPerXlCandy.toFixed(3)}</td>
        <td>
          {c.bestBossDeltaTeamDps === null
            ? "—"
            : `${c.bestBossDeltaTeamDps >= 0 ? "+" : ""}${c.bestBossDeltaTeamDps.toFixed(3)} vs ${c.perBoss.find((p) => p.bossId === c.bestBossId)?.bossName ?? c.bestBossId}`}
        </td>
        <td>{c.significantBossCount}</td>
        <td>{c.bossesNewlyFielded.length}</td>
      </tr>
      {expanded && <MultiRaidPerBossTable perBoss={c.perBoss} columnCount={MULTI_RAID_ROW_COLUMN_COUNT} />}
    </>
  );
}

const MULTI_RAID_BEST_BUDDY_COLUMN_COUNT = 5;

/**
 * One row of the "Best Buddy candidates" table (IDEAS.md #5, roster mode —
 * `RosterPlanResult.bestBuddyCandidates`, shipped in the engine 2026-09-13
 * but unwired until this pass). `RosterBestBuddyCandidate` carries NO cost or
 * efficiency fields at all (never nulls — see that type's own doc comment:
 * Best Buddy is free, and a free action divides by zero on both of this
 * tab's cost-efficiency axes), so this is its own row component rather than
 * a cost-column-blanked reuse of `MultiRaidCandidateRow` — same reasoning as
 * `MultiRaidHypotheticalCatchRow` just above. `level` is looked up
 * separately (this candidate type has no `fromLevel`/`toLevel` — Best Buddy
 * doesn't change a Pokémon's power-up level at all) since the engine row
 * itself doesn't carry it.
 */
function MultiRaidBestBuddyRow({
  group,
  level,
  identity,
}: {
  group: DedupedRosterBestBuddyGroup;
  level: number | undefined;
  identity?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = group.representative;
  return (
    <>
      <tr style={{ opacity: c.exceedsNoise ? 1 : 0.6 }}>
        <td>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title="Show the per-boss breakdown — where Best Buddy actually helps, not just the averaged headline number."
            style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
          >
            {expanded ? "▾" : "▸"} {c.speciesName}
          </button>
          {group.count > 1 && (
            <span className="species-picker-hint">
              {" "}
              ×{group.count} interchangeable entries
            </span>
          )}
          {identity && (
            <span className="caveats" style={{ display: "block", fontSize: "0.85em" }}>
              {identity}
            </span>
          )}
        </td>
        <td>{level ?? "—"}</td>
        <td>
          {c.exceedsNoise ? (
            <>
              {c.meanDeltaTeamDps >= 0 ? "+" : ""}
              {c.meanDeltaTeamDps.toFixed(3)}
            </>
          ) : (
            "≈0 (no measurable change)"
          )}
        </td>
        <td>
          {c.bestBossDeltaTeamDps === null
            ? "—"
            : `${c.bestBossDeltaTeamDps >= 0 ? "+" : ""}${c.bestBossDeltaTeamDps.toFixed(3)} vs ${c.perBoss.find((p) => p.bossId === c.bestBossId)?.bossName ?? c.bestBossId}`}
        </td>
        <td>{c.significantBossCount}</td>
      </tr>
      {expanded && <MultiRaidPerBossTable perBoss={c.perBoss} columnCount={MULTI_RAID_BEST_BUDDY_COLUMN_COUNT} />}
    </>
  );
}

const MULTI_RAID_HYPOTHETICAL_CATCH_COLUMN_COUNT = 6;

/**
 * One row of the "hypothetical catches" table (IDEAS.md #3, "add a 7th") —
 * `RosterHypotheticalCatchImpact`, NOT a `RosterPowerUpCandidate`: no cost
 * columns at all (never priced — see `HypotheticalCatchCandidate`'s own doc
 * comment in rosterPlanner.ts), so this is its OWN row component rather than
 * a reuse of `MultiRaidCandidateRow` with blanked-out cost cells. Same
 * expandable-per-boss-breakdown convention via `MultiRaidPerBossTable`.
 */
function MultiRaidHypotheticalCatchRow({ impact }: { impact: RosterHypotheticalCatchImpact }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr style={{ opacity: impact.exceedsNoise ? 1 : 0.6 }}>
        <td>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title="Show the per-boss breakdown — where this hypothetical catch would actually help."
            style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
          >
            {expanded ? "▾" : "▸"} {impact.speciesName}
          </button>
        </td>
        <td>{impact.level}</td>
        <td>
          {impact.exceedsNoise ? (
            <>
              {impact.meanDeltaTeamDps >= 0 ? "+" : ""}
              {impact.meanDeltaTeamDps.toFixed(3)}
            </>
          ) : (
            "≈0 (no measurable change)"
          )}
        </td>
        <td>
          {impact.bestBossDeltaTeamDps === null
            ? "—"
            : `${impact.bestBossDeltaTeamDps >= 0 ? "+" : ""}${impact.bestBossDeltaTeamDps.toFixed(3)} vs ${impact.perBoss.find((p) => p.bossId === impact.bestBossId)?.bossName ?? impact.bestBossId}`}
        </td>
        <td>{impact.significantBossCount}</td>
        <td>{impact.bossesNewlyFielded.length}</td>
      </tr>
      {expanded && <MultiRaidPerBossTable perBoss={impact.perBoss} columnCount={MULTI_RAID_HYPOTHETICAL_CATCH_COLUMN_COUNT} />}
    </>
  );
}

/** One human-readable line per gated evolution branch — reused by both `EvolutionOptionsCell` (the "Never competitive" table) and `MultiRaidCandidateRow`'s "other options" note under a `viaEvolution` candidate. Never invents a requirement `GatedEvolutionNotice.requirementSummary` didn't already state (that string is built by the engine's own `describeEvolutionRequirement` — see rosterPlanner.ts). */
function GatedEvolutionList({ options }: { options: GatedEvolutionNotice[] }) {
  if (options.length === 0) return null;
  return (
    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
      {options.map((g) => (
        <li key={g.toSpeciesId} style={{ fontSize: "0.9em" }}>
          {g.toSpeciesName} — {g.requirementSummary}
        </li>
      ))}
    </ul>
  );
}

/**
 * Concretely SHOWS every evolution option this planner found for an
 * unevolved "never competitive" entry — CLAUDE.md's standing "an exclusion
 * gets shown, never quietly dropped" rule, applied to evolution branches the
 * same way `ExcludedEntriesTable` already applies it to the entry itself.
 * `evolutionRecommendation` (a real priced candy-only option this planner
 * found, information-only for the fixed-budget plan — see
 * RosterNeverCompetitiveEntry's own doc comment) and `gatedEvolutions`
 * (branches this engine can't price at all — an item, a lure, buddy
 * distance, gender, time-of-day, a quest) are BOTH rendered whenever
 * present, never one hiding the other — Eevee's Vaporeon (priceable) and
 * Espeon (gated on a 10km buddy + daytime + a quest) are both real options a
 * user considering this entry should see.
 */
function EvolutionOptionsCell({
  evolutionRecommendation,
  gatedEvolutions,
}: {
  evolutionRecommendation?: RosterNeverCompetitiveEntry["evolutionRecommendation"];
  gatedEvolutions?: GatedEvolutionNotice[];
}) {
  if (!evolutionRecommendation && (!gatedEvolutions || gatedEvolutions.length === 0)) return <>—</>;
  return (
    <>
      {evolutionRecommendation && (
        <div style={{ fontSize: "0.9em" }}>
          Candy-only: {evolutionRecommendation.toSpeciesName} ({evolutionRecommendation.evolutionCandyCost} candy) — est.{" "}
          {evolutionRecommendation.meanDeltaTeamDps >= 0 ? "+" : ""}
          {evolutionRecommendation.meanDeltaTeamDps.toFixed(3)} team DPS at L{evolutionRecommendation.toLevel}
        </div>
      )}
      {gatedEvolutions && gatedEvolutions.length > 0 && (
        <>
          <div className="species-picker-hint" style={{ marginTop: evolutionRecommendation ? 4 : 0 }}>
            Also possible, but not priced by this tool:
          </div>
          <GatedEvolutionList options={gatedEvolutions} />
        </>
      )}
    </>
  );
}

/**
 * A "not silently dropped" table for `RosterNeverCompetitiveEntry[]` —
 * shared by the ranked sweep's `neverCompetitive` (Phase 3b) AND the
 * fixed-budget plan's `excludedEntries` (Phase 4, same underlying type: an
 * unevolved species, or — budget-plan-only — an unresolved/unknown candy
 * family). Reused rather than duplicated so both surfaces render this
 * "excluded, here's why" list identically. Owns its own `showAll` state
 * (collapsed to `initialRows` by default) since two independent instances of
 * this component can be on screen at once with independently-sized lists.
 * Collapsed by default (a CollapsibleSection subsection, not the ranked
 * table above it) — this is a "not silently dropped, but not the headline"
 * list, and `sectionId` MUST differ per call site so two on-screen instances
 * don't share one fold-state key.
 */
export function ExcludedEntriesTable({
  sectionId,
  heading,
  description,
  entries,
  entryMovesetBadges,
  initialRows = MULTI_RAID_TABLE_INITIAL_ROWS,
}: {
  sectionId: string;
  heading: string;
  description: string;
  entries: RosterNeverCompetitiveEntry[];
  /** entryId -> a "moveset had to be guessed" badge — see rosterMovesetBadge.ts. Optional so this shared table doesn't force every future caller to pass one. */
  entryMovesetBadges?: Map<string, MovesetDefaultBadgeInfo>;
  initialRows?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  if (entries.length === 0) return null;
  const visible = showAll ? entries : entries.slice(0, initialRows);
  return (
    <CollapsibleSection
      id={sectionId}
      heading={`${heading} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`}
      headingLevel="h3"
      defaultOpen={false}
      variant="subsection"
    >
      <p className="caveats" style={{ marginBottom: 12 }}>
        {description}
      </p>
      <div className="table-scroll">
        <table className="time-series-table">
          <thead>
            <tr>
              <th>Species</th>
              <th>Reason</th>
              <th>Evolution options</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e, i) => {
              const movesetBadge = entryMovesetBadges?.get(e.entryId);
              return (
                <tr key={`${e.entryId}-${i}`}>
                  <td>
                    {e.speciesName}
                    {movesetBadge && (
                      <span className="badge badge-approximate" title={movesetBadge.title}>
                        {movesetBadge.label}
                      </span>
                    )}
                  </td>
                  <td>{e.reason}</td>
                  <td>
                    <EvolutionOptionsCell evolutionRecommendation={e.evolutionRecommendation} gatedEvolutions={e.gatedEvolutions} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {entries.length > initialRows && (
        <button type="button" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? `Show top ${initialRows} only` : `Show all ${entries.length}`}
        </button>
      )}
    </CollapsibleSection>
  );
}

/**
 * The 9-column header row shared by MultiRaidResultsSection's two candidate
 * tables ("Ranked candidates" and "Benched but promising"). NOTE: the two
 * call sites were NOT actually identical before this extraction — "Ranked
 * candidates" carries a `title` tooltip on 4 of these columns and "Benched
 * but promising" doesn't. Preserved exactly per call site via `withTooltips`
 * rather than silently equalizing the two (that would be a real, if minor,
 * behavior change) — see this file's own extraction notes for why.
 */
function MultiRaidCandidateTableHead({ withTooltips }: { withTooltips: boolean }) {
  return (
    <thead>
      <tr>
        <th>Species</th>
        <th>Level</th>
        <th>Stardust</th>
        <th>Candy</th>
        <th>XL candy</th>
        <th title={withTooltips ? "Weighted mean across every swept boss" : undefined}>Mean Δ team DPS</th>
        <th title={withTooltips ? "Mean Δ team DPS per 1000 stardust spent — '—' when this candidate isn't significant or has no stardust cost. Kept separate from candy, never blended into one score." : undefined}>
          /1000 stardust
        </th>
        <th title={withTooltips ? "Regular candy only, never blended with stardust. '—' when this candidate isn't significant or has no regular-candy cost." : undefined}>
          /candy
        </th>
        <th title={withTooltips ? "'—' when this candidate isn't significant or has no XL candy cost." : undefined}>/XL candy</th>
        <th
          title={
            withTooltips
              ? "The single largest-magnitude per-boss effect — dilution by untouched bosses can otherwise hide a real single-boss gain"
              : undefined
          }
        >
          Best boss Δ
        </th>
        <th title={withTooltips ? "Bosses where this candidate's own effect clears THAT boss's own noise floor" : undefined}>
          Significant bosses
        </th>
        <th
          title={
            withTooltips ? "Bosses where this Pokémon was NOT on the baseline team but enters it after this power-up" : undefined
          }
        >
          Newly fielded
        </th>
      </tr>
    </thead>
  );
}

/**
 * A short, honest sentence for ONE `RosterPlannerProgressEvent` (IDEAS.md
 * #13) — never a fabricated percentage, and stages are named rather than
 * blended into one bar (see that type's own doc comment for why: a baseline
 * unit and a candidate-simulation unit cost wildly different amounts of real
 * work). `total` for the "rounds" stage is `maxRounds`, an upper bound the
 * search usually stops well short of — worded as "round N" rather than
 * "N / total" for that one stage so it doesn't read as stalled at, say,
 * "4 / 200".
 */
export function rosterProgressSentence(event: RosterPlannerProgressEvent): string {
  switch (event.stage) {
    case "baseline":
      return `Establishing baseline teams: ${event.completed} / ${event.total} bosses${event.bossName ? ` (${event.bossName})` : ""}`;
    case "candidates":
      return `Simulating power-up candidates: ${event.completed} / ${event.total}`;
    case "hypotheticalCatches":
      return `Evaluating hypothetical catches: ${event.completed} / ${event.total}`;
    case "bestBuddy":
      return `Evaluating Best Buddy candidates: ${event.completed} / ${event.total}`;
    case "rounds":
      return `Building plan: round ${event.completed}${event.bossName ? ` (committed against ${event.bossName})` : ""}`;
    default:
      return "Working…";
  }
}

interface MultiRaidResultsSectionProps {
  hydratedPoolCount: number;
  /** entryId -> a short human identity (IV spread) for the ranked tables — see MultiRaidCandidateRow's `identity`. */
  entryIdentities: Map<string, string>;
  /** entryId -> a "moveset had to be guessed" badge, present only for entries whose fast and/or charged move was defaulted at import — see rosterMovesetBadge.ts. */
  entryMovesetBadges: Map<string, MovesetDefaultBadgeInfo>;
  /** The hydrated pool itself — needed (not just entryIdentities) so dedupeInterchangeableCandidates can compare full IV/moveset/cost-modifier identity, not just its display string. */
  pool: ImportedRosterEntry[];
  rosterDroppedCount: number;
  /** Count of hydrated entries that predate the moveset-badge fields — see rosterPool.ts's HydratedRosterPool.staleMovesetBadgeCount. */
  rosterStaleMovesetBadgeCount: number;
  bossCount: number;
  run: RosterPlannerRunResult | null;
  isRunning: boolean;
  isStale: boolean;
  /** null before any sweep has completed, or when the most recent one was blocked before an engine call was even attempted. */
  ranOn: "worker" | "main-thread-fallback" | null;
  elapsedMs: number;
  /** Most recent REAL progress event from this run, or null before one has arrived (or once the run finishes/is idle — see rosterProgressSentence). IDEAS.md #13. */
  progress: RosterPlannerProgressEvent | null;
  onRunSweep: () => void;
  /** Same selector single-raid mode already exposes — sorts the ranked table client-side by the chosen resource's efficiency, same as single-raid's own sortedCandidates (CLAUDE.md standing decision: never blended into one score). */
  rankBy: PowerUpRankBy;
  /** Which candidates QUALIFY for the ranked table below — see PowerUpOptimizerAssumptions.multiRaidSignificanceMode. Never changes what a visible row REPORTS (bestBossDeltaTeamDps/significantBossCount stay on every column either way). */
  significanceMode: RosterSignificanceMode;
}

/**
 * Multi-raid mode's results: a ranked candidate table (deduped —
 * rosterCandidateDedupe.ts — and expandable per row into its per-boss
 * breakdown), `benchedButPromising`/`neverCompetitive` surfaced as their own
 * tables (never silently dropped — see rosterPlanner.ts's own doc comment on
 * why those two are the answer to "would a benched Pokémon be better if
 * powered up"), and a clear reason whenever nothing was computed. Runs off
 * the main thread via rosterPlannerWorkerClient.ts (Phase 3b) — `ranOn`
 * reports which path actually executed, since a broken/unavailable worker
 * degrades to the same synchronous behavior this tab always had rather than
 * breaking the tab.
 */
export function MultiRaidResultsSection({
  hydratedPoolCount,
  entryIdentities,
  entryMovesetBadges,
  pool,
  rosterDroppedCount,
  rosterStaleMovesetBadgeCount,
  bossCount,
  run,
  isRunning,
  isStale,
  ranOn,
  elapsedMs,
  progress,
  onRunSweep,
  rankBy,
  significanceMode,
}: MultiRaidResultsSectionProps) {
  const [showAllMultiRaidCandidates, setShowAllMultiRaidCandidates] = useState(false);

  // `run?.data?.X ?? []` is deliberately NOT pulled out into its own
  // `const` above these — a fresh `[]` on every render (whenever data is
  // null) would make useMemo's own dependency array change every render too
  // (react-hooks/exhaustive-deps). Depending on `run` itself instead is
  // stable across renders where nothing actually changed.
  const dedupedCandidates = useMemo(() => dedupeInterchangeableCandidates(run?.data?.candidates ?? [], pool), [run, pool]);
  // A candidate that only clears the noise floor against a SINGLE boss (not
  // the boss-set average) is FILTERED OUT of the ranked table entirely when
  // `significanceMode` is "aggregate-only" — never merely dimmed the way a
  // candidate insignificant under BOTH measures still is below. `exceedsNoise`
  // already reflects the CURRENT significanceMode (see rosterPlanner.ts's own
  // doc comment on RosterPowerUpCandidate.exceedsNoise), so a row only
  // qualifies as "hidden by this toggle" when it's per-boss significant
  // (`significantBossCount > 0`) yet still failed to clear `exceedsNoise` —
  // this is honestly derived from data every candidate already carries, not
  // a second engine run under the other mode.
  const hiddenBySignificanceMode = useMemo(
    () => dedupedCandidates.filter((g) => !g.representative.exceedsNoise && g.representative.significantBossCount > 0),
    [dedupedCandidates],
  );
  const qualifyingCandidates = useMemo(
    () => dedupedCandidates.filter((g) => g.representative.exceedsNoise || g.representative.significantBossCount === 0),
    [dedupedCandidates],
  );
  // Re-sorted client-side by the chosen rankBy — same "cheap, bound to the
  // LIVE selector" reasoning as single-raid's own sortedCandidates (kept in
  // sync via powerUpCandidateSort.ts's shared comparator, per CLAUDE.md's
  // standing decision that stardust/candy/XL efficiency are never blended
  // into one score). Sorted AFTER dedup, not before — dedupeInterchangeableCandidates
  // only needs a caller-preferred order to pick which member surfaces first
  // within a group, not to determine the final displayed order.
  const sortedCandidateGroups = useMemo(
    () =>
      sortCandidatesByEfficiency(qualifyingCandidates, (group) => ({
        delta: group.representative.meanDeltaTeamDps,
        isSignificant: group.representative.exceedsNoise,
        costStardust: group.representative.cost.stardust,
        efficiency: rosterCandidateEfficiency(group.representative, rankBy),
      })),
    [qualifyingCandidates, rankBy],
  );
  const visibleCandidateGroups = showAllMultiRaidCandidates
    ? sortedCandidateGroups
    : sortedCandidateGroups.slice(0, MULTI_RAID_TABLE_INITIAL_ROWS);

  const dedupedBenched = useMemo(() => dedupeInterchangeableCandidates(run?.data?.benchedButPromising ?? [], pool), [run, pool]);

  const dedupedBestBuddy = useMemo(
    () => dedupeInterchangeableBestBuddyCandidates(run?.data?.bestBuddyCandidates ?? [], pool),
    [run, pool],
  );
  // RosterBestBuddyCandidate carries no `level` field (Best Buddy doesn't
  // change a Pokémon's power-up level at all — see that type's own doc
  // comment), so MultiRaidBestBuddyRow needs it joined back from the pool,
  // same "entryId -> X" join shape as entryIdentities/entryMovesetBadges.
  const entryLevelById = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of pool) map.set(entry.entryId, entry.level);
    return map;
  }, [pool]);
  // Distinguishes the two real reasons dedupedBestBuddy can be empty (task
  // requirement: "nothing to recommend because you've already done it" must
  // read differently from a generic empty panel) — computed from data this
  // component already has, no new engine field needed. "already-best-buddy"
  // means every entryId appearing on ANY boss's baseline team is already
  // flagged; "none" covers everything else (nothing fielded at all, or a
  // stale run with no data).
  const bestBuddyEmptyReason = useMemo((): "already-best-buddy" | "none" | null => {
    if (!run?.data || run.data.bestBuddyCandidates.length > 0) return null;
    const fieldedEntryIds = new Set<string>();
    for (const b of run.data.baselinePerBoss) for (const id of b.team) fieldedEntryIds.add(id);
    if (fieldedEntryIds.size === 0) return "none";
    const poolById = new Map(pool.map((e) => [e.entryId, e]));
    const allAlreadyBestBuddy = [...fieldedEntryIds].every((id) => poolById.get(id)?.isBestBuddy);
    return allAlreadyBestBuddy ? "already-best-buddy" : "none";
  }, [run, pool]);

  const neverCompetitive = run?.data?.neverCompetitive ?? [];

  return (
    <CollapsibleSection id="pu-multi-raid-sweep" heading="Multi-raid sweep" defaultOpen>
      <p className="caveats" style={{ marginBottom: 12 }}>
        Ranks every power-up across your WHOLE imported roster against the boss set above — including currently
        BENCHED Pokémon that would only earn a team spot if powered up first (see &ldquo;Benched but
        promising&rdquo; below). Runs off the main thread in a background Web Worker when one is available (falling
        back to computing right here, briefly freezing the tab, only if a worker genuinely can&rsquo;t be used).
      </p>
      <p className="caveats" style={{ marginBottom: 12 }}>
        The &ldquo;Mega Level&rdquo; setting above applies ROSTER-WIDE, not per entry — the imported roster runs to
        ~164 Pokémon, so a per-entry control would be unusable. It only ever affects an entry that can actually
        Mega Evolve; everything else in the pool is untouched by it.
      </p>
      <div className="result-row" style={{ alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button type="button" onClick={onRunSweep} disabled={isRunning || hydratedPoolCount === 0 || bossCount === 0}>
          {isRunning ? "Running sweep…" : run ? "Run sweep again" : "Run sweep"}
        </button>
        {isRunning && (
          <span className="species-picker-hint">
            {(elapsedMs / 1000).toFixed(1)}s elapsed{progress ? ` — ${rosterProgressSentence(progress)}` : ""}
          </span>
        )}
        {!isRunning && run && ranOn && (
          <span
            className="species-picker-hint"
            title={
              ranOn === "worker"
                ? "This sweep ran in a background Web Worker — the tab stayed responsive while it computed."
                : "The background worker couldn't be used (construction failed, or it errored before replying) — this sweep ran on the main thread instead, same as before this tab had a worker."
            }
          >
            {ranOn === "worker" ? "computed off the main thread" : "computed on the main thread (worker unavailable)"} in{" "}
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
        {isStale && run && !isRunning && (
          <span className="badge badge-pending" title="Settings or roster changed since this result was computed.">
            stale — click Run sweep again
          </span>
        )}
        {rosterDroppedCount > 0 && (
          <span className="caveats">
            {rosterDroppedCount} stored roster entr{rosterDroppedCount === 1 ? "y" : "ies"} reference a species this
            data layer no longer has.
          </span>
        )}
        {rosterStaleMovesetBadgeCount > 0 && (
          <span
            className="caveats"
            title="These rows carry no default-moveset signal at all yet, even where one would show today — not the same as a genuinely fully-resolved moveset. Re-import your Poke Genie CSV export to restore it."
          >
            {rosterStaleMovesetBadgeCount} roster entr{rosterStaleMovesetBadgeCount === 1 ? "y" : "ies"} imported
            before moveset badges existed — re-import your CSV to see &ldquo;default moveset&rdquo; flags below.
          </span>
        )}
      </div>

      {!run && !isRunning && (
        <p className="caveats">
          {hydratedPoolCount === 0 ? (
            <>
              No roster imported in this browser yet — import a Poke Genie CSV export (or hand-add Pokémon) on the{" "}
              <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a>, then come back and click &ldquo;Run
              sweep&rdquo;.
            </>
          ) : bossCount === 0 ? (
            "No bosses selected — pick at least one under “Boss set” above, then click “Run sweep”."
          ) : (
            "Click “Run sweep” to rank power-ups across this roster and boss set."
          )}
        </p>
      )}

      {run?.error && (
        <p className="error-text">Could not compute this sweep: {run.error}</p>
      )}

      {run?.blockedReason === "no-roster" && (
        <p className="caveats">
          No roster imported in this browser yet — this shared link carries every SETTING (boss set, budgets,
          dodge/weather/timer) but never the roster itself (see the note under &ldquo;Share this scenario&rdquo;).
          Import a Poke Genie CSV export (or hand-add Pokémon) on the{" "}
          <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a>, then come back and click &ldquo;Run sweep&rdquo;
          again.
        </p>
      )}

      {run?.blockedReason === "no-bosses" && (
        <p className="caveats">
          None of this scenario&rsquo;s boss ids resolved to a registered species — the boss set may have rotated
          out entirely since this link was built. Pick a boss set under &ldquo;Boss set&rdquo; above, then click
          &ldquo;Run sweep&rdquo; again.
        </p>
      )}

      {run?.data && (
        <>
          <div className="result-card" style={{ marginBottom: 12 }}>
            <dl>
              <dt>Bosses swept</dt>
              <dd>{run.targets.length}</dd>
              <dt>Baseline team DPS range</dt>
              <dd>
                {Math.min(...run.data.baselinePerBoss.map((b) => b.summary.teamDps)).toFixed(1)}
                {" – "}
                {Math.max(...run.data.baselinePerBoss.map((b) => b.summary.teamDps)).toFixed(1)}
              </dd>
              <dt title="Combined across bosses in quadrature — see rosterPlanner.ts's own doc comment for why raw teamDps can't be pooled across bosses of very different difficulty.">
                Aggregate noise floor
              </dt>
              <dd>±{run.data.noiseFloorTeamDps.toFixed(3)} team DPS ({run.data.iterations} seeds, {run.data.screenIterations} screen)</dd>
              <dt>Benched but promising</dt>
              <dd>{run.data.benchedButPromising.length}</dd>
              <dt title="Pool entries not already flagged Best Buddy, fielded on at least one boss's baseline team — see the Best Buddy candidates table below.">
                Best Buddy candidates
              </dt>
              <dd>{run.data.bestBuddyCandidates.length}</dd>
              <dt title="Excluded from candidate generation entirely — an unevolved species, one with no affordable level, or one where no affordable level touches any boss's team. Never silently hidden.">
                Never competitive
              </dt>
              <dd>{run.data.neverCompetitive.length}</dd>
              <dt title="Significant against at least one boss, but not against the boss-set average — hidden from the ranked table below only because &quot;Also count a candidate that only helps against one boss…&quot; above is unchecked.">
                Hidden by significance mode
              </dt>
              <dd>
                {hiddenBySignificanceMode.length} candidate{hiddenBySignificanceMode.length === 1 ? "" : "s"} hidden:
                significant against one boss but not on average
                {significanceMode === "aggregate-only" && hiddenBySignificanceMode.length > 0
                  ? " — check the box above to reveal them"
                  : ""}
              </dd>
            </dl>
          </div>

          <h3>
            Ranked candidates
            <span className="species-picker-hint" style={{ marginLeft: 8 }}>
              grouped: measurable gains first (sorted by {rankByLabel(rankBy)}, descending), then within-noise rows
              (cheapest first), then measurable losses last (worst first)
            </span>
          </h3>
          <div className="table-scroll">
            <table className="time-series-table">
              <MultiRaidCandidateTableHead withTooltips />
              <tbody>
                {visibleCandidateGroups.map((group) => (
                  <MultiRaidCandidateRow
                    key={group.key}
                    group={group}
                    identity={entryIdentities.get(group.representative.entryId)}
                    movesetBadge={entryMovesetBadges.get(group.representative.entryId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {qualifyingCandidates.length > MULTI_RAID_TABLE_INITIAL_ROWS && (
            <button type="button" style={{ marginTop: 8 }} onClick={() => setShowAllMultiRaidCandidates((v) => !v)}>
              {showAllMultiRaidCandidates ? `Show top ${MULTI_RAID_TABLE_INITIAL_ROWS} only` : `Show all ${qualifyingCandidates.length}`}
            </button>
          )}

          <CollapsibleSection
            id="pu-multi-best-buddy"
            heading={`Best Buddy candidates (no stardust/candy cost) — ${dedupedBestBuddy.length} row${dedupedBestBuddy.length === 1 ? "" : "s"}`}
            headingLevel="h3"
            defaultOpen
            variant="subsection"
          >
            <p className="caveats" style={{ marginBottom: 12 }}>
              Best Buddy&rsquo;s +1 effective level costs ZERO stardust and ZERO candy, so it can&rsquo;t be ranked
              by either of this tab&rsquo;s cost-efficiency axes and never appears in the ranked table above —
              evaluated here for every pool entry fielded on at least one boss&rsquo;s baseline team that
              isn&rsquo;t already flagged Best Buddy (flag one on the{" "}
              <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a>). Each row is a real paired simulation with
              ONLY that one entry&rsquo;s Best Buddy flag flipped on, evaluated INDEPENDENTLY as if it were the only
              Best Buddy candidate — but only ONE Pokémon can be your trainer&rsquo;s active Best Buddy at a time in
              the real game, so more than one row can show a gain here without all being simultaneously achievable.
              Significance is aggregate OR per-boss, same test as the ranked table above — a dimmed row can still be
              genuinely significant against just ONE boss even though it&rsquo;s diluted away in the aggregate
              (against a real active-raid set, roughly half a top-attacker pool clears the per-boss bar while only a
              handful clear the aggregate one) — expand a row to see its per-boss breakdown. Currently-BENCHED
              entries are never evaluated here — there&rsquo;s no cheap, sound way to estimate whether Best
              Buddy&rsquo;s small fixed nudge alone would earn a benched entry a team spot.
            </p>
            {dedupedBestBuddy.length === 0 ? (
              <p className="caveats" style={{ color: "var(--text)" }}>
                {bestBuddyEmptyReason === "already-best-buddy"
                  ? "Nothing to recommend — every Pokémon fielded on at least one boss's baseline team is already flagged Best Buddy on the Roster tab."
                  : "No pool entry fielded on any boss's baseline team is eligible for a Best Buddy row."}
              </p>
            ) : (
              <div className="table-scroll">
                <table className="time-series-table">
                  <thead>
                    <tr>
                      <th>Species</th>
                      <th>Level</th>
                      <th title="Weighted mean across every swept boss">Mean Δ team DPS</th>
                      <th title="The single largest-magnitude per-boss effect">Best boss Δ</th>
                      <th title="Bosses where this candidate's own effect clears THAT boss's own noise floor">Significant bosses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dedupedBestBuddy.map((group) => (
                      <MultiRaidBestBuddyRow
                        key={`bb-${group.key}`}
                        group={group}
                        level={entryLevelById.get(group.representative.entryId)}
                        identity={entryIdentities.get(group.representative.entryId)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleSection>

          {run.data.benchedButPromising.length > 0 && (
            <CollapsibleSection
              id="pu-multi-benched"
              heading={`Benched but promising — ${dedupedBenched.length} row${dedupedBenched.length === 1 ? "" : "s"}`}
              headingLevel="h3"
              defaultOpen={false}
              variant="subsection"
            >
              <p className="caveats" style={{ marginBottom: 12 }}>
                Not on any boss&rsquo;s baseline team today, but the cheapest power-up level that would earn one a
                spot — the headline &ldquo;would a benched Pokémon beat a fielded one if powered up&rdquo; question
                this mode exists to ask.
              </p>
              <div className="table-scroll">
                <table className="time-series-table">
                  <MultiRaidCandidateTableHead withTooltips={false} />
                  <tbody>
                    {dedupedBenched.map((group) => (
                      <MultiRaidCandidateRow
                        key={`bench-${group.key}`}
                        group={group}
                        identity={entryIdentities.get(group.representative.entryId)}
                        movesetBadge={entryMovesetBadges.get(group.representative.entryId)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}

          {run.data.hypotheticalCatches.length > 0 && (
            <CollapsibleSection
              id="pu-multi-hypothetical-catches"
              heading={`What if you caught a fresh one? — ${run.data.hypotheticalCatches.length} row${run.data.hypotheticalCatches.length === 1 ? "" : "s"}`}
              headingLevel="h3"
              defaultOpen
              variant="subsection"
            >
              <p className="caveats" style={{ marginBottom: 12 }}>
                Real species at a real raid-catch level, perfect 15/15/15 IVs, default moveset — never priced, never
                part of the fixed-budget plan (a fresh catch has no ledger cost). Purely "is this even worth
                fielding."
              </p>
              <div className="table-scroll">
                <table className="time-series-table">
                  <thead>
                    <tr>
                      <th>Species</th>
                      <th>Level</th>
                      <th title="Weighted mean across every swept boss">Mean Δ team DPS</th>
                      <th title="The single largest-magnitude per-boss effect">Best boss Δ</th>
                      <th title="Bosses where this catch's own effect clears THAT boss's own noise floor">Significant bosses</th>
                      <th title="Bosses where this catch would newly enter the team, displacing the lowest-ranked fielded entry">
                        Newly fielded
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.data.hypotheticalCatches.map((impact) => (
                      <MultiRaidHypotheticalCatchRow key={impact.id} impact={impact} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}

          <ExcludedEntriesTable
            sectionId="pu-multi-never-competitive"
            heading="Never competitive"
            description="Excluded from candidate generation entirely — reported, not hidden, so this sweep never silently ignores most of the roster. An unevolved species is excluded because evolution (candy only, no stardust) always buys strictly more team DPS per stardust afterward — power it up AFTER evolving."
            entries={neverCompetitive}
            entryMovesetBadges={entryMovesetBadges}
          />
        </>
      )}
    </CollapsibleSection>
  );
}
