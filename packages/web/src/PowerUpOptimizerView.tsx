import { useMemo, useState } from "react";
import {
  bossChargedMoveReadySeconds,
  bossEffectiveHp,
  buildTeamScenarioUrl,
  MAX_TEAM_RAID_SLOTS,
  type EliteTmCandidate,
  type EliteTmKind,
  type GatedEvolutionNotice,
  type PowerUpBudgetBlockedCandidate,
  type PowerUpBudgetResourceShortfall,
  type PowerUpBudgetStopReason,
  type PowerUpCandidate,
  type RosterBudgetBlockedCandidate,
  type RosterBudgetStep,
  type RosterEliteTmCandidate,
  type RosterHypotheticalCatchImpact,
  type RosterNeverCompetitiveEntry,
  type RosterPerBossImpact,
  type RosterPlannerProgressEvent,
  type RosterPowerUpCandidate,
  type RosterSecondChargedMoveCandidate,
  type RosterSignificanceMode,
  type SpeciesDefinition,
  type WeightedRaidTarget,
} from "@pogo-analyzer/engine";
import {
  emptyPowerUpSlot,
  PowerUpOptimizerAssumptionPanel,
  type PowerUpOptimizerAssumptions,
  type PowerUpSlotAssumption,
} from "./PowerUpOptimizerAssumptionPanel.js";
import { BOSS_CADENCE_HINT } from "./bossCadence.js";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { MEGA_LEVEL_HINT } from "./megaLevelSelect.js";
import {
  buildPowerUpOptimizerScenarioUrl,
  parsePowerUpOptimizerScenarioFromUrl,
  type PowerUpOptimizerScenario,
  type PowerUpRankBy,
} from "./powerUpOptimizerScenario.js";
import { effectiveIsShadow } from "./shadowToggle.js";
import { efficiencyForRankBy, sortCandidatesByEfficiency } from "./powerUpCandidateSort.js";
import { hydrateRosterPool, loadRosterPool, type RosterPool } from "./rosterPool.js";
import { useDebouncedValue } from "./useDebouncedValue.js";
import { getBaseUrl } from "./urlUtils.js";
import {
  candidatePickerOptions,
  powerUpCostsFetchedAt,
  raidTierForSpeciesId,
  resolveMegaBaseSpecies,
  speciesRegistry,
  targetPickerOptions,
  unmatchedActiveRaids,
} from "./registry.js";
import {
  runPowerUpOptimizerScenario,
  type EliteTmBlockedSlot,
  type PowerUpOptimizerRunResult,
  type SecondChargedMoveBlockedSlot,
  type SecondChargedMoveCandidateDisplay,
} from "./run/runPowerUpOptimizer.js";
import {
  effectiveMoveIds,
  resolveRosterPlannerInputs,
  type RosterBudgetPlanRunResult,
  type RosterPlannerBlockedReason,
  type RosterPlannerRunResult,
} from "./run/runRosterPlanner.js";
import { resolveRosterMoveChangeInputs, type RosterMoveChangeRunResult } from "./run/runRosterMoveChange.js";
import {
  runRosterBudgetOffMainThread,
  runRosterMoveChangeOffMainThread,
  runRosterPlannerOffMainThread,
} from "./rosterPlannerWorkerClient.js";
import { dedupeInterchangeableCandidates, type DedupedRosterCandidateGroup } from "./rosterCandidateDedupe.js";
import { movesetDefaultBadge, type MovesetDefaultBadgeInfo } from "./rosterMovesetBadge.js";
import { displacedSlotNote } from "./rosterDisplacedSlotNote.js";
import type { RosterEntry as ImportedRosterEntry } from "./import/pokeGenieMatch.js";
import { powerUpOptimizerAssumptionsToTeamAssumptions, POWER_UP_OPTIMIZER_EXPORT_MISSING_NOTE } from "./powerUpOptimizerExport.js";
import { assumptionsToTeamScenario } from "./TeamRaidView.js";

// A ready-to-run default roster/target so a fresh page load demonstrates real
// ranked results immediately, not an empty form — same precedent as every
// other tab's own DEFAULT_*. Reuses the Team Raid tab's exact default
// roster/boss/moves (see TeamRaidView.tsx's own DEFAULT_TEAM_ASSUMPTIONS doc
// comment for why this specific Fighting/Steel-counter roster vs. plain
// tyranitar replaced an earlier default that failed outright) so the two tabs
// never accidentally disagree about what a "typical" roster looks like, but
// at VARIED levels (unlike Team Raid's single shared level) since this tab's
// whole point is per-slot power-up headroom. Verified: 100% clear rate over
// 20 seeds, mean 111.5s of the 300s timer, baseline 32.5 team DPS against
// this 3600 HP boss — replaces an earlier default (vs. tyranitar-mega,
// 9000 HP) that failed outright (0% clear rate, 7.1 team DPS).
//
// This SINGLE-RAID default stays populated (2026-09-10 correction) — only
// the ROSTER TAB and this tab's own MULTI-RAID sweep ship empty before an
// import; the user's own words: "team raid can have a team. i meant empty
// the 7th tab and have pokemon optimizer sweep be empty before csv import."
const DEFAULT_TARGET_ID = "tyranitar";

function defaultSlot(
  speciesId: string,
  level: number,
  isMega: boolean,
  fastMoveId: string | null = null,
  chargedMoveId: string | null = null,
): PowerUpSlotAssumption {
  return {
    speciesId,
    fastMoveId,
    chargedMoveId,
    isMega,
    megaLevel: null,
    isShadow: false,
    isPurified: false,
    isLucky: false,
    level,
    ivAttack: 15,
    ivDefense: 15,
    ivStamina: 15,
    candyOnHand: 100,
    xlCandyOnHand: 0,
  };
}

export const DEFAULT_ASSUMPTIONS: PowerUpOptimizerAssumptions = {
  // "single-raid" is the ORIGINAL behavior and must stay the default so an
  // existing share link with no `mode` field (PLAN §4.1) decodes exactly as
  // it always has.
  mode: "single-raid",
  slots: [
    defaultSlot("lucario-mega", 35, true, "COUNTER_FAST", "CLOSE_COMBAT"),
    defaultSlot("machamp", 30, false, "COUNTER_FAST", "CLOSE_COMBAT"),
    defaultSlot("terrakion", 40, false, "DOUBLE_KICK_FAST", "CLOSE_COMBAT"),
    defaultSlot("excadrill", 38, false, "MUD_SLAP_FAST", "EARTHQUAKE"),
    defaultSlot("conkeldurr", 31, false, "COUNTER_FAST", "FOCUS_BLAST"),
    defaultSlot("heracross", 25, false, "COUNTER_FAST", "CLOSE_COMBAT"),
  ],
  stardustOnHand: 200000,
  // Modest, non-zero two-digit defaults so the fixed-budget plan's shared
  // pools are visible/exercised on a fresh page load rather than looking
  // inert at 0 — a raid-active player realistically keeps a stash of each.
  rareCandyOnHand: 20,
  rareCandyXlOnHand: 10,
  targetId: DEFAULT_TARGET_ID,
  bossFastMoveId: null,
  bossChargedMoveId: null,
  dodge: { kind: "perfect" },
  dodgeFastAttacks: false,
  holdChargedMoveUntilSafe: false,
  weather: "none",
  bossChargedMoveFrequencySeconds: 15,
  bossChargedMoveCadence: "fixed-interval",
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0.5,
  raidTimerSeconds: 300,
  swapCostSeconds: 0,
  // 15s per full-roster wipe (user decision 2026-09-08): a lobby revive-and-rejoin
  // is real raid-clock time in which nothing is dealt, and without it a bulkier
  // low-DPS slot surviving longer can LOWER team DPS by delaying the stronger
  // slots behind it (free replacement). Unlike the Team Raid tab this tab's
  // whole output is a ranking of survivability-vs-damage trade-offs, so a 0s
  // default would bias every candidate toward glass. Within the community's
  // ~12-15s estimate (see teamRaid.ts's reviveCostSeconds doc comment).
  reviveCostSeconds: 15,
  rankBy: "stardust",
  // Multi-raid mode fields — see BossSetPanel.tsx / multiRaidBossSet.ts. Left
  // empty/default here (rather than pre-resolved) since the whole POINT of
  // this mode is a whole imported roster this static default can't have;
  // PowerUpOptimizerAssumptionPanel's setMode auto-populates a real boss set
  // the first time the mode switch flips to "multi-raid".
  multiRaidBossIds: [],
  multiRaidIncludePastRaids: false,
  multiRaidIncludedTiers: null,
  multiRaidMaxBossCount: 30,
  candyByFamilyId: {},
  multiRaidMegaLevel: null,
  // The user's own chosen default (2026-09-10): rank strictly on the
  // weighted mean across the boss set, since the sort/efficiency columns
  // and the headline ranking are already mean-based — this closes the one
  // remaining place "best boss" alone could still admit a candidate. See
  // powerUpOptimizerScenario.ts's own field doc comment for why an ABSENT
  // decoded value deliberately does NOT fall back to this default.
  multiRaidSignificanceMode: "aggregate-only",
  // "What should I power up TONIGHT" (the honest reading of the Pokémon a
  // player actually has) is the tidy default for a fresh scenario — see
  // PowerUpOptimizerAssumptions.multiRaidUseBestAvailableMoveset.
  multiRaidUseBestAvailableMoveset: false,
  // Empty by default — a fresh page load has no idea what "a fresh catch" of
  // interest would even be. See PowerUpOptimizerAssumptions.multiRaidHypotheticalCatches.
  multiRaidHypotheticalCatches: [],
  // Unknown, not zero — see powerUpOptimizerScenario.ts's own field doc
  // comment. A fresh page load has no way to know a real player's TM
  // inventory, and second-charged-move/Elite TM candidates are still
  // computed and ranked either way (see run/runPowerUpOptimizer.ts).
  fastTmOnHand: null,
  chargedTmOnHand: null,
  eliteFastTmOnHand: null,
  eliteChargedTmOnHand: null,
};

export function assumptionsToScenario(a: PowerUpOptimizerAssumptions): PowerUpOptimizerScenario {
  return {
    mode: a.mode,
    slots: a.slots.map((s) => ({
      speciesId: s.speciesId,
      fastMoveId: s.fastMoveId,
      chargedMoveId: s.chargedMoveId,
      isMega: s.isMega,
      megaLevel: s.megaLevel,
      isShadow: s.isShadow,
      isPurified: s.isPurified,
      isLucky: s.isLucky,
      level: s.level,
      ivs: { attack: s.ivAttack, defense: s.ivDefense, stamina: s.ivStamina },
      candyOnHand: s.candyOnHand,
      xlCandyOnHand: s.xlCandyOnHand,
    })),
    stardustOnHand: a.stardustOnHand,
    rareCandyOnHand: a.rareCandyOnHand,
    rareCandyXlOnHand: a.rareCandyXlOnHand,
    target: a.targetId,
    bossFastMoveId: a.bossFastMoveId,
    bossChargedMoveId: a.bossChargedMoveId,
    dodgeModel: a.dodge,
    dodgeFastAttacks: a.dodgeFastAttacks,
    holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
    weather: a.weather,
    bossChargedMoveFrequencySeconds: a.bossChargedMoveFrequencySeconds,
    bossChargedMoveCadence: a.bossChargedMoveCadence,
    bossStartsPrimed: a.bossStartsPrimed,
    bossStartingEnergyFraction: a.bossStartingEnergyFraction,
    raidTimerSeconds: a.raidTimerSeconds,
    swapCostSeconds: a.swapCostSeconds,
    reviveCostSeconds: a.reviveCostSeconds,
    rankBy: a.rankBy,
    multiRaidBossIds: a.multiRaidBossIds,
    multiRaidIncludePastRaids: a.multiRaidIncludePastRaids,
    multiRaidIncludedTiers: a.multiRaidIncludedTiers,
    multiRaidMaxBossCount: a.multiRaidMaxBossCount,
    candyByFamilyId: a.candyByFamilyId,
    multiRaidMegaLevel: a.multiRaidMegaLevel,
    multiRaidSignificanceMode: a.multiRaidSignificanceMode,
    multiRaidUseBestAvailableMoveset: a.multiRaidUseBestAvailableMoveset,
    multiRaidHypotheticalCatches: a.multiRaidHypotheticalCatches,
    fastTmOnHand: a.fastTmOnHand,
    chargedTmOnHand: a.chargedTmOnHand,
    eliteFastTmOnHand: a.eliteFastTmOnHand,
    eliteChargedTmOnHand: a.eliteChargedTmOnHand,
  };
}

export function scenarioToAssumptions(s: PowerUpOptimizerScenario): PowerUpOptimizerAssumptions {
  const slots: PowerUpSlotAssumption[] = s.slots.map((slot) => ({
    speciesId: slot.speciesId ?? null,
    fastMoveId: slot.fastMoveId ?? null,
    chargedMoveId: slot.chargedMoveId ?? null,
    isMega: slot.isMega ?? false,
    // `??` guards a link encoded before this field existed rather than
    // surfacing `undefined` into the Mega Level <select>.
    megaLevel: slot.megaLevel ?? null,
    isShadow: slot.isShadow ?? false,
    isPurified: slot.isPurified ?? false,
    isLucky: slot.isLucky ?? false,
    level: slot.level ?? 20,
    // `??` guards a link encoded before ivs existed the same way the rest of
    // this function guards every other optional-feeling field — see
    // add-scenario-assumption's step 3.
    ivAttack: slot.ivs?.attack ?? 15,
    ivDefense: slot.ivs?.defense ?? 15,
    ivStamina: slot.ivs?.stamina ?? 15,
    candyOnHand: slot.candyOnHand ?? 0,
    xlCandyOnHand: slot.xlCandyOnHand ?? 0,
  }));
  // Defensive pad/truncate in case an older or hand-edited link has a
  // different slot count than MAX_TEAM_RAID_SLOTS — same convention as
  // TeamRaidView's teamScenarioToAssumptions.
  while (slots.length < MAX_TEAM_RAID_SLOTS) slots.push(emptyPowerUpSlot());
  return {
    // `??` guards a link built before multi-raid mode existed — see
    // powerUpOptimizerScenario.ts's own PowerUpOptimizerMode doc comment for
    // why "single-raid" (the ORIGINAL, byte-for-byte-unchanged behavior)
    // must be the fallback.
    mode: s.mode ?? "single-raid",
    slots: slots.slice(0, MAX_TEAM_RAID_SLOTS),
    stardustOnHand: s.stardustOnHand ?? DEFAULT_ASSUMPTIONS.stardustOnHand,
    rareCandyOnHand: s.rareCandyOnHand ?? DEFAULT_ASSUMPTIONS.rareCandyOnHand,
    rareCandyXlOnHand: s.rareCandyXlOnHand ?? DEFAULT_ASSUMPTIONS.rareCandyXlOnHand,
    targetId: s.target,
    bossFastMoveId: s.bossFastMoveId ?? null,
    bossChargedMoveId: s.bossChargedMoveId ?? null,
    dodge: s.dodgeModel,
    dodgeFastAttacks: s.dodgeFastAttacks ?? DEFAULT_ASSUMPTIONS.dodgeFastAttacks,
    holdChargedMoveUntilSafe: s.holdChargedMoveUntilSafe ?? DEFAULT_ASSUMPTIONS.holdChargedMoveUntilSafe,
    weather: s.weather ?? "none",
    bossChargedMoveFrequencySeconds: s.bossChargedMoveFrequencySeconds ?? DEFAULT_ASSUMPTIONS.bossChargedMoveFrequencySeconds,
    // `??` guards a link built before this field existed — see
    // bossCadence.tsx's BOSS_CADENCE_HINT for what the control itself explains.
    bossChargedMoveCadence: s.bossChargedMoveCadence ?? DEFAULT_ASSUMPTIONS.bossChargedMoveCadence,
    bossStartsPrimed: s.bossStartsPrimed ?? DEFAULT_ASSUMPTIONS.bossStartsPrimed,
    bossStartingEnergyFraction: s.bossStartingEnergyFraction ?? DEFAULT_ASSUMPTIONS.bossStartingEnergyFraction,
    raidTimerSeconds: s.raidTimerSeconds ?? DEFAULT_ASSUMPTIONS.raidTimerSeconds,
    swapCostSeconds: s.swapCostSeconds ?? 0,
    // Every link this tab has ever built carries this field explicitly, so the
    // fallback only ever applies to a hand-edited URL — and per the
    // add-scenario-assumption convention (and scenarioRoundtrip.test.ts) a
    // missing field decodes to DEFAULT_ASSUMPTIONS, i.e. 15s.
    reviveCostSeconds: s.reviveCostSeconds ?? DEFAULT_ASSUMPTIONS.reviveCostSeconds,
    rankBy: s.rankBy ?? "stardust",
    // `??` guards a link built before multi-raid mode existed — see
    // multiRaidBossIds' own doc comment in powerUpOptimizerScenario.ts for
    // why this is AUTHORITATIVE and never re-derived from the three filter
    // fields below.
    multiRaidBossIds: s.multiRaidBossIds ?? DEFAULT_ASSUMPTIONS.multiRaidBossIds,
    multiRaidIncludePastRaids: s.multiRaidIncludePastRaids ?? DEFAULT_ASSUMPTIONS.multiRaidIncludePastRaids,
    multiRaidIncludedTiers: s.multiRaidIncludedTiers ?? DEFAULT_ASSUMPTIONS.multiRaidIncludedTiers,
    multiRaidMaxBossCount: s.multiRaidMaxBossCount ?? DEFAULT_ASSUMPTIONS.multiRaidMaxBossCount,
    candyByFamilyId: s.candyByFamilyId ?? DEFAULT_ASSUMPTIONS.candyByFamilyId,
    // `??` guards a link built before this field existed rather than
    // surfacing `undefined` into the multi-raid Mega Level <select>.
    multiRaidMegaLevel: s.multiRaidMegaLevel ?? DEFAULT_ASSUMPTIONS.multiRaidMegaLevel,
    // Plain `??` default, same as every other field above — see this
    // field's own doc comment in powerUpOptimizerScenario.ts for why this no
    // longer inverts to "aggregate-or-per-boss".
    multiRaidSignificanceMode: s.multiRaidSignificanceMode ?? DEFAULT_ASSUMPTIONS.multiRaidSignificanceMode,
    multiRaidUseBestAvailableMoveset: s.multiRaidUseBestAvailableMoveset ?? DEFAULT_ASSUMPTIONS.multiRaidUseBestAvailableMoveset,
    multiRaidHypotheticalCatches: s.multiRaidHypotheticalCatches ?? DEFAULT_ASSUMPTIONS.multiRaidHypotheticalCatches,
    // `?? null` (not `?? DEFAULT_ASSUMPTIONS...`, though they're the same
    // value here) — an explicitly-shared `null` ("unknown") and an absent
    // field from an old link both mean the same thing for these fields, so
    // there's no old-link-vs-explicit-unknown distinction to preserve. See
    // powerUpOptimizerScenario.ts's own field doc comment.
    fastTmOnHand: s.fastTmOnHand ?? null,
    chargedTmOnHand: s.chargedTmOnHand ?? null,
    eliteFastTmOnHand: s.eliteFastTmOnHand ?? null,
    eliteChargedTmOnHand: s.eliteChargedTmOnHand ?? null,
  };
}

function resolveSpecies(id: string | null): SpeciesDefinition | null {
  return id && speciesRegistry.has(id) ? speciesRegistry.get(id) : null;
}

// clampHalfLevel/clampIv now live in run/runPowerUpOptimizer.ts, applied only
// at that module's own engine-call boundary — see its own doc comment.

/**
 * Enforces PowerUpSlotInput/runTeamRaid's own invariants BEFORE the engine
 * ever sees them, same "degrade a stale/hand-edited link instead of
 * throwing" precedent as TeamRaidView's normalizeTeamAssumptions — extended
 * here with a THIRD mutual exclusion (Shadow vs. Purified, see powerUp.ts's
 * powerUpStepCost, which throws if both are set) that Team Raid has no
 * equivalent of.
 */
export function normalizePowerUpAssumptions(a: PowerUpOptimizerAssumptions): PowerUpOptimizerAssumptions {
  let megaClaimed = false;
  const slots = a.slots.map((s) => {
    const species = resolveSpecies(s.speciesId);
    const hasBoost = !!species?.boost;
    let isMega = s.isMega;
    if (isMega) {
      if (!hasBoost || megaClaimed) isMega = false;
      else megaClaimed = true;
    }
    // Shadow and mega/primal boost are mutually exclusive (shadowAdjustedBaseStats
    // throws) — same rule as Team Raid's normalizeTeamAssumptions.
    const isShadow = hasBoost ? false : s.isShadow;
    // Shadow and Purified are mutually exclusive at the COST layer
    // (powerUpStepCost throws if both PowerUpCostModifiers flags are set) —
    // a species already effectively Shadow (either the toggle above or a
    // registry-pre-flagged "Shadow X" variant) forces Purified off.
    const isPurified = effectiveIsShadow(species, isShadow) ? false : s.isPurified;
    return { ...s, isMega, isShadow, isPurified };
  });
  return { ...a, slots };
}

