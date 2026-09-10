import { MAX_TEAM_RAID_SLOTS, type PowerUpBudgetFinalLevel } from "@pogo-analyzer/engine";
import { emptyTeamSlot, type TeamAssumptions, type TeamSlotAssumption } from "./TeamAssumptionPanel.js";
import type { PowerUpOptimizerAssumptions, PowerUpSlotAssumption } from "./PowerUpOptimizerAssumptionPanel.js";

/**
 * One line of user-facing copy for the "Send post-plan roster to Team Raid
 * Simulator" button (PowerUpOptimizerView.tsx, single-raid mode only) —
 * shown right next to the button so a level/IV number that looks slightly
 * different on the other tab never comes as a surprise. Unlike
 * teamRaidExport.ts's TEAM_RAID_EXPORT_MISSING_NOTE (which lists fields the
 * destination has NO source for at all), this direction has no real gap:
 * TeamSlotAssumption's own per-slot `level`/`ivs` override (added for the
 * Lineup Builder) is exactly the field this hand-off needed, so every slot's
 * OWN post-plan level and IVs carry across unchanged — see
 * powerUpOptimizerAssumptionsToTeamAssumptions's own doc comment.
 */
export const POWER_UP_OPTIMIZER_EXPORT_MISSING_NOTE =
  "Brings over your roster's species/moves/mega/Shadow flags, each slot's OWN post-plan level and IVs, the boss, and every combat assumption. Stardust/candy/Purified/Lucky have no Team Raid equivalent and are dropped.";

/** Rounds to the nearest half-level (Team Raid's own NumberField step) and clamps to [1, MAX_POKEMON_POWER_UP_LEVEL] is left to the receiving tab's own normalization — this only rounds, matching the precision the destination's level field actually accepts. */
function roundToHalfLevel(level: number): number {
  return Math.round(level * 2) / 2;
}

/** Rounds and clamps to a legal IV (Team Raid's own IV fields are integers 0-15). */
function roundIv(iv: number): number {
  return Math.max(0, Math.min(15, Math.round(iv)));
}

/**
 * Maps one Power-Up Optimizer slot onto a Team Raid slot, carrying its OWN
 * resolved level (post-plan `toLevel` when the plan touched it, else the
 * slot's current level — resolved by the caller and passed in as `level`)
 * and its own IVs as that slot's per-slot `level`/`ivs` OVERRIDE
 * (TeamSlotAssumption's own fields, added for exactly this kind of
 * per-Pokémon hand-off — see that type's own doc comment) rather than
 * folding them into the roster-wide shared spread. This is the same
 * override field teamRaidExport.ts's slotToPowerUpSlot already reads in the
 * opposite direction; mirroring it here (instead of collapsing to a mean)
 * is what fixes the ~40% clear-time divergence measured before this field
 * was wired up in this direction (see
 * .claude/agent-memory/web-developer/feature_reverse_cross_tab_links_powerup_to_teamraid_and_speciesreport.md).
 */
function slotToTeamSlot(s: PowerUpSlotAssumption, level: number): TeamSlotAssumption {
  return {
    speciesId: s.speciesId,
    fastMoveId: s.fastMoveId,
    chargedMoveId: s.chargedMoveId,
    isMega: s.isMega,
    megaLevel: s.megaLevel,
    isShadow: s.isShadow,
    level: roundToHalfLevel(level),
    ivs: { attack: roundIv(s.ivAttack), defense: roundIv(s.ivDefense), stamina: roundIv(s.ivStamina) },
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
 * **Every slot carries its OWN resolved level/IVs**, via TeamSlotAssumption's
 * own per-slot `level`/`ivs` override field (see slotToTeamSlot above) — NOT
 * folded into one roster-wide mean. That override field exists specifically
 * for this: an earlier version of this function collapsed the whole roster
 * onto `mean(fieldedLevels)` because, at the time it was written, Team Raid's
 * `TeamSlotAssumption` had no per-slot level/IV concept at all and there was
 * genuinely no lossless way to carry N different post-plan levels into a
 * type with room for only one. That constraint no longer holds — the
 * override field was added for the Lineup Builder (see
 * TeamSlotAssumption.level's own doc comment) and this direction simply
 * hadn't been re-wired to use it, which is the exact bug this rewrite fixes
 * (measured ~40% clear-time divergence: a plan claiming 100% clear at 89.8s
 * vs. Team Raid simulating the collapsed-mean roster at 125.7s).
 *
 * The roster-WIDE `level`/`ivAttack`/`ivDefense`/`ivStamina` fields below are
 * no longer load-bearing for any fielded slot (every fielded slot has its
 * own override, which Team Raid always prefers — see
 * TeamAssumptionPanel.tsx's own rendering of `slot.level ?? value.level`).
 * They're set to Team Raid's own plain resting default (20/15/15/15, same as
 * DEFAULT_TEAM_ASSUMPTIONS's shape) rather than a computed mean — a mean
 * would misleadingly imply one "typical" number represents the roster, when
 * the whole point of this hand-off is that it doesn't. The shared fields
 * still matter for one thing: they're the level/IVs Team Raid would use if
 * the user manually ADDS a new slot afterwards (one with no override of its
 * own), which is a sensible, honest fallback rather than a computed
 * approximation of already-known per-slot data.
 *
 * What carries verbatim (same "these mean the same thing on both tabs"
 * precedent as the reverse export): every slot's species/fast move/charged
 * move/isMega/Mega Level/isShadow/level/IVs (in order), the boss target and
 * its two moves, and every shared combat assumption (dodge, dodgeFastAttacks,
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
  const slots: TeamSlotAssumption[] = a.slots.slice(0, MAX_TEAM_RAID_SLOTS).map((s, i) => {
    const level = finalLevels?.[i]?.toLevel ?? s.level;
    return slotToTeamSlot(s, level);
  });
  while (slots.length < MAX_TEAM_RAID_SLOTS) slots.push(emptyTeamSlot());

  return {
    slots,
    targetId: a.targetId,
    bossFastMoveId: a.bossFastMoveId,
    bossChargedMoveId: a.bossChargedMoveId,
    // Team Raid's own plain resting default — see this function's own doc
    // comment for why this is no longer a computed mean.
    level: 20,
    ivAttack: 15,
    ivDefense: 15,
    ivStamina: 15,
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
