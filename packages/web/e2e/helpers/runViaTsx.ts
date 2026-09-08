import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Shells out to `tsx` (see computeExpected.ts's own doc comment for why this
 * can't just be a plain top-level `import` inside a .spec.ts file) to compute
 * the expected value for `tab`, and returns it parsed. `tsx` is a root-level
 * devDependency (used by scripts/run-scenario.ts); `require.resolve` walks up
 * the directory tree the same way Node's own module resolution would, so this
 * finds it whether or not npm happened to hoist it into this workspace's own
 * node_modules.
 */
export function computeExpected(tab: "comparator" | "team-raid"): { candidateName: string; meanSurvivalText: string } | { outcomeText: string; wipeCount: number } {
  const tsxCli = require.resolve("tsx/cli");
  const script = path.join(here, "computeExpected.ts");
  const output = execFileSync(process.execPath, [tsxCli, script, tab], {
    cwd: here,
    encoding: "utf-8",
  });
  return JSON.parse(output);
}
