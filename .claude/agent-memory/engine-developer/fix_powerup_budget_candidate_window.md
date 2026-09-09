---
name: fix-powerup-budget-candidate-window
description: planPowerUpBudget's real search-stall bug (candidateLevelsPerSlotPerRound defaulted to 2) — root cause, fix, and how the regression test was actually derived
metadata:
  type: project
---

**The bug (found by the overseer 2026-09-08, same day `planPowerUpBudget` shipped):** on the
default 6-slot Power-Up Optimizer roster vs. Mega Tyranitar with a real stardust/candy budget, the
plan committed exactly ONE step and stopped with `no-significant-candidate`, leaving ~91% of the
budget unspent — even with stardust/candy made artificially unlimited. Not a resource limit; a
search-window bug in [[feature_fixed_budget_powerup_planner]].

**Root cause:** `candidateLevelsPerSlotPerRound` (default `2`) capped how many of a slot's
useful levels (from `usefulPowerUpLevelsAbove`) were even OFFERED as jump candidates each round.
The noise-floor commit rule (`deltaTeamDps > noiseFloorTeamDps`) only ever sees candidates that are
offered — so when a slot's real gain sat at its 3rd+ useful level (a bigger jump than "the next one
or two," but still a SINGLE candidate, not a chain), it was structurally unreachable no matter how
much budget remained. Confirmed live: Garchomp's real gain was a single jump 30→31.5 with
`deltaTeamDps=0.607` (6x the noise floor) that the old cap never even tried, because it was the
capped-out 3rd item in that slot's candidate list, behind two much smaller (sub-floor) options.

**Fix:** `candidateLevelsPerSlotPerRound` now defaults to `Number.POSITIVE_INFINITY` (every
affordable useful level is offered, not just the nearest two); `maxCandidatesPerRound` raised
12→60 to keep a round's total sim cost bounded. The interleaving loop's depth bound was changed
from `candidateLevelsPerSlotPerRound` directly (which would spin forever at `Infinity`) to
`Math.min(candidateLevelsPerSlotPerRound, longest actual per-slot list)` — always finite. The
noise-floor commit rule itself was NOT touched — it was correct; it just never got a fair shot at
the real candidates. The score-based selection (`deltaTeamDps / costFraction`) already, with no
further change, prefers a smaller efficient jump over a larger inefficient one that also clears
the floor — verified directly in the fixed run: after Kartana's step, Garchomp's own candidate
list offered levels up to 36.5, but the search chose 31.5 (score 2.22) over 34.5 (score 0.71)
because it was more efficient, not because it was first-found.

**Perf:** this is the correctness-vs-speed tradeoff CLAUDE.md/the task both anticipated — a round
now approaches a full `optimizePowerUps`-shaped sweep instead of a fixed 12-candidate one.
Measured on the real default roster (`runPowerUpOptimizerScenario`, both `optimizePowerUps` AND
`planPowerUpBudget`, 20 iterations, matching the web tab exactly): ~800ms→~1050ms combined,
still comfortably inside the 400ms-debounced web tab's budget. The worst-case-shaped perf
benchmark (level-1 roster, unlimited budget, runs to natural exhaustion — see
[[feature_perf_benchmark_suite]]) went from ~2.3-2.4s to ~8.5-9.1s under vitest; `perf.test.ts`'s
budget raised 24s→90s (still ~10x measured) — re-measured via the SAME harness the assertion runs
under (`npx vitest run perf.test.ts`), not the separate `perf.bench.ts` mean (4.57s) or a bare
`tsx` run (7.7s) — all three differ meaningfully; always measure in the harness the assertion
actually runs in, per this project's own stated discipline.

**Deriving the regression test was the hard part, and the obvious approach was wrong.** My first
instinct was "find a fixture where several CONSECUTIVE useful half-levels are each individually
sub-floor, and their CHAIN SUM exceeds the floor" — I burned a lot of search time on this and
could not find a clean, stable case (accumulated deltas kept net-cancelling due to tick-alignment
jitter; see [[investigation_stepwise_tick_timing]] for why that jitter exists at all). Re-reading
the ACTUAL bug trace (Garchomp's real numbers above) showed the true shape is simpler: it's not a
chain of small steps that sum to something big — it's a SINGLE bigger jump, several useful-levels
out, that was never tried because of the arbitrary offered-window cap. The working regression
fixture (`packages/engine/test/powerUp.test.ts`, describe block "regression: a multi-level jump
whose own individual half-steps each sit below the noise floor") needed: a species/boss pair
where the fight actually CLEARS within the raid timer (`clearRate` must be ~1 — a
never-clears fight uses the `teamDamageAtRaidSeconds/raidTimerSeconds` fallback, which varies
continuously with attack stat and has no hit-count-quantization cliffs to exploit at all,
producing tiny-but-never-significant deltas everywhere and no clean plateau/cliff distinction).
Found via an automated grid search over fast-move power / boss defense / boss stamina (not hand
math) — verified with a throwaway `tsx` scratch script, deleted after use, per this project's
re-derive discipline. Final fixture: `fromLevel=31`, boss `baseStamina=1000`/`baseDefense=150`,
slot fast move power 7 / charged move power 80 — nearest 3 useful levels (31.5/32/32.5) each sit
at `deltaTeamDps≈0.082` (floor≈0.178), while the jump straight to 34 sits at `≈1.16` (>6x floor).
The test asserts BOTH directions: the default (unbounded) config finds and commits that jump, AND
explicitly re-narrowing `candidateLevelsPerSlotPerRound: 2` reproduces the historical stall
(0 steps) — proving the fixture is a real reproduction, not just a hypothetical shape.

**Pushback I did NOT make, but flagged for the record:** the task described the failure mode as
"every individual step below the noise floor, cumulative jump above it," implying an
accumulation story. The actual mechanism turned out to be simpler (one single candidate skipped
by an arbitrary window, not a sum of small ones) — I did not push back on the task's framing since
the fix and the observable behavior (a real committed multi-level jump) are identical either way;
worth knowing if a future request references "the accumulation bug" specifically, since that's not
quite what happened.
