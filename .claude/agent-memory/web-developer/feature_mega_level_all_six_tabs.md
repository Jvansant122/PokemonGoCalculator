---
name: feature-mega-level-all-six-tabs
description: Mega Level dropdown (Base/High/Max/Super Max) added to all six tabs plus "+" move confidence badges — shared MegaLevelSelect/PlusMoveBadge components, the TeamRaidSlotInput null-vs-undefined gotcha, why multi-raid's roster-wide setting was shipped honestly inert, real synced "+" move data found mid-task
metadata:
  type: feedback
---

Done 2026-09-09/10, Phase 3 of 3 (engine-developer shipped `packages/engine/src/megaLevel.ts` and
its own tests first; data-sync authored the curated "+" move data in the same window — both
landed, uncommitted, in the working tree before I started). Web-only: never touched
`packages/engine`/`scripts`/`data`.

**Per-tab field names chosen** (all mirror the engine/existing-sibling-field naming exactly, no
renames):
- Comparator: `Assumptions.candidateMegaLevel: [MegaLevel|null, MegaLevel|null]`, direct passthrough
  to `Scenario.candidateMegaLevel` (already existed on the engine type, required not optional —
  still gets `?? DEFAULT_ASSUMPTIONS.candidateMegaLevel` on decode, same as `candidateDodge`'s
  precedent: a "required" field on `Scenario` is still missing at runtime from a link encoded
  before it existed, TS's static requiredness doesn't survive JSON.parse).
- Team Raid: `TeamSlotAssumption.megaLevel: MegaLevel|null` per slot, direct to
  `TeamScenarioSlot.megaLevel` (also already required on the engine type). Required ADDING
  `megaLevel` to `TeamScenarioSlotWithShadow` (the web-side extension-type-trick interface) too —
  it's a SEPARATE interface from the engine's own `TeamScenarioSlot`, so the field has to be
  declared twice (once on each), not just once.
- Species Report: single `SpeciesReportAssumptions.megaLevel: MegaLevel|null` (web-owned
  `SpeciesReportScenario` gets it as `megaLevel?: MegaLevel|null`, following
  `bossChargedMoveCadence`'s exact optional-field convention since this type isn't an engine
  extension). Had to add it to `sweepInputs`'s useMemo (both the object AND its dependency array)
  or changing Mega Level wouldn't re-trigger the debounced sweep.
- IV Breakpoints: single `IvBreakpointsAssumptions.megaLevel`, passed straight through as
  `compareIvSpreads`'s own `megaLevel` param (that function does its own internal
  `resolveCandidateMegaLevel` gate — the run module doesn't need to call it separately, unlike
  Attack/Defense Breakpoints below).
