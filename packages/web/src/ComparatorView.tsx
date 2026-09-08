import { useEffect, useMemo, useState } from "react";
import {
  buildScenarioUrl,
  convertUptimeToTeamDamage,
  parseScenarioFromUrl,
  type Scenario,
  type SpeciesDefinition,
} from "@pogo-analyzer/engine";
import { AssumptionPanel, type Assumptions } from "./AssumptionPanel.js";
import type { BossChargedMoveCadence } from "./bossCadence.js";
import type { ComparatorPrefill } from "./comparatorPrefill.js";
import { BossMovesetSweep } from "./BossMovesetSweep.js";
import { DamageOverTimeChart } from "./DamageOverTimeChart.js";
import { DamageOverTimeTable } from "./DamageOverTimeTable.js";
import { SensitivityView } from "./SensitivityView.js";
import { SpeciesBadges } from "./SpeciesBadges.js";
import { effectiveIsShadow } from "./shadowToggle.js";
import { getBaseUrl } from "./urlUtils.js";
import { candidatePickerOptions, speciesRegistry, targetPickerOptions, unmatchedActiveRaids } from "./registry.js";
import { resolveBoost, runComparatorScenario } from "./run/runComparator.js";

// Default matchup shown on a fresh page load with no URL param. This is just
// the initial UI state (not a pinned engine acceptance-test fixture — those
// are now test-only fixtures inside packages/engine's own test suite and are
// unaffected by this).
const DEFAULT_CANDIDATE_A_ID = "kartana";
const DEFAULT_CANDIDATE_B_ID = "rayquaza";
const DEFAULT_TARGET_ID = "latios-mega";

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  candidateAId: DEFAULT_CANDIDATE_A_ID,
  candidateBId: DEFAULT_CANDIDATE_B_ID,
  targetId: DEFAULT_TARGET_ID,
  candidateAFastMoveId: null,
  candidateAChargedMoveId: null,
  candidateBFastMoveId: null,
  candidateBChargedMoveId: null,
  bossFastMoveId: null,
  bossChargedMoveId: null,
  candidateMegaBoostDisabled: [false, false],
  candidateShadow: [false, false],
  level: 35,
  ivAttack: 15,
  ivDefense: 15,
  ivStamina: 15,
  dodge: { kind: "none" },
  dodgeFastAttacks: false,
  holdChargedMoveUntilSafe: false,
  minFightLengthSeconds: 0,
  bossChargedMoveFrequencySeconds: 15,
  bossChargedMoveCadence: "fixed-interval",
  partySize: 4,
  teammateDps: 26.5,
  matchingTeammateCount: 4,
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0.5,
  weather: "none",
};

/**
 * Extends the engine's own `Scenario` with a per-candidate Shadow toggle that
 * `Scenario` doesn't declare (see this feature's AFFECTS note to
 * engine-developer — folding this in properly is their call, not something
 * web-developer should force by editing packages/engine). `encodeScenario`/
 * `decodeScenario` are pure JSON.stringify/parse pass-throughs with no field
 * enumeration, so this extra field round-trips through the exact same shared
 * base64url transport (buildScenarioUrl/parseScenarioFromUrl) without any
 * packages/engine change — every call site below that needs to read or write
 * it goes through this local type instead of an ad hoc cast.
 */
export interface ComparatorScenario extends Scenario {
  candidateShadow: [boolean, boolean];
  /**
   * Same "extend rather than edit packages/engine" reasoning as
   * candidateShadow just above — see bossCadence.tsx's BossChargedMoveCadence.
   * Optional (unlike candidateShadow, which is always written) specifically
   * so a decode-side `??` guard reads naturally as "field absent" for a link
   * shared before this existed, matching every other cadence-adjacent field's
   * own convention on this type (bossChargedMoveFrequencySeconds itself is
   * required precisely because it predates the add-scenario-assumption
   * discipline; this one doesn't need to repeat that).
   */
  bossChargedMoveCadence?: BossChargedMoveCadence;
}

