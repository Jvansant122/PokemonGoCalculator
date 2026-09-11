---
name: feature_best_moveset_toggle_and_inverted_default_cleanup
description: Closed 3 IDEAS.md items in one pass (2026-09-10/11) — multi-raid "best available moveset" toggle with a badge-consistency fix, confirmed per-boss progress still has no engine hook (no-op), and collapsed 3 inverted-decode-default fields now that old-link backward compat was dropped
metadata:
  type: project
---

Closed IDEAS.md #11 (best-available-moveset toggle), #13 (per-boss progress — confirmed
still not buildable, correctly a no-op), and #16 (reconcile the two "show advanced
assumptions" patterns) in one web-only pass. `packages/engine` untouched throughout —
an `engine-developer` was concurrently active there in the same worktree (per
`feedback_concurrent_sessions_shared_worktree`); staged nothing, only read/ran, and
diffed my own file list against `git status` before finishing to confirm zero overlap.

## 1. Best-available-moveset toggle — scoped to multi-raid ONLY, and why that scope is load-bearing

`PowerUpOptimizerAssumptions.multiRaidUseBestAvailableMoveset` (default `false`). New
`effectiveMoveIds(entry, useBestAvailableMoveset)` in `run/runRosterPlanner.ts` is the
ONE place substitution happens: for a pool entry, replaces `fastMoveId`/`chargedMoveId`
with the species' own highest power/durationSeconds move (the SAME intrinsic metric
MoveSelect.tsx's `approximateDps` already shows — no STAB, no matchup-specific type
effectiveness, deliberately) **only when that slot's own
`fastMoveIsDefaulted`/`chargedMoveIsDefaulted` flag is still true**. `toEngineRosterPool`
now takes this as an optional second param (default `false`, so every pre-existing call/
test is unchanged) and calls the same function — never reforked.

**Why this can't contradict the Roster tab's hand-fix flow (the task's own flagged
risk):** editing an entry there (`rosterEntryDraft.ts`) always writes
`fastMoveIsDefaulted`/`chargedMoveIsDefaulted` back to `false` ("always marked fully
KNOWN"). That flag is the ONLY gate this toggle checks. So a hand-fixed entry is
structurally immune the moment it's fixed — there's no separate "trust this guess
less" state that could drift out of sync with the Roster tab's own badge. No
reconciliation logic needed; the existing flag already IS the reconciliation.

**Why this can't become a TM-pricing back door (the task's other flagged risk):**
`effectiveMoveIds`/`toEngineRosterPool` have exactly one call site
(`resolveRosterPlannerInputs`, multi-raid only). The single-raid TM/second-charged-move
optimizer (`run/runPowerUpOptimizer.ts`) is a wholly separate code path that never
imports either function — verified by grep, not just by reasoning about the plan.
Documented this explicitly in both `effectiveMoveIds`' own doc comment and the new
"Known caveats" `<details>` so a future session doesn't accidentally wire it in there.

**Real bug caught before shipping, not after:** `rosterMovesetBadge.ts`'s
`movesetDefaultBadge()` takes the entry's OWN `fastMoveId`/`chargedMoveId` and reports
"assumed X" in its tooltip — but `PowerUpOptimizerView.tsx`'s pre-existing
`entryMovesetBadges` memo built that badge straight from the hydrated pool entry
(always `chargedMoves[0]`), independent of the toggle. Once the toggle substitutes a
different move for the SIMULATION, the badge would have kept claiming the OLD
assumption — a direct "result without its conditions is wrong" violation, on a tab
whose whole point is trust in a recommendation. Fixed by running the SAME
`effectiveMoveIds` call inside that memo before calling `movesetDefaultBadge`, and
added `assumptions.multiRaidUseBestAvailableMoveset` to its dependency array (it wasn't
there before because the toggle didn't exist — easy to have missed since the memo
"worked" without it, just silently stale). Did NOT touch `rosterMovesetBadge.ts` itself
or its label wording — `RosterView.tsx`'s own call site (the Roster tab, which has no
such toggle) must keep reporting the naive default honestly.

Also had to remember to add the new field into BOTH of `PowerUpOptimizerView.tsx`'s
hand-built `PowerUpOptimizerAssumptions` object literals (`optimizerAssumptions` for
single-raid, `multiRaidInputs` for multi-raid) — this file deliberately never uses
`{...assumptions}` for either (narrow dependency arrays for two separate `useMemo`s),
so a new field is invisible to both memos until added by hand to the literal AND its
own dependency array. Missed the dependency array once during this session (caught
immediately by rereading the file, not by a test failure) — worth double-checking both
every time.

