---
name: feature-boss-set-panel-handpick
description: Per-boss hand-picking added to BossSetPanel.tsx (multi-raid Power-Up Optimizer) — filter-replaces-handpick semantics, single-boss fast path, no new Scenario field needed
metadata:
  type: feedback
---

Built 2026-09-10: `BossSetPanel.tsx` gained a "Hand-pick bosses" section — a
`SpeciesPicker` (over `targetPickerOptions()`, the same active-raids-first
options list `ComparatorView`'s raid-target picker already uses) plus "Use
only this boss" (the single-boss fast path: search, pick, one click — sets
`bossIds = [id]`) and "+ Add to set", a removable list of the current
`bossIds` with per-row "Remove", and "Clear all bosses". No new `Scenario`
field — `multiRaidBossIds` already stored a resolved id array (per CLAUDE.md's
standing decision), so this was pure UI over the existing field.
`check-scenario-roundtrip` still reports 115 fields, unchanged.

**Filter-vs-handpick semantics chosen: REPLACE, not union.** Any filter
control (tier checkbox, include-past select, max-count, the refresh button)
still fully recomputes `bossIds` via `resolveMultiRaidBossIds` exactly as it
did before this feature, discarding any hand-added/removed entries. Reasons,
stated in the UI itself (hint text above the filter controls) and in
`BossSetPanel`'s own doc comment: (1) union would mean a filter could never
shrink the set back down — a stale hand-added boss would linger forever;
(2) the filters already fully replaced `bossIds` before hand-picking existed,
so keeping that invariant means there's exactly one rule to learn, not a
different one depending on which control was touched last. Hand-pick
add/remove/clear never call `resolveMultiRaidBossIds` — they mutate
`bossIds` directly, so they can't accidentally trigger a bulk recompute.

**Boss display for an arbitrary `bossIds` entry needed a 3-tier fallback**
(`describeBoss` in `BossSetPanel.tsx`): still-active → real tier/label from
`activeRaidBossOptions()`; not active but in `pastRaidBossOptions()` → past
label; neither (a hand-picked species that was never a recorded raid boss,
or one so old it's fallen out of both the live feed and the archive) → falls
back to `speciesRegistry.get(id).name` with a note that it'll simulate at
today's default tier — this is an HONEST UI reflection of
`runRosterPlanner.ts`'s own `resolveBossTarget` fallback (documented in
[[feature_multi_raid_roster_optimizer_phase3a]]), not new engine behavior.
A consequence worth knowing: since `targetPickerOptions()` includes every
species (not just recorded raid bosses), a user CAN hand-pick literally any
species as a "boss" — already safely handled by the existing fallback, so no
engine change was needed to support it.

**Verification: full real-browser proof**, not just Playwright. Built dist,
ran `vite preview` in the background, drove it with a scratch script
(`packages/web/scratch_bossset_e2e.mjs`, created + run + deleted, never
committed — same throwaway-script convention as
[[feature_roster_optimizer_phase1_csv_import]]/[[feature_multi_raid_roster_optimizer_phase3a]]).
Confirmed live: searching "tyranitar" → "Use only this boss" → "Bosses swept:
1" in the real result card (not just a UI count); Clear all → empty-state
warning renders; Add-to-set with a second boss; a share link built from a
hand-picked single boss, opened in a genuinely fresh browser context, restores
the EXACT SAME resolved boss (matched label string before/after) — not a
re-derived filter result. Zero console/page errors throughout. Also added a
permanent Playwright case to `multi-raid.spec.ts` covering the same
single-boss + share-link path (19 e2e specs total now, up from 18); ran the
full e2e suite with `--workers=1` (19/19 green) as well as the default
parallel config (also 19/19 — no repeat of the disk-full false-positive from
[[feature_multi_raid_roster_optimizer_phase3a]] this time).

**Mistake made and worth flagging for next time:** used
`taskkill //F //IM node.exe //T` to stop the background `vite preview`
process instead of finding and killing that specific PID. Per
[[feedback_concurrent_sessions_shared_worktree]], other sessions can share
this worktree/host — a blanket `node.exe` kill risks taking down another
session's dev server, hook process, or long-running task. Next time: find the
specific PID (`netstat`/the shell job's own PID) and kill only that, even
under time pressure.
