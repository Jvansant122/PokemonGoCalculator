import type { SpeciesRegistry } from "@pogo-analyzer/engine";
import type { RosterEntry } from "./import/pokeGenieMatch.js";

export const ROSTER_POOL_SCHEMA_VERSION = 1;

/**
 * A registry-like object this module actually needs (`has`/`get`) — kept
 * narrow so a test can pass a plain stub without constructing the engine's
 * real `SpeciesRegistry` class.
 */
type SpeciesLookup = Pick<SpeciesRegistry, "has" | "get">;

/**
 * The durable, localStorage-persisted shape of one roster entry — SPECIES
 * ID ONLY, never the full `SpeciesDefinition` object `RosterEntry` carries
 * at runtime. Storing the full object (with its embedded fastMoves/
 * chargedMoves arrays) would balloon a 164-row pool from the ~12KB measured
 * in PLAN_multi_raid_roster_optimizer.md's §2.3 (a COMPACT slot shape) to
 * something enormously larger — every species carries its whole moveset.
 * Hydrate back to a full `RosterEntry` via `hydrateRosterEntry`/
 * `hydrateRosterPool` before handing to any UI/engine code; dehydrate via
 * `dehydrateRosterEntry` before persisting.
 */
export interface StoredRosterEntry {
  entryId: string;
  speciesId: string;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  level: number;
  ivs: RosterEntry["ivs"];
  costModifiers: RosterEntry["costModifiers"];
  canMega: boolean;
  ivsAreApproximate: boolean;
  levelIsApproximate: boolean;
  movesetIsDefaulted: boolean;
  /** See RosterEntry's own doc comment (import/pokeGenieMatch.ts) — the per-slot detail behind movesetIsDefaulted. */
  fastMoveIsDefaulted: boolean;
  chargedMoveIsDefaulted: boolean;
  fastMoveUnmatchedName: string | null;
  chargedMoveUnmatchedName: string | null;
  secondChargedMoveName?: string;
  /** See RosterEntry's own doc comment (import/pokeGenieMatch.ts) — TM-eligibility provenance, added alongside PLAN_tm_move_change_optimizer.md's roster-mode half. */
  knownChargedMoveIds?: string[];
  sourceLineNumber: number;
  unmatchedMoveNames: string[];
}

export interface RosterPool {
  version: number;
  entries: StoredRosterEntry[];
  /**
   * Account-wide, per-species candy/XL-candy on hand — §3.4 of
   * PLAN_multi_raid_roster_optimizer.md. Shared across every pool entry of
   * that species (never per-entry: Poke Genie exports no candy-on-hand
   * column at all, and 27 species in the user's real export appear more
   * than once). Scaffolded here now, ahead of any UI to edit it or any
   * engine code (`rosterPlanner.ts`, Phase 2) to consume it, purely so a
   * later phase doesn't need a schema migration — an entry with no key here
   * is UNKNOWN candy, not zero (see the plan's §3.4 `costUnverified`
   * handling, which is Phase 2/3's job, not this one's).
   */
  candyBySpeciesId: Record<string, { candy: number; xlCandy: number } | undefined>;
  /** ISO timestamp of the last successful save — informational only. */
  savedAt: string;
}

export function emptyRosterPool(): RosterPool {
  return { version: ROSTER_POOL_SCHEMA_VERSION, entries: [], candyBySpeciesId: {}, savedAt: new Date(0).toISOString() };
}

export function dehydrateRosterEntry(entry: RosterEntry): StoredRosterEntry {
  return {
    entryId: entry.entryId,
    speciesId: entry.species.id,
    fastMoveId: entry.fastMoveId,
    chargedMoveId: entry.chargedMoveId,
    level: entry.level,
    ivs: entry.ivs,
    costModifiers: entry.costModifiers,
    canMega: entry.canMega,
    ivsAreApproximate: entry.ivsAreApproximate,
    levelIsApproximate: entry.levelIsApproximate,
    movesetIsDefaulted: entry.movesetIsDefaulted,
    fastMoveIsDefaulted: entry.fastMoveIsDefaulted,
    chargedMoveIsDefaulted: entry.chargedMoveIsDefaulted,
    fastMoveUnmatchedName: entry.fastMoveUnmatchedName,
    chargedMoveUnmatchedName: entry.chargedMoveUnmatchedName,
    secondChargedMoveName: entry.secondChargedMoveName,
    knownChargedMoveIds: entry.knownChargedMoveIds,
    sourceLineNumber: entry.sourceLineNumber,
    unmatchedMoveNames: entry.unmatchedMoveNames,
  };
}

/**
 * Null when the stored species id is no longer in the registry (a data
 * resync dropped or renamed it) — the caller should surface this as "N
 * entries need re-import," never crash.
 */
