import { describe, expect, it } from "vitest";
import { displacedSlotNote } from "./rosterDisplacedSlotNote.js";

describe("displacedSlotNote", () => {
  it("returns null for a FIELDED row — nobody is displaced when the entry is already on the team", () => {
    expect(displacedSlotNote(true, null, false, undefined)).toBeNull();
  });

  it("returns null when displacedEntryId is null even if fielded were somehow false (defensive)", () => {
    expect(displacedSlotNote(false, null, false, "Snorlax")).toBeNull();
  });

  it("labels an ORDINARY benched swap as a plain 'replaces <name>' caption, not a warning", () => {
    const note = displacedSlotNote(false, "entry-1", false, "Snorlax");
    expect(note).not.toBeNull();
    expect(note!.isMegaConflict).toBe(false);
    expect(note!.label).toBe("replaces Snorlax");
    expect(note!.title).toContain("weakest fielded member, Snorlax");
  });

  it("labels the MEGA-CONFLICT case distinctly — names the higher bar and warns against comparing it like an ordinary benched row", () => {
    const note = displacedSlotNote(false, "entry-mega", true, "Mega Blaziken");
    expect(note).not.toBeNull();
    expect(note!.isMegaConflict).toBe(true);
    expect(note!.label).toBe("vs. your CURRENT mega (Mega Blaziken)");
    expect(note!.title).toContain("only one Pokémon can be Mega Evolved");
    expect(note!.title).toContain("NOT that it's weak overall");
  });

  it("falls back to a generic name when the caller's entryId -> name join can't resolve it (defensive — should not happen with a consistent pool)", () => {
    const note = displacedSlotNote(false, "entry-unknown", true, undefined);
    expect(note!.label).toBe("vs. your CURRENT mega (an unidentified fielded team member)");
  });
});
