---
name: finding-friendship-bonus-only-two-of-seven-tabs
description: The real raid/gym friendship attack bonus (damage.ts's friendshipLevel, already wired into the shared calculateDamage primitive) reaches only the Comparator and Team Raid tabs; Species Report, IV Breakpoints, Attack/Defense Breakpoints and the Power-Up Optimizer silently default to "none" with no on-screen disclosure — and even a partial fix has a trap
metadata:
  type: project
---

UI pass, 2026-09-11. Verified by grep across `packages/engine/src` for `friendshipLevel`: present
only in `comparison.ts`, `teamRaid.ts`, `megaLevel.ts` (unrelated), `damage.ts` (the shared
primitive). Absent from `speciesReport.ts`, `breakpoints.ts`, `powerUp.ts`. Web-side:
`FriendshipSelect` is imported only by `AssumptionPanel.tsx`/`ComparatorView.tsx` and
`TeamAssumptionPanel.tsx`/`TeamRaidView.tsx` — zero hits in `SpeciesReportView.tsx`,
`IvBreakpointsView.tsx`, `AttackDefenseBreakpointsView.tsx`, `PowerUpOptimizerView.tsx` or
`PowerUpOptimizerAssumptionPanel.tsx`. None of the four affected tabs' "Known caveats" sections
mention the omission.

**Why this is more than a missing checkbox**: `calculateDamage` (`damage.ts`) already takes
`friendshipLevel?: FriendshipLevel` as a plain optional field defaulting to `"none"`, applied
identically to `weatherBoosted` — and `weatherBoosted` DOES reach all six simulating tabs. Adding
friendship to the other four is the same wiring pattern already used for weather, not new design.
Confirmed cheap at the type level too: `PowerUpOptimizerInputs extends Omit<TeamRaidInputs, ...>`
already inherits `friendshipLevel` structurally (so `runTeamRaid`-based simulation inside
`optimizePowerUps`/`planPowerUpBudget` would already honor it if a caller ever set it) —
`packages/web/src/run/runPowerUpOptimizer.ts` just never sets it. `SpeciesReportInputs` needs one
new optional field mirroring its existing `weather?: WeatherCondition` (line ~134) and one added
line at the `runSustainedComparison({...})` call site (`speciesReport.ts:204-225`, which already
passes `weather: inputs.weather` right there). `breakpoints.ts` calls `calculateDamage` directly at
3 call sites (lines ~82, ~140, ~340), none passing `friendshipLevel`.

**Why this matters especially here, not just generically**: three of the four gapped tabs
(`breakpoints.ts`-backed IV Breakpoints, Attack/Defense Breakpoints, and the Power-Up Optimizer's
"cost to next floored breakpoint" ladder) exist ENTIRELY to report exact `floor(...)` breakpoints.
Friendship is a real multiplicative factor on the attacker's own damage (up to 1.12x, Forever
Friend) that can move which level/IV combination crosses a floor — omitting it isn't just an
"approximately right, ignore small effects" gap, it can flip the exact headline these tabs exist to
report, for any player fighting alongside a friend (the common case in an organized raid).

**The trap for whoever fixes this**: `powerUp.ts`'s `powerUpDamageLadder` call site
(`powerUp.ts:1005-1028`) independently recomputes fast/charged damage via `calculateDamage` for the
"per-slot damage ladder" display, passing `stab`/`typeEffectiveness`/`megaBoostMultiplier`/
`weatherBoosted` but NOT `friendshipLevel` — this is a SEPARATE code path from the actual simulated
fight (`runTeamRaid`). The tab's own shipped caveat text
(`PowerUpOptimizerView.tsx:2519-2524`) explicitly promises "its breakpoints agree with the Δ team
DPS numbers in the ranked table below, which come from a full re-simulation" for Mega Level — a
promise that was deliberately built out (see `powerUp.ts`'s own CHANGELOG comment on
`megaLevel`, 2026-09-09, added specifically to close this exact kind of ladder-vs-simulation
disagreement). A future fix that wires `friendshipLevel` into the Power-Up Optimizer's
`Assumptions`/`Scenario`/simulation but forgets this ladder call site would silently make that
promise false for any friendship-enabled scenario — the same failure shape the Mega Level fix was
built to prevent, recurring for a different field.

**Standing-decision flag**: fixing this adds a new user-facing setting to four tabs that don't have
one today (`SpeciesReportScenario`, IV Breakpoints' scenario, Attack/Defense Breakpoints' scenario,
`PowerUpOptimizerAssumptions`) — each needs its own round-trip through that tab's `Scenario`
codec and `check-scenario-roundtrip` coverage per the `add-scenario-assumption` skill. Not a
combat-phase/multi-trainer conflict, just naming the new-input consequence explicitly as instructed.

Reported to overseer 2026-09-11. Not in `IDEAS.md`/`REJECTED_IDEAS.md`/`HANDOFF.md` under this
framing — `HANDOFF.md`'s 2026-09-11 entry says friendship/Best Buddy/`bossMaxHpOverride` were
"fully wired 2026-09-10," which was accurate for the specific "not reachable from the UI at all"
list that session was closing (Comparator + Team Raid), but reads as broader than it is if taken to
mean all seven tabs — it doesn't, and this finding is the gap that claim leaves open.
