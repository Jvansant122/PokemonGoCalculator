import type { IVSpread, SpeciesDefinition } from "@pogo-analyzer/engine";
import type { RosterEntry } from "./import/pokeGenieMatch.js";
import { effectiveIsShadow } from "./shadowToggle.js";

/**
 * Draft state for the Roster tab's hand-entry/edit form (RosterEntryForm.tsx)
 * — mirrors what the Poke Genie import already produces (import/pokeGenieMatch.ts's
 * `RosterEntry`), minus the provenance fields a hand-typed entry has no use
 * for (sourceLineNumber, unmatchedMoveNames, etc. — see draftToRosterEntry's
 * own doc comment for why those are always "clean" here).
 */
export interface RosterEntryDraft {
  speciesId: string | null;
  /** null = use that species' first fast move (MoveSelect.tsx resolves and displays this the same as an explicit pick — see its own `resolvedId` logic). */
  fastMoveId: string | null;
  /** See fastMoveId. */
  chargedMoveId: string | null;
  level: number;
  ivAttack: number;
  ivDefense: number;
  ivStamina: number;
  isShadow: boolean;
  isPurified: boolean;
  isLucky: boolean;
  canMega: boolean;
}

export function emptyRosterEntryDraft(): RosterEntryDraft {
  return {
    speciesId: null,
    fastMoveId: null,
    chargedMoveId: null,
    level: 20,
    ivAttack: 15,
    ivDefense: 15,
    ivStamina: 15,
    isShadow: false,
    isPurified: false,
    isLucky: false,
    canMega: false,
  };
}

/**
 * Mirrors PowerUpOptimizerView's own `normalizePowerUpAssumptions` per-slot
 * logic: a species carrying a `boost` mechanic (mega/primal) can never also
 * be flagged Shadow or `canMega` off it (a Shadow Pokémon can't Mega Evolve
 * without being Purified first — see shadowToggle.ts), and Shadow/Purified
 * are themselves mutually exclusive. Keeps the hand-entry form from ever
 * being able to produce a RosterEntry the engine boundary would reject.
 * Returns the SAME reference when nothing needed to change, so callers can
 * use it as a cheap no-op guard.
 */
export function normalizeRosterEntryDraft(draft: RosterEntryDraft, species: SpeciesDefinition | null): RosterEntryDraft {
  if (!species) return draft;
  const hasBoost = !!species.boost;
  const isShadow = hasBoost ? false : draft.isShadow;
  const canMega = hasBoost ? draft.canMega : false;
  const isPurified = effectiveIsShadow(species, isShadow) ? false : draft.isPurified;
  if (isShadow === draft.isShadow && canMega === draft.canMega && isPurified === draft.isPurified) return draft;
  return { ...draft, isShadow, canMega, isPurified };
}

/** The inverse of draftToRosterEntry — pre-fills the form when editing an existing (imported or previously hand-entered) roster entry. */
export function rosterEntryToDraft(entry: RosterEntry): RosterEntryDraft {
  return {
    speciesId: entry.species.id,
    fastMoveId: entry.fastMoveId,
    chargedMoveId: entry.chargedMoveId,
    level: entry.level,
    ivAttack: entry.ivs.attack,
    ivDefense: entry.ivs.defense,
    ivStamina: entry.ivs.stamina,
    isShadow: entry.costModifiers.isShadow,
    isPurified: entry.costModifiers.isPurified,
    isLucky: entry.costModifiers.isLucky,
    canMega: entry.canMega,
  };
}

let handEntryCounter = 0;

/**
 * A unique id for a freshly hand-added entry. The "manual-" prefix keeps it
 * visibly distinct from a CSV import's own "pg-<line>-<speciesId>" ids (see
 * pokeGenieMatch.ts's `RosterEntry.entryId` doc comment) without ever
 * colliding with one — `entryId` uniqueness within the pool is load-bearing
 * (duplicate species are legitimate and common; this is what actually keeps
 * two "Rayquaza" rows distinct).
 */
export function newHandEntryId(): string {
  handEntryCounter += 1;
  return `manual-${Date.now().toString(36)}-${handEntryCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Builds (or rebuilds, on save-after-edit) a `RosterEntry` from a hand-entry
 * draft. ALWAYS produces a fully KNOWN moveset/IVs/level
 * (movesetIsDefaulted/fastMoveIsDefaulted/chargedMoveIsDefaulted all false,
 * no unmatched-name fields, ivsAreApproximate/levelIsApproximate both
 * false) — a hand-entered or hand-edited Pokémon's stats were just
 * explicitly typed/picked through NumberField/MoveSelect, never guessed from
 * a blank CSV column, so it must never carry the "default moveset" badge
 * (rosterMovesetBadge.ts) or an "approx IV"/"approx level" badge a blank or
 * averaged import column earns. This is the exact requirement PLAN_roster_tab.md
 * calls out as "critical."
 */
export function draftToRosterEntry(draft: RosterEntryDraft, species: SpeciesDefinition, entryId: string): RosterEntry {
  const ivs: IVSpread = { attack: draft.ivAttack, defense: draft.ivDefense, stamina: draft.ivStamina };
  const fastMoveId = draft.fastMoveId ?? species.fastMoves[0]?.id ?? null;
  const chargedMoveId = draft.chargedMoveId ?? species.chargedMoves[0]?.id ?? null;
  return {
    entryId,
    species,
    fastMoveId,
    chargedMoveId,
    level: draft.level,
    ivs,
    costModifiers: {
      isShadow: effectiveIsShadow(species, draft.isShadow),
      isPurified: draft.isPurified,
      isLucky: draft.isLucky,
    },
    canMega: draft.canMega && !!species.boost,
    ivsAreApproximate: false,
    levelIsApproximate: false,
    movesetIsDefaulted: false,
    fastMoveIsDefaulted: false,
    chargedMoveIsDefaulted: false,
    fastMoveUnmatchedName: null,
    chargedMoveUnmatchedName: null,
    sourceLineNumber: 0,
    unmatchedMoveNames: [],
  };
}
