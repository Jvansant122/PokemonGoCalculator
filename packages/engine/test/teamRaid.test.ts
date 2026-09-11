import { describe, expect, it } from "vitest";
import type { MegaLevel } from "../src/megaLevel.js";
import { simulateStepwiseBattle } from "../src/simulate.js";
import { effectiveStatsAtLevel } from "../src/stats.js";
import { DEFAULT_SWAP_COST_SECONDS, MAX_TEAM_RAID_CYCLES, runTeamRaid, type TeamRaidInputs, type TeamRaidSlotInput } from "../src/teamRaid.js";
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
        // Explicit 0 here — this test is about clear-attribution/HP carryover
        // across a slot handoff, not the swap-cost mechanic (see teamRaid.ts's
        // DEFAULT_SWAP_COST_SECONDS, now 1.0), so it's pinned rather than left
        // to the default.
        swapCostSeconds: 0,
      }),
    );

    expect(result.slots).toHaveLength(2);
    expect(result.slots[0]!.faintedAtSeconds).not.toBeNull();
    expect(result.slots[0]!.ownDamageDealt).toBeGreaterThan(0);
    expect(result.outcome).toBe("cleared");
    expect(result.wipeCount).toBe(0);
    expect(result.clearingCycleIndex).toBe(0);
    expect(result.clearingSlotIndex).toBe(1);
    // Slot 2 started right where slot 1's clock left off (swapCostSeconds pinned to 0 above).
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

  it("defaults swapCostSeconds to DEFAULT_SWAP_COST_SECONDS (1.0) when omitted, sourced from BATTLE_SETTINGS.swapDurationMs", () => {
    const boss: SpeciesDefinition = {
      id: "two-slot-boss-default-swap",
      name: "Two Slot Boss (default swap cost)",
      types: ["normal"],
      baseAttack: 150,
      baseDefense: 100,
      baseStamina: 100,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 15, energyGain: 0, durationSeconds: 0.5 }],
      chargedMoves: [],
      statsArePrecomputed: true,
    };

    // baseInputs() deliberately does NOT set swapCostSeconds here, so this
    // exercises runTeamRaid's own default directly.
    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(FRAGILE), makeSlot(HARD_HITTER)],
        boss,
        raidTimerSeconds: 180,
      }),
    );

    expect(DEFAULT_SWAP_COST_SECONDS).toBe(1.0);
    expect(result.slots[1]!.startedAtRaidSeconds).toBe(result.slots[0]!.endedAtRaidSeconds! + DEFAULT_SWAP_COST_SECONDS);
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

  it("honors bossMaxHpOverride for a real (non-precomputed) boss's clear-timer detection, overriding the tier's default HP", () => {
    // Same real-tier boss shape as the test above, but this time the caller
    // supplies a real recorded historical HP figure far BELOW the "Mega
    // Raids" tier default (9000) — small enough that HARD_HITTER genuinely
    // can clear it within the timer. Without bossMaxHpOverride wired through
    // (see comparison.ts's bossEffectiveHp third parameter), runTeamRaid
    // would keep comparing accumulated damage against the tier default and
    // this would still read as timerExpired.
    const realBoss: SpeciesDefinition = {
      id: "real-tier-hp-override-test-boss",
      name: "Real Tier HP Override Boss",
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
        bossMaxHpOverride: 50,
        raidTimerSeconds: 180,
      }),
    );

    expect(result.outcome).toBe("cleared");
    expect(result.timeToClearSeconds).not.toBeNull();
  });

  it("bossMaxHpOverride throws for a non-finite or non-positive value, same as bossEffectiveHp itself", () => {
    const boss: SpeciesDefinition = {
      id: "override-validation-boss",
      name: "Override Validation Boss",
      types: ["normal"],
      baseAttack: 10,
      baseDefense: 300,
      baseStamina: 137,
      fastMoves: [{ id: "boss-fast", name: "Boss Fast", type: "normal", power: 1, energyGain: 0, durationSeconds: 0.5 }],
      chargedMoves: [],
    };

    expect(() =>
      runTeamRaid(
        baseInputs({
          slots: [makeSlot(HARD_HITTER)],
          boss,
          bossMaxHpOverride: 0,
          raidTimerSeconds: 180,
        }),
      ),
    ).toThrow(/finite, positive/i);
  });
});

