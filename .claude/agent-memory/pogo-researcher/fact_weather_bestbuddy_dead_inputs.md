---
name: fact-weather-bestbuddy-dead-inputs
description: damage.ts models weatherBoosted/bestBuddy but no call site (simulate.ts/combat.ts/breakpoints.ts) ever sets them true, and Scenario has no field for either — confirmed by grep 2026-09-05
metadata:
  type: project
---

`packages/engine/src/damage.ts`'s `DamageInputs` has `weatherBoosted?: boolean` and
`bestBuddy?: boolean`, both defaulting to `false`. Grepped every call site
(`simulate.ts`, `combat.ts`, `breakpoints.ts`) on 2026-09-05 — none ever passes
`weatherBoosted: true` or `bestBuddy: true`. `Scenario` (`scenario.ts`) has no field
for either. So today, every comparison this tool runs is implicitly "no weather,
no best buddy" with no way to change that from the UI.

**Why:** `bestBuddy` being dead is *correct* — see [[fact_friendship_raid_scope_nuance]],
the code's own comment says this multiplier models PvP-only friendship bonus, which
doesn't apply to raids/gyms, so leaving it unwired matches real mechanics. `weatherBoosted`
being dead is a real gap — weather boost does apply in raids/gyms (see
[[fact_weather_boost_mechanic]]) and isn't just cosmetic: it can shift the DPS ranking
between two differently-typed candidates. See [[proposal_weather_scenario_assumption]].

**How to apply:** Don't assume weather is "already handled because damage.ts has the
field" — it's plumbed at the formula level only, dead everywhere above it. Re-verify
with a grep on `weatherBoosted:` before citing this as fixed in a future pass.
