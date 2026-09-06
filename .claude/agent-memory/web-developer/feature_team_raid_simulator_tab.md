---
name: feature-team-raid-simulator-tab
description: Building the Team Raid Simulator tab (6-slot sequential roster vs boss HP/timer) and the first-ever tab-switcher scaffold — key gotchas around isMega validation, per-tier boss HP, and the chart's data-is-already-stacked trick
metadata:
  type: project
---

Built 2026-09-06, full read of `proposal_sequential_team_raid_tab.md` (Section 9 addendum
specifically — wipe is a time-cost-and-continue loop, NOT a loss) plus `teamRaid.ts`/
`teamScenario.ts` (already built and tested by engine-developer) before writing any UI.

**Tab-switcher scaffold**: the app had zero view-routing before this. Extracted the entire old
`App.tsx` verbatim into `ComparatorView.tsx` (renamed export only, stripped the outer `<div
className="app"><h1>` wrapper since that now lives in the new thin `App.tsx`), and made `App.tsx`
just hold `tab` state + a `<nav>` of two buttons + a ternary render. A new `view` query param
(`comparator` | `team-raid`) is separate from both scenario params (`s` for Scenario, `ts` for
TeamScenario) — each view's "Build link" handler stamps `view=<itself>` onto the URL it builds so
reloading a shared link restores the SAME tab it was generated from, not whatever tab happened to
be open. When a third tab (species reverse-lookup) lands, it should need zero changes to
`ComparatorView.tsx`/`TeamRaidView.tsx` — just one more `AppTab` union member, one more nav button,
one more ternary branch.