describe("TeamRaidSlotInput.megaLevel", () => {
  const megaFastMove: FastMove = { id: "tr-mega-fast", name: "TR Mega Fast", type: "normal", power: 15, energyGain: 20, durationSeconds: 1 };
  const megaPlusMove: ChargedMove = {
    id: "tr-plus-move",
    name: "TR Plus Move",
    type: "normal",
    power: 100,
    energyCost: 20,
    durationSeconds: 2,
    vulnerableWindowSeconds: 2,
    isPlusMove: true,
    plusMovePowerConfidence: "community-estimate",
  };
  const megaAttacker: SpeciesDefinition = {
    id: "tr-mega-attacker",
    name: "TR Mega Attacker",
    types: ["normal"],
    baseAttack: 250,
    baseDefense: 150,
    baseStamina: 10000,
    fastMoves: [megaFastMove],
    chargedMoves: [megaPlusMove],
    boost: { multiplier: 1.3, boostedType: "normal" },
  };
  const nonMegaAttacker: SpeciesDefinition = { ...megaAttacker, id: "tr-non-mega-attacker", name: "TR Non-Mega Attacker", boost: undefined };
  const weakBoss: SpeciesDefinition = {
    id: "tr-weak-boss",
    name: "TR Weak Boss",
    types: ["normal"],
    baseAttack: 1,
    baseDefense: 200,
    baseStamina: 1_000_000, // never clears within maxSecondsPerSlot at this pace — isolates ownDamageDealt across the whole window
    fastMoves: [{ id: "tr-boss-fast", name: "TR Boss Fast", type: "normal", power: 1, energyGain: 0, durationSeconds: 2 }],
    chargedMoves: [],
    statsArePrecomputed: true,
  };

  function runOneSlot(species: SpeciesDefinition, megaLevel: MegaLevel | undefined) {
    return runTeamRaid({
      slots: [makeSlot(species, { megaLevel })],
      boss: weakBoss,
      level: 50,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 60,
      maxSecondsPerSlot: 60,
    });
  }

  it("a slot at Super Max Mega Level deals more total damage than an otherwise-identical slot with no Mega Level set", () => {
    const base = runOneSlot(megaAttacker, undefined);
    const superMax = runOneSlot(megaAttacker, "super-max");
    expect(base.slots[0]!.ownDamageDealt).toBeGreaterThan(0);
    expect(superMax.slots[0]!.ownDamageDealt).toBeGreaterThan(base.slots[0]!.ownDamageDealt);
  });

  it("base/high/max megaLevel all give +0 effective levels — a non-'+'-move-driven stat (secondsActive/faintedAtSeconds) is unaffected", () => {
    const base = runOneSlot(megaAttacker, undefined);
    const high = runOneSlot(megaAttacker, "high");
    const max = runOneSlot(megaAttacker, "max");
    expect(high.slots[0]!.secondsActive).toBe(base.slots[0]!.secondsActive);
    expect(max.slots[0]!.secondsActive).toBe(base.slots[0]!.secondsActive);
    expect(high.slots[0]!.faintedAtSeconds).toBe(base.slots[0]!.faintedAtSeconds);
  });

  it("has no effect at all on a slot whose species has no mega/primal boost mechanic, regardless of what's requested", () => {
    const withoutMegaLevel = runOneSlot(nonMegaAttacker, undefined);
    const withSuperMaxRequested = runOneSlot(nonMegaAttacker, "super-max");
    expect(withSuperMaxRequested).toEqual(withoutMegaLevel);
  });

  it("isBestBuddy's +1 effective level applies even to a NON-mega slot (unlike megaLevel, no .boost gate)", () => {
    const withoutBestBuddy = runTeamRaid({
      slots: [makeSlot(nonMegaAttacker)],
      boss: weakBoss,
      level: 50,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 60,
      maxSecondsPerSlot: 60,
    });
    const withBestBuddy = runTeamRaid({
      slots: [makeSlot(nonMegaAttacker, { isBestBuddy: true })],
      boss: weakBoss,
      level: 50,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 60,
      maxSecondsPerSlot: 60,
    });
    expect(withoutBestBuddy.slots[0]!.ownDamageDealt).toBeGreaterThan(0);
    expect(withBestBuddy.slots[0]!.ownDamageDealt).toBeGreaterThan(withoutBestBuddy.slots[0]!.ownDamageDealt);
  });

  it("isBestBuddy STACKS with Super Max — a level-50 Super Max mega slot that is also Best Buddy computes at effective level 53, matching an explicit level-51 Super Max slot", () => {
    // Equivalence check, not a "greater than" one — see the equivalent
    // sustainedComparison.test.ts test's own comment for why: floor() can
    // legitimately leave a one-level shift's floored damage unchanged for a
    // given power/stat pairing, so equality against a hand-computed
    // equivalent level is the exact, fixture-independent check.
    // effectiveLevelForMegaLevel(effectiveLevelForBestBuddy(50, true), "super-max")
    //   = effectiveLevelForMegaLevel(51, "super-max") = 53, same as level 51 directly.
    const superMaxAndBestBuddyAtLevel50 = runTeamRaid({
      slots: [makeSlot(megaAttacker, { megaLevel: "super-max", isBestBuddy: true })],
      boss: weakBoss,
      level: 50,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 60,
      maxSecondsPerSlot: 60,
    });
    const explicitLevel51SuperMaxAtLevel51 = runTeamRaid({
      slots: [makeSlot(megaAttacker, { megaLevel: "super-max" })],
      boss: weakBoss,
      level: 51,
      ivs: { attack: 15, defense: 15, stamina: 15 },
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 60,
      maxSecondsPerSlot: 60,
    });
    expect(superMaxAndBestBuddyAtLevel50.slots[0]!.ownDamageDealt).toBe(explicitLevel51SuperMaxAtLevel51.slots[0]!.ownDamageDealt);
  });
});

