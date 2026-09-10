import { describe, expect, it } from "vitest";
import { resolveFormChangeMoveGrants } from "../formChangeMoveGrants.ts";
import type { GameMasterMoveRecord, GameMasterPokemonRecord } from "../rawShapes.ts";

/**
 * Minimal GameMasterPokemonRecord factory — every fixture below only fills in
 * the fields a given test actually exercises, mirroring the shape
 * fetchGameMasterData (../fetchCache.ts) really produces (formChange
 * defaults to `[]` via the caller passing it explicitly, since the field is
 * OPTIONAL on the real type — see rawShapes.ts's own doc comment for why).
 */
function record(overrides: Partial<GameMasterPokemonRecord> & Pick<GameMasterPokemonRecord, "pokemonId">): GameMasterPokemonRecord {
  return {
    baseAttack: 1,
    baseDefense: 1,
    baseStamina: 1,
    quickMoves: [],
    cinematicMoves: [],
    eliteQuickMoves: [],
    eliteCinematicMoves: [],
    tempEvoOverrides: [],
    evolutionBranch: [],
    ...overrides,
  };
}

function move(movementId: string): GameMasterMoveRecord {
  return { movementId, power: 100, energyDelta: -50, durationMs: 2000 };
}

describe("resolveFormChangeMoveGrants", () => {
  it("grants replacementMoves onto the TARGET form named by availableForm (the real new-information direction)", () => {
    // Mirrors Necrozma -> Necrozma (Dusk Mane): a FUSE entry with only
    // `replacementMoves` (no `existingMoves` key at all).
    const bare = record({
      pokemonId: "NECROZMA",
      cinematicMoves: ["DARK_PULSE", "FUTURESIGHT", "IRON_HEAD", "OUTRAGE"],
      formChange: [
        {
          availableForm: ["NECROZMA_DUSK_MANE"],
          cinematicMoves: [{ replacementMoves: ["SUNSTEEL_STRIKE"] }],
          quickMoves: [],
        },
      ],
    });
    const duskMane = record({
      pokemonId: "NECROZMA",
      form: "NECROZMA_DUSK_MANE",
      cinematicMoves: ["DARK_PULSE", "FUTURESIGHT", "IRON_HEAD", "OUTRAGE"],
    });
    const moves = [move("SUNSTEEL_STRIKE"), move("DARK_PULSE"), move("FUTURESIGHT"), move("IRON_HEAD"), move("OUTRAGE")];

    const { grants, unmatchedFormChangeTargets } = resolveFormChangeMoveGrants([bare, duskMane], moves);

    expect(duskMane.cinematicMoves).toContain("SUNSTEEL_STRIKE");
    // The declaring (bare) record's own moveset is untouched — no
    // `existingMoves` key was present on this entry at all.
    expect(bare.cinematicMoves).not.toContain("SUNSTEEL_STRIKE");
    expect(unmatchedFormChangeTargets).toEqual([]);
    expect(grants).toEqual([
      {
        pokemonId: "NECROZMA",
        form: "NECROZMA_DUSK_MANE",
        addedCinematicMoves: ["SUNSTEEL_STRIKE"],
        addedQuickMoves: [],
        skippedCinematicMoves: [],
        skippedQuickMoves: [],
      },
    ]);
  });

  it("resolves BOTH directions and they agree (Zacian-style): existingMoves onto the declaring form is a no-op because it's already there", () => {
    const hero = record({
      pokemonId: "ZACIAN",
      form: "ZACIAN_HERO",
      cinematicMoves: ["PLAY_ROUGH", "IRON_HEAD", "WILD_CHARGE", "CLOSE_COMBAT"],
      formChange: [
        {
          availableForm: ["ZACIAN_CROWNED_SWORD"],
          cinematicMoves: [{ existingMoves: ["IRON_HEAD"], replacementMoves: ["BEHEMOTH_BLADE"] }],
          quickMoves: [],
        },
      ],
    });
    const crownedSword = record({
      pokemonId: "ZACIAN",
      form: "ZACIAN_CROWNED_SWORD",
      cinematicMoves: ["PLAY_ROUGH", "CLOSE_COMBAT", "GIGA_IMPACT"],
      // The REVERSE-direction entry: Crowned Sword declaring back to Hero.
      // Its `existingMoves` independently asserts the SAME fact
      // ("Crowned Sword holds Behemoth Blade") from the other side.
      formChange: [
        {
          availableForm: ["ZACIAN_HERO"],
          cinematicMoves: [{ existingMoves: ["BEHEMOTH_BLADE"], replacementMoves: ["IRON_HEAD"] }],
          quickMoves: [],
        },
      ],
    });
    const moves = [move("IRON_HEAD"), move("BEHEMOTH_BLADE"), move("PLAY_ROUGH"), move("CLOSE_COMBAT"), move("GIGA_IMPACT"), move("WILD_CHARGE")];

    const { grants } = resolveFormChangeMoveGrants([hero, crownedSword], moves);

    expect(crownedSword.cinematicMoves).toEqual(["PLAY_ROUGH", "CLOSE_COMBAT", "GIGA_IMPACT", "BEHEMOTH_BLADE"]);
    // Hero's own moveset already had IRON_HEAD — both the forward
    // replacementMoves (onto Hero) and nothing else touches it.
    expect(hero.cinematicMoves).toEqual(["PLAY_ROUGH", "IRON_HEAD", "WILD_CHARGE", "CLOSE_COMBAT"]);
    // Exactly one report entry (for Crowned Sword) — Hero's own entry is a
    // pure no-op (IRON_HEAD already present) and never produces a report.
    expect(grants).toEqual([
      {
        pokemonId: "ZACIAN",
        form: "ZACIAN_CROWNED_SWORD",
        addedCinematicMoves: ["BEHEMOTH_BLADE"],
        addedQuickMoves: [],
        skippedCinematicMoves: [],
        skippedQuickMoves: [],
      },
    ]);
  });

  it("de-duplicates: multiple formChange entries independently asserting the SAME grant still add the move exactly once", () => {
    // Mirrors the real ZACIAN template's own formChange array, which
    // (confirmed 2026-09-10) carries two BYTE-IDENTICAL entries for the same
    // transition (a real GAME_MASTER data shape, not a fixture artifact).
    const bare = record({
      pokemonId: "ZAMAZENTA",
      cinematicMoves: ["MOONBLAST", "IRON_HEAD", "CRUNCH", "CLOSE_COMBAT"],
      formChange: [
        {
          availableForm: ["ZAMAZENTA_CROWNED_SHIELD"],
          cinematicMoves: [{ existingMoves: ["IRON_HEAD"], replacementMoves: ["BEHEMOTH_BASH"] }],
          quickMoves: [],
        },
        {
          availableForm: ["ZAMAZENTA_CROWNED_SHIELD"],
          cinematicMoves: [{ existingMoves: ["IRON_HEAD"], replacementMoves: ["BEHEMOTH_BASH"] }],
          quickMoves: [],
        },
      ],
    });
    const crownedShield = record({
      pokemonId: "ZAMAZENTA",
      form: "ZAMAZENTA_CROWNED_SHIELD",
      cinematicMoves: ["MOONBLAST", "CLOSE_COMBAT", "GIGA_IMPACT"],
    });
    const moves = [move("BEHEMOTH_BASH"), move("IRON_HEAD"), move("MOONBLAST"), move("CLOSE_COMBAT"), move("GIGA_IMPACT")];

    const { grants } = resolveFormChangeMoveGrants([bare, crownedShield], moves);

    expect(crownedShield.cinematicMoves.filter((m) => m === "BEHEMOTH_BASH")).toHaveLength(1);
    expect(grants).toEqual([
      {
        pokemonId: "ZAMAZENTA",
        form: "ZAMAZENTA_CROWNED_SHIELD",
        addedCinematicMoves: ["BEHEMOTH_BASH"],
        addedQuickMoves: [],
        skippedCinematicMoves: [],
        skippedQuickMoves: [],
      },
    ]);
  });

  it("treats a self-grant as a no-op when the move is already known via the ELITE array (Kyurem's own Glaciate)", () => {
    // Real shape: base Kyurem's `existingMoves: ["GLACIATE"]` self-grant is a
    // no-op not because this function special-cases Kyurem, but because
    // GLACIATE is already Kyurem's own ELITE charged move — the union check
    // must look at both arrays, not just the plain one.
    const kyurem = record({
      pokemonId: "KYUREM",
      cinematicMoves: ["DRAGON_CLAW", "BLIZZARD", "DRACO_METEOR"],
      eliteCinematicMoves: ["GLACIATE"],
      formChange: [
        {
          availableForm: ["KYUREM_BLACK"],
          cinematicMoves: [{ existingMoves: ["GLACIATE"], replacementMoves: ["FREEZE_SHOCK"] }],
          quickMoves: [],
        },
      ],
    });
    const black = record({
      pokemonId: "KYUREM",
      form: "KYUREM_BLACK",
      cinematicMoves: ["IRON_HEAD", "BLIZZARD", "STONE_EDGE", "OUTRAGE", "FUSION_BOLT"],
    });
    const moves = [move("GLACIATE"), move("FREEZE_SHOCK"), move("DRAGON_CLAW"), move("BLIZZARD"), move("DRACO_METEOR")];

    const { grants } = resolveFormChangeMoveGrants([kyurem, black], moves);

    // GLACIATE stays exactly where it was — elite, not duplicated into the plain array.
    expect(kyurem.cinematicMoves).not.toContain("GLACIATE");
    expect(kyurem.eliteCinematicMoves).toEqual(["GLACIATE"]);
    // The real new grant (Freeze Shock, onto Kyurem Black) still applies —
    // the no-op self-grant doesn't block the target grant.
    expect(black.cinematicMoves).toContain("FREEZE_SHOCK");
    expect(grants.map((g) => g.form)).toEqual(["KYUREM_BLACK"]);
  });

  it("skips cleanly and reports (never throws) when the granted move has no moveSettings template", () => {
    const bare = record({
      pokemonId: "TESTMON",
      formChange: [
        {
          availableForm: ["TESTMON_ALT"],
          cinematicMoves: [{ replacementMoves: ["NOT_A_REAL_MOVE"] }],
          quickMoves: [],
        },
      ],
    });
    const alt = record({ pokemonId: "TESTMON", form: "TESTMON_ALT" });

    expect(() => resolveFormChangeMoveGrants([bare, alt], [])).not.toThrow();
    const { grants } = resolveFormChangeMoveGrants([bare, alt], []);
    expect(alt.cinematicMoves).toEqual([]); // never added
    expect(grants).toEqual([
      {
        pokemonId: "TESTMON",
        form: "TESTMON_ALT",
        addedCinematicMoves: [],
        addedQuickMoves: [],
        skippedCinematicMoves: ["NOT_A_REAL_MOVE"],
        skippedQuickMoves: [],
      },
    ]);
  });

  it("skips cleanly and reports (never throws) when the named target form isn't in the roster this run", () => {
    const bare = record({
      pokemonId: "TESTMON",
      formChange: [
        {
          availableForm: ["TESTMON_UNRELEASED_FORM"],
          cinematicMoves: [{ replacementMoves: ["SOME_MOVE"] }],
          quickMoves: [],
        },
      ],
    });

    expect(() => resolveFormChangeMoveGrants([bare], [move("SOME_MOVE")])).not.toThrow();
    const { grants, unmatchedFormChangeTargets } = resolveFormChangeMoveGrants([bare], [move("SOME_MOVE")]);
    expect(grants).toEqual([]);
    expect(unmatchedFormChangeTargets).toEqual(["TESTMON_UNRELEASED_FORM"]);
  });

  it("routes a quickMoves group's grant onto the target's quickMoves array, not cinematicMoves", () => {
    // Structural coverage: no real formChange entry carries `quickMoves` as
    // of the 2026-09-10 audit, but the shape must still be handled correctly.
    const bare = record({
      pokemonId: "TESTMON",
      formChange: [
        {
          availableForm: ["TESTMON_ALT"],
          cinematicMoves: [],
          quickMoves: [{ replacementMoves: ["TACKLE_FAST"] }],
        },
      ],
    });
    const alt = record({ pokemonId: "TESTMON", form: "TESTMON_ALT" });

    const { grants } = resolveFormChangeMoveGrants([bare, alt], [move("TACKLE_FAST")]);

    expect(alt.quickMoves).toEqual(["TACKLE_FAST"]);
    expect(alt.cinematicMoves).toEqual([]);
    expect(grants).toEqual([
      {
        pokemonId: "TESTMON",
        form: "TESTMON_ALT",
        addedCinematicMoves: [],
        addedQuickMoves: ["TACKLE_FAST"],
        skippedCinematicMoves: [],
        skippedQuickMoves: [],
      },
    ]);
  });

  it("returns empty results and mutates nothing for records with no formChange at all", () => {
    const plain = record({ pokemonId: "BULBASAUR", cinematicMoves: ["SLUDGE_BOMB"] });
    const { grants, unmatchedFormChangeTargets } = resolveFormChangeMoveGrants([plain], [move("SLUDGE_BOMB")]);
    expect(grants).toEqual([]);
    expect(unmatchedFormChangeTargets).toEqual([]);
    expect(plain.cinematicMoves).toEqual(["SLUDGE_BOMB"]);
  });
});
