import type {
  PowerUpBudgetBlockedCandidate,
  PowerUpBudgetResourceShortfall,
  PowerUpBudgetStopReason,
  RosterBudgetBlockedCandidate,
  SpeciesDefinition,
} from "@pogo-analyzer/engine";
import type { PowerUpRankBy } from "./powerUpOptimizerScenario.js";

/**
 * Pure prose/label helpers shared by both PowerUpOptimizerView's single-raid
 * and multi-raid sections — extracted 2026-09-14 as a navigability pass over
 * a 2,984-line view file, no behavior change. Every function here is a plain
 * string transform with no React/DOM dependency, which is exactly what made
 * this the lowest-risk cluster to pull out after the codec (see
 * powerUpOptimizerScenario.ts's own DEFAULT_ASSUMPTIONS/assumptionsToScenario/
 * scenarioToAssumptions/normalizePowerUpAssumptions/initialAssumptions,
 * extracted in the same pass).
 */

export function speciesLabel(s: SpeciesDefinition): string {
  return s.isHypothetical ? `${s.name} (hypothetical)` : s.name;
}

export function rankByLabel(rankBy: PowerUpRankBy): string {
  if (rankBy === "stardust") return "team-DPS gained per 1000 stardust";
  if (rankBy === "candy") return "team-DPS gained per candy";
  return "team-DPS gained per XL candy";
}

/** "10 yours + 2 Rare" / "10 yours" / "2 Rare" / "—" — the own-vs-shared split the engine reports per step, made visible rather than collapsed into one total. */
export function formatResourceSplit(ownSpent: number, sharedSpent: number, sharedLabel: string): string {
  if (ownSpent === 0 && sharedSpent === 0) return "—";
  if (sharedSpent === 0) return `${ownSpent} yours`;
  if (ownSpent === 0) return `${sharedSpent} ${sharedLabel}`;
  return `${ownSpent} yours + ${sharedSpent} ${sharedLabel}`;
}

/**
 * Single-raid mode's "why we can't recommend anything" fallback for the
 * Recommendation section — see dodgeFastAttackLockout.ts. `PowerUpEncounterSummary`
 * (this tab's own baseline/candidate summary type) never propagates the
 * per-run `dodgeFastAttacksLockout` flag that `TeamRaidSlotResult`/
 * `DistributionSummary` carry elsewhere (Comparator/Team Raid/Species Report
 * all read that flag straight off their own result types; this tab's
 * `summarizeResults` just never kept it) — so `dodgeFastAttacksLockoutActive`
 * here is computed directly from the SAME deterministic inputs the engine
 * itself checks (`dodgeFastAttacks && fastMoveCadenceTooFastToDodge(bossFastMove)`),
 * not read off a result field that doesn't exist. This is safe specifically
 * BECAUSE the fact is config-level, not a simulated one — every run under a
 * given boss/toggle pairing has the identical lockout state, never
 * seed-dependent, so there's nothing probabilistic being re-derived here.
 *
 * When the lockout is active, EVERY simulated delta reads as ≈0 for a reason
 * that has nothing to do with this roster's actual power-up headroom — so
 * the normal "may already be past its useful power-up headroom" conclusion
 * is actively false in that state, not just unhelpful, and gets replaced
 * rather than merely supplemented. Exported so this file's own vitest smoke
 * covers both branches directly.
 */
export function noAffordableImprovementSentence(
  noiseFloorTeamDps: number,
  dodgeFastAttacksLockoutActive: boolean,
  fastAttackLockoutResultNote: string | null,
): string {
  if (dodgeFastAttacksLockoutActive && fastAttackLockoutResultNote) {
    return `${fastAttackLockoutResultNote} That's also why nothing here reads as an improvement — this says nothing about whether this roster still has real power-up headroom against this boss.`;
  }
  return `Nothing affordable improves team DPS beyond the ±${noiseFloorTeamDps.toFixed(2)} noise floor — try raising stardust/candy on hand, or this roster may already be past its useful power-up headroom against this boss.`;
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
export function budgetStopReasonSentence(stopReason: PowerUpBudgetStopReason, noiseFloorTeamDps: number): string {
  switch (stopReason) {
    case "max-level-reached":
      return "Stopped because every fielded slot has already reached level 50 — there's no further power-up headroom left to spend on, regardless of budget.";
    case "no-eligible-entries":
      return "This plan never actually ran — every entry in your roster pool was excluded before evaluation, most commonly because candy on hand isn't filled in for any of them yet. See the \"Excluded from this plan\" table below for the specific reason per entry; filling in candy counts is usually the fastest way to make entries eligible.";
    case "budget-exhausted":
      return "Stopped because useful power-up headroom remains on at least one slot, but nothing left is affordable within the stardust/candy/XL you have on hand.";
    case "no-significant-candidate":
      return `You still have budget left because nothing else measurably beats the ±${noiseFloorTeamDps.toFixed(2)} team-DPS noise floor — the remaining stardust/candy is left unspent on purpose, not overlooked.`;
    case "round-cap-reached":
      return "Stopped only because the search hit its internal round-safety cap, before resolving naturally via budget or a real breakpoint — unusual for a normal roster/budget; treat this plan as a lower bound, not a definitive optimum.";
  }
}

/** "9,000 stardust" / "67 Candy" / "12 XL Candy" — one shortfall, plainly named, resource kept separate per CLAUDE.md's standing decision (never blended into one composite "% more budget" figure). */
export function formatShortfall(s: PowerUpBudgetResourceShortfall): string {
  if (s.resource === "stardust") return `${s.shortfall.toLocaleString()} stardust`;
  if (s.resource === "candy") return `${s.shortfall.toLocaleString()} Candy`;
  return `${s.shortfall.toLocaleString()} XL Candy`;
}

/** "a" / "a and b" / "a, b, and c" — a plain English list, used so 2+ simultaneous shortfalls (the common real case: short on both stardust AND candy at once) read as a sentence, not a comma-splice. */
export function joinWithAnd(parts: string[]): string {
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
 * see RosterBudgetBlockedCandidate's own doc comment). Exported only so
 * PowerUpOptimizerView.tsx can import it cross-module — unlike
 * `blockedCandidateSentence`, the CLI never reaches this one, since the
 * roster is localStorage-only and `run-scenario.ts` cannot run the roster
 * budget.
 */
export function rosterBlockedCandidateSentence(blocked: RosterBudgetBlockedCandidate): string {
  const shortfallText = joinWithAnd(blocked.shortfalls.map(formatShortfall));
  return `Next real gain: ${blocked.speciesName} Lv${blocked.fromLevel} → Lv${blocked.toLevel}, +${blocked.meanDeltaTeamDps.toFixed(2)} mean team DPS — you're short ${shortfallText}.`;
}
