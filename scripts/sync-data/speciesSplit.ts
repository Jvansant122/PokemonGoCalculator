/**
 * Derives the two compact, `data/normalized/species.json`-derived files —
 * `speciesCore.json` and `speciesMoves.json` — that PLAN_species_moves_split.md
 * Stage 1 adds (IDEAS.md #26's dedup half; the async-load half is later
 * staging, not this file's job). `species.json` itself is untouched and stays
 * the canonical file every existing script/golden test reads; these are
 * ADDITIONAL, purely derived from the same in-memory `species` array.
 *
 * The whole split is only safe because of one empirically-verified
 * precondition (PLAN §0, re-verified 2026-09-14): every occurrence of a given
 * move id, across all 1,750 species, is structurally identical JSON. That is
 * NOT guaranteed by anything upstream — GAME_MASTER could, in a future sync,
 * emit two different objects under the same move id (a genuine content
 * change, a matching bug, anything) — so this module re-checks it on every
 * run and THROWS rather than silently writing a dictionary that would quietly
 * hand every other species the wrong copy of that move. An assert that has
 * never fired is not known to work; this one is exercised in
 * scripts/sync-data/test/speciesSplit.test.ts by deliberately constructing a
 * conflicting pair.
 *
 * Pure, no I/O — sync-data.ts owns writing the two output files.
 */
import type { SpeciesDefinition, FastMove, ChargedMove } from "@pogo-analyzer/engine";

/** `species.json`'s per-entry shape, minus the two move arrays. */
export type SpeciesCoreEntry = Omit<SpeciesDefinition, "fastMoves" | "chargedMoves">;

export interface SpeciesMovesPayload {
  fastMoves: Record<string, FastMove>;
  chargedMoves: Record<string, ChargedMove>;
  /** Per-species move id lists — `f`/`c` (not `fastMoves`/`chargedMoves`) deliberately, to keep this file small; it's an id-list index, not a restatement of the dictionaries above. */
  bySpecies: Record<string, { f: string[]; c: string[] }>;
}

export interface SpeciesSplitResult {
  speciesCore: SpeciesCoreEntry[];
  speciesMoves: SpeciesMovesPayload;
}

/**
 * Merges one move into `dict`, throwing if an id already present maps to a
 * structurally different object. `firstSeenBy` exists only so the thrown
 * error can name BOTH species involved, not just the second one — "X
 * conflicts with Y" is far more actionable than "X conflicts with something".
 */
function mergeMove<M extends { id: string }>(
  dict: Record<string, M>,
  firstSeenBy: Map<string, string>,
  move: M,
  kind: "fast" | "charged",
  speciesId: string,
): void {
  const existing = dict[move.id];
  if (existing === undefined) {
    dict[move.id] = move;
    firstSeenBy.set(move.id, speciesId);
    return;
  }
  if (JSON.stringify(existing) !== JSON.stringify(move)) {
    const firstId = firstSeenBy.get(move.id) ?? "(unknown)";
    throw new Error(
      `deriveSpeciesSplit: ${kind} move id "${move.id}" is NOT structurally identical across species — ` +
        `first seen on species "${firstId}", conflicting copy found on species "${speciesId}". ` +
        `The species/moves split precondition (PLAN_species_moves_split.md §0, re-verified 2026-09-14: ` +
        `308 distinct move ids, 0 conflicts) no longer holds, so speciesCore.json/speciesMoves.json would ` +
        `silently hand every OTHER species carrying this move id the wrong copy. Stop and re-evaluate ` +
        `rather than writing the derived files this run.\n` +
        `  first copy:       ${JSON.stringify(existing)}\n` +
        `  conflicting copy: ${JSON.stringify(move)}`,
    );
  }
}

export function deriveSpeciesSplit(species: SpeciesDefinition[]): SpeciesSplitResult {
  const fastMoves: Record<string, FastMove> = {};
  const chargedMoves: Record<string, ChargedMove> = {};
  const fastMoveFirstSeenBy = new Map<string, string>();
  const chargedMoveFirstSeenBy = new Map<string, string>();
  const bySpecies: Record<string, { f: string[]; c: string[] }> = {};
  const speciesCore: SpeciesCoreEntry[] = [];

  for (const s of species) {
    const f: string[] = [];
    for (const move of s.fastMoves) {
      mergeMove(fastMoves, fastMoveFirstSeenBy, move, "fast", s.id);
      f.push(move.id);
    }
    const c: string[] = [];
    for (const move of s.chargedMoves) {
      mergeMove(chargedMoves, chargedMoveFirstSeenBy, move, "charged", s.id);
      c.push(move.id);
    }
    bySpecies[s.id] = { f, c };

    // `_`-prefixed names are this repo's explicit no-unused-vars opt-out (eslint.config.js).
    const { fastMoves: _fastMoves, chargedMoves: _chargedMoves, ...core } = s;
    speciesCore.push(core);
  }

  return { speciesCore, speciesMoves: { fastMoves, chargedMoves, bySpecies } };
}
