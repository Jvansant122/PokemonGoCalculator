import { describe, expect, it } from "vitest";
import { powerUpCostTableFromGameMaster, type PowerUpCostTable } from "../src/powerUp.js";
import { runRosterMoveChangeCandidates, type RosterMoveChangeInputs } from "../src/rosterMoveChange.js";
import { runRosterPlanner, type RosterEntry } from "../src/rosterPlanner.js";
import type { IVSpread } from "../src/types.js";
import { NO_MODIFIERS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT, RAW_POKEMON_UPGRADE_SETTINGS } from "./fixtures/powerUpCosts.js";
import {
  BOSS_ONE,
  CHARGED_MOVE_STRONG,
  CHARGED_MOVE_WEAK,
  FAST_MOVE_WEAK,
  MULTI_MOVE_BENCH_SPECIES,
  MULTI_MOVE_TEAM_SPECIES,
  makeMultiMoveSpecies,
} from "./fixtures/rosterMoveChangeFixtures.js";

/**
 * Roster-mode ("multi-raid") TM move-change candidates — the last piece of
 * PLAN_tm_move_change_optimizer.md's "Both modes, not just single-raid"
 * section. Reuses tmMove.ts's OWN generators for the fielded case (already
 * covered by tmMove.test.ts's 37 tests — not re-verified here), so this
 * file focuses on the WIRING this module adds: per-boss fielding, the
 * "known moveset" exclusion rule applied uniformly, the benched-entry cheap
 * screen + real paired sim, and the two non-blended output axes.
 */

const TABLE: PowerUpCostTable = powerUpCostTableFromGameMaster(RAW_POKEMON_UPGRADE_SETTINGS, RAW_LUCKY_STARDUST_DISCOUNT_PERCENT);
const IVS: IVSpread = { attack: 15, defense: 15, stamina: 15 };

function entry(id: string, species: RosterEntry["species"], level: number, overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    entryId: id,
    species,
    fastMoveId: species.fastMoves[0]!.id,
    chargedMoveId: species.chargedMoves[0]!.id,
    level,
    ivs: IVS,
    costModifiers: NO_MODIFIERS,
    canMega: false,
    ivsAreApproximate: false,
    levelIsApproximate: false,
    movesetIsDefaulted: false,
    knownChargedMoveIds: [species.chargedMoves[0]!.id],
    candyFamilyId: species.candyFamilyId,
    ...overrides,
  };
}

function fieldedTeam(level = 30): RosterEntry[] {
  return MULTI_MOVE_TEAM_SPECIES.map((sp, i) => entry(`team-${i}`, sp, level));
}

function baseInputs(pool: RosterEntry[], overrides: Partial<RosterMoveChangeInputs> = {}): RosterMoveChangeInputs {
  const targets = [{ species: BOSS_ONE }];
  const planResult = runRosterPlanner({
    pool,
    targets,
    costTable: TABLE,
    stardustOnHand: 10_000_000,
    candyByFamilyId: Object.fromEntries(pool.map((e) => [e.candyFamilyId!, { candy: 1_000_000, xlCandy: 1_000_000 }])),
    dodge: { kind: "none" },
    bossChargedMoveMeanIntervalSeconds: 3,
    raidTimerSeconds: 300,
    screenIterations: 3,
    iterations: 3,
    swapCostSeconds: 0,
  });
  return {
    pool,
    targets,
    baselinePerBoss: planResult.baselinePerBoss,
    candyByFamilyId: Object.fromEntries(pool.map((e) => [e.candyFamilyId!, { candy: 1_000_000, xlCandy: 1_000_000 }])),
    rareCandyOnHand: 1000,
    eliteFastTmOnHand: 5,
    eliteChargedTmOnHand: 5,
    dodge: { kind: "none" },
    bossChargedMoveMeanIntervalSeconds: 3,
    raidTimerSeconds: 300,
    iterations: 3,
    swapCostSeconds: 0,
    ...overrides,
  };
}

