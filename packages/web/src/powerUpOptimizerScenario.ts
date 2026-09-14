import {
  fromBase64Url,
  MAX_TEAM_RAID_SLOTS,
  toBase64Url,
  type DodgeBehavior,
  type FriendshipLevel,
  type IVSpread,
  type MegaLevel,
  type RosterSignificanceMode,
  type SpeciesDefinition,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import type { BossChargedMoveCadence } from "./bossCadence.js";
import {
  emptyPowerUpSlot,
  type PowerUpOptimizerAssumptions,
  type PowerUpSlotAssumption,
} from "./PowerUpOptimizerAssumptionPanel.js";
import { effectiveIsShadow } from "./shadowToggle.js";
import { speciesRegistry } from "./registry.js";

/**
 * Which resource column the ranked candidate table is sorted by — a
 * display-only choice (never changes what optimizePowerUps computes, only
 * how the rows are ordered), same "still a real setting, still shareable"
 * reasoning as SpeciesReportScenario's own sortMode.
 */
export type PowerUpRankBy = "stardust" | "candy" | "xlCandy";

/**
 * Which of the tab's two computations this scenario drives — see
 * PLAN_multi_raid_roster_optimizer.md §4.1. "single-raid" is the ORIGINAL
 * behavior and must decode byte-for-byte unchanged for a pre-existing share
 * link (see decodePowerUpOptimizerScenario's own `mode ?? "single-raid"`
 * fallback in PowerUpOptimizerView.tsx's scenarioToAssumptions). "multi-raid"
 * ranks power-ups across a whole imported roster (rosterPool.ts, kept OUT of
 * this scenario — see §3.2) against a SET of raid bosses (see
 * multiRaidBossIds below) instead of one 6-slot roster vs. one boss.
 */
export type PowerUpOptimizerMode = "single-raid" | "multi-raid";

/** One "what if I caught a fresh one" row — mirrors PowerUpOptimizerAssumptionPanel.tsx's HypotheticalCatchAssumption exactly (IDEAS.md #3, "add a 7th"). Multi-raid mode only. */
export interface PowerUpHypotheticalCatchScenario {
  speciesId: string | null;
  level: 20 | 25;
}

/** One roster slot's own configuration — mirrors PowerUpSlotAssumption exactly, field for field. */
export interface PowerUpScenarioSlot {
  speciesId: string | null;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  isMega: boolean;
  /**
   * This slot's own Mega Level (see megaLevelSelect.tsx / packages/engine/src/megaLevel.ts)
   * — mirrors PowerUpSlotAssumption.megaLevel exactly, single-raid mode
   * only. `null` means no Mega Level investment assumed (identical to
   * `"base"`).
   */
  megaLevel: MegaLevel | null;
  isShadow: boolean;
  isPurified: boolean;
  isLucky: boolean;
  level: number;
  ivs: IVSpread;
  candyOnHand: number;
  xlCandyOnHand: number;
}

/**
 * The complete, shareable description of one Power-Up Optimizer run — a
 * sibling of scenario.ts's `Scenario`/teamScenario.ts's `TeamScenario`/
 * speciesReportScenario.ts's `SpeciesReportScenario`, not an extension of any
 * of them (this tab's own 6-slot-roster-plus-resources shape doesn't match
 * any existing one). Lives in packages/web (like SpeciesReportScenario), not
 * packages/engine — web-developer does not edit packages/engine, and the
 * base64url-JSON transport (toBase64Url/fromBase64Url) is reused directly
 * from the engine's own scenario.ts export rather than forked again.
 */
export interface PowerUpOptimizerScenario {
  /**
   * Which computation this scenario drives — see PowerUpOptimizerMode.
   * Optional so a link built before multi-raid mode existed decodes as
   * "single-raid" via `s.mode ?? "single-raid"` (PowerUpOptimizerView.tsx's
   * scenarioToAssumptions) rather than surfacing `undefined` — the ORIGINAL
   * single-raid behavior must stay byte-for-byte unchanged for such a link.
   */
  mode?: PowerUpOptimizerMode;
  /** Always exactly MAX_TEAM_RAID_SLOTS entries, in fight order — pad with empty slots rather than shortening the array, same convention as TeamScenario.slots. Only used in "single-raid" mode. */
  slots: PowerUpScenarioSlot[];
  stardustOnHand: number;
  /**
   * A shared, fungible Rare Candy pool (account-wide, not per-species) —
   * consumed only by the fixed-budget planner (planPowerUpBudget), which
   * spends a slot's own candyOnHand first and only draws on this pool once
   * that runs out. Rare Candy converts 1:1 into any species' regular Candy
   * and can NEVER become XL Candy (see powerUp.ts's RARE_CANDY_TO_CANDY_RATIO
   * and MECHANICS.md's "Fungible candy currencies" entry). Optional so a link
   * shared before this field existed decodes via `??` rather than surfacing
   * `undefined`.
   */
  rareCandyOnHand?: number;
  /** Same shared-pool mechanic as rareCandyOnHand, but for the wholly separate Rare Candy XL item (1:1 into XL Candy only — see RARE_CANDY_XL_TO_XL_CANDY_RATIO). Optional for the same old-link reason. */
  rareCandyXlOnHand?: number;
  /** Single-raid mode only. */
  target: string;
  /** Single-raid mode only. */
  bossFastMoveId: string | null;
  /** Single-raid mode only. */
  bossChargedMoveId: string | null;
  /** Shared by both modes. */
  dodgeModel: DodgeBehavior;
  dodgeFastAttacks: boolean;
  holdChargedMoveUntilSafe: boolean;
  weather: WeatherCondition;
  /**
   * Shared by both modes — `rosterPlanner.ts` (the multi-raid engine module)
   * gained its own roster-wide `friendshipLevel` field (see
   * RosterPlannerInputs' own doc comment), so this single top-level scenario
   * field now reaches both engine call shapes: single-raid's
   * `optimizePowerUps`/`powerUpDamageLadder`/`planPowerUpBudget` (see
   * run/runPowerUpOptimizer.ts) and multi-raid's `runRosterPlanner`/
   * `planRosterBudget`/`runRosterMoveChangeCandidates` (see
   * run/runRosterPlanner.ts's `resolveRosterPlannerInputs` and
   * run/runRosterMoveChange.ts). Optional so a link shared before this field
   * existed decodes via `??` rather than surfacing `undefined`. Defaults to
   * `"none"`, matching today's implicit (no bonus) behavior.
   */
  friendshipLevel?: FriendshipLevel;
  bossChargedMoveFrequencySeconds: number;
  /** See bossCadence.tsx's BOSS_CADENCE_HINT. Optional so a link shared before this field existed decodes via `??` rather than surfacing `undefined`. */
  bossChargedMoveCadence?: BossChargedMoveCadence;
  /** Single-raid mode only — RosterPlannerInputs (multi-raid) has no equivalent "boss starts primed" field. */
  bossStartsPrimed: boolean;
  /** Single-raid mode only. */
  bossStartingEnergyFraction: number;
  /** Shared by both modes. */
  raidTimerSeconds: number;
  swapCostSeconds: number;
  reviveCostSeconds: number;
  /** Which resource column the ranked table is sorted by — see PowerUpRankBy. Single-raid mode only (the multi-raid ranked table has no equivalent rank-by control this phase — see PLAN §5 Phase 3's deliberately basic results UI). */
  rankBy: PowerUpRankBy;
  /**
   * The RESOLVED, authoritative boss id list for multi-raid mode — see
   * multiRaidBossSet.ts's own doc comment and PLAN §3.1. NEVER re-derived
   * from `multiRaidIncludePastRaids`/`multiRaidIncludedTiers`/
   * `multiRaidMaxBossCount` below on load; those three exist ONLY to restore
   * the filter UI's display state, and this array is what the sweep actually
   * runs against. Optional/defaults to `[]` so a pre-multi-raid link decodes
   * cleanly (that link's `mode` is also absent, so this never mattered to it
   * anyway).
   */
  multiRaidBossIds?: string[];
  /** Display-only restoration of the boss-set filter UI — see multiRaidBossIds above for why this is NEVER what the sweep itself reads. Optional, defaults to false. */
  multiRaidIncludePastRaids?: boolean;
  /** See multiRaidIncludePastRaids. null = every tier; an array is an explicit checked-tier allow-list. Optional, defaults to null. */
  multiRaidIncludedTiers?: string[] | null;
  /** See multiRaidIncludePastRaids. Optional, defaults to 30. */
  multiRaidMaxBossCount?: number;
  /**
   * Candy on hand, pooled per `candyFamilyId` — see
   * RosterPlannerInputs.candyByFamilyId in rosterPlanner.ts and PLAN §3.4's
   * "UPDATE 2026-09-09" note (pooled per FAMILY, not per species, since 25+
   * families hold more than one roster entry on a real export). A family
   * absent from this map means "unknown," never "0" — every candidate
   * drawing on that family is reported `costUnverified: true` rather than
   * silently treated as unaffordable. Optional/defaults to `{}` (every
   * family unknown) so a pre-multi-raid link decodes cleanly.
   */
  candyByFamilyId?: Record<string, { candy: number; xlCandy: number } | undefined>;
  /**
   * Multi-raid mode only — see PowerUpOptimizerAssumptions.multiRaidMegaLevel
   * for the full contract (a single roster-wide setting, unlike single-raid
   * mode's per-slot `slots[].megaLevel` above) and it is applied for real:
   * `rosterPlanner.ts` takes it as `RosterPlannerInputs.megaLevel`, and both
   * planner entry points feed it into the simulated team DPS.
   * Optional/defaults to `null` so a pre-existing link decodes cleanly.
   */
  multiRaidMegaLevel?: MegaLevel | null;
  /**
   * Multi-raid mode only — which candidates QUALIFY as significant in the
   * ranked sweep and the fixed-budget plan (see rosterPlanner.ts's own
   * `RosterSignificanceMode` doc comment). Never changes what's REPORTED —
   * `bestBossDeltaTeamDps`/`significantBossCount` stay on every row either
   * way, per CLAUDE.md's ranking-flip thesis.
   *
   * Optional so a link built before this field existed decodes to
   * `DEFAULT_ASSUMPTIONS.multiRaidSignificanceMode` (`"aggregate-only"`),
   * same plain fallback as every other field (PowerUpOptimizerView.tsx's
   * scenarioToAssumptions). Used to invert to `"aggregate-or-per-boss"` so
   * an old link's meaning never silently changed; that requirement is gone
   * — see CLAUDE.md's "Backward compatibility with OLD share links is NOT
   * required" (2026-09-10).
   */
  multiRaidSignificanceMode?: RosterSignificanceMode;
  /**
   * Multi-raid mode only — IDEAS.md #11, see
   * PowerUpOptimizerAssumptions.multiRaidUseBestAvailableMoveset for the full
   * contract. Optional/defaults to `false` (today's implicit behavior: every
   * entry simulates on its recorded, possibly-defaulted moveset) so a link
   * shared before this field existed decodes cleanly.
   */
  multiRaidUseBestAvailableMoveset?: boolean;
  /**
   * Multi-raid mode only — IDEAS.md #3, "add a 7th": species/level rows to
   * compare against a fresh raid catch. See
   * PowerUpOptimizerAssumptions.multiRaidHypotheticalCatches for the full
   * contract (never priced, never part of the fixed-budget plan). Optional/
   * defaults to `[]` so a link shared before this field existed decodes
   * cleanly.
   */
  multiRaidHypotheticalCatches?: PowerUpHypotheticalCatchScenario[];
  /**
   * TM inventory (PLAN_tm_move_change_optimizer.md web half) — account-wide,
   * like rareCandyOnHand/rareCandyXlOnHand, not per-slot, and shared between
   * BOTH modes (single-raid AND multi-raid read the same four fields — see
   * PowerUpOptimizerAssumptionPanel.tsx, widened from single-raid-only when
   * the multi-raid move-change sweep started consuming the two Elite TM
   * fields). `null` (the default) means UNKNOWN, never 0 — the same "don't
   * gate the sweep on a typed number the field researcher would have to
   * alt-tab to look up" convention as multiRaidBossIds' own candyByFamilyId.
   * `fastTmOnHand`/`chargedTmOnHand` are purely informational in EITHER mode
   * — no regular-TM lottery is modeled anywhere, see PLAN's "Regular TMs — do
   * not build the lottery". Optional so a link shared before these fields
   * existed decodes via `?? null`.
   */
  fastTmOnHand?: number | null;
  chargedTmOnHand?: number | null;
  /**
   * See fastTmOnHand for the shared shape. In single-raid mode, frames the
   * Elite Fast TM candidate section's "your N Elite TMs, best N targets"
   * heading — never gates which candidates are generated there (every
   * candidate is still simulated and ranked regardless). In MULTI-RAID mode,
   * this ALSO feeds a real engine input
   * (`RosterMoveChangeInputs.eliteFastTmOnHand`, run/runRosterMoveChange.ts)
   * that sets each `RosterEliteTmCandidate.affordable` flag directly — a
   * genuinely different consumption than single-raid's display-only framing,
   * not just a second UI for the same computation.
   */
  eliteFastTmOnHand?: number | null;
  /** See fastTmOnHand/eliteFastTmOnHand, for Elite Charged TM. */
  eliteChargedTmOnHand?: number | null;
}

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
  // Shared by both modes — see PowerUpOptimizerAssumptions.friendshipLevel's own doc comment.
  friendshipLevel: "none",
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
    friendshipLevel: a.friendshipLevel,
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
    // `??` guards a scenario URL encoded before this field existed rather
    // than surfacing `undefined` into the friendship <select>.
    friendshipLevel: s.friendshipLevel ?? DEFAULT_ASSUMPTIONS.friendshipLevel,
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

/** Resolves a species id against the registry, tolerating `null`/an unknown id — shared by normalizePowerUpAssumptions below and PowerUpOptimizerView's own per-slot/boss species lookups. */
export function resolveSpecies(id: string | null): SpeciesDefinition | null {
  return id && speciesRegistry.has(id) ? speciesRegistry.get(id) : null;
}

// clampHalfLevel/clampIv live in run/runPowerUpOptimizer.ts, applied only
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

function encodePowerUpOptimizerScenario(scenario: PowerUpOptimizerScenario): string {
  const json = JSON.stringify(scenario);
  return toBase64Url(new TextEncoder().encode(json));
}

function decodePowerUpOptimizerScenario(encoded: string): PowerUpOptimizerScenario {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  return JSON.parse(json) as PowerUpOptimizerScenario;
}

/**
 * A separate query param from every other tab's own ("s"/"ts"/"sr"/"ivc"/
 * "adb") — see App.tsx's tab-switcher, which stamps a matching `view=` param
 * onto every generated share link.
 */
const POWER_UP_OPTIMIZER_SCENARIO_QUERY_PARAM = "pu";

export function buildPowerUpOptimizerScenarioUrl(baseUrl: string, scenario: PowerUpOptimizerScenario): string {
  const url = new URL(baseUrl);
  url.searchParams.set(POWER_UP_OPTIMIZER_SCENARIO_QUERY_PARAM, encodePowerUpOptimizerScenario(scenario));
  return url.toString();
}

export function parsePowerUpOptimizerScenarioFromUrl(url: string): PowerUpOptimizerScenario | null {
  const encoded = new URL(url).searchParams.get(POWER_UP_OPTIMIZER_SCENARIO_QUERY_PARAM);
  return encoded ? decodePowerUpOptimizerScenario(encoded) : null;
}

/** PowerUpOptimizerView's initial `useState` seed — a share link if the page loaded with one, otherwise DEFAULT_ASSUMPTIONS. */
export function initialAssumptions(): PowerUpOptimizerAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parsePowerUpOptimizerScenarioFromUrl(window.location.href);
  return fromUrl ? normalizePowerUpAssumptions(scenarioToAssumptions(fromUrl)) : DEFAULT_ASSUMPTIONS;
}
