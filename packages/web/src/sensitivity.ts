import { convertUptimeToTeamDamage, runSustainedComparison } from "@pogo-analyzer/engine";
import type { DodgeBehavior, SpeciesDefinition, SustainedCandidateResult } from "@pogo-analyzer/engine";
import type { Assumptions } from "./AssumptionPanel.js";

export interface SensitivityCheck {
  label: string;
  currentValue: string;
  flips: boolean;
  /** Smaller = closer to a flip. Infinity means no flip was found in the search range. */
  distance: number;
  distanceLabel: string;
}

/**
 * This panel used to run the deterministic opening-burst comparison
 * (runComparison), which meant the boss never threw a charged move at all —
 * so the old binary "Dodging: none<->perfect" check silently could never
 * flip anything (ComparisonInputs.dodge only governs charged-hit dodging),
 * and a boss-cadence check was flat-out impossible (openingBurstSeconds/
 * ComparisonInputs has no bossChargedMoveMeanIntervalSeconds equivalent at
 * all). Switched to runSustainedComparison — the same stepwise/distributional
 * path the live result cards use — so every check here now runs against a
 * model that can actually express what it's supposedly testing.
 */

/**
 * Sensitivity checks below re-run the sustained-phase distribution simulator
 * many times per check (several checks re-simulate dozens of swept values,
 * each requiring both candidates) — the app's default 200 iterations per
 * call would make this panel far too slow to recompute on every assumption
 * change. 25 iterations still gives a stable-enough mean survived-seconds/
 * total-damage for a sensitivity *scan* (which only cares about roughly
 * where a flip sits, not the full distribution's precision/percentiles) at a
 * fraction of the cost. Never used anywhere a result is actually displayed
 * to the user — that's still the full-precision runSustainedComparison call
 * in App.tsx.
 */
const SENSITIVITY_ITERATIONS = 25;

/** The subset of SustainedCandidateResult this file's math actually needs, plus persistsThroughFaint (which SustainedCandidateResult doesn't carry — see App.tsx's own comment on this gap; sourced from the SpeciesDefinition instead, same as App.tsx does for its result cards). */
interface SensitivityCandidate {
  meanSecondsSurvived: number;
  meanTotalDamage: number;
  persistsThroughFaint: boolean;
}

function toSensitivityCandidate(result: SustainedCandidateResult, persistsThroughFaint: boolean): SensitivityCandidate {
  return { meanSecondsSurvived: result.meanSecondsSurvived, meanTotalDamage: result.meanTotalDamage, persistsThroughFaint };
}

function winnerOf(
  x: SensitivityCandidate,
  y: SensitivityCandidate,
  partySize: number,
  teammateDps: number,
  matchingTeammateCount: number,
  boostX: number,
  boostY: number,
): "X" | "Y" {
  // Shared fight length for whichever candidate(s) are flagged
  // persistsThroughFaint (see SpeciesDefinition.boost.persistsThroughFaint) —
  // the longer of the two mean survival times stands in for "the rest of the
  // fight" here, same as App.tsx's chartMaxSeconds does for the displayed
  // results.
  const fightDurationSeconds = Math.max(x.meanSecondsSurvived, y.meanSecondsSurvived);
  const totalX =
    x.meanTotalDamage +
    convertUptimeToTeamDamage({
      secondsSurvived: x.meanSecondsSurvived,
      boostMultiplier: boostX,
      teammateCount: partySize,
      matchingTeammateCount,
      teammateDps,
      persistsThroughFaint: x.persistsThroughFaint,
      fightDurationSeconds,
    });
  const totalY =
    y.meanTotalDamage +
    convertUptimeToTeamDamage({
      secondsSurvived: y.meanSecondsSurvived,
      boostMultiplier: boostY,
      teammateCount: partySize,
      matchingTeammateCount,
      teammateDps,
      persistsThroughFaint: y.persistsThroughFaint,
      fightDurationSeconds,
    });
  return totalX >= totalY ? "X" : "Y";
}

