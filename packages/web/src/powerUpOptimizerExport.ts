import { MAX_TEAM_RAID_SLOTS, type PowerUpBudgetFinalLevel } from "@pogo-analyzer/engine";
import { emptyTeamSlot, type TeamAssumptions, type TeamSlotAssumption } from "./TeamAssumptionPanel.js";
import type { PowerUpOptimizerAssumptions, PowerUpSlotAssumption } from "./PowerUpOptimizerAssumptionPanel.js";

/**
 * One line of user-facing copy for the "Send post-plan roster to Team Raid
 * Simulator" button (PowerUpOptimizerView.tsx, single-raid mode only) —
 * shown right next to the button so a level/IV number that looks slightly
 * different on the other tab never comes as a surprise. Unlike
 * teamRaidExport.ts's TEAM_RAID_EXPORT_MISSING_NOTE (which lists fields the
 * destination has NO source for at all), this direction's real gap is
 * structural rather than missing data: the Power-Up Optimizer gives every
 * slot its OWN level and IVs (the whole point of that tab), but Team Raid
 * models one shared level/IV spread for the whole roster (see
 * TeamAssumptions.level's own doc comment) — see
 * powerUpOptimizerAssumptionsToTeamAssumptions's own doc comment for exactly
 * how that reduction is computed.
 */
export const POWER_UP_OPTIMIZER_EXPORT_MISSING_NOTE =
  "Brings over your roster's species/moves/mega/Shadow flags, the boss, and every combat assumption. Team Raid shares ONE level and ONE IV spread across the whole roster (unlike this tab's per-slot values), so the level/IV fields below are the mean across your fielded slots, rounded to the nearest half-level/whole IV — not any one slot's exact number. Stardust/candy/Purified/Lucky have no Team Raid equivalent and are dropped.";

/** Rounds to the nearest half-level (Team Raid's own NumberField step) and clamps to [1, MAX_POKEMON_POWER_UP_LEVEL] is left to the receiving tab's own normalization — this only rounds, matching the precision the destination's level field actually accepts. */
function roundToHalfLevel(level: number): number {
  return Math.round(level * 2) / 2;
}

