---
name: pass_2026-09-12_friendship_lockout_tie_audit
description: Post-hoc audit of Phase-1-deletion, tie-reporting, fast-dodge-lockout-warning, and Friendship-control day (all 4 items). Confirms bug — Power-Up Optimizer never surfaces the lockout warning despite computing it. Confirms friendship invariant clean everywhere else, tie-reporting clean, round-trips clean.
metadata:
  type: project
---

## CONFIRMED BUG: Power-Up Optimizer (both single-raid AND multi-raid modes) never surfaces the
## fast-dodge-lockout warning that its three sibling tabs all have

Comparator, Team Raid Simulator, and Species Report all import
`packages/web/src/dodgeFastAttackLockout.ts` and render a warning (at the toggle, proactively,
regardless of current toggle state, and again on any zeroed result card/row). Confirmed by grep
that `PowerUpOptimizerView.tsx` is NOT among the files importing that helper — the only tab-view
file that isn't.

Live-verified: default Power-Up Optimizer scenario (6-slot roster vs. Tyranitar, boss fast move
resolves to Bite — 0.5s, exactly the lockout boundary) with "Also dodge boss's fast attacks?" set
to Yes produces: Team DPS 0.0, Clear rate 0%, Mean time to clear "never", noise floor "±0.00",
Best-Buddy deltas all "+0.00", "Nothing affordable improves team DPS beyond the ±0.00 noise floor
— try raising stardust/candy on hand, or this roster may already be past its useful power-up
headroom against this boss" — **with zero mention anywhere on the page that this is a dodge-lockout
artifact**, not a genuine result about roster/boss matchup. A user reading this would conclude
their whole roster (and every possible power-up) is uniformly worthless against this boss, when
the true cause is an unrelated toggle silently zeroing all fast-move damage.

Confirmed this ISN'T a missing-computation problem: `packages/engine/src/powerUp.ts`
(`optimizePowerUps`/`planPowerUpBudget`, single-raid mode) calls `runTeamRaid` under the hood for
every baseline/candidate/Best-Buddy simulation, and `teamRaid.ts` already sets
`dodgeFastAttacksLockout` on each `TeamRaidSlotResult` it returns — the data exists in every result
this view already receives. `PowerUpOptimizerView.tsx` simply never reads that field into a
warning, unlike its three siblings. Multi-raid mode shares the same view file (mode is just a
`mode: "single-raid" | "multi-raid"` branch inside one component), so the same gap applies there
too, though I only live-verified single-raid mode this pass (did not confirm the multi-raid branch
live — flagging that as unverified-but-inferred-from-source).

Share link (local dev, swap host for the deployed one to reproduce on the live site):
`http://localhost:5173/?pu=eyJib3NzQ2hhcmdlZE1vdmVJZCI6bnVsbCwiYm9zc0Zhc3RNb3ZlSWQiOm51bGwsImRvZGdlRmFzdEF0dGFja3MiOnRydWUsImRvZGdlTW9kZWwiOnsia2luZCI6InBlcmZlY3QifSwiZnJpZW5kc2hpcExldmVsIjoibm9uZSIsImhvbGRDaGFyZ2VkTW92ZVVudGlsU2FmZSI6ZmFsc2UsIm1vZGUiOiJzaW5nbGUtcmFpZCIsInJhcmVDYW5keU9uSGFuZCI6MjAsInJhcmVDYW5keVhsT25IYW5kIjoxMCwic2xvdHMiOlt7ImNhbmR5T25IYW5kIjoxMDAsImNoYXJnZWRNb3ZlSWQiOiJDTE9TRV9DT01CQVQiLCJmYXN0TW92ZUlkIjoiQ09VTlRFUl9GQVNUIiwiaXNMdWNreSI6ZmFsc2UsImlzTWVnYSI6dHJ1ZSwiaXNQdXJpZmllZCI6ZmFsc2UsImlzU2hhZG93IjpmYWxzZSwiaXZzIjp7ImF0dGFjayI6MTUsImRlZmVuc2UiOjE1LCJzdGFtaW5hIjoxNX0sImxldmVsIjozNSwibWVnYUxldmVsIjpudWxsLCJzcGVjaWVzSWQiOiJsdWNhcmlvLW1lZ2EiLCJ4bENhbmR5T25IYW5kIjowfV0sInN0YXJkdXN0T25IYW5kIjoyMDAwMDAsInRhcmdldCI6InR5cmFuaXRhciIsIndlYXRoZXIiOiJub25lIn0&view=power-up-optimizer`
(1-slot Mega Lucario vs. default Tyranitar, dodgeFastAttacks=true → 0.0 team DPS with no warning
anywhere).

