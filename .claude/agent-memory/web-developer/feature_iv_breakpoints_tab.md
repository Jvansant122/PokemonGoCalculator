---
name: feature-iv-breakpoints-tab
description: Building the fourth "IV Breakpoints" tab (IvBreakpointsView.tsx) over engine-developer's already-built compareIvSpreads — the simplified fast-move-only combat model breakpoints.ts's timeToFaint uses, no engine damage-modifier helper to call (had to replicate runSustainedComparison's inline construction using exported primitives instead), and empirical proof of the non-monotonic-divergence caveat
metadata:
  type: project
---

Built 2026-09-06, full read of `packages/engine/src/ivComparison.ts` (already implemented and
tested by engine-developer — `compareIvSpreads`) before writing any UI. New files:
`IvBreakpointsView.tsx` (the tab itself, assumption panel inlined like SpeciesReportView.tsx —
one species to configure, not a 6-slot roster) and `ivBreakpointsScenario.ts` (the
`IvBreakpointsScenario` type + base64url-JSON codec, query param `ivc`). Edited: `App.tsx` (fourth
tab), `styles.css` (`.field-group-label`, `.iv-cell-diverges`, `.iv-cell-winner`). Zero changes to
`packages/engine`.

**There is no standalone "compute the damage-modifier objects" helper to import** — despite the
task instructions saying to reuse one. `comparison.ts`'s `runComparison`/`runSustainedComparison`
build their `fastDamageOut`/`chargedDamageOut`/`damageOut` objects INLINE, not via an exported
function. What IS exported and reusable are the PRIMITIVES those inline blocks call:
`typeEffectiveness` (typeChart.ts), `isWeatherBoosted` (weather.ts), `bossEffectiveStats`/
`resolveMove` (comparison.ts). `compareIvSpreads` needs pre-built `DamageInputs`-shaped modifier
objects as params (it doesn't build them itself, unlike runSustainedComparison), so
`IvBreakpointsView.tsx` replicates the exact same three-line `{ stab, typeEffectiveness,
weatherBoosted }` construction comparison.ts uses internally, calling those same exported
primitives — this satisfies "reuse rather than hand-roll type effectiveness" even though there's
no single function boundary to point at. Future sessions building another `ivComparison.ts`-style
consumer should expect the same: check comparison.ts's own inline construction as the reference
implementation, not a nonexistent shared builder function.

**Only ONE dodge control needed, not two** — `breakpoints.ts`'s `timeToFaint` (which
`compareIvSpreads` wraps) has no `dodgeFastAttacks` concept at all, unlike
`SustainedComparisonInputs`. Its `DodgeBehavior` doc comment claims to govern "the boss's CHARGED
attacks specifically" but the actual implementation applies `dodgeMultiplierForHit` to the boss's
FAST-move hits (the only attack type this simplified per-level model has, since it never models
charged-move combat on either side) — a real doc/implementation mismatch worth flagging but NOT
something to fix here (read-only against packages/engine). Didn't build a second
"dodgeFastAttacks" toggle the other three tabs have; this one control does the whole job for this
model.

**No boss charged-move picker either** — `compareIvSpreads` doesn't take a boss charged move at
all (only `bossFastMovePower`/`bossFastMoveDurationSeconds`/`bossAttackStat`). This is a
genuinely simpler model than the full stepwise simulator the other three tabs use, and the UI's
caveats section says so explicitly (worth restating to a future reader: don't try to add a
charged-move sweep here without first re-reading `timeToFaint`'s actual loop, which is a
"repeated fast-move hits forever" model with no charged-move phase whatsoever).

**Empirically confirmed the non-monotonicity warning is real, not just theoretical** — a scratch
script comparing Delphox 14/15/15 vs 15/13/15 against Mega Steelix found 13 of 79 levels
diverging in at least one dimension (`firstDivergenceLevel` = {fastMoveDamage: 19.5,
chargedMoveDamage: 1, timeToFaint: 8.5}), AND confirmed a diverge-then-close pattern actually
occurs for all three dimensions in this one real run (a loop checking "does a `true` row ever
appear before a later `false` row for the same flag" returned true for all three). This justifies
the headline sentence's careful "first becomes different at level X, not a permanent split"
wording rather than "from level X onward" — a reader who saw only the headline would otherwise
draw a wrong conclusion for roughly 1 in 6 levels in this exact matchup.

**Chose `steelix-mega` as the default target, not the `latios-mega` other tabs used** — grepped
`data/normalized/activeRaids.json` fresh rather than trusting older memory notes citing
`latios-mega`; the live raid roster had already rotated (Mega Steelix, Mega Skarmory, Mega Aggron,
Mega Glalie, several Shadow 1/3-star, Shadow Giratina Altered 5-star, two `speciesId: null`
entries as of this session). Picked `steelix-mega` (non-approximate, currently active Mega Raid)
as a real, resolvable, non-degenerate matchup for Fire/Psychic Delphox. A reminder for future
sessions: always re-check the live `activeRaids.json` content directly rather than assuming an
older memory's named default species is still on the current raid roster — it rotates.

**Verification performed**: `npx tsc --noEmit` clean in packages/web, `npm run build
--workspace=packages/web` succeeded (same pre-existing >500kB chunk-size warning, no new error),
`npm run test:engine` 19 files/130 tests green (confirms zero accidental engine edits — this
session's own diff touches only the four web/memory files listed above; the already-uncommitted
`ivComparison.ts`/test/index.ts/engine-developer-memory changes in the tree predate this session
and were not touched by it). No browser-preview tool in this session's tool grant (confirmed
against the literal `<functions>` list, per [[verification-without-browser-tool]]) — ran the full
ladder instead: `vite preview` on port 4321, curled root/JS/CSS for 200s, `node --check`ed the
built bundle, and grepped it for shipped-code evidence ("IV Breakpoints", "Spread A", "first
becomes different at level", "steelix-mega"), all found. For actual data-flow correctness (not
just "it compiles and loads"), used the scratch-script technique: a throwaway `.mts` dropped in
`packages/web/src/` run via `npx tsx` (relative-import-required precedent) that called
`compareIvSpreads` end-to-end for the real default Delphox-vs-Steelix-mega matchup (see the
non-monotonicity finding above) AND round-tripped a full `IvBreakpointsScenario` with non-default
values on every field (including a non-"none" dodge kind, non-"none" weather, explicit move ids)
through both the raw codec and the `buildIvBreakpointsScenarioUrl`/`parseIvBreakpointsScenarioFromUrl`
share-link path, including the `view=iv-breakpoints` param stamp App.tsx's real handleShare adds —
all three round-trips (`codec`, `buildUrl/parseUrl`, `url+view`) produced
`JSON.stringify(decoded) === JSON.stringify(original)` true. Deleted the scratch file and the
preview server's log/bundle copies afterward; confirmed via `git status --porcelain` that only the
four intended new/edited files remain. Did NOT click through the live rendered tab in an actual
browser (no such tool available) — this is a real gap relative to a full manual QA pass; the
codec/data-flow correctness is proven numerically, but the table's visual rendering (cell
highlighting, colspan layout) was reviewed by hand, not observed.
