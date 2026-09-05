---
name: feedback-cumulative-not-rate
description: Prefer cumulative running totals over rate-based (per-second/DPS) columns in any per-row time-series display, since a rate column decays toward zero once its numerator freezes (candidate dies) but its denominator (elapsed time) keeps growing.
metadata:
  type: feedback
---

Any table/column showing a value "per candidate, per time-row" for a fight that can end before the
displayed window does (a candidate faints, boss timer runs out, etc.) should show a running
cumulative total, not `cumulativeValue / elapsedTime`. The rate framing is mathematically correct
("average so far") but reads as broken to a user: `DamageOverTimeTable.tsx` originally had "Total
DPS" and "Avg DPS" columns that decayed from a real value down toward ~0 across the tail of a long
window for a candidate that died early (e.g. died at 10s in a 198s window, "Avg DPS" fell from 1.4
to 0.1 over the remaining rows) — the underlying damage total was frozen and correct, but the
division made it look like the candidate's damage was draining away.

**Why:** confirmed live by the overseer as a real, reproduced usability bug (not a
misunderstanding) — see the session that added `Total damage`/`Own damage` columns replacing
`Total DPS`/`Avg DPS`. Also: a combined "Total DPS" that's mostly team-damage-boost arithmetic
(`teammates × dps × boost`) barely moved by the actual candidate's own performance is misleading
to label as that candidate's "DPS" at all — same fix (drop the `/t`, rename to reflect what's
actually being displayed) resolves both complaints at once.

**How to apply:** any new per-row or per-candidate metric added to `DamageOverTimeTable.tsx`,
`DamageOverTimeChart.tsx`, or a future similar time-series view should default to a cumulative
total. If a genuine rate is wanted, label it precisely (e.g. "own DPS over full representative
run" as a single result-card number, which is a different thing) and never as a growing-then-decaying
per-row value across a window that can outlive the candidate.

Related: row *time* labels have the same "looks broken" failure mode when a fixed row COUNT (e.g.
14) evenly divides an arbitrary `maxSeconds` — produces ugly non-round labels like "2.4s". Originally
fixed by picking a "nice" step (1/2/5/10/15/30/60/120/300s) that gets row count closest to the
target (~14) via a `pickRowStep` helper. **Superseded 2026-09-05**: the user explicitly overrode
this tradeoff and asked for a fixed 1-second row step always, regardless of fight length (wants to
see the boss's every-1s fast-attack-level granularity, even for a 198-row table on a long fight) —
`pickRowStep` was deleted, `buildRowTimes` now always receives `ROW_STEP_SECONDS = 1`. If a future
request wants variable-density rows again, don't just restore `pickRowStep` from git history without
asking — confirm the fixed-1s behavior is actually the thing being reconsidered, since it was a
deliberate, explicit user product decision, not a bug.
