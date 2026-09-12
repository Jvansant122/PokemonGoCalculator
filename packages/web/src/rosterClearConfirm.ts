/**
 * Pure helpers behind the Roster tab's "Clear roster" control (RosterView.tsx)
 * — split out so the gating and copy are testable without rendering. This
 * action is irrecoverable in a real, load-bearing sense: the roster lives
 * ONLY in this browser's localStorage (CLAUDE.md's "no backend, no accounts"
 * standing decision), so wiping it here has no server-side undo. Unlike
 * `handleDelete`'s one-row removal (no confirm needed — easily re-added), a
 * full clear can erase a ~164-entry CSV import in one click, hence the
 * two-step confirm this module backs rather than a bare `window.confirm`.
 */

/** The button is only actionable when there's something to lose. */
export function canClearRoster(entryCount: number): boolean {
  return entryCount > 0;
}

/**
 * Confirm-step copy: states the exact count (never a vague "are you sure?")
 * and names the save code as the recovery path, per this feature's own
 * requirement.
 */
export function rosterClearConfirmMessage(entryCount: number): string {
  const noun = entryCount === 1 ? "entry" : "entries";
  return `Clear all ${entryCount} ${noun}? They're stored only in this browser — if you might want them back, copy your save code first (below).`;
}
