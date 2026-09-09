import { describe, expect, it } from "vitest";
import {
  underscoreEnumFor,
  strippedEnumFor,
  resolvePokemonEnum,
  resolveGameMasterPokemonRecord,
  pokemonClassToRarity,
  displayNameForMovementId,
  guessMovementIdForDisplayName,
  resolveMegaFromGameMaster,
  isFullyEvolved,
  realEvolutionTargets,
  POKEMON_ENUM_OVERRIDES,
} from "../gameMasterMatching.ts";
import type { GameMasterPokemonRecord } from "../rawShapes.ts";

describe("underscoreEnumFor", () => {
  it("uppercases and collapses punctuation runs to a single underscore", () => {
    expect(underscoreEnumFor("Ho-Oh")).toBe("HO_OH");
    expect(underscoreEnumFor("Mr. Mime")).toBe("MR_MIME");
    expect(underscoreEnumFor("Tapu Koko")).toBe("TAPU_KOKO");
  });

  it("trims leading/trailing underscores", () => {
    expect(underscoreEnumFor("Nidoran♀")).toBe("NIDORAN");
  });
});

describe("strippedEnumFor", () => {
  it("uppercases and drops punctuation entirely with no separator", () => {
    expect(strippedEnumFor("Great Tusk")).toBe("GREATTUSK");
    expect(strippedEnumFor("Farfetch'd")).toBe("FARFETCHD");
    expect(strippedEnumFor("Wo-Chien")).toBe("WOCHIEN");
  });
});

describe("resolvePokemonEnum", () => {
  it("uses the hand-authored override for Nidoran genders regardless of the known-enum set", () => {
    expect(resolvePokemonEnum(29, "Nidoran♀", new Set())).toBe("NIDORAN_FEMALE");
    expect(resolvePokemonEnum(32, "Nidoran♂", new Set())).toBe("NIDORAN_MALE");
  });

  it("resolves via the underscore transform when it matches the known-enum set", () => {
    const known = new Set(["TAPU_KOKO"]);
    expect(resolvePokemonEnum(785, "Tapu Koko", known)).toBe("TAPU_KOKO");
  });

  it("falls back to the stripped transform when the underscored form isn't known", () => {
    const known = new Set(["GREATTUSK"]);
    expect(resolvePokemonEnum(984, "Great Tusk", known)).toBe("GREATTUSK");
  });

  it("returns null when neither transform matches the known-enum set", () => {
    expect(resolvePokemonEnum(1, "Bulbasaur", new Set(["SOMETHING_ELSE"]))).toBeNull();
  });

  it("has exactly the two documented Nidoran overrides", () => {
    expect(POKEMON_ENUM_OVERRIDES).toEqual({ 29: "NIDORAN_FEMALE", 32: "NIDORAN_MALE" });
  });
});

describe("resolveGameMasterPokemonRecord", () => {
  const bare: GameMasterPokemonRecord = {
    pokemonId: "DUGTRIO",
    baseAttack: 1,
    baseDefense: 1,
    baseStamina: 1,
    quickMoves: [],
    cinematicMoves: [],
    eliteQuickMoves: [],
    eliteCinematicMoves: [],
    tempEvoOverrides: [],
    evolutionBranch: [],
  };
  const normalSuffixed: GameMasterPokemonRecord = { ...bare, form: "DUGTRIO_NORMAL", baseAttack: 2 };
  const exactForm: GameMasterPokemonRecord = { ...bare, form: "DUGTRIO_ALOLA", baseAttack: 3 };

  it("prefers an exact form-key match", () => {
    const result = resolveGameMasterPokemonRecord([bare, normalSuffixed, exactForm], "DUGTRIO", "Alola");
    expect(result).toBe(exactForm);
  });

  it("falls back to the _NORMAL-suffixed template when no exact form matches", () => {
    const result = resolveGameMasterPokemonRecord([bare, normalSuffixed], "DUGTRIO", "Normal");
    expect(result).toBe(normalSuffixed);
  });

  it("falls back to the bare/no-suffix template as a last resort", () => {
    const result = resolveGameMasterPokemonRecord([bare], "DUGTRIO", "Galarian");
    expect(result).toBe(bare);
  });

  it("returns null when no candidate matches any of the three tiers", () => {
    expect(resolveGameMasterPokemonRecord([exactForm], "DUGTRIO", "Galarian")).toBeNull();
  });
});

describe("pokemonClassToRarity", () => {
  it("treats an absent pokemonClass as STANDARD", () => {
    expect(pokemonClassToRarity(undefined)).toBe("STANDARD");
  });

  it("maps each known GAME_MASTER class to its rarity", () => {
    expect(pokemonClassToRarity("POKEMON_CLASS_LEGENDARY")).toBe("LEGENDARY");
    expect(pokemonClassToRarity("POKEMON_CLASS_MYTHIC")).toBe("MYTHIC");
    expect(pokemonClassToRarity("POKEMON_CLASS_ULTRA_BEAST")).toBe("ULTRA_BEAST");
  });

  it("throws on an unrecognized non-empty pokemonClass rather than silently misclassifying", () => {
    expect(() => pokemonClassToRarity("POKEMON_CLASS_SOMETHING_NEW")).toThrow();
  });
});

