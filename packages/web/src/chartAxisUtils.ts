/**
 * Shared axis-tick helpers for this project's hand-rolled inline SVG charts
 * (see CLAUDE.md: no charting library, every chart is hand-rolled). Both
 * DamageOverTimeChart.tsx and TeamDamageChart.tsx need the exact same "nice"
 * tick-step logic and tick-label formatting — previously two byte-for-byte
 * identical copies, now a single shared module so any future chart reuses
 * this instead of forking a third copy.
 */

/** Chooses a "nice" step (1/2/5 x a power of 10) for axis ticks, similar to most charting libraries' default tick spacing. */
export function niceStep(range: number, targetTicks: number): number {
  if (range <= 0) return 1;
  const rawStep = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return niceNormalized * magnitude;
}

export function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
