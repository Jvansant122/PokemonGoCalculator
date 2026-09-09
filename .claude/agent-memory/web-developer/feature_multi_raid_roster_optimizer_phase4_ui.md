---
name: feature-multi-raid-roster-optimizer-phase4-ui
description: Web half of Phase 4 (fixed-budget plan) of PLAN_multi_raid_roster_optimizer.md — worker's second request type, MultiRaidBudgetPlanSection, both engine calls sharing one "Run sweep" click, CLI parity
metadata:
  type: project
---

Built 2026-09-09 on top of engine-developer's already-landed
`planRosterBudget`/`RosterBudgetInputs`/`RosterBudgetPlan` (Phases 0-4-engine,
uncommitted at session start). Pure web wiring — zero `packages/engine`
edits, confirmed via `git status --porcelain packages/engine` staying
untouched by me throughout.

**Both multi-raid engine calls now fire from ONE "Run sweep" click, as two
independently-tracked async operations, not two buttons.** Refactored
`handleRunMultiRaidSweep` to call `resolveRosterPlannerInputs` ONCE, then hand
the SAME resolution to two calls of a new shared generic helper
`runMultiRaidTrackedComputation<TData>(resolution, offMainThread, setIsRunning,
setElapsedMs, onFinish)` — one for `runRosterPlannerOffMainThread` (ranked
sweep), one for `runRosterBudgetOffMainThread` (budget plan). Each gets its
OWN `isRunning`/`elapsedMs`/result state (`multiRaidRun` vs
`multiRaidBudgetRun`) since the two calls finish at different wall-clock
times (budget plan is consistently slower — see timing below) — a single
shared "running" flag would have made the faster section's UI lie about
still being in flight. This is the ONLY way I found to satisfy both "one
click triggers both" and "each section shows its own honest progress."

**Worker extended to a second request type, not a second worker — exactly as
instructed, and it was mechanically easy.** `rosterPlanner.worker.ts` request
type went from a single `{type:"run"}` to a union
`{type:"run"}|{type:"plan"}`, response union gained `{type:"planResult"}`
alongside `{type:"result"}`/`{type:"error"}`; `onmessage` just branches on
`event.data.type` and calls `runRosterPlanner` or `planRosterBudget`. The
KEY enabler: `RosterBudgetInputs extends Omit<RosterPlannerInputs,
"maxCandidates"|"maxLevelsPerEntry">` with both omitted fields staying
optional means a plain `RosterPlannerInputs` value (built ONCE by
`resolveRosterPlannerInputs`) is passed to `planRosterBudget` with **zero
remapping or cast** — confirmed by removing an `as RosterBudgetInputs` cast I
initially wrote defensively and finding `tsc` stayed clean without it
(structural typing: extra properties on a variable assigned to a narrower
required-field type are fine, and function-type contravariance holds because
`RosterPlannerInputs` is itself assignable to `RosterBudgetInputs`). This is
the SAME "reuse the same inputs object for two engine calls" pattern
`optimizePowerUps`/`planPowerUpBudget` already established for single-raid
mode — worth checking for on any future paired-engine-call feature before
assuming a second resolution pass is needed.

**`rosterPlannerWorkerClient.ts` refactored from one Promise-returning
function to a shared generic `runOnWorker<TData>(request, isSuccess, fallback)`**
used by both `runRosterPlannerOffMainThread` and the new
`runRosterBudgetOffMainThread` — cuts ~70 lines of duplicated
construct/cleanup/fallback-to-main-thread plumbing down to one
implementation plus two ~3-line wrapper functions with their own type-guard
predicates (`isRunResult`/`isPlanResult`). Tried an `Extract<Response,
{data: TData}>` predicate-type constraint first; abandoned it for a plain
explicit predicate type per call site (`msg is {type:"result"; ...; data:
RosterPlanResult}`) since TS's generic inference through a conditional type
in a predicate position is unreliable — the explicit form just works and
reads clearly.

**`MultiRaidPerBossTable` generalized from `candidate: RosterPowerUpCandidate`
to `perBoss: RosterPerBossImpact[]`** — a one-line prop signature change (plus
its one call site) that let the SAME per-boss drill-down table serve both
`MultiRaidCandidateRow` (ranked sweep, Phase 3b) and the new
`MultiRaidBudgetStepRow` (budget plan, Phase 4), since `RosterBudgetStep.perBoss`
is the literal same `RosterPerBossImpact[]` shape as
`RosterPowerUpCandidate.perBoss`. Look for this "share the shape, generalize
the prop" pattern before writing a second near-identical table in this file.