export function assumptionsToScenario(a: Assumptions): ComparatorScenario {
  return {
    candidates: [a.candidateAId, a.candidateBId],
    candidateFastMoveIds: [a.candidateAFastMoveId, a.candidateBFastMoveId],
    candidateChargedMoveIds: [a.candidateAChargedMoveId, a.candidateBChargedMoveId],
    target: a.targetId,
    bossFastMoveId: a.bossFastMoveId,
    bossChargedMoveId: a.bossChargedMoveId,
    candidateMegaBoostDisabled: a.candidateMegaBoostDisabled,
    candidateShadow: a.candidateShadow,
    level: a.level,
    ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
    dodgeModel: a.dodge,
    dodgeFastAttacks: a.dodgeFastAttacks,
    holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
    minFightLengthSeconds: a.minFightLengthSeconds,
    partySize: a.partySize,
    teammateDps: a.teammateDps,
    matchingTeammateCount: a.matchingTeammateCount,
    bossChargedMoveFrequencySeconds: a.bossChargedMoveFrequencySeconds,
    bossChargedMoveCadence: a.bossChargedMoveCadence,
    bossStartsPrimed: a.bossStartsPrimed,
    bossStartingEnergyFraction: a.bossStartingEnergyFraction,
    weather: a.weather,
  };
}

export function scenarioToAssumptions(s: ComparatorScenario): Assumptions {
  return {
    candidateAId: s.candidates[0] ?? DEFAULT_CANDIDATE_A_ID,
    candidateBId: s.candidates[1] ?? DEFAULT_CANDIDATE_B_ID,
    targetId: s.target,
    // `??` guards a scenario URL encoded before these fields existed rather
    // than surfacing `undefined` into a controlled input (see the block below).
    candidateAFastMoveId: s.candidateFastMoveIds?.[0] ?? DEFAULT_ASSUMPTIONS.candidateAFastMoveId,
    candidateAChargedMoveId: s.candidateChargedMoveIds?.[0] ?? DEFAULT_ASSUMPTIONS.candidateAChargedMoveId,
    candidateBFastMoveId: s.candidateFastMoveIds?.[1] ?? DEFAULT_ASSUMPTIONS.candidateBFastMoveId,
    candidateBChargedMoveId: s.candidateChargedMoveIds?.[1] ?? DEFAULT_ASSUMPTIONS.candidateBChargedMoveId,
    bossFastMoveId: s.bossFastMoveId ?? DEFAULT_ASSUMPTIONS.bossFastMoveId,
    bossChargedMoveId: s.bossChargedMoveId ?? DEFAULT_ASSUMPTIONS.bossChargedMoveId,
    // `??` guards a scenario URL encoded before this field existed rather than
    // surfacing `undefined` into the checkboxes above.
    candidateMegaBoostDisabled: s.candidateMegaBoostDisabled ?? [false, false],
    // `??` guards a scenario URL encoded before this field existed (it isn't
    // even declared on the engine's own Scenario type — see ComparatorScenario
    // above) rather than surfacing `undefined` into the checkboxes below.
    candidateShadow: s.candidateShadow ?? [false, false],
    level: s.level,
    ivAttack: s.ivs.attack,
    ivDefense: s.ivs.defense,
    ivStamina: s.ivs.stamina,
    dodge: s.dodgeModel,
    // `??` guards a scenario URL encoded before these fields existed rather
    // than surfacing `undefined` into a controlled input.
    dodgeFastAttacks: s.dodgeFastAttacks ?? DEFAULT_ASSUMPTIONS.dodgeFastAttacks,
    holdChargedMoveUntilSafe: s.holdChargedMoveUntilSafe ?? DEFAULT_ASSUMPTIONS.holdChargedMoveUntilSafe,
    minFightLengthSeconds: s.minFightLengthSeconds ?? DEFAULT_ASSUMPTIONS.minFightLengthSeconds,
    bossChargedMoveFrequencySeconds: s.bossChargedMoveFrequencySeconds ?? DEFAULT_ASSUMPTIONS.bossChargedMoveFrequencySeconds,
    // `??` guards a scenario URL encoded before this field existed rather than
    // surfacing `undefined` into the cadence <select> — see ComparatorScenario
    // above for why this field is optional on the encoded type at all.
    bossChargedMoveCadence: s.bossChargedMoveCadence ?? DEFAULT_ASSUMPTIONS.bossChargedMoveCadence,
    partySize: s.partySize,
    teammateDps: s.teammateDps,
    matchingTeammateCount: s.matchingTeammateCount ?? Math.min(DEFAULT_ASSUMPTIONS.matchingTeammateCount, s.partySize),
    bossStartsPrimed: s.bossStartsPrimed ?? DEFAULT_ASSUMPTIONS.bossStartsPrimed,
    bossStartingEnergyFraction: s.bossStartingEnergyFraction ?? DEFAULT_ASSUMPTIONS.bossStartingEnergyFraction,
    // `??` guards a scenario URL encoded before this field existed rather than
    // surfacing `undefined` into the weather <select> above.
    weather: s.weather ?? "none",
  };
}

