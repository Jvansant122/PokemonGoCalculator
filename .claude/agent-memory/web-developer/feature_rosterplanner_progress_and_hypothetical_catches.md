---
name: feature-rosterplanner-progress-and-hypothetical-catches
description: Wiring real onProgress events through rosterPlanner.worker.ts, and the "add a 7th" hypothetical-catch UI on the Power-Up Optimizer's multi-raid mode
metadata:
  type: project
---

Built 2026-09-10, IDEAS.md #13 and #3 (Power-Up Optimizer, multi-raid mode only). Engine had already
landed `RosterPlannerInputs.onProgress`/`RosterPlannerProgressEvent`/`hypotheticalCatches`/
`HypotheticalCatchCandidate`/`RosterHypotheticalCatchImpact` before this session — pure web wiring,
`packages/engine` untouched (confirmed via `git status --porcelain packages/engine` throughout).

**A callback can't cross `postMessage` — the worker builds its OWN closure, not the caller's.**
`rosterPlanner.worker.ts`'s `onmessage` now builds `onProgress = (event) =>
ctx.postMessage({ type: "progress", requestId, event })` PER REQUEST (closing over that request's
own `requestId`) and spreads it into `{ ...event.data.inputs, onProgress }` before calling
`runRosterPlanner`/`planRosterBudget` — the raw `inputs` sent IN the request message never carries
a function (would throw on structured-clone). `rosterPlannerWorkerClient.ts`'s `runOnWorker`
listens for `{ type: "progress" }` messages matching `requestId` and calls the caller's own
`onProgress`, WITHOUT setting `settled`/resolving — only a terminal `result`/`planResult`/`error`
message settles the promise. The main-thread-fallback path (worker unavailable) gets the SAME real
callback by spreading `onProgress` into `inputs` directly before the synchronous call — no
serialization boundary there, so it's just a normal function reference. Message volume is a
non-issue: baseline ~13 events/boss, candidates ~60-160 (maxCandidates + benched tail), rounds only
per COMMITTED budget step (single digits) — a few hundred total tiny postMessages over a
multi-second compute, no throttling needed.

**UI**: `PowerUpOptimizerView.tsx` gained `sweepProgress`/`budgetProgress` state (reset to `null` at
the start of each `runMultiRaidTrackedComputation` call via a new optional `setProgress` param),
rendered as `"{elapsed}s elapsed — {rosterProgressSentence(progress)}"` next to the existing
elapsed-time hint in both `MultiRaidResultsSection` and `MultiRaidBudgetPlanSection`.
`rosterProgressSentence` is a plain switch on `event.stage` — deliberately does NOT try to combine
stages into one percentage (the engine type's own doc comment says unit costs differ wildly per
stage; a caller wanting one bar would have to weight stages itself, which wasn't asked for here).

**Hypothetical catches ("add a 7th")**: `PowerUpOptimizerAssumptions.multiRaidHypotheticalCatches:
{ speciesId: string | null; level: 20 | 25 }[]` (default `[]`) is its OWN array, not folded into
`slots` (that shape is single-raid-only and carries per-slot cost fields — a hypothetical catch is
NEVER priced, per the engine's own `HypotheticalCatchCandidate` doc comment: no ledger cost, so it
never enters `planRosterBudget`'s joint allocation and must sit structurally apart from the ranked
table's cost-fungible sort). IVs are FIXED at perfect 15/15/15 and moves at `null` (species'
default) — a deliberate "best case for a fresh catch" modeling choice, documented as
`HYPOTHETICAL_CATCH_IVS` in `run/runRosterPlanner.ts`, NOT a user-facing setting (the question is
"is this species worth fielding AT ALL," not "what if I rolled well/badly on IVs" — a real IV
control would just add noise to a yes/no read). `buildHypotheticalCatchCandidates(rows, registry)`
silently drops a blank (`speciesId: null`) or unresolvable row — same "degrade a stale link" rule
`resolveBossTarget` already uses — and index-qualifies each candidate's `id`
(`hypothetical:${i}:${speciesId}`) so two rows for the same species/level never collide (the engine
throws on a duplicate id). `resolveRosterPlannerInputs` hands the SAME resolved `inputs` object to
both `runRosterPlanner` (reads `hypotheticalCatches`) and `planRosterBudget` (structurally omits
that field from `RosterBudgetInputs` — the extra property on the shared object is just silently
never read there, exactly the same "reuse one inputs object for two engine calls" pattern already
used for `optimizePowerUps`/`planPowerUpBudget` and `runRosterPlanner`/`planRosterBudget`
themselves).

**UI species picker for a hypothetical catch reuses `slotOptions` (`candidatePickerOptions()`)** —
the SAME full real-species catalog the single-raid 6-slot roster already draws from, never a
separate/narrower list. Row component is a NEW `MultiRaidHypotheticalCatchRow` (not a reuse of
`MultiRaidCandidateRow` with blanked cost cells) since `RosterHypotheticalCatchImpact` has zero cost
fields at all — forcing it through the candidate row's shape would either fake columns or need a
lot of conditional rendering; a dedicated 6-column row (species/level/mean Δ/best-boss Δ/significant
bosses/newly-fielded) was cleaner. Section only renders when
`run.data.hypotheticalCatches.length > 0` (never an empty-but-visible section).

**Mechanical fallout from adding a required field**: any file building a `PowerUpOptimizerAssumptions`
object literal needed `multiRaidHypotheticalCatches: []` added — `teamRaidExport.ts` (Team Raid →
Power-Up Optimizer export, not in this agent's owned-file list but forced by the type change; a
one-line, behavior-neutral fix, not a feature change) and two of this agent's own test files
(`powerUpOptimizerExport.test.ts`, `scenarioRoundtrip.test.ts` — the latter got a genuine non-default
case with 2 rows, one populated one blank, per the standing round-trip-test convention).

**Verification**: `check-scenario-roundtrip` 152 fields/7 tabs (was 148), recursing correctly into
`multiRaidHypotheticalCatches[]`. `npm run test:web` (my 3 files: 54/54 — `run/runRosterPlanner.test.ts`
gained 4 tests for `buildHypotheticalCatchCandidates`). Production build: worker chunk grew
42.1KB→52.97KB (the new progress-event union + closure code, still zero species data —
`grep -c FAMILY_` returns 0, `baseAttack` hits are property-name references inside compiled math,
not bundled records). **Real Playwright run against the built `dist`** (not just static grep): added
a new spec to `e2e/multi-raid.spec.ts` that imports the real Poke Genie sample roster, adds a
hypothetical Dragonite-20 row, runs the sweep, and asserts the "What if you caught a fresh one?"
section renders with real per-boss numbers (species name + level actually present in a table row,
not a placeholder) while the fixed-budget plan's own section stays untouched by it — genuine live
proof the feature changes the comparison, not just that it compiles. Did NOT attempt to assert the
progress text mid-flight in Playwright — the e2e fixture is only 23 roster rows over a handful of
bosses, so a real sweep against it can finish in well under 100ms, making any progress line's
visible window too short to reliably poll for in a headless browser; verified the plumbing instead
via full type-checking, the shipped-bundle string grep (`"Establishing baseline teams"`,
`"Simulating power-up candidates"` both present in the built JS), and by reading the closure/message
contract end to end. Full e2e suite: 27/27 (was 26 — one new spec), all passing at `--workers=1`.

**Concurrent-session noise, not mine**: a `web-developer` "lane 1" session was actively editing
`ComparatorView.tsx`/`TeamRaidView.tsx`/`TeamAssumptionPanel.tsx`/`AssumptionPanel.tsx`/
`run/runComparator.ts`/`sensitivity.ts`/`scenarioRoundtrip.test.ts` (friendship level + Best Buddy
wiring) throughout this session — `npx tsc --noEmit` and `npm run verify`'s lint step surfaced
transient errors in those files (`FriendshipLevel` undefined, `dodgeExecutionErrorBand` missing,
`FriendshipSelect`/`BEST_BUDDY_HINT` unused-import) that came and went between edits as their work
progressed. Confirmed via `git status --porcelain` + `git diff --stat` on those specific paths that
none of it was mine, and filtered `tsc` output by filename before trusting a "clean" result. Worth
the pattern: when a shared `npm run verify`/`tsc` run shows errors in files you never touched,
check `git status` on exactly those paths before assuming your own change broke something.
