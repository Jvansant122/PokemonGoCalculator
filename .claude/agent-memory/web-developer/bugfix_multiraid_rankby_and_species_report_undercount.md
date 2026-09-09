---
name: bugfix_multiraid_rankby_and_species_report_undercount
description: Two UI bugs fixed 2026-09-09 - multi-raid Power-Up Optimizer ignored rankBy/had no efficiency columns, Species Report's "active + past" option undercounted by omitting active bosses
metadata:
  type: feedback
---

## The bugs

1. Single-raid Power-Up Optimizer mode ranks candidates by team-DPS-per-1000-stardust/candy/XL-
   candy (CLAUDE.md standing decision: never blended into one score) and shows all three as
   columns. Multi-raid mode's `RosterPowerUpCandidate` already carries the identical three fields
   (`deltaPer1000Stardust`/`deltaPerCandy`/`deltaPerXlCandy`, plus `exceedsNoise` as the
   significance gate) — packages/web/src just never read them. The `rankBy` assumption round-
   tripped through the URL fine (it's a real `Assumptions` field) but was inert in multi-raid: no
   UI selector shown (gated `value.mode === "single-raid"` in the assumption panel), no sort
   applied to the ranked table.
2. `SpeciesReportView.tsx`'s "active + past" dropdown option showed `pastRaidOptions.length` only
   (752), when the real total is active + past (was 765 that day). `pastRaidBossOptions()`
   deliberately excludes currently-active species (by design, for the past-only badge), so it can
   never stand in for the combined total on its own. `BossSetPanel.tsx` line 68 already did this
   right (`bossCount.active + bossCount.past`) for the exact same underlying registry helpers —
   the two call sites had drifted.

## The fixes

- New shared module `powerUpCandidateSort.ts`: a `RankableCandidateFields` shape (`delta`,
  `isSignificant`, `costStardust`, `efficiency`) plus `compareCandidatesByEfficiency` (the
  3-group noise-floor-aware order: measurable gains by efficiency desc, within-noise by cost asc,
  measurable losses by delta asc) and `sortCandidatesByEfficiency<T>` (generic, takes a
  projection). `efficiencyForRankBy(rankBy, per1000Stardust, perCandy, perXlCandy)` resolves which
  of the three fields the selected `rankBy` wants. Single-raid's `PowerUpCandidate` and multi-
  raid's `RosterPowerUpCandidate` name the same three concepts differently
  (`deltaTeamDps`/`deltaExceedsNoise` vs `meanDeltaTeamDps`/`exceedsNoise`) — that's *why* this
  needed a projection-based generic rather than a shared base type. Both
  `PowerUpOptimizerView.tsx`'s single-raid `sortedCandidates` memo AND its new multi-raid
  `sortedCandidateGroups` memo now call into this one module. Unit-tested in
  `powerUpCandidateSort.test.ts` (10 cases: each field-resolution branch, each of the 3 sort
  groups, null-efficiency-sinks-not-zero, no-mutation).
- Sort AFTER dedup, not before: `dedupeInterchangeableCandidates`'s own doc comment says input
  order only decides which member of a group surfaces first, not the final display order — so
  `sortCandidatesByEfficiency` runs on the already-deduped `DedupedRosterCandidateGroup[]`,
  keyed on `group.representative`'s fields. Doing it the other way (sort candidates, then dedupe)
  would have technically also worked here since dedup preserves first-occurrence order, but
  reading the dedupe module's own comment made "sort after" the less surprising choice given the
  documented contract.
- Added 3 `<th>`/`<td>` pairs to `MultiRaidCandidateTableHead`/`MultiRaidCandidateRow` (shared by
  both "Ranked candidates" and "Benched but promising" — one column-count bump,
  `MULTI_RAID_ROW_COLUMN_COUNT` 9→12, feeds the expandable per-boss row's `colSpan`). Placed
  right after "Mean Δ team DPS", before "Best boss Δ" — mirrors single-raid's own column order
  (delta immediately followed by its 3 efficiency breakdowns, cost columns separate). "—" gating
  uses `c.exceedsNoise` (multi-raid's own "aggregate OR per-boss significant" flag, already used
  elsewhere in the same row for opacity/mean-delta display) OR `deltaPerX === null` — exact mirror
  of single-raid's `!c.deltaExceedsNoise || c.deltaTeamDpsPerX === null` convention.
  **`Benched but promising` got the columns "for free"** by sharing the row/head components —
  did NOT also sort it by rankBy (task scope only asked for the ranked table; its existing order
  is the engine's own "cheapest affordable level" choice, not something to disturb).
- Removed the `value.mode === "single-raid"` gate on the "Rank candidates by" `<select>` in
  `PowerUpOptimizerAssumptionPanel.tsx` — it's a real control now in both modes, not decoration.
- Fix 2 was a one-line change: `{pastRaidOptions.length}` → `{bossOptions.length +
  pastRaidOptions.length}` (the view already had `bossOptions` — active — in scope; no new
  registry call needed). Left the "No — active raids only" option's label alone (not in scope,
  and it didn't have the bug).

## Concurrent-session discipline (three OTHER sessions writing the same repo simultaneously)

This session ran alongside at least three other concurrent agents in the SAME working directory
and SAME `.claude/agent-memory/` tree: one landing an engine feature (`holdChargedMoveUntilSafe`
dodge-cost-adjacent work touching `simulate.ts`, `TeamAssumptionPanel.tsx`, `TeamRaidView.tsx`,
`runTeamRaid.ts`, `scripts/sync-data.ts`, `MECHANICS.md`), one doing a `data/` resync (all the
`data/raw`/`data/normalized` diffs), and one doing a Species Report header-wrap/styling pass
(`styles.css`, its own new memory file). None of this touched the files this task's two fixes
were scoped to.

- **How to tell "not mine" from "mine" fast**: `git status --porcelain` at intervals — if a file
  you never opened shows up modified, or a typecheck error names a symbol/field you never wrote,
  it's not yours. The concurrent session's errors (`showDetailedAssumptions` missing on
  `TeamAssumptions`, then `effectiveBossChargedMoveFrequencySeconds` missing) visibly *shrank and
  moved* across three consecutive `npm run typecheck:web` runs as their edits landed —
  transient-and-converging is a strong signal it's someone else's in-flight work, not a bug in
  yours. It fully resolved on its own within a few minutes; no action needed from me.
- **Read files fresh, don't trust an earlier Read in context, when a system-reminder says a file
  changed on disk.** `SpeciesReportView.tsx` was flagged as changed since I'd looked at it — the
  diff turned out to be an *unrelated* concurrent edit (a `validEraHp` import/comment tweak I
  never touched), sitting right next to my one-line fix. Per the harness's own guidance in that
  situation: don't revert it, don't "fix" it, just verify your own line survived (it did — a
  `grep` for the exact new text is faster than a full `Read` diff for this) and move on.
- **`MEMORY.md` itself is a live-write hazard across concurrent sessions in this project.** Before
  appending your entry, re-`Read` it — don't rely on the copy you started the conversation with.
  Two other sessions had already appended their own lines by the time I got to this step; a
  naive "replace the last line I remember" `Edit` would have raced. Anchor the `Edit`'s
  `old_string` on whatever the actual current last line is, re-read immediately beforehand.
- Reconfirms the standing memory-index note: `feature_power_up_optimizer_blocked_candidate_callout.md`'s
  "concurrent-session scratch files cause transient tsc failures outside packages/engine too" —
  now proven a third time, across THREE simultaneous unrelated sessions, not one.

## Verification actually performed

Ran the real dev server (`npm run dev` was already up on :5173) and drove it with Playwright from
Bash (scratch script placed inside `packages/web/`, deleted after — OS temp doesn't resolve bare
imports there). Confirmed live: the Species Report "Yes" option read "771 recorded" (active+past,
not past-only); the multi-raid "Rank candidates by" selector rendered and was clickable in
multi-raid mode; after importing the repo's own `src/import/test/pokeGenieSample.csv` fixture,
refreshing the boss set from live active raids, and running a real sweep, the ranked table showed
all 12 headers including the 3 new efficiency columns with real (and correctly "—"-gated) values
— and, the important behavioral proof, **the top row's species genuinely changed (Palkia →
Solgaleo) when switching the live selector from `stardust` to `candy`**, confirming the sort is
actually wired to the control rather than just rendering extra static columns. Zero console
errors. `npm run test:web` (19 files/178 tests), `npm run typecheck`, `npm run lint` (0 errors),
and `npm run check-scenario-roundtrip` all green once the concurrent sessions' work had settled.
