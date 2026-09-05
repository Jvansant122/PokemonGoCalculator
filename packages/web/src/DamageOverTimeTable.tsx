import { ownDamageAt, teamContributionAt, type DamageOverTimeSeries } from "./DamageOverTimeChart.js";

interface Props {
  x: DamageOverTimeSeries;
  y: DamageOverTimeSeries;
  teammateDps: number;
  partySize: number;
  /** See DamageOverTimeChart's matchingTeammateCount — same convertUptimeToTeamDamage input, reused as-is. */
  matchingTeammateCount: number;
  maxSeconds: number;
}

// A fixed row count regardless of fight length is deliberate: a fixed
// *interval* (e.g. one row per second) would make a short fight's table too
// sparse (Scenario A's ~10s default) or a long persists-through-faint fight's
// table absurdly long (PRIMAL_KYOGRE's 150s+ window) — dividing the same
// displayed window (chartMaxSeconds, matching the chart above) into a
// constant number of rows keeps both readable.
const ROW_COUNT = 14;
const EPS = 1e-9;

function formatDamage(v: number): string {
  return v.toFixed(0);
}

function formatDps(v: number | null): string {
  return v === null ? "-" : v.toFixed(1);
}

interface RowValues {
  totalDps: number | null;
  damageTaken: number;
  avgDps: number | null;
}

function rowFor(
  series: DamageOverTimeSeries,
  t: number,
  teammateDps: number,
  partySize: number,
  matchingTeammateCount: number,
): RowValues {
  const ownCumulative = ownDamageAt(series.ownDamageTrajectory, t);
  const team = teamContributionAt(series, t, teammateDps, partySize, matchingTeammateCount);
  const damageTaken = series.damageTakenTrajectory ? ownDamageAt(series.damageTakenTrajectory, t) : 0;
  return {
    avgDps: t > 0 ? ownCumulative / t : null,
    totalDps: t > 0 ? (ownCumulative + team) / t : null,
    damageTaken,
  };
}

/**
 * Time-series companion to DamageOverTimeChart directly above it (same panel,
 * same representative run/seed, same displayed window maxSeconds) — where the
 * chart plots one combined line per candidate, this breaks that same
 * underlying data into readable rows: Total DPS (own+team combined rate,
 * mirrors the result card's "Own + team damage from boost" but as a rate
 * over time), Damage Taken (cumulative, from damageTakenTrajectory), and
 * Average DPS (own-only rate, mirrors the result card's "Own damage per
 * second"). Reuses ownDamageAt/teamContributionAt from DamageOverTimeChart.tsx
 * rather than a second copy of the event-trajectory-to-value-at-t
 * interpolation.
 */
export function DamageOverTimeTable({ x, y, teammateDps, partySize, matchingTeammateCount, maxSeconds }: Props) {
  // Skips t=0 (an "Average DPS so far" at zero elapsed time is undefined) and
  // lands the final row exactly on maxSeconds, so that row lines up with the
  // already-displayed result-card totals for a sanity check.
  const times = Array.from({ length: ROW_COUNT }, (_, i) => ((i + 1) / ROW_COUNT) * maxSeconds);

  const xDiedInWindow = x.secondsSurvivedCutoff < maxSeconds - EPS;
  const yDiedInWindow = y.secondsSurvivedCutoff < maxSeconds - EPS;

  return (
    <div style={{ marginTop: 20, overflowX: "auto" }}>
      <table className="time-series-table">
        <thead>
          <tr>
            <th rowSpan={2}>Time</th>
            <th colSpan={3} className="time-series-th-x">
              {x.name}
            </th>
            <th colSpan={3} className="time-series-th-y">
              {y.name}
            </th>
          </tr>
          <tr>
            <th className="time-series-th-x">Total DPS</th>
            <th className="time-series-th-x">Damage taken</th>
            <th className="time-series-th-x">Avg DPS</th>
            <th className="time-series-th-y">Total DPS</th>
            <th className="time-series-th-y">Damage taken</th>
            <th className="time-series-th-y">Avg DPS</th>
          </tr>
        </thead>
        <tbody>
          {times.map((t) => {
            const rx = rowFor(x, t, teammateDps, partySize, matchingTeammateCount);
            const ry = rowFor(y, t, teammateDps, partySize, matchingTeammateCount);
            return (
              <tr key={t}>
                <td>{t.toFixed(1)}s</td>
                <td>{formatDps(rx.totalDps)}</td>
                <td>{formatDamage(rx.damageTaken)}</td>
                <td>{formatDps(rx.avgDps)}</td>
                <td>{formatDps(ry.totalDps)}</td>
                <td>{formatDamage(ry.damageTaken)}</td>
                <td>{formatDps(ry.avgDps)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="caveats" style={{ marginTop: 8 }}>
        Same representative run (seed 1) as the chart above, sampled at {ROW_COUNT} even intervals across the same
        ~{maxSeconds.toFixed(1)}s window — not {ROW_COUNT} independent measurements, but the same event-driven
        cumulative trajectories held flat between events (step interpolation), same as the chart's own lines.
        {(xDiedInWindow || yDiedInWindow) && " "}
        {xDiedInWindow &&
          `${x.name} died ~${x.secondsSurvivedCutoff.toFixed(1)}s into this run — its own damage and damage taken stop growing from then on${
            x.persistsThroughFaint ? ", though its team contribution (and so Total DPS) keeps accruing since this boost persists past faint" : ""
          }, so its DPS columns drift downward in later rows as elapsed time outgrows a damage total that mostly isn't. `}
        {yDiedInWindow &&
          `${y.name} died ~${y.secondsSurvivedCutoff.toFixed(1)}s into this run — its own damage and damage taken stop growing from then on${
            y.persistsThroughFaint ? ", though its team contribution (and so Total DPS) keeps accruing since this boost persists past faint" : ""
          }, so its DPS columns drift downward in later rows as elapsed time outgrows a damage total that mostly isn't.`}
      </p>
    </div>
  );
}
