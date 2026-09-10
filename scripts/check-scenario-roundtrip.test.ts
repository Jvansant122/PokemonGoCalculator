import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS module (this checker runs under `node`, not tsx, so it can't use `.ts` imports); typecheck:scripts has no allowJs, so importing it from a .test.ts has no ambient types. The functions below are exercised at runtime, which is what this test actually needs.
import { checkRoundTrip, collectFields } from "./check-scenario-roundtrip.mjs";

describe("check-scenario-roundtrip: array-element recursion", () => {
  const interfaceSource = `
export interface SlotAssumption {
  speciesId: string | null;
  level: number;
  isMega: boolean;
}

export interface RosterAssumptions {
  slots: SlotAssumption[];
  targetId: string;
  tags: string[];
}
`;

  it("flattens a Foo[]-shaped member into its own checkable fields, labelled arrayField[].nestedField", () => {
    const fields = collectFields(interfaceSource.split("\n"), "RosterAssumptions");
    expect(fields).not.toBeNull();
    const labels = (fields as { label: string }[]).map((f) => f.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "slots",
        "slots[].speciesId",
        "slots[].level",
        "slots[].isMega",
        "targetId",
        "tags",
      ]),
    );
    // A plain `string[]` member (lowercase element type) must NOT be recursed into —
    // there is no `interface string { ... }` to find, and it should stay one opaque field.
    expect(labels).not.toContain("tags[]");
  });

  it("does not recurse into a plain (non-array) nested object field — the array-element case is the only one that actually decomposes a field back apart per-element", () => {
    const source = `
export interface IvSpread {
  attack: number;
  defense: number;
}

export interface Assumptions {
  ivA: IvSpread;
  targetId: string;
}
`;
    const fields = collectFields(source.split("\n"), "Assumptions") as { label: string }[];
    const labels = fields.map((f) => f.label);
    expect(labels).toEqual(["ivA", "targetId"]);
  });

  it("catches a per-slot field that was mapped in one round-trip direction but forgotten in the other -- the exact historical bug class this checker exists for, previously invisible for anything nested inside an array element", () => {
    // Mirrors the real shape of TeamSlotAssumption/PowerUpSlotAssumption: a
    // `slots: SlotAssumption[]` member whose per-slot `level` field is
    // deliberately dropped from `toText` (as if someone added a new per-slot
    // field to the Assumptions interface and the slot-mapping array literal
    // in assumptionsToScenario, but forgot it in scenarioToAssumptions).
    const toText = `
function assumptionsToScenario(a) {
  return {
    slots: a.slots.map((s) => ({ speciesId: s.speciesId, level: s.level, isMega: s.isMega })),
    targetId: a.targetId,
    tags: a.tags,
  };
}
`;
    const fromText = `
function scenarioToAssumptions(s) {
  const slots = s.slots.map((slot) => ({ speciesId: slot.speciesId ?? null, isMega: slot.isMega ?? false }));
  return { slots, targetId: s.targetId, tags: s.tags ?? [] };
}
`;
    const result = checkRoundTrip({ interfaceSource, interfaceName: "RosterAssumptions", toText, fromText });
    expect(result.error).toBeUndefined();
    expect(result.missingTo).toEqual([]);
    expect(result.missingFrom).toEqual(["slots[].level"]);
  });

  it("passes clean when every nested per-slot field round-trips in both directions", () => {
    const toText = `
function assumptionsToScenario(a) {
  return {
    slots: a.slots.map((s) => ({ speciesId: s.speciesId, level: s.level, isMega: s.isMega })),
    targetId: a.targetId,
    tags: a.tags,
  };
}
`;
    const fromText = `
function scenarioToAssumptions(s) {
  const slots = s.slots.map((slot) => ({ speciesId: slot.speciesId ?? null, level: slot.level ?? 1, isMega: slot.isMega ?? false }));
  return { slots, targetId: s.targetId, tags: s.tags ?? [] };
}
`;
    const result = checkRoundTrip({ interfaceSource, interfaceName: "RosterAssumptions", toText, fromText });
    expect(result.missingTo).toEqual([]);
    expect(result.missingFrom).toEqual([]);
    expect((result.fields as { label: string }[]).length).toBe(6); // slots, slots[].speciesId, slots[].level, slots[].isMega, targetId, tags
  });

  it("guards against a self-referential array-element type cycling forever", () => {
    const source = `
export interface Node {
  id: string;
  children: Node[];
}
`;
    const fields = collectFields(source.split("\n"), "Node") as { label: string }[];
    const labels = fields.map((f) => f.label);
    // Terminates and still reports the first level's own fields.
    expect(labels).toContain("id");
    expect(labels).toContain("children");
  });

  it("survives CRLF line endings (a real file in this repo, PowerUpOptimizerAssumptionPanel.tsx, is saved with \\r\\n)", () => {
    const crlfSource = interfaceSource.replace(/\n/g, "\r\n");
    const fields = collectFields(crlfSource.split("\n"), "RosterAssumptions");
    expect(fields).not.toBeNull();
    const labels = (fields as { label: string }[]).map((f) => f.label);
    expect(labels).toEqual(
      expect.arrayContaining(["slots[].speciesId", "slots[].level", "slots[].isMega"]),
    );
  });
});