/**
 * `prefill` (the "start from a Pokémon" hand-off from SpeciesReportView, see
 * comparatorPrefill.ts) takes priority over any URL scenario when present —
 * a live click from another tab is a stronger, more recent signal than
 * whatever `s=` param (if any) happened to already be on the address bar.
 * Candidate B, dodge/level/IV/party/etc. all stay at DEFAULT_ASSUMPTIONS,
 * left for the player to adjust — only candidate A + its moveset + the
 * target are seeded from the hand-off.
 */
function initialAssumptions(prefill: ComparatorPrefill | null): Assumptions {
  if (prefill) {
    return {
      ...DEFAULT_ASSUMPTIONS,
      candidateAId: prefill.candidateAId,
      candidateAFastMoveId: prefill.candidateAFastMoveId,
      candidateAChargedMoveId: prefill.candidateAChargedMoveId,
      targetId: prefill.targetId,
      bossFastMoveId: null,
      bossChargedMoveId: null,
    };
  }
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  // Cast: parseScenarioFromUrl's return type is the engine's own (narrower)
  // Scenario — the actual decoded object still carries candidateShadow at
  // runtime if the link was built by this version of the app (JSON.parse
  // doesn't know or care about TypeScript's field list), see ComparatorScenario.
  const fromUrl = parseScenarioFromUrl(window.location.href) as ComparatorScenario | null;
  return fromUrl ? scenarioToAssumptions(fromUrl) : DEFAULT_ASSUMPTIONS;
}

/**
 * Small two-segment stacked bar echoing the own/team damage split already
 * shown as raw numbers in the result card's dl (and, in more detail, in
 * DamageOverTimeChart's damage-tally line below) — presentation only, no new
 * calculation, reusing whatever own/team totals the caller already computed
 * via convertUptimeToTeamDamage. Colored with the same x/y accent pair the
 * chart and result-card borders already use so it reads as "this candidate's
 * bar", not a third unrelated color scheme.
 */
function OwnTeamShareBar({ own, team, accent }: { own: number; team: number; accent: "x" | "y" }) {
  const total = own + team;
  const ownPct = total > 0 ? (own / total) * 100 : 0;
  const teamPct = 100 - ownPct;
  return (
    <div
      className="share-bar"
      role="img"
      aria-label={`${ownPct.toFixed(0)}% own damage, ${teamPct.toFixed(0)}% team damage`}
    >
      <div className={`share-bar-own share-bar-${accent}`} style={{ width: `${ownPct}%` }} />
      <div className="share-bar-team" style={{ width: `${teamPct}%` }} />
    </div>
  );
}

/** Same as runComparatorScenario's own internal resolution, but never throws — for normalization checks that need to run even when the id might be stale/invalid. */
function tryResolveSpecies(id: string): SpeciesDefinition | null {
  return speciesRegistry.has(id) ? speciesRegistry.get(id) : null;
}

/**
 * Forces candidateShadow[i] back to false whenever candidate i's currently
 * selected species carries a mega/primal boost — same "never let the two
 * coexist even transiently" discipline as TeamRaidView's
 * normalizeTeamAssumptions, run on every state update (not just decode), so
 * picking a mega/primal species into a slot that previously had Shadow
 * toggled on immediately clears it rather than leaving a stale, merely
 * UI-hidden true value sitting in state.
 */
export function normalizeAssumptions(a: Assumptions): Assumptions {
  const speciesA = tryResolveSpecies(a.candidateAId);
  const speciesB = tryResolveSpecies(a.candidateBId);
  const candidateShadow: [boolean, boolean] = [
    speciesA?.boost ? false : a.candidateShadow[0],
    speciesB?.boost ? false : a.candidateShadow[1],
  ];
  if (candidateShadow[0] === a.candidateShadow[0] && candidateShadow[1] === a.candidateShadow[1]) return a;
  return { ...a, candidateShadow };
}