Handed to **web-developer**: wire `dodgeFastAttackLockout.ts`'s helper into
`PowerUpOptimizerView.tsx` the same way the other three views do — at minimum a toggle-level
proactive warning (boss fast move ≤0.5s) and a callout on the zeroed baseline/candidate result
cards, in both modes.

## CONFIRMED BUG (minor, pre-existing, found incidentally): Comparator — entering the same species
## for both Candidate A and Candidate B triggers a React duplicate-key warning

`ComparatorView.tsx:500` — `<div key={c.id} className="result-card ...">` where `c.id` is the
candidate's species id. Nothing in the UI prevents picking the same species for both candidates
(e.g. comparing two movesets or IV spreads on the same species), and doing so produces two result
cards both keyed `"tyranitar"`. React logs: "Encountered two children with the same key... Non-
unique keys may cause children to be duplicated and/or omitted." Both cards rendered correctly in
my one repro (independent 0/0 damage values, correctly labelled), so no *observed* visual
corruption this pass, but it's a real correctness risk per React's own semantics, not just log
noise, and worth an index-qualified key (e.g. `` `${c.id}-${i}` ``). Not related to today's four
shipped items — found only because my dodge-lockout tie repro used Tyranitar vs Tyranitar
deliberately. Handed to **web-developer**.

## Checked out fine this pass (actively tried to break, couldn't)

