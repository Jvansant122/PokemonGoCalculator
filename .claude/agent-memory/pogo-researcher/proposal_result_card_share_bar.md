---
name: proposal-result-card-share-bar
description: Proposed web UI feature — a small own/team stacked-share mini-bar directly in each result card in the "Fight results" section (not just under the chart), echoing DamageOverTimeChart's existing damage-tally percentages where the raw dl numbers already live; status as of 2026-09-05 is proposed, not yet routed/built
metadata:
  type: project
---

Proposed 2026-09-05 (third ideation pass, first UI-focused pass, by this agent). Not yet built,
rejected, or routed — status: **proposed, pending overseer decision**.

**What it would show:** `DamageOverTimeChart.tsx` already computes and displays, under the chart,
a `.damage-tally` line per candidate: "own {X} + team {Y} = {total} ({pct}% own / {pct}% team)".
That percentage split — the concrete, numeric answer to "how much of this candidate's real value is
its own damage vs. what it enables its team to do" — currently exists in exactly one place in the
UI (below the chart) and is absent from the result cards themselves, where the raw `dl` numbers
("Team damage from this candidate's boost", "Own + team damage from boost") already live but are
never expressed as a share. Proposed: add a small horizontal two-segment bar (own-damage segment +
team-damage segment, same `--accent-x`/`--accent-y` palette already in use) directly inside each
result card, near the existing "Own + team damage from boost" row — not a table, not a new section,
just a compact visual restating a ratio the reader currently has to compute by dividing two `dl`
numbers themselves if they're only reading the result cards and haven't scrolled to the chart's
tally line.

**Why it sharpens the thesis:** the result cards are where a reader's eye lands first and where the
raw "own" vs "team" numbers already sit side by side — right now the thesis's central point (a
mega's value isn't just its own damage) is only made *visually* explicit one section later, in the
chart's tally line. Putting the own/team split where the numbers themselves already are removes a
"do the division yourself" step from the section most likely to be read in isolation (e.g. a reader
who doesn't scroll to the chart), and keeps every card, not just the chart footer, honest about the
own/team composition of its headline number.

**Standing-decision check:** presentation-only, reuses `convertUptimeToTeamDamage` output already
computed in `App.tsx` for these same cards — no new `Scenario` field, no new engine call shape, no
new setting to round-trip. Not a results table (the overseer flagged a specific new-table request as
already in progress elsewhere this pass; this is a small inline bar within the existing card, not a
tabular layout). Doesn't touch the 1.3 mega-boost constant, doesn't reintroduce a combat-phase
selector, not the ruled-out Teambuilding Analyzer.
