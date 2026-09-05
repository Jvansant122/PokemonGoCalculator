---
name: shared-trajectory-interpolation-helpers
description: DamageOverTimeChart.tsx owns the event-trajectory-to-value-at-t step interpolation; reuse it, don't refork it, when a new view needs the same data
metadata:
  type: project
---

`DamageOverTimeChart.tsx` has three module-level functions doing the actual math behind its
lines: `ownDamageAt(trajectory, t)` (generic step-interpolation over any
`DamageTrajectoryPoint[]` — works for `ownDamageTrajectory` or `damageTakenTrajectory` equally,
despite the name), `teamContributionAt(series, t, ...)` (wraps `convertUptimeToTeamDamage` with
`secondsSurvived: min(t, cutoff)` and `fightDurationSeconds: t`, which is the trick that makes a
`persistsThroughFaint` candidate's contribution grow continuously with `t` instead of jumping to
a fixed total), and `totalAt` (own + team). They were private (unexported) until the time-series
table below the chart (`DamageOverTimeTable.tsx`) needed them too — exported all three rather than
writing a second copy of the interpolation logic in the new file. When a future view needs "value
of X at time t" from these trajectories, check here first before reimplementing; the
loop-with-break step-interpolation (walk points in order, keep the last one at or before `t`) is
the one correct approach for this event-driven (not evenly-sampled) data.

`DamageOverTimeSeries` (also in `DamageOverTimeChart.tsx`) is the shared prop shape both the chart
and `DamageOverTimeTable.tsx` build from in `App.tsx` — gained an optional
`damageTakenTrajectory?: DamageTrajectoryPoint[]` field rather than a parallel type, since the two
components' `x`/`y` objects in `App.tsx` are otherwise identical and should stay that way.
