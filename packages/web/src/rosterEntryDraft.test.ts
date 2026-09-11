import { describe, expect, it } from "vitest";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";
import {
  draftToRosterEntry,
  emptyRosterEntryDraft,
  newHandEntryId,
  normalizeRosterEntryDraft,
  rosterEntryToDraft,
} from "./rosterEntryDraft.js";

function fakeSpecies(overrides: Partial<SpeciesDefinition> = {}): SpeciesDefinition {
  return {
    id: "houndour",
    name: "Houndour",
    types: ["dark", "fire"],
    baseAttack: 100,
    baseDefense: 90,
    baseStamina: 120,
    fastMoves: [{ id: "EMBER", name: "Ember", type: "fire", power: 10, energyGain: 10, durationSeconds: 0.6 }],
    chargedMoves: [{ id: "FLAMETHROWER", name: "Flamethrower", type: "fire", power: 70, energyCost: 50, durationSeconds: 2.6, vulnerableWindowSeconds: 2.6 }],
    ...overrides,
  };
}

function fakeMegaSpecies(): SpeciesDefinition {
  return fakeSpecies({ id: "houndoom-mega", name: "Mega Houndoom", boost: { multiplier: 1.3, boostedType: "fire", persistsThroughFaint: false } });
}

describe("draftToRosterEntry", () => {
  it("never carries the default-moveset/approximate badges a hand-entered Pokémon didn't earn", () => {
    const species = fakeSpecies();
    const draft = { ...emptyRosterEntryDraft(), speciesId: species.id };
    const entry = draftToRosterEntry(draft, species, "manual-1");
    expect(entry.movesetIsDefaulted).toBe(false);
    expect(entry.fastMoveIsDefaulted).toBe(false);
    expect(entry.chargedMoveIsDefaulted).toBe(false);
    expect(entry.fastMoveUnmatchedName).toBeNull();
    expect(entry.chargedMoveUnmatchedName).toBeNull();
    expect(entry.ivsAreApproximate).toBe(false);
    expect(entry.levelIsApproximate).toBe(false);
    expect(entry.unmatchedMoveNames).toEqual([]);
  });

  it("resolves a null fastMoveId/chargedMoveId to the species' own first move id", () => {
    const species = fakeSpecies();
    const draft = { ...emptyRosterEntryDraft(), speciesId: species.id, fastMoveId: null, chargedMoveId: null };
    const entry = draftToRosterEntry(draft, species, "manual-1");
    expect(entry.fastMoveId).toBe("EMBER");
    expect(entry.chargedMoveId).toBe("FLAMETHROWER");
  });

  it("carries the level/IVs/cost-modifier fields straight through", () => {
    const species = fakeSpecies();
    const draft = {
      ...emptyRosterEntryDraft(),
      speciesId: species.id,
      level: 32.5,
      ivAttack: 1,
      ivDefense: 2,
      ivStamina: 3,
      isPurified: true,
      isLucky: true,
    };
    const entry = draftToRosterEntry(draft, species, "manual-1");
    expect(entry.level).toBe(32.5);
    expect(entry.ivs).toEqual({ attack: 1, defense: 2, stamina: 3 });
    expect(entry.costModifiers).toEqual({ isShadow: false, isPurified: true, isLucky: true });
  });

  it("forces canMega false when the species has no boost mechanic, even if the draft requested it", () => {
    const species = fakeSpecies();
    const draft = { ...emptyRosterEntryDraft(), speciesId: species.id, canMega: true };
    const entry = draftToRosterEntry(draft, species, "manual-1");
    expect(entry.canMega).toBe(false);
  });

  it("allows canMega true for a species that genuinely has a boost mechanic", () => {
    const species = fakeMegaSpecies();
    const draft = { ...emptyRosterEntryDraft(), speciesId: species.id, canMega: true };
    const entry = draftToRosterEntry(draft, species, "manual-1");
    expect(entry.canMega).toBe(true);
  });
});

describe("normalizeRosterEntryDraft", () => {
  it("forces isShadow/canMega off for a species with a boost mechanic", () => {
    const species = fakeMegaSpecies();
    const draft = { ...emptyRosterEntryDraft(), speciesId: species.id, isShadow: true, canMega: true };
    const normalized = normalizeRosterEntryDraft(draft, species);
    expect(normalized.isShadow).toBe(false);
    expect(normalized.canMega).toBe(true); // canMega itself is legitimate for a boost species
  });

  it("forces isPurified off whenever the effective Shadow state is on", () => {
    const species = fakeSpecies();
    const draft = { ...emptyRosterEntryDraft(), speciesId: species.id, isShadow: true, isPurified: true };
    const normalized = normalizeRosterEntryDraft(draft, species);
    expect(normalized.isPurified).toBe(false);
  });

  it("returns the same reference when nothing needs to change (cheap no-op guard)", () => {
    const species = fakeSpecies();
    const draft = { ...emptyRosterEntryDraft(), speciesId: species.id };
    expect(normalizeRosterEntryDraft(draft, species)).toBe(draft);
  });

  it("is a no-op when species is null (nothing resolved yet)", () => {
    const draft = emptyRosterEntryDraft();
    expect(normalizeRosterEntryDraft(draft, null)).toBe(draft);
  });
});

describe("rosterEntryToDraft / draftToRosterEntry round trip", () => {
  it("round-trips an entry's own editable fields through draft form", () => {
    const species = fakeSpecies();
    const original = draftToRosterEntry(
      { ...emptyRosterEntryDraft(), speciesId: species.id, level: 25, ivAttack: 4, ivDefense: 5, ivStamina: 6, isLucky: true },
      species,
      "existing-id",
    );
    const draft = rosterEntryToDraft(original);
    const rebuilt = draftToRosterEntry(draft, species, original.entryId);
    expect(rebuilt).toEqual(original);
  });
});

describe("newHandEntryId", () => {
  it("always starts with the manual- prefix and never collides across calls", () => {
    const ids = Array.from({ length: 20 }, () => newHandEntryId());
    for (const id of ids) expect(id.startsWith("manual-")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
