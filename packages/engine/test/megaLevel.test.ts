import { describe, expect, it } from "vitest";
import { fromGameMasterMove, type RawGameMasterMove } from "../src/gamemaster.js";
import {
  BEST_BUDDY_EFFECTIVE_LEVEL_BONUS,
  canReachSuperMax,
  chargedMoveAtMegaLevel,
  effectiveLevelForBestBuddy,
  effectiveLevelForMegaLevel,
  MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER,
  SUPER_MAX_EFFECTIVE_LEVEL_BONUS,
  type MegaLevel,
} from "../src/megaLevel.js";
import type { ChargedMove } from "../src/types.js";

/**
 * TEST-ONLY per-species "+" move data, straight from the task brief (all
 * real, published numbers — see
 * .claude/agent-memory/pogo-researcher/fact_super_max_plus_move_mechanics_detail.md
 * for full sourcing) — used here ONLY to pin regression numbers, never
 * shipped as product data. `data-sync` owns the real curated table in phase
 * 2; nothing here is re-exported from src/.
 *
 * Expected scaled powers below were computed by actually running
 * Math.round(base * multiplier) for each tier (a throwaway script, not hand
 * arithmetic), per this project's pinned-number discipline.
 */
describe("MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER", () => {
  it("is base 1.0 / high 1.1 / max 1.2 / super-max 1.3", () => {
    expect(MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER).toEqual({ base: 1, high: 1.1, max: 1.2, "super-max": 1.3 });
  });
});

describe("SUPER_MAX_EFFECTIVE_LEVEL_BONUS", () => {
  it("is +2 effective levels", () => {
    expect(SUPER_MAX_EFFECTIVE_LEVEL_BONUS).toBe(2);
  });
});

describe("effectiveLevelForMegaLevel", () => {
  it.each<[MegaLevel | null | undefined]>([["base"], ["high"], ["max"], [null], [undefined]])(
    "leaves level unchanged for %s (a step, not a gradient — only super-max gets a bonus)",
    (megaLevel) => {
      expect(effectiveLevelForMegaLevel(1, megaLevel)).toBe(1);
      expect(effectiveLevelForMegaLevel(49.5, megaLevel)).toBe(49.5);
      expect(effectiveLevelForMegaLevel(50, megaLevel)).toBe(50);
    },
  );

  it("adds exactly +2 effective levels for super-max", () => {
    expect(effectiveLevelForMegaLevel(1, "super-max")).toBe(3);
    expect(effectiveLevelForMegaLevel(48.5, "super-max")).toBe(50.5);
    expect(effectiveLevelForMegaLevel(49, "super-max")).toBe(51);
    expect(effectiveLevelForMegaLevel(49.5, "super-max")).toBe(51.5);
    expect(effectiveLevelForMegaLevel(50, "super-max")).toBe(52);
  });
});

