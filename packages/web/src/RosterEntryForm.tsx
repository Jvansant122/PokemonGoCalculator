import type { SpeciesDefinition } from "@pogo-analyzer/engine";
import { MoveSelect } from "./MoveSelect.js";
import { NumberField } from "./NumberField.js";
import { SpeciesBadges } from "./SpeciesBadges.js";
import { SpeciesPicker, type SpeciesPickerOption } from "./SpeciesPicker.js";
import { normalizeRosterEntryDraft, type RosterEntryDraft } from "./rosterEntryDraft.js";
import { shadowToggleUiState } from "./shadowToggle.js";

interface Props {
  idPrefix: string;
  draft: RosterEntryDraft;
  onChange: (next: RosterEntryDraft) => void;
  species: SpeciesDefinition | null;
  speciesOptions: SpeciesPickerOption[];
  /** "Add this Pokémon" vs. "Save changes" — the two contexts this one form serves (RosterView.tsx). */
  mode: "add" | "edit";
  onSubmit: () => void;
  onCancel?: () => void;
}

/**
 * The hand-entry / edit form behind the Roster tab — reuses SpeciesPicker,
 * MoveSelect, and NumberField rather than hand-rolling inputs, per
 * PLAN_roster_tab.md's explicit requirement ("all three carry behaviour a
 * hand-rolled form would silently lose — type-effectiveness chips,
 * select-all-on-focus, blur clamping"). The SAME form drives both adding a
 * brand-new entry and editing an existing one (imported or previously
 * hand-added) — RosterView.tsx swaps which draft/onSubmit it's bound to
 * rather than maintaining two separate forms, so "fill in a blank move on an
 * imported row" and "hand-add a Pokémon from scratch" are structurally the
 * same action.
 */
