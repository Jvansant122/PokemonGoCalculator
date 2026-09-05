---
name: proposal-teammate-dps-sensitivity
description: Proposed web feature — sensitivity check (and optional crossover finder) sweeping teammateDps, the one core Scenario field currently absent from computeSensitivity; status as of 2026-09-05 is proposed, not yet routed/built
metadata:
  type: project
---

Proposed 2026-09-05 (second ideation pass by this agent). Not yet built, rejected, or routed —
status: **proposed, pending overseer decision**.

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
