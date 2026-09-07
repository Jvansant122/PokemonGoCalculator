import { WEATHER_BOOSTED_TYPES, type DodgeBehavior, type SpeciesDefinition, type WeatherCondition } from "@pogo-analyzer/engine";
import { SpeciesPicker, type SpeciesPickerOption } from "./SpeciesPicker.js";
import { MoveSelect } from "./MoveSelect.js";
import { shadowToggleUiState } from "./shadowToggle.js";

/**
 * Human-readable labels for the select below, built from weather.ts's own
 * WEATHER_BOOSTED_TYPES map (now re-exported from @pogo-analyzer/engine's
 * index) rather than a second hand-typed copy — the engine's mapping is the
 * one source of truth for which types each condition boosts.
 */
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

export interface Assumptions {
  candidateAId: string;
  candidateBId: string;
  targetId: string;
  /** null = use that candidate's/the boss's first fast/charged move (today's implicit default) — see the add-scenario-assumption skill for why these mirror Scenario's fields exactly. */
  candidateAFastMoveId: string | null;
  candidateAChargedMoveId: string | null;
  candidateBFastMoveId: string | null;
  candidateBChargedMoveId: string | null;
  bossFastMoveId: string | null;
  bossChargedMoveId: string | null;
  /**
   * Per-candidate "pretend this species has no mega/primal boost mechanic at
   * all", matched by index to [candidateAId, candidateBId] — lets a user
   * compare a mega candidate's DPS fairly against a non-mega one. See
   * Scenario.candidateMegaBoostDisabled: true disables BOTH that candidate's
   * own-damage boost AND its team-damage attribution entirely, not a partial
   * disable. No-op for a candidate that has no `boost` at all already.
   */
  candidateMegaBoostDisabled: [boolean, boolean];
  /**
   * Per-candidate "treat this species as Shadow", matched by index to
   * [candidateAId, candidateBId] — applies shadow.ts's
   * SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER to that candidate's
   * raw base stats. Mutually exclusive with a mega/primal boost (a Shadow
   * Pokémon can't Mega Evolve without being Purified first — shadow.ts's
   * shadowAdjustedBaseStats throws if both are set), so this is forced back
   * to false whenever that candidate's species carries a `boost` — see
   * ComparatorView's normalizeAssumptions. No-op for a species that's
   * ALREADY isShadow from the registry (a synthesized "Shadow X" raid-target
   * variant) — see shadowToggle.ts's applyShadowToggle.
   */
  candidateShadow: [boolean, boolean];
  level: number;
  ivAttack: number;
  ivDefense: number;
  ivStamina: number;
  /** Governs dodging the boss's CHARGED attacks only. */
  dodge: DodgeBehavior;
  /** Whether the candidate also attempts to dodge the boss's fast attacks — a separate yes/no from dodge, since dodging every fast attack costs 0.5s per attempt and usually isn't worth it. */
  dodgeFastAttacks: boolean;
  /** Hold the charged move for a safer moment (right after dodging a boss charged hit, or when energy caps) instead of firing immediately. */
  holdChargedMoveUntilSafe: boolean;
  /** Extends the damage-over-time chart's window beyond the auto-computed natural minimum (never below it) — 0 means no override. */
  minFightLengthSeconds: number;
  bossChargedMoveFrequencySeconds: number;
  partySize: number;
  teammateDps: number;
  /** How many of partySize match the lead candidate's boosted type — see convertUptimeToTeamDamage. The rest still get a smaller, non-zero boost, never none. */
  matchingTeammateCount: number;
  /** Whether the boss starts the fight already partway charged (see bossStartingEnergyFraction). */
  bossStartsPrimed: boolean;
  /** Fraction (0-1) of the boss's first charged move's energy cost it starts with, when bossStartsPrimed is true. */
  bossStartingEnergyFraction: number;
  /**
   * Active weather condition — boosts whichever move type it favors (see
   * WEATHER_OPTIONS above / weather.ts's WEATHER_BOOSTED_TYPES) by 1.2x, for
   * BOTH the candidate's and the boss's own moves independently, checked
   * against each move's own type. "none" (the default) models no weather, the
   * pre-existing implicit behavior.
   */
  weather: WeatherCondition;
}

