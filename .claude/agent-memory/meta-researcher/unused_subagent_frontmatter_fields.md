---
name: unused-subagent-frontmatter-fields
description: This repo's 11 agent definitions use only name/description/tools/disallowedTools/model/memory/color — several other subagent frontmatter fields exist and are unused, most relevantly `skills`
metadata:
  type: reference
---

Per `code.claude.com/docs/en/sub-agents` (fetched 2026-09-12), a subagent definition supports
several frontmatter fields this project has never used: `skills`, `mcpServers`, `hooks`,
`permissionMode`, `maxTurns`, `effort`, `isolation`, `background`, `initialPrompt`,
`experimental`. Grepped `.claude/agents/*.md` for `^skills:` this session — zero matches.

**`skills` is the one worth remembering.** It force-loads a named skill's FULL body into the
subagent's context at startup, unconditionally — distinct from the normal mechanism (a skill's
description sits in context always, full body loads only if Claude's automatic matching fires
mid-task). This matters specifically for a **tool-restricted** subagent (e.g. `engine-verifier`:
`Read, Grep, Glob, Bash`, no explicit `Skill` tool) where it's unclear automatic matching is as
reliable as in an interactive session — `skills:` sidesteps that question entirely by guaranteeing
delivery regardless of matching.

**Recommended 2026-09-12** (see index): add `skills:` to `engine-verifier.md`'s frontmatter to
preload a proposed new Windows-vitest/knip-OOM-noise skill, since that agent's whole job is
diagnosing exactly the failure shape the OOM noise mimics and it currently has zero mention of it.
Check whether `meta-architect` adopted this before reaching for `skills:` again elsewhere — if
adopted, this is the second candidate use, not the first, and other test-running agent bodies
(`code-simplifier`, `web-developer`, `data-sync`) are the next things to check for the same gap.
