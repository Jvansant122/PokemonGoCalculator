---
name: feature_displaced_mega_note_move_change_tables
description: Surfaced rosterMoveChange.ts's displacedEntryId/displacedFieldedMega (a real engine bugfix) on the multi-raid move-change tables in PowerUpOptimizerView.tsx. New rosterDisplacedSlotNote.ts helper; real SpeciesPicker race found while scripting verification; the task's own suggested repro fixture didn't actually fire.
metadata:
  type: project
---

Built 2026-09-11. Purely a web-side consumption of two engine fields that already
existed with zero `packages/web` consumer (`RosterSecondChargedMoveCandidate`/
`RosterEliteTmCandidate.displacedEntryId`/`.displacedFieldedMega`,
`packages/engine/src/rosterMoveChange.ts`) — no engine change, no new `Scenario`
field, nothing to flag for engine-developer.

## New shared helper: rosterDisplacedSlotNote.ts

Mirrors `rosterMovesetBadge.ts`'s exact shape (pure function, `{label, title}` for
a `title`-tooltip, own unit test) rather than inlining the two-case logic
straight into the view — `displacedSlotNote(fielded, displacedEntryId,
displacedFieldedMega, displacedName)` returns `null` for a fielded row (nobody
displaced) or one of two cases:
- ordinary (`displacedFieldedMega: false`): plain `.caveats` caption, "replaces
  &lt;name&gt;" — same visual weight as `identity`/`movesetBadge` in
  `MultiRaidCandidateRow`.
