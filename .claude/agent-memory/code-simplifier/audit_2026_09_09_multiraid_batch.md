# Second run: 2026-09-09 — batch audit of multi-raid Power-Up Optimizer (5136c68, 3043516)

Scope: only files touched by `git diff --stat 4301f68..HEAD` (the multi-raid whole-roster
optimizer batch), not a full repo re-sweep. `npx tsc --noEmit` clean in both packages. `npm run
lint` clean (0 errors, 3 pre-existing warnings in untouched files — IvBreakpointsView.tsx,
SpeciesPicker.tsx). No TODO/FIXME/XXX in any batch-touched file. `npm run unused-exports` flagged
27 modules; nearly all false positives (see below); one real thing found (#1).

## Reported

1. **[dead-code + stale-comment, MEDIUM]** `packages/web/src/import/pokeGenieMatch.ts`
   `RosterEntry.isFullyEvolved` (~line 35) and its mirror in `packages/web/src/rosterPool.ts`
   (~lines 36, 78, 104) — declared, always left `undefined` (never set in pokeGenieMatch.ts's
   row-matching logic), round-tripped through rosterPool.ts's localStorage codec, pinned
   `undefined` by `pokeGenieMatch.test.ts:268`. Never read downstream: `run/runRosterPlanner.ts`'s
   `toEngineRosterPool` does NOT copy it onto the engine `RosterEntry` — the engine reads
   `entry.species.isFullyEvolved` instead (populated by sync-data.ts's Phase 0). Confirmed via
   `grep -rn "\.isFullyEvolved\b" packages/web/src` — 3 hits, no real consumer. Its own doc
   comment ("Phase 0 ... adds real isFullyEvolved data this project doesn't have yet") is stale —
   Phase 0 landed in the SAME batch (5136c68) and added that data to `SpeciesDefinition` instead.
   Handoff: web-developer — delete the field + round-trip, or repoint comment and wire it for real
   if a CSV-row-level UI use is wanted.

2. **[stale-comment, MEDIUM]** `scripts/sync-data/fetchCache.ts` ~line 269-282 — doc comment on
   `familyId`/`evolutionBranch` extraction says these are "NOT YET consumed by this script's
   species-building pass ... needs a SpeciesDefinition schema addition this script doesn't own."
   `git log` confirms both this comment AND the consuming code
   (`definition.isFullyEvolved = isFullyEvolved(...)` etc. in sync-data.ts) were added in the SAME
   commit (5136c68) — comment was wrong the moment it landed. Handoff: data-sync — trivial,
   high-confidence fix.

3. **[duplication, LOW-MEDIUM, engine-only]** `packages/engine/src/rosterPlanner.ts`
   `priceCandidate` (line 705-725) vs `packages/engine/src/powerUp.ts` `optimizePowerUps`'s inline
   affordability block (~line 800-805) — identical 3-line formula
   (`sharedCandyNeeded = max(0, cost.candy - ownCandy) / RARE_CANDY_TO_CANDY_RATIO`, mirrored for
   XL, then the `affordable` AND). NOT the same as the optimizePowerUps/planPowerUpBudget pair
   CLAUDE.md protects (different question) — this is a literal duplicate sub-formula. Handoff:
   engine-developer — extract a small `priceAffordability(...)` helper in powerUp.ts, matching the
   established "export from powerUp.ts, reuse verbatim" pattern already used this batch
   (noiseFloorFor/summarizeResults/shortfallsForCandidate). Optional/low-priority given its size.

4. **[oversized, HIGH VALUE]** `packages/web/src/PowerUpOptimizerView.tsx` — file 1995 lines;
   `PowerUpOptimizerView()` itself ~837 lines (1159-1995). Multi-raid mode's JSX is already
   cleanly extracted (MultiRaidResultsSection, MultiRaidBudgetPlanSection, MultiRaidCandidateRow,
   MultiRaidBudgetStepRow, ExcludedEntriesTable, MultiRaidPerBossTable) but the PRE-EXISTING
   single-raid results JSX (~1550-1947, ~400 lines: baseline card, damage ladder, recommendation,
   fixed-budget plan, ranked-candidates table, known-caveats) was never given the same treatment
   and still renders inline. Handoff: web-developer — extract into a `SingleRaidResultsSection`,
   mirroring the pattern already proven in the SAME file. Safe, mechanical. **Top finding this
   pass** — matches an already-proven pattern, addresses the largest function in the batch.

5. **[duplication, LOW/cosmetic]** `PowerUpOptimizerView.tsx` `MultiRaidResultsSection`
   (~617-810) — the 9-column `<thead>` for "Ranked candidates" (~746-754) and "Benched but
   promising" (~782-790) copy-pasted verbatim (~10 lines, 2 call sites, same file). Handoff:
   web-developer, low priority.

## Investigated, NOT flagged (don't re-raise)

- `blockedCandidateSentence` vs `rosterBlockedCandidateSentence` (PowerUpOptimizerView.tsx
  ~357/~372) — near-identical 2-line builders, but already self-documented why separate (different
  field names: `deltaTeamDps` vs `meanDeltaTeamDps`). Not flagged as duplication. Minor caveat:
  `rosterBlockedCandidateSentence`'s "exported for CLI reuse" claim overclaims — CLI's multi-raid
  path always has an empty roster so never reaches a populated `bestBlockedCandidate`; too low
  value to write up as its own finding, noted here only.
- `unused-exports` hits on `powerUpOptimizerScenario.ts` (PowerUpScenarioSlot, encode/decode),
  `BossSetPanel.tsx` (BossSetPanelValue), `rosterPlanner.worker.ts`
  (RosterPlannerWorkerRunRequest/PlanRequest), `rosterPlannerWorkerClient.ts`
  (RosterPlannerWorkerRunOutcome/RosterBudgetWorkerRunOutcome), `import/pokeGenieCsv.ts`
  (PokeGenieSkippedRow) — all confirmed false positives via Grep: same-file-only usage, JSX prop
  types, or array-element types of an exported field consumed elsewhere. Reminder: ts-unused-
  exports can't see same-file-only usage or structural/JSX consumption as "used," on top of the
  already-known web→engine blind spot.
- `interleaveCandidatesRoundRobin` (powerUp.ts) staying private, not reused by planRosterBudget —
  this batch's own doc comment already explains why (round-robin-by-depth doesn't scale to
  100-200 entries; real Gengar-jump regression). Confirmed correct.
- `runRosterPlanner`/`planRosterBudget` and `optimizePowerUps`/`planPowerUpBudget` — per task
  instruction, NOT proposed for merging; confirmed each pair answers a different question.
- `rosterPlanner.worker.ts` importing only `@pogo-analyzer/engine`, never `registry.ts` —
  confirmed still true.
- `isFullyEvolved === false` (never `!== true`) — confirmed correct pattern used throughout.
- `rosterPlanner.ts`'s own self-flagged gap (top doc comment) about `TeamRaidInputs` lacking a
  `bossMaxHpOverride` hook comparison.ts already has — a FUNCTIONAL correctness gap, not
  bloat/duplication, so out of this agent's remit; already self-documented for engine-developer.
  Noted so a future pass doesn't misclassify it as a fresh TODO.

## File sizes as of 2026-09-09 (batch-touched files)

`rosterPlanner.ts` 2093 (new) — `runRosterPlanner` body ~778-1141 (~363 lines), `planRosterBudget`
~1480-2093 (~613 lines). Both built around shared mutable caches/closures; doc comments justify
the shape. NOT a hard finding — splitting would need passing 3+ caches as params to extracted
stage functions, a legitimate option for engine-developer to consider if this file needs touching
again, not a standalone finding this pass.
`powerUp.ts` 1911 (pre-existing size, not newly bloated this batch).
`PowerUpOptimizerView.tsx` 1995 — see finding #4.
`RosterImportPanel.tsx` 343, `rosterPool.ts` 224, `rosterPlannerWorkerClient.ts` 156,
`import/pokeGenieMatch.ts` 394, `import/pokeGenieCsv.ts` 307 — none oversized, not flagged.
`scripts/sync-data.ts` grew to 3078 (from 1306 at 2026-09-06 audit) — still not flagged fresh
(Phase 0 addition is its own clearly-bannered section with an extracted helper); reconsider a
split next time this file is touched.
