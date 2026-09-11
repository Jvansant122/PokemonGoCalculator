import { describe, expect, it } from "vitest";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";
import type { RosterEntry } from "./import/pokeGenieMatch.js";
import { dehydrateRosterEntry, ROSTER_POOL_SCHEMA_VERSION, RosterPoolFormatError, type RosterPool } from "./rosterPool.js";
import { decodeRosterSaveCode, encodeRosterSaveCode, ROSTER_SAVE_CODE_VERSION } from "./rosterSaveCode.js";

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

function fakeEntry(entryId: string, speciesId: string): RosterEntry {
  return {
    entryId,
    species: fakeSpecies(speciesId),
    fastMoveId: "TACKLE",
    chargedMoveId: "BODY_SLAM",
    level: 20,
    ivs: { attack: 15, defense: 15, stamina: 15 },
    costModifiers: { isShadow: false, isPurified: false, isLucky: false },
    canMega: false,
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

function poolWith(count: number): RosterPool {
  const entries = Array.from({ length: count }, (_, i) => dehydrateRosterEntry(fakeEntry(`e${i}`, `species-${i}`)));
  return { version: ROSTER_POOL_SCHEMA_VERSION, entries, candyBySpeciesId: {}, savedAt: new Date(0).toISOString() };
}

describe("encodeRosterSaveCode / decodeRosterSaveCode", () => {
  it("round-trips a pool losslessly", async () => {
    const pool = poolWith(5);
    const code = await encodeRosterSaveCode(pool);
    expect(code.startsWith(`pogo-roster-v${ROSTER_SAVE_CODE_VERSION}:`)).toBe(true);
    const { pool: decoded, entryCount } = await decodeRosterSaveCode(code);
    expect(entryCount).toBe(5);
    expect(decoded.entries).toEqual(pool.entries);
  });

  it("round-trips an EMPTY pool without error", async () => {
    const code = await encodeRosterSaveCode(poolWith(0));
    const { entryCount } = await decodeRosterSaveCode(code);
    expect(entryCount).toBe(0);
  });

  it("actually compresses a realistic roster (fewer code characters than raw JSON bytes)", async () => {
    const pool = poolWith(150);
    const rawJsonBytes = new TextEncoder().encode(JSON.stringify(pool)).length;
    const code = await encodeRosterSaveCode(pool);
    expect(code.length).toBeLessThan(rawJsonBytes);
  });

  it("throws RosterPoolFormatError with a legible message on a missing/garbled version prefix", async () => {
    await expect(decodeRosterSaveCode("not-a-real-code")).rejects.toThrow(RosterPoolFormatError);
    await expect(decodeRosterSaveCode("not-a-real-code")).rejects.toThrow(/doesn't look like a roster save code/);
  });

  it("throws RosterPoolFormatError on an unsupported (future) version, naming both versions", async () => {
    await expect(decodeRosterSaveCode("pogo-roster-v999:AAAA")).rejects.toThrow(RosterPoolFormatError);
    await expect(decodeRosterSaveCode("pogo-roster-v999:AAAA")).rejects.toThrow(/version 999/);
  });

  it("throws RosterPoolFormatError (never crashes) on a truncated/edited payload", async () => {
    const code = await encodeRosterSaveCode(poolWith(5));
    const truncated = code.slice(0, Math.floor(code.length * 0.6));
    await expect(decodeRosterSaveCode(truncated)).rejects.toThrow(RosterPoolFormatError);
  });

  it("throws RosterPoolFormatError on an empty payload after a valid version prefix", async () => {
    await expect(decodeRosterSaveCode(`pogo-roster-v${ROSTER_SAVE_CODE_VERSION}:`)).rejects.toThrow(RosterPoolFormatError);
  });

  it("tolerates surrounding whitespace from a copy-paste", async () => {
    const code = await encodeRosterSaveCode(poolWith(2));
    const { entryCount } = await decodeRosterSaveCode(`  ${code}\n`);
    expect(entryCount).toBe(2);
  });
});
