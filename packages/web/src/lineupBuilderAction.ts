import {
  MAX_TEAM_RAID_SLOTS,
  runLineupBuilder,
  type LineupBuilderEntry,
  type LineupBuilderResult,
  type LineupSlot,
  type RaidTier,
  type SpeciesDefinition,
} from "@pogo-analyzer/engine";
import { emptyTeamSlot, type TeamAssumptions, type TeamSlotAssumption } from "./TeamAssumptionPanel.js";
import type { RosterEntry } from "./import/pokeGenieMatch.js";

/**
 * The "build the best lineup from my imported roster" action behind Team
 * Raid Simulator's Lineup Builder panel — see PLAN_lineup_builder.md at the
 * repo root and packages/engine/src/lineupBuilder.ts's own top doc comment
 * for the search this wraps. Extracted as pure, React-free functions (same
 * "own tested function, not inline in a click handler" precedent as
 * teamRaidExport.ts) so the mapping has its own unit test independent of the
 * button.
 *
 * The imported roster pool (rosterPool.ts, localStorage-only — see CLAUDE.md's
 * standing decision) has never been read by Team Raid before this feature;
 * this module is the one place it is, and only on an explicit click, never
 * on every render — see TeamRaidView.tsx's own handleBuildLineup for why this
 * isn't a useMemo the way every other tab's run<Tab>.ts is (there is no
 * Scenario field driving it, and re-running a real search on every keystroke
 * elsewhere in the form would be wasted work).
 */

/** Reasons the action can't run at all — distinct from a thrown engine error (see LineupBuilderOutcome.error). */
export type LineupBuilderBlockedReason = "no-roster" | "no-boss";

export interface LineupBuilderOutcome {
  blockedReason: LineupBuilderBlockedReason | null;
  result: LineupBuilderResult | null;
  /** A thrown error from runLineupBuilder itself (e.g. a validation error) — distinct from blockedReason's two "nothing to compute yet" cases. */
  error: string | null;
}

/**
 * Maps the web layer's imported-roster shape (import/pokeGenieMatch.ts's
 * `RosterEntry` — species-matched Poke Genie rows, already hydrated from
 * rosterPool.ts's localStorage-only pool) onto the engine's own
 * `LineupBuilderEntry` — a field-for-field carry-over, same "re-check canMega
 * against species.boost defensively" precedent as
 * run/runRosterPlanner.ts's toEngineRosterPool (a hand-edited/corrupted
 * imported JSON roster could otherwise set canMega on a species with no
 * boost mechanic, which runLineupBuilder throws on).
 *
 * KNOWN GAP, shared with toEngineRosterPool: `LineupBuilderEntry` has no
 * Shadow field at all, so an imported roster row's own
 * `costModifiers.isShadow` (see pokeGenieMatch.ts) is silently dropped here
 * — a Shadow Pokémon in the roster is screened/simulated as its non-Shadow
 * base form. Not fixed here; this is the exact same pre-existing gap
 * multi-raid mode's own roster pipeline already has (rosterPlanner.ts's
 * engine-side RosterEntry has no isShadow field either), not something new
 * this feature introduces.
 */
export function buildLineupPoolFromRoster(pool: RosterEntry[]): LineupBuilderEntry[] {
  return pool.map((e) => ({
    entryId: e.entryId,
    species: e.species,
    fastMoveId: e.fastMoveId,
    chargedMoveId: e.chargedMoveId,
    level: e.level,
    ivs: e.ivs,
    canMega: e.canMega && !!e.species.boost,
  }));
}

/**
 * One resolved `LineupSlot` (the engine's own result shape — already
 * `TeamRaidSlotInput`/`TeamScenarioSlot`-compatible per lineupBuilder.ts's
 * own doc comment) onto a `TeamSlotAssumption` — the UI's own round-trippable
 * per-slot shape. `isShadow` is always false here (see
 * buildLineupPoolFromRoster's own doc comment for why the roster pool can't
 * supply one). `level`/`ivs` are carried through UNCONDITIONALLY — this is
 * the whole point of the feature (see TeamSlotAssumption.level's own doc
 * comment): a built slot fights at ITS OWN roster level, never a shared mean.
 */