export function RosterEntryForm({ idPrefix, draft, onChange, species, speciesOptions, mode, onSubmit, onCancel }: Props) {
  function set(next: RosterEntryDraft) {
    onChange(normalizeRosterEntryDraft(next, species));
  }

  const shadowState = shadowToggleUiState(species);
  const canSubmit = draft.speciesId !== null;

  return (
    <div className="team-slot-row">
      <SpeciesPicker
        idPrefix={`${idPrefix}-species`}
        label="Pokémon"
        options={speciesOptions}
        value={draft.speciesId ?? ""}
        onChange={(id) =>
          // A previously-picked move id almost certainly doesn't exist on
          // the new species — reset both back to "use first move" in the
          // same update, same convention as every other tab. The second
          // charged move state resets too, for the same reason.
          set({ ...draft, speciesId: id, fastMoveId: null, chargedMoveId: null, knowsSecondChargedMove: false, secondChargedMoveId: null })
        }
      />
      {species && (
        <>
          <p className="species-picker-hint" style={{ marginTop: 2 }}>
            <SpeciesBadges isHypothetical={species.isHypothetical} isShadow={shadowState.forcedOn || draft.isShadow} />
          </p>
          <MoveSelect
            idPrefix={`${idPrefix}-fast`}
            label="Fast move"
            moves={species.fastMoves}
            kind="fast"
            value={draft.fastMoveId}
            onChange={(id) => set({ ...draft, fastMoveId: id })}
          />
          <MoveSelect
            idPrefix={`${idPrefix}-charged`}
            label="Charged move"
            moves={species.chargedMoves}
            kind="charged"
            value={draft.chargedMoveId}
            onChange={(id) => set({ ...draft, chargedMoveId: id, secondChargedMoveId: id === draft.secondChargedMoveId ? null : draft.secondChargedMoveId })}
          />
          {species.chargedMoves.length >= 2 && (
            <div className="team-slot-flags">
              <label className="species-picker-hint">
                <input
                  type="checkbox"
                  checked={draft.knowsSecondChargedMove}
                  onChange={(e) => set({ ...draft, knowsSecondChargedMove: e.target.checked })}
                  title="Whether this Pokémon has ALSO unlocked a second charged move — leave unchecked if it only knows the one above. Feeds TM-eligibility on the Power-Up Optimizer's multi-raid move-change sweep."
                />{" "}
                Knows a second charged move
              </label>
            </div>
          )}
          {draft.knowsSecondChargedMove && species.chargedMoves.length >= 2 && (
            <MoveSelect
              idPrefix={`${idPrefix}-charged2`}
              label="Second charged move"
              moves={species.chargedMoves.filter((m) => m.id !== (draft.chargedMoveId ?? species.chargedMoves[0]?.id))}
              kind="charged"
              value={draft.secondChargedMoveId}
              onChange={(id) => set({ ...draft, secondChargedMoveId: id })}
            />
          )}
          <div className="field">
            <label htmlFor={`${idPrefix}-level`}>Level</label>
            <NumberField
              id={`${idPrefix}-level`}
              min={1}
              max={51}
              step={0.5}
              value={draft.level}
              onChange={(v) => set({ ...draft, level: v ?? 1 })}
            />
          </div>
          <div className="iv-row">
            <div className="field">
              <label htmlFor={`${idPrefix}-ivAttack`}>Attack IV</label>
              <NumberField id={`${idPrefix}-ivAttack`} className="iv-input" min={0} max={15} value={draft.ivAttack} onChange={(v) => set({ ...draft, ivAttack: v ?? 0 })} />
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}-ivDefense`}>Defense IV</label>
              <NumberField id={`${idPrefix}-ivDefense`} className="iv-input" min={0} max={15} value={draft.ivDefense} onChange={(v) => set({ ...draft, ivDefense: v ?? 0 })} />
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}-ivStamina`}>Stamina IV</label>
              <NumberField id={`${idPrefix}-ivStamina`} className="iv-input" min={0} max={15} value={draft.ivStamina} onChange={(v) => set({ ...draft, ivStamina: v ?? 0 })} />
            </div>
          </div>
          <div className="team-slot-flags">
            <label className="species-picker-hint">
              <input
                type="checkbox"
                checked={shadowState.forcedOn || draft.isShadow}
                disabled={shadowState.disabled}
                onChange={(e) => set({ ...draft, isShadow: e.target.checked })}
                title={draft.isPurified ? "Shadow and Purified are mutually exclusive — uncheck Purified first." : shadowState.title}
              />{" "}
              Shadow
            </label>
            <label className="species-picker-hint">
              <input
                type="checkbox"
                checked={draft.isPurified}
                disabled={shadowState.forcedOn || draft.isShadow}
                onChange={(e) => set({ ...draft, isPurified: e.target.checked })}
                title="Applies the Purified power-up cost discount (0.9x stardust and candy) — does not change combat stats."
              />{" "}
              Purified
            </label>
            <label className="species-picker-hint">
              <input
                type="checkbox"
                checked={draft.isLucky}
                onChange={(e) => set({ ...draft, isLucky: e.target.checked })}
                title="Applies the Lucky power-up cost discount (50% off stardust only — candy is unaffected). Does not change combat stats."
              />{" "}
              Lucky
            </label>
            <label className="species-picker-hint">
              <input
                type="checkbox"
                checked={draft.canMega}
                disabled={!species.boost}
                onChange={(e) => set({ ...draft, canMega: e.target.checked })}
                title={species.boost ? "This entry is eligible to be fielded as the team's one Mega/Primal slot." : "No boost mechanic on this species."}
              />{" "}
              Can Mega/Primal Evolve{!species.boost ? " (no boost mechanic on this species)" : ""}
            </label>
          </div>
        </>
      )}
      <div className="share-row" style={{ marginTop: 10 }}>
        <button type="button" onClick={onSubmit} disabled={!canSubmit}>
          {mode === "add" ? "Add this Pokémon" : "Save changes"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
