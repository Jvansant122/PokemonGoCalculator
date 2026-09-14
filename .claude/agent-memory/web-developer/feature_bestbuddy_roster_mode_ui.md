---
name: feature_bestbuddy_roster_mode_ui
description: Wired the engine's e861049 Best Buddy roster-mode outputs (RosterPlanResult.bestBuddyCandidates, RosterBudgetPlan.bestBuddyRecommendation) into the Power-Up Optimizer's multi-raid UI, plus a new isBestBuddy field threaded through the whole Roster tab stack — a stale caveat removed, a real e2e class collision found+fixed.
metadata:
  type: project
---

Built 2026-09-14, one session after the engine shipped `isBestBuddy`/
`bestBuddyCandidates`/`bestBuddyRecommendation` (`e861049`) with the UI half
explicitly left for later. `MultiRaidResultsSection.tsx` previously carried a
STALE caveat paragraph flatly stating "No Best Buddy candidates here...
Single-raid mode ONLY" — that claim was true when written but the engine
commit made it false; the fix is not just adding UI, it's DELETING that
paragraph, or a real capability stays invisible behind wrong copy forever.
Lesson: a caveat asserting a capability gap is only as fresh as the commit
that created the gap — when adding a capability, grep for prose that denies
it existing, not just for wiring points.

## The whole `isBestBuddy` plumbing chain (7 files touched, mirroring `knownChargedMoveIds`'s existing chain exactly)

