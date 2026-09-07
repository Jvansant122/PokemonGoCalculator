import { useMemo, useState } from "react";
import {
  WEATHER_BOOSTED_TYPES,
  runSpeciesReverseLookup,
  type AttackerTypeProfile,
  type DodgeBehavior,
  type SpeciesDefinition,
  type SpeciesReportResult,
  type SpeciesReportRow,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import type { ComparatorPrefill } from "./comparatorPrefill.js";
import { MoveSelect } from "./MoveSelect.js";
import { SpeciesBadges } from "./SpeciesBadges.js";
import { SpeciesPicker } from "./SpeciesPicker.js";
import {
  buildSpeciesReportScenarioUrl,
  parseSpeciesReportScenarioFromUrl,
  type SpeciesReportScenario,
  type SpeciesReportSortMode,
} from "./speciesReportScenario.js";
import { getBaseUrl } from "./urlUtils.js";
import { activeRaidBossOptions, candidatePickerOptions, raidTierForSpeciesId, speciesRegistry, unmatchedActiveRaids } from "./registry.js";

// Same weather-option construction as AssumptionPanel.tsx/TeamAssumptionPanel.tsx
// — duplicated rather than imported, matching the precedent those two already
// set (a small, cheap, self-contained constant, not worth a shared module).
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

// A ready-to-run default so a fresh page load demonstrates a real ranked
// table immediately, not an empty form — same precedent as the other two
// tabs' DEFAULT_CANDIDATE_A_ID/DEFAULT_TARGET_ID.
const DEFAULT_SPECIES_ID = "kartana";

export interface SpeciesReportAssumptions {
  speciesId: string;
  /** null = use this species' first fast move. */
  fastMoveId: string | null;
  /** null = use this species' first charged move. */
  chargedMoveId: string | null;
  level: number;
  ivAttack: number;
  ivDefense: number;
  ivStamina: number;
  /** Governs dodging each swept boss's CHARGED attacks. */
  dodge: DodgeBehavior;
  /** Whether the species also attempts to dodge each boss's fast attacks. */
  dodgeFastAttacks: boolean;
  weather: WeatherCondition;
  /** Mean seconds between each boss's charged moves once it starts using them — one shared assumption swept across every boss target. */
  bossChargedMoveFrequencySeconds: number;
  /** Which column the results table is sorted by — display-only, but still a real setting a shared link must preserve. */
  sortMode: SpeciesReportSortMode;
}

const DEFAULT_ASSUMPTIONS: SpeciesReportAssumptions = {
  speciesId: DEFAULT_SPECIES_ID,
  fastMoveId: null,
  chargedMoveId: null,
  level: 40,
  ivAttack: 15,
  ivDefense: 15,
  ivStamina: 15,
  dodge: { kind: "none" },
  dodgeFastAttacks: false,
  weather: "none",
  bossChargedMoveFrequencySeconds: 15,
  sortMode: "damage",
};

function assumptionsToScenario(a: SpeciesReportAssumptions): SpeciesReportScenario {
  return {
    speciesId: a.speciesId,
    fastMoveId: a.fastMoveId,
    chargedMoveId: a.chargedMoveId,
    level: a.level,
    ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
    dodgeModel: a.dodge,
    dodgeFastAttacks: a.dodgeFastAttacks,
    weather: a.weather,
    bossChargedMoveFrequencySeconds: a.bossChargedMoveFrequencySeconds,
    sortMode: a.sortMode,
  };
}

function scenarioToAssumptions(s: SpeciesReportScenario): SpeciesReportAssumptions {
  return {
    speciesId: s.speciesId,
    fastMoveId: s.fastMoveId ?? null,
    chargedMoveId: s.chargedMoveId ?? null,
    level: s.level,
    ivAttack: s.ivs.attack,
    ivDefense: s.ivs.defense,
    ivStamina: s.ivs.stamina,
    dodge: s.dodgeModel,
    // `??` guards a scenario URL encoded before a field existed rather than
    // surfacing `undefined` into a controlled input — same discipline as
    // App.tsx's scenarioToAssumptions/TeamRaidView's teamScenarioToAssumptions.
    dodgeFastAttacks: s.dodgeFastAttacks ?? DEFAULT_ASSUMPTIONS.dodgeFastAttacks,
    weather: s.weather ?? "none",
    bossChargedMoveFrequencySeconds: s.bossChargedMoveFrequencySeconds ?? DEFAULT_ASSUMPTIONS.bossChargedMoveFrequencySeconds,
    // `??` guards a scenario URL encoded before this field existed (the bug
    // this exact change is fixing) rather than surfacing `undefined` into the
    // sort-mode toggle's active-button check.
    sortMode: s.sortMode ?? DEFAULT_ASSUMPTIONS.sortMode,
  };
}

function initialAssumptions(): SpeciesReportAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parseSpeciesReportScenarioFromUrl(window.location.href);
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

function sortRows(rows: SpeciesReportRow[], mode: SpeciesReportSortMode): SpeciesReportRow[] {
  const copy = rows.slice();
  if (mode === "typeMatchup") {
    copy.sort((a, b) => (b.typeMatchupPercentile ?? b.offensiveTypeMatchup) - (a.typeMatchupPercentile ?? a.offensiveTypeMatchup));
  } else {
    copy.sort((a, b) => b.sustained.meanTotalDamage - a.sustained.meanTotalDamage);
  }
  return copy;
}

/**
 * "What raid bosses is this Pokémon good against" reverse lookup — see
 * .claude/agent-memory/pogo-researcher/proposal_species_reverse_lookup.md for
 * the full design and packages/engine/src/speciesReport.ts for the engine
 * surface this view calls (runSpeciesReverseLookup, already built and tested).
 *
 * Scoped to the ~10-12 currently-active real raid bosses only (activeRaidBossOptions())
 * — not every species that has ever been a boss, since this project has no
 * queryable "ever a boss" tag (see the design doc section 1). No synthetic
 * "other trainers" team-boost modeling here either (section 2) — a species'
 * own mega/primal boost, if any, is shown only as a plain informational badge,
 * never folded into a fabricated team-damage number.
 */
export function SpeciesReportView({ onCompare }: { onCompare: (prefill: ComparatorPrefill) => void }) {
  const [assumptions, setAssumptions] = useState<SpeciesReportAssumptions>(initialAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const speciesOptions = useMemo(() => candidatePickerOptions(), []);
  const bossOptions = useMemo(() => activeRaidBossOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);
  const bossMetaById = useMemo(() => new Map(bossOptions.map((b) => [b.id, b])), [bossOptions]);

  const species = useMemo(() => resolveSpecies(assumptions.speciesId), [assumptions.speciesId]);

  const ivs = useMemo(
    () => ({ attack: assumptions.ivAttack, defense: assumptions.ivDefense, stamina: assumptions.ivStamina }),
    [assumptions.ivAttack, assumptions.ivDefense, assumptions.ivStamina],
  );

  // Every registered species' own default fast/charged move TYPES — the
  // cheap, no-simulation corpus for the type-matchup-percentile stat (see
  // speciesReport.ts's typeMatchupCorpus doc comment). Pure arithmetic over
  // ~1079 entries, computed once.
  const typeMatchupCorpus = useMemo<AttackerTypeProfile[]>(
    () =>
      speciesRegistry
        .all()
        .filter((s) => s.fastMoves.length > 0 && s.chargedMoves.length > 0)
        .map((s) => ({ fastMoveType: s.fastMoves[0]!.type, chargedMoveType: s.chargedMoves[0]!.type })),
    [],
  );

  // The bosses to sweep — every currently-active raid boss this registry can
  // resolve, each with its own real per-tier attack/defense/HP (bossRaidTier),
  // exactly the shape speciesReport.ts's SpeciesReportBossTarget expects.
  const targets = useMemo(
    () => bossOptions.map((b) => ({ species: speciesRegistry.get(b.id), tier: raidTierForSpeciesId(b.id) ?? undefined })),
    [bossOptions],
  );

  // There is no user-selectable "combat phase" here either, same standing
  // decision as the other two tabs — each per-boss run is one continuous
  // runSustainedComparison call (see runSpeciesReverseLookup).
  const result = useMemo(() => {
    if (!species) return { data: null as SpeciesReportResult | null, error: null as string | null };
    try {
      return {
        data: runSpeciesReverseLookup({
          species,
          fastMoveId: assumptions.fastMoveId,
          chargedMoveId: assumptions.chargedMoveId,
          level: assumptions.level,
          ivs,
          dodge: assumptions.dodge,
          dodgeFastAttacks: assumptions.dodgeFastAttacks,
          weather: assumptions.weather,
          bossChargedMoveMeanIntervalSeconds: assumptions.bossChargedMoveFrequencySeconds,
          targets,
          typeMatchupCorpus,
        }),
        error: null as string | null,
      };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }, [
    species,
    assumptions.fastMoveId,
    assumptions.chargedMoveId,
    assumptions.level,
    ivs,
    assumptions.dodge,
    assumptions.dodgeFastAttacks,
    assumptions.weather,
    assumptions.bossChargedMoveFrequencySeconds,
    targets,
    typeMatchupCorpus,
  ]);

  const sortedRows = useMemo(
    () => (result.data ? sortRows(result.data.rows, assumptions.sortMode) : []),
    [result.data, assumptions.sortMode],
  );

  // An honest, cheap observation in place of the two-candidate comparator's
  // "ratio sentence" convention — this view has no second candidate to
  // compare against (see the design doc's section 2), so there's no
  // meaningful "X outputs Nx the other's" ratio to compute. What IS a real,
  // cheap comparison here: whether the two independent rankings (survival-
  // weighted sustained damage vs. the cheap type-only percentile) agree on
  // which boss is the best target, or diverge.
  const topByDamage = useMemo(() => (result.data ? sortRows(result.data.rows, "damage")[0] : undefined), [result.data]);
  const topByType = useMemo(() => (result.data ? sortRows(result.data.rows, "typeMatchup")[0] : undefined), [result.data]);

  function handleShare() {
    // Also pins `view=species-report` so reloading/sharing this link lands on
    // this tab, not whichever one happened to be open — see App.tsx's
    // tab-switch scaffold, which all three views' share flows now write into.
    const url = new URL(buildSpeciesReportScenarioUrl(getBaseUrl(), assumptionsToScenario(assumptions)));
    url.searchParams.set("view", "species-report");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  function handleCompare(row: SpeciesReportRow) {
    onCompare({
      targetId: row.bossId,
      candidateAId: assumptions.speciesId,
      candidateAFastMoveId: assumptions.fastMoveId,
      candidateAChargedMoveId: assumptions.chargedMoveId,
    });
  }

  const overallError = result.error;

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
        vs. every currently-active real raid boss — ranked by survival-weighted sustained output, not raw DPS.
      </p>

      <section className="panel">
        <h2>Assumptions</h2>
        <div className="assumption-grid">
          <div>
            <SpeciesPicker
              idPrefix="species-report-species"
              label="Pokémon"
              options={speciesOptions}
              value={assumptions.speciesId}
              onChange={(id) =>
                // A previously-picked move id almost certainly doesn't exist
                // on the new species — reset both back to "use first move" in
                // the same update, same convention as the other two tabs.
                setAssumptions({ ...assumptions, speciesId: id, fastMoveId: null, chargedMoveId: null })
              }
            />
            {species && (
              <>
                <MoveSelect
                  idPrefix="species-report-fast"
                  label="Fast move"
                  moves={species.fastMoves}
                  kind="fast"
                  value={assumptions.fastMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, fastMoveId: id })}
                />
                <MoveSelect
                  idPrefix="species-report-charged"
                  label="Charged move"
                  moves={species.chargedMoves}
                  kind="charged"
                  value={assumptions.chargedMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, chargedMoveId: id })}
                />
                {species.boost && (
                  <p
                    className="species-picker-hint"
                    title="Informational only — this view has no second party to attribute team-damage credit to (see the design doc's section 2), so this is never folded into any computed number here."
                  >
                    Has a mega/primal boost mechanic: grants a team-wide {species.boost.multiplier}x{" "}
                    {species.boost.boostedType} boost to OTHER trainers in the raid lobby while active (never this
                    species' own bench).
                  </p>
                )}
              </>
            )}
          </div>

          <div>
            <div className="field">
              <label htmlFor="species-report-level">Level</label>
              <input
                id="species-report-level"
                type="number"
                min={1}
                max={40}
                step={0.5}
                value={assumptions.level}
                onChange={(e) => setAssumptions({ ...assumptions, level: Number(e.target.value) })}
              />
            </div>
            <div className="iv-row">
              <div className="field">
                <label htmlFor="species-report-ivAttack">Attack IV</label>
                <input
                  id="species-report-ivAttack"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivAttack}
                  onChange={(e) => setAssumptions({ ...assumptions, ivAttack: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="species-report-ivDefense">Defense IV</label>
                <input
                  id="species-report-ivDefense"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivDefense}
                  onChange={(e) => setAssumptions({ ...assumptions, ivDefense: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="species-report-ivStamina">Stamina IV</label>
                <input
                  id="species-report-ivStamina"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivStamina}
                  onChange={(e) => setAssumptions({ ...assumptions, ivStamina: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="species-report-dodge">Dodge each boss's charged attacks</label>
            <select
              id="species-report-dodge"
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
              <label htmlFor="species-report-missedFraction">Fraction of charged hits NOT dodged</label>
              <input
                id="species-report-missedFraction"
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
            <label htmlFor="species-report-dodgeFastAttacks">Also dodge each boss's fast attacks?</label>
            <select
              id="species-report-dodgeFastAttacks"
              value={assumptions.dodgeFastAttacks ? "yes" : "no"}
              onChange={(e) => setAssumptions({ ...assumptions, dodgeFastAttacks: e.target.value === "yes" })}
              title="Dodging every fast attack costs 0.5s of the attack cycle each time — usually not worth it, but can matter for a glass cannon."
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="species-report-weather">Weather</label>
            <select
              id="species-report-weather"
              value={assumptions.weather}
              onChange={(e) => setAssumptions({ ...assumptions, weather: e.target.value as WeatherCondition })}
              title="Boosts damage 1.2x for moves whose type matches the active weather — applies independently to this species' and each boss's own moves, checked per move's own type."
            >
              {WEATHER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="species-report-bossFreq">Boss charged-move mean frequency (s)</label>
            <input
              id="species-report-bossFreq"
              type="number"
              min={1}
              value={assumptions.bossChargedMoveFrequencySeconds}
              onChange={(e) => setAssumptions({ ...assumptions, bossChargedMoveFrequencySeconds: Number(e.target.value) })}
              title="Mean seconds between each boss's charged moves once it's ready to use them (randomized +/-40% per run) — one shared assumption swept across every boss below."
            />
          </div>
        </div>

        {unmatchedRaids.length > 0 && (
          <p className="species-picker-hint" title="These raids are currently active but have no usable stat data yet.">
            Other raids currently live in-game that this tool can't sweep yet (no stat data available):{" "}
            {unmatchedRaids.map((r) => `${r.raidName} (${r.tier})`).join(", ")}
          </p>
        )}
      </section>

      {overallError && (
        <section className="panel">
          <p style={{ color: "#ff6b6b" }}>Could not compute this report: {overallError}</p>
        </section>
      )}

      {result.data && (
        <section className="panel">
          <h2>
            Ranked against {bossOptions.length} currently-active raid boss{bossOptions.length === 1 ? "" : "es"}
          </h2>
          <p className="caveats" style={{ marginBottom: 12 }}>
            Each row is the same real stepwise/dodge/randomized-boss-cadence simulator the two-candidate comparator
            uses (200 randomized runs per boss, single-candidate) — a survival-weighted number, not a flat
            power/duration DPS stat that ignores whether {result.data.speciesName} is even still alive against that
            specific boss's real incoming damage. "Type-matchup percentile" is different and cheaper: pure
            type-effectiveness arithmetic against every registered species' own default moveset, no simulation at
            all — labeled explicitly so it's never confused with the simulated ranking. Scoped to the currently-live
            raid roster only, not every species that has ever been a boss (no such list exists yet for this tool to
            query).
          </p>

          <div className="tab-switcher" role="group" aria-label="Sort by" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab-button${assumptions.sortMode === "damage" ? " active" : ""}`}
              onClick={() => setAssumptions({ ...assumptions, sortMode: "damage" })}
            >
              Sort: sustained mean damage
            </button>
            <button
              type="button"
              className={`tab-button${assumptions.sortMode === "typeMatchup" ? " active" : ""}`}
              onClick={() => setAssumptions({ ...assumptions, sortMode: "typeMatchup" })}
            >
              Sort: type-matchup percentile
            </button>
          </div>

          {topByDamage && topByType && (
            <p className="caveats" style={{ marginBottom: 12 }}>
              {topByDamage.bossId === topByType.bossId
                ? `Both rankings agree: ${bossMetaById.get(topByDamage.bossId)?.raidName ?? topByDamage.bossName} is the top result either way.`
                : `The two rankings disagree on the top result — sustained mean damage favors ${bossMetaById.get(topByDamage.bossId)?.raidName ?? topByDamage.bossName}, while the cheap type-only percentile favors ${bossMetaById.get(topByType.bossId)?.raidName ?? topByType.bossName}. The simulated (damage/survival) ranking is the one to trust for a real decision; the type percentile is sanity-check context only.`}
            </p>
          )}

          <table className="time-series-table">
            <thead>
              <tr>
                <th>Boss</th>
                <th>Type matchup</th>
                <th>Type-matchup percentile</th>
                <th>Sustained mean damage (TDO)</th>
                <th>Mean survival</th>
                <th>Boost</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const meta = bossMetaById.get(row.bossId);
                const bossSpecies = resolveSpecies(row.bossId);
                return (
                  <tr key={row.bossId}>
                    <td style={{ textAlign: "left" }}>
                      {bossSpecies?.imageUrl && <img src={bossSpecies.imageUrl} alt="" className="species-icon" />}{" "}
                      {meta?.raidName ?? row.bossName}
                      <span className="species-picker-hint"> ({row.bossTier ?? meta?.tier ?? "unknown tier"})</span>
                      {meta?.isApproximate && <span className="badge badge-approximate">approximate</span>}
                      <SpeciesBadges isShadow={bossSpecies?.isShadow} />
                    </td>
                    <td>{row.offensiveTypeMatchup.toFixed(3)}x</td>
                    <td>
                      {row.typeMatchupPercentile === undefined
                        ? "n/a"
                        : `top ${Math.max(0, (1 - row.typeMatchupPercentile) * 100).toFixed(0)}%`}
                    </td>
                    <td>{row.sustained.meanTotalDamage.toFixed(0)}</td>
                    <td>
                      {row.sustained.meanSecondsSurvived.toFixed(1)}s (
                      {(row.sustained.fractionSurvivedFullWindow * 100).toFixed(0)}% survived full window)
                    </td>
                    <td>
                      {result.data!.hasMegaBoost ? (
                        <span
                          className="badge badge-persists"
                          title={`Informational only — grants a team-wide ${result.data!.boostMultiplier}x ${result.data!.boostedType} boost to other trainers in the raid, never this species' own bench. Not folded into any number in this table.`}
                        >
                          {result.data!.boostMultiplier}x {result.data!.boostedType}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <button type="button" onClick={() => handleCompare(row)}>
                        Compare vs. another attacker
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          There's no "opening burst vs sustained" mode to pick here either — every per-boss run is one continuous
          simulation. This view models the selected species alone: it has no second party, so a mega/primal boost
          (if this species has one) is shown only as a plain informational badge above and in the table, never folded
          into a fabricated team-damage number the way the two-candidate comparator's "other trainers" party fields
          do — that requires a second party to attribute credit to, which doesn't exist here (see the design doc's
          section 2). Scoped to the ~10-12 currently-active real raid bosses only, per the live community raid feed —
          not every species that has ever been a boss historically, since no queryable list of that exists yet in
          this project's data layer. Raid targets marked "approximate" use a documented stand-in species' stats
          because no better data exists yet — treat those rows as directional, not exact. Click "Compare vs. another
          attacker" on any row to hand this species, its selected moveset, and that boss off to the two-candidate
          comparator, leaving the second candidate for you to pick there.
        </p>
      </section>
    </>
  );
}
