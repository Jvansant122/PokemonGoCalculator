import { useMemo, useState } from "react";
import {
  bossChargedMoveReadySeconds,
  buildScenarioUrl,
  convertUptimeToTeamDamage,
  parseScenarioFromUrl,
  runSustainedComparison,
  type Scenario,
  type SpeciesDefinition,
} from "@pogo-analyzer/engine";
import { AssumptionPanel, type Assumptions } from "./AssumptionPanel.js";
import { DamageOverTimeChart } from "./DamageOverTimeChart.js";
import { SensitivityView } from "./SensitivityView.js";
import { computeSensitivity } from "./sensitivity.js";
import { candidatePickerOptions, speciesRegistry, targetPickerOptions, unmatchedActiveRaids } from "./registry.js";

// These are this project's pinned Scenario A defaults (see CLAUDE.md) — the
// page must render this exact comparison on a fresh load with no URL param.
const DEFAULT_CANDIDATE_A_ID = "raichu-mega-x";
const DEFAULT_CANDIDATE_B_ID = "raichu-mega-y";
const DEFAULT_TARGET_ID = "kyogre-primal";
const MAX_ENERGY = 100;

const DEFAULT_ASSUMPTIONS: Assumptions = {
  candidateAId: DEFAULT_CANDIDATE_A_ID,
  candidateBId: DEFAULT_CANDIDATE_B_ID,
  targetId: DEFAULT_TARGET_ID,
  candidateAFastMoveId: null,
  candidateAChargedMoveId: null,
  candidateBFastMoveId: null,
  candidateBChargedMoveId: null,
  bossFastMoveId: null,
  bossChargedMoveId: null,
  level: 35,
  ivAttack: 15,
  ivDefense: 15,
  ivStamina: 15,
  dodge: { kind: "none" },
  dodgeFastAttacks: false,
  holdChargedMoveUntilSafe: false,
  minFightLengthSeconds: 0,
  bossChargedMoveFrequencySeconds: 15,
  partySize: 4,
  teammateDps: 26.5,
  matchingTeammateCount: 4,
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0.5,
};

function assumptionsToScenario(a: Assumptions): Scenario {
  return {
    candidates: [a.candidateAId, a.candidateBId],
    candidateFastMoveIds: [a.candidateAFastMoveId, a.candidateBFastMoveId],
    candidateChargedMoveIds: [a.candidateAChargedMoveId, a.candidateBChargedMoveId],
    target: a.targetId,
    bossFastMoveId: a.bossFastMoveId,
    bossChargedMoveId: a.bossChargedMoveId,
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
    bossStartsPrimed: a.bossStartsPrimed,
    bossStartingEnergyFraction: a.bossStartingEnergyFraction,
  };
}

function scenarioToAssumptions(s: Scenario): Assumptions {
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
    partySize: s.partySize,
    teammateDps: s.teammateDps,
    matchingTeammateCount: s.matchingTeammateCount ?? Math.min(DEFAULT_ASSUMPTIONS.matchingTeammateCount, s.partySize),
    bossStartsPrimed: s.bossStartsPrimed ?? DEFAULT_ASSUMPTIONS.bossStartsPrimed,
    bossStartingEnergyFraction: s.bossStartingEnergyFraction ?? DEFAULT_ASSUMPTIONS.bossStartingEnergyFraction,
  };
}

function initialAssumptions(): Assumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parseScenarioFromUrl(window.location.href);
  return fromUrl ? scenarioToAssumptions(fromUrl) : DEFAULT_ASSUMPTIONS;
}

/** Resolves a species id from the registry, surfacing a lookup failure as a normal error result rather than a crash — a stale/shared URL can reference an id that no longer exists after a future data resync. */
function resolveSpecies(id: string): SpeciesDefinition {
  return speciesRegistry.get(id);
}

