import { MAX_TEAM_RAID_SLOTS } from "@pogo-analyzer/engine";
import type { TeamAssumptions, TeamSlotAssumption } from "./TeamAssumptionPanel.js";
import type { PowerUpOptimizerAssumptions, PowerUpSlotAssumption } from "./PowerUpOptimizerAssumptionPanel.js";

/**
 * One line of user-facing copy for the "Export roster to Power-Up Optimizer"
 * button (TeamRaidView.tsx) — told to the user right next to the button so
 * "the numbers looked different over there" never comes as a surprise. Lists
 * every field the mapping below deliberately leaves at a resource-unknown
 * default rather than inventing a number (Team Raid has no concept of any of
 * these — see teamAssumptionsToPowerUpOptimizerAssumptions's own doc
 * comment for the full field-by-field mapping).
 */
export const TEAM_RAID_EXPORT_MISSING_NOTE =
  "Brings over your roster, boss, and combat assumptions. You'll still need to fill in: stardust on hand, each slot's own regular/XL candy, the shared Rare Candy pools, and any Shadow-adjacent Purified/Lucky flags — Team Raid has no equivalent for those.";

/**
 * Mirrors emptyPowerUpSlot()'s own convention (PowerUpOptimizerAssumptionPanel.tsx)
 * exactly — 0 candy, not "unknown," IS this tab's own resting state for a
 * slot no resource has been entered for yet; there is no separate "unknown"
 * concept for single-raid mode's own per-slot candy the way multi-raid's
 * candyByFamilyId map has one.
 *
 * Level/IVs: prefers THIS slot's own `level`/`ivs` override (see
 * TeamSlotAssumption.level's own doc comment — set by the Lineup Builder,
 * lineupBuilderAction.ts) over the roster-wide shared spread, falling back
 * to the shared spread only when the slot has no override. This matters:
 * without it, a lineup built with each Pokémon at its own real roster level
 * would silently collapse back onto one shared mean the moment it's
 * exported, the exact ~40% clear-time divergence already measured for the
 * Power-Up-Optimizer-plan -> Team Raid direction (see
 * .claude/agent-memory/web-developer/feature_reverse_cross_tab_links_powerup_to_teamraid_and_speciesreport.md)
 * — except here the fix is free, since the destination already has room for
 * a per-slot value.
 */
function slotToPowerUpSlot(
  slot: TeamSlotAssumption,
  level: number,
  ivAttack: number,
  ivDefense: number,
  ivStamina: number,
): PowerUpSlotAssumption {
  return {
    speciesId: slot.speciesId,
    fastMoveId: slot.fastMoveId,
    chargedMoveId: slot.chargedMoveId,
    isMega: slot.isMega,
    megaLevel: slot.megaLevel,
    isShadow: slot.isShadow,
    // Purified/Lucky have no Team Raid concept at all (not even an implicit
    // "false") — always false here, called out by name in
    // TEAM_RAID_EXPORT_MISSING_NOTE above rather than silently assumed.
    isPurified: false,
    isLucky: false,
    level: slot.level ?? level,
    ivAttack: slot.ivs?.attack ?? ivAttack,
    ivDefense: slot.ivs?.defense ?? ivDefense,
    ivStamina: slot.ivs?.stamina ?? ivStamina,
    candyOnHand: 0,
    xlCandyOnHand: 0,
  };
}

