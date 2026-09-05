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

const EPS = 1e-9;

// Always sample at exactly 1-second intervals, regardless of total fight
// length — explicitly requested even though it makes for a much longer table
// on a long fight (e.g. ~198 rows for a 198s persists-through-faint window):
// the boss's fast attacks land every 1 second, and that's the granularity
// wanted here. This overrides an earlier "nice step targeting ~14 rows"
// design (row step of 1/2/5/10/15/30/60/120/300s, whichever got row count
// closest to 14) — that tradeoff was a reasonable default until the user
// asked specifically for fixed 1s rows to see fast-attack-level granularity.
const ROW_STEP_SECONDS = 1;

// Builds row times at a fixed 1s step, skipping t=0 (a cumulative total at
// zero elapsed time is trivially zero) and always landing a final row
// exactly on maxSeconds — even when maxSeconds isn't a whole number of
// seconds — so that row lines up with the already-displayed result-card
// totals for a sanity check.
function buildRowTimes(maxSeconds: number, step: number): number[] {
  const times: number[] = [];
  for (let t = step; t < maxSeconds - EPS; t += step) {
    times.push(t);
  }
  times.push(maxSeconds);
  return times;
}

function formatDamage(v: number): string {
  return v.toFixed(0);
}

interface RowValues {
  totalDamage: number;
  damageTaken: number;
  ownDamage: number;
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
    ownDamage: ownCumulative,
    totalDamage: ownCumulative + team,
    damageTaken,
  };
}

/**
 * Time-series companion to DamageOverTimeChart directly above it (same panel,
 * same representative run/seed, same displayed window maxSeconds) — where the
 * chart plots one combined line per candidate, this breaks that same
 * underlying data into readable rows. All three columns are running
 * cumulative totals (never divided by elapsed time), matching how the chart
 * above already displays cumulative lines rather than rates: Total damage
 * (own+team combined, mirrors the result card's "Own + team damage from
 * boost"), Damage taken (cumulative, from damageTakenTrajectory), and Own
 * damage (own-only cumulative, mirrors the result card's own-damage total).
 * A rate-based "DPS" framing was tried first and dropped — dividing a
 * cumulative total that freezes at death by elapsed time that keeps growing
 * produces a value that decays toward zero for a candidate that died early
 * relative to the displayed window, which reads as broken even though it's
 * mathematically what "average so far" means. Reuses ownDamageAt/
 * teamContributionAt from DamageOverTimeChart.tsx rather than a second copy
 * of the event-trajectory-to-value-at-t interpolation.
 */
export function DamageOverTimeTable({ x, y, teammateDps, partySize, matchingTeammateCount, maxSeconds }: Props) {
  const step = ROW_STEP_SECONDS;
  const times = buildRowTimes(maxSeconds, step);

  const xDiedInWindow = x.secondsSurvivedCutoff < maxSeconds - EPS;
  const yDiedInWindow = y.secondsSurvivedCutoff < maxSeconds - EPS;
  const xHasBoost = x.boostMultiplier !== undefined;
  const yHasBoost = y.boostMultiplier !== undefined;

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
            <th className="time-series-th-x">Total damage</th>
            <th className="time-series-th-x">Damage taken</th>
            <th className="time-series-th-x">Own damage</th>
            <th className="time-series-th-y">Total damage</th>
            <th className="time-series-th-y">Damage taken</th>
            <th className="time-series-th-y">Own damage</th>
          </tr>
        </thead>
        <tbody>
          {times.map((t) => {
            const rx = rowFor(x, t, teammateDps, partySize, matchingTeammateCount);
            const ry = rowFor(y, t, teammateDps, partySize, matchingTeammateCount);
            return (
              <tr key={t}>
                <td>{Math.round(t)}s</td>
                <td>{formatDamage(rx.totalDamage)}</td>
                <td>{formatDamage(rx.damageTaken)}</td>
                <td>{formatDamage(rx.ownDamage)}</td>
                <td>{formatDamage(ry.totalDamage)}</td>
                <td>{formatDamage(ry.damageTaken)}</td>
                <td>{formatDamage(ry.ownDamage)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="caveats" style={{ marginTop: 8 }}>
        Same representative run (seed 1) as the chart above, sampled every {step}s across the same ~
        {maxSeconds.toFixed(0)}s window (final row snapped to the exact window end even where that isn't a multiple
        of {step}s) — not {times.length} independent measurements, but the same event-driven cumulative
        trajectories held flat between events (step interpolation), same as the chart's own lines. All three columns
        are running totals, not rates, so a dead candidate's numbers simply stop growing rather than drifting
        anywhere.
        {(xDiedInWindow || yDiedInWindow) && " "}
        {xDiedInWindow &&
          `${x.name} died ~${x.secondsSurvivedCutoff.toFixed(1)}s into this run — its own damage and damage taken hold flat from then on${
            x.persistsThroughFaint ? ", though its team contribution (and so Total damage) keeps accruing since this boost persists past faint" : ""
          }. `}
        {yDiedInWindow &&
          `${y.name} died ~${y.secondsSurvivedCutoff.toFixed(1)}s into this run — its own damage and damage taken hold flat from then on${
            y.persistsThroughFaint ? ", though its team contribution (and so Total damage) keeps accruing since this boost persists past faint" : ""
          }.`}
        {!xHasBoost &&
          ` ${x.name} has no active mega/primal boost (genuinely non-mega, or disabled via the assumptions panel) — its Total damage column above equals its Own damage column exactly, since there is no team contribution to add.`}
        {!yHasBoost &&
          ` ${y.name} has no active mega/primal boost (genuinely non-mega, or disabled via the assumptions panel) — its Total damage column above equals its Own damage column exactly, since there is no team contribution to add.`}
      </p>
    </div>
  );
}
