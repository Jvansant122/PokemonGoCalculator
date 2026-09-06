---
name: bugfix-species-report-sortmode-not-serialized
description: Species Report tab's sort-mode toggle (damage vs type-matchup percentile) was plain useState, never part of SpeciesReportScenario, so it silently reverted on a shared link — a display-only setting is still a scenario field
metadata:
  type: project
---

Fixed 2026-09-06, found by a `skeptic` audit of the live Species Report tab. The bug: `sortMode`
lived in `SpeciesReportView.tsx` as its own `useState<SortMode>("damage")`, completely outside
`SpeciesReportAssumptions`/`SpeciesReportScenario` — so `assumptionsToScenario`/
`scenarioToAssumptions` never touched it, and a "Build link" share URL always encoded/decoded
without it, silently resetting the table to the default sort on load even though every other field
(species, IVs, dodge, weather, etc.) round-tripped fine.

**Why this slipped past the original build**: the "New result metrics get a comparison" /
"assumptions always visible" project conventions are both framed around simulation *inputs* that
affect a computed result. A pure display/sort toggle doesn't affect `runSpeciesReverseLookup`'s
output at all — it only reorders already-computed rows — which made it easy to mentally file as
"UI state" rather than "a setting," even though CLAUDE.md's own rule is "every user-facing
setting," full stop, with no carve-out for display-only ones. Worth remembering for the OTHER two
tabs too: audit any bare `useState` in `ComparatorView.tsx`/`TeamRaidView.tsx` that toggles what's
*shown* rather than what's *simulated* — same blind spot could exist there.

**Fix, following the add-scenario-assumption checklist exactly, adapted for the fact this
scenario's codec lives in `packages/web` not `packages/engine`** (see
[[feature_species_report_tab]] for why): added `export type SpeciesReportSortMode = "damage" |
"typeMatchup"` to `speciesReportScenario.ts` (not left as a locally-scoped type in the view file,
since the scenario type now needs it too — single source of truth), added `sortMode:
SpeciesReportSortMode` to both `SpeciesReportScenario` and `SpeciesReportAssumptions`, wired both
directions of `assumptionsToScenario`/`scenarioToAssumptions` (with the standard `s.sortMode ??
DEFAULT_ASSUMPTIONS.sortMode` guard for pre-existing shared links that predate this field), added
it to `DEFAULT_ASSUMPTIONS`, and **deleted the standalone `useState<SortMode>`** — the two toggle
buttons now call `setAssumptions({ ...assumptions, sortMode: "damage" | "typeMatchup" })` and read
`assumptions.sortMode` instead of separate component state. No engine call to thread it into
(checklist step 6 is genuinely N/A here — this is exactly the kind of setting that "doesn't reach
that deep," per the skill's own text) since it only affects `sortRows`'s client-side reordering,
never `runSpeciesReverseLookup`'s inputs.

**No permanent automated test added** — `packages/web` has zero test infrastructure (no vitest
devDependency, no `test` script in its `package.json`; only `packages/engine` runs vitest, hoisted
to root `node_modules`). Introducing a test runner into `packages/web` for one bug fix felt like
overreach beyond this task's scope, and `verify-and-ship`'s pipeline doesn't call any web-test step
either, so a new test file would sit unrun by anything anyway. Used the established scratch-script
technique instead (per [[verification_without_browser_tool]]): a throwaway `.mts` dropped in
`packages/web/src/` (still required there, not a temp dir, for relative-import resolution) run via
`npx tsx`, asserting (1) a full `SpeciesReportScenario` with `sortMode: "typeMatchup"` round-trips
byte-for-byte through `encodeSpeciesReportScenario`/`decodeSpeciesReportScenario`, (2) the same
through the real `buildSpeciesReportScenarioUrl`/`parseSpeciesReportScenarioFromUrl` share-link
path, and (3) `sortMode: "damage"` round-trips explicitly too (not just as the fallback default —
proving the field is actually transmitted, not merely defaulted every time). All passed; deleted
the scratch file after. If `packages/web` ever gains real test infra for another reason, this is
the first thing that should get a permanent test alongside it.

**Verification this session**: `npx tsc --noEmit` clean in `packages/web`, `npm run test:engine`
still 18 files/126 tests green (zero engine edits — confirmed via `git diff` scoped to only the two
intended files), `npm run build --workspace=packages/web` succeeded (pre-existing chunk-size
warning only). Also ran `vite preview`, curled root/JS/CSS asset paths for 200s, `node --check`ed
the bundle, and grepped it for both literal button labels ("Sort: sustained mean damage", "Sort:
type-matchup percentile") to confirm the toggle UI actually shipped. No browser-preview tool
available in this session's tool grant (Read/Write/Edit/Bash/Grep/Glob only) — did not click through
the live toggle + copy-link + fresh-tab-reload flow in an actual rendered browser; the fix is
verified by direct codec-level round-trip proof plus static/bundle checks, not by observed
rendering.
