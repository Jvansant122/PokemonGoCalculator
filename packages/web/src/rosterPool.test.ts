import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";
import type { RosterEntry } from "./import/pokeGenieMatch.js";
import {
  dehydrateRosterEntry,
  deserializeRosterPoolFromJson,
  emptyRosterPool,
  entryPredatesMovesetBadgeFields,
  hydrateRosterEntry,
  hydrateRosterPool,
  loadRosterPool,
  mergeRosterPools,
  ROSTER_POOL_SCHEMA_VERSION,
  RosterPoolFormatError,
  saveRosterPool,
  serializeRosterPoolToJson,
  type RosterPool,
  type StoredRosterEntry,
} from "./rosterPool.js";

function fakeSpecies(id: string): SpeciesDefinition {
  return {
    id,
    name: id,
    types: ["normal"],
    baseAttack: 100,
    baseDefense: 100,
    baseStamina: 100,
    fastMoves: [{ id: "TACKLE", name: "Tackle", type: "normal", power: 5, energyGain: 5, durationSeconds: 0.5 }],
    chargedMoves: [{ id: "BODY_SLAM", name: "Body Slam", type: "normal", power: 50, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 }],
  };
}

function fakeEntry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    entryId: "pg-2-houndour",
    species: fakeSpecies("houndour"),
    fastMoveId: "TACKLE",
    chargedMoveId: "BODY_SLAM",
    level: 11,
    ivs: { attack: 13, defense: 13, stamina: 11 },
    costModifiers: { isShadow: false, isPurified: false, isLucky: false },
    canMega: false,
    ivsAreApproximate: false,
    levelIsApproximate: false,
    movesetIsDefaulted: false,
    fastMoveIsDefaulted: false,
    chargedMoveIsDefaulted: false,
    fastMoveUnmatchedName: null,
    chargedMoveUnmatchedName: null,
    sourceLineNumber: 2,
    unmatchedMoveNames: [],
    ...overrides,
  };
}

/** An in-memory Storage stand-in — the real localStorage API surface this module actually calls. */
function fakeLocalStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe("dehydrateRosterEntry / hydrateRosterEntry", () => {
  it("round-trips every field through the compact (species-id-only) stored shape", () => {
    const entry = fakeEntry({ secondChargedMoveName: "Ice Beam", unmatchedMoveNames: ["Return"] });
    const stored = dehydrateRosterEntry(entry);
    expect(stored.speciesId).toBe("houndour");
    expect(stored).not.toHaveProperty("species"); // never the full SpeciesDefinition object

    const registry = { has: (id: string) => id === "houndour", get: () => fakeSpecies("houndour") };
    const rehydrated = hydrateRosterEntry(stored, registry);
    expect(rehydrated).toEqual(entry);
  });

  it("returns null (never throws) when the stored species id is no longer in the registry", () => {
    const stored = dehydrateRosterEntry(fakeEntry());
    const registry = { has: () => false, get: () => fakeSpecies("houndour") };
    expect(hydrateRosterEntry(stored, registry)).toBeNull();
  });

  it("round-trips a known knownChargedMoveIds pair (PLAN_tm_move_change_optimizer.md)", () => {
    const entry = fakeEntry({ knownChargedMoveIds: ["BODY_SLAM", "SWIFT"] });
    const stored = dehydrateRosterEntry(entry);
    expect(stored.knownChargedMoveIds).toEqual(["BODY_SLAM", "SWIFT"]);
    const registry = { has: (id: string) => id === "houndour", get: () => fakeSpecies("houndour") };
    expect(hydrateRosterEntry(stored, registry)).toEqual(entry);
  });

  it("leaves knownChargedMoveIds undefined (unknown), never guessed, when absent from a stored entry", () => {
    const stored = dehydrateRosterEntry(fakeEntry());
    expect(stored.knownChargedMoveIds).toBeUndefined();
    const registry = { has: (id: string) => id === "houndour", get: () => fakeSpecies("houndour") };
    expect(hydrateRosterEntry(stored, registry)!.knownChargedMoveIds).toBeUndefined();
  });
});