describe("BEST_BUDDY_EFFECTIVE_LEVEL_BONUS / effectiveLevelForBestBuddy", () => {
  it("is +1 effective level", () => {
    expect(BEST_BUDDY_EFFECTIVE_LEVEL_BONUS).toBe(1);
  });

  it.each<[boolean | null | undefined]>([[false], [null], [undefined]])(
    "leaves level unchanged when isBestBuddy is %s",
    (isBestBuddy) => {
      expect(effectiveLevelForBestBuddy(1, isBestBuddy)).toBe(1);
      expect(effectiveLevelForBestBuddy(50, isBestBuddy)).toBe(50);
    },
  );

  it("adds exactly +1 effective level when isBestBuddy is true", () => {
    expect(effectiveLevelForBestBuddy(1, true)).toBe(2);
    expect(effectiveLevelForBestBuddy(49.5, true)).toBe(50.5);
    expect(effectiveLevelForBestBuddy(50, true)).toBe(51);
  });

  it("has no gate at all — applies identically regardless of any species/boost concept (it takes no species argument)", () => {
    // effectiveLevelForBestBuddy's signature itself proves this: it only
    // ever takes (level, isBestBuddy), never a species — so there is
    // structurally no way for it to special-case a non-mega species.
    expect(effectiveLevelForBestBuddy(30, true)).toBe(31);
  });

  it("STACKS with Super Max's +2 when composed the way every orchestration call site does — a level-50 Super Max mega that is also Best Buddy reaches exactly 53", () => {
    const level = 50;
    const isBestBuddy = true;
    const megaLevel: MegaLevel = "super-max";
    const composed = effectiveLevelForMegaLevel(effectiveLevelForBestBuddy(level, isBestBuddy), megaLevel);
    expect(composed).toBe(53);
  });

  it("stacks at the fractional level too — 49.5 stacked reaches exactly 52.5", () => {
    const composed = effectiveLevelForMegaLevel(effectiveLevelForBestBuddy(49.5, true), "super-max");
    expect(composed).toBe(52.5);
  });

  it("composition order doesn't matter — both bonuses are a flat +N shift", () => {
    const bestBuddyFirst = effectiveLevelForMegaLevel(effectiveLevelForBestBuddy(50, true), "super-max");
    const megaLevelFirst = effectiveLevelForBestBuddy(effectiveLevelForMegaLevel(50, "super-max"), true);
    expect(bestBuddyFirst).toBe(megaLevelFirst);
    expect(bestBuddyFirst).toBe(53);
  });
});

const nonPlusMove: ChargedMove = {
  id: "ordinary-charged",
  name: "Ordinary Charged",
  type: "normal",
  power: 100,
  energyCost: 50,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};

// [official] pokemongo.com/en/news/mega-squads-2026 — Mega Houndoom's Dark
// Pulse+, Base-tier raid power 150. Base move (DARK_PULSE) real values per
// the research memory: power 80, energyDelta -50 (i.e. energyCost 50),
// duration 3000ms. Dark Pulse is NOT in Mega Houndoom's own moveset, so this
// is a genuinely new move built from the GLOBAL move template, not the
// species' own movepool — see this file's "built from the base move's global
// GAME_MASTER template" describe block below for that exact pattern.
const darkPulsePlus: ChargedMove = {
  id: "DARK_PULSE_PLUS",
  name: "Dark Pulse+",
  type: "dark",
  power: 150,
  energyCost: 50,
  durationSeconds: 3,
  vulnerableWindowSeconds: 3,
  isPlusMove: true,
  plusMovePowerConfidence: "official",
};

// [official] pokemongo.com/en/news/mega-squads-2026 — Mega Beedrill's Fell
// Stinger+, Base-tier raid power 140.
const fellStingerPlus: ChargedMove = {
  id: "FELL_STINGER_PLUS",
  name: "Fell Stinger+",
  type: "bug",
  power: 140,
  energyCost: 33,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
  isPlusMove: true,
  plusMovePowerConfidence: "official",
};

// [cross-site] two independent sites agree — Mega Raichu Y's Zap Cannon+,
// Base-tier raid power 160.
const zapCannonPlus: ChargedMove = {
  id: "ZAP_CANNON_PLUS",
  name: "Zap Cannon+",
  type: "electric",
  power: 160,
  energyCost: 100,
  durationSeconds: 3.5,
  vulnerableWindowSeconds: 3.5,
  isPlusMove: true,
  plusMovePowerConfidence: "cross-site",
};