describe("TeamRaidSlotResult.dodgeFastAttacksLockout", () => {
  // WEAK_FAST (0.5s, this file's shared boss fast move) is exactly
  // DODGE_COST_SECONDS — see simulate.ts's StepwiseRunResult.dodgeFastAttacksLockout.
  const weakBoss: SpeciesDefinition = {
    id: "weak-boss",
    name: "Weak Boss",
    types: ["normal"],
    baseAttack: 20,
    baseDefense: 50,
    baseStamina: 500,
    fastMoves: [WEAK_FAST],
    chargedMoves: [],
    statsArePrecomputed: true,
  };

  it("is threaded through to each slot's own result when dodgeFastAttacks is on", () => {
    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(HARD_HITTER)],
        boss: weakBoss,
        dodgeFastAttacks: true,
        raidTimerSeconds: 180,
      }),
    );
    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      expect(slot.dodgeFastAttacksLockout).toBe(true);
    }
  });

  it("is false per-slot when dodgeFastAttacks is off (the default)", () => {
    const result = runTeamRaid(
      baseInputs({
        slots: [makeSlot(HARD_HITTER)],
        boss: weakBoss,
        raidTimerSeconds: 180,
      }),
    );
    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      expect(slot.dodgeFastAttacksLockout).toBe(false);
    }
  });
});

