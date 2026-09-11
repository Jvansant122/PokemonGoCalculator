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

**UPDATE 2026-09-11 — widened to the full fast x charged cartesian product, at the user's
explicit request (a deliberate reversal of the "scoped to charged moves only" clause above).**
`compareAcrossBossChargedMoves`/`BossChargedMoveVariantResult` were RENAMED (no back-compat
alias — this project doesn't keep one for internal API names) to
`compareAcrossBossMovesets`/`BossMovesetVariantResult` in `comparison.ts`. Reasoning now baked
into that function's own doc comment: a real raid boss instance rolls BOTH a fast move (which
drives incoming chip damage AND the boss's own energy gain, hence charged-move cadence) and a
charged move, so a fast-move roll can flip a ranking too — sweeping only charged moves silently
held `species.fastMoves[0]` fixed. New signature:
`compareAcrossBossMovesets(inputs: Omit<SustainedComparisonInputs, "bossFastMoveId" |
"bossChargedMoveId">): BossMovesetVariantResult[]` — note `bossFastMoveId` now stops governing
the sweep specifically (it still governs the plain non-swept `runSustainedComparison` call
elsewhere) even though a caller may pass a real user-chosen value for that field on the
`Omit`-stripped object; that's fine, TypeScript's `Omit` just makes the field unavailable to the
sweep call site. Iteration order is FAST-MAJOR, CHARGED-MINOR
(`for (const f of boss.fastMoves) for (const c of boss.chargedMoves)`) — a stable contract the
web layer relies on. The doc-comment-documented sweep gate a caller (web) should use is
`fastMoves.length * chargedMoves.length >= 2`, not `chargedMoves.length >= 2` — a 2-fast x
1-charged boss has two real movesets and deserves a sweep despite failing the old gate.

**Perf: measured, no cap added.** `starmie-mega` (4 fast x 9 charged, the highest-combo species
across `raidHistory.json`'s 771 recorded bosses) — 36 variants in ~157ms vs. the old charged-only
9 variants/~64ms. p50 combo count across recorded bosses goes 4 -> 8. Comfortably inside
`perf.test.ts`'s ~10x-measured-budget convention; this function has no dedicated perf.test.ts
entry (same as `rosterPlanner.ts`/`lineupBuilder.ts` before it), so nothing needed updating there.

**Left deliberately broken for a following pass:** `packages/web/src/run/runComparator.ts` and
`packages/web/src/BossMovesetSweep.tsx` both still reference the old names and will fail
typecheck/build until `web-developer` updates them against this exact contract (told to do so
explicitly in the request) — this was NOT an oversight on my part, don't "fix" it by adding a
back-compat alias.
