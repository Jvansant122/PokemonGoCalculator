---
name: feature-default-perfect-dodge-and-candidate-override
description: Changed DEFAULT_ASSUMPTIONS.dodge to Perfect on all 5 dodge-having tabs, wired the Comparator's new per-candidate dodge override UI onto an already-shipped engine field, and found a real pre-existing engine bug (fast-attack-dodge lockout) while sanity-checking direction
metadata:
  type: project
---

User request: "Can you make dodge charged attacks auto check yes but also can change by pokemon" —
confirmed as "Perfect" default on every tab with a dodge control (Comparator, Team Raid, Species
Report, IV Breakpoints, Power-Up Optimizer — Attack/Defense Breakpoints deliberately has no dodge
model at all and was left alone), plus a per-candidate override on the Comparator only.

**Per-candidate override**: the engine side (`Scenario.candidateDodge`/`candidateDodgeFastAttacks`,
`SustainedComparisonInputs.candidateDodge`/`candidateDodgeFastAttacks`) had already landed in
`packages/engine` in the same session by `engine-developer` before I started — my job was purely
the UI/`add-scenario-assumption` checklist: `Assumptions` fields in `AssumptionPanel.tsx`,
`DEFAULT_ASSUMPTIONS`/round-trip in `ComparatorView.tsx`, a new `CandidateDodgeOverride` component
(one instance per candidate, rendered right after that candidate's Shadow checkbox) with an
explicit "Same as shared setting" option mapping to `null` — never silently defaulting to a real
choice — and threading both fields into `runComparator.ts`'s TWO `runSustainedComparison`-shaped
calls (the main one AND the `compareAcrossBossChargedMoves` boss-moveset-sweep one — easy to miss
the second). Also threaded into `sensitivity.ts`'s internal `runSustained()` helper so the
sensitivity panel's "current winner" baseline doesn't silently ignore an active per-candidate
override — a real, if narrow, correctness gap: without this, setting a per-candidate override
would visibly change the main result cards but leave the sensitivity panel computed on the
now-wrong assumptions. Documented (not fixed, since it's a legitimate scope cut) that sensitivity
check #4 ("Dodge accuracy") only scans the *shared* dodge fraction and is inert for an overridden
candidate.

**A pre-existing engine bug found while sanity-checking the default-flip's direction** (the brief
asked me to confirm "dodging should generally raise survival/damage," not just trust it): dodging
the boss's FAST attacks (`dodgeFastAttacks: true`, the existing shared boolean — NOT anything I
added) against a boss whose fast move duration is exactly `DODGE_COST_SECONDS` (0.5s — e.g. Mega
Latios's Dragon Breath) causes the attacker's own fast move to NEVER fire, ever, for the rest of
the simulated window (confirmed via a scratch `runSustainedComparison` call: Kartana survived
42.5s but dealt exactly 0 total damage, all three of `meanChargedDamage`/`meanFastMoveDamage`/
`meanTotalDamage` zero, entire `ownDamageTrajectory` is `[{0,0},{42.5,0}]`). Root cause (read
`simulate.ts` lines ~635-668, did not edit): every dodge ATTEMPT (hit or miss) adds
`DODGE_COST_SECONDS` to `nextAttackerFastMoveAt`; when the boss's fast-move cadence is `<=
DODGE_COST_SECONDS`, that delay accumulates at least as fast as real time advances, so the gap
between `roundedT` and `nextAttackerFastMoveAt` never shrinks — a genuine runaway-delay lockout,
not a `dodge`-kind (charged) bug. I confirmed the CHARGED dodge model itself (task 2a's actual
concern) is fine via the engine's own `sustainedComparison.test.ts`
("`candidateDodge`/`candidateDodgeFastAttacks` per-candidate override" describe block) — it has a
dedicated bulky-fixture test proving `{kind:"perfect"}` strictly increases survival vs `{kind:
"none"}`; my own real-species scratch probes kept coming back byte-identical between none/perfect
purely because my chosen species/boss pairs happened to die from fast-move chip damage (or survive
the whole window) before the boss's charged move ever mattered — a reminder that a real-species
scratch check needs a boss whose charged-move readiness lands well inside the candidate's survival
window to actually exercise the charged-dodge branch, not just "pick two arbitrary species."

**Not fixed** (packages/engine is out of scope for web-developer): flagged to engine-developer.
This was already reachable before my session via the pre-existing shared "Also dodge boss's fast
attacks?" dropdown + a 0.5s-fast-move boss (Mega Latios is real, common raid content) — my new
per-candidate override just adds a second easy path to the same pre-existing trap, it didn't
create the trap.

**Test-number movement** (task 2a): `dodge` default flip from `{kind:"none"}` to
`{kind:"perfect"}` moved zero pinned numeric expectations — `run.smoke.test.ts` and
`tabs.spec.ts`/`share-link.spec.ts` only assert finiteness/shape or compute expected values through
the same `run<Tab>Scenario` function the CLI/UI both call (no hardcoded literal numbers pinned to
the old default anywhere in `packages/web` or `scripts/`), so nothing needed hand-updating.
`sensitivity.test.ts`'s pinned check count (10) also survived unchanged (I added a new field to an
existing check's internal call, not a new check).

See also [[feature-weather-select-shared-icon-component]] and
[[feature-species-picker-primary-sizing]] for the same session's other two tasks.
