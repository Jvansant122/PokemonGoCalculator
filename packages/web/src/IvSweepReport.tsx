import type { IVSpread } from "@pogo-analyzer/engine";
import { TIER_4_PLUS_LABELS, bucketVerdictSentence, type IvSweepAggregate } from "./ivBreakpointsHelpers.js";

interface Props {
  sweepAggregate: IvSweepAggregate;
  ivA: IVSpread;
  ivB: IVSpread;
}

/**
 * The "Impact across every raid target this tool can model" panel section of
 * IvBreakpointsView.tsx — the tier-filtered headline sentence plus the
 * per-tier breakdown table and caveats. Split out of the view's own render
 * function purely to bring that function's size down (pure refactor, no
 * behavior change); `sweepAggregate` itself is still computed in the parent
 * view (it depends on several other pieces of that view's own state/memo
 * chain), this component only renders it.
 */
export function IvSweepReport({ sweepAggregate, ivA, ivB }: Props) {
  return (
    <section className="panel">
      <h2>Impact across every raid target this tool can model</h2>
      <p className="crossover-note">
        {bucketVerdictSentence(
          sweepAggregate.tier4Plus,
          ivA,
          ivB,
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
        each target's own resolved raid tier (<code>raidTierForSpeciesId(id) ?? defaultRaidTierForSpecies(species)</code>{" "}
        — the same resolution used to build that target's boss stats everywhere else in this tool). The headline
        sentence above only aggregates the tier-4-and-higher buckets from the table; the table itself shows every
        tier this sweep actually populated, including 1-Star/3-Star. This is NOT a claim about every raid boss
        that has ever existed — see the caveats section below.
        {sweepAggregate.errorCount > 0 &&
          ` ${sweepAggregate.errorCount} registered species could not be computed (missing moveset data) and are excluded from the totals above.`}
      </p>
      <p className="caveats" style={{ margin: "8px 0 12px" }}>
        Honest limitation: any species that isn't a currently-active real raid boss now defaults to a tier chosen
        by its own rarity, not a single blanket tier — a real mega/primal-boosted form defaults to Mega Raids
        (tier 4), a Legendary defaults to 5-Star Raids (tier 5), an ordinary Standard-rarity species (the vast
        majority of the roster) defaults to 3-Star Raids (tier 3, so it's excluded from the headline above), and
        anything Mythic/Ultra Beast/unclassified falls back to the same 5-Star Raids placeholder this tool always
        used before this per-rarity default existed. That means this tier restriction's practical effect on
        today's numbers is substantial, not narrow: it excludes {sweepAggregate.totalComputed - sweepAggregate.tier4Plus.total}{" "}
        of the {sweepAggregate.totalComputed} modeled targets above — mostly ordinary Standard-rarity species
        defaulting to 3-Star Raids, plus the handful of 1-Star/3-Star raids currently live in the real rotation —
        leaving {sweepAggregate.tier4Plus.total} targets (mostly real Legendaries, real mega/primal forms, and
        anything currently live at Mega Raids/5-Star Raids or higher) in the headline scope.
      </p>
    </section>
  );
}
