---
name: bugfix-mobile-horizontal-overflow
description: Fixed whole-page horizontal scroll at 375px — TWO independent causes (unwrapped .tab-switcher nav, and two of six .time-series-table call sites missing the overflow-x wrapper div that the other four already had)
metadata:
  type: project
---

Fixed 2026-09-07, user-diagnosed (not from a skeptic report — a prior skeptic pass attributed the
bug solely to `.tab-switcher` and was incomplete, per the user's own framing of this task).

**Cause 1 — `.tab-switcher` (styles.css).** `display: flex; gap: 8px` with no `overflow-x` and no
`flex-shrink`/`white-space` control on `.tab-button` — five tab labels don't fit 375px, so the
overflow propagates all the way to `<html>` (measured ~480-481px page width). Fix: `overflow-x:
auto` on `.tab-switcher` itself (contains its own overflow rather than bubbling it up) plus
`white-space: nowrap; flex-shrink: 0` on `.tab-button` (so labels truncate to a scrollable strip,
not wrap mid-word). Chose horizontal-scroll-within-nav over wrapping to a second row, per this
task's stated default — nav stays one row, gets its own internal scrollbar.

**Cause 2 — unwrapped `.time-series-table` instances.** There are six call sites
(`BossMovesetSweep.tsx`, `DamageOverTimeTable.tsx`, `IvPerLevelTable.tsx`, `IvSweepReport.tsx`,
`SpeciesReportView.tsx`, `TeamRaidBreakdownTable.tsx`). **Four already had a `<div style={{
overflowX: "auto" }}>` wrapper** (a pattern that predates this fix, itself copied from
`BreakpointSheet.tsx`'s `.breakpoint-table` handling) — only `SpeciesReportView.tsx` (its boss
list table, ~line 527) and `TeamRaidBreakdownTable.tsx` (its own top-level return, no wrapper at
all) were missing it. `TeamRaidBreakdownTable` is the one that actually produced the reported
639px overflow, since its content (~600px, 7 unpadded columns) sits directly under `.panel` with
nothing to contain it. Fix for both: wrap the `<table>` in a plain `<div style={{ overflowX:
"auto" }}>` — matched the existing inline-style idiom already used by the other four rather than
inventing a shared CSS class, since 4-of-6 already used it. If a **seventh** `.time-series-table`
call site is ever added, wrap it the same way immediately — don't assume the shared CSS class
handles it, since `.time-series-table` itself has no `overflow-x` (it's each call site's own
wrapper div, not the class, that scopes the scroll container).

**Why NOT `overflow-x: auto` on `.panel` directly (considered and rejected, per this task's own
explicit instruction)**: setting one axis to `auto` forces the other from `visible` to `auto` per
the CSS overflow spec, which risks clipping the species-picker dropdown/badges/tooltips that rely
on `overflow: visible` bleeding outside `.panel`'s box. A dedicated wrapper div around just the
table is the safe, scoped fix — exactly why `BreakpointSheet.tsx` used this idiom in the first
place rather than styling `.breakpoint-sheet` itself.

**Verification**: NO browser tool available this session (function list was Read/Write/Edit/
Bash/Grep/Glob only — confirmed again per [[verification-without-browser-tool]], still true as of
2026-09-07). Could NOT obtain live `document.documentElement.scrollWidth` numbers as the task
requested — said so plainly rather than fabricating a number. Did the full non-browser ladder
instead: `npx tsc --noEmit` clean, `npm run build --workspace=packages/web` clean (only the
pre-existing >500kB chunk warning), `vite preview` served + curled root/JS/CSS for 200s, `node
--check`ed the built JS, and grepped the *compiled* CSS bundle directly for the shipped rule
(`.tab-switcher{...overflow-x:auto...}`, `.tab-button{...white-space:nowrap;flex-shrink:0...}`) to
confirm the fix actually reached the production bundle, not just the source file. This is real but
weaker evidence than an actual rendered `scrollWidth` check — flag this gap explicitly to whichever
agent/user reviews next if a hard numeric confirmation is later required (`skeptic` also has no
browser tool per its own memory, so a genuine DOM-level check needs a session with one actually
granted).
