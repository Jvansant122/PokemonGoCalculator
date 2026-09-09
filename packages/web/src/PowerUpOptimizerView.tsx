import { useMemo, useState } from "react";
import {
  bossChargedMoveReadySeconds,
  bossEffectiveHp,
  MAX_TEAM_RAID_SLOTS,
  type PowerUpBudgetBlockedCandidate,
  type PowerUpBudgetPlan,
  type PowerUpBudgetResourceShortfall,
  type PowerUpCandidate,
  type SpeciesDefinition,
} from "@pogo-analyzer/engine";
import {
  emptyPowerUpSlot,
  PowerUpOptimizerAssumptionPanel,
  type PowerUpOptimizerAssumptions,
  type PowerUpSlotAssumption,
} from "./PowerUpOptimizerAssumptionPanel.js";
import {
  buildPowerUpOptimizerScenarioUrl,
  parsePowerUpOptimizerScenarioFromUrl,
  type PowerUpOptimizerScenario,
  type PowerUpRankBy,
} from "./powerUpOptimizerScenario.js";
import { effectiveIsShadow } from "./shadowToggle.js";
import { RosterImportPanel } from "./RosterImportPanel.js";
import { useDebouncedValue } from "./useDebouncedValue.js";
import { getBaseUrl } from "./urlUtils.js";
import {
  candidatePickerOptions,
  powerUpCostsFetchedAt,
  raidTierForSpeciesId,
  speciesRegistry,
  targetPickerOptions,
  unmatchedActiveRaids,
} from "./registry.js";
import { runPowerUpOptimizerScenario } from "./run/runPowerUpOptimizer.js";

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
};

