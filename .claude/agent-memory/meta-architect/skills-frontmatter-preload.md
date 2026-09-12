---
name: skills-frontmatter-preload
description: Confirmed facts about the subagent `skills:` frontmatter field (content preloading is real; invocation without the Skill tool is unconfirmed) and why the vitest-OOM note went into engine-verifier's body instead of a skill.
metadata:
  type: project
---

**Verified 2026-09-12** (by `claude-code-guide`, at the user's request): the subagent frontmatter
field `skills:` is real. It takes a YAML list of bare skill names; the docs say the *complete
content* of each listed skill is injected into the subagent's context at startup — "preloaded when
the subagent begins, not discovered during execution" — with no documented version gate.

**Open question, do not assume either way:** whether a subagent whose `tools:` omits `Skill` can
*invoke* a preloaded skill. Omitting `Skill` is the documented way to block skill invocation, but
the docs never address the preloaded case. Treat **preloading content into context as confirmed**
and **invocation as unconfirmed**.

**Decision (2026-09-12): don't reach for `skills:` for single-agent facts.** A skill costs a line
in the always-loaded skill listing for *every* session; an agent body is the cheapest tier (loads
only on delegation). So the Windows vitest worker-OOM diagnostic — crashed-worker errors alongside
all-passing tests, rerun with `npx vitest run --pool=forks --poolOptions.forks.singleFork=true`
from `packages/engine` — went into `.claude/agents/engine-verifier.md` as a "Step zero: rule out
worker noise" section (+590 chars) rather than a skill. `meta-researcher` had proposed the skill
route; rejected on cost, not on mechanism.

**Why:** the fact is needed by exactly one agent. For this use the invocation question doesn't
bite either way — a diagnostic fact needs to be *in context*, not invoked.

**How to apply:** if the same knowledge ever needs to reach several agents, `skills:` is the
mechanism to use — but verify invocation behavior first if the skill is meant to be *run*, not just
read. Source of the OOM fact: the user's private cross-session memory, which Task-spawned
subagents do NOT inherit — so any machine-specific quirk an agent must know has to be written into
that agent's body. Related: [[agent-doc-fossilization]], [[project-config-shape]].
