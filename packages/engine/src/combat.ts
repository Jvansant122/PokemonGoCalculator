import type { ChargedMove, FastMove } from "./types.js";

export interface DamageTrajectoryPoint {
  atSeconds: number;
  cumulativeDamage: number;
}

/**
 * The earliest possible time a boss could have enough energy for its first
 * charged move, counting only its own fast-move casts — not the energy the
 * real game also grants bosses from damage taken, which this engine doesn't
 * model on the boss side. That omission is deliberate: this function answers
 * "cannot happen sooner than X," a lower bound, not "happens at exactly X."
 * Level-independent (raid bosses use a fixed CPM, not a level curve — see
 * raidBoss.ts), so it depends only on the boss's own fast/charged move data.
 *
 * `startingEnergy` models a boss encountered mid-fight (e.g. after an earlier
 * trainer's mega already fainted or rotated out) rather than fresh at 0
 * energy — defaults to 0, today's implicit assumption everywhere else in the
 * engine.
 *
 * This is the single source of truth `runSustainedComparison`/
 * `runTeamRaid`/`runSpeciesReverseLookup` default their sustained-fight
 * warmup window to (see simulate.ts's `StepwiseBoss.chargedMoveWarmupSeconds`)
 * — there is no separate "opening burst" simulation phase in this engine; the
 * fight is always one continuous simulation, and this function only answers
 * how long the boss stays fast-move-only within it.
 */
export function bossChargedMoveReadySeconds(
  fastMove: FastMove,
  chargedMove: ChargedMove,
  startingEnergy = 0,
): number {
  const remaining = Math.max(0, chargedMove.energyCost - startingEnergy);
  if (remaining === 0) return 0;
  if (fastMove.energyGain <= 0) return Infinity;
  return Math.ceil(remaining / fastMove.energyGain) * fastMove.durationSeconds;
}