`import/pokeGenieMatch.ts` RosterEntry (web-owned, extends the CSV-import
shape) -> `rosterPool.ts` StoredRosterEntry (dehydrate/hydrate, `?? ` NOT
needed on hydrate since `undefined` is already the correct "not a Best
Buddy" meaning) -> `rosterEntryDraft.ts` RosterEntryDraft (hand-entry form
state; unlike the pool type, draft's `isBestBuddy` is a REQUIRED `boolean`,
not optional — hand-entry is always fully known, same "always clean"
convention `movesetIsDefaulted`/`ivsAreApproximate` already established) ->
`RosterEntryForm.tsx` (new checkbox, reused the EXISTING shared
`bestBuddyHint.ts`'s `BEST_BUDDY_HINT` rather than writing new copy — it was
already written generically enough for a roster-pool checkbox, not just
Team Raid's per-slot one) -> `run/runRosterPlanner.ts`'s `toEngineRosterPool`
(the web-import-shape -> engine-shape join, one more straight passthrough
line) -> engine `RosterEntry.isBestBuddy`. The CSV import path
(`buildRosterEntry`) was deliberately NOT touched — Poke Genie has no Best
Buddy column, so it stays permanently `undefined` for a freshly-imported row
and only ever becomes `true` via a subsequent hand-edit on the Roster tab
(same "hand-entry/edit is the only source" pattern as every other roster
flag this project has added).

## New: `dedupeInterchangeableBestBuddyCandidates` (`rosterCandidateDedupe.ts`)

`RosterBestBuddyCandidate` has no `fromLevel`/`toLevel` (Best Buddy doesn't
change power-up level at all), so it needed its OWN group-key function
rather than reusing `candidateGroupKey` — key is species + the entry's
CURRENT `level` (in place of from/to) + IVs + moves + cost modifiers. Kept
as a fully separate function/interface
(`DedupedRosterBestBuddyGroup`/`dedupeInterchangeableBestBuddyCandidates`)
rather than trying to generalize the existing one over an optional
level-vs-fromLevel/toLevel parameter — the two candidate shapes are
different enough that a shared generic would have been more contortion than
the ~40 lines of duplication it replaced.

## `MultiRaidBestBuddyRow` has no `level` field to render from the candidate itself

Unlike `MultiRaidCandidateRow` (which shows `fromLevel → toLevel` straight
from the engine row), `RosterBestBuddyCandidate` carries no level at all —
had to build a small `entryLevelById` join (entryId -> `pool` entry's own
`.level`) inside `MultiRaidResultsSection`, same "entryId -> X" map shape as
the pre-existing `entryIdentities`/`entryMovesetBadges`. Don't assume every
roster-result row type carries the same fields the power-up-ladder one does
— check the actual interface before reaching for the same prop pattern.

## Empty-state disambiguation ("already done" vs. generic) computed client-side, no new engine field

The task required distinguishing "0 candidates because every fielded entry
is already flagged Best Buddy" from a generic empty panel. The engine gives
no direct flag for this, but the data to derive it honestly was already
present: union every `entryId` across `run.data.baselinePerBoss[i].team`
(every boss's fielding order), then check via the hydrated `pool` whether
EVERY one of those already carries `isBestBuddy: true`. `useMemo`'d as
`bestBuddyEmptyReason: "already-best-buddy" | "none" | null`. Confirmed live
(both scratch Playwright and the new permanent e2e case) that flagging a
SINGLE fielded species (Mewtwo, on the real `pokeGenieSample.csv` fixture)
drops the row count by EXACTLY 1 and removes exactly that species from the
list — not just that the empty-state text changes.

## Real e2e class collision found and fixed: `.blocked-gain-callout` is not unique once `bestBuddyRecommendation` is non-null

`MultiRaidBudgetPlanSection`'s pre-existing stop-reason callout
("blocked"/"lockout"/"nothing further helps") and the NEW
`bestBuddyRecommendation` callout both use the same `.blocked-gain-callout`
class (mirroring `SingleRaidResultsSection.tsx`'s own precedent — both of
ITS callouts share the class too). The pre-existing
`multi-raid.spec.ts` test `power-up-optimizer multi-raid: switch mode...`
asserted `budgetSection.locator(".blocked-gain-callout")).toBeVisible()`
with no `.first()` — this had ALWAYS been fragile (single-raid's sibling
test never hit it only because that exact roster/boss combination never
produced BOTH callouts at once), and adding the Best Buddy callout tripped
it for real: this session's roster/boss combination produced a genuine
`bestBuddyRecommendation` for Mega Delphox, giving 2 matching divs and a
Playwright strict-mode violation. Fixed by adding `.first()` (same pattern
already used elsewhere in this same file for "computed off the main thread"
ambiguity) — the assertion's actual intent was "at least one real callout
rendered," not "exactly one." **Lesson: a class-based Playwright locator
with no `.first()`/`.nth()` and no unique text is a real, if latent,
multi-match hazard the moment a second element sharing that class becomes
possible — this is worth proactively re-running the FULL e2e suite (not
just a spec you think is related) after adding ANY new element that reuses
an existing shared CSS class**, since the trigger condition here
(a specific roster producing a specific recommendation) is not something a
diff review would catch.

## Verification depth

Real Chromium via a scratch Playwright script (built dist + `vite preview`,
killed by exact PID afterward — not a blanket `taskkill node.exe`) BEFORE
writing any permanent e2e case, confirming: hand-entry checkbox persists
across reload+edit, the compact-stats "N best buddy" count, the stale
caveat's removal, 12 real Best Buddy rows on the sample fixture with a
working per-boss-breakdown expand, the row-count-drops-by-exactly-1 proof
for a single flagged species, and the all-flagged "Nothing to recommend"
empty state — all before committing to a permanent `multi-raid.spec.ts`
case covering the same three assertions. Then `npm run verify` (654 engine +
413 web [+8 new: 2 dedupe, 2 rosterPool round-trip, 1
rosterEntryDraft round-trip, 1 toEngineRosterPool passthrough, 2 implicit
from existing suites growing] + 257 scripts, typecheck, lint, all 4
checkers, production build) green, `check-scenario-roundtrip` confirmed
STILL 155 fields (no `Scenario` field added — `isBestBuddy` is roster data,
per the task's own constraint), and the full Playwright suite (33 specs, up
from 32) green including the class-collision fix above.

## Files

`packages/web/src/import/pokeGenieMatch.ts`, `rosterPool.ts` (+test),
`rosterEntryDraft.ts` (+test), `RosterEntryForm.tsx`, `RosterView.tsx`
(flags list + new "best buddy" compact-stats count), `run/runRoster.ts`
(`RosterSummary.bestBuddyCount`), `run/runRosterPlanner.ts` (+test,
`toEngineRosterPool`), `rosterCandidateDedupe.ts` (+test, new
`dedupeInterchangeableBestBuddyCandidates`), `MultiRaidResultsSection.tsx`
(new "Best Buddy candidates" CollapsibleSection + `MultiRaidBestBuddyRow` +
`rosterProgressSentence`'s `"bestBuddy"` case), `PowerUpOptimizerView.tsx`
(`MultiRaidBudgetPlanSection`'s new `bestBuddyRecommendation` callout),
`e2e/multi-raid.spec.ts` (`.first()` fix + new dedicated Best Buddy test
case).
