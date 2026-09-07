/**
 * Pure logic/constants shared between AttackDefenseBreakpointsView.tsx (owns
 * state + the actual attackDamageGrid/defenseDamageGrid calls) and
 * BreakpointSheet.tsx (render-only) — mirrors ivBreakpointsHelpers.ts's split
 * for the sibling IV Breakpoints tab. Nothing here holds React state or JSX.
 */

/**
 * This tab's fixed level scan: 50 down to 25 in the usual 0.5 steps, per the
 * plan's spec ("Level, starting at 50 ... stepping DOWN by 0.5 to 25 ... 51
 * columns total"). Built ASCENDING here (25 first) — same "compute ascending,
 * reverse only for display" convention ivBreakpointsHelpers.ts's own
 * LEVELS_35_TO_50 and IvBreakpointsView.tsx's `rowsForTable` precedent use —
 * so the underlying grid functions (which iterate whatever `levels` array
 * they're given, in order) produce a stable, order-independent result;
 * BreakpointSheet.tsx reverses this specific array only for the rendered
 * table's column order. `(50 - 25) / 0.5 + 1 === 51` levels total.
 */
export const LEVELS_25_TO_50: number[] = (() => {
  const levels: number[] = [];
  for (let level = 25; level <= 50; level += 0.5) {
    levels.push(level);
  }
  return levels;
})();

/** Attack IV (0-15) or Defense IV (0-15) — both sheets sweep the full range, same as attackDamageGrid/defenseDamageGrid's own ivRange default. Named explicitly here (rather than relying on the engine's implicit default) so this tab's intent reads clearly at the call site. */
export const IVS_0_TO_15: number[] = Array.from({ length: 16 }, (_, i) => i);
