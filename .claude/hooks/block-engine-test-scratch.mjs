// PreToolUse hook for Write. Denies creating a throwaway/scratch file under
// packages/engine/test/, which is a TRACKED directory that both `npm run lint` and
// `npm run typecheck` glob — so one stray file there breaks both commands for every
// other agent sharing the worktree (2026-09-13: _scratch_bb_roster.ts and
// _scratch_bb_debug{,2,3}.ts did exactly that to two concurrent agents).
//
// Allowed under packages/engine/test/:  *.test.ts, *.bench.ts, anything in test/fixtures/.
// Everything else is denied with a reason naming the session scratchpad.
//
// Write only, deliberately, NOT Edit: Write is the only tool that creates a file at a new
// path, which is the actual incident vector. Edit requires the file to already exist, so it
// can't introduce a scratch file — matching it would only ever fire on one that already
// slipped in, where blocking obstructs the cleanup instead of preventing the mess.
//
// Known gap, stated rather than papered over: this cannot see a file created by a shell
// redirect (`cat > ... <<'EOF'`) or by `git checkout`. It closes the tool path, not every path.
//
// Deny form: JSON hookSpecificOutput with permissionDecision "deny" on stdout, exit 0.
// Per code.claude.com/docs/en/hooks ("PreToolUse decision control", fetched 2026-09-14),
// permissionDecisionReason is shown to Claude for a "deny" — the structured field exists for
// exactly this, and exit 2 would conflate an intentional block with the script crashing.
// Anything this hook can't parse is allowed through: a broken guard must not wedge the session.
import path from "node:path";

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
  if (String(input?.tool_name ?? "") !== "Write") process.exit(0);

  const fp = String(input?.tool_input?.file_path ?? "").split("\\").join("/");
  if (!fp) process.exit(0);

  const TEST_DIR = "packages/engine/test/";
  const idx = fp.indexOf(TEST_DIR);
  if (idx === -1) process.exit(0);

  const rel = fp.slice(idx + TEST_DIR.length);
  const base = path.posix.basename(rel);
  const allowed = rel.startsWith("fixtures/") || /\.(test|bench)\.ts$/.test(base);
  if (allowed) process.exit(0);

  const reason = [
    `Blocked: "${base}" is not a permitted file under packages/engine/test/.`,
    "",
    "That directory is tracked and is globbed by both `npm run lint` and `npm run typecheck`,",
    "so a scratch file here breaks both for every agent sharing this worktree.",
    "",
    "Scratch scripts, one-off measurement harnesses and debug dumps belong in the session",
    "scratchpad directory given in your environment prompt (under \"Scratchpad directory\") —",
    "never in the repo. Write it there and run it from there.",
    "",
    "Only these may be written under packages/engine/test/:",
    "  *.test.ts        a vitest suite",
    "  *.bench.ts       a benchmark",
    "  fixtures/*       a shared, test-only fixture",
    "",
    "If this genuinely is one of those, rename it to match and write it again.",
    "Rule owner: .claude/hooks/block-engine-test-scratch.mjs",
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
});