// [confirmed] user, 2026-09-10, relaying direct in-game observation: "not
// every mega can get to super mega level its only the ones with plus moves
// unlocked" — canReachSuperMax is the data-driven predicate this feature
// gates the Super Max effective-level CP bonus behind (see
// comparison.ts's resolveCandidateMegaLevel).
describe("canReachSuperMax", () => {
  it("is false for a species with an empty chargedMoves list", () => {
    expect(canReachSuperMax({ chargedMoves: [] })).toBe(false);
  });

  it("is false for a species whose charged moves are all ordinary (no '+' move)", () => {
    expect(canReachSuperMax({ chargedMoves: [nonPlusMove] })).toBe(false);
    expect(canReachSuperMax({ chargedMoves: [nonPlusMove, { ...nonPlusMove, id: "another-ordinary" }] })).toBe(false);
  });

  it("is true for a species carrying at least one '+' move", () => {
    expect(canReachSuperMax({ chargedMoves: [darkPulsePlus] })).toBe(true);
    expect(canReachSuperMax({ chargedMoves: [fellStingerPlus] })).toBe(true);
    expect(canReachSuperMax({ chargedMoves: [zapCannonPlus] })).toBe(true);
  });

  it("is true when the '+' move is mixed in among ordinary moves, regardless of array position", () => {
    expect(canReachSuperMax({ chargedMoves: [nonPlusMove, darkPulsePlus] })).toBe(true);
    expect(canReachSuperMax({ chargedMoves: [darkPulsePlus, nonPlusMove] })).toBe(true);
  });

  it("a species becomes eligible the instant a '+' move is added to its chargedMoves, with no other change — data-driven, not a hand-maintained species list", () => {
    const beforeDataSyncAddsThePlusMove = { chargedMoves: [nonPlusMove] };
    const afterDataSyncAddsThePlusMove = { chargedMoves: [nonPlusMove, zapCannonPlus] };
    expect(canReachSuperMax(beforeDataSyncAddsThePlusMove)).toBe(false);
    expect(canReachSuperMax(afterDataSyncAddsThePlusMove)).toBe(true);
  });
});

describe("chargedMoveAtMegaLevel", () => {
  it.each<[MegaLevel | null | undefined]>([["base"], ["high"], ["max"], ["super-max"], [null], [undefined]])(
    "passes a non-'+' move through completely unchanged regardless of megaLevel (%s)",
    (megaLevel) => {
      const result = chargedMoveAtMegaLevel(nonPlusMove, megaLevel);
      expect(result).toEqual(nonPlusMove);
    },
  );

  it("a '+' move at base (or null/undefined) megaLevel reads at its stored Base-tier power, unchanged", () => {
    expect(chargedMoveAtMegaLevel(darkPulsePlus, "base").power).toBe(150);
    expect(chargedMoveAtMegaLevel(darkPulsePlus, null).power).toBe(150);
    expect(chargedMoveAtMegaLevel(darkPulsePlus, undefined).power).toBe(150);
  });

  it("scales Dark Pulse+ (150 official) correctly at every tier", () => {
    expect(chargedMoveAtMegaLevel(darkPulsePlus, "high").power).toBe(165);
    expect(chargedMoveAtMegaLevel(darkPulsePlus, "max").power).toBe(180);
    expect(chargedMoveAtMegaLevel(darkPulsePlus, "super-max").power).toBe(195);
  });

  it("scales Fell Stinger+ (140 official) correctly at every tier", () => {
    expect(chargedMoveAtMegaLevel(fellStingerPlus, "high").power).toBe(154);
    expect(chargedMoveAtMegaLevel(fellStingerPlus, "max").power).toBe(168);
    expect(chargedMoveAtMegaLevel(fellStingerPlus, "super-max").power).toBe(182);
  });

  it("scales Zap Cannon+ (160 cross-site) correctly at every tier", () => {
    expect(chargedMoveAtMegaLevel(zapCannonPlus, "high").power).toBe(176);
    expect(chargedMoveAtMegaLevel(zapCannonPlus, "max").power).toBe(192);
    expect(chargedMoveAtMegaLevel(zapCannonPlus, "super-max").power).toBe(208);
  });

  it("never touches energyCost/durationSeconds/vulnerableWindowSeconds/type/id/name/plusMovePowerConfidence — only power", () => {
    const scaled = chargedMoveAtMegaLevel(darkPulsePlus, "super-max");
    expect(scaled.energyCost).toBe(darkPulsePlus.energyCost);
    expect(scaled.durationSeconds).toBe(darkPulsePlus.durationSeconds);
    expect(scaled.vulnerableWindowSeconds).toBe(darkPulsePlus.vulnerableWindowSeconds);
    expect(scaled.type).toBe(darkPulsePlus.type);
    expect(scaled.id).toBe(darkPulsePlus.id);
    expect(scaled.name).toBe(darkPulsePlus.name);
    expect(scaled.isPlusMove).toBe(true);
    expect(scaled.plusMovePowerConfidence).toBe("official");
  });

  it("returns a NEW object rather than mutating the input", () => {
    const before = { ...darkPulsePlus };
    chargedMoveAtMegaLevel(darkPulsePlus, "super-max");
    expect(darkPulsePlus).toEqual(before);
  });
});