describe("displayNameForMovementId / guessMovementIdForDisplayName (inverse round-trip)", () => {
  it("converts a fast-move movementId to its display name and back", () => {
    expect(displayNameForMovementId("PSYCHO_CUT_FAST", true)).toBe("Psycho Cut");
    expect(guessMovementIdForDisplayName("Psycho Cut", true)).toBe("PSYCHO_CUT_FAST");
  });

  it("converts a charged-move movementId to its display name and back", () => {
    expect(displayNameForMovementId("DRAGON_CLAW", false)).toBe("Dragon Claw");
    expect(guessMovementIdForDisplayName("Dragon Claw", false)).toBe("DRAGON_CLAW");
  });

  it("handles a single-word move name", () => {
    expect(displayNameForMovementId("TACKLE_FAST", true)).toBe("Tackle");
    expect(guessMovementIdForDisplayName("Tackle", true)).toBe("TACKLE_FAST");
  });
});

describe("resolveMegaFromGameMaster", () => {
  const aggronBase: GameMasterPokemonRecord = {
    pokemonId: "AGGRON",
    type: "POKEMON_TYPE_STEEL",
    type2: "POKEMON_TYPE_ROCK",
    baseAttack: 198,
    baseDefense: 205,
    baseStamina: 172,
    quickMoves: [],
    cinematicMoves: [],
    eliteQuickMoves: [],
    eliteCinematicMoves: [],
    tempEvoOverrides: [
      {
        tempEvoId: "TEMP_EVOLUTION_MEGA",
        baseAttack: 288,
        baseDefense: 314,
        baseStamina: 172,
        typeOverride1: "POKEMON_TYPE_STEEL",
        hasTypeOverride: true,
      },
    ],
    evolutionBranch: [],
  };

  it("returns null when no candidate carries the requested tempEvoId", () => {
    expect(resolveMegaFromGameMaster([aggronBase], "TEMP_EVOLUTION_PRIMAL")).toBeNull();
  });

  it("does NOT fall back to the base species' type2 when hasTypeOverride drops to a single type", () => {
    // Mega Aggron: base Steel/Rock -> mega is pure Steel. A naive fallback to
    // record.type2 would wrongly keep Rock.
    const result = resolveMegaFromGameMaster([aggronBase], "TEMP_EVOLUTION_MEGA");
    expect(result).not.toBeNull();
    expect(result!.types).toEqual(["POKEMON_TYPE_STEEL"]);
    expect(result!.baseAttack).toBe(288);
    expect(result!.baseDefense).toBe(314);
    expect(result!.ambiguous).toBe(false);
  });

  it("falls back to the base species' type/type2 when hasTypeOverride is false", () => {
    const noTypeOverride: GameMasterPokemonRecord = {
      ...aggronBase,
      tempEvoOverrides: [
        { tempEvoId: "TEMP_EVOLUTION_MEGA", baseAttack: 288, baseDefense: 314, baseStamina: 172, hasTypeOverride: false },
      ],
    };
    const result = resolveMegaFromGameMaster([noTypeOverride], "TEMP_EVOLUTION_MEGA");
    expect(result!.types).toEqual(["POKEMON_TYPE_STEEL", "POKEMON_TYPE_ROCK"]);
  });

  it("flags ambiguous:true when two candidates carry conflicting override blocks for the same tempEvoId", () => {
    const conflicting: GameMasterPokemonRecord = {
      ...aggronBase,
      tempEvoOverrides: [
        { tempEvoId: "TEMP_EVOLUTION_MEGA", baseAttack: 999, baseDefense: 314, baseStamina: 172, hasTypeOverride: false },
      ],
    };
    const result = resolveMegaFromGameMaster([aggronBase, conflicting], "TEMP_EVOLUTION_MEGA");
    expect(result!.ambiguous).toBe(true);
  });
});

