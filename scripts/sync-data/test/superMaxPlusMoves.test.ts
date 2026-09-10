import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";
import { SUPER_MAX_PLUS_MOVES, attachSuperMaxPlusMoves, resolveSuperMaxPlusMove } from "../superMaxPlusMoves.ts";
import type { GameMasterMoveRecord } from "../rawShapes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(__dirname, "..", "superMaxPlusMoves.ts");

const VALID_CONFIDENCE = new Set(["official", "cross-site", "community-estimate"]);

function makeSpecies(id: string, name: string): SpeciesDefinition {
  return {
    id,
    name,
    types: ["normal"],
    baseAttack: 200,
    baseDefense: 150,
    baseStamina: 150,
    fastMoves: [
      { id: "TACKLE_FAST", name: "Tackle", type: "normal", power: 3, energyGain: 5, durationSeconds: 0.5 },
    ],
    chargedMoves: [
      { id: "EXISTING_ONE", name: "Existing One", type: "normal", power: 50, energyCost: 33, durationSeconds: 2, vulnerableWindowSeconds: 2 },
      { id: "EXISTING_TWO", name: "Existing Two", type: "normal", power: 90, energyCost: 50, durationSeconds: 2.5, vulnerableWindowSeconds: 2.5 },
    ],
  };
}

// Real base-move records, matching data/raw/game_master.json at authoring
// time exactly (see superMaxPlusMoves.ts's own doc comment / the task's
// sourcing table) — used to test resolution against realistic values without
// depending on the live/committed dump directly.
const DARK_PULSE: GameMasterMoveRecord = { movementId: "DARK_PULSE", pokemonType: "POKEMON_TYPE_DARK", power: 80, energyDelta: -50, durationMs: 3000 };
const FELL_STINGER: GameMasterMoveRecord = { movementId: "FELL_STINGER", pokemonType: "POKEMON_TYPE_BUG", power: 45, energyDelta: -33, durationMs: 2000 };
const ZAP_CANNON: GameMasterMoveRecord = { movementId: "ZAP_CANNON", pokemonType: "POKEMON_TYPE_ELECTRIC", power: 140, energyDelta: -100, durationMs: 3500 };
const SEED_BOMB: GameMasterMoveRecord = { movementId: "SEED_BOMB", pokemonType: "POKEMON_TYPE_GRASS", power: 55, energyDelta: -33, durationMs: 2000 };
const VOLT_TACKLE: GameMasterMoveRecord = { movementId: "VOLT_TACKLE", pokemonType: "POKEMON_TYPE_ELECTRIC", power: 90, energyDelta: -33, durationMs: 3500 };
const DRILL_PECK: GameMasterMoveRecord = { movementId: "DRILL_PECK", pokemonType: "POKEMON_TYPE_FLYING", power: 70, energyDelta: -33, durationMs: 2500 };
const OUTRAGE: GameMasterMoveRecord = { movementId: "OUTRAGE", pokemonType: "POKEMON_TYPE_DRAGON", power: 110, energyDelta: -50, durationMs: 4000 };
const DYNAMIC_PUNCH: GameMasterMoveRecord = { movementId: "DYNAMIC_PUNCH", pokemonType: "POKEMON_TYPE_FIGHTING", power: 85, energyDelta: -50, durationMs: 2500 };
const BRAVE_BIRD: GameMasterMoveRecord = { movementId: "BRAVE_BIRD", pokemonType: "POKEMON_TYPE_FLYING", power: 130, energyDelta: -100, durationMs: 2000 };
// Added 2026-09-10 for the 7-entry db.pokemongohub.net batch — see
// superMaxPlusMoves.ts's own "2026-09-10 ADDITION" comment.
const ACID_SPRAY: GameMasterMoveRecord = { movementId: "ACID_SPRAY", pokemonType: "POKEMON_TYPE_POISON", power: 20, energyDelta: -50, durationMs: 3000 };
const BRICK_BREAK: GameMasterMoveRecord = { movementId: "BRICK_BREAK", pokemonType: "POKEMON_TYPE_FIGHTING", power: 40, energyDelta: -33, durationMs: 1500 };
const FUTURESIGHT: GameMasterMoveRecord = { movementId: "FUTURESIGHT", pokemonType: "POKEMON_TYPE_PSYCHIC", power: 115, energyDelta: -100, durationMs: 2500 };
const LIQUIDATION: GameMasterMoveRecord = { movementId: "LIQUIDATION", pokemonType: "POKEMON_TYPE_WATER", power: 70, energyDelta: -33, durationMs: 3000 };
const MYSTICAL_FIRE: GameMasterMoveRecord = { movementId: "MYSTICAL_FIRE", pokemonType: "POKEMON_TYPE_FIRE", power: 60, energyDelta: -33, durationMs: 2000 };
const PSYBEAM: GameMasterMoveRecord = { movementId: "PSYBEAM", pokemonType: "POKEMON_TYPE_PSYCHIC", power: 65, energyDelta: -50, durationMs: 3000 };
const SURF: GameMasterMoveRecord = { movementId: "SURF", pokemonType: "POKEMON_TYPE_WATER", power: 60, energyDelta: -50, durationMs: 1500 };

