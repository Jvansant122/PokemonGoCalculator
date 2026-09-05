---
name: project-config-shape
description: The shape of this repo's Claude Code config as of the 2026-09-05 audit — which agents/skills/hooks exist, what each covers, and sizes.
metadata:
  type: project
---

Four project agents in `.claude/agents/`, no routing overlap between them:
- `data-sync` — fetches raw pogoapi.net/ScrapedDuck data into `data/raw/`. Never touches
  hypothetical species (those are hand-authored in `packages/engine/src/fixtures/scenarioA.ts`,
  registered via `registerHypothetical`, not fetched — this section was fixed 2026-09-04, see
  [[agent-doc-fossilization]]). As of 2026-09-05: its body still never instructs it to run
  `npm run sync-data` after the raw fetch — see [[data-sync-normalize-gap]], flagged not fixed.
- `engine-verifier` — read-only (`disallowedTools: Write, Edit`), runs `packages/engine`'s vitest
  suite, reports only failures. Anchor tests are Scenario A's spec-pinned numbers only (10.0s
  survival, 190/221 damage, 130 HP, fast-move 4/5) — deliberately excludes Scenario B's
  empirically-derived thresholds. As of 2026-09-05, its reactive trigger ("after any change to
  stat/damage/energy/breakpoint code") is now largely automated by `.claude/settings.json`'s
  hook — see [[engine-verifier-hook-overlap]].
- `site-builder` — builds/ships `packages/web`, must ask before any `git push`/deploy/visibility
  change. Read-only toward `packages/engine`. Guardrail is prompt-only — see
  [[site-builder-push-guardrail]] (re-flagged 2026-09-05: the "no settings.json exists yet"
  reason not to add a permission rule no longer applies).
- `meta-architect` — this agent, self-referential, `model: inherit`, `memory: project`.

Config surfaces added 2026-09-05 (all new, none existed at the 2026-09-04 audit):
- `.claude/skills/verify-and-ship/SKILL.md` (4760 bytes) — test→typecheck×2→build→commit→push→
  watch-deploy pipeline, cleanly cross-references CLAUDE.md and `engine-verifier`'s reasoning
  rather than restating it.
- `.claude/skills/add-scenario-assumption/SKILL.md` (5120 bytes) — 7-step checklist for wiring a
  new UI setting through `Scenario`/`Assumptions`/`App.tsx`/tests. Correctly filed as a skill, not
  an agent (it's a procedure that needs the current conversation's file-edit context, not a job
  whose output should be summarized away).
- `.claude/settings.json` (1183 bytes) — one `PostToolUse` hook on `Edit|Write`, Node-based
  (`node -e`, no `jq` available in this environment), reruns `npm run test:engine` when the edited
  file is under `packages/engine/src/**/*.ts`, exit 2 + stderr on failure. Measured real runtime
  of the full suite: ~2.4s wall clock (50 tests, 12 files) — well under the hook's 60s timeout,
  not a cost concern even if it fires many times in one session.

CLAUDE.md is 17,803 bytes (~4,450 tokens) as of 2026-09-05, loaded into the main conversation and
all 4 project subagents (none Explore/Plan) — up to ~22k tokens/session in the worst case just for
CLAUDE.md. Grew from 12,509 bytes (first commit with real content) to a peak of 18,094 committed
bytes; a prior interrupted meta-architect pass had already trimmed ~290 bytes of it (uncommitted,
matches [[claude-md-changelog-drift]] exactly) by the time of this audit. Description-field token
cost across all 4 agents: 709 chars (~177 tokens) — trivial, not a lever worth pulling.

`.claude/launch.json`, `.claude/run-web.bat` are VS Code debug-launch helpers, unrelated to Claude
Code config. `.claude/scheduled_tasks.lock` is a runtime lock artifact. No `.mcp.json` exists.
