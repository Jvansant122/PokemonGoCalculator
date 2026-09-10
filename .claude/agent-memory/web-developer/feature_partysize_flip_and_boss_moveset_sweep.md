---
name: feature-partysize-flip-and-boss-moveset-sweep
description: Comparator's party-size ranking-flip (IDEAS #19) reusing the engine's pre-existing, previously-unused findCrossoverPartySize; Team Raid's boss-moveset-sweep headline callout (IDEAS #18), NOT copying BossMovesetSweep.tsx's table presentation
metadata:
  type: project
---

Built 2026-09-10, both IDEAS items in one session, no `Scenario`/`Assumptions` field added to either
tab (both derive from existing inputs, per the task's own constraint) — `check-scenario-roundtrip`
stayed at the same 135-field count throughout.

**#1 — party-size flip: found and reused an EXISTING, already-tested, never-called engine
function instead of writing a second scan loop.** `packages/engine/src/uptime.ts` already exports
`findCrossoverPartySize` (Candidate x/y, teammateDps, `matchingFraction: {a,b}`, a party-size range
array, fightDurationSeconds -> `CrossoverPoint{partySize, leaderBelow, leaderAtOrAbove}`) — already
unit-tested in `packages/engine/test/uptime.test.ts`, but had ZERO call sites anywhere in
`packages/web` before this session. `sensitivity.ts`'s own check 1 comment explicitly *considered
and declined* it (its concern: the function anchors "the" flip to wherever the sweep's leader FIRST
changes from party size 0, not to the specific-currently-configured-party-size's actual winner,
which only matches a ranked "distance from current value" row if leadership crosses at most once).
That concern is real for `sensitivity.ts`'s use case but irrelevant for THIS feature — a dedicated,
always-visible headline asking "does the ranking ever flip across 0-20" wants exactly the function's
own semantics, not a "distance from current" framing. Used it as-is via a new
`ComparatorRunResult.partySizeFlip` field in `run/runComparator.ts` (`PARTY_SIZE_RANGE` = 0..20
inclusive, matching `AssumptionPanel.tsx`'s own `partySize` NumberField bounds and
`sensitivity.ts` check 1's scan range) — no `packages/engine` edit needed or made.

**Gating**: `partySizeFlip` is `null` whenever NEITHER candidate has an active boost (mirrors
`AssumptionPanel.tsx`'s `anyBoostActive` gate that hides the party-size controls entirely in that
case) — computed with a LOCAL `boostA?.multiplier !== undefined || boostB?.multiplier !== undefined`
check, same "small local equivalent, not a shared import" precedent as
`feature_hide_inert_boost_ui_and_move_efficiency_metrics.md`. The default Comparator scenario
(kartana vs rayquaza, both non-mega) has this gate OFF — the smoke test pins `partySizeFlip` as
`null` for the default scenario, and two dedicated tests use a real found flip/no-flip pair instead.

**Presentation**: extracted `SensitivityView.tsx`'s private `FlipBar` component to exported, and
narrowed its prop type from the full `SensitivityCheck` to a 4-field `FlipBarData` interface
(`rangeMin`/`rangeMax`/`currentNumericValue`/`flipNumericValue` — the only fields it ever read) so
a standalone flip result can reuse the exact same number-line SVG without fabricating the other
`SensitivityCheck` fields (label/currentValue/flips/distance/distanceLabel) it has no use for.
`SensitivityCheck` already satisfies the narrower interface structurally, so every existing call
site needed zero changes. New `PartySizeFlipView.tsx` renders a headline sentence (3-way: real
flip found / leads at every party size, no flip / degenerate exact tie) + that `FlipBar`, as its
own `CollapsibleSection` (`defaultOpen`) between the damage-over-time chart and `SensitivityView` —
NOT folded into the existing sensitivity list, since that list is sorted-by-distance and this is a
dedicated, always-visible headline per the task's framing.

**Real example found by sweeping the actual registry** (script: iterate mega candidates × non-mega
candidates × a few real bosses, call `runComparatorScenario`, look for `partySizeFlip.partySize !==
null`): **Mega Rayquaza vs Mega Salamence vs Tyranitar, matchingTeammateCount 2** — Mega Rayquaza
(406 own damage, 18.5s mean survival, `persistsThroughFaint`) leads below 3 other trainers; Mega
Salamence (356 own damage, but 21.9s mean survival) overtakes at 3+ once its longer uptime's team
contribution compounds past Mega Rayquaza's raw-damage lead. Screenshot-verified at 1920x1080 (real
`vite preview` + Playwright chromium, no console/page errors): the headline read *"Ranking flips at
3 other trainers in the raid: Mega Rayquaza leads below that, Mega Salamence leads at 3 or more.
(currently 4 other trainers.)"* — exactly the found value. The "never flips" case (Mega Rayquaza vs
Kartana vs Mega Latios) rendered *"Mega Rayquaza leads at every party size from 0 to 20 other
trainers under these assumptions — no flip found."* — also screenshot-confirmed, not just inferred
from the vitest pass.

