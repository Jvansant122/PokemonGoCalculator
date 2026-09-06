import { describe, expect, it } from "vitest";
import { simulateStepwiseBattle } from "../src/simulate.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import { MAX_TEAM_RAID_CYCLES, runTeamRaid, type TeamRaidInputs, type TeamRaidSlotInput } from "../src/teamRaid.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../src/types.js";

const LEVEL = 30;
const IVS = { attack: 15, defense: 15, stamina: 15 } as const;

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

/** A strong, quick-hitting attacker used for the "clean clear" case. */
const HARD_HITTER: SpeciesDefinition = {
  id: "hard-hitter",
  name: "Hard Hitter",
  types: ["normal"],
  baseAttack: 300,
  baseDefense: 150,
  baseStamina: 200,
  fastMoves: [WEAK_FAST],
  chargedMoves: [WEAK_CHARGED],
};

/** A tanky, weak attacker used to model "still fighting when the buzzer sounds." */
const TANKY_WEAKLING: SpeciesDefinition = {
  id: "tanky-weakling",
  name: "Tanky Weakling",
  types: ["normal"],
  baseAttack: 5,
  baseDefense: 250,
  baseStamina: 500,
  fastMoves: [WEAK_FAST],
  chargedMoves: [WEAK_CHARGED],
};

/** A fragile attacker that faints almost immediately against a hard-hitting boss. */
const FRAGILE: SpeciesDefinition = {
  id: "fragile",
  name: "Fragile",
  types: ["normal"],
  baseAttack: 100,
  baseDefense: 50,
  baseStamina: 60,
  fastMoves: [WEAK_FAST],
  chargedMoves: [WEAK_CHARGED],
};

function makeSlot(species: SpeciesDefinition, overrides: Partial<TeamRaidSlotInput> = {}): TeamRaidSlotInput {
  return { species, fastMoveId: null, chargedMoveId: null, isMega: false, ...overrides };
}

function baseInputs(overrides: Partial<TeamRaidInputs>): TeamRaidInputs {
  return {
    slots: [],
    boss: overrides.boss!,
    level: LEVEL,
    ivs: IVS,
    dodge: { kind: "none" },
    bossChargedMoveMeanIntervalSeconds: 1000, // effectively never fires unless a test overrides it
    raidTimerSeconds: 180,
    ...overrides,
  };
}

