import { describe, expect, it } from "vitest";
import {
  canLearnSecondChargedMove,
  generateEliteTmCandidates,
  generateSecondChargedMoveCandidates,
  isSecondChargedMoveEligibleByDefault,
  isSecondChargedMoveStarterOrBabyFlatRate,
  isSpeciesTmEligible,
  isTmTargetableMove,
  secondChargedMoveCost,
  secondChargedMoveEligibility,
  SECOND_CHARGED_MOVE_STARTER_OR_BABY_FLAT_RATE,
  toPowerUpResourceCost,
  type MoveChangeEvaluationInputs,
} from "../src/tmMove.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";

const LEVEL = 25;
const IVS = { attack: 15, defense: 15, stamina: 15 } as const;

const FAST_A: FastMove = { id: "fast-a", name: "Fast A", type: "normal", power: 8, energyGain: 10, durationSeconds: 1 };
const FAST_B: FastMove = { id: "fast-b", name: "Fast B", type: "normal", power: 5, energyGain: 6, durationSeconds: 0.6 };

const CHARGED_CURRENT: ChargedMove = {
  id: "charged-current",
  name: "Charged Current",
  type: "normal",
  power: 50,
  energyCost: 50,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};
/** Deliberately much stronger than CHARGED_CURRENT, same energy/duration, to give a genuine, noise-clearing improvement. */
const CHARGED_BETTER: ChargedMove = {
  id: "charged-better",
  name: "Charged Better",
  type: "normal",
  power: 150,
  energyCost: 50,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};
const CHARGED_WORSE: ChargedMove = {
  id: "charged-worse",
  name: "Charged Worse",
  type: "normal",
  power: 10,
  energyCost: 50,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};
const FRUSTRATION: ChargedMove = {
  id: "frustration",
  name: "Frustration",
  type: "normal",
  power: 10,
  energyCost: 33,
  durationSeconds: 2,
  vulnerableWindowSeconds: 2,
};
const SIGNATURE: ChargedMove = {
  id: "secret-sword",
  name: "Secret Sword",
  type: "fighting",
  power: 90,
  energyCost: 50,
  durationSeconds: 2.7,
  vulnerableWindowSeconds: 2.7,
};
const PLUS_MOVE: ChargedMove = {
  id: "brave-bird-plus",
  name: "Brave Bird+",
  type: "flying",
  power: 150,
  energyCost: 50,
  durationSeconds: 2.2,
  vulnerableWindowSeconds: 2.2,
  isPlusMove: true,
  plusMovePowerConfidence: "official",
};

const BASE_MON: SpeciesDefinition = {
  id: "base-mon",
  name: "Base Mon",
  types: ["normal"],
  baseAttack: 200,
  baseDefense: 150,
  baseStamina: 180,
  fastMoves: [FAST_A, FAST_B],
  chargedMoves: [CHARGED_CURRENT, CHARGED_BETTER, CHARGED_WORSE, FRUSTRATION, SIGNATURE, PLUS_MOVE],
};

const SMEARGLE: SpeciesDefinition = { ...BASE_MON, id: "smeargle", name: "Smeargle" };
const MAGIKARP: SpeciesDefinition = { ...BASE_MON, id: "magikarp", name: "Magikarp" };
/** A starter (Kanto, Gen 1) — real buddy distance is 3km, which would price 50,000/50 if the flat rate didn't override it. */
const BULBASAUR: SpeciesDefinition = { ...BASE_MON, id: "bulbasaur", name: "Bulbasaur" };
/** The one documented baby-Pokémon exception to the flat rate — must price at its buddy-distance tier instead. */
const TOXEL: SpeciesDefinition = { ...BASE_MON, id: "toxel", name: "Toxel" };
/** An ordinary baby (not Toxel) — should get the flat rate exactly like a starter. */
const RIOLU: SpeciesDefinition = { ...BASE_MON, id: "riolu", name: "Riolu" };

