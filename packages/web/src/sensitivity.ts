import { MAX_POKEMON_POWER_UP_LEVEL, convertUptimeToTeamDamage, runSustainedComparison } from "@pogo-analyzer/engine";
import type { DodgeBehavior, RaidTier, SpeciesDefinition, SustainedCandidateResult } from "@pogo-analyzer/engine";
import type { Assumptions } from "./AssumptionPanel.js";

export interface SensitivityCheck {
  label: string;
  currentValue: string;
  flips: boolean;
  /** Smaller = closer to a flip. Infinity means no flip was found in the search range. */
  distance: number;
  distanceLabel: string;
  /**
   * Numeric scan bounds and values backing SensitivityView's per-row flip-bar
   * visualization (a small inline-SVG number line) — kept separate from the
   * pre-formatted strings above since those mix units (DPS, seconds, %,
   * levels, a raw multiplier) that can't be plotted on a shared axis without
   * the raw numbers. rangeMin/rangeMax are the bounds of whichever scan this
   * check actually ran (not a fixed universal range), currentNumericValue is
   * currentValue's numeric form on that same axis, and flipNumericValue is
   * the absolute (not delta) value the flip was found at, or null when no
   * flip was found within the scanned range.
   */
  rangeMin: number;
  rangeMax: number;
  currentNumericValue: number;
  flipNumericValue: number | null;
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
  boostX: number | undefined,
  boostY: number | undefined,
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
  /**
   * See App.tsx's bossRaidTier / registry.ts's raidTierForSpeciesId — must
   * match whatever tier the main displayed result actually used, or this
   * panel's "current winner" baseline (and every flip it reports relative to
   * it) could silently disagree with the result cards above it for a real
   * (non-precomputed) boss. undefined falls back to the engine's own
   * DEFAULT_REAL_RAID_TIER, same as omitting it from runSustainedComparison
   * directly.
   */
  bossRaidTier?: RaidTier,
  /**
   * The boss charged-move mean frequency ACTUALLY driving the main result
   * cards for this scenario — see run/runComparator.ts's own
   * effectiveBossChargedMoveFrequencySeconds (derived from the boss's own
   * fast-move charge time whenever a.showDetailedAssumptions is false).
   * Falls back to a.bossChargedMoveFrequencySeconds (the stored value) when
   * omitted, which only agrees with the real driving value when
   * a.showDetailedAssumptions is true — every real call site should pass
   * this explicitly, or the "current winner" baseline below (and check 7's
   * own scan) can silently disagree with what the result cards above this
   * panel actually show whenever the advanced-assumptions gate is off.
   */
  effectiveBossChargedMoveFrequencySeconds?: number,
): SensitivityCheck[] {
  const ivs = { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina };
  const effectiveBossFreq = effectiveBossChargedMoveFrequencySeconds ?? a.bossChargedMoveFrequencySeconds;
  const moveSelections = {
    candidateFastMoveIds: [a.candidateAFastMoveId, a.candidateBFastMoveId],
    candidateChargedMoveIds: [a.candidateAChargedMoveId, a.candidateBChargedMoveId],
    bossFastMoveId: a.bossFastMoveId,
    bossChargedMoveId: a.bossChargedMoveId,
  };
  // boostMultiplier/persistsThroughFaint aren't on SustainedCandidateResult
  // (unlike the old CandidateResult) — read straight off the SpeciesDefinition,
  // same as App.tsx's result cards already do. Both are gated by the
  // candidateMegaBoostDisabled toggle (per-candidate) — a disabled or
  // genuinely non-mega candidate has boostMultiplier undefined, which must
  // propagate as `undefined` (never a `1` fallback — see uptime.ts's
  // UptimeConversionInputs.boostMultiplier doc comment on why `1` is not
  // equivalent).
  const boostDisabled = a.candidateMegaBoostDisabled;
  const persistsThroughFaint: [boolean, boolean] = [
    (boostDisabled[0] ? false : candidates[0]!.boost?.persistsThroughFaint) ?? false,
    (boostDisabled[1] ? false : candidates[1]!.boost?.persistsThroughFaint) ?? false,
  ];
  const boostMultipliers: [number | undefined, number | undefined] = [
    boostDisabled[0] ? undefined : candidates[0]!.boost?.multiplier,
    boostDisabled[1] ? undefined : candidates[1]!.boost?.multiplier,
  ];

  function runSustained(overrides: {
    level?: number;
    dodge?: DodgeBehavior;
    bossChargedMoveMeanIntervalSeconds?: number;
    ivs?: { attack: number; defense: number; stamina: number };
  } = {}): [SensitivityCandidate, SensitivityCandidate] {
    const results = runSustainedComparison({
      candidates,
      boss,
      bossRaidTier,
      level: overrides.level ?? a.level,
      ivs: overrides.ivs ?? ivs,
      dodge: overrides.dodge ?? a.dodge,
      dodgeFastAttacks: a.dodgeFastAttacks,
      // Held fixed at whatever the panel is currently configured with — see
      // check 4 below for the one place this matters: it scans the SHARED
      // dodge's missedFraction only, so it's inert for any candidate that has
      // its own per-candidate override set here (a real, documented gap, not
      // a bug — scanning "what if this ONE candidate's override changed" is a
      // different, unbuilt check).
      candidateDodge: a.candidateDodge,
      candidateDodgeFastAttacks: a.candidateDodgeFastAttacks,
      holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
      bossChargedMoveMeanIntervalSeconds: overrides.bossChargedMoveMeanIntervalSeconds ?? effectiveBossFreq,
      // AFFECTS: not yet on SustainedComparisonInputs as of 2026-09-08 — see
      // this feature's AFFECTS note. bossChargedMoveMeanIntervalSeconds above
      // is ignored entirely by the engine whenever this is "energy-driven",
      // which is exactly why check 7 below (which sweeps that same field)
      // reports itself as inapplicable in that mode rather than pretending to
      // scan a knob the sim isn't reading.
      bossChargedMoveCadence: a.bossChargedMoveCadence,
      iterations: SENSITIVITY_ITERATIONS,
      weather: a.weather,
      candidateMegaBoostDisabled: a.candidateMegaBoostDisabled,
      // Held fixed at the panel's current Mega Level selection for both
      // candidates — every scan below holds this constant while sweeping ITS
      // OWN axis, same discipline as candidateMegaBoostDisabled just above.
      // Omitting this would silently re-baseline every check to Base Mega
      // Level regardless of what's actually configured, which could disagree
      // with the result cards' own currentWinner.
      candidateMegaLevel: a.candidateMegaLevel,
      // Held fixed at the panel's current friendship/Best Buddy settings —
      // same discipline as candidateMegaLevel just above: every check below
      // scans ITS OWN axis while holding these constant, so the sensitivity
      // panel's own currentWinner baseline can't silently disagree with the
      // result cards above it (which now also thread these through — see
      // run/runComparator.ts).
      friendshipLevel: a.friendshipLevel,
      candidateIsBestBuddy: a.candidateIsBestBuddy,
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

  // 1. Other trainers in the raid: scan 0-20 for the nearest flip (0 = solo
  // raid, no other trainers present — a valid, selectable value since the
  // "Other trainers also in this raid" input's minimum was dropped from 1 to
  // 0). partySize/teammateDps/matchingTeammateCount are internal names only
  // at this point — this models other trainers simultaneously in the same
  // raid lobby, never this candidate's own bench (a solo trainer only has one
  // Pokémon active at a time). (Considered swapping this to the engine's own
  // findCrossoverPartySize, which exists and is tested but has zero call
  // sites in packages/web today — declined: that function anchors its
  // "flip" to wherever the sweep's own leader first changes starting from
  // 0 other trainers, not to the specific currently-configured count's
  // actual winner (currentWinner here) — the two only agree if leadership
  // only crosses once across the whole 0-20 range. Usually true for this
  // linear team-damage math, but not guaranteed, and this loop already
  // anchors correctly to currentWinner with no extra risk, so kept.)
  {
    let crossing: number | null = null;
    for (let n = 0; n <= 20; n++) {
      const w = winnerOf(x, y, n, a.teammateDps, a.matchingTeammateCount, boostMultipliers[0], boostMultipliers[1]);
      if (w !== currentWinner) {
        crossing = n;
        break;
      }
    }
    checks.push({
      label: "Other trainers in this raid",
      currentValue: `${a.partySize}`,
      flips: crossing !== null,
      distance: crossing === null ? Infinity : Math.abs(crossing - a.partySize),
      distanceLabel: crossing === null ? "no flip found in 0-20" : `flips at ${crossing} other trainer${crossing === 1 ? "" : "s"}`,
      rangeMin: 0,
      rangeMax: 20,
      currentNumericValue: a.partySize,
      flipNumericValue: crossing,
    });
  }

  // 2. Matching-type count among other trainers: scan the full 0..partySize range for the nearest flip.
  {
    let nearest: number | null = null;
    let flipValue: number | null = null;
    for (let delta = 1; delta <= a.partySize; delta++) {
      const candidates2 = [a.matchingTeammateCount - delta, a.matchingTeammateCount + delta].filter((n) => n >= 0 && n <= a.partySize);
      const flipped = candidates2.find(
        (n) => winnerOf(x, y, a.partySize, a.teammateDps, n, boostMultipliers[0], boostMultipliers[1]) !== currentWinner,
      );
      if (flipped !== undefined) {
        nearest = delta;
        flipValue = flipped;
        break;
      }
    }
    checks.push({
      label: "Other trainers matching boost type (of raid)",
      currentValue: `${a.matchingTeammateCount}/${a.partySize}`,
      flips: nearest !== null,
      distance: nearest ?? Infinity,
      distanceLabel: nearest === null ? `no flip across 0-${a.partySize} matching` : `flips within ${nearest} trainer(s)`,
      rangeMin: 0,
      rangeMax: a.partySize,
      currentNumericValue: a.matchingTeammateCount,
      flipNumericValue: flipValue,
    });
  }

  // 3. Mega boost multiplier: scan down from the current value toward 1.0 —
  // only meaningful when candidate A actually has an active boost to weaken
  // (a genuinely non-mega candidate A, or one with the boost disabled via the
  // assumptions panel, has nothing here to scan).
  if (boostMultipliers[0] === undefined) {
    checks.push({
      label: "Mega boost multiplier",
      currentValue: "n/a (no boost active)",
      flips: false,
      distance: Infinity,
      distanceLabel: "candidate A has no active mega/primal boost to scan",
      rangeMin: 1.0,
      rangeMax: 1.0,
      currentNumericValue: 1,
      flipNumericValue: null,
    });
  } else {
    const currentBoostA = boostMultipliers[0];
    let flipAt: number | null = null;
    for (let m = currentBoostA; m >= 1.0; m -= 0.02) {
      const w = winnerOf(x, y, a.partySize, a.teammateDps, a.matchingTeammateCount, m, m);
      if (w !== currentWinner) {
        flipAt = Math.round(m * 100) / 100;
        break;
      }
    }
    checks.push({
      label: "Mega boost multiplier",
      currentValue: `${currentBoostA}x`,
      flips: flipAt !== null,
      distance: flipAt === null ? Infinity : Math.abs(currentBoostA - flipAt),
      distanceLabel: flipAt === null ? "no flip down to 1.0x" : `flips at ${flipAt}x`,
      rangeMin: 1.0,
      rangeMax: currentBoostA,
      currentNumericValue: currentBoostA,
      flipNumericValue: flipAt,
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
  // flip; it now can. Scans the SHARED dodge setting only — inert for any
  // candidate with its own per-candidate dodge override active (see
  // candidateDodge above).
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
      rangeMin: 0,
      rangeMax: 100,
      currentNumericValue: currentAccuracyPct,
      flipNumericValue: flipAtFraction === null ? null : (1 - flipAtFraction) * 100,
    });
  }

  // 5. Level: scan nearby levels for the nearest flip. The +/-10 scan window
  // (and the matching rangeMin/rangeMax clamp below) is this check's own scan
  // bound, unrelated to the real game's "power-up allowed up to trainer level
  // + 10" mechanic (see MECHANICS.md's "Trainer Level cap on power-ups" — the
  // trainer-level half of that rule is deliberately not modelled here); it
  // just keeps the flip search local rather than scanning the full 1-
  // MAX_POKEMON_POWER_UP_LEVEL range every time. The absolute ceiling is the
  // real Pokémon-level power-up cap, not a UI convenience number.
  {
    let nearest: number | null = null;
    let flipValue: number | null = null;
    for (let delta = 0.5; delta <= 10; delta += 0.5) {
      for (const candidateLevel of [a.level - delta, a.level + delta]) {
        if (candidateLevel < 1 || candidateLevel > MAX_POKEMON_POWER_UP_LEVEL) continue;
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
          flipValue = candidateLevel;
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
      rangeMin: Math.max(1, a.level - 10),
      rangeMax: Math.min(MAX_POKEMON_POWER_UP_LEVEL, a.level + 10),
      currentNumericValue: a.level,
      flipNumericValue: flipValue,
    });
  }

  // 6. Average DPS of those other trainers: teammateDps is the literal unit
  // "seconds survived" gets converted into (convertUptimeToTeamDamage) — scan
  // up/down from the current value for the nearest flip. Pure post-processing
  // (no re-simulation needed): teammateDps never touches the simulator, only
  // the team-damage conversion, so this reuses the already-computed x/y
  // exactly like checks 1-3 above.
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
      label: "Average DPS of other trainers",
      currentValue: `${a.teammateDps}`,
      flips: flipAt !== null,
      distance: flipAt === null ? Infinity : Math.abs(flipAt - a.teammateDps),
      distanceLabel: flipAt === null ? `no flip within +/-${maxScan.toFixed(0)} DPS` : `flips at ~${flipAt.toFixed(1)} DPS`,
      rangeMin: Math.max(0, a.teammateDps - maxScan),
      rangeMax: a.teammateDps + maxScan,
      currentNumericValue: a.teammateDps,
      flipNumericValue: flipAt,
    });
  }

  // 7. Boss charged-move cadence (mean seconds between casts): governs the
  // time pressure both candidates fight under — a slower cadence favors a
  // durable-but-lower-DPS candidate's survivability edge, a faster one
  // compresses both survival windows toward raw own-DPS. Requires
  // re-simulation (this value feeds the stepwise simulator directly, unlike
  // teammateDps above), scanning outward in both directions from the current
  // setting within a 1-40s bound (covers real raid cadences).
  // This check specifically scans bossChargedMoveMeanIntervalSeconds, which
  // the engine ignores entirely once bossChargedMoveCadence is
  // "energy-driven" (see bossCadence.tsx) — sweeping it in that mode would
  // silently report a scan of a knob that no longer does anything, exactly
  // the "control looks live but isn't" failure this project keeps hitting.
  // Reported as an explicit inapplicable row instead, matching check 3's own
  // "n/a" precedent for a candidate with no active boost to scan.
  if (a.bossChargedMoveCadence === "energy-driven") {
    checks.push({
      label: "Boss charged-move cadence",
      currentValue: "n/a (energy-driven mode active)",
      flips: false,
      distance: Infinity,
      distanceLabel: "mean-interval setting is ignored under the energy-driven cadence model",
      rangeMin: 0,
      rangeMax: 0,
      currentNumericValue: 0,
      flipNumericValue: null,
    });
  } else {
    const current = effectiveBossFreq;
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
      rangeMin: minBound,
      rangeMax: maxBound,
      currentNumericValue: current,
      flipNumericValue: flipAt,
    });
  }

  // 8-10. IVs (attack/defense/stamina): each is a real, already-adjustable
  // assumption exactly as uncontrollable at comparison time as level is (most
  // players are asking about their actual caught specimen, not a hypothetical
  // 15/15/15) — scan the full 0-15 per-stat range outward from the current
  // value, holding the other two IVs and every other assumption fixed,
  // following the exact same outward-scan pattern as check 5 (Level).
  const ivChecks: Array<{ label: string; key: "attack" | "defense" | "stamina" }> = [
    { label: "Attack IV", key: "attack" },
    { label: "Defense IV", key: "defense" },
    { label: "Stamina IV", key: "stamina" },
  ];
  for (const { label, key } of ivChecks) {
    const currentIv = ivs[key];
    let nearest: number | null = null;
    let flipValue: number | null = null;
    for (let delta = 1; delta <= 15; delta++) {
      for (const candidateIv of [currentIv - delta, currentIv + delta]) {
        if (candidateIv < 0 || candidateIv > 15) continue;
        const [ivx, ivy] = runSustained({ ivs: { ...ivs, [key]: candidateIv } });
        const w = winnerOf(ivx, ivy, a.partySize, a.teammateDps, a.matchingTeammateCount, boostMultipliers[0], boostMultipliers[1]);
        if (w !== currentWinner) {
          nearest = delta;
          flipValue = candidateIv;
          break;
        }
      }
      if (nearest !== null) break;
    }
    checks.push({
      label,
      currentValue: `${currentIv}`,
      flips: nearest !== null,
      distance: nearest ?? Infinity,
      distanceLabel: nearest === null ? "no flip within 0-15" : `flips at IV ${flipValue}`,
      rangeMin: 0,
      rangeMax: 15,
      currentNumericValue: currentIv,
      flipNumericValue: flipValue,
    });
  }

  return checks.sort((c1, c2) => c1.distance - c2.distance);
}
