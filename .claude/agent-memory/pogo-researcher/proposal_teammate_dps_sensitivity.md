---
name: proposal-teammate-dps-sensitivity
description: Sensitivity check sweeping teammateDps in computeSensitivity — status BUILT, confirmed 2026-09-05 by reading sensitivity.ts (check #6 "Average teammate DPS")
metadata:
  type: project
---

Proposed 2026-09-05 (second ideation pass by this agent). **Status: BUILT** — confirmed 2026-09-05
(third pass) by reading `packages/web/src/sensitivity.ts` directly: check #6 "Average teammate
DPS" scans `teammateDps` up/down exactly as described below and is live in `SensitivityView`.
`findCrossoverTeammateDps` was not added engine-side (the web-only scan-in-place approach was used
instead, same as the party-size check) — see [[finding-crossover-party-size-unwired]], still
accurate as of 2026-09-05.

**What it would show:** `packages/web/src/sensitivity.ts`'s `computeSensitivity` currently checks
five axes (party size, matching-teammate count, mega boost multiplier, dodge none<->perfect,
level) but never sweeps `teammateDps` itself, despite it being a first-class `Scenario` field
already wired everywhere (`Assumptions.teammateDps`, `convertUptimeToTeamDamage`'s
`teammateDps` param). Since the two candidates' `secondsSurvived` (boost windows) generally
differ, scaling `teammateDps` scales each candidate's team-damage term by a different factor —
so there IS a real crossover value of average teammate strength above/below which the ranking
flips, exactly analogous to the existing party-size sweep. Proposed: add a sixth sensitivity
check that scans `teammateDps` up/down from its current value (same scan-and-report-distance
pattern as the existing "Mega boost multiplier" check) and reports "flips if the average
teammate's DPS reaches ~X." Optionally pair this with an engine-side `findCrossoverTeammateDps`
mirroring `comparison.ts`'s existing (currently unused in the web UI — see
[[finding-crossover-party-size-unwired]]) `findCrossoverPartySize` shape, for a headline chart
analogous to the party-size crossover.

**Why it sharpens the thesis:** `teammateDps` is *literally* the conversion factor from
"survived N extra seconds" into "team damage" — it is the thesis's own unit of measure. A
sensitivity check on every other axis but this one leaves the single most on-thesis question
unanswered: "how strong does my team have to be, on average, before the survivability edge
outweighs the raw-damage edge (or vice versa)?" This is not generic "add more stuff" — it's
closing a real gap in the one metric the product exists to interrogate.

**Standing-decision check:** no new `Scenario` field — `teammateDps` already exists and already
round-trips. Doesn't touch the 1.3 mega-boost constant (a separate, already-covered sensitivity
axis). Not the ruled-out Teambuilding Analyzer — this is a single shared `teammateDps` figure
representing the average teammate, not per-trainer mega staggering.
