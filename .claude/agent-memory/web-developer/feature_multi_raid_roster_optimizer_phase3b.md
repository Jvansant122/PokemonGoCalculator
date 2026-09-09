---
name: feature-multi-raid-roster-optimizer-phase3b
description: Power-Up Optimizer multi-raid mode's Web Worker, per-boss drill-down, dedupe, and e2e coverage (Phase 3b of PLAN_multi_raid_roster_optimizer.md) — the resolution/computation split, a TS "webworker" lib conflict avoided by casting self, and a real dedupe-noise finding
metadata:
  type: feedback
---

Built Phase 3b (2026-09-09) on top of Phase 3a's uncommitted work — found the
session's working tree checked out on `main` with Phase 3a's changes sitting
there uncommitted; `phase-3-multi-raid-ui` existed as a branch pointing at
the SAME commit, so `git checkout phase-3-multi-raid-ui` carried the
uncommitted changes across cleanly (branch switch, not a file checkout — safe
when both branches share a commit). Worth checking `git branch -a` against
the stated branch name before assuming `git status`'s "On branch main" is
the whole story.

**The resolution/computation split, exactly as specified.** `run/runRosterPlanner.ts`
gained `resolveRosterPlannerInputs(assumptions, registry, pool) ->
{ targets, blockedReason, inputs: RosterPlannerInputs | null }` — ALL
`registry.ts` work (boss-id resolution, cost table, species lookups), ZERO
engine calls. `runRosterPlannerScenario` (the CLI/smoke-test contract) now
just calls that + `runRosterPlanner(inputs)` synchronously, unchanged
behavior. The NEW `rosterPlanner.worker.ts` imports **only**
`@pogo-analyzer/engine`— never `registry.ts` — confirmed by inspecting the
built worker chunk directly (`grep -c species` on the compiled worker JS)
rather than trusting the import list alone; the built chunk was 32,382 bytes
vs. the main chunk's 2,094,744 (the plan's own "don't bundle species.json
twice" fear did NOT materialize — the worker chunk is tiny).

**A real TS "webworker" lib conflict, and how it was avoided.** This
package's ONE tsconfig.json sets `"lib": ["ES2022", "DOM", "DOM.Iterable"]`
for the WHOLE `src` tree (main-thread code needs DOM). Adding
`/// <reference lib="webworker" />` to just the worker file would redeclare
overlapping globals (`self`, `postMessage`) against DOM.d.ts already in
scope for the same compilation unit — a real, known TS pain point, not
hypothetical. Fix used: `const ctx = self as unknown as MinimalWorkerScope`
with a hand-written 2-field interface (`onmessage`/`postMessage`, each typed
to the EXACT message contract) — sidesteps needing "webworker" lib at all.
Confirmed clean under the package's existing single tsconfig (`tsc --noEmit`
passed with zero new errors). **How to apply:** any future worker file in
this package should use this same cast-through-unknown pattern, not a
per-file lib reference.

**Graceful degradation implemented as a Promise wrapper, not a hook.**
`rosterPlannerWorkerClient.ts`'s `runRosterPlannerOffMainThread(inputs)`
tries `new Worker(...)` in a try/catch (construction failure -> synchronous
fallback), and separately listens for the worker's own `error` event
(script failed to load/parse -> same fallback, via a `settled` flag so a
late worker reply after fallback can't double-resolve). A genuine ENGINE
error (a `{type: "error"}` reply — a real thrown validation error INSIDE
`runRosterPlanner`) is deliberately NOT treated as an infrastructure
failure and is NOT retried on the main thread — re-running identical bad
inputs would just throw the identical error again, so it's surfaced as a
rejection directly. `ranOn: "worker" | "main-thread-fallback"` on the
resolved value lets the UI say honestly which path ran.

**Coarse progress, no fake percentage.** `runRosterPlanner` has zero yield
points inside the worker (fully synchronous single function), so the ONLY
honest progress signal is running/done/failed + elapsed wall-clock time —
implemented as a plain `window.setInterval` INSIDE the event handler
(`handleRunMultiRaidSweep`), not a `useEffect` (no
`react-hooks/set-state-in-effect` concern), ticking `sweepElapsedMs` every
200ms while running and set once more precisely (`performance.now() -
startedAt`) on completion. A genuine per-boss progress event needs an
`onProgress` hook inside `packages/engine/src/rosterPlanner.ts` — flagged as
out of scope per the task's own instruction, not attempted (packages/engine
is off-limits to this agent anyway).

