---
name: feature-species-report-tab
description: Building the third "Species Report" reverse-lookup tab (SpeciesReportView.tsx) over the already-built engine's runSpeciesReverseLookup — the ComparatorPrefill hand-off mechanism, why SpeciesReportScenario's codec lives in packages/web (not engine, unlike TeamScenario), and scope decisions on which assumptions to expose
metadata:
  type: project
---

Built 2026-09-06, full read of `proposal_species_reverse_lookup.md` (pogo-researcher's design)
plus the already-built-and-tested `packages/engine/src/speciesReport.ts` (`runSpeciesReverseLookup`,
`offensiveTypeMatchup`, `typeMatchupPercentile`) before writing any UI. Zero changes to
`packages/engine` this session (confirmed via `git status --porcelain` before/after — only
pre-existing uncommitted engine work from other sessions, none of it touched by me).

**New files**: `SpeciesReportView.tsx` (the tab itself — assumption panel inlined, not a separate
file, since there's only one species to configure, unlike `TeamAssumptionPanel.tsx`'s 6-slot
roster), `speciesReportScenario.ts` (the `SpeciesReportScenario` type + base64url-JSON codec),
`comparatorPrefill.ts` (the tiny `ComparatorPrefill` hand-off type). Edited: `App.tsx` (third tab +
cross-tab prefill state), `ComparatorView.tsx` (accepts `prefill`/`onConsumedPrefill` props).

**Where `SpeciesReportScenario`'s codec lives is a real deviation from precedent, forced by the
web-developer/engine boundary.** `Scenario` lives in `packages/engine/src/scenario.ts`,
`TeamScenario` in `packages/engine/src/teamScenario.ts` — both engine-owned. But web-developer
never edits `packages/engine`, and engine-developer's already-shipped `speciesReport.ts` doesn't
define a scenario/URL-sharing type at all (correctly — that's a UI-shareable-link concern, not an
engine one). So `SpeciesReportScenario` + its `encode/decode/buildUrl/parseUrl` quartet live
entirely in `packages/web/src/speciesReportScenario.ts` instead, reusing `toBase64Url`/
`fromBase64Url` re-exported from the engine's `scenario.ts` (via `index.ts`'s `export *`) rather
than forking that transport a third time. Query param `sr` (distinct from `s`/`ts`). If a future
session needs to add ANOTHER such scenario-shaped view, this is the pattern: codec lives wherever
the type's owner does, and web-developer's own scenario types belong in `packages/web`, not
`packages/engine`, even though the two existing siblings both happen to live in the engine.

**`ComparatorPrefill` hand-off mechanism** (the "start from a Pokémon" row action → pre-fills the
comparator): a tiny standalone type in `comparatorPrefill.ts` (not defined inside `App.tsx` or
`ComparatorView.tsx`, so neither imports the other). `App.tsx` holds `comparatorPrefill` state;
clicking a row's "Compare vs. another attacker" button calls `onCompare(prefill)` →
`setComparatorPrefill(prefill); setTab("comparator")`. `ComparatorView` receives `prefill` as a
prop and consumes it ONLY in its `useState` lazy initializer
(`useState<Assumptions>(() => initialAssumptions(prefill))`) — this works cleanly because
`ComparatorView`/`TeamRaidView`/`SpeciesReportView` are rendered via a ternary in `App.tsx`, so
switching tabs always fully unmounts the previous view; there's no persisted-state case to worry
about. A `useEffect(() => { if (prefill) onConsumedPrefill?.(); }, [])` (empty deps, runs once on
mount) tells `App.tsx` to clear its own `comparatorPrefill` state right after — without this, a
LATER unrelated remount of `ComparatorView` (e.g. tab away and back with no new click) would
silently reapply the same stale hand-off instead of falling through to `DEFAULT_ASSUMPTIONS`/URL.
Prefill takes priority over any `?s=` URL param when both are present (a live click is a stronger,
more recent signal) — only candidate A + its moveset + the target are seeded; candidate B and
every other assumption stay at `DEFAULT_ASSUMPTIONS`, left for the player to adjust, per the
design doc's explicit "leaving candidateBId open for the player to pick."

**Scope decisions on which assumptions this tab exposes — deliberately narrower than the design
doc's full per-candidate field list, matching the task's own explicit ask
("moveset/level/IV/dodge/weather") rather than the design doc's broader inventory:**
- Included: speciesId, fast/charged move, level, IVs, dodgeModel, dodgeFastAttacks, weather, PLUS
  `bossChargedMoveFrequencySeconds` (not explicitly named in the task's list, but required —
  `SpeciesReportInputs.bossChargedMoveMeanIntervalSeconds` has no default in the engine type, so
  something has to supply it; made it a real adjustable+round-tripped field rather than a silent
  hardcoded constant).
