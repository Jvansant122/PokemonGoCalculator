import { describe, expect, it } from "vitest";
import { runTeamRaid, type TeamRaidSlotInput } from "../src/teamRaid.js";
import {
  buildTeamScenarioUrl,
  decodeTeamScenario,
  encodeTeamScenario,
  type TeamScenario,
  type TeamScenarioSlot,
  parseTeamScenarioFromUrl,
} from "../src/teamScenario.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";

const sampleTeamScenario: TeamScenario = {
  slots: [
    { speciesId: "raichu-mega-x", fastMoveId: null, chargedMoveId: null, isMega: true, megaLevel: null },
    { speciesId: "fragile", fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null },
    { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null },
    { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null },
    { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null },
    { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null },
  ],
  target: "kyogre-primal",
  bossFastMoveId: null,
  bossChargedMoveId: null,
  level: 35,
  ivs: { attack: 15, defense: 15, stamina: 15 },
  dodgeModel: { kind: "none" },
  dodgeFastAttacks: false,
  holdChargedMoveUntilSafe: false,
  weather: "none",
  bossChargedMoveFrequencySeconds: 15,
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0,
  raidTimerSeconds: 300,
  swapCostSeconds: 0,
  reviveCostSeconds: 0,
  showDetailedAssumptions: false,
};