Tests: new `effectiveMoveIds`/`toEngineRosterPool` cases in `run/runRosterPlanner.test.ts`
(needed a NEW `fakeSpeciesWithMoveChoices` fixture — the existing `fakeSpecies` only had
one move per slot, so there was no genuine "best" to pick). Live-verified via a scratch
Playwright spec (built, ran, deleted — see `verification_without_browser_tool` for the
technique) against the real Poke Genie sample CSV: toggling the checkbox and re-running
the sweep changed a real badge tooltip from "assumed Air Slash / Outrage" to "assumed
Dragon Tail / Breaking Swipe" for the same entry — proof the badge and the simulation
input agree, not just that both compile.

## 2. Per-boss multi-raid progress (IDEAS #13) — confirmed still a genuine no-op

Grepped `packages/engine/src/rosterPlanner.ts` for `onProgress`/`progress` — nothing.
`rosterPlanner.worker.ts`'s own doc comment still says explicitly "no yield points of
their own... needs an `onProgress` hook inside packages/engine/src/rosterPlanner.ts, out
of scope for a web-only phase." Confirmed the engine hasn't gained one despite a lot
landing today elsewhere (Roster tab, TM candidates, kmBuddyDistance). Did nothing here —
per the task's own explicit instruction, faking a percentage that doesn't track real
work is worse than the honest coarse running/done/failed state already shown. This
stays `engine-developer`'s call whenever it's picked up.

## 3. Reconciled "show advanced assumptions" — collapsed 3 inverted defaults, did NOT fold TeamScenario's field into the engine

CLAUDE.md gained a new standing-decision bullet ("Backward compatibility with OLD share
links is NOT required", 2026-09-10) mid-session from a concurrent engine-developer edit
— found it live on disk (not in my own stale system-reminder snapshot of CLAUDE.md,
which predates that edit) by grepping for "compat" before acting, per this project's
"verify a memory/claim against current files before trusting it" convention. That bullet
names the exact 2 fields as "now carry needless complexity" and explicitly authorizes
collapsing them — this made the decision mechanical, not a judgment call.

Collapsed all 3 known cases from inverted (`?? true` / `?? "aggregate-or-per-boss"`,
diverging from `DEFAULT_ASSUMPTIONS`) to plain (`?? DEFAULT_ASSUMPTIONS.<field>`, same as
every sibling field):
- `ComparatorView.tsx`'s `scenarioToAssumptions` — `showDetailedAssumptions`.
- `TeamRaidView.tsx`'s `teamScenarioToAssumptions` — `showDetailedAssumptions`.
- `PowerUpOptimizerView.tsx`'s `scenarioToAssumptions` — `multiRaidSignificanceMode`.

Updated every doc comment that explained the OLD inverted rationale (5 call sites plus
their 2 sibling type-declaration comments) rather than leaving stale "INVERTED default"
prose next to now-plain code — a half-updated comment is worse than none. Updated the 4
`scenarioRoundtrip.test.ts` cases that asserted the old inverted behavior (2 "minimal
old-link" spread-cases, which now just inherit `...DEFAULTS` correctly; 2 dedicated
"decodes an absent field" tests, renamed and re-asserted to the new plain value) rather
than deleting coverage — same assertions, updated expected values, renamed to describe
what they now prove.

**Reconciliation direction, and why I stopped where I did:** the task's own framing
already correctly predicted this — the HONEST full reconciliation (Team Raid's
`showDetailedAssumptions` moving off its web-only `TeamScenarioWithShadow` bolt-on and
onto the engine's real `TeamScenario`, matching what the Comparator got 2026-09-10) is
an engine change (`teamScenario.ts`), out of scope for `packages/web` only. I did NOT
attempt it, and did NOT touch `packages/engine/src/teamScenario.ts`. What I actually
did — collapsing all 3 inverted-default carve-outs to the same plain pattern every
other field already uses — is a full, honest completion of the WEB-SIDE simplification
specifically authorized by CLAUDE.md's new bullet, not a partial fix pretending to be
the whole thing. The two tabs still literally differ in TYPE SHAPE (Comparator: real
required engine field; Team Raid: web-only optional bolt-on) — that structural gap is
unchanged and still needs `engine-developer`'s sign-off to close, exactly as
[[feature_scenario_show_detailed_assumptions]] (engine-developer's own memory) already
flagged it. Left IDEAS.md #16 for the parent session to decide whether to mark fully
closed or re-file as an engine-scoped remainder — did not delete or edit IDEAS.md/
CLAUDE.md myself (both were mid-edit by the concurrent engine session; touching them
would have collided).

## Verification

`npm run verify` green twice (once mid-session, once after a final re-check since a
concurrent engine session was editing `packages/engine/src/rosterPlanner.ts` — the exact
file `run/runRosterPlanner.ts` imports from — at the same time; re-ran rather than
trusting a possibly-stale earlier pass). 143 assumption fields across 7 tabs (up from
142 — the one new field). `npm run test:e2e` 26/26 both times. Production build clean.
Scratch Playwright spec (written, run, deleted, never staged) gave real browser-level
proof for item 1 beyond what the unit/e2e suites already covered.
