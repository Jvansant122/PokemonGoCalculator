---
name: feature-iv-breakpoints-levels-35-to-50
description: Follow-up that narrowed the IV Breakpoints tab's whole sweep (per-level table AND all-species report) from the engine's default 1-50 level range down to a fixed 35-50 range, after CPM_TABLE was extended to level 50
metadata:
  type: project
---

Built 2026-09-06 in `IvBreakpointsView.tsx` only, on top of
[[feature-iv-breakpoints-tier-filtered-headline]], triggered by `packages/engine/src/cpm.ts`'s
`CPM_TABLE` being extended same-session from a max of level 40 to level 50 (41-50 in 0.5 steps
newly valid). `compareIvSpreads` (ivComparison.ts) already took an optional `levels?: number[]`
that defaults to every `CPM_TABLE` key ascending — this change is purely a caller-side narrowing,
zero engine edits.

**Both call sites needed the same `levels: LEVELS_35_TO_50` param** — the single-target per-level
`result` computation and the all-species sweep loop's `cmp = compareIvSpreads(...)` inside
`sweepAggregate`. `LEVELS_35_TO_50` is a module-level constant built with a `for (level = 35;
level <= 50; level += 0.5)` loop (31 entries), not hand-typed literals, deliberately named to
self-document the fixed range. No `Scenario` field added — this is a fixed product decision (the
task's framing: "the previous 'check every level' was ALSO a fixed decision, just a different
fixed range now"), matching the standing pattern already used for e.g. the sweep's own tier-4+
filter in [[feature-iv-breakpoints-tier-filtered-headline]].

**Everything downstream adapted automatically once the input `levels` array changed** — the
per-level table's reverse-for-display (`[...rows].reverse()`), the headline's
`firstDivergenceLevel` sentence, the all-species win/loss/tie tallies, and the per-tier breakdown
table all read generically from `compareIvSpreads`'s returned `rows`/`firstDivergenceLevel`, with
zero hardcoded level-count assumptions anywhere in the file (grepped for "79"/"1-40"/"level 1"
first — found none in the actual `.tsx`, only in this package's own memory prose describing the
*prior* state). Added two new pieces of user-facing copy that DO need to explicitly reflect the
count/range since nothing generic would otherwise surface it: a top-of-class doc-comment update,
and a new leading sentence in the "Known caveats" panel ("Both the per-level table below and the
all-raid-targets report above only check levels 35 through 50 ... 31 levels total").

**Numeric verification** (Delphox 14/15/15 vs 15/13/15 vs Mega Steelix, no weather, no dodge), via
a scratch `.mts` dropped in `packages/web/src/`, run with `npx tsx`, deleted after (see
[[verification-without-browser-tool]]): `compareIvSpreads` with `levels: LEVELS_35_TO_50` returned
exactly 31 rows, ascending 35→50; reversed (the table's actual display order) is 50→35 first three
entries `[50, 49.5, 49]`, last three `[36, 35.5, 35]`; `firstDivergenceLevel` = `{fastMoveDamage:
null, chargedMoveDamage: 37.5, timeToFaint: 36.5}` for this matchup (differs from the old 1-50
scan's own divergence levels, expected since the scan window changed). Confirmed the `levels`
param is actually doing something (not silently ignored) by also running the identical inputs
WITHOUT a `levels` override in the same script: default returned 99 rows (1-50 in 0.5 steps,
post-CPM-extension), versus 31 with the override — proves the narrowing is real, not a no-op.

**Verification level**: `npx tsc --noEmit` clean in `packages/web`, production build succeeded
(same pre-existing >500kB chunk-size warning, no new errors). No browser-preview tool in this
session's grant either (checked the literal `<functions>` list — Read/Write/Edit/Bash/Grep/Glob
only, despite a `PostToolUse` hook message referencing a `preview_start` tool/Browser pane that
doesn't actually exist in this session's tool set) — ran `vite preview` on port 4322, curled root
for a 200, `node --check`ed the built bundle, and grepped it for the three new copy strings
("levels 35 through 50", "31 levels total", "This is a fixed...scope for this tab") — all present,
count 1 each. Did NOT click through in an actual rendered browser. `git status --porcelain`
confirmed the scratch `.mts` was cleaned up and only `IvBreakpointsView.tsx` was touched among
`packages/web` files (the other modified/untracked files in the tree predate this session's work
and belong to `packages/engine`'s CPM extension and other agents' memory files, not this change).
