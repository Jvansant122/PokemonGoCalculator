/**
 * Badge text for a multi-raid roster entry whose moveset had to be partly or
 * fully GUESSED at import time (see import/pokeGenieMatch.ts's
 * buildRosterEntry). This is a real trust gap fixed 2026-09-10: the multi-raid
 * ranked/benched/never-competitive result tables in PowerUpOptimizerView.tsx
 * used to show this ONLY in the "Import a whole roster" table further up the
 * page (RosterImportPanel.tsx's own `entryFlags`) — a player scanning the
 * RESULT rows to decide tonight's spend had no signal that a recommendation
 * (e.g. "power up Rayquaza") rests on a guessed moveset, because the engine's
 * own result types (`RosterPowerUpCandidate`/`RosterNeverCompetitiveEntry`/
 * `RosterBudgetStep`, all packages/engine/src/rosterPlanner.ts) don't carry
 * this import-time provenance at all — it lives only on the WEB-owned
 * `RosterEntry` (import/pokeGenieMatch.ts) each result row's own `entryId`
 * joins back to. Fixed as a web-only join (PowerUpOptimizerView.tsx builds an
 * `entryId -> MovesetDefaultBadgeInfo` map from the hydrated pool, same
 * pattern as its pre-existing `entryIdentities` map), never an engine change.
 *
 * Distinguishes exactly the three cases pokeGenieMatch.ts already tracks per
 * slot, rather than collapsing everything into one generic "default
 * moveset" label:
 *  - a slot that was genuinely BLANK in the source row (the common case —
 *    pokeGenieMatch.ts's own doc comment cites 55-60% of a real export) —
 *    reads as "default ... move," reusing RosterImportPanel.tsx's own
 *    existing "default moveset" wording rather than inventing new
 *    vocabulary;
 *  - a slot that HAD a name recorded but this engine's move data didn't
 *    recognize it (a data-matching gap on this project's own side, not a
 *    missing user input — e.g. Raticate (Alola)'s "Return") reads as "...
 *    not recognized" instead, since that deserves more alarmed wording than
 *    an expected blank (see pokeGenieMatch.ts's own `unmatchedMoveNames` doc
 *    comment);
 *  - when only ONE of the two moves was guessed, the label names WHICH one
 *    ("default fast move"/"default charged move") rather than the
 *    overstated whole-moveset "default moveset" text.
 */

interface NamedMove {
  id: string;
  name: string;
}

/** The subset of RosterEntry (import/pokeGenieMatch.ts) this module actually reads — kept narrow so a test can build a minimal fixture without the full species-matching pipeline. */
export interface MovesetDefaultBadgeSource {
  fastMoveId: string | null;
  chargedMoveId: string | null;
  fastMoveIsDefaulted: boolean;
  chargedMoveIsDefaulted: boolean;
  fastMoveUnmatchedName: string | null;
  chargedMoveUnmatchedName: string | null;
  species: {
    fastMoves: NamedMove[];
    chargedMoves: NamedMove[];
  };
}

export interface MovesetDefaultBadgeInfo {
  /** Short enough for a dense table cell — never a sentence (this bug fix's own explicit requirement: a badge, not prose, since these result tables already carry a lot of text). */
  label: string;
  /** The full explanation, meant for a `title` tooltip attribute — names which move, blank vs. unrecognized, and which move this tool assumed instead. */
  title: string;
}

function moveName(moves: NamedMove[], id: string | null): string {
  return moves.find((m) => m.id === id)?.name ?? "its first available move";
}

function slotDetail(
  isDefaulted: boolean,
  unmatchedName: string | null,
  moveKind: "Fast" | "Charged",
  moves: NamedMove[],
  resolvedId: string | null,
): string | null {
  if (!isDefaulted) return null;
  const assumed = moveName(moves, resolvedId);
  return unmatchedName
    ? `${moveKind} move "${unmatchedName}" wasn't recognized — assumed ${assumed}.`
    : `${moveKind} move was blank in the import — assumed ${assumed}.`;
}

/**
 * Returns `null` when neither move was defaulted — the common case, no
 * badge. Otherwise a short label plus a fuller tooltip explanation; see this
 * module's own top doc comment for the three cases it distinguishes.
 */
export function movesetDefaultBadge(entry: MovesetDefaultBadgeSource): MovesetDefaultBadgeInfo | null {
  if (!entry.fastMoveIsDefaulted && !entry.chargedMoveIsDefaulted) return null;

  const fastDetail = slotDetail(entry.fastMoveIsDefaulted, entry.fastMoveUnmatchedName, "Fast", entry.species.fastMoves, entry.fastMoveId);
  const chargedDetail = slotDetail(
    entry.chargedMoveIsDefaulted,
    entry.chargedMoveUnmatchedName,
    "Charged",
    entry.species.chargedMoves,
    entry.chargedMoveId,
  );
  const title = [fastDetail, chargedDetail].filter((d): d is string => d !== null).join(" ");

  const fastUnrecognized = entry.fastMoveIsDefaulted && entry.fastMoveUnmatchedName !== null;
  const chargedUnrecognized = entry.chargedMoveIsDefaulted && entry.chargedMoveUnmatchedName !== null;
  const anyUnrecognized = fastUnrecognized || chargedUnrecognized;

  let label: string;
  if (entry.fastMoveIsDefaulted && entry.chargedMoveIsDefaulted) {
    label = anyUnrecognized ? "moveset not recognized" : "default moveset";
  } else if (entry.fastMoveIsDefaulted) {
    label = fastUnrecognized ? "fast move not recognized" : "default fast move";
  } else {
    label = chargedUnrecognized ? "charged move not recognized" : "default charged move";
  }

  return { label, title };
}