export function hydrateRosterEntry(stored: StoredRosterEntry, registry: SpeciesLookup): RosterEntry | null {
  if (!registry.has(stored.speciesId)) return null;
  return {
    entryId: stored.entryId,
    species: registry.get(stored.speciesId),
    fastMoveId: stored.fastMoveId,
    chargedMoveId: stored.chargedMoveId,
    level: stored.level,
    ivs: stored.ivs,
    costModifiers: stored.costModifiers,
    canMega: stored.canMega,
    ivsAreApproximate: stored.ivsAreApproximate,
    levelIsApproximate: stored.levelIsApproximate,
    movesetIsDefaulted: stored.movesetIsDefaulted,
    // `?? false`/`?? null` rather than a bare passthrough: a pool saved to
    // localStorage before these four fields existed won't carry them at all
    // (TS's static requiredness on StoredRosterEntry doesn't survive
    // JSON.parse — same reasoning this project already applies to a
    // Scenario field missing from an old share link). Defaulting to "not
    // defaulted" is the safe direction — it just means an old cached entry
    // won't show the new badge until the roster is re-imported, never a
    // crash or a false positive.
    fastMoveIsDefaulted: stored.fastMoveIsDefaulted ?? false,
    chargedMoveIsDefaulted: stored.chargedMoveIsDefaulted ?? false,
    fastMoveUnmatchedName: stored.fastMoveUnmatchedName ?? null,
    chargedMoveUnmatchedName: stored.chargedMoveUnmatchedName ?? null,
    secondChargedMoveName: stored.secondChargedMoveName,
    // Absent on a pool saved before this field existed — `undefined` is
    // already the correct "unknown" meaning (see RosterEntry.knownChargedMoveIds'
    // own doc comment), so no `?? []`/`?? false`-style fallback is needed
    // here, unlike the four moveset-badge fields above.
    knownChargedMoveIds: stored.knownChargedMoveIds,
    sourceLineNumber: stored.sourceLineNumber,
    unmatchedMoveNames: stored.unmatchedMoveNames,
  };
}

/**
 * True when a stored entry was saved by a version of this app that predates
 * `fastMoveIsDefaulted`/`chargedMoveIsDefaulted`/`fastMoveUnmatchedName`/
 * `chargedMoveUnmatchedName` (added 2026-09-10) — i.e. this is `JSON.parse`d
 * localStorage data that never HAD these keys at all, not an entry that
 * genuinely resolved a fully-known moveset. `StoredRosterEntry` declares
 * these as required (non-optional) fields, but that requiredness is a
 * compile-time claim only and does not survive `JSON.parse` any more than a
 * `Scenario` field survives on an old share link — `stored.fastMoveIsDefaulted`
 * can be a real runtime `undefined` here despite its declared type, which is
 * EXACTLY what `hydrateRosterEntry`'s own `?? false` fallback below silently
 * launders into "not defaulted" — indistinguishable on screen from a row
 * that genuinely resolved cleanly. Checking this one field is representative
 * of all four: they were added together in the same migration, so a stored
 * entry either has all four or none of them.
 */
export function entryPredatesMovesetBadgeFields(stored: StoredRosterEntry): boolean {
  return (stored as Partial<StoredRosterEntry>).fastMoveIsDefaulted === undefined;
}

export interface HydratedRosterPool {
  entries: RosterEntry[];
  /** Count of entries dropped because their species is no longer in this registry. */
  droppedCount: number;
  /**
   * Count of successfully-hydrated entries that predate the moveset-badge
   * fields (see entryPredatesMovesetBadgeFields) — these entries carry no
   * "default moveset" signal at all yet, even though the Import table above
   * (and the multi-raid result rows joined onto rosterMovesetBadge.ts) would
   * correctly show one for the SAME entry if it were re-imported today. A
   * caller should prompt a re-import rather than let this silently read as
   * "every moveset here is fully known."
   */
  staleMovesetBadgeCount: number;
}

/** Hydrates every entry in a pool, dropping (and counting) any whose species this registry no longer has rather than throwing. */
export function hydrateRosterPool(pool: RosterPool, registry: SpeciesLookup): HydratedRosterPool {
  const entries: RosterEntry[] = [];
  let droppedCount = 0;
  let staleMovesetBadgeCount = 0;
  for (const stored of pool.entries) {
    const hydrated = hydrateRosterEntry(stored, registry);
    if (hydrated) {
      entries.push(hydrated);
      if (entryPredatesMovesetBadgeFields(stored)) staleMovesetBadgeCount += 1;
    } else {
      droppedCount += 1;
    }
  }
  return { entries, droppedCount, staleMovesetBadgeCount };
}

const STORAGE_KEY = `pogo-analyzer:roster-pool:v${ROSTER_POOL_SCHEMA_VERSION}`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Best-effort validation that parsed JSON actually looks like a RosterPool
 * of the version this module writes — deliberately LENIENT (defaults
 * missing/wrong-shaped top-level fields, filters out any entry missing its
 * two required keys) rather than throwing, so a partially-corrupt
 * localStorage value degrades to an empty/partial pool instead of taking
 * the whole tab down. Explicit file import (`deserializeRosterPoolFromJson`)
 * layers a real thrown error on top of this for the version mismatch case,
 * since that's a user action that deserves a real error, not a silent
 * empty result.
 */
