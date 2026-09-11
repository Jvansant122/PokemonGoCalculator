---
name: feedback-optimizer-iterations-measured-and-kept
description: Measured single-raid Power-Up Optimizer iteration count/noise trade-off (IDEAS.md #6) and deliberately left OPTIMIZER_ITERATIONS unchanged, no worker migration
metadata:
  type: feedback
---

Task asked to measure whether the single-raid tab's per-recompute seed count should rise, or
whether single-raid should move to a worker like multi-raid already has (2026-09-10). Conclusion:
**left as-is, with real numbers to back it** — the task explicitly permits "the current count is
the right trade" as a complete answer, and this is that case.

**What was already true, not newly discovered**: `run/runPowerUpOptimizer.ts`'s
`OPTIMIZER_ITERATIONS` was ALREADY 20 (raised from the engine's default 3 back in the noise-floor
session — see `feature_power_up_optimizer_noise_floor.md`), not 3 as a stale mention in the task
description implied. The only calls still at the engine's bare default (3) are the SECONDARY
TM/second-charged-move/Elite-TM candidate generators (`moveChangeInputs`), deliberately left there
per that file's own comment ("supplementary candidates on top of the main ranking... a coarser-but-
fast evaluation here keeps the debounced recompute from ballooning").

**Measured** (scratch tsx script inside `packages/web`, deleted after use — see
`pattern_worktree_isolation_for_concurrent_session_verify.md`'s sibling note on scratch-script
placement — `@pogo-analyzer/engine` bare-specifier resolution requires the script live inside the
package, not the OS temp scratchpad): on the tab's real DEFAULT_ASSUMPTIONS roster/boss (6 slots,
202 candidates), combined `optimizePowerUps` + `planPowerUpBudget` wall time scales roughly
linearly with iteration count — **~553ms at 20 (current), ~1061ms at 40, ~1547ms at 60, ~2643ms at
100**. Full `runPowerUpOptimizerScenario` (including the two cheap TM-candidate passes) measured a
consistent **~650ms** across 6 repeated runs — matches the existing smoke-test timings (526-781ms
per assertion) almost exactly, so this isn't a stale/optimistic number.

**Noise reduction with more seeds is real but sub-linear and doesn't rescue a genuinely marginal
candidate.** Tracked ONE fixed candidate (same species+toLevel, not "whatever ranks #1" — an
earlier draft of this measurement picked `candidates[0]` per run, which is WRONG since the #1 slot
itself can be a different candidate seed-to-seed; re-ran fixed on a specific key instead) across 8
different base seeds at each iteration count: stdev of its `deltaTeamDps` fell from 0.107 (@20) to
0.058 (@40) to 0.041 (@60) to 0.026 (@100) — roughly consistent with 1/√N scaling, but the tracked
candidate's TRUE effect (a single half-level step) is small enough relative to its own noise that
even 100 seeds leaves stdev/mean ≈ 0.7. **This is exactly what the existing noise-floor gating
(`exceedsNoise`, shipped 2026-09-08) is FOR** — it already renders a marginal candidate as "≈0 (no
measurable change)" instead of a signed number implying false precision, so more seeds mostly
sharpen candidates whose true effect is already well clear of the floor, not the borderline ones.

**Decision: don't raise `OPTIMIZER_ITERATIONS`, don't move single-raid to a worker.** Doubling
iterations roughly doubles the ~550-650ms main-thread block that happens once per settled 400ms
debounce (every keystroke pause, not per-keystroke) — for a noise reduction the existing floor
mechanism already absorbs. A worker migration is the right SHAPE of fix if this block time ever
becomes a felt problem on its own, but it's a materially bigger change than this task's scope:
single-raid currently auto-recomputes on every debounce settle via a synchronous `useMemo` (no "Run"
button, unlike multi-raid), so moving it to async worker calls would need a genuinely new
debounce+in-flight-cancellation design (risking `react-hooks/set-state-in-effect`, a warning class
this repo explicitly tracks and says not to add to) — not justified by today's measured numbers.
Recorded here rather than silently doing nothing so a future session doesn't re-measure from
scratch; if `OPTIMIZER_ITERATIONS` is raised later, re-run this same scratch-script shape first.