const WEAK_BOSS: SpeciesDefinition = {
  id: "weak-boss",
  name: "Weak Boss",
  types: ["normal"],
  baseAttack: 20,
  baseDefense: 40,
  baseStamina: 3000,
  fastMoves: [FAST_A],
  chargedMoves: [],
  statsArePrecomputed: true,
};

function baseInputs(overrides: Partial<MoveChangeEvaluationInputs> = {}): MoveChangeEvaluationInputs {
  return {
    slots: [{ species: BASE_MON, fastMoveId: FAST_A.id, chargedMoveId: CHARGED_CURRENT.id, isMega: false }],
    boss: WEAK_BOSS,
    level: LEVEL,
    ivs: IVS,
    dodge: { kind: "none" },
    bossChargedMoveMeanIntervalSeconds: 1000,
    raidTimerSeconds: 180,
    iterations: 3,
    seed: 1,
    ...overrides,
  };
}

describe("second charged move — cost", () => {
  it("is x1.2 for Shadow, matching powerUp.ts's shadow rate", () => {
    const result = secondChargedMoveCost({
      kmBuddyDistance: 1,
      isStarterOrBabyFlatRate: false,
      modifiers: { isShadow: true, isPurified: false },
    });
    expect(result).toEqual({ known: true, cost: { stardust: 12_000, candy: 30 } });
  });

  it("is x0.8 for Purified — NOT powerUp.ts's x0.9 power-up rate", () => {
    const result = secondChargedMoveCost({
      kmBuddyDistance: 1,
      isStarterOrBabyFlatRate: false,
      modifiers: { isShadow: false, isPurified: true },
    });
    expect(result).toEqual({ known: true, cost: { stardust: 8_000, candy: 20 } });
    // Explicitly distinct from what the x0.9 power-up rate would produce.
    expect(result).not.toEqual({ known: true, cost: { stardust: 9_000, candy: 22.5 } });
  });

  it("prices each buddy-distance tier correctly", () => {
    const cost = (km: number) =>
      secondChargedMoveCost({ kmBuddyDistance: km, isStarterOrBabyFlatRate: false, modifiers: { isShadow: false, isPurified: false } });
    expect(cost(1)).toEqual({ known: true, cost: { stardust: 10_000, candy: 25 } });
    expect(cost(3)).toEqual({ known: true, cost: { stardust: 50_000, candy: 50 } });
    expect(cost(5)).toEqual({ known: true, cost: { stardust: 75_000, candy: 75 } });
    expect(cost(20)).toEqual({ known: true, cost: { stardust: 100_000, candy: 100 } });
  });

  it("flat-rates a starter/baby regardless of its real buddy distance", () => {
    const result = secondChargedMoveCost({
      kmBuddyDistance: 20, // a real 20km distance would otherwise price 100,000/100
      isStarterOrBabyFlatRate: true,
      modifiers: { isShadow: false, isPurified: false },
    });
    expect(result).toEqual({ known: true, cost: SECOND_CHARGED_MOVE_STARTER_OR_BABY_FLAT_RATE });
  });

  it("reports unknown, distinct from throwing, when buddy distance is missing and no flat rate applies", () => {
    const result = secondChargedMoveCost({
      kmBuddyDistance: null,
      isStarterOrBabyFlatRate: false,
      modifiers: { isShadow: false, isPurified: false },
    });
    expect(result.known).toBe(false);
    if (!result.known) expect(result.reason).toMatch(/unknown/i);
  });

  it("throws on an unrecognized buddy distance (not one of the four real tiers)", () => {
    expect(() =>
      secondChargedMoveCost({ kmBuddyDistance: 2, isStarterOrBabyFlatRate: false, modifiers: { isShadow: false, isPurified: false } }),
    ).toThrow(/1, 3, 5, 20/);
  });

  it("throws when Shadow and Purified are both set", () => {
    expect(() =>
      secondChargedMoveCost({ kmBuddyDistance: 1, isStarterOrBabyFlatRate: false, modifiers: { isShadow: true, isPurified: true } }),
    ).toThrow(/cannot be both/);
  });

  it("converts to PowerUpResourceCost with xlCandy always 0", () => {
    expect(toPowerUpResourceCost({ stardust: 10_000, candy: 25 })).toEqual({ stardust: 10_000, candy: 25, xlCandy: 0 });
  });
});

