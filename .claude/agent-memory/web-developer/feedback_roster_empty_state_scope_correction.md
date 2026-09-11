---
name: feedback_roster_empty_state_scope_correction
description: A "make the initial roster empty" task was mis-briefed twice, then corrected down to "only the Roster tab + multi-raid sweep, not Team Raid/single-raid Power-Up" — investigate-before-building matters even mid-task; plus a worktree-isolation technique for verifying against a concurrent, uncommitted, unrelated engine session.
metadata:
  type: feedback
---

2026-09-10/11: the coordinator's initial brief said to empty BOTH Team Raid's `DEFAULT_TEAM_ASSUMPTIONS.slots`
AND the Power-Up Optimizer's single-raid `DEFAULT_ASSUMPTIONS.slots`. I built that (emptied both, added
invitation-panel UI, rewrote e2e fixtures/helpers to inject a roster via a share-link query built through the
app's own encode functions). Mid-task the coordinator relayed a full correction from the user: **neither
default should be empty** — those are "deliberate worked demos." The REAL ask was narrower: (1) the Roster tab
(7th tab) starts empty, (2) the Power-Up Optimizer's **multi-raid sweep** is empty before a CSV import. A
second follow-up then also confirmed the single-raid slots (which I'd flagged as an open question rather than
guessing) should stay filled too.

**Why:** the user cared about a specific, narrow thing (import-gated features starting honestly empty) and
the first relay of that request over-generalized it to "empty rosters" generally, sweeping in two tabs that
ship a DELIBERATE worked demo on purpose (their own doc comments say so explicitly, with dated verification
numbers). Emptying a demo default is a real product decision, not a mechanical refactor — worth re-confirming
scope on rather than just building the most literal reading of an ambiguous instruction, especially when the
target already has "this is deliberate" comments attached.

**How to apply:** when a task says "make X empty" and X already has a doc comment explaining WHY it's
populated (verified numbers, "replaces an earlier default that failed outright," etc.), that comment is a
signal the default is load-bearing — flag it back rather than silently reverting good prior work. When asked
to investigate before changing ("find out what it actually shows today... if it already reads as an honest
empty state, report that and stop"), actually do the investigation FIRST via a code read (state hooks,
conditional gates) before writing any code — in this case both targets already behaved correctly (Roster
tab has no seed data at all — `useState(loadRosterPool)` returns `emptyRosterPool()` on a fresh browser, and
every dependent section is already gated on `entries.length`/`hydratedPoolCount`, disabled buttons included;
the multi-raid sweep's pre-run message already named the exact fix and disabled "Run sweep" at 0 imported).
The only REAL defect found was cosmetic: 4 of 5 "on the Roster tab" mentions were plain prose while a 5th
(single-raid's own empty state) already used a real `<a href>${getBaseUrl()}?view=roster</a>` link — fixed
the other 4 for consistency. That's the right scope for "investigate, then report" — not zero changes, but
not a manufactured feature either.

When reverting a scope correction, don't `git checkout` blindly if you made an UNRELATED necessary fix inside
the same file during the over-scoped work — reconstruct by hand (or diff-and-selectively-revert) instead. Here,
removing `TeamRaidView.tsx`'s empty-default roster also required removing a stale, now-redundant
`TeamScenarioWithShadow.showDetailedAssumptions?: boolean` bolt-on field, because a CONCURRENT engine-developer
session had (uncommitted, mid-session) folded that field into the engine's own `TeamScenario` as REQUIRED —
this was a real, independent bug (TS2430: interface incorrectly extends) that had nothing to do with the
roster-emptying task and had to survive the revert. I kept that fix and the (still-generically-useful)
zero-fielded-slot invitation-panel render path, while restoring only the `DEFAULT_TEAM_ASSUMPTIONS.slots` value
and its doc comment to their original content — verified via `git diff` line-by-line before moving on.

See [[pattern_worktree_isolation_for_concurrent_session_verify]] for the disk-junction pitfall and the
working fallback used to run a clean `npm run verify` while a concurrent, unrelated engine session had
`packages/engine` in a transiently broken state.
