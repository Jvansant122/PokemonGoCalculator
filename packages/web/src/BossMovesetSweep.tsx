import { convertUptimeToTeamDamage } from "@pogo-analyzer/engine";
import type { BossChargedMoveVariantResult } from "@pogo-analyzer/engine";

interface CandidateMeta {
  name: string;
  /** undefined means this candidate has no mega/primal boost active at all — see uptime.ts's UptimeConversionInputs.boostMultiplier. Never fall back to 1 here. */
  boostMultiplier: number | undefined;
  persistsThroughFaint: boolean;
}

interface Props {
  variants: BossChargedMoveVariantResult[];
  candidateMeta: [CandidateMeta, CandidateMeta];
  partySize: number;
  teammateDps: number;
  matchingTeammateCount: number;
}

/**
 * Compact table showing whether the ranking between the two candidates
 * depends on which charged-move variant the boss instance happens to have
 * rolled — a real raid boss is locked to one fixed charged move for its whole
 * lifetime, but different instances of "the same" boss can roll different
 * ones from its known movepool (see compareAcrossBossChargedMoves's own doc
 * comment in comparison.ts). Only rendered by the caller when the boss
 * actually has 2+ charged moves; a single-charged-move boss has nothing to
 * sweep.
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
      chargedMoveId: variant.chargedMoveId,
      chargedMoveName: variant.chargedMoveName,
      secondsSurvived: [a.meanSecondsSurvived, b.meanSecondsSurvived] as [number, number],
      totalDamage: [a.meanTotalDamage, b.meanTotalDamage] as [number, number],
      ownPlusTeam: [ownPlusTeamA, ownPlusTeamB] as [number, number],
      winnerIndex,
    };
  });

  const winners = new Set(rows.map((r) => r.winnerIndex));
  const rankingFlips = winners.size > 1;
  const noBoost = [candidateMeta[0].boostMultiplier === undefined, candidateMeta[1].boostMultiplier === undefined] as const;

  return (
    <div style={{ marginTop: 20, overflowX: "auto" }}>
      <table className="time-series-table">
        <thead>
          <tr>
            <th rowSpan={2}>Boss charged move</th>
            <th colSpan={3} className="time-series-th-x">
              {candidateMeta[0].name}
            </th>
            <th colSpan={3} className="time-series-th-y">
              {candidateMeta[1].name}
            </th>
            <th rowSpan={2}>Winner (own+team)</th>
          </tr>
          <tr>
            <th className="time-series-th-x">Survival (s)</th>
            <th className="time-series-th-x">Own total</th>
            <th className="time-series-th-x">Own+team</th>
            <th className="time-series-th-y">Survival (s)</th>
            <th className="time-series-th-y">Own total</th>
            <th className="time-series-th-y">Own+team</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.chargedMoveId}>
              <td style={{ textAlign: "left" }}>{r.chargedMoveName}</td>
              <td>{r.secondsSurvived[0].toFixed(1)}</td>
              <td>{r.totalDamage[0].toFixed(0)}</td>
              <td>{r.ownPlusTeam[0].toFixed(0)}</td>
              <td>{r.secondsSurvived[1].toFixed(1)}</td>
              <td>{r.totalDamage[1].toFixed(0)}</td>
              <td>{r.ownPlusTeam[1].toFixed(0)}</td>
              <td style={{ textAlign: "left" }}>
                {r.winnerIndex === null ? "tied" : candidateMeta[r.winnerIndex].name}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caveats" style={{ marginTop: 8 }}>
        Every row uses the same assumptions above (level, dodge, party, weather, etc.) — only the boss's charged move
        varies, since a real raid boss instance is locked to one fixed charged move for its whole lifetime, but
        different instances of "the same" boss can roll different ones from its known movepool.{" "}
        {rankingFlips ? (
          <strong style={{ color: "var(--good)" }}>
            The winner between {candidateMeta[0].name} and {candidateMeta[1].name} depends on which charged move this
            boss instance rolled — it is not the same across every variant above.
          </strong>
        ) : (
          `${winners.size === 1 && rows[0]!.winnerIndex !== null ? candidateMeta[rows[0]!.winnerIndex!].name : "Neither candidate"} wins regardless of which charged move this boss instance rolled.`
        )}
        {noBoost[0] &&
          ` ${candidateMeta[0].name} has no active mega/primal boost — its "Own+team" column above equals its "Own total" column exactly.`}
        {noBoost[1] &&
          ` ${candidateMeta[1].name} has no active mega/primal boost — its "Own+team" column above equals its "Own total" column exactly.`}
      </p>
    </div>
  );
}
