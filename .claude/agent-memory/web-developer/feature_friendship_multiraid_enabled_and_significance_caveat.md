---
name: feature-friendship-multiraid-enabled-and-significance-caveat
description: Enabled the Power-Up Optimizer's friendship control in multi-raid mode once rosterPlanner.ts gained the field, retired the disabled-state hint, and added a "significance can flip on friendship alone" caveat from a same-session engine measurement
metadata:
  type: project
---

Built 2026-09-12, unblocked by `engine-developer`'s same-day `rosterPlanner.ts`/`rosterMoveChange.ts`
`friendshipLevel?: FriendshipLevel` addition (uncommitted alongside this work, HEAD `fd0ed1d` at
start) — closing the exact gap the PRIOR session's `feature_friendship_across_iv_adb_pu_and_species_report_caveat.md`
had disabled-with-a-hint. That prior memory is now stale on this one point; read this file instead
for the Power-Up Optimizer's friendship story.

**Two call sites needed the new field, not just one — a move-change sweep quietly builds its own
object rather than spreading.** `run/runRosterPlanner.ts`'s `resolveRosterPlannerInputs` builds the
main `RosterPlannerInputs` object field-by-field (never `{...a}`), so `friendshipLevel: a.friendshipLevel`
had to be added there. But `run/runRosterMoveChange.ts`'s `resolveRosterMoveChangeInputs` does NOT
reuse that object wholesale either — it hand-builds its own `RosterMoveChangeInputs` by copying
individual fields off the resolved `inputs` (`inputs.pool`, `inputs.dodge`, etc.), so it silently
drops any field added only to the first object. Had to add `friendshipLevel: inputs.friendshipLevel`
there too. A grep for every hand-built engine-input object literal (not just the "obvious" one) is
the reliable way to find every such site — `{...a}` spreads never need this, discrete field lists
always might.

**`PowerUpOptimizerView.tsx`'s `multiRaidInputs` memo hardcodes single-raid-only fields as
placeholders to satisfy `PowerUpOptimizerAssumptions`' shape** (documented in its own top comment
as "fixed placeholders purely to satisfy the shape") — `friendshipLevel: "none"` was one of these
BEFORE this session, since the field used to be genuinely inert in multi-raid. Once it became real,
that placeholder had to flip to `assumptions.friendshipLevel` (the live value) AND be added to the
memo's own dependency array, or a friendship change wouldn't invalidate the multi-raid sweep's
staleness flag at all — a silent "changed the control, nothing re-ran" bug that would have been easy
to miss since the control itself would still show the new value.

**Retiring a disabled-prop control means checking for other callers before deleting the prop, not
just the current one.** `FriendshipSelect.tsx`'s `disabled?: boolean` prop was added in the prior
session specifically for this one call site (`PowerUpOptimizerAssumptionPanel.tsx`) — grepped for
every `disabled=` near a `FriendshipSelect` usage across all six other tabs, found zero, and removed
the prop entirely rather than leaving a now-dead optional prop with a default. Left ONE thing
behind deliberately: the surrounding `<div>` wrapper the disabled-hint paragraph used to need
collapsed back to a bare `<FriendshipSelect .../>` self-closing line, matching every other tab's
own usage (`ComparatorView.tsx`, `TeamAssumptionPanel.tsx`, etc. all render it bare, no wrapper).

**Several doc comments across `powerUpOptimizerScenario.ts`, `PowerUpOptimizerAssumptionPanel.tsx`,
and `PowerUpOptimizerView.tsx` explicitly asserted "single-raid only" / "rosterPlanner.ts has no
friendshipLevel field at all (confirmed by grep)"** — these are exactly the kind of claim that goes
stale silently once the underlying engine gap closes, since nothing type-checks a doc comment.
Updated all of them in the same pass rather than leaving a correct field with an incorrect
explanation beside it; a future reader trusting the comment over the code would relearn this the
hard way.

**The coordinator's own measurement arrived mid-task (a real "significance moves when it
shouldn't intuitively" finding, confirmed non-monotonic: 150/127/173 of 360 significant candidates
at none/good/forever on a real 60-entry/17-boss sweep) and asked for a caveat sentence, not a
math change.** Added a new `<details className="prose-details">` block titled "Significance and
friendship" inside the MULTI-RAID `Known caveats` `CollapsibleSection` (there is a SEPARATE,
differently-worded "Known caveats" block for single-raid mode a few thousand lines earlier in the
same file — found by grepping every `<summary>` in the file first, don't assume there's only one).
Placed it right after "Raid timer" and before "Best-available-moveset toggle", matching the
existing block's own prose voice (`&rsquo;`/`&ldquo;` HTML entities, cites the exact measured
numbers so the claim is checkable against the source measurement, ends with the causal mechanism
in one clause rather than just asserting the fact). The underlying cause (per-boss noise floor
derived from CLEAR-TIME variance via `summarizeResults`, which SHRINKS as friendship raises
survivability, combined with `floor()` breakpoint jumps that aren't monotonic in the multiplier) is
`engine-developer`'s finding, not re-derived here — this task only had to state the user-facing
consequence.

**Verification — live browser, not just codec-level.** Built `dist`, served via `npx vite preview
--port 4319`, drove Chromium via `playwright-core` from two scratch `.mjs` scripts at the repo
root (deleted after — see prior sessions' note on why scratch scripts need the repo's own
`node_modules`), reusing `e2e/multi-raid.spec.ts`'s own roster-import-via-Roster-tab helper
pattern since there's no other way to get a roster into multi-raid mode. Confirmed live:
- `#pu-friendship` has NO `disabled` attribute in multi-raid mode, and the string "doesn't model
  friendship yet" has zero matches anywhere on the page.
- The ranked-candidates table genuinely differs between friendship "none" and "forever" on the
  SAME real 164-entry roster/17-boss set — none's top row was Mega Delphox (+0.136 Δ team DPS vs.
  Shadow Torchic), forever's was Solgaleo (+0.166 Δ team DPS vs. Falinks) — a real reranking, not
  just a redisplay.
- The new "Significance and friendship" caveat renders with its full cited text under multi-raid's
  Known Caveats.
- Zero console/page errors across the whole flow.
Then killed the preview server by its EXACT PID from `netstat -ano` (not a blanket `taskkill
node.exe`, which a prior session's own memory flags as a mistake to avoid — a concurrent
engine-developer session had other node processes running at the same time).

`npm run verify` green end to end (358/358 web tests, 255/255 script tests, 155/155 scenario
round-trip fields across 7 tabs, typecheck/lint/build all clean) and `npm run test:e2e` 27/27.
Did not commit — engine changes were sitting uncommitted alongside this work per the task's own
instruction (coordinator commits both together).