interface ComparatorViewProps {
  /** See comparatorPrefill.ts — non-null only immediately after a "Compare vs. another attacker" click from the Species Report tab. */
  prefill?: ComparatorPrefill | null;
  /** Called once, right after this component's initial mount, if it was seeded from a non-null `prefill` — lets App.tsx clear its own prefill state so a later, unrelated remount of this view doesn't silently reapply the same stale hand-off. */
  onConsumedPrefill?: () => void;
}

/**
 * The original Two-Candidate Comparator — extracted verbatim out of the old
 * App.tsx (which used to be the whole app) so App.tsx can become a thin tab
 * shell over this view plus TeamRaidView/SpeciesReportView. The only new
 * behavior is the optional `prefill` hand-off from the Species Report tab.
 */
export function ComparatorView({ prefill = null, onConsumedPrefill }: ComparatorViewProps) {
  const [assumptions, setAssumptionsRaw] = useState<Assumptions>(() => normalizeAssumptions(initialAssumptions(prefill)));
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function setAssumptions(next: Assumptions) {
    setAssumptionsRaw(normalizeAssumptions(next));
  }

  // Runs once, immediately after mount — this component fully unmounts
  // whenever another tab is active, so "mount" and "just received a fresh
  // hand-off" are the same event here.
  useEffect(() => {
    if (prefill) onConsumedPrefill?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const candidateOptions = useMemo(() => candidatePickerOptions(), []);
  const targetOptions = useMemo(() => targetPickerOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);

  // The entire engine-facing computation (species resolution, Shadow
  // application, boss tier/energy/readiness, the sustained-comparison
  // simulation, the chart window, sensitivity, and the boss-moveset sweep)
  // lives in runComparatorScenario (run/runComparator.ts) — a pure, React-free
  // function shared with the run-scenario CLI and this tab's own vitest smoke
  // test, so neither can silently drift from what's rendered below. Aliased
  // back to their original names so the render code below (and
  // SensitivityView/DamageOverTimeChart/BossMovesetSweep's props) needs no
  // changes at all.
  const runResult = useMemo(() => runComparatorScenario(assumptions, speciesRegistry), [assumptions]);
  const species = { candidates: runResult.candidates, boss: runResult.boss, error: runResult.speciesError };
  const bossReadySeconds = runResult.bossReadySeconds;
  const energyBuffers = runResult.energyBuffers;
  const results = { candidates: runResult.results, error: runResult.resultsError };
  const naturalFightLengthSeconds = runResult.naturalFightLengthSeconds;
  const chartMaxSeconds = runResult.chartMaxSeconds;
  const sensitivity = runResult.sensitivity;
  const bossMovesetSweep = runResult.bossMovesetSweep;

  function handleShare() {
    // Also pins `view=comparator` so reloading/sharing this link doesn't land
    // on whichever tab happened to be active last — see App.tsx's tab-switch
    // scaffold, which both views' share flows now write into.
    const url = new URL(buildScenarioUrl(getBaseUrl(), assumptionsToScenario(assumptions)));
    url.searchParams.set("view", "comparator");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  const overallError = species.error ?? results.error;
  const boss = species.boss;

  function speciesLabel(s: SpeciesDefinition): string {
    return s.isHypothetical ? `${s.name} (hypothetical)` : s.name;
  }

  function SpeciesIcon({ s }: { s: SpeciesDefinition }) {
    return s.imageUrl ? <img src={s.imageUrl} alt="" className="species-icon" /> : null;
  }

  return (
    <>
      <p className="subtitle">
        {species.candidates ? (
          <>
            <SpeciesIcon s={species.candidates[0]} /> {speciesLabel(species.candidates[0])} vs{" "}
            <SpeciesIcon s={species.candidates[1]} /> {speciesLabel(species.candidates[1])}
          </>
        ) : (
          "Pick two candidates"
        )}{" "}
        vs {boss ? (
          <>
            <SpeciesIcon s={boss} /> {speciesLabel(boss)}
          </>
        ) : (
          "a target"
        )}{" "}
        — survivability counted as team DPS, not just raw damage.
      </p>

      <AssumptionPanel
        value={assumptions}
        onChange={setAssumptions}
        candidateOptions={candidateOptions}
        targetOptions={targetOptions}
        unmatchedRaids={unmatchedRaids}
        candidateSpecies={species.candidates ?? [null, null]}
        bossSpecies={species.boss}
        bossReadySeconds={bossReadySeconds}
        energyBuffers={energyBuffers}
        naturalFightLengthSeconds={naturalFightLengthSeconds}
      />

      {overallError && (
        <section className="panel">
          <p style={{ color: "#ff6b6b" }}>Could not compute this scenario: {overallError}</p>
        </section>
      )}

      {results.candidates && (
        <>
          <section className="panel">
            <h2>Fight results — distribution over {results.candidates[0]!.iterations} randomized runs</h2>
            <p className="caveats" style={{ marginBottom: 12 }}>
              The boss's charged-move timing is randomized each run (mean {assumptions.bossChargedMoveFrequencySeconds}s
              between casts once it's ready, +/-40%), so results are reported as a distribution rather than a single
              number — including how often each candidate faints mid-animation on its own charged move.
            </p>
            <div className="result-row">
              {results.candidates.map((c, i) => {
                // Damage attributable to this candidate's mega/primal boost,
                // dealt by OTHER TRAINERS' Pokémon simultaneously in the same
                // raid lobby (never this candidate's own bench — a solo
                // trainer only has one Pokémon active at a time, so there is
                // no "own party" for the boost to reach) over its own mean
                // survival — a separate number from its own damage output,
                // per the assumptions panel's other-trainer count /
                // matching-teammate-count / other-trainer DPS. `boost` is
                // undefined for a genuinely non-mega species OR one with the
                // "disable mega/primal boost" checkbox on — see resolveBoost.
                const boost = resolveBoost(species.candidates?.[i], assumptions.candidateMegaBoostDisabled[i] ?? false);
                const hasBoost = boost?.multiplier !== undefined;
                const persistsThroughFaint = boost?.persistsThroughFaint ?? false;
                const teamContribution = convertUptimeToTeamDamage({
                  secondsSurvived: c.meanSecondsSurvived,
                  boostMultiplier: boost?.multiplier,
                  teammateCount: assumptions.partySize,
                  matchingTeammateCount: assumptions.matchingTeammateCount,
                  teammateDps: assumptions.teammateDps,
                  // See SpeciesDefinition.boost.persistsThroughFaint (Primal
                  // Groudon/Kyogre, Mega Rayquaza) — for those, the boost's
                  // team-damage window is the full displayed fight window
                  // (chartMaxSeconds), not just this candidate's own mean
                  // survival time.
                  persistsThroughFaint,
                  fightDurationSeconds: chartMaxSeconds,
                });
                const ownDps = c.meanSecondsSurvived > 0 ? c.meanTotalDamage / c.meanSecondsSurvived : null;
                const ownPlusTeam = c.meanTotalDamage + teamContribution;
                return (
                  <div key={c.id} className={`result-card ${i === 0 ? "x" : "y"}`}>
                    <h3>
                      {species.candidates?.[i] && <SpeciesIcon s={species.candidates[i]} />} {c.name}
                      <SpeciesBadges
                        isHypothetical={species.candidates?.[i]?.isHypothetical}
                        isShadow={effectiveIsShadow(species.candidates?.[i], assumptions.candidateShadow[i] ?? false)}
                      />
                    </h3>
                    <dl>
                      <dt>Mean survival</dt>
                      <dd>{c.meanSecondsSurvived.toFixed(1)}s</dd>
                      <dt>Survived full window</dt>
                      <dd>{(c.fractionSurvivedFullWindow * 100).toFixed(0)}%</dd>
                      <dt>Died mid own-animation</dt>
                      <dd>{(c.fractionDiedDuringOwnAnimation * 100).toFixed(0)}%</dd>
                      <dt>Mean charged damage</dt>
                      <dd>{c.meanChargedDamage.toFixed(0)}</dd>
                      <dt>Mean fast-move damage</dt>
                      <dd>{c.meanFastMoveDamage.toFixed(0)}</dd>
                      <dt>Mean own total (charged+fast) — TDO</dt>
                      <dd>{c.meanTotalDamage.toFixed(0)}</dd>
                      <dt>Own total median / p10-p90</dt>
                      <dd>
                        {c.medianTotalDamage.toFixed(0)} ({c.p10TotalDamage.toFixed(0)} - {c.p90TotalDamage.toFixed(0)})
                      </dd>
                      <dt>Own damage per second — DPS</dt>
                      <dd>{ownDps === null ? "-" : ownDps.toFixed(1)}</dd>
                      {hasBoost && (
                        <>
                          <dt>Other trainers' damage from this candidate's boost</dt>
                          <dd>
                            {teamContribution.toFixed(0)}
                            {persistsThroughFaint && (
                              <span className="badge badge-persists" style={{ marginLeft: 6 }}>
                                persists past faint
                              </span>
                            )}
                          </dd>
                          <dt>Own + team damage from boost</dt>
                          <dd>{ownPlusTeam.toFixed(0)}</dd>
                        </>
                      )}
                    </dl>
                    <OwnTeamShareBar own={c.meanTotalDamage} team={teamContribution} accent={i === 0 ? "x" : "y"} />
                    {persistsThroughFaint && (
                      <p className="caveats" style={{ marginTop: 8, fontSize: "0.78rem" }}>
                        Real-game exception: this species' boost keeps buffing the team for the rest of the fight (~
                        {chartMaxSeconds.toFixed(1)}s here) even after it faints, unlike every standard mega/primal —
                        so "team damage" above already reflects the full fight window, not just its {c.meanSecondsSurvived.toFixed(1)}s
                        mean survival.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {results.candidates.length === 2 && (() => {
              const [a, b] = results.candidates;
              const boostA = resolveBoost(species.candidates?.[0], assumptions.candidateMegaBoostDisabled[0] ?? false);
              const boostB = resolveBoost(species.candidates?.[1], assumptions.candidateMegaBoostDisabled[1] ?? false);
              const teamA = convertUptimeToTeamDamage({
                secondsSurvived: a!.meanSecondsSurvived,
                boostMultiplier: boostA?.multiplier,
                teammateCount: assumptions.partySize,
                matchingTeammateCount: assumptions.matchingTeammateCount,
                teammateDps: assumptions.teammateDps,
                persistsThroughFaint: boostA?.persistsThroughFaint,
                fightDurationSeconds: chartMaxSeconds,
              });
              const teamB = convertUptimeToTeamDamage({
                secondsSurvived: b!.meanSecondsSurvived,
                boostMultiplier: boostB?.multiplier,
                teammateCount: assumptions.partySize,
                matchingTeammateCount: assumptions.matchingTeammateCount,
                teammateDps: assumptions.teammateDps,
                persistsThroughFaint: boostB?.persistsThroughFaint,
                fightDurationSeconds: chartMaxSeconds,
              });
              const dpsA = a!.meanSecondsSurvived > 0 ? a!.meanTotalDamage / a!.meanSecondsSurvived : 0;
              const dpsB = b!.meanSecondsSurvived > 0 ? b!.meanTotalDamage / b!.meanSecondsSurvived : 0;
              const ratioSentence = (label: string, valueA: number, valueB: number) => {
                if (valueA <= 0 || valueB <= 0) return `${label} ratio: not comparable (one side is zero).`;
                const [leaderName, ratio] =
                  valueA >= valueB ? [a!.name, valueA / valueB] : [b!.name, valueB / valueA];
                return `${label} ratio: ${leaderName} outputs ${ratio.toFixed(2)}x the other's.`;
              };
              return (
                <p className="caveats" style={{ marginTop: 12 }}>
                  {ratioSentence("Own DPS", dpsA, dpsB)} {ratioSentence("Own + team damage", a!.meanTotalDamage + teamA, b!.meanTotalDamage + teamB)}
                </p>
              );
            })()}
          </section>

          <section className="panel">
            <h2>Own damage + attributable team damage over time (one representative run)</h2>
            <p className="caveats" style={{ marginBottom: 12 }}>
              Simulated window: ~{chartMaxSeconds.toFixed(1)}s
              {assumptions.minFightLengthSeconds > (naturalFightLengthSeconds ?? 0) ? " (extended)" : ", sized to the longer-mean-surviving candidate"}.
              This chart draws one reproducible run (seed 1) from the distribution above — the boss's charged-move
              timing is randomized, so an individual run's exact crossing point varies; the stat cards above are the
              actual distribution to trust for conclusions.
            </p>
            <DamageOverTimeChart
              x={{
                name: results.candidates[0]!.name,
                ownDamageTrajectory: results.candidates[0]!.representativeRun.ownDamageTrajectory,
                // The exact death time of the specific run being charted
                // (representativeRun), not the mean across all 200 runs —
                // that trajectory belongs to one run, so its cutoff should
                // too. null (survived the whole simulated window) becomes
                // the chart's own window length, i.e. no marker/dashing.
                secondsSurvivedCutoff: results.candidates[0]!.representativeRun.faintedAtSeconds ?? chartMaxSeconds,
                boostMultiplier: resolveBoost(species.candidates![0], assumptions.candidateMegaBoostDisabled[0] ?? false)?.multiplier,
                persistsThroughFaint: resolveBoost(species.candidates![0], assumptions.candidateMegaBoostDisabled[0] ?? false)?.persistsThroughFaint,
                imageUrl: species.candidates![0].imageUrl,
              }}
              y={{
                name: results.candidates[1]!.name,
                ownDamageTrajectory: results.candidates[1]!.representativeRun.ownDamageTrajectory,
                secondsSurvivedCutoff: results.candidates[1]!.representativeRun.faintedAtSeconds ?? chartMaxSeconds,
                boostMultiplier: resolveBoost(species.candidates![1], assumptions.candidateMegaBoostDisabled[1] ?? false)?.multiplier,
                persistsThroughFaint: resolveBoost(species.candidates![1], assumptions.candidateMegaBoostDisabled[1] ?? false)?.persistsThroughFaint,
                imageUrl: species.candidates![1].imageUrl,
              }}
              teammateDps={assumptions.teammateDps}
              partySize={assumptions.partySize}
              matchingTeammateCount={assumptions.matchingTeammateCount}
              maxSeconds={chartMaxSeconds}
            />
            <DamageOverTimeTable
              x={{
                name: results.candidates[0]!.name,
                ownDamageTrajectory: results.candidates[0]!.representativeRun.ownDamageTrajectory,
                damageTakenTrajectory: results.candidates[0]!.representativeRun.damageTakenTrajectory,
                secondsSurvivedCutoff: results.candidates[0]!.representativeRun.faintedAtSeconds ?? chartMaxSeconds,
                boostMultiplier: resolveBoost(species.candidates![0], assumptions.candidateMegaBoostDisabled[0] ?? false)?.multiplier,
                persistsThroughFaint: resolveBoost(species.candidates![0], assumptions.candidateMegaBoostDisabled[0] ?? false)?.persistsThroughFaint,
              }}
              y={{
                name: results.candidates[1]!.name,
                ownDamageTrajectory: results.candidates[1]!.representativeRun.ownDamageTrajectory,
                damageTakenTrajectory: results.candidates[1]!.representativeRun.damageTakenTrajectory,
                secondsSurvivedCutoff: results.candidates[1]!.representativeRun.faintedAtSeconds ?? chartMaxSeconds,
                boostMultiplier: resolveBoost(species.candidates![1], assumptions.candidateMegaBoostDisabled[1] ?? false)?.multiplier,
                persistsThroughFaint: resolveBoost(species.candidates![1], assumptions.candidateMegaBoostDisabled[1] ?? false)?.persistsThroughFaint,
              }}
              teammateDps={assumptions.teammateDps}
              partySize={assumptions.partySize}
              matchingTeammateCount={assumptions.matchingTeammateCount}
              maxSeconds={chartMaxSeconds}
            />
          </section>

          <SensitivityView checks={sensitivity} />

          {bossMovesetSweep && bossMovesetSweep.length > 1 && species.candidates && (
            <section className="panel">
              <h2>Does the winner depend on the boss's charged-move roll?</h2>
              <p className="caveats" style={{ marginBottom: 12 }}>
                {boss!.name} knows {bossMovesetSweep.length} charged moves — a real raid instance is locked to
                whichever ONE of them it rolled for its whole lifetime, so a player choosing which mega to bring can't
                know in advance which variant they'll actually face. Every row below re-runs the full comparison above
                holding every other assumption fixed, varying only the boss's charged move.
              </p>
              <BossMovesetSweep
                variants={bossMovesetSweep}
                candidateMeta={[
                  {
                    name: results.candidates[0]!.name,
                    boostMultiplier: resolveBoost(species.candidates[0], assumptions.candidateMegaBoostDisabled[0] ?? false)?.multiplier,
                    persistsThroughFaint:
                      resolveBoost(species.candidates[0], assumptions.candidateMegaBoostDisabled[0] ?? false)?.persistsThroughFaint ?? false,
                  },
                  {
                    name: results.candidates[1]!.name,
                    boostMultiplier: resolveBoost(species.candidates[1], assumptions.candidateMegaBoostDisabled[1] ?? false)?.multiplier,
                    persistsThroughFaint:
                      resolveBoost(species.candidates[1], assumptions.candidateMegaBoostDisabled[1] ?? false)?.persistsThroughFaint ?? false,
                  },
                ]}
                partySize={assumptions.partySize}
                teammateDps={assumptions.teammateDps}
                matchingTeammateCount={assumptions.matchingTeammateCount}
              />
            </section>
          )}
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
          There's no "opening burst vs sustained" mode to pick — every fight is one continuous simulation, and
          whether the boss has thrown a charged move yet is a computed fact (see "Boss ready for its first charged
          move" above), derived from the target's own fast-move energy gain and its charged move's cost. That
          derivation is a lower bound: it counts only the boss's own fast-move casts, not the energy real raid bosses
          also gain from damage taken, so a boss could in principle go off sooner, never later — except when "Boss
          charged-move cadence model" above is switched to "Energy-driven," which closes exactly that gap by driving
          the whole fight's cadence off the boss's energy instead. That mode is experimental and off by default: see
          its own explanation text for what's independently sourced (the 0.5-energy-per-HP rate) versus what's a
          reasoned inference this project made itself (the roll's trigger) versus what's simply unvalidated (the
          15-34% survival-time impact this project measured). "Mean charged damage"
          and "mean fast-move damage" above are tracked separately. "Died mid own-animation" describes only the
          final, fatal charged-move attempt of a run — that specific attempt lands 0 damage, since the candidate
          dies before its own cast resolves. It does not mean the run's charged damage total is zero: a candidate
          can land one or more earlier charged-move casts (each counting toward "mean charged damage") before a
          later cast turns fatal mid-animation, and can also have dealt real fast-move damage throughout — "mean
          total damage" and the median/p10-p90 figures are the combined total, not charged-only. Any boss hit — fast
          or charged — that lands while a candidate is mid-animation on
          its own charged move deals guaranteed full damage: you can't throw a new dodge while locked into your own
          cast, and a dodge's reduction window (roughly 0.7s) couldn't cover a multi-second animation even if you
          could. Dodging costs 0.5s of your own attack cycle per attempt, whether it's a charged-attack dodge or (if
          enabled) a fast-attack one — dodging everything is not free DPS-wise. The mega/primal boost never reaches
          this candidate's own bench — in the real game a solo trainer only has one Pokémon active at a time, so
          there's no "own party" for it to boost. It boosts other trainers simultaneously in the same raid lobby
          instead (who can reciprocally boost this candidate back if they've also brought a mega/primal), and isn't
          all-or-nothing by type either: every other trainer's Pokémon gets at least a flat 1.1x boost regardless of
          type, and only the ones matching the boosted type get the full multiplier (1.3x by default) — "other
          trainers matching boost type" above lets that be a mix, not one yes/no for the whole raid. That multiplier
          is still load-bearing:
          at 1.1x instead of 1.3x for the matching share, which candidate leads can flip — see the sensitivity panel.
          Raid targets marked "approximate" use a documented stand-in species' stats (e.g. a Shadow-prefixed raid
          boss matched to its non-Shadow base stats) because no better data exists yet — treat those results as
          directional, not exact. Species marked "hypothetical" are not live-game content at all.
        </p>
      </section>
    </>
  );
}
