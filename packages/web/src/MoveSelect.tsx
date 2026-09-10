import type { ChargedMove, FastMove } from "@pogo-analyzer/engine";
import { PlusMoveBadge, plusMoveOptionTag } from "./PlusMoveBadge.js";
import { TYPE_COLORS, typeLabel } from "./typeStyles.js";

type Move = FastMove | ChargedMove;

/** Approximate, context-free "move DPS" — power / duration, the same intrinsic rating community tools (GamePress, PvPoke) use for a move on its own, deliberately not folding in STAB/type effectiveness against whichever opponent happens to be selected right now. */
function approximateDps(move: Move): number {
  return move.durationSeconds > 0 ? move.power / move.durationSeconds : 0;
}

/**
 * Charged-move-only composite: DPS x DPE (damage-per-energy-cost), i.e.
 * power^2 / (duration x energyCost) — an explicitly hand-rolled metric for
 * this tool (not an official game stat or a known community one), meant to
 * give a single-number feel for "damage output relative to both time AND
 * energy spent" since a reader asking for one figure shouldn't have to do
 * the DPS/DPE tradeoff arithmetic themselves. Labeled honestly as "DPS×DPE"
 * in the option text below so it isn't mistaken for a recognized stat.
 */
function chargedEfficiency(move: ChargedMove): number {
  return move.durationSeconds > 0 && move.energyCost > 0 ? (move.power * move.power) / (move.durationSeconds * move.energyCost) : 0;
}

function optionLabel(move: Move, kind: "fast" | "charged"): string {
  const dps = approximateDps(move).toFixed(1);
  // Bracketed type tag up front so the type is visible even inside a closed
  // native <select>'s dropdown list, where a background-color fill on the
  // <option> itself would be unreliable across browsers (see typeStyles.ts's
  // own doc comment) — this is the per-option half of that requirement, the
  // swatch on the wrapping field below is the "closed control" half.
  const typeTag = `[${typeLabel(move.type)}]`;
  // Real synced move data (see gamemaster.ts's fromGameMasterMove) sets BOTH
  // energyGain and energyCost on every move object — whichever doesn't apply
  // is just 0 — so which field to show can't be sniffed from the object's
  // shape; it has to come from the caller telling us whether this list is a
  // fast or charged movepool.
  if (kind === "charged") {
    const chargedMove = move as ChargedMove;
    const efficiency = chargedEfficiency(chargedMove).toFixed(1);
    // Plain-text tag (not a rendered badge — see PlusMoveBadge.tsx's own doc
    // comment on why a native <select>'s option list needs a text fallback)
    // so a "+" move's confidence tier is visible even inside the closed
    // dropdown's option list, not just on the currently-selected move.
    const plusTag = plusMoveOptionTag(chargedMove);
    return `${typeTag} ${move.name} — ${move.power} dmg / ${move.durationSeconds}s (~${dps} DPS), ${chargedMove.energyCost} energy cost, Efficiency: ${efficiency} (DPS×DPE)${plusTag}`;
  }
  const fastMove = move as FastMove;
  // Energy Per Second: how quickly this fast move refills the energy meter —
  // shown alongside DPS since a fast move's value is a tradeoff between the
  // two (the highest-DPS fast moves are often the worst energy generators).
  const eps = move.durationSeconds > 0 ? (fastMove.energyGain / move.durationSeconds).toFixed(1) : "0.0";
  return `${typeTag} ${move.name} — ${move.power} dmg / ${move.durationSeconds}s (~${dps} DPS, ~${eps} EPS), +${fastMove.energyGain} energy`;
}

interface Props {
  idPrefix: string;
  label: string;
  moves: Move[];
  kind: "fast" | "charged";
  /** null (or an id not present in `moves`) selects the species' first move — this component never sends null back, it always reports the id actually in effect. */
  value: string | null;
  onChange: (id: string) => void;
}

/**
 * A plain <select> over one species' fast or charged movepool — short lists,
 * so no need for SpeciesPicker's search combobox. Each option's text encodes
 * approximate DPS + duration + energy + damage directly, so the stats stay
 * visible without a second UI dependency (this project's "no charting/UI
 * library beyond React" convention — see SpeciesPicker.tsx). Also shows the
 * CURRENTLY SELECTED move's type as a colored left-border swatch on the
 * wrapping field (native <select>/<option> background styling is unreliable
 * cross-browser for a per-option fill), plus a bracketed type tag prefixed
 * onto every option's own text (see optionLabel) so the type is visible both
 * on the closed control and distinguishable per-option in the open list —
 * shared by every move picker across every tab, since they all route through
 * this one component.
 */
export function MoveSelect({ idPrefix, label, moves, kind, value, onChange }: Props) {
  if (moves.length === 0) {
    return (
      <div className="field">
        <label>{label}</label>
        <p className="species-picker-hint">No moves available.</p>
      </div>
    );
  }
  const resolvedId = (value && moves.some((m) => m.id === value) ? value : moves[0]!.id);
  const resolvedMove = moves.find((m) => m.id === resolvedId);
  const swatchColor = resolvedMove ? TYPE_COLORS[resolvedMove.type] : undefined;
  return (
    <div
      className="field move-select-field"
      style={swatchColor ? { borderLeft: `3px solid ${swatchColor}`, paddingLeft: 8 } : undefined}
      title={resolvedMove ? `${typeLabel(resolvedMove.type)}-type move` : undefined}
    >
      <label htmlFor={idPrefix}>
        {label}
        {kind === "charged" && <PlusMoveBadge move={resolvedMove as ChargedMove | undefined} />}
      </label>
      <select id={idPrefix} value={resolvedId} onChange={(e) => onChange(e.target.value)}>
        {moves.map((move) => (
          <option key={move.id} value={move.id}>
            {optionLabel(move, kind)}
          </option>
        ))}
      </select>
    </div>
  );
}
