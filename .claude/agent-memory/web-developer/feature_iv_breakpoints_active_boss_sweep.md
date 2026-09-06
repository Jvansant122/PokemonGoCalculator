---
name: feature-iv-breakpoints-active-boss-sweep
description: Follow-up to the IV Breakpoints tab — a sweep report over ALL currently-active raid bosses layered above the single-target per-level table, plus reversing that table's level order
metadata:
  type: project
---

Built 2026-09-06 in `IvBreakpointsView.tsx` only (zero new files, zero engine changes, zero new
`Scenario` fields — this is a derived report, not a user setting).

**No standalone engine helper existed for "loop compareIvSpreads per boss" either** — same
situation as the original tab build (see [[feature-iv-breakpoints-tab]]): had to replicate
comparison.ts's inline `{stab, typeEffectiveness, weatherBoosted}` construction a SECOND time,
once per active raid boss inside a `useMemo`. To avoid two independently-drifting copies of the
attacker-move resolution, factored `resolvedAttackerMoves` (fastMove/chargedMove resolved from
`assumptions.fastMoveId`/`chargedMoveId`) out into its own `useMemo` shared by both the
single-target `result` computation and the new `bossSweep` computation — this is the one bit of
real refactor in this change, everything else is additive.

**The sweep uses each boss's own FIRST fast move (`resolveMove(bossSpecies.fastMoves, null)`),
never the single-target boss-fast-move picker's selection** — there's no per-boss fast-move
picker UI for 12 bosses at once (would be absurd), and the existing `assumptions.bossFastMoveId`
control only ever applies to the one explicitly-selected target below. Documented this scope cut
explicitly in the sweep's own caveat text so a reader doesn't assume the sweep respects a
fast-move override that only exists for the single target.

**Compaction trick for "which levels diverge" across ~79 levels x 12 bosses x 3 metrics**: wrote
`formatDivergentLevels(rows, key)` which groups a boolean column into contiguous RUN INDICES (not
numeric level gaps) and renders each run as `"19.5"` or `"21–23"`. Grouping by array-index
adjacency rather than by checking `level[i+1] - level[i] === 0.5` is deliberately robust to a
level ladder with a non-uniform step (doesn't matter here since CPM_TABLE is uniform 0.5 steps,
but avoids hardcoding that assumption into the UI layer).

**Empirically, ALL 12 currently-active raid bosses showed at least one divergence** for the
tab's own default Delphox 14/15/15 vs 15/13/15 scenario (scratch-script-verified, not assumed) —
the task brief's expectation that "no impact" would be the common case did NOT hold for this
specific real default matchup (charged-move damage diverged at level 1 for 9 of 12 bosses, driven
by the attack-IV difference). This is a real, verified finding, not a bug — the report correctly
shows "12 of 12 impacted" rather than forcing a false "mostly no impact" narrative. Don't be
surprised if a future default/spread combination shows the opposite; the report's "no impact"
branch (worded to NOT look like an error state, per the task brief) was written and exists in the
code path (`impactedBossCount === 0`) even though this session's specific numbers didn't exercise
it — verify that branch's wording still reads correctly whenever the default scenario changes.

**Level-order reversal was purely a rendering change**: added `rowsForTable = [...rows].reverse()`
right before the JSX return and pointed only the per-level `<tbody>`'s `.map()` at it — left `rows`
itself (used for `divergingCounts` and passed to `headline()`) completely untouched, so nothing
about the underlying computation or the headline sentence's "first divergence level" semantics
changed, only which end of the array the table prints first.

**Verification performed**: `npx tsc --noEmit` clean, `npm run build --workspace=packages/web`
succeeded (same pre-existing >500kB warning). No browser-preview tool in this session's grant
either (Read/Write/Edit/Bash/Grep/Glob only) — used the same ladder as
[[verification-without-browser-tool]]: `vite preview` on port 4322, curled root/JS/CSS for 200s,
`node --check`ed the bundle, grepped it for the new report's shipped strings ("Impact across
currently-active raid bosses", "Fast-move dmg divergent levels", "No impact"). For actual
data-flow correctness, ran a throwaway `.mts` via `npx tsx` (same relative-import-required
precedent as before) that: (1) called the exact sweep logic against all 12 real active bosses,
confirmed engine rows come back ascending and that `[...rows].reverse()` puts the max level first
and min level last (proving the reversal is safe), and (2) round-tripped a full
`IvBreakpointsScenario` with non-default values on every field through
`buildIvBreakpointsScenarioUrl`/`parseIvBreakpointsScenarioFromUrl` including the `view=` stamp —
`JSON.stringify(decoded) === JSON.stringify(original)` true. Deleted the scratch file afterward;
confirmed via `git status --porcelain` that only `IvBreakpointsView.tsx` changed. Did NOT click
through the live rendered tab in an actual browser — same real gap as the original tab build, not
closed by this session either.
