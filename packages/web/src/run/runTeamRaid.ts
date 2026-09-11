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
  type TeamRaidInputs,
  type TeamRaidOutcome,
  type TeamRaidReselector,
} from "@pogo-analyzer/engine";
import type { TeamAssumptions } from "../TeamAssumptionPanel.js";
import { applyShadowToggle } from "../shadowToggle.js";
import { pastRaidBossOptions, raidTierForSpeciesId, type PastRaidBossOption } from "../registry.js";
import { hydrateRosterPool, loadRosterPool } from "../rosterPool.js";
import { deriveEffectiveBossChargedMoveFrequencySeconds } from "./effectiveBossChargedMoveFrequency.js";
import { validEraHp } from "./runSpeciesReport.js";
import { buildTeamRaidReselector } from "./teamRaidReselect.js";

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
  /**
   * IDEAS #18: re-runs the SAME roster/boss encounter once per the boss's
   * own known charged move (all other assumptions held fixed), so "does my
   * roster clear this boss" stops being silently conditional on which
   * charged move the boss happened to be set to — the highest-stakes tab's
   * headline was previously computed against exactly one fixed
   * bossChargedMoveId with no visibility into whether a different real boss
   * roll would flip clear into failure. `null` whenever the boss has fewer
   * than 2 known charged moves (nothing to sweep) — see TeamRaidView's own
   * gating on this field.
   */
  bossMovesetSweep: TeamRaidBossMovesetSweep | null;
  /**
   * IDEAS #14 — the recorded past-raid encounter (registry.ts's
   * pastRaidBossOptions) matching the current target with a usable eraHp,
   * regardless of whether TeamAssumptions.bossMaxHpOverrideEnabled is
   * actually on — so the panel can show/offer the toggle (and the real
   * historical figure it would apply) even before the user opts in. `null`
   * when no such recorded encounter exists for this target (the common
   * case: most targets are today's live tier, with no archived HP to show).
   */
  eraHpMatch: { eraHp: number; raidName: string; recordedTier: string } | null;
  /**
   * IDEAS #12 — how many entries are currently in the imported roster pool
   * (Roster tab / rosterPool.ts), read fresh on every call — so the panel
   * can explain why "re-select after a wipe" is a no-op (or hide it) when
   * the pool is empty, the same "empty roster, explicit note" convention
   * used elsewhere (Lineup Builder, Power-Up Optimizer's multi-raid mode).
   */
  rosterPoolSize: number;
}

export interface TeamRaidBossMovesetResult {
  moveId: string;
  moveName: string;
  outcome: TeamRaidOutcome;
  clearsWithinTimer: boolean;
  timeToClearSeconds: number | null;
  timerMarginSeconds: number | null;
  wipeCount: number;
  slotsUsed: number;
}

export interface TeamRaidBossMovesetSweep {
  results: TeamRaidBossMovesetResult[];
  /**
   * True when `clearsWithinTimer` differs across at least two of the boss's
   * own known charged moves — the headline case this whole sweep exists to
   * surface (a moveset roll that turns a clear into a failure, or vice
   * versa), as opposed to every moveset agreeing on the same verdict.
   */
  verdictVaries: boolean;
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

  // IDEAS #14 — see TeamAssumptions.bossMaxHpOverrideEnabled's own doc
  // comment. `pastMatch` is found regardless of the toggle (so the panel can
  // show/hide the control and its historical HP figure even before it's
  // enabled); `bossMaxHpOverride` below is only actually applied when the
  // toggle is on. `validEraHp` guards registry.ts's raw, unvalidated
  // PastRaidBossOption.eraHp against the engine's actual contract (throws on
  // a non-finite/non-positive value) — same reuse as run/runSpeciesReport.ts.
  // A species can have more than one recorded past-raid row (different
  // tiers/sources over time); this takes the first with a usable eraHp,
  // documented as a deliberate simplification rather than exposing a second
  // picker for "which encounter."
  const pastMatch: PastRaidBossOption | undefined = pastRaidBossOptions().find(
    (r) => r.id === a.targetId && validEraHp(r.eraHp) !== undefined,
  );
  const eraHp = pastMatch ? validEraHp(pastMatch.eraHp) : undefined;
  const bossMaxHpOverride = a.bossMaxHpOverrideEnabled ? eraHp : undefined;

  // Reflects whatever HP value is ACTUALLY fed to runTeamRaid below — the
  // override when active, else the ordinary tier-based figure — so the
  // "Boss battle HP" display in the assumptions panel never silently
  // disagrees with what the simulation used.
  const bossHp = bossSpecies ? (bossMaxHpOverride ?? bossEffectiveHp(bossSpecies, bossRaidTier)) : null;

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

