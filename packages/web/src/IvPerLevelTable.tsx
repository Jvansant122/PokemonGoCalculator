import type { IVSpread, IvComparisonResult, IvComparisonRow } from "@pogo-analyzer/engine";
import { headline, ivLabel } from "./ivBreakpointsHelpers.js";

interface Props {
  data: IvComparisonResult;
  ivA: IVSpread;
  ivB: IVSpread;
  rows: IvComparisonRow[];
  /** Same rows, reversed for display (highest level first) — see IvBreakpointsView's own doc comment on rowsForTable. */
  rowsForTable: IvComparisonRow[];
  divergingCounts: { fastMoveDamage: number; chargedMoveDamage: number; timeToFaint: number };
}

/**
 * The "Per-level breakdown" panel section of IvBreakpointsView.tsx — the
 * headline sentence, diverging-level counts, and the full level-by-level
 * table (levels 35-50, both spreads side by side). Split out of the view's
 * own render function purely to bring that function's size down (pure
 * refactor, no behavior change).
 */
export function IvPerLevelTable({ data, ivA, ivB, rows, rowsForTable, divergingCounts }: Props) {
  return (
    <section className="panel">
      <h2>Per-level breakdown</h2>
      <p className="crossover-note">{headline(data, ivA, ivB)}</p>
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
                Spread A ({ivLabel(ivA)})
              </th>
              <th colSpan={5} className="time-series-th-y">
                Spread B ({ivLabel(ivB)})
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
              const ttfWinner = row.timeToFaintDiffers
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
  );
}
