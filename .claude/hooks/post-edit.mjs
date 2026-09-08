// PostToolUse hook for Edit|Write. Reads the tool payload on stdin and runs the cheapest
// check that can catch a regression in the file that was just edited:
//
//   packages/engine/src/**/*.ts            -> npm run test:engine        (the original hook)
//   packages/web/src/**/*.{ts,tsx}         -> tsc --noEmit (web)         (engine<->web interface drift)
//   any scenario/assumption file (any tab) -> check-scenario-roundtrip   (the shared-link bug class)
//
// Exit code 2 surfaces stderr straight into the conversation; 0 is silent. Anything the
// hook can't parse is ignored rather than blocking an unrelated edit.
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const fp = String(input?.tool_input?.file_path ?? "").split("\\").join("/");
  if (!fp) process.exit(0);

  const isEngineSrc = fp.includes("packages/engine/src/") && fp.endsWith(".ts");
  const isWebSrc = fp.includes("packages/web/src/") && /\.(ts|tsx)$/.test(fp) && !/\.test\.tsx?$/.test(fp);
  const base = path.basename(fp);
  const isScenarioFile =
    /Scenario\.ts$/.test(base) || /AssumptionPanel\.tsx$/.test(base) || /View\.tsx$/.test(base);

  const checks = [];
  if (isEngineSrc) checks.push({ label: "npm run test:engine", cmd: "npm run test:engine" });
  if (isWebSrc) checks.push({ label: "web tsc --noEmit", cmd: "npm run typecheck:web" });
  if (isScenarioFile) checks.push({ label: "npm run check-scenario-roundtrip", cmd: "npm run check-scenario-roundtrip" });
  if (checks.length === 0) process.exit(0);

  const failures = [];
  for (const { label, cmd } of checks) {
    try {
      execSync(cmd, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      const out = (e.stdout || "") + (e.stderr || "");
      failures.push(`--- ${label} failed after editing ${fp} ---\n${out.trim().slice(-6000)}\n`);
    }
  }
  if (failures.length === 0) process.exit(0);
  process.stderr.write(failures.join("\n"));
  process.exit(2);
});
