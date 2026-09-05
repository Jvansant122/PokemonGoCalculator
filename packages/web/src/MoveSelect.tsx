import type { ChargedMove, FastMove } from "@pogo-analyzer/engine";

type Move = FastMove | ChargedMove;

/** Approximate, context-free "move DPS" — power / duration, the same intrinsic rating community tools (GamePress, PvPoke) use for a move on its own, deliberately not folding in STAB/type effectiveness against whichever opponent happens to be selected right now. */
function approximateDps(move: Move): number {
  return move.durationSeconds > 0 ? move.power / move.durationSeconds : 0;
}

function optionLabel(move: Move, kind: "fast" | "charged"): string {
  const dps = approximateDps(move).toFixed(1);
  // Real synced move data (see gamemaster.ts's fromGameMasterMove) sets BOTH
  // energyGain and energyCost on every move object — whichever doesn't apply
  // is just 0 — so which field to show can't be sniffed from the object's
  // shape; it has to come from the caller telling us whether this list is a
  // fast or charged movepool.
  const energyLabel = kind === "charged" ? `${(move as ChargedMove).energyCost} energy cost` : `+${(move as FastMove).energyGain} energy`;
  return `${move.name} — ${move.power} dmg / ${move.durationSeconds}s (~${dps} DPS), ${energyLabel}`;
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
 * library beyond React" convention — see SpeciesPicker.tsx).
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
  return (
    <div className="field">
      <label htmlFor={idPrefix}>{label}</label>
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
