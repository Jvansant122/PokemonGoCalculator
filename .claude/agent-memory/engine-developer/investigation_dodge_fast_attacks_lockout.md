---
name: investigation-dodge-fast-attacks-lockout
description: "Fast-attack lockout" reported by UI agents (dodgeFastAttacks:true vs a boss whose fast move is <=0.5s, e.g. Mega Tyranitar's Bite) diagnosed as correct-but-illegible, not a bug; new dodgeFastAttacksLockout signal added. Also: test/ isn't typechecked by this project's own gate.
metadata:
  type: project
---

Investigated 2026-09-10, `packages/engine` only (per task scope). Two agents had independently
reported an attacker doing ~nothing while `dodgeFastAttacks: true` against a fast-cadence boss.

## Diagnosis: correct arithmetic, not a bug

`simulate.ts`'s `simulateStepwiseBattle`: every dodged boss FAST hit (when `dodgeFastAttacks` is
on) pushes `nextAttackerFastMoveAt += DODGE_COST_SECONDS` (0.5s), unconditionally, every single
hit. If the boss's own fast move recycles at period `P <= DODGE_COST_SECONDS`, that push arrives
**at least as fast as real time elapses**, so the attacker's own fast-move eligibility can
mathematically never catch up to the clock **on its own** — a provable livelock, not a near-miss,
confirmed exactly at `P = 0.5` (Bite's real `durationMs: 500`) by direct `simulateStepwiseBattle`
runs (never hand arithmetic — see `verification_without_browser_tool.md`-style scratch scripts,
deleted after use). The ONLY thing that can close the gap is the attacker's own charged-move cast:
`attemptingDodge` is forced false while `isMidOwnAnimation`, so real time passes with no further
pushes during a cast, which can (if the cast survives) let a fast attack or two through right
after. This is the SAME mechanism the codebase already documents in `breakpoints.ts`'s
`DODGE_COST_SECONDS` comment ("dodging every fast attack is usually a bad trade") and matches the
user's own framing ("lord save me if you have to dodge every fast attack from kyogre just choose a
different mega") — the model is correctly surfacing a real, load-bearing consequence of the
already-shipped dodge-cost mechanic, not inventing a new one.

**Surprising second-order finding, verified empirically (not assumed):** a "true zero fast AND
zero charged damage for the whole run" case (the exact reported symptom) does NOT require chip
energy (`energyFromDamageTaken`) to fail to accumulate. It's reachable even when chip energy
accrues fine: reaching a charged move's energy cost via chip damage alone means the attacker
necessarily spent a lot of its own HP getting there (each unit of `ENERGY_PER_DAMAGE_TAKEN`-derived
energy costs HP 1:1 via the damage that generated it), so by the time the cast actually starts
there is often too little HP margin left to survive even ONE full-damage boss hit landing
mid-cast (mid-animation hits are never dodged/reduced, by long-standing separate design) — the
cast gets interrupted (`diedDuringOwnChargedMoveAnimation: true`) before it can land or free up a
fast-attack window. Pinned both this case (power=6, mirrors Bite) AND the "cast survives, ~1 fast
+ 1 charged attack land" case (power=3, same 0.5s cadence) side by side in
`simulate.test.ts`'s `dodgeFastAttacksLockout` describe block, specifically so the field's own doc
comment doesn't overclaim a single mechanism. A first draft of the `StepwiseRunResult` doc comment
wrongly attributed the true-zero case to "chip damage floors to 0 energy" (a real, different, ALSO
possible failure mode I found first against real Tyranitar/Bite stats, but not what's actually
pinned in the regression test) — caught and corrected before finishing; **check a doc comment's
claimed mechanism against the literal pinned test, not just against pre-verification scratch
output** — the two can diverge once you swap fixtures partway through.

## What changed (all additive, zero pinned-number changes)

- `breakpoints.ts`: new pure predicate `fastMoveCadenceTooFastToDodge(fastMoveDurationSeconds):
  boolean` = `<= DODGE_COST_SECONDS`, next to that constant. No RNG/stats — callable by the web
  layer directly (e.g. on a boss-fast-move dropdown) without running a simulation.
- `simulate.ts`: `StepwiseRunResult.dodgeFastAttacksLockout` / `DistributionSummary.
  dodgeFastAttacksLockout` (aggregated via `.some()`, mirroring `bossChargedMoveCadenceClamped` —
  the closest existing sibling pattern: "requested config hit a structural floor; flag it, don't
  silently change the numbers"). Computed ONCE up front (`dodgeFastAttacks &&
  fastMoveCadenceTooFastToDodge(boss.fastMove.durationSeconds)`), not per-tick.
- `teamRaid.ts`: `TeamRaidSlotResult.dodgeFastAttacksLockout`, threaded through explicitly (that
  type cherry-picks fields off `StepwiseRunResult` rather than spreading it, unlike
  `comparison.ts`).
- `comparison.ts`/`speciesReport.ts`: **zero changes needed** — `SustainedCandidateResult extends
  DistributionSummary` AND its construction does `{ id, name, bossMaxHp, ...distribution }` (a
  real spread, not a field-by-field re-list), so the new field flows through automatically, and
  `speciesReport.ts` reuses `SustainedCandidateResult` directly. Verified this by reading the
  actual construction code, not assumed from the `extends`.
- `rosterPlanner.ts`: deliberately NOT touched. It never calls `simulateStepwiseBattle`/
  `runStepwiseDistribution` directly (routes through `runSustainedComparison`/`runTeamRaid`, both
  now covered), and its own `screenScoreFor` only consumes 2 numeric fields
  (`meanTotalDamage`/`meanSecondsSurvived`) — too many levels of statistical aggregation removed
  from a per-tick diagnostic flag to be a reasonable place to surface it.

## Process lesson: this project's own gates do NOT typecheck `test/`

`packages/engine/tsconfig.json` has `"include": ["src"]` only, and `npm run typecheck:engine` is
literally `tsc --noEmit -p packages/engine/tsconfig.json` — so `test/**` is invisible to the
project's typecheck gate. `npm run test:engine` (vitest, esbuild transform) doesn't backfill this
either: esbuild strips types and runs the JS, so a hand-built object literal missing a newly-added
required field on a large result-type mock runs and passes fine at RUNTIME while silently
violating the type. Found exactly this: adding `TeamRaidSlotResult.dodgeFastAttacksLockout`
broke `test/powerUp.test.ts`'s hand-built `buildResult()` mock (`teamDamageAtRaidSeconds` describe
block) with zero signal from either `test:engine` (428/428 green throughout) or
`typecheck:engine`. Only caught by manually writing a throwaway tsconfig
(`extends` the same base, `include: ["src", "test"]`) and running `tsc --noEmit` against it —
deleted after use. **Any future change adding/renaming a required field on a widely-mocked result
type (`StepwiseRunResult`, `TeamRaidResult`/`TeamRaidSlotResult`, `DistributionSummary`,
`SustainedCandidateResult`) should do this same throwaway-tsconfig check** rather than trusting
`npm run test:engine` + `npm run typecheck:engine` together to catch a hand-built mock going
stale — they don't, between them, cover that case. Separately (already-known, reconfirmed): the
2 "signature pinning" tests in `rosterPlanner.test.ts` (exact `Object.keys(...)` lists for
`SustainedCandidateResult` and `TeamRaidSlotResult`) exist specifically to force conscious
acknowledgement of exactly this kind of shape change — updating them is the intended maintenance
step, not a workaround; see [[fixture_deletion_hypothetical_duo]]-adjacent discipline.

## Shared-worktree note

Repo had extensive concurrent uncommitted changes from other agents across `packages/engine`
(`comparison.ts`, `ivComparison.ts`, `megaLevel.ts`, `scenario.ts` + tests), `packages/web`, and
`scripts/` while this investigation ran (see [[feedback_concurrent_sessions_shared_worktree]]).
Touched only my own 8 files; did not run the full monorepo `npm run verify`/`test:e2e` since that
would conflate other agents' in-flight, possibly-mid-edit work with this change's own signal —
scoped verification to `packages/engine` instead (full vitest suite 428/428, plus `tsc --noEmit`
both for `src` alone and for a throwaway `src`+`test` config). Change is purely additive to
output/result types only (no changed function input signatures), so cross-package typecheck risk
for `packages/web` is low but not independently confirmed here — flagged for whoever next runs
`npm run verify` for real.

## MECHANICS.md routing (not edited myself, per instructions)

This is **adjacent to, not the same as**, the existing "OPEN QUESTION: how much of the attacker's
own time is lost dodging around their own charged-move cast (`holdChargedMoveUntilSafe`)" entry —
that question is about a different, unrelated setting (dodging timed around a HELD cast). This
finding is about the interaction between `dodgeFastAttacks` and `DODGE_COST_SECONDS` vs. a boss's
own fast-move cadence, and doesn't touch `holdChargedMoveUntilSafe` at all. Recommended (to the
overseer) as a new dated entry under `## Dodging`: an ENGINE BEHAVIOR finding (not a new sourced
real-game mechanic, though consistent with the confirmed-first-party `dodgeDurationMs: 500`), worth
recording so it isn't rediscovered as a bug a third time.
