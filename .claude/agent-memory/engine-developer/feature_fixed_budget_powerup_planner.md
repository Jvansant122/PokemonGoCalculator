---
name: feature-fixed-budget-powerup-planner
description: powerUp.ts's planPowerUpBudget (2026-09-08) — greedy multi-slot allocator, the dominated-level heuristic gap it found and closed, and the confirmed-not-assumed Rare Candy ratios
metadata:
  type: project
---

Added `planPowerUpBudget` to `packages/engine/src/powerUp.ts`, alongside (never replacing)
`optimizePowerUps`. Answers "I have a fixed stardust/candy/Rare Candy budget, what SET of
power-ups should I make across my whole roster?" — a greedy, full-re-simulation-per-round search
(reuses `runTeamRaid` unchanged, no new combat math), scored each round by marginal team-DPS gain
per unit of budget consumed (a multi-dimensional-knapsack scalarization). See
[[feature_power_up_optimizer]] for the module this extends.

**Real, load-bearing distinction from a naive design: the scalarization is a search heuristic
only.** Every reported number (`PowerUpBudgetStep.cost`, the ledger) keeps stardust/candy/XL
strictly separate, per CLAUDE.md's standing decision against a blended composite score. Only the
internal "which candidate to try next" comparison blends them — documented explicitly in the doc
comment so a future reader doesn't "helpfully" surface it.

**Dominated-level reduction (`usefulPowerUpLevelsAbove`) — a REAL gap found and closed, not just
verified.** The task spec's minimum four fields (outgoing fast/charged damage, survival HIT
COUNTS for incoming fast/charged) were NOT sufficient on their own: empirically testing a
dominated level's simulated team DPS against the noise floor (as the task demanded) found a case
where a "dominated" level's real delta measurably exceeded the noise floor even at 150+ iterations
(not shrinking with more samples — a real effect, not sampling noise). Root cause: `energy.ts`
credits energy from raw damage TAKEN (`ENERGY_PER_DAMAGE_TAKEN`), not from hit count — two levels
with an IDENTICAL `ceil(hp/incomingDamage)` survival count can still receive different per-hit
energy credit if the underlying incoming-damage MAGNITUDE differs, shifting exactly when the
attacker's own charged move becomes ready. Fix: added the raw `incomingFastDamage`/
`incomingChargedDamage` values themselves to `PowerUpLevelMetrics`/`levelMetricsEqual` (already
computed as intermediates, free to add) — a strict superset of the original four-field check
(only ever reclassifies a level from dominated to useful, never the reverse), which closed the gap
cleanly. Verified via a throwaway `tsx` scratch script (deleted after use) before touching
`src/`, per this project's re-derive discipline — do NOT trust the originally-specified four
fields as sufficient without this fifth check if this function is ever touched again.

**Own-resource-first ordering is real, not a nicety:** a slot's own `candyOnHand`/`xlCandyOnHand`
is always drawn down before either shared `rareCandyOnHand`/`rareCandyXlOnHand` pool, including a
SPLIT within a single step (`ownCandySpent + sharedCandySpent === cost.candy`, computed via
`Math.min(cost.candy, remainingOwnCandy)` — a step's own/shared split is NOT guaranteed to fall
cleanly on a step boundary).

**pogo-researcher confirmed the 1:1 ratios in parallel, no correction needed:** Rare Candy → Candy
and Rare Candy XL → XL Candy are both real, confirmed 1:1, deterministic, with NO cross-path
between them (plain Rare Candy can never become XL Candy by any route) — see
`.claude/agent-memory/pogo-researcher/fact_rare_candy_xl_candy_conversions.md` and
`MECHANICS.md`'s "Fungible candy currencies" entry. `RARE_CANDY_TO_CANDY_RATIO`/
`RARE_CANDY_XL_TO_XL_CANDY_RATIO` constants exist so a FUTURE correction (there isn't one right
now) is a one-constant edit, not a rewrite — doc comments updated from "assumed" to "confirmed"
once the research landed.

**Two real findings NOT acted on, both already resolved by the overseer before I could act:**
1. A real 100:1 regular-Candy→XL-Candy "Convert" button exists in-game. Deliberately NOT modelled
   (already written into `MECHANICS.md` before I finished this task) — it's a real arbitrage but
   would let the planner spend candy the user was saving for a different species, and rarely
   matters at realistic (tens, not hundreds) per-species candy counts.
2. A real Trainer Level power-up cap, `min(trainerLevel + 10, 50)`, is NOT modelled anywhere in
   this engine (`MECHANICS.md`, already updated: "deliberately not modelled... do not add a
   trainer-level input without asking"). Important operational note: `planPowerUpBudget` (and
   `optimizePowerUps`) already accept a `maxLevel` override — if a trainer-level cap is ever
   wired in, the caller computes `Math.min(trainerLevel + 10, 50)` and passes it as `maxLevel`;
   **no engine change would be needed**, only a new caller-side input plus Scenario wiring
   (web-developer's job, per CLAUDE.md's "every user-facing assumption must round-trip through
   Scenario").

**Perf:** worst-case-shaped benchmark (real 6-slot roster, level 1 start, effectively unlimited
budget so the search runs to natural exhaustion rather than stopping early on
budget/max-level) measured ~2.3-2.4s under vitest (`npm run test:engine`'s own process, not a bare
`tsx` scratch run — the two differ by ~2x here, always measure in the SAME harness the assertion
will run under). Budgeted at 24s (~10x) in `perf.test.ts`; `perf.bench.ts` has the matching `bench`
case. See [[feature_perf_benchmark_suite]] for the harness this extends.
