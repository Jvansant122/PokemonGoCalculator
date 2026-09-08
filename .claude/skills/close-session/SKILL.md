---
name: close-session
description: End-of-session wrap-up for this repo — brings HANDOFF.md, PLAN_*.md, MECHANICS.md and IDEAS.md back into their lanes and states plainly what is uncommitted. Use when the user says they're done, wrapping up, stopping for now, or asks to "update the handoff", and at the end of any session that leaves meaningful unfinished work. Not a substitute for verify-and-ship — run that first if there is something to commit.
---

# Close a session

A fresh session reads HANDOFF.md's newest section first (the SessionStart hook prints it), so
whatever you leave there is the next session's starting assumption. Stale or missing handoff
text is how work gets redone or shipped twice.

## Checklist

1. **HANDOFF.md, in place, newest section first.** Replace or rewrite the top section rather
   than appending a fifth "what shipped" list below four older ones: what shipped this session,
   what the overseer verified directly (not just agent summaries), and a numbered **Next** list.
   Fold anything from older sections that is now done or superseded into one line, or delete it.
   Dates absolute (`2026-09-08`), never "today".

2. **PLAN_*.md.** Every one opens with "self-contained plan for a fresh session", so a shipped
   one left at the root reads as pending work. Delete the plan for any feature that shipped and
   record the resolution in HANDOFF.md. If a plan is still pending, say so in HANDOFF.md with the
   words "still pending" — `check-docs-drift` reads that line.

3. **MECHANICS.md.** Any real-game fact this session established, corrected, or doubted goes in
   via the `record-mechanic` skill. If it isn't there, it will be rediscovered as a bug.

4. **IDEAS.md.** Ideas that came up and were not scheduled go here, one line each; ideas that
   shipped come out. Nothing in this file is committed work.

5. **CLAUDE.md** only if a durable rule or standing decision changed. Do not add the session's
   narrative there — it is loaded by every session and every agent.

6. **`npm run check-docs-drift`** — it cross-checks tab counts, query params, command names,
   agent/skill mentions, and shipped-plan leftovers. Fix the stale copy it names, not the checker.

7. **State what is uncommitted.** `git status --short`, then say plainly in both HANDOFF.md
   and your final message which changes are not committed and not pushed. "Shipped" means the
   deploy workflow reported success (see `watch-github-actions`), not that a commit exists.
