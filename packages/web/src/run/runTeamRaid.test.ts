import { describe, expect, it } from "vitest";
import { speciesRegistry } from "../registry.js";
import { DEFAULT_TEAM_ASSUMPTIONS } from "../TeamRaidView.js";
import { runTeamRaidScenario } from "./runTeamRaid.js";

// Covers the three engine capabilities wired into this run module by this
// feature batch (friendshipLevel, per-slot isBestBuddy, bossMaxHpOverride) —
// the reselectAfterWipe half is unit-tested directly in
// teamRaidReselect.test.ts, since this environment runs with no `window`
// (vitest.config.ts's `environment: "node"`), so rosterPool.ts's
// loadRosterPool always returns an empty pool here — see run.smoke.test.ts's
// own assertion that rosterPoolSize is 0 in this context.

describe("runTeamRaidScenario — bossMaxHpOverrideEnabled (IDEAS #14)", () => {
  // "abra" has a real recorded 1-Star past-raid encounter with eraHp 600 —
  // found via registry.ts's own pastRaidBossOptions() (not currently an
  // active raid, so this is stable to pin).
  const ERA_HP_TARGET_ID = "abra";
  const ERA_HP = 600;

  it("finds the recorded eraHp match regardless of whether the toggle is on", () => {
    const off = runTeamRaidScenario({ ...DEFAULT_TEAM_ASSUMPTIONS, targetId: ERA_HP_TARGET_ID, bossMaxHpOverrideEnabled: false }, speciesRegistry);
    expect(off.eraHpMatch).not.toBeNull();
    expect(off.eraHpMatch!.eraHp).toBe(ERA_HP);
  });

  it("does NOT apply the override to bossHp while the toggle is off", () => {
    const off = runTeamRaidScenario({ ...DEFAULT_TEAM_ASSUMPTIONS, targetId: ERA_HP_TARGET_ID, bossMaxHpOverrideEnabled: false }, speciesRegistry);
    expect(off.bossHp).not.toBe(ERA_HP);
  });

  it("applies the override to bossHp once the toggle is on — this is the actual bug class this feature exists to avoid (round-trips fine, silently ignored at simulation time)", () => {
    const on = runTeamRaidScenario({ ...DEFAULT_TEAM_ASSUMPTIONS, targetId: ERA_HP_TARGET_ID, bossMaxHpOverrideEnabled: true }, speciesRegistry);
    expect(on.bossHp).toBe(ERA_HP);
  });

  it("has no eraHp match for a species pastRaidBossOptions has no recorded row for at all", () => {
    // "ditto" — real registered species, essentially never a raid boss (no
    // raidHistory.json row of any source), unlike tyranitar-mega/abra above
    // which both genuinely have one. Not asserting the eraHp-bearing case's
    // absence generically (which sources fill in over time as data-sync
    // runs) — this asserts the shape stays well-formed for a species with
    // NO row at all, the common case for most of the species list.
    const result = runTeamRaidScenario({ ...DEFAULT_TEAM_ASSUMPTIONS, targetId: "ditto" }, speciesRegistry);
    expect(result.eraHpMatch).toBeNull();
  });
});

// A short raidTimerSeconds (well under what the default roster needs to
// clear a full-HP boss) keeps the comparison clean: with dodge:"none" and no
// mega-boost timing changes, the boss's own attack cadence RNG stream is
// IDENTICAL between two runs that only differ in friendshipLevel/isBestBuddy
// (neither affects defense or the boss's own behavior), so both runs' first
// fielded slot survives (or not) at the exact same tick — the only thing
// that can differ is how much MORE damage the boosted run's own attacks
// dealt in that identical window. Using the full raid's total damage instead
// (uncapped by a short timer) would be noisier: a higher-damage run can
// finish the boss off with a SMALLER overkill on the final hit, which can
// actually make its own recorded total lower despite genuinely higher output
// per hit — not a useful signal for "did this wiring actually reach the
// engine," which is what these tests exist to prove.
const SHORT_TIMER_SECONDS = 5;

describe("runTeamRaidScenario — friendshipLevel and per-slot isBestBuddy (IDEAS: friendship bonus, Best Buddy)", () => {
  it("a higher friendship tier increases the first slot's own damage output within an identical, non-clearing window", () => {
    const none = runTeamRaidScenario(
      { ...DEFAULT_TEAM_ASSUMPTIONS, friendshipLevel: "none", dodge: { kind: "none" }, raidTimerSeconds: SHORT_TIMER_SECONDS },
      speciesRegistry,
    );
    const best = runTeamRaidScenario(
      { ...DEFAULT_TEAM_ASSUMPTIONS, friendshipLevel: "best", dodge: { kind: "none" }, raidTimerSeconds: SHORT_TIMER_SECONDS },
      speciesRegistry,
    );
    expect(none.data).not.toBeNull();
    expect(best.data).not.toBeNull();
    expect(best.data!.slots[0]!.ownDamageDealt).toBeGreaterThan(none.data!.slots[0]!.ownDamageDealt);
  });

  it("flagging the first slot isBestBuddy increases ITS own damage output within an identical, non-clearing window (the +1 effective level raises its attack stat)", () => {
    const baseline = runTeamRaidScenario(
      { ...DEFAULT_TEAM_ASSUMPTIONS, dodge: { kind: "none" }, raidTimerSeconds: SHORT_TIMER_SECONDS },
      speciesRegistry,
    );
    const withBestBuddy = runTeamRaidScenario(
      {
        ...DEFAULT_TEAM_ASSUMPTIONS,
        dodge: { kind: "none" },
        raidTimerSeconds: SHORT_TIMER_SECONDS,
        slots: DEFAULT_TEAM_ASSUMPTIONS.slots.map((s, i) => (i === 0 ? { ...s, isBestBuddy: true } : s)),
      },
      speciesRegistry,
    );
    expect(baseline.data).not.toBeNull();
    expect(withBestBuddy.data).not.toBeNull();
    expect(withBestBuddy.data!.slots[0]!.ownDamageDealt).toBeGreaterThan(baseline.data!.slots[0]!.ownDamageDealt);
  });
});