**Dedupe: exact-equality group key, closest-to-mean representative, never a
synthesized blend.** `rosterCandidateDedupe.ts`'s `dedupeInterchangeableCandidates`
groups on `[speciesId, fromLevel, toLevel, ivAttack, ivDefense, ivStamina,
fastMoveId, chargedMoveId, isShadow, isPurified, isLucky].join("|")` — ANY
one difference keeps rows separate (conservative by construction, per the
task's own instruction). Within a group, the REPRESENTATIVE shown is the
group member whose own `meanDeltaTeamDps` is closest to the group's average
— a real, fully-computed `RosterPowerUpCandidate` (so its `perBoss`
breakdown etc. are all genuinely its own), never an average blended across
members. Needs the ORIGINAL pool (`ImportedRosterEntry[]`, not just the
candidate list) since `RosterPowerUpCandidate` itself doesn't carry
IVs/moveset/cost-modifiers — only `entryId`, which has to be joined back
against the pool. **How to apply:** any future "collapse near-duplicate
rows" feature elsewhere in this app should reuse this exact-equality +
closest-to-mean pattern rather than averaging or picking arbitrarily.

**Per-boss drill-down reuses `RosterPowerUpCandidate.perBoss` — it already
had everything** (Phase 2 shipped `bossId`/`bossName`/`deltaTeamDps`/
`rankBefore`/`rankAfter`/`simulated`); Phase 3b was PURELY a UI surface
(`MultiRaidPerBossTable`, an expandable `<tr>` under each candidate row,
collapsed by default so 30 rows doesn't become 30 tables on load). Sorted by
`|deltaTeamDps|` descending inside the drill-down — the bosses that matter
first, matching CLAUDE.md's "where the ranking flips" thesis directly. Three
distinct display states per boss row: `!simulated` -> "0.000, not fielded
before or after — a real computed zero" (never reads as "no data"); enters
(`rankBefore === null && rankAfter !== null`) -> green "enters team" badge;
"drops from team" (`rankBefore !== null && rankAfter === null`) is coded
defensively but is CURRENTLY UNREACHABLE given the engine's own logic (an
already-fielded entry's team composition array is always the same length/
order after a level-only change — traced through `runRosterPlanner`'s
`simulateDraft` to confirm before deciding whether it was worth a UI
branch; kept it anyway as cheap, correctly-labeled defense against a future
engine change, not as evidence of a bug).

**Mega candy family, closed via pure string convention — no engine change
needed.** Confirmed via direct `node -e` probe against
`data/normalized/species.json`: stripping one of four suffixes (`-mega`,
`-mega-x`, `-mega-y`, `-primal`) off a mega/primal species id and looking up
that base id in the SAME registry resolves **61/61** real mega/primal
species to a base species carrying its own `candyFamilyId` — zero
exceptions, so this was cheap per the task's own "if it's cheap" framing.
Added `resolveMegaBaseSpecies`/`resolveMegaBaseCandyFamilyId` to
`registry.ts` (web-layer only, singleton-registry-based, matching every
other helper there); wired into `toEngineRosterPool` (only when
`canMega && species.boost` — leaves non-mega entries' `candyFamilyId`
untouched so the engine's own `species.candyFamilyId` fallback still
applies) and into the View's `rosterFamilyOptions` (label becomes
`"Blaziken (for Mega Blaziken)"` so the per-family candy editor is honest
about whose candy the row actually spends). Two stale doc comments/caveat
sentences claiming this gap was unclosed were updated in the SAME pass
(`PowerUpOptimizerAssumptionPanel.tsx`'s candy-editor caveat, and
`rosterFamilyOptions`' own doc comment) — a fixed gap with un-updated prose
next to it is its own bug class in this codebase.

**e2e: real browser proof, not just URL inspection.** Confirmed the worker
URL is base-path-correct in the BUILT `dist` two ways: (1) static —
`grep -o "new Worker([^)]*)" dist/assets/index-*.js` shows the compiled URL
literally contains `/PokemonGoCalculator/assets/rosterPlanner.worker-*.js`
when built with `GITHUB_PAGES=true`; (2) dynamic — a real Playwright spec
(`e2e/multi-raid.spec.ts`) against `vite preview` serving that SAME
GH-Pages-path build, switching modes, pasting the real
`import/test/pokeGenieSample.csv` fixture, clicking "Run sweep", and
asserting a real ranked table renders (2.5s wall clock) with zero
console/page errors — genuine runtime proof the worker chunk loads and
replies correctly under the base path, which a static URL-string check
alone can't guarantee. Second spec: `browser.newContext()` (NOT
`page.context().newPage()` — a fresh CONTEXT has no localStorage, same
distinction Phase 3a's own verification already established) opening a
built share link and asserting the exact "No roster imported in this
browser yet — import a Poke Genie CSV export" empty state, never a silent
empty result. Disk was NOT a constraint this session (27 GB free, `df -h /c`
— the Phase 3a session's ~35-54 MB crunch had already been resolved by the
time this one started); still ran `--workers=1` per the task's own
precautionary instruction and confirmed the SAME suite passes at that
setting.

**A `react-hooks/exhaustive-deps` trap, self-inflicted then fixed same
pass**: `const candidates = run?.data?.candidates ?? []` followed by
`useMemo(() => f(candidates), [candidates])` warns because `?? []` produces
a FRESH array reference every render when `data` is null, defeating the
memo. Fixed by depending on `run` itself (stable reference across
no-op renders) and moving the `?.data?.X ?? []` INSIDE the memo callback
body instead of hoisting it to its own `const` first — same pattern Phase
3a's own memory note already flagged for `optimizerAssumptions`/spreading a
whole object; this is the sibling gotcha (a fresh EMPTY-ARRAY fallback,
not a fresh whole-object spread) worth remembering as its own case.

**Measured, for the record**: main chunk 2,094,744 bytes (baseline stated
as 2,089,476 — a ~5 KB / 0.25% delta from the new run-module code, unrelated
to the worker split itself since the worker is a SEPARATE chunk); worker
chunk 32,382 bytes; a hand-built ~6-entry pool over 5 bosses completed via
the worker in a real browser in well under 1s (Playwright's own timer
showed the whole spec, including CSV import + DOM assertions, at 2.5s).
