---
name: proposal-weather-scenario-assumption
description: proposed 2026-09-05 (open-ended pass) — wire damage.ts's dead weatherBoosted input through Scenario/UI as a weather-condition assumption affecting both candidate and boss damage by move-type match
metadata:
  type: project
---

Status: proposed 2026-09-05. **BUILT** (confirmed 2026-09-05 in a later session) — `Scenario.weather`
field, `weather.ts`, `AssumptionPanel.tsx`'s Weather `<select>`, applied to both candidate and boss
damage in `comparison.ts` via `isWeatherBoosted`. Modeled as the 1.2x damage multiplier only (the
"+5 effective levels" nuance was not implemented, per the flag in this proposal).

**What it would show:** a weather-condition selector (the 7 real conditions — see
[[fact_weather_boost_mechanic]] — or "none") in `AssumptionPanel`, applied per-move (not
per-species) to both the candidate's and the boss's damage output whenever a move's type
matches the boosted type(s). Two same-tier mega candidates of different types could now
rank differently depending on weather — e.g. a Water-type mega candidate gains ~20% more
own-damage under Rain than a same-tier Fire-type mega does, which can shift or create a
team-DPS ranking flip that party-size/dodge-only sensitivity can't currently surface.

**Why it sharpens the thesis:** weather is a real, uncontrollable-by-the-player variable
raid-goers actually face (you don't choose the weather when a raid pops), and it changes
team DPS, not just raw own-damage, since it also boosts the boss's damage back at the
party (survival time, hence teammate-DPS contribution, drops too). This is exactly the
kind of assumption the flip-point framing is built for — it answers "does candidate A
still beat candidate B if it happens to be Sunny," not just "who's bigger."

**Scope/flags:**
- Needs a new `Scenario` field (e.g. `weatherCondition: WeatherCondition | null`) — must
  round-trip per the `add-scenario-assumption` skill; explicitly calling this out since
  it's a new user-facing setting per CLAUDE.md's standing decision.
- Real implementation should decide whether to model just the 1.2x damage multiplier
  (matches today's `damage.ts` shape) or also the "+5 effective levels" stat-level
  nuance (see [[fact_weather_boost_mechanic]]) — flagging so this isn't silently
  under-modeled by whoever builds it.
- Does not touch the no-combat-phase or 1.3-boost standing decisions.
