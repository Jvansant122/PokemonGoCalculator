import type { DodgeBehavior, SpeciesDefinition } from "@pogo-analyzer/engine";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { NumberField } from "./NumberField.js";
import { MoveSelect, type MoveSelectOpponent } from "./MoveSelect.js";
import { MegaLevelSelect } from "./megaLevelSelect.js";
import { SpeciesPicker, type SpeciesPickerOption } from "./SpeciesPicker.js";
import { WeatherSelect } from "./WeatherSelect.js";
import type { IvBreakpointsAssumptions } from "./IvBreakpointsView.js";
import { shadowToggleUiState } from "./shadowToggle.js";

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
  // Type-effectiveness opponents for the move pickers below (display-only —
  // see MoveSelect.tsx's own `opponents` prop doc comment). Both IV spreads
  // share one species/moveset, so there is exactly one attacker and one
  // target here — never a per-candidate letter/number tag to juggle.
  const bossOpponent: MoveSelectOpponent[] = boss ? [{ label: "Boss", types: boss.types }] : [];
  const attackerOpponent: MoveSelectOpponent[] = species ? [{ label: "Attacker", types: species.types }] : [];

  return (
    <CollapsibleSection id="iv-breakpoints-assumptions" heading="Assumptions" defaultOpen={false}>
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
                opponents={bossOpponent}
              />
              <MoveSelect
                idPrefix="iv-breakpoints-charged"
                label="Charged move"
                moves={species.chargedMoves}
                kind="charged"
                value={assumptions.chargedMoveId}
                onChange={(id) => setAssumptions({ ...assumptions, chargedMoveId: id })}
                opponents={bossOpponent}
              />
              {(() => {
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
                    Shadow (applies to both spreads — same species)
                  </label>
                );
              })()}
              <MegaLevelSelect
                idPrefix="iv-breakpoints"
                label="Mega Level (applies to both spreads — same species)"
                species={species}
                value={assumptions.megaLevel}
                onChange={(level) => setAssumptions({ ...assumptions, megaLevel: level })}
              />
            </>
          )}
        </div>

        <div>
          <p className="field-group-label">Spread A</p>
          <div className="iv-row">
            <div className="field">
              <label htmlFor="iv-breakpoints-a-attack">Attack IV</label>
              <NumberField
                id="iv-breakpoints-a-attack"
                className="iv-input"
                min={0}
                max={15}
                value={assumptions.ivA.attack}
                onChange={(v) => setAssumptions({ ...assumptions, ivA: { ...assumptions.ivA, attack: v ?? 0 } })}
              />
            </div>
            <div className="field">
              <label htmlFor="iv-breakpoints-a-defense">Defense IV</label>
              <NumberField
                id="iv-breakpoints-a-defense"
                className="iv-input"
                min={0}
                max={15}
                value={assumptions.ivA.defense}
                onChange={(v) => setAssumptions({ ...assumptions, ivA: { ...assumptions.ivA, defense: v ?? 0 } })}
              />
            </div>
            <div className="field">
              <label htmlFor="iv-breakpoints-a-stamina">Stamina IV</label>
              <NumberField
                id="iv-breakpoints-a-stamina"
                className="iv-input"
                min={0}
                max={15}
                value={assumptions.ivA.stamina}
                onChange={(v) => setAssumptions({ ...assumptions, ivA: { ...assumptions.ivA, stamina: v ?? 0 } })}
              />
            </div>
          </div>
        </div>

        <div>
          <p className="field-group-label">Spread B</p>
          <div className="iv-row">
            <div className="field">
              <label htmlFor="iv-breakpoints-b-attack">Attack IV</label>
              <NumberField
                id="iv-breakpoints-b-attack"
                className="iv-input"
                min={0}
                max={15}
                value={assumptions.ivB.attack}
                onChange={(v) => setAssumptions({ ...assumptions, ivB: { ...assumptions.ivB, attack: v ?? 0 } })}
              />
            </div>
            <div className="field">
              <label htmlFor="iv-breakpoints-b-defense">Defense IV</label>
              <NumberField
                id="iv-breakpoints-b-defense"
                className="iv-input"
                min={0}
                max={15}
                value={assumptions.ivB.defense}
                onChange={(v) => setAssumptions({ ...assumptions, ivB: { ...assumptions.ivB, defense: v ?? 0 } })}
              />
            </div>
            <div className="field">
              <label htmlFor="iv-breakpoints-b-stamina">Stamina IV</label>
              <NumberField
                id="iv-breakpoints-b-stamina"
                className="iv-input"
                min={0}
                max={15}
                value={assumptions.ivB.stamina}
                onChange={(v) => setAssumptions({ ...assumptions, ivB: { ...assumptions.ivB, stamina: v ?? 0 } })}
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
              opponents={attackerOpponent}
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
            <NumberField
              id="iv-breakpoints-missedFraction"
              min={0}
              max={1}
              step={0.05}
              value={assumptions.dodge.missedFraction}
              onChange={(v) =>
                setAssumptions({ ...assumptions, dodge: { kind: "percentage-missed", missedFraction: v ?? 0 } })
              }
            />
          </div>
        )}

        <WeatherSelect
          idPrefix="iv-breakpoints"
          value={assumptions.weather}
          onChange={(w) => setAssumptions({ ...assumptions, weather: w })}
        />
      </div>

      {unmatchedRaids.length > 0 && (
        <p className="species-picker-hint" title="These raids are currently active but have no usable stat data yet.">
          Other raids currently live in-game that this tool can't target yet (no stat data available):{" "}
          {unmatchedRaids.map((r) => `${r.raidName} (${r.tier})`).join(", ")}
        </p>
      )}
    </CollapsibleSection>
  );
}
