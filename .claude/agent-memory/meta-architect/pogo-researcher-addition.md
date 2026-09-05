---
name: pogo-researcher-addition
description: 2026-09-05 review of the seventh agent, pogo-researcher (research/ideation, never implements) — routing clean; both findings resolved same day with the user's sign-off.
metadata:
  type: project
---

**Both open findings below RESOLVED 2026-09-05, same session, with the user's sign-off:**
`pogo-researcher.md`'s Boundaries section now has an explicit line scoping `Write` to its own
`MEMORY.md` only ("never write a standalone proposal/report/summary file into the repo"), and
CLAUDE.md's "Standing decisions" gained a fifth bullet promoting the Teambuilding-Analyzer
exclusion out of `HANDOFF.md`-only territory. `pogo-researcher.md`'s own standing-decisions list
no longer drifts from CLAUDE.md's — it now matches five-for-five.

Added 2026-09-05 at the user's request: `.claude/agents/pogo-researcher.md` (tools: Read, Grep,
Glob, WebFetch, WebSearch, Write; model: sonnet; memory: project). CLAUDE.md's "Subagents and
routing" correctly bumped to "seven" and gained a non-overlapping bullet — verified against an
actual `ls` of `.claude/agents/` (7 files). See [[project-config-shape]] for the running size
snapshot.

**Routing: clean.** No ambiguity with `data-sync` (structured pogoapi.net/ScrapedDuck fetch into
`data/`) or `engine-developer`/`web-developer` (code) — pogo-researcher's own description
explicitly carves both out, and its job (prose research + ideation, never implements) doesn't
overlap either agent's actual work.

**Open finding 1 (Costly, not yet fixed):** `tools:` grants bare `Write` with no
`disallowedTools`. The only in-body justification is the last section ("Memory" — keep its own
`MEMORY.md` current); everywhere else the body insists it "never implements" and "proposes only."
This repo already has the right precedent for a true never-write agent — `engine-verifier` sets
`disallowedTools: Write, Edit` explicitly (see [[project-config-shape]]) — and pogo-researcher
doesn't follow it. Nothing currently stops it from writing a standalone proposal/summary file into
the repo instead of returning proposals conversationally, which is exactly the anti-pattern
flagged for subagents generally. Suggested fix (not applied — judgment call, not a typo): add one
line to the Boundaries section scoping Write to its own MEMORY.md only. Flag again if this pattern
repeats on a future agent.

**Open finding 2 (Untidy, not yet fixed):** pogo-researcher's body lists a fourth "standing
decision" beyond CLAUDE.md's actual four-bullet "Standing decisions" section — the "Teambuilding
Analyzer" (multi-trainer mega staggering) being out of scope as a separate future project. That
decision is real (confirmed in `HANDOFF.md` item 3) but CLAUDE.md itself describes HANDOFF.md as
tracking "the specific state of in-progress work as of the last session," to be updated (not
appended) each session — i.e. explicitly not meant to be a permanent record. If a future session
prunes that HANDOFF.md line, pogo-researcher.md becomes the only surviving copy of a decision that
by CLAUDE.md's own framing "must survive no matter which agent touches the code." Suggested fix
(not applied — scope/product judgment, not mine to make unilaterally): promote it into CLAUDE.md's
"Standing decisions" bullet list as a fifth bullet.

Both findings are real but neither is routing-breaking; this addition is otherwise clean.
