import { describe, expect, it } from "vitest";
import { runSustainedComparison } from "@pogo-analyzer/engine";
import { speciesRegistry } from "../registry.js";
import { DEFAULT_ASSUMPTIONS as COMPARATOR_DEFAULTS } from "../ComparatorView.js";
import { runDodgeExecutionErrorBand } from "./dodgeExecutionErrorSweep.js";

// Cross-checks buildStepwiseParamsForCandidate's own re-assembly of the
// engine's attacker/boss inputs against the SAME simulation's real entry
// point (runSustainedComparison) — the thing this module exists to avoid
// drifting from (see this module's own top doc comment). If the param
// re-assembly ever diverges from comparison.ts's internal construction
// (a field renamed, a modifier dropped), this test catches it directly
// rather than only failing indirectly on some later scenario's numbers.
describe("runDodgeExecutionErrorBand", () => {
  const a = COMPARATOR_DEFAULTS;
  const candidateA = speciesRegistry.get(a.candidateAId);
  const candidateB = speciesRegistry.get(a.candidateBId);
  const boss = speciesRegistry.get(a.targetId);

  it("returns one point per DEFAULT_DODGE_ERROR_MISSED_FRACTIONS entry, ascending", () => {
    const band = runDodgeExecutionErrorBand(
      {
        species: candidateA,
        fastMoveId: a.candidateAFastMoveId,
        chargedMoveId: a.candidateAChargedMoveId,
        level: a.level,
        ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
        megaLevel: a.candidateMegaLevel[0],
        isBestBuddy: false,
        megaBoostDisabled: false,
        dodgeFastAttacks: a.dodgeFastAttacks,
        holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
        boss,
        bossFastMoveId: a.bossFastMoveId,
        bossChargedMoveId: a.bossChargedMoveId,
        bossChargedMoveCadence: a.bossChargedMoveCadence,
        bossChargedMoveMeanIntervalSeconds: a.bossChargedMoveFrequencySeconds,
        bossStartingEnergy: 0,
        weather: a.weather,
        friendshipLevel: a.friendshipLevel,
      },
      {
        species: candidateB,
        fastMoveId: a.candidateBFastMoveId,
        chargedMoveId: a.candidateBChargedMoveId,
        level: a.level,
        ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
        megaLevel: a.candidateMegaLevel[1],
        isBestBuddy: false,
        megaBoostDisabled: false,
        dodgeFastAttacks: a.dodgeFastAttacks,
        holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
        boss,
        bossFastMoveId: a.bossFastMoveId,
        bossChargedMoveId: a.bossChargedMoveId,
        bossChargedMoveCadence: a.bossChargedMoveCadence,
        bossChargedMoveMeanIntervalSeconds: a.bossChargedMoveFrequencySeconds,
        bossStartingEnergy: 0,
        weather: a.weather,
        friendshipLevel: a.friendshipLevel,
      },
    );
    expect(band.length).toBe(6);
    expect(band.map((p) => p.missedFraction)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    for (const p of band) {
      expect(Number.isFinite(p.a.meanTotalDamage)).toBe(true);
      expect(Number.isFinite(p.b.meanTotalDamage)).toBe(true);
    }
  });

  it("its missedFraction=0 endpoint agrees EXACTLY with runSustainedComparison's own dodge:{kind:'perfect'} path — proves the param re-assembly hasn't drifted from the engine's real construction", () => {
    const band = runDodgeExecutionErrorBand(
      {
        species: candidateA,
        fastMoveId: a.candidateAFastMoveId,
        chargedMoveId: a.candidateAChargedMoveId,
        level: a.level,
        ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
        megaLevel: null,
        isBestBuddy: false,
        megaBoostDisabled: false,
        dodgeFastAttacks: false,
        holdChargedMoveUntilSafe: false,
        boss,
        bossFastMoveId: a.bossFastMoveId,
        bossChargedMoveId: a.bossChargedMoveId,
        bossChargedMoveCadence: "fixed-interval",
        bossChargedMoveMeanIntervalSeconds: a.bossChargedMoveFrequencySeconds,
        bossStartingEnergy: 0,
        weather: "none",
        friendshipLevel: "none",
      },
      {
        species: candidateB,
        fastMoveId: a.candidateBFastMoveId,
        chargedMoveId: a.candidateBChargedMoveId,
        level: a.level,
        ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
        megaLevel: null,
        isBestBuddy: false,
        megaBoostDisabled: false,
        dodgeFastAttacks: false,
        holdChargedMoveUntilSafe: false,
        boss,
        bossFastMoveId: a.bossFastMoveId,
        bossChargedMoveId: a.bossChargedMoveId,
        bossChargedMoveCadence: "fixed-interval",
        bossChargedMoveMeanIntervalSeconds: a.bossChargedMoveFrequencySeconds,
        bossStartingEnergy: 0,
        weather: "none",
        friendshipLevel: "none",
      },
    );
    const perfectPoint = band.find((p) => p.missedFraction === 0)!;

    const direct = runSustainedComparison({
      candidates: [candidateA, candidateB],
      candidateFastMoveIds: [a.candidateAFastMoveId, a.candidateBFastMoveId],
      candidateChargedMoveIds: [a.candidateAChargedMoveId, a.candidateBChargedMoveId],
      boss,
      bossFastMoveId: a.bossFastMoveId,
      bossChargedMoveId: a.bossChargedMoveId,
      level: a.level,
      ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
      dodge: { kind: "perfect" },
      bossChargedMoveMeanIntervalSeconds: a.bossChargedMoveFrequencySeconds,
    });

    expect(perfectPoint.a.meanTotalDamage).toBeCloseTo(direct[0]!.meanTotalDamage, 5);
    expect(perfectPoint.a.meanSecondsSurvived).toBeCloseTo(direct[0]!.meanSecondsSurvived, 5);
    expect(perfectPoint.b.meanTotalDamage).toBeCloseTo(direct[1]!.meanTotalDamage, 5);
    expect(perfectPoint.b.meanSecondsSurvived).toBeCloseTo(direct[1]!.meanSecondsSurvived, 5);
  });
});
