import type { DodgeExecutionErrorBandPoint } from "./run/dodgeExecutionErrorSweep.js";
import { niceStep, formatTick } from "./chartAxisUtils.js";
import { computeDodgeExecutionErrorLeader } from "./dodgeExecutionErrorLeader.js";

interface Props {
  points: DodgeExecutionErrorBandPoint[];
  /** [candidate A name, candidate B name] — same x/y accent convention as DamageOverTimeChart. */
  names: [string, string];
}

const WIDTH = 520;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 36, left: 56 };
const AXIS_TICKS = 4;

/**
 * IDEAS.md #21 — renders the dodge-execution-error sweep (run/
 * dodgeExecutionErrorSweep.ts) as a BAND across the 0-50% missed-dodge-
 * attempt axis for both candidates, plotting mean own total damage (charged
 * + fast, over the full simulated window) at each of the 6 sampled points —
 * never collapsed to one blended number, per this project's own discipline
 * against exactly that (see sensitivity.ts's existing "Dodge accuracy" check,
 * which finds the nearest single flip on a CONTINUOUS scan; this instead
 * shows the whole curve's SHAPE at 6 discrete points for both candidates at
 * once, so the reader sees whether the gap between them widens, narrows, or
 * reverses across the range, not just where the nearest edge sits).
 *
 * The x-axis reads "dodge attempt accuracy" (100% = every dodge attempt
 * succeeds, i.e. missedFraction 0 = DodgeBehavior {kind:"perfect"}; 50% =
 * half of every dodge ATTEMPT still gets hit) rather than raw missedFraction,
 * matching sensitivity.ts's own "Dodge accuracy" check's convention so the
 * two panels read consistently.
 */
