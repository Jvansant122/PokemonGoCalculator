import type { SensitivityCheck } from "./sensitivity.js";

interface Props {
  checks: SensitivityCheck[];
}

/** Phase 4, point 10: ranked list of which assumption sits closest to a flip. */
export function SensitivityView({ checks }: Props) {
  return (
    <section className="panel">
      <h2>Sensitivity — what would flip the winner</h2>
      <ul className="sensitivity-list">
        {checks.map((check, i) => (
          <li key={check.label}>
            <span>
              <span className="rank">#{i + 1}</span>
              {check.label} <span style={{ color: "var(--muted)" }}>(currently {check.currentValue})</span>
            </span>
            <span style={{ color: check.flips ? "var(--good)" : "var(--muted)" }}>{check.distanceLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