function initialAssumptions(): PowerUpOptimizerAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parsePowerUpOptimizerScenarioFromUrl(window.location.href);
  return fromUrl ? normalizePowerUpAssumptions(scenarioToAssumptions(fromUrl)) : DEFAULT_ASSUMPTIONS;
}

function speciesLabel(s: SpeciesDefinition): string {
  return s.isHypothetical ? `${s.name} (hypothetical)` : s.name;
}

/**
 * A single row of the "Ranked power-up candidates" table, normalized from
 * EITHER a `PowerUpCandidate` (an ordinary power-up step) OR a
 * `SecondChargedMoveCandidateDisplay` (a second-charged-move unlock) — the
 * two draw on the SAME stardust/candy budget (PLAN_tm_move_change_optimizer.md's
 * own framing for why they belong in one ranked list), unlike an Elite TM
 * candidate, which spends a wholly separate, non-fungible item and gets its
 * own section below instead (never merged here — see CLAUDE.md's standing
 * decision against blending non-fungible resources into one score).
 */
interface RankedCandidateRow {
  key: string;
  kind: "power-up" | "second-charged-move";
  slotIndex: number;
  speciesName: string;
  /** "25 → 25.5" for a power-up, "—" for a second-charged-move unlock (no level change). */
  levelRange: string;
  /** null for a power-up (nothing to name); "2nd charged move: Icy Wind" for a move change. */
  change: string | null;
  deltaTeamDps: number;
  deltaExceedsNoise: boolean;
  deltaTeamDpsPer1000Stardust: number | null;
  deltaTeamDpsPerCandy: number | null;
  deltaTeamDpsPerXlCandy: number | null;
  cost: { stardust: number; candy: number; xlCandy: number };
  affordable: boolean;
  crossesFastBreakpoint: boolean;
  crossesChargedBreakpoint: boolean;
}

function powerUpCandidateToRow(c: PowerUpCandidate): RankedCandidateRow {
  return {
    key: `pu-${c.slotIndex}-${c.toLevel}`,
    kind: "power-up",
    slotIndex: c.slotIndex,
    speciesName: c.speciesName,
    levelRange: `${c.fromLevel} → ${c.toLevel}`,
    change: null,
    deltaTeamDps: c.deltaTeamDps,
    deltaExceedsNoise: c.deltaExceedsNoise,
    deltaTeamDpsPer1000Stardust: c.deltaTeamDpsPer1000Stardust,
    deltaTeamDpsPerCandy: c.deltaTeamDpsPerCandy,
    deltaTeamDpsPerXlCandy: c.deltaTeamDpsPerXlCandy,
    cost: c.cost,
    affordable: c.affordable,
    crossesFastBreakpoint: c.crossesFastBreakpoint,
    crossesChargedBreakpoint: c.crossesChargedBreakpoint,
  };
}

function secondChargedMoveCandidateToRow(c: SecondChargedMoveCandidateDisplay): RankedCandidateRow {
  return {
    key: `scm-${c.slotIndex}-${c.newChargedMoveId}`,
    kind: "second-charged-move",
    slotIndex: c.slotIndex,
    speciesName: c.speciesName,
    levelRange: "—",
    change: `2nd charged move: ${c.newChargedMoveName}`,
    deltaTeamDps: c.deltaTeamDps,
    deltaExceedsNoise: c.deltaExceedsNoise,
    deltaTeamDpsPer1000Stardust: c.deltaTeamDpsPer1000Stardust,
    deltaTeamDpsPerCandy: c.deltaTeamDpsPerCandy,
    // A second charged move is never paid in XL Candy — see toPowerUpResourceCost.
    deltaTeamDpsPerXlCandy: null,
    cost: { stardust: c.cost.stardust, candy: c.cost.candy, xlCandy: 0 },
    affordable: c.affordable,
    crossesFastBreakpoint: false,
    crossesChargedBreakpoint: false,
  };
}

function rankedRowEfficiency(row: RankedCandidateRow, rankBy: PowerUpRankBy): number | null {
  return efficiencyForRankBy(rankBy, row.deltaTeamDpsPer1000Stardust, row.deltaTeamDpsPerCandy, row.deltaTeamDpsPerXlCandy);
}

/** Same idea as candidateEfficiency above, for multi-raid's differently-named fields — see powerUpCandidateSort.ts's own doc comment on why the two shapes need separate call sites into the same shared resolver. */
function rosterCandidateEfficiency(c: RosterPowerUpCandidate, rankBy: PowerUpRankBy): number | null {
  return efficiencyForRankBy(rankBy, c.deltaPer1000Stardust, c.deltaPerCandy, c.deltaPerXlCandy);
}

function rankByLabel(rankBy: PowerUpRankBy): string {
  if (rankBy === "stardust") return "team-DPS gained per 1000 stardust";
  if (rankBy === "candy") return "team-DPS gained per candy";
  return "team-DPS gained per XL candy";
}

/** "10 yours + 2 Rare" / "10 yours" / "2 Rare" / "—" — the own-vs-shared split the engine reports per step, made visible rather than collapsed into one total. */
function formatResourceSplit(ownSpent: number, sharedSpent: number, sharedLabel: string): string {
  if (ownSpent === 0 && sharedSpent === 0) return "—";
  if (sharedSpent === 0) return `${ownSpent} yours`;
  if (ownSpent === 0) return `${sharedSpent} ${sharedLabel}`;
  return `${ownSpent} yours + ${sharedSpent} ${sharedLabel}`;
}

/**
 * "Why it stopped" in plain language — mirrors the ranked table's own
 * noise-floor caveat wording ("nothing else measurably beats the noise
 * floor") so the two sections read as one consistent voice, not two
 * differently-worded tools bolted together. Takes the two fields it actually
 * needs, not the whole plan object, so it's reusable for BOTH the single-raid
 * `PowerUpBudgetPlan` and the multi-raid `RosterBudgetPlan` — they share the
 * same `PowerUpBudgetStopReason` union and the same "noise floor" concept
 * even though everything else about the two plan shapes differs.
 */
function budgetStopReasonSentence(stopReason: PowerUpBudgetStopReason, noiseFloorTeamDps: number): string {
  switch (stopReason) {
    case "max-level-reached":
      return "Stopped because every fielded slot has already reached level 50 — there's no further power-up headroom left to spend on, regardless of budget.";
    case "budget-exhausted":
      return "Stopped because useful power-up headroom remains on at least one slot, but nothing left is affordable within the stardust/candy/XL you have on hand.";
    case "no-significant-candidate":
      return `You still have budget left because nothing else measurably beats the ±${noiseFloorTeamDps.toFixed(2)} team-DPS noise floor — the remaining stardust/candy is left unspent on purpose, not overlooked.`;
    case "round-cap-reached":
      return "Stopped only because the search hit its internal round-safety cap, before resolving naturally via budget or a real breakpoint — unusual for a normal roster/budget; treat this plan as a lower bound, not a definitive optimum.";
  }
}

/** "9,000 stardust" / "67 Candy" / "12 XL Candy" — one shortfall, plainly named, resource kept separate per CLAUDE.md's standing decision (never blended into one composite "% more budget" figure). */
function formatShortfall(s: PowerUpBudgetResourceShortfall): string {
  if (s.resource === "stardust") return `${s.shortfall.toLocaleString()} stardust`;
  if (s.resource === "candy") return `${s.shortfall.toLocaleString()} Candy`;
  return `${s.shortfall.toLocaleString()} XL Candy`;
}