/**
 * Maps a Team Raid Simulator roster/boss/assumptions (TeamAssumptions) onto
 * the Power-Up Optimizer's single-raid Assumptions shape
 * (PowerUpOptimizerAssumptions) — the "Export roster to Power-Up Optimizer"
 * button's whole computation, extracted as a pure function so it has its own
 * unit test (teamRaidExport.test.ts) independent of the button's click
 * handler. Both tabs model one trainer's own 6-slot roster against one boss,
 * so this is a genuine field-for-field mapping, not a stretch — see
 * TeamRaidView.tsx's own "Export roster" button for the call site.
 *
 * What carries: all six slots (species/fast move/charged move/mega
 * flag/Mega Level/Shadow flag, in order), the raid target and its two boss
 * moves, each slot's own level/IVs (its own override when set — e.g. by the
 * Lineup Builder — else the shared roster-wide spread fanned out per-slot,
 * see slotToPowerUpSlot above), and every combat assumption both tabs share
 * verbatim (dodge model, dodgeFastAttacks, holdChargedMoveUntilSafe,
 * weather, boss charged-move frequency + cadence, bossStartsPrimed,
 * bossStartingEnergyFraction, raidTimerSeconds, swapCostSeconds,
 * reviveCostSeconds) — these mean the same thing on both tabs, so they carry
 * unchanged rather than reverting to the destination's own defaults.
 *
 * What does NOT carry, and lands on the Power-Up Optimizer's own
 * "nothing entered yet" resting state instead of a silently-invented number
 * (see TEAM_RAID_EXPORT_MISSING_NOTE, shown next to the export button):
 * stardustOnHand, rareCandyOnHand, rareCandyXlOnHand, and every slot's own
 * candyOnHand/xlCandyOnHand/isPurified/isLucky — Team Raid has no concept of
 * any of these. `mode` is always forced to "single-raid" (Team Raid always
 * models exactly one roster vs. one boss, never a multi-raid sweep), and
 * every multi-raid-only field is left at that mode's own inert default.
 * `rankBy` (a display-only sort choice, not carried by anything on Team
 * Raid) is left at the Power-Up Optimizer's own default ("stardust") rather
 * than treated as a "still needs filling in" gap — it is a normal,
 * always-has-a-value setting on the destination tab, not a resource this
 * mapping is short on.
 *
 * `showDetailedAssumptions` (Team Raid's own "More detailed assumptions"
 * display gate) has no equivalent on the Power-Up Optimizer at all — that
 * tab has no such gate — so there's nothing to map it onto.
 */
export function teamAssumptionsToPowerUpOptimizerAssumptions(team: TeamAssumptions): PowerUpOptimizerAssumptions {
  return {
    mode: "single-raid",
    slots: team.slots
      .slice(0, MAX_TEAM_RAID_SLOTS)
      .map((slot) => slotToPowerUpSlot(slot, team.level, team.ivAttack, team.ivDefense, team.ivStamina)),
    stardustOnHand: 0,
    rareCandyOnHand: 0,
    rareCandyXlOnHand: 0,
    targetId: team.targetId,
    bossFastMoveId: team.bossFastMoveId,
    bossChargedMoveId: team.bossChargedMoveId,
    dodge: team.dodge,
    dodgeFastAttacks: team.dodgeFastAttacks,
    holdChargedMoveUntilSafe: team.holdChargedMoveUntilSafe,
    weather: team.weather,
    bossChargedMoveFrequencySeconds: team.bossChargedMoveFrequencySeconds,
    bossChargedMoveCadence: team.bossChargedMoveCadence,
    bossStartsPrimed: team.bossStartsPrimed,
    bossStartingEnergyFraction: team.bossStartingEnergyFraction,
    raidTimerSeconds: team.raidTimerSeconds,
    swapCostSeconds: team.swapCostSeconds,
    reviveCostSeconds: team.reviveCostSeconds,
    // Destination-tab-only display setting — no Team Raid equivalent.
    rankBy: "stardust",
    // Multi-raid mode is entirely unused here (mode is always "single-raid"
    // above) — every field below is that mode's own inert default, same
    // values PowerUpOptimizerView.tsx's own DEFAULT_ASSUMPTIONS uses.
    multiRaidBossIds: [],
    multiRaidIncludePastRaids: false,
    multiRaidIncludedTiers: null,
    multiRaidMaxBossCount: 30,
    candyByFamilyId: {},
    multiRaidMegaLevel: null,
    multiRaidSignificanceMode: "aggregate-only",
    multiRaidUseBestAvailableMoveset: false,
    multiRaidHypotheticalCatches: [],
    // Destination-tab-only setting — Team Raid has no TM-inventory concept
    // at all, so there's nothing to map; unknown, same as a fresh page load.
    fastTmOnHand: null,
    chargedTmOnHand: null,
    eliteFastTmOnHand: null,
    eliteChargedTmOnHand: null,
  };
}
