---
name: feature_team_raid_dodge_cost_frustration_notice_2026_09_11
description: IDEAS #23 (TeamRaidSlotResult.holdChargedMoveDodgeCostEvents/Seconds) and #24 (tmMove.ts's frustrationLockNotice + rosterMoveChange.ts's frustrationNotices) — both small, both shipped clean
metadata:
  type: project
---

2026-09-11, first two of a three-item batch (third item is Best Buddy — see
[[feature_best_buddy_candidate_2026_09_11]]).

## #23 — TeamRaidSlotResult.holdChargedMoveDodgeCostEvents / holdChargedMoveDodgeCostSeconds

Pure copy-through of `StepwiseRunResult`'s two same-named fields into each
`TeamRaidSlotResult` (`teamRaid.ts`), same "not clipped to the clear point"
caveat as `chargedAttacksLanded`/`bossChargedHitsTaken` (can slightly
overcount for the one fight that lands the finishing blow — doesn't affect
any outcome/margin computation). Doc comments repeat, verbatim in spirit, the
Comparator's own "THIS IS AN UNSOURCED PLACEHOLDER, NOT A CONFIRMED
MECHANIC" warning — surfacing a number a second place is not sourcing it.
Zero new MECHANICS.md entry (the existing 2026-09-09 "OPEN QUESTION" under
Dodging already covers this).

Tests: `teamRaid.test.ts`'s new `describe("TeamRaidSlotResult.
holdChargedMoveDodgeCostEvents / holdChargedMoveDodgeCostSeconds")` — 0 when
`holdChargedMoveUntilSafe` is off; positive and exactly
`events * HOLD_CHARGED_MOVE_DODGE_ATTEMPTS * DODGE_COST_SECONDS` when on
(isolated the same way `simulate.test.ts` does: the slot's own charged move
energyCost is set unreachable so only the "dodge around the boss's charged
hits" effect is exercised, not the other `holdChargedMoveUntilSafe` effect).

**Ripple**: `rosterPlanner.test.ts`'s signature-pinning test enumerates
`TeamRaidSlotResult`'s exact key set — added the two new keys there too (same
precedent as every prior field addition to this type).

## #24 — Frustration: a static, non-event-checking notice

`tmMove.ts` gained `frustrationLockNotice(move): string | null` — returns a
fixed sentence for a move literally named "Frustration", `null` for
everything else, **including Return** even though Return is also permanently
un-TM-able (`NEVER_TM_TARGETABLE_MOVE_NAMES`). Deliberately narrower: only
MECHANICS.md's "Frustration is event-gated" entry documents an actual REMOVAL
PATH (a Taken Over event); no source describes one for Return or any
signature move, so asserting a notice for those would fabricate a claim this
project has no citation for. Case-insensitive on the move name.

Wired into `rosterMoveChange.ts` as a NEW top-level array,
`RosterMoveChangeResult.frustrationNotices: RosterFrustrationNotice[]`
(`{entryId, speciesId, speciesName, notice}`) — computed ONCE per pool entry
(not per boss), gated on `!entry.movesetIsDefaulted` (a guessed move must
never be asserted as confirmed Frustration). Structurally separate from
`excluded`/`moveChangeEligibilityReason` on purpose — a Frustration holder is
**not** ineligible for a move change (it can still gain a second charged
move normally); only Frustration itself is stuck. `frustrationLockNotice`
returns a plain string or null, never `{blocked, reason}`, so a caller cannot
fold it into an exclusion list by accident.

**Real, pre-existing, CORRECT exclusion this is NOT redundant with, and
which my own test initially got wrong**: `buildEliteTmCandidateResult`
already puts a Frustration-holding entry into `excluded` with an
Elite-Charged-TM-scoped reason ("Frustration/Return require a Taken Over
event...") whenever that ONE action (Elite Charged TM) is evaluated for that
entry — correct, narrow, and unrelated to the new informational channel.
First test draft asserted "not in `excluded` at all," which failed because
this legitimate narrower exclusion fires; fixed to assert the entry appears
in BOTH `secondChargedMove` (unblocked) AND `excluded` (Elite-Charged-TM-only,
worded around the real Taken-Over fact) — both true at once, by design.

**No single-raid (tmMove.ts-only) aggregate wiring** — `frustrationLockNotice`
is exported standalone and callable directly by a single-raid caller per
slot; tmMove.ts has no existing "loop over every slot" aggregate function to
extend the way `rosterMoveChange.ts` does (that module already loops the
whole pool for `moveChangeEligibilityReason`), so there was nothing
analogous to hang a single-raid array off. Flagged for whichever web session
wires the single-raid Team Raid / Power-Up Optimizer half.

Tests: `tmMove.test.ts`'s `describe("frustrationLockNotice")` (5 tests: named
match, case-insensitivity, null for Return, null for an ordinary move, return
type is string|null never an object). `rosterMoveChange.test.ts`'s new
`describe("runRosterMoveChangeCandidates — frustrationNotices")` (4 tests):
reports the entry with the right text; does NOT block second-charged-move
(while confirming the separate, narrower, pre-existing Elite-Charged-TM
exclusion DOES still fire, worded around Taken Over); a
`movesetIsDefaulted: true` entry holding Frustration is NOT reported (guessed
move, can't be asserted as confirmed); an ordinary roster produces `[]`.

## Shared incident: a concurrent-lane `git stash` destroyed part of my #24 edit mid-session

A concurrent `data-sync` lane ran `git stash` in this shared worktree while
`rosterMoveChange.ts` had my uncommitted edits. It restored everything else
but skipped this one file (saw I'd re-edited it on disk after the stash),
leaving a Frankenstein mix: the `RosterFrustrationNotice` interface and its
doc comment were reverted to HEAD (gone), while the function body/return
statement (edited afterward) still referenced them — a real "type declared
nowhere, used at the return statement" error that looked at first like my own
mistake. Recovered cleanly via `git show "stash@{0}:packages/engine/src/
rosterMoveChange.ts"` (the coordinator identified and pointed at the exact
stash ref rather than me guessing) and `diff --strip-trailing-cr` against it
to confirm the ONLY remaining difference was my own intentional new field.
**Lesson: in this shared-worktree setup, if a file you're actively editing
comes back with a type/reference error for something you just wrote and are
sure you wrote correctly, check `git status`/ask before assuming you made a
mistake — a concurrent `git stash` mid-edit is a real, now-confirmed failure
mode, not a hypothetical one.** See top-level memory's
[[feedback_concurrent_sessions_shared_worktree]] — this is a sharper, more
specific instance of that same caution.

Files: `packages/engine/src/teamRaid.ts`, `packages/engine/src/tmMove.ts`,
`packages/engine/src/rosterMoveChange.ts`, `packages/engine/test/
teamRaid.test.ts`, `packages/engine/test/rosterPlanner.test.ts`,
`packages/engine/test/tmMove.test.ts`, `packages/engine/test/
rosterMoveChange.test.ts`. No `MECHANICS.md`/`IDEAS.md` edits made directly
(per this session's explicit instruction not to touch either while a
concurrent lane owns them) — both items' completion needs recording in
`IDEAS.md`'s Shipped table by whoever next has write access to it.