interface Props {
  value: Assumptions;
  onChange: (next: Assumptions) => void;
  candidateOptions: SpeciesPickerOption[];
  targetOptions: SpeciesPickerOption[];
  unmatchedRaids: { raidName: string; tier: string }[];
  /** Resolved species for the two candidates/boss, so this panel can read their movepools for the MoveSelect controls below — null while a selection doesn't resolve (e.g. a stale scenario id). */
  candidateSpecies: [SpeciesDefinition | null, SpeciesDefinition | null];
  bossSpecies: SpeciesDefinition | null;
  /**
   * Physically-derived "boss ready for its first charged move" time for the
   * currently-selected target (see bossChargedMoveReadySeconds), or null if
   * the target has no resolvable charged move. Computed in App.tsx, where the
   * resolved boss SpeciesDefinition lives — this panel only displays it.
   */
  bossReadySeconds: number | null;
  /** 100 - the selected candidates' charged-move energy cost (MAX_ENERGY - energyCost), for the "energy buffer" display next to holdChargedMoveUntilSafe. Computed in App.tsx from the resolved candidates. */
  energyBuffers: { name: string; buffer: number }[];
  /** Auto-computed natural minimum for the chart window (before any minFightLengthSeconds override) — shown so the user knows what they're extending past. */
  naturalFightLengthSeconds: number | null;
}

/**
 * Whether a candidate currently has a mega/primal boost mechanic that's
 * actually live — a genuinely non-mega species (no `.boost` at all) or one
 * with its per-candidate "disable mega/primal boost" checkbox ticked both
 * count as no boost. Mirrors App.tsx's own `resolveBoost(species, disabled)`
 * exactly (species.boost if not disabled, else undefined) — not imported
 * directly to avoid a circular import (App.tsx already imports `Assumptions`
 * from this file), so kept as a small local equivalent instead of a second,
 * divergent reimplementation of any real math (this is trivial field access,
 * same as the original).
 */
function hasActiveBoost(species: SpeciesDefinition | null, disabled: boolean): boolean {
  return !!species?.boost && !disabled;
}

/**
 * Always-visible assumption panel (Phase 4, point 9). Every conclusion this
 * tool produces is conditional on these — nothing is rendered as a single
 * ranked number without this panel attached above it.
 *
 * There is no "combat phase" selector here on purpose: the fight is one
 * continuous simulation, and whether the boss has thrown a charged move yet
 * is a computed fact (see "Boss ready for its first charged move" below),
 * not a mode the user picks.
 */
