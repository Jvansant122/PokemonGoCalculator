import { convertUptimeToTeamDamage, type DamageTrajectoryPoint } from "@pogo-analyzer/engine";

export interface DamageOverTimeSeries {
  name: string;
  ownDamageTrajectory: DamageTrajectoryPoint[];
  /** Point past which this candidate's team-boost contribution stops accruing (its faint time, mean or exact). */
  secondsSurvivedCutoff: number;
  boostMultiplier: number;
  imageUrl?: string;
}

interface Props {
  x: DamageOverTimeSeries;
  y: DamageOverTimeSeries;
  teammateDps: number;
  partySize: number;
  /** How many of partySize match the lead candidate's boosted type — see convertUptimeToTeamDamage (uptime.ts). The rest still get OFF_TYPE_MEGA_BOOST_MULTIPLIER, never zero. */
  matchingTeammateCount: number;
  maxSeconds: number;
}

const WIDTH = 640;
const HEIGHT = 280;
const PAD = { top: 16, right: 16, bottom: 36, left: 64 };
const SAMPLE_COUNT = 200;
const AXIS_TICKS = 5;
const EPS = 1e-9;

function ownDamageAt(trajectory: DamageTrajectoryPoint[], t: number): number {
  let value = trajectory[0]!.cumulativeDamage;
  for (const point of trajectory) {
    if (point.atSeconds > t) break;
    value = point.cumulativeDamage;
  }
  return value;
}

function teamContributionAt(series: DamageOverTimeSeries, t: number, teammateDps: number, partySize: number, matchingTeammateCount: number): number {
  return convertUptimeToTeamDamage({
    secondsSurvived: Math.min(t, series.secondsSurvivedCutoff),
    boostMultiplier: series.boostMultiplier,
    teammateCount: partySize,
    matchingTeammateCount,
    teammateDps,
  });
}

function totalAt(series: DamageOverTimeSeries, t: number, teammateDps: number, partySize: number, matchingTeammateCount: number): number {
  return ownDamageAt(series.ownDamageTrajectory, t) + teamContributionAt(series, t, teammateDps, partySize, matchingTeammateCount);
}

