---
name: feature_roster_significance_mode
description: rosterPlanner.ts's RosterSignificanceMode ("aggregate-only"/"aggregate-or-per-boss") threaded through both RosterPlannerInputs and RosterBudgetInputs, governing exceedsNoise and candidateClearsBudgetFloor consistently; engine defaults to current behavior, web UI defaults to the new aggregate-only mode
metadata:
  type: project
---

Added `RosterSignificanceMode = "aggregate-only" | "aggregate-or-per-boss"` to
`packages/engine/src/rosterPlanner.ts` (2026-09-10), per an explicit user ask: rank the
Power-Up Optimizer's multi-raid roster table strictly on the cross-boss average by default, with
an opt-in to also admit single-boss specialists.

**Why:** ranking was ALREADY mean-based (`deltaPer1000Stardust`/sort order/etc. all derive from
`meanDeltaTeamDps`) — the only place "best boss" still decided anything was the significance
GATE (`exceedsNoise`/`candidateClearsBudgetFloor`), which has used `aggregate OR per-boss`
(`significantBossCount > 0`) since 2026-09-09 specifically to stop a benched Kyurem's real
+1.29-on-one-boss gain from reading as a diluted 0.11 average across 13 bosses (see
[[feature_roster_planner_phase2]]'s Defect 3a). The user wants that OR to become opt-in, not
removed.

## Shape

`significanceMode?: RosterSignificanceMode` on BOTH `RosterPlannerInputs` and
`RosterBudgetInputs` (the latter inherits it automatically via `extends Omit<RosterPlannerInputs,
...>` — no separate declaration needed). **Engine default is `"aggregate-or-per-boss"` (the
PRE-EXISTING behavior) in both `runRosterPlanner` and `planRosterBudget`'s destructuring** —
deliberately NOT the new UI default. Every existing caller/test that predates this field is
byte-for-byte unchanged (pinned via an explicit "omitting the field equals the explicit value"
test in both `rosterPlanner.test.ts` and `rosterBudget.test.ts`). `packages/web`'s Power-Up
Optimizer is expected to default ITS OWN control to `"aggregate-only"` — that split is
intentional and documented on the type itself, not a discrepancy to "fix."

## How the two gate sites stay consistent

- `RosterPowerUpCandidate.exceedsNoise` (in `runRosterPlanner`): `Math.abs(meanDeltaTeamDps) >
  noiseFloorTeamDps || (significanceMode === "aggregate-or-per-boss" && significantBossCount >
  0)`. Under `"aggregate-only"` the second disjunct is unreachable, so it reduces to the
  aggregate abs test alone.
- `candidateClearsBudgetFloor` (private helper in `planRosterBudget`, now exported BARE — no
  `index.ts` re-export, same "export for test reuse only" convention as `powerUp.ts`'s
  `summarizeResults`/`noiseFloorFor`): now takes `significanceMode` as a 4th param. Under
  `"aggregate-only"` it returns `false` immediately after the aggregate check fails, never
  consulting the per-boss branch.

**The invariant preserved, unchanged by this task:** `candidateClearsBudgetFloor` requires a
POSITIVE per-boss clearance (never triggers on "significantly HURTS one boss"), while
`exceedsNoise` is abs-based and DOES flag a harm-only candidate as significant (useful for a
read-only ranked row: "don't power this up, it hurts"). This positive-vs-abs distinction is
ORTHOGONAL to `significanceMode` — it applies identically in both modes. Verified via a
synthetic-`RosterBudgetCandidateEval` unit test (`[-5, 0.2]` per-boss deltas, mean below floor):
`candidateClearsBudgetFloor` returns `false` under BOTH modes.

`significantBossCount`/`bestBossDeltaTeamDps`/`bestBossId` are computed identically regardless of
mode in both functions — the mode only gates what counts as ADMITTED/qualifying, never what's
MEASURED or REPORTED. Confirmed via a test that runs the same diluted-candidate fixture under
both modes and asserts every other field on the candidate is byte-identical except `exceedsNoise`.

## Single-raid mode (powerUp.ts) — recommendation, NOT implemented

Checked per the task's explicit instruction: `optimizePowerUps`/`planPowerUpBudget` have only ONE
boss, so there is no aggregate-vs-per-boss ambiguity to gate on at all — `noiseFloorTeamDps` is a
single number, `deltaExceedsNoise`/the budget commit gate are both simple `deltaTeamDps >
noiseFloorTeamDps` tests with nothing to disambiguate. **Recommendation: no change needed there.**
The aggregate-vs-per-boss distinction is structurally a multi-raid-only concept (it's about
combining several bosses' deltas into one number), so `significanceMode` correctly has no
single-raid analogue.

## Testing technique that worked well: export a private gate function bare, for synthetic inputs

Rather than fighting real-simulation noise to engineer an exact "per-boss-only significant, not
aggregate-clearing" real scenario (attempted via throwaway scripts first — see below), exported
`candidateClearsBudgetFloor` and its input type `RosterBudgetCandidateEval` bare (no index.ts
re-export) so tests can construct exact synthetic `evalResult` shapes directly. This made the
positive-only-harm-exclusion and per-boss-only-admission tests deterministic and fast instead of
noise-dependent. Kept a SEPARATE real-data cross-check test (`runRosterPlanner`'s real candidate
`perBoss` arrays fed into the SAME exported `candidateClearsBudgetFloor` function) to confirm the
synthetic algebra matches what actually happens on a real simulated fixture — this is what
satisfied the task's "ranked table and budget plan must never disagree" requirement concretely;
it reused rosterPlanner.test.ts's existing Defect-3a fixture (`strongTeam(25)` + `weak-bench` at
level 1, two bosses weighted 1:3) which already reliably produces a real per-boss-only-significant
candidate.

**A real divergence in `planRosterBudget`'s COMMITTED steps between the two modes turned out to be
hard to construct by hand** — verified via throwaway script across several fixture attempts
(`strongTeam(35)` excluded via unknown candy, heavy 1:50 boss-weight skew, etc.): the greedy round
loop picks the highest-SCORING candidate among floor-clearers each round, and a per-boss-only
candidate (diluted mean) almost always scores worse than some other aggregate-clearing candidate
that ALSO exists at a different level, so it never actually wins the round regardless of which
mode is active — the mode only matters when the per-boss-only candidate is the genuinely best
option, a narrower real-world case than "some candidate exists that's per-boss-only." Rather than
force this (which would require a much more contrived fixture and risks being fragile/misleading),
the end-to-end `planRosterBudget` test asserts the two properties that ARE guaranteed by
construction: (1) `baselinePerBoss` is byte-identical across modes (the mode never touches the
unconditional do-nothing simulation), and (2) every step committed under `"aggregate-only"` has
`clearsAggregateFloor: true` (never relies on a per-boss-only signal). Do NOT assert monotonic
total resource spend between modes — it is NOT a guaranteed property of the greedy search (a
round's winner selection can diverge in either direction once a per-boss-only candidate is
excluded from one mode's candidate pool), it only happened to coincide (both spending
identically) in every fixture actually tried.

## Files touched

`packages/engine/src/rosterPlanner.ts` (new type + field + gate logic in both functions, two bare
exports), `packages/engine/test/rosterPlanner.test.ts` (new `RosterPlannerInputs.significanceMode`
describe block), `packages/engine/test/rosterBudget.test.ts` (new synthetic-eval describe block,
cross-check describe block, end-to-end describe block). `npm run verify` green afterward (437
engine tests, full web build, all checks).

## What web-developer needs

A new boolean-ish control (not yet built) defaulting to `"aggregate-only"` on the Power-Up
Optimizer's multi-raid mode, threaded into both `RosterPlannerInputs.significanceMode` (ranked
table) and `RosterBudgetInputs.significanceMode` (committed budget plan) — they must always be
set to the SAME value for one scenario, never independently, since the two views are meant to
never disagree about what counts as significant. This is a new `PowerUpOptimizerAssumptions`
field if/when it's wired through `Scenario` (per CLAUDE.md's round-trip standing decision) — not
built by this session, engine-only per the task's explicit scope.
