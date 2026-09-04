import { useMemo, useState } from "react";
import {
  MEGA_RAICHU_X,
  MEGA_RAICHU_Y,
  MEGA_SKARMORY,
  PRIMAL_KYOGRE,
  buildScenarioUrl,
  parseScenarioFromUrl,
  runComparison,
  type Scenario,
  type SpeciesDefinition,
} from "@pogo-analyzer/engine";
import { AssumptionPanel, type Assumptions } from "./AssumptionPanel.js";
import { CrossoverChart } from "./CrossoverChart.js";
import { SensitivityView } from "./SensitivityView.js";
import { computeSensitivity } from "./sensitivity.js";

const CANDIDATES: [SpeciesDefinition, SpeciesDefinition] = [MEGA_RAICHU_X, MEGA_RAICHU_Y];
const TARGETS: SpeciesDefinition[] = [PRIMAL_KYOGRE, MEGA_SKARMORY];

const DEFAULT_ASSUMPTIONS: Assumptions = {
  targetId: PRIMAL_KYOGRE.id,
  level: 35,
  ivAttack: 15,
  ivDefense: 15,
  ivStamina: 15,
  dodge: { kind: "none" },
  bossChargedMoveFrequencySeconds: 15,
  openingBurstSeconds: 20,
  phase: "opening-burst",
  partySize: 4,
  teammateDps: 26.5,
  teammateTypeMatches: true,
};

function assumptionsToScenario(a: Assumptions): Scenario {
  return {
    candidates: CANDIDATES.map((c) => c.id),
    target: a.targetId,
    level: a.level,
    ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
    dodgeModel: a.dodge,
    partySize: a.partySize,
    teammateDps: a.teammateDps,
    phase: a.phase,
  };
}

function scenarioToAssumptions(s: Scenario): Assumptions {
  return {
    targetId: s.target,
    level: s.level,
    ivAttack: s.ivs.attack,
    ivDefense: s.ivs.defense,
    ivStamina: s.ivs.stamina,
    dodge: s.dodgeModel,
    bossChargedMoveFrequencySeconds: DEFAULT_ASSUMPTIONS.bossChargedMoveFrequencySeconds,
    openingBurstSeconds: DEFAULT_ASSUMPTIONS.openingBurstSeconds,
    phase: s.phase,
    partySize: s.partySize,
    teammateDps: s.teammateDps,
    teammateTypeMatches: DEFAULT_ASSUMPTIONS.teammateTypeMatches,
  };
}

function initialAssumptions(): Assumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parseScenarioFromUrl(window.location.href);
  return fromUrl ? scenarioToAssumptions(fromUrl) : DEFAULT_ASSUMPTIONS;
}

export function App() {
  const [assumptions, setAssumptions] = useState<Assumptions>(initialAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const ivs = useMemo(
    () => ({ attack: assumptions.ivAttack, defense: assumptions.ivDefense, stamina: assumptions.ivStamina }),
    [assumptions.ivAttack, assumptions.ivDefense, assumptions.ivStamina],
  );

  const boss = TARGETS.find((t) => t.id === assumptions.targetId) ?? PRIMAL_KYOGRE;

  const results = useMemo(() => {
    try {
      return {
        candidates: runComparison({
          candidates: CANDIDATES,
          boss,
          level: assumptions.level,
          ivs,
          dodge: assumptions.dodge,
          openingBurstSeconds: assumptions.openingBurstSeconds,
        }),
        error: null as string | null,
      };
    } catch (err) {
      return { candidates: null, error: (err as Error).message };
    }
  }, [boss, assumptions.level, ivs, assumptions.dodge, assumptions.openingBurstSeconds]);

  const sensitivity = useMemo(() => {
    try {
      return computeSensitivity(CANDIDATES, boss, assumptions);
    } catch {
      return [];
    }
  }, [boss, assumptions]);

  function handleShare() {
    const url = buildScenarioUrl(window.location.href.split("?")[0]!, assumptionsToScenario(assumptions));
    window.history.replaceState(null, "", url);
    setShareUrl(url);
  }

  return (
    <div className="app">
      <h1>Pokémon GO Scenario Comparator</h1>
      <p className="subtitle">
        Mega Raichu X vs Mega Raichu Y vs {boss.name} — survivability counted as team DPS, not just raw damage.
      </p>

      <AssumptionPanel
        value={assumptions}
        onChange={setAssumptions}
        targetOptions={TARGETS.map((t) => ({ id: t.id, name: t.name }))}
      />

      {results.error && (
        <section className="panel">
          <p style={{ color: "#ff6b6b" }}>Could not compute this scenario: {results.error}</p>
        </section>
      )}

      {results.candidates && (
        <>
          <section className="panel">
            <h2>Opening burst, no boss charged moves</h2>
            <div className="result-row">
              {results.candidates.map((c, i) => (
                <div key={c.id} className={`result-card ${i === 0 ? "x" : "y"}`}>
                  <h3>{c.name}</h3>
                  <dl>
                    <dt>Survives</dt>
                    <dd>
                      {c.secondsSurvived.toFixed(1)}s{c.secondsSurvived >= assumptions.openingBurstSeconds ? " (window ended, still alive)" : ""}
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
            <h2>Crossover — total team contribution vs party size</h2>
            <CrossoverChart
              x={results.candidates[0]!}
              y={results.candidates[1]!}
              teammateDps={assumptions.teammateDps}
              typeMatches={{ x: assumptions.teammateTypeMatches, y: assumptions.teammateTypeMatches }}
              currentPartySize={assumptions.partySize}
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
          The opening-burst numbers above only hold for the window configured above, before a real boss would start
          randomly throwing charged moves — Phase 5 models that with a distribution instead of a point estimate. Both
          forms can still die mid-animation during their own charged move if the boss's next hit lands during that
          window. Many real Flying-type raid targets are dual-typed, so an Electric attacker isn't automatically the
          best choice against them. And the mega boost multiplier is load-bearing: at 1.1x instead of 1.3x, which
          candidate wins the crossover chart can flip — see the sensitivity panel.
        </p>
      </section>
    </div>
  );
}
