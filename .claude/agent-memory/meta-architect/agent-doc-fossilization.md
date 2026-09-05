---
name: agent-doc-fossilization
description: data-sync.md's "Hypothetical species" section described a data/custom/*.json + "speculative":true mechanism from the Init commit that was never built; the real mechanism (hand-authored fixtures + isHypothetical flag) shipped later and the doc was never reconciled. Fixed 2026-09-04.
metadata:
  type: project
---

Found by grepping `speculative` and `isHypothetical`/`isApproximate` across `packages/` vs
`.claude/agents/*.md`: the real code only ever used `isHypothetical` (engine/`registry.ts`) and
`isApproximate` (raid matching). `speculative` as a field name and `data/custom/*.json` as a
merge path appeared nowhere in `packages/` or git history outside the two agent doc files
(`data-sync.md`, `site-builder.md`) — confirmed via `git show <init-commit>:.claude/agents/data-sync.md`
that this section dates to the initial agent-authoring commit, before the real hypothetical-
species mechanism (`registerHypothetical` in `fixtures/scenarioA.ts`) was ever built.

**Why:** agent bodies are easy to write speculatively before the corresponding feature exists,
and unlike CLAUDE.md (which gets touched almost every session as architecture changes), agent
bodies only get read/edited when someone routes to that agent for an unrelated reason — so a
stale mechanism can survive for the project's entire lifetime without being caught by casual
reading. CLAUDE.md's own "GameMaster data loader" / "Fixtures" sections had already documented
the real mechanism correctly; the drift was isolated to the two agent files.

**How to apply:** when auditing an agent body, don't just check it against CLAUDE.md (both could
be equally stale) — grep the actual field/function names it claims exist against `packages/`
source. Rewrote `data-sync.md`'s section to explicitly say "you never create or fetch these" +
point at the real files, and fixed `site-builder.md`'s "Speculative data is labeled" bullet to
reference `isHypothetical`/`isApproximate` instead of the nonexistent `"speculative"` flag (this
also closed a real gap: the old bullet never mentioned `isApproximate` at all, even though
raid-boss approximate-matching shipped in the same session as the ScrapedDuck integration).