/** Rounds and clamps to a legal IV (Team Raid's own IV fields are integers 0-15). */
function roundIv(iv: number): number {
  return Math.max(0, Math.min(15, Math.round(iv)));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function slotToTeamSlot(s: PowerUpSlotAssumption): TeamSlotAssumption {
  return {
    speciesId: s.speciesId,
    fastMoveId: s.fastMoveId,
    chargedMoveId: s.chargedMoveId,
    isMega: s.isMega,
    megaLevel: s.megaLevel,
    isShadow: s.isShadow,
  };
}

/**
 * Maps a Power-Up Optimizer single-raid roster/boss/assumptions
 * (PowerUpOptimizerAssumptions) onto the Team Raid Simulator's Assumptions
 * shape (TeamAssumptions) — the reverse of teamRaidExport.ts's
 * teamAssumptionsToPowerUpOptimizerAssumptions, extracted the same way (a
 * pure function with its own unit test, powerUpOptimizerExport.test.ts)
 * rather than inlined in the "Send to Team Raid" button's click handler.
 *
 * `finalLevels`, when provided, is a committed PowerUpBudgetPlan's own
 * `finalLevels` array (same index as `assumptions.slots`) — the whole point
 * of this button is showing the roster you'd have AFTER spending, not the
 * one you have now, so a fielded slot's level is taken from
 * `finalLevels[i].toLevel` (falling back to that slot's own CURRENT level
 * only for a slot the plan didn't touch, or when no plan exists at all,
 * e.g. `null` when the optimizer has no boss/fielded-slot result yet).
 *
 * **The one genuine reduction here** (documented to the user via
 * POWER_UP_OPTIMIZER_EXPORT_MISSING_NOTE, shown next to the button): Team
 * Raid has no per-slot level/IV concept at all (TeamAssumptions.level/
 * ivAttack/ivDefense/ivStamina are ONE shared spread for the whole roster —
 * see that type's own doc comment), while every Power-Up Optimizer slot
 * carries its own. There is no lossless way to carry N different post-plan
 * levels into a type that only has room for one, so the shared level/IVs
 * below are the MEAN across fielded slots (post-plan level where the plan
 * touched that slot, current level otherwise), rounded to the precision
 * Team Raid's own inputs accept (nearest half-level, whole-number IVs). An
 * empty roster (no fielded slots) falls back to 20/15/15/15 — Team Raid's
 * own empty-roster resting shape (TeamAssumptionPanel has no separate
 * "unknown" level concept the field itself always holds a number).
 *
 * What carries verbatim (same "these mean the same thing on both tabs"
 * precedent as the reverse export): every slot's species/fast move/charged
 * move/isMega/Mega Level/isShadow (in order), the boss target and its two
 * moves, and every shared combat assumption (dodge, dodgeFastAttacks,
 * holdChargedMoveUntilSafe, weather, bossChargedMoveFrequencySeconds,
 * bossChargedMoveCadence, bossStartsPrimed, bossStartingEnergyFraction,
 * raidTimerSeconds, swapCostSeconds, reviveCostSeconds).
 * `showDetailedAssumptions` is forced `true` — every one of the fields it
 * gates is a REAL, non-default value carried over from the source tab, so
 * hiding them behind Team Raid's own "simple assumptions" summary would
 * hide exactly the numbers this hand-off exists to make visible.
 *
 * What does NOT carry, and is silently dropped (no Team Raid equivalent at
 * all, so there's nothing to leave at a "missing" placeholder the way
 * teamRaidExport.ts's stardust/candy fields do): stardustOnHand,
 * rareCandyOnHand, rareCandyXlOnHand, every slot's own candyOnHand/
 * xlCandyOnHand/isPurified/isLucky, and `rankBy`. Multi-raid mode is
 * entirely out of scope for this function — callers must only invoke it
 * for `assumptions.mode === "single-raid"` (see PowerUpOptimizerView.tsx's
 * own single-raid-only gate on the "Send to Team Raid" button for why: a
 * multi-raid roster/boss-set has no unambiguous reduction onto Team Raid's
 * 6-slots/1-boss shape without inventing a silent filter).
 */
export function powerUpOptimizerAssumptionsToTeamAssumptions(
  a: PowerUpOptimizerAssumptions,
  finalLevels: PowerUpBudgetFinalLevel[] | null,
): TeamAssumptions {
  const slots: TeamSlotAssumption[] = a.slots.slice(0, MAX_TEAM_RAID_SLOTS).map(slotToTeamSlot);
  while (slots.length < MAX_TEAM_RAID_SLOTS) slots.push(emptyTeamSlot());

  const fieldedSlots = a.slots.filter((s) => s.speciesId !== null);

  const fieldedLevels = a.slots
    .map((s, i) => (s.speciesId === null ? null : (finalLevels?.[i]?.toLevel ?? s.level)))
    .filter((level): level is number => level !== null);
  const level = fieldedLevels.length > 0 ? roundToHalfLevel(mean(fieldedLevels)!) : 20;

  const ivAttack = fieldedSlots.length > 0 ? roundIv(mean(fieldedSlots.map((s) => s.ivAttack))!) : 15;
  const ivDefense = fieldedSlots.length > 0 ? roundIv(mean(fieldedSlots.map((s) => s.ivDefense))!) : 15;
  const ivStamina = fieldedSlots.length > 0 ? roundIv(mean(fieldedSlots.map((s) => s.ivStamina))!) : 15;

  return {
    slots,
    targetId: a.targetId,
    bossFastMoveId: a.bossFastMoveId,
    bossChargedMoveId: a.bossChargedMoveId,
    level,
    ivAttack,
    ivDefense,
    ivStamina,
    dodge: a.dodge,
    dodgeFastAttacks: a.dodgeFastAttacks,
    holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
    weather: a.weather,
    bossChargedMoveFrequencySeconds: a.bossChargedMoveFrequencySeconds,
    // See this function's own doc comment — every gated field below carries
    // a real, non-default value from the source tab, so it should be
    // visible immediately rather than hidden behind Team Raid's own
    // "simple assumptions" collapse.
    showDetailedAssumptions: true,
    bossChargedMoveCadence: a.bossChargedMoveCadence,
    bossStartsPrimed: a.bossStartsPrimed,
    bossStartingEnergyFraction: a.bossStartingEnergyFraction,
    raidTimerSeconds: a.raidTimerSeconds,
    swapCostSeconds: a.swapCostSeconds,
    reviveCostSeconds: a.reviveCostSeconds,
  };
}