export function assumptionsToScenario(a: PowerUpOptimizerAssumptions): PowerUpOptimizerScenario {
  return {
    slots: a.slots.map((s) => ({
      speciesId: s.speciesId,
      fastMoveId: s.fastMoveId,
      chargedMoveId: s.chargedMoveId,
      isMega: s.isMega,
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
  };
}

export function scenarioToAssumptions(s: PowerUpOptimizerScenario): PowerUpOptimizerAssumptions {
  const slots: PowerUpSlotAssumption[] = s.slots.map((slot) => ({
    speciesId: slot.speciesId ?? null,
    fastMoveId: slot.fastMoveId ?? null,
    chargedMoveId: slot.chargedMoveId ?? null,
    isMega: slot.isMega ?? false,
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
  if (rankBy === "stardust") return c.deltaTeamDpsPer1000Stardust;
  if (rankBy === "candy") return c.deltaTeamDpsPerCandy;
  return c.deltaTeamDpsPerXlCandy;
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
 * differently-worded tools bolted together.
 */
function budgetStopReasonSentence(plan: PowerUpBudgetPlan): string {
  switch (plan.stopReason) {
    case "max-level-reached":
      return "Stopped because every fielded slot has already reached level 50 — there's no further power-up headroom left to spend on, regardless of budget.";
    case "budget-exhausted":
      return "Stopped because useful power-up headroom remains on at least one slot, but nothing left is affordable within the stardust/candy/XL you have on hand.";
    case "no-significant-candidate":
      return `You still have budget left because nothing else measurably beats the ±${plan.noiseFloorTeamDps.toFixed(2)} team-DPS noise floor — the remaining stardust/candy is left unspent on purpose, not overlooked.`;
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

const CANDIDATE_TABLE_INITIAL_ROWS = 30;

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

  const runResult = useMemo(
    () => runPowerUpOptimizerScenario(debouncedOptimizerAssumptions, speciesRegistry),
    [debouncedOptimizerAssumptions],
  );
  const result = { data: runResult.data, plan: runResult.plan, error: runResult.error };

  // Sorting is over the ALREADY-COMPUTED candidates and is cheap — kept bound
  // to the LIVE rankBy (not the debounced snapshot) so switching the sort
  // column is instant, same "cheap display-only work shouldn't wait on the
  // debounce" reasoning as SpeciesReportView's sortedRows.
  //
  // Three-group order (noise-floor-aware, not a plain delta sort): (1) rows
  // beyond the noise floor with a positive delta, by the chosen efficiency
  // descending (null efficiency still sinks within this group — nothing to
  // divide by, not a zero result); (2) rows inside the noise floor — "no
  // measurable change" — by stardust cost ascending, cheapest first; (3)
  // rows beyond the noise floor with a negative delta, most negative last
  // (a genuinely-confirmed-bad power-up, sorted worst-to-least-bad).
  const sortedCandidates = useMemo(() => {
    const list = result.data?.candidates ?? [];
    const group = (c: PowerUpCandidate): 0 | 1 | 2 => {
      if (!c.deltaExceedsNoise) return 1;
      return c.deltaTeamDps > 0 ? 0 : 2;
    };
    return [...list].sort((a, b) => {
      const ga = group(a);
      const gb = group(b);
      if (ga !== gb) return ga - gb;
      if (ga === 0) {
        const ea = candidateEfficiency(a, assumptions.rankBy);
        const eb = candidateEfficiency(b, assumptions.rankBy);
        if (ea === null && eb === null) return 0;
        if (ea === null) return 1;
        if (eb === null) return -1;
        return eb - ea;
      }
      if (ga === 1) return a.cost.stardust - b.cost.stardust;
      // ga === 2: most-negative delta last.
      return b.deltaTeamDps - a.deltaTeamDps;
    });
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
        {rosterNames.length > 0 ? rosterNames.join(", ") : "Build a 6-slot roster"} vs{" "}
        {bossSpecies ? speciesLabel(bossSpecies) : "a raid boss"} — ranks every affordable power-up by team-DPS
        gained per stardust/candy spent, not raw CP or Attack.
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
      />

      {result.error && (
        <section className="panel">
          <p className="error-text">Could not compute this optimizer run: {result.error}</p>
        </section>
      )}

      {!bossSpecies && (
        <section className="panel">
          <p className="caveats">Pick a raid target above to see ranked power-up candidates.</p>
        </section>
      )}

      {bossSpecies && !assumptions.slots.some((s) => s.speciesId) && (
        <section className="panel">
          <p className="caveats">Add at least one Pokémon to the roster above to see ranked power-up candidates.</p>
        </section>
      )}

      {result.data && (
        <>
          <section className="panel">
            <h2>
              Baseline — roster as-is
              {isOptimizerPending && (
                <span
                  className="badge badge-pending"
                  title="Inputs have changed since this was last computed — it still reflects the previous roster/boss/assumption settings and will refresh automatically a moment after you stop changing them."
                >
                  recomputing…
                </span>
              )}
            </h2>
            <div className="result-card" style={{ opacity: isOptimizerPending ? 0.55 : 1, transition: "opacity 0.15s ease" }}>
              <div className="stat-tile-headline">
                <span className="stat-tile-value">{result.data.baseline.teamDps.toFixed(1)}</span>
                <span className="stat-tile-unit">team DPS</span>
              </div>
              <dl>
                <dt>Boss HP</dt>
                <dd>{result.data.bossHp.toLocaleString()}</dd>
                <dt>Clear rate</dt>
                <dd>{(result.data.baseline.clearRate * 100).toFixed(0)}%</dd>
                <dt>Mean time to clear</dt>
                <dd>
                  {result.data.baseline.meanTimeToClearSeconds === null
                    ? "never (in these simulated runs)"
                    : `${result.data.baseline.meanTimeToClearSeconds.toFixed(1)}s`}
                </dd>
                <dt>Team DPS</dt>
                <dd>{result.data.baseline.teamDps.toFixed(1)}</dd>
                <dt
                  title={`A candidate's |delta team DPS| below this band is indistinguishable from seed-to-seed jitter in these ${result.data.iterations} simulated runs, not a real effect — see the ranked table below for how this is applied.`}
                >
                  Noise floor
                </dt>
                <dd>
                  ±{result.data.noiseFloorTeamDps.toFixed(2)} team DPS ({result.data.iterations} seeds)
                </dd>
              </dl>
            </div>
          </section>

          <section className="panel">
            <h2>Per-slot damage ladder against {bossSpecies ? speciesLabel(bossSpecies) : "this boss"}</h2>
            <p className="caveats" style={{ marginBottom: 12 }}>
              Real Pokémon GO damage is floored per hit — a power-up can raise Attack and change nothing until it
              crosses a real breakpoint here. "No further breakpoint before level 50" means every remaining power-up
              for that move is cost with zero per-hit damage change against THIS boss's real Defense stat.
            </p>
            <div className="result-row" style={{ flexWrap: "wrap" }}>
              {assumptions.slots.map((slot, i) => {
                const species = slotSpecies[i];
                const ladder = result.data!.ladders[i];
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
          </section>

          <section className="panel">
            <h2>Recommendation</h2>
            <p className="caveats" style={{ color: "var(--text)" }}>
              {!result.data.bestAffordableByDelta && !result.data.bestAffordableByStardustEfficiency
                ? `Nothing affordable improves team DPS beyond the ±${result.data.noiseFloorTeamDps.toFixed(2)} noise floor — try raising stardust/candy on hand, or this roster may already be past its useful power-up headroom against this boss.`
                : (
                    <>
                      {result.data.bestAffordableByStardustEfficiency && (
                        <>
                          Best stardust efficiency: Slot {result.data.bestAffordableByStardustEfficiency.slotIndex + 1} (
                          {result.data.bestAffordableByStardustEfficiency.speciesName}) Lv{" "}
                          {result.data.bestAffordableByStardustEfficiency.fromLevel} → {result.data.bestAffordableByStardustEfficiency.toLevel}{" "}
                          (+{result.data.bestAffordableByStardustEfficiency.deltaTeamDps.toFixed(2)} team DPS,{" "}
                          {result.data.bestAffordableByStardustEfficiency.deltaTeamDpsPer1000Stardust?.toFixed(3)} per 1000 stardust).{" "}
                        </>
                      )}
                      {result.data.bestAffordableByDelta && (
                        <>
                          Biggest raw team-DPS gain: Slot {result.data.bestAffordableByDelta.slotIndex + 1} (
                          {result.data.bestAffordableByDelta.speciesName}) Lv {result.data.bestAffordableByDelta.fromLevel} →{" "}
                          {result.data.bestAffordableByDelta.toLevel} (+{result.data.bestAffordableByDelta.deltaTeamDps.toFixed(2)} team
                          DPS)
                          {result.data.bestAffordableByDelta.slotIndex === result.data.bestAffordableByStardustEfficiency?.slotIndex &&
                          result.data.bestAffordableByDelta.toLevel === result.data.bestAffordableByStardustEfficiency?.toLevel
                            ? " — the same candidate as above."
                            : " — a DIFFERENT candidate than the most stardust-efficient one above, since a bigger absolute gain doesn't have to be the cheapest one."}
                        </>
                      )}
                    </>
                  )}
            </p>
          </section>

          {result.plan && (
            <section className="panel">
              <h2>Fixed-budget power-up plan</h2>
              <p className="caveats" style={{ marginBottom: 12 }}>
                A DIFFERENT question than the ranked table below: given your WHOLE stardust/Rare
                Candy/Rare Candy XL budget across every fielded slot at once (not one candidate at
                a time), what SET of power-ups should you make? A greedy multi-slot search — a
                step is only committed once its own marginal team-DPS gain measurably beats the
                noise floor. That floor is re-measured from the roster's own seed-to-seed variance
                after every committed step rather than fixed once at the start, because powering a
                roster up changes how much it varies run to run — so steps within one plan can be
                held to different bars, and each step below shows the one it actually had to clear.
                The ±{result.plan.noiseFloorTeamDps.toFixed(2)} quoted elsewhere in this section is
                the FINAL floor, in effect when the search stopped.
              </p>

              {result.plan.bestBlockedCandidate ? (
                <div className="blocked-gain-callout">
                  <strong>Blocked, not done</strong>
                  {blockedCandidateSentence(result.plan.bestBlockedCandidate)} This plan stopped
                  here because that upgrade isn't affordable yet — not because it wouldn't help.
                </div>
              ) : (
                <div className="blocked-gain-callout">
                  <strong>Nothing further measurably helps</strong>
                  Beyond the steps below, no further useful power-up anywhere on this roster clears
                  the ±{result.plan.noiseFloorTeamDps.toFixed(2)} team-DPS noise floor against this
                  boss and budget — this plan is genuinely done, not just out of money.
                </div>
              )}

              <div className="result-card">
                <dl>
                  <dt>Baseline team DPS (roster as-is)</dt>
                  <dd>{result.plan.baseline.teamDps.toFixed(2)}</dd>
                  <dt>Final team DPS (after this plan)</dt>
                  <dd>{result.plan.final.teamDps.toFixed(2)}</dd>
                  <dt>Change</dt>
                  <dd>
                    {result.plan.final.teamDps >= result.plan.baseline.teamDps ? "+" : ""}
                    {(result.plan.final.teamDps - result.plan.baseline.teamDps).toFixed(2)} team DPS
                    {result.plan.baseline.teamDps > 0 &&
                      ` (${(((result.plan.final.teamDps - result.plan.baseline.teamDps) / result.plan.baseline.teamDps) * 100).toFixed(1)}% over baseline)`}
                  </dd>
                  <dt>Stardust spent</dt>
                  <dd>
                    {result.plan.ledger.stardust.spent.toLocaleString()} ({result.plan.ledger.stardust.remaining.toLocaleString()}{" "}
                    left)
                  </dd>
                  <dt>Shared Rare Candy spent</dt>
                  <dd>
                    {result.plan.ledger.sharedRareCandy.spent} ({result.plan.ledger.sharedRareCandy.remaining} left)
                  </dd>
                  <dt>Shared Rare Candy XL spent</dt>
                  <dd>
                    {result.plan.ledger.sharedRareCandyXl.spent} ({result.plan.ledger.sharedRareCandyXl.remaining} left)
                  </dd>
                </dl>
              </div>

              {result.plan.steps.length > 0 ? (
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
                      {result.plan.steps.map((step, i) => (
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
                {budgetStopReasonSentence(result.plan)}
              </p>

              <h3 style={{ marginTop: 16 }}>What's left, per slot</h3>
              <div className="result-row" style={{ flexWrap: "wrap" }}>
                {slotSpecies.map((species, i) => {
                  const finalLevel = result.plan!.finalLevels[i];
                  const ownCandy = result.plan!.ledger.ownCandy[i];
                  const ownXl = result.plan!.ledger.ownXlCandy[i];
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
            </section>
          )}

          <section className="panel">
            <h2>
              Ranked power-up candidates
              <span className="species-picker-hint" style={{ marginLeft: 8 }}>
                grouped: measurable gains first (sorted by {rankByLabel(assumptions.rankBy)}, descending), then within-noise
                rows (cheapest first), then measurable losses last (worst first)
              </span>
            </h2>
            <p className="caveats" style={{ marginBottom: 12 }}>
              Rows with no {assumptions.rankBy === "stardust" ? "stardust" : assumptions.rankBy === "candy" ? "candy" : "XL candy"} cost
              (e.g. a pure-XL step has no regular-candy cost, and vice versa) show "—" for that column's efficiency and sink to the
              bottom of the first group — there is nothing to divide by, not a zero result. A row whose |Δ team DPS| is inside this
              run's ±{result.data.noiseFloorTeamDps.toFixed(2)} noise floor shows "≈0" instead of a signed number and "—" for every
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
                            : `Within ±${result.data!.noiseFloorTeamDps.toFixed(2)} noise floor; the measured delta was ${c.deltaTeamDps >= 0 ? "+" : ""}${c.deltaTeamDps.toFixed(2)}`
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
            {sortedCandidates.length > CANDIDATE_TABLE_INITIAL_ROWS && (
              <button type="button" style={{ marginTop: 8 }} onClick={() => setShowAllCandidates((v) => !v)}>
                {showAllCandidates ? `Show top ${CANDIDATE_TABLE_INITIAL_ROWS} only` : `Show all ${sortedCandidates.length}`}
              </button>
            )}
          </section>
        </>
      )}

      <section className="panel">
        <h2>Share this scenario</h2>
        <div className="share-row">
          <button onClick={handleShare}>Build link</button>
          {shareUrl && <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />}
        </div>
      </section>

      <section className="panel">
        <h2>Known caveats</h2>
        <p className="caveats note-block">
          v1, rudimentary scope: every candidate above is a SINGLE-SLOT power-up — no multi-slot plans (e.g. "power up
          two Pokémon together") and no "add a hypothetical 7th Pokémon" candidates. Each candidate/baseline number is
          the mean of {result.data ? result.data.iterations : 20} paired-seed (common-random-numbers) team-raid runs, not one
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
      </section>

      <section className="panel">
        <RosterImportPanel />
      </section>
    </>
  );
}
