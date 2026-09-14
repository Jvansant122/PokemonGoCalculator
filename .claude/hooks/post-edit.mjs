// PostToolUse hook for Edit|Write. Reads the tool payload on stdin and runs the cheapest
// check that can catch a regression in the file that was just edited:
//
//   packages/engine/src/**/*.ts            -> npm run test:engine        (the original hook)
//   packages/web/src/**/*.{ts,tsx}         -> tsc --noEmit (web, scripts) (engine<->web drift, and
//                                                                         scripts/ importing web/src)
//   any scenario/assumption file (any tab) -> check-scenario-roundtrip   (the shared-link bug class)
//   .claude/agents|skills, CLAUDE.md, HANDOFF.md -> check-docs-drift     (docs claiming stale counts)
//
// The docs-drift branch is a partial net, not a guarantee: check-docs-drift parses structured
// things (tab counts, query params, command names, agent/skill mentions, a skill's Step-0 table),
// not free prose. It would not have caught, say, a stale sentence inside a skill body.
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
  // settings.json and the hook scripts are included because check-docs-drift now validates
  // CLAUDE.md's hook paragraph against settings.json's real hooks (count word, event names,
  // script names). Before that check existed this trigger would have been cost with no
  // detection, which is why it was logged blocked in meta_ideas.md rather than wired early.
  const isDocsSurface =
    /\.claude\/agents\/[^/]+\.md$/.test(fp) ||
    /\.claude\/skills\/.+\/SKILL\.md$/.test(fp) ||
    /\.claude\/hooks\/[^/]+\.mjs$/.test(fp) ||
    fp.includes(".claude/settings.json") ||
    base === "CLAUDE.md" ||
    base === "HANDOFF.md";

  const checks = [];
  if (isEngineSrc) checks.push({ label: "npm run test:engine", cmd: "npm run test:engine" });
  if (isWebSrc) {
    checks.push({ label: "web tsc --noEmit", cmd: "npm run typecheck:web" });
    // scripts/run-scenario.ts imports React-free constants/functions out of packages/web/src's
    // .tsx views, but packages/web/tsconfig.json never includes scripts/ as an entry point, so
    // typecheck:web is blind to that edge (tsconfig.scripts.json sets `jsx` precisely for it).
    // Renaming a web export while a scripts/ import site still names the old one type-checked
    // clean and lint-passed once, surfacing only as an ESM runtime error under test:scripts.
    checks.push({ label: "scripts tsc --noEmit", cmd: "npm run typecheck:scripts" });
  }
  if (isScenarioFile) checks.push({ label: "npm run check-scenario-roundtrip", cmd: "npm run check-scenario-roundtrip" });
  if (isDocsSurface) checks.push({ label: "npm run check-docs-drift", cmd: "npm run check-docs-drift" });
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