**#2 — Team Raid boss-moveset sweep: deliberately NOT `compareAcrossBossChargedMoves` (that's
Comparator-specific, built around `SustainedComparisonInputs`/2-candidate distributional output) and
deliberately NOT `BossMovesetSweep.tsx`'s table presentation** (the task explicitly ruled the latter
out — Team Raid's headline is clear/no-clear + a clear time/margin/wipe count, not paired damage
cards to compare). Implementation: `run/runTeamRaid.ts` gained a `buildTeamRaidInputs(
bossChargedMoveId, bossStartingEnergyForMove)` local closure (factoring out every OTHER field of the
existing single `runTeamRaid(...)` call) so the main call and a new loop over
`bossSpecies.chargedMoves` (recomputing `bossStartingEnergy` per move from ITS OWN `energyCost`,
since that field is move-specific) can only ever differ in the one thing being swept — same
"factor out the shared object, sweep only the intended field" discipline `sensitivity.ts`'s
`runSustained` closure already established. New `TeamRaidBossMovesetSweep{results, verdictVaries}`
field, gated on `chargedMoves.length >= 2` (same threshold Comparator's sweep uses).

**Perf, actually measured (not assumed)**: `runTeamRaid` is a SINGLE deterministic seeded
simulation (default seed 1), unlike `runSustainedComparison`'s 200-iteration distribution — a
throwaway timing script (`performance.now()`, 20 warmed-up calls) measured
`runTeamRaidScenario(DEFAULT_TEAM_ASSUMPTIONS, ...)` INCLUDING its 4-way moveset sweep (Mega
Tyranitar) at **~1.14ms average per call**. No debouncing needed or added — this is roughly 3
orders of magnitude cheaper than Species Report's sweep (the one that DOES need debouncing, ~200
sims × ~600 bosses).

**Presentation**: a one-line callout directly under the "Cleared"/"Timer expired" outcome badge
(inside the existing `team-raid-result` `CollapsibleSection`, not a new section) — when
`verdictVaries`, a visually-flagged (new `.boss-moveset-risk` CSS class: `--warn`-hue rgba fill +
border, same convention as `.badge-approximate`) sentence naming exactly which moves clear vs. fail;
when NOT varying, a plain `.caveats` line ("Clears/Fails against all N of this boss's known charged
moves"). Methodology (what it can't tell you — real per-move roll probability isn't in this
project's data) moved to a new "Boss moveset risk callout" entry in the existing "Known caveats"
section, per the terseness requirement.

**Real example found the same way** (swept `raidTimerSeconds` from 300 down against the real
default roster/boss): at **290s** (default Mega raid timer is 300s), Mega Tyranitar's **Fire Blast
fails to clear** while **Crunch, Stone Edge, and Brutal Swing all still clear**. Screenshot-verified
at 1920x1080: outcome badge reads "Cleared" (the currently-selected move, Stone Edge, does clear),
and the red callout directly below it reads *"Boss moveset risk: this roster clears against Crunch,
Stone Edge, Brutal Swing but fails against Fire Blast — which charged move the boss actually rolls
can flip this outcome. Same roster/assumptions throughout."* — the exact "make the conditional
verdict the headline" the task asked for, not a table the reader has to compare themselves.

**Field count observed this session**: `check-scenario-roundtrip` reported **135** fields (the
"115" figure the parent task mentioned as possibly-stale was indeed stale by this session — a
concurrent `scripts/` session had already changed the counting methodology to include nested
per-slot fields, per its own breakdown: "135 assumption fields (including 20 nested inside per-slot
arrays) across 6 tabs"). Unchanged before/after this session's work, confirming no `Scenario` field
was added.

**Shared-worktree note**: `TeamRaidView.tsx` had PRE-EXISTING uncommitted changes from another
concurrent agent (the `prefill`/`onConsumedPrefill`/`teamRaidPrefill.ts` cross-tab hand-off feature,
see `feature_reverse_cross_tab_links_powerup_to_teamraid_and_speciesreport.md`) already in the
working tree before this session started. Confirmed via `git diff` that my edits (the
`bossMovesetSweep` const/callout/caveats block) layered cleanly on top with zero overlap or
conflict — per `feedback_concurrent_sessions_shared_worktree.md`, verify the ACTUAL diff before
assuming a file you're about to touch is "yours to edit freely," and never stash/discard what's
already there.

**Verification this session — real browser, not just vitest**: `npm run verify` full green (455
engine + 247 web + 219 scripts tests, typecheck, lint 0 errors, `npm run build --workspace=packages/
web` succeeded), `npm run test:e2e` 19/19 Playwright specs green against the built `dist`. Beyond
that: built real share-link URLs (via each tab's own `buildScenarioUrl`/`assumptionsToScenario`
functions, the same encoders the UI itself uses — never hand-constructed) for all 3 found
cases (flip, no-flip, moveset-risk), started `vite preview`, drove a real headless Chromium via a
throwaway Playwright script placed inside `packages/web` (a `playwright` import from a scratch
script needs to run from where `node_modules/playwright` actually resolves — the package root, not
an external scratch directory), screenshotted each at 1920x1080 full-page, and read the screenshots
back to visually confirm the headline text/marker positions match the computed values, with zero
console/page errors on any of them. This is a step beyond the usual "no browser tool, so build +
curl + node --check + grep the bundle" ladder in `verification_without_browser_tool.md` — Playwright
itself (already an installed devDependency for the e2e suite) is a usable substitute for an
interactive browser-preview tool when one isn't granted, and should be reached for again next time
a change is worth seeing rendered, not just proven numerically.