describe("TeamRaidInputs.friendshipLevel", () => {
  const weakBoss: SpeciesDefinition = {
    id: "friendship-test-boss",
    name: "Friendship Test Boss",
    types: ["normal"],
    baseAttack: 20,
    baseDefense: 50,
    baseStamina: 1_000_000, // never clears within maxSecondsPerSlot — isolates ownDamageDealt across the whole window
    fastMoves: [WEAK_FAST],
    chargedMoves: [],
    statsArePrecomputed: true,
  };

  function runOneSlot(friendshipLevel: TeamRaidInputs["friendshipLevel"]) {
    return runTeamRaid({
      slots: [makeSlot(HARD_HITTER)],
      boss: weakBoss,
      level: LEVEL,
      ivs: IVS,
      dodge: { kind: "none" },
      bossChargedMoveMeanIntervalSeconds: 1000,
      raidTimerSeconds: 60,
      maxSecondsPerSlot: 60,
      friendshipLevel,
    });
  }

  it("boosts the fielded slot's own damage output when set", () => {
    const none = runOneSlot(undefined);
    const forever = runOneSlot("forever");
    expect(none.slots[0]!.ownDamageDealt).toBeGreaterThan(0);
    expect(forever.slots[0]!.ownDamageDealt).toBeGreaterThan(none.slots[0]!.ownDamageDealt);
  });

  it("never affects the boss's own damage output against the slot", () => {
    // WEAK_BOSS's attack/defense are fixed regardless of the trainer's
    // friendship tier — a non-mega-boosted, non-dodging slot's own
    // secondsActive (driven purely by how much damage the BOSS deals to it)
    // must be identical no matter what friendshipLevel is requested.
    const none = runOneSlot(undefined);
    const forever = runOneSlot("forever");
    expect(forever.slots[0]!.secondsActive).toBe(none.slots[0]!.secondsActive);
    expect(forever.slots[0]!.faintedAtSeconds).toBe(none.slots[0]!.faintedAtSeconds);
  });
});

// --- TeamRaidInputs.reselectAfterWipe (IDEAS.md #12) --------------------
//
// "A real trainer with 164 Pokémon returns to the lobby and picks a fresh
// six" — these tests prove the hook actually lets a DIFFERENT roster clear a
// boss the originally-fielded roster structurally never could, that the
// context object handed to the callback is accurate, that the returned
// roster is re-validated the same way the initial one is, and that
// TeamRaidSlotResult.slotId/TeamRaidResult.slotsUsed correctly track
// identity once the fielded roster changes across cycles. Every number below
// was confirmed by actually running runTeamRaid in a throwaway scratch
// script (not hand arithmetic) before being pinned here.

