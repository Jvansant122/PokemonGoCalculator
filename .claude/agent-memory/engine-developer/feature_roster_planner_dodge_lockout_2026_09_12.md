---
name: feature-roster-planner-dodge-lockout-2026-09-12
description: RosterPerBossImpact.dodgeFastAttacksLockout + lockedBossCount aggregate on RosterPlanResult/RosterBudgetPlan — closes the multi-raid gap single-raid powerUp.ts already had
metadata:
  type: project
---

**What shipped (2026-09-12):** `rosterPlanner.ts` gained a per-boss,
config-level fact — `RosterPerBossImpact.dodgeFastAttacksLockout` — true when
`dodgeFastAttacks` is on AND that boss's own resolved fast move meets
`breakpoints.ts`'s `fastMoveCadenceTooFastToDodge` (duration <=
`DODGE_COST_SECONDS`, 0.5s). Single-raid `powerUp.ts` already surfaced this
(shipped `83c9255`); multi-raid mode (`runRosterPlanner`/`planRosterBudget`)
could not, because `RosterPerBossImpact` carried no equivalent field — so it
could render "no further power-up clears the noise floor" as a real
conclusion even when nothing could deal fast-move damage against the
relevant boss(es) in the first place.

**Implementation shape:**
- New pure helper `bossDodgeFastAttacksLockout(target, dodgeFastAttacks)` —
  resolves the boss's fast move via the ALREADY-imported `resolveMove`
  (comparison.ts) and calls `fastMoveCadenceTooFastToDodge`. Computed ONCE
  per `targets` array (alongside `bossHpByTarget`) in both
  `runRosterPlanner` and `planRosterBudget`, never per-candidate — it's a
  pure function of (this boss, the roster-wide setting), so every
  `RosterPerBossImpact` naming a given boss across every candidate row
  carries the identical value.
- Threaded into all 4 `RosterPerBossImpact` construction sites: 2 in
  `runRosterPlanner` (the `hypotheticalCatches` loop, `simulateDraft`), 2 in
  `planRosterBudget`'s `evaluateCandidate`. `RosterBudgetStep.perBoss` and
  `RosterHypotheticalCatchImpact.perBoss` picked it up for free (both just
  reuse `RosterPerBossImpact`/`evalResult.perBoss`).
- Aggregate: `lockedBossCount: number` added directly to `RosterPlanResult`
  and `RosterBudgetPlan` (not derived by the caller by filtering every
  candidate's `perBoss`) — a plain count of `targets` that are locked.
  Deliberately did NOT add a boolean or an "all locked" verdict field: the
  task's design note explicitly said not to encode UI policy (suppress vs.
  qualify a "plan is done" conclusion) into the engine result — that's a
  display decision for the caller. `0` / `targets.length` / anything between
  are all the caller needs to derive its own policy.
- `RosterBaselineBossSummary` was deliberately left untouched (no redundant
  per-boss lockout field there) — the task only asked for `RosterPerBossImpact`,
  and duplicating the same fact on a second per-boss type would just be a
  second place to keep in sync.

**Real ripple found:** `rosterBudget.test.ts` has a synthetic
`RosterPerBossImpact` literal builder (`perBossImpact`, in the
`candidateClearsBudgetFloor` significance-gate algebra describe block) that
constructs the type by hand for a deterministic probe unrelated to dodge
mechanics — needed the new required field added (`false`, since that
describe block never sets `dodgeFastAttacks`). This is the ONLY other
`RosterPerBossImpact` literal construction site outside `rosterPlanner.ts`
itself — grepped for it explicitly before calling the change done.

**Test fixture note:** `data/normalized/species.json` has no 0.6s fast move
at all (real durations are 500ms-aligned), so the exact-boundary case
(duration === `DODGE_COST_SECONDS` === 0.5s, `<=` not `<`) has no real
synced species to pin against. Added `HALF_SECOND_FAST_MOVE`/
`BOSS_HALF_SECOND_FAST_MOVE` to `test/fixtures/rosterPlannerFixtures.ts`
(reuses `BOSS_ONE`'s stats, just swaps the fast move) rather than only
inline in the new test file, since a future test in this area will likely
want the same boundary case.

**Verification:** `npm run test:engine` (628 tests, 36 files, all pass —
8 new in `rosterPlannerDodgeLockout.test.ts`), `npm run typecheck`,
`npm run lint`, `npm run verify` (full gate including scripts suite,
scenario-roundtrip check, mega-gates check, docs-drift check, production web
build) — all green. No `packages/web` files touched (task scope was
engine-only; UI wiring left for `web-developer`).

See [Roster significance mode](feature_roster_significance_mode.md) and
[Dodge-fast-attacks lockout investigation](investigation_dodge_fast_attacks_lockout.md)
for the sibling single-raid/simulate.ts history this closes the gap against.
