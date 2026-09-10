import { useRef, useState, type KeyboardEvent } from "react";
import type { ChargedMove, FastMove } from "@pogo-analyzer/engine";
import { PlusMoveBadge } from "./PlusMoveBadge.js";
import { TYPE_COLORS, typeLabel } from "./typeStyles.js";
import { effectivenessAgainstEach, type EffectivenessOpponent } from "./moveEffectiveness.js";

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

/**
 * Full stats text for one option INSIDE the open list only (damage /
 * duration / DPS / EPS / energy / efficiency) — as of 2026-09-10 this no
 * longer appears on the closed control (see the file doc comment below for
 * why), so it now only has to fit the open dropdown, which has room.
 */
function optionDetailText(move: Move, kind: "fast" | "charged"): string {
  const dps = approximateDps(move).toFixed(1);
  // Real synced move data (see gamemaster.ts's fromGameMasterMove) sets BOTH
  // energyGain and energyCost on every move object — whichever doesn't apply
  // is just 0 — so which field to show can't be sniffed from the object's
  // shape; it has to come from the caller telling us whether this list is a
  // fast or charged movepool.
  if (kind === "charged") {
    const chargedMove = move as ChargedMove;
    const efficiency = chargedEfficiency(chargedMove).toFixed(1);
    return `${move.power} dmg / ${move.durationSeconds}s (~${dps} DPS), ${chargedMove.energyCost} energy cost, Efficiency: ${efficiency} (DPS×DPE)`;
  }
  const fastMove = move as FastMove;
  // Energy Per Second: how quickly this fast move refills the energy meter —
  // shown alongside DPS since a fast move's value is a tradeoff between the
  // two (the highest-DPS fast moves are often the worst energy generators).
  const eps = move.durationSeconds > 0 ? (fastMove.energyGain / move.durationSeconds).toFixed(1) : "0.0";
  return `${move.power} dmg / ${move.durationSeconds}s (~${dps} DPS, ~${eps} EPS), +${fastMove.energyGain} energy`;
}

/** Re-exported under a MoveSelect-local name so a call site building an `opponents` array doesn't have to reach into moveEffectiveness.ts directly for the type. */
export type { EffectivenessOpponent as MoveSelectOpponent } from "./moveEffectiveness.js";

/**
 * One classified chip per opponent — bare "1.6x"-style text (plus a
 * color-independent glyph, see moveEffectiveness.ts) when there's exactly
 * one opponent, or "A 1.6x" / "3 0.63x" style per-opponent tags when there
 * are 2+ (Comparator's two candidates on the boss's own move pickers, or
 * Team Raid / Power-Up Optimizer's up to six roster slots) — collapsing
 * those into one blended number or range would hide exactly the
 * per-candidate distinction this whole tool exists to surface, so every
 * opponent always gets its own chip, never averaged or ranged together.
 * Renders nothing for zero opponents (see MoveSelect's own `opponents` prop
 * doc comment on when that's correct, not a bug).
 */
function EffectivenessChips({ moveType, opponents }: { moveType: Move["type"]; opponents: EffectivenessOpponent[] }) {
  if (opponents.length === 0) return null;
  const results = effectivenessAgainstEach(moveType, opponents);
  const showTag = results.length > 1;
  return (
    <span className="move-effectiveness">
      {results.map((r) => {
        const prefix = showTag ? `${r.opponentLabel}: ` : "";
        return (
          <span
            key={r.opponentLabel}
            className={`move-effectiveness-chip move-effectiveness-${r.tier.tone}`}
            title={`${prefix}${r.tier.label} (${r.tier.multiplierLabel})`}
          >
            {showTag && (
              <>
                <span className="move-effectiveness-tag">{r.opponentLabel}</span>{" "}
              </>
            )}
            <span aria-hidden="true">{r.tier.glyph}</span> {r.tier.multiplierLabel}
          </span>
        );
      })}
    </span>
  );
}

interface Props {
  idPrefix: string;
  label: string;
  moves: Move[];
  kind: "fast" | "charged";
  /** null (or an id not present in `moves`) selects the species' first move — this component never sends null back, it always reports the id actually in effect. */
  value: string | null;
  onChange: (id: string) => void;
  /**
   * Who to measure this move's type effectiveness against, for the closed
   * control's indicator (and the same indicator repeated per open-list
   * option). Omit, or pass an empty array, for a call site with no single
   * meaningful opponent (e.g. Species Report's sweep across every raid boss
   * at once — there is no one target to measure against there, and this
   * must degrade to rendering nothing rather than inventing a matchup).
   *
   * For a picker over an ATTACKER's own moves, this is the boss (one
   * entry). For a picker over the BOSS's moves, this is every
   * currently-resolved candidate/slot on the other side — one entry per
   * candidate on the Comparator (two), up to six on Team Raid / the
   * Power-Up Optimizer's single-raid mode. Each call site builds this list
   * itself from whichever species it already has resolved; only species
   * that currently resolve to a real selection should be included (an
   * empty roster slot contributes nothing, not a placeholder chip).
   */
  opponents?: EffectivenessOpponent[];
}