export function App() {
  const [assumptions, setAssumptions] = useState<Assumptions>(initialAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const candidateOptions = useMemo(() => candidatePickerOptions(), []);
  const targetOptions = useMemo(() => targetPickerOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);

  const ivs = useMemo(
    () => ({ attack: assumptions.ivAttack, defense: assumptions.ivDefense, stamina: assumptions.ivStamina }),
    [assumptions.ivAttack, assumptions.ivDefense, assumptions.ivStamina],
  );

  const species = useMemo(() => {
    try {
      return {
        candidates: [resolveSpecies(assumptions.candidateAId), resolveSpecies(assumptions.candidateBId)] as [
          SpeciesDefinition,
          SpeciesDefinition,
        ],
        boss: resolveSpecies(assumptions.targetId),
        error: null as string | null,
      };
    } catch (err) {
      return { candidates: null, boss: null, error: (err as Error).message };
    }
  }, [assumptions.candidateAId, assumptions.candidateBId, assumptions.targetId]);

  // Energy the boss begins the fight with, in absolute units (0 unless the
  // "starts primed" toggle is on) — feeds the comparison call below, and the
  // displayed "boss ready at ~Xs" line, from the single source of truth
  // (bossChargedMoveReadySeconds) rather than multiple places reimplementing it.
  // The selected boss/candidate charged moves, resolved the same way the
  // engine's resolveMove does (id match, else the species' first move) — used
  // by the three derived values below so they agree with what actually feeds
  // runSustainedComparison, not always index 0.
  const selectedBossChargedMove = useMemo(() => {
    if (!species.boss) return undefined;
    return species.boss.chargedMoves.find((m) => m.id === assumptions.bossChargedMoveId) ?? species.boss.chargedMoves[0];
  }, [species.boss, assumptions.bossChargedMoveId]);

  const bossStartingEnergy = useMemo(() => {
    if (!assumptions.bossStartsPrimed || !species.boss) return 0;
    const cost = selectedBossChargedMove?.energyCost ?? 0;
    return assumptions.bossStartingEnergyFraction * cost;
  }, [assumptions.bossStartsPrimed, assumptions.bossStartingEnergyFraction, species.boss, selectedBossChargedMove]);

  const bossReadySeconds = useMemo(() => {
    if (!species.boss) return null;
    const fastMove = species.boss.fastMoves.find((m) => m.id === assumptions.bossFastMoveId) ?? species.boss.fastMoves[0];
    if (!fastMove || !selectedBossChargedMove) return null;
    return bossChargedMoveReadySeconds(fastMove, selectedBossChargedMove, bossStartingEnergy);
  }, [species.boss, assumptions.bossFastMoveId, selectedBossChargedMove, bossStartingEnergy]);

  const energyBuffers = useMemo(() => {
    if (!species.candidates) return [];
    const chargedMoveIds = [assumptions.candidateAChargedMoveId, assumptions.candidateBChargedMoveId];
    return species.candidates.map((c, i) => {
      const chargedMove = c.chargedMoves.find((m) => m.id === chargedMoveIds[i]) ?? c.chargedMoves[0];
      return { name: c.name, buffer: MAX_ENERGY - (chargedMove?.energyCost ?? MAX_ENERGY) };
    });
  }, [species.candidates, assumptions.candidateAChargedMoveId, assumptions.candidateBChargedMoveId]);

  // There is no user-selectable "combat phase" — the fight is one continuous
  // simulation (runSustainedComparison), which already naturally starts with
  // a period where the boss hasn't thrown a charged move yet, governed by
  // bossReadySeconds above. That period isn't a separate mode to pick.
  const results = useMemo(() => {
    if (!species.candidates || !species.boss) return { candidates: null, error: null as string | null };
    try {
      return {
        candidates: runSustainedComparison({
          candidates: species.candidates,
          candidateFastMoveIds: [assumptions.candidateAFastMoveId, assumptions.candidateBFastMoveId],
          candidateChargedMoveIds: [assumptions.candidateAChargedMoveId, assumptions.candidateBChargedMoveId],
          boss: species.boss,
          bossFastMoveId: assumptions.bossFastMoveId,
          bossChargedMoveId: assumptions.bossChargedMoveId,
          level: assumptions.level,
          ivs,
          dodge: assumptions.dodge,
          dodgeFastAttacks: assumptions.dodgeFastAttacks,
          holdChargedMoveUntilSafe: assumptions.holdChargedMoveUntilSafe,
          bossChargedMoveMeanIntervalSeconds: assumptions.bossChargedMoveFrequencySeconds,
          bossStartingEnergy,
        }),
        error: null as string | null,
      };
    } catch (err) {
      return { candidates: null, error: (err as Error).message };
    }
  }, [
    species.candidates,
    species.boss,
    assumptions.candidateAFastMoveId,
    assumptions.candidateAChargedMoveId,
    assumptions.candidateBFastMoveId,
    assumptions.candidateBChargedMoveId,
    assumptions.bossFastMoveId,
    assumptions.bossChargedMoveId,
    assumptions.level,
    ivs,
    assumptions.dodge,
    assumptions.dodgeFastAttacks,
    assumptions.holdChargedMoveUntilSafe,
    assumptions.bossChargedMoveFrequencySeconds,
    bossStartingEnergy,
  ]);

  // The chart's window is auto-computed from the longer-mean-surviving
  // candidate (never a free-typed input, so a too-small value can't reproduce
  // the degenerate all-zero-output bug this project hit once already) — the
  // user can only stretch it further via minFightLengthSeconds, never shrink
  // it below this real, computed outcome.
  const naturalFightLengthSeconds = useMemo(() => {
    const raw = results.candidates?.map((c) => c.meanSecondsSurvived);
    if (!raw || raw.length === 0) return null;
    return Math.max(1, Math.ceil(Math.max(...raw) * 1.1 * 10) / 10);
  }, [results.candidates]);

  const chartMaxSeconds = Math.max(naturalFightLengthSeconds ?? 1, assumptions.minFightLengthSeconds);

  const sensitivity = useMemo(() => {
    if (!species.candidates || !species.boss) return [];
    try {
      return computeSensitivity(species.candidates, species.boss, assumptions);
    } catch {
      return [];
    }
  }, [species.candidates, species.boss, assumptions]);

  function handleShare() {
    const url = buildScenarioUrl(window.location.href.split("?")[0]!, assumptionsToScenario(assumptions));
    window.history.replaceState(null, "", url);
    setShareUrl(url);
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
    <div className="app">
      <h1>Pokémon GO Scenario Comparator</h1>
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
                // Team damage attributable to this candidate's mega/primal
                // boost over its own mean survival — a separate number from
                // its own damage output, per the assumptions panel's party
                // size / matching-teammate-count / teammate DPS.
                const teamContribution = convertUptimeToTeamDamage({
                  secondsSurvived: c.meanSecondsSurvived,
                  boostMultiplier: species.candidates?.[i]?.boost?.multiplier ?? 1,
                  teammateCount: assumptions.partySize,
                  matchingTeammateCount: assumptions.matchingTeammateCount,
                  teammateDps: assumptions.teammateDps,
                });
                const ownDps = c.meanSecondsSurvived > 0 ? c.meanTotalDamage / c.meanSecondsSurvived : null;
                const ownPlusTeam = c.meanTotalDamage + teamContribution;
                return (
                  <div key={c.id} className={`result-card ${i === 0 ? "x" : "y"}`}>
                    <h3>
                      {species.candidates?.[i] && <SpeciesIcon s={species.candidates[i]} />} {c.name}
                      {species.candidates?.[i]?.isHypothetical && <span className="badge badge-hypothetical">hypothetical</span>}
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
                      <dt>Mean own total (charged+fast)</dt>
                      <dd>{c.meanTotalDamage.toFixed(0)}</dd>
                      <dt>Own total median / p10-p90</dt>
                      <dd>
                        {c.medianTotalDamage.toFixed(0)} ({c.p10TotalDamage.toFixed(0)} - {c.p90TotalDamage.toFixed(0)})
                      </dd>
                      <dt>Own damage per second</dt>
                      <dd>{ownDps === null ? "-" : ownDps.toFixed(1)}</dd>
                      <dt>Team damage from this candidate's boost</dt>
                      <dd>{teamContribution.toFixed(0)}</dd>
                      <dt>Own + team damage from boost</dt>
                      <dd>{ownPlusTeam.toFixed(0)}</dd>
                    </dl>
                  </div>
                );
              })}
            </div>
            {results.candidates.length === 2 && (() => {
              const [a, b] = results.candidates;
              const teamA = convertUptimeToTeamDamage({
                secondsSurvived: a!.meanSecondsSurvived,
                boostMultiplier: species.candidates?.[0]?.boost?.multiplier ?? 1,
                teammateCount: assumptions.partySize,
                matchingTeammateCount: assumptions.matchingTeammateCount,
                teammateDps: assumptions.teammateDps,
              });
              const teamB = convertUptimeToTeamDamage({
                secondsSurvived: b!.meanSecondsSurvived,
                boostMultiplier: species.candidates?.[1]?.boost?.multiplier ?? 1,
                teammateCount: assumptions.partySize,
                matchingTeammateCount: assumptions.matchingTeammateCount,
                teammateDps: assumptions.teammateDps,
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
                boostMultiplier: species.candidates![0].boost?.multiplier ?? 1,
                imageUrl: species.candidates![0].imageUrl,
              }}
              y={{
                name: results.candidates[1]!.name,
                ownDamageTrajectory: results.candidates[1]!.representativeRun.ownDamageTrajectory,
                secondsSurvivedCutoff: results.candidates[1]!.representativeRun.faintedAtSeconds ?? chartMaxSeconds,
                boostMultiplier: species.candidates![1].boost?.multiplier ?? 1,
                imageUrl: species.candidates![1].imageUrl,
              }}
              teammateDps={assumptions.teammateDps}
              partySize={assumptions.partySize}
              matchingTeammateCount={assumptions.matchingTeammateCount}
              maxSeconds={chartMaxSeconds}
            />
          </section>

          <SensitivityView checks={sensitivity} />
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
          also gain from damage taken, so a boss could in principle go off sooner, never later. "Mean charged damage"
          and "mean fast-move damage" above are tracked separately because a candidate that dies mid-animation on its
          own charged move (see "Died mid own-animation") lands 0 charged damage that run but may still have dealt
          real fast-move damage beforehand — "mean total damage" and the median/p10-p90 figures are the combined
          total, not charged-only. Any boss hit — fast or charged — that lands while a candidate is mid-animation on
          its own charged move deals guaranteed full damage: you can't throw a new dodge while locked into your own
          cast, and a dodge's reduction window (roughly 0.7s) couldn't cover a multi-second animation even if you
          could. Dodging costs 0.5s of your own attack cycle per attempt, whether it's a charged-attack dodge or (if
          enabled) a fast-attack one — dodging everything is not free DPS-wise. The mega/primal boost isn't
          all-or-nothing by type either: every teammate gets at least a flat 1.1x boost regardless of type, and only
          teammates matching the boosted type get the full multiplier (1.3x by default) — "teammates matching boost
          type" above lets that be a mix, not one yes/no for the whole party. That multiplier is still load-bearing:
          at 1.1x instead of 1.3x for the matching share, which candidate leads can flip — see the sensitivity panel.
          Raid targets marked "approximate" use a documented stand-in species' stats (e.g. a Shadow-prefixed raid
          boss matched to its non-Shadow base stats) because no better data exists yet — treat those results as
          directional, not exact. Species marked "hypothetical" are not live-game content at all.
        </p>
      </section>
    </div>
  );
}