export function AssumptionPanel({
  value,
  onChange,
  candidateOptions,
  targetOptions,
  unmatchedRaids,
  candidateSpecies,
  bossSpecies,
  bossReadySeconds,
  energyBuffers,
  naturalFightLengthSeconds,
}: Props) {
  function set<K extends keyof Assumptions>(key: K, next: Assumptions[K]) {
    onChange({ ...value, [key]: next });
  }

  const selectedBossChargedMove = bossSpecies
    ? (bossSpecies.chargedMoves.find((m) => m.id === value.bossChargedMoveId) ?? bossSpecies.chargedMoves[0])
    : undefined;
  const bossChargedMoveIsUndodgeable = selectedBossChargedMove?.perfectlyDodgeable === false;

  // The "other trainers" party inputs below only affect anything when at
  // least one candidate has a live mega/primal boost to attribute team damage
  // from — a pure no-op group otherwise (both non-mega, or both disabled),
  // so it's hidden entirely rather than shown next to an inert "N/A" result.
  // Recomputed on every render, so toggling a species or a disable-checkbox
  // shows/hides this live, not just once on mount.
  const anyBoostActive =
    hasActiveBoost(candidateSpecies[0], value.candidateMegaBoostDisabled[0]) ||
    hasActiveBoost(candidateSpecies[1], value.candidateMegaBoostDisabled[1]);

  return (
    <section className="panel">
      <h2>Assumptions</h2>
      <div className="assumption-grid">
        <div>
          <SpeciesPicker
            idPrefix="candidate-a"
            label="Candidate A"
            options={candidateOptions}
            value={value.candidateAId}
            onChange={(id) =>
              // A previously-picked move id almost certainly doesn't exist on
              // the new species, so reset both back to "use first move" in
              // the same update rather than leaving a stale/invalid id.
              onChange({ ...value, candidateAId: id, candidateAFastMoveId: null, candidateAChargedMoveId: null })
            }
          />
          {candidateSpecies[0] && (
            <>
              <MoveSelect
                idPrefix="candidate-a-fast"
                label="Candidate A fast move"
                moves={candidateSpecies[0].fastMoves}
                kind="fast"
                value={value.candidateAFastMoveId}
                onChange={(id) => set("candidateAFastMoveId", id)}
              />
              <MoveSelect
                idPrefix="candidate-a-charged"
                label="Candidate A charged move"
                moves={candidateSpecies[0].chargedMoves}
                kind="charged"
                value={value.candidateAChargedMoveId}
                onChange={(id) => set("candidateAChargedMoveId", id)}
              />
              {candidateSpecies[0].boost && (
                <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={value.candidateMegaBoostDisabled[0]}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        candidateMegaBoostDisabled: [e.target.checked, value.candidateMegaBoostDisabled[1]],
                      })
                    }
                    title="Treats this candidate as if it had no mega/primal boost mechanic at all — both its own move damage boost AND its team-damage attribution — so it can be compared fairly against a non-mega species."
                  />{" "}
                  Disable mega/primal boost (fair DPS comparison vs. non-mega)
                </label>
              )}
              {(() => {
                const shadowState = shadowToggleUiState(candidateSpecies[0]);
                return (
                  <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={shadowState.forcedOn || value.candidateShadow[0]}
                      disabled={shadowState.disabled}
                      onChange={(e) =>
                        onChange({ ...value, candidateShadow: [e.target.checked, value.candidateShadow[1]] })
                      }
                      title={shadowState.title}
                    />{" "}
                    Shadow
                  </label>
                );
              })()}
            </>
          )}
        </div>
        <div>
          <SpeciesPicker
            idPrefix="candidate-b"
            label="Candidate B"
            options={candidateOptions}
            value={value.candidateBId}
            onChange={(id) =>
              onChange({ ...value, candidateBId: id, candidateBFastMoveId: null, candidateBChargedMoveId: null })
            }
          />
          {candidateSpecies[1] && (
            <>
              <MoveSelect
                idPrefix="candidate-b-fast"
                label="Candidate B fast move"
                moves={candidateSpecies[1].fastMoves}
                kind="fast"
                value={value.candidateBFastMoveId}
                onChange={(id) => set("candidateBFastMoveId", id)}
              />
              <MoveSelect
                idPrefix="candidate-b-charged"
                label="Candidate B charged move"
                moves={candidateSpecies[1].chargedMoves}
                kind="charged"
                value={value.candidateBChargedMoveId}
                onChange={(id) => set("candidateBChargedMoveId", id)}
              />
              {candidateSpecies[1].boost && (
                <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={value.candidateMegaBoostDisabled[1]}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        candidateMegaBoostDisabled: [value.candidateMegaBoostDisabled[0], e.target.checked],
                      })
                    }
                    title="Treats this candidate as if it had no mega/primal boost mechanic at all — both its own move damage boost AND its team-damage attribution — so it can be compared fairly against a non-mega species."
                  />{" "}
                  Disable mega/primal boost (fair DPS comparison vs. non-mega)
                </label>
              )}
              {(() => {
                const shadowState = shadowToggleUiState(candidateSpecies[1]);
                return (
                  <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={shadowState.forcedOn || value.candidateShadow[1]}
                      disabled={shadowState.disabled}
                      onChange={(e) =>
                        onChange({ ...value, candidateShadow: [value.candidateShadow[0], e.target.checked] })
                      }
                      title={shadowState.title}
                    />{" "}
                    Shadow
                  </label>
                );
              })()}
            </>
          )}
        </div>
        <div>
          <SpeciesPicker
            idPrefix="target"
            label="Raid target"
            options={targetOptions}
            value={value.targetId}
            onChange={(id) => onChange({ ...value, targetId: id, bossFastMoveId: null, bossChargedMoveId: null })}
          />
          {unmatchedRaids.length > 0 && (
            <p className="species-picker-hint" title="These raids are currently active but have no usable stat data yet.">
              Other raids currently live in-game that this tool can't model yet (no stat data available):{" "}
              {unmatchedRaids.map((r) => `${r.raidName} (${r.tier})`).join(", ")}
            </p>
          )}
          {bossSpecies && (
            <>
              <MoveSelect
                idPrefix="boss-fast"
                label="Boss fast move"
                moves={bossSpecies.fastMoves}
                kind="fast"
                value={value.bossFastMoveId}
                onChange={(id) => set("bossFastMoveId", id)}
              />
              <MoveSelect
                idPrefix="boss-charged"
                label="Boss charged move"
                moves={bossSpecies.chargedMoves}
                kind="charged"
                value={value.bossChargedMoveId}
                onChange={(id) => set("bossChargedMoveId", id)}
              />
            </>
          )}
        </div>

        <div>
          <div className="field">
            <label htmlFor="level">Level (both candidates)</label>
            <input
              id="level"
              type="number"
              min={1}
              max={40}
              step={0.5}
              value={value.level}
              onChange={(e) => set("level", Number(e.target.value))}
            />
          </div>

          <div className="iv-row">
            <div className="field">
              <label htmlFor="ivAttack">Attack IV</label>
              <input
                id="ivAttack"
                className="iv-input"
                type="number"
                min={0}
                max={15}
                value={value.ivAttack}
                onChange={(e) => set("ivAttack", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="ivDefense">Defense IV</label>
              <input
                id="ivDefense"
                className="iv-input"
                type="number"
                min={0}
                max={15}
                value={value.ivDefense}
                onChange={(e) => set("ivDefense", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="ivStamina">Stamina IV</label>
              <input
                id="ivStamina"
                className="iv-input"
                type="number"
                min={0}
                max={15}
                value={value.ivStamina}
                onChange={(e) => set("ivStamina", Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="dodge">Dodge boss's charged attacks</label>
          <select
            id="dodge"
            value={value.dodge.kind}
            onChange={(e) => {
              const kind = e.target.value as DodgeBehavior["kind"];
              set(
                "dodge",
                kind === "percentage-missed" ? { kind, missedFraction: 0.5 } : ({ kind } as DodgeBehavior),
              );
            }}
          >
            <option value="none">None</option>
            <option value="perfect">Perfect</option>
            <option value="percentage-missed">Percentage missed</option>
          </select>
        </div>

        {value.dodge.kind === "percentage-missed" && (
          <div className="field">
            <label htmlFor="missedFraction">Fraction of charged hits NOT dodged</label>
            <input
              id="missedFraction"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={value.dodge.missedFraction}
              onChange={(e) => set("dodge", { kind: "percentage-missed", missedFraction: Number(e.target.value) })}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="dodgeFastAttacks">Also dodge boss's fast attacks?</label>
          <select
            id="dodgeFastAttacks"
            value={value.dodgeFastAttacks ? "yes" : "no"}
            onChange={(e) => set("dodgeFastAttacks", e.target.value === "yes")}
            title="Dodging every fast attack costs 0.5s of your own attack cycle each time (see DODGE_COST_SECONDS) — usually not worth it, but can matter for a glass cannon. A separate yes/no from charged-attack dodging above, since these are different real decisions."
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>

        <div className="field">
          <label>Boss ready for its first charged move</label>
          <p className="computed-value" title="A boss cannot use a charged move before its own fast move has generated enough energy for it — this is computed from the selected target's move data, not a free assumption.">
            {bossReadySeconds === null
              ? "unknown (target has no charged move data)"
              : value.bossStartsPrimed && bossReadySeconds === 0
                ? "0s — already primed, see below"
                : `~${bossReadySeconds.toFixed(1)}s`}
          </p>
        </div>

        <div className="field">
          <label htmlFor="bossStartsPrimed">Boss starts already partway charged?</label>
          <select
            id="bossStartsPrimed"
            value={value.bossStartsPrimed ? "yes" : "no"}
            onChange={(e) => set("bossStartsPrimed", e.target.value === "yes")}
            title="Models a mega tagging in mid-fight against a boss an earlier trainer's mega already left partway (or fully) charged, instead of a fight that always starts at 0 boss energy."
          >
            <option value="no">No — fight starts at 0 boss energy</option>
            <option value="yes">Yes — boss already has some energy saved</option>
          </select>
        </div>

        {value.bossStartsPrimed && (
          <div className="field">
            <label htmlFor="bossStartingEnergyFraction">Boss starting energy (% of its charged-move cost)</label>
            <input
              id="bossStartingEnergyFraction"
              type="number"
              min={0}
              max={100}
              step={5}
              value={Math.round(value.bossStartingEnergyFraction * 100)}
              onChange={(e) => set("bossStartingEnergyFraction", Math.min(1, Math.max(0, Number(e.target.value) / 100)))}
              title="100% means the boss can fire immediately."
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="weather">Weather</label>
          <select
            id="weather"
            value={value.weather}
            onChange={(e) => set("weather", e.target.value as WeatherCondition)}
            title="Boosts damage 1.2x for moves whose type matches the active weather — applies independently to the candidate's and the boss's own moves, checked per move's own type."
          >
            {WEATHER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="bossFreq">Boss charged-move mean frequency (s)</label>
          <input
            id="bossFreq"
            type="number"
            min={1}
            value={value.bossChargedMoveFrequencySeconds}
            onChange={(e) => set("bossChargedMoveFrequencySeconds", Number(e.target.value))}
            title="Mean seconds between the boss's charged moves once it's ready to use them (randomized +/-40% per run)."
          />
        </div>

        <div className="field">
          <label htmlFor="holdChargedMove">Hold charged move for a safer moment?</label>
          <select
            id="holdChargedMove"
            value={value.holdChargedMoveUntilSafe ? "yes" : "no"}
            onChange={(e) => set("holdChargedMoveUntilSafe", e.target.value === "yes")}
            title="Instead of firing the instant energy allows, wait until right after successfully dodging one of the boss's charged attacks (or until energy caps at 100, whichever comes first). Trades some DPS for avoiding your undodgeable cast window overlapping the boss's next hit."
          >
            <option value="no">No — fire as soon as ready</option>
            <option value="yes">Yes — wait for a safe window</option>
          </select>
          {value.holdChargedMoveUntilSafe && (
            <p className="species-picker-hint">
              {value.dodge.kind !== "perfect"
                ? `This is meant to be used with "Dodge boss's charged attacks" set to Perfect — with dodging set to "${value.dodge.kind}", the safe-window trigger will rarely or never fire, so this degrades to just waiting for the energy cap.`
                : bossChargedMoveIsUndodgeable
                  ? "The boss's selected charged move is flagged as not reliably perfectly-dodgeable, so the safe-window trigger won't fire against it — this degrades to just waiting for the energy cap."
                  : "Safe-window trigger active: will fire right after a dodged boss charged hit, or when energy caps, whichever comes first."}
              {energyBuffers.length > 0 && (
                <>
                  {" "}Energy buffer (100 minus the move's cost — how much can be banked before more is wasted):{" "}
                  {energyBuffers.map((b) => `${b.name} ${b.buffer}`).join(", ")}
                </>
              )}
            </p>
          )}
        </div>

        {anyBoostActive && (
          <>
            <div className="field">
              <label htmlFor="partySize">Other trainers also in this raid (not this candidate)</label>
              <input
                id="partySize"
                type="number"
                min={0}
                max={20}
                value={value.partySize}
                onChange={(e) => {
                  const partySize = Number(e.target.value);
                  onChange({ ...value, partySize, matchingTeammateCount: Math.min(value.matchingTeammateCount, partySize) });
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="teammateDps">Other trainers' DPS (each)</label>
              <input
                id="teammateDps"
                type="number"
                min={0}
                step={0.1}
                value={value.teammateDps}
                onChange={(e) => set("teammateDps", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="matchingTeammateCount">Other trainers matching boost type (of {value.partySize})</label>
              <input
                id="matchingTeammateCount"
                type="range"
                min={0}
                max={value.partySize}
                step={1}
                value={value.matchingTeammateCount}
                onChange={(e) => set("matchingTeammateCount", Number(e.target.value))}
                title="How many of the other trainers simultaneously in this raid (each with their own single active Pokémon — the mega/primal boost only reaches other trainers' Pokémon, never this candidate's own bench) have their highest-DPS Pokémon share the lead candidate's boosted type and so get the full mega-boost multiplier — the rest still get a smaller, non-zero boost (real raid lobbies are rarely all-or-nothing on type)."
              />
              <span className="species-picker-hint">
                {value.matchingTeammateCount} matching / {value.partySize - value.matchingTeammateCount} off-type
              </span>
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="minFightLength">Extend simulated window to at least (s)</label>
          <input
            id="minFightLength"
            type="number"
            min={0}
            step={1}
            value={value.minFightLengthSeconds}
            onChange={(e) => set("minFightLengthSeconds", Math.max(0, Number(e.target.value)))}
            title="The chart's window is auto-computed from how long each candidate actually survives — this can only stretch it further out (e.g. to see a longer horizon), never shrink it below that real outcome."
          />
          {naturalFightLengthSeconds !== null && (
            <span className="species-picker-hint">Natural minimum for this scenario: ~{naturalFightLengthSeconds.toFixed(1)}s</span>
          )}
        </div>
      </div>
    </section>
  );
}