describe("a '+' move built from the base move's GLOBAL GAME_MASTER template (the data-sync contract this phase hands off)", () => {
  // Confirms the pattern data-sync will follow in phase 2 for every "+" move
  // whose base move is NOT in its own species' movepool (7 of 8 shipping
  // species per the task brief): resolve the base move's GLOBAL template via
  // the existing fromGameMasterMove on-ramp (duration/energy come from
  // there, unchanged), then override id/name/power/isPlusMove/
  // plusMovePowerConfidence on top — no new on-ramp needed, no changes to
  // gamemaster.ts. Real cited base-move values (DARK_PULSE: power 80,
  // energyDelta -50, duration 3000ms) per the research memory.
  it("Dark Pulse+ built from DARK_PULSE's real base template carries the base move's real duration/energy, unchanged", () => {
    const rawDarkPulse: RawGameMasterMove = {
      move_id: "DARK_PULSE",
      name: "Dark Pulse",
      type: "POKEMON_TYPE_DARK",
      power: 80,
      energy_delta: -50,
      duration_ms: 3000,
    };
    const base = fromGameMasterMove(rawDarkPulse);
    expect(base.durationSeconds).toBe(3);
    expect(base.energyCost).toBe(50);
    expect(base.vulnerableWindowSeconds).toBe(3);

    const plusMove: ChargedMove = {
      ...base,
      id: "DARK_PULSE_PLUS",
      name: "Dark Pulse+",
      power: 150, // [official] — NOT derived from the base move's own 80 power by any formula.
      isPlusMove: true,
      plusMovePowerConfidence: "official",
    };

    // Duration/energy survive from the base template untouched...
    expect(plusMove.durationSeconds).toBe(3);
    expect(plusMove.energyCost).toBe(50);
    // ...and chargedMoveAtMegaLevel scales power on top of this composed move
    // exactly as it would for any other "+" move.
    expect(chargedMoveAtMegaLevel(plusMove, "super-max").power).toBe(195);
  });

  it("Fell Stinger+ built from FELL_STINGER's real base template carries the base move's real duration/energy, unchanged", () => {
    const rawFellStinger: RawGameMasterMove = {
      move_id: "FELL_STINGER",
      name: "Fell Stinger",
      type: "POKEMON_TYPE_BUG",
      power: 45,
      energy_delta: -33,
      duration_ms: 2000,
    };
    const base = fromGameMasterMove(rawFellStinger);
    expect(base.durationSeconds).toBe(2);
    expect(base.energyCost).toBe(33);

    const plusMove: ChargedMove = {
      ...base,
      id: "FELL_STINGER_PLUS",
      name: "Fell Stinger+",
      power: 140, // [official]
      isPlusMove: true,
      plusMovePowerConfidence: "official",
    };
    expect(plusMove.durationSeconds).toBe(2);
    expect(plusMove.energyCost).toBe(33);
    expect(chargedMoveAtMegaLevel(plusMove, "super-max").power).toBe(182);
  });
});