function normalizeParsedPool(parsed: unknown): RosterPool {
  if (!isPlainObject(parsed) || parsed.version !== ROSTER_POOL_SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
    return emptyRosterPool();
  }
  const entries = parsed.entries.filter(
    (e): e is StoredRosterEntry => isPlainObject(e) && typeof e.entryId === "string" && typeof e.speciesId === "string",
  );
  const candyBySpeciesId = isPlainObject(parsed.candyBySpeciesId) ? (parsed.candyBySpeciesId as RosterPool["candyBySpeciesId"]) : {};
  const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString();
  return { version: ROSTER_POOL_SCHEMA_VERSION, entries, candyBySpeciesId, savedAt };
}

/**
 * Loads the persisted roster pool. Wrapped in try/catch and degrades to an
 * EMPTY in-memory pool on any failure (private/incognito windows that block
 * localStorage entirely, a quota error, blocked site data, corrupt JSON) —
 * per PLAN_multi_raid_roster_optimizer.md's §8 risk table, this must never
 * throw and take the tab down with it.
 */
export function loadRosterPool(): RosterPool {
  if (typeof window === "undefined") return emptyRosterPool();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyRosterPool();
    return normalizeParsedPool(JSON.parse(raw));
  } catch {
    return emptyRosterPool();
  }
}

/**
 * Persists the roster pool. Returns `{ persisted: false }` (never throws)
 * on any localStorage failure — the caller is expected to surface that as
 * "this import will be lost on reload" rather than assume success.
 */
export function saveRosterPool(pool: RosterPool): { persisted: boolean } {
  if (typeof window === "undefined") return { persisted: false };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...pool, savedAt: new Date().toISOString() }));
    return { persisted: true };
  } catch {
    return { persisted: false };
  }
}

/**
 * Merges `incoming` (a freshly-decoded save code or JSON import) into
 * `current` ADDITIVELY — never a silent overwrite of a roster someone spent
 * time entering (PLAN_roster_tab.md's own explicit requirement; the caller's
 * OTHER option, a full replace, is just `incoming` used directly with no
 * merge at all). Re-keys any `entryId` collision (e.g. loading the same code
 * twice, or two exports that happen to share an id) by appending a suffix,
 * so a merge can never silently drop or overwrite an entry the way a naive
 * `Map`-by-id merge would. `candyBySpeciesId` is a plain shallow merge with
 * `current` taking priority on a key present in both — this field is still
 * unused by any UI as of this writing (see its own doc comment), so there is
 * no real behavior riding on the tie-break, but "the roster already open
 * wins" is the least surprising choice if that ever changes.
 */
export function mergeRosterPools(current: RosterPool, incoming: RosterPool): RosterPool {
  const usedIds = new Set(current.entries.map((e) => e.entryId));
  const remapped = incoming.entries.map((entry) => {
    if (!usedIds.has(entry.entryId)) {
      usedIds.add(entry.entryId);
      return entry;
    }
    let candidate = `${entry.entryId}-dup`;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${entry.entryId}-dup${suffix}`;
      suffix += 1;
    }
    usedIds.add(candidate);
    return { ...entry, entryId: candidate };
  });
  return {
    version: ROSTER_POOL_SCHEMA_VERSION,
    entries: [...current.entries, ...remapped],
    candyBySpeciesId: { ...incoming.candyBySpeciesId, ...current.candyBySpeciesId },
    savedAt: current.savedAt,
  };
}

/**
 * JSON is the transferable-by-file substitute for link-shareability (§3.2 of
 * PLAN_multi_raid_roster_optimizer.md — the roster deliberately does NOT go
 * in the URL). Lossless round-trip with `deserializeRosterPoolFromJson`.
 */
export function serializeRosterPoolToJson(pool: RosterPool): string {
  return JSON.stringify(pool, null, 2);
}

export class RosterPoolFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosterPoolFormatError";
  }
}

/**
 * Parses a previously-exported roster pool JSON file. Throws
 * `RosterPoolFormatError` on unparseable JSON or an unsupported schema
 * version, rather than silently returning an empty pool — unlike
 * `loadRosterPool`'s localStorage path, an explicit file import is a user
 * action that deserves a real, visible error, not a silent empty result.
 */
export function deserializeRosterPoolFromJson(text: string): RosterPool {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RosterPoolFormatError("This file isn't valid JSON.");
  }
  if (!isPlainObject(parsed) || parsed.version === undefined) {
    throw new RosterPoolFormatError("This doesn't look like a roster pool export — missing a schema version.");
  }
  if (parsed.version !== ROSTER_POOL_SCHEMA_VERSION) {
    throw new RosterPoolFormatError(
      `Unsupported roster pool schema version ${String(parsed.version)} (expected ${ROSTER_POOL_SCHEMA_VERSION}).`,
    );
  }
  return normalizeParsedPool(parsed);
}
