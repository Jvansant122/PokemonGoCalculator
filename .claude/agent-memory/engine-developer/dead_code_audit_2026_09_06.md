---
name: dead-code-audit-2026-09-06
description: code-simplifier's first pass over packages/engine — what was deleted vs deliberately kept as documented acceptance-pin infrastructure
metadata:
  type: project
---

A code-simplifier audit (2026-09-06) flagged three things in `packages/engine`:

1. `Combatant` interface in `types.ts` — deleted, zero call sites anywhere in the repo.
2. `accumulateEnergy`, `EnergyEvent`, `energyFromFastMove` in `energy.ts` — deleted, along with
   their tests in `energy.test.ts`. The production stepwise engine (`simulate.ts`) inlines its own
   energy bookkeeping and only reuses `energyFromDamageTaken`/`MAX_ENERGY` — those two stayed.
3. `combat.ts`'s `simulateOpeningBurst`/`AttackerProfile`/`BossProfile`/`OpeningBurstResult` and
   `comparison.ts`'s `runComparison`/`ComparisonInputs`/`CandidateResult` — zero production
   callers (packages/web only drives `runSustainedComparison`/`compareAcrossBossChargedMoves`/
   `simulateStepwiseBattle`). **Judgment call: kept, not deleted** — added a doc comment at the top
   of each file explaining why. This cluster is the only deterministic (non-randomized) combat
   path in the engine, so it's the one place exact hand-derived numbers (Scenario A's 171/189
   charged-damage split at 7.5s, etc.) can be pinned bit-for-bit — `simulate.ts`'s stepwise engine
   has seeded-jitter randomized boss timing by design, which makes it unsuitable for bit-exact
   pins. Migrating comparison.test.ts/scenarioA.test.ts/scenarioB.test.ts/bossTiming.test.ts (and
   part of simulate.test.ts) to runSustainedComparison was judged NOT clearly low-risk given how
   much pinned-number derivation leans on this path's determinism, so per the task's own
   preference ("prefer (a) unless migrating is clearly low-risk"), chose to keep + document rather
   than retire. `bossChargedMoveReadySeconds` (also in combat.ts) is NOT part of this dead
   cluster — it's genuinely live in production (reused by `simulate.ts`) — flagged explicitly in
   the doc comment so a future audit doesn't lump it in.

**Why this matters for future audits**: if code-simplifier (or anyone) re-flags this same cluster
as dead code, the doc comments at the top of `combat.ts` and `comparison.ts` already explain the
reasoning — check there first rather than re-litigating. If a future pass DOES want to retire this
cluster, the actual work is migrating the exact-number test assertions to run through
`runSustainedComparison` with `iterations: 1`-equivalent determinism (or some other way to get a
non-randomized single run) — not simply deleting the production code and hoping the tests still
mean the same thing.