/**
 * Phase 4, point 10: for the current scenario, find which single assumption —
 * if flipped — changes the winner, ranked by how close it sits to that flip.
 * Each check holds every other assumption fixed at its current value.
 */
export function computeSensitivity(
  candidates: [SpeciesDefinition, SpeciesDefinition],
  boss: SpeciesDefinition,
  a: Assumptions,
): SensitivityCheck[] {
  const ivs = { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina };
  const moveSelections = {
    candidateFastMoveIds: [a.candidateAFastMoveId, a.candidateBFastMoveId],
    candidateChargedMoveIds: [a.candidateAChargedMoveId, a.candidateBChargedMoveId],
    bossFastMoveId: a.bossFastMoveId,
    bossChargedMoveId: a.bossChargedMoveId,
  };
  // boostMultiplier/persistsThroughFaint aren't on SustainedCandidateResult
  // (unlike the old CandidateResult) — read straight off the SpeciesDefinition,
  // same as App.tsx's result cards already do.
  const persistsThroughFaint: [boolean, boolean] = [
    candidates[0]!.boost?.persistsThroughFaint ?? false,
    candidates[1]!.boost?.persistsThroughFaint ?? false,
  ];
  const boostMultipliers: [number, number] = [candidates[0]!.boost?.multiplier ?? 1, candidates[1]!.boost?.multiplier ?? 1];

  function runSustained(overrides: {
    level?: number;
    dodge?: DodgeBehavior;
    bossChargedMoveMeanIntervalSeconds?: number;
  } = {}): [SensitivityCandidate, SensitivityCandidate] {
    const results = runSustainedComparison({
      candidates,
      boss,
      level: overrides.level ?? a.level,
      ivs,
      dodge: overrides.dodge ?? a.dodge,
      dodgeFastAttacks: a.dodgeFastAttacks,
      holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
      bossChargedMoveMeanIntervalSeconds: overrides.bossChargedMoveMeanIntervalSeconds ?? a.bossChargedMoveFrequencySeconds,
      iterations: SENSITIVITY_ITERATIONS,
      ...moveSelections,
    });
    return [
      toSensitivityCandidate(results[0]!, persistsThroughFaint[0]),
      toSensitivityCandidate(results[1]!, persistsThroughFaint[1]),
    ];
  }

  const [x, y] = runSustained();
  const currentWinner = winnerOf(x, y, a.partySize, a.teammateDps, a.matchingTeammateCount, boostMultipliers[0], boostMultipliers[1]);

  const checks: SensitivityCheck[] = [];

  // 1. Party size: scan 1-20 for the nearest flip. (Considered swapping this
  // to the engine's own findCrossoverPartySize, which exists and is tested
  // but has zero call sites in packages/web today — declined: that function
  // anchors its "flip" to wherever the sweep's own leader first changes
  // starting from party size 1, not to the specific currently-configured
  // party size's actual winner (currentWinner here) — the two only agree if
  // leadership only crosses once across the whole 1-20 range. Usually true
  // for this linear team-damage math, but not guaranteed, and this loop
  // already anchors correctly to currentWinner with no extra risk, so kept.)
  {
    let crossing: number | null = null;
    for (let n = 1; n <= 20; n++) {
      const w = winnerOf(x, y, n, a.teammateDps, a.matchingTeammateCount, boostMultipliers[0], boostMultipliers[1]);
      if (w !== currentWinner) {
        crossing = n;
        break;
      }
    }
    checks.push({
      label: "Party size",
      currentValue: `${a.partySize}`,
      flips: crossing !== null,
      distance: crossing === null ? Infinity : Math.abs(crossing - a.partySize),
      distanceLabel: crossing === null ? "no flip found in 1-20" : `flips at party size ${crossing}`,
    });
  }

  // 2. Matching teammate count: scan the full 0..partySize range for the nearest flip.
  {
    let nearest: number | null = null;
    for (let delta = 1; delta <= a.partySize; delta++) {
      const candidates2 = [a.matchingTeammateCount - delta, a.matchingTeammateCount + delta].filter((n) => n >= 0 && n <= a.partySize);
      const flipped = candidates2.find(
        (n) => winnerOf(x, y, a.partySize, a.teammateDps, n, boostMultipliers[0], boostMultipliers[1]) !== currentWinner,
      );
      if (flipped !== undefined) {
        nearest = delta;
        break;
      }
    }
    checks.push({
      label: "Matching teammates (of party)",
      currentValue: `${a.matchingTeammateCount}/${a.partySize}`,
      flips: nearest !== null,
      distance: nearest ?? Infinity,
      distanceLabel: nearest === null ? `no flip across 0-${a.partySize} matching` : `flips within ${nearest} teammate(s)`,
    });
  }

  // 3. Mega boost multiplier: scan down from the current value toward 1.0.
  {
    let flipAt: number | null = null;
    for (let m = boostMultipliers[0]; m >= 1.0; m -= 0.02) {
      const w = winnerOf(x, y, a.partySize, a.teammateDps, a.matchingTeammateCount, m, m);
      if (w !== currentWinner) {
        flipAt = Math.round(m * 100) / 100;
        break;
      }
    }
    checks.push({
      label: "Mega boost multiplier",
      currentValue: `${boostMultipliers[0]}x`,
      flips: flipAt !== null,
      distance: flipAt === null ? Infinity : Math.abs(boostMultipliers[0] - flipAt),
      distanceLabel: flipAt === null ? "no flip down to 1.0x" : `flips at ${flipAt}x`,
    });
  }

  // 4. Dodge accuracy: continuous scan of missedFraction (0 = perfect dodge,
  // 1 = no dodge at all — the same axis {kind:"none"}/{kind:"perfect"} sit at
  // the ends of, per breakpoints.ts's dodgeMultiplierForHit) instead of the
  // old binary none<->perfect swap, scanning outward in both directions from
  // the currently-configured accuracy for the nearest flip. This now
  // genuinely simulates the boss's charged-move dodging (via
  // runSustainedComparison) instead of the opening burst, where dodge was
  // documented as inert — this check could previously never report a real
  // flip; it now can.
  {
    const currentMissedFraction = a.dodge.kind === "none" ? 1 : a.dodge.kind === "perfect" ? 0 : a.dodge.missedFraction;
    const step = 0.05;
    let flipAtFraction: number | null = null;
    for (let delta = step; delta <= 1 + 1e-9; delta += step) {
      const tryFractions = [currentMissedFraction - delta, currentMissedFraction + delta].filter((f) => f >= -1e-9 && f <= 1 + 1e-9);
      for (const f of tryFractions) {
        const missedFraction = Math.min(1, Math.max(0, Math.round(f * 100) / 100));
        const [dx, dy] = runSustained({ dodge: { kind: "percentage-missed", missedFraction } });
        const w = winnerOf(dx, dy, a.partySize, a.teammateDps, a.matchingTeammateCount, boostMultipliers[0], boostMultipliers[1]);
        if (w !== currentWinner) {
          flipAtFraction = missedFraction;
          break;
        }
      }
      if (flipAtFraction !== null) break;
    }
    const currentAccuracyPct = (1 - currentMissedFraction) * 100;
    checks.push({
      label: "Dodge accuracy (boss charged attacks)",
      currentValue: `${currentAccuracyPct.toFixed(0)}% dodged (${a.dodge.kind})`,
      flips: flipAtFraction !== null,
      distance: flipAtFraction === null ? Infinity : Math.abs(flipAtFraction - currentMissedFraction) * 100,
      distanceLabel:
        flipAtFraction === null
          ? "no flip across 0-100% dodge accuracy"
          : `flips at ~${((1 - flipAtFraction) * 100).toFixed(0)}% dodge accuracy`,
    });
  }

  // 5. Level: scan nearby levels for the nearest flip.
  {
    let nearest: number | null = null;
    for (let delta = 0.5; delta <= 10; delta += 0.5) {
      for (const candidateLevel of [a.level - delta, a.level + delta]) {
        if (candidateLevel < 1 || candidateLevel > 40) continue;
        let result;
        try {
          result = runSustained({ level: candidateLevel });
        } catch {
          continue;
        }
        const [lx, ly] = result;
        const w = winnerOf(lx, ly, a.partySize, a.teammateDps, a.matchingTeammateCount, boostMultipliers[0], boostMultipliers[1]);
        if (w !== currentWinner) {
          nearest = delta;
          break;
        }
      }
      if (nearest !== null) break;
    }
    checks.push({
      label: "Level",
      currentValue: `${a.level}`,
      flips: nearest !== null,
      distance: nearest ?? Infinity,
      distanceLabel: nearest === null ? "no flip within +/-10 levels" : `flips within ${nearest} level(s)`,
    });
  }

  // 6. Average teammate DPS: teammateDps is the literal unit "seconds
  // survived" gets converted into (convertUptimeToTeamDamage) — scan up/down
  // from the current value for the nearest flip. Pure post-processing (no
  // re-simulation needed): teammateDps never touches the simulator, only the
  // team-damage conversion, so this reuses the already-computed x/y exactly
  // like checks 1-3 above.
  {
    const maxScan = Math.max(a.teammateDps * 3, 200);
    const step = Math.max(0.5, a.teammateDps / 40);
    let flipAt: number | null = null;
    for (let delta = step; delta <= maxScan; delta += step) {
      const tryValues = [a.teammateDps - delta, a.teammateDps + delta].filter((v) => v >= 0);
      const flipped = tryValues.find(
        (v) => winnerOf(x, y, a.partySize, v, a.matchingTeammateCount, boostMultipliers[0], boostMultipliers[1]) !== currentWinner,
      );
      if (flipped !== undefined) {
        flipAt = flipped;
        break;
      }
    }
    checks.push({
      label: "Average teammate DPS",
      currentValue: `${a.teammateDps}`,
      flips: flipAt !== null,
      distance: flipAt === null ? Infinity : Math.abs(flipAt - a.teammateDps),
      distanceLabel: flipAt === null ? `no flip within +/-${maxScan.toFixed(0)} DPS` : `flips at ~${flipAt.toFixed(1)} DPS`,
    });
  }

  // 7. Boss charged-move cadence (mean seconds between casts): governs the
  // time pressure both candidates fight under — a slower cadence favors a
  // durable-but-lower-DPS candidate's survivability edge, a faster one
  // compresses both survival windows toward raw own-DPS. Requires
  // re-simulation (this value feeds the stepwise simulator directly, unlike
  // teammateDps above), scanning outward in both directions from the current
  // setting within a 1-40s bound (covers real raid cadences).
  {
    const current = a.bossChargedMoveFrequencySeconds;
    const step = 2;
    const minBound = 1;
    const maxBound = 40;
    let flipAt: number | null = null;
    for (let delta = step; delta <= maxBound; delta += step) {
      const tryValues = [current - delta, current + delta].filter((v) => v >= minBound && v <= maxBound);
      for (const v of tryValues) {
        const [cx, cy] = runSustained({ bossChargedMoveMeanIntervalSeconds: v });
        const w = winnerOf(cx, cy, a.partySize, a.teammateDps, a.matchingTeammateCount, boostMultipliers[0], boostMultipliers[1]);
        if (w !== currentWinner) {
          flipAt = v;
          break;
        }
      }
      if (flipAt !== null) break;
    }
    checks.push({
      label: "Boss charged-move cadence",
      currentValue: `${current}s`,
      flips: flipAt !== null,
      distance: flipAt === null ? Infinity : Math.abs(flipAt - current),
      distanceLabel: flipAt === null ? `no flip within ${minBound}-${maxBound}s` : `flips at ~${flipAt}s between casts`,
    });
  }

  return checks.sort((c1, c2) => c1.distance - c2.distance);
}
