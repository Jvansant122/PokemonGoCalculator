---
name: project-config-shape
description: Current shape of this repo's Claude Code config — 9 agents, 2 skills, 1 hook, 1 permission rule — plus the deliberate settings behind them and where sizes actually matter (snapshot 2026-09-07).
metadata:
  type: project
---

**Snapshot 2026-09-07.** Nine agents in `.claude/agents/`: `data-sync`, `engine-developer`,
`engine-verifier`, `web-developer`, `site-builder`, `code-simplifier`, `skeptic`,
`pogo-researcher`, `meta-architect`. Per-agent audits: [[six-agent-split]],
[[pogo-researcher-addition]], [[skeptic-addition]], [[code-simplifier-addition]].

Sizes (measured 2026-09-07): agent bodies ~66 KB total; description-field sum **4,099 chars
(~1,025 tokens)** across all 9 — far under Claude Code's ~15k-token warning, so descriptions are
never the lever worth pulling here. CLAUDE.md is the expensive surface (loaded into the main
conversation *and* every non-Explore/Plan subagent) — measure it before touching descriptions.

Deliberate settings, don't relitigate:
- `engine-verifier`: `disallowedTools: Write, Edit`. Its overlap with the test hook is by design —
  see [[engine-verifier-hook-overlap]].
- `code-simplifier` / `skeptic` / `pogo-researcher`: `Write` granted **only** for their own memory
  file; each body states this explicitly, which is what makes the grant justifiable.
- `meta-architect`: `model: inherit`, `memory: project`.
- `.claude/settings.json`: one `PostToolUse` hook on `Edit|Write` rerunning `npm run test:engine`
  for `packages/engine/src/**/*.ts` (Node-based `node -e`; no `jq` in this environment), plus a
  `permissions.ask` rule on `git push:*` ([[site-builder-push-guardrail]]).
- `.claude/skills/`: `verify-and-ship`, `add-scenario-assumption`. Both correctly filed as skills
  (procedures needing the live conversation's context), not agents.
- `.claude/launch.json` + `run-web.bat` are the browser-preview launch config `skeptic` depends on
  (config name `"web"`, port 5173). `.claude/scheduled_tasks.lock` is a runtime artifact. No
  `.mcp.json` exists.

**Recurring drift — tab counts and the scenario query-param list.** Every restatement of "N tabs"
and `s`/`ts`/`sr`/`ivc`/`adb` lags the app. Caught in CLAUDE.md 2026-09-06 (4th tab, IV
Breakpoints) and across three agent bodies 2026-09-07 (5th tab, Attack/Defense Breakpoints).
Whenever a new tab or `Scenario`-family type ships, re-grep `tabs`/`view=`/the param list across
`.claude/agents/*.md` and CLAUDE.md. `AppTab` in `packages/web/src/App.tsx` is the authority.
