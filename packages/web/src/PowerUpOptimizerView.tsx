import { useMemo, useState } from "react";
import {
  bossChargedMoveReadySeconds,
  bossEffectiveHp,
  MAX_TEAM_RAID_SLOTS,
  optimizePowerUps,
  type PowerUpCandidate,
  type PowerUpOptimizerInputs,
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
import { applyShadowToggle, effectiveIsShadow } from "./shadowToggle.js";
import { useDebouncedValue } from "./useDebouncedValue.js";
import { getBaseUrl } from "./urlUtils.js";
import {
  candidatePickerOptions,
  powerUpCostTable,
  powerUpCostsFetchedAt,
  raidTierForSpeciesId,
  speciesRegistry,
  targetPickerOptions,
  unmatchedActiveRaids,
} from "./registry.js";

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

const DEFAULT_ASSUMPTIONS: PowerUpOptimizerAssumptions = {
  slots: [
    defaultSlot("latios-mega", 35, true),
    defaultSlot("garchomp", 30, false),
    defaultSlot("dragonite", 40, false),
    defaultSlot("kartana", 38, false),
    defaultSlot("tyranitar", 31, false),
    defaultSlot("rayquaza", 25, false),
  ],
  stardustOnHand: 200000,
  targetId: DEFAULT_TARGET_ID,
  bossFastMoveId: null,
  bossChargedMoveId: null,
  dodge: { kind: "none" },
  dodgeFastAttacks: false,
  holdChargedMoveUntilSafe: false,
  weather: "none",
  bossChargedMoveFrequencySeconds: 15,
  bossChargedMoveCadence: "fixed-interval",
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0.5,
  raidTimerSeconds: 300,
  swapCostSeconds: 0,
  reviveCostSeconds: 0,
  rankBy: "stardust",
};

function assumptionsToScenario(a: PowerUpOptimizerAssumptions): PowerUpOptimizerScenario {
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

function scenarioToAssumptions(s: PowerUpOptimizerScenario): PowerUpOptimizerAssumptions {
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
    reviveCostSeconds: s.reviveCostSeconds ?? 0,
    rankBy: s.rankBy ?? "stardust",
  };
}

function resolveSpecies(id: string | null): SpeciesDefinition | null {
  return id && speciesRegistry.has(id) ? speciesRegistry.get(id) : null;
}

/** Rounds to the nearest half-level and clamps to [1, 50] — powerUpCost/powerUpDamageLadder both throw on a non-half-level or an out-of-range level, and a live-typed number input can transiently be neither. Applied only at the engine-call boundary (see optimizerInputs below), never to the raw editable state. */
function clampHalfLevel(level: number): number {
  const safe = Number.isFinite(level) ? level : DEFAULT_ASSUMPTIONS.slots[0]!.level;
  return Math.min(50, Math.max(1, Math.round(safe * 2) / 2));
}

/** Clamps a live-typed IV to [0, 15] — same defensive boundary reasoning as clampHalfLevel. */
function clampIv(iv: number): number {
  const safe = Number.isFinite(iv) ? iv : 0;
  return Math.min(15, Math.max(0, Math.round(safe)));
}

/**
 * Enforces PowerUpSlotInput/runTeamRaid's own invariants BEFORE the engine
 * ever sees them, same "degrade a stale/hand-edited link instead of
 * throwing" precedent as TeamRaidView's normalizeTeamAssumptions — extended
 * here with a THIRD mutual exclusion (Shadow vs. Purified, see powerUp.ts's
 * powerUpStepCost, which throws if both are set) that Team Raid has no
 * equivalent of.
 */
function normalizePowerUpAssumptions(a: PowerUpOptimizerAssumptions): PowerUpOptimizerAssumptions {
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
  // doc comment for the exact cost). Built as its own object, EXCLUDING
  // rankBy (display-only — see PowerUpOptimizerAssumptionPanel's own field
  // doc comment), same "debounce the narrow derived object, not the whole
  // assumptions blob" pattern SpeciesReportView's sweepInputs established —
  // this is what keeps the Rank-by select instantly responsive without
  // flashing a "recomputing…" indicator for work that was never re-triggered.
  const optimizerInputs = useMemo<PowerUpOptimizerInputs | null>(() => {
    if (!bossSpecies) return null;
    if (!assumptions.slots.some((s) => s.speciesId)) return null;
    return {
      slots: assumptions.slots.map((s) => {
        const species = resolveSpecies(s.speciesId);
        const effectiveShadowFlag = effectiveIsShadow(species, s.isShadow);
        return {
          // Each slot's own species stays RAW everywhere else in this view
          // (slotSpecies above, used for the panel's movepool/badge/boost
          // checks) — the Shadow toggle is applied ONLY here, at the
          // boundary into optimizePowerUps, same convention as
          // TeamRaidView's shadowAdjustedCandidates.
          species: applyShadowToggle(species, s.isShadow),
          fastMoveId: s.fastMoveId,
          chargedMoveId: s.chargedMoveId,
          isMega: s.isMega,
          level: clampHalfLevel(s.level),
          ivs: { attack: clampIv(s.ivAttack), defense: clampIv(s.ivDefense), stamina: clampIv(s.ivStamina) },
          costModifiers: { isShadow: effectiveShadowFlag, isPurified: s.isPurified, isLucky: s.isLucky },
          candyOnHand: Math.max(0, Math.floor(Number.isFinite(s.candyOnHand) ? s.candyOnHand : 0)),
          xlCandyOnHand: Math.max(0, Math.floor(Number.isFinite(s.xlCandyOnHand) ? s.xlCandyOnHand : 0)),
        };
      }),
      costTable: powerUpCostTable,
      stardustOnHand: Math.max(0, Math.floor(Number.isFinite(assumptions.stardustOnHand) ? assumptions.stardustOnHand : 0)),
      boss: bossSpecies,
      bossRaidTier,
      bossFastMoveId: assumptions.bossFastMoveId,
      bossChargedMoveId: assumptions.bossChargedMoveId,
      dodge: assumptions.dodge,
      dodgeFastAttacks: assumptions.dodgeFastAttacks,
      holdChargedMoveUntilSafe: assumptions.holdChargedMoveUntilSafe,
      bossChargedMoveMeanIntervalSeconds: assumptions.bossChargedMoveFrequencySeconds,
      bossChargedMoveCadence: assumptions.bossChargedMoveCadence,
      bossStartingEnergy,
      weather: assumptions.weather,
      raidTimerSeconds: assumptions.raidTimerSeconds,
      swapCostSeconds: assumptions.swapCostSeconds,
      reviveCostSeconds: assumptions.reviveCostSeconds,
    };
  }, [
    assumptions.slots,
    assumptions.stardustOnHand,
    bossSpecies,
    bossRaidTier,
    assumptions.bossFastMoveId,
    assumptions.bossChargedMoveId,
    assumptions.dodge,
    assumptions.dodgeFastAttacks,
    assumptions.holdChargedMoveUntilSafe,
    assumptions.bossChargedMoveFrequencySeconds,
    assumptions.bossChargedMoveCadence,
    bossStartingEnergy,
    assumptions.weather,
    assumptions.raidTimerSeconds,
    assumptions.swapCostSeconds,
    assumptions.reviveCostSeconds,
  ]);

  // Debounced echo — see useDebouncedValue.ts / SpeciesReportView.tsx's
  // identical precedent. This computation is materially heavier than that
  // one (a full team-raid run per candidate, not a single-attacker sim), so
  // the "don't recompute on every keystroke" case matters even more here.
  const debouncedOptimizerInputs = useDebouncedValue(optimizerInputs, 400);
  const isOptimizerPending = optimizerInputs !== debouncedOptimizerInputs;

  const result = useMemo(() => {
    if (!debouncedOptimizerInputs) return { data: null, error: null as string | null };
    try {
      const data = optimizePowerUps(debouncedOptimizerInputs);
      return { data, error: null as string | null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }, [debouncedOptimizerInputs]);

  // Sorting is over the ALREADY-COMPUTED candidates and is cheap — kept bound
  // to the LIVE rankBy (not the debounced snapshot) so switching the sort
  // column is instant, same "cheap display-only work shouldn't wait on the
  // debounce" reasoning as SpeciesReportView's sortedRows.
  const sortedCandidates = useMemo(() => {
    const list = result.data?.candidates ?? [];
    return [...list].sort((a, b) => {
      const ea = candidateEfficiency(a, assumptions.rankBy);
      const eb = candidateEfficiency(b, assumptions.rankBy);
      if (ea === null && eb === null) return 0;
      if (ea === null) return 1;
      if (eb === null) return -1;
      return eb - ea;
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
          <p style={{ color: "#ff6b6b" }}>Could not compute this optimizer run: {result.error}</p>
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
                  <div className="result-card" key={i} style={{ minWidth: 260 }}>
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
                ? "Nothing affordable in this roster improves team DPS in these simulated runs — try raising stardust/candy on hand, or this roster may already be past its useful power-up headroom against this boss."
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

          <section className="panel">
            <h2>
              Ranked power-up candidates
              <span className="species-picker-hint" style={{ marginLeft: 8 }}>
                sorted by {rankByLabel(assumptions.rankBy)}, descending
              </span>
            </h2>
            <p className="caveats" style={{ marginBottom: 12 }}>
              Rows with no {assumptions.rankBy === "stardust" ? "stardust" : assumptions.rankBy === "candy" ? "candy" : "XL candy"} cost
              (e.g. a pure-XL step has no regular-candy cost, and vice versa) show "—" for that column's efficiency and sink to the
              bottom of this sort — there is nothing to divide by, not a zero result.
            </p>
            <div style={{ overflowX: "auto", opacity: isOptimizerPending ? 0.55 : 1, transition: "opacity 0.15s ease" }}>
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
                      <td>
                        {c.deltaTeamDps >= 0 ? "+" : ""}
                        {c.deltaTeamDps.toFixed(2)}
                      </td>
                      <td>{c.deltaTeamDpsPer1000Stardust === null ? "—" : c.deltaTeamDpsPer1000Stardust.toFixed(3)}</td>
                      <td>{c.deltaTeamDpsPerCandy === null ? "—" : c.deltaTeamDpsPerCandy.toFixed(3)}</td>
                      <td>{c.deltaTeamDpsPerXlCandy === null ? "—" : c.deltaTeamDpsPerXlCandy.toFixed(3)}</td>
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
        <p className="caveats">
          v1, rudimentary scope: every candidate above is a SINGLE-SLOT power-up — no multi-slot plans (e.g. "power up
          two Pokémon together") and no "add a hypothetical 7th Pokémon" candidates. Each candidate/baseline number is
          the mean of 3 paired-seed (common-random-numbers) team-raid runs, not one run — small deltas (a fraction of a
          team-DPS point) can still be run-to-run noise even with paired seeding; treat the ranked ORDER as more
          trustworthy than any single candidate's exact number. The power-up cost table (universal levels 1-50,
          fetched {powerUpCostsFetchedAt.slice(0, 10)} from GAME_MASTER) ignores Eternatus's known per-species
          candy-cost override — this tool does not special-case it. Best Buddy status (a real +1 level beyond the
          normal level-50 cap) is not modelled at all. The Shadow-side
          candy rounding rule is [inferred from the Purified rule, not independently confirmed] — see powerUp.ts's own
          top doc comment. Stardust and candy/XL-candy efficiency are kept as two separate numbers on purpose (see the
          "Rank by" control) — they are not fungible resources for a real player, so this tool never blends them into
          one composite score. Team Raid v1's own assumptions carry over unchanged: unlimited healing items on a full
          wipe, and no cap on wipe-and-rejoin cycles other than a purely-engineering safety guard. A raid target badged
          "approximate" in the picker is one the live raid feed named but whose exact form this data layer couldn't
          resolve, so a documented stand-in species' stats are used instead — treat those runs as directional.
        </p>
      </section>
    </>
  );
}