export function DodgeExecutionErrorBand({ points, names }: Props) {
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const accuracyFor = (missedFraction: number) => (1 - missedFraction) * 100;
  // Points are supplied ascending by missedFraction (0..0.5) — reverse so the
  // x-axis reads left-to-right as "most accurate -> least accurate", matching
  // how a player reads "getting worse at dodging" as moving rightward.
  const ordered = [...points].sort((p1, p2) => accuracyFor(p1.missedFraction) - accuracyFor(p2.missedFraction));
  const minAccuracy = Math.min(...ordered.map((p) => accuracyFor(p.missedFraction)));
  const maxAccuracy = Math.max(...ordered.map((p) => accuracyFor(p.missedFraction)));
  const maxValue = Math.max(...ordered.flatMap((p) => [p.a.meanTotalDamage, p.b.meanTotalDamage]), 1);

  const xScale = (accuracy: number) =>
    PAD.left + (maxAccuracy > minAccuracy ? (accuracy - minAccuracy) / (maxAccuracy - minAccuracy) : 0) * plotWidth;
  const yScale = (value: number) => PAD.top + plotHeight - (value / maxValue) * plotHeight;

  const linePath = (values: { accuracy: number; value: number }[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"} ${xScale(v.accuracy)} ${yScale(v.value)}`).join(" ");

  const aValues = ordered.map((p) => ({ accuracy: accuracyFor(p.missedFraction), value: p.a.meanTotalDamage }));
  const bValues = ordered.map((p) => ({ accuracy: accuracyFor(p.missedFraction), value: p.b.meanTotalDamage }));

  const yStep = niceStep(maxValue, AXIS_TICKS);
  const yTicks = Array.from({ length: Math.floor(maxValue / yStep) + 1 }, (_, i) => i * yStep).filter((v) => v <= maxValue + 1e-9);

  // Coarse, 6-point leader check (own total damage only, not own+team) — a
  // genuine sign flip between two ADJACENT sampled points, same "both deltas
  // non-zero and opposite" discipline as rankingFlip.ts's own crossing scan,
  // just over 6 discrete samples instead of 200 continuous ones. Deliberately
  // NOT claiming to find the exact crossing accuracy — only that one exists
  // somewhere between two specific sampled points. Extracted into
  // dodgeExecutionErrorLeader.ts (own unit tests there) — see its doc comment
  // for the three-way ("a"/"b"/"tie") fix to the same wrong-statement-on-a-tie
  // bug class fixed in rankingFlip.ts's computeRankingFlip.
  const { flipBetween, finalLeader, finalTieIsBothZero } = computeDodgeExecutionErrorLeader(ordered);
  const leaderName = (leader: "a" | "b" | "tie") => (leader === "a" ? names[0] : leader === "b" ? names[1] : null);

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="Own total damage across a band of dodge-execution accuracy, both candidates">
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={10} fill="var(--chart-bg)" />
        {yTicks.map((v) => (
          <line key={`gy${v}`} x1={PAD.left} x2={WIDTH - PAD.right} y1={yScale(v)} y2={yScale(v)} stroke="var(--grid)" strokeWidth={1} />
        ))}
        <path d={linePath(aValues)} fill="none" stroke="var(--accent-x)" strokeWidth={2.5} />
        <path d={linePath(bValues)} fill="none" stroke="var(--accent-y)" strokeWidth={2.5} />
        {aValues.map((v) => (
          <circle key={`a${v.accuracy}`} cx={xScale(v.accuracy)} cy={yScale(v.value)} r={3} fill="var(--accent-x)" />
        ))}
        {bValues.map((v) => (
          <circle key={`b${v.accuracy}`} cx={xScale(v.accuracy)} cy={yScale(v.value)} r={3} fill="var(--accent-y)" />
        ))}
        {yTicks.map((v) => (
          <text key={`yl${v}`} x={PAD.left - 8} y={yScale(v)} fontSize={10} fill="var(--muted)" textAnchor="end" dominantBaseline="middle">
            {formatTick(v)}
          </text>
        ))}
        {ordered.map((p) => (
          <text
            key={`xl${p.missedFraction}`}
            x={xScale(accuracyFor(p.missedFraction))}
            y={HEIGHT - PAD.bottom + 16}
            fontSize={10}
            fill="var(--muted)"
            textAnchor="middle"
          >
            {accuracyFor(p.missedFraction).toFixed(0)}%
          </text>
        ))}
        <text x={PAD.left + plotWidth / 2} y={HEIGHT - 4} fontSize={10} fill="var(--muted)" textAnchor="middle">
          dodge attempt accuracy (100% = perfect)
        </text>
      </svg>
      <div className="chart-legend">
        <span className="chart-legend-x">■ {names[0]}</span>
        <span className="chart-legend-y">■ {names[1]}</span>
      </div>
      {flipBetween ? (
        <p className="crossover-note crossover-note--flip">
          Own total damage leadership flips somewhere between {flipBetween[0].toFixed(0)}% and {flipBetween[1].toFixed(0)}% dodge accuracy;{" "}
          {leaderName(finalLeader) === null ? "neither candidate leads" : `${leaderName(finalLeader)} leads`} at the worst-tested accuracy (50%).
        </p>
      ) : finalLeader === "tie" ? (
        <p className="crossover-note crossover-note--steady">
          {finalTieIsBothZero
            ? "Both candidates dealt zero own total damage across the tested 50-100% accuracy band under these assumptions — check the dodge and moveset settings above before reading a winner into this."
            : `No leadership flip across the tested 50-100% accuracy band — ${names[0]} and ${names[1]} are tied on own total damage throughout.`}
        </p>
      ) : (
        <p className="crossover-note crossover-note--steady">
          No leadership flip across the tested 50-100% accuracy band — {leaderName(finalLeader)} leads on own total damage
          throughout.
        </p>
      )}
      <div className="table-scroll" style={{ marginTop: 12 }}>
        <table className="time-series-table">
          <thead>
            <tr>
              <th>Dodge accuracy</th>
              <th>{names[0]} mean total dmg</th>
              <th>{names[0]} mean survival</th>
              <th>{names[1]} mean total dmg</th>
              <th>{names[1]} mean survival</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((p) => (
              <tr key={p.missedFraction}>
                <td>{accuracyFor(p.missedFraction).toFixed(0)}%</td>
                <td>{p.a.meanTotalDamage.toFixed(0)}</td>
                <td>{p.a.meanSecondsSurvived.toFixed(1)}s</td>
                <td>{p.b.meanTotalDamage.toFixed(0)}</td>
                <td>{p.b.meanSecondsSurvived.toFixed(1)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
