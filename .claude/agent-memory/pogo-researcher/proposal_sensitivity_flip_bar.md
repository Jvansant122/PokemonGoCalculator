---
name: proposal-sensitivity-flip-bar
description: Proposed web UI feature — a small horizontal number-line/bar per SensitivityView row showing current value vs. flip point visually, not just as sorted prose; status as of 2026-09-05 is proposed, not yet routed/built
metadata:
  type: project
---

Proposed 2026-09-05 (third ideation pass, first UI-focused pass, by this agent). Not yet built,
rejected, or routed — status: **proposed, pending overseer decision**.

**What it would show:** `SensitivityView.tsx` currently renders each of `computeSensitivity`'s 7
checks (party size, matching teammates, mega boost multiplier, dodge accuracy, level, teammate
DPS, boss cadence — all confirmed live in `sensitivity.ts` as of this pass) as one text row: a
label, the current value, and a `distanceLabel` string like "flips at ~62.3 DPS." The information
that actually matters — how close the current setting sits to the flip, visually, relative to the
range that was scanned — only exists as a sorted-by-distance list order; a reader has to parse 7
different units (DPS, seconds, %, levels, a raw multiplier) to build a mental sense of "which of
these are we standing right at the edge of." Proposed: a small inline horizontal bar per row (no
new charting library — same hand-rolled-SVG convention as `DamageOverTimeChart.tsx`) showing the
scanned range, a marker at the current value, and a marker at the flip point (when one was found),
so the *gap* between them reads as a visual distance instead of two numbers in different units the
reader must mentally subtract.

**Why it sharpens the thesis:** the sensitivity panel's whole reason to exist is "the ranking flip
is the headline, not a winner" applied per-assumption — but today it's the only part of the UI that
states a flip point in prose only, with no visual echo of the pattern the chart already established
(a marked crossing point on an axis). This makes the panel consistent with the chart's own visual
language, and turns "which assumption is this conclusion most fragile to" into a one-glance scan
instead of a read of 7 sentences.

**Standing-decision check:** presentation-only change, confined to `packages/web` — no new
`Scenario` field, no new user-facing setting to round-trip. Would require `SensitivityCheck`
(`sensitivity.ts`) to carry a few more numeric fields (scanned min/max, current value, flip value)
instead of just the pre-formatted strings it exposes today, but that's an internal shape change
within the web package, not an engine or Scenario change. One check in this list — "Mega boost
multiplier" — scans down toward the load-bearing 1.3/1.1 constant; a bar visualization only
*displays* that existing scan's result more visibly, it does not add any new way to vary 1.3 as a
casual tuning knob, and this proposal doesn't touch that constant's status. Not the ruled-out
Teambuilding Analyzer. Doesn't reintroduce a user-selectable combat phase.
