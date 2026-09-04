import type { CandidateResult } from "@pogo-analyzer/engine";
import { convertUptimeToTeamDamage, findCrossoverPartySize } from "@pogo-analyzer/engine";

interface Props {
  x: CandidateResult;
  y: CandidateResult;
  teammateDps: number;
  typeMatches: { x: boolean; y: boolean };
  currentPartySize: number;
}

const WIDTH = 640;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
const PARTY_SIZES = Array.from({ length: 20 }, (_, i) => i + 1);

/**
 * Phase 3's headline visual: total contribution vs party size for both
 * candidates, with the crossover point called out explicitly. The point of
 * this chart is *where the lines cross*, not which color is on top at party
 * size 1 — so the crossover gets its own marker and caption, not just a
 * legend.
 */
export function CrossoverChart({ x, y, teammateDps, typeMatches, currentPartySize }: Props) {
  const totals = PARTY_SIZES.map((n) => ({
    n,
    x: x.ownDamage + convertUptimeToTeamDamage({ secondsSurvived: x.secondsSurvived, boostMultiplier: x.boostMultiplier, teammateCount: n, teammateDps, typeMatches: typeMatches.x }),
    y: y.ownDamage + convertUptimeToTeamDamage({ secondsSurvived: y.secondsSurvived, boostMultiplier: y.boostMultiplier, teammateCount: n, teammateDps, typeMatches: typeMatches.y }),
  }));

  const maxValue = Math.max(...totals.flatMap((t) => [t.x, t.y]), 1);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const xScale = (n: number) => PAD.left + ((n - 1) / (PARTY_SIZES.length - 1)) * plotWidth;
  const yScale = (value: number) => PAD.top + plotHeight - (value / maxValue) * plotHeight;

  const linePath = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"} ${xScale(i + 1)} ${yScale(v)}`).join(" ");

  const crossover = findCrossoverPartySize(
    { id: "X", secondsSurvived: x.secondsSurvived, boostMultiplier: x.boostMultiplier, boostedType: x.boostedType, ownDamage: x.ownDamage },
    { id: "Y", secondsSurvived: y.secondsSurvived, boostMultiplier: y.boostMultiplier, boostedType: y.boostedType, ownDamage: y.ownDamage },
    teammateDps,
    { a: typeMatches.x, b: typeMatches.y },
  );

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="Total team damage contribution vs party size">
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
        <path d={linePath(totals.map((t) => t.x))} fill="none" stroke="var(--accent-x)" strokeWidth={2.5} />
        <path d={linePath(totals.map((t) => t.y))} fill="none" stroke="var(--accent-y)" strokeWidth={2.5} />

        <line
          x1={xScale(currentPartySize)}
          x2={xScale(currentPartySize)}
          y1={PAD.top}
          y2={PAD.top + plotHeight}
          stroke="var(--muted)"
          strokeDasharray="4 4"
        />

        {crossover.partySize !== null && (
          <>
            <circle cx={xScale(crossover.partySize)} cy={yScale(totals[crossover.partySize - 1]!.x)} r={5} fill="var(--good)" />
            <text x={xScale(crossover.partySize) + 8} y={yScale(totals[crossover.partySize - 1]!.x) - 8} fontSize={11} fill="var(--good)">
              crossover: party size {crossover.partySize}
            </text>
          </>
        )}

        <text x={PAD.left} y={HEIGHT - 6} fontSize={11} fill="var(--muted)">
          party size 1
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} fontSize={11} fill="var(--muted)" textAnchor="end">
          party size 20
        </text>
      </svg>
      <div style={{ display: "flex", gap: 16, fontSize: "0.85rem", marginTop: 4 }}>
        <span style={{ color: "var(--accent-x)" }}>■ {x.name}</span>
        <span style={{ color: "var(--accent-y)" }}>■ {y.name}</span>
      </div>
      {crossover.partySize !== null ? (
        <p className="crossover-note">
          Ranking flips at party size {crossover.partySize}: {crossover.leaderBelow} leads below it,{" "}
          {crossover.leaderAtOrAbove} leads at or above it.
        </p>
      ) : (
        <p className="crossover-note">
          No crossover in the 1-20 range under these assumptions — {crossover.leaderAtOrAbove ?? "one candidate"} leads
          throughout.
        </p>
      )}
    </div>
  );
}
