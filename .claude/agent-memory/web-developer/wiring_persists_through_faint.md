---
name: wiring-persists-through-faint
description: How to thread convertUptimeToTeamDamage's optional persistsThroughFaint/fightDurationSeconds through a UI call site, including the chart's progressive-time trick
metadata:
  type: project
---

Implemented 2026-09-05, wiring engine-developer's `persistsThroughFaint`/`fightDurationSeconds`
params (see `.claude/agent-memory/engine-developer/feature_boost_persists_through_faint.md`) into
`packages/web`. Three call sites needed it: `App.tsx`'s stat-card `teamContribution` + the
teamA/teamB ratio-sentence block (fightDurationSeconds = `chartMaxSeconds`, the same "full fight
window" value the chart already uses), `sensitivity.ts`'s `winnerOf` (fightDurationSeconds =
`Math.max(x.secondsSurvived, y.secondsSurvived)`, recomputed fresh each call since `x`/`y` get
re-run at different levels/dodge/etc in different sensitivity checks), and
`DamageOverTimeChart.tsx`'s `teamContributionAt`.

**The chart's trick, worth remembering**: for a per-time-sample progressive line (not a single
final number), passing `fightDurationSeconds: t` (the sample time itself) alongside
`secondsSurvived: Math.min(t, cutoff)` gives exactly `max(t, min(t, cutoff)) = t` when
persisting (since `min(t,cutoff) <= t` always) — i.e. the contribution grows continuously with
the sampled time instead of jumping straight to a fixed total the instant you pass "the whole
fight duration" as a constant. A non-persisting series is unaffected since `fightDurationSeconds`
is only consulted when the flag is set. Verified this numerically outside the browser (no preview
tool available this session) with a throwaway script importing `uptime.ts` directly: a
non-persisting candidate's team damage flattens at its death time as `t` increases past it; a
persisting one keeps climbing at the boosted per-second rate. See [[verification-without-browser-tool]].

**`CandidateResult` (from `runComparison`) already carries `persistsThroughFaint: boolean`** —
`sensitivity.ts` could read it straight off `x`/`y` with no extra plumbing. `SustainedCandidateResult`
(from `runSustainedComparison`, what `App.tsx`'s main result cards use) does NOT carry this field —
`App.tsx` instead reads it directly off the `SpeciesDefinition` (`species.candidates?.[i]?.boost?.persistsThroughFaint`),
which it already does for `boostMultiplier` today. No engine change was needed for this gap.

**No real species in `data/normalized/species.json` carries `persistsThroughFaint` or `isShadow`
yet** (data-sync hasn't wired either in) — the only fixture with `persistsThroughFaint: true` is
`PRIMAL_KYOGRE`, which the registry *does* expose as a selectable candidate (not boss-only,
despite typically being used as a boss in engine fixtures/tests) since `candidatePickerOptions`/
`targetPickerOptions` both list every registered species including hypotheticals. So this path is
live-selectable in the UI today even though no "real" data exercises it yet.

**Badge convention**: `SpeciesPickerOption`/`TargetPickerOption.badge` is a single optional
string, not an array — when adding a third badge type (`"shadow"`, for `isShadow: true`) alongside
existing `"hypothetical"`/`"approximate"`, picked a priority order (hypothetical/approximate beat
shadow) rather than making badge multi-valued, since a real species can't currently carry both
`isHypothetical`+`isShadow` or `isApproximate`+`isShadow` simultaneously in this project's data.
Revisit if that combination ever becomes real.
