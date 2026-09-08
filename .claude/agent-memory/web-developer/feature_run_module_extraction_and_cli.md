---
name: feature-run-module-extraction-and-cli
description: Extracted all six tabs' engine computation into packages/web/src/run/*.ts, added vitest to packages/web, and built scripts/run-scenario.ts — the aliasing trick that made this low-risk, and several real bugs/gaps found along the way
metadata:
  type: project
---

Built 2026-09-08 (large scaffolding task, not a product feature). Three deliverables: (A) one
`run*Scenario(assumptions, registry)` pure function per tab in a new `packages/web/src/run/`
directory, (B) `vitest`/`vitest.config.ts`/a `"test"` script for `packages/web` (root already had
`test:web`/`typecheck:web`/`run-scenario` wired — never touch root `package.json` for this), (C)
`scripts/run-scenario.ts`, a CLI that decodes a share URL/query string, calls the matching
`run*Scenario`, and prints a summary (`--json` for the full object).

**Design call: `run*Scenario` takes the tab's own `Assumptions` type, not the raw wire `Scenario`.**
The task description said "scenario in" but each View already threads `assumptions.*` (post-`??`-
default) into every engine call, never the raw decoded `Scenario` directly — that `??` defaulting
lives in each View's own `scenarioToAssumptions`. Making the run function accept `Assumptions`
means it reuses that single existing default-filling implementation instead of a second copy
(the `check-scenario-roundtrip` bug class this project keeps hitting is exactly "two places that
should apply the same defaults, don't"). The CLI decodes via engine's/each web-owned
`parseXScenarioFromUrl`, then calls the View's own (now-exported) `scenarioToAssumptions` +
`normalizeXAssumptions`, then hands the result to `run*Scenario`. This is a durable convention —
don't redesign a future `run*Scenario` to take raw `Scenario` instead.

**The aliasing trick that made six large, hand-written extractions low-risk**: instead of
rewriting every downstream JSX reference to a new field name, each View's edit was `const runResult
= useMemo(() => runXScenario(assumptions, speciesRegistry), [assumptions]); const species =
{candidates: runResult.candidates, ...}; const bossRaidTier = runResult.bossRaidTier; ...` —
reconstructing the EXACT original local variable names/shapes as aliases of the new flattened
result object. This meant the entire render body (hundreds of lines per view) needed zero edits.
Worth repeating for any future extraction of this shape.

**A pre-existing debounce architecture is the one place "one big run function" doesn't drop in
cleanly** — SpeciesReportView and PowerUpOptimizerView both split cheap/live fields (boss
tier/energy/ready-seconds/HP for the assumption panel) from an expensive, DEBOUNCED call
(the actual sweep/optimizer). Folding everything into one non-debounced `run*Scenario` call and
invoking it on LIVE `assumptions` would reintroduce the exact per-keystroke freeze the debounce was
built to fix. Fix: keep the cheap boss-preview computation live and un-debounced in the View
(duplicated internally inside the run function too, harmlessly, since it's cheap), and debounce a
narrow memoized object EXCLUDING the display-only field (`sortMode`/`rankBy`) before calling the run
function — same "debounce the narrow derived object, not the whole assumptions blob" pattern
SpeciesReportView's `sweepInputs` already established, just now sitting one layer further out
(around the whole `Assumptions` object minus the display-only field, instead of around a
hand-built engine-input object). Spreading `{...assumptions, rankBy: "x"}` inside this memo
triggers `react-hooks/exhaustive-deps` (it reads the whole object but the deps array only lists
sub-fields) — build the object field-by-field instead, matching every other field-by-field memo
in this codebase.

**`DamageOverTimeChart.tsx` and `rankingFlip.ts` are now mutually importing** (chart imports
`computeRankingFlip`, `rankingFlip.ts` imports `totalAt`/`SAMPLE_COUNT`/`type DamageOverTimeSeries`
back from the chart) — a genuine circular import, but safe here since both only reference the
imported symbols inside function bodies (never at module top-level), which ESM live bindings
handle fine. Don't "fix" this by duplicating `totalAt`/`SAMPLE_COUNT` into a third file — the
existing convention (per `pattern_shared_trajectory_helpers.md`) is DamageOverTimeChart.tsx OWNS
these, reuse don't refork.

**A real, if narrow-impact, behavior gap found writing the pinned test**:
`effectiveIsShadow(null, true)` returns `true`, not `false` — the function's `!species?.boost`
guard treats "no species" the same as "a boost-free species," so a null species with the toggle on
reads as effectively-Shadow. Every real call site resolves a species before checking this, so it's
unreachable from the live UI, but the function itself has no such guard. Pinned as a documented
"real, slightly surprising" test case in `shadowToggle.test.ts` rather than silently working around
it or reporting it as a bug — not surfaced as an issue since it can't actually be hit from the app.

**Two exports genuinely missing on ALL six views until this task**: `assumptionsToScenario` (the
encode direction) and, for Comparator/IvBreakpoints/AttackDefenseBreakpoints, `normalizeAssumptions`
— every view already exported `scenarioToAssumptions`/`DEFAULT_ASSUMPTIONS` for its own
`initialAssumptions()`, but the ENCODE half and the normalize step were always called only
internally (`handleShare`/`setAssumptions`), never needed outside the view before. The CLI needs
both directions plus normalization to replicate exactly what a live share-link load does. If a
future tab is added, export all four (`DEFAULT_ASSUMPTIONS`, `assumptionsToScenario`,
`scenarioToAssumptions`, `normalizeXAssumptions` if one exists) from the start.

**`tsconfig.scripts.json` needed `"jsx": "react-jsx"` and `"lib": ["ES2022", "DOM", "DOM.Iterable"]`
added** (previously ES2022-only, no jsx option) because `scripts/run-scenario.ts` reaches into
`packages/web/src`'s `.tsx` View files for their exported (React-free) constants/functions, and
`tsc -p tsconfig.scripts.json` type-checks the whole transitive import graph, not just the files
it directly targets — the six Views' full component bodies (with DOM event-handler types) come
along for the ride even though none of their JSX/DOM code is ever executed by the CLI. This is a
type-checking-only concern (`noEmit` already set) and doesn't touch Vite's own build (which uses
`packages/web/tsconfig.json`'s own settings, unaffected). `type Assumptions` (and every tab's own
`XAssumptions`) importing fine from a `.tsx` file under `import type` was already an established,
working pattern (`sensitivity.ts` already did it) — confirmed it scales to six files plus a
standalone CLI script without issue.

**Windows path gotcha for a throwaway root-relative probe script under `tsx`**: an absolute
Windows path (`C:/Users/...`) as an import specifier throws `ERR_UNSUPPORTED_ESM_URL_SCHEME`
under plain `tsx` (ESM loader requires `file://`/relative, not a bare drive-letter path) — use a
relative import from a script actually placed under `scripts/`, not an absolute path, when
probing whether a module resolves outside Vite.

**Vitest "Worker exited unexpectedly" with zero tests reported is very likely the documented
environment OOM noise** (`feedback_vitest_oom_single_fork` in memory), not a real bug — it
disappeared on a bare rerun of the exact same file with no code changes. Don't chase it by
bisecting imports before just rerunning once; only bisect if it repeats.

**Verification this session**: `npm run test:web` (11 files, 66 tests, all real assertions — no
placeholder tests), `npm run typecheck:web` and `npm run typecheck:scripts` both clean,
`npx eslint packages/web scripts/run-scenario.ts` reduced from 3 real errors (2 dead
`bossRaidTier` locals, 1 dead `Grids` import — all mine, introduced during extraction) down to 0
errors / 6 pre-existing warnings (individually confirmed pre-existing via reading the exact
flagged lines, not assumed — see `react-hooks/static-components` on `ComparatorView`'s
`SpeciesIcon`, `react-hooks/exhaustive-deps` on `IvBreakpointsView`'s `rows`, and
`react-hooks/set-state-in-effect` on `SpeciesPicker.tsx`, none of which this session's diff
touches). `npm run check-scenario-roundtrip` (97 fields, unchanged). `npm run build
--workspace=packages/web` succeeded (pre-existing >500kB chunk warning only). Served the real
production build via `vite preview`, curled index/js/css for 200s, `node --check`ed the bundle,
grepped shipped tab-label strings. Ran `run-scenario` against `?view=X` for all six tabs AND a
real non-default share URL built via the engine's own `buildScenarioUrl` (level 45, party size 2,
Rayquaza vs Mega Mewtwo X vs Primal Kyogre) with `--json`, confirming the printed summary matched
the URL's actual encoded values, not defaults. Did NOT click through in an actual rendered
browser (no browser tool in this session's grant, per `verification_without_browser_tool`).

**A large concurrent-session working tree**: `git status` mid-task showed many modified/untracked
files this session never touched (`packages/engine/src/combat.ts`, `scripts/sync-data.ts`,
`eslint.config.js` itself, a new `.claude/hooks/` directory, `ivBreakpointsHelpers.ts`'s
ternary-with-side-effects rewritten to if/else). Confirmed via `git diff` on each surprising
file that none of it was mine before reporting — don't assume `git status` noise mid-task is your
own regression; check the diff.