describe("hydrateRosterPool", () => {
  it("hydrates every entry it can and counts the ones it drops", () => {
    const pool: RosterPool = {
      version: ROSTER_POOL_SCHEMA_VERSION,
      entries: [dehydrateRosterEntry(fakeEntry({ entryId: "a", species: fakeSpecies("houndour") })), dehydrateRosterEntry(fakeEntry({ entryId: "b", species: fakeSpecies("gone") }))],
      candyBySpeciesId: {},
      savedAt: new Date(0).toISOString(),
    };
    const registry = { has: (id: string) => id === "houndour", get: () => fakeSpecies("houndour") };
    const { entries, droppedCount } = hydrateRosterPool(pool, registry);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.entryId).toBe("a");
    expect(droppedCount).toBe(1);
  });

  it("counts a hydrated entry as staleMovesetBadgeCount when its stored JSON predates the moveset-badge fields entirely", () => {
    const fresh = dehydrateRosterEntry(fakeEntry({ entryId: "fresh" }));
    // Simulate real pre-migration localStorage JSON: a stored entry that
    // never had these 4 keys at all (not `false`/`null` — genuinely absent),
    // the same shape JSON.parse would produce from a roster saved before
    // 2026-09-10. `delete` (not `as any` reassignment to undefined) so the
    // keys are truly absent from the object, matching what JSON.stringify of
    // an old pool would have actually produced.
    const stale = dehydrateRosterEntry(fakeEntry({ entryId: "stale" })) as Partial<StoredRosterEntry>;
    delete stale.fastMoveIsDefaulted;
    delete stale.chargedMoveIsDefaulted;
    delete stale.fastMoveUnmatchedName;
    delete stale.chargedMoveUnmatchedName;

    const pool: RosterPool = {
      version: ROSTER_POOL_SCHEMA_VERSION,
      entries: [fresh, stale as StoredRosterEntry],
      candyBySpeciesId: {},
      savedAt: new Date(0).toISOString(),
    };
    const registry = { has: () => true, get: (id: string) => fakeSpecies(id) };
    const { entries, staleMovesetBadgeCount } = hydrateRosterPool(pool, registry);
    // Both still hydrate safely (never dropped/thrown) — staleness is purely
    // a "should this prompt a re-import" signal, not a hydration failure.
    expect(entries).toHaveLength(2);
    expect(staleMovesetBadgeCount).toBe(1);
  });

  it("never flags a freshly-dehydrated entry as stale, even when its moveset genuinely resolved with false/null values", () => {
    // The exact case the task's own "make sure a fresh import never trips
    // the notice" requirement is about: fastMoveIsDefaulted/etc. are
    // LEGITIMATELY false/null here (a real, fully-resolved moveset), not
    // absent — dehydrateRosterEntry always writes them explicitly (see
    // pokeGenieMatch.ts's buildRosterEntry), so JSON.stringify keeps them as
    // real `false`/`null` literals, never drops them the way `undefined`
    // would be dropped.
    const entry = fakeEntry({ fastMoveIsDefaulted: false, chargedMoveIsDefaulted: false, fastMoveUnmatchedName: null, chargedMoveUnmatchedName: null });
    const stored = dehydrateRosterEntry(entry);
    expect(entryPredatesMovesetBadgeFields(stored)).toBe(false);

    const pool: RosterPool = {
      version: ROSTER_POOL_SCHEMA_VERSION,
      entries: [stored],
      candyBySpeciesId: {},
      savedAt: new Date(0).toISOString(),
    };
    const registry = { has: () => true, get: (id: string) => fakeSpecies(id) };
    expect(hydrateRosterPool(pool, registry).staleMovesetBadgeCount).toBe(0);
  });
});

describe("localStorage persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loadRosterPool degrades to an empty in-memory pool when window is undefined (SSR/test context)", () => {
    expect(loadRosterPool()).toEqual(emptyRosterPool());
  });

  it("saveRosterPool reports { persisted: false } (never throws) when window is undefined", () => {
    expect(saveRosterPool(emptyRosterPool())).toEqual({ persisted: false });
  });

  it("round-trips a pool through save -> load via a real-shaped localStorage stand-in", () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });

    const pool: RosterPool = {
      version: ROSTER_POOL_SCHEMA_VERSION,
      entries: [dehydrateRosterEntry(fakeEntry())],
      candyBySpeciesId: { houndour: { candy: 40, xlCandy: 0 } },
      savedAt: new Date(0).toISOString(),
    };
    const saveResult = saveRosterPool(pool);
    expect(saveResult.persisted).toBe(true);

    const loaded = loadRosterPool();
    expect(loaded.entries).toEqual(pool.entries);
    expect(loaded.candyBySpeciesId).toEqual(pool.candyBySpeciesId);
  });

  it("degrades to an empty pool (never throws) when localStorage.getItem throws (private window, blocked site data)", () => {
    const storage: Storage = {
      getItem: () => {
        throw new Error("SecurityError: storage is disabled");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
    vi.stubGlobal("window", { localStorage: storage });
    expect(loadRosterPool()).toEqual(emptyRosterPool());
  });

  it("reports { persisted: false } (never throws) when localStorage.setItem throws (quota exceeded)", () => {
    const storage: Storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
    vi.stubGlobal("window", { localStorage: storage });
    expect(saveRosterPool(emptyRosterPool())).toEqual({ persisted: false });
  });

  it("degrades to an empty pool when the stored value is corrupt JSON", () => {
    vi.stubGlobal("window", { localStorage: fakeLocalStorage({ "pogo-analyzer:roster-pool:v1": "{not valid json" }) });
    expect(loadRosterPool()).toEqual(emptyRosterPool());
  });

  it("degrades to an empty pool when the stored value is a stale/incompatible schema version", () => {
    vi.stubGlobal(
      "window",
      { localStorage: fakeLocalStorage({ "pogo-analyzer:roster-pool:v1": JSON.stringify({ version: 999, entries: [] }) }) },
    );
    expect(loadRosterPool()).toEqual(emptyRosterPool());
  });
});