**`isMega` is validation/labeling bookkeeping ONLY — it does NOT gate the own-damage boost.**
`teamRaid.ts`'s own doc comment says this explicitly but it's easy to miss: `ownBoostMultiplier`
is applied to ANY slot whose `species.boost` is defined, regardless of that slot's `isMega` flag.
The flag only enforces (in `runTeamRaid`'s `validateRoster`) that at most one slot claims `isMega:
true`, and only for a species that actually has `.boost`. This means a roster with TWO different
mega-form species in different (unflagged) slots would still get both their own boosts applied
mechanically — not something the engine rejects, even though it doesn't correspond to a real
account (only one Pokémon can be mega-evolved at a time, account-wide). I deliberately built the
default demo roster with exactly ONE boost-carrying species (`latios-mega`, flagged `isMega:
true`) and five genuinely non-mega fillers (`garchomp`/`dragonite`/`kartana`/`tyranitar`/
`rayquaza`, all confirmed `boost: undefined` via a `node -e` check against
`data/normalized/species.json` before using them) to avoid ever hitting this edge case in the
shipped default. Did not flag this to engine-developer as a bug — it's a real, if minor, gap
(nothing stops fielding two different `-mega` species unflagged) but out of scope for a UI task;
noting it here in case a future session needs to decide whether to fix it.

**A stale/hand-edited `TeamScenario` link could violate the isMega invariant** (two slots both
`true`, or a flagged slot whose species has since lost its `boost` or been swapped) — rather than
let `runTeamRaid` throw a raw error on load, `TeamRaidView.tsx` runs every state update (both the
initial URL-decoded state AND every live `onChange` from the panel) through a
`normalizeTeamAssumptions` pass: clears `isMega` on any slot whose resolved species has no
`.boost`, and clears every claim after the first if more than one is somehow flagged. This is the
"changing a species selection should reset stale downstream state" convention (already established
for fast/charged move ids) extended to a case the existing convention didn't cover.

**Boss HP is a fixed per-tier pool (`bossEffectiveHp`), NOT `species.baseStamina`** — this was
already true for the comparator's boss but the Team Raid tab actually consumes it directly (as
the y-axis ceiling and the "cleared" threshold), so getting this wrong would be visibly wrong, not
just a missing display field. Verified via a scratch script: `tyranitar-mega` (falls back to
`DEFAULT_REAL_RAID_TIER` = "5-Star Raids" since it's not currently a live raid entry) reports
15000 HP; forcing `bossRaidTier: "1-Star Raids"` on the same species reports 600 — confirms the
tier lookup, not the species, drives the number.

**`TeamRaidSlotResult.ownDamageTrajectory` is ALREADY the full cumulative team-damage trajectory
once concatenated** — no extra running-total math needed in the UI. Each segment's trajectory
points are pre-stacked on every prior segment's total (see that field's own doc comment in
`teamRaid.ts`), so `TeamDamageChart.tsx` just does `slots.flatMap(s => s.ownDamageTrajectory)` and
plots it as one line. This is NOT the same shared-helper pattern as
[[pattern-shared-trajectory-helpers]] (`ownDamageAt`/`teamContributionAt`/`totalAt` from
`DamageOverTimeChart.tsx`) — those exist because the comparator's per-candidate trajectories are
each independently-zeroed and need `convertUptimeToTeamDamage` folded in per sample point; the
team-raid case has no such team-boost math at all (solo-trainer scope, see below) and the
trajectories are already additive, so a from-scratch flatten was the correct call, not a missed
reuse opportunity.

**No cross-slot team-boost math in this tab, on purpose** — confirmed by
`proposal_sequential_team_raid_tab.md`'s own research finding (a solo trainer's mega never boosts
their own bench) and by `teamRaid.ts`'s doc comment explicitly warning future implementers not to
add one. `partySize`/`teammateDps`/`matchingTeammateCount` (all real `Scenario` fields on the
comparator side) have NO equivalent here — don't add them by reflex just because the comparator
has them.

**Default demo roster deliberately fails the raid** (`timerExpired`, 4 wipes, against a 5-star-
tier 15000 HP boss) rather than clearing — confirmed intentional, not a bug: a real solo trainer
routinely can't solo a Tier 5/Mega raid, and "a real result" per the task's own wording doesn't
require a clear. Verified a `cleared` path separately (forcing `bossRaidTier: "1-Star Raids"`,
600 HP) to confirm `clearingSlotIndex`/the chart's green clear-marker/wipeCount-before-a-clear all
render sane values before shipping.

**Verification this session**: no browser tool available (re-confirmed against the literal tool
grant, per [[verification-without-browser-tool]]). Ran the full ladder — `tsc --noEmit` clean,
`npm run test:engine` 18 files/126 tests green (proves zero accidental engine edits despite
several OTHER agents' uncommitted engine changes already sitting in the tree), `vite build`
succeeded (pre-existing chunk-size warning only), `vite preview` served + curled root/JS/CSS for
200s, `node --check` on the bundle, and grepped the built bundle for `"Team Raid Simulator"`/
`"wipe-and-revive"`/`"Mega/Primal for this raid"`/`"Raid timer"` as shipped-code evidence. For
actual data-flow correctness (not just "it compiles and loads"), used two scratch `.ts` files
dropped in `packages/web/src/` and run via `npx tsx` (per that same memory's import-resolution
note): one exercising the shipped default roster end-to-end through `runTeamRaid` PLUS a full
`TeamScenario` encode → `buildTeamScenarioUrl` → `parseTeamScenarioFromUrl` round-trip
(`JSON.stringify(decoded) === JSON.stringify(scenario)` true), one forcing a `cleared` outcome to
sanity-check `clearingSlotIndex`/`wipeCount` together. Both deleted afterward, confirmed via `git
status --porcelain` that only the intended new/edited files remain.

**Deferred/not done**: no drag-to-reorder (used plain up/down buttons instead — the design doc's
"canonical auto-orderings" one-click presets were explicitly flagged as a stretch goal, not
built). Chart WAS built (not deferred) — a single concatenated cumulative-damage line vs. a boss-
HP reference line vs. the raid timer as the x-axis's own right edge, with wipe-vs-swap divider
styling, in `TeamDamageChart.tsx`.
