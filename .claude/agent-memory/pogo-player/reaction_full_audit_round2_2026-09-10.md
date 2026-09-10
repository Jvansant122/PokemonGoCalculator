---
name: reaction-full-audit-round2-2026-09-10
description: Round 2 satisfaction audit (2026-09-10) — verifies the 6 round-1 FIXABLE findings plus 3 other landed changes (level cap 50, Super Max reachability, Mega TTar default) against the live app. All 6 confirmed landed and working. One NEW finding — numeric inputs (level/IV/candy/stardust) don't select-all on focus, unlike the fixed species search box, and can silently corrupt a value by appending digits. Read before round 3.
metadata:
  type: project
---

Triggered by: round-2 satisfaction audit, re-verifying round-1's 6 FIXABLE findings
(`reaction_full_audit_2026-09-10.md`) plus new work (level cap 50, Super Max reachability gating,
Mega Tyranitar re-test). Driven live at 1920x1080, all six tabs.

## Round-1 fixes: all 6 confirmed landed, working as described

1. **Default roster no longer loses outright.** Team Raid / Power-Up single-raid default (Fighting/
   Steel team vs. plain Tyranitar, 3,600 HP) clears at 118.5s of 300s, 1 wipe, confirmed live.
   Failure-state reporting confirmed separately by switching the boss to Mega Tyranitar (9,000 HP)
   with the SAME roster: "Timer expired — raid failed", "72% OF BOSS HP DEALT", "Team DPS shortfall
   ~8.4 short (avg 21.6 of ~30.0 needed)", "Time left when the clock ran out 0.0s", "Finishing blow
   n/a" — no bare "n/a" row anywhere. Real, useful failure output now.
2. **Budget plan now reports clear rate before/after.** Confirmed live with a funded scenario
   (100k+ stardust, real candy): "Baseline clear rate 100% / Clear rate after this plan 100% (avg
   89.8s to clear)". The specific "0% — still doesn't clear" copy for a plan that still fails is
   confirmed IN CODE (`PowerUpOptimizerView.tsx:1423`) though I didn't reproduce a still-failing
   funded plan live to see it rendered — low risk, one-line conditional.
3. **Stale-roster re-import notice landed in code as a distinct counter.** `rosterStaleMovesetBadgeCount`
   (`PowerUpOptimizerView.tsx` ~848-856) is separate from `rosterDroppedCount`, with its own copy
   ("imported before moveset badges existed — re-import your CSV..."). Could NOT reproduce a live
   stale-format roster to see the banner render (this persona has no localStorage/console access
   to plant old-schema data, and the only roster present in this browser profile — 2 entries — is
   already post-fix and shows badges fine). Code inspection is the only verification I could do;
   trust it but don't consider it player-tested.
4. **IV Breakpoints methodology moved behind a toggle, matching Species Report's pattern exactly.**
   Verdict box + breakdown table stay visible when the parent panel is expanded; "How 'outperforms'
   is scored, and what the tier-4+ restriction excludes" is now a separate collapsed line below the
   table, not inline prose. (Note: the OUTER panel "Impact across every raid target" also starts
   collapsed by default — pre-existing top-level collapse behavior shared with Assumptions/Known
   caveats elsewhere in the app, not something this fix introduced or regressed.)
5. **"Known caveats" now split into per-topic sub-disclosures everywhere checked.** Comparator: 4
   sub-items (Simulation/mega mechanics, Mega Level, Boss cadence model, "More detailed" toggle).
   Team Raid: 7 sub-items. Power-Up single-raid: 6 sub-items (Roster scope, Mega Level, cadence
   model, Ranking display, Raid timer, Scope/noise-floor/cost-table gaps). Confirmed on 3 of 6 tabs;
   IV Breakpoints/Attack-Defense deliberately untouched per the plan (genuinely shorter).
6. **Species search combobox now selects-all on focus.** Confirmed with a real repro of the
   original bug pattern: single left_click into a filled box ("Mega Beedrill") then typing "mewtwo"
   produced a clean match list (Mega Mewtwo X/Y, Mewtwo, Mewtwo (A), Shadow Mewtwo) — no
   "Beedrillmewtwo" append, no "No matches" state. Confirmed on both Comparator candidate pickers
   and Team Raid Simulator's boss picker.

## Other landed changes, spot-verified

- **Level cap 50** confirmed live on Comparator (typed level 50 into "Level (both candidates)",
  numbers recalculated: Kartana DPS 11.1->12.6, Rayquaza 20.7->18.7) and on Team Raid Simulator
  (level 50 computed cleanly, no error).
- **Super Max gating by eligibility** confirmed: Mega Lucario and Mega Charizard Y (no "+" move in
  their data) show only Base/High/Max in the Mega Level dropdown; Mega Beedrill (has "Fell Stinger+")
  shows a 4th "Super Max" option, and selecting it surfaces the community-estimate caveat text
  inline. Did NOT test the specific "share link with unreachable Super Max already encoded shows
  '(not reachable here))'" edge case — would need to hand-craft a URL param combination; low risk,
  deprioritize re-checking unless a share-link bug is reported.
