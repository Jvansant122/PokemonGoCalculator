/**
 * Computes the exact numbers the live UI should render for a given tab's
 * DEFAULT_ASSUMPTIONS, using the SAME pure run*Scenario functions + registry
 * the views themselves call (see run/run.smoke.test.ts's own precedent for
 * "call the real function against the real registry, don't reimplement the
 * math"). Printed as one JSON line to stdout.
 *
 * Run under `tsx` (never directly under plain `node` or under Playwright's
 * own test-file transform) specifically because packages/web/src/registry.ts
 * imports data/normalized/*.json with a bare specifier and no import
 * attribute — fine for Vite and for Vitest (both resolve JSON through their
 * own module graph, not Node's native ESM loader) but Node's native loader
 * (which is what Playwright's own in-process transform ultimately hands
 * off to) rejects that with "needs an import attribute of type: json".
 * Shelling out to tsx as a short-lived child process (the same tool
 * scripts/run-scenario.ts already uses to reach into packages/web/src) sidesteps
 * that entirely, at the cost of one process spawn per spec file.
 */
import { speciesRegistry } from "../../src/registry.js";
import { DEFAULT_ASSUMPTIONS as COMPARATOR_DEFAULTS } from "../../src/ComparatorView.js";
import { DEFAULT_TEAM_ASSUMPTIONS } from "../../src/TeamRaidView.js";
import { runComparatorScenario } from "../../src/run/runComparator.js";
import { runTeamRaidScenario } from "../../src/run/runTeamRaid.js";

const tab = process.argv[2];

if (tab === "comparator") {
  const result = runComparatorScenario(COMPARATOR_DEFAULTS, speciesRegistry);
  const candidate = result.results?.[0];
  if (!candidate) throw new Error("comparator default scenario produced no candidate result");
  process.stdout.write(
    JSON.stringify({
      candidateName: candidate.name,
      meanSurvivalText: `${candidate.meanSecondsSurvived.toFixed(1)}s`,
    }),
  );
} else if (tab === "team-raid") {
  const result = runTeamRaidScenario(DEFAULT_TEAM_ASSUMPTIONS, speciesRegistry);
  if (!result.data) throw new Error("team-raid default scenario produced no result");
  process.stdout.write(
    JSON.stringify({
      outcomeText: result.data.outcome === "cleared" ? "Cleared" : "Timer expired — raid failed",
      wipeCount: result.data.wipeCount,
    }),
  );
} else {
  throw new Error(`unknown tab "${tab}" — expected "comparator" or "team-raid"`);
}
