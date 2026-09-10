/**
 * Shared derivation for "boss charged-move mean frequency" while a tab's own
 * `showDetailedAssumptions` flag is false — used identically by
 * runComparator.ts (Comparator) and runTeamRaid.ts (Team Raid Simulator) so
 * the two can never drift into computing two different numbers for the same
 * "simple mode" concept. Extracted out of runTeamRaid.ts, which had this
 * logic inline first — see either run module's own doc comment on its
 * exported `effectiveBossChargedMoveFrequencySeconds` result field for what
 * this stands in for and why it's explicitly a placeholder, not a modeled
 * mechanic.
 */
import { bossChargedMoveReadySeconds, type ChargedMove, type FastMove, type SpeciesDefinition } from "@pogo-analyzer/engine";

/**
 * Returns `stored` verbatim whenever `showDetailedAssumptions` is true (the
 * field is user-editable and authoritative), or whenever the boss/its moves
 * don't resolve. Otherwise derives a stand-in from the boss's own fast-move
 * charge time via `bossChargedMoveReadySeconds`, deliberately passing 0
 * starting energy (never the fight's actual `bossStartingEnergy`) — this
 * models a steady-state cadence, not the fight's opening warmup, so "boss
 * starts already partway charged" must not perturb it.
 * `bossChargedMoveReadySeconds` returns `Infinity` when the fast move has no
 * energy gain, and `0` when the cost is already covered — both degenerate
 * results fall back to `stored` rather than feeding a useless number into
 * the simulator.
 */
export function deriveEffectiveBossChargedMoveFrequencySeconds(params: {
  showDetailedAssumptions: boolean;
  bossSpecies: SpeciesDefinition | null;
  bossFastMove: FastMove | undefined;
  bossChargedMove: ChargedMove | undefined;
  stored: number;
}): number {
  const { showDetailedAssumptions, bossSpecies, bossFastMove, bossChargedMove, stored } = params;
  if (showDetailedAssumptions || !bossSpecies || !bossFastMove || !bossChargedMove) return stored;
  const derived = bossChargedMoveReadySeconds(bossFastMove, bossChargedMove, 0);
  return Number.isFinite(derived) && derived > 0 ? derived : stored;
}
