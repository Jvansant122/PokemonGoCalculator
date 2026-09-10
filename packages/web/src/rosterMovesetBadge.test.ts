import { describe, expect, it } from "vitest";
import { movesetDefaultBadge, type MovesetDefaultBadgeSource } from "./rosterMovesetBadge.js";

const FAST_MOVES = [
  { id: "AIR_SLASH_FAST", name: "Air Slash" },
  { id: "DRAGON_TAIL_FAST", name: "Dragon Tail" },
];
const CHARGED_MOVES = [
  { id: "OUTRAGE", name: "Outrage" },
  { id: "AERIAL_ACE", name: "Aerial Ace" },
];

function baseEntry(overrides: Partial<MovesetDefaultBadgeSource> = {}): MovesetDefaultBadgeSource {
  return {
    fastMoveId: "AIR_SLASH_FAST",
    chargedMoveId: "OUTRAGE",
    fastMoveIsDefaulted: false,
    chargedMoveIsDefaulted: false,
    fastMoveUnmatchedName: null,
    chargedMoveUnmatchedName: null,
    species: { fastMoves: FAST_MOVES, chargedMoves: CHARGED_MOVES },
    ...overrides,
  };
}

describe("movesetDefaultBadge", () => {
  it("returns null when neither move was defaulted — the common case, no badge", () => {
    expect(movesetDefaultBadge(baseEntry())).toBeNull();
  });

  it('labels a fully-guessed, fully-BLANK moveset "default moveset" — reusing RosterImportPanel.tsx\'s exact existing wording', () => {
    const badge = movesetDefaultBadge(
      baseEntry({ fastMoveIsDefaulted: true, chargedMoveIsDefaulted: true }),
    );
    expect(badge).not.toBeNull();
    expect(badge!.label).toBe("default moveset");
    expect(badge!.title).toContain("Fast move was blank in the import — assumed Air Slash.");
    expect(badge!.title).toContain("Charged move was blank in the import — assumed Outrage.");
  });

  it('labels a fully-guessed moveset with at least one UNRECOGNIZED name "moveset not recognized" — deliberately more alarming wording than a blank default', () => {
    const badge = movesetDefaultBadge(
      baseEntry({
        fastMoveIsDefaulted: true,
        chargedMoveIsDefaulted: true,
        fastMoveUnmatchedName: "Zen Headbutt",
        chargedMoveUnmatchedName: "Return",
      }),
    );
    expect(badge!.label).toBe("moveset not recognized");
    expect(badge!.title).toContain('Fast move "Zen Headbutt" wasn\'t recognized — assumed Air Slash.');
    expect(badge!.title).toContain('Charged move "Return" wasn\'t recognized — assumed Outrage.');
  });

  it('labels a MIXED fully-guessed moveset (one blank, one unrecognized) "moveset not recognized" — still both guessed, but the unrecognized half deserves the more alarmed label', () => {
    const badge = movesetDefaultBadge(
      baseEntry({ fastMoveIsDefaulted: true, chargedMoveIsDefaulted: true, chargedMoveUnmatchedName: "Return" }),
    );
    expect(badge!.label).toBe("moveset not recognized");
    expect(badge!.title).toContain("Fast move was blank in the import — assumed Air Slash.");
    expect(badge!.title).toContain('Charged move "Return" wasn\'t recognized — assumed Outrage.');
  });

  it('names WHICH move when only the fast move was guessed (blank) — never the overstated whole-moveset "default moveset"', () => {
    const badge = movesetDefaultBadge(baseEntry({ fastMoveIsDefaulted: true }));
    expect(badge!.label).toBe("default fast move");
    expect(badge!.title).toBe("Fast move was blank in the import — assumed Air Slash.");
  });

  it("names the fast move specifically as unrecognized, not just defaulted, when a name was present but didn't match", () => {
    const badge = movesetDefaultBadge(baseEntry({ fastMoveIsDefaulted: true, fastMoveUnmatchedName: "Zen Headbutt" }));
    expect(badge!.label).toBe("fast move not recognized");
    expect(badge!.title).toBe('Fast move "Zen Headbutt" wasn\'t recognized — assumed Air Slash.');
  });

  it('names WHICH move when only the charged move was guessed (blank) — the real Palkia/Dialga shape in the committed sample CSV', () => {
    const badge = movesetDefaultBadge(baseEntry({ chargedMoveIsDefaulted: true }));
    expect(badge!.label).toBe("default charged move");
    expect(badge!.title).toBe("Charged move was blank in the import — assumed Outrage.");
  });

  it('names the charged move specifically as unrecognized — the real Raticate (Alola) "Return" shape in the committed sample CSV', () => {
    const badge = movesetDefaultBadge(baseEntry({ chargedMoveIsDefaulted: true, chargedMoveUnmatchedName: "Return" }));
    expect(badge!.label).toBe("charged move not recognized");
    expect(badge!.title).toBe('Charged move "Return" wasn\'t recognized — assumed Outrage.');
  });

  it('falls back to "its first available move" in the tooltip if the resolved move id somehow isn\'t in this species\' own list (defensive — should not happen in real data)', () => {
    const badge = movesetDefaultBadge(baseEntry({ fastMoveIsDefaulted: true, fastMoveId: "SOME_OTHER_ID" }));
    expect(badge!.title).toBe("Fast move was blank in the import — assumed its first available move.");
  });
});
