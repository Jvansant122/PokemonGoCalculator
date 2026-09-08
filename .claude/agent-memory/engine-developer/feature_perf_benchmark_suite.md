---
name: feature-perf-benchmark-suite
description: packages/engine/test/perf.bench.ts + perf.test.ts — real-species perf benchmark and coarse regression guard for simulate.ts/teamRaid.ts/optimizePowerUps
metadata:
  type: project
---

Added 2026-09-08: `packages/engine/test/perf.bench.ts` (vitest `bench()`, informational,
`npm run bench --workspace=packages/engine`) and `packages/engine/test/perf.test.ts` (normal
vitest test, runs in the regular suite/hook/CI, asserts ~10x-measured budgets). Both back onto a
new test-only helper, `packages/engine/test/fixtures/perfFixtures.ts`.

**Why real species instead of hand-authored fixtures (unlike [[real_vs_hypothetical_fixture_tradeoff]]/[[fixture_deletion_hypothetical_duo]]):**
a perf budget doesn't need an exact pinned number — it's deliberately generous (~10x) specifically
so it survives ordinary stat/movepool drift from a future resync. Using real synced data (via a
plain `fs.readFileSync` + `JSON.parse` of `data/normalized/species.json` — already
SpeciesDefinition-shaped, data-sync's normalized output, NOT the raw pogoapi shape
`fromGameMaster` converts) means the timing numbers reflect actual production roster shapes. Doing
file I/O from a *test* file is fine — the "no I/O in packages/engine" rule is a `src/` rule, not a
`test/` rule (same reasoning `speciesReport.ts`'s doc comment gives for why the caller must supply
data, not this package).

**perfFixtures.ts responsibilities:** `realSpecies(id)` (throws loudly if an id goes missing
upstream, rather than silently drifting the whole suite onto a different species),
`realPowerUpCostTable()` (reads `data/normalized/powerUpCosts.json`, strips the two
provenance-only fields the same way `packages/web`'s `registry.ts` does), and
`buildPerfStepwiseParams(attacker, boss)` which reuses `comparison.ts`'s own exported helpers
(`bossEffectiveStats`/`resolveMove`/`resolveBoost`/`ownBoostMultiplier`) to assemble a real
`StepwiseSimulationParams` — deliberately NOT a second hand-rolled damage-modifier assembly, so the
benchmark exercises the same real-shaped inputs `runSustainedComparison` itself builds.

**Chosen real species** (stable as of 2026-09-08, all real/released): boss `mewtwo` (LEGENDARY, no
boost, 3 fast/8 charged movepool); attacker `metagross-mega` (boosted mega); 6-slot roster
`metagross-mega, charizard-mega-y, venusaur-mega, tyranitar-mega, garchomp, dragonite`; Species
Report boss corpus `mewtwo, rayquaza, kyogre-primal, groudon-primal, landorus-incarnate`.

**Measured locally (this dev machine, single-fork pool) — used to derive each ~10x budget:**
- `simulateStepwiseBattle` single run: ~0.09ms/call (20 reps ~1.7-2.0ms) -> budget 20ms/20 reps.
- `runSustainedComparison` (1 candidate, 200 iterations, default `maxSeconds`=180): ~6ms/call (3
  reps ~17-18ms) -> budget 180ms/3 reps. This is Species Report's real per-boss unit cost.
- `runTeamRaid` full 6-slot roster: ~0.7ms/call (10 reps ~5.6-7.6ms) -> budget 80ms/10 reps.
- `optimizePowerUps` full sweep (6 slots, level 35->maxLevel 50, default iterations=3, ~180
  candidates): ~131-135ms for one full sweep -> budget 1350ms/1 rep. (The task's own reference
  point — "~217ms on the default roster" — is closeby but not identical, since the web UI's
  default roster/level range naturally differs from this fixture's; not a discrepancy worth
  chasing, the budget only needs to be in the right order of magnitude.)
- `runSpeciesReverseLookup` (5 bosses, 200 iterations each): ~10ms/call across all 5 bosses (3 reps
  ~29.6-30ms) -> budget 300ms/3 reps.
- `attackDamageGrid`+`defenseDamageGrid` (full 16 IV x 51 level grid, both grids): ~0.63ms/call (50
  reps ~31-32ms) -> budget 320ms/50 reps.

Total `perf.test.ts` wall time measured ~415ms (budget was "keep under ~3s") — plenty of headroom.
No bugs found; this was pure measurement/tooling, zero `src/` behavior changes.

**Pattern for next time a perf number needs re-deriving:** write a throwaway `_scratch_measure.ts`
INSIDE `packages/engine/test/` (not the session scratchpad directory — relative import paths to
`../src/*.js` need to resolve, and using deeply-relative paths from an external scratchpad directory
failed outright, `MODULE_NOT_FOUND`), run it with `npx tsx packages/engine/test/_scratch_measure.ts`
(tsx is already a repo devDependency), then delete it before finishing. Do NOT leave it committed.