const FULL_MOVE_TABLE = new Map<string, GameMasterMoveRecord>([
  ["DARK_PULSE", DARK_PULSE],
  ["FELL_STINGER", FELL_STINGER],
  ["ZAP_CANNON", ZAP_CANNON],
  ["SEED_BOMB", SEED_BOMB],
  ["VOLT_TACKLE", VOLT_TACKLE],
  ["DRILL_PECK", DRILL_PECK],
  ["OUTRAGE", OUTRAGE],
  ["DYNAMIC_PUNCH", DYNAMIC_PUNCH],
  ["BRAVE_BIRD", BRAVE_BIRD],
  ["ACID_SPRAY", ACID_SPRAY],
  ["BRICK_BREAK", BRICK_BREAK],
  ["FUTURESIGHT", FUTURESIGHT],
  ["LIQUIDATION", LIQUIDATION],
  ["MYSTICAL_FIRE", MYSTICAL_FIRE],
  ["PSYBEAM", PSYBEAM],
  ["SURF", SURF],
]);

describe("SUPER_MAX_PLUS_MOVES (table shape)", () => {
  it("has exactly 16 entries (15 live + 1 deliberately inert Staraptor entry)", () => {
    expect(SUPER_MAX_PLUS_MOVES.length).toBe(16);
  });

  it("has no duplicate speciesId", () => {
    const ids = SUPER_MAX_PLUS_MOVES.map((e) => e.speciesId.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate moveId", () => {
    const ids = SUPER_MAX_PLUS_MOVES.map((e) => e.moveId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every moveName ends with '+'", () => {
    for (const entry of SUPER_MAX_PLUS_MOVES) {
      expect(entry.moveName.endsWith("+")).toBe(true);
    }
  });

  it("every moveId ends with '_PLUS'", () => {
    for (const entry of SUPER_MAX_PLUS_MOVES) {
      expect(entry.moveId.endsWith("_PLUS")).toBe(true);
    }
  });

  it("every entry uses a real, recognized confidence tier", () => {
    for (const entry of SUPER_MAX_PLUS_MOVES) {
      expect(VALID_CONFIDENCE.has(entry.confidence)).toBe(true);
    }
  });

  it("every entry's baseMovementId resolves against the real base-move table verified at authoring time", () => {
    for (const entry of SUPER_MAX_PLUS_MOVES) {
      expect(FULL_MOVE_TABLE.has(entry.baseMovementId), `${entry.baseMovementId} (for ${entry.speciesId}) missing from the verified base-move table`).toBe(true);
    }
  });

  it("includes the two official, task-pinned entries at exact value level, energyCost corrected 2026-09-09", () => {
    const houndoom = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "houndoom-mega");
    expect(houndoom).toMatchObject({ baseMovementId: "DARK_PULSE", moveId: "DARK_PULSE_PLUS", moveName: "Dark Pulse+", power: 150, confidence: "official", energyCost: 100 });

    const beedrill = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "beedrill-mega");
    expect(beedrill).toMatchObject({ baseMovementId: "FELL_STINGER", moveId: "FELL_STINGER_PLUS", moveName: "Fell Stinger+", power: 140, confidence: "official", energyCost: 100 });
  });

  it("includes the deliberately inert Mega Staraptor entry (energyCost 100 is an UNCONFIRMED coincidental fallback, not sourced — see its own comment)", () => {
    const staraptor = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "staraptor-mega");
    expect(staraptor).toMatchObject({ baseMovementId: "BRAVE_BIRD", moveId: "BRAVE_BIRD_PLUS", moveName: "Brave Bird+", power: 150, confidence: "official", energyCost: 100 });
  });

  it("every entry carries a positive, explicit numeric energyCost (never inherited from the base move as of the 2026-09-09 correction)", () => {
    for (const entry of SUPER_MAX_PLUS_MOVES) {
      expect(typeof entry.energyCost, `${entry.speciesId} energyCost should be a number`).toBe("number");
      expect(entry.energyCost, `${entry.speciesId} energyCost should be positive`).toBeGreaterThan(0);
    }
  });

  it("all 16 entries currently read energyCost 100 — db.pokemongohub.net's sourced value for the 15 live entries, and Staraptor's coincidental (unconfirmed) fallback", () => {
    for (const entry of SUPER_MAX_PLUS_MOVES) {
      expect(entry.energyCost, entry.speciesId).toBe(100);
    }
  });

  it("the five entries upgraded 2026-09-09 (doctorpokegogo + db.pokemongohub.net independently agreeing) now sit at cross-site confidence, not community-estimate", () => {
    const upgradedSpeciesIds = ["chesnaught-mega", "raichu-mega-x", "skarmory-mega", "dragonite-mega", "mewtwo-mega-x"];
    for (const speciesId of upgradedSpeciesIds) {
      const entry = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === speciesId);
      expect(entry, speciesId).toBeDefined();
      expect(entry!.confidence, speciesId).toBe("cross-site");
    }
  });

  it("the seven entries added 2026-09-10 (single-source db.pokemongohub.net full-table read) sit at community-estimate confidence, at exact value level", () => {
    const expected: Record<string, { baseMovementId: string; moveId: string; moveName: string; power: number }> = {
      "victreebel-mega": { baseMovementId: "ACID_SPRAY", moveId: "ACID_SPRAY_PLUS", moveName: "Acid Spray+", power: 160 },
      "falinks-mega": { baseMovementId: "BRICK_BREAK", moveId: "BRICK_BREAK_PLUS", moveName: "Brick Break+", power: 150 },
      "mewtwo-mega-y": { baseMovementId: "FUTURESIGHT", moveId: "FUTURESIGHT_PLUS", moveName: "Future Sight+", power: 140 },
      "starmie-mega": { baseMovementId: "LIQUIDATION", moveId: "LIQUIDATION_PLUS", moveName: "Liquidation+", power: 180 },
      "delphox-mega": { baseMovementId: "MYSTICAL_FIRE", moveId: "MYSTICAL_FIRE_PLUS", moveName: "Mystical Fire+", power: 140 },
      "malamar-mega": { baseMovementId: "PSYBEAM", moveId: "PSYBEAM_PLUS", moveName: "Psybeam+", power: 170 },
      "greninja-mega": { baseMovementId: "SURF", moveId: "SURF_PLUS", moveName: "Surf+", power: 130 },
    };
    for (const [speciesId, values] of Object.entries(expected)) {
      const entry = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === speciesId);
      expect(entry, speciesId).toBeDefined();
      expect(entry, speciesId).toMatchObject({ ...values, confidence: "community-estimate", energyCost: 100 });
    }
  });

  it("Future Sight+ resolves the earlier FUTURE_SIGHT-vs-FUTURESIGHT movementId correction: moveId/baseMovementId both use the no-underscore spelling", () => {
    const futureSight = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "mewtwo-mega-y")!;
    expect(futureSight.baseMovementId).toBe("FUTURESIGHT");
    expect(futureSight.moveId).toBe("FUTURESIGHT_PLUS");
  });

  it("never includes the Apex Lugia/Ho-Oh AEROBLAST_PLUS/SACRED_FIRE_PLUS moves — cited only as a naming-convention precedent, never table members", () => {
    const actualIds = SUPER_MAX_PLUS_MOVES.map((e) => e.moveId);
    expect(actualIds).not.toContain("AEROBLAST_PLUS");
    expect(actualIds).not.toContain("AEROBLAST_PLUS_PLUS");
    expect(actualIds).not.toContain("SACRED_FIRE_PLUS");
    expect(actualIds).not.toContain("SACRED_FIRE_PLUS_PLUS");
    const actualSpeciesIds = SUPER_MAX_PLUS_MOVES.map((e) => e.speciesId);
    expect(actualSpeciesIds).not.toContain("lugia-apex");
    expect(actualSpeciesIds).not.toContain("ho-oh-apex");
  });

  it("every entry carries its own citation in a comment directly above it in the source file", () => {
    // Same textual-proxy discipline as releasedMegaPrimalAllowlist.test.ts:
    // doesn't verify the citation is GOOD, only that one was written.
    const source = readFileSync(SOURCE_PATH, "utf-8");
    const citationMarkerRe = /(https?:\/\/|official|cross-site|community-estimate|pokemongo\.com|doctorpokegogo|pokemongohub)/i;
    for (const entry of SUPER_MAX_PLUS_MOVES) {
      const idIndex = source.indexOf(`speciesId: "${entry.speciesId}"`);
      expect(idIndex, `entry literal for "${entry.speciesId}" not found verbatim in source`).toBeGreaterThan(-1);
      const precedingText = source.slice(Math.max(0, idIndex - 1200), idIndex);
      expect(citationMarkerRe.test(precedingText), `no citation marker found before entry "${entry.speciesId}"`).toBe(true);
    }
  });
});

