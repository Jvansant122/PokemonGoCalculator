---
name: proposal-boost-persists-through-faint
description: Proposed engine feature — model that Primal/Mega Rayquaza's team boost outlives fainting while standard megas' doesn't; status as of 2026-09-05 is proposed, not yet routed/built
metadata:
  type: project
---

Proposed 2026-09-05 (first ideation pass by this agent). Not yet built, rejected, or routed to
an implementing agent — status: **proposed, pending overseer decision**.

**What it would show:** a per-species fact (e.g. `SpeciesDefinition.boost.persistsThroughFaint`,
alongside the existing `boost.multiplier`/`boost.boostedType`) that changes what window
`convertUptimeToTeamDamage` (uptime.ts) uses for a candidate's team-boost contribution: today
every boosted species uses `secondsSurvived` as that window uniformly. Per
[[fact-mega-boost-persists-after-faint]], that's correct for standard megas but wrong for
Primal Groudon/Kyogre and Mega Rayquaza, whose boost keeps running for the rest of the fight
even after they've fainted (as long as they're still in the party). Flag defaults to false
(matches current behavior) and would only be set true on those specific hypothetical/real
fixtures once the underlying claim gets an independent second source.

**Why it sharpens the thesis:** this is the cleanest possible illustration of
"survivability counted as team DPS, not raw damage" — for a Primal, survivability of the
Primal itself barely matters to the team's damage output (the boost runs regardless), while for
a standard mega it's everything. Two forms with identical own-DPS and identical
secondsSurvived would produce a materially different "team damage from boost" number purely
because of this species-level fact, which is exactly the kind of non-obvious ranking-flip
insight the product exists to surface — not generic "add more stuff."

**Standing-decision check:** no new user-facing Scenario field needed — this is intrinsic
species metadata resolved via the existing candidate species lookup, same category as
`boost.multiplier`/`boost.boostedType` which already aren't separate Scenario fields. Doesn't
touch the 1.3 mega-boost-multiplier value itself (still load-bearing, untouched) and isn't the
ruled-out multi-trainer Teambuilding Analyzer (this is single-candidate species data feeding the
existing team-conversion formula, not staggering multiple trainers' megas).

**Caveat carried forward:** underlying source is community-tier (Bulbapedia citing a March 2023
Reddit crowd-test), not Niantic-official — flag this explicitly if/when routed to
engine-developer, per this project's history of getting burned by unverified numbers.
