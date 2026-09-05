import { useMemo, useState } from "react";
import {
  bossChargedMoveReadySeconds,
  buildScenarioUrl,
  parseScenarioFromUrl,
  runComparison,
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

const DEFAULT_ASSUMPTIONS: Assumptions = {
  candidateAId: DEFAULT_CANDIDATE_A_ID,
  candidateBId: DEFAULT_CANDIDATE_B_ID,
  targetId: DEFAULT_TARGET_ID,
  level: 35,
  ivAttack: 15,
  ivDefense: 15,
  ivStamina: 15,
  dodge: { kind: "none" },
  bossChargedMoveFrequencySeconds: 15,
  phase: "opening-burst",
  partySize: 4,
  teammateDps: 26.5,
  teammateTypeMatches: true,
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0.5,
};

function assumptionsToScenario(a: Assumptions): Scenario {
  return {
    candidates: [a.candidateAId, a.candidateBId],
    target: a.targetId,
    level: a.level,
    ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
    dodgeModel: a.dodge,
    partySize: a.partySize,
    teammateDps: a.teammateDps,
    teammateTypeMatches: a.teammateTypeMatches,
    phase: a.phase,
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
    level: s.level,
    ivAttack: s.ivs.attack,
    ivDefense: s.ivs.defense,
    ivStamina: s.ivs.stamina,
    dodge: s.dodgeModel,
    // `??` guards a scenario URL encoded before these fields existed rather
    // than surfacing `undefined` into a controlled input.
    bossChargedMoveFrequencySeconds: s.bossChargedMoveFrequencySeconds ?? DEFAULT_ASSUMPTIONS.bossChargedMoveFrequencySeconds,
    phase: s.phase,
    partySize: s.partySize,
    teammateDps: s.teammateDps,
    teammateTypeMatches: s.teammateTypeMatches,
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

  const isSustained = assumptions.phase === "sustained";

  // Energy the boss begins the fight with, in absolute units (0 unless the
  // "starts primed" toggle is on) — feeds both comparison calls below, and
  // the displayed "boss ready at ~Xs" line, from the single source of truth
  // (bossChargedMoveReadySeconds) rather than three places reimplementing it.
  const bossStartingEnergy = useMemo(() => {
    if (!assumptions.bossStartsPrimed || !species.boss) return 0;
    const cost = species.boss.chargedMoves[0]?.energyCost ?? 0;
    return assumptions.bossStartingEnergyFraction * cost;
  }, [assumptions.bossStartsPrimed, assumptions.bossStartingEnergyFraction, species.boss]);

  const bossReadySeconds = useMemo(() => {
    if (!species.boss) return null;
    const fastMove = species.boss.fastMoves[0];
    const chargedMove = species.boss.chargedMoves[0];
    if (!fastMove || !chargedMove) return null;
    return bossChargedMoveReadySeconds(fastMove, chargedMove, bossStartingEnergy);
  }, [species.boss, bossStartingEnergy]);

  const results = useMemo(() => {
    if (isSustained || !species.candidates || !species.boss) return { candidates: null, error: null as string | null };
    try {
      return {
        candidates: runComparison({
          candidates: species.candidates,
          boss: species.boss,
          level: assumptions.level,
          ivs,
          dodge: assumptions.dodge,
          bossStartingEnergy,
        }),
        error: null as string | null,
      };
    } catch (err) {
      return { candidates: null, error: (err as Error).message };
    }
  }, [isSustained, species.candidates, species.boss, assumptions.level, ivs, assumptions.dodge, bossStartingEnergy]);

  const sustainedResults = useMemo(() => {
    if (!isSustained || !species.candidates || !species.boss) return { candidates: null, error: null as string | null };
    try {
      return {
        candidates: runSustainedComparison({
          candidates: species.candidates,
          boss: species.boss,
          level: assumptions.level,
          ivs,
          dodge: assumptions.dodge,
          bossChargedMoveMeanIntervalSeconds: assumptions.bossChargedMoveFrequencySeconds,
          bossStartingEnergy,
        }),
        error: null as string | null,
      };
    } catch (err) {
      return { candidates: null, error: (err as Error).message };
    }
  }, [
    isSustained,
    species.candidates,
    species.boss,
    assumptions.level,
    ivs,
    assumptions.dodge,
    assumptions.bossChargedMoveFrequencySeconds,
    bossStartingEnergy,
  ]);

  // "Simulated window" is now computed from the results (longest-surviving
  // candidate), not a free-typed input — also sizes the damage-over-time
  // chart's x-axis, with a little headroom so the final point isn't clipped.
  const simulatedWindowSeconds = useMemo(() => {
    const raw = isSustained
      ? sustainedResults.candidates?.map((c) => c.meanSecondsSurvived)
      : results.candidates?.map((c) => c.secondsSurvived);
    if (!raw || raw.length === 0) return null;
    return Math.max(...raw);
  }, [isSustained, results.candidates, sustainedResults.candidates]);

  const chartMaxSeconds = Math.max(1, Math.ceil((simulatedWindowSeconds ?? 1) * 1.1 * 10) / 10);

  const sensitivity = useMemo(() => {
    if (isSustained || !species.candidates || !species.boss) return [];
    try {
      return computeSensitivity(species.candidates, species.boss, assumptions);
    } catch {
      return [];
    }
  }, [isSustained, species.candidates, species.boss, assumptions]);

  function handleShare() {
    const url = buildScenarioUrl(window.location.href.split("?")[0]!, assumptionsToScenario(assumptions));
    window.history.replaceState(null, "", url);
    setShareUrl(url);
  }

  const overallError = species.error ?? results.error ?? sustainedResults.error;
  const boss = species.boss;

  function speciesLabel(s: SpeciesDefinition): string {
    return s.isHypothetical ? `${s.name} (hypothetical)` : s.name;
  }

  return (
    <div className="app">
      <h1>Pokémon GO Scenario Comparator</h1>
      <p className="subtitle">
        {species.candidates ? `${speciesLabel(species.candidates[0])} vs ${speciesLabel(species.candidates[1])}` : "Pick two candidates"}{" "}
        vs {boss ? speciesLabel(boss) : "a target"} — survivability counted as team DPS, not just raw damage.
      </p>

      <AssumptionPanel
        value={assumptions}
        onChange={setAssumptions}
        candidateOptions={candidateOptions}
        targetOptions={targetOptions}
        unmatchedRaids={unmatchedRaids}
        bossReadySeconds={bossReadySeconds}
      />

      {overallError && (
        <section className="panel">
          <p style={{ color: "#ff6b6b" }}>Could not compute this scenario: {overallError}</p>
        </section>
      )}

      {!isSustained && results.candidates && (
        <>
          <section className="panel">
            <h2>Opening burst, no boss charged moves</h2>
            <div className="result-row">
              {results.candidates.map((c, i) => (
                <div key={c.id} className={`result-card ${i === 0 ? "x" : "y"}`}>
                  <h3>
                    {c.name}
                    {species.candidates?.[i]?.isHypothetical && <span className="badge badge-hypothetical">hypothetical</span>}
                  </h3>
                  <dl>
                    <dt>Survives</dt>
                    <dd>
                      {c.secondsSurvived.toFixed(1)}s{c.secondsSurvived >= (bossReadySeconds ?? 20) ? " (boss not charged yet, still alive)" : ""}
                    </dd>
                    <dt>Charged attacks landed</dt>
                    <dd>{c.chargedAttacksLanded}</dd>
                    <dt>Own damage</dt>
                    <dd>{c.ownDamage}</dd>
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Own damage + attributable team damage over time</h2>
            <p className="caveats" style={{ marginBottom: 12 }}>
              Simulated window: ~{chartMaxSeconds.toFixed(1)}s, sized to the longer-surviving candidate. Party size and
              teammate DPS are held fixed at the values in the assumptions panel above.
            </p>
            <DamageOverTimeChart
              x={{
                name: results.candidates[0]!.name,
                ownDamageTrajectory: results.candidates[0]!.ownDamageTrajectory,
                secondsSurvivedCutoff: results.candidates[0]!.secondsSurvived,
                boostMultiplier: species.candidates![0].boost?.multiplier ?? 1,
              }}
              y={{
                name: results.candidates[1]!.name,
                ownDamageTrajectory: results.candidates[1]!.ownDamageTrajectory,
                secondsSurvivedCutoff: results.candidates[1]!.secondsSurvived,
                boostMultiplier: species.candidates![1].boost?.multiplier ?? 1,
              }}
              teammateDps={assumptions.teammateDps}
              partySize={assumptions.partySize}
              typeMatches={{ x: assumptions.teammateTypeMatches, y: assumptions.teammateTypeMatches }}
              maxSeconds={chartMaxSeconds}
            />
          </section>

          <SensitivityView checks={sensitivity} />
        </>
      )}

      {isSustained && sustainedResults.candidates && (
        <section className="panel">
          <h2>Sustained fight — distribution over {sustainedResults.candidates[0]!.iterations} randomized runs</h2>
          <p className="caveats" style={{ marginBottom: 12 }}>
            The boss's charged-move timing is randomized each run (mean {assumptions.bossChargedMoveFrequencySeconds}s
            between casts, +/-40%), so results are reported as a distribution rather than a single number — including
            how often each candidate faints mid-animation on its own charged move.
          </p>
          <div className="result-row">
            {sustainedResults.candidates.map((c, i) => (
              <div key={c.id} className={`result-card ${i === 0 ? "x" : "y"}`}>
                <h3>
                  {c.name}
                  {species.candidates?.[i]?.isHypothetical && <span className="badge badge-hypothetical">hypothetical</span>}
                </h3>
                <dl>
                  <dt>Mean survival</dt>
                  <dd>{c.meanSecondsSurvived.toFixed(1)}s</dd>
                  <dt>Survived full window</dt>
                  <dd>{(c.fractionSurvivedFullWindow * 100).toFixed(0)}%</dd>
                  <dt>Died mid own-animation</dt>
                  <dd>{(c.fractionDiedDuringOwnAnimation * 100).toFixed(0)}%</dd>
                  <dt>Median damage</dt>
                  <dd>{c.medianTotalDamage.toFixed(0)}</dd>
                  <dt>Damage p10-p90</dt>
                  <dd>
                    {c.p10TotalDamage.toFixed(0)} - {c.p90TotalDamage.toFixed(0)}
                  </dd>
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {isSustained && sustainedResults.candidates && (
        <section className="panel">
          <h2>Own damage + attributable team damage over time (one representative run)</h2>
          <p className="caveats" style={{ marginBottom: 12 }}>
            Simulated window: ~{chartMaxSeconds.toFixed(1)}s, sized to the longer-mean-surviving candidate. This chart
            draws one reproducible run (seed 1) from the distribution above — the boss's charged-move timing is
            randomized, so an individual run's exact crossing point varies; the stat cards above are the actual
            distribution to trust for conclusions.
          </p>
          <DamageOverTimeChart
            x={{
              name: sustainedResults.candidates[0]!.name,
              ownDamageTrajectory: sustainedResults.candidates[0]!.representativeRun.ownDamageTrajectory,
              secondsSurvivedCutoff: sustainedResults.candidates[0]!.meanSecondsSurvived,
              boostMultiplier: species.candidates![0].boost?.multiplier ?? 1,
            }}
            y={{
              name: sustainedResults.candidates[1]!.name,
              ownDamageTrajectory: sustainedResults.candidates[1]!.representativeRun.ownDamageTrajectory,
              secondsSurvivedCutoff: sustainedResults.candidates[1]!.meanSecondsSurvived,
              boostMultiplier: species.candidates![1].boost?.multiplier ?? 1,
            }}
            teammateDps={assumptions.teammateDps}
            partySize={assumptions.partySize}
            typeMatches={{ x: assumptions.teammateTypeMatches, y: assumptions.teammateTypeMatches }}
            maxSeconds={chartMaxSeconds}
          />
        </section>
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
          The "boss ready for its first charged move" window is derived from the target's own fast-move energy gain
          and its charged move's cost — not a free assumption — and is a lower bound: it counts only the boss's own
          fast-move casts, not the energy real raid bosses also gain from damage taken, so a boss could in principle
          go off sooner, never later. Toggling "boss starts already partway charged" models tagging in mid-fight
          against a boss an earlier trainer's mega left partway (or, at 100%, fully) charged — at 100% there's no
          fast-move-only window left to show, so switch to Sustained to model that fight. Any boss hit — fast or
          charged — that lands while a candidate is mid-animation on its own charged move deals guaranteed full
          damage: you can't throw a new dodge while locked into your own cast, and a dodge's reduction window
          (roughly 0.7s) couldn't cover a multi-second animation even if you could. That's also why a raid boss's
          charged move works differently from what "dodging it" might suggest — the damage lands all at once at the
          moment it fires, not on a windup you can react to mid-swing. Many real Flying-type raid targets are
          dual-typed, so an Electric attacker isn't automatically the best choice against them. The mega boost
          multiplier is load-bearing: at 1.1x instead of 1.3x, which candidate leads can flip — see the sensitivity
          panel. Raid targets marked "approximate" use a documented stand-in species' stats (e.g. a Shadow-prefixed
          raid boss matched to its non-Shadow base stats) because no better data exists yet — treat those results as
          directional, not exact. Species marked "hypothetical" are not live-game content at all.
        </p>
      </section>
    </div>
  );
}
