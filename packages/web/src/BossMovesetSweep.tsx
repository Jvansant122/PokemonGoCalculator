import { convertUptimeToTeamDamage } from "@pogo-analyzer/engine";
import type { BossMovesetVariantResult } from "@pogo-analyzer/engine";

interface CandidateMeta {
  name: string;
  /** undefined means this candidate has no mega/primal boost active at all — see uptime.ts's UptimeConversionInputs.boostMultiplier. Never fall back to 1 here. */
  boostMultiplier: number | undefined;
  persistsThroughFaint: boolean;
}

interface Props {
  variants: BossMovesetVariantResult[];
  candidateMeta: [CandidateMeta, CandidateMeta];
  partySize: number;
  teammateDps: number;
  matchingTeammateCount: number;
}

/**
 * Compact table showing whether the ranking between the two candidates
 * depends on which MOVESET (fast + charged move pair) the boss instance
 * happens to have rolled — a real raid boss is locked to one fixed fast move
 * and one fixed charged move for its whole lifetime, but different instances
 * of "the same" boss can roll different pairs from its known movepool (see
 * compareAcrossBossMovesets's own doc comment in comparison.ts — the boss's
 * fast move drives both incoming chip damage AND its own energy/charged-move
 * cadence, so it's swept alongside the charged move, not held fixed). Only
 * rendered by the caller when the boss actually has 2+ distinct fast x
 * charged combinations; a boss with only one of each has nothing to sweep.
 *
 * Rows are grouped by fast move (rowSpan on the "Boss fast move" cell) since
 * the engine's iteration order is a documented stable contract (fast-major,
 * charged-minor — see compareAcrossBossMovesets's own doc comment), so every
 * variant sharing a fast move is already contiguous in `variants` and no
 * extra sort/group bookkeeping is needed beyond a single linear pass. This
 * keeps a worst-case ~36-row table (4 fast x 9 charged, starmie-mega)
 * legible — a flat table would repeat the same fast-move name up to 9 times
 * in a row.
 *
 * "Winner" here is decided the same way every other winner-shaped number in
 * this app is (own total damage + attributable team damage over a shared
 * fight-length window, matching sensitivity.ts's winnerOf) — not own damage
 * alone, since that would contradict this project's own "survivability
 * counted as team DPS" thesis.
 */