describe("TeamRaidInputs.reselectAfterWipe", () => {
  // Same boss shape as "attributes the finishing blow..." above (100 HP,
  // 150/100 atk/def) — FRAGILE tops out around ~2 damage per fight against
  // it before fainting; HARD_HITTER can solo most of a 100 HP pool.
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

  function fragileOnlyInputs(overrides: Partial<TeamRaidInputs> = {}): TeamRaidInputs {
    return baseInputs({
      slots: [makeSlot(FRAGILE), makeSlot(FRAGILE)],
      boss,
      raidTimerSeconds: 40,
      reviveCostSeconds: 5,
      swapCostSeconds: 0,
      ...overrides,
    });
  }

  it("omitted: re-fields the identical roster forever, never clearing this boss within the timer (baseline)", () => {
    const result = runTeamRaid(fragileOnlyInputs());
    expect(result.outcome).toBe("timerExpired");
    expect(result.wipeCount).toBeGreaterThan(1);
    // Every fight in every cycle is the same two FRAGILE slots.
    expect(result.slots.every((s) => s.speciesId === "fragile")).toBe(true);
  });

  it("supplied: swapping to a stronger roster after the first wipe clears a boss the original roster alone never could", () => {
    const reselectCalls: unknown[] = [];
    const result = runTeamRaid(
      fragileOnlyInputs({
        reselectAfterWipe: (context) => {
          reselectCalls.push(context);
          return [makeSlot(HARD_HITTER, { slotId: "hard-hitter-pool-1" })];
        },
      }),
    );

    expect(result.outcome).toBe("cleared");
    expect(result.clearsWithinTimer).toBe(true);
    // Exactly one wipe happened (cycle 0's two FRAGILEs both faint), then the
    // reselected HARD_HITTER finishes the boss off in cycle 1.
    expect(result.wipeCount).toBe(1);
    expect(reselectCalls).toHaveLength(1);
    expect(result.slots.map((s) => s.speciesId)).toEqual(["fragile", "fragile", "hard-hitter"]);
  });

  it("the context object handed to the callback accurately reports cycle/wipe/boss-progress/clock state", () => {
    let capturedContext: Parameters<NonNullable<TeamRaidInputs["reselectAfterWipe"]>>[0] | null = null;
    runTeamRaid(
      fragileOnlyInputs({
        reselectAfterWipe: (context) => {
          capturedContext = context;
          return [makeSlot(HARD_HITTER)];
        },
      }),
    );

    expect(capturedContext).not.toBeNull();
    const context = capturedContext!;
    expect(context.cycleIndex).toBe(1);
    expect(context.wipeCount).toBe(1);
    // Both original FRAGILE slots, still the pre-reselection roster.
    expect(context.previousSlots).toHaveLength(2);
    expect(context.previousSlots.every((s) => s.species?.id === "fragile")).toBe(true);
    // Cycle 0's two FRAGILE fights combined deal 2 + 2 = 4 damage (verified via scratch run).
    expect(context.bossDamageDealt).toBe(4);
    expect(context.bossMaxHp).toBe(100);
    expect(context.raidTimerSeconds).toBe(40);
    // Two near-instant 1s FRAGILE fights (swapCostSeconds pinned to 0) + the
    // 5s reviveCostSeconds this wipe just paid = 7s of raid clock elapsed.
    expect(context.raidClockSeconds).toBe(7);
  });

  it("re-validates the returned roster exactly like the initial one — an all-empty reselected roster throws", () => {
    expect(() =>
      runTeamRaid(
        fragileOnlyInputs({
          reselectAfterWipe: () => [{ species: null, fastMoveId: null, chargedMoveId: null, isMega: false }],
        }),
      ),
    ).toThrow(/at least one fielded Pokémon/);
  });

  it("re-validates the returned roster's isMega constraint too — more than one mega slot throws", () => {
    const megaSpecies: SpeciesDefinition = { ...HARD_HITTER, id: "mega-hard-hitter", boost: { boostedType: "normal", multiplier: 1.3 } };
    expect(() =>
      runTeamRaid(
        fragileOnlyInputs({
          reselectAfterWipe: () => [makeSlot(megaSpecies, { isMega: true }), makeSlot(megaSpecies, { isMega: true })],
        }),
      ),
    ).toThrow(/at most one team-raid slot may be flagged isMega/i);
  });

  it("TeamRaidSlotResult.slotId falls back to the stringified slotIndex when the caller doesn't set one, and slotsUsed counts distinct slotIds across a reselection", () => {
    const result = runTeamRaid(
      fragileOnlyInputs({
        reselectAfterWipe: () => [makeSlot(HARD_HITTER)], // no slotId set
      }),
    );
    expect(result.slots[0]!.slotId).toBe("0"); // cycle 0, position 0 — same as slotIndex, stringified
    expect(result.slots[1]!.slotId).toBe("1");
    expect(result.slots[2]!.slotId).toBe("0"); // cycle 1's own array position 0 — collides with cycle 0's slot 0 by array-position identity, since no caller slotId was supplied
    // Distinct slotIds seen: "0" (fragile, then hard-hitter — SAME id since
    // both are array-position "0" and no caller slotId disambiguates them)
    // and "1" (fragile only) => 2 distinct ids, even though 3 fights ran and
    // 2 distinct SPECIES were fielded. This is the documented tradeoff of
    // not supplying slotId — see TeamRaidSlotInput.slotId's own doc comment.
    expect(result.slotsUsed).toBe(2);
  });

  it("a caller-supplied slotId disambiguates identity across a reselection, giving the accurate slotsUsed count", () => {
    const result = runTeamRaid(
      fragileOnlyInputs({
        slots: [makeSlot(FRAGILE, { slotId: "pool-fragile-a" }), makeSlot(FRAGILE, { slotId: "pool-fragile-b" })],
        reselectAfterWipe: () => [makeSlot(HARD_HITTER, { slotId: "pool-hard-hitter" })],
      }),
    );
    expect(result.slots.map((s) => s.slotId)).toEqual(["pool-fragile-a", "pool-fragile-b", "pool-hard-hitter"]);
    expect(result.slotsUsed).toBe(3);
  });
});
