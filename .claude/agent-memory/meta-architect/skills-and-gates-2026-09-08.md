---
name: skills-and-gates-2026-09-08
description: 2026-09-08 pass — four skills added (new-tab, add-mega-allowlist-entry, record-mechanic, close-session), verify-and-ship collapsed onto `npm run verify`, agents pointed at the new test suites / run-scenario CLI / lint gates; plus the tooling lessons from applying it.
metadata:
  type: project
---

**What changed (2026-09-08).** Another agent had built the tooling layer (`npm run verify`
gate, web + scripts vitest suites, `packages/web/src/run/` pure functions, `run-scenario` CLI,
`diff-normalized`, eslint, perf budgets, docs-drift checker, SessionStart/PostToolUse hooks). My
job was to make the `.claude/` layer and CLAUDE.md describe and route to it:

- Skills 3 → 7. Each new skill is a short checklist with a "use when" description; bodies cite
  the real file paths/tests (verified before writing). `new-tab` lists eleven touch points.
- `verify-and-ship` steps 1–4 collapsed into `npm run verify` (+ `verify:full` after UI work).
- `add-scenario-assumption`: step 6 → the run/ layer; step 7 → `scenarioRoundtrip.test.ts`
  (the "web has no vitest" paragraph was already false); Finish → hook fires the round-trip check.
- Agents: `web-developer` (run/ contract, `test:web`, lint warnings are theirs), `engine-developer`
  (perf budgets/`bench`), `data-sync` (golden sentinels, `diff-normalized`, `typecheck:scripts`,
  stale allowlist path, weekly→daily), `skeptic`/`engine-verifier` (`run-scenario`, Playwright,
  `pu` tab), `code-simplifier` (start from lint + unused-exports), `site-builder` (CI `verify` job).
- CLAUDE.md: Commands regrouped (gate / tests / checks / tools), Node gotcha → one line pointing at
  the SessionStart hook, `scripts/` bullet, run/ layer + vitest + e2e on the web bullet, "seven
  skills" + two hooks, allowlist path fixed. Net +40 lines; still durable-rule-only.

**Why:** the previous run had verified all of this but the disk was full, so nothing was written.

**How to apply / lessons:**
- The working copy is CRLF (`core.autocrlf=true`); any multi-line exact-match edit written from an
  LF source silently fails to match. Normalize to LF for matching, write back in the file's style.
  Files I create with Write/Node land as LF — harmless, git normalizes on commit.
- Bash heredocs in this environment tripped on a long multi-file batch; one file per Write call
  or a spec-driven Node helper is more reliable than a giant heredoc.
- Playwright (`packages/web/e2e/`, `npm run test:e2e`) was documented as "being added" on
  2026-09-08 because a concurrent agent owned it; verify it exists before treating those doc
  references as live.
- Not done, deliberately: no CLAUDE.md routing-bullet rewrites (drift checker parses them and the
  routing was already clean); `meta-architect.md` left untouched; no agent `tools:` changes.