describe("second charged move — the engine resolves starter/baby itself (2026-09-10)", () => {
  it("isSecondChargedMoveStarterOrBabyFlatRate: true for a starter, true for an ordinary baby, false for Toxel, false for a non-starter/baby", () => {
    expect(isSecondChargedMoveStarterOrBabyFlatRate(BULBASAUR)).toBe(true);
    expect(isSecondChargedMoveStarterOrBabyFlatRate(RIOLU)).toBe(true);
    expect(isSecondChargedMoveStarterOrBabyFlatRate(TOXEL)).toBe(false);
    expect(isSecondChargedMoveStarterOrBabyFlatRate(BASE_MON)).toBe(false);
  });

  it("prices a starter at the flat rate automatically, from `species` alone, with no isStarterOrBabyFlatRate override", () => {
    const result = secondChargedMoveCost({
      species: BULBASAUR,
      kmBuddyDistance: 3, // Bulbasaur's real buddy distance — would price 50,000/50 without the flat-rate override
      modifiers: { isShadow: false, isPurified: false },
    });
    expect(result).toEqual({ known: true, cost: SECOND_CHARGED_MOVE_STARTER_OR_BABY_FLAT_RATE });
  });

  it("Toxel prices at its buddy-distance tier, NOT the flat rate, despite being a baby Pokémon", () => {
    const result = secondChargedMoveCost({
      species: TOXEL,
      kmBuddyDistance: 5,
      modifiers: { isShadow: false, isPurified: false },
    });
    expect(result).toEqual({ known: true, cost: { stardust: 75_000, candy: 75 } });
  });

  it("a non-starter/baby species is unaffected — still prices by buddy distance with no override supplied", () => {
    const result = secondChargedMoveCost({
      species: BASE_MON,
      kmBuddyDistance: 20,
      modifiers: { isShadow: false, isPurified: false },
    });
    expect(result).toEqual({ known: true, cost: { stardust: 100_000, candy: 100 } });
  });

  it("Shadow x1.2 / Purified x0.8 still apply correctly on top of a starter's flat rate", () => {
    const shadow = secondChargedMoveCost({
      species: BULBASAUR,
      kmBuddyDistance: 3,
      modifiers: { isShadow: true, isPurified: false },
    });
    expect(shadow).toEqual({ known: true, cost: { stardust: 12_000, candy: 30 } });

    const purified = secondChargedMoveCost({
      species: BULBASAUR,
      kmBuddyDistance: 3,
      modifiers: { isShadow: false, isPurified: true },
    });
    expect(purified).toEqual({ known: true, cost: { stardust: 8_000, candy: 20 } });
  });

  it("an explicit isStarterOrBabyFlatRate override still wins over the species-derived answer (escape hatch)", () => {
    // BULBASAUR would normally resolve to the flat rate; force it off.
    const forcedOff = secondChargedMoveCost({
      species: BULBASAUR,
      kmBuddyDistance: 3,
      isStarterOrBabyFlatRate: false,
      modifiers: { isShadow: false, isPurified: false },
    });
    expect(forcedOff).toEqual({ known: true, cost: { stardust: 50_000, candy: 50 } });

    // BASE_MON would normally NOT get the flat rate; force it on.
    const forcedOn = secondChargedMoveCost({
      species: BASE_MON,
      kmBuddyDistance: 20,
      isStarterOrBabyFlatRate: true,
      modifiers: { isShadow: false, isPurified: false },
    });
    expect(forcedOn).toEqual({ known: true, cost: SECOND_CHARGED_MOVE_STARTER_OR_BABY_FLAT_RATE });
  });

  it("throws when neither `species` nor an explicit `isStarterOrBabyFlatRate` is supplied", () => {
    expect(() =>
      secondChargedMoveCost({ kmBuddyDistance: 3, modifiers: { isShadow: false, isPurified: false } }),
    ).toThrow(/species.*isStarterOrBabyFlatRate|isStarterOrBabyFlatRate.*species/i);
  });

  it("generateSecondChargedMoveCandidates resolves the flat rate from the slot's own species, with no isStarterOrBabyFlatRate/species in `pricing`", () => {
    const result = generateSecondChargedMoveCandidates({
      inputs: baseInputs({
        slots: [{ species: BULBASAUR, fastMoveId: FAST_A.id, chargedMoveId: CHARGED_CURRENT.id, isMega: false }],
      }),
      slotIndex: 0,
      currentChargedMoveIds: [CHARGED_CURRENT.id],
      pricing: { kmBuddyDistance: 3, modifiers: { isShadow: false, isPurified: false } },
    });
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      for (const c of result.candidates) {
        expect(c.cost).toEqual(SECOND_CHARGED_MOVE_STARTER_OR_BABY_FLAT_RATE);
      }
    }
  });
});

