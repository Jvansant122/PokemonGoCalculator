import type { TeamRaidOutcome, TeamRaidSlotResult } from "@pogo-analyzer/engine";
import { niceStep, formatTick } from "./chartAxisUtils.js";

interface Props {
  /** Flat, chronological list across every cycle — TeamRaidResult.slots as-is. */
  slots: TeamRaidSlotResult[];
  bossHp: number;
  raidTimerSeconds: number;
  outcome: TeamRaidOutcome;
  timeToClearSeconds: number | null;
}

const WIDTH = 720;
const HEIGHT = 300;
const PAD = { top: 16, right: 16, bottom: 40, left: 70 };
const AXIS_TICKS = 6;
const EPS = 1e-9;

/**
 * Team-raid analogue of DamageOverTimeChart.tsx: ONE cumulative team-damage
 * line (concatenating every slot/cycle segment's already-global-clock,
 * already-cumulative ownDamageTrajectory — see TeamRaidSlotResult's own doc
 * comment: stacking every entry in array order gives one continuous
 * trajectory, no extra math needed here), a horizontal boss-HP reference
 * line, a vertical raid-timer reference line marking the x-axis's own right
 * edge (the chart's window IS the real raid timer, so a viewer can see how
 * much margin was actually used/left), and a divider at every slot handoff —
 * a dashed red divider for a wipe-and-revive (cycle boundary, reviveCostSeconds
 * paid) versus a thin gray one for an ordinary next-slot swap (swapCostSeconds
 * paid).
 */
export function TeamDamageChart({ slots, bossHp, raidTimerSeconds, outcome, timeToClearSeconds }: Props) {
  if (slots.length === 0) return null;

  const maxSeconds = raidTimerSeconds;
  // Segments can legitimately run their own simulated window past the real
  // timer (see teamRaid.ts's maxSecondsPerSlot doc comment) — nothing past
  // the real buzzer is real, so clip here.
  const allPoints = slots.flatMap((s) => s.ownDamageTrajectory).filter((p) => p.atSeconds <= maxSeconds + EPS);
  if (allPoints.length === 0) allPoints.push({ atSeconds: 0, cumulativeDamage: 0 });
  const lastPoint = allPoints[allPoints.length - 1]!;

  const maxValue = Math.max(bossHp, ...allPoints.map((p) => p.cumulativeDamage), 1);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const xScale = (t: number) => PAD.left + (maxSeconds > 0 ? t / maxSeconds : 0) * plotWidth;
  const yScale = (v: number) => PAD.top + plotHeight - (v / maxValue) * plotHeight;

  const solidPath = allPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.atSeconds)} ${yScale(p.cumulativeDamage)}`).join(" ");
  // Nothing more happens between the last simulated point and the real
  // buzzer for a failed run — a flat dashed tail makes that explicit rather
  // than the line just stopping short with no explanation.
  const dashedPath =
    outcome === "timerExpired" && lastPoint.atSeconds < maxSeconds - EPS
      ? `M ${xScale(lastPoint.atSeconds)} ${yScale(lastPoint.cumulativeDamage)} L ${xScale(maxSeconds)} ${yScale(lastPoint.cumulativeDamage)}`
      : null;

  const dividers = slots
    .slice(1)
    .map((s, i) => ({ t: s.startedAtRaidSeconds, isWipe: s.cycleIndex > slots[i]!.cycleIndex }))
    .filter((d) => d.t <= maxSeconds + EPS);

  const clearPoint =
    outcome === "cleared" && timeToClearSeconds !== null && timeToClearSeconds <= maxSeconds
      ? { t: timeToClearSeconds, v: bossHp }
      : null;

  const yStep = niceStep(maxValue, AXIS_TICKS);
  const yTicks = Array.from({ length: Math.floor(maxValue / yStep) + 1 }, (_, i) => i * yStep).filter((v) => v <= maxValue + EPS);
  const xStep = niceStep(maxSeconds, AXIS_TICKS);
  const xTicks = Array.from({ length: Math.floor(maxSeconds / xStep) + 1 }, (_, i) => i * xStep).filter((t) => t <= maxSeconds + EPS);

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="Cumulative team damage vs boss HP over the raid timer">
        {yTicks.map((v) => (
          <line key={`gy${v}`} x1={PAD.left} x2={WIDTH - PAD.right} y1={yScale(v)} y2={yScale(v)} stroke="var(--border)" strokeWidth={1} />
        ))}

        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={yScale(bossHp)} y2={yScale(bossHp)} stroke="var(--accent-y)" strokeDasharray="4 3" strokeWidth={1.5} />
        <text x={WIDTH - PAD.right} y={yScale(bossHp) - 4} fontSize={10} fill="var(--accent-y)" textAnchor="end">
          boss HP {formatTick(bossHp)}
        </text>

        {dividers.map((d, i) => (
          <line
            key={`div${i}`}
            x1={xScale(d.t)}
            x2={xScale(d.t)}
            y1={PAD.top}
            y2={PAD.top + plotHeight}
            stroke={d.isWipe ? "#ff6b6b" : "var(--border)"}
            strokeWidth={d.isWipe ? 2 : 1}
            strokeDasharray={d.isWipe ? "5 3" : undefined}
            opacity={0.85}
          />
        ))}

        <path d={solidPath} fill="none" stroke="var(--accent-x)" strokeWidth={2.5} />
        {dashedPath && <path d={dashedPath} fill="none" stroke="var(--accent-x)" strokeWidth={2.5} strokeDasharray="6 4" />}

        {clearPoint && (
          <g>
            <circle cx={xScale(clearPoint.t)} cy={yScale(clearPoint.v)} r={5} fill="var(--good)" />
            <text x={xScale(clearPoint.t) + 8} y={yScale(clearPoint.v) - 8} fontSize={11} fill="var(--good)">
              cleared ~{clearPoint.t.toFixed(1)}s
            </text>
          </g>
        )}

        {yTicks.map((v) => (
          <text key={`yl${v}`} x={PAD.left - 8} y={yScale(v)} fontSize={10} fill="var(--muted)" textAnchor="end" dominantBaseline="middle">
            {formatTick(v)}
          </text>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={xScale(t)} x2={xScale(t)} y1={PAD.top} y2={PAD.top + plotHeight} stroke="var(--border)" strokeWidth={1} opacity={0.4} />
            <text x={xScale(t)} y={HEIGHT - PAD.bottom + 16} fontSize={10} fill="var(--muted)" textAnchor="middle">
              {formatTick(t)}s
            </text>
          </g>
        ))}
        <line x1={xScale(maxSeconds)} x2={xScale(maxSeconds)} y1={PAD.top} y2={PAD.top + plotHeight} stroke="var(--muted)" strokeWidth={1.5} />
      </svg>
      <p className="caveats" style={{ marginTop: 4 }}>
        The x-axis IS the raid's real countdown timer ({raidTimerSeconds}s) — the dashed yellow line is the boss's
        fixed battle-HP pool for this tier. Vertical dividers mark each slot handoff: a thin gray line for an
        ordinary next-slot swap (swapCostSeconds paid), a dashed red line for a full-roster wipe-and-revive
        (reviveCostSeconds paid, restarting from the first fielded slot).
      </p>
    </div>
  );
}
