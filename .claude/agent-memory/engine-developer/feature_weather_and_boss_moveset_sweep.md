---
name: feature-weather-and-boss-moveset-sweep
description: How weather.ts's WeatherCondition/isWeatherBoosted is wired through comparison.ts, the documented +5-effective-levels omission, and compareAcrossBossChargedMoves
metadata:
  type: project
---

Implemented 2026-09-05 (routed from two `pogo-researcher` proposals — see
`.claude/agent-memory/pogo-researcher/proposal_weather_scenario_assumption.md` and
`proposal_boss_moveset_variant_comparison.md`, both approved by the user together).

**Weather**: new `packages/engine/src/weather.ts` — `WeatherCondition` (8 values: `"none"` plus
the 7 real conditions), `WEATHER_BOOSTED_TYPES` map, `isWeatherBoosted(moveType, weather)`.
[community-consensus] (wiki/guide-tier, no primary Niantic source), commented the same way as
`shadow.ts`'s multipliers. `Scenario.weather: WeatherCondition` (non-optional, default `"none"`)
round-trips through encode/decode — tested in `scenario.test.ts`. `ComparisonInputs`/
`SustainedComparisonInputs` both gained optional `weather?: WeatherCondition` (default `"none"`).

**Where it's actually applied**: `comparison.ts` only — every `fastDamageOut`/`chargedDamageOut`/
`damageOut`/`chargedMoveDamageOut` object now sets `weatherBoosted: isWeatherBoosted(move.type,
weather)`, checked **per move's own type**, independently for the candidate's fast move, the
candidate's charged move, the boss's fast move, and the boss's charged move — never based on
either side's species type, and never "one flag for the whole fight." `damage.ts`'s
`WEATHER_BOOST_MULTIPLIER`/`weatherBoosted` field already existed and was already correctly
plumbed through `combat.ts`/`simulate.ts` (they just spread whatever `DamageInputs` fields
`comparison.ts` hands them) — **no changes needed in `combat.ts` or `simulate.ts` at all**, this
was purely a comparison.ts + new-file + Scenario change. Confirmed via the two new comparison.ts
tests: one showing per-move independence with a synthetic Water-fast/Fire-charged attacker under
"rainy" (fast boosted, charged not) vs "sunny" (mirror image), one showing the boss's own fast
move also responds to weather independent of the candidate's types.

**Deliberate v1 scope omission, documented in weather.ts's doc comment**: real weather also treats
the attacker as +5 effective levels (a stat-level effect), per
`pogo-researcher`'s `fact_weather_boost_mechanic.md` — this implementation only does the 1.2x
`WEATHER_BOOST_MULTIPLIER` (the surface `damage.ts` already had). The stat-level effect is NOT
implemented; would require conditionally recomputing effective stats at level+5 per move, a
bigger change. If asked to model this later, that's the next concrete step — don't assume it's
already covered by the multiplier alone.

**Boss moveset sweep**: `compareAcrossBossChargedMoves(inputs)` in `comparison.ts` — takes
`Omit<SustainedComparisonInputs, "bossChargedMoveId">`, maps over `inputs.boss.chargedMoves`,
calls `runSustainedComparison` once per move (overriding `bossChargedMoveId`), returns
`BossChargedMoveVariantResult[]` (`{chargedMoveId, chargedMoveName, results: SustainedCandidateResult[]}`).
Purely additive — no existing function's signature changed, scoped to charged moves only (no
boss-fast-move sweep, per the proposal). Not wired into any `sensitivity.ts`-style row on purpose
— the proposal explicitly flagged this as a discrete "which variant" axis, not a continuous scan,
so it needs its own UI presentation (web-developer's call).

**Not wired into `packages/web` yet** — needs: (1) a weather selector in `AssumptionPanel`/
`App.tsx`'s `assumptionsToScenario`/`scenarioToAssumptions`/`DEFAULT_ASSUMPTIONS` (full
`add-scenario-assumption` checklist, since `weather` is a new `Scenario` field), threaded into the
`runSustainedComparison` call; (2) a UI surface for `compareAcrossBossChargedMoves`'s array output
— e.g. one result-card pair per moveset variant, not a sensitivity-panel row.