describe("resolveSuperMaxPlusMove", () => {
  it("builds Dark Pulse+ from DARK_PULSE's real base template — power AND energyCost overridden (energyCost corrected 2026-09-09, no longer inherited), duration/type still carried through unchanged", () => {
    const entry = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "houndoom-mega")!;
    const move = resolveSuperMaxPlusMove(entry, FULL_MOVE_TABLE);
    expect(move).toEqual({
      id: "DARK_PULSE_PLUS",
      name: "Dark Pulse+",
      type: "dark",
      power: 150,
      energyGain: 0,
      energyCost: 100,
      durationSeconds: 3,
      vulnerableWindowSeconds: 3,
      isPlusMove: true,
      plusMovePowerConfidence: "official",
    });
  });

  it("builds Fell Stinger+ from FELL_STINGER's real base template — energyCost 100 (corrected 2026-09-09), NOT the base move's own 33", () => {
    const entry = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "beedrill-mega")!;
    const move = resolveSuperMaxPlusMove(entry, FULL_MOVE_TABLE);
    expect(move).toEqual({
      id: "FELL_STINGER_PLUS",
      name: "Fell Stinger+",
      type: "bug",
      power: 140,
      energyGain: 0,
      energyCost: 100,
      durationSeconds: 2,
      vulnerableWindowSeconds: 2,
      isPlusMove: true,
      plusMovePowerConfidence: "official",
    });
  });

  it("builds Zap Cannon+ (cross-site) from ZAP_CANNON's real base template", () => {
    const entry = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "raichu-mega-y")!;
    const move = resolveSuperMaxPlusMove(entry, FULL_MOVE_TABLE);
    expect(move).toEqual({
      id: "ZAP_CANNON_PLUS",
      name: "Zap Cannon+",
      type: "electric",
      power: 160,
      energyGain: 0,
      energyCost: 100,
      durationSeconds: 3.5,
      vulnerableWindowSeconds: 3.5,
      isPlusMove: true,
      plusMovePowerConfidence: "cross-site",
    });
  });

  it("builds Acid Spray+ (community-estimate, 2026-09-10) from ACID_SPRAY's real base template — base move IS already in Mega Victreebel's own moveset, resolution is still against the global table", () => {
    const entry = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "victreebel-mega")!;
    const move = resolveSuperMaxPlusMove(entry, FULL_MOVE_TABLE);
    expect(move).toEqual({
      id: "ACID_SPRAY_PLUS",
      name: "Acid Spray+",
      type: "poison",
      power: 160,
      energyGain: 0,
      energyCost: 100,
      durationSeconds: 3,
      vulnerableWindowSeconds: 3,
      isPlusMove: true,
      plusMovePowerConfidence: "community-estimate",
    });
  });

  it("builds Future Sight+ (community-estimate, 2026-09-10) from FUTURESIGHT's real base template — the no-underscore movementId resolves correctly", () => {
    const entry = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "mewtwo-mega-y")!;
    const move = resolveSuperMaxPlusMove(entry, FULL_MOVE_TABLE);
    expect(move).toEqual({
      id: "FUTURESIGHT_PLUS",
      name: "Future Sight+",
      type: "psychic",
      power: 140,
      energyGain: 0,
      energyCost: 100,
      durationSeconds: 2.5,
      vulnerableWindowSeconds: 2.5,
      isPlusMove: true,
      plusMovePowerConfidence: "community-estimate",
    });
  });

  it("builds Surf+ (community-estimate, 2026-09-10) from SURF's real base template — energyCost 100, NOT the base move's own 50", () => {
    const entry = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "greninja-mega")!;
    const move = resolveSuperMaxPlusMove(entry, FULL_MOVE_TABLE);
    expect(move).toEqual({
      id: "SURF_PLUS",
      name: "Surf+",
      type: "water",
      power: 130,
      energyGain: 0,
      energyCost: 100,
      durationSeconds: 1.5,
      vulnerableWindowSeconds: 1.5,
      isPlusMove: true,
      plusMovePowerConfidence: "community-estimate",
    });
  });

  it("returns null when the base movementId has no matching GAME_MASTER template (never expected for real data, defensive only)", () => {
    const entry = SUPER_MAX_PLUS_MOVES.find((e) => e.speciesId === "houndoom-mega")!;
    const move = resolveSuperMaxPlusMove(entry, new Map());
    expect(move).toBeNull();
  });
});

