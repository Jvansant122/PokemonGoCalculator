import { describe, expect, it } from "vitest";
import { runComparison } from "../src/comparison.js";
import { findCrossoverPartySize } from "../src/uptime.js";
import { BOSS_GALE, CANDIDATE_ALPHA, CANDIDATE_BETA, LEVEL, PERFECT_IVS } from "./fixtures/hypotheticalDuo.js";

/**
 * Scenario B (tank -> team damage): against a Flying attacker, Alpha's
 * secondary Steel typing resists Flying on top of Beta's Electric
 * resistance, so Alpha takes less per hit and survives longer under
 * identical dodging — even though Alpha still deals less raw damage per
 * charged attack than Beta. This is what produces a crossover in total team
 * contribution as party size grows. See test/fixtures/hypotheticalDuo.ts's
 * BOSS_GALE doc comment for the exact derivation of the numbers below.
 */
describe("Scenario B: Candidate Alpha vs Beta vs Boss Gale (dodging, tank -> team damage)", () => {
  // BOSS_GALE's effective attack (230) is matched to BOSS_TIDE's threat
  // level (see hypotheticalDuo.ts) — a window this long is needed for a real
  // death to actually occur under these assumptions (empirically Alpha
  // faints at 110s, Beta at 83.6s); 150s comfortably covers both and still
  // finishes in milliseconds, this being a deterministic, non-tick-based
  // simulation.
  const OPENING_BURST_SECONDS = 150;

  it("Alpha survives longer than Beta against a Flying attacker under identical dodging", () => {
    const [alpha, beta] = runComparison({
      candidates: [CANDIDATE_ALPHA, CANDIDATE_BETA],
      boss: BOSS_GALE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
      dodgeFastAttacks: true,
      openingBurstSeconds: OPENING_BURST_SECONDS,
    });

    expect(alpha!.secondsSurvived).toBeGreaterThan(beta!.secondsSurvived);
  });

  it("a large enough party size lets Alpha's extra uptime overtake Beta's raw damage lead", () => {
    const [alpha, beta] = runComparison({
      candidates: [CANDIDATE_ALPHA, CANDIDATE_BETA],
      boss: BOSS_GALE,
      level: LEVEL,
      ivs: PERFECT_IVS,
      dodge: { kind: "none" },
      dodgeFastAttacks: true,
      openingBurstSeconds: OPENING_BURST_SECONDS,
    });

    expect(beta!.ownChargedDamage).toBeGreaterThan(alpha!.ownChargedDamage);

    // ownTotalDamage (charged+fast combined) feeds the crossover math, not
    // charged-only — that's the true total DPS output being compared.
    const crossover = findCrossoverPartySize(
      { id: "Alpha", secondsSurvived: alpha!.secondsSurvived, boostMultiplier: alpha!.boostMultiplier, boostedType: alpha!.boostedType, ownDamage: alpha!.ownTotalDamage },
      { id: "Beta", secondsSurvived: beta!.secondsSurvived, boostMultiplier: beta!.boostMultiplier, boostedType: beta!.boostedType, ownDamage: beta!.ownTotalDamage },
      1,
      { a: 1, b: 1 },
    );

    expect(crossover.partySize).not.toBeNull();
    expect(crossover.leaderBelow).toBe("Beta");
    expect(crossover.leaderAtOrAbove).toBe("Alpha");
  });
});
