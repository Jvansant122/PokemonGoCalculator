/**
 * Scenario CLI — reproduces a displayed number from any of this project's six
 * tabs without a browser. Takes a full share URL (or just its query string),
 * decodes it with the SAME codec + normalization the live UI uses, calls that
 * tab's `run*Scenario` function (packages/web/src/run/*.ts — the same
 * React-free computation each View.tsx calls, so this can never drift from
 * what's actually rendered), and prints a short human-readable summary of the
 * headline numbers that tab displays. `--json` additionally prints the full
 * result object.
 *
 * Built for `skeptic` and `engine-verifier` to reproduce a number from a bug
 * report without spinning up a browser, and so a bug report can just be a
 * pasteable share URL rather than a paragraph of "set level to X, IVs to
 * Y..." reconstruction.
 *
 * Usage (from the repo root):
 *   npm run run-scenario -- "<url or query string>"
 *   npm run run-scenario -- "?view=comparator" --json
 *
 * Runs under tsx (see package.json's "run-scenario" script) — tsx never
 * type-checks, so `npm run typecheck:scripts` is what catches a type error
 * here, not this script's own execution.
 */
import {
  DEFAULT_ASSUMPTIONS as COMPARATOR_DEFAULTS,
  normalizeAssumptions as normalizeComparatorAssumptions,
  scenarioToAssumptions as comparatorScenarioToAssumptions,
  type ComparatorScenario,
} from "../packages/web/src/ComparatorView.js";
import type { Assumptions } from "../packages/web/src/AssumptionPanel.js";
import { parseScenarioFromUrl, parseTeamScenarioFromUrl } from "@pogo-analyzer/engine";
import { resolveBoost, runComparatorScenario } from "../packages/web/src/run/runComparator.js";
import { computeRankingFlip } from "../packages/web/src/rankingFlip.js";

import {
  DEFAULT_TEAM_ASSUMPTIONS,
  normalizeTeamAssumptions,
  teamScenarioToAssumptions,
  type TeamScenarioWithShadow,
} from "../packages/web/src/TeamRaidView.js";
import { runTeamRaidScenario } from "../packages/web/src/run/runTeamRaid.js";

import {
  DEFAULT_ASSUMPTIONS as SPECIES_REPORT_DEFAULTS,
  scenarioToAssumptions as speciesReportScenarioToAssumptions,
} from "../packages/web/src/SpeciesReportView.js";
import { parseSpeciesReportScenarioFromUrl } from "../packages/web/src/speciesReportScenario.js";
import { runSpeciesReportScenario, sortRows } from "../packages/web/src/run/runSpeciesReport.js";

import {
  DEFAULT_ASSUMPTIONS as IV_DEFAULTS,
  normalizeAssumptions as normalizeIvAssumptions,
  scenarioToAssumptions as ivScenarioToAssumptions,
} from "../packages/web/src/IvBreakpointsView.js";
import { parseIvBreakpointsScenarioFromUrl } from "../packages/web/src/ivBreakpointsScenario.js";
import { runIvBreakpointsScenario } from "../packages/web/src/run/runIvBreakpoints.js";
import { bucketVerdictSentence, headline as ivHeadline } from "../packages/web/src/ivBreakpointsHelpers.js";

import {
  DEFAULT_ASSUMPTIONS as ADB_DEFAULTS,
  normalizeAssumptions as normalizeAdbAssumptions,
  scenarioToAssumptions as adbScenarioToAssumptions,
} from "../packages/web/src/AttackDefenseBreakpointsView.js";
import { parseAttackDefenseBreakpointsScenarioFromUrl } from "../packages/web/src/attackDefenseBreakpointsScenario.js";
import { runAttackDefenseBreakpointsScenario } from "../packages/web/src/run/runAttackDefenseBreakpoints.js";

import {
  blockedCandidateSentence,
  DEFAULT_ASSUMPTIONS as PU_DEFAULTS,
  normalizePowerUpAssumptions,
  scenarioToAssumptions as puScenarioToAssumptions,
} from "../packages/web/src/PowerUpOptimizerView.js";
import { parsePowerUpOptimizerScenarioFromUrl } from "../packages/web/src/powerUpOptimizerScenario.js";
import { runPowerUpOptimizerScenario } from "../packages/web/src/run/runPowerUpOptimizer.js";

