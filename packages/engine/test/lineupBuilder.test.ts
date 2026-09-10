import { describe, expect, it } from "vitest";
import { runLineupBuilder, type LineupBuilderEntry } from "../src/lineupBuilder.js";
import { teamDamageAtRaidSeconds } from "../src/powerUp.js";
import { runTeamRaid, type TeamRaidSlotInput } from "../src/teamRaid.js";
import type { IVSpread } from "../src/types.js";
import {
  CLOSER,
  GENERIC_ATTACKER,
  GENERIC_BOSS,
  MEGA_ONE,
  MEGA_TWO,
  ORDER_BOSS,
  WEAK,
} from "./fixtures/lineupBuilderFixtures.js";

const IVS: IVSpread = { attack: 15, defense: 15, stamina: 15 };

function entry(entryId: string, species: (typeof CLOSER), level: number, canMega = false): LineupBuilderEntry {
  return { entryId, species, fastMoveId: null, chargedMoveId: null, level, ivs: IVS, canMega };
}

describe("runLineupBuilder", () => {
  describe("order search on a brute-forceable small roster", () => {
    // See fixtures/lineupBuilderFixtures.ts's top doc comment for how these
    // numbers were tuned (throwaway scratch script, not hand arithmetic):
    // fielding CLOSER first clears ORDER_BOSS's 250 HP in ~15.1s; fielding it
    // last clears in ~43.0s — a >2x swing from reordering the same roster.
    const pool: LineupBuilderEntry[] = [
      entry("closer", CLOSER, 30),
      entry("w1", WEAK, 30),
      entry("w2", WEAK, 30),
      entry("w3", WEAK, 30),
      entry("w4", WEAK, 30),
      entry("w5", WEAK, 30),
    ];
    const BOSS_HP = 250; // ORDER_BOSS.baseStamina, statsArePrecomputed: true
    const RAID_TIMER = 60;

    function toSlots(order: string[]): TeamRaidSlotInput[] {
      const byId = new Map(pool.map((e) => [e.entryId, e]));
      return order.map((id) => {
        const e = byId.get(id)!;
        return { species: e.species, fastMoveId: null, chargedMoveId: null, isMega: false, level: e.level, ivs: e.ivs };
      });
    }

    /** Same score formula powerUp.ts's summarizeResults uses for one iteration, at a fixed seed — the common yardstick both the brute force and the builder's own winner are measured against below. */
    function trueScore(order: string[]): number {
      const result = runTeamRaid({
        slots: toSlots(order),
        boss: ORDER_BOSS,
        level: 30,
        ivs: IVS,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: 6,
        raidTimerSeconds: RAID_TIMER,
        seed: 1,
      });
      return result.clearsWithinTimer && result.timeToClearSeconds !== null
        ? BOSS_HP / result.timeToClearSeconds
        : teamDamageAtRaidSeconds(result, RAID_TIMER) / RAID_TIMER;
    }

    function permutations<T>(items: T[]): T[][] {
      if (items.length <= 1) return [items];
      const out: T[][] = [];
      for (let i = 0; i < items.length; i++) {
        const rest = [...items.slice(0, i), ...items.slice(i + 1)];
        for (const p of permutations(rest)) out.push([items[i]!, ...p]);
      }
      return out;
    }

    it("finds the true global-optimal order (verified by full brute force over all 720 orderings)", () => {
      let bruteForceBest = -Infinity;
      for (const perm of permutations(pool.map((e) => e.entryId))) {
        const score = trueScore(perm);
        if (score > bruteForceBest) bruteForceBest = score;
      }

      const result = runLineupBuilder({
        pool,
        boss: ORDER_BOSS,
        dodge: { kind: "none" },
        bossChargedMoveMeanIntervalSeconds: 6,
        raidTimerSeconds: RAID_TIMER,
        seed: 1,
      });

      // Structural check: the true optimum always fields CLOSER first (see
      // this describe block's own comment) — the five WEAK clones are
      // mutually interchangeable, so this is the one structural fact brute
      // force actually pins.
      expect(result.winner.slots[0]!.entryId).toBe("closer");

      // Numeric check: the winner's OWN order, re-measured on the exact same
      // single-seed yardstick brute force used, matches the true global
      // maximum (within floating-point tolerance) — i.e. the heuristic
      // search found a genuinely optimal lineup here, not just a
      // structurally-plausible one. (If a future change to this search ever
      // regresses this, replace the exact-match assertion with an explicit
      // gap% assertion and say so — per this project's own testing
      // discipline, a heuristic that quietly gets worse must be caught, not
      // silently re-tolerated.)
      const builderWinnerOrder = result.winner.slots.map((s) => s.entryId);
      const builderWinnerTrueScore = trueScore(builderWinnerOrder);
      expect(builderWinnerTrueScore).toBeCloseTo(bruteForceBest, 9);
    });

    it("a lineup with CLOSER fielded last scores far worse than one with CLOSER fielded first", () => {
      const closerFirst = trueScore(["closer", "w1", "w2", "w3", "w4", "w5"]);
      const closerLast = trueScore(["w1", "w2", "w3", "w4", "w5", "closer"]);
      expect(closerFirst).toBeGreaterThan(closerLast * 2);
    });
  });

  describe("the one-mega constraint", () => {
    it("never fields more than one canMega entry, even when two would otherwise screen well", () => {
      const pool: LineupBuilderEntry[] = [
        entry("mega-one", MEGA_ONE, 35, true),
        entry("mega-two", MEGA_TWO, 35, true),
        entry("g1", GENERIC_ATTACKER, 30),
        entry("g2", GENERIC_ATTACKER, 30),
        entry("g3", GENERIC_ATTACKER, 30),
        entry("g4", GENERIC_ATTACKER, 30),
        entry("g5", GENERIC_ATTACKER, 30),
      ];
      const result = runLineupBuilder({
        pool,
        boss: GENERIC_BOSS,
        dodge: { kind: "perfect" },
        bossChargedMoveMeanIntervalSeconds: 4,
        raidTimerSeconds: 150,
        seed: 1,
      });

      const megaCountIn = (slots: { entryId: string }[]) => slots.filter((s) => s.entryId === "mega-one" || s.entryId === "mega-two").length;
      expect(megaCountIn(result.winner.slots)).toBeLessThanOrEqual(1);
      if (result.runnerUp) expect(megaCountIn(result.runnerUp.slots)).toBeLessThanOrEqual(1);
      for (const decision of result.winner.decisions) {
        for (const considered of decision.considered) {
          // Never even CONSIDERS a second mega once one is already committed.
          if (considered.entryId === "mega-one" || considered.entryId === "mega-two") {
            const megaAlreadyChosenBefore = result.winner.decisions
              .slice(0, decision.slotIndex)
              .some((d) => d.chosenEntryId === "mega-one" || d.chosenEntryId === "mega-two");
            if (megaAlreadyChosenBefore) {
              throw new Error(`Slot ${decision.slotIndex} considered a second mega (${considered.entryId}) after one was already committed.`);
            }
          }
        }
      }
    });
  });

  describe("per-slot levels", () => {
    it("simulates each entry at its OWN level, never a roster mean", () => {
      const pool: LineupBuilderEntry[] = [
        entry("lvl-15", GENERIC_ATTACKER, 15),
        entry("lvl-25", GENERIC_ATTACKER, 25),
        entry("lvl-35", GENERIC_ATTACKER, 35),
        entry("lvl-45", GENERIC_ATTACKER, 45),
      ];
      const result = runLineupBuilder({
        pool,
        boss: GENERIC_BOSS,
        dodge: { kind: "perfect" },
        bossChargedMoveMeanIntervalSeconds: 4,
        raidTimerSeconds: 150,
        seed: 1,
      });

      expect(result.winner.slots).toHaveLength(4);
      const expectedLevelByEntryId = new Map(pool.map((e) => [e.entryId, e.level]));
      for (const slot of result.winner.slots) {
        expect(slot.level).toBe(expectedLevelByEntryId.get(slot.entryId));
      }
      // Genuinely differing, not coincidentally uniform.
      const distinctLevels = new Set(result.winner.slots.map((s) => s.level));
      expect(distinctLevels.size).toBe(4);
    });
  });

  describe("determinism", () => {
    it("produces byte-identical results for the same seed", () => {
      const pool: LineupBuilderEntry[] = [
        entry("mega-one", MEGA_ONE, 35, true),
        entry("g1", GENERIC_ATTACKER, 20),
        entry("g2", GENERIC_ATTACKER, 25),
        entry("g3", GENERIC_ATTACKER, 30),
        entry("g4", GENERIC_ATTACKER, 35),
        entry("g5", GENERIC_ATTACKER, 40),
        entry("g6", GENERIC_ATTACKER, 45),
        entry("g7", GENERIC_ATTACKER, 50),
      ];
      const inputs = {
        pool,
        boss: GENERIC_BOSS,
        dodge: { kind: "perfect" } as const,
        bossChargedMoveMeanIntervalSeconds: 4,
        raidTimerSeconds: 150,
        seed: 7,
      };
      const first = runLineupBuilder(inputs);
      const second = runLineupBuilder(inputs);
      expect(second).toEqual(first);
    });
  });

  describe("a roster too small to fill six slots", () => {
    it("builds a real, shorter lineup instead of erroring", () => {
      const pool: LineupBuilderEntry[] = [entry("only-one", GENERIC_ATTACKER, 30), entry("only-two", GENERIC_ATTACKER, 30)];
      const result = runLineupBuilder({
        pool,
        boss: GENERIC_BOSS,
        dodge: { kind: "perfect" },
        bossChargedMoveMeanIntervalSeconds: 4,
        raidTimerSeconds: 150,
        seed: 1,
      });
      expect(result.winner.slots).toHaveLength(2);
      expect(result.winner.slots.map((s) => s.entryId).sort()).toEqual(["only-one", "only-two"]);
    });
  });

  describe("beamWidth: 1 (pure greedy)", () => {
    it("never produces a runner-up or a margin", () => {
      const pool: LineupBuilderEntry[] = [
        entry("g1", GENERIC_ATTACKER, 30),
        entry("g2", GENERIC_ATTACKER, 30),
        entry("g3", GENERIC_ATTACKER, 30),
      ];
      const result = runLineupBuilder({
        pool,
        boss: GENERIC_BOSS,
        dodge: { kind: "perfect" },
        bossChargedMoveMeanIntervalSeconds: 4,
        raidTimerSeconds: 150,
        seed: 1,
        beamWidth: 1,
      });
      expect(result.runnerUp).toBeNull();
      expect(result.margin).toBeNull();
      expect(result.beamWidth).toBe(1);
    });
  });

  describe("shortlist/screenedPool transparency", () => {
    it("screens every pool entry, and the shortlist is exactly its top slice", () => {
      const pool: LineupBuilderEntry[] = Array.from({ length: 20 }, (_, i) => entry(`g${i}`, GENERIC_ATTACKER, 20 + i));
      const result = runLineupBuilder({
        pool,
        boss: GENERIC_BOSS,
        dodge: { kind: "perfect" },
        bossChargedMoveMeanIntervalSeconds: 4,
        raidTimerSeconds: 150,
        seed: 1,
        shortlistSize: 5,
      });
      expect(result.screenedPool).toHaveLength(20);
      expect(result.shortlist).toHaveLength(5);
      for (let i = 1; i < result.screenedPool.length; i++) {
        expect(result.screenedPool[i - 1]!.screenScore).toBeGreaterThanOrEqual(result.screenedPool[i]!.screenScore);
      }
      expect(result.shortlist).toEqual(result.screenedPool.slice(0, 5));
    });
  });

  describe("validation", () => {
    it("throws on an empty pool", () => {
      expect(() =>
        runLineupBuilder({
          pool: [],
          boss: GENERIC_BOSS,
          dodge: { kind: "perfect" },
          bossChargedMoveMeanIntervalSeconds: 4,
          raidTimerSeconds: 150,
        }),
      ).toThrow(/non-empty pool/);
    });

    it("throws on a duplicate entryId", () => {
      const pool: LineupBuilderEntry[] = [entry("dup", GENERIC_ATTACKER, 30), entry("dup", GENERIC_ATTACKER, 30)];
      expect(() =>
        runLineupBuilder({
          pool,
          boss: GENERIC_BOSS,
          dodge: { kind: "perfect" },
          bossChargedMoveMeanIntervalSeconds: 4,
          raidTimerSeconds: 150,
        }),
      ).toThrow(/Duplicate LineupBuilderEntry\.entryId/);
    });

    it("throws when canMega is set on a species with no boost mechanic", () => {
      const pool: LineupBuilderEntry[] = [entry("bad-mega", GENERIC_ATTACKER, 30, true)];
      expect(() =>
        runLineupBuilder({
          pool,
          boss: GENERIC_BOSS,
          dodge: { kind: "perfect" },
          bossChargedMoveMeanIntervalSeconds: 4,
          raidTimerSeconds: 150,
        }),
      ).toThrow(/flagged canMega but its species has no boost mechanic/);
    });
  });
});
