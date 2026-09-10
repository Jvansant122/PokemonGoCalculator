---
name: proposal-team-raid-moveset-sweep
description: proposed 2026-09-10 (ideation pass) — extend the already-built boss-charged-move sweep (compareAcrossBossChargedMoves, Comparator-only) to the Team Raid Simulator, since it currently resolves to exactly one fixed boss charged move
metadata:
  type: project
---

Status: proposed 2026-09-10. Not built. Confirmed via grep + code read (2026-09-10):
`compareAcrossBossChargedMoves` is used only by `runComparator.ts` /
`BossMovesetSweep.tsx`. `runTeamRaid.ts` (line 98) and `runPowerUpOptimizer.ts` (line
87) both resolve to a single `bossChargedMoveId`
(`bossSpecies.chargedMoves.find(...) ?? chargedMoves[0]`), no sweep. This is a genuine
scope gap, not a duplicate of [[proposal-boss-moveset-variant-comparison]] — that
proposal's own text says it was "wired into App.tsx/BossMovesetSweep.tsx", i.e.
Comparator-scoped only; it never claimed Team Raid or Power-Up Optimizer coverage.

**The mechanic**: MECHANICS.md "boss charged-move selection + moveset fixed-per-
rotation" — a boss's charged move is fixed for one raid's lifetime/rotation, but
different rotations of nominally "the same" boss have used different charged moves.
`[community-consensus]`, Bulbapedia-corroborated.

**What it would show:** Team Raid Simulator is the highest-stakes tab (real HP pool,
countdown timer, wipe-and-revive looping) — a "does my roster clear this boss" answer
that is silently conditional on which of the boss's known charged moves it happens to
roll is exactly the kind of hidden conditional conclusion this tool exists to surface
elsewhere. Extending the sweep here would let a result read "clears in 3 revives against
Move A, needs 5 against Move B" instead of one number that may not generalize.

**Roughly what it would take:** mostly web-only. `compareAcrossBossChargedMoves`
already exists at the engine layer; the work is looping `runTeamRaid.ts` over the
boss's known charged moves (as `runComparator.ts` already does) plus a presentation
adapted to Team Raid's wipe/revive result shape — NOT a copy of `BossMovesetSweep.tsx`,
whose shape assumes the Comparator's paired result cards. No new `Scenario` field: this
is a computed display sweep over an already-known list, same as the Comparator's
version.

**Worth it:** yes for Team Raid Simulator specifically. Weaker case for the multi-raid
Power-Up Optimizer sweep — that computation is already ~13 bosses x 200 sims per run
(per prior research); multiplying by boss-moveset-count on top is a real cost increase
for a comparatively smaller payoff, since the optimizer already reports per-boss AND
aggregate significance. Scope to Team Raid Simulator only; treat the optimizer as a
"maybe later" if Team Raid's version proves valuable.