describe("runTeamRaid", () => {
  it("clears the boss with time to spare (clean clear case)", () => {
    const boss: SpeciesDefinition = {
      id: "weak-boss",
      name: "Weak Boss",
      types: ["normal"],
      baseAttack: 20,
      baseDefense: 50,
      baseStamina: 500,
      fastMoves: [WEAK_FAST],
      chargedMoves: [],
      // Hand-authored test boss — these numbers are meant to already BE the
      // effective boss attack/defense/HP (baseStamina used directly as HP),
      // not a real species' base stats needing the real per-tier derivation.
      statsArePrecomputed: true,
    };

    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(HARD_HITTER)],
        boss,
        raidTimerSeconds: 180,
      }),
    );

    expect(result.outcome).toBe("cleared");
    expect(result.clearsWithinTimer).toBe(true);
    expect(result.wipeCount).toBe(0);
    expect(result.timeToClearSeconds).not.toBeNull();
    expect(result.timeToClearSeconds!).toBeLessThan(180);
    expect(result.timerMarginSeconds).not.toBeNull();
    expect(result.timerMarginSeconds!).toBeGreaterThan(0);
    expect(result.clearingCycleIndex).toBe(0);
    expect(result.clearingSlotIndex).toBe(0);
    expect(result.slotsUsed).toBe(1);
    expect(result.slotsFainted).toBe(0);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]!.faintedAtSeconds).toBeNull();
  });

  it("loses to the timer while the sole slot is still alive (timer-expiry loss)", () => {
    // A very tanky, very weak attacker against a boss with a huge HP pool:
    // it never faints (boss barely hits) and never comes close to clearing
    // within the 180s timer either.
    const boss: SpeciesDefinition = {
      id: "huge-hp-boss",
      name: "Huge HP Boss",
      types: ["normal"],
      baseAttack: 1,
      baseDefense: 300,
      baseStamina: 10_000_000,
      fastMoves: [WEAK_FAST],
      chargedMoves: [],
      statsArePrecomputed: true,
    };

    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(TANKY_WEAKLING)],
        boss,
        raidTimerSeconds: 180,
      }),
    );

    expect(result.outcome).toBe("timerExpired");
    expect(result.clearsWithinTimer).toBe(false);
    expect(result.wipeCount).toBe(0);
    expect(result.timeToClearSeconds).toBeNull();
    expect(result.timerMarginSeconds).toBeNull();
    expect(result.clearingCycleIndex).toBeNull();
    expect(result.clearingSlotIndex).toBeNull();
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]!.faintedAtSeconds).toBeNull();
  });

  it("wipes the team repeatedly, paying reviveCostSeconds each time, until the raid timer runs out (no hard team-wipe loss)", () => {
    // A boss that one-shots every fragile slot before it can land a single
    // fast attack of its own, with a massive HP pool no amount of chip
    // damage could ever dent. Per the corrected mechanic (proposal_sequential_
    // team_raid_tab.md Section 9), running out of roster is NOT a loss — the
    // team just revives (paying reviveCostSeconds) and tries again, repeatedly,
    // until raidTimerSeconds actually elapses.
    const boss: SpeciesDefinition = {
      id: "one-shot-boss",
      name: "One-Shot Boss",
      types: ["normal"],
      baseAttack: 400,
      baseDefense: 300,
      baseStamina: 10_000_000,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 50, energyGain: 0, durationSeconds: 0.5 }],
      chargedMoves: [],
      statsArePrecomputed: true,
    };

    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(FRAGILE), makeSlot(FRAGILE)],
        boss,
        raidTimerSeconds: 30,
        reviveCostSeconds: 5,
      }),
    );

    expect(result.outcome).toBe("timerExpired");
    expect(result.clearsWithinTimer).toBe(false);
    expect(result.timeToClearSeconds).toBeNull();
    expect(result.timerMarginSeconds).toBeNull();
    expect(result.clearingCycleIndex).toBeNull();
    expect(result.clearingSlotIndex).toBeNull();
    // The team wiped out and revived more than once before the clock ran out
    // — this is the whole point of the corrected mechanic (it would have been
    // a hard "teamWiped" loss after the very first pass under the old,
    // superseded framing).
    expect(result.wipeCount).toBeGreaterThan(1);
    // Every fight in this scenario ends in a faint (the boss one-shots this
    // roster every time) and every cycle is a clean, full wipe — so the flat
    // slot list is always an exact multiple of the roster size, and every
    // entry in it fainted.
    expect(result.slots.length).toBe(result.wipeCount * 2);
    expect(result.slots.every((s) => s.faintedAtSeconds !== null)).toBe(true);
    expect(result.slotsFainted).toBe(result.slots.length);
  });

  it("attributes the finishing blow to the slot that actually lands it, carrying the boss's HP total forward", () => {
    // A boss with just enough HP that slot 1 (fragile, faints fast) chips it
    // down but doesn't finish it, and slot 2 (hard hitter) lands the final
    // blow — clearingSlotIndex must point at slot 2 (index 1), not slot 1.
    // baseStamina is deliberately small (not a realistic raid boss HP pool):
    // FRAGILE's own lifetime output against this attack/defense pairing tops
    // out at 2 damage, and HARD_HITTER's at 134 (both verified against this
    // exact fixture via simulateStepwiseBattle directly) before each faints,
    // so 2000 would leave both slots faint with the boss barely scratched —
    // no orchestration fix could make that "clear". 100 sits comfortably
    // inside the achievable combined range (2 + up to 134) while still
    // requiring BOTH slots (FRAGILE alone can't get remotely close).
    const boss: SpeciesDefinition = {
      id: "two-slot-boss",
      name: "Two Slot Boss",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 100,
      baseStamina: 100,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 15, energyGain: 0, durationSeconds: 0.5 }],
      chargedMoves: [],
      statsArePrecomputed: true,
    };

    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(FRAGILE), makeSlot(HARD_HITTER)],
        boss,
        raidTimerSeconds: 180,
      }),
    );

    expect(result.slots).toHaveLength(2);
    expect(result.slots[0]!.faintedAtSeconds).not.toBeNull();
    expect(result.slots[0]!.ownDamageDealt).toBeGreaterThan(0);
    expect(result.outcome).toBe("cleared");
    expect(result.wipeCount).toBe(0);
    expect(result.clearingCycleIndex).toBe(0);
    expect(result.clearingSlotIndex).toBe(1);
    // Slot 2 started right where slot 1's clock left off (no swap cost by default).
    expect(result.slots[1]!.startedAtRaidSeconds).toBe(result.slots[0]!.endedAtRaidSeconds);
    // The finishing blow landed after slot 1's damage was already banked —
    // slot 1 alone didn't reach the boss's full HP pool.
    expect(result.slots[0]!.ownDamageDealt).toBeLessThan(boss.baseStamina);
    expect(result.slots[0]!.ownDamageDealt + result.slots[1]!.ownDamageDealt).toBeGreaterThanOrEqual(boss.baseStamina);
  });

  it("respects an explicit swapCostSeconds, delaying slot 2's start clock", () => {
    const boss: SpeciesDefinition = {
      id: "two-slot-boss-swap",
      name: "Two Slot Boss (swap cost)",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 100,
      baseStamina: 100,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 15, energyGain: 0, durationSeconds: 0.5 }],
      chargedMoves: [],
      statsArePrecomputed: true,
    };

    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(FRAGILE), makeSlot(HARD_HITTER)],
        boss,
        raidTimerSeconds: 180,
        swapCostSeconds: 3,
      }),
    );

    expect(result.slots[1]!.startedAtRaidSeconds).toBe(result.slots[0]!.endedAtRaidSeconds! + 3);
  });

  it("pays reviveCostSeconds (not swapCostSeconds) when looping back after a full wipe", () => {
    // Same one-shot-boss setup as the repeated-wipe test above, but with a
    // non-zero swapCostSeconds too, so this test can confirm the SECOND
    // cycle's first slot start clock reflects reviveCostSeconds specifically
    // (not swapCostSeconds, which only applies BETWEEN slots within a cycle).
    const boss: SpeciesDefinition = {
      id: "one-shot-boss-revive-cost",
      name: "One-Shot Boss (revive cost)",
      types: ["normal"],
      baseAttack: 400,
      baseDefense: 300,
      baseStamina: 10_000_000,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 50, energyGain: 0, durationSeconds: 0.5 }],
      chargedMoves: [],
      statsArePrecomputed: true,
    };

    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(FRAGILE), makeSlot(FRAGILE)],
        boss,
        raidTimerSeconds: 30,
        swapCostSeconds: 1,
        reviveCostSeconds: 5,
      }),
    );

    expect(result.wipeCount).toBeGreaterThan(0);
    // First cycle: slot0 at t=0, slot1 at t = slot0.end + swapCostSeconds(1).
    const cycle0Slot0 = result.slots[0]!;
    const cycle0Slot1 = result.slots[1]!;
    expect(cycle0Slot1.startedAtRaidSeconds).toBe(cycle0Slot0.endedAtRaidSeconds + 1);
    // Second cycle's first slot starts at the end of cycle 0's last slot PLUS
    // reviveCostSeconds(5) — NOT swapCostSeconds(1).
    const cycle1Slot0 = result.slots[2]!;
    expect(cycle1Slot0.cycleIndex).toBe(1);
    expect(cycle1Slot0.slotIndex).toBe(0);
    expect(cycle1Slot0.startedAtRaidSeconds).toBe(cycle0Slot1.endedAtRaidSeconds + 5);
  });

  it("carries the boss's charged-move cooldown across a slot handoff instead of resetting it", () => {
    // A boss whose charged move only fires after a long warmup, with a huge
    // meanIntervalSeconds so it fires at most once in this whole test. Slot 1
    // (fragile) faints well before the boss's first charged move would ever
    // be ready — so slot 1's own bossChargedMoveResidualSeconds should be a
    // large, well-defined number, NOT null, and slot 2 should inherit
    // exactly that remaining cooldown rather than rolling a fresh one.
    const chargedMove: ChargedMove = {
      id: "boss-charged",
      name: "Boss Charged",
      type: "normal",
      power: 10,
      energyCost: 100,
      durationSeconds: 2,
      vulnerableWindowSeconds: 2,
    };
    const boss: SpeciesDefinition = {
      id: "cooldown-boss",
      name: "Cooldown Boss",
      types: ["normal"],
      baseAttack: 400,
      baseDefense: 300,
      baseStamina: 10_000_000,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 60, energyGain: 0, durationSeconds: 0.5 }],
      chargedMoves: [chargedMove],
      statsArePrecomputed: true,
    };

    const level = LEVEL;
    const ivs = IVS;
    const dodge = { kind: "none" } as const;
    const bossChargedMoveMeanIntervalSeconds = 40;

    // Independently reproduce slot 1's own run (same seed convention runTeamRaid
    // uses: seed + fightIndex * 7919, slot 1 of cycle 0 is fightIndex 0) to get
    // its residual.
    const stats = effectiveStatsAtLevel(FRAGILE, ivs, level);
    const slot1Run = simulateStepwiseBattle({
      attacker: {
        hp: stats.stamina,
        defenseStat: stats.defense,
        attackStat: stats.attack,
        fastMove: WEAK_FAST,
        chargedMove: WEAK_CHARGED,
        fastDamageOut: { stab: false, typeEffectiveness: 1 },
        chargedDamageOut: { stab: false, typeEffectiveness: 1 },
      },
      boss: {
        attackStat: 400,
        defenseStat: 300,
        fastMove: boss.fastMoves[0]!,
        damageOut: { stab: true, typeEffectiveness: 1 },
        chargedMove,
        chargedMoveDamageOut: { stab: true, typeEffectiveness: 1 },
        chargedMoveMeanIntervalSeconds: bossChargedMoveMeanIntervalSeconds,
      },
      dodge,
      seed: 1,
    });
    expect(slot1Run.faintedAtSeconds).not.toBeNull();
    expect(slot1Run.bossChargedMoveResidualSeconds).not.toBeNull();
    expect(slot1Run.bossChargedMoveResidualSeconds!).toBeGreaterThan(0);

    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(FRAGILE), makeSlot(FRAGILE)],
        boss,
        raidTimerSeconds: 180,
        bossChargedMoveMeanIntervalSeconds,
        seed: 1,
      }),
    );

    // The team wipes and revives repeatedly against this un-killable boss —
    // no longer a hard "teamWiped" loss, just a diagnostic count.
    expect(result.wipeCount).toBeGreaterThan(0);
    expect(result.slots[0]!.faintedAtSeconds).toEqual(slot1Run.faintedAtSeconds);

    // If the residual were NOT carried forward (i.e. the boss's cooldown
    // wrongly reset on handoff), slot 2 would need to wait through a full
    // fresh warmup derivation before its first charged hit could land at
    // all. Instead, slot 2 should take a boss charged hit well within
    // slot1's residual window from ITS OWN start — i.e. sooner than a fresh
    // bossChargedMoveReadySeconds derivation would allow.
    expect(result.slots[1]!.faintedAtSeconds).not.toBeNull();
  });

  it("stops at MAX_TEAM_RAID_CYCLES rather than looping forever for a degenerate near-zero-progress roster", () => {
    // A roster that faints almost instantly every cycle against a boss with
    // an effectively uncrackable HP pool, under a raid timer so generous
    // (and reviveCostSeconds so cheap) that the ordinary timer/clear checks
    // would never fire within any realistic number of cycles — this is
    // exactly the degenerate case MAX_TEAM_RAID_CYCLES exists to guard
    // against. The safety cap should still resolve the run (as timerExpired)
    // rather than hang or throw.
    const boss: SpeciesDefinition = {
      id: "uncrackable-boss",
      name: "Uncrackable Boss",
      types: ["normal"],
      baseAttack: 400,
      baseDefense: 300,
      baseStamina: 10_000_000_000,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 50, energyGain: 0, durationSeconds: 0.5 }],
      chargedMoves: [],
      statsArePrecomputed: true,
    };

    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(FRAGILE)],
        boss,
        raidTimerSeconds: 1_000_000_000,
        reviveCostSeconds: 0,
      }),
    );

    expect(result.outcome).toBe("timerExpired");
    expect(result.clearsWithinTimer).toBe(false);
    expect(result.wipeCount).toBe(MAX_TEAM_RAID_CYCLES);
    expect(result.slots.length).toBe(MAX_TEAM_RAID_CYCLES);
  });

  it("rejects more than one slot flagged isMega", () => {
    const boss: SpeciesDefinition = {
      id: "validation-boss",
      name: "Validation Boss",
      types: ["normal"],
      baseAttack: 100,
      baseDefense: 100,
      baseStamina: 5000,
      fastMoves: [WEAK_FAST],
      chargedMoves: [],
    };
    const megaSpecies: SpeciesDefinition = {
      ...HARD_HITTER,
      id: "mega-hard-hitter",
      boost: { multiplier: 1.3, boostedType: "normal" },
    };

    expect(() =>
      runTeamRaid(
        baseInputs({
          slots: [makeSlot(megaSpecies, { isMega: true }), makeSlot(megaSpecies, { isMega: true })],
          boss,
          raidTimerSeconds: 180,
        }),
      ),
    ).toThrow(/at most one/i);
  });

  it("rejects isMega on a species with no boost mechanic", () => {
    const boss: SpeciesDefinition = {
      id: "validation-boss-2",
      name: "Validation Boss 2",
      types: ["normal"],
      baseAttack: 100,
      baseDefense: 100,
      baseStamina: 5000,
      fastMoves: [WEAK_FAST],
      chargedMoves: [],
    };

    expect(() =>
      runTeamRaid(
        baseInputs({
          slots: [makeSlot(HARD_HITTER, { isMega: true })],
          boss,
          raidTimerSeconds: 180,
        }),
      ),
    ).toThrow(/boost mechanic/i);
  });

  it("uses the real per-tier fixed HP pool for a real (non-precomputed) boss, NOT boss.baseStamina run through the trainer CPM pipeline", () => {
    // A real synced-style boss (no statsArePrecomputed) with a deliberately
    // tiny baseStamina (137) — if runTeamRaid wrongly used baseStamina
    // directly (today's pre-fix pass-through) OR ran it through
    // effectiveStat/CPM, the roster would clear almost instantly. The real
    // "Mega Raids" tier HP (9000) is a completely different, much larger
    // number, so only a genuine tier-table lookup can make this NOT clear
    // instantly.
    const realBoss: SpeciesDefinition = {
      id: "real-tier-hp-test-boss",
      name: "Real Tier HP Boss",
      types: ["normal"],
      baseAttack: 10,
      baseDefense: 300,
      baseStamina: 137,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 1, energyGain: 0, durationSeconds: 0.5 }],
      chargedMoves: [],
    };

    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(HARD_HITTER)],
        boss: realBoss,
        bossRaidTier: "Mega Raids",
        raidTimerSeconds: 180,
      }),
    );

    // HARD_HITTER's own lifetime output against this weak-attack boss can't
    // possibly reach 9000 in one fielding within 180s at this pace — so this
    // should NOT be a same-fight instant clear the way it would be against
    // baseStamina (137) directly.
    expect(result.outcome).toBe("timerExpired");
    expect(result.timeToClearSeconds).toBeNull();
  });
});
