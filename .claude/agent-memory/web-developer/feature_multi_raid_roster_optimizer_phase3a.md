---
name: feature-multi-raid-roster-optimizer-phase3a
description: Power-Up Optimizer's multi-raid mode (Phase 3a of PLAN_multi_raid_roster_optimizer.md) — mode switch, boss-set resolution, run module, and the disk-full-triggered Playwright false-positive found while verifying it
metadata:
  type: feedback
---

Built Phase 3a (2026-09-09): `mode: "single-raid" | "multi-raid"` added to
`PowerUpOptimizerScenario`/`PowerUpOptimizerAssumptions` (one tab, two
modes — did NOT run the `new-tab` skill, per the task). New files:
`multiRaidBossSet.ts` (`resolveMultiRaidBossIds`, the ONE place that ever
re-derives a boss id list from filters — see its own doc comment on why a
decoded scenario must never call it), `BossSetPanel.tsx` (reuses Species
Report's `activeRaidBossOptions()`/`pastRaidBossOptions()` exactly, per
plan §3.1), `run/runRosterPlanner.ts` (`runRosterPlannerScenario`, wired into
`scripts/run-scenario.ts`'s `power-up-optimizer` case and
`run/run.smoke.test.ts`). `RosterImportPanel.tsx` was refactored from owning
`useState<RosterPool>` internally to a controlled `pool`/`onPoolChange` pair
— required so a CSV import is visible to the sweep without a page reload;
`PowerUpOptimizerView.tsx` now owns the canonical roster-pool state.

**§3.1's precedence rule, implemented exactly once, nowhere else:**
`multiRaidBossIds: string[]` is the ONLY thing `runRosterPlannerScenario`
reads to build targets; `multiRaidIncludePastRaids`/`multiRaidIncludedTiers`/
`multiRaidMaxBossCount` exist ONLY to restore `BossSetPanel`'s own display
state on load. The array is recomputed via `resolveMultiRaidBossIds` in
exactly two places: `BossSetPanel`'s own filter-change handlers, and
`PowerUpOptimizerAssumptionPanel`'s `setMode` when first switching INTO
multi-raid mode with an empty boss set (so the mode switch demonstrates a
real, non-empty result immediately, same "fresh state shows something real"
precedent as every other tab's `DEFAULT_*`). `scenarioToAssumptions` never
touches the resolver at all — it just `??`-defaults the encoded array.

**Boss tier/HP for a `bossId` is NOT stored in the scenario — it's
re-resolved live at compute time**, in `resolveBossTarget` (now exported from
`runRosterPlanner.ts`, unit-tested directly rather than only through the full
sweep): still-active → today's real tier (no override); still-in-
`pastRaidBossOptions` → that encounter's own tier + `eraHp` (reusing
`runSpeciesReport.ts`'s already-exported `validEraHp` guard, not re-derived);
neither (fully rotated out of both the live feed AND the archive since a link
was shared) → `defaultRaidTierForSpecies`, same graceful fallback every tab
uses. Documented explicitly as an honest, accepted consequence: the boss
SET survives a share link exactly (§3.1's whole point), but an individual
boss's exact tier/HP can silently drift to today's default once it's fully
forgotten by this pipeline — not a bug, a stated limit.

**The web-layer import `RosterEntry` (Phase 1, `import/pokeGenieMatch.ts`)
and the engine's `RosterEntry` (Phase 2, `rosterPlanner.ts`) are two
DIFFERENT types with the same name** — the former is what the CSV matcher
produces and what the roster pool persists; the latter is
`runRosterPlanner`'s actual input shape (adds `candyFamilyId?`). Wrote one
mapping function, `toEngineRosterPool`, at the run-module boundary — never
tried to unify the two types. It defensively re-clears `canMega` if
`!species.boost` (the engine throws otherwise) even though the CSV matcher
should never produce that combination, because the OTHER import path
(`rosterPool.ts`'s file-import, `deserializeRosterPoolFromJson`) accepts a
hand-edited JSON file with no such guarantee.

**A mega-form roster entry's candy is currently ALWAYS `costUnverified`** —
`toEngineRosterPool` deliberately leaves the engine `RosterEntry`'s own
`candyFamilyId` override unset, so `resolveCandyFamilyId` falls back to
`species.candyFamilyId`, which is `undefined` for every real mega/primal
species (confirmed in `rosterPlanner.ts`'s own doc comment). Resolving a
mega's BASE species' family automatically is a real, deferred enhancement —
documented as a known gap in the candy-editor's own caveat text, not
silently left unexplained.

**`react-hooks/exhaustive-deps` fired on a NEW `useMemo` that spread
`{...assumptions}` in its body but listed only individual sub-fields in its
deps array** — fixed by hand-picking every field explicitly (mirroring the
pre-existing `optimizerAssumptions` memo's own convention just above it in
the same file) instead of spreading the whole object. This is a DIFFERENT
lint rule from the two CLAUDE.md names by count (`react-hooks/
static-components`/`react-hooks/set-state-in-effect`, "three as of
2026-09-08") — not explicitly forbidden to add to, but fixed anyway since it
was trivial and the codebase already treats spreading a whole tracked object
into a narrowly-keyed memo as an anti-pattern elsewhere.

**Real, reproducible Playwright false-positive found while verifying: with
the host's C: drive at ~35 MB free, `npx playwright test` (the default
`fullyParallel: true` config) failed 9 of 11 pre-existing tests, INCLUDING
tabs my change never touched (`comparator`, `species-report`)** —
`net::ERR_INSUFFICIENT_RESOURCES` console errors and 20-30s timeouts on
otherwise-correct pages (confirmed via the failure snapshots: full, correct
DOM content, just an extra console.error or a slow-to-render heavy sim under
resource contention). `npx playwright test --workers=1` (serial) passed all
11 cleanly in 8.8s. **How to apply:** on a disk/CPU-constrained host, always
retry a failing Playwright run with `--workers=1` before concluding a real
regression exists — a parallel run failing broadly across UNRELATED tabs is
itself the tell that it's resource contention, not the diff. Confirmed
current free space via `Get-CimInstance Win32_LogicalDisk` per
[[blocker_disk_full_playwright_task]]'s own habit — did NOT attempt to
reclaim space by deleting anything outside my own generated
`test-results`/scratch files.

**Full real-browser proof of the new feature**, via a scratch Playwright
script (`packages/web/scratch_multiraid_e2e.mjs`, created + run + deleted,
never committed — same "scratch script inside `packages/web`" precedent as
[[feature_roster_optimizer_phase1_csv_import]], since Node ESM resolves
`playwright` relative to the script's own location): loaded the tab
(single-raid default unchanged) → switched to multi-raid (boss set
auto-populated, 13 real active bosses) → pasted the real
`import/test/pokeGenieSample.csv` fixture → clicked "Run sweep" → got a real
30-row ranked table → built a share link, confirmed the roster-not-shared
warning text is present near the Share section → opened that link in a
FRESH `browser.newContext()` (genuinely no localStorage, not just a
same-tab reload) and confirmed the exact "no roster imported" empty state
renders, never a silent empty result. Zero console/page errors throughout.

**Measured wall clock**: hand-built 6-entry pool × 3 bosses ~305ms; a
realistic 160-species pool × 13 active bosses (today's live raid count) ~679
ms at `ROSTER_PLANNER_ITERATIONS = 25` — comfortably inside the plan's <4s
target and the CLI's own 988ms/164-entry/13-boss measurement was in the same
order of magnitude.