**Extracted `ExcludedEntriesTable` (its own `showAll` state, so two
independent instances on screen — sweep's `neverCompetitive`, plan's
`excludedEntries` — don't share a collapse toggle) from what was inline JSX
in `MultiRaidResultsSection`.** Both consume the SAME `RosterNeverCompetitiveEntry[]`
type; reused rather than duplicated. Small but worth remembering: this kind
of "read-only list with a reason column and a show-more toggle" recurs
across this app (never-competitive, excluded-from-plan, and probably more in
future tabs) — factor it the first time a SECOND instance is needed, not
before.

**`budgetStopReasonSentence(plan)` -> `budgetStopReasonSentence(stopReason,
noiseFloorTeamDps)`** — the single-raid `PowerUpBudgetPlan` and multi-raid
`RosterBudgetPlan` share the exact same `PowerUpBudgetStopReason` union and
"noise floor" concept but are otherwise unrelated types; narrowing the
function's parameter to just the two fields it actually reads let ONE
function serve both call sites instead of forking a near-identical copy.
Same reasoning produced a NEW `rosterBlockedCandidateSentence` (kept
SEPARATE from `blockedCandidateSentence`, not merged) because the two
blocked-candidate types genuinely disagree on field name
(`meanDeltaTeamDps` vs `deltaTeamDps`) — merge when the shape is identical,
fork when it deliberately isn't; don't force one function to paper over a
real semantic difference (mean-across-boss-set vs a single boss's delta).

**CLI (`scripts/run-scenario.ts`): the multi-raid branch now calls BOTH
`runRosterPlannerScenario` and the new `runRosterBudgetScenario`, wraps both
in `jsonResult = { sweep, budgetPlan }`, and extends the ONE "roster not
available" sentence to name both** ("for either the ranked sweep or the
fixed-budget plan... to compute a real sweep/plan") rather than printing two
separate messages — since the CLI structurally can never have a roster
either way (§3.2), both calls always hit the identical `blockedReason:
"no-roster"` path, so a single honest sentence covering both is more
accurate than two copies of the same fact. Verified via a hand-built share
URL (a scratch `assumptionsToScenario`+`buildPowerUpOptimizerScenarioUrl`
tsx script, deleted after) piped through the real CLI — printed the expected
"5 boss(es) resolved... Roster not available... for either" line, and
`--json` showed `{sweep: {...}, budgetPlan: {targets, data: null,
blockedReason: "no-roster", error: null}}`.

**A real bash gotcha reproduced**: passing a share URL containing literal
`&` characters as a CLI arg via `npx tsx scripts/run-scenario.ts -- "$URL"`
failed with "could not determine tab" even though the URL string LOOKED
correctly single-quoted — writing the URL to a scratch file and using
`"$(cat file)"` worked, but the REAL fix was dropping the `--` separator
(only needed for `npm run ... --`, not for invoking `tsx` directly — with
`tsx script.ts -- "$URL"`, `--` becomes argv[0] itself and `detectTab` never
sees a real query string). Check whether `--` is actually needed for the
specific invocation form before assuming a quoting bug.

**Measured wall clock** (this session's own scratch tsx script against the
repo's real `import/test/pokeGenieSample.csv` fixture — 23 rows, NOT a
164-row export, which isn't checked into this repo and wasn't available to
this session): `runRosterPlannerScenario` (ranked sweep) ~791ms;
`runRosterBudgetScenario` (budget plan) ~3574ms over 4 committed rounds
against 13 real active bosses — both consistent in shape with the task's
stated 1.7-2.5s engine-level figure (this includes the resolution pass and
runs a real committed multi-step plan, not a synthetic no-op). In a REAL
Playwright browser run (see below) both sections rendered, "computed off the
main thread," well inside test timeouts.

**Production bundle**: main chunk 2,113,730 bytes (up from the pre-Phase-4
baseline 2,094,724 — +19 KB for the new UI code, consistent with the size of
`MultiRaidBudgetPlanSection`/`MultiRaidBudgetStepRow`/the refactored worker
client); worker chunk 42,100 bytes (up from 32,382 — +~10 KB for
`planRosterBudget`'s own code now bundled into the worker). Re-confirmed the
worker chunk still carries ZERO species data the same way Phase 3b did:
`grep -o "FAMILY_[A-Za-z_]*"` and a `baseAttack`/tackle literal search both
came back empty against the built worker chunk.

**Real browser verification went two levels**: (1) the shipped
`e2e/multi-raid.spec.ts` extended with budget-plan assertions (scoped to a
`budgetSection` locator to avoid a strict-mode violation once the SAME
"computed off/on the main thread" wording appears twice on the page — the
original single-match assertion needed `.first()`); full suite green at
both `--workers=1` (5.7s) and default parallel `test:e2e` (12 workers,
5.7-6.0s — no repeat of the Phase 3a disk-pressure false positive, 18 GB
free this session). (2) A scratch Playwright spec (created, run, screenshot
captured, deleted — never committed) that imported the real sample CSV,
filled EVERY per-family candy input with a generous amount, clicked "Run
sweep," and screenshotted the resulting "Fixed-budget plan" section —
visually confirmed the blocked-candidate callout, the steps table (with a
real committed Grimmsnarl step showing `clearsAggregateFloor`-derived
column, best-boss delta, significant-boss count), the per-resource ledger,
the per-family candy table, and the "Excluded from this plan" reasons table
all render correctly with real numbers, not placeholders.

**No new `Scenario`/`Assumptions` fields needed.** `check-scenario-roundtrip`
stayed at exactly 25 fields for Power-Up Optimizer before and after this
session — `planRosterBudget`'s own extra knobs (`maxRounds`,
`candidateLevelsPerEntryPerRound`, etc.) were deliberately left at engine
defaults inside the run module, same "module constant, not a user setting"
treatment as `ROSTER_PLANNER_ITERATIONS`/`OPTIMIZER_ITERATIONS` before it —
confirmed this convention BEFORE writing any code, not after.
