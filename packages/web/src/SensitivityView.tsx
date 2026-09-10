import { CollapsibleSection } from "./CollapsibleSection.js";
import type { SensitivityCheck } from "./sensitivity.js";

interface Props {
  checks: SensitivityCheck[];
}

const BAR_WIDTH = 260;
const BAR_HEIGHT = 34;
const BAR_PAD = 6;
const TRACK_Y = 13;

/** Formats a scan-bound/marker value compactly — whole numbers plain, fractional ones to a couple decimals (mega-boost multipliers and dodge fractions need this, seconds/levels/party sizes usually don't). */
function formatBound(v: number): string {
  if (Number.isInteger(v)) return `${v}`;
  return v.toFixed(Math.abs(v) < 10 ? 2 : 1);
}

/**
 * The subset of SensitivityCheck FlipBar actually reads — narrowed so a
 * standalone flip result that isn't shaped like a full ranked-list row (see
 * PartySizeFlipView.tsx) can still reuse this exact visual without having to
 * fabricate the other SensitivityCheck fields (label/currentValue/flips/
 * distance/distanceLabel) it has no use for. A SensitivityCheck already
 * satisfies this structurally, so every existing call site is unaffected.
 */
export interface FlipBarData {
  rangeMin: number;
  rangeMax: number;
  currentNumericValue: number;
  flipNumericValue: number | null;
}

/**
 * Small hand-rolled inline-SVG number line (same convention as
 * DamageOverTimeChart.tsx — no charting library) turning one flip check's
 * scanned range + current value + flip value into a one-glance visual: a
 * track spanning [rangeMin, rangeMax], a solid marker at the
 * currently-configured value, and (only when a flip was actually found
 * within the scanned range) a second marker at the flip point. When no flip
 * was found, only the current-value marker renders — the row's existing
 * distanceLabel text ("no flip found in 1-20" etc.) still carries that case.
 * Exported so PartySizeFlipView.tsx reuses it for the party-size flip
 * headline rather than reimplementing the same number-line SVG.
 */
export function FlipBar({ check }: { check: FlipBarData }) {
  const { rangeMin, rangeMax, currentNumericValue, flipNumericValue } = check;
  const span = rangeMax - rangeMin;
  const usableWidth = BAR_WIDTH - 2 * BAR_PAD;
  const scale = (v: number) => {
    if (span <= 0) return BAR_PAD + usableWidth / 2;
    const clamped = Math.min(rangeMax, Math.max(rangeMin, v));
    return BAR_PAD + ((clamped - rangeMin) / span) * usableWidth;
  };
  const currentX = scale(currentNumericValue);
  const flipX = flipNumericValue !== null ? scale(flipNumericValue) : null;
  const label = `scanned ${formatBound(rangeMin)} to ${formatBound(rangeMax)}, current ${formatBound(currentNumericValue)}${
    flipNumericValue !== null ? `, flips at ${formatBound(flipNumericValue)}` : ", no flip found in range"
  }`;

  return (
    <svg viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`} width="100%" height={BAR_HEIGHT} role="img" aria-label={label}>
      <line x1={BAR_PAD} x2={BAR_WIDTH - BAR_PAD} y1={TRACK_Y} y2={TRACK_Y} stroke="var(--border)" strokeWidth={2} />
      {flipX !== null && (
        <g>
          <line x1={flipX} x2={flipX} y1={TRACK_Y - 8} y2={TRACK_Y + 8} stroke="var(--good)" strokeWidth={2} />
          <circle cx={flipX} cy={TRACK_Y} r={4} fill="var(--good)" />
        </g>
      )}
      <circle cx={currentX} cy={TRACK_Y} r={5} fill="var(--text)" stroke="var(--panel)" strokeWidth={1.5} />
      <text x={BAR_PAD} y={BAR_HEIGHT - 3} fontSize={9} fill="var(--muted)" textAnchor="start">
        {formatBound(rangeMin)}
      </text>
      <text x={BAR_WIDTH - BAR_PAD} y={BAR_HEIGHT - 3} fontSize={9} fill="var(--muted)" textAnchor="end">
        {formatBound(rangeMax)}
      </text>
    </svg>
  );
}

/** Phase 4, point 10: ranked list of which assumption sits closest to a flip. */
export function SensitivityView({ checks }: Props) {
  return (
    <CollapsibleSection id="comparator-sensitivity" heading="Sensitivity — what would flip the winner" defaultOpen={false}>
      <ul className="sensitivity-list">
        {checks.map((check, i) => (
          <li key={check.label}>
            <div className="sensitivity-row-header">
              <span>
                <span className="rank">#{i + 1}</span>
                {check.label} <span style={{ color: "var(--muted)" }}>(currently {check.currentValue})</span>
              </span>
              <span style={{ color: check.flips ? "var(--good)" : "var(--muted)" }}>{check.distanceLabel}</span>
            </div>
            <FlipBar check={check} />
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}
