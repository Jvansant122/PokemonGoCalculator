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
import { deriveEffectiveBossChargedMoveFrequencySeconds } from "./effectiveBossChargedMoveFrequency.js";

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
   * own fast-move charge time (see effectiveBossChargedMoveFrequency.ts's
   * own doc comment for the full derivation — shared with
   * run/runComparator.ts's identical field, so the two tabs can't compute
   * two different numbers for the same "simple mode" concept) — a
   * placeholder pending improvement, not this boss's confirmed real cadence.
   * Exposed so the assumption panel can show it and seed the stored field
   * with it when the user opts into detailed mode.
   */
  effectiveBossChargedMoveFrequencySeconds: number;
  data: ReturnType<typeof runTeamRaid> | null;
  error: string | null;
  /**
   * Extra context for a run that never found a clearing point at all
   * (`data.timeToClearSeconds === null`) — TeamRaidResult's own outcome
   * fields (wipeCount, slotsUsed, Finishing blow) are all legitimately "n/a"
   * or 0 in that case, which reads as "broken," not "you lost." Null
   * whenever `data` is null, OR the run DID find a clearing point — either a
   * clean clear, or a LATE clear after the timer already expired
   * (`timeToClearSeconds` is non-null in both of those, and the existing
   * "Timer margin" stat already renders a real, informative number for the
   * late-clear case, e.g. "-10.0s short" — this summary exists only for the
   * genuinely-never-cleared case that has nothing else to show).
   */
  failureSummary: TeamRaidFailureSummary | null;
}

export interface TeamRaidFailureSummary {
  /**
   * Sum of every recorded fight's own damage — the total the boss actually
   * took across the whole run, however long the engine let the LAST
   * unresolved fight play out (see teamRaid.ts's own maxSecondsPerSlot doc
   * comment: that fight's simulated window can run past what the real
   * raidTimerSeconds would have allowed, which is why this can very slightly
   * overcount rather than undercount — a documented engine simplification,
   * not something this summary invents).
   */
  totalDamageDealt: number;
  /** bossHp - totalDamageDealt, floored at 0 — how much boss HP was left. */
  bossHpRemaining: number;
  /** totalDamageDealt / bossHp, clamped to [0, 1] — "how far the boss's HP got," as a fraction. */
  fractionOfBossHpDealt: number;
  /**
   * raidTimerSeconds minus the raid-global clock this run actually reached,
   * clamped to [0, raidTimerSeconds]. Ordinarily 0 (the timer genuinely ran
   * out) — a positive value only occurs in the rare case the engine's own
   * MAX_TEAM_RAID_CYCLES safety cap stopped a near-zero-damage roster before
   * the timer itself did (see teamRaid.ts's own doc comment on that
   * constant).
   */
  timeLeftOnClockSeconds: number;
  /** bossHp / raidTimerSeconds — the average team DPS this run would have needed to sustain, uninterrupted, across the WHOLE timer to clear exactly at the buzzer. */
  requiredAverageTeamDps: number;
  /** totalDamageDealt / raidTimerSeconds — this run's own actual average pace over the whole timer, already including every swap/revive/wipe delay it paid along the way. */
  achievedAverageTeamDps: number;
  /** requiredAverageTeamDps - achievedAverageTeamDps, floored at 0 — the headline "how much more DPS would it have taken" figure. Always > 0 for a genuine failure (see this field's call site for why that's guaranteed, not just typical). */
  averageTeamDpsShortfall: number;
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

  const bossFastMove = bossSpecies
    ? (bossSpecies.fastMoves.find((m) => m.id === a.bossFastMoveId) ?? bossSpecies.fastMoves[0])
    : undefined;

  let bossReadySeconds: number | null = null;
  if (bossSpecies && bossFastMove && selectedBossChargedMove) {
    bossReadySeconds = bossChargedMoveReadySeconds(bossFastMove, selectedBossChargedMove, bossStartingEnergy);
  }

  const bossHp = bossSpecies ? bossEffectiveHp(bossSpecies, bossRaidTier) : null;

  // See effectiveBossChargedMoveFrequency.ts's own doc comment for the full
  // derivation this stands in for while showDetailedAssumptions is false —
  // shared with runComparator.ts so the two tabs can't compute two
  // different numbers for the same "simple mode" concept.
  const effectiveBossChargedMoveFrequencySeconds = deriveEffectiveBossChargedMoveFrequencySeconds({
    showDetailedAssumptions: a.showDetailedAssumptions,
    bossSpecies,
    bossFastMove,
    bossChargedMove: selectedBossChargedMove,
    stored: a.bossChargedMoveFrequencySeconds,
  });

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

  // See TeamRaidFailureSummary's own doc comment for what this covers and
  // why: only a run that never found a clearing point at all needs it — a
  // clean clear or a late clear both already have a real, informative
  // timeToClearSeconds/timerMarginSeconds to show.
  let failureSummary: TeamRaidFailureSummary | null = null;
  if (data && data.timeToClearSeconds === null && bossHp !== null) {
    const totalDamageDealt = data.slots.reduce((sum, s) => sum + s.ownDamageDealt, 0);
    const lastSlot = data.slots[data.slots.length - 1];
    const raidTimerSeconds = a.raidTimerSeconds;
    // Clamped to raidTimerSeconds: the last recorded fight's own
    // endedAtRaidSeconds can overshoot it (teamRaid.ts's own
    // maxSecondsPerSlot doc comment — a fight that survives its own full
    // simulated window without fainting means the real timer necessarily
    // ran out sometime DURING it, so clamping here states a true fact,
    // it doesn't invent one).
    const elapsedClamped = lastSlot ? Math.min(raidTimerSeconds, Math.max(0, lastSlot.endedAtRaidSeconds)) : raidTimerSeconds;
    const requiredAverageTeamDps = raidTimerSeconds > 0 ? bossHp / raidTimerSeconds : 0;
    const achievedAverageTeamDps = raidTimerSeconds > 0 ? totalDamageDealt / raidTimerSeconds : 0;
    failureSummary = {
      totalDamageDealt,
      bossHpRemaining: Math.max(0, bossHp - totalDamageDealt),
      fractionOfBossHpDealt: bossHp > 0 ? Math.min(1, totalDamageDealt / bossHp) : 0,
      timeLeftOnClockSeconds: Math.max(0, raidTimerSeconds - elapsedClamped),
      requiredAverageTeamDps,
      achievedAverageTeamDps,
      averageTeamDpsShortfall: Math.max(0, requiredAverageTeamDps - achievedAverageTeamDps),
    };
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
    failureSummary,
  };
}
