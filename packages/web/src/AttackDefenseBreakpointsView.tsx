import { useMemo, useState } from "react";
import {
  WEATHER_BOOSTED_TYPES,
  type SpeciesDefinition,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import { BreakpointSheet } from "./BreakpointSheet.js";
import { MoveSelect } from "./MoveSelect.js";
import { SpeciesBadges } from "./SpeciesBadges.js";
import { SpeciesPicker } from "./SpeciesPicker.js";
import { effectiveIsShadow, shadowToggleUiState } from "./shadowToggle.js";
import { IVS_0_TO_15, LEVELS_25_TO_50 } from "./attackDefenseBreakpointsHelpers.js";
import {
  buildAttackDefenseBreakpointsScenarioUrl,
  parseAttackDefenseBreakpointsScenarioFromUrl,
  type AttackDefenseBreakpointsMode,
  type AttackDefenseBreakpointsScenario,
} from "./attackDefenseBreakpointsScenario.js";
import { getBaseUrl } from "./urlUtils.js";
import { candidatePickerOptions, speciesRegistry, targetPickerOptions, unmatchedActiveRaids } from "./registry.js";
import { runAttackDefenseBreakpointsScenario } from "./run/runAttackDefenseBreakpoints.js";

// Same weather-option construction as AssumptionPanel.tsx/TeamAssumptionPanel.tsx/
// SpeciesReportView.tsx/IvBreakpointsAssumptionPanel.tsx — duplicated rather
// than imported, matching the precedent those four already set.
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

// Same real, currently-active matchup the IV Breakpoints tab defaults to
// (Delphox vs Mega Steelix, confirmed still live in data/normalized/activeRaids.json
// as of this session — see that tab's own memory note on raid-roster rotation)
// so this tab also demonstrates real numbers on first load, not an empty form.
const DEFAULT_SPECIES_ID = "delphox";
const DEFAULT_TARGET_ID = "steelix-mega";

export interface AttackDefenseBreakpointsAssumptions {
  speciesId: string;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  targetId: string;
  bossFastMoveId: string | null;
  bossChargedMoveId: string | null;
  weather: WeatherCondition;
  mode: AttackDefenseBreakpointsMode;
  /** See AttackDefenseBreakpointsScenario.isShadow. */
  isShadow: boolean;
}

export const DEFAULT_ASSUMPTIONS: AttackDefenseBreakpointsAssumptions = {
  speciesId: DEFAULT_SPECIES_ID,
  fastMoveId: null,
  chargedMoveId: null,
  targetId: DEFAULT_TARGET_ID,
  bossFastMoveId: null,
  bossChargedMoveId: null,
  weather: "none",
  mode: "attack",
  isShadow: false,
};

export function assumptionsToScenario(a: AttackDefenseBreakpointsAssumptions): AttackDefenseBreakpointsScenario {
  return {
    speciesId: a.speciesId,
    fastMoveId: a.fastMoveId,
    chargedMoveId: a.chargedMoveId,
    targetId: a.targetId,
    bossFastMoveId: a.bossFastMoveId,
    bossChargedMoveId: a.bossChargedMoveId,
    weather: a.weather,
    mode: a.mode,
    isShadow: a.isShadow,
  };
}

export function scenarioToAssumptions(s: AttackDefenseBreakpointsScenario): AttackDefenseBreakpointsAssumptions {
  return {
    speciesId: s.speciesId,
    fastMoveId: s.fastMoveId ?? null,
    chargedMoveId: s.chargedMoveId ?? null,
    targetId: s.targetId,
    bossFastMoveId: s.bossFastMoveId ?? null,
    // `??` guards a scenario URL encoded before this field existed rather
    // than surfacing `undefined` into a controlled input — same discipline
    // every other tab's scenarioToAssumptions already follows.
    bossChargedMoveId: s.bossChargedMoveId ?? DEFAULT_ASSUMPTIONS.bossChargedMoveId,
    weather: s.weather ?? DEFAULT_ASSUMPTIONS.weather,
    mode: s.mode ?? DEFAULT_ASSUMPTIONS.mode,
    isShadow: s.isShadow ?? DEFAULT_ASSUMPTIONS.isShadow,
  };
}

/** Forces isShadow back to false whenever the currently-selected species carries a mega/primal boost — same discipline as the other three tabs' normalizeAssumptions/normalizeTeamAssumptions. */
export function normalizeAssumptions(a: AttackDefenseBreakpointsAssumptions): AttackDefenseBreakpointsAssumptions {
  const sp = resolveSpecies(a.speciesId);
  if (!sp?.boost || !a.isShadow) return a;
  return { ...a, isShadow: false };
}

function initialAssumptions(): AttackDefenseBreakpointsAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parseAttackDefenseBreakpointsScenarioFromUrl(window.location.href);
  return fromUrl ? normalizeAssumptions(scenarioToAssumptions(fromUrl)) : DEFAULT_ASSUMPTIONS;
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

/**
 * "Attack/Defense Breakpoints" — a full spreadsheet (every IV x every level,
 * not a filtered "only where it changes" list) of ONE species' per-hit
 * damage, in one of two modes:
 *
 * - Attack Breakpoints: this species' own fast/charged move damage output
 *   against the chosen target's effective Defense, swept over this species'
 *   own Attack IV (0-15) and level (25-50, see LEVELS_25_TO_50).
 * - Defense Breakpoints: the target's own fast/charged move damage RECEIVED
 *   by this species, swept over this species' own Defense IV (0-15 — NOT
 *   Stamina IV, which affects survival time, not per-hit damage taken, and
 *   this tab models neither survival nor time) and level.
 *
 * Thin UI over packages/engine/src/breakpoints.ts's attackDamageGrid/
 * defenseDamageGrid (already built and tested) — this view supplies the
 * damage-modifier objects (STAB/type-effectiveness/weather) those functions
 * need, using the exact same exported primitives (typeEffectiveness/
 * isWeatherBoosted/bossEffectiveStats/resolveMove) IvBreakpointsView.tsx and
 * comparison.ts's runSustainedComparison already use internally, rather than
 * re-deriving type effectiveness by hand.
 *
 * No dodge control and no mega/primal own-boost multiplier — see this view's
 * own "Known caveats" section below and AttackDefenseBreakpointsScenario's
 * doc comment for why both are deliberately out of scope here, matching the
 * IV Breakpoints tab's identical stance on the boost multiplier.
 */
export function AttackDefenseBreakpointsView() {
  const [assumptions, setAssumptionsRaw] = useState<AttackDefenseBreakpointsAssumptions>(initialAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function setAssumptions(next: AttackDefenseBreakpointsAssumptions) {
    setAssumptionsRaw(normalizeAssumptions(next));
  }

  const speciesOptions = useMemo(() => candidatePickerOptions(), []);
  const targetOptions = useMemo(() => targetPickerOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);

  // The entire engine-facing computation (species resolution, Shadow-adjusted
  // base stats, and the attack/defense damage grids themselves) lives in
  // runAttackDefenseBreakpointsScenario (run/runAttackDefenseBreakpoints.ts)
  // — a pure, React-free function shared with the run-scenario CLI and this
  // tab's own vitest smoke test. Aliased back to their original names so the
  // render code below needs no changes at all.
  const runResult = useMemo(() => runAttackDefenseBreakpointsScenario(assumptions, speciesRegistry), [assumptions]);
  const species = runResult.species;
  const boss = runResult.boss;
  const result = { attack: runResult.attack, defense: runResult.defense, error: runResult.error };

  function handleShare() {
    const url = new URL(buildAttackDefenseBreakpointsScenarioUrl(getBaseUrl(), assumptionsToScenario(assumptions)));
    url.searchParams.set("view", "attack-defense-breakpoints");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  return (
    <>
      <p className="subtitle">
        {species ? (
          <>
            <SpeciesIcon s={species} /> {speciesLabel(species)}
            <SpeciesBadges isHypothetical={species.isHypothetical} isShadow={effectiveIsShadow(species, assumptions.isShadow)} />
          </>
        ) : (
          "Pick a Pokémon"
        )}{" "}
        vs{" "}
        {boss ? (
          <>
            <SpeciesIcon s={boss} /> {speciesLabel(boss)}
          </>
        ) : (
          "a target"
        )}{" "}
        — the full damage-output (or damage-received) spreadsheet across every IV x level combination.
      </p>

      <section className="panel">
        <h2>Assumptions</h2>

        <div className="tab-switcher" role="group" aria-label="Breakpoints mode" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={`tab-button${assumptions.mode === "attack" ? " active" : ""}`}
            onClick={() => setAssumptions({ ...assumptions, mode: "attack" })}
          >
            Attack Breakpoints
          </button>
          <button
            type="button"
            className={`tab-button${assumptions.mode === "defense" ? " active" : ""}`}
            onClick={() => setAssumptions({ ...assumptions, mode: "defense" })}
          >
            Defense Breakpoints
          </button>
        </div>

        <div className="assumption-grid">
          <div>
            <SpeciesPicker
              idPrefix="adb-species"
              label="Pokémon"
              options={speciesOptions}
              value={assumptions.speciesId}
              onChange={(id) =>
                // A previously-picked move id almost certainly doesn't exist
                // on the new species — reset back to "use first move" in the
                // same update, same convention as every other tab.
                setAssumptions({ ...assumptions, speciesId: id, fastMoveId: null, chargedMoveId: null })
              }
            />
            {species &&
              (() => {
                const shadowState = shadowToggleUiState(species);
                return (
                  <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={shadowState.forcedOn || assumptions.isShadow}
                      disabled={shadowState.disabled}
                      onChange={(e) => setAssumptions({ ...assumptions, isShadow: e.target.checked })}
                      title={shadowState.title}
                    />{" "}
                    Shadow (applies to both Attack and Defense modes)
                  </label>
                );
              })()}
            {species && assumptions.mode === "attack" && (
              <>
                <MoveSelect
                  idPrefix="adb-fast"
                  label="Fast move"
                  moves={species.fastMoves}
                  kind="fast"
                  value={assumptions.fastMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, fastMoveId: id })}
                />
                <MoveSelect
                  idPrefix="adb-charged"
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
            <SpeciesPicker
              idPrefix="adb-target"
              label="Raid boss / target"
              options={targetOptions}
              value={assumptions.targetId}
              onChange={(id) =>
                setAssumptions({ ...assumptions, targetId: id, bossFastMoveId: null, bossChargedMoveId: null })
              }
            />
            {boss && assumptions.mode === "defense" && (
              <>
                <MoveSelect
                  idPrefix="adb-boss-fast"
                  label="Target's fast move"
                  moves={boss.fastMoves}
                  kind="fast"
                  value={assumptions.bossFastMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, bossFastMoveId: id })}
                />
                <MoveSelect
                  idPrefix="adb-boss-charged"
                  label="Target's charged move"
                  moves={boss.chargedMoves}
                  kind="charged"
                  value={assumptions.bossChargedMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, bossChargedMoveId: id })}
                />
              </>
            )}
          </div>

          <div className="field">
            <label htmlFor="adb-weather">Weather</label>
            <select
              id="adb-weather"
              value={assumptions.weather}
              onChange={(e) => setAssumptions({ ...assumptions, weather: e.target.value as WeatherCondition })}
              title="Boosts damage 1.2x for moves whose type matches the active weather — applies independently to whichever side's move is being evaluated in the current mode, checked per move's own type."
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

      {result.error && (
        <section className="panel">
          <p style={{ color: "#ff6b6b" }}>Could not compute this sheet: {result.error}</p>
        </section>
      )}

      {result.attack && species && boss && (
        <section className="panel">
          <h2>
            {speciesLabel(species)}'s own damage output vs {speciesLabel(boss)}'s effective Defense
          </h2>
          <div className="breakpoint-sheet-row">
            <BreakpointSheet
              title="Fast move"
              cells={result.attack.fast}
              ivRange={IVS_0_TO_15}
              levelsAscending={LEVELS_25_TO_50}
              ivLabel="Attack IV"
            />
            <BreakpointSheet
              title="Charged move"
              cells={result.attack.charged}
              ivRange={IVS_0_TO_15}
              levelsAscending={LEVELS_25_TO_50}
              ivLabel="Attack IV"
            />
          </div>
        </section>
      )}

      {result.defense && species && boss && (
        <section className="panel">
          <h2>
            Damage {speciesLabel(species)} takes from {speciesLabel(boss)}'s effective Attack
          </h2>
          <div className="breakpoint-sheet-row">
            <BreakpointSheet
              title="Fast move"
              cells={result.defense.fast}
              ivRange={IVS_0_TO_15}
              levelsAscending={LEVELS_25_TO_50}
              ivLabel="Defense IV"
            />
            <BreakpointSheet
              title="Charged move"
              cells={result.defense.charged}
              ivRange={IVS_0_TO_15}
              levelsAscending={LEVELS_25_TO_50}
              ivLabel="Defense IV"
            />
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
          Every sheet here is a single isolated hit's damage at one IV/level combination — there is no fight, no
          combat phase, and no charged-move energy gating modeled at all, unlike the Comparator/Team Raid/Species
          Report tabs' full stepwise simulator. That is also why there is no dodge control on this tab: dodge only
          means something as "a fraction of hits over time land at reduced damage," and there is no "over time" here
          for it to apply to — each cell already IS one hit, full stop. If you need survival time or dodge modeling,
          use the IV Breakpoints tab (time-to-faint) or the Comparator tab (full simulation) instead.
        </p>
        <p className="caveats">
          This view does not model a mega/primal species' own-damage boost multiplier at all — pick a non-mega,
          non-primal species for an exact match, or use the Comparator/Species Report tabs for a mega-form species'
          own boosted output. This is the same caveat the IV Breakpoints tab documents for the same reason.
        </p>
        <p className="caveats">
          Level columns run 50 down to 25 in the usual 0.5 steps (51 columns total) — the practically relevant
          power-up range, not the full 1-50 range this engine can compute. Defense Breakpoints rows are Defense IV
          only (0-15), deliberately excluding Stamina IV: Stamina affects how long a Pokémon survives, not how much
          damage a single hit deals, and this tab has no survival-time model to apply it to. A highlighted cell
          (colored background) marks a "breakpoint" — where the shown damage changes from the previous (0.5-lower)
          scanned level in that same IV row, usually from a stat crossing into a new floored-effective-stat bracket.
          Raid targets marked "approximate" use a documented stand-in species' stats because no better data exists
          yet — treat those results as directional, not exact.
        </p>
      </section>
    </>
  );
}
