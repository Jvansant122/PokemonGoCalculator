---
name: skeptic-addition
description: 2026-09-06 addition of the 8th agent, skeptic — a read-only, browser-driving adversarial checker of the live rendered app. Routing clean, tools/body matched on first pass.
metadata:
  type: project
---

Added `.claude/agents/skeptic.md` (2026-09-06) at the user's explicit design brief, not a
self-initiated proposal. Role: visually drives the live dev-server app (all three tabs) via
`mcp__Claude_Browser__*` tools and cross-checks rendered numbers against `data/normalized/` (read
via Read/Grep/Glob) and real Pokémon GO facts (WebFetch/WebSearch, same citation tiering as
`pogo-researcher`). Never fixes — hands findings to `engine-developer`/`web-developer`/`data-sync`.
`Write` restricted by prose to its own memory file only, same pattern as `pogo-researcher`.
`color: orange` (new — previously used: yellow/red/purple/green×2/cyan/blue).

Routing distinction from the three nearest agents, stated explicitly in its description and body
so delegation doesn't have to guess:
- `engine-verifier` diagnoses vitest failures via Bash, never opens a browser — a passing suite can
  still render something wrong; that gap is exactly this agent's job.
- `site-builder` is a build/deploy gate (did it load, no console/network errors) — not a
  content/plausibility audit. This agent goes deeper into whether the numbers are *correct*.
- `pogo-researcher` answers game-mechanics questions from source/web research but never opens the
  app; this agent's real-world fact-checking is in service of validating on-screen content
  specifically, not general research or ideation.

First-pass description was 760 chars (vs. peers' 411-550) — trimmed to 537 chars by moving the
three-way distinction from parenthetical explanations into one compact clause, per own checklist
("is the description short? detail belongs in the body"). Total description-field sum across all 8
agents: 3,606 chars (~901 tokens) — nowhere near the 15k-token warning, so this was a routing/
tidiness fix, not a real cost concern.

Updated CLAUDE.md's "Subagents and routing" list (added one bullet, matching existing style) and
its "seven project-specific subagents" count text (now eight). No other file touched, per the task
brief's explicit scope limit.

See [[project-config-shape]] for the running agent-count/size history — needs a "2026-09-06:
8 agents" append next time that file is touched.