- Attack/Defense Breakpoints: single `AttackDefenseBreakpointsAssumptions.megaLevel`, applied in
  BOTH modes (attack: shifts species' own Attack-stat lookup + scales a selected "+" charged move
  via `chargedMoveAtMegaLevel` before reading `.power`; defense: shifts species' own Defense-stat
  lookup only, boss's incoming moves are NEVER scaled — a raid boss has no Mega Level concept
  anywhere in this tool). Unlike IV Breakpoints, `attackDamageGrid`/`defenseDamageGrid` do NOT
  self-gate on `species.boost` — the RUN MODULE must call `resolveCandidateMegaLevel` itself
  before passing `megaLevel` down, and must call `chargedMoveAtMegaLevel` itself before reading
  `chargedMove.power` (that engine function only ever touches the stat-lookup level shift, never
  a move's power — see its own doc comment, "power is always the caller's job").
- Power-Up Optimizer single-raid: `PowerUpSlotAssumption.megaLevel: MegaLevel|null` per slot,
  mirrors Team Raid exactly (`PowerUpSlotInput extends TeamRaidSlotInput`, which already carries
  `megaLevel` and already gets forwarded into the full team-raid re-simulation via
  `toTeamRaidSlots` — engine-developer's own doc comment there already flagged this as
  intentional). Power-Up Optimizer multi-raid: see the dedicated section below.

**A real, reusable type-shape gotcha, hit twice**: `TeamRaidSlotInput.megaLevel` (engine) is typed
`MegaLevel | undefined` — no explicit `| null` — while every web-side `Assumptions` field for the
same concept is `MegaLevel | null` (matching every other nullable field's convention on this
project). Both mean the identical "no investment assumed" thing at every consumer
(`resolveCandidateMegaLevel`/`effectiveLevelForMegaLevel` treat null/undefined the same), but TS
won't structurally accept a `null` where only `undefined` is declared. Fix at BOTH call sites that
build a `TeamRaidSlotInput` from a web slot (`run/runTeamRaid.ts` and `run/runPowerUpOptimizer.ts`'s
`optimizerInputs.slots.map`): `megaLevel: s.megaLevel ?? undefined`. Pure type-shape conversion,
not a behavior change — but a future feature touching this same field on a THIRD call site should
expect the identical friction.

**Shared components**: `megaLevelSelect.tsx` (`MegaLevelSelect` — self-gates on
`canHaveMegaLevel(species)` = `!!species?.boost`, renders nothing for a non-mega species, exactly
matching `resolveCandidateMegaLevel`'s own gate; a `forceVisible` prop skips that gate for the ONE
roster-wide case with no single species to check) and `PlusMoveBadge.tsx` (`PlusMoveBadge` for a
real `<span>` badge next to `MoveSelect`'s label, `plusMoveOptionTag` for the plain-text
`<option>`-list equivalent since a native `<select>`'s dropdown can't render HTML, and
`plusMoveScalingCaveat` for the separate "+10%/tier curve is ALSO an estimate" sentence). Three CSS
classes (`badge-plus-official`/`-crosssite`/`-estimate`) reuse EXISTING hues rather than inventing
new ones — `--info` blue (matches `.badge-persists`, an existing "confirmed mechanic" badge),
dashed slate (matches `.badge-past-researched`'s own "weaker evidence reads dimmer" convention),
`--warn` red (matches `.badge-approximate`, the existing "no better data exists" badge) — so the
RELATIVE trust ordering reads from color alone without a legend.

**Explicit design call: gate on `species.boost` directly, NOT `hasActiveBoost`.** The task's own
wording pointed at `AssumptionPanel.tsx`'s existing `hasActiveBoost(species, disabled)` helper as
"already has the helper for this," but that helper ALSO requires the per-candidate
"disable mega/primal boost" checkbox to be off. Mega Level's engine-side gate
(`resolveCandidateMegaLevel`) is `species.boost` truthy ONLY — it is NOT affected by that checkbox
at all (a completely separate mechanic: CP bump / "+" move vs. the own-damage boost multiplier).
Gating the dropdown's visibility on `hasActiveBoost` would have hidden a control whose value still
silently applied whenever "disable boost" was checked — the exact "control invisible but not
inert" bug this project's rules warn against, just inverted. Wrote `canHaveMegaLevel` as its own
tiny helper instead of reusing `hasActiveBoost`; flagged the reasoning in both this memory and the
component's own doc comment so it doesn't get "corrected" back to `hasActiveBoost` later.

**Power-Up Optimizer multi-raid: shipped a roster-wide `multiRaidMegaLevel` control that is
CURRENTLY INERT, and said so loudly rather than skipping it.** `rosterPlanner.ts`
(`runRosterPlanner`/`planRosterBudget`) has ZERO Mega Level channel at all — not per-entry (unlike
single-raid's `PowerUpSlotInput`), not roster-wide, nothing; `RosterEntry` has no `megaLevel`
field and `toSlotInput` doesn't set one on the `TeamRaidSlotInput` it builds. This is a STRICTLY
BIGGER gap than the already-known "ladder assumes Base" mismatch (which still lets the real
simulated numbers be correct) — here NOTHING about a multi-raid mega/primal entry's Mega Level
ever reaches any engine call. Given the task explicitly named `rosterPlanner.ts` in its "known gap
to surface" section (proving the author already knew), the call was: build the control anyway
(scenario field + UI + round-trip, all fully wired for storage/sharing), but label it in TWO
places — right next to the control itself, and again in the multi-raid results section — with an
unmissable "NOT YET APPLIED" warning in `--warn` red, explicit about WHY (no engine input channel
at all, more total than single-raid's gap). Never attempted a workaround (e.g. stuffing an
undeclared field onto `RosterEntry`) — `toSlotInput`'s explicit field enumeration means even a
successful type-cheat wouldn't reach `TeamRaidSlotInput` anyway. This is `engine-developer`'s call,
not mine to route around.

**Real synced "+" move data landed mid-task** (data-sync's parallel work, uncommitted): Beedrill
Mega's `FELL_STINGER_PLUS` ("Fell Stinger+", `official` confidence, base power 140) was already in
`data/normalized/species.json` by the time I verified. Used it for genuine end-to-end proof instead
of a synthetic fixture: `chargedMoveAtMegaLevel` scaled it to exactly 140/154/168/182 across
base/high/max/super-max (140 × 1.0/1.1/1.2/1.3, confirming the multiplier table is wired
correctly), and running it through `runComparatorScenario` at Base vs. Super Max nearly DOUBLED
the candidate's charged damage (420 → 828, combining the CP bump AND the "+" move scaling) — a
much stronger, more legible proof than a synthetic move would have given, and worth checking for
on any future task that lands alongside a data-sync change (`grep -n "isPlusMove" data/normalized/species.json`
before reaching for a hand-built fixture).

**Verification depth this session**: `tsc --noEmit -p packages/web/tsconfig.json` clean,
`check-scenario-roundtrip` all 6 tabs (113 fields total), full `test:web` (178/178, including all
6 tabs' new non-default round-trip test cases), `lint` (0 errors, the 1 pre-existing
`SpeciesPicker.tsx` warning untouched), production build clean, full 14-test Playwright suite
(added a NEW real-browser Mega Level share-link round-trip test on Team Raid's default
`latios-mega` slot — mirrors `share-link.spec.ts`'s existing per-candidate-dodge-override pattern;
Team Raid's own default roster already fields a real mega, unlike the Comparator's two non-mega
defaults, so no species-picker setup step was needed). Then ran the FULL `npm run verify` (not
just my own package's slice) specifically BECAUSE `packages/engine`/`data/` had extensive
already-uncommitted changes from engine-developer's/data-sync's own already-landed work sitting in
the same working tree — wanted to confirm the three parallel contributions actually integrate, not
just that my own slice compiles in isolation. Fully green: 387 engine tests (including
`test/megaLevel.test.ts` 22 tests and `test/megaLevelPowerUpCeiling.test.ts` 6, confirming
engine-developer's own suite), 184 script tests (including `scripts/sync-data/test/superMaxPlusMoves.test.ts`
20 tests, confirming data-sync's own suite), 178 web tests, full typecheck, lint, all 4 checkers
(including `check-mega-gates`: 0 fragile species), and the production build. A genuinely clean
3-way parallel-session integration, not just an isolated pass.
