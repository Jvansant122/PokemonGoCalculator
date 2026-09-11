---
name: fix-roster-budget-vacuous-truth-no-eligible-entries
description: planRosterBudget's stopReason mislabelled a totally-excluded pool as max-level-reached ([].every() vacuous truth); new PowerUpBudgetStopReason "no-eligible-entries" fixes it; single-raid planPowerUpBudget confirmed NOT exposed
metadata:
  type: project
---

**Bug (2026-09-11, reported by a live-app audit, traced by the requester before handing off).**
`rosterPlanner.ts`'s `planRosterBudget` built `eligiblePool` by excluding any entry whose candy
family couldn't be resolved or whose candy-on-hand was unknown (or that was evolution-blocked).
The round loop then did `[...perEntryUseful.values()].every((levels) => levels.length === 0)` to
decide `stopReason = "max-level-reached"`. If EVERY entry was excluded, `perEntryUseful` was an
empty `Map`, and `[].every(...)` is vacuously `true` in JS — so a totally-excluded pool (e.g. every
entry's candy family unknown) silently reported `"max-level-reached"` ("you're already optimal")
instead of the true state ("this never evaluated at all").

**Fix.** Added a new `PowerUpBudgetStopReason` variant, `"no-eligible-entries"`
(`packages/engine/src/powerUp.ts`), and a guard in `rosterPlanner.ts`'s round loop — checked
BEFORE the vacuous `.every(...)`, using `eligiblePool.length === 0` (eligiblePool is built once,
above the loop, and never mutates across rounds, so checking it every round is harmless but only
ever fires on round 0). `max-level-reached` now only ever fires over a genuinely non-empty,
evaluated pool.

**Confirmed `powerUp.ts`'s structurally identical `perSlotUseful.every(...)` (single-raid
`planPowerUpBudget`, ~line 2019) is NOT exposed to the same bug** — not because `slots` is a
"fixed 6-slot array" (the type doesn't actually enforce that; `PowerUpSlotInput[]` is
caller-supplied), but because `runFullRoster(currentLevels)` (called for the `baseline` BEFORE the
round loop ever starts) routes through `runTeamRaid` -> `validateRoster`, which throws if
`slots.every((s) => s.species == null)` — including the `slots.length === 0` case (vacuously true
there too, so it throws). So by the time the round loop runs, at least one slot is guaranteed
fielded; `usefulLevelsForSlot` returns `[]` for a genuinely-empty individual slot (`!slot.species`)
via `.map`, not `.filter`, so `perSlotUseful` always has the same length as `slots` and an
all-empty result there is always a TRUE fact (every fielded slot really is at max level), never a
"filtered out before evaluation" artifact. Documented this asymmetry directly in the new variant's
doc comment so a future reader doesn't have to re-derive it.

**Left `packages/web` broken on purpose, as instructed.**
`PowerUpOptimizerView.tsx`'s `budgetStopReasonSentence` (~line 493) is an exhaustive `switch`
with no `default` over `PowerUpBudgetStopReason` — adding the new member breaks
`npx tsc --noEmit -p packages/web/tsconfig.json` at exactly that line
(`TS2366: Function lacks ending return statement`), confirmed by actually running it, not assumed.
The exact variant name a follow-up web pass needs to add a `case` for: `"no-eligible-entries"`.

**Tests.** `packages/engine/test/rosterBudget.test.ts`, new describe block "planRosterBudget —
stopReason: no-eligible-entries vs. max-level-reached (vacuous-truth regression)": one test with a
pool that's entirely excluded (empty `candyByFamilyId`) at non-max levels — pins
`stopReason === "no-eligible-entries"` and explicitly asserts it's NOT `"max-level-reached"`; one
test with a genuinely non-empty, fully-eligible, fully-maxed pool — pins `stopReason ===
"max-level-reached"` still fires (the fix can't regress into swallowing the real case). Full
suite: 622 passed (up from 620) after the fix, `npm run test:engine`.

See [Roster Planner Phase 4 — planRosterBudget](feature_roster_planner_phase4_budget.md) and
[planPowerUpBudget stale noise floor fix](fix_powerup_budget_stale_noise_floor.md) for the
surrounding stop-reason/noise-floor machinery this bug lived inside.
