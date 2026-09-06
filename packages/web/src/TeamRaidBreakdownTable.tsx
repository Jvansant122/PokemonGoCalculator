import type { TeamRaidSlotResult } from "@pogo-analyzer/engine";

interface Props {
  /** Flat, chronological list across every cycle — TeamRaidResult.slots as-is (a slot that faints and gets revived across 2 cycles produces 2 separate rows here). */
  rows: TeamRaidSlotResult[];
  clearingCycleIndex: number | null;
  clearingSlotIndex: number | null;
}

/**
 * Per-cycle/per-slot survive-or-faint breakdown — one row per actual fight
 * (not per configured slot), since a slot can fight more than once across
 * wipe-and-revive cycles. Reuses the existing time-series-table styling
 * (DamageOverTimeTable.tsx's convention) rather than a new table style.
 */
export function TeamRaidBreakdownTable({ rows, clearingCycleIndex, clearingSlotIndex }: Props) {
  return (
    <table className="time-series-table">
      <thead>
        <tr>
          <th>Cycle</th>
          <th>Slot</th>
          <th>Species</th>
          <th>Seconds active</th>
          <th>Own damage</th>
          <th>Fainted at</th>
          <th>Raid clock (start–end)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isFinishingBlow = r.cycleIndex === clearingCycleIndex && r.slotIndex === clearingSlotIndex;
          return (
            <tr key={`${r.cycleIndex}-${r.slotIndex}-${i}`}>
              <td>{r.cycleIndex}</td>
              <td>{r.slotIndex + 1}</td>
              <td>
                {r.speciesName}
                {isFinishingBlow && <span className="badge badge-persists">clear</span>}
              </td>
              <td>{r.secondsActive.toFixed(1)}s</td>
              <td>{r.ownDamageDealt.toFixed(0)}</td>
              <td>{r.faintedAtSeconds === null ? "survived" : `${r.faintedAtSeconds.toFixed(1)}s`}</td>
              <td>
                {r.startedAtRaidSeconds.toFixed(1)}s – {r.endedAtRaidSeconds.toFixed(1)}s
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