describe("second charged move — the 16-species exclusion and its Shadow/Purified exception", () => {
  it("blocks an ordinary Magikarp", () => {
    expect(isSecondChargedMoveEligibleByDefault(MAGIKARP)).toBe(false);
    expect(canLearnSecondChargedMove(MAGIKARP, { isShadow: false, isPurified: false })).toBe(false);
  });

  it("allows a Shadow Magikarp", () => {
    expect(canLearnSecondChargedMove(MAGIKARP, { isShadow: true, isPurified: false })).toBe(true);
  });

  it("allows a Purified Magikarp", () => {
    expect(canLearnSecondChargedMove(MAGIKARP, { isShadow: false, isPurified: true })).toBe(true);
  });

  it("never blocks an ordinary (non-listed) species", () => {
    expect(isSecondChargedMoveEligibleByDefault(BASE_MON)).toBe(true);
    expect(canLearnSecondChargedMove(BASE_MON, { isShadow: false, isPurified: false })).toBe(true);
  });

  it("secondChargedMoveEligibility reports the block with a reason", () => {
    const result = secondChargedMoveEligibility({
      species: MAGIKARP,
      currentChargedMoveIds: [CHARGED_CURRENT.id],
      modifiers: { isShadow: false, isPurified: false },
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/Shadow or Purified/);
  });
});

describe("second charged move — known-moveset rule", () => {
  it("excludes and reports an unknown moveset (no charged moves observed)", () => {
    const result = generateSecondChargedMoveCandidates({
      inputs: baseInputs(),
      slotIndex: 0,
      currentChargedMoveIds: [],
      pricing: { kmBuddyDistance: 1, isStarterOrBabyFlatRate: false, modifiers: { isShadow: false, isPurified: false } },
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.reason).toMatch(/unknown/i);
  });

  it("reports 'already knows a second charged move' when two are already known", () => {
    const result = generateSecondChargedMoveCandidates({
      inputs: baseInputs(),
      slotIndex: 0,
      currentChargedMoveIds: [CHARGED_CURRENT.id, CHARGED_WORSE.id],
      pricing: { kmBuddyDistance: 1, isStarterOrBabyFlatRate: false, modifiers: { isShadow: false, isPurified: false } },
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.reason).toMatch(/already knows/);
  });

  it("reports unknown buddy distance separately from an unknown moveset", () => {
    const result = generateSecondChargedMoveCandidates({
      inputs: baseInputs(),
      slotIndex: 0,
      currentChargedMoveIds: [CHARGED_CURRENT.id],
      pricing: { kmBuddyDistance: null, isStarterOrBabyFlatRate: false, modifiers: { isShadow: false, isPurified: false } },
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.reason).toMatch(/buddy walking distance/i);
  });
});

describe("second charged move — un-TM-able categories never appear as a target", () => {
  it("never offers Frustration, Return, Secret Sword, or the Super Max + move", () => {
    const result = generateSecondChargedMoveCandidates({
      inputs: baseInputs(),
      slotIndex: 0,
      currentChargedMoveIds: [CHARGED_CURRENT.id],
      pricing: { kmBuddyDistance: 1, isStarterOrBabyFlatRate: false, modifiers: { isShadow: false, isPurified: false } },
    });
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      const ids = result.candidates.map((c) => c.newChargedMoveId);
      expect(ids).not.toContain(FRUSTRATION.id);
      expect(ids).not.toContain(SIGNATURE.id);
      expect(ids).not.toContain(PLUS_MOVE.id);
      expect(ids).toEqual(expect.arrayContaining([CHARGED_BETTER.id, CHARGED_WORSE.id]));
    }
  });

  it("charges every candidate the same priced cost and competes on the stardust/candy axis (deltaTeamDpsPer1000Stardust is populated)", () => {
    const result = generateSecondChargedMoveCandidates({
      inputs: baseInputs(),
      slotIndex: 0,
      currentChargedMoveIds: [CHARGED_CURRENT.id],
      pricing: { kmBuddyDistance: 1, isStarterOrBabyFlatRate: false, modifiers: { isShadow: false, isPurified: false } },
    });
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      for (const c of result.candidates) {
        expect(c.cost).toEqual({ stardust: 10_000, candy: 25 });
        expect(c.deltaTeamDpsPer1000Stardust).not.toBeNull();
        expect(c.deltaTeamDpsPerCandy).not.toBeNull();
      }
    }
  });
});

describe("Elite TM candidates — un-TM-able rejections", () => {
  it("rejects Smeargle entirely, regardless of move", () => {
    const result = generateEliteTmCandidates({
      inputs: baseInputs({ slots: [{ species: SMEARGLE, fastMoveId: FAST_A.id, chargedMoveId: CHARGED_CURRENT.id, isMega: false }] }),
      slotIndex: 0,
      kind: "charged",
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.reason).toMatch(/fixed at capture/);
  });

  it("rejects a currently-held Frustration (Taken Over event required, not modelled live)", () => {
    const result = generateEliteTmCandidates({
      inputs: baseInputs({ slots: [{ species: BASE_MON, fastMoveId: FAST_A.id, chargedMoveId: FRUSTRATION.id, isMega: false }] }),
      slotIndex: 0,
      kind: "charged",
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.reason).toMatch(/Taken Over/);
  });

  it("rejects a currently-held signature move", () => {
    const result = generateEliteTmCandidates({
      inputs: baseInputs({ slots: [{ species: BASE_MON, fastMoveId: FAST_A.id, chargedMoveId: SIGNATURE.id, isMega: false }] }),
      slotIndex: 0,
      kind: "charged",
    });
    expect(result.blocked).toBe(true);
  });

  it("rejects a currently-held Super Max + move", () => {
    const result = generateEliteTmCandidates({
      inputs: baseInputs({ slots: [{ species: BASE_MON, fastMoveId: FAST_A.id, chargedMoveId: PLUS_MOVE.id, isMega: false }] }),
      slotIndex: 0,
      kind: "charged",
    });
    expect(result.blocked).toBe(true);
  });

  it("never offers Frustration, Return, a signature move, or a Super Max + move as a TARGET even when the current move is ordinary", () => {
    const result = generateEliteTmCandidates({ inputs: baseInputs(), slotIndex: 0, kind: "charged" });
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      const ids = result.candidates.map((c) => c.newMoveId);
      expect(ids).not.toContain(FRUSTRATION.id);
      expect(ids).not.toContain(SIGNATURE.id);
      expect(ids).not.toContain(PLUS_MOVE.id);
    }
  });

  it("isTmTargetableMove/isSpeciesTmEligible agree with the above at the unit level", () => {
    expect(isTmTargetableMove(FRUSTRATION)).toBe(false);
    expect(isTmTargetableMove(SIGNATURE)).toBe(false);
    expect(isTmTargetableMove(PLUS_MOVE)).toBe(false);
    expect(isTmTargetableMove(CHARGED_CURRENT)).toBe(true);
    expect(isSpeciesTmEligible(SMEARGLE)).toBe(false);
    expect(isSpeciesTmEligible(BASE_MON)).toBe(true);
  });
});

describe("Elite TM — a candidate that genuinely improves a known moveset", () => {
  it("ranks the strictly stronger move above baseline, clearing the noise floor, and costs exactly 1 Elite Charged TM", () => {
    const result = generateEliteTmCandidates({ inputs: baseInputs(), slotIndex: 0, kind: "charged" });
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      const better = result.candidates.find((c) => c.newMoveId === CHARGED_BETTER.id);
      expect(better).toBeDefined();
      expect(better!.deltaTeamDps).toBeGreaterThan(0);
      expect(better!.deltaExceedsNoise).toBe(true);
      expect(better!.eliteTmItemsSpent).toBe(1);
      expect(better!.currentMoveId).toBe(CHARGED_CURRENT.id);

      const worse = result.candidates.find((c) => c.newMoveId === CHARGED_WORSE.id);
      expect(worse).toBeDefined();
      expect(worse!.deltaTeamDps).toBeLessThanOrEqual(0);
    }
  });

  it("evaluates a Fast TM the same way, off the same current move", () => {
    const result = generateEliteTmCandidates({ inputs: baseInputs(), slotIndex: 0, kind: "fast" });
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      expect(result.candidates.every((c) => c.kind === "fast")).toBe(true);
      expect(result.candidates.every((c) => c.currentMoveId === FAST_A.id)).toBe(true);
      const candidateIds = result.candidates.map((c) => c.newMoveId);
      expect(candidateIds).toEqual([FAST_B.id]);
    }
  });

  it("reports 'no learnable moves left' as an empty candidate list, not a block, when the pool is exhausted", () => {
    const onlyOneChargedMove: SpeciesDefinition = { ...BASE_MON, chargedMoves: [CHARGED_CURRENT] };
    const result = generateEliteTmCandidates({
      inputs: baseInputs({ slots: [{ species: onlyOneChargedMove, fastMoveId: FAST_A.id, chargedMoveId: CHARGED_CURRENT.id, isMega: false }] }),
      slotIndex: 0,
      kind: "charged",
    });
    expect(result).toEqual({ blocked: false, candidates: [] });
  });
});

describe("second charged move — a candidate that genuinely improves a known moveset", () => {
  it("ranks the strictly stronger move above baseline", () => {
    const result = generateSecondChargedMoveCandidates({
      inputs: baseInputs(),
      slotIndex: 0,
      currentChargedMoveIds: [CHARGED_CURRENT.id],
      pricing: { kmBuddyDistance: 1, isStarterOrBabyFlatRate: false, modifiers: { isShadow: false, isPurified: false } },
    });
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      const better = result.candidates.find((c) => c.newChargedMoveId === CHARGED_BETTER.id);
      expect(better).toBeDefined();
      expect(better!.deltaTeamDps).toBeGreaterThan(0);
      expect(better!.deltaExceedsNoise).toBe(true);
    }
  });
});

describe("blocked-slot edge cases", () => {
  it("reports an empty slot for both actions", () => {
    const inputs = baseInputs({ slots: [{ species: null, fastMoveId: null, chargedMoveId: null, isMega: false }] });
    const elite = generateEliteTmCandidates({ inputs, slotIndex: 0, kind: "charged" });
    expect(elite).toEqual({ blocked: true, reason: "This slot is empty." });
    const second = generateSecondChargedMoveCandidates({
      inputs,
      slotIndex: 0,
      currentChargedMoveIds: [],
      pricing: { kmBuddyDistance: 1, isStarterOrBabyFlatRate: false, modifiers: { isShadow: false, isPurified: false } },
    });
    expect(second).toEqual({ blocked: true, reason: "This slot is empty." });
  });
});