describe("team scenario serialization", () => {
  it("round-trips through encode/decode", () => {
    expect(decodeTeamScenario(encodeTeamScenario(sampleTeamScenario))).toEqual(sampleTeamScenario);
  });

  it("produces a URL-safe string with no padding characters", () => {
    const encoded = encodeTeamScenario(sampleTeamScenario);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("round-trips through a full shareable URL", () => {
    const url = buildTeamScenarioUrl("https://pogo-analyzer.example/team", sampleTeamScenario);
    expect(parseTeamScenarioFromUrl(url)).toEqual(sampleTeamScenario);
  });

  it("returns null when the URL carries no team scenario", () => {
    expect(parseTeamScenarioFromUrl("https://pogo-analyzer.example/team")).toBeNull();
  });

  it("round-trips a non-default reviveCostSeconds rather than silently reverting to 0", () => {
    // Regression guard: reviveCostSeconds is a new user-facing assumption
    // (Section 9 of proposal_sequential_team_raid_tab.md) — a shared link
    // that silently reverts a non-default value to the fastest-possible-play
    // default would misrepresent an intentionally slower/more-cautious
    // scenario as a faster one.
    const withRevive: TeamScenario = { ...sampleTeamScenario, reviveCostSeconds: 13 };
    expect(decodeTeamScenario(encodeTeamScenario(withRevive)).reviveCostSeconds).toBe(13);
    expect(
      parseTeamScenarioFromUrl(buildTeamScenarioUrl("https://pogo-analyzer.example/team", withRevive))!.reviveCostSeconds,
    ).toBe(13);
  });

  it("round-trips a non-default showDetailedAssumptions rather than silently reverting to the collapsed default", () => {
    // Regression guard, same shape as reviveCostSeconds/swapCostSeconds above
    // — folded onto TeamScenario 2026-09-10 (was a packages/web-only bolt-on
    // before this). Plain false default, no inverted-decode trick.
    const detailed: TeamScenario = { ...sampleTeamScenario, showDetailedAssumptions: true };
    expect(decodeTeamScenario(encodeTeamScenario(detailed)).showDetailedAssumptions).toBe(true);
    expect(
      parseTeamScenarioFromUrl(buildTeamScenarioUrl("https://pogo-analyzer.example/team", detailed))!.showDetailedAssumptions,
    ).toBe(true);
    // And the default itself round-trips as false, not omitted.
    expect(decodeTeamScenario(encodeTeamScenario(sampleTeamScenario)).showDetailedAssumptions).toBe(false);
  });

  it("round-trips a non-default swapCostSeconds independently of reviveCostSeconds", () => {
    // These are two distinct assumptions (per-faint swap vs full-wipe
    // revive) that must not collapse into one shared value on the wire.
    const custom: TeamScenario = { ...sampleTeamScenario, swapCostSeconds: 2, reviveCostSeconds: 13 };
    const decoded = decodeTeamScenario(encodeTeamScenario(custom));
    expect(decoded.swapCostSeconds).toBe(2);
    expect(decoded.reviveCostSeconds).toBe(13);
  });

  it("round-trips the per-slot isMega flag and null (empty) slots", () => {
    const decoded = decodeTeamScenario(encodeTeamScenario(sampleTeamScenario));
    expect(decoded.slots[0]!.isMega).toBe(true);
    expect(decoded.slots[1]!.isMega).toBe(false);
    expect(decoded.slots[2]!.speciesId).toBeNull();
    expect(decoded.slots).toHaveLength(6);
  });

  it("round-trips a non-default per-slot megaLevel rather than silently reverting to no Mega Level assumed", () => {
    // Regression guard, same shape as the others above.
    const withMegaLevel: TeamScenario = {
      ...sampleTeamScenario,
      slots: [
        { ...sampleTeamScenario.slots[0]!, megaLevel: "super-max" },
        ...sampleTeamScenario.slots.slice(1),
      ],
    };
    const decoded = decodeTeamScenario(encodeTeamScenario(withMegaLevel));
    expect(decoded.slots[0]!.megaLevel).toBe("super-max");
    expect(decoded.slots[1]!.megaLevel).toBeNull();
    expect(
      parseTeamScenarioFromUrl(buildTeamScenarioUrl("https://pogo-analyzer.example/team", withMegaLevel))!.slots[0]!.megaLevel,
    ).toBe("super-max");
  });

  describe("per-slot level/ivs override", () => {
    it("an existing scenario with no per-slot overrides decodes byte-for-byte identically to before this field existed", () => {
      // sampleTeamScenario's slots never set level/ivs at all (the field is
      // absent, not set to a default) — this is the regression guard that
      // absent really means "use the shared spread," not a hidden default.
      expect(decodeTeamScenario(encodeTeamScenario(sampleTeamScenario))).toEqual(sampleTeamScenario);
      const decoded = decodeTeamScenario(encodeTeamScenario(sampleTeamScenario));
      expect(decoded.slots[0]).not.toHaveProperty("level");
      expect(decoded.slots[0]).not.toHaveProperty("ivs");
    });

    it("round-trips a single overriding slot in a roster of otherwise-shared-level slots", () => {
      const withOneOverride: TeamScenario = {
        ...sampleTeamScenario,
        slots: [
          { ...sampleTeamScenario.slots[0]!, level: 40, ivs: { attack: 0, defense: 15, stamina: 15 } },
          ...sampleTeamScenario.slots.slice(1),
        ],
      };
      const decoded = decodeTeamScenario(encodeTeamScenario(withOneOverride));
      expect(decoded.slots[0]!.level).toBe(40);
      expect(decoded.slots[0]!.ivs).toEqual({ attack: 0, defense: 15, stamina: 15 });
      // Every other slot stays fully absent — the override is per-slot, not
      // roster-wide.
      for (const slot of decoded.slots.slice(1)) {
        expect(slot.level).toBeUndefined();
        expect(slot.ivs).toBeUndefined();
      }
      expect(
        parseTeamScenarioFromUrl(buildTeamScenarioUrl("https://pogo-analyzer.example/team", withOneOverride))!.slots[0]!.level,
      ).toBe(40);
    });

    it("round-trips every slot overriding, each with its own distinct level/ivs", () => {
      const allOverridden: TeamScenario = {
        ...sampleTeamScenario,
        slots: sampleTeamScenario.slots.map((s, i) => ({
          ...s,
          level: 20 + i,
          ivs: { attack: i, defense: 15 - i, stamina: 10 },
        })),
      };
      const decoded = decodeTeamScenario(encodeTeamScenario(allOverridden));
      decoded.slots.forEach((slot, i) => {
        expect(slot.level).toBe(20 + i);
        expect(slot.ivs).toEqual({ attack: i, defense: 15 - i, stamina: 10 });
      });
    });

    it("allows level and ivs to override independently — a slot may override only one of the two", () => {
      const levelOnly: TeamScenario = {
        ...sampleTeamScenario,
        slots: [{ ...sampleTeamScenario.slots[0]!, level: 45 }, ...sampleTeamScenario.slots.slice(1)],
      };
      const ivsOnly: TeamScenario = {
        ...sampleTeamScenario,
        slots: [
          { ...sampleTeamScenario.slots[0]!, ivs: { attack: 1, defense: 2, stamina: 3 } },
          ...sampleTeamScenario.slots.slice(1),
        ],
      };

      const decodedLevelOnly = decodeTeamScenario(encodeTeamScenario(levelOnly));
      expect(decodedLevelOnly.slots[0]!.level).toBe(45);
      expect(decodedLevelOnly.slots[0]!.ivs).toBeUndefined();

      const decodedIvsOnly = decodeTeamScenario(encodeTeamScenario(ivsOnly));
      expect(decodedIvsOnly.slots[0]!.level).toBeUndefined();
      expect(decodedIvsOnly.slots[0]!.ivs).toEqual({ attack: 1, defense: 2, stamina: 3 });
    });

    it("round-trips a mixed roster (some slots overridden, some not, some empty) through a full shareable URL", () => {
      const mixed: TeamScenario = {
        ...sampleTeamScenario,
        slots: [
          { ...sampleTeamScenario.slots[0]!, level: 40, ivs: { attack: 0, defense: 15, stamina: 15 } },
          sampleTeamScenario.slots[1]!, // no override
          { ...sampleTeamScenario.slots[2]!, level: 30 }, // level-only, empty slot
          ...sampleTeamScenario.slots.slice(3),
        ],
      };
      const url = buildTeamScenarioUrl("https://pogo-analyzer.example/team", mixed);
      const decoded = parseTeamScenarioFromUrl(url);
      expect(decoded).toEqual(mixed);
      expect(decoded!.slots[0]!.level).toBe(40);
      expect(decoded!.slots[1]!.level).toBeUndefined();
      expect(decoded!.slots[2]!.level).toBe(30);
      expect(decoded!.slots[2]!.ivs).toBeUndefined();
    });
  });
});

// --- Resolution into runTeamRaid ---------------------------------------
//
// TeamScenario carries no species objects (only ids) since packages/web's
// registry lookup is the only thing that can resolve those, so this engine
// package can't decode a TeamScenario straight into a TeamRaidInputs itself.
// What IS fully engine-owned, and what this section actually verifies, is
// the fallback rule itself ("absent means use the shared spread") once
// species are already resolved — exactly the shape teamRaid.ts's own
// TeamRaidSlotInput.level/.ivs already expect (see that file's doc
// comments). This proves the override actually changes runTeamRaid's
// behavior once resolved, not just that it survives encode/decode.

const WEAK_FAST: FastMove = { id: "weak-fast", name: "Weak Fast", type: "normal", power: 3, energyGain: 3, durationSeconds: 0.5 };
const WEAK_CHARGED: ChargedMove = {
  id: "weak-charged",
  name: "Weak Charged",
  type: "normal",
  power: 20,
  energyCost: 30,
  durationSeconds: 1,
  vulnerableWindowSeconds: 1,
};

const ATTACKER: SpeciesDefinition = {
  id: "attacker",
  name: "Attacker",
  types: ["normal"],
  baseAttack: 200,
  baseDefense: 100,
  baseStamina: 150,
  fastMoves: [WEAK_FAST],
  chargedMoves: [WEAK_CHARGED],
};

const WEAK_BOSS: SpeciesDefinition = {
  id: "weak-boss",
  name: "Weak Boss",
  types: ["normal"],
  baseAttack: 20,
  baseDefense: 50,
  // Tuned (via a throwaway scratch script actually running runTeamRaid, not
  // hand arithmetic) so the shared-level roster (level 15, IV 0/0/0) times
  // out at exactly this HP while the per-slot-overridden roster (level 40,
  // perfect IVs) still clears comfortably within the same 180s timer.
  baseStamina: 2100,
  fastMoves: [WEAK_FAST],
  chargedMoves: [],
  // Hand-authored test boss — see teamRaid.test.ts's identical fixture doc
  // comment for why this flag is required for a hand-authored boss literal.
  statsArePrecomputed: true,
};

/**
 * The resolution rule a caller (e.g. packages/web's runTeamRaidScenario)
 * applies once it has resolved each slot's speciesId into a real
 * SpeciesDefinition: a per-slot override takes priority; its absence falls
 * back to the roster-wide shared value. This mirrors
 * TeamRaidSlotInput.level/.ivs's own doc comments exactly.
 */
function resolveSlotInput(scenario: TeamScenario, slot: TeamScenarioSlot, species: SpeciesDefinition): TeamRaidSlotInput {
  return {
    species,
    fastMoveId: slot.fastMoveId,
    chargedMoveId: slot.chargedMoveId,
    isMega: slot.isMega,
    level: slot.level ?? scenario.level,
    ivs: slot.ivs ?? scenario.ivs,
  };
}

describe("per-slot level/ivs override resolves into TeamRaidSlotInput and changes runTeamRaid's outcome", () => {
  const baseScenario: TeamScenario = {
    ...sampleTeamScenario,
    slots: sampleTeamScenario.slots.map(() => ({ speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null })),
    level: 15, // a weak shared level
    ivs: { attack: 0, defense: 0, stamina: 0 },
    target: "weak-boss",
    raidTimerSeconds: 180,
    bossChargedMoveFrequencySeconds: 1000,
  };

  it("a slot with no override fights at the shared roster-wide level (unchanged behavior)", () => {
    const scenario: TeamScenario = {
      ...baseScenario,
      slots: [{ speciesId: "attacker", fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null }, ...baseScenario.slots.slice(1)],
    };
    const resolved = resolveSlotInput(scenario, scenario.slots[0]!, ATTACKER);
    expect(resolved.level).toBe(15);
    expect(resolved.ivs).toEqual({ attack: 0, defense: 0, stamina: 0 });
  });

  it("a slot with an override fights at ITS OWN level/ivs, clearing meaningfully faster than the shared-level roster would", () => {
    const sharedLevelScenario: TeamScenario = {
      ...baseScenario,
      slots: [{ speciesId: "attacker", fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null }, ...baseScenario.slots.slice(1)],
    };
    const overriddenScenario: TeamScenario = {
      ...baseScenario,
      slots: [
        {
          speciesId: "attacker",
          fastMoveId: null,
          chargedMoveId: null,
          isMega: false,
          megaLevel: null,
          level: 40,
          ivs: { attack: 15, defense: 15, stamina: 15 },
        },
        ...baseScenario.slots.slice(1),
      ],
    };

    const sharedResult = runTeamRaid({
      slots: [resolveSlotInput(sharedLevelScenario, sharedLevelScenario.slots[0]!, ATTACKER)],
      boss: WEAK_BOSS,
      level: sharedLevelScenario.level,
      ivs: sharedLevelScenario.ivs,
      dodge: sharedLevelScenario.dodgeModel,
      raidTimerSeconds: sharedLevelScenario.raidTimerSeconds,
      bossChargedMoveMeanIntervalSeconds: sharedLevelScenario.bossChargedMoveFrequencySeconds,
    });

    const overriddenResult = runTeamRaid({
      slots: [resolveSlotInput(overriddenScenario, overriddenScenario.slots[0]!, ATTACKER)],
      boss: WEAK_BOSS,
      level: overriddenScenario.level,
      ivs: overriddenScenario.ivs,
      dodge: overriddenScenario.dodgeModel,
      raidTimerSeconds: overriddenScenario.raidTimerSeconds,
      bossChargedMoveMeanIntervalSeconds: overriddenScenario.bossChargedMoveFrequencySeconds,
    });

    // The shared-level (15, IV 0/0/0) roster never clears the weak boss
    // within the timer; the SAME slot resolved at its own per-slot override
    // (level 40, perfect IVs) clears comfortably. This is the exact failure
    // mode the feature request measured live (averaging a powered-up slot
    // down to the roster's shared level understates it) — proving here that
    // the override, once resolved, actually reaches runTeamRaid's own
    // per-slot stat computation rather than being silently dropped.
    expect(sharedResult.outcome).toBe("timerExpired");
    expect(overriddenResult.outcome).toBe("cleared");
    expect(overriddenResult.clearsWithinTimer).toBe(true);
  });
});
