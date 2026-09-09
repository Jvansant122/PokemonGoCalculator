const STORAGE_PREFIX = "pogo-analyzer:collapsible:";

/**
 * Per-browser, per-section open/closed state for CollapsibleSection.tsx.
 * Deliberately NOT a Scenario field and NOT threaded through any
 * Assumptions interface — see CLAUDE.md's standing decision under "Every
 * user-facing assumption must round-trip through Scenario": folding a
 * section changes no number, no ordering, and no analytical meaning, so a
 * shared link imposing the sender's fold state on the recipient would be
 * worse, not better (the same reasoning that keeps the Power-Up Optimizer's
 * imported roster out of the URL). This module is the ENTIRE persistence
 * surface for that state — every read/write degrades to the caller-supplied
 * default on failure (private window, blocked site data, quota exceeded),
 * same convention as rosterPool.ts's own localStorage handling.
 */

/**
 * Reads one section's stored open/closed state, falling back to
 * `defaultOpen` when nothing has been stored yet (first visit) or storage
 * can't be read at all.
 */
export function readCollapsibleOpen(id: string, defaultOpen: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id);
    if (raw === "open") return true;
    if (raw === "closed") return false;
    return defaultOpen;
  } catch {
    return defaultOpen;
  }
}

/** Persists one section's open/closed state — a silent no-op on failure (see this module's own top doc comment). */
export function writeCollapsibleOpen(id: string, open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, open ? "open" : "closed");
  } catch {
    // Private window / blocked site data / quota exceeded — this section
    // just reverts to its default on the next visit, same as a first-time
    // visitor, rather than breaking the page.
  }
}
