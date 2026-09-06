---
name: feature-iv-breakpoints-full-sweep-aggregate
description: Follow-up that widened the IV Breakpoints sweep to every registered species (not just active raids) and replaced its per-boss table with a single tallied-verdict paragraph
metadata:
  type: project
---

Built 2026-09-06 in `IvBreakpointsView.tsx` only, superseding
[[feature-iv-breakpoints-active-boss-sweep]]'s per-boss table (that memory's `formatDivergentLevels`/
`BossSweepRow`/per-boss-table content is now dead — this entry is the current state).

**Two independent asks bundled into one change**: (1) sweep `allSpeciesOptions()` (every
registered species, ~1000+) instead of `activeRaidBossOptions()` (~12), reusing the exact same
`raidTierForSpeciesId(id) ?? undefined` fallback-to-`DEFAULT_REAL_RAID_TIER` convention already
used everywhere else — nothing new to import, `bossEffectiveStats` already defaults internally.
(2) Replace the entire per-boss table with one aggregate paragraph — no chart, no table, per the
user's explicit words ("don't make the report a chart... just list which one outperforms the
other and by how much").

**Verdict definition, precisely (this was the ambiguous part the task spec had to pin down)**: for
one target species, tally wins per (level, metric) instance across all three metrics
(`fastMoveDamage`, `chargedMoveDamage`, `timeToFaintSeconds` — all "higher is better", no sign
flip needed) — a strict inequality increments `winsA`/`winsB`, a tie at that level/metric
increments neither. Sum across all ~79 levels for that target. That target's own "winner" is
whichever tally is strictly higher; equal tallies (including both zero) count as neither/a tie for
the OUTER aggregate too. `timeToFaintSeconds: null` (outlasted the 60s scan window) is treated as
beating any finite value via `?? Infinity` — same convention the pre-existing per-level table
already used for its own winner-bolding, so this isn't a new interpretation, just reused.

**Don't hardcode the registered-species count in prose or comments.** The original active-boss-
sweep session and even `registry.ts`'s own top-of-file comment say "1012"/"~1016" — a scratch-script
run this session found the REAL current count is 1081 (post data-sync drift). Wrote the new doc
comment to explicitly say "exact count drifts with each data-sync, deliberately not hardcoded" —
worth grepping for stale species-count numbers elsewhere in this file/others before quoting one.

**Numeric verification for the real default scenario (Delphox 14/15/15 vs 15/13/15, no target
needed since this is now an all-species sweep)**, via a scratch `.ts` mirroring the component's
exact call shape, run with `npx tsx` (dropped inside `packages/web/src/`, deleted after — see
[[verification-without-browser-tool]]):
- 1081 total registered species, 0 errors (no species lacked a resolvable fast move for this
  matchup), countA (Spread A wins) = 20, countB (Spread B wins) = 1050, ties = 11.
- Rendered sentence: "Across all 1081 raid targets this tool can model, Spread B (15/13/15)
  outperforms Spread A (14/15/15) in 1050 of them, versus 20 where Spread A comes out ahead (11
  show no meaningful difference either way) — Spread B outperforms Spread A in 1030 more raids
  overall." Confirmed this exact string is present in the production `dist` bundle via grep, and
  that the OLD "Impact across currently-active raid bosses" heading string is fully gone (`grep -c`
  → 0).

**No browser-preview tool in this session's grant either** (Read/Write/Edit/Bash/Grep/Glob) — used
the same ladder as [[verification-without-browser-tool]]: `tsc --noEmit` clean, production build
succeeded (same pre-existing >500kB chunk warning, no new errors), `vite preview` served and
curled for a 200, grepped the built JS bundle for both the new heading string (present) and the
old one (absent, count 0) to confirm the swap actually shipped rather than just compiling. Did NOT
click through in an actual rendered browser — say this plainly rather than implying full
verification.

**No `Scenario` field touched** — this is a derived report over existing assumptions, not a new
user setting, so `ivBreakpointsScenario.ts` needed zero changes. `git diff --stat` after the whole
change confirmed only `IvBreakpointsView.tsx` was touched, which is the correct footprint for a
report-only change like this.
