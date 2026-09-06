import { useMemo, useState } from "react";
import {
  WEATHER_BOOSTED_TYPES,
  bossEffectiveStats,
  compareIvSpreads,
  isWeatherBoosted,
  resolveMove,
  typeEffectiveness,
  type DodgeBehavior,
  type IVSpread,
  type IvComparisonResult,
  type IvComparisonRow,
  type SpeciesDefinition,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import { MoveSelect } from "./MoveSelect.js";
import { SpeciesPicker } from "./SpeciesPicker.js";
import {
  buildIvBreakpointsScenarioUrl,
  parseIvBreakpointsScenarioFromUrl,
  type IvBreakpointsScenario,
} from "./ivBreakpointsScenario.js";
import { candidatePickerOptions, raidTierForSpeciesId, speciesRegistry, targetPickerOptions, unmatchedActiveRaids } from "./registry.js";

// Same weather-option construction as AssumptionPanel.tsx/TeamAssumptionPanel.tsx/
// SpeciesReportView.tsx — duplicated rather than imported, matching the
// precedent those three already set (a small, cheap, self-contained constant).
const WEATHER_LABELS: Record<WeatherCondition, string> = {
  none: "None",
  sunny: "Sunny/Clear",
  rainy: "Rain",
  windy: "Windy",
  cloudy: "Cloudy",
  fog: "Fog",
  snow: "Snow",
  partly_cloudy: "Partly Cloudy",
};
const WEATHER_OPTIONS: { value: WeatherCondition; label: string }[] = (
  Object.keys(WEATHER_BOOSTED_TYPES) as WeatherCondition[]
).map((value) => {
  const boosted = WEATHER_BOOSTED_TYPES[value];
  return {
    value,
    label: boosted.length === 0 ? WEATHER_LABELS[value] : `${WEATHER_LABELS[value]} (boosts ${boosted.join("/")})`,
  };
});

// The motivating real case this tab was built for: a real user's two owned
// Delphox, wondering which spread is worth the candy/stardust to power up.
const DEFAULT_SPECIES_ID = "delphox";
const DEFAULT_IV_A: IVSpread = { attack: 14, defense: 15, stamina: 15 };
const DEFAULT_IV_B: IVSpread = { attack: 15, defense: 13, stamina: 15 };
// A real, currently-active raid boss (Mega Steelix, "Mega Raids" tier as of
// this data sync) — same "ready-to-run on first load" convention as the other
// three tabs' own DEFAULT_CANDIDATE_A_ID/DEFAULT_TARGET_ID/DEFAULT_SPECIES_ID.
const DEFAULT_TARGET_ID = "steelix-mega";

export interface IvBreakpointsAssumptions {
  speciesId: string;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  ivA: IVSpread;
  ivB: IVSpread;
  targetId: string;
  bossFastMoveId: string | null;
  dodge: DodgeBehavior;
  weather: WeatherCondition;
}

const DEFAULT_ASSUMPTIONS: IvBreakpointsAssumptions = {
  speciesId: DEFAULT_SPECIES_ID,
  fastMoveId: null,
  chargedMoveId: null,
  ivA: DEFAULT_IV_A,
  ivB: DEFAULT_IV_B,
  targetId: DEFAULT_TARGET_ID,
  bossFastMoveId: null,
  dodge: { kind: "none" },
  weather: "none",
};

function assumptionsToScenario(a: IvBreakpointsAssumptions): IvBreakpointsScenario {
  return {
    speciesId: a.speciesId,
    fastMoveId: a.fastMoveId,
    chargedMoveId: a.chargedMoveId,
    ivA: a.ivA,
    ivB: a.ivB,
    targetId: a.targetId,
    bossFastMoveId: a.bossFastMoveId,
    dodgeModel: a.dodge,
    weather: a.weather,
  };
}

function scenarioToAssumptions(s: IvBreakpointsScenario): IvBreakpointsAssumptions {
  return {
    speciesId: s.speciesId,
    fastMoveId: s.fastMoveId ?? null,
    chargedMoveId: s.chargedMoveId ?? null,
    ivA: s.ivA ?? DEFAULT_ASSUMPTIONS.ivA,
    ivB: s.ivB ?? DEFAULT_ASSUMPTIONS.ivB,
    targetId: s.targetId,
    bossFastMoveId: s.bossFastMoveId ?? null,
    // `??` guards a scenario URL encoded before a field existed rather than
    // surfacing `undefined` into a controlled input — same discipline as
    // App.tsx's/SpeciesReportView's scenarioToAssumptions.
    dodge: s.dodgeModel ?? DEFAULT_ASSUMPTIONS.dodge,
    weather: s.weather ?? DEFAULT_ASSUMPTIONS.weather,
  };
}

function initialAssumptions(): IvBreakpointsAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parseIvBreakpointsScenarioFromUrl(window.location.href);
  return fromUrl ? scenarioToAssumptions(fromUrl) : DEFAULT_ASSUMPTIONS;
}

