/**
 * Per-row qualifier for a BENCHED move-change candidate (second-charged-move
 * or Elite TM, both from `runRosterMoveChangeCandidates`,
 * packages/engine/src/rosterMoveChange.ts) that names WHICH fielded team
 * member the candidate's real evaluation swapped OUT — and, when that swap
 * hit the "at most one Mega" guard, says so distinctly.
 *
 * Real bug this exists to prevent: `RosterSecondChargedMoveCandidate`/
 * `RosterEliteTmCandidate` gained `displacedEntryId`/`displacedFieldedMega`
 * when the engine fixed a benched-mega-vs-fielded-mega substitution bug
 * (2026-09-10/11 — see rosterMoveChange.ts's own "At most one Mega" doc
 * comment), but neither field had a `packages/web` consumer before this. A
 * `displacedFieldedMega: true` row answers "does this candidate beat your
 * CURRENT mega" — a materially different, much higher bar than the ordinary
 * "does it beat your weakest attacker" every other benched row answers — so
 * reading its delta without that context compares against the wrong
 * referent. Same "web-only join by entryId, short label + fuller title
 * tooltip" shape as rosterMovesetBadge.ts's `movesetDefaultBadge` — read
 * that module's own top doc comment for the precedent this mirrors.
 */

export interface DisplacedSlotNote {
  /** Short enough for a dense table cell, next to the species name. */
  label: string;
  /** Fuller explanation for a `title` tooltip. */
  title: string;
  /**
   * True only for the mega-conflict case — callers should render this with
   * the project's existing "distrust/read carefully" badge styling
   * (`.badge-approximate`) rather than a plain caption, since the referent
   * this delta is measured against silently changed.
   */
  isMegaConflict: boolean;
}

/**
 * `fielded`/`displacedEntryId`/`displacedFieldedMega` are the three relevant
 * fields shared by both `RosterSecondChargedMoveCandidate` and
 * `RosterEliteTmCandidate`. `displacedName` is the caller's own
 * entryId -> species name resolution (a fielded team's `entryId` isn't
 * globally unique in the same visible way a species name is, so the caller
 * joins it before calling this — same pattern as `entryIdentities` in
 * PowerUpOptimizerView.tsx). Returns `null` for a FIELDED row (nobody is
 * displaced — the entry is already on the team), matching
 * `displacedEntryId === null`'s own meaning.
 */
export function displacedSlotNote(
  fielded: boolean,
  displacedEntryId: string | null,
  displacedFieldedMega: boolean,
  displacedName: string | undefined,
): DisplacedSlotNote | null {
  if (fielded || displacedEntryId === null) return null;
  const name = displacedName ?? "an unidentified fielded team member";

  if (displacedFieldedMega) {
    return {
      label: `vs. your CURRENT mega (${name})`,
      title:
        `This candidate is also Mega-capable, and only one Pokémon can be Mega Evolved on your team at a time — so this ` +
        `evaluation swapped out your CURRENTLY FIELDED mega, ${name}, not your weakest attacker. The bar here is much ` +
        `higher than an ordinary benched row: a small or negative Δ team DPS means this candidate doesn't beat your ` +
        `existing mega, NOT that it's weak overall.`,
      isMegaConflict: true,
    };
  }

  return {
    label: `replaces ${name}`,
    title: `This benched candidate's evaluation swapped it in for your team's weakest fielded member, ${name}.`,
    isMegaConflict: false,
  };
}
