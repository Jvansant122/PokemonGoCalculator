import { useEffect, useMemo, useState } from "react";

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
export function SpeciesPicker({ idPrefix, label, options, value, onChange }: Props) {
  const selected = useMemo(() => options.find((o) => o.id === value), [options, value]);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);

  // Keep the displayed text in sync when the selection changes from outside
  // (e.g. restoring a shared scenario URL, or the options list itself resyncing).
  useEffect(() => {
    setQuery(selected?.label ?? "");
  }, [selected?.id, selected?.label]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q.length > 0 ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return matches.slice(0, MAX_RESULTS);
  }, [options, query]);

  function selectOption(option: SpeciesPickerOption) {
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
  }

  const inputId = `${idPrefix}-input`;
  const listId = `${idPrefix}-listbox`;

  return (
    <div className="field species-picker">
      <label htmlFor={inputId}>{label}</label>
      <div className="species-picker-input-row">
        {selected?.imageUrl && <img src={selected.imageUrl} alt="" className="species-icon" />}
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          onFocus={() => setOpen(true)}
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