import { speciesRegistry } from "../packages/web/src/registry.js";

type Tab = "comparator" | "team-raid" | "species-report" | "iv-breakpoints" | "attack-defense-breakpoints" | "power-up-optimizer";

/** Same param-per-tab mapping as App.tsx's tab-switcher / each *Scenario.ts module's own query-param constant. */
const SCENARIO_PARAM_BY_TAB: Record<Tab, string> = {
  comparator: "s",
  "team-raid": "ts",
  "species-report": "sr",
  "iv-breakpoints": "ivc",
  "attack-defense-breakpoints": "adb",
  "power-up-optimizer": "pu",
};

/** Accepts a full share URL or a bare query string (with or without a leading "?") and returns a real URL object every parse*ScenarioFromUrl function can read searchParams off of. */
function toUrl(input: string): URL {
  if (/^https?:\/\//i.test(input)) return new URL(input);
  const qs = input.startsWith("?") ? input : `?${input}`;
  return new URL(`http://localhost/${qs}`);
}

function detectTab(url: URL): Tab {
  const view = url.searchParams.get("view");
  if (view && (view as Tab) in SCENARIO_PARAM_BY_TAB) return view as Tab;
  for (const [tab, param] of Object.entries(SCENARIO_PARAM_BY_TAB) as [Tab, string][]) {
    if (url.searchParams.has(param)) return tab;
  }
  throw new Error(
    "Could not determine which tab this scenario is for — no recognized view= param and none of s/ts/sr/ivc/adb/pu present. " +
      "Paste a full share URL (or its query string) copied from this app's own \"Build link\" button.",
  );
}

function fmt(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined ? "n/a" : n.toFixed(digits);
}

function printSummary(lines: string[]): void {
  console.log(lines.join("\n"));
}

function main(): void {
  const args = process.argv.slice(2);
  const wantsJson = args.includes("--json");
  const rawInput = args.find((a) => a !== "--json");
  if (!rawInput) {
    console.error(
      'Usage: npm run run-scenario -- "<url or query string>" [--json]\n' +
        'Example: npm run run-scenario -- "?view=comparator" --json',
    );
    process.exit(1);
  }

  const url = toUrl(rawInput);
  const tab = detectTab(url);
  const urlString = url.toString();

  let summary: string[];
  let jsonResult: unknown;

  switch (tab) {
    case "comparator": {
      const fromUrl = parseScenarioFromUrl(urlString) as ComparatorScenario | null;
      const assumptions: Assumptions = fromUrl
        ? normalizeComparatorAssumptions(comparatorScenarioToAssumptions(fromUrl))
        : COMPARATOR_DEFAULTS;
      const result = runComparatorScenario(assumptions, speciesRegistry);
      if (result.speciesError || result.resultsError) {
        summary = [`Comparator: could not compute — ${result.speciesError ?? result.resultsError}`];
        break;
      }
      const [a, b] = result.results!;
      const [candA, candB] = result.candidates!;
      const boostA = resolveBoost(candA, assumptions.candidateMegaBoostDisabled[0] ?? false);
      const boostB = resolveBoost(candB, assumptions.candidateMegaBoostDisabled[1] ?? false);
      const flip = computeRankingFlip(
        {
          name: a!.name,
          ownDamageTrajectory: a!.representativeRun.ownDamageTrajectory,
          secondsSurvivedCutoff: a!.representativeRun.faintedAtSeconds ?? result.chartMaxSeconds,
          boostMultiplier: boostA?.multiplier,
          persistsThroughFaint: boostA?.persistsThroughFaint,
        },
        {
          name: b!.name,
          ownDamageTrajectory: b!.representativeRun.ownDamageTrajectory,
          secondsSurvivedCutoff: b!.representativeRun.faintedAtSeconds ?? result.chartMaxSeconds,
          boostMultiplier: boostB?.multiplier,
          persistsThroughFaint: boostB?.persistsThroughFaint,
        },
        assumptions.teammateDps,
        assumptions.partySize,
        assumptions.matchingTeammateCount,
        result.chartMaxSeconds,
      );
      summary = [
        `Comparator: ${a!.name} vs ${b!.name} vs ${result.boss!.name}`,
        `  ${a!.name}: mean survival ${fmt(a!.meanSecondsSurvived)}s, mean total damage ${fmt(a!.meanTotalDamage, 0)}`,
        `  ${b!.name}: mean survival ${fmt(b!.meanSecondsSurvived)}s, mean total damage ${fmt(b!.meanTotalDamage, 0)}`,
        flip.crossing
          ? `  Ranking flips at ~${fmt(flip.crossing.t)}s into the fight; ${flip.finalLeader} leads by the end of the ${fmt(result.chartMaxSeconds)}s window.`
          : `  No crossing in this window; ${flip.finalLeader} leads throughout.`,
        `  Sensitivity: nearest flip is "${result.sensitivity[0]?.label}" (${result.sensitivity[0]?.distanceLabel}).`,
      ];
      jsonResult = result;
      break;
    }
    case "team-raid": {
      const fromUrl = parseTeamScenarioFromUrl(urlString) as TeamScenarioWithShadow | null;
      const assumptions = fromUrl ? normalizeTeamAssumptions(teamScenarioToAssumptions(fromUrl)) : DEFAULT_TEAM_ASSUMPTIONS;
      const result = runTeamRaidScenario(assumptions, speciesRegistry);
      if (result.error) {
        summary = [`Team Raid: could not compute — ${result.error}`];
        break;
      }
      const d = result.data!;
      summary = [
        `Team Raid vs ${result.bossSpecies!.name} (${fmt(result.bossHp, 0)} HP)`,
        `  Outcome: ${d.outcome === "cleared" ? "Cleared" : "Timer expired — raid failed"}`,
        `  Time to clear: ${d.timeToClearSeconds === null ? "never" : `${fmt(d.timeToClearSeconds)}s`}`,
        `  Timer margin: ${d.timerMarginSeconds === null ? "n/a" : `${d.timerMarginSeconds >= 0 ? "+" : ""}${fmt(d.timerMarginSeconds)}s`}`,
        `  Wipe count: ${d.wipeCount}; slots used ${d.slotsUsed}, faint events ${d.slotsFainted}`,
      ];
      jsonResult = result;
      break;
    }
    case "species-report": {
      const fromUrl = parseSpeciesReportScenarioFromUrl(urlString);
      const assumptions = fromUrl ? speciesReportScenarioToAssumptions(fromUrl) : SPECIES_REPORT_DEFAULTS;
      const result = runSpeciesReportScenario(assumptions, speciesRegistry);
      if (result.error) {
        summary = [`Species Report: could not compute — ${result.error}`];
        break;
      }
      const byDamage = sortRows(result.data!.rows, "damage");
      const byType = sortRows(result.data!.rows, "typeMatchup");
      summary = [
        `Species Report: ${result.species!.name} vs ${result.targets.length} raid boss(es) (${result.activeTargetCount} active, ${result.pastTargetCount} past)`,
        `  Top by sustained damage: ${byDamage[0]?.bossName} (${fmt(byDamage[0]?.sustained.meanTotalDamage, 0)} mean total damage)`,
        `  Top by type matchup: ${byType[0]?.bossName} (${fmt(byType[0]?.offensiveTypeMatchup, 3)}x)`,
      ];
      jsonResult = result;
      break;
    }
    case "iv-breakpoints": {
      const fromUrl = parseIvBreakpointsScenarioFromUrl(urlString);
      const assumptions = fromUrl ? normalizeIvAssumptions(ivScenarioToAssumptions(fromUrl)) : IV_DEFAULTS;
      const result = runIvBreakpointsScenario(assumptions, speciesRegistry);
      if (result.error) {
        summary = [`IV Breakpoints: could not compute — ${result.error}`];
        break;
      }
      summary = [
        `IV Breakpoints: ${result.species!.name} (A=${assumptions.ivA.attack}/${assumptions.ivA.defense}/${assumptions.ivA.stamina}, B=${assumptions.ivB.attack}/${assumptions.ivB.defense}/${assumptions.ivB.stamina}) vs ${result.boss!.name}`,
        `  ${ivHeadline(result.data!, assumptions.ivA, assumptions.ivB)}`,
        `  ${bucketVerdictSentence(result.sweepAggregate.tier4Plus, assumptions.ivA, assumptions.ivB, `Across ${result.sweepAggregate.tier4Plus.total} tier-4+ raid targets this tool can model`)}`,
      ];
      jsonResult = result;
      break;
    }
    case "attack-defense-breakpoints": {
      const fromUrl = parseAttackDefenseBreakpointsScenarioFromUrl(urlString);
      const assumptions = fromUrl ? normalizeAdbAssumptions(adbScenarioToAssumptions(fromUrl)) : ADB_DEFAULTS;
      const result = runAttackDefenseBreakpointsScenario(assumptions, speciesRegistry);
      if (result.error) {
        summary = [`Attack/Defense Breakpoints: could not compute — ${result.error}`];
        break;
      }
      const grid = result.attack ?? result.defense!;
      const fastDamages = grid.fast.map((c) => c.damage);
      const chargedDamages = grid.charged.map((c) => c.damage);
      summary = [
        `Attack/Defense Breakpoints (${assumptions.mode} mode): ${result.species!.name} vs ${result.boss!.name}`,
        `  Fast move damage range across the sheet: ${Math.min(...fastDamages)}-${Math.max(...fastDamages)}`,
        `  Charged move damage range across the sheet: ${Math.min(...chargedDamages)}-${Math.max(...chargedDamages)}`,
      ];
      jsonResult = result;
      break;
    }
    case "power-up-optimizer": {
      const fromUrl = parsePowerUpOptimizerScenarioFromUrl(urlString);
      const assumptions = fromUrl ? normalizePowerUpAssumptions(puScenarioToAssumptions(fromUrl)) : PU_DEFAULTS;
      const result = runPowerUpOptimizerScenario(assumptions, speciesRegistry);
      if (result.error) {
        summary = [`Power-Up Optimizer: could not compute — ${result.error}`];
        break;
      }
      const d = result.data!;
      const best = d.bestAffordableByStardustEfficiency;
      summary = [
        `Power-Up Optimizer vs ${result.bossSpecies!.name} (${fmt(result.bossHp, 0)} HP)`,
        `  Baseline team DPS: ${fmt(d.baseline.teamDps, 2)} (+/-${fmt(d.noiseFloorTeamDps, 2)} noise floor, ${d.iterations} seeds); clear rate ${fmt(d.baseline.clearRate * 100, 0)}%`,
        best
          ? `  Best stardust efficiency: Slot ${best.slotIndex + 1} (${best.speciesName}) Lv ${best.fromLevel} -> ${best.toLevel} (+${fmt(best.deltaTeamDps, 2)} team DPS, ${fmt(best.deltaTeamDpsPer1000Stardust ?? null, 3)} per 1000 stardust).`
          : `  Nothing affordable improves team DPS beyond the +/-${fmt(d.noiseFloorTeamDps, 2)} noise floor.`,
      ];
      if (result.plan) {
        const p = result.plan;
        summary.push(
          `  Fixed-budget plan (${p.steps.length} step(s), stopped: ${p.stopReason}): team DPS ${fmt(p.baseline.teamDps, 2)} -> ${fmt(p.final.teamDps, 2)}`,
          `    Spend: ${p.ledger.stardust.spent.toLocaleString()} stardust, ${p.ledger.sharedRareCandy.spent} shared Rare Candy, ${p.ledger.sharedRareCandyXl.spent} shared Rare Candy XL ` +
            `(${p.ledger.stardust.remaining.toLocaleString()} stardust / ${p.ledger.sharedRareCandy.remaining} Rare Candy / ${p.ledger.sharedRareCandyXl.remaining} Rare Candy XL left).`,
          p.bestBlockedCandidate
            ? `    BLOCKED, NOT DONE: ${blockedCandidateSentence(p.bestBlockedCandidate)}`
            : `    Nothing further measurably helps beyond this plan's own steps.`,
        );
      }
      jsonResult = result;
      break;
    }
  }

  printSummary(summary);
  if (wantsJson) {
    console.log("\n--- JSON ---");
    console.log(JSON.stringify(jsonResult, null, 2));
  }
}

main();
