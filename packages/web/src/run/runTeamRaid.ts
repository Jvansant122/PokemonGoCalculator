/**
 * Pure "assumptions in -> results out" computation for the Team Raid
 * Simulator tab — see runComparator.ts's own doc comment for why this
 * extraction exists (CLI/vitest parity with the live UI) and the conventions
 * it follows. React-free: takes TeamRaidView's own `TeamAssumptions` (from
 * TeamAssumptionPanel.tsx) plus a SpeciesRegistry, and returns exactly the
 * data TeamRaidView.tsx renders.
 */
import {
  bossChargedMoveReadySeconds,
  bossEffectiveHp,
  runTeamRaid,
  type RaidTier,
  type SpeciesDefinition,
  type SpeciesRegistry,
} from "@pogo-analyzer/engine";
import type { TeamAssumptions } from "../TeamAssumptionPanel.js";
import { applyShadowToggle } from "../shadowToggle.js";
import { raidTierForSpeciesId } from "../registry.js";

export interface TeamRaidRunResult {
  slotSpecies: (SpeciesDefinition | null)[];
  bossSpecies: SpeciesDefinition | null;
  bossRaidTier: RaidTier | undefined;
  bossReadySeconds: number | null;
  bossHp: number | null;
  /**
   * The boss charged-move mean frequency actually fed into runTeamRaid for
   * THIS run. Equal to the stored `a.bossChargedMoveFrequencySeconds` when
   * `a.showDetailedAssumptions` is true; otherwise derived from the boss's
   * own fast-move charge time (see the inline comment above where this is
   * computed) — a placeholder pending improvement, not this boss's
   * confirmed real cadence. Exposed so the assumption panel can show it and
   * seed the stored field with it when the user opts into detailed mode.
   */
  effectiveBossChargedMoveFrequencySeconds: number;
  data: ReturnType<typeof runTeamRaid> | null;
  error: string | null;
}

export function runTeamRaidScenario(a: TeamAssumptions, registry: SpeciesRegistry): TeamRaidRunResult {
  const resolveSpecies = (id: string | null): SpeciesDefinition | null => (id && registry.has(id) ? registry.get(id) : null);

  const slotSpecies = a.slots.map((s) => resolveSpecies(s.speciesId));
  const bossSpecies = resolveSpecies(a.targetId);
  const bossRaidTier = raidTierForSpeciesId(a.targetId) ?? undefined;

  const selectedBossChargedMove = bossSpecies
    ? (bossSpecies.chargedMoves.find((m) => m.id === a.bossChargedMoveId) ?? bossSpecies.chargedMoves[0])
    : undefined;

  const bossStartingEnergy =
    a.bossStartsPrimed && bossSpecies ? a.bossStartingEnergyFraction * (selectedBossChargedMove?.energyCost ?? 0) : 0;

  let bossReadySeconds: number | null = null;
  if (bossSpecies) {
    const fastMove = bossSpecies.fastMoves.find((m) => m.id === a.bossFastMoveId) ?? bossSpecies.fastMoves[0];
    if (fastMove && selectedBossChargedMove) {
      bossReadySeconds = bossChargedMoveReadySeconds(fastMove, selectedBossChargedMove, bossStartingEnergy);
    }
  }

  const bossHp = bossSpecies ? bossEffectiveHp(bossSpecies, bossRaidTier) : null;

  /**
   * "Boss charged-move mean frequency" while showDetailedAssumptions is
   * false: derived from the boss's own fast-move charge time, standing in
   * for "the time it takes to charge its first charged attack" — a
   * placeholder pending improvement, not a modeled mechanic. Deliberately
   * passes 0 starting energy (NOT bossStartingEnergy) — this models a
   * steady-state cadence, not the fight's opening warmup, so "boss starts
   * already partway charged" must not perturb it.
   * bossChargedMoveReadySeconds returns Infinity when the fast move has no
   * energy gain, and 0 when the cost is already covered — both degenerate
   * results fall back to the stored bossChargedMoveFrequencySeconds rather
   * than feeding a useless number into the simulator.
   */
  let effectiveBossChargedMoveFrequencySeconds = a.bossChargedMoveFrequencySeconds;
  if (!a.showDetailedAssumptions && bossSpecies) {
    const fastMove = bossSpecies.fastMoves.find((m) => m.id === a.bossFastMoveId) ?? bossSpecies.fastMoves[0];
    if (fastMove && selectedBossChargedMove) {
      const derived = bossChargedMoveReadySeconds(fastMove, selectedBossChargedMove, 0);
      if (Number.isFinite(derived) && derived > 0) {
        effectiveBossChargedMoveFrequencySeconds = derived;
      }
    }
  }

  let data: ReturnType<typeof runTeamRaid> | null = null;
  let error: string | null = null;
  if (bossSpecies) {
    try {
      data = runTeamRaid({
        // Each slot's species stays RAW everywhere else — the Shadow toggle
        // is applied ONLY here, at the boundary into runTeamRaid, same
        // convention as ComparatorView's shadowAdjustedCandidates.
        slots: a.slots.map((s) => ({
          species: applyShadowToggle(resolveSpecies(s.speciesId), s.isShadow),
          fastMoveId: s.fastMoveId,
          chargedMoveId: s.chargedMoveId,
          isMega: s.isMega,
          // TeamRaidSlotInput.megaLevel is MegaLevel | undefined (no explicit
          // null in its type), unlike TeamScenarioSlot.megaLevel's
          // MegaLevel | null — both mean the same "no investment assumed"
          // thing everywhere this is consumed, so `?? undefined` is a pure
          // type-shape conversion, not a behavior change.
          megaLevel: s.megaLevel ?? undefined,
        })),
        boss: bossSpecies,
        bossRaidTier,
        bossFastMoveId: a.bossFastMoveId,
        bossChargedMoveId: a.bossChargedMoveId,
        level: a.level,
        ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
        dodge: a.dodge,
        dodgeFastAttacks: a.dodgeFastAttacks,
        holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
        bossChargedMoveMeanIntervalSeconds: effectiveBossChargedMoveFrequencySeconds,
        bossChargedMoveCadence: a.bossChargedMoveCadence,
        bossStartingEnergy,
        weather: a.weather,
        raidTimerSeconds: a.raidTimerSeconds,
        swapCostSeconds: a.swapCostSeconds,
        reviveCostSeconds: a.reviveCostSeconds,
      });
    } catch (err) {
      error = (err as Error).message;
    }
  }

  return {
    slotSpecies,
    bossSpecies,
    bossRaidTier,
    bossReadySeconds,
    bossHp,
    effectiveBossChargedMoveFrequencySeconds,
    data,
    error,
  };
}