export function BossMovesetSweep({ variants, candidateMeta, partySize, teammateDps, matchingTeammateCount }: Props) {
  const rows = variants.map((variant) => {
    const a = variant.results[0]!;
    const b = variant.results[1]!;
    const fightDurationSeconds = Math.max(a.meanSecondsSurvived, b.meanSecondsSurvived);
    const teamA = convertUptimeToTeamDamage({
      secondsSurvived: a.meanSecondsSurvived,
      boostMultiplier: candidateMeta[0].boostMultiplier,
      teammateCount: partySize,
      matchingTeammateCount,
      teammateDps,
      persistsThroughFaint: candidateMeta[0].persistsThroughFaint,
      fightDurationSeconds,
    });
    const teamB = convertUptimeToTeamDamage({
      secondsSurvived: b.meanSecondsSurvived,
      boostMultiplier: candidateMeta[1].boostMultiplier,
      teammateCount: partySize,
      matchingTeammateCount,
      teammateDps,
      persistsThroughFaint: candidateMeta[1].persistsThroughFaint,
      fightDurationSeconds,
    });
    const ownPlusTeamA = a.meanTotalDamage + teamA;
    const ownPlusTeamB = b.meanTotalDamage + teamB;
    const winnerIndex: 0 | 1 | null = ownPlusTeamA === ownPlusTeamB ? null : ownPlusTeamA > ownPlusTeamB ? 0 : 1;
    return {
      fastMoveId: variant.fastMoveId,
      fastMoveName: variant.fastMoveName,
      chargedMoveId: variant.chargedMoveId,
      chargedMoveName: variant.chargedMoveName,
      secondsSurvived: [a.meanSecondsSurvived, b.meanSecondsSurvived] as [number, number],
      totalDamage: [a.meanTotalDamage, b.meanTotalDamage] as [number, number],
      ownPlusTeam: [ownPlusTeamA, ownPlusTeamB] as [number, number],
      winnerIndex,
    };
  });

  // Group consecutive rows sharing a fast move (safe because the engine's
  // iteration order is fast-major/charged-minor — see this file's own top
  // doc comment) so the "Boss fast move" column only prints once per group,
  // via a rowSpan on that group's first row. `fastMoveRowSpans` maps a row's
  // index to its group's span, but only for the index that STARTS a group —
  // every other row in the group renders no fast-move cell at all.
  const fastMoveRowSpans = new Map<number, number>();
  rows.forEach((r, i) => {
    if (i === 0 || rows[i - 1]!.fastMoveId !== r.fastMoveId) {
      let span = 1;
      while (rows[i + span] && rows[i + span]!.fastMoveId === r.fastMoveId) span++;
      fastMoveRowSpans.set(i, span);
    }
  });

  const winners = new Set(rows.map((r) => r.winnerIndex));
  const rankingFlips = winners.size > 1;
  const noBoost = [candidateMeta[0].boostMultiplier === undefined, candidateMeta[1].boostMultiplier === undefined] as const;
  // "Own+team" is only a distinct number from "Own total" when at least one
  // candidate actually has team contribution to add — when neither does, it
  // would just silently duplicate "Own total" for both, misleadingly
  // implying a distinction that doesn't exist. Dropped entirely in that case
  // (the winner column then reflects "Own total" alone, which is exactly the
  // same ranking anyway).
  const showOwnPlusTeamColumn = !noBoost[0] || !noBoost[1];

  return (
    <div className="table-scroll" style={{ marginTop: 20 }}>
      <table className="time-series-table">
        <thead>
          <tr>
            <th rowSpan={2}>Boss fast move</th>
            <th rowSpan={2}>Boss charged move</th>
            <th colSpan={showOwnPlusTeamColumn ? 3 : 2} className="time-series-th-x">
              {candidateMeta[0].name}
            </th>
            <th colSpan={showOwnPlusTeamColumn ? 3 : 2} className="time-series-th-y">
              {candidateMeta[1].name}
            </th>
            <th rowSpan={2}>{showOwnPlusTeamColumn ? "Winner (own+team)" : "Winner (own total)"}</th>
          </tr>
          <tr>
            <th className="time-series-th-x">Survival (s)</th>
            <th className="time-series-th-x">Own total</th>
            {showOwnPlusTeamColumn && <th className="time-series-th-x">Own+team</th>}
            <th className="time-series-th-y">Survival (s)</th>
            <th className="time-series-th-y">Own total</th>
            {showOwnPlusTeamColumn && <th className="time-series-th-y">Own+team</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const groupSpan = fastMoveRowSpans.get(i);
            return (
              <tr key={`${r.fastMoveId}-${r.chargedMoveId}`}>
                {groupSpan !== undefined && (
                  <td rowSpan={groupSpan} style={{ textAlign: "left", verticalAlign: "top" }}>
                    {r.fastMoveName}
                  </td>
                )}
                <td style={{ textAlign: "left" }}>{r.chargedMoveName}</td>
                <td>{r.secondsSurvived[0].toFixed(1)}</td>
                <td>{r.totalDamage[0].toFixed(0)}</td>
                {showOwnPlusTeamColumn && <td>{r.ownPlusTeam[0].toFixed(0)}</td>}
                <td>{r.secondsSurvived[1].toFixed(1)}</td>
                <td>{r.totalDamage[1].toFixed(0)}</td>
                {showOwnPlusTeamColumn && <td>{r.ownPlusTeam[1].toFixed(0)}</td>}
                <td style={{ textAlign: "left" }}>
                  {r.winnerIndex === null ? "tied" : candidateMeta[r.winnerIndex].name}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="caveats note-block" style={{ marginTop: 12 }}>
        Every row uses the same assumptions above (level, dodge, other trainers, weather, etc.) — only the boss's fast
        and charged move vary, since a real raid boss instance is locked to one fixed pair for its whole lifetime, but
        different instances of "the same" boss can roll different pairs from its known movepool (rows are grouped by
        fast move; the fast move also drives incoming chip damage and the boss's own charged-move cadence, so it's
        swept alongside the charged move rather than held fixed).{" "}
        {rankingFlips ? (
          <strong className="text-good">
            The winner between {candidateMeta[0].name} and {candidateMeta[1].name} depends on which moveset (fast +
            charged move pair) this boss instance rolled — it is not the same across every variant above.
          </strong>
        ) : (
          `${winners.size === 1 && rows[0]!.winnerIndex !== null ? candidateMeta[rows[0]!.winnerIndex!].name : "Neither candidate"} wins regardless of which moveset this boss instance rolled.`
        )}
        {showOwnPlusTeamColumn ? (
          <>
            {noBoost[0] &&
              ` ${candidateMeta[0].name} has no active mega/primal boost — its "Own+team" column above equals its "Own total" column exactly.`}
            {noBoost[1] &&
              ` ${candidateMeta[1].name} has no active mega/primal boost — its "Own+team" column above equals its "Own total" column exactly.`}
          </>
        ) : (
          " Neither candidate has an active mega/primal boost in this scenario, so the redundant \"Own+team\" column — which would equal \"Own total\" exactly for both — has been dropped."
        )}
      </p>
    </div>
  );
}
