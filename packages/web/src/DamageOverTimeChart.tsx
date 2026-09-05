import type { DamageTrajectoryPoint } from "@pogo-analyzer/engine";

export interface DamageOverTimeSeries {
  name: string;
  ownDamageTrajectory: DamageTrajectoryPoint[];
  /** Point past which this candidate's team-boost contribution stops accruing (its faint time, mean or exact). */
  secondsSurvivedCutoff: number;
  boostMultiplier: number;
}

interface Props {
  x: DamageOverTimeSeries;
  y: DamageOverTimeSeries;
  teammateDps: number;
  partySize: number;
  typeMatches: { x: boolean; y: boolean };
  maxSeconds: number;
}

const WIDTH = 640;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
const SAMPLE_COUNT = 200;

function ownDamageAt(trajectory: DamageTrajectoryPoint[], t: number): number {
  let value = trajectory[0]!.cumulativeDamage;
  for (const point of trajectory) {
    if (point.atSeconds > t) break;
    value = point.cumulativeDamage;
  }
  return value;
}

function totalAt(series: DamageOverTimeSeries, t: number, teammateDps: number, partySize: number, typeMatches: boolean): number {
  const boostFactor = typeMatches ? series.boostMultiplier : 1;
  const teamContribution = teammateDps * partySize * boostFactor * Math.min(t, series.secondsSurvivedCutoff);
  return ownDamageAt(series.ownDamageTrajectory, t) + teamContribution;
}

/**
 * Replaces the old party-size crossover chart: for a *fixed* party size (the
 * one already chosen in the assumptions panel), plots each candidate's own
 * damage plus its attributable share of boosted team damage over *time*. A
 * candidate's team contribution stops accruing once it faints
 * (secondsSurvivedCutoff), while a longer-surviving-but-lower-DPS candidate's
 * line keeps climbing — which is what produces a real crossing point when
 * survivability differs enough to outweigh a raw damage lead.
 */
export function DamageOverTimeChart({ x, y, teammateDps, partySize, typeMatches, maxSeconds }: Props) {
  const times = Array.from({ length: SAMPLE_COUNT }, (_, i) => (i / (SAMPLE_COUNT - 1)) * maxSeconds);
  const totals = times.map((t) => ({
    t,
    x: totalAt(x, t, teammateDps, partySize, typeMatches.x),
    y: totalAt(y, t, teammateDps, partySize, typeMatches.y),
  }));

  const maxValue = Math.max(...totals.flatMap((v) => [v.x, v.y]), 1);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const xScale = (t: number) => PAD.left + (maxSeconds > 0 ? t / maxSeconds : 0) * plotWidth;
  const yScale = (value: number) => PAD.top + plotHeight - (value / maxValue) * plotHeight;

  const linePath = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"} ${xScale(times[i]!)} ${yScale(v)}`).join(" ");

  // Scan the sampled series for a genuine sign flip in (x - y) — both deltas
  // non-zero and opposite — linearly interpolating the crossing time between
  // the two flanking samples for a cleaner marker. Two candidates tied for a
  // stretch (e.g. identical survival time and boost, so team contribution is
  // identical until one lands a bigger charged hit right at the end) is NOT
  // a crossing on its own: a flat tie that later jumps apart without ever
  // reversing sign means one candidate simply led throughout, which the
  // "no crossing" branch below reports correctly.
  let crossing: { t: number; value: number } | null = null;
  for (let i = 1; i < totals.length; i++) {
    const prev = totals[i - 1]!;
    const curr = totals[i]!;
    const prevDelta = prev.x - prev.y;
    const currDelta = curr.x - curr.y;
    if (prevDelta !== 0 && currDelta !== 0 && Math.sign(prevDelta) !== Math.sign(currDelta)) {
      const frac = Math.abs(prevDelta) / (Math.abs(prevDelta) + Math.abs(currDelta));
      crossing = {
        t: prev.t + frac * (curr.t - prev.t),
        value: prev.x + frac * (curr.x - prev.x),
      };
      break;
    }
  }

  const finalLeader = totals[totals.length - 1]!.x >= totals[totals.length - 1]!.y ? x.name : y.name;

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="Own damage plus attributable team damage over time">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + plotHeight * (1 - f)}
            y2={PAD.top + plotHeight * (1 - f)}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}
        <path d={linePath(totals.map((v) => v.x))} fill="none" stroke="var(--accent-x)" strokeWidth={2.5} />
        <path d={linePath(totals.map((v) => v.y))} fill="none" stroke="var(--accent-y)" strokeWidth={2.5} />

        {crossing && (
          <>
            <circle cx={xScale(crossing.t)} cy={yScale(crossing.value)} r={5} fill="var(--good)" />
            <text x={xScale(crossing.t) + 8} y={yScale(crossing.value) - 8} fontSize={11} fill="var(--good)">
              crossover: ~{crossing.t.toFixed(1)}s
            </text>
          </>
        )}

        <text x={PAD.left} y={HEIGHT - 6} fontSize={11} fill="var(--muted)">
          0s
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} fontSize={11} fill="var(--muted)" textAnchor="end">
          {maxSeconds.toFixed(1)}s
        </text>
      </svg>
      <div style={{ display: "flex", gap: 16, fontSize: "0.85rem", marginTop: 4 }}>
        <span style={{ color: "var(--accent-x)" }}>■ {x.name}</span>
        <span style={{ color: "var(--accent-y)" }}>■ {y.name}</span>
      </div>
      {crossing ? (
        <p className="crossover-note">
          Ranking flips at ~{crossing.t.toFixed(1)}s into the fight; {finalLeader} leads by the end of this window (party
          size {partySize}, {teammateDps} DPS/teammate).
        </p>
      ) : (
        <p className="crossover-note">
          No crossing in this window under these assumptions — {finalLeader} leads throughout (party size {partySize},{" "}
          {teammateDps} DPS/teammate).
        </p>
      )}
    </div>
  );
}
