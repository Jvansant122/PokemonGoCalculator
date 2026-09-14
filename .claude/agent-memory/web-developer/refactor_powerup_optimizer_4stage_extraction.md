---
name: refactor-powerup-optimizer-4stage-extraction
description: 4-stage extract-only refactor of PowerUpOptimizerView.tsx (3792->1699 lines) into powerUpOptimizerScenario.ts/powerUpOptimizerSentences.ts/MultiRaidResultsSection.tsx/SingleRaidResultsSection.tsx — check-scenario-roundtrip's hardcoded TABS file path, a scripts/ import gap caught only by full verify, and a deliberate no-circular-import redesign
metadata:
  type: feedback
---

Done 2026-09-14, staged extract-only refactor (no behavior change) per an explicit 4-stage
task. Result: `PowerUpOptimizerView.tsx` 3792 → 1699 lines (55% reduction, still the largest of
7 tabs but now only 1.6x the next-largest `SpeciesReportView.tsx` at 1076, down from 3.5x).
New files: `powerUpOptimizerScenario.ts` 262→581 (codec + `DEFAULT_ASSUMPTIONS`/
`normalizePowerUpAssumptions`/`initialAssumptions`/`resolveSpecies`, Stage 1),
`powerUpOptimizerSentences.ts` 141 lines (9 pure prose/label helpers, Stage 2),
`MultiRaidResultsSection.tsx` 854 lines (the named multi-raid ranked-candidate cluster, Stage 3),
`SingleRaidResultsSection.tsx` 884 lines (`RankedCandidateRow` model + single-raid results/budget
sections, Stage 4). Test file moved+renamed alongside Stage 2
(`PowerUpOptimizerView.test.ts`→`powerUpOptimizerSentences.test.ts`, `git mv`).