/** Chooses a "nice" step (1/2/5 x a power of 10) for axis ticks, similar to most charting libraries' default tick spacing. */
function niceStep(range: number, targetTicks: number): number {
  if (range <= 0) return 1;
  const rawStep = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return niceNormalized * magnitude;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
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
export function DamageOverTimeChart({ x, y, teammateDps, partySize, matchingTeammateCount, maxSeconds }: Props) {
  const times = Array.from({ length: SAMPLE_COUNT }, (_, i) => (i / (SAMPLE_COUNT - 1)) * maxSeconds);
  const totals = times.map((t) => ({
    t,
    x: totalAt(x, t, teammateDps, partySize, matchingTeammateCount),
    y: totalAt(y, t, teammateDps, partySize, matchingTeammateCount),
  }));

  const maxValue = Math.max(...totals.flatMap((v) => [v.x, v.y]), 1);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const xScale = (t: number) => PAD.left + (maxSeconds > 0 ? t / maxSeconds : 0) * plotWidth;
  const yScale = (value: number) => PAD.top + plotHeight - (value / maxValue) * plotHeight;

  const linePath = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"} ${xScale(times[i]!)} ${yScale(v)}`).join(" ");

  // Splits a series' sampled total-damage line into a solid segment up to its
  // death point and a dashed segment past it — a candidate that dies before
  // the chart's own window ends keeps a flat but visibly "no longer active"
  // tail (the underlying value doesn't change, ownDamageAt/teamContributionAt
  // already hold it flat; only the stroke changes here). A candidate that
  // survives the whole displayed window gets no marker and no dashing at all
  // — this one rule already covers "the window got stretched past this
  // candidate's death because the other one outlived it" automatically,
  // since that candidate's own death time is unaffected by the other's.
  function buildSeriesPath(series: DamageOverTimeSeries, sampledValues: number[]) {
    const diedAtSeconds = series.secondsSurvivedCutoff < maxSeconds - EPS ? series.secondsSurvivedCutoff : null;
    if (diedAtSeconds === null) {
      return { solidPath: linePath(sampledValues), dashedPath: null as string | null, deathPoint: null as { t: number; v: number } | null };
    }
    const deathValue = totalAt(series, diedAtSeconds, teammateDps, partySize, matchingTeammateCount);
    const toPath = (points: { t: number; v: number }[]) =>
      points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.t)} ${yScale(p.v)}`).join(" ");
    const solidPoints = times
      .map((t, i) => ({ t, v: sampledValues[i]! }))
      .filter((p) => p.t <= diedAtSeconds);
    solidPoints.push({ t: diedAtSeconds, v: deathValue });
    const dashedPoints = [{ t: diedAtSeconds, v: deathValue }, ...times.map((t, i) => ({ t, v: sampledValues[i]! })).filter((p) => p.t > diedAtSeconds)];
    return {
      solidPath: toPath(solidPoints),
      dashedPath: dashedPoints.length > 1 ? toPath(dashedPoints) : null,
      deathPoint: { t: diedAtSeconds, v: deathValue },
    };
  }

  const xPath = buildSeriesPath(x, totals.map((v) => v.x));
  const yPath = buildSeriesPath(y, totals.map((v) => v.y));

  // Tick values at "nice" round-number intervals, not just the two endpoints
  // — lets a reader interpolate an approximate damage value at a specific
  // time without guessing between only 0 and the max.
  const xStep = niceStep(maxSeconds, AXIS_TICKS);
  const xTicks = Array.from({ length: Math.floor(maxSeconds / xStep) + 1 }, (_, i) => i * xStep).filter((t) => t <= maxSeconds + 1e-9);
  const yStep = niceStep(maxValue, AXIS_TICKS);
  const yTicks = Array.from({ length: Math.floor(maxValue / yStep) + 1 }, (_, i) => i * yStep).filter((v) => v <= maxValue + 1e-9);

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

  // Final tally: how much of each candidate's total came from its own
  // damage versus the team's boosted contribution — the ratio the chart's
  // shape represents, made explicit as numbers alongside it.
  const finalOwnX = ownDamageAt(x.ownDamageTrajectory, maxSeconds);
  const finalTeamX = teamContributionAt(x, maxSeconds, teammateDps, partySize, matchingTeammateCount);
  const finalOwnY = ownDamageAt(y.ownDamageTrajectory, maxSeconds);
  const finalTeamY = teamContributionAt(y, maxSeconds, teammateDps, partySize, matchingTeammateCount);
  const pct = (own: number, team: number) => (own + team > 0 ? Math.round((own / (own + team)) * 100) : 0);

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="Own damage plus attributable team damage over time">
        {yTicks.map((v) => (
          <line key={`gy${v}`} x1={PAD.left} x2={WIDTH - PAD.right} y1={yScale(v)} y2={yScale(v)} stroke="var(--border)" strokeWidth={1} />
        ))}
        <path d={xPath.solidPath} fill="none" stroke="var(--accent-x)" strokeWidth={2.5} />
        {xPath.dashedPath && <path d={xPath.dashedPath} fill="none" stroke="var(--accent-x)" strokeWidth={2.5} strokeDasharray="6 4" />}
        <path d={yPath.solidPath} fill="none" stroke="var(--accent-y)" strokeWidth={2.5} />
        {yPath.dashedPath && <path d={yPath.dashedPath} fill="none" stroke="var(--accent-y)" strokeWidth={2.5} strokeDasharray="6 4" />}

        {xPath.deathPoint && (
          <g>
            <circle cx={xScale(xPath.deathPoint.t)} cy={yScale(xPath.deathPoint.v)} r={5} fill="var(--bg)" stroke="var(--accent-x)" strokeWidth={2} />
            <text x={xScale(xPath.deathPoint.t) + 8} y={yScale(xPath.deathPoint.v) - 8} fontSize={10} fill="var(--accent-x)">
              {x.name} died ~{xPath.deathPoint.t.toFixed(1)}s
            </text>
          </g>
        )}
        {yPath.deathPoint && (
          <g>
            <circle cx={xScale(yPath.deathPoint.t)} cy={yScale(yPath.deathPoint.v)} r={5} fill="var(--bg)" stroke="var(--accent-y)" strokeWidth={2} />
            <text x={xScale(yPath.deathPoint.t) + 8} y={yScale(yPath.deathPoint.v) + 14} fontSize={10} fill="var(--accent-y)">
              {y.name} died ~{yPath.deathPoint.t.toFixed(1)}s
            </text>
          </g>
        )}

        {crossing && (
          <>
            <circle cx={xScale(crossing.t)} cy={yScale(crossing.value)} r={5} fill="var(--good)" />
            <text x={xScale(crossing.t) + 8} y={yScale(crossing.value) - 8} fontSize={11} fill="var(--good)">
              crossover: ~{crossing.t.toFixed(1)}s
            </text>
          </>
        )}

        {/* Y-axis tick labels (damage scale). */}
        {yTicks.map((v) => (
          <text key={`yl${v}`} x={PAD.left - 8} y={yScale(v)} fontSize={10} fill="var(--muted)" textAnchor="end" dominantBaseline="middle">
            {formatTick(v)}
          </text>
        ))}

        {/* X-axis tick labels (seconds) + gridline ticks. */}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={xScale(t)} x2={xScale(t)} y1={PAD.top} y2={PAD.top + plotHeight} stroke="var(--border)" strokeWidth={1} opacity={0.5} />
            <text x={xScale(t)} y={HEIGHT - PAD.bottom + 16} fontSize={10} fill="var(--muted)" textAnchor="middle">
              {formatTick(t)}s
            </text>
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 16, fontSize: "0.85rem", marginTop: 4, alignItems: "center" }}>
        <span style={{ color: "var(--accent-x)" }}>
          ■ {x.imageUrl && <img src={x.imageUrl} alt="" className="species-icon" />} {x.name}
        </span>
        <span style={{ color: "var(--accent-y)" }}>
          ■ {y.imageUrl && <img src={y.imageUrl} alt="" className="species-icon" />} {y.name}
        </span>
      </div>
      {crossing ? (
        <p className="crossover-note">
          Ranking flips at ~{crossing.t.toFixed(1)}s into the fight; {finalLeader} leads by the end of this window (party
          size {partySize}, {matchingTeammateCount} matching type, {teammateDps} DPS/teammate).
        </p>
      ) : (
        <p className="crossover-note">
          No crossing in this window under these assumptions — {finalLeader} leads throughout (party size {partySize},{" "}
          {matchingTeammateCount} matching type, {teammateDps} DPS/teammate).
        </p>
      )}
      <div className="damage-tally">
        <div>
          <strong style={{ color: "var(--accent-x)" }}>{x.name}</strong>: own {Math.round(finalOwnX)} + team {Math.round(finalTeamX)} ={" "}
          {Math.round(finalOwnX + finalTeamX)} total ({pct(finalOwnX, finalTeamX)}% own / {100 - pct(finalOwnX, finalTeamX)}% team)
        </div>
        <div>
          <strong style={{ color: "var(--accent-y)" }}>{y.name}</strong>: own {Math.round(finalOwnY)} + team {Math.round(finalTeamY)} ={" "}
          {Math.round(finalOwnY + finalTeamY)} total ({pct(finalOwnY, finalTeamY)}% own / {100 - pct(finalOwnY, finalTeamY)}% team)
        </div>
      </div>
    </div>
  );
}
