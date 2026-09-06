---
name: code-simplifier-addition
description: 2026-09-06 addition of the 9th agent, code-simplifier — a read-only dead-code/duplication/bloat auditor for packages/engine, packages/web, and scripts/. Routing clean against skeptic/meta-architect/engine-verifier; no ts-prune/knip installed so body relies on Grep-based cross-referencing.
metadata:
  type: project
---

Added `.claude/agents/code-simplifier.md` (2026-09-06) at the user's explicit design brief
(follow `skeptic.md`'s pattern: read-only audit, never fixes, hands findings to the owning agent).
Scope: `packages/engine/src`, `packages/web/src`, `scripts/` — explicitly **not** `.claude/`
(that's this agent's own subject, kept separate on purpose to avoid overlap).

Hunts for: dead code/unused exports, cross-package duplication, oversized files/functions, needless
single-call-site abstraction, copy-pasted `packages/web` JSX patterns, stale TODOs (checked against
`git log` for a file, not just presence). `tools: Read, Grep, Glob, Bash, Write`; `disallowedTools:
Edit` — same no-edit pattern as `skeptic`/`engine-verifier`. `Write` is memory-file-only by prose,
consistent with every other read-only agent in this repo.

**Must cross-check against CLAUDE.md's "Standing decisions" before flagging anything** — this repo
has four things that look like bloat to a naive scan but are deliberate:
- The `1.3` mega/primal boost constant (real conclusion flips at `1.1`).
- Three separate scenario types (`Scenario`/`TeamScenario`/`SpeciesReportScenario`) — look
  unifiable, must stay separate.
- `packages/engine/test/fixtures/`'s hypothetical species — intentionally unexported from
  `packages/engine/src/index.ts`; a dead-export scan finding them is the scan working, not a bug.
- `data/raw/`/`data/normalized/` — generated, route findings to `data-sync` rather than treating as
  an in-place cleanup target.
Body has an explicit "What is not a finding" section listing these, plus an EXCLUDED and
FLAGGED-WITH-CAUTION line in the output format so exclusions are auditable rather than silent.

Checked `package.json` before writing the body: no `ts-prune`/`knip`/similar installed (only
`typescript`/`tsx` as root devDependencies) — the body explicitly tells the agent not to assume one
exists and to do export/usage cross-referencing by hand with Grep instead.

Routing distinction from nearest agents, stated in the description:
- `meta-architect` — `.claude/` itself is out of scope for `code-simplifier`; if it notices
  something there it mentions it once and stops, doesn't audit it.
- `skeptic` — audits the *live rendered app's data correctness*, not source-level bloat; disjoint
  subjects (rendered numbers vs. static code shape).
- `engine-verifier` — diagnoses a *failing test*, not code structure; a fully passing, bloat-free
  engine is out of `engine-verifier`'s remit and squarely `code-simplifier`'s.

Color: picked `pink` (unused) rather than reusing `cyan` (already `engine-developer`'s) — no color
enum found in settings, but kept each agent visually distinct per prior convention noted in
[[skeptic-addition]].

Updated CLAUDE.md's "Subagents and routing" list (one new bullet, matching existing style/length)
and its "nine project-specific subagents" count text (was eight). No other file touched, per the
task brief's explicit scope limit. See [[project-config-shape]] for the running agent-count
history — needs a "2026-09-06: 9 agents" append next time that file is touched.