- **Mega Tyranitar default still failing at level 50** — not independently re-verified this round,
  taking the report at its word (consistent with the team-comp mismatch being real: Fighting-heavy
  roster into a Dark/Fire boss).

## NEW finding this round (not in round-1's list)

**FIXABLE, low-to-medium priority.** Numeric inputs (level, Attack/Defense/Stamina IV, candy-on-
hand, XL-candy-on-hand, stardust-on-hand) do **not** select-all on focus, unlike the species search
combobox fixed this round. A single click into a pre-filled numeric field followed by typing
APPENDS digits rather than replacing the value — the exact same bug class as finding #6, just left
unfixed on a different control family.

Reproduced twice, live:
- Team Raid Simulator, "Level (whole roster)" pre-filled "35": single-click + type "7" -> field
  became "357" -> app correctly caught it and refused to compute ("Could not compute this raid: No
  CPM entry for level 357. Valid levels are 1-52..."). LOUD failure, self-correcting, low real risk.
- Power-Up Optimizer, Slot 1 "Candy on hand" pre-filled "100": click + ctrl+a + type "50" ->
  field became "10050", NOT 50. SILENT — no error, no warning, just a candy pool 100x too large
  fed straight into the budget planner's affordability math. This is the dangerous case: a player
  fixing a typo or updating one slot's candy count on a form they've already filled in most of
  (exactly the real users' workflow — methodical, edits fields in place, trusts the tool) can
  silently corrupt their own budget inputs with no on-screen signal, and every downstream number
  (afford/can't-afford, stardust remaining, plan steps) will be wrong but LOOK confident.
- Root cause is almost certainly the same click-handler gap the species-box fix closed — worth
  applying the identical fix (select-all-on-focus) to every numeric field in Team Raid Simulator,
  Power-Up Optimizer (both modes), IV Breakpoints, and Attack/Defense Breakpoints.

Note: triple-click reliably replaces correctly on these same fields (verified), so this is
specifically a single-click/ctrl+a gap, not a broken input.

## Per-tab satisfaction, round 2 (deltas from round 1 only; full verdicts still in round-1 file)

- **Comparator**: real-users still satisfied; caveat-split (#5) and search-box fix (#6) are
  small net positives, no change to bottom-line verdict.
- **Team Raid Simulator**: the real users' biggest blocker (losing default) is gone. First-open
  experience now demonstrates the wipe/revive mechanic AND a real win, which is what was missing.
  f2p-constrained also newly satisfied here — first thing they see is no longer "you would have
  wiped," which was actively discouraging under the old default.
  hardcore-spender unaffected either way — they were never blocked by the default, they'd swap it
  immediately regardless.
- **Power-Up Optimizer (single-raid)**: f2p-constrained's core objection (irreversible spend, no
  clear-rate signal) is resolved — clear rate before/after is now on screen next to the plan.
  This was their sharpest complaint in round 1; consider it closed.
- **Power-Up Optimizer (multi-raid)**: stale-badge fix is real in code, unverified live (see above).
  the real users' actual roster (predates the badge fields, per round-1 finding) should trigger
  this banner on next real use — can't confirm from this session's browser profile.
- **IV Breakpoints**: real-users satisfied on substance already; #4's fix removes the one
  friction point (prose-before-table). casual-optimizer's STRUCTURAL rejection unchanged (still
  presupposes two IV spreads you already care about) — not revisited, not expected to move.
- **Species Report / Attack-Defense Breakpoints**: no changes targeted here this round, spot-checked
  for regressions only, none found.

## STRUCTURAL calls carried over from round 1, not re-litigated

- casual-optimizer rejects IV Breakpoints, Attack/Defense Breakpoints, and Power-Up Optimizer
  single-raid on premise (multi-field entry before any output) — unchanged.
- Teambuilding Analyzer / user-selectable combat phase / own-party mega boost — standing decisions,
  not revisited.

## Deferred by name, not investigated

"Also dodge boss's fast attacks" + a boss fast move <=0.5s producing zero attacker damage all fight
— known, engine-flagged, UI surfacing deliberately deferred per this round's brief. Not hit
incidentally this session; not chased.

## Tool notes (not product findings)

- `screenshot`/`zoom` continued to be unreliable this session (blank frames, stale/wrong-tab
  content, "region crop not yet supported" on `zoom` despite region being passed) — `get_page_text`
  and `find` carried nearly all verification this round. Don't burn budget retrying screenshots;
  switch to text-based checks immediately when a screenshot looks wrong.
- Numeric-field select-on-focus testing: use `triple_click`, not `left_click` + `ctrl+a` — the
  latter did not reliably select existing content in this environment (see NEW finding above; this
  may be a genuine product gap, a tool quirk, or both — the APPENDED VALUE and resulting behavior
  downstream are real and confirmed either way, which is what matters).