describe("isFullyEvolved / realEvolutionTargets", () => {
  /**
   * Minimal helper mirroring GAME_MASTER's real bare+`_NORMAL`-template
   * pattern (see fetchGameMasterData's doc comment) — every species below is
   * built from a base record plus one `_NORMAL`-suffixed sibling carrying
   * byte-identical evolutionBranch content, exactly as confirmed by direct
   * inspection of the live 2026-09-08 dump.
   */
  function recordPair(pokemonId: string, evolutionBranch: GameMasterPokemonRecord["evolutionBranch"]): GameMasterPokemonRecord[] {
    const base: GameMasterPokemonRecord = {
      pokemonId,
      baseAttack: 1,
      baseDefense: 1,
      baseStamina: 1,
      quickMoves: [],
      cinematicMoves: [],
      eliteQuickMoves: [],
      eliteCinematicMoves: [],
      tempEvoOverrides: [],
      evolutionBranch,
    };
    return [base, { ...base, form: `${pokemonId}_NORMAL` }];
  }

  // Real evolutionBranch content per species, confirmed 2026-09-08 by direct
  // inspection of the live GAME_MASTER dump (see this project's Phase 0 audit
  // notes) — GameMasterPokemonRecord.evolutionBranch is already filtered to
  // REAL (non-mega/primal) entries only, matching what fetchGameMasterData
  // actually produces.
  const FULLY_EVOLVED_CASES: [string, GameMasterPokemonRecord["evolutionBranch"]][] = [
    // Charizard/Venusaur/Blastoise/Beedrill/Metagross: THE TRAP — each has a
    // real (non-empty, pre-filter) evolutionBranch in GAME_MASTER, but every
    // entry in it is a temporaryEvolution (mega) branch, so the FILTERED
    // evolutionBranch this project actually stores is empty.
    ["CHARIZARD", []],
    ["VENUSAUR", []],
    ["BLASTOISE", []],
    ["BEEDRILL", []],
    ["METAGROSS", []],
  ];
  const NOT_FULLY_EVOLVED_CASES: [string, GameMasterPokemonRecord["evolutionBranch"]][] = [
    ["BELDUM", [{ evolution: "METANG", form: "METANG_NORMAL", candyCost: 25, candyCostPurified: 22 }]],
    ["METANG", [{ evolution: "METAGROSS", form: "METAGROSS_NORMAL", candyCost: 100, candyCostPurified: 90 }]],
    ["HOUNDOUR", [{ evolution: "HOUNDOOM", form: "HOUNDOOM_NORMAL", candyCost: 50, candyCostPurified: 45 }]],
    ["INKAY", [{ evolution: "MALAMAR", form: "MALAMAR_NORMAL", candyCost: 50, candyCostPurified: 45 }]],
    // Totodile -> Croconaw carries no `form` field in the real dump.
    ["TOTODILE", [{ evolution: "CROCONAW", candyCost: 25, candyCostPurified: 22 }]],
  ];

  it.each(FULLY_EVOLVED_CASES)("treats %s as fully evolved (mega-only branch doesn't count)", (pokemonId, evolutionBranch) => {
    expect(isFullyEvolved(recordPair(pokemonId, evolutionBranch))).toBe(true);
  });

  it.each(NOT_FULLY_EVOLVED_CASES)("treats %s as NOT fully evolved (has a real evolution branch)", (pokemonId, evolutionBranch) => {
    expect(isFullyEvolved(recordPair(pokemonId, evolutionBranch))).toBe(false);
  });

  it("treats a species with zero templates at all as fully evolved (vacuous — no branch was ever found)", () => {
    expect(isFullyEvolved([])).toBe(true);
  });

  it("realEvolutionTargets resolves Beldum's own matched template to Metang, with candy costs carried through", () => {
    const [, normalForm] = recordPair("BELDUM", [{ evolution: "METANG", form: "METANG_NORMAL", candyCost: 25, candyCostPurified: 22 }]);
    expect(realEvolutionTargets(normalForm!)).toEqual([
      { evolutionEnum: "METANG", form: "METANG_NORMAL", candyCost: 25, candyCostPurified: 22 },
    ]);
  });

  it("realEvolutionTargets returns [] for a record whose own evolutionBranch is empty (e.g. Metagross's matched template)", () => {
    const [, normalForm] = recordPair("METAGROSS", []);
    expect(realEvolutionTargets(normalForm!)).toEqual([]);
  });

  it("realEvolutionTargets dedupes identical evolution+form pairs", () => {
    const record: GameMasterPokemonRecord = {
      pokemonId: "EEVEE",
      baseAttack: 1,
      baseDefense: 1,
      baseStamina: 1,
      quickMoves: [],
      cinematicMoves: [],
      eliteQuickMoves: [],
      eliteCinematicMoves: [],
      tempEvoOverrides: [],
      evolutionBranch: [
        { evolution: "VAPOREON", form: "VAPOREON_NORMAL", candyCost: 25 },
        { evolution: "VAPOREON", form: "VAPOREON_NORMAL", candyCost: 25 },
        { evolution: "JOLTEON", form: "JOLTEON_NORMAL", candyCost: 25 },
      ],
    };
    expect(realEvolutionTargets(record)).toEqual([
      { evolutionEnum: "VAPOREON", form: "VAPOREON_NORMAL", candyCost: 25, candyCostPurified: undefined },
      { evolutionEnum: "JOLTEON", form: "JOLTEON_NORMAL", candyCost: 25, candyCostPurified: undefined },
    ]);
  });

  it("realEvolutionTargets keeps a branch with no `form` field (Totodile -> Croconaw)", () => {
    const [, normalForm] = recordPair("TOTODILE", [{ evolution: "CROCONAW", candyCost: 25, candyCostPurified: 22 }]);
    expect(realEvolutionTargets(normalForm!)).toEqual([
      { evolutionEnum: "CROCONAW", form: undefined, candyCost: 25, candyCostPurified: 22 },
    ]);
  });
});