- Deliberately EXCLUDED: `holdChargedMoveUntilSafe` and `bossStartsPrimed`/`bossStartingEnergyFraction`.
  Not in the task's explicit list, AND `bossStartsPrimed` has a genuine generalization problem for
  a multi-boss sweep that the other two tabs don't hit: `SpeciesReportInputs.bossStartingEnergy` is
  ONE shared absolute-energy number applied identically to every boss target in the sweep (see
  `speciesReport.ts`'s `runSpeciesReverseLookup` — every `runSustainedComparison` call in the
  `targets.map` loop gets the same `inputs.bossStartingEnergy`), whereas the other two tabs derive
  it as `fraction * thatOneBoss'sChargedMoveCost` (a single boss, single cost). Applying a fraction
  of "the" charged move cost doesn't make sense when 12 different bosses have 12 different charged
  move costs and the engine call only accepts one number for all of them. Didn't attempt to solve
  this (e.g. by calling the engine once per boss with a different bossStartingEnergy each time,
  which would mean not using `runSpeciesReverseLookup`'s own multi-boss loop at all) — flagging it
  here rather than silently building something that looks like the other tabs' UI but is subtly
  wrong for >1 boss with different costs. If a future session wants this control back, either the
  engine needs a per-target `bossStartingEnergy` override, or the fraction needs to be defined
  against something boss-invariant (e.g. flat % of 100 max energy, not % of "the" cost).

**Design-doc ambiguities resolved without asking, both because the actual task instructions
(passed down from the overseer) were more specific than the design doc on these two points:**
1. The design doc recommends this view be "the front door" / first tab a player lands on. The
   task instead explicitly said "add this as a THIRD tab reusing that scaffold" — followed the
   task's literal instruction (third peer tab, not a new default landing view) since it's the more
   specific/recent instruction and reordering the existing default tab wasn't asked for.
2. The design doc's per-boss table sketch lists "mega/primal boost badge" as a row-level column
   even though the fact itself (`hasMegaBoost`/`boostMultiplier`/`boostedType`) is a property of
   the SELECTED SPECIES, not of each boss row — so every row shows the identical badge. Built it
   literally as a column per the explicit task ask ("boss name, type-matchup percentile, sustained
   mean damage/TDO, mean survival seconds, and a mega-boost badge... — a ranked results table"),
   even though it reads a little redundant across 12 identical-badge rows; didn't invent a
   different placement (e.g. species-header-only) since the task named it as a table column
   specifically.

**"New result metrics get a comparison" convention doesn't map literally onto this view** — that
project convention is about a two-candidate result CARD (a ratio sentence between candidate A and
B). This view has no second candidate (see the design doc's section 2 — that's the whole point of
why it's a reverse lookup, not a flip-point comparator). Built the closest honest analog instead: a
one-line note on whether the two independent rankings this table offers (survival-weighted
sustained-damage sort vs. the cheap type-only percentile sort) agree or disagree on the #1 boss —
a real, cheap, non-fabricated comparison, explicitly commented in the code as NOT the same thing
as the two-candidate ratio sentence, so a future reader doesn't mistake the absence of a ratio
sentence here for an oversight.

**Verification this session**: `npx tsc --noEmit` clean, `vite build` succeeded (pre-existing
chunk-size warning only), `npm run test:engine` 18 files/126 tests green (proves zero accidental
engine edits despite substantial OTHER pre-existing uncommitted engine work already in the tree
from prior sessions). No browser-preview tool available in this session's actual tool grant
(Read/Write/Edit/Bash/Grep/Glob only, matching [[verification-without-browser-tool]]'s standing
note) — ran `vite preview` + curled root and both asset paths for 200s, `node --check` on the
downloaded JS bundle, and grepped it for shipped-code evidence (`"Species Report"`, `"Compare vs.
another attacker"`, `"Sort: sustained mean damage"`, `"Ranked against"`, `"type-matchup
percentile"`). For actual data-flow correctness (not just "it compiles and loads"), used the
scratch-script technique: a throwaway `.mts` dropped in `packages/web/src/` and run via `npx tsx`
(relative-import-required precedent, see [[verification-without-browser-tool]]) that (1) called
`runSpeciesReverseLookup` for `kartana` against the real 12-boss active raid roster and confirmed
sane, non-NaN, non-zero damage/survival numbers across all 12 rows, sorted the top 3 by damage, and
printed each row's type-matchup percentile; (2) round-tripped a full `SpeciesReportScenario`
(non-default values on every field, including a non-null `dodgeModel.missedFraction` and non-"none"
weather) through `buildSpeciesReportScenarioUrl`/`parseSpeciesReportScenarioFromUrl` and confirmed
`JSON.stringify(decoded) === JSON.stringify(scenario)` true. Deleted the scratch file afterward and
confirmed via `git status --porcelain` that only this session's intended new/edited web files
remain (no stray scratch file, no engine changes). Did NOT click through the UI in a real rendered
browser (no such tool available) — this is a real gap relative to the task's "click a row to
confirm hand-off" ask; the hand-off logic itself is simple/type-checked/traced by hand
(`initialAssumptions(prefill)` construction reviewed line-by-line) but wasn't observed rendering.