describe("runRosterMoveChangeCandidates — fielded entries", () => {
  it("generates a real second-charged-move candidate for a fielded entry with a KNOWN single charged move", () => {
    const pool = fieldedTeam();
    const result = runRosterMoveChangeCandidates(baseInputs(pool));

    const fieldedCandidates = result.secondChargedMove.filter((c) => c.fielded && c.entryId === "team-0");
    expect(fieldedCandidates.length).toBeGreaterThan(0);
    // Two OTHER learnable charged moves beyond the known one (weak -> strong, weak -> third).
    expect(fieldedCandidates.map((c) => c.newChargedMoveId).sort()).toEqual([CHARGED_MOVE_STRONG.id, "tm-charged-third"].sort());
    for (const c of fieldedCandidates) {
      expect(c.cost.stardust).toBe(50_000); // kmBuddyDistance: 3 tier
      expect(c.cost.candy).toBe(50);
      expect(c.bossId).toBe(BOSS_ONE.id);
      expect(typeof c.deltaTeamDps).toBe("number");
    }
  });

  it("generates real Elite Fast and Elite Charged TM candidates for a fielded entry", () => {
    const pool = fieldedTeam();
    const result = runRosterMoveChangeCandidates(baseInputs(pool));

    const fastCandidates = result.eliteTm.filter((c) => c.fielded && c.entryId === "team-0" && c.kind === "fast");
    const chargedCandidates = result.eliteTm.filter((c) => c.fielded && c.entryId === "team-0" && c.kind === "charged");
    expect(fastCandidates.length).toBeGreaterThan(0); // 1 other fast move to switch to
    expect(chargedCandidates.length).toBeGreaterThan(0); // 2 other charged moves
    for (const c of [...fastCandidates, ...chargedCandidates]) {
      expect(c.eliteTmItemsSpent).toBe(1);
      expect(c.currentMoveName).toBeTruthy();
    }
  });

  it("a fielded entry's Elite TM candidate is priced against ITS OWN item pool, never blended with second-charged-move's stardust/candy", () => {
    const pool = fieldedTeam();
    const result = runRosterMoveChangeCandidates(baseInputs(pool, { eliteFastTmOnHand: 0, eliteChargedTmOnHand: 0 }));
    const fastCandidate = result.eliteTm.find((c) => c.fielded && c.kind === "fast")!;
    expect(fastCandidate.affordable).toBe(false); // 0 on hand
    // Second-charged-move affordability is COMPLETELY unaffected by TM item counts.
    const scmCandidate = result.secondChargedMove.find((c) => c.fielded)!;
    expect(scmCandidate.affordable).toBe(true);
  });

  it("excludes a fielded entry whose moveset was never observed (movesetIsDefaulted), from BOTH actions", () => {
    // REPLACE one of the 6 team members (not append) — an appended 7th entry
    // isn't guaranteed to be FIELDED at all (runRosterPlanner's own team
    // selection might bench it instead), which would test the wrong thing.
    const team = fieldedTeam();
    team[0] = entry("unknown-moveset", makeMultiMoveSpecies("tm-unknown"), 30, { movesetIsDefaulted: true, knownChargedMoveIds: undefined });
    const result = runRosterMoveChangeCandidates(baseInputs(team));
    expect(result.secondChargedMove.some((c) => c.entryId === "unknown-moveset")).toBe(false);
    expect(result.eliteTm.some((c) => c.entryId === "unknown-moveset")).toBe(false);
    const row = result.excluded.find((e) => e.entryId === "unknown-moveset");
    expect(row).toBeDefined();
    expect(row!.reason).toMatch(/not observed/i);
  });

  it("excludes an entry from second-charged-move ONLY (not Elite TM) when knownChargedMoveIds is undefined but the moveset isn't flagged defaulted", () => {
    const team = fieldedTeam();
    team[0] = entry("unknown-count", makeMultiMoveSpecies("tm-unknown-count"), 30, { knownChargedMoveIds: undefined });
    const result = runRosterMoveChangeCandidates(baseInputs(team));
    expect(result.secondChargedMove.some((c) => c.entryId === "unknown-count")).toBe(false);
    // Elite TM doesn't need the COUNT, only the currently-active move — still generated.
    expect(result.eliteTm.some((c) => c.entryId === "unknown-count")).toBe(true);
    expect(result.excluded.some((e) => e.entryId === "unknown-count" && /count is unknown/i.test(e.reason))).toBe(true);
  });

  it("excludes an entry already knowing its second charged move (nothing left to buy) with a real reason, not silently", () => {
    const team = fieldedTeam();
    team[0] = entry("already-two", makeMultiMoveSpecies("tm-already-two"), 30, {
      knownChargedMoveIds: [CHARGED_MOVE_WEAK.id, CHARGED_MOVE_STRONG.id],
    });
    const result = runRosterMoveChangeCandidates(baseInputs(team));
    expect(result.secondChargedMove.some((c) => c.entryId === "already-two")).toBe(false);
    expect(result.excluded.some((e) => e.entryId === "already-two" && /already knows/i.test(e.reason))).toBe(true);
  });
});