  // IDEAS #12 — see TeamAssumptions.reselectAfterWipeEnabled's own doc
  // comment and run/teamRaidReselect.ts's own top doc comment for the
  // (deliberately simple, non-simulated) selection heuristic. Built once per
  // scenario evaluation (not per-wipe) from a fresh read of the roster pool
  // — rosterPool.ts's loadRosterPool already degrades to an empty pool
  // rather than throwing when localStorage is unavailable (SSR/CLI/private
  // browsing), so this is safe to call unconditionally. `undefined` (rather
  // than a reselector that immediately no-ops) whenever the toggle is off OR
  // the pool is empty OR no boss resolved — byte-identical to
  // reselectAfterWipe being omitted entirely, per that field's own contract.
  const rosterPool = hydrateRosterPool(loadRosterPool(), registry).entries;
  const reselectAfterWipe: TeamRaidReselector | undefined = a.reselectAfterWipeEnabled
    ? buildTeamRaidReselector(rosterPool, bossSpecies)
    : undefined;

  // Every field EXCEPT bossChargedMoveId/bossStartingEnergy — factored out so
  // both the main (single-moveset) call below AND the boss-moveset sweep
  // (IDEAS #18) build the identical roster/boss/timer configuration and can
  // only ever differ in the one thing actually being swept, never drift into
  // two subtly different simulations.
  function buildTeamRaidInputs(bossChargedMoveId: string | null, bossStartingEnergyForMove: number): TeamRaidInputs {
    return {
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
        // Per-slot override — `undefined` falls back to the roster-wide
        // level/ivs below (TeamRaidSlotInput's own convention), so a
        // hand-built slot (which never sets these) behaves byte-identically
        // to before this field existed. See TeamSlotAssumption.level's own
        // doc comment for why this exists (the lineup builder).
        level: s.level,
        ivs: s.ivs,
        isBestBuddy: s.isBestBuddy,
      })),
      reselectAfterWipe,
      boss: bossSpecies!,
      bossRaidTier,
      bossMaxHpOverride,
      bossFastMoveId: a.bossFastMoveId,
      bossChargedMoveId,
      level: a.level,
      ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
      dodge: a.dodge,
      dodgeFastAttacks: a.dodgeFastAttacks,
      holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
      bossChargedMoveMeanIntervalSeconds: effectiveBossChargedMoveFrequencySeconds,
      bossChargedMoveCadence: a.bossChargedMoveCadence,
      bossStartingEnergy: bossStartingEnergyForMove,
      weather: a.weather,
      friendshipLevel: a.friendshipLevel,
      raidTimerSeconds: a.raidTimerSeconds,
      swapCostSeconds: a.swapCostSeconds,
      reviveCostSeconds: a.reviveCostSeconds,
    };
  }

  let data: ReturnType<typeof runTeamRaid> | null = null;
  let error: string | null = null;
  if (bossSpecies) {
    try {
      data = runTeamRaid(buildTeamRaidInputs(a.bossChargedMoveId, bossStartingEnergy));
    } catch (err) {
      error = (err as Error).message;
    }
  }

  // IDEAS #18 — see TeamRaidRunResult.bossMovesetSweep's own doc comment.
  // Only meaningful when the boss actually has 2+ known charged moves (same
  // gate ComparatorView's bossMovesetSweep already uses). runTeamRaid is a
  // single deterministic simulation (unlike runSustainedComparison's 200
  // iterations), so re-running it once per boss charged move is cheap —
  // see agent memory for the measured cost.
  let bossMovesetSweep: TeamRaidBossMovesetSweep | null = null;
  if (bossSpecies && bossSpecies.chargedMoves.length >= 2) {
    const results: TeamRaidBossMovesetResult[] = [];
    for (const move of bossSpecies.chargedMoves) {
      const startingEnergyForMove = a.bossStartsPrimed ? a.bossStartingEnergyFraction * move.energyCost : 0;
      try {
        const r = runTeamRaid(buildTeamRaidInputs(move.id, startingEnergyForMove));
        results.push({
          moveId: move.id,
          moveName: move.name,
          outcome: r.outcome,
          clearsWithinTimer: r.clearsWithinTimer,
          timeToClearSeconds: r.timeToClearSeconds,
          timerMarginSeconds: r.timerMarginSeconds,
          wipeCount: r.wipeCount,
          slotsUsed: r.slotsUsed,
        });
      } catch {
        // Skip a moveset that fails to simulate for this roster (should be
        // rare — the main call above already exercises the identical roster
        // configuration successfully whenever `data` is non-null) rather
        // than failing the whole sweep over one bad variant.
      }
    }
    if (results.length >= 2) {
      bossMovesetSweep = { results, verdictVaries: new Set(results.map((r) => r.clearsWithinTimer)).size > 1 };
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
    bossMovesetSweep,
    eraHpMatch: pastMatch && eraHp !== undefined ? { eraHp, raidName: pastMatch.raidName, recordedTier: pastMatch.recordedTier } : null,
    rosterPoolSize: rosterPool.length,
  };
}
