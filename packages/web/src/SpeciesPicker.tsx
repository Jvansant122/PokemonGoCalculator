import { useEffect, useMemo, useRef, useState } from "react";

export interface SpeciesPickerOption {
  id: string;
  label: string;
  badge?: "hypothetical" | "approximate" | "shadow";
  imageUrl?: string;
}

interface Props {
  /** Unique prefix for this picker's DOM ids — lets 3+ pickers share one page without collisions. */
  idPrefix: string;
  label: string;
  options: SpeciesPickerOption[];
  value: string;
  onChange: (id: string) => void;
  /**
   * Opt-in "this is the headline picker on this tab" styling (taller input,
   * larger label/font) via the `.species-picker--primary` modifier class in
   * styles.css — NOT a change to `.species-picker` itself, since that class
   * is shared by every picker on every tab (the Team Raid roster's 6 slots,
   * every other tab's single species picker), where 6+ oversized rows would
   * hurt more than help. Only the Comparator's 3 top-level pickers
   * (candidate A/B, raid target) set this. Defaults to false.
   */
  primary?: boolean;
}

const MAX_RESULTS = 200;

/**
 * A searchable combobox over the full species registry (~1000+ entries) —
 * a plain input + filtered dropdown, no new UI dependency, per this project's
 * "zero charting/UI libraries beyond React" convention. Any option flagged
 * `isHypothetical`/`isApproximate`/`isShadow` upstream renders a visible badge
 * here, since speculative (or mechanically-different) data must stay labeled
 * wherever it appears.
 */
export function SpeciesPicker({ idPrefix, label, options, value, onChange, primary = false }: Props) {
  const selected = useMemo(() => options.find((o) => o.id === value), [options, value]);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set by selectOption, consumed by the effect below — see its own comment
  // for why re-selecting the text needs to happen there rather than inline.
  const reselectAfterPickRef = useRef(false);

  // Keep the displayed text in sync when the selection changes from outside
  // (e.g. restoring a shared scenario URL, or the options list itself resyncing).
  useEffect(() => {
    setQuery(selected?.label ?? "");
  }, [selected?.id, selected?.label]);

  // Re-select the input's full text after picking an option from the list,
  // so the very next keystroke replaces it instead of appending. Can't do
  // this inline in selectOption: the option button's onMouseDown calls
  // preventDefault() (deliberately, so the click registers before the list
  // unmounts on blur) which means the input NEVER loses focus during a
  // pick, so the normal onFocus-driven select-all below never re-fires for
  // the second+ pick in a row. This effect is the substitute "just picked"
  // hook, and it must run after commit (not inline in the click handler) so
  // it selects the NEW value rather than whatever stale text was in the DOM
  // before this render. Reproduced live pre-fix: pick Bulbasaur, then type
  // "mewtwo" with no re-click in between, and the box read "Bulbasaurmewtwo".
  useEffect(() => {
    if (reselectAfterPickRef.current) {
      reselectAfterPickRef.current = false;
      if (document.activeElement === inputRef.current) {
        inputRef.current?.select();
      }
    }
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q.length > 0 ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return matches.slice(0, MAX_RESULTS);
  }, [options, query]);

  function selectOption(option: SpeciesPickerOption) {
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
    reselectAfterPickRef.current = true;
  }

  const inputId = `${idPrefix}-input`;
  const listId = `${idPrefix}-listbox`;

  return (
    <div className={`field species-picker${primary ? " species-picker--primary" : ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <div className="species-picker-input-row">
        {selected?.imageUrl && <img src={selected.imageUrl} alt="" className="species-icon" />}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          onFocus={(e) => {
            setOpen(true);
            // Select the existing text so typing immediately replaces it
            // rather than appending — clicking into a picker already reading
            // e.g. "Kartana" and typing "mewtwo" used to produce
            // "Kartanamewtwo" (-> "No matches"). Plain DOM .select(), not
            // React state — doesn't touch `query`/`open`, so it can't disturb
            // the controlled-input/listbox wiring below.
            e.target.select();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            // Deferred so a mousedown on an option below still registers as a click
            // before the list unmounts.
            setTimeout(() => setOpen(false), 150);
          }}
          placeholder="Search by name..."
        />
      </div>
      {!selected && value && <p className="species-picker-warning">Unknown species id "{value}" in this scenario — pick a replacement.</p>}
      {open && (
        <ul id={listId} role="listbox" className="species-picker-list">
          {filtered.length === 0 && <li className="species-picker-empty">No matches</li>}
          {filtered.map((option, i) => (
            <li key={`${idPrefix}-${option.id}-${i}`} role="option" aria-selected={option.id === value}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => selectOption(option)}>
                {option.imageUrl ? (
                  <img src={option.imageUrl} alt="" className="species-icon" loading="lazy" />
                ) : (
                  <span className="species-icon species-icon-placeholder" aria-hidden="true" />
                )}
                {option.label}
                {option.badge && <span className={`badge badge-${option.badge}`}>{option.badge}</span>}
              </button>
            </li>
          ))}
          {filtered.length === MAX_RESULTS && (
            <li className="species-picker-hint">Showing first {MAX_RESULTS} matches — keep typing to narrow it down.</li>
          )}
        </ul>
      )}
    </div>
  );
}