describe("runRosterMoveChangeCandidates — benched entries (IDEAS: 'not limited to the six already fielded')", () => {
  it("a benched entry provably appears with fielded: false, via a real paired simulation with a positive delta", () => {
    const pool = [...fieldedTeam(50), entry("bench", MULTI_MOVE_BENCH_SPECIES, 50, { fastMoveId: FAST_MOVE_WEAK.id, chargedMoveId: CHARGED_MOVE_WEAK.id })];
    const result = runRosterMoveChangeCandidates(baseInputs(pool, { includeBenchedEntries: true, maxBenchedRealEvaluations: 60 }));

    // Not fielded on the baseline team at all (weaker base stats + weak moveset).
    expect(pool.length).toBe(7);
    const benchedRows = [...result.secondChargedMove, ...result.eliteTm].filter((c) => !c.fielded && c.entryId === "bench");
    expect(benchedRows.length).toBeGreaterThan(0);
    for (const row of benchedRows) {
      expect(row.deltaTeamDps).toBeGreaterThan(0);
      expect(row.deltaExceedsNoise).toBe(true);
    }
    // Elite Charged TM onto the strong move is a real candidate here.
    expect(result.eliteTm.some((c) => !c.fielded && c.entryId === "bench" && c.kind === "charged" && c.newMoveId === CHARGED_MOVE_STRONG.id)).toBe(
      true,
    );
  });

  it("includeBenchedEntries: false produces ZERO benched-flagged rows", () => {
    const pool = [...fieldedTeam(50), entry("bench", MULTI_MOVE_BENCH_SPECIES, 50)];
    const result = runRosterMoveChangeCandidates(baseInputs(pool, { includeBenchedEntries: false }));
    expect([...result.secondChargedMove, ...result.eliteTm].every((c) => c.fielded)).toBe(true);
  });

  it("maxBenchedRealEvaluations caps the number of REAL benched simulations actually performed", () => {
    // Several benched entries, each with real headroom — cap to 1 and confirm
    // at most 1 benched row appears per output array combined.
    const benchEntries = ["bench-1", "bench-2", "bench-3"].map((id) =>
      entry(id, MULTI_MOVE_BENCH_SPECIES, 50, { fastMoveId: FAST_MOVE_WEAK.id, chargedMoveId: CHARGED_MOVE_WEAK.id }),
    );
    const pool = [...fieldedTeam(50), ...benchEntries];
    const result = runRosterMoveChangeCandidates(baseInputs(pool, { includeBenchedEntries: true, maxBenchedRealEvaluations: 1 }));
    const benchedRowCount = [...result.secondChargedMove, ...result.eliteTm].filter((c) => !c.fielded).length;
    expect(benchedRowCount).toBeLessThanOrEqual(1);
  });
});

describe("runRosterMoveChangeCandidates — input validation", () => {
  it("throws when baselinePerBoss doesn't have exactly one entry per target", () => {
    const pool = fieldedTeam();
    const inputs = baseInputs(pool);
    expect(() => runRosterMoveChangeCandidates({ ...inputs, baselinePerBoss: [] })).toThrow(/baselinePerBoss/);
  });

  it("throws on a duplicate entryId", () => {
    // Build a VALID baseline first (runRosterPlanner itself also rejects
    // duplicates, so the duplicate must only appear in the pool passed to
    // runRosterMoveChangeCandidates itself, not in the one used to build
    // baselinePerBoss).
    const pool = fieldedTeam();
    const inputs = baseInputs(pool);
    const duplicatedPool = [...pool, entry("team-0", MULTI_MOVE_BENCH_SPECIES, 30)];
    expect(() => runRosterMoveChangeCandidates({ ...inputs, pool: duplicatedPool })).toThrow(/Duplicate/);
  });

  it("reports a real, positive teamRaidCallCount when candidates were actually simulated", () => {
    const pool = fieldedTeam();
    const result = runRosterMoveChangeCandidates(baseInputs(pool));
    expect(result.teamRaidCallCount).toBeGreaterThan(0);
  });
});
