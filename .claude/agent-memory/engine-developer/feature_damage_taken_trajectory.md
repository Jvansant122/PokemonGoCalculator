---
name: feature-damage-taken-trajectory
description: StepwiseRunResult.damageTakenTrajectory field, its shape/semantics, and the DPS-table ambiguity flagged to the overseer
metadata:
  type: project
---

Added 2026-09-05: `StepwiseRunResult.damageTakenTrajectory: DamageTrajectoryPoint[]`
(`packages/engine/src/simulate.ts`) — the damage-TAKEN counterpart to the pre-existing
`ownDamageTrajectory`. Reuses `combat.ts`'s `DamageTrajectoryPoint` type exactly (no parallel
type). Pushed inside `simulateStepwiseBattle`'s boss-hit block, right after
`totalDamageTaken += damage; hp -= damage;` — so it fires for both boss fast and boss charged
hits, post-dodge-multiplier (the actual number applied to hp), including the fatal hit itself
(pushed before the `hp <= 0` break, so no padding is needed in the common case where the run ends
on a real hit). Starts with `{atSeconds: 0, cumulativeDamage: 0}` and gets the same
end-of-run tail-padding as `ownDamageTrajectory` (pads to `faintedAtSeconds ?? maxSeconds` if the
last real point is earlier). Flows through to `SustainedCandidateResult.representativeRun`
automatically — `SustainedCandidateResult extends DistributionSummary` and
`DistributionSummary.representativeRun` is just a `StepwiseRunResult`, so **no changes were
needed in `comparison.ts`** to thread this through; verified this before assuming it, per the
dispatching agent's explicit instruction not to assume.

**Why:** requested to back a new web-UI table (Total DPS / Damage Taken / Average DPS as a time
series) — `web-developer`'s job to build the table, this agent's job to make sure the trajectory
data existed to compute it from.

**Ambiguity flagged, not resolved by this agent:** "Total DPS" vs "Average DPS" at time t could
mean either (a) cumulative-so-far rate (`trajectory-value-at-t / t`, what I assumed and what the
dispatching instructions described) or (b) an instantaneous/sliding-window rate. Didn't block
implementation on this since the underlying trajectory data (`ownDamageTrajectory` for output,
`damageTakenTrajectory` for input) is useful either way — whichever definition the overseer/user
picks, the web layer computes it from these two arrays, no further engine changes anticipated
unless a sliding-window rate is chosen (which would need a windowed derivative, not a new field).