function resolveSpecies(id: string): SpeciesDefinition | null {
  return speciesRegistry.has(id) ? speciesRegistry.get(id) : null;
}

function speciesLabel(s: SpeciesDefinition): string {
  return s.isHypothetical ? `${s.name} (hypothetical)` : s.name;
}

function SpeciesIcon({ s }: { s: SpeciesDefinition }) {
  return s.imageUrl ? <img src={s.imageUrl} alt="" className="species-icon" /> : null;
}

function ivLabel(iv: IVSpread): string {
  return `${iv.attack}/${iv.defense}/${iv.stamina}`;
}

/**
 * "First becomes different at level X" — deliberately NOT "from level X
 * onward", since divergence between two IV spreads is not monotonic across
 * levels (floor-rounding can close a gap back up at a higher level even after
 * it opened lower down — see ivComparison.ts's own doc comment on
 * IvComparisonResult.firstDivergenceLevel). The full per-level table below is
 * the source of truth; this sentence is a headline pointer into it, not a
 * summary that replaces it.
 */
function headline(result: IvComparisonResult, ivA: IVSpread, ivB: IVSpread): string {
  const { fastMoveDamage, chargedMoveDamage, timeToFaint } = result.firstDivergenceLevel;
  if (fastMoveDamage === null && chargedMoveDamage === null && timeToFaint === null) {
    return `Spread A (${ivLabel(ivA)}) and Spread B (${ivLabel(ivB)}) are functionally identical at every level scanned against this target — no fast-move damage, charged-move damage, or time-to-faint difference appears anywhere in range. Powering up whichever spread is cheaper for you costs nothing here.`;
  }
  const parts: string[] = [];
  if (fastMoveDamage !== null) parts.push(`fast-move damage first becomes different at level ${fastMoveDamage}`);
  if (chargedMoveDamage !== null) parts.push(`charged-move damage first becomes different at level ${chargedMoveDamage}`);
  if (timeToFaint !== null) parts.push(`time-to-faint first becomes different at level ${timeToFaint}`);
  return `${parts.join("; ")}. This is the FIRST level any gap appears, not a permanent split — a gap can open and then close again at a higher level purely from floor-rounding, so check each row below rather than assuming the difference holds from this level on.`;
}

/**
 * "IV Breakpoints" — the IV/level-investment analogue of this project's core
 * "where does the ranking flip" thesis: compares TWO IV spreads of the SAME
 * species/moveset across every level, to answer "is it worth spending
 * candy/stardust to power up spread A over spread B, and if so starting at
 * what level". Built for a real motivating case: a user's two owned Delphox
 * (14/15/15 and 15/13/15) — see DEFAULT_IV_A/DEFAULT_IV_B.
 *
 * Thin UI over packages/engine/src/ivComparison.ts's compareIvSpreads
 * (already built and tested) — this view supplies the damage-modifier
 * objects (STAB/type-effectiveness/weather) that function needs, computed
 * with the exact same exported primitives (typeEffectiveness/isWeatherBoosted/
 * bossEffectiveStats/resolveMove) that comparison.ts's runSustainedComparison
 * uses internally, rather than re-deriving type effectiveness by hand.
 */
