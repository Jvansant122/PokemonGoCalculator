import { useMemo, useState } from "react";
import {
  bossChargedMoveReadySeconds,
  bossEffectiveHp,
  MAX_TEAM_RAID_SLOTS,
  type PowerUpBudgetBlockedCandidate,
  type PowerUpBudgetResourceShortfall,
  type PowerUpBudgetStopReason,
  type PowerUpCandidate,
  type RosterBudgetBlockedCandidate,
  type RosterBudgetStep,
  type RosterNeverCompetitiveEntry,
  type RosterPerBossImpact,
  type RosterPowerUpCandidate,
  type SpeciesDefinition,
  type WeightedRaidTarget,
} from "@pogo-analyzer/engine";
import {
  emptyPowerUpSlot,
  PowerUpOptimizerAssumptionPanel,
  type PowerUpOptimizerAssumptions,
  type PowerUpSlotAssumption,
} from "./PowerUpOptimizerAssumptionPanel.js";
import { CollapsibleSection } from "./CollapsibleSection.js";
import {
  buildPowerUpOptimizerScenarioUrl,
  parsePowerUpOptimizerScenarioFromUrl,
  type PowerUpOptimizerScenario,
  type PowerUpRankBy,
} from "./powerUpOptimizerScenario.js";
import { effectiveIsShadow } from "./shadowToggle.js";
import { efficiencyForRankBy, sortCandidatesByEfficiency } from "./powerUpCandidateSort.js";
import { RosterImportPanel } from "./RosterImportPanel.js";
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
import { runPowerUpOptimizerScenario, type PowerUpOptimizerRunResult } from "./run/runPowerUpOptimizer.js";
import {
  resolveRosterPlannerInputs,
  type RosterBudgetPlanRunResult,
  type RosterPlannerBlockedReason,
  type RosterPlannerResolution,
  type RosterPlannerRunResult,
} from "./run/runRosterPlanner.js";
import { runRosterBudgetOffMainThread, runRosterPlannerOffMainThread } from "./rosterPlannerWorkerClient.js";
import { dedupeInterchangeableCandidates, type DedupedRosterCandidateGroup } from "./rosterCandidateDedupe.js";
import type { RosterEntry as ImportedRosterEntry } from "./import/pokeGenieMatch.js";

// A ready-to-run default roster/target so a fresh page load demonstrates real
// ranked results immediately, not an empty form — same precedent as every
// other tab's own DEFAULT_*. Reuses the Team Raid tab's exact default roster
// (one genuine mega slot, five non-mega fillers, vs. tyranitar-mega) so the
// two tabs never accidentally disagree about what a "typical" roster looks
// like, but at VARIED levels (unlike Team Raid's single shared level) since
// this tab's whole point is per-slot power-up headroom.
const DEFAULT_TARGET_ID = "tyranitar-mega";