/**
 * A move picker over one species' fast or charged movepool — a hand-rolled
 * listbox button (this project's "no charting/UI library beyond React"
 * convention — see SpeciesPicker.tsx, the accessibility/keyboard precedent
 * this follows), not a native <select>, specifically because a native
 * <select> always renders its SELECTED OPTION's own text when closed and so
 * cannot show different content collapsed vs. expanded.
 *
 * As of 2026-09-10 the closed control intentionally shows very little: the
 * move's type tag, its name, the "+"-move badge if any, and a type-
 * effectiveness indicator against `opponents` — NOT damage/duration/DPS/
 * EPS/energy/efficiency, which forced horizontal cramping on a 1080p
 * monitor when every option's full stats lived in the one line the closed
 * control always showed. That full detail still exists — it just moved to
 * the open list only (see optionDetailText), where there's room for it.
 *
 * Also shows the CURRENTLY SELECTED move's type as a colored left-border
 * swatch on the wrapping field (a per-option <option> background fill would
 * be unreliable cross-browser on a native select; now that this is a real
 * <li>, per-option swatches are used directly instead of relying on a
 * bracketed text tag alone) — shared by every move picker across every tab,
 * since they all route through this one component.
 */
export function MoveSelect({ idPrefix, label, moves, kind, value, onChange, opponents = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Neither the typed-so-far buffer nor its reset timer is ever rendered —
  // both are pure interaction bookkeeping for typeahead-jump matching — so
  // these are refs, not state, to avoid a wasted re-render on every
  // keystroke a plain useState pair would cause.
  const typeaheadBufferRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (moves.length === 0) {
    return (
      <div className="field">
        <label>{label}</label>
        <p className="species-picker-hint">No moves available.</p>
      </div>
    );
  }

  const resolvedId = value && moves.some((m) => m.id === value) ? value : moves[0]!.id;
  const resolvedIndex = Math.max(
    0,
    moves.findIndex((m) => m.id === resolvedId),
  );
  const resolvedMove = moves[resolvedIndex]!;
  const safeActiveIndex = Math.min(activeIndex, moves.length - 1);
  const swatchColor = TYPE_COLORS[resolvedMove.type];

  const buttonId = idPrefix;
  const labelId = `${idPrefix}-label`;
  const listId = `${idPrefix}-listbox`;
  const activeOptionId = `${idPrefix}-option-${safeActiveIndex}`;

  function openList() {
    setActiveIndex(resolvedIndex);
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
  }

  function commit(index: number) {
    const move = moves[index];
    if (move) onChange(move.id);
    closeList();
  }

  function clearTypeahead() {
    typeaheadBufferRef.current = "";
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = null;
  }

  function typeahead(char: string) {
    const query = typeaheadBufferRef.current + char.toLowerCase();
    typeaheadBufferRef.current = query;
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = setTimeout(clearTypeahead, 600);

    const searchFrom = open ? safeActiveIndex : resolvedIndex;
    for (let offset = 1; offset <= moves.length; offset++) {
      const idx = (searchFrom + offset) % moves.length;
      const candidate = moves[idx];
      if (candidate && candidate.name.toLowerCase().startsWith(query)) {
        if (open) {
          setActiveIndex(idx);
        } else {
          onChange(candidate.id);
        }
        return;
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setActiveIndex((i) => Math.min(i + 1, moves.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(moves.length - 1);
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (open) commit(safeActiveIndex);
        else openList();
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          closeList();
        }
        break;
      case "Tab":
        if (open) closeList();
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          typeahead(e.key);
        }
    }
  }

  return (
    <div
      className="field move-select-field"
      style={swatchColor ? { borderLeft: `3px solid ${swatchColor}`, paddingLeft: 8 } : undefined}
    >
      <label id={labelId} htmlFor={buttonId}>
        {label}
      </label>
      <button
        type="button"
        id={buttonId}
        className={`move-select-trigger${open ? " move-select-trigger-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${buttonId}`}
        aria-activedescendant={open ? activeOptionId : undefined}
        title={`${typeLabel(resolvedMove.type)}-type move — click or press Enter/Space/Arrow Down to see full move details`}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={handleKeyDown}
        onBlur={closeList}
      >
        <span className="move-select-summary">
          <span className="move-select-summary-type" style={{ color: swatchColor }}>
            [{typeLabel(resolvedMove.type)}]
          </span>{" "}
          <span className="move-select-summary-name">{resolvedMove.name}</span>
          {kind === "charged" && <PlusMoveBadge move={resolvedMove as ChargedMove} />}
          <EffectivenessChips moveType={resolvedMove.type} opponents={opponents} />
        </span>
        <span className="move-select-caret" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-labelledby={labelId} className="move-select-list">
          {moves.map((move, i) => {
            const isActive = i === safeActiveIndex;
            const isSelected = move.id === resolvedId;
            return (
              <li
                key={move.id}
                id={`${idPrefix}-option-${i}`}
                role="option"
                aria-selected={isSelected}
                className={`move-select-option${isActive ? " move-select-option-active" : ""}${isSelected ? " move-select-option-selected" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(i)}
              >
                <span className="move-select-option-swatch" style={{ background: TYPE_COLORS[move.type] }} aria-hidden="true" />
                <span className="move-select-option-body">
                  <span className="move-select-option-name">
                    [{typeLabel(move.type)}] {move.name}
                    {kind === "charged" && <PlusMoveBadge move={move as ChargedMove} />}
                  </span>
                  <span className="move-select-option-detail">{optionDetailText(move, kind)}</span>
                  <EffectivenessChips moveType={move.type} opponents={opponents} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