- mega-conflict (`true`): styled as `.badge-approximate` ("distrust/read
  carefully" hue, reused rather than inventing a new badge class), label "vs.
  your CURRENT mega (&lt;name&gt;)", title explains the referent changed and
  that a small/negative delta here means "doesn't beat your existing mega," NOT
  "is weak."

Needed a NEW `entryId -> species name` map (`entryNameById`) in
`PowerUpOptimizerView.tsx` alongside the pre-existing `entryIdentities` (which
is an IV-spread string, not a name) — threaded through
`MultiRaidMoveChangeSection` -> `RosterSecondChargedMoveTable`/
`RosterEliteTmSection` as a new prop. Rendered inside the existing "Fielded?"
column cell (benched rows only) rather than adding a new column — kept it a
per-row qualifier, not a table restructure, per the task's own instruction.

## The task's own suggested repro fixture did NOT reproduce the bug

The task briefing (citing [[feature_gated_evolutions_and_roster_move_change_sweep]])
said the real `pokeGenieSample.csv` (Mega Delphox + Mega Blaziken) "reportedly"
triggers `displacedFieldedMega`. Live-verified it does NOT, with the CURRENT
committed fixture and CURRENT live boss set: Mega Blaziken in that CSV is only
level 20 with mediocre IVs (84.4% avg) vs. Mega Delphox's level 39/95.6% — its
`benchedProxyDamagePerSecond` never beats the roster's own weakest FIELDED
slot, so it's filtered out of benched-candidate consideration entirely
(`if (proxyGain > 0)` in rosterMoveChange.ts) before the mega-conflict branch
is ever reached. Confirmed via a real Playwright run against the full 164-row
import: 0 displaced-mega rows, 4 ordinary benched rows. **Always re-verify a
cited repro rather than trusting the citation** — the underlying engine bug
and its fix are real (engine tests pin it with synthetic fixtures), but a
specific claimed real-data repro can go stale as soon as anyone edits the
sample CSV or the live boss set rotates.

## Had to hand-construct a roster to reliably trigger the mega-conflict case

Used the Roster tab's own hand-entry form (`RosterEntryForm.tsx`) — NOT a
bypass, still the real UI path — to add two different real, strong mega
species (Mega Charizard Y, Mega Blaziken) plus 5-8 ordinary fillers, all left
at the form's own defaults (level 20, IV 15/15/15) so only ONE mega can be
selected per boss (`rosterPlanner.ts`'s `selectTeam` at-most-one-canMega rule)
while both are genuinely strong enough to want a slot — guaranteeing the
LOSING mega is a real, positive-proxyGain benched candidate. With only 5
fillers (exactly filling the other 5 slots), the benched mega is the ONLY
excluded entry, so every benched row is the mega-conflict case; adding 3 MORE
fillers (8 total, competing 3-for-1 non-mega slot) also produced a genuine
ORDINARY benched row ("Pikachu ... benched, replaces Alakazam") for contrast —
Alakazam's team-selection score lost to the other fillers on this specific
boss (Tyranitar) despite being a nominally "strong" pick, which is exactly the
score-vs-raw-proxy mismatch that makes an ordinary benched candidate possible
at all. A single hand-picked boss (`BossSetPanel`'s "Use only this boss") kept
the whole repro small and fast.

**Final live-verified rendered text, side by side** (both from the SAME sweep
run, `packages/web/src/PowerUpOptimizerView.tsx`'s Elite TM table):
- Mega conflict: `"Mega Charizard Y\tMega Tyranitar\tbenched\nVS. YOUR CURRENT
  MEGA (MEGA BLAZIKEN)\n\tFire Spin\tDragon Breath\t-3.78\tunknown"`, tooltip
  "This candidate is also Mega-capable, and only one Pokémon can be Mega
  Evolved on your team at a time — so this evaluation swapped out your
  CURRENTLY FIELDED mega, Mega Blaziken, not your weakest attacker. The bar
  here is much higher than an ordinary benched row: a small or negative Δ team
  DPS means this candidate doesn't beat your existing mega, NOT that it's weak
  overall."
- Ordinary: `"Pikachu...benched\nreplaces Alakazam\n..."`, tooltip "This
  benched candidate's evaluation swapped it in for your team's weakest fielded
  member, Alakazam."

## Real SpeciesPicker race found while scripting the repro (not a product bug)

Re-selecting a species in the SAME `SpeciesPicker` instance immediately after
a previous "Add this Pokémon" submit races a STALE deferred-close
`setTimeout(() => setOpen(false), 150)` left over from the Add click's OWN
blur (species input -> Add button). That timer isn't cancelled by a later
refocus: click+refocus the input within the 150ms window opens the list
(`aria-expanded` flips true immediately), then the stale timer fires anyway
and force-closes it seconds later, even though the input's `query` state
(and thus the typed text) is untouched — NOT a full remount, so this doesn't
show up as a value reset, only as the listbox silently vanishing out from
under a script that already saw it as visible. A REAL user typing at normal
human speed never hits this (150ms is far faster than a real click-to-type
transition), so this is not something to fix in `SpeciesPicker.tsx` off the
back of this task — but any FUTURE Playwright script driving `RosterEntryForm`
through multiple rapid hand-adds needs an explicit `waitForTimeout(200+)`
after each "Add this Pokémon"/reset before the next species interaction, or
it will intermittently time out on the list-item click with a confusing
"element was detached from the DOM" error that looks like a stability/layout
issue but isn't.

## Case-insensitive badge text, again

`.badge` applies CSS `text-transform: uppercase` — `.innerText()` on the
mega-conflict badge reads "VS. YOUR CURRENT MEGA (MEGA BLAZIKEN)" even though
the underlying label string is mixed-case. Same gotcha as
[[feature_tm_move_change_optimizer_powerup_tab]]'s "default moveset" badge
check — match case-insensitively (`/vs\. your current mega/i`) in any
Playwright text assertion against a `.badge`-classed element. The plain
`.caveats` "replaces X" caption is NOT affected (no `text-transform` on that
class) — only badge-classed text needs this treatment.

## Verification performed

`npm run verify` fully green: 599 engine tests, 328 web tests (up from 323 —
`rosterDisplacedSlotNote.test.ts`'s 5 new cases), 245 script tests, 0 lint
errors (same 1 pre-existing `SpeciesPicker` warning, untouched),
`check-scenario-roundtrip` unchanged at 152 fields (correct — no new
`Scenario` field, this is a pure display join), production build clean.
Live-verified via two throwaway Playwright scripts run against `vite preview`
on the production build (deleted after, confirmed via `git status --porcelain
packages/web` clean of scratch files both before and after) — see the
rendered-text block above for the actual proof.

**Ran the whole task in a worktree a CONCURRENT session was actively, heavily
editing** (per [[feedback_concurrent_sessions_shared_worktree]] — `git status`
showed ~15 other modified files and one new untracked file,
`run/runRosterMoveChange.ts`, none of which I created or intended to touch;
`PowerUpOptimizerView.tsx`'s own diff showed 576 insertions when only ~110 of
those were mine). Did not stage, commit, or otherwise touch any file outside
`rosterDisplacedSlotNote.ts`/`.test.ts` and my own edits inside
`PowerUpOptimizerView.tsx`. `npm run verify` passing confirms the two sessions'
concurrent edits to the same file coexisted without corruption, but this is
worth a second data point for that memory entry: editing a file a concurrent
session is ALSO mid-edit on (not just a same-worktree-different-file
collision) still resolved cleanly here, though that's not guaranteed in
general.
