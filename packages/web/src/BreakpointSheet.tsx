import { useMemo } from "react";
import type { DamageGridCell } from "@pogo-analyzer/engine";

interface Props {
  title: string;
  /** Flat, full IV x level grid from attackDamageGrid/defenseDamageGrid — ascending IV, ascending level (whatever order `levels` below was computed with). */
  cells: DamageGridCell[];
  /** The IV values this grid was swept over, ascending (0-15, or 0-15 minus Stamina for Defense mode — see AttackDefenseBreakpointsView's own doc comment). */
  ivRange: number[];
  /** The levels this grid was swept over, ASCENDING (e.g. LEVELS_25_TO_50) — this component reverses it for the actual rendered column order, per the "compute ascending, reverse only for display" convention IvBreakpointsView.tsx's own rowsForTable already established. */
  levelsAscending: number[];
  /** "Attack IV" or "Defense IV" — the row header label. */
  ivLabel: string;
}

/**
 * One 16-row (or fewer, for a caller-narrowed ivRange) x N-column spreadsheet
 * table rendering a single full `DamageGridCell[]` — reused for all four
 * sheets (attack-fast, attack-charged, defense-fast, defense-charged) in
 * AttackDefenseBreakpointsView.tsx rather than four copies of a table. Rows
 * are IV descending (15 at top) so the "best" row reads first, matching this
 * tab's descending-level column convention (50 at left) — both axes put the
 * highest/most-invested value first, an implementer's call since the plan
 * only mandated the level axis's direction explicitly.
 *
 * A cell is visually marked as a "breakpoint" (`.breakpoint-cell-changed`)
 * when its damage differs from the same IV row's cell at the next level DOWN
 * in the ascending scan (i.e. the previous level actually computed, not
 * necessarily a full point lower since this scans in 0.5 steps) — the cell
 * where a stat crossed into a new floored-damage bracket. The lowest scanned
 * level in a row is never marked (nothing to compare it against within this
 * table's own range).
 */
export function BreakpointSheet({ title, cells, ivRange, levelsAscending, ivLabel }: Props) {
  const grid = useMemo(() => {
    const map = new Map<number, Map<number, DamageGridCell>>();
    for (const cell of cells) {
      let levelMap = map.get(cell.iv);
      if (!levelMap) {
        levelMap = new Map();
        map.set(cell.iv, levelMap);
      }
      levelMap.set(cell.level, cell);
    }
    return map;
  }, [cells]);

  const levelsDescending = useMemo(() => [...levelsAscending].reverse(), [levelsAscending]);
  const ivRowsDescending = useMemo(() => [...ivRange].reverse(), [ivRange]);

  function isBreakpointCell(iv: number, level: number, levelIdx: number): boolean {
    if (levelIdx === 0) return false;
    const levelMap = grid.get(iv);
    if (!levelMap) return false;
    const current = levelMap.get(level);
    const previous = levelMap.get(levelsAscending[levelIdx - 1]!);
    if (!current || !previous) return false;
    return current.damage !== previous.damage;
  }

  return (
    <div className="breakpoint-sheet">
      <h3>{title}</h3>
      <div className="table-scroll">
        <table className="breakpoint-table">
          <thead>
            <tr>
              <th className="breakpoint-corner">{ivLabel}</th>
              {levelsDescending.map((level) => (
                <th key={level}>{level}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ivRowsDescending.map((iv) => (
              <tr key={iv}>
                <td className="breakpoint-row-label">{iv}</td>
                {levelsDescending.map((level) => {
                  const levelIdx = levelsAscending.indexOf(level);
                  const cell = grid.get(iv)?.get(level);
                  const breakpoint = isBreakpointCell(iv, level, levelIdx);
                  return (
                    <td key={level} className={breakpoint ? "breakpoint-cell-changed" : undefined}>
                      {cell ? cell.damage : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
