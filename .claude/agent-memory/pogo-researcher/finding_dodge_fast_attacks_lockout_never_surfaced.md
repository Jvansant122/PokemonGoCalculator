---
name: finding-dodge-fast-attacks-lockout-never-surfaced
description: MECHANICS.md documents a built-and-tested dodgeFastAttacksLockout diagnostic (engine, 2026-09-10) explicitly meant for a live UI warning; zero web files ever read it — a real, misleading 0-damage result ships with no on-screen explanation
metadata:
  type: project
---

UI pass, 2026-09-11. Grepped `packages/web/src` for `lockout`/`Lockout`/`dodgeFastAttacksLockout`/
`fastMoveCadenceTooFastToDodge` — **zero matches anywhere**, across every `.tsx`/`.ts` file.

**The mechanic**: MECHANICS.md's "A boss fast move at ≤0.5s cannot be fast-dodged at all" entry
(2026-09-10) is a confirmed, tested engine finding — with `dodgeFastAttacks` on, a boss whose own
fast move recycles at ≤0.5s (`DODGE_COST_SECONDS`) produces **provable, permanent zero** total
fast-move damage and zero landed charged attacks (empirically verified against real Mega Tyranitar
+ real Bite at exactly 500ms). Not a bug — correct arithmetic, a real livelock.

**The gap**: the engine built exactly the surfacing mechanism MECHANICS.md's own text calls for —
`fastMoveCadenceTooFastToDodge(fastMoveDurationSeconds)` in `packages/engine/src/breakpoints.ts:279`
("a pure predicate... usable for a live warning on the toggle itself, with no simulation run") and
`dodgeFastAttacksLockout: boolean` on `StepwiseRunResult`/`DistributionSummary`/
`SustainedCandidateResult` (`simulate.ts:605`) and `TeamRaidSlotResult` (`teamRaid.ts:471`) — but
**no web file ever imports or reads either**. A player toggling "dodge fast attacks" against a boss
whose fast move is ≤0.5s gets a flat 0 DPS / 0 damage on the Comparator, Species Report, or Team
Raid, indistinguishable on screen from "this candidate is just bad here."

Reaches all three simulating tabs for free via existing spreads (per the engine field's own doc
comment) — this is display-only, no new engine work, no new Scenario field (it's a computed fact
of an existing config, not a new input).

Reported to overseer 2026-09-11 as priority-1 (a wrong-reading number, not just a silent gap).
Not proposing the exact wording — that's `web-developer`'s call — but the fix is cheap: read the
already-exported boolean/predicate and render an inline warning near the "dodge fast attacks"
toggle and/or the result card when true.