- **Friendship invariant (the pass's main target).** Confirmed clean via BOTH source and live UI:
  - Source: `packages/web/src/run/runIvBreakpoints.ts` and `runAttackDefenseBreakpoints.ts` both
    pass `friendshipLevel` into `fastMoveDamageModifiers`/`chargedMoveDamageModifiers` only, with an
    explicit comment on `incomingDamageModifiers` ("NO friendshipLevel here — this is the TARGET's
    incoming fast move..."). `packages/engine/src/teamRaid.ts` line ~754 has the identical pattern
    and comment for the boss's own damage-out fields.
  - Live: Attack/Defense Breakpoints, Delphox vs Mega Steelix — Attack-mode charged-move damage at
    IV15/Lvl50 moved 28→30 when friendship went None→Best Friend; Defense-mode grid at the same
    cell (fast=6, charged=141) was **byte-identical** before and after setting friendship to Best
    Friend in Attack mode, and the Friendship control **does not exist in the DOM at all** in
    Defense mode (absent from `get_page_text`, not just visually hidden).
  - Power-Up Optimizer: setting friendship raised the roster's own Team DPS (32.5→32.8 on a
    reduced 1-slot repro) — correct, since that's the attacker's own output.
  - Species Report correctly has NO friendship control, only a caveat sentence ("This ranking
    assumes no friendship attack bonus...").
- **Round-trip of the three new friendship fields**, all live-verified fresh-tab decode, not just
  encode: IV Breakpoints (`ivc=`, "great" → "Great Friend (+5%)" restored), Attack/Defense
  Breakpoints (`adb=`, "ultra" → "Ultra Friend (+7%)" restored), Power-Up Optimizer (`pu=`, hand-
  crafted "best" → "Best Friend (+10%)" restored). No reversion-to-default bug found on any of the
  three.
- **Tie reporting (item 2).** `rankingFlip.ts`'s `finalTieIsBothZero` distinguishes a genuine
  nonzero tie from a both-zero result; live-reproduced a Tyranitar-vs-Tyranitar, 0.5s Bite,
  dodgeFastAttacks=on, 0-trainer scenario that zeroes both candidates' own damage — chart correctly
  rendered "Neither candidate dealt any own+team damage in this window under these assumptions —
  check the dodge and moveset settings above before reading a winner into this chart" (not the old
  "Ranking flips at..." sentence, and not a false leader).
- **Fast-dodge lockout warning internal consistency.** Team Raid Simulator: proactive warning at
  the toggle appears even while the toggle is still "No" (as soon as the selected boss fast move is
  ≤0.5s), correctly did NOT appear for the default boss fast move (Smack Down, 1.0s), correctly DID
  appear after switching to Bite (0.5s); after actually toggling dodge-fast-attacks on, the zeroed
  result card's "Affected 6 of 6 fights this encounter" matched the result's own "6 faint events"
  exactly. Species Report: toggle-level count ("9 of the currently-selected bosses...") and the
  footnote below the table ("9 of 17 rows above are flagged...") agreed with each other AND with a
  manual count of the "DODGE LOCKOUT" badges in the rendered table (9), on the default Kartana
  scenario. No false positive found on any row without the badge.
- **Lockout boundary, `<=0.5` confirmed in source** (`breakpoints.ts`:
  `fastMoveCadenceTooFastToDodge = fastMoveDurationSeconds <= DODGE_COST_SECONDS` where
  `DODGE_COST_SECONDS = 0.5`). Could NOT test the "0.6s should not flag" half of the requested
  boundary check with real data — grepped every `durationSeconds` in `data/normalized/species.json`
  and confirmed **no fast move in the current dataset is 0.6s** (values present: 0.5, 1, 1.5, 2,
  2.5, 3, 3.5, 4, 4.5, 5 — nothing between 0.5 and 1). Substituted a 1.0s move (Iron Tail /
  Smack Down) instead, which correctly did not flag. The `<=0.5` boundary itself is unambiguous
  from source, so this is a data-coverage gap in my ability to test the exact "just past the
  boundary" case, not a reason to doubt the boundary.
- **Design item 5, all three claims verified live**: Team Raid's moveset-risk box is amber under
  "Cleared" and red under "Timer expired — raid failed" (same scenario, only the boss fast move
  changed between the two checks). Power-Up Optimizer's Single-raid/Multi-raid mode toggle buttons
  stack vertically at 375px mobile width. The mobile tab strip keeps the active tab
  (Power-Up Optimizer) visible and highlighted within its horizontally-scrolled position at 375px.
- **Phase-1-deletion blast radius (item 1).** Did not find any UI regression attributable to the
  `simulateOpeningBurst`/`runComparison` deletion — every tab exercised this pass (Comparator, Team
  Raid, Species Report, IV Breakpoints, ADB, Power-Up Optimizer) loaded and computed without
  console errors related to a missing export, and numbers matched hand-expectations throughout.
  Not an exhaustive proof, but no symptom found.

## Notes / non-findings worth recording

- Power-Up Optimizer's own default demo boss (plain Tyranitar, not Mega) is not in
  `data/normalized/activeRaids.json` today (2026-09-12) — same pattern as the 2026-09-10 finding
  about Team Raid Simulator's stale default (Mega Tyranitar then). Not re-flagging as a new
  separate bug since it's the same already-documented pattern (a hardcoded illustrative default
  going stale as the raid rotation moves); worth a look if `web-developer` ever does a defaults
  sweep across all tabs at once.
- Team Raid Simulator, IV Breakpoints, Attack/Defense Breakpoints (attack mode), Power-Up Optimizer
  (both modes), and Two-Candidate Comparator all now carry the Friendship control; only Species
  Report (caveat-only) and Attack/Defense Breakpoints' Defense mode (no control at all) are
  exceptions — both deliberate per the task brief.

## Tooling notes this pass

- Screenshot/click timeouts ("the page did not finish rendering in time... the pane does not need
  to be displayed") happened intermittently again this pass, consistent with prior passes' notes.
  Retrying the identical click once immediately after always worked. `get_page_text`/`find`/
  `javascript_tool` reads never failed even when screenshots did — leaned on those heavily and it
  worked well; recommend continuing to prefer them over `computer{screenshot}` for text-based
  verification.
- Decoding a tab's own `?s=`/`?pu=`/`?adb=`/`?ivc=` payload via `javascript_tool`
  (`atob(url.searchParams.get(...))` → plain JSON, no compression) is a fast, reliable way to both
  read the exact encoded scenario AND hand-craft a modified repro URL (`btoa(JSON.stringify(...))`)
  without fighting the UI for an edge case the UI doesn't have controls to reach quickly (e.g.
  forcing two identical candidates, or a specific friendship enum value). Recommend for future
  passes — much faster than clicking through comboboxes when the exact scenario shape is already
  known from a prior read.