/** "a" / "a and b" / "a, b, and c" — a plain English list, used so 2+ simultaneous shortfalls (the common real case: short on both stardust AND candy at once) read as a sentence, not a comma-splice. */
function joinWithAnd(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * The "blocked, not done" sentence — see PowerUpBudgetPlan.bestBlockedCandidate's
 * doc comment in packages/engine/src/powerUp.ts. Renders EVERY shortfall
 * (never just shortfalls[0]) since a real candidate is commonly short on more
 * than one resource at once. Exported (not local-only) so scripts/run-scenario.ts's
 * CLI headline uses this SAME sentence, not a re-derived one — CLI == UI by
 * construction, same reasoning as this file's other exported pure helpers.
 */
export function blockedCandidateSentence(blocked: PowerUpBudgetBlockedCandidate): string {
  const shortfallText = joinWithAnd(blocked.shortfalls.map(formatShortfall));
  return `Next real gain: ${blocked.speciesName} Lv${blocked.fromLevel} → Lv${blocked.toLevel}, +${blocked.deltaTeamDps.toFixed(2)} team DPS — you're short ${shortfallText}.`;
}

/**
 * Same "blocked, not done" sentence as `blockedCandidateSentence` above, for
 * `RosterBudgetBlockedCandidate` (the multi-raid/Phase-4 sibling) instead of
 * `PowerUpBudgetBlockedCandidate` — a SEPARATE function rather than a shared
 * one because the two types name their own delta field differently
 * (`meanDeltaTeamDps` here vs. `deltaTeamDps` there — the multi-raid type has
 * no single-boss "the" delta, only a weighted mean across the whole boss set,
 * see RosterBudgetBlockedCandidate's own doc comment). Exported for the same
 * CLI-reuse reason as `blockedCandidateSentence`.
 */
export function rosterBlockedCandidateSentence(blocked: RosterBudgetBlockedCandidate): string {
  const shortfallText = joinWithAnd(blocked.shortfalls.map(formatShortfall));
  return `Next real gain: ${blocked.speciesName} Lv${blocked.fromLevel} → Lv${blocked.toLevel}, +${blocked.meanDeltaTeamDps.toFixed(2)} mean team DPS — you're short ${shortfallText}.`;
}

const CANDIDATE_TABLE_INITIAL_ROWS = 30;
const MULTI_RAID_TABLE_INITIAL_ROWS = 30;

/**
 * One boss's real, computed effect of a candidate power-up (or budget-plan
 * step) — the expandable detail under each `MultiRaidCandidateRow` (Phase
 * 3b) AND each `MultiRaidBudgetStepRow` (Phase 4 — `RosterBudgetStep.perBoss`
 * is the SAME `RosterPerBossImpact[]` shape as `RosterPowerUpCandidate.perBoss`,
 * so this table takes the array directly rather than a full candidate,
 * letting both callers share it). Per CLAUDE.md's own headline thesis: the
 * interesting output is WHERE the ranking flips, not one collapsed number.
 * Sorted by |Δ team DPS| descending — the bosses this power-up actually
 * matters for, first.
 */
function MultiRaidPerBossTable({ perBoss, columnCount }: { perBoss: RosterPerBossImpact[]; columnCount: number }) {
  const sorted = useMemo(() => [...perBoss].sort((a, b) => Math.abs(b.deltaTeamDps) - Math.abs(a.deltaTeamDps)), [perBoss]);
  return (
    <tr>
      <td colSpan={columnCount} style={{ padding: "4px 0 10px" }}>
        <div className="table-scroll">
          <table className="time-series-table">
            <thead>
              <tr>
                <th>Boss</th>
                <th>Δ team DPS</th>
                <th>Rank before</th>
                <th>Rank after</th>
                <th>What changed</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.bossId}>
                  <td>{p.bossName}</td>
                  <td>
                    {p.simulated ? (
                      <>
                        {p.deltaTeamDps >= 0 ? "+" : ""}
                        {p.deltaTeamDps.toFixed(3)}
                      </>
                    ) : (
                      "0.000"
                    )}
                  </td>
                  <td>{p.rankBefore ?? "—"}</td>
                  <td>{p.rankAfter ?? "—"}</td>
                  <td>
                    {!p.simulated && (
                      <span className="species-picker-hint">
                        not fielded before or after — a real computed zero, this boss was never re-simulated
                      </span>
                    )}
                    {p.simulated && p.rankBefore === null && p.rankAfter !== null && (
                      <span className="badge badge-breakpoint">enters team</span>
                    )}
                    {p.simulated && p.rankBefore !== null && p.rankAfter === null && (
                      <span className="badge badge-approximate">drops from team</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

const MULTI_RAID_ROW_COLUMN_COUNT = 12;

/**
 * One row of the multi-raid ranked/benched candidate tables — shared so the
 * two tables (and their column meanings) stay in sync. Renders a DEDUPED
 * `group` (see rosterCandidateDedupe.ts), not a raw candidate — `group.count
 * > 1` means several interchangeable pool entries collapsed into this one
 * row, and either satisfies the recommendation equally (they're identical in
 * every way this planner's own math can see). Expandable via the species
 * name button to reveal the per-boss breakdown (MultiRaidPerBossTable),
 * collapsed by default so 30 rows doesn't become 30 tables on load.
 *
 * `identity` is not decoration: a real imported roster holds MANY entries of
 * the same species (the reference Poke Genie export has 4 Mewtwo, 12 Houndour
 * and 11 Inkay, and 27 species duplicated overall), so a row reading only
 * "Mewtwo 20 → 26.5" can appear twice with DIFFERENT deltas and leaves the
 * user unable to tell which of their four Mewtwo to actually power up. The
 * IV spread is what makes a recommendation actionable. Two entries that are
 * still identical after dedup ARE genuinely interchangeable, so either one
 * satisfies the recommendation — hence a count, not a list of which ones.
 *
 * `movesetBadge` is a web-only join, not something `group.representative`
 * itself carries — see rosterMovesetBadge.ts's own top doc comment for why
 * (the engine's `RosterPowerUpCandidate` has no import-time provenance at
 * all). When the deduped group has `count > 1`, this reads as true for its
 * REPRESENTATIVE pool entry specifically — the same "good enough for a
 * collapsed row" caveat `identity` above already accepts, since the dedup
 * key doesn't distinguish "explicitly matched this exact move" from
 * "defaulted to the exact same move" (both resolve to the same
 * fastMoveId/chargedMoveId).
 */
function MultiRaidCandidateRow({
  group,
  identity,
  movesetBadge,
}: {
  group: DedupedRosterCandidateGroup;
  identity?: string;
  movesetBadge?: MovesetDefaultBadgeInfo;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = group.representative;
  // "—" when this candidate isn't significant (aggregate OR per-boss — see
  // RosterPowerUpCandidate.exceedsNoise's own doc comment) or the resource
  // cost behind that column is 0 (deltaPerX is null) — same convention as
  // single-raid's deltaExceedsNoise-gated efficiency columns.
  const showEfficiency = c.exceedsNoise;
  return (
    <>
      <tr style={{ opacity: c.exceedsNoise ? 1 : 0.6 }}>
        <td>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title="Show the per-boss breakdown — where this power-up actually helps, not just the averaged headline number."
            style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
          >
            {expanded ? "▾" : "▸"} {c.speciesName}
          </button>
          {group.count > 1 && (
            <span className="species-picker-hint">
              {" "}
              ×{group.count} interchangeable entries
            </span>
          )}
          {identity && (
            <span className="caveats" style={{ display: "block", fontSize: "0.85em" }}>
              {identity}
            </span>
          )}
          {movesetBadge && (
            <span className="badge badge-approximate" title={movesetBadge.title}>
              {movesetBadge.label}
            </span>
          )}
          {c.costUnverified && (
            <span className="badge badge-approximate" title="This entry's candy family has no known candy-on-hand — ranked normally, but this cost can't be confirmed affordable.">
              candy unverified
            </span>
          )}
          {c.viaEvolution && (
            <div className="species-picker-hint" style={{ marginTop: 2 }}>
              via evolution from {c.viaEvolution.fromSpeciesName} (+{c.viaEvolution.evolutionCandyCost} candy, folded into
              the cost at left)
              {c.viaEvolution.otherGatedOptions && c.viaEvolution.otherGatedOptions.length > 0 && (
                <>
                  <div style={{ marginTop: 2 }}>Also possible from {c.viaEvolution.fromSpeciesName}, not priced by this tool:</div>
                  <GatedEvolutionList options={c.viaEvolution.otherGatedOptions} />
                </>
              )}
            </div>
          )}
        </td>
        <td>
          {c.fromLevel} → {c.toLevel}
        </td>
        <td>{c.cost.stardust.toLocaleString()}</td>
        <td>{c.cost.candy || "—"}</td>
        <td>{c.cost.xlCandy || "—"}</td>
        <td>
          {c.exceedsNoise ? (
            <>
              {c.meanDeltaTeamDps >= 0 ? "+" : ""}
              {c.meanDeltaTeamDps.toFixed(3)}
            </>
          ) : (
            "≈0 (no measurable change)"
          )}
        </td>
        <td>{!showEfficiency || c.deltaPer1000Stardust === null ? "—" : c.deltaPer1000Stardust.toFixed(3)}</td>
        <td>{!showEfficiency || c.deltaPerCandy === null ? "—" : c.deltaPerCandy.toFixed(3)}</td>
        <td>{!showEfficiency || c.deltaPerXlCandy === null ? "—" : c.deltaPerXlCandy.toFixed(3)}</td>
        <td>
          {c.bestBossDeltaTeamDps === null
            ? "—"
            : `${c.bestBossDeltaTeamDps >= 0 ? "+" : ""}${c.bestBossDeltaTeamDps.toFixed(3)} vs ${c.perBoss.find((p) => p.bossId === c.bestBossId)?.bossName ?? c.bestBossId}`}
        </td>
        <td>{c.significantBossCount}</td>
        <td>{c.bossesNewlyFielded.length}</td>
      </tr>
      {expanded && <MultiRaidPerBossTable perBoss={c.perBoss} columnCount={MULTI_RAID_ROW_COLUMN_COUNT} />}
    </>
  );
}

const MULTI_RAID_HYPOTHETICAL_CATCH_COLUMN_COUNT = 6;

/**
 * One row of the "hypothetical catches" table (IDEAS.md #3, "add a 7th") —
 * `RosterHypotheticalCatchImpact`, NOT a `RosterPowerUpCandidate`: no cost
 * columns at all (never priced — see `HypotheticalCatchCandidate`'s own doc
 * comment in rosterPlanner.ts), so this is its OWN row component rather than
 * a reuse of `MultiRaidCandidateRow` with blanked-out cost cells. Same
 * expandable-per-boss-breakdown convention via `MultiRaidPerBossTable`.
 */
function MultiRaidHypotheticalCatchRow({ impact }: { impact: RosterHypotheticalCatchImpact }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr style={{ opacity: impact.exceedsNoise ? 1 : 0.6 }}>
        <td>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title="Show the per-boss breakdown — where this hypothetical catch would actually help."
            style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
          >
            {expanded ? "▾" : "▸"} {impact.speciesName}
          </button>
        </td>
        <td>{impact.level}</td>
        <td>
          {impact.exceedsNoise ? (
            <>
              {impact.meanDeltaTeamDps >= 0 ? "+" : ""}
              {impact.meanDeltaTeamDps.toFixed(3)}
            </>
          ) : (
            "≈0 (no measurable change)"
          )}
        </td>
        <td>
          {impact.bestBossDeltaTeamDps === null
            ? "—"
            : `${impact.bestBossDeltaTeamDps >= 0 ? "+" : ""}${impact.bestBossDeltaTeamDps.toFixed(3)} vs ${impact.perBoss.find((p) => p.bossId === impact.bestBossId)?.bossName ?? impact.bestBossId}`}
        </td>
        <td>{impact.significantBossCount}</td>
        <td>{impact.bossesNewlyFielded.length}</td>
      </tr>
      {expanded && <MultiRaidPerBossTable perBoss={impact.perBoss} columnCount={MULTI_RAID_HYPOTHETICAL_CATCH_COLUMN_COUNT} />}
    </>
  );
}

/** One human-readable line per gated evolution branch — reused by both `EvolutionOptionsCell` (the "Never competitive" table) and `MultiRaidCandidateRow`'s "other options" note under a `viaEvolution` candidate. Never invents a requirement `GatedEvolutionNotice.requirementSummary` didn't already state (that string is built by the engine's own `describeEvolutionRequirement` — see rosterPlanner.ts). */
function GatedEvolutionList({ options }: { options: GatedEvolutionNotice[] }) {
  if (options.length === 0) return null;
  return (
    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
      {options.map((g) => (
        <li key={g.toSpeciesId} style={{ fontSize: "0.9em" }}>
          {g.toSpeciesName} — {g.requirementSummary}
        </li>
      ))}
    </ul>
  );
}

/**
 * Concretely SHOWS every evolution option this planner found for an
 * unevolved "never competitive" entry — CLAUDE.md's standing "an exclusion
 * gets shown, never quietly dropped" rule, applied to evolution branches the
 * same way `ExcludedEntriesTable` already applies it to the entry itself.
 * `evolutionRecommendation` (a real priced candy-only option this planner
 * found, information-only for the fixed-budget plan — see
 * RosterNeverCompetitiveEntry's own doc comment) and `gatedEvolutions`
 * (branches this engine can't price at all — an item, a lure, buddy
 * distance, gender, time-of-day, a quest) are BOTH rendered whenever
 * present, never one hiding the other — Eevee's Vaporeon (priceable) and
 * Espeon (gated on a 10km buddy + daytime + a quest) are both real options a
 * user considering this entry should see.
 */
function EvolutionOptionsCell({
  evolutionRecommendation,
  gatedEvolutions,
}: {
  evolutionRecommendation?: RosterNeverCompetitiveEntry["evolutionRecommendation"];
  gatedEvolutions?: GatedEvolutionNotice[];
}) {
  if (!evolutionRecommendation && (!gatedEvolutions || gatedEvolutions.length === 0)) return <>—</>;
  return (
    <>
      {evolutionRecommendation && (
        <div style={{ fontSize: "0.9em" }}>
          Candy-only: {evolutionRecommendation.toSpeciesName} ({evolutionRecommendation.evolutionCandyCost} candy) — est.{" "}
          {evolutionRecommendation.meanDeltaTeamDps >= 0 ? "+" : ""}
          {evolutionRecommendation.meanDeltaTeamDps.toFixed(3)} team DPS at L{evolutionRecommendation.toLevel}
        </div>
      )}
      {gatedEvolutions && gatedEvolutions.length > 0 && (
        <>
          <div className="species-picker-hint" style={{ marginTop: evolutionRecommendation ? 4 : 0 }}>
            Also possible, but not priced by this tool:
          </div>
          <GatedEvolutionList options={gatedEvolutions} />
        </>
      )}
    </>
  );
}

/**
 * A "not silently dropped" table for `RosterNeverCompetitiveEntry[]` —
 * shared by the ranked sweep's `neverCompetitive` (Phase 3b) AND the
 * fixed-budget plan's `excludedEntries` (Phase 4, same underlying type: an
 * unevolved species, or — budget-plan-only — an unresolved/unknown candy
 * family). Reused rather than duplicated so both surfaces render this
 * "excluded, here's why" list identically. Owns its own `showAll` state
 * (collapsed to `initialRows` by default) since two independent instances of
 * this component can be on screen at once with independently-sized lists.
 * Collapsed by default (a CollapsibleSection subsection, not the ranked
 * table above it) — this is a "not silently dropped, but not the headline"
 * list, and `sectionId` MUST differ per call site so two on-screen instances
 * don't share one fold-state key.
 */
function ExcludedEntriesTable({
  sectionId,
  heading,
  description,
  entries,
  entryMovesetBadges,
  initialRows = MULTI_RAID_TABLE_INITIAL_ROWS,
}: {
  sectionId: string;
  heading: string;
  description: string;
  entries: RosterNeverCompetitiveEntry[];
  /** entryId -> a "moveset had to be guessed" badge — see rosterMovesetBadge.ts. Optional so this shared table doesn't force every future caller to pass one. */
  entryMovesetBadges?: Map<string, MovesetDefaultBadgeInfo>;
  initialRows?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  if (entries.length === 0) return null;
  const visible = showAll ? entries : entries.slice(0, initialRows);
  return (
    <CollapsibleSection
      id={sectionId}
      heading={`${heading} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`}
      headingLevel="h3"
      defaultOpen={false}
      variant="subsection"
    >
      <p className="caveats" style={{ marginBottom: 12 }}>
        {description}
      </p>
      <div className="table-scroll">
        <table className="time-series-table">
          <thead>
            <tr>
              <th>Species</th>
              <th>Reason</th>
              <th>Evolution options</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e, i) => {
              const movesetBadge = entryMovesetBadges?.get(e.entryId);
              return (
                <tr key={`${e.entryId}-${i}`}>
                  <td>
                    {e.speciesName}
                    {movesetBadge && (
                      <span className="badge badge-approximate" title={movesetBadge.title}>
                        {movesetBadge.label}
                      </span>
                    )}
                  </td>
                  <td>{e.reason}</td>
                  <td>
                    <EvolutionOptionsCell evolutionRecommendation={e.evolutionRecommendation} gatedEvolutions={e.gatedEvolutions} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {entries.length > initialRows && (
        <button type="button" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? `Show top ${initialRows} only` : `Show all ${entries.length}`}
        </button>
      )}
    </CollapsibleSection>
  );
}

/**
 * The 9-column header row shared by MultiRaidResultsSection's two candidate
 * tables ("Ranked candidates" and "Benched but promising"). NOTE: the two
 * call sites were NOT actually identical before this extraction — "Ranked
 * candidates" carries a `title` tooltip on 4 of these columns and "Benched
 * but promising" doesn't. Preserved exactly per call site via `withTooltips`
 * rather than silently equalizing the two (that would be a real, if minor,
 * behavior change) — see this file's own extraction notes for why.
 */
function MultiRaidCandidateTableHead({ withTooltips }: { withTooltips: boolean }) {
  return (
    <thead>
      <tr>
        <th>Species</th>
        <th>Level</th>
        <th>Stardust</th>
        <th>Candy</th>
        <th>XL candy</th>
        <th title={withTooltips ? "Weighted mean across every swept boss" : undefined}>Mean Δ team DPS</th>
        <th title={withTooltips ? "Mean Δ team DPS per 1000 stardust spent — '—' when this candidate isn't significant or has no stardust cost. Kept separate from candy, never blended into one score." : undefined}>
          /1000 stardust
        </th>
        <th title={withTooltips ? "Regular candy only, never blended with stardust. '—' when this candidate isn't significant or has no regular-candy cost." : undefined}>
          /candy
        </th>
        <th title={withTooltips ? "'—' when this candidate isn't significant or has no XL candy cost." : undefined}>/XL candy</th>
        <th
          title={
            withTooltips
              ? "The single largest-magnitude per-boss effect — dilution by untouched bosses can otherwise hide a real single-boss gain"
              : undefined
          }
        >
          Best boss Δ
        </th>
        <th title={withTooltips ? "Bosses where this candidate's own effect clears THAT boss's own noise floor" : undefined}>
          Significant bosses
        </th>
        <th
          title={
            withTooltips ? "Bosses where this Pokémon was NOT on the baseline team but enters it after this power-up" : undefined
          }
        >
          Newly fielded
        </th>
      </tr>
    </thead>
  );
}

/**
 * A short, honest sentence for ONE `RosterPlannerProgressEvent` (IDEAS.md
 * #13) — never a fabricated percentage, and stages are named rather than
 * blended into one bar (see that type's own doc comment for why: a baseline
 * unit and a candidate-simulation unit cost wildly different amounts of real
 * work). `total` for the "rounds" stage is `maxRounds`, an upper bound the
 * search usually stops well short of — worded as "round N" rather than
 * "N / total" for that one stage so it doesn't read as stalled at, say,
 * "4 / 200".
 */
function rosterProgressSentence(event: RosterPlannerProgressEvent): string {
  switch (event.stage) {
    case "baseline":
      return `Establishing baseline teams: ${event.completed} / ${event.total} bosses${event.bossName ? ` (${event.bossName})` : ""}`;
    case "candidates":
      return `Simulating power-up candidates: ${event.completed} / ${event.total}`;
    case "hypotheticalCatches":
      return `Evaluating hypothetical catches: ${event.completed} / ${event.total}`;
    case "rounds":
      return `Building plan: round ${event.completed}${event.bossName ? ` (committed against ${event.bossName})` : ""}`;
    default:
      return "Working…";
  }
}

interface MultiRaidResultsSectionProps {
  hydratedPoolCount: number;
  /** entryId -> a short human identity (IV spread) for the ranked tables — see MultiRaidCandidateRow's `identity`. */
  entryIdentities: Map<string, string>;
  /** entryId -> a "moveset had to be guessed" badge, present only for entries whose fast and/or charged move was defaulted at import — see rosterMovesetBadge.ts. */
  entryMovesetBadges: Map<string, MovesetDefaultBadgeInfo>;
  /** The hydrated pool itself — needed (not just entryIdentities) so dedupeInterchangeableCandidates can compare full IV/moveset/cost-modifier identity, not just its display string. */
  pool: ImportedRosterEntry[];
  rosterDroppedCount: number;
  /** Count of hydrated entries that predate the moveset-badge fields — see rosterPool.ts's HydratedRosterPool.staleMovesetBadgeCount. */
  rosterStaleMovesetBadgeCount: number;
  bossCount: number;
  run: RosterPlannerRunResult | null;
  isRunning: boolean;
  isStale: boolean;
  /** null before any sweep has completed, or when the most recent one was blocked before an engine call was even attempted. */
  ranOn: "worker" | "main-thread-fallback" | null;
  elapsedMs: number;
  /** Most recent REAL progress event from this run, or null before one has arrived (or once the run finishes/is idle — see rosterProgressSentence). IDEAS.md #13. */
  progress: RosterPlannerProgressEvent | null;
  onRunSweep: () => void;
  /** Same selector single-raid mode already exposes — sorts the ranked table client-side by the chosen resource's efficiency, same as single-raid's own sortedCandidates (CLAUDE.md standing decision: never blended into one score). */
  rankBy: PowerUpRankBy;
  /** Which candidates QUALIFY for the ranked table below — see PowerUpOptimizerAssumptions.multiRaidSignificanceMode. Never changes what a visible row REPORTS (bestBossDeltaTeamDps/significantBossCount stay on every column either way). */
  significanceMode: RosterSignificanceMode;
}

/**
 * Multi-raid mode's results: a ranked candidate table (deduped —
 * rosterCandidateDedupe.ts — and expandable per row into its per-boss
 * breakdown), `benchedButPromising`/`neverCompetitive` surfaced as their own
 * tables (never silently dropped — see rosterPlanner.ts's own doc comment on
 * why those two are the answer to "would a benched Pokémon be better if
 * powered up"), and a clear reason whenever nothing was computed. Runs off
 * the main thread via rosterPlannerWorkerClient.ts (Phase 3b) — `ranOn`
 * reports which path actually executed, since a broken/unavailable worker
 * degrades to the same synchronous behavior this tab always had rather than
 * breaking the tab.
 */
function MultiRaidResultsSection({
  hydratedPoolCount,
  entryIdentities,
  entryMovesetBadges,
  pool,
  rosterDroppedCount,
  rosterStaleMovesetBadgeCount,
  bossCount,
  run,
  isRunning,
  isStale,
  ranOn,
  elapsedMs,
  progress,
  onRunSweep,
  rankBy,
  significanceMode,
}: MultiRaidResultsSectionProps) {
  const [showAllMultiRaidCandidates, setShowAllMultiRaidCandidates] = useState(false);

  // `run?.data?.X ?? []` is deliberately NOT pulled out into its own
  // `const` above these — a fresh `[]` on every render (whenever data is
  // null) would make useMemo's own dependency array change every render too
  // (react-hooks/exhaustive-deps). Depending on `run` itself instead is
  // stable across renders where nothing actually changed.
  const dedupedCandidates = useMemo(() => dedupeInterchangeableCandidates(run?.data?.candidates ?? [], pool), [run, pool]);
  // A candidate that only clears the noise floor against a SINGLE boss (not
  // the boss-set average) is FILTERED OUT of the ranked table entirely when
  // `significanceMode` is "aggregate-only" — never merely dimmed the way a
  // candidate insignificant under BOTH measures still is below. `exceedsNoise`
  // already reflects the CURRENT significanceMode (see rosterPlanner.ts's own
  // doc comment on RosterPowerUpCandidate.exceedsNoise), so a row only
  // qualifies as "hidden by this toggle" when it's per-boss significant
  // (`significantBossCount > 0`) yet still failed to clear `exceedsNoise` —
  // this is honestly derived from data every candidate already carries, not
  // a second engine run under the other mode.
  const hiddenBySignificanceMode = useMemo(
    () => dedupedCandidates.filter((g) => !g.representative.exceedsNoise && g.representative.significantBossCount > 0),
    [dedupedCandidates],
  );
  const qualifyingCandidates = useMemo(
    () => dedupedCandidates.filter((g) => g.representative.exceedsNoise || g.representative.significantBossCount === 0),
    [dedupedCandidates],
  );
  // Re-sorted client-side by the chosen rankBy — same "cheap, bound to the
  // LIVE selector" reasoning as single-raid's own sortedCandidates (kept in
  // sync via powerUpCandidateSort.ts's shared comparator, per CLAUDE.md's
  // standing decision that stardust/candy/XL efficiency are never blended
  // into one score). Sorted AFTER dedup, not before — dedupeInterchangeableCandidates
  // only needs a caller-preferred order to pick which member surfaces first
  // within a group, not to determine the final displayed order.
  const sortedCandidateGroups = useMemo(
    () =>
      sortCandidatesByEfficiency(qualifyingCandidates, (group) => ({
        delta: group.representative.meanDeltaTeamDps,
        isSignificant: group.representative.exceedsNoise,
        costStardust: group.representative.cost.stardust,
        efficiency: rosterCandidateEfficiency(group.representative, rankBy),
      })),
    [qualifyingCandidates, rankBy],
  );
  const visibleCandidateGroups = showAllMultiRaidCandidates
    ? sortedCandidateGroups
    : sortedCandidateGroups.slice(0, MULTI_RAID_TABLE_INITIAL_ROWS);

  const dedupedBenched = useMemo(() => dedupeInterchangeableCandidates(run?.data?.benchedButPromising ?? [], pool), [run, pool]);

  const neverCompetitive = run?.data?.neverCompetitive ?? [];

  return (
    <CollapsibleSection id="pu-multi-raid-sweep" heading="Multi-raid sweep" defaultOpen>
      <p className="caveats" style={{ marginBottom: 12 }}>
        Ranks every power-up across your WHOLE imported roster against the boss set above — including currently
        BENCHED Pokémon that would only earn a team spot if powered up first (see &ldquo;Benched but
        promising&rdquo; below). Runs off the main thread in a background Web Worker when one is available (falling
        back to computing right here, briefly freezing the tab, only if a worker genuinely can&rsquo;t be used).
      </p>
      <p className="caveats" style={{ marginBottom: 12 }}>
        The &ldquo;Mega Level&rdquo; setting above applies ROSTER-WIDE, not per entry — the imported roster runs to
        ~164 Pokémon, so a per-entry control would be unusable. It only ever affects an entry that can actually
        Mega Evolve; everything else in the pool is untouched by it.
      </p>

      <div className="result-row" style={{ alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button type="button" onClick={onRunSweep} disabled={isRunning || hydratedPoolCount === 0 || bossCount === 0}>
          {isRunning ? "Running sweep…" : run ? "Run sweep again" : "Run sweep"}
        </button>
        {isRunning && (
          <span className="species-picker-hint">
            {(elapsedMs / 1000).toFixed(1)}s elapsed{progress ? ` — ${rosterProgressSentence(progress)}` : ""}
          </span>
        )}
        {!isRunning && run && ranOn && (
          <span
            className="species-picker-hint"
            title={
              ranOn === "worker"
                ? "This sweep ran in a background Web Worker — the tab stayed responsive while it computed."
                : "The background worker couldn't be used (construction failed, or it errored before replying) — this sweep ran on the main thread instead, same as before this tab had a worker."
            }
          >
            {ranOn === "worker" ? "computed off the main thread" : "computed on the main thread (worker unavailable)"} in{" "}
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
        {isStale && run && !isRunning && (
          <span className="badge badge-pending" title="Settings or roster changed since this result was computed.">
            stale — click Run sweep again
          </span>
        )}
        {rosterDroppedCount > 0 && (
          <span className="caveats">
            {rosterDroppedCount} stored roster entr{rosterDroppedCount === 1 ? "y" : "ies"} reference a species this
            data layer no longer has.
          </span>
        )}
        {rosterStaleMovesetBadgeCount > 0 && (
          <span
            className="caveats"
            title="These rows carry no default-moveset signal at all yet, even where one would show today — not the same as a genuinely fully-resolved moveset. Re-import your Poke Genie CSV export to restore it."
          >
            {rosterStaleMovesetBadgeCount} roster entr{rosterStaleMovesetBadgeCount === 1 ? "y" : "ies"} imported
            before moveset badges existed — re-import your CSV to see &ldquo;default moveset&rdquo; flags below.
          </span>
        )}
      </div>

      {!run && !isRunning && (
        <p className="caveats">
          {hydratedPoolCount === 0 ? (
            <>
              No roster imported in this browser yet — import a Poke Genie CSV export (or hand-add Pokémon) on the{" "}
              <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a>, then come back and click &ldquo;Run
              sweep&rdquo;.
            </>
          ) : bossCount === 0 ? (
            "No bosses selected — pick at least one under “Boss set” above, then click “Run sweep”."
          ) : (
            "Click “Run sweep” to rank power-ups across this roster and boss set."
          )}
        </p>
      )}

      {run?.error && (
        <p className="error-text">Could not compute this sweep: {run.error}</p>
      )}

      {run?.blockedReason === "no-roster" && (
        <p className="caveats">
          No roster imported in this browser yet — this shared link carries every SETTING (boss set, budgets,
          dodge/weather/timer) but never the roster itself (see the note under &ldquo;Share this scenario&rdquo;).
          Import a Poke Genie CSV export (or hand-add Pokémon) on the{" "}
          <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a>, then come back and click &ldquo;Run sweep&rdquo;
          again.
        </p>
      )}

      {run?.blockedReason === "no-bosses" && (
        <p className="caveats">
          None of this scenario&rsquo;s boss ids resolved to a registered species — the boss set may have rotated
          out entirely since this link was built. Pick a boss set under &ldquo;Boss set&rdquo; above, then click
          &ldquo;Run sweep&rdquo; again.
        </p>
      )}

      {run?.data && (
        <>
          <div className="result-card" style={{ marginBottom: 12 }}>
            <dl>
              <dt>Bosses swept</dt>
              <dd>{run.targets.length}</dd>
              <dt>Baseline team DPS range</dt>
              <dd>
                {Math.min(...run.data.baselinePerBoss.map((b) => b.summary.teamDps)).toFixed(1)}
                {" – "}
                {Math.max(...run.data.baselinePerBoss.map((b) => b.summary.teamDps)).toFixed(1)}
              </dd>
              <dt title="Combined across bosses in quadrature — see rosterPlanner.ts's own doc comment for why raw teamDps can't be pooled across bosses of very different difficulty.">
                Aggregate noise floor
              </dt>
              <dd>±{run.data.noiseFloorTeamDps.toFixed(3)} team DPS ({run.data.iterations} seeds, {run.data.screenIterations} screen)</dd>
              <dt>Benched but promising</dt>
              <dd>{run.data.benchedButPromising.length}</dd>
              <dt title="Excluded from candidate generation entirely — an unevolved species, one with no affordable level, or one where no affordable level touches any boss's team. Never silently hidden.">
                Never competitive
              </dt>
              <dd>{run.data.neverCompetitive.length}</dd>
              <dt title="Significant against at least one boss, but not against the boss-set average — hidden from the ranked table below only because &quot;Also count a candidate that only helps against one boss…&quot; above is unchecked.">
                Hidden by significance mode
              </dt>
              <dd>
                {hiddenBySignificanceMode.length} candidate{hiddenBySignificanceMode.length === 1 ? "" : "s"} hidden:
                significant against one boss but not on average
                {significanceMode === "aggregate-only" && hiddenBySignificanceMode.length > 0
                  ? " — check the box above to reveal them"
                  : ""}
              </dd>
            </dl>
          </div>

          <h3>
            Ranked candidates
            <span className="species-picker-hint" style={{ marginLeft: 8 }}>
              grouped: measurable gains first (sorted by {rankByLabel(rankBy)}, descending), then within-noise rows
              (cheapest first), then measurable losses last (worst first)
            </span>
          </h3>
          <div className="table-scroll">
            <table className="time-series-table">
              <MultiRaidCandidateTableHead withTooltips />
              <tbody>
                {visibleCandidateGroups.map((group) => (
                  <MultiRaidCandidateRow
                    key={group.key}
                    group={group}
                    identity={entryIdentities.get(group.representative.entryId)}
                    movesetBadge={entryMovesetBadges.get(group.representative.entryId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {qualifyingCandidates.length > MULTI_RAID_TABLE_INITIAL_ROWS && (
            <button type="button" style={{ marginTop: 8 }} onClick={() => setShowAllMultiRaidCandidates((v) => !v)}>
              {showAllMultiRaidCandidates ? `Show top ${MULTI_RAID_TABLE_INITIAL_ROWS} only` : `Show all ${qualifyingCandidates.length}`}
            </button>
          )}

          {run.data.benchedButPromising.length > 0 && (
            <CollapsibleSection
              id="pu-multi-benched"
              heading={`Benched but promising — ${dedupedBenched.length} row${dedupedBenched.length === 1 ? "" : "s"}`}
              headingLevel="h3"
              defaultOpen={false}
              variant="subsection"
            >
              <p className="caveats" style={{ marginBottom: 12 }}>
                Not on any boss&rsquo;s baseline team today, but the cheapest power-up level that would earn one a
                spot — the headline &ldquo;would a benched Pokémon beat a fielded one if powered up&rdquo; question
                this mode exists to ask.
              </p>
              <div className="table-scroll">
                <table className="time-series-table">
                  <MultiRaidCandidateTableHead withTooltips={false} />
                  <tbody>
                    {dedupedBenched.map((group) => (
                      <MultiRaidCandidateRow
                        key={`bench-${group.key}`}
                        group={group}
                        identity={entryIdentities.get(group.representative.entryId)}
                        movesetBadge={entryMovesetBadges.get(group.representative.entryId)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}

          {run.data.hypotheticalCatches.length > 0 && (
            <CollapsibleSection
              id="pu-multi-hypothetical-catches"
              heading={`What if you caught a fresh one? — ${run.data.hypotheticalCatches.length} row${run.data.hypotheticalCatches.length === 1 ? "" : "s"}`}
              headingLevel="h3"
              defaultOpen
              variant="subsection"
            >
              <p className="caveats" style={{ marginBottom: 12 }}>
                Real species at a real raid-catch level, perfect 15/15/15 IVs, default moveset — never priced, never
                part of the fixed-budget plan (a fresh catch has no ledger cost). Purely "is this even worth
                fielding."
              </p>
              <div className="table-scroll">
                <table className="time-series-table">
                  <thead>
                    <tr>
                      <th>Species</th>
                      <th>Level</th>
                      <th title="Weighted mean across every swept boss">Mean Δ team DPS</th>
                      <th title="The single largest-magnitude per-boss effect">Best boss Δ</th>
                      <th title="Bosses where this catch's own effect clears THAT boss's own noise floor">Significant bosses</th>
                      <th title="Bosses where this catch would newly enter the team, displacing the lowest-ranked fielded entry">
                        Newly fielded
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.data.hypotheticalCatches.map((impact) => (
                      <MultiRaidHypotheticalCatchRow key={impact.id} impact={impact} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}

          <ExcludedEntriesTable
            sectionId="pu-multi-never-competitive"
            heading="Never competitive"
            description="Excluded from candidate generation entirely — reported, not hidden, so this sweep never silently ignores most of the roster. An unevolved species is excluded because evolution (candy only, no stardust) always buys strictly more team DPS per stardust afterward — power it up AFTER evolving."
            entries={neverCompetitive}
            entryMovesetBadges={entryMovesetBadges}
          />
        </>
      )}
    </CollapsibleSection>
  );
}

/**
 * True for an exclusion reason the Roster tab can actually FIX (an
 * unobserved moveset or an unconfirmed charged-move count — both blank-CSV-
 * column cases) — see `moveChangeEligibilityReason`/the `knownChargedMoveIds`
 * check in rosterMoveChange.ts, whose own reason strings this matches
 * against verbatim ("was not observed" / "COUNT is unknown"). Distinct from
 * every OTHER exclusion reason this sweep reports (fixed movepool at
 * capture, can't learn a second charged move without Shadow/Purified, buddy
 * distance unknown, current move can never be TM'd) — none of those are
 * fixable by editing the entry, so they get a plain list instead of the
 * "fill this in" call to action.
 */
function isUnknownMovesetExclusionReason(reason: string): boolean {
  return reason.includes("was not observed") || reason.includes("COUNT is unknown");
}

/**
 * One row of the multi-raid second-charged-move candidate table —
 * `RosterSecondChargedMoveCandidate`, NOT the single-raid tab's own
 * `SecondChargedMoveCandidateDisplay` (different shape: per-(entry, boss)
 * rather than per-slot, and `affordable`/`deltaPer1000Stardust`/
 * `deltaPerCandy` are already engine-computed here rather than derived by
 * the run module). Deliberately its OWN flat table, never merged into
 * `MultiRaidCandidateRow`'s ranked-power-up table — a second-charged-move
 * candidate has no `fromLevel`/`toLevel`/XL-candy cost, and per
 * CLAUDE.md's "TM candidates need their own axis" this sweep is already a
 * SEPARATE, later-stage computation (it needs `baselinePerBoss` from an
 * already-completed main sweep) rather than one more row type merged into
 * the same ranked list.
 */
function RosterSecondChargedMoveTable({
  candidates,
  entryNameById,
}: {
  candidates: RosterSecondChargedMoveCandidate[];
  entryNameById: Map<string, string>;
}) {
  const sorted = useMemo(() => [...candidates].sort((a, b) => b.deltaTeamDps - a.deltaTeamDps), [candidates]);
  if (sorted.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3>Second charged move candidates — {sorted.length}</h3>
      <div className="table-scroll">
        <table className="time-series-table">
          <thead>
            <tr>
              <th>Species</th>
              <th>Boss</th>
              <th title="fielded = already on the boss's team; benched = would newly join, displacing a fielded slot — see the note under each benched row.">
                Fielded?
              </th>
              <th>New charged move</th>
              <th>Stardust</th>
              <th>Candy</th>
              <th>Δ team DPS</th>
              <th title="Never blended with candy — CLAUDE.md's standing decision.">/1000 stardust</th>
              <th title="Regular candy only, never blended with stardust.">/candy</th>
              <th>Affordable now?</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const note = displacedSlotNote(c.fielded, c.displacedEntryId, c.displacedFieldedMega, entryNameById.get(c.displacedEntryId ?? ""));
              return (
                <tr key={`${c.entryId}-${c.bossId}-${c.newChargedMoveId}-${i}`} style={{ opacity: c.deltaExceedsNoise ? 1 : 0.6 }}>
                  <td>
                    {c.speciesName}
                    {c.costUnverified && (
                      <span
                        className="badge badge-approximate"
                        title="This entry's candy family has no known candy-on-hand — ranked normally, but this cost can't be confirmed affordable."
                      >
                        candy unverified
                      </span>
                    )}
                  </td>
                  <td>{c.bossName}</td>
                  <td>
                    {c.fielded ? "fielded" : "benched"}
                    {note && (
                      <span
                        className={note.isMegaConflict ? "badge badge-approximate" : "caveats"}
                        title={note.title}
                        style={note.isMegaConflict ? { display: "block", marginTop: 2, marginLeft: 0 } : { display: "block", fontSize: "0.85em" }}
                      >
                        {note.label}
                      </span>
                    )}
                  </td>
                  <td>{c.newChargedMoveName}</td>
                  <td>{c.cost.stardust.toLocaleString()}</td>
                  <td>{c.cost.candy || "—"}</td>
                  <td>
                    {c.deltaExceedsNoise ? (
                      <>
                        {c.deltaTeamDps >= 0 ? "+" : ""}
                        {c.deltaTeamDps.toFixed(3)}
                      </>
                    ) : (
                      "≈0 (no measurable change)"
                    )}
                  </td>
                  <td>{!c.deltaExceedsNoise || c.deltaPer1000Stardust === null ? "—" : c.deltaPer1000Stardust.toFixed(3)}</td>
                  <td>{!c.deltaExceedsNoise || c.deltaPerCandy === null ? "—" : c.deltaPerCandy.toFixed(3)}</td>
                  <td>{c.costUnverified ? "unverified" : c.affordable ? "✓" : "✗"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Same "your N Elite [Fast|Charged] TMs" framing as single-raid's own
 * `eliteTmHeading`, adapted for `RosterEliteTmCandidate`'s already-computed
 * per-candidate `affordable` (unlike single-raid's index-based "within
 * stock" marker — this sweep's `affordable` is a REAL engine-computed field,
 * see rosterMoveChange.ts's own `RosterEliteTmCandidate.affordable` doc
 * comment, so there's no separate index math to duplicate here).
 */
function rosterEliteTmHeading(kind: EliteTmKind, onHand: number | null, count: number): string {
  const label = kind === "fast" ? "Elite Fast TM" : "Elite Charged TM";
  if (count === 0) return `${label} candidates`;
  if (onHand === null) return `${label} candidates — unknown ${label} count, affordability not shown`;
  return `${label} candidates — your ${onHand} ${label}${onHand === 1 ? "" : "s"}`;
}

/** Multi-raid mode's Elite TM section — see rosterEliteTmHeading's own doc comment for how this differs from single-raid's EliteTmSection. */
function RosterEliteTmSection({
  kind,
  candidates,
  onHand,
  entryNameById,
}: {
  kind: EliteTmKind;
  candidates: RosterEliteTmCandidate[];
  onHand: number | null;
  entryNameById: Map<string, string>;
}) {
  const sorted = useMemo(() => [...candidates].sort((a, b) => b.deltaTeamDps - a.deltaTeamDps), [candidates]);
  if (sorted.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3>{rosterEliteTmHeading(kind, onHand, sorted.length)}</h3>
      <div className="table-scroll">
        <table className="time-series-table">
          <thead>
            <tr>
              <th>Species</th>
              <th>Boss</th>
              <th title="fielded = already on the boss's team; benched = would newly join, displacing a fielded slot — see the note under each benched row.">
                Fielded?
              </th>
              <th>Current move</th>
              <th>New move</th>
              <th>Δ team DPS</th>
              <th>Affordable now?</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const note = displacedSlotNote(c.fielded, c.displacedEntryId, c.displacedFieldedMega, entryNameById.get(c.displacedEntryId ?? ""));
              return (
                <tr key={`${c.entryId}-${c.bossId}-${c.newMoveId}-${i}`} style={{ opacity: c.deltaExceedsNoise ? 1 : 0.6 }}>
                  <td>{c.speciesName}</td>
                  <td>{c.bossName}</td>
                  <td>
                    {c.fielded ? "fielded" : "benched"}
                    {note && (
                      <span
                        className={note.isMegaConflict ? "badge badge-approximate" : "caveats"}
                        title={note.title}
                        style={note.isMegaConflict ? { display: "block", marginTop: 2, marginLeft: 0 } : { display: "block", fontSize: "0.85em" }}
                      >
                        {note.label}
                      </span>
                    )}
                  </td>
                  <td>{c.currentMoveName}</td>
                  <td>{c.newMoveName}</td>
                  <td>
                    {c.deltaExceedsNoise ? (
                      <>
                        {c.deltaTeamDps >= 0 ? "+" : ""}
                        {c.deltaTeamDps.toFixed(2)}
                      </>
                    ) : (
                      "≈0 (no measurable change)"
                    )}
                  </td>
                  <td>{onHand === null ? "unknown" : c.affordable ? "✓" : "✗"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface MultiRaidMoveChangeSectionProps {
  /** Whether a completed, non-stale main sweep exists at all — the move-change sweep needs its `baselinePerBoss`, so it can't run before that (see run/runRosterMoveChange.ts's own top doc comment). */
  canRun: boolean;
  run: RosterMoveChangeRunResult | null;
  isRunning: boolean;
  isStale: boolean;
  ranOn: "worker" | "main-thread-fallback" | null;
  elapsedMs: number;
  onRunSweep: () => void;
  eliteFastTmOnHand: number | null;
  eliteChargedTmOnHand: number | null;
  /** entryId -> species name, for the "which fielded slot did this benched candidate displace" note — see rosterDisplacedSlotNote.ts. */
  entryNameById: Map<string, string>;
}

/**
 * The multi-raid move-change sweep (PLAN_tm_move_change_optimizer.md's
 * "Both modes" section) — second-charged-move and Elite TM candidates across
 * the WHOLE pool x boss set, computed by `runRosterMoveChangeCandidates`
 * (run/runRosterMoveChange.ts) against the main sweep's ALREADY-COMPUTED
 * `baselinePerBoss`. A SEPARATE button/run from the main "Run sweep" above —
 * not auto-triggered, since it depends on that sweep's own output and would
 * otherwise silently re-run stale.
 */
function MultiRaidMoveChangeSection({
  canRun,
  run,
  isRunning,
  isStale,
  ranOn,
  elapsedMs,
  onRunSweep,
  eliteFastTmOnHand,
  eliteChargedTmOnHand,
  entryNameById,
}: MultiRaidMoveChangeSectionProps) {
  // Depending on `run` itself (not a fresh `run?.data?.excluded ?? []`
  // derived array) — a fresh `[]` on every render whenever data is null
  // would make these useMemo dependency arrays change every render too (see
  // MultiRaidResultsSection's own identical comment on dedupedCandidates).
  const unknownMovesetExcluded = useMemo(
    () => (run?.data?.excluded ?? []).filter((e) => isUnknownMovesetExclusionReason(e.reason)),
    [run],
  );
  const otherExcluded = useMemo(() => (run?.data?.excluded ?? []).filter((e) => !isUnknownMovesetExclusionReason(e.reason)), [run]);
  const [showAllOtherExcluded, setShowAllOtherExcluded] = useState(false);
  const visibleOtherExcluded = showAllOtherExcluded ? otherExcluded : otherExcluded.slice(0, MULTI_RAID_TABLE_INITIAL_ROWS);

  return (
    <CollapsibleSection id="pu-multi-move-change" heading="Move-change sweep (second charged move / Elite TM)" defaultOpen={false}>
      <p className="caveats" style={{ marginBottom: 12 }}>
        Unlocking a second charged move or replacing one with an Elite TM, across your WHOLE imported roster
        (including currently-benched Pokémon) against the boss set above — reuses the main sweep&rsquo;s ALREADY-
        COMPUTED baseline team per boss, so run &ldquo;Run sweep&rdquo; above first (and again after any change).
        Regular (non-Elite) TMs are never modeled here — the outcome is random and non-uniform-confirmed (see
        &ldquo;Known caveats&rdquo; below).
      </p>
      <div className="result-row" style={{ alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button type="button" onClick={onRunSweep} disabled={isRunning || !canRun}>
          {isRunning ? "Running move-change sweep…" : run ? "Run move-change sweep again" : "Run move-change sweep"}
        </button>
        {isRunning && <span className="species-picker-hint">{(elapsedMs / 1000).toFixed(1)}s elapsed</span>}
        {!isRunning && run && ranOn && (
          <span className="species-picker-hint">
            {ranOn === "worker" ? "computed off the main thread" : "computed on the main thread (worker unavailable)"} in{" "}
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
        {isStale && run && !isRunning && (
          <span className="badge badge-pending" title="The main sweep, roster, or settings changed since this result was computed.">
            stale — click Run move-change sweep again
          </span>
        )}
        {!canRun && !isRunning && (
          <span className="caveats">Run the main sweep above first — this needs its computed baseline team per boss.</span>
        )}
      </div>

      {run?.error && <p className="error-text">Could not compute this sweep: {run.error}</p>}
      {run?.blockedReason === "no-roster" && <p className="caveats">No roster imported in this browser yet.</p>}
      {run?.blockedReason === "no-bosses" && (
        <p className="caveats">No bosses resolved, or the main sweep&rsquo;s baseline is stale — run &ldquo;Run sweep&rdquo; above again first.</p>
      )}

      {run?.data && (
        <>
          <div className="result-card" style={{ marginBottom: 12 }}>
            <dl>
              <dt>Second charged move candidates</dt>
              <dd>{run.data.secondChargedMove.length}</dd>
              <dt>Elite TM candidates</dt>
              <dd>{run.data.eliteTm.length}</dd>
              <dt title="Real runTeamRaid calls this sweep made — a sanity-check figure, not a user setting.">Team-raid simulations run</dt>
              <dd>{run.data.teamRaidCallCount.toLocaleString()}</dd>
            </dl>
          </div>

          <RosterSecondChargedMoveTable candidates={run.data.secondChargedMove} entryNameById={entryNameById} />
          <RosterEliteTmSection
            kind="fast"
            candidates={run.data.eliteTm.filter((c) => c.kind === "fast")}
            onHand={eliteFastTmOnHand}
            entryNameById={entryNameById}
          />
          <RosterEliteTmSection
            kind="charged"
            candidates={run.data.eliteTm.filter((c) => c.kind === "charged")}
            onHand={eliteChargedTmOnHand}
            entryNameById={entryNameById}
          />

          {unknownMovesetExcluded.length > 0 && (
            <p className="caveats" style={{ marginBottom: 12 }}>
              {unknownMovesetExcluded.length} entr{unknownMovesetExcluded.length === 1 ? "y has an" : "ies have"} unknown
              or unconfirmed moveset{unknownMovesetExcluded.length === 1 ? "" : "s"} and can&rsquo;t be considered for a
              TM. Fill {unknownMovesetExcluded.length === 1 ? "it" : "them"} in on the{" "}
              <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a> to include {unknownMovesetExcluded.length === 1 ? "it" : "them"}.
            </p>
          )}

          {otherExcluded.length > 0 && (
            <CollapsibleSection
              id="pu-multi-move-change-excluded"
              heading={`Other excluded entries — ${otherExcluded.length}`}
              headingLevel="h3"
              defaultOpen={false}
              variant="subsection"
            >
              <p className="caveats" style={{ marginBottom: 12 }}>
                Excluded for a reason the Roster tab can&rsquo;t fix — a fixed movepool at capture, a move that can
                never be TM&rsquo;d, or a second charged move this species can&rsquo;t learn without Shadow/Purified.
              </p>
              <div className="table-scroll">
                <table className="time-series-table">
                  <thead>
                    <tr>
                      <th>Species</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOtherExcluded.map((e, i) => (
                      <tr key={`${e.entryId}-${i}`}>
                        <td>{e.speciesName}</td>
                        <td>{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {otherExcluded.length > MULTI_RAID_TABLE_INITIAL_ROWS && (
                <button type="button" style={{ marginTop: 8 }} onClick={() => setShowAllOtherExcluded((v) => !v)}>
                  {showAllOtherExcluded ? `Show top ${MULTI_RAID_TABLE_INITIAL_ROWS} only` : `Show all ${otherExcluded.length}`}
                </button>
              )}
            </CollapsibleSection>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}

const MULTI_RAID_BUDGET_STEP_COLUMN_COUNT = 10;

/**
 * One committed step of the multi-raid fixed-budget plan (Phase 4) —
 * expandable into its own per-boss breakdown via the SAME `MultiRaidPerBossTable`
 * `MultiRaidCandidateRow` uses (`RosterBudgetStep.perBoss` is the identical
 * `RosterPerBossImpact[]` shape as `RosterPowerUpCandidate.perBoss`). Unlike
 * the ranked sweep's rows, a step is never deduped — it's a specific, ordered
 * action the greedy search actually took, not an interchangeable candidate.
 *
 * Surfaces `clearsAggregateFloor` explicitly (task's own requirement — "make
 * it legible rather than hiding it"): `true` means this step's OWN marginal
 * gain, averaged across the WHOLE boss set, beat the round's aggregate noise
 * floor on its own; `false` means it was committed anyway because it was
 * individually significant on at least one boss (`significantBossCount > 0`)
 * even though the diluted aggregate mean didn't clear the bar by itself —
 * exactly the "where the ranking flips" thesis applied to a spend decision,
 * not just a read-only ranked row.
 */
function MultiRaidBudgetStepRow({
  step,
  identity,
  movesetBadge,
  index,
}: {
  step: RosterBudgetStep;
  identity?: string;
  movesetBadge?: MovesetDefaultBadgeInfo;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const bestBossName = step.bestBossId ? (step.perBoss.find((p) => p.bossId === step.bestBossId)?.bossName ?? step.bestBossId) : null;
  return (
    <>
      <tr>
        <td>{index + 1}</td>
        <td>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title="Show the per-boss breakdown behind this step's own numbers."
            style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
          >
            {expanded ? "▾" : "▸"} {step.speciesName}
          </button>
          {identity && (
            <span className="caveats" style={{ display: "block", fontSize: "0.85em" }}>
              {identity}
            </span>
          )}
          {movesetBadge && (
            <span className="badge badge-approximate" title={movesetBadge.title}>
              {movesetBadge.label}
            </span>
          )}
        </td>
        <td>
          {step.fromLevel} → {step.toLevel}
        </td>
        <td>{step.cost.stardust.toLocaleString()}</td>
        <td>{formatResourceSplit(step.ownCandySpent, step.sharedCandySpent, "Rare")}</td>
        <td>{formatResourceSplit(step.ownXlCandySpent, step.sharedXlCandySpent, "Rare XL")}</td>
        <td>
          {step.meanDeltaTeamDps >= 0 ? "+" : ""}
          {step.meanDeltaTeamDps.toFixed(3)}
        </td>
        <td>
          {step.bestBossDeltaTeamDps === null
            ? "—"
            : `${step.bestBossDeltaTeamDps >= 0 ? "+" : ""}${step.bestBossDeltaTeamDps.toFixed(3)} vs ${bestBossName}`}
        </td>
        <td>{step.significantBossCount}</td>
        <td
          title={
            step.clearsAggregateFloor
              ? `Cleared this round's own aggregate noise floor (±${step.noiseFloorTeamDps.toFixed(2)}) on its own weighted-mean delta.`
              : `Did NOT clear this round's aggregate noise floor (±${step.noiseFloorTeamDps.toFixed(2)}) — committed because it was individually significant on ${step.significantBossCount} boss(es), not because the averaged mean cleared the bar.`
          }
        >
          {step.clearsAggregateFloor ? "Aggregate" : "Per-boss only"}
        </td>
      </tr>
      {expanded && <MultiRaidPerBossTable perBoss={step.perBoss} columnCount={MULTI_RAID_BUDGET_STEP_COLUMN_COUNT} />}
    </>
  );
}

interface MultiRaidBudgetPlanSectionProps {
  /** entryId -> a short human identity (IV spread) — same map MultiRaidResultsSection's rows use, so a step naming "Mewtwo" is just as disambiguated as a ranked-table row. */
  entryIdentities: Map<string, string>;
  /** entryId -> a "moveset had to be guessed" badge — same map MultiRaidResultsSection's rows use, so a committed spend step carries the same provenance warning as the ranked table it's drawn from. */
  entryMovesetBadges: Map<string, MovesetDefaultBadgeInfo>;
  /** familyId -> a representative display label — same list PowerUpOptimizerAssumptionPanel's candy editor already builds, reused here so the ledger table names families the same way the editor that unlocks them does. */
  rosterFamilyOptions: { familyId: string; label: string }[];
  run: RosterBudgetPlanRunResult | null;
  isRunning: boolean;
  isStale: boolean;
  ranOn: "worker" | "main-thread-fallback" | null;
  elapsedMs: number;
  /** See MultiRaidResultsSectionProps.progress — the SAME real-progress convention, for this section's own (separate) engine call. */
  progress: RosterPlannerProgressEvent | null;
}

/**
 * The Phase 4 fixed-budget plan for multi-raid mode — a DIFFERENT question
 * from `MultiRaidResultsSection`'s ranked table above it (CLAUDE.md's
 * standing decision: the ranked table prices each candidate as if it were
 * the only purchase; this section is ONE joint allocation across the whole
 * budget). Deliberately has NO run button of its own — it's computed
 * together with the ranked sweep by that section's own "Run sweep" click
 * (see PowerUpOptimizerView's handleRunMultiRaidSweep), off the main thread
 * via the SAME worker file (`rosterPlanner.worker.ts`'s second, "plan",
 * request type) — so the two sections can never describe two different
 * (inputs, pool) snapshots.
 */
function MultiRaidBudgetPlanSection({
  entryIdentities,
  entryMovesetBadges,
  rosterFamilyOptions,
  run,
  isRunning,
  isStale,
  ranOn,
  elapsedMs,
  progress,
}: MultiRaidBudgetPlanSectionProps) {
  const familyLabel = (familyId: string) => rosterFamilyOptions.find((f) => f.familyId === familyId)?.label ?? familyId;

  return (
    <CollapsibleSection id="pu-multi-budget-plan" heading="Fixed-budget plan" defaultOpen>
      <p className="caveats" style={{ marginBottom: 12 }}>
        A DIFFERENT question than the ranked sweep above: given your WHOLE stardust/candy/Rare
        Candy budget across the ENTIRE roster at once — not one candidate priced alone, which is
        what the ranked table above answers — what SET of power-ups should you actually make? A
        greedy, step-by-step search: a step is only committed once its own marginal team-DPS gain
        measurably clears EITHER the round's aggregate noise floor across the whole boss set, OR
        its own noise floor on at least one individual boss (see each step&rsquo;s
        &ldquo;Acceptance test&rdquo; column below for which one applied — that distinction is the
        whole point of the rule, not an implementation detail). Computed together with the ranked
        sweep above, by that same &ldquo;Run sweep&rdquo; click, off the main thread.
      </p>

      {isRunning && (
        <p className="species-picker-hint">
          {(elapsedMs / 1000).toFixed(1)}s elapsed{progress ? ` — ${rosterProgressSentence(progress)}` : ""}
        </p>
      )}
      {!isRunning && run && ranOn && (
        <p
          className="species-picker-hint"
          title={
            ranOn === "worker"
              ? "This plan ran in a background Web Worker — the tab stayed responsive while it computed."
              : "The background worker couldn't be used — this plan ran on the main thread instead."
          }
        >
          {ranOn === "worker" ? "computed off the main thread" : "computed on the main thread (worker unavailable)"} in{" "}
          {(elapsedMs / 1000).toFixed(1)}s
        </p>
      )}
      {isStale && run && !isRunning && (
        <p>
          <span className="badge badge-pending" title="Settings or roster changed since this result was computed.">
            stale — click Run sweep again above
          </span>
        </p>
      )}

      {!run && !isRunning && (
        <p className="caveats">Click &ldquo;Run sweep&rdquo; above to compute a joint budget plan alongside the ranked candidates.</p>
      )}

      {run?.error && <p className="error-text">Could not compute this plan: {run.error}</p>}

      {run?.blockedReason === "no-roster" && (
        <p className="caveats">
          No roster imported in this browser yet — see the ranked sweep section above (this link carries every
          SETTING but never the roster itself).
        </p>
      )}

      {run?.blockedReason === "no-bosses" && (
        <p className="caveats">No bosses resolved for this plan either — see the ranked sweep section above.</p>
      )}

      {run?.data && (
        <>
          {run.data.bestBlockedCandidate ? (
            <div className="blocked-gain-callout">
              <strong>Blocked, not done</strong>
              {rosterBlockedCandidateSentence(run.data.bestBlockedCandidate)} This plan stopped here because that
              upgrade isn&rsquo;t affordable yet — not because it wouldn&rsquo;t help.
            </div>
          ) : (
            <div className="blocked-gain-callout">
              <strong>Nothing further measurably helps</strong>
              Beyond the steps below, no further useful power-up anywhere on this roster clears the ±
              {run.data.noiseFloorTeamDps.toFixed(2)} team-DPS noise floor against this boss set and budget — this
              plan is genuinely done, not just out of money.
            </div>
          )}

          <div className="result-card" style={{ marginBottom: 12 }}>
            <dl>
              <dt>Steps committed</dt>
              <dd>{run.data.steps.length}</dd>
              <dt title="Combined across bosses in quadrature, same as the ranked sweep's own aggregate noise floor — see rosterPlanner.ts's own doc comment.">
                Final aggregate noise floor
              </dt>
              <dd>
                ±{run.data.noiseFloorTeamDps.toFixed(3)} team DPS ({run.data.iterations} seeds, {run.data.screenIterations} screen)
              </dd>
              <dt>Stardust</dt>
              <dd>
                {run.data.ledger.stardust.spent.toLocaleString()} spent ({run.data.ledger.stardust.remaining.toLocaleString()} left)
              </dd>
              <dt>Shared Rare Candy</dt>
              <dd>
                {run.data.ledger.sharedRareCandy.spent} spent ({run.data.ledger.sharedRareCandy.remaining} left)
              </dd>
              <dt>Shared Rare Candy XL</dt>
              <dd>
                {run.data.ledger.sharedRareCandyXl.spent} spent ({run.data.ledger.sharedRareCandyXl.remaining} left)
              </dd>
            </dl>
          </div>

          <h3>Steps</h3>
          {run.data.steps.length > 0 ? (
            <div className="table-scroll">
              <table className="time-series-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Species</th>
                    <th>Level</th>
                    <th>Stardust</th>
                    <th>Candy</th>
                    <th>XL candy</th>
                    <th title="Weighted mean across every swept boss">Mean Δ team DPS</th>
                    <th title="The single largest-magnitude per-boss effect this step produced">Best boss Δ</th>
                    <th title="Bosses where this step's own effect clears THAT boss's own noise floor">Significant bosses</th>
                    <th title="Which of the two acceptance tests this step actually cleared — aggregate mean, or per-boss significance alone">
                      Acceptance test
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {run.data.steps.map((step, i) => (
                    <MultiRaidBudgetStepRow
                      key={`${step.entryId}-${step.toLevel}-${i}`}
                      step={step}
                      identity={entryIdentities.get(step.entryId)}
                      movesetBadge={entryMovesetBadges.get(step.entryId)}
                      index={i}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="caveats" style={{ color: "var(--text)" }}>
              No power-up was added to this plan.
            </p>
          )}

          <p className="caveats" style={{ marginTop: 12, color: "var(--text)" }}>
            {budgetStopReasonSentence(run.data.stopReason, run.data.noiseFloorTeamDps)}
          </p>

          <h3 style={{ marginTop: 16 }}>Candy ledger, per family</h3>
          <p className="caveats" style={{ marginBottom: 12 }}>
            Never a single blended candy total — spent/remaining tracked separately per candy FAMILY (never per
            species), plus the two shared, account-wide Rare Candy pools above. Only families with a KNOWN starting
            pool (filled in above) and at least one eligible entry drawing on them appear here — an unknown family's
            entries are reported below instead, never silently treated as free.
          </p>
          {Object.keys(run.data.ledger.candyByFamilyId).length === 0 ? (
            <p className="species-picker-hint">No candy family both had a known on-hand pool and was drawn on by this plan.</p>
          ) : (
            <div className="table-scroll">
              <table className="time-series-table">
                <thead>
                  <tr>
                    <th>Family (example species)</th>
                    <th>Candy spent (remaining)</th>
                    <th>XL candy spent (remaining)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(run.data.ledger.candyByFamilyId).map(([familyId, entry]) => (
                    <tr key={familyId}>
                      <td>{familyLabel(familyId)}</td>
                      <td>
                        {entry.candy.spent} spent ({entry.candy.remaining} left)
                      </td>
                      <td>
                        {entry.xlCandy.spent} spent ({entry.xlCandy.remaining} left)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ExcludedEntriesTable
            sectionId="pu-multi-budget-excluded"
            heading="Excluded from this plan"
            description="Never silently dropped: an unevolved species (evolve first, same reasoning as the ranked sweep's own 'never competitive' list) or an entry whose resolved candy family has no known on-hand pool yet — fill it in in the candy editor above to unlock that species for this plan (it can still be RANKED in the sweep above, just not planned against here)."
            entries={run.data.excludedEntries}
            entryMovesetBadges={entryMovesetBadges}
          />
        </>
      )}
    </CollapsibleSection>
  );
}

/** Shared shape of both multi-raid engine calls' final result — structurally identical to RosterPlannerRunResult (TData = RosterPlanResult) and RosterBudgetPlanRunResult (TData = RosterBudgetPlan), see runMultiRaidTrackedComputation below. */
interface MultiRaidTrackedResult<TData> {
  targets: WeightedRaidTarget[];
  data: TData | null;
  blockedReason: RosterPlannerBlockedReason | null;
  error: string | null;
}

/**
 * Shared timer/promise-tracking plumbing for ONE multi-raid engine call
 * (either the ranked sweep or the Phase 4 fixed-budget plan) — both are
 * separate Web Worker round trips (rosterPlannerWorkerClient.ts's two
 * functions) kicked off TOGETHER by the SAME "Run sweep" click
 * (handleRunMultiRaidSweep below), each tracked through its OWN
 * running/elapsed/result state since the two calls finish at different times
 * (the budget plan measured 1.7-2.5s vs. the sweep's ~1s on a real
 * 164-entry/13-boss roster — see this feature's own task description), but
 * always judged against the exact same `resolution` (targets + blockedReason
 * + inputs) the caller resolved ONCE and handed to both, so the two result
 * sections can never describe two different (inputs, pool) snapshots. Not a
 * React hook — called directly from the click handler, which is why timer
 * state is threaded through explicit setState callbacks rather than
 * useEffect/useState internally (same reasoning the pre-Phase-4 single-call
 * version of this logic already used).
 *
 * `resolution` is typed as the narrow subset this function actually reads
 * (`targets`/`blockedReason` only — `inputs` is read by the CALLER, inside
 * its own `offMainThread` closure, never by this function directly) rather
 * than the full `RosterPlannerResolution` shape, so the SAME helper also
 * serves `RosterMoveChangeResolution` (run/runRosterMoveChange.ts) below —
 * structurally identical on these two fields despite a different `inputs`
 * type.
 */
function runMultiRaidTrackedComputation<TData>(
  resolution: { targets: WeightedRaidTarget[]; blockedReason: RosterPlannerBlockedReason | null },
  offMainThread: () => Promise<{ data: TData; ranOn: "worker" | "main-thread-fallback" }>,
  setIsRunning: (v: boolean) => void,
  setElapsedMs: (v: number) => void,
  onFinish: (result: MultiRaidTrackedResult<TData>, ranOn: "worker" | "main-thread-fallback" | null) => void,
  /** Reset to null at the start of this run — see MultiRaidResultsSectionProps.progress (IDEAS.md #13). The LAST real event is left in place after finish (the component only renders it while isRunning is true), never cleared to hide it prematurely. */
  setProgress?: (v: RosterPlannerProgressEvent | null) => void,
): void {
  setIsRunning(true);
  setProgress?.(null);
  const startedAt = performance.now();
  setElapsedMs(0);
  const tick = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 200);

  function finish(result: MultiRaidTrackedResult<TData>, ranOn: "worker" | "main-thread-fallback" | null) {
    window.clearInterval(tick);
    setElapsedMs(performance.now() - startedAt);
    onFinish(result, ranOn);
    setIsRunning(false);
  }

  if (resolution.blockedReason) {
    finish({ targets: resolution.targets, data: null, blockedReason: resolution.blockedReason, error: null }, null);
    return;
  }

  offMainThread()
    .then((outcome) => finish({ targets: resolution.targets, data: outcome.data, blockedReason: null, error: null }, outcome.ranOn))
    .catch((err: unknown) =>
      finish({ targets: resolution.targets, data: null, blockedReason: null, error: err instanceof Error ? err.message : String(err) }, null),
    );
}

interface SingleRaidBudgetPlanSectionProps {
  plan: NonNullable<PowerUpOptimizerRunResult["plan"]>;
  slotSpecies: (SpeciesDefinition | null)[];
}

/**
 * Single-raid mode's fixed-budget power-up plan — extracted verbatim from
 * what used to render inline in PowerUpOptimizerView's own JSX (no behavior
 * change), mirroring how MultiRaidBudgetPlanSection is its own component
 * alongside MultiRaidResultsSection. Rendered by SingleRaidResultsSection at
 * the EXACT position it always occupied (between "Recommendation" and
 * "Ranked power-up candidates") rather than hoisted to a trailing sibling
 * section the way multi-raid's budget plan is — unlike multi-raid, this
 * plan has always appeared inline between those two, and moving it after
 * the ranked table would be a real, if small, ordering change.
 */
function SingleRaidBudgetPlanSection({ plan, slotSpecies }: SingleRaidBudgetPlanSectionProps) {
  return (
    <CollapsibleSection id="pu-single-budget-plan" heading="Fixed-budget power-up plan" defaultOpen>
      <p className="caveats" style={{ marginBottom: 12 }}>
        A DIFFERENT question than the ranked table below: given your WHOLE stardust/Rare
        Candy/Rare Candy XL budget across every fielded slot at once (not one candidate at
        a time), what SET of power-ups should you make? A greedy multi-slot search — a
        step is only committed once its own marginal team-DPS gain measurably beats the
        noise floor. That floor is re-measured from the roster's own seed-to-seed variance
        after every committed step rather than fixed once at the start, because powering a
        roster up changes how much it varies run to run — so steps within one plan can be
        held to different bars, and each step below shows the one it actually had to clear.
        The ±{plan.noiseFloorTeamDps.toFixed(2)} quoted elsewhere in this section is
        the FINAL floor, in effect when the search stopped.
      </p>

      {plan.bestBlockedCandidate ? (
        <div className="blocked-gain-callout">
          <strong>Blocked, not done</strong>
          {blockedCandidateSentence(plan.bestBlockedCandidate)} This plan stopped
          here because that upgrade isn't affordable yet — not because it wouldn't help.
        </div>
      ) : (
        <div className="blocked-gain-callout">
          <strong>Nothing further measurably helps</strong>
          Beyond the steps below, no further useful power-up anywhere on this roster clears
          the ±{plan.noiseFloorTeamDps.toFixed(2)} team-DPS noise floor against this
          boss and budget — this plan is genuinely done, not just out of money.
        </div>
      )}

      <div className="result-card">
        <dl>
          <dt>Baseline team DPS (roster as-is)</dt>
          <dd>{plan.baseline.teamDps.toFixed(2)}</dd>
          <dt>Final team DPS (after this plan)</dt>
          <dd>{plan.final.teamDps.toFixed(2)}</dd>
          <dt>Change</dt>
          <dd>
            {plan.final.teamDps >= plan.baseline.teamDps ? "+" : ""}
            {(plan.final.teamDps - plan.baseline.teamDps).toFixed(2)} team DPS
            {plan.baseline.teamDps > 0 &&
              ` (${(((plan.final.teamDps - plan.baseline.teamDps) / plan.baseline.teamDps) * 100).toFixed(1)}% over baseline)`}
          </dd>
          <dt title="Fraction of simulated runs that clear the boss within the raid timer, BEFORE this plan">Baseline clear rate</dt>
          <dd>{(plan.baseline.clearRate * 100).toFixed(0)}%</dd>
          <dt title="Fraction of simulated runs that clear the boss within the raid timer, AFTER committing every step below — the question this plan's stardust/candy spend actually answers, not just its DPS gain">
            Clear rate after this plan
          </dt>
          <dd>
            {(plan.final.clearRate * 100).toFixed(0)}%
            {plan.final.clearRate === 0 && " — still doesn't clear"}
            {plan.final.meanTimeToClearSeconds !== null && ` (avg ${plan.final.meanTimeToClearSeconds.toFixed(1)}s to clear)`}
          </dd>
          <dt>Stardust spent</dt>
          <dd>
            {plan.ledger.stardust.spent.toLocaleString()} ({plan.ledger.stardust.remaining.toLocaleString()}{" "}
            left)
          </dd>
          <dt>Shared Rare Candy spent</dt>
          <dd>
            {plan.ledger.sharedRareCandy.spent} ({plan.ledger.sharedRareCandy.remaining} left)
          </dd>
          <dt>Shared Rare Candy XL spent</dt>
          <dd>
            {plan.ledger.sharedRareCandyXl.spent} ({plan.ledger.sharedRareCandyXl.remaining} left)
          </dd>
        </dl>
      </div>

      {plan.steps.length > 0 ? (
        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table className="time-series-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Slot</th>
                <th>Species</th>
                <th>Level</th>
                <th>Stardust</th>
                <th>Candy</th>
                <th>XL candy</th>
                <th>Δ team DPS</th>
                <th>Noise floor cleared</th>
                <th>Team DPS after</th>
              </tr>
            </thead>
            <tbody>
              {plan.steps.map((step, i) => (
                <tr key={`${step.slotIndex}-${step.toLevel}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{step.slotIndex + 1}</td>
                  <td>{step.speciesName}</td>
                  <td>
                    {step.fromLevel} → {step.toLevel}
                  </td>
                  <td>{step.cost.stardust.toLocaleString()}</td>
                  <td>{formatResourceSplit(step.ownCandySpent, step.sharedCandySpent, "Rare")}</td>
                  <td>{formatResourceSplit(step.ownXlCandySpent, step.sharedXlCandySpent, "Rare XL")}</td>
                  <td>
                    +{step.deltaTeamDps.toFixed(2)}
                  </td>
                  {/* The floor in effect for THIS step's round, not the plan's final
                      one — re-measured from the roster's variance after every commit,
                      so it legitimately differs down the table. */}
                  <td title="The noise floor this step had to beat, measured from the roster as it stood at that point in the plan">
                    ±{step.noiseFloorTeamDps.toFixed(2)}
                  </td>
                  <td>{step.cumulativeTeamDps.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="caveats" style={{ marginTop: 12, color: "var(--text)" }}>
          No power-up was added to this plan.
        </p>
      )}

      <p className="caveats" style={{ marginTop: 12, color: "var(--text)" }}>
        {budgetStopReasonSentence(plan.stopReason, plan.noiseFloorTeamDps)}
      </p>

      <h3 style={{ marginTop: 16 }}>What's left, per slot</h3>
      <div className="result-row" style={{ flexWrap: "wrap" }}>
        {slotSpecies.map((species, i) => {
          const finalLevel = plan.finalLevels[i];
          const ownCandy = plan.ledger.ownCandy[i];
          const ownXl = plan.ledger.ownXlCandy[i];
          if (!species || !finalLevel || !ownCandy || !ownXl) return null;
          return (
            <div className="result-card" key={i} style={{ minWidth: 220 }}>
              <h3>
                Slot {i + 1}: {species.name}
              </h3>
              <dl>
                <dt>Level</dt>
                <dd>
                  {finalLevel.fromLevel} → {finalLevel.toLevel}
                </dd>
                <dt>Own candy remaining</dt>
                <dd>{ownCandy.remaining}</dd>
                <dt>Own XL candy remaining</dt>
                <dd>{ownXl.remaining}</dd>
              </dl>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

interface SingleRaidResultsSectionProps {
  error: string | null;
  bossSpecies: SpeciesDefinition | null;
  hasFieldedSlot: boolean;
  slotSpecies: (SpeciesDefinition | null)[];
  data: PowerUpOptimizerRunResult["data"];
  plan: PowerUpOptimizerRunResult["plan"];
  isOptimizerPending: boolean;
  rankBy: PowerUpRankBy;
  showAllCandidates: boolean;
  onToggleShowAllCandidates: () => void;
  visibleCandidates: RankedCandidateRow[];
  sortedCandidatesCount: number;
  secondChargedMoveBlocked: SecondChargedMoveBlockedSlot[];
  eliteTmCandidates: EliteTmCandidate[];
  eliteTmBlocked: EliteTmBlockedSlot[];
  eliteFastTmOnHand: number | null;
  eliteChargedTmOnHand: number | null;
}

/**
 * "your 2 Elite Fast TMs, best 2 targets" / "unknown Elite Fast TM count —
 * showing every ranked candidate" — the plan's own explicit framing (PLAN
 * §"Elite TM"). `onHand === null` (unknown) never hides a row, only changes
 * the heading and which rows get the "within your stock" marker.
 */
function eliteTmHeading(kind: EliteTmKind, onHand: number | null, count: number): string {
  const label = kind === "fast" ? "Elite Fast TM" : "Elite Charged TM";
  if (count === 0) return `${label} candidates`;
  if (onHand === null) return `${label} candidates — unknown ${label} count, showing every ranked target`;
  return `${label} candidates — your ${onHand} ${label}${onHand === 1 ? "" : "s"}, best ${Math.min(onHand, count)} target${Math.min(onHand, count) === 1 ? "" : "s"}`;
}

/**
 * One Elite TM section (fast or charged — never merged, separate
 * single-digit-supply items). Ranked by raw Δ team DPS (not a per-resource
 * efficiency — an Elite TM's "cost" is always exactly 1 item, so there is no
 * ratio to compute; see EliteTmCandidate.eliteTmItemsSpent's own doc
 * comment). Rows within `onHand` (when known) are marked "within your
 * stock"; the rest are still shown, framed as "would need another Elite TM."
 */
function EliteTmSection({ kind, candidates, onHand }: { kind: EliteTmKind; candidates: EliteTmCandidate[]; onHand: number | null }) {
  const sorted = useMemo(() => [...candidates].sort((a, b) => b.deltaTeamDps - a.deltaTeamDps), [candidates]);
  if (sorted.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3>{eliteTmHeading(kind, onHand, sorted.length)}</h3>
      <div className="table-scroll">
        <table className="time-series-table">
          <thead>
            <tr>
              <th>Slot</th>
              <th>Species</th>
              <th>Current move</th>
              <th>New move</th>
              <th>Δ team DPS</th>
              <th>Within stock?</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={`${c.slotIndex}-${c.newMoveId}`} style={{ opacity: c.deltaExceedsNoise ? 1 : 0.6 }}>
                <td>{c.slotIndex + 1}</td>
                <td>{c.speciesName}</td>
                <td>{c.currentMoveName}</td>
                <td>{c.newMoveName}</td>
                <td>
                  {c.deltaExceedsNoise ? (
                    <>
                      {c.deltaTeamDps >= 0 ? "+" : ""}
                      {c.deltaTeamDps.toFixed(2)}
                    </>
                  ) : (
                    "≈0 (no measurable change)"
                  )}
                </td>
                <td>{onHand === null ? "unknown" : i < onHand ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Single-raid mode's whole results area — baseline card, per-slot damage
 * ladder, recommendation, the fixed-budget plan (SingleRaidBudgetPlanSection,
 * rendered inline at its original position), the ranked-candidates table,
 * and the always-visible "Known caveats" block. Extracted verbatim from what
 * used to render inline in PowerUpOptimizerView's own top-level JSX (no
 * behavior change) — mirrors how multi-raid mode's own results already live
 * in MultiRaidResultsSection/MultiRaidBudgetPlanSection rather than inline,
 * shrinking PowerUpOptimizerView itself from ~837 to a thin orchestrator.
 */
function SingleRaidResultsSection({
  error,
  bossSpecies,
  hasFieldedSlot,
  slotSpecies,
  data,
  plan,
  isOptimizerPending,
  rankBy,
  showAllCandidates,
  onToggleShowAllCandidates,
  visibleCandidates,
  sortedCandidatesCount,
  secondChargedMoveBlocked,
  eliteTmCandidates,
  eliteTmBlocked,
  eliteFastTmOnHand,
  eliteChargedTmOnHand,
}: SingleRaidResultsSectionProps) {
  return (
    <>
      {error && (
        <section className="panel">
          <p className="error-text">Could not compute this optimizer run: {error}</p>
        </section>
      )}

      {!bossSpecies && (
        <section className="panel">
          <p className="caveats">Pick a raid target above to see ranked power-up candidates.</p>
        </section>
      )}

      {bossSpecies && !hasFieldedSlot && (
        <section className="panel">
          <p className="caveats">
            Add at least one Pokémon to the roster above to see ranked power-up candidates — or switch to Multi-raid
            mode (in Assumptions) to rank your whole imported roster instead, built on the{" "}
            <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a>.
          </p>
        </section>
      )}

      {data && (
        <>
          <CollapsibleSection
            id="pu-baseline"
            heading={
              <>
                Baseline — roster as-is
                {isOptimizerPending && (
                  <span
                    className="badge badge-pending"
                    title="Inputs have changed since this was last computed — it still reflects the previous roster/boss/assumption settings and will refresh automatically a moment after you stop changing them."
                  >
                    recomputing…
                  </span>
                )}
              </>
            }
            defaultOpen
          >
            <div className="result-card" style={{ opacity: isOptimizerPending ? 0.55 : 1, transition: "opacity 0.15s ease" }}>
              <div className="stat-tile-headline">
                <span className="stat-tile-value">{data.baseline.teamDps.toFixed(1)}</span>
                <span className="stat-tile-unit">team DPS</span>
              </div>
              <dl>
                <dt>Boss HP</dt>
                <dd>{data.bossHp.toLocaleString()}</dd>
                <dt>Clear rate</dt>
                <dd>{(data.baseline.clearRate * 100).toFixed(0)}%</dd>
                <dt>Mean time to clear</dt>
                <dd>
                  {data.baseline.meanTimeToClearSeconds === null
                    ? "never (in these simulated runs)"
                    : `${data.baseline.meanTimeToClearSeconds.toFixed(1)}s`}
                </dd>
                <dt>Team DPS</dt>
                <dd>{data.baseline.teamDps.toFixed(1)}</dd>
                <dt
                  title={`A candidate's |delta team DPS| below this band is indistinguishable from seed-to-seed jitter in these ${data.iterations} simulated runs, not a real effect — see the ranked table below for how this is applied.`}
                >
                  Noise floor
                </dt>
                <dd>
                  ±{data.noiseFloorTeamDps.toFixed(2)} team DPS ({data.iterations} seeds)
                </dd>
              </dl>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="pu-per-slot-ladder"
            heading={`Per-slot damage ladder against ${bossSpecies ? speciesLabel(bossSpecies) : "this boss"}`}
            defaultOpen={false}
          >
            <p className="caveats" style={{ marginBottom: 12 }}>
              Real Pokémon GO damage is floored per hit — a power-up can raise Attack and change nothing until it
              crosses a real breakpoint here. "No further breakpoint before level 50" means every remaining power-up
              for that move is cost with zero per-hit damage change against THIS boss's real Defense stat.
            </p>
            <p className="caveats" style={{ marginBottom: 12 }}>
              This ladder honors each slot&rsquo;s own Mega Level — Super Max&rsquo;s effective-level bump feeds the
              Attack stat shown, and a &ldquo;+&rdquo; charged move&rsquo;s power is scaled for the selected tier — so
              its breakpoints agree with the Δ team DPS numbers in the ranked table below, which come from a full
              re-simulation.
            </p>
            <div className="result-row" style={{ flexWrap: "wrap" }}>
              {slotSpecies.map((species, i) => {
                const ladder = data.ladders[i];
                if (!species || !ladder) return null;
                return (
                  <div className="result-card" key={i} style={{ minWidth: 340 }}>
                    <h3>
                      Slot {i + 1}: {species.name} (Lv {ladder.current.level})
                    </h3>
                    <dl>
                      <dt>Fast move dmg/hit now</dt>
                      <dd>{ladder.current.fastMoveDamage}</dd>
                      <dt>Next fast breakpoint</dt>
                      <dd>
                        {ladder.nextFastBreakpoint
                          ? `Lv ${ladder.nextFastBreakpoint.level} (${ladder.nextFastBreakpoint.fastMoveDamage} dmg) — ${ladder.nextFastBreakpoint.cumulativeCost.stardust.toLocaleString()} stardust, ${ladder.nextFastBreakpoint.cumulativeCost.candy} candy${ladder.nextFastBreakpoint.cumulativeCost.xlCandy > 0 ? `, ${ladder.nextFastBreakpoint.cumulativeCost.xlCandy} XL` : ""}`
                          : "no further breakpoint before level 50"}
                      </dd>
                      <dt>Charged move dmg/hit now</dt>
                      <dd>{ladder.current.chargedMoveDamage}</dd>
                      <dt>Next charged breakpoint</dt>
                      <dd>
                        {ladder.nextChargedBreakpoint
                          ? `Lv ${ladder.nextChargedBreakpoint.level} (${ladder.nextChargedBreakpoint.chargedMoveDamage} dmg) — ${ladder.nextChargedBreakpoint.cumulativeCost.stardust.toLocaleString()} stardust, ${ladder.nextChargedBreakpoint.cumulativeCost.candy} candy${ladder.nextChargedBreakpoint.cumulativeCost.xlCandy > 0 ? `, ${ladder.nextChargedBreakpoint.cumulativeCost.xlCandy} XL` : ""}`
                          : "no further breakpoint before level 50"}
                      </dd>
                    </dl>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          <CollapsibleSection id="pu-recommendation" heading="Recommendation" defaultOpen>
            <p className="caveats" style={{ color: "var(--text)" }}>
              {!data.bestAffordableByDelta && !data.bestAffordableByStardustEfficiency
                ? `Nothing affordable improves team DPS beyond the ±${data.noiseFloorTeamDps.toFixed(2)} noise floor — try raising stardust/candy on hand, or this roster may already be past its useful power-up headroom against this boss.`
                : (
                    <>
                      {data.bestAffordableByStardustEfficiency && (
                        <>
                          Best stardust efficiency: Slot {data.bestAffordableByStardustEfficiency.slotIndex + 1} (
                          {data.bestAffordableByStardustEfficiency.speciesName}) Lv{" "}
                          {data.bestAffordableByStardustEfficiency.fromLevel} → {data.bestAffordableByStardustEfficiency.toLevel}{" "}
                          (+{data.bestAffordableByStardustEfficiency.deltaTeamDps.toFixed(2)} team DPS,{" "}
                          {data.bestAffordableByStardustEfficiency.deltaTeamDpsPer1000Stardust?.toFixed(3)} per 1000 stardust).{" "}
                        </>
                      )}
                      {data.bestAffordableByDelta && (
                        <>
                          Biggest raw team-DPS gain: Slot {data.bestAffordableByDelta.slotIndex + 1} (
                          {data.bestAffordableByDelta.speciesName}) Lv {data.bestAffordableByDelta.fromLevel} →{" "}
                          {data.bestAffordableByDelta.toLevel} (+{data.bestAffordableByDelta.deltaTeamDps.toFixed(2)} team
                          DPS)
                          {data.bestAffordableByDelta.slotIndex === data.bestAffordableByStardustEfficiency?.slotIndex &&
                          data.bestAffordableByDelta.toLevel === data.bestAffordableByStardustEfficiency?.toLevel
                            ? " — the same candidate as above."
                            : " — a DIFFERENT candidate than the most stardust-efficient one above, since a bigger absolute gain doesn't have to be the cheapest one."}
                        </>
                      )}
                    </>
                  )}
            </p>
          </CollapsibleSection>

          {plan && <SingleRaidBudgetPlanSection plan={plan} slotSpecies={slotSpecies} />}

          <CollapsibleSection
            id="pu-ranked-candidates"
            heading={
              <>
                Ranked power-up candidates
                <span className="species-picker-hint" style={{ marginLeft: 8 }}>
                  grouped: measurable gains first (sorted by {rankByLabel(rankBy)}, descending), then within-noise
                  rows (cheapest first), then measurable losses last (worst first)
                </span>
              </>
            }
            defaultOpen
          >
            <p className="caveats" style={{ marginBottom: 12 }}>
              Rows with no {rankBy === "stardust" ? "stardust" : rankBy === "candy" ? "candy" : "XL candy"} cost
              (e.g. a pure-XL step has no regular-candy cost, and vice versa) show "—" for that column's efficiency and sink to the
              bottom of the first group — there is nothing to divide by, not a zero result. A row whose |Δ team DPS| is inside this
              run's ±{data.noiseFloorTeamDps.toFixed(2)} noise floor shows "≈0" instead of a signed number and "—" for every
              efficiency column, and sorts into the middle group by stardust cost (cheapest first) — the measured delta is
              indistinguishable from seed-to-seed jitter, not a real gain or loss.
            </p>
            <p className="caveats" style={{ marginBottom: 12 }}>
              "2nd charged move" rows compete in this SAME stardust/candy ranking (they draw on the same budget as a
              power-up) — Elite TM candidates do NOT, since an Elite TM is a separate, single-digit-supply item; see
              "Elite TM candidates" below instead.
            </p>
            <div className="table-scroll" style={{ opacity: isOptimizerPending ? 0.55 : 1, transition: "opacity 0.15s ease" }}>
              <table className="time-series-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Slot</th>
                    <th>Species</th>
                    <th>Level</th>
                    <th>Change</th>
                    <th>Δ team DPS</th>
                    <th>/1000 stardust</th>
                    <th>/candy</th>
                    <th>/XL candy</th>
                    <th>Stardust</th>
                    <th>Candy</th>
                    <th>XL candy</th>
                    <th>Affordable</th>
                    <th>Breakpoints</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCandidates.map((c) => (
                    <tr key={c.key} style={{ opacity: c.affordable ? 1 : 0.5 }}>
                      <td>{c.kind === "power-up" ? "Power-up" : "2nd charged move"}</td>
                      <td>{c.slotIndex + 1}</td>
                      <td>{c.speciesName}</td>
                      <td>{c.levelRange}</td>
                      <td>{c.change ?? "—"}</td>
                      <td
                        title={
                          c.deltaExceedsNoise
                            ? undefined
                            : `Within this candidate's own noise floor; the measured delta was ${c.deltaTeamDps >= 0 ? "+" : ""}${c.deltaTeamDps.toFixed(2)}`
                        }
                      >
                        {c.deltaExceedsNoise ? (
                          <>
                            {c.deltaTeamDps >= 0 ? "+" : ""}
                            {c.deltaTeamDps.toFixed(2)}
                          </>
                        ) : (
                          "≈0"
                        )}
                      </td>
                      <td>{!c.deltaExceedsNoise || c.deltaTeamDpsPer1000Stardust === null ? "—" : c.deltaTeamDpsPer1000Stardust.toFixed(3)}</td>
                      <td>{!c.deltaExceedsNoise || c.deltaTeamDpsPerCandy === null ? "—" : c.deltaTeamDpsPerCandy.toFixed(3)}</td>
                      <td>{!c.deltaExceedsNoise || c.deltaTeamDpsPerXlCandy === null ? "—" : c.deltaTeamDpsPerXlCandy.toFixed(3)}</td>
                      <td>{c.cost.stardust.toLocaleString()}</td>
                      <td>{c.cost.candy || "—"}</td>
                      <td>{c.cost.xlCandy || "—"}</td>
                      <td>{c.affordable ? "✓" : "✗"}</td>
                      <td>
                        {c.crossesFastBreakpoint && <span className="badge badge-breakpoint">fast</span>}
                        {c.crossesChargedBreakpoint && <span className="badge badge-breakpoint">charged</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedCandidatesCount > CANDIDATE_TABLE_INITIAL_ROWS && (
              <button type="button" style={{ marginTop: 8 }} onClick={onToggleShowAllCandidates}>
                {showAllCandidates ? `Show top ${CANDIDATE_TABLE_INITIAL_ROWS} only` : `Show all ${sortedCandidatesCount}`}
              </button>
            )}
            {secondChargedMoveBlocked.length > 0 && (
              <p className="caveats" style={{ marginTop: 12 }}>
                No second-charged-move candidate for: {secondChargedMoveBlocked.map((b) => `${b.speciesName} (${b.reason})`).join("; ")}
              </p>
            )}
          </CollapsibleSection>

          <CollapsibleSection id="pu-elite-tm-candidates" heading="Elite TM candidates" defaultOpen>
            <p className="caveats" style={{ marginBottom: 12 }}>
              A SEPARATE section on purpose — an Elite Fast/Elite Charged TM is a single-digit-supply item, not
              stardust/candy, so it never competes in the ranked table above (CLAUDE.md's standing rule against
              blending non-fungible resources into one score). Every reachable move is evaluated regardless of how
              many Elite TMs you actually have on hand; fill those counts in above to see which rows are within your
              current stock.
            </p>
            <EliteTmSection kind="fast" candidates={eliteTmCandidates.filter((c) => c.kind === "fast")} onHand={eliteFastTmOnHand} />
            <EliteTmSection kind="charged" candidates={eliteTmCandidates.filter((c) => c.kind === "charged")} onHand={eliteChargedTmOnHand} />
            {eliteTmCandidates.length === 0 && eliteTmBlocked.length === 0 && (
              <p className="caveats">No Elite TM candidates for the current roster.</p>
            )}
            {eliteTmBlocked.length > 0 && (
              <p className="caveats">
                No Elite TM candidate for: {eliteTmBlocked.map((b) => `${b.speciesName} ${b.kind} (${b.reason})`).join("; ")}
              </p>
            )}
          </CollapsibleSection>
        </>
      )}

      <CollapsibleSection id="pu-known-caveats-single" heading="Known caveats" defaultOpen={false}>
        <div className="note-block">
        <details className="prose-details">
          <summary>Roster scope</summary>
          <p>
          A team can field fewer than {MAX_TEAM_RAID_SLOTS} Pokémon — leave any slot empty ("clear" it) and it simply
          never enters the fight and never contributes a power-up candidate. Every power-up candidate below is a
          SINGLE-SLOT power-up run through a full paired team-raid simulation against the other 5 slots exactly as
          configured — no multi-slot power-up plans and no "add a hypothetical 7th Pokémon" candidates in this v1.
          </p>
        </details>
        <details className="prose-details">
          <summary>Mega Level</summary>
          <p>
          Mega Level (per slot, above): every number on this tab honors each slot's own selected Mega Level —
          baseline, ranked candidates' Δ team DPS, the fixed-budget plan, and the per-slot damage ladder's
          breakpoint check alike. Super Max additionally applies a +2 effective-level bump, whose magnitude is a
          community-consensus figure rather than a published one; a "+" charged move's power scaling by tier is a
          weaker community estimate still. Both are flagged where they surface.
          </p>
          <p>{MEGA_LEVEL_HINT}</p>
        </details>
        <details className="prose-details">
          <summary>Boss charged-move cadence model</summary>
          <p>{BOSS_CADENCE_HINT}</p>
        </details>
        <details className="prose-details">
          <summary>Ranking display</summary>
          <p>
          "Rank candidates by" is display-only — never changes which candidates exist or their own numbers, only the
          sort order of the ranked table (both modes). Stardust and candy are deliberately kept as two separate
          efficiency numbers rather than one blended score, since they aren't fungible resources for a real player.
          </p>
        </details>
        <details className="prose-details">
          <summary>Raid timer</summary>
          <p>Real, documented per-tier raid countdown — see raidBoss.ts's RAID_TIER_TABLE.</p>
        </details>
        <details className="prose-details">
          <summary>Scope, noise floor &amp; cost-table gaps</summary>
          <p>
          v1, rudimentary scope: every candidate above is a SINGLE-SLOT power-up — no multi-slot plans (e.g. "power up
          two Pokémon together") and no "add a hypothetical 7th Pokémon" candidates. Each candidate/baseline number is
          the mean of {data ? data.iterations : 20} paired-seed (common-random-numbers) team-raid runs, not one
          run — a level change shifts WHEN the boss's own charged-move RNG gets consumed, which decorrelates the
          "same seed" runs more than a typical paired comparison, so this tool also computes a conservative noise floor
          (shown on the baseline card and applied to the ranked table above) and treats any candidate whose |Δ team DPS|
          falls inside it as "no measurable change" rather than a signed number. A candidate CAN still show a genuine
          small negative delta beyond that floor, and that isn't necessarily a bug: with swap/revive costs at 0 a
          bulkier, lower-DPS slot that gains no extra charged move from the power-up just delays the roster's stronger
          slots behind it for no compensating survival benefit — it's the revive cost above (15s by default) that makes
          a slot's extra bulk pay for itself by avoiding a paid full-roster wipe. The power-up cost table (universal
          levels 1-50,
          fetched {powerUpCostsFetchedAt.slice(0, 10)} from GAME_MASTER) DOES apply Eternatus's known per-species
          candy-cost override (candy/XL-candy only — stardust is genuinely unchanged at every level) via a generic
          per-species override mechanism; Eternatus is the only entry the live GAME_MASTER dump carries one for, so
          this mechanism is untested against a second overridden species. Best Buddy status (a real +1 level beyond
          the normal level-50 cap) is not modelled in this tab. The Shadow-side
          candy rounding rule is [inferred from the Purified rule, not independently confirmed] — see powerUp.ts's own
          top doc comment. Stardust and candy/XL-candy efficiency are kept as two separate numbers on purpose (see the
          "Rank by" control) — they are not fungible resources for a real player, so this tool never blends them into
          one composite score. Every full-roster wipe costs the revive-and-rejoin time above (15s by default) of raid
          clock in which nothing is dealt, and team DPS is the damage dealt within the raid timer divided by the timer
          (or boss HP divided by time-to-clear when the roster clears) — so a slot's extra bulk only counts when it
          buys damage, or avoids a paid revive. Team Raid v1's other assumptions carry over unchanged: unlimited
          healing items on a full wipe, and no cap on wipe-and-rejoin cycles other than a purely-engineering safety guard. A raid target badged
          "approximate" in the picker is one the live raid feed named but whose exact form this data layer couldn't
          resolve, so a documented stand-in species' stats are used instead — treat those runs as directional.
          </p>
        </details>
        <details className="prose-details">
          <summary>Move changes (second charged move &amp; TMs)</summary>
          <p>
          Second-charged-move pricing is [community-consensus] (no first-party Niantic table found), tiered by the
          family's real buddy-walking distance, with starters/babies flat-rated and 16 named species barred entirely
          unless Shadow or Purified. Purified is a 0.8x stardust/candy discount HERE, NOT the 0.9x an ordinary
          power-up uses — a deliberately separate rate, not a copy/paste of the power-up table. A slot whose species'
          buddy distance isn't in this data layer yet shows no second-charged-move candidate at all rather than
          guessing a tier. Elite TM candidates are deterministic once a target move is picked, so every reachable
          move is evaluated regardless of how many Elite TMs you actually hold — the TM-count fields above only
          label which rows are "within your stock." A REGULAR (non-Elite) Fast/Charged TM is deliberately NOT
          modelled at all: its outcome is a random, guaranteed-different move from a pool whose real distribution
          Niantic has never published, and it can irreversibly overwrite a legacy/event move that only an Elite TM
          could restore — ranking a candidate here would mean either fabricating a distribution or collapsing real
          uncertainty into one misleading number. Frustration/Return, signature moves, and Super Max "+" moves can
          never be targeted by any TM of any kind (real game rule). Frustration removal itself needs a real,
          roughly-quarterly "Taken Over" event and is not modelled here at all. Every candidate above assumes this
          tab's own 6-slot roster, whose species/move pickers always resolve to a concrete move — the "unknown
          moveset" exclusion above only applies to your separately-imported Roster-tab pool, which this tab's TM
          ranking does not draw candidates from yet.
          </p>
        </details>
        </div>
      </CollapsibleSection>
    </>
  );
}

/**
 * The Power-Up Optimizer: ranks a candidate power-up (one fielded roster
 * slot, one half-level step) by TEAM-DPS gained per resource spent, stardust
 * and candy kept as separate efficiency numbers, against a boss's real HP
 * pool — see packages/engine/src/powerUp.ts's own top doc comment for the
 * full mechanic (per-hit damage is FLOORED, so a power-up can be free until
 * it crosses a real breakpoint) and IDEAS.md's "Power-Up Optimizer" section
 * for the product framing this implements.
 */
export function PowerUpOptimizerView() {
  const [assumptions, setAssumptionsRaw] = useState<PowerUpOptimizerAssumptions>(initialAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  // The roster is now OWNED by the Roster tab (RosterView.tsx, added
  // 2026-09-10 — see PLAN_roster_tab.md), which hosts hand-entry, CSV import,
  // editing, and the save code. This view only READS the pool from
  // localStorage at mount — since every tab fully unmounts when another is
  // active (App.tsx's own doc comment), returning here after editing the
  // roster on that tab always re-reads the current pool, with no lifted
  // setter needed on this side any more.
  const [rosterPool] = useState<RosterPool>(loadRosterPool);
  const {
    entries: hydratedPool,
    droppedCount: rosterDroppedCount,
    staleMovesetBadgeCount: rosterStaleMovesetBadgeCount,
  } = useMemo(() => hydrateRosterPool(rosterPool, speciesRegistry), [rosterPool]);

  // entryId -> a short identity for the multi-raid result tables. A roster
  // routinely holds several entries of the SAME species (4 Mewtwo, 12
  // Houndour on the reference export), which would otherwise render as
  // repeated, indistinguishable rows carrying different numbers — see
  // MultiRaidCandidateRow's `identity` doc comment.
  const entryIdentities = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of hydratedPool) {
      const { attack, defense, stamina } = entry.ivs;
      map.set(entry.entryId, `IV ${attack}/${defense}/${stamina}${entry.ivsAreApproximate ? " (approx)" : ""}`);
    }
    return map;
  }, [hydratedPool]);

  // entryId -> species name, for the move-change sweep's `displacedEntryId`
  // join (rosterDisplacedSlotNote.ts) — a benched candidate's row needs to
  // name WHICH fielded team member it swapped out, and `displacedEntryId` is
  // an opaque id, not something a player recognizes. Kept separate from
  // `entryIdentities` above (that map is an IV spread, not a name) rather
  // than overloading its meaning.
  const entryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of hydratedPool) map.set(entry.entryId, entry.species.name);
    return map;
  }, [hydratedPool]);

  // entryId -> a "moveset had to be guessed" badge for the multi-raid result
  // tables — a real trust bug fixed 2026-09-10: `RosterPowerUpCandidate`/
  // `RosterNeverCompetitiveEntry`/`RosterBudgetStep` (engine result types)
  // don't carry `movesetIsDefaulted` at all, and this used to be visible
  // ONLY in the "Import a whole roster" table further up the page — a
  // recommendation like "power up Rayquaza" rested on a guessed moveset with
  // no signal of that anywhere near the number itself. Same "map built once
  // from the hydrated pool, joined by entryId" shape as entryIdentities
  // above — see rosterMovesetBadge.ts's own top doc comment for the full
  // story and why this is a web-only join, not an engine change.
  //
  // Feeds `effectiveMoveIds` (run/runRosterPlanner.ts) the SAME
  // `multiRaidUseBestAvailableMoveset` flag the sweep itself uses (IDEAS.md
  // #11) — this is what keeps this badge's "assumed X" tooltip from
  // disagreeing with which move the simulation actually ran, once the toggle
  // is on: the badge would otherwise keep naming `chargedMoves[0]` while the
  // engine silently used the species' best-available move instead.
  const entryMovesetBadges = useMemo(() => {
    const map = new Map<string, MovesetDefaultBadgeInfo>();
    for (const entry of hydratedPool) {
      const { fastMoveId, chargedMoveId } = effectiveMoveIds(entry, assumptions.multiRaidUseBestAvailableMoveset);
      const badge = movesetDefaultBadge({ ...entry, fastMoveId, chargedMoveId });
      if (badge) map.set(entry.entryId, badge);
    }
    return map;
  }, [hydratedPool, assumptions.multiRaidUseBestAvailableMoveset]);

  // Distinct candyFamilyId values present in the roster pool, each with a
  // representative species name — feeds the assumption panel's minimal
  // inline candy-on-hand editor (PLAN §3.4). A mega/primal entry's OWN
  // candyFamilyId is always undefined (every real mega/primal species — see
  // rosterPlanner.ts's RosterEntry.candyFamilyId doc comment), so it's
  // resolved from its BASE species instead (registry.ts's
  // resolveMegaBaseSpecies — Phase 3b closed this gap; see
  // run/runRosterPlanner.ts's toEngineRosterPool for the matching engine-call
  // side of the same resolution), labeled to make clear WHOSE candy this row
  // actually spends (e.g. "Blaziken (for Mega Blaziken)").
  const rosterFamilyOptions = useMemo(() => {
    const byFamily = new Map<string, string>();
    for (const entry of hydratedPool) {
      const isMegaEntry = entry.canMega && !!entry.species.boost;
      const baseSpecies = isMegaEntry ? resolveMegaBaseSpecies(entry.species) : undefined;
      const familyId = baseSpecies ? baseSpecies.candyFamilyId : entry.species.candyFamilyId;
      if (!familyId || byFamily.has(familyId)) continue;
      byFamily.set(familyId, baseSpecies ? `${baseSpecies.name} (for ${entry.species.name})` : entry.species.name);
    }
    return [...byFamily.entries()]
      .map(([familyId, label]) => ({ familyId, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [hydratedPool]);

  function setAssumptions(next: PowerUpOptimizerAssumptions) {
    setAssumptionsRaw(normalizePowerUpAssumptions(next));
    setShowAllCandidates(false);
  }

  const slotOptions = useMemo(() => candidatePickerOptions(), []);
  const targetOptions = useMemo(() => targetPickerOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);

  const slotSpecies = useMemo(() => assumptions.slots.map((s) => resolveSpecies(s.speciesId)), [assumptions.slots]);
  const hypotheticalCatchSpecies = useMemo(
    () => assumptions.multiRaidHypotheticalCatches.map((h) => resolveSpecies(h.speciesId)),
    [assumptions.multiRaidHypotheticalCatches],
  );
  const bossSpecies = useMemo(() => resolveSpecies(assumptions.targetId), [assumptions.targetId]);
  const bossRaidTier = useMemo(() => raidTierForSpeciesId(assumptions.targetId) ?? undefined, [assumptions.targetId]);

  const selectedBossChargedMove = useMemo(() => {
    if (!bossSpecies) return undefined;
    return bossSpecies.chargedMoves.find((m) => m.id === assumptions.bossChargedMoveId) ?? bossSpecies.chargedMoves[0];
  }, [bossSpecies, assumptions.bossChargedMoveId]);

  const bossStartingEnergy = useMemo(() => {
    if (!assumptions.bossStartsPrimed || !bossSpecies) return 0;
    const cost = selectedBossChargedMove?.energyCost ?? 0;
    return assumptions.bossStartingEnergyFraction * cost;
  }, [assumptions.bossStartsPrimed, assumptions.bossStartingEnergyFraction, bossSpecies, selectedBossChargedMove]);

  const bossReadySeconds = useMemo(() => {
    if (!bossSpecies) return null;
    const fastMove = bossSpecies.fastMoves.find((m) => m.id === assumptions.bossFastMoveId) ?? bossSpecies.fastMoves[0];
    if (!fastMove || !selectedBossChargedMove) return null;
    return bossChargedMoveReadySeconds(fastMove, selectedBossChargedMove, bossStartingEnergy);
  }, [bossSpecies, assumptions.bossFastMoveId, selectedBossChargedMove, bossStartingEnergy]);

  const bossHp = useMemo(() => (bossSpecies ? bossEffectiveHp(bossSpecies, bossRaidTier) : null), [bossSpecies, bossRaidTier]);

  // The expensive part: one full paired team-raid comparison per fielded
  // slot x half-level-above-current x iteration (see optimizePowerUps' own
  // doc comment for the exact cost) — now lives in runPowerUpOptimizerScenario
  // (run/runPowerUpOptimizer.ts), a pure, React-free function shared with the
  // run-scenario CLI and this tab's own vitest smoke test. `optimizerAssumptions`
  // below is built as its own memo EXCLUDING rankBy (display-only — see
  // PowerUpOptimizerAssumptionPanel's own field doc comment), same "debounce
  // the narrow derived object, not the whole assumptions blob" pattern
  // SpeciesReportView's sweepInputs established — this is what keeps the
  // Rank-by select instantly responsive without flashing a "recomputing…"
  // indicator for work that was never re-triggered. bossSpecies/bossReadySeconds/
  // bossHp above stay live (not debounced) — cheap boss-preview values the
  // assumption panel needs instantly, unrelated to this expensive call.
  const optimizerAssumptions = useMemo<PowerUpOptimizerAssumptions>(
    () => ({
      // Every field below this point through rankBy is what
      // runPowerUpOptimizerScenario (single-raid) actually reads; the
      // multi-raid fields are irrelevant to it and held at fixed placeholder
      // values purely to satisfy PowerUpOptimizerAssumptions' shape — see
      // multiRaidRunInputs below for the SEPARATE memo that feeds the
      // multi-raid sweep instead.
      mode: "single-raid",
      slots: assumptions.slots,
      stardustOnHand: assumptions.stardustOnHand,
      rareCandyOnHand: assumptions.rareCandyOnHand,
      rareCandyXlOnHand: assumptions.rareCandyXlOnHand,
      targetId: assumptions.targetId,
      bossFastMoveId: assumptions.bossFastMoveId,
      bossChargedMoveId: assumptions.bossChargedMoveId,
      dodge: assumptions.dodge,
      dodgeFastAttacks: assumptions.dodgeFastAttacks,
      holdChargedMoveUntilSafe: assumptions.holdChargedMoveUntilSafe,
      bossChargedMoveFrequencySeconds: assumptions.bossChargedMoveFrequencySeconds,
      bossChargedMoveCadence: assumptions.bossChargedMoveCadence,
      bossStartsPrimed: assumptions.bossStartsPrimed,
      bossStartingEnergyFraction: assumptions.bossStartingEnergyFraction,
      weather: assumptions.weather,
      raidTimerSeconds: assumptions.raidTimerSeconds,
      swapCostSeconds: assumptions.swapCostSeconds,
      reviveCostSeconds: assumptions.reviveCostSeconds,
      // Deliberately NOT assumptions.rankBy — display-only, excluded from this
      // memo's own recompute trigger (see the doc comment above); the exact
      // value doesn't matter since runPowerUpOptimizerScenario never reads it.
      rankBy: "stardust",
      // Placeholders — see this memo's own doc comment above.
      multiRaidBossIds: [],
      multiRaidIncludePastRaids: false,
      multiRaidIncludedTiers: null,
      multiRaidMaxBossCount: 30,
      candyByFamilyId: {},
      multiRaidMegaLevel: null,
      multiRaidSignificanceMode: "aggregate-only",
      multiRaidUseBestAvailableMoveset: false,
      multiRaidHypotheticalCatches: [],
      // Placeholders — runPowerUpOptimizerScenario never reads TM inventory
      // (it's purely a render-layer "within your stock" framing, see
      // PowerUpOptimizerAssumptions' own field doc comments), so these
      // don't belong in this memo's dependency array either.
      fastTmOnHand: null,
      chargedTmOnHand: null,
      eliteFastTmOnHand: null,
      eliteChargedTmOnHand: null,
    }),
    [
      assumptions.slots,
      assumptions.stardustOnHand,
      assumptions.rareCandyOnHand,
      assumptions.rareCandyXlOnHand,
      assumptions.targetId,
      assumptions.bossFastMoveId,
      assumptions.bossChargedMoveId,
      assumptions.dodge,
      assumptions.dodgeFastAttacks,
      assumptions.holdChargedMoveUntilSafe,
      assumptions.bossChargedMoveFrequencySeconds,
      assumptions.bossChargedMoveCadence,
      assumptions.bossStartsPrimed,
      assumptions.bossStartingEnergyFraction,
      assumptions.weather,
      assumptions.raidTimerSeconds,
      assumptions.swapCostSeconds,
      assumptions.reviveCostSeconds,
    ],
  );

  // Debounced echo — see useDebouncedValue.ts / SpeciesReportView.tsx's
  // identical precedent. This computation is materially heavier than that
  // one (a full team-raid run per candidate, not a single-attacker sim), so
  // the "don't recompute on every keystroke" case matters even more here.
  const debouncedOptimizerAssumptions = useDebouncedValue(optimizerAssumptions, 400);
  const isOptimizerPending = optimizerAssumptions !== debouncedOptimizerAssumptions;

  // Only ever computed in single-raid mode — skipping this in multi-raid
  // mode avoids wasting a ~1s engine call every 400ms while the user is
  // tuning the OTHER computation this tab now offers.
  const runResult = useMemo(
    () => (assumptions.mode === "single-raid" ? runPowerUpOptimizerScenario(debouncedOptimizerAssumptions, speciesRegistry) : null),
    [assumptions.mode, debouncedOptimizerAssumptions],
  );
  const result = {
    data: runResult?.data ?? null,
    plan: runResult?.plan ?? null,
    error: runResult?.error ?? null,
    secondChargedMoveCandidates: runResult?.secondChargedMoveCandidates ?? [],
    secondChargedMoveBlocked: runResult?.secondChargedMoveBlocked ?? [],
    eliteTmCandidates: runResult?.eliteTmCandidates ?? [],
    eliteTmBlocked: runResult?.eliteTmBlocked ?? [],
  };

  // --- Multi-raid mode ---------------------------------------------------
  // Everything runRosterPlannerScenario ACTUALLY reads, EXCLUDING the pool
  // (passed separately — see runRosterPlanner.ts's own doc comment on why
  // the pool can't live in Assumptions/Scenario at all, per PLAN §3.2).
  // Built by hand-picking each field (never `{...assumptions}`) — same
  // convention as `optimizerAssumptions` above, so this memo's own
  // dependency array can list exactly what it reads instead of the whole
  // `assumptions` object, which would defeat the point of narrowing it at
  // all. Single-raid-only fields (slots, targetId, boss moves, etc.) are
  // fixed placeholders purely to satisfy PowerUpOptimizerAssumptions' shape.
  const multiRaidInputs = useMemo<PowerUpOptimizerAssumptions>(
    () => ({
      mode: "multi-raid",
      slots: [],
      targetId: "",
      bossFastMoveId: null,
      bossChargedMoveId: null,
      bossStartsPrimed: false,
      bossStartingEnergyFraction: 0,
      rankBy: "stardust",
      // Placeholders on THIS memo — resolveRosterPlannerInputs (the main
      // sweep) never reads any of the four TM inventory fields. The
      // move-change sweep DOES read eliteFastTmOnHand/eliteChargedTmOnHand,
      // but deliberately NOT off this object — see
      // resolveRosterMoveChangeInputs' own doc comment (run/runRosterMoveChange.ts)
      // for why: this memo's reference identity ALSO drives the main
      // sweep's `isMultiRaidStale` flag, so folding a TM count into it would
      // mark an unrelated, already-completed sweep stale every time the
      // user typed one. handleRunMoveChangeSweep below reads both straight
      // off the LIVE `assumptions` object instead.
      fastTmOnHand: null,
      chargedTmOnHand: null,
      eliteFastTmOnHand: null,
      eliteChargedTmOnHand: null,
      multiRaidIncludePastRaids: assumptions.multiRaidIncludePastRaids,
      multiRaidIncludedTiers: assumptions.multiRaidIncludedTiers,
      multiRaidMaxBossCount: assumptions.multiRaidMaxBossCount,
      multiRaidBossIds: assumptions.multiRaidBossIds,
      candyByFamilyId: assumptions.candyByFamilyId,
      // NOT currently read by resolveRosterPlannerInputs/rosterPlanner.ts at
      // all (see PowerUpOptimizerAssumptions.multiRaidMegaLevel's own KNOWN
      // GAP doc comment) — carried through anyway so this memo's shape stays
      // honest about what the assumptions object actually holds, and so the
      // wiring is already correct the moment that engine gap closes.
      multiRaidMegaLevel: assumptions.multiRaidMegaLevel,
      multiRaidSignificanceMode: assumptions.multiRaidSignificanceMode,
      multiRaidUseBestAvailableMoveset: assumptions.multiRaidUseBestAvailableMoveset,
      multiRaidHypotheticalCatches: assumptions.multiRaidHypotheticalCatches,
      stardustOnHand: assumptions.stardustOnHand,
      rareCandyOnHand: assumptions.rareCandyOnHand,
      rareCandyXlOnHand: assumptions.rareCandyXlOnHand,
      dodge: assumptions.dodge,
      dodgeFastAttacks: assumptions.dodgeFastAttacks,
      holdChargedMoveUntilSafe: assumptions.holdChargedMoveUntilSafe,
      bossChargedMoveFrequencySeconds: assumptions.bossChargedMoveFrequencySeconds,
      bossChargedMoveCadence: assumptions.bossChargedMoveCadence,
      weather: assumptions.weather,
      raidTimerSeconds: assumptions.raidTimerSeconds,
      swapCostSeconds: assumptions.swapCostSeconds,
      reviveCostSeconds: assumptions.reviveCostSeconds,
    }),
    [
      assumptions.multiRaidIncludePastRaids,
      assumptions.multiRaidIncludedTiers,
      assumptions.multiRaidMaxBossCount,
      assumptions.multiRaidBossIds,
      assumptions.candyByFamilyId,
      assumptions.multiRaidMegaLevel,
      assumptions.multiRaidSignificanceMode,
      assumptions.multiRaidUseBestAvailableMoveset,
      assumptions.multiRaidHypotheticalCatches,
      assumptions.stardustOnHand,
      assumptions.rareCandyOnHand,
      assumptions.rareCandyXlOnHand,
      assumptions.dodge,
      assumptions.dodgeFastAttacks,
      assumptions.holdChargedMoveUntilSafe,
      assumptions.bossChargedMoveFrequencySeconds,
      assumptions.bossChargedMoveCadence,
      assumptions.weather,
      assumptions.raidTimerSeconds,
      assumptions.swapCostSeconds,
      assumptions.reviveCostSeconds,
    ],
  );

  // No debounce here and NO auto-run — a multi-raid computation is real,
  // non-trivial compute (~1-4s for the ranked sweep, ~1.7-2.5s for the
  // Phase 4 fixed-budget plan on a real 164-entry/13-boss roster) and
  // there's no benefit to re-running either on every keystroke the way the
  // single-raid path's 400ms debounce does. Run BOTH only when the user
  // explicitly clicks "Run sweep" below (PLAN §5 Phase 3's own instruction,
  // extended by Phase 4 to cover the budget plan too) — each of
  // `multiRaidRun`/`multiRaidBudgetRun` holds BOTH its own result and the
  // exact (inputs, pool) it was computed from, so staleness is detected by
  // reference comparison (isMultiRaidStale/isMultiRaidBudgetStale below)
  // without a useEffect.
  const [multiRaidRun, setMultiRaidRun] = useState<{
    inputs: PowerUpOptimizerAssumptions;
    pool: typeof hydratedPool;
    result: RosterPlannerRunResult;
    /** null when the run was blocked before any engine call was even attempted (no-roster/no-bosses) — see RosterPlannerWorkerRunOutcome.ranOn. */
    ranOn: "worker" | "main-thread-fallback" | null;
  } | null>(null);
  const [isRunningMultiRaidSweep, setIsRunningMultiRaidSweep] = useState(false);
  // Elapsed wall-clock time ticks every 200ms while running via a plain
  // setInterval in the EVENT HANDLER below (not a useEffect — no
  // react-hooks/set-state-in-effect concern), then set once more precisely on
  // completion. `sweepProgress` is now REAL per-event progress (IDEAS.md #13,
  // engine's `RosterPlannerInputs.onProgress` — see rosterPlanner.worker.ts's
  // own doc comment for how a callback crosses the postMessage boundary),
  // never a fabricated percentage — each event corresponds to one genuinely
  // completed unit of work.
  const [sweepElapsedMs, setSweepElapsedMs] = useState(0);
  const [sweepProgress, setSweepProgress] = useState<RosterPlannerProgressEvent | null>(null);
  const isMultiRaidStale = multiRaidRun !== null && (multiRaidRun.inputs !== multiRaidInputs || multiRaidRun.pool !== hydratedPool);

  // Phase 4's fixed-budget plan — SAME (inputs, pool)-snapshot/staleness
  // convention as multiRaidRun above, but its own independent running/
  // elapsed/result state since it's a SEPARATE worker round trip that
  // finishes at a different time than the ranked sweep (see
  // runMultiRaidTrackedComputation's own doc comment).
  const [multiRaidBudgetRun, setMultiRaidBudgetRun] = useState<{
    inputs: PowerUpOptimizerAssumptions;
    pool: typeof hydratedPool;
    result: RosterBudgetPlanRunResult;
    ranOn: "worker" | "main-thread-fallback" | null;
  } | null>(null);
  const [isRunningMultiRaidBudget, setIsRunningMultiRaidBudget] = useState(false);
  const [budgetElapsedMs, setBudgetElapsedMs] = useState(0);
  const [budgetProgress, setBudgetProgress] = useState<RosterPlannerProgressEvent | null>(null);
  const isMultiRaidBudgetStale =
    multiRaidBudgetRun !== null && (multiRaidBudgetRun.inputs !== multiRaidInputs || multiRaidBudgetRun.pool !== hydratedPool);

  // The move-change sweep (PLAN_tm_move_change_optimizer.md) — a THIRD,
  // separate worker round trip, kicked off by its OWN button (never
  // auto-triggered alongside the two above) because it depends on the main
  // sweep's ALREADY-COMPUTED `baselinePerBoss`, which doesn't exist until
  // that sweep has actually run once. Staleness also tracks `baselineRef`
  // (the exact baseline array this move-change result was computed against,
  // by reference) — not just `inputs`/`pool` — since re-running the main
  // sweep alone (same inputs/pool, e.g. clicking "Run sweep again" without
  // changing anything) produces a NEW baseline array via a fresh seed set,
  // and this result should still be flagged stale against it.
  const currentBaselinePerBoss = multiRaidRun?.result.data?.baselinePerBoss ?? null;
  const [moveChangeRun, setMoveChangeRun] = useState<{
    inputs: PowerUpOptimizerAssumptions;
    pool: typeof hydratedPool;
    baselineRef: typeof currentBaselinePerBoss;
    // Tracked SEPARATELY from `inputs` — see resolveRosterMoveChangeInputs'
    // own doc comment (run/runRosterMoveChange.ts) for why these two are
    // deliberately NOT part of the `multiRaidInputs` memo this `inputs`
    // field is.
    eliteFastTmOnHand: number | null;
    eliteChargedTmOnHand: number | null;
    result: RosterMoveChangeRunResult;
    ranOn: "worker" | "main-thread-fallback" | null;
  } | null>(null);
  const [isRunningMoveChange, setIsRunningMoveChange] = useState(false);
  const [moveChangeElapsedMs, setMoveChangeElapsedMs] = useState(0);
  const isMoveChangeStale =
    moveChangeRun !== null &&
    (moveChangeRun.inputs !== multiRaidInputs ||
      moveChangeRun.pool !== hydratedPool ||
      moveChangeRun.baselineRef !== currentBaselinePerBoss ||
      moveChangeRun.eliteFastTmOnHand !== assumptions.eliteFastTmOnHand ||
      moveChangeRun.eliteChargedTmOnHand !== assumptions.eliteChargedTmOnHand);
  const canRunMoveChange = currentBaselinePerBoss !== null && !isMultiRaidStale;

  function handleRunMoveChangeSweep() {
    if (!currentBaselinePerBoss) return;
    const resolution = resolveRosterMoveChangeInputs(
      multiRaidInputs,
      speciesRegistry,
      hydratedPool,
      currentBaselinePerBoss,
      assumptions.eliteFastTmOnHand,
      assumptions.eliteChargedTmOnHand,
    );
    const snapshotInputs = multiRaidInputs;
    const snapshotPool = hydratedPool;
    const snapshotBaseline = currentBaselinePerBoss;
    const snapshotEliteFastTmOnHand = assumptions.eliteFastTmOnHand;
    const snapshotEliteChargedTmOnHand = assumptions.eliteChargedTmOnHand;
    runMultiRaidTrackedComputation(
      resolution,
      () => runRosterMoveChangeOffMainThread(resolution.inputs!),
      setIsRunningMoveChange,
      setMoveChangeElapsedMs,
      (result, ranOn) =>
        setMoveChangeRun({
          inputs: snapshotInputs,
          pool: snapshotPool,
          baselineRef: snapshotBaseline,
          eliteFastTmOnHand: snapshotEliteFastTmOnHand,
          eliteChargedTmOnHand: snapshotEliteChargedTmOnHand,
          result,
          ranOn,
        }),
    );
  }

  function handleRunMultiRaidSweep() {
    // RESOLUTION happens ONCE, right here, shared by BOTH engine calls below
    // — it's cheap (id lookups + pool mapping, no simulation) and needs
    // registry.ts, which the worker deliberately never imports (see
    // run/runRosterPlanner.ts's own top doc comment). Only the actual engine
    // calls (runRosterPlannerOffMainThread / runRosterBudgetOffMainThread) go
    // to the worker — and BOTH are kicked off from this single click, so the
    // ranked-sweep and fixed-budget-plan sections below can never describe
    // two different (inputs, pool) snapshots.
    const resolution = resolveRosterPlannerInputs(multiRaidInputs, speciesRegistry, hydratedPool);
    const snapshotInputs = multiRaidInputs;
    const snapshotPool = hydratedPool;

    runMultiRaidTrackedComputation(
      resolution,
      () => runRosterPlannerOffMainThread(resolution.inputs!, setSweepProgress),
      setIsRunningMultiRaidSweep,
      setSweepElapsedMs,
      (result, ranOn) => setMultiRaidRun({ inputs: snapshotInputs, pool: snapshotPool, result, ranOn }),
      setSweepProgress,
    );

    runMultiRaidTrackedComputation(
      resolution,
      () => runRosterBudgetOffMainThread(resolution.inputs!, setBudgetProgress),
      setIsRunningMultiRaidBudget,
      setBudgetElapsedMs,
      (result, ranOn) => setMultiRaidBudgetRun({ inputs: snapshotInputs, pool: snapshotPool, result, ranOn }),
      setBudgetProgress,
    );
  }

  // Sorting is over the ALREADY-COMPUTED candidates and is cheap — kept bound
  // to the LIVE rankBy (not the debounced snapshot) so switching the sort
  // column is instant, same "cheap display-only work shouldn't wait on the
  // debounce" reasoning as SpeciesReportView's sortedRows. The actual
  // three-group noise-floor-aware order lives in powerUpCandidateSort.ts,
  // shared with multi-raid mode's own ranked-table sort below.
  const sortedCandidates = useMemo(() => {
    // Second-charged-move rows compete in the SAME ranked list as power-up
    // rows (they draw on the same stardust/candy budget) — see
    // RankedCandidateRow's own doc comment. Elite TM candidates are
    // deliberately excluded (rendered in their own section instead).
    const list: RankedCandidateRow[] = [
      ...(result.data?.candidates.map(powerUpCandidateToRow) ?? []),
      ...result.secondChargedMoveCandidates.map(secondChargedMoveCandidateToRow),
    ];
    return sortCandidatesByEfficiency(list, (row) => ({
      delta: row.deltaTeamDps,
      isSignificant: row.deltaExceedsNoise,
      costStardust: row.cost.stardust,
      efficiency: rankedRowEfficiency(row, assumptions.rankBy),
    }));
  }, [result.data, result.secondChargedMoveCandidates, assumptions.rankBy]);

  const visibleCandidates = showAllCandidates ? sortedCandidates : sortedCandidates.slice(0, CANDIDATE_TABLE_INITIAL_ROWS);

  function handleShare() {
    const url = new URL(buildPowerUpOptimizerScenarioUrl(getBaseUrl(), assumptionsToScenario(assumptions)));
    url.searchParams.set("view", "power-up-optimizer");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  /**
   * Sends this roster to Team Raid Simulator, USING the fixed-budget plan's
   * own post-plan levels (result.plan?.finalLevels) rather than the current
   * roster — the whole point of this button is letting the user watch the
   * roster they'd have AFTER spending play out cycle-by-cycle before they
   * commit real stardust, per the audit finding that drove this feature (a
   * "clear rate after this plan: 100%" number they couldn't otherwise
   * verify without hand-copying levels). Same "build the destination
   * scenario, stamp its `view=`, navigate" mechanism as
   * TeamRaidView.tsx's own handleExportToPowerUpOptimizer (the reverse of
   * this button) — see powerUpOptimizerExport.ts's own doc comment for
   * exactly what carries and the one real reduction it has to make (Team
   * Raid's single shared level/IV spread vs. this tab's per-slot ones).
   * Single-raid mode ONLY — see the button's own render-site doc comment
   * for why multi-raid mode doesn't get this link at all.
   */
  function handleSendToTeamRaid() {
    const teamAssumptions = powerUpOptimizerAssumptionsToTeamAssumptions(assumptions, result.plan?.finalLevels ?? null);
    const url = new URL(buildTeamScenarioUrl(getBaseUrl(), assumptionsToTeamScenario(teamAssumptions)));
    url.searchParams.set("view", "team-raid");
    window.location.href = url.toString();
  }

  const rosterNames = slotSpecies.filter((s): s is SpeciesDefinition => s !== null).map((s) => speciesLabel(s));

  return (
    <>
      <p className="subtitle">
        {assumptions.mode === "single-raid" ? (
          <>
            {rosterNames.length > 0 ? rosterNames.join(", ") : "Build a 6-slot roster"} vs{" "}
            {bossSpecies ? speciesLabel(bossSpecies) : "a raid boss"} — ranks every affordable power-up by team-DPS
            gained per stardust/candy spent, not raw CP or Attack.
          </>
        ) : (
          <>
            {hydratedPool.length > 0 ? `${hydratedPool.length}-Pokémon imported roster` : "Import a roster below"} vs{" "}
            {assumptions.multiRaidBossIds.length} raid boss{assumptions.multiRaidBossIds.length === 1 ? "" : "es"} —
            ranks every power-up across the WHOLE set, including currently-benched Pokémon that would only earn a
            spot on the team if powered up first.
          </>
        )}
      </p>

      {entryMovesetBadges.size > 0 && (
        <p className="caveats" style={{ marginBottom: 12 }}>
          {entryMovesetBadges.size} imported roster entr{entryMovesetBadges.size === 1 ? "y has an" : "ies have"} unknown
          or unrecognized moveset{entryMovesetBadges.size === 1 ? "" : "s"} and can&rsquo;t be priced for a TM — a TM is
          never suggested against a moveset this tool never observed. Fill{" "}
          {entryMovesetBadges.size === 1 ? "it" : "them"} in on the{" "}
          <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a> to make{" "}
          {entryMovesetBadges.size === 1 ? "it" : "them"} eligible. (The 6-slot roster below is always fully known — its
          own species/move pickers can&rsquo;t leave a move blank — so this count is about your separately-imported
          roster, not the slots above.)
        </p>
      )}

      <PowerUpOptimizerAssumptionPanel
        value={assumptions}
        onChange={setAssumptions}
        slotOptions={slotOptions}
        targetOptions={targetOptions}
        unmatchedRaids={unmatchedRaids}
        slotSpecies={slotSpecies}
        hypotheticalCatchSpecies={hypotheticalCatchSpecies}
        bossSpecies={bossSpecies}
        bossReadySeconds={bossReadySeconds}
        bossHp={bossHp}
        rosterFamilyOptions={rosterFamilyOptions}
      />

      {assumptions.mode === "single-raid" && (
        <SingleRaidResultsSection
          error={result.error}
          bossSpecies={bossSpecies}
          hasFieldedSlot={assumptions.slots.some((s) => s.speciesId)}
          slotSpecies={slotSpecies}
          data={result.data}
          plan={result.plan}
          isOptimizerPending={isOptimizerPending}
          rankBy={assumptions.rankBy}
          showAllCandidates={showAllCandidates}
          onToggleShowAllCandidates={() => setShowAllCandidates((v) => !v)}
          visibleCandidates={visibleCandidates}
          sortedCandidatesCount={sortedCandidates.length}
          secondChargedMoveBlocked={result.secondChargedMoveBlocked}
          eliteTmCandidates={result.eliteTmCandidates}
          eliteTmBlocked={result.eliteTmBlocked}
          eliteFastTmOnHand={assumptions.eliteFastTmOnHand}
          eliteChargedTmOnHand={assumptions.eliteChargedTmOnHand}
        />
      )}

      {assumptions.mode === "multi-raid" && (
        <>
          <MultiRaidResultsSection
            hydratedPoolCount={hydratedPool.length}
            entryIdentities={entryIdentities}
            entryMovesetBadges={entryMovesetBadges}
            pool={hydratedPool}
            rosterDroppedCount={rosterDroppedCount}
            rosterStaleMovesetBadgeCount={rosterStaleMovesetBadgeCount}
            bossCount={assumptions.multiRaidBossIds.length}
            run={multiRaidRun?.result ?? null}
            isRunning={isRunningMultiRaidSweep}
            isStale={isMultiRaidStale}
            ranOn={multiRaidRun?.ranOn ?? null}
            elapsedMs={sweepElapsedMs}
            progress={sweepProgress}
            onRunSweep={handleRunMultiRaidSweep}
            rankBy={assumptions.rankBy}
            significanceMode={assumptions.multiRaidSignificanceMode}
          />
          <MultiRaidBudgetPlanSection
            entryIdentities={entryIdentities}
            entryMovesetBadges={entryMovesetBadges}
            rosterFamilyOptions={rosterFamilyOptions}
            run={multiRaidBudgetRun?.result ?? null}
            isRunning={isRunningMultiRaidBudget}
            isStale={isMultiRaidBudgetStale}
            ranOn={multiRaidBudgetRun?.ranOn ?? null}
            elapsedMs={budgetElapsedMs}
            progress={budgetProgress}
          />
          <MultiRaidMoveChangeSection
            canRun={canRunMoveChange}
            run={moveChangeRun?.result ?? null}
            isRunning={isRunningMoveChange}
            isStale={isMoveChangeStale}
            ranOn={moveChangeRun?.ranOn ?? null}
            elapsedMs={moveChangeElapsedMs}
            onRunSweep={handleRunMoveChangeSweep}
            eliteFastTmOnHand={assumptions.eliteFastTmOnHand}
            eliteChargedTmOnHand={assumptions.eliteChargedTmOnHand}
            entryNameById={entryNameById}
          />

          <CollapsibleSection id="pu-known-caveats-multi" heading="Known caveats" defaultOpen={false}>
            <div className="note-block">
            <details className="prose-details">
              <summary>Roster-wide Mega Level</summary>
              <p>
              Applies ROSTER-WIDE (the imported roster is ~164 Pokémon, so a per-entry control would be unusable),
              and only ever to an entry that can actually Mega Evolve. Feeds the real simulated team-DPS behind
              both the ranked table and the fixed-budget plan.
              </p>
              <p>{MEGA_LEVEL_HINT}</p>
            </details>
            <details className="prose-details">
              <summary>Candy family data</summary>
              <p>
              Poke Genie exports no candy-on-hand column at all — every family starts UNKNOWN, not zero. Fill in only
              the families you care about; an unknown family&rsquo;s candidates are still ranked, just marked
              &ldquo;cost unverified&rdquo; and excluded from the fixed-budget plan below (filling a family in here is
              what UNLOCKS it for that plan — see the &ldquo;Fixed-budget plan&rdquo; section&rsquo;s own
              &ldquo;Excluded from this plan&rdquo; table for exactly which families/species are still missing).
              Pooled per candy FAMILY (e.g. Houndour and Houndoom share one pool), never per species — a mega/primal roster
              entry&rsquo;s candy is resolved from its BASE species&rsquo; family automatically (e.g. Mega Blaziken
              draws Blaziken&rsquo;s candy; labeled below as &ldquo;Blaziken (for Mega Blaziken)&rdquo;), since that
              is whose candy a real power-up actually spends.
              </p>
            </details>
            <details className="prose-details">
              <summary>Boss charged-move cadence model</summary>
              <p>{BOSS_CADENCE_HINT}</p>
            </details>
            <details className="prose-details">
              <summary>Ranking display</summary>
              <p>
              &ldquo;Rank candidates by&rdquo; is display-only — never changes which candidates exist or their own
              numbers, only the sort order of the ranked table (both modes). Stardust and candy are deliberately
              kept as two separate efficiency numbers rather than one blended score, since they aren&rsquo;t
              fungible resources for a real player.
              </p>
            </details>
            <details className="prose-details">
              <summary>Raid timer</summary>
              <p>Real, documented per-tier raid countdown — see raidBoss.ts&rsquo;s RAID_TIER_TABLE.</p>
            </details>
            <details className="prose-details">
              <summary>Best-available-moveset toggle</summary>
              <p>
              A real Poke Genie export routinely has NO recorded charged move for the majority of its rows — every
              such entry simulates on its species&rsquo; own first fast/charged move by default, which under-ranks it
              even when a cheap TM would fix it. This toggle only ever substitutes the highest raw power/duration
              move (the same intrinsic rating MoveSelect shows next to every move option — no STAB, no type
              effectiveness against this boss set) for a slot the import genuinely never recorded; a moveset you
              fixed by hand on the Roster tab is unaffected in either state, since fixing it there clears the
              &ldquo;defaulted&rdquo; flag this toggle keys off. Turning it ON answers a different question than
              OFF does (&ldquo;what&rsquo;s worth investing in&rdquo; vs. &ldquo;what should I power up tonight&rdquo;) —
              neither is more &ldquo;correct,&rdquo; they answer different things. The single-raid TM/second-move
              optimizer above is unaffected either way — it only ever prices a moveset it actually observed.
              </p>
            </details>
            <details className="prose-details">
              <summary>Move-change sweep (second charged move / Elite TM)</summary>
              <p>
              Reuses the main sweep&rsquo;s ALREADY-COMPUTED baseline team per boss — it can never run before that
              sweep has, and re-running the main sweep invalidates it (a fresh &ldquo;stale&rdquo; badge appears).
              A TM candidate is only ever generated for a KNOWN moveset — an entry whose charged-move count (1 vs
              2) was never confirmed is excluded and reported, never guessed against. Elite Fast/Elite Charged TM
              are their OWN non-fungible item currencies, never blended into the stardust/candy ranking or into
              each other — CLAUDE.md&rsquo;s standing decision. Regular (non-Elite) TMs and Frustration removal are
              never modeled: a regular TM&rsquo;s outcome is random and not confirmed uniform, and Frustration
              removal is only actionable during a real-world &ldquo;Taken Over&rdquo; event this tool has no live
              calendar for. There is no joint budget allocator across move changes (unlike the fixed-budget plan
              above for power-ups) — each candidate is priced as if it were the only thing you buy.
              </p>
            </details>
            </div>
          </CollapsibleSection>
        </>
      )}

      <section className="panel">
        <h2>Share this scenario</h2>
        <div className="share-row">
          <button onClick={handleShare}>Build link</button>
          {shareUrl && <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />}
        </div>
        {assumptions.mode === "single-raid" && (
          <>
            <div className="share-row" style={{ marginTop: 8 }}>
              <button type="button" onClick={handleSendToTeamRaid}>
                Send post-plan roster to Team Raid Simulator →
              </button>
            </div>
            <p className="caveats" style={{ marginTop: 8 }}>
              {POWER_UP_OPTIMIZER_EXPORT_MISSING_NOTE}
            </p>
          </>
        )}
        {assumptions.mode === "multi-raid" && (
          <>
            <p className="caveats" style={{ marginTop: 8 }}>
              Sending a roster to Team Raid Simulator is only available in single-raid mode — Team Raid models
              exactly six slots against ONE boss, while this mode&rsquo;s roster (up to ~200 imported Pokémon) and
              boss set have no single unambiguous reduction onto that shape without inventing a silent filter.
            </p>
            <p className="caveats" style={{ marginTop: 8 }}>
              This link carries every SETTING above (boss set, budgets, dodge/weather/timer, etc.) but NOT your
              imported roster — the roster lives only in THIS browser&rsquo;s local storage (a deliberate exception,
              see CLAUDE.md&rsquo;s roster/localStorage exception). A recipient opening this link needs their own
              roster on the Roster tab first (import a Poke Genie CSV, hand-add Pokémon, or load a save code) before
              they see a sweep.
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Roster</h2>
        <p className="species-picker-hint">
          {hydratedPool.length > 0
            ? `${hydratedPool.length} Pokémon in your roster.`
            : "No roster yet."}{" "}
          Import a CSV, hand-add Pokémon, edit entries, or save a code on the{" "}
          <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a>.
        </p>
        {rosterDroppedCount > 0 && (
          <p className="caveats">
            {rosterDroppedCount} stored entr{rosterDroppedCount === 1 ? "y" : "ies"} reference a species this data
            layer no longer has — visit the <a href={`${getBaseUrl()}?view=roster`}>Roster tab</a> to re-import.
          </p>
        )}
      </section>
    </>
  );
}