function defaultSlot(speciesId: string, level: number, isMega: boolean): PowerUpSlotAssumption {
  return {
    speciesId,
    fastMoveId: null,
    chargedMoveId: null,
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
    defaultSlot("latios-mega", 35, true),
    defaultSlot("garchomp", 30, false),
    defaultSlot("dragonite", 40, false),
    defaultSlot("kartana", 38, false),
    defaultSlot("tyranitar", 31, false),
    defaultSlot("rayquaza", 25, false),
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

function candidateEfficiency(c: PowerUpCandidate, rankBy: PowerUpRankBy): number | null {
  return efficiencyForRankBy(rankBy, c.deltaTeamDpsPer1000Stardust, c.deltaTeamDpsPerCandy, c.deltaTeamDpsPerXlCandy);
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
 */
function MultiRaidCandidateRow({ group, identity }: { group: DedupedRosterCandidateGroup; identity?: string }) {
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
          {c.costUnverified && (
            <span className="badge badge-approximate" title="This entry's candy family has no known candy-on-hand — ranked normally, but this cost can't be confirmed affordable.">
              candy unverified
            </span>
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
  initialRows = MULTI_RAID_TABLE_INITIAL_ROWS,
}: {
  sectionId: string;
  heading: string;
  description: string;
  entries: RosterNeverCompetitiveEntry[];
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
            </tr>
          </thead>
          <tbody>
            {visible.map((e, i) => (
              <tr key={`${e.entryId}-${i}`}>
                <td>{e.speciesName}</td>
                <td>{e.reason}</td>
              </tr>
            ))}
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

interface MultiRaidResultsSectionProps {
  hydratedPoolCount: number;
  /** entryId -> a short human identity (IV spread) for the ranked tables — see MultiRaidCandidateRow's `identity`. */
  entryIdentities: Map<string, string>;
  /** The hydrated pool itself — needed (not just entryIdentities) so dedupeInterchangeableCandidates can compare full IV/moveset/cost-modifier identity, not just its display string. */
  pool: ImportedRosterEntry[];
  rosterDroppedCount: number;
  bossCount: number;
  run: RosterPlannerRunResult | null;
  isRunning: boolean;
  isStale: boolean;
  /** null before any sweep has completed, or when the most recent one was blocked before an engine call was even attempted. */
  ranOn: "worker" | "main-thread-fallback" | null;
  elapsedMs: number;
  onRunSweep: () => void;
  /** Same selector single-raid mode already exposes — sorts the ranked table client-side by the chosen resource's efficiency, same as single-raid's own sortedCandidates (CLAUDE.md standing decision: never blended into one score). */
  rankBy: PowerUpRankBy;
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
  pool,
  rosterDroppedCount,
  bossCount,
  run,
  isRunning,
  isStale,
  ranOn,
  elapsedMs,
  onRunSweep,
  rankBy,
}: MultiRaidResultsSectionProps) {
  const [showAllMultiRaidCandidates, setShowAllMultiRaidCandidates] = useState(false);

  // `run?.data?.X ?? []` is deliberately NOT pulled out into its own
  // `const` above these — a fresh `[]` on every render (whenever data is
  // null) would make useMemo's own dependency array change every render too
  // (react-hooks/exhaustive-deps). Depending on `run` itself instead is
  // stable across renders where nothing actually changed.
  const dedupedCandidates = useMemo(() => dedupeInterchangeableCandidates(run?.data?.candidates ?? [], pool), [run, pool]);
  // Re-sorted client-side by the chosen rankBy — same "cheap, bound to the
  // LIVE selector" reasoning as single-raid's own sortedCandidates (kept in
  // sync via powerUpCandidateSort.ts's shared comparator, per CLAUDE.md's
  // standing decision that stardust/candy/XL efficiency are never blended
  // into one score). Sorted AFTER dedup, not before — dedupeInterchangeableCandidates
  // only needs a caller-preferred order to pick which member surfaces first
  // within a group, not to determine the final displayed order.
  const sortedCandidateGroups = useMemo(
    () =>
      sortCandidatesByEfficiency(dedupedCandidates, (group) => ({
        delta: group.representative.meanDeltaTeamDps,
        isSignificant: group.representative.exceedsNoise,
        costStardust: group.representative.cost.stardust,
        efficiency: rosterCandidateEfficiency(group.representative, rankBy),
      })),
    [dedupedCandidates, rankBy],
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
        {isRunning && <span className="species-picker-hint">{(elapsedMs / 1000).toFixed(1)}s elapsed</span>}
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
      </div>

      {!run && !isRunning && (
        <p className="caveats">
          {hydratedPoolCount === 0
            ? "No roster imported in this browser yet — import a Poke Genie CSV export in “Import a whole roster” below, then click “Run sweep”."
            : bossCount === 0
              ? "No bosses selected — pick at least one under “Boss set” above, then click “Run sweep”."
              : "Click “Run sweep” to rank power-ups across this roster and boss set."}
        </p>
      )}

      {run?.error && (
        <p className="error-text">Could not compute this sweep: {run.error}</p>
      )}

      {run?.blockedReason === "no-roster" && (
        <p className="caveats">
          No roster imported in this browser yet — this shared link carries every SETTING (boss set, budgets,
          dodge/weather/timer) but never the roster itself (see the note under &ldquo;Share this scenario&rdquo;).
          Import a Poke Genie CSV export in &ldquo;Import a whole roster&rdquo; below, then click &ldquo;Run
          sweep&rdquo; again.
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
                  <MultiRaidCandidateRow key={group.key} group={group} identity={entryIdentities.get(group.representative.entryId)} />
                ))}
              </tbody>
            </table>
          </div>
          {dedupedCandidates.length > MULTI_RAID_TABLE_INITIAL_ROWS && (
            <button type="button" style={{ marginTop: 8 }} onClick={() => setShowAllMultiRaidCandidates((v) => !v)}>
              {showAllMultiRaidCandidates ? `Show top ${MULTI_RAID_TABLE_INITIAL_ROWS} only` : `Show all ${dedupedCandidates.length}`}
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
                      <MultiRaidCandidateRow key={`bench-${group.key}`} group={group} identity={entryIdentities.get(group.representative.entryId)} />
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
          />
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
function MultiRaidBudgetStepRow({ step, identity, index }: { step: RosterBudgetStep; identity?: string; index: number }) {
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
  /** familyId -> a representative display label — same list PowerUpOptimizerAssumptionPanel's candy editor already builds, reused here so the ledger table names families the same way the editor that unlocks them does. */
  rosterFamilyOptions: { familyId: string; label: string }[];
  run: RosterBudgetPlanRunResult | null;
  isRunning: boolean;
  isStale: boolean;
  ranOn: "worker" | "main-thread-fallback" | null;
  elapsedMs: number;
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
function MultiRaidBudgetPlanSection({ entryIdentities, rosterFamilyOptions, run, isRunning, isStale, ranOn, elapsedMs }: MultiRaidBudgetPlanSectionProps) {
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

      {isRunning && <p className="species-picker-hint">{(elapsedMs / 1000).toFixed(1)}s elapsed</p>}
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
                    <MultiRaidBudgetStepRow key={`${step.entryId}-${step.toLevel}-${i}`} step={step} identity={entryIdentities.get(step.entryId)} index={i} />
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
 */
function runMultiRaidTrackedComputation<TData>(
  resolution: RosterPlannerResolution,
  offMainThread: () => Promise<{ data: TData; ranOn: "worker" | "main-thread-fallback" }>,
  setIsRunning: (v: boolean) => void,
  setElapsedMs: (v: number) => void,
  onFinish: (result: MultiRaidTrackedResult<TData>, ranOn: "worker" | "main-thread-fallback" | null) => void,
): void {
  setIsRunning(true);
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
  visibleCandidates: PowerUpCandidate[];
  sortedCandidatesCount: number;
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
          <p className="caveats">Add at least one Pokémon to the roster above to see ranked power-up candidates.</p>
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
            <div className="table-scroll" style={{ opacity: isOptimizerPending ? 0.55 : 1, transition: "opacity 0.15s ease" }}>
              <table className="time-series-table">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Species</th>
                    <th>Level</th>
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
                  {visibleCandidates.map((c, i) => (
                    <tr key={`${c.slotIndex}-${c.toLevel}-${i}`} style={{ opacity: c.affordable ? 1 : 0.5 }}>
                      <td>{c.slotIndex + 1}</td>
                      <td>{c.speciesName}</td>
                      <td>
                        {c.fromLevel} → {c.toLevel}
                      </td>
                      <td
                        title={
                          c.deltaExceedsNoise
                            ? undefined
                            : `Within ±${data.noiseFloorTeamDps.toFixed(2)} noise floor; the measured delta was ${c.deltaTeamDps >= 0 ? "+" : ""}${c.deltaTeamDps.toFixed(2)}`
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
          </CollapsibleSection>
        </>
      )}

      <CollapsibleSection id="pu-known-caveats-single" heading="Known caveats" defaultOpen={false}>
        <p className="caveats note-block">
          Mega Level (per slot, above): every number on this tab honors each slot's own selected Mega Level —
          baseline, ranked candidates' Δ team DPS, the fixed-budget plan, and the per-slot damage ladder's
          breakpoint check alike. Super Max additionally applies a +2 effective-level bump, whose magnitude is a
          community-consensus figure rather than a published one; a "+" charged move's power scaling by tier is a
          weaker community estimate still. Both are flagged where they surface.
        </p>
        <p className="caveats note-block">
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
          fetched {powerUpCostsFetchedAt.slice(0, 10)} from GAME_MASTER) ignores Eternatus's known per-species
          candy-cost override — this tool does not special-case it. Best Buddy status (a real +1 level beyond the
          normal level-50 cap) is not modelled at all. The Shadow-side
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

  // Lifted up from RosterImportPanel (which used to own this itself) so the
  // multi-raid sweep below can read the SAME pool a CSV import just produced
  // without requiring a page reload — see RosterImportPanel.tsx's own Props
  // doc comment. RosterImportPanel still owns PERSISTENCE (saveRosterPool as
  // a side effect of its own import/clear actions); this is just the
  // canonical in-memory value both it and the sweep now share.
  const [rosterPool, setRosterPool] = useState<RosterPool>(loadRosterPool);
  const { entries: hydratedPool, droppedCount: rosterDroppedCount } = useMemo(
    () => hydrateRosterPool(rosterPool, speciesRegistry),
    [rosterPool],
  );

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
  const result = { data: runResult?.data ?? null, plan: runResult?.plan ?? null, error: runResult?.error ?? null };

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
  // Coarse progress ONLY — running/done/failed, plus elapsed wall-clock time.
  // Deliberately NOT a fabricated percentage: runRosterPlanner has no yield
  // points of its own inside the worker (a genuine per-boss progress event
  // needs an onProgress hook inside packages/engine/src/rosterPlanner.ts —
  // out of scope here, see rosterPlanner.worker.ts's own doc comment).
  // Ticks every 200ms while running via a plain setInterval in the EVENT
  // HANDLER below (not a useEffect — no react-hooks/set-state-in-effect
  // concern), then set once more precisely on completion.
  const [sweepElapsedMs, setSweepElapsedMs] = useState(0);
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
  const isMultiRaidBudgetStale =
    multiRaidBudgetRun !== null && (multiRaidBudgetRun.inputs !== multiRaidInputs || multiRaidBudgetRun.pool !== hydratedPool);

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
      () => runRosterPlannerOffMainThread(resolution.inputs!),
      setIsRunningMultiRaidSweep,
      setSweepElapsedMs,
      (result, ranOn) => setMultiRaidRun({ inputs: snapshotInputs, pool: snapshotPool, result, ranOn }),
    );

    runMultiRaidTrackedComputation(
      resolution,
      () => runRosterBudgetOffMainThread(resolution.inputs!),
      setIsRunningMultiRaidBudget,
      setBudgetElapsedMs,
      (result, ranOn) => setMultiRaidBudgetRun({ inputs: snapshotInputs, pool: snapshotPool, result, ranOn }),
    );
  }

  // Sorting is over the ALREADY-COMPUTED candidates and is cheap — kept bound
  // to the LIVE rankBy (not the debounced snapshot) so switching the sort
  // column is instant, same "cheap display-only work shouldn't wait on the
  // debounce" reasoning as SpeciesReportView's sortedRows. The actual
  // three-group noise-floor-aware order lives in powerUpCandidateSort.ts,
  // shared with multi-raid mode's own ranked-table sort below.
  const sortedCandidates = useMemo(() => {
    const list = result.data?.candidates ?? [];
    return sortCandidatesByEfficiency(list, (c) => ({
      delta: c.deltaTeamDps,
      isSignificant: c.deltaExceedsNoise,
      costStardust: c.cost.stardust,
      efficiency: candidateEfficiency(c, assumptions.rankBy),
    }));
  }, [result.data, assumptions.rankBy]);

  const visibleCandidates = showAllCandidates ? sortedCandidates : sortedCandidates.slice(0, CANDIDATE_TABLE_INITIAL_ROWS);

  function handleShare() {
    const url = new URL(buildPowerUpOptimizerScenarioUrl(getBaseUrl(), assumptionsToScenario(assumptions)));
    url.searchParams.set("view", "power-up-optimizer");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
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

      <PowerUpOptimizerAssumptionPanel
        value={assumptions}
        onChange={setAssumptions}
        slotOptions={slotOptions}
        targetOptions={targetOptions}
        unmatchedRaids={unmatchedRaids}
        slotSpecies={slotSpecies}
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
        />
      )}

      {assumptions.mode === "multi-raid" && (
        <>
          <MultiRaidResultsSection
            hydratedPoolCount={hydratedPool.length}
            entryIdentities={entryIdentities}
            pool={hydratedPool}
            rosterDroppedCount={rosterDroppedCount}
            bossCount={assumptions.multiRaidBossIds.length}
            run={multiRaidRun?.result ?? null}
            isRunning={isRunningMultiRaidSweep}
            isStale={isMultiRaidStale}
            ranOn={multiRaidRun?.ranOn ?? null}
            elapsedMs={sweepElapsedMs}
            onRunSweep={handleRunMultiRaidSweep}
            rankBy={assumptions.rankBy}
          />
          <MultiRaidBudgetPlanSection
            entryIdentities={entryIdentities}
            rosterFamilyOptions={rosterFamilyOptions}
            run={multiRaidBudgetRun?.result ?? null}
            isRunning={isRunningMultiRaidBudget}
            isStale={isMultiRaidBudgetStale}
            ranOn={multiRaidBudgetRun?.ranOn ?? null}
            elapsedMs={budgetElapsedMs}
          />
        </>
      )}

      <section className="panel">
        <h2>Share this scenario</h2>
        <div className="share-row">
          <button onClick={handleShare}>Build link</button>
          {shareUrl && <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />}
        </div>
        {assumptions.mode === "multi-raid" && (
          <p className="caveats" style={{ marginTop: 8 }}>
            This link carries every SETTING above (boss set, budgets, dodge/weather/timer, etc.) but NOT your
            imported roster — the roster lives only in THIS browser&rsquo;s local storage (a deliberate exception,
            see PLAN_multi_raid_roster_optimizer.md §3.2). A recipient opening this link needs to import their own
            Poke Genie CSV (or yours, exported as JSON below) before they see a sweep.
          </p>
        )}
      </section>

      <section className="panel">
        <RosterImportPanel pool={rosterPool} onPoolChange={setRosterPool} />
      </section>
    </>
  );
}
