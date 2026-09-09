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
  isFullyEvolved?: boolean;
  secondChargedMoveName?: string;
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
    isFullyEvolved: entry.isFullyEvolved,
    secondChargedMoveName: entry.secondChargedMoveName,
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
    isFullyEvolved: stored.isFullyEvolved,
    secondChargedMoveName: stored.secondChargedMoveName,
    sourceLineNumber: stored.sourceLineNumber,
    unmatchedMoveNames: stored.unmatchedMoveNames,
  };
}

/** Hydrates every entry in a pool, dropping (and counting) any whose species this registry no longer has rather than throwing. */
export function hydrateRosterPool(pool: RosterPool, registry: SpeciesLookup): { entries: RosterEntry[]; droppedCount: number } {
  const entries: RosterEntry[] = [];
  let droppedCount = 0;
  for (const stored of pool.entries) {
    const hydrated = hydrateRosterEntry(stored, registry);
    if (hydrated) entries.push(hydrated);
    else droppedCount += 1;
  }
  return { entries, droppedCount };
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