export function IvBreakpointsView() {
  const [assumptions, setAssumptions] = useState<IvBreakpointsAssumptions>(initialAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const speciesOptions = useMemo(() => candidatePickerOptions(), []);
  const targetOptions = useMemo(() => targetPickerOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);

  const species = useMemo(() => resolveSpecies(assumptions.speciesId), [assumptions.speciesId]);
  const boss = useMemo(() => resolveSpecies(assumptions.targetId), [assumptions.targetId]);
  const bossRaidTier = useMemo(() => raidTierForSpeciesId(assumptions.targetId) ?? undefined, [assumptions.targetId]);

  // There is no user-selectable "combat phase" here either, same standing
  // decision as every other tab — though this simplified per-level model has
  // no phased combat at all (see the caveats section below): it treats the
  // target's incoming damage as its fast move landing repeatedly, forever,
  // with no charged-move combat modeled on either side of the matchup.
  const result = useMemo(() => {
    if (!species || !boss) return { data: null as IvComparisonResult | null, error: null as string | null };
    try {
      const fastMove = resolveMove(species.fastMoves, assumptions.fastMoveId);
      const chargedMove = resolveMove(species.chargedMoves, assumptions.chargedMoveId);
      const bossFastMove = resolveMove(boss.fastMoves, assumptions.bossFastMoveId);
      if (!fastMove || !chargedMove) throw new Error(`${species.name} needs at least one fast move and one charged move.`);
      if (!bossFastMove) throw new Error(`${boss.name} has no fast move defined.`);

      const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(boss, bossRaidTier);

      const fastMoveDamageModifiers = {
        stab: species.types.includes(fastMove.type),
        typeEffectiveness: typeEffectiveness(fastMove.type, boss.types),
        weatherBoosted: isWeatherBoosted(fastMove.type, assumptions.weather),
      };
      const chargedMoveDamageModifiers = {
        stab: species.types.includes(chargedMove.type),
        typeEffectiveness: typeEffectiveness(chargedMove.type, boss.types),
        weatherBoosted: isWeatherBoosted(chargedMove.type, assumptions.weather),
      };
      const incomingDamageModifiers = {
        stab: boss.types.includes(bossFastMove.type),
        typeEffectiveness: typeEffectiveness(bossFastMove.type, species.types),
        weatherBoosted: isWeatherBoosted(bossFastMove.type, assumptions.weather),
      };

      return {
        data: compareIvSpreads({
          species,
          fastMove,
          chargedMove,
          ivA: assumptions.ivA,
          ivB: assumptions.ivB,
          bossDefenseStat,
          fastMoveDamageModifiers,
          chargedMoveDamageModifiers,
          bossAttackStat,
          bossFastMovePower: bossFastMove.power,
          bossFastMoveDurationSeconds: bossFastMove.durationSeconds,
          incomingDamageModifiers,
          dodge: assumptions.dodge,
        }),
        error: null as string | null,
      };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }, [
    species,
    boss,
    bossRaidTier,
    assumptions.fastMoveId,
    assumptions.chargedMoveId,
    assumptions.bossFastMoveId,
    assumptions.ivA,
    assumptions.ivB,
    assumptions.dodge,
    assumptions.weather,
  ]);

  function handleShare() {
    const url = new URL(
      buildIvBreakpointsScenarioUrl(window.location.href.split("?")[0]!, assumptionsToScenario(assumptions)),
    );
    url.searchParams.set("view", "iv-breakpoints");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  const overallError = result.error;
  const rows: IvComparisonRow[] = result.data?.rows ?? [];
  const divergingCounts = useMemo(
    () => ({
      fastMoveDamage: rows.filter((r) => r.fastMoveDamageDiffers).length,
      chargedMoveDamage: rows.filter((r) => r.chargedMoveDamageDiffers).length,
      timeToFaint: rows.filter((r) => r.timeToFaintDiffers).length,
    }),
    [rows],
  );

  return (
    <>
      <p className="subtitle">
        {species ? (
          <>
            <SpeciesIcon s={species} /> {speciesLabel(species)}
          </>
        ) : (
          "Pick a Pokémon"
        )}{" "}
        — Spread A ({ivLabel(assumptions.ivA)}) vs Spread B ({ivLabel(assumptions.ivB)}) vs{" "}
        {boss ? (
          <>
            <SpeciesIcon s={boss} /> {speciesLabel(boss)}
          </>
        ) : (
          "a target"
        )}{" "}
        — is it worth powering up one spread over the other, and starting at what level?
      </p>

      <section className="panel">
        <h2>Assumptions</h2>
        <div className="assumption-grid">
          <div>
            <SpeciesPicker
              idPrefix="iv-breakpoints-species"
              label="Pokémon (both spreads share this species and moveset)"
              options={speciesOptions}
              value={assumptions.speciesId}
              onChange={(id) =>
                // A previously-picked move id almost certainly doesn't exist
                // on the new species — reset both back to "use first move" in
                // the same update, same convention as the other three tabs.
                setAssumptions({ ...assumptions, speciesId: id, fastMoveId: null, chargedMoveId: null })
              }
            />
            {species && (
              <>
                <MoveSelect
                  idPrefix="iv-breakpoints-fast"
                  label="Fast move"
                  moves={species.fastMoves}
                  kind="fast"
                  value={assumptions.fastMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, fastMoveId: id })}
                />
                <MoveSelect
                  idPrefix="iv-breakpoints-charged"
                  label="Charged move"
                  moves={species.chargedMoves}
                  kind="charged"
                  value={assumptions.chargedMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, chargedMoveId: id })}
                />
              </>
            )}
          </div>

          <div>
            <p className="field-group-label">Spread A</p>
            <div className="iv-row">
              <div className="field">
                <label htmlFor="iv-breakpoints-a-attack">Attack IV</label>
                <input
                  id="iv-breakpoints-a-attack"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivA.attack}
                  onChange={(e) => setAssumptions({ ...assumptions, ivA: { ...assumptions.ivA, attack: Number(e.target.value) } })}
                />
              </div>
              <div className="field">
                <label htmlFor="iv-breakpoints-a-defense">Defense IV</label>
                <input
                  id="iv-breakpoints-a-defense"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivA.defense}
                  onChange={(e) => setAssumptions({ ...assumptions, ivA: { ...assumptions.ivA, defense: Number(e.target.value) } })}
                />
              </div>
              <div className="field">
                <label htmlFor="iv-breakpoints-a-stamina">Stamina IV</label>
                <input
                  id="iv-breakpoints-a-stamina"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivA.stamina}
                  onChange={(e) => setAssumptions({ ...assumptions, ivA: { ...assumptions.ivA, stamina: Number(e.target.value) } })}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="field-group-label">Spread B</p>
            <div className="iv-row">
              <div className="field">
                <label htmlFor="iv-breakpoints-b-attack">Attack IV</label>
                <input
                  id="iv-breakpoints-b-attack"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivB.attack}
                  onChange={(e) => setAssumptions({ ...assumptions, ivB: { ...assumptions.ivB, attack: Number(e.target.value) } })}
                />
              </div>
              <div className="field">
                <label htmlFor="iv-breakpoints-b-defense">Defense IV</label>
                <input
                  id="iv-breakpoints-b-defense"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivB.defense}
                  onChange={(e) => setAssumptions({ ...assumptions, ivB: { ...assumptions.ivB, defense: Number(e.target.value) } })}
                />
              </div>
              <div className="field">
                <label htmlFor="iv-breakpoints-b-stamina">Stamina IV</label>
                <input
                  id="iv-breakpoints-b-stamina"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivB.stamina}
                  onChange={(e) => setAssumptions({ ...assumptions, ivB: { ...assumptions.ivB, stamina: Number(e.target.value) } })}
                />
              </div>
            </div>
          </div>

          <div>
            <SpeciesPicker
              idPrefix="iv-breakpoints-target"
              label="Raid boss / target"
              options={targetOptions}
              value={assumptions.targetId}
              onChange={(id) => setAssumptions({ ...assumptions, targetId: id, bossFastMoveId: null })}
            />
            {boss && (
              <MoveSelect
                idPrefix="iv-breakpoints-boss-fast"
                label="Target's fast move"
                moves={boss.fastMoves}
                kind="fast"
                value={assumptions.bossFastMoveId}
                onChange={(id) => setAssumptions({ ...assumptions, bossFastMoveId: id })}
              />
            )}
          </div>

          <div className="field">
            <label htmlFor="iv-breakpoints-dodge">Dodge the target's attacks</label>
            <select
              id="iv-breakpoints-dodge"
              value={assumptions.dodge.kind}
              onChange={(e) => {
                const kind = e.target.value as DodgeBehavior["kind"];
                setAssumptions({
                  ...assumptions,
                  dodge: kind === "percentage-missed" ? { kind, missedFraction: 0.5 } : ({ kind } as DodgeBehavior),
                });
              }}
            >
              <option value="none">None</option>
              <option value="perfect">Perfect</option>
              <option value="percentage-missed">Percentage missed</option>
            </select>
          </div>

          {assumptions.dodge.kind === "percentage-missed" && (
            <div className="field">
              <label htmlFor="iv-breakpoints-missedFraction">Fraction of hits NOT dodged</label>
              <input
                id="iv-breakpoints-missedFraction"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={assumptions.dodge.missedFraction}
                onChange={(e) =>
                  setAssumptions({ ...assumptions, dodge: { kind: "percentage-missed", missedFraction: Number(e.target.value) } })
                }
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="iv-breakpoints-weather">Weather</label>
            <select
              id="iv-breakpoints-weather"
              value={assumptions.weather}
              onChange={(e) => setAssumptions({ ...assumptions, weather: e.target.value as WeatherCondition })}
              title="Boosts damage 1.2x for moves whose type matches the active weather — applies independently to this species' and the target's own moves, checked per move's own type."
            >
              {WEATHER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {unmatchedRaids.length > 0 && (
          <p className="species-picker-hint" title="These raids are currently active but have no usable stat data yet.">
            Other raids currently live in-game that this tool can't target yet (no stat data available):{" "}
            {unmatchedRaids.map((r) => `${r.raidName} (${r.tier})`).join(", ")}
          </p>
        )}
      </section>

      {overallError && (
        <section className="panel">
          <p style={{ color: "#ff6b6b" }}>Could not compute this comparison: {overallError}</p>
        </section>
      )}

      {result.data && species && (
        <section className="panel">
          <h2>Per-level breakdown</h2>
          <p className="crossover-note">{headline(result.data, assumptions.ivA, assumptions.ivB)}</p>
          <p className="caveats" style={{ margin: "8px 0 12px" }}>
            {divergingCounts.fastMoveDamage} of {rows.length} levels show a fast-move damage difference,{" "}
            {divergingCounts.chargedMoveDamage} of {rows.length} show a charged-move damage difference, and{" "}
            {divergingCounts.timeToFaint} of {rows.length} show a time-to-faint difference. Divergent cells are
            highlighted below, with the higher value in each diverging pair bolded.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="time-series-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Level</th>
                  <th colSpan={5} className="time-series-th-x">
                    Spread A ({ivLabel(assumptions.ivA)})
                  </th>
                  <th colSpan={5} className="time-series-th-y">
                    Spread B ({ivLabel(assumptions.ivB)})
                  </th>
                </tr>
                <tr>
                  <th className="time-series-th-x">Atk/Def/HP</th>
                  <th className="time-series-th-x">Fast dmg</th>
                  <th className="time-series-th-x">Charged dmg</th>
                  <th className="time-series-th-x" colSpan={2}>
                    Time to faint
                  </th>
                  <th className="time-series-th-y">Atk/Def/HP</th>
                  <th className="time-series-th-y">Fast dmg</th>
                  <th className="time-series-th-y">Charged dmg</th>
                  <th className="time-series-th-y" colSpan={2}>
                    Time to faint
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const fmtTtf = (v: number | null) => (v === null ? `>${60}s` : `${v.toFixed(1)}s`);
                  const fastWinner =
                    row.fastMoveDamageDiffers && row.ivA.fastMoveDamage !== row.ivB.fastMoveDamage
                      ? row.ivA.fastMoveDamage > row.ivB.fastMoveDamage
                        ? "a"
                        : "b"
                      : null;
                  const chargedWinner =
                    row.chargedMoveDamageDiffers && row.ivA.chargedMoveDamage !== row.ivB.chargedMoveDamage
                      ? row.ivA.chargedMoveDamage > row.ivB.chargedMoveDamage
                        ? "a"
                        : "b"
                      : null;
                  const ttfWinner =
                    row.timeToFaintDiffers
                      ? (row.ivA.timeToFaintSeconds ?? Infinity) > (row.ivB.timeToFaintSeconds ?? Infinity)
                        ? "a"
                        : (row.ivA.timeToFaintSeconds ?? Infinity) < (row.ivB.timeToFaintSeconds ?? Infinity)
                          ? "b"
                          : null
                      : null;
                  return (
                    <tr key={row.level}>
                      <td>{row.level}</td>
                      <td>
                        {row.ivA.attackStat}/{row.ivA.defenseStat}/{row.ivA.hp}
                      </td>
                      <td className={row.fastMoveDamageDiffers ? "iv-cell-diverges" : undefined}>
                        <span className={fastWinner === "a" ? "iv-cell-winner" : undefined}>{row.ivA.fastMoveDamage}</span>
                      </td>
                      <td className={row.chargedMoveDamageDiffers ? "iv-cell-diverges" : undefined}>
                        <span className={chargedWinner === "a" ? "iv-cell-winner" : undefined}>{row.ivA.chargedMoveDamage}</span>
                      </td>
                      <td className={row.timeToFaintDiffers ? "iv-cell-diverges" : undefined} colSpan={2}>
                        <span className={ttfWinner === "a" ? "iv-cell-winner" : undefined}>{fmtTtf(row.ivA.timeToFaintSeconds)}</span>
                      </td>
                      <td>
                        {row.ivB.attackStat}/{row.ivB.defenseStat}/{row.ivB.hp}
                      </td>
                      <td className={row.fastMoveDamageDiffers ? "iv-cell-diverges" : undefined}>
                        <span className={fastWinner === "b" ? "iv-cell-winner" : undefined}>{row.ivB.fastMoveDamage}</span>
                      </td>
                      <td className={row.chargedMoveDamageDiffers ? "iv-cell-diverges" : undefined}>
                        <span className={chargedWinner === "b" ? "iv-cell-winner" : undefined}>{row.ivB.chargedMoveDamage}</span>
                      </td>
                      <td className={row.timeToFaintDiffers ? "iv-cell-diverges" : undefined} colSpan={2}>
                        <span className={ttfWinner === "b" ? "iv-cell-winner" : undefined}>{fmtTtf(row.ivB.timeToFaintSeconds)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
          This is a deliberately simpler model than the Comparator/Team Raid/Species Report tabs' full randomized
          stepwise simulator: the target's incoming damage here is modeled as its FAST move landing repeatedly,
          forever (see engine's ivComparison.ts/breakpoints.ts timeToFaint) — there is no charged-move combat on
          either side of this matchup, and no randomized boss charged-move timing to average over. That's what makes
          it cheap enough to sweep every level in one pass; for a full simulated fight at one specific level, use the
          Comparator tab instead. "Time to faint" shows "&gt;60s" when a spread would outlast this model's 60-second
          scan window. Divergence between two spreads is NOT monotonic across levels — floor-rounding can make two
          different raw stats collapse to the same floored effective stat (or the same floored damage) at one level
          and then diverge again at the next, so a gap opening at one level is not a promise it stays open above it;
          the per-level table is the source of truth, not the headline sentence above it. This view does not model a
          mega/primal species' own-damage boost multiplier at all — pick a non-mega, non-primal species for an exact
          match, or use the Comparator/Species Report tabs for a mega-form species. Raid targets marked "approximate"
          use a documented stand-in species' stats because no better data exists yet — treat those results as
          directional, not exact.
        </p>
      </section>
    </>
  );
}
