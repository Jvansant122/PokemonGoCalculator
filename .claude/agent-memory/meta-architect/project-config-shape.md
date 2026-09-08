---
name: project-config-shape
description: Current shape of this repo's Claude Code config — 9 agents, 7 skills, 2 hooks, a permissions allowlist — plus the deliberate settings behind them and where sizes actually matter (snapshot 2026-09-08).
metadata:
  type: project
---

**Snapshot 2026-09-08.** Nine agents in `.claude/agents/`: `data-sync`, `engine-developer`,
`engine-verifier`, `web-developer`, `site-builder`, `code-simplifier`, `skeptic`,
`pogo-researcher`, `meta-architect`. Per-agent audits: [[six-agent-split]],
[[pogo-researcher-addition]], [[skeptic-addition]], [[code-simplifier-addition]].

Seven skills in `.claude/skills/`: `verify-and-ship`, `watch-github-actions`,
`add-scenario-assumption`, `new-tab`, `add-mega-allowlist-entry`, `record-mechanic`,
`close-session` — the last four added 2026-09-08 ([[skills-and-gates-2026-09-08]]).

Sizes (2026-09-07): agent bodies ~66 KB total; description-field sum ~4.1k chars (~1k tokens)
across all 9 — far under the ~15k-token warning, so descriptions are never the lever. CLAUDE.md
(~21 KB → ~5.3k tokens) is the expensive surface: loaded into the main conversation *and* every
non-Explore/Plan subagent. Measure it before touching descriptions.

Deliberate settings, don't relitigate:
- `engine-verifier`: `disallowedTools: Write, Edit`. Overlap with the test hook is by design —
  [[engine-verifier-hook-overlap]].
- `code-simplifier` / `skeptic` / `pogo-researcher`: `Write` granted **only** for their own memory
  file; each body says so explicitly, which is what makes the grant justifiable.
- `meta-architect`: `model: inherit`, `memory: project`.
- `.claude/settings.json`: `SessionStart` → `.claude/hooks/session-start.sh` (Node on PATH via
  `CLAUDE_ENV_FILE`, prints git status + HANDOFF.md newest section + pending PLAN files);
  `PostToolUse` Edit|Write → `.claude/hooks/post-edit.mjs` (engine src → engine tests; web src →
  web tsc; `*Scenario.ts`/`*AssumptionPanel.tsx`/`*View.tsx` → check-scenario-roundtrip). The
  inline `export PATH=...` in that hook command is deliberate (hooks don't inherit the env file).
  Permissions allowlist covers every `npm run` script + read-only git/file commands;
  `permissions.ask` on `git push:*` ([[site-builder-push-guardrail]]).
- `.claude/launch.json` + `run-web.bat` are the browser-preview launch config `skeptic` depends on
  (config name `"web"`, port 5173). `.claude/scheduled_tasks.lock` is a runtime artifact. No
  `.mcp.json` exists.
- `scripts/check-docs-drift.mjs` (in `npm run check` / `npm run verify`) mechanically enforces
  the recurring drift: tab count word + param list in CLAUDE.md, the `add-scenario-assumption`
  Step-0 table, the `has N project-specific subagents/skills` phrases, every `- **`agent`**`
  routing bullet, every `npm run X` in any skill/agent/CLAUDE.md/HANDOFF.md being a root script,
  and shipped PLAN files. Write docs to satisfy it — never write `npm run check-*` with a glob.

**Recurring drift — tab counts and the scenario query-param list.** Every restatement of "N tabs"
and `s`/`ts`/`sr`/`ivc`/`adb`/`pu` lags the app; the checker now catches CLAUDE.md and the skill
table, but `skeptic.md`'s prose list and `code-simplifier.md`'s scenario-type list are NOT
checked — re-grep those by hand when a tab ships. `AppTab` in `packages/web/src/App.tsx` is the
authority.
