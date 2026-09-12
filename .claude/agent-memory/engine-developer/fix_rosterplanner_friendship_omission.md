---
name: fix-rosterplanner-friendship-omission
description: rosterPlanner.ts/rosterMoveChange.ts had NO friendshipLevel field at all (a larger gap than powerUp.ts's two silently-dropped call sites); closed 2026-09-12
metadata:
  type: project
---

2026-09-12: closed the gap explicitly flagged (not fixed) in
[[fix_powerup_ladder_friendship_omission]] — `rosterPlanner.ts` and
`rosterMoveChange.ts` didn't extend `TeamRaidInputs`/have a `friendshipLevel`
field AT ALL, unlike `powerUp.ts` (which had the field but two call sites
ignored it). This is why the web layer shipped the friendship control
disabled in multi-raid mode with a hint (`efecef3`) — this fix removes the
reason for that hint (web wiring itself is a separate, follow-up task, not
done here).

**What changed (engine only, `packages/engine/src`):**

1. `RosterPlannerInputs.friendshipLevel?: FriendshipLevel` (defaults `"none"`)
   — `RosterBudgetInputs` inherits it automatically since it's
   `Omit<RosterPlannerInputs, ...>`. Threaded through: `SharedAssumptions`
   (both `runRosterPlanner`/`planRosterBudget` build one), `screenScoreFor`'s
   `runSustainedComparison` call, `runFullRosterCached`'s `runTeamRaid` call,
   and `entryBossMetricsInputs`'s two OUTGOING modifier objects (the
   dominated-level-search ladder shape — the exact pattern that bit
   `powerUp.ts` last time).
2. `RosterMoveChangeInputs.friendshipLevel?: FriendshipLevel` (new field,
   this module had none before at all) — threaded via `SharedTeamRaidAssumptions`
   into both `moveChangeBase` (FIELDED path; `tmMove.ts`'s
   `MoveChangeEvaluationInputs extends TeamRaidInputs`, so it needed ZERO
   changes there — just needed the field to actually reach it) and
   `teamRaidBase` (BENCHED path's own real paired `runTeamRaid` calls), plus
   `benchedProxyDamagePerSecond`'s two OUTGOING modifiers (the cheap
   pre-filter screen).
3. Exported two previously-private functions PURELY for direct test access
   (no other new caller): `rosterPlanner.ts`'s `entryBossMetricsInputs` and
   `rosterMoveChange.ts`'s `benchedProxyDamagePerSecond`. Precedent: this
   mirrors why `toSlotInput`/`resolveCandyFamilyId` were already exported,
   just for testability instead of cross-file reuse this time.

**Attacker-only invariant (verified, not just asserted):** friendshipLevel
never reaches an incoming/boss-side modifier object in either file — checked
by code review (only 2 outgoing-modifier object literals per file were
touched) AND by a direct test in `rosterPlanner.test.ts` calling the REAL
`entryBossMetricsInputs` + `powerUpLevelMetrics` (STRONG_SPECIES[0] vs
BOSS_ONE, level 20): outgoing fast/charged move with friendship (6→7, 40→44
at none→forever), incoming/survival counts byte-identical (16, 106, 8, 2
both). Note `benchedProxyDamagePerSecond`'s return type structurally CANNOT
be affected by an incoming-modifier bug (it only ever reads
`metrics.outgoing*Damage`, never incoming/survival) — no dedicated invariant
test was added for it for that reason; a test there would be vacuous.

**The ladder-vs-simulation agreement property (the thing that broke last
time), reproduced and verified end to end:** built a real fixture —
STRONG_SPECIES[0] (baseAttack 220/baseDefense 120/baseStamina 180) vs
BOSS_ONE (baseAttack 200/baseDefense 150, `statsArePrecomputed`) — where
level 25.5 → 26 is a genuine no-op at friendshipLevel "none" (ALL of
outgoing fast/charged, incoming fast/charged, AND both survival-hit counts
identical) but a real charged-move breakpoint (46→47) at "good". Verified via
a throwaway tsx script against the real `calculateDamage`/
`effectiveStatsAtLevel`, then pinned as a test calling `entryBossMetricsInputs`
+ `usefulPowerUpLevelsAbove` directly: `usefulPowerUpLevelsAbove` returns
`[]` at "none", `[26]` at "good". Reproduced the SAME fixture end-to-end
through `planRosterBudget` itself (single-entry pool, `maxLevel: 26`): at
"none" the search never sees ANY useful level and stops immediately with
`stopReason: "max-level-reached"`; at "good" it DOES see the level-26
candidate, evaluates it for real, and stops with `"no-significant-candidate"`
instead (the single half-level jump on a solo entry is real but too small to
clear the noise floor — this fixture proves the search REACHED the candidate,
not that it got committed; commitment is already covered by this test file's
pre-existing "a multi-level jump is committed" block on a different fixture).

**A wrong assumption caught by actually running the test (not asserted from
memory):** first wrote the BENCHED move-change test in `rosterMoveChange.test.ts`
expecting `deltaTeamDps` to INCREASE with friendship — it moved but decreased
in the real run (0.623 → 0.572). Root cause: friendship boosts the DISPLACED
FIELDED slot's own outgoing damage too, not just the candidate's, so the
delta (candidate − baseline) can move either direction depending on the two
slots' relative moveset gains. Fixed the assertion to `.not.toBe` (matching
the wiring claim actually being tested) rather than assuming monotonicity —
same "verify before asserting" discipline as every other engine fixture in
this project.

**Deliberately NOT done (out of scope per the task):** no `Scenario` field,
no UI. Verified (not assumed) that `rosterPlanner.worker.ts` needs NO
message-shape change: its `run`/`plan`/`moveChange` request types each
declare `inputs: RosterPlannerInputs`/`RosterBudgetInputs`/
`RosterMoveChangeInputs` directly (checked the actual `interface` fields in
the file) rather than hand-enumerating individual fields, so
`friendshipLevel` is already structurally present the moment a caller sets
it. The real remaining seam for whoever wires the web control is entirely on
the CALLER side (`rosterPlannerWorkerClient.ts`/the Power-Up Optimizer's
multi-raid assumptions panel) — building the resolved `inputs` object with
`friendshipLevel` set and removing the "disabled in multi-raid mode" hint
from `efecef3`.
