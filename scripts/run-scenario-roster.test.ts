import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { buildRosterScenarioUrl } from "../packages/web/src/rosterScenario.ts";

/**
 * CLI-level golden test for the Roster tab's `npm run run-scenario --`
 * branch — same "CLI == UI by construction" property CLAUDE.md calls out for
 * the other six tabs (packages/web/e2e's computeExpected.ts shells out to
 * this same script the same way, for the same reason: `run-scenario.ts`
 * calls `main()` unconditionally at module load, so it can't be `import`ed
 * directly from a test without executing a CLI run against `process.argv`).
 *
 * The URL is built with the Roster tab's own `buildRosterScenarioUrl`
 * encoder (rosterScenario.ts) rather than a hand-written query string, so
 * this test tracks the real encoding rather than pinning a hand-typed one
 * that could silently drift from what `RosterView.tsx` actually produces.
 *
 * Deliberately asserts the CLI reports ZERO roster entries even for a
 * "real" share link — this is the correct, honest behavior per CLAUDE.md's
 * standing decision: the Roster tab's `RosterScenario` carries only the
 * display `sortBy` setting, never roster contents (localStorage-only,
 * ~16 KB, explicitly excluded from every share link). A future change that
 * makes this test fail by reporting real entries would mean roster contents
 * leaked into the URL, which is the regression this pins against.
 */
describe("run-scenario CLI: roster tab", () => {
  const require = createRequire(import.meta.url);
  const repoRoot = path.resolve(__dirname, "..");

  function runCli(args: string[]): string {
    const tsxCli = require.resolve("tsx/cli");
    const script = path.join(repoRoot, "scripts", "run-scenario.ts");
    return execFileSync(process.execPath, [tsxCli, script, ...args], {
      cwd: repoRoot,
      encoding: "utf-8",
    });
  }

  it("reports the sortBy setting and an honest zero-entries roster for a real Roster share link", () => {
    const url = buildRosterScenarioUrl("http://localhost/", { sortBy: "level" });
    const output = runCli([url]);
    expect(output).toContain("Roster (sort: level): 0 entries available to this CLI.");
    expect(output).toContain("local storage");
  }, 20_000);

  it("falls back to the default sortBy ('recent') when the scenario field is absent", () => {
    const url = buildRosterScenarioUrl("http://localhost/", {});
    const output = runCli([url]);
    expect(output).toContain("Roster (sort: recent): 0 entries available to this CLI.");
  }, 20_000);

  it("--json includes a well-formed, empty RosterRunResult", () => {
    const url = buildRosterScenarioUrl("http://localhost/", { sortBy: "species" });
    const output = runCli([url, "--json"]);
    const jsonText = output.slice(output.indexOf("--- JSON ---") + "--- JSON ---".length);
    const parsed = JSON.parse(jsonText);
    expect(parsed.summary.entryCount).toBe(0);
    expect(parsed.sortedEntries).toEqual([]);
  }, 20_000);

  it("detects the roster tab from the bare 'rt' param with no explicit view=", () => {
    const url = buildRosterScenarioUrl("http://localhost/", { sortBy: "recent" });
    const qs = new URL(url).search; // "?rt=..."
    const output = runCli([qs]);
    expect(output).toContain("Roster (sort: recent)");
  }, 20_000);
});