export function lineupSlotToTeamSlotAssumption(slot: LineupSlot): TeamSlotAssumption {
  return {
    speciesId: slot.speciesId,
    fastMoveId: slot.fastMoveId,
    chargedMoveId: slot.chargedMoveId,
    isMega: slot.isMega,
    megaLevel: slot.megaLevel,
    isShadow: false,
    level: slot.level,
    ivs: slot.ivs,
  };
}

/**
 * Replaces `current.slots` with a built lineup's own slots (padded with
 * empty slots out to MAX_TEAM_RAID_SLOTS — a lineup can legitimately be
 * shorter than six, see lineupBuilder.ts's own doc comment on a
 * pool/mega-constraint too small to fill every slot), leaving every other
 * assumption (shared level/IV spread, dodge, weather, timer, etc.)
 * untouched. The shared TeamAssumptions.level/ivAttack/ivDefense/ivStamina
 * fields become inert for every slot this touches (each now carries its own
 * override) but are deliberately left as-is rather than zeroed — they still
 * apply to any slot a caller later clears back to "use shared" via the
 * assumption panel's own "use shared level/IVs instead" button.
 */
export function applyLineupSlotsToTeamAssumptions(current: TeamAssumptions, winnerSlots: LineupSlot[]): TeamAssumptions {
  const slots: TeamSlotAssumption[] = winnerSlots.map(lineupSlotToTeamSlotAssumption);
  while (slots.length < MAX_TEAM_RAID_SLOTS) slots.push(emptyTeamSlot());
  return { ...current, slots: slots.slice(0, MAX_TEAM_RAID_SLOTS) };
}

/**
 * The whole action: resolve blocked cases honestly (see CLAUDE.md's standing
 * decision — "no imported roster means no lineup to build," never a silent
 * fallback to the full species list), then run the engine's own search.
 * `bossRaidTier`/`effectiveBossChargedMoveMeanIntervalSeconds` are handed in
 * by the caller (TeamRaidView, via runTeamRaidScenario's own
 * `bossRaidTier`/`effectiveBossChargedMoveFrequencySeconds`) rather than
 * re-derived here, so the lineup search and the tab's own displayed raid use
 * the exact same boss configuration and can't silently disagree about it.
 */
export function runLineupBuilderForTeamRaid(
  assumptions: TeamAssumptions,
  pool: RosterEntry[],
  bossSpecies: SpeciesDefinition | null,
  bossRaidTier: RaidTier | undefined,
  effectiveBossChargedMoveMeanIntervalSeconds: number,
): LineupBuilderOutcome {
  if (pool.length === 0) return { blockedReason: "no-roster", result: null, error: null };
  if (!bossSpecies) return { blockedReason: "no-boss", result: null, error: null };

  try {
    const result = runLineupBuilder({
      pool: buildLineupPoolFromRoster(pool),
      boss: bossSpecies,
      bossRaidTier,
      bossFastMoveId: assumptions.bossFastMoveId,
      bossChargedMoveId: assumptions.bossChargedMoveId,
      dodge: assumptions.dodge,
      dodgeFastAttacks: assumptions.dodgeFastAttacks,
      holdChargedMoveUntilSafe: assumptions.holdChargedMoveUntilSafe,
      bossChargedMoveMeanIntervalSeconds: effectiveBossChargedMoveMeanIntervalSeconds,
      bossChargedMoveCadence: assumptions.bossChargedMoveCadence,
      weather: assumptions.weather,
      raidTimerSeconds: assumptions.raidTimerSeconds,
      swapCostSeconds: assumptions.swapCostSeconds,
      reviveCostSeconds: assumptions.reviveCostSeconds,
    });
    return { blockedReason: null, result, error: null };
  } catch (err) {
    return { blockedReason: null, result: null, error: (err as Error).message };
  }
}
