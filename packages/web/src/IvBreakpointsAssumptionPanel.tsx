import {
  WEATHER_BOOSTED_TYPES,
  type DodgeBehavior,
  type SpeciesDefinition,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import { MoveSelect } from "./MoveSelect.js";
import { SpeciesPicker, type SpeciesPickerOption } from "./SpeciesPicker.js";
import type { IvBreakpointsAssumptions } from "./IvBreakpointsView.js";

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

interface Props {
  assumptions: IvBreakpointsAssumptions;
  setAssumptions: (a: IvBreakpointsAssumptions) => void;
  speciesOptions: SpeciesPickerOption[];
  targetOptions: SpeciesPickerOption[];
  unmatchedRaids: { raidName: string; tier: string }[];
  species: SpeciesDefinition | null;
  boss: SpeciesDefinition | null;
}

/**
 * The "Assumptions" panel section of IvBreakpointsView.tsx — species/moveset
 * pickers, both IV spreads, target/boss picker, dodge behavior, and weather.
 * Split out of the view's own render function purely to bring that function's
 * size down (pure refactor, no behavior change); all actual state lives in
 * the parent view, this component only reads/writes it via props.
 */
export function IvBreakpointsAssumptionPanel({
  assumptions,
  setAssumptions,
  speciesOptions,
  targetOptions,
  unmatchedRaids,
  species,
  boss,
}: Props) {
  return (
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
  );
}