describe("attachSuperMaxPlusMoves", () => {
  it("attaches a resolvable entry as a genuinely ADDITIONAL charged move (pushed, not replacing the existing two)", () => {
    const houndoom = makeSpecies("houndoom-mega", "Mega Houndoom");
    const result = attachSuperMaxPlusMoves([houndoom], FULL_MOVE_TABLE);

    expect(houndoom.chargedMoves).toHaveLength(3);
    expect(houndoom.chargedMoves[0]!.id).toBe("EXISTING_ONE");
    expect(houndoom.chargedMoves[1]!.id).toBe("EXISTING_TWO");
    expect(houndoom.chargedMoves[2]).toMatchObject({ id: "DARK_PULSE_PLUS", name: "Dark Pulse+", power: 150, isPlusMove: true, plusMovePowerConfidence: "official" });
    expect(result.attached).toContain("Mega Houndoom (Dark Pulse+)");
  });

  it("attaches to every one of the 15 live species when all are present, and reports exactly the Staraptor gap", () => {
    const liveSpeciesIds = SUPER_MAX_PLUS_MOVES.filter((e) => e.speciesId !== "staraptor-mega").map((e) => e.speciesId);
    const allSpecies = liveSpeciesIds.map((id) => makeSpecies(id, id));
    const result = attachSuperMaxPlusMoves(allSpecies, FULL_MOVE_TABLE);

    expect(result.attached).toHaveLength(15);
    expect(result.skippedUnknownSpecies).toEqual(["staraptor-mega"]);
    expect(result.skippedMissingBaseMove).toEqual([]);
    for (const species of allSpecies) {
      expect(species.chargedMoves).toHaveLength(3);
    }
  });

  it("skips an entry for a species not present this run SILENTLY — no throw, no partial move anywhere", () => {
    // The exact Mega Staraptor scenario: species.json has none of the target
    // species at all yet.
    const unrelatedSpecies = makeSpecies("some-other-species", "Some Other Species");
    expect(() => attachSuperMaxPlusMoves([unrelatedSpecies], FULL_MOVE_TABLE)).not.toThrow();

    const result = attachSuperMaxPlusMoves([unrelatedSpecies], FULL_MOVE_TABLE);
    expect(result.attached).toEqual([]);
    expect(result.skippedUnknownSpecies).toEqual(SUPER_MAX_PLUS_MOVES.map((e) => e.speciesId));
    // The unrelated species itself must be completely untouched — no partial
    // or stray move of any kind.
    expect(unrelatedSpecies.chargedMoves).toHaveLength(2);
    expect(unrelatedSpecies.chargedMoves.map((m) => m.id)).toEqual(["EXISTING_ONE", "EXISTING_TWO"]);
  });

  it("skips an entry whose base move can't be resolved SILENTLY — no throw, no partial move", () => {
    const houndoom = makeSpecies("houndoom-mega", "Mega Houndoom");
    const tableMissingDarkPulse = new Map(FULL_MOVE_TABLE);
    tableMissingDarkPulse.delete("DARK_PULSE");

    expect(() => attachSuperMaxPlusMoves([houndoom], tableMissingDarkPulse)).not.toThrow();

    const result = attachSuperMaxPlusMoves([houndoom], tableMissingDarkPulse);
    expect(result.attached).toEqual([]);
    expect(result.skippedMissingBaseMove).toEqual(["houndoom-mega (DARK_PULSE)"]);
    expect(houndoom.chargedMoves).toHaveLength(2);
  });

  it("returns an empty result for an empty species list, without throwing", () => {
    expect(() => attachSuperMaxPlusMoves([], FULL_MOVE_TABLE)).not.toThrow();
    const result = attachSuperMaxPlusMoves([], FULL_MOVE_TABLE);
    expect(result.attached).toEqual([]);
    expect(result.skippedUnknownSpecies).toEqual(SUPER_MAX_PLUS_MOVES.map((e) => e.speciesId));
  });
});
