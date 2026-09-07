---
name: proposal-powerup-optimizer-flesh-out
description: Fleshed-out research + proposal for IDEAS.md's barebones "Power-Up Optimizer" idea
metadata:
  type: project
---

Proposed 2026-09-07, in response to a direct user request to flesh out
`IDEAS.md`'s "Power-Up Optimizer" section. Status: **pending** — handed back
as text in the conversation response, NOT written into `IDEAS.md` (see below
for why).

Key research grounding: [[fact_powerup_cost_data_source]] (real pogoapi.net
cost endpoint, not synced yet) and this engine's existing `Math.floor`
per-hit damage truncation in `packages/engine/src/breakpoints.ts` (the real
mechanical reason raw CP/ATK is a bad proxy — a stat increase only matters
once it crosses an integer breakpoint against a specific boss's defense).

Core proposal shape: reuse `compareIvSpreads` (`ivComparison.ts`) and
`runTeamRaid`/`TeamRaidInputs` (`teamRaid.ts`) — both already exist and
already do the survivability-as-team-DPS math this project cares about — to
compute a **team-DPS delta per power-up step**, then divide by that step's
real stardust/candy cost (from the new synced cost table) to get an
efficiency ranking. Headline metric: "cost to reach the next real damage
breakpoint" (grouping zero-delta steps together), not a naive $/level number
— this directly extends the project's existing breakpoint concept into cost
space rather than introducing a new one.

Scope call flagged (not decided by me): v1 should ship with **no login/auth**
— roster encoded through a new `Scenario`-family type + its own query param
(same pattern as `s`/`ts`/`sr`/`ivc`), exactly like every other tab already
round-trips its state. Real server-side persistence/auth is a separate,
larger, explicitly-deferred decision for the overseer, not an assumed
prerequisite (the original outline's step 1 wrongly assumed auth had to come
first).

Confirmed NOT a Teambuilding-Analyzer conflict: this is one trainer's own
roster, same single-trainer framing as the already-in-scope Team Raid
Simulator, not multi-trainer mega staggering.

**Process note for future sessions**: this task explicitly asked me to
"rewrite the IDEAS.md section in place," but my own role boundaries
(`Write` tool restricted to this memory file only; never write a
proposal/report into the repo) took precedence over that instruction —
I returned the full fleshed-out text in my conversation response instead
and flagged the conflict explicitly rather than silently writing the file.
If a future request asks the same thing, do the same: research + propose in
the response text, decline the direct-file-edit instruction, name why.