**`check-scenario-roundtrip.mjs`'s TABS array hardcodes the round-trip functions' FILE PATH per
tab, not just the interface/function names** (`scripts/check-scenario-roundtrip.mjs` line ~79)
— moving `assumptionsToScenario`/`scenarioToAssumptions` out of `*View.tsx` breaks the checker's
`function\s+assumptionsToScenario\b` regex search unless that row's `rfile` is updated to the new
destination file. The task anticipated this exactly ("pick a destination filename that keeps it
working... Read `scripts/check-scenario-roundtrip.ts` first" — actual file is `.mjs`, the task's
own reference was slightly stale). Fixed by pointing the Power-Up Optimizer row at
`powerUpOptimizerScenario.ts` (which already existed and already held the `Scenario` type — the
natural home per the task's own hint). Field count stayed exactly 155/155 across all 4 stages —
worth re-running after EVERY stage, not just once at the end, since a silent drop to fewer fields
(not a hard failure) is the actual historical bug class this checker exists for.

**A real gap only `npm run verify`'s full test suite caught, not `typecheck:web`/`lint`/
`test:web` run individually after each stage**: Stage 2 moved `blockedCandidateSentence` out of
`PowerUpOptimizerView.tsx` into the new sentences module, and I updated 4 of 5 external import
sites (`TeamRaidView.tsx`, `scenarioRoundtrip.test.ts`, `run/run.smoke.test.ts`,
`check-scenario-roundtrip.mjs`'s TABS row) but MISSED `scripts/run-scenario.ts`'s own import —
it kept importing `blockedCandidateSentence` from `../packages/web/src/PowerUpOptimizerView.js`,
which still re-exported everything ELSE needed (so `npm run typecheck:web` stayed clean — that
config doesn't even see `scripts/`) and `npm run lint` doesn't do cross-module named-export
resolution either. The break was a pure ESM runtime error (`does not provide an export named
'blockedCandidateSentence'`) surfaced only when `scripts/run-scenario-roster.test.ts` actually
`execFileSync`'d the CLI under `tsx` — i.e. only `npm run test` (specifically `test:scripts`)
or `npm run verify` exercises this path. **Lesson: after moving/renaming any export a `scripts/`
file imports (grep `scripts/` too, not just `packages/web/src/`), run the FULL `npm run verify`
before calling a stage done — `typecheck:web` + `lint` + `test:web` is not sufficient coverage
for a cross-package-boundary rename**, even though `npm run typecheck` (the 4-way combined
command, which DOES include `typecheck:scripts`) would also have caught it as a TS2305 if run.
I ran the full 4-way `typecheck` once after Stage 1 (clean) but only ran the narrower
`typecheck:web` after Stages 2-4, which is what let this slip through until the very end.

**Deliberately redesigned away from a circular import rather than accepting one, unlike the
project's existing `DamageOverTimeChart.tsx`↔`rankingFlip.ts` precedent** (memory:
`feature_run_module_extraction_and_cli`, "safe here since both only reference the imported
symbols inside function bodies"). Stage 4's `RankedCandidateRow`/`powerUpCandidateToRow`/
`secondChargedMoveCandidateToRow`/`rankedRowEfficiency`/`CANDIDATE_TABLE_INITIAL_ROWS` are all
built in `PowerUpOptimizerView()` itself but consumed only by `SingleRaidResultsSection`'s props
— the naive split (row-model stays in View.tsx, component moves to the new file) would have
created `PowerUpOptimizerView.tsx` → imports `SingleRaidResultsSection` FROM the new file, new
file → imports `CANDIDATE_TABLE_INITIAL_ROWS`(a VALUE, not type-only) FROM `PowerUpOptimizerView.tsx`
— a genuine runtime cycle. Rather than lean on the existing precedent that this is "probably
fine," I moved the whole `RankedCandidateRow` row-model cluster INTO `SingleRaidResultsSection.tsx`
too (exported, `PowerUpOptimizerView()` imports it back) — same "row-building and its one
consumer belong in one file" reasoning `MultiRaidResultsSection.tsx` already established for its
own `MULTI_RAID_TABLE_INITIAL_ROWS`/`rosterCandidateEfficiency` in Stage 3. Zero circular imports
in the final result, confirmed by `tsc --noEmit` passing clean on the FIRST attempt for both
Stage 3 and Stage 4 (no retry needed) — a good sign the dependency analysis was done correctly
up front rather than discovered via compiler errors.

**Method for tracing which external symbols a big non-contiguous JSX block actually needs,
before writing the new file**: `sed -n 'START,ENDp' file > scratch/block.txt`, then for every
name currently imported at the top of the source file, `grep -ow "$name" scratch/block.txt | wc -l`
in a loop — a 0 count means definitely not needed by the moved code (safe to leave importless in
the new file and drop from the old file's import list if also unused elsewhere), a >0 count means
it must be threaded into the new file's own import block. Caught real non-obvious cases both
directions: `MultiRaidPerBossTable`/`ExcludedEntriesTable`/`rosterProgressSentence` (Stage 3) and
`RankedCandidateRow` (Stage 4, type-only) were each used BOTH inside the moved cluster AND at a
separate call site elsewhere in the file that stayed behind — meaning each needed `export` in the
new module AND a re-import back into `PowerUpOptimizerView.tsx`, not just a one-way move. Skipping
this check and eyeballing the block instead would very likely have produced either a build error
or (worse) a silently-broken second call site.

**A stray `sed` non-contiguous-range deletion leaves double/triple blank lines** at the seam
where a removed block met the next surviving line — fixed once per stage via a small inline
Node.js one-liner (`content.replace(/\n{3,}/g, "\n\n")`) run over the WHOLE file rather than
hand-editing every seam; verified via `git diff --stat`/`git diff | grep '^@@'` afterward that
the collapse produced exactly the expected number of localized hunks (not a surprise site far
from the actual edit).

**Stopped after Stage 4 exactly as scoped, despite `PowerUpOptimizerView.tsx` still being the
largest of the 7 view files (1699 vs. next-largest 1076)** — the task explicitly limited scope to
4 named stages and gave permission to stop after 3 if the improvement was already substantial; a
hypothetical Stage 5 (the still-untouched multi-raid move-change/Elite-TM cluster
`RosterSecondChargedMoveTable`/`RosterEliteTmSection`/`MultiRaidMoveChangeSection`, and the
multi-raid budget-plan cluster `MultiRaidBudgetStepRow`/`MultiRaidBudgetPlanSection`, ~700 lines
combined, plus the ~820-line `PowerUpOptimizerView()` orchestrator itself) was never requested
and I didn't invent one — don't over-deliver past an explicitly staged/bounded task without
being asked.

**Verification depth**: ran `npm run typecheck:web`/`lint`/`test:web`/`check-scenario-roundtrip`
after EACH of the 4 stages individually (all green every time except the one scripts/ import gap
above, caught only at the final full pass), then one full `npm run verify` (all 3 vitest suites —
engine 37 files, web 38 files/372 tests, scripts 15 files — 4-way typecheck, lint, all 4
checkers, production build) AND a separate `GITHUB_PAGES=true` build + `npm run test:e2e` (31/31
Playwright specs green, including several Power-Up-Optimizer-specific ones — multi-raid sweep,
fixed-budget plan section, 3 share-link round-trips, roster clear blast-radius, lineup builder —
that directly exercise the exact code moved). Did not use a live browser-preview tool (not
granted this session per the task's own tools list) — build+e2e is the achieved verification
level. A concurrent, unrelated session's changes were visible in `git status` throughout
(`.claude/agent-memory/meta-architect/...`, `CLAUDE.md`, a new `scout-meta-ideas` skill,
`meta_ideas.md`) — confirmed via file paths alone (never touched by any edit this session) rather
than diffing each one, since none were remotely adjacent to `packages/web/src/PowerUpOptimizer*`.
