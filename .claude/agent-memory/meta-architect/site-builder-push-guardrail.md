---
name: site-builder-push-guardrail
description: RESOLVED 2026-09-05 — user signed off; .claude/settings.json now has "permissions": {"ask": ["Bash(git push:*)"]} backing site-builder.md's prose rule with an actual enforced prompt.
metadata:
  type: project
---

**RESOLVED.** The user explicitly approved adding the guardrail (2026-09-05, overseer session).
`.claude/settings.json` now has a top-level `"permissions": {"ask": ["Bash(git push:*)"]}` block
alongside the existing `hooks` key — any `git push` now prompts for confirmation regardless of
which agent (or the main thread) issues it, closing the gap described below.

`site-builder.md` says to get explicit confirmation before `git push` to any remote, creating/
changing repo visibility, enabling Pages, or any deploying workflow run — this is a public site,
so an accidental push is public. As of 2026-09-04 there is no `settings.json` in this repo at
all (confirmed via `find`), so nothing enforces this beyond the agent choosing to comply with
its own prompt.

**Why not fixed directly:** per this agent's own charter, "hooks vs prose" says a repeated
prohibition is the signal to propose a hook — but this prohibition isn't repeated/failing yet,
and creating the repo's first `settings.json` (a `PreToolUse` deny/ask rule on `git push`) is a
behavior change with reach beyond just `site-builder` (permissions in `settings.json` apply
project-wide, not per-agent), so it was surfaced as a recommendation rather than applied
unilaterally.

**How to apply:** if this comes up again (e.g., a near-miss accidental push, or the user adds a
`settings.json` for other reasons), propose scoping a `PreToolUse` hook or permission rule on
`Bash` matching `git push` to require confirmation, rather than relying on site-builder's prompt
text alone.

**2026-09-05 update:** the "no `settings.json` exists yet" reason to hold off is now moot — the
user added the repo's first `settings.json` this same session (a `PostToolUse` test hook, unrelated
to this). Re-surfaced as a lower-friction candidate (e.g. `"permissions": {"ask":
["Bash(git push:*)"]}` alongside the existing `hooks` key) in the 2026-09-05 audit. Still not
applied without the user's sign-off — same reasoning as before (permissions apply project-wide,
this is a behavior change, and the prohibition hasn't actually failed yet).
