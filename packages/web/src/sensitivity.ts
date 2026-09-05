import { convertUptimeToTeamDamage, runComparison } from "@pogo-analyzer/engine";
import type { CandidateResult, DodgeBehavior, SpeciesDefinition } from "@pogo-analyzer/engine";
import type { Assumptions } from "./AssumptionPanel.js";

export interface SensitivityCheck {
  label: string;
  currentValue: string;
  flips: boolean;
  /** Smaller = closer to a flip. Infinity means no flip was found in the search range. */
  distance: number;
  distanceLabel: string;
}

function winnerOf(x: CandidateResult, y: CandidateResult, partySize: number, teammateDps: number, matchingTeammateCount: number, boostX: number, boostY: number): "X" | "Y" {
  const totalX = x.ownTotalDamage + convertUptimeToTeamDamage({ secondsSurvived: x.secondsSurvived, boostMultiplier: boostX, teammateCount: partySize, matchingTeammateCount, teammateDps });
  const totalY = y.ownTotalDamage + convertUptimeToTeamDamage({ secondsSurvived: y.secondsSurvived, boostMultiplier: boostY, teammateCount: partySize, matchingTeammateCount, teammateDps });
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
  const base = runComparison({ candidates, boss, level: a.level, ivs, dodge: a.dodge, ...moveSelections });
  const [x, y] = base as [CandidateResult, CandidateResult];
  const currentWinner = winnerOf(x, y, a.partySize, a.teammateDps, a.matchingTeammateCount, x.boostMultiplier, y.boostMultiplier);

  const checks: SensitivityCheck[] = [];

  // 1. Party size: use the crossover point directly for an exact distance.
  {
    let crossing: number | null = null;
    for (let n = 1; n <= 20; n++) {
      const w = winnerOf(x, y, n, a.teammateDps, a.matchingTeammateCount, x.boostMultiplier, y.boostMultiplier);
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
      const flipped = candidates2.find((n) => winnerOf(x, y, a.partySize, a.teammateDps, n, x.boostMultiplier, y.boostMultiplier) !== currentWinner);
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
    for (let m = x.boostMultiplier; m >= 1.0; m -= 0.02) {
      const w = winnerOf(x, y, a.partySize, a.teammateDps, a.matchingTeammateCount, m, m);
      if (w !== currentWinner) {
        flipAt = Math.round(m * 100) / 100;
        break;
      }
    }
    checks.push({
      label: "Mega boost multiplier",
      currentValue: `${x.boostMultiplier}x`,
      flips: flipAt !== null,
      distance: flipAt === null ? Infinity : Math.abs(x.boostMultiplier - flipAt),
      distanceLabel: flipAt === null ? "no flip down to 1.0x" : `flips at ${flipAt}x`,
    });
  }

  // 4. Dodging: none <-> perfect.
  {
    const flippedDodge: DodgeBehavior = a.dodge.kind === "none" ? { kind: "perfect" } : { kind: "none" };
    const flippedResult = runComparison({ candidates, boss, level: a.level, ivs, dodge: flippedDodge, ...moveSelections });
    const [fx, fy] = flippedResult as [CandidateResult, CandidateResult];
    const flippedWinner = winnerOf(fx, fy, a.partySize, a.teammateDps, a.matchingTeammateCount, fx.boostMultiplier, fy.boostMultiplier);
    const flips = flippedWinner !== currentWinner;
    checks.push({
      label: "Dodging",
      currentValue: a.dodge.kind,
      flips,
      distance: flips ? 0 : Infinity,
      distanceLabel: flips ? `flips if switched to ${flippedDodge.kind}` : "no flip from switching",
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
          result = runComparison({ candidates, boss, level: candidateLevel, ivs, dodge: a.dodge, ...moveSelections });
        } catch {
          continue;
        }
        const [lx, ly] = result as [CandidateResult, CandidateResult];
        const w = winnerOf(lx, ly, a.partySize, a.teammateDps, a.matchingTeammateCount, lx.boostMultiplier, ly.boostMultiplier);
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

  return checks.sort((c1, c2) => c1.distance - c2.distance);
}