describe("JSON file import/export", () => {
  it("round-trips a pool losslessly through serialize/deserialize", () => {
    const pool: RosterPool = {
      version: ROSTER_POOL_SCHEMA_VERSION,
      entries: [dehydrateRosterEntry(fakeEntry())],
      candyBySpeciesId: { houndour: { candy: 12, xlCandy: 0 } },
      savedAt: new Date(0).toISOString(),
    };
    const text = serializeRosterPoolToJson(pool);
    expect(deserializeRosterPoolFromJson(text)).toEqual(pool);
  });

  it("throws RosterPoolFormatError on unparseable JSON", () => {
    expect(() => deserializeRosterPoolFromJson("{not json")).toThrow(RosterPoolFormatError);
  });

  it("throws RosterPoolFormatError on a missing schema version", () => {
    expect(() => deserializeRosterPoolFromJson(JSON.stringify({ entries: [] }))).toThrow(RosterPoolFormatError);
  });

  it("throws RosterPoolFormatError on an unsupported schema version, rather than silently degrading", () => {
    expect(() => deserializeRosterPoolFromJson(JSON.stringify({ version: 999, entries: [] }))).toThrow(RosterPoolFormatError);
  });

  it("filters out a malformed entry rather than throwing, when the rest of the file is otherwise valid", () => {
    const good: StoredRosterEntry = dehydrateRosterEntry(fakeEntry());
    const pool = { version: ROSTER_POOL_SCHEMA_VERSION, entries: [good, { garbage: true }], candyBySpeciesId: {}, savedAt: "x" };
    const result = deserializeRosterPoolFromJson(JSON.stringify(pool));
    expect(result.entries).toEqual([good]);
  });
});

describe("mergeRosterPools", () => {
  function poolOf(entries: StoredRosterEntry[], candyBySpeciesId: RosterPool["candyBySpeciesId"] = {}): RosterPool {
    return { version: ROSTER_POOL_SCHEMA_VERSION, entries, candyBySpeciesId, savedAt: new Date(0).toISOString() };
  }

  it("concatenates both pools' entries additively — never drops or overwrites an existing entry", () => {
    const current = poolOf([dehydrateRosterEntry(fakeEntry({ entryId: "a" }))]);
    const incoming = poolOf([dehydrateRosterEntry(fakeEntry({ entryId: "b" }))]);
    const merged = mergeRosterPools(current, incoming);
    expect(merged.entries.map((e) => e.entryId).sort()).toEqual(["a", "b"]);
  });

  it("re-keys a colliding entryId from the incoming pool rather than overwriting the current one", () => {
    const current = poolOf([dehydrateRosterEntry(fakeEntry({ entryId: "dup" }))]);
    const incoming = poolOf([dehydrateRosterEntry(fakeEntry({ entryId: "dup" }))]);
    const merged = mergeRosterPools(current, incoming);
    expect(merged.entries).toHaveLength(2);
    const ids = merged.entries.map((e) => e.entryId);
    expect(ids.filter((id) => id === "dup")).toHaveLength(1); // current's own id untouched
    expect(ids).toContain("dup-dup"); // incoming's re-keyed id
  });

  it("re-keys a SECOND collision with the same base id distinctly (loading the same code twice)", () => {
    const current = poolOf([dehydrateRosterEntry(fakeEntry({ entryId: "dup" })), dehydrateRosterEntry(fakeEntry({ entryId: "dup-dup" }))]);
    const incoming = poolOf([dehydrateRosterEntry(fakeEntry({ entryId: "dup" }))]);
    const merged = mergeRosterPools(current, incoming);
    const ids = merged.entries.map((e) => e.entryId);
    expect(new Set(ids).size).toBe(ids.length); // every id still unique
  });

  it("prefers current's own candyBySpeciesId entry on a key collision, and keeps an incoming-only key", () => {
    const current = poolOf([], { houndour: { candy: 5, xlCandy: 0 } });
    const incoming = poolOf([], { houndour: { candy: 999, xlCandy: 999 }, garchomp: { candy: 10, xlCandy: 2 } });
    const merged = mergeRosterPools(current, incoming);
    expect(merged.candyBySpeciesId.houndour).toEqual({ candy: 5, xlCandy: 0 });
    expect(merged.candyBySpeciesId.garchomp).toEqual({ candy: 10, xlCandy: 2 });
  });
});
