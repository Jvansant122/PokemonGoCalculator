---
name: engine-verifier-hook-overlap
description: .claude/settings.json's new PostToolUse test hook (added 2026-09-05) mechanically guarantees what engine-verifier.md's description asks for reactively ("use proactively after any change to stat/damage/energy/breakpoint code"). Flagged 2026-09-05, retarget proposed, not applied (review scope).
metadata:
  type: project
---

The hook reruns `npm run test:engine` on every `Edit`/`Write` under `packages/engine/src/**/*.ts`
and surfaces failures via stderr + exit 2. This is strictly the same trigger condition
`engine-verifier`'s description names, turned from a prompt-based request into a mechanical
guarantee — exactly the "hooks vs prose" upgrade this agent's own charter recommends making when
a prohibition/reminder keeps needing to be repeated.

**Not fully redundant, though** — real gaps the hook doesn't cover, which `engine-verifier` still
should:
1. Changes applied via `Bash` (patches, `git checkout`, merges, `git apply`) never trigger the
   hook (matcher is `Edit|Write` only).
2. The hook dumps raw vitest stdout/stderr on failure; `engine-verifier` turns that into
   expected/actual/likely-cause/evidence using its "Diagnosis order" checklist (double flooring →
   multiplier constants → energy-from-damage → type stacking) — genuinely more useful than the raw
   dump for someone deciding what to fix.
3. A deliberate "give me confidence before I commit" full-suite pass, independent of whether an
   edit just happened.
4. Tests themselves live under `packages/engine/test/`, not `src/` — editing a test file doesn't
   trigger the hook at all, so `engine-verifier` is the only automatic-ish safety net for that case
   if invoked.

**Recommendation (not applied):** retarget `engine-verifier`'s description to describe the
diagnosis role and the hook-gap cases explicitly, rather than restating "use after engine
changes" — that phrasing now reads as duplicate coverage of something a hook already guarantees,
which risks wasted delegation (full agent-body load + a second ~2.4s test run) when Claude picks
it reflexively after every engine edit instead of trusting the hook's silent-on-success behavior.

**How to apply:** if this comes up again (e.g. the agent keeps getting invoked immediately after
routine engine edits the hook already cleared), do the retarget. Don't do it preemptively without
the user's go-ahead — this was surfaced as a review finding, not applied.
