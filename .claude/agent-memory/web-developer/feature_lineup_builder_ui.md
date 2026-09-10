---
name: feature-lineup-builder-ui
description: UI half of the single-trainer lineup builder (PLAN_lineup_builder.md) — per-slot level/IV override wiring into TeamScenario, the "Build best lineup" action on Team Raid Simulator, and working concurrently in a shared worktree while engine-developer landed an unrelated in-progress feature.
metadata:
  type: project
---

2026-09-10. Built the web half of `runLineupBuilder` (engine, landed same session by a concurrent
`engine-developer` run) — see PLAN_lineup_builder.md for full scope. Entry point is a new
"Lineup Builder" `CollapsibleSection` (`LineupBuilderPanel.tsx`) placed ABOVE `TeamAssumptionPanel`
on the Team Raid Simulator tab; clicking it reads the imported roster fresh from
`rosterPool.ts`'s localStorage (never subscribed to — nothing on this tab needs to react live to
an import happening on a different tab), runs `runLineupBuilder`, and immediately overwrites
`TeamAssumptions.slots` with the winner. The pre-existing "Export roster to Power-Up Optimizer"
button (`teamRaidExport.ts`) then carries it onward for free — exactly the plan's stated reason
for choosing Team Raid as the entry point over a new tab.

**The real engine work here was closing a round-trip gap, not building new UI plumbing.**
`TeamScenarioSlot.level`/`.ivs` (optional per-slot overrides) had ALREADY landed on the engine
side before this session started (a prerequisite the plan explicitly called out as "depends on
that landing first"). But `TeamSlotAssumption` (web) and `runTeamRaidScenario`
(`run/runTeamRaid.ts`) had NOT been updated to declare/consume them — the shared roster-wide
`level`/`ivAttack`/etc. were still the only thing actually fed into `runTeamRaid`'s per-slot
`TeamRaidSlotInput.level`/`.ivs`, even though the ENGINE'S `TeamRaidSlotInput` has supported a
per-slot override since the Power-Up Optimizer needed it. Three call sites needed the new fields
threaded through, found by tracing "what actually determines the simulated level" backward from
`runTeamRaid`, not by grepping for `level`: (1) `TeamSlotAssumption` (declare + UI display),
(2) the scenario codec (`assumptionsToTeamScenario`/`teamScenarioToAssumptions` in
`TeamRaidView.tsx`, plus `TeamScenarioSlotWithShadow`, which hand-duplicates `TeamScenarioSlot`'s
shape rather than extending it — same "extend, don't edit packages/engine" pattern the Shadow
field already established there), (3) `run/runTeamRaid.ts`'s `buildTeamRaidInputs` — the actual
engine call. Missing step 3 would have been the worst kind of bug: the field would round-trip
through a share link perfectly (steps 1-2 alone are enough to pass `check-scenario-roundtrip`)
while silently having ZERO effect on the simulated result — round-trip-clean but functionally
dead. Always verify a new per-slot override by checking the actual `TeamRaidInputs`/equivalent the
engine receives, not just that a share link restores the field.

**"Assumptions are always visible" forced a UI decision beyond what the plan asked for.** The plan
only said the engine field needed threading through; it didn't specify how to SURFACE a
per-slot override in the assumption panel. Silently applying it with no visible indicator would
violate the standing "a result without its conditions is a wrong result" rule — so added a
one-line `<p className="species-picker-hint">` per slot ("Own level/IVs: X (a/d/s) — overrides
the shared roster level/IVs below for this slot only") with a "use shared level/IVs instead"
button that clears the override back to `undefined`. Deliberately did NOT add a manual
NumberField editor for the override — it's set only by the Lineup Builder action, and adding a
full per-slot editing UI was out of scope (kept terse, per the task's own standing complaint about
text density). Also clears `level`/`ivs` back to `undefined` whenever a slot's species is changed
by hand (same slot in `updateSlot`'s speciesId `onChange`) — same reasoning as the existing
"reset move ids on species change" convention: an override belongs to whichever roster entry set
it, not to a freshly hand-picked species.

**`teamRaidExport.ts`'s existing "fan the shared spread out to every slot" logic silently would
have thrown the whole feature away on export** if left alone — it read `team.level`/`team.ivAttack`
etc. unconditionally for every Power-Up Optimizer slot, never `slot.level`/`slot.ivs`. Fixed
`slotToPowerUpSlot` to prefer the per-slot override (`slot.level ?? level`) over the shared
spread. This is the SAME structural mismatch already documented in
[[feature_reverse_cross_tab_links_powerup_to_teamraid_and_speciesreport]] for the OPPOSITE
direction (Power-Up plan -> Team Raid, which has no per-slot field to land in and needs a lossy
mean) — except here, going Team Raid -> Power-Up Optimizer, the destination already has per-slot
fields, so the fix is a free, lossless one-line change once you notice the gap. Proved this live
end-to-end via Playwright (see below), not just by reading the diff — the two tabs' `#pu-slot-*-level`
inputs matched the Team Raid panel's own per-slot override hints byte-for-byte (20/27/20/20/39/20
on a real 23-entry roster).

**Verification level: full live browser verification, via Playwright driven from Bash** (no
dedicated browser tool available this session either — see
[[verification_without_browser_tool]]'s fallback ladder, still accurate for "no browser tool"
but a real browser WAS available via `npx playwright test` against the built `dist`, same
technique as [[feature_partysize_flip_and_boss_moveset_sweep]]). Wrote throwaway scratch specs
first (imported the real `pokeGenieSample.csv` fixture via the Power-Up Optimizer's paste flow,
built a lineup, dumped rendered text + per-slot level values via `inputValue()`), confirmed the
whole chain end-to-end, deleted the scratch specs, then wrote ONE permanent
`e2e/lineup-builder.spec.ts` (2 cases: no-roster empty state; build+runner-up/margin+export-carries-levels-intact)
before running the full suite. Also confirmed the empty-state click ("No imported roster — import
a Poke Genie CSV in the Power-Up Optimizer tab's roster panel first...") renders with zero
console/page errors in a FRESH browser context (no localStorage) — the honest "no lineup to build"
case the plan's own standing decision required, never a silent fallback to the full species list.

**Worked in a shared worktree with a concurrent `engine-developer` session actively mid-edit on an
unrelated "enrage" mechanic the whole time** (see [[feedback_concurrent_sessions_shared_worktree]]).
`npm run typecheck:web`/`build --workspace=packages/web` standalone were clean throughout, but the
full repo-wide `npm run verify` intermittently failed at `typecheck:engine-test` on files I never
touched (`packages/engine/test/powerUp.test.ts`, then later `test/shadowEnrage.test.ts` — new
`TeamRaidSlotResult` fields the other session was still wiring through its own test fixtures).
Confirmed via `git status --porcelain packages/engine` that these were uncommitted, actively
changing files from the concurrent session, not something my own edits caused — verified this by
re-running `typecheck:web`/`test:web`/`build` in isolation (all green) rather than assuming the
shared `npm run verify` failure was mine to fix. Do not touch `packages/engine` to "fix" a
typecheck failure showing up there mid-session; report it as a concurrent-session artifact instead
of working around it. Also found a bunch of ALREADY-uncommitted, unrelated web files
(`App.tsx`, `PartySizeFlipView.tsx`, `powerUpOptimizerExport.ts`, `teamRaidPrefill.ts`, etc.) sitting
in the working tree from prior sessions' unstaged work — left them alone entirely (no revert, no
stage), matching the "stage only your own paths" rule.

Field count: `check-scenario-roundtrip` went from Team Raid's prior 26 fields (20 top-level + 6
nested in `slots[]`) to 28 (20 top-level + 8 nested — the new `level`/`ivs` pair), for a new grand
total of **137** assumption fields across all 6 tabs (the task's own pre-stated estimate was 135 —
close but not exact; always re-run the checker rather than trust a predicted number).
