---
name: feature-attack-defense-breakpoints-tab-and-move-type-colors
description: Building the fifth tab (AttackDefenseBreakpointsView.tsx) over engine-developer's already-built attackDamageGrid/defenseDamageGrid, plus the separate move-type-color addition to the shared MoveSelect.tsx that touches every tab at once
metadata:
  type: project
---

Built 2026-09-06, per `PLAN_attack_defense_breakpoints.md` (repo root). Engine side
(`attackDamageGrid`/`defenseDamageGrid`/`DamageGridCell` in `breakpoints.ts`, already re-exported)
was done by `engine-developer` before this session started — read it in full before writing any
UI, same discipline as the IV Breakpoints tab build (see [[feature-iv-breakpoints-tab]]).

**New files**: `attackDefenseBreakpointsScenario.ts` (scenario type + codec, query param `adb`),
`attackDefenseBreakpointsHelpers.ts` (`LEVELS_25_TO_50` ascending-then-reversed-for-display
constant mirroring `ivBreakpointsHelpers.ts`'s `LEVELS_35_TO_50`, plus `IVS_0_TO_15`),
`BreakpointSheet.tsx` (one reusable table component for all 4 sheets — attack-fast,
attack-charged, defense-fast, defense-charged), `AttackDefenseBreakpointsView.tsx` (the tab, kept
as ONE file including its own inline assumption-panel JSX rather than splitting out a fifth
`XAssumptionPanel.tsx` — followed `SpeciesReportView.tsx`'s "inline is fine for a single-species
tab" precedent, not `IvBreakpointsView.tsx`'s split-out-panel precedent, since this tab's panel is
simpler: one species, one target, no dual-spread inputs), `typeStyles.ts` (new, for Part B below).
Edited: `App.tsx` (fifth tab), `MoveSelect.tsx` + `styles.css` (Part B), zero
`packages/engine` changes.

**Open judgment call #1 — dodge is OUT of scope, and this is genuinely different reasoning than
IV Breakpoints' dodge inclusion**: IV Breakpoints models repeated-fast-move survival over time, so
a dodge fraction has something to multiply. This tab's `DamageGridCell` is one isolated hit's
damage at one IV/level cell — there is no "over time" quantity anywhere in a static grid for a
"fraction of hits dodged" to reduce. Documented this explicitly in both
`AttackDefenseBreakpointsScenario`'s doc comment and the view's own caveats section — a real
scope decision with a real reason, not a silent omission.

**Open judgment call #2 — move-type color-vs-icon: chose color (swatch) + text tag, not an
icon/emoji.** A colored left-border on `MoveSelect.tsx`'s wrapping `.field` div, keyed off the
*currently resolved* move's `.type` via a new `TYPE_COLORS: Record<PokemonType, string>` map in
`typeStyles.ts` — handles "visible on the closed control." Separately, every `<option>`'s text now
gets a `[Fire]`-style bracketed prefix inside `optionLabel()` — handles "distinguishable inside the
open dropdown list," since native `<option>` background-color styling is unreliable cross-browser
(confirmed via the plan's own reasoning, didn't need to re-litigate this). Both pieces are additive
to `optionLabel()`'s existing DPS/energy/efficiency text, not a replacement. Because `MoveSelect.tsx`
is the ONE shared component every tab's move pickers route through, this one edit shows up in all
five tabs simultaneously — verified by grepping the built bundle for both the swatch class
(`move-select-field`) and confirming `optionLabel` is not tab-scoped.

**`bossEffectiveStats(boss, bossRaidTier)` needs the SAME live-tier resolution as IV
Breakpoints**, not a bare `bossEffectiveStats(boss)` call — initially wrote it without the tier
argument and caught it before shipping; without it, a currently-active raid boss's real tier
(e.g. steelix-mega's "Mega Raids") silently falls back to the engine's own
`defaultRaidTierForSpecies` default instead of using the live tier `raidTierForSpeciesId` already
resolves. Both the Attack-mode call (boss's effective Defense) and Defense-mode call (boss's
effective Attack) need this `bossRaidTier` threaded through, and it needs to be in the `useMemo`
dependency array too.

**Default matchup (delphox vs steelix-mega, reused from IV Breakpoints, confirmed still live in
`data/normalized/activeRaids.json` this session) produces a DEGENERATE fast-move sheet by
default**: delphox's first-registered fast move is "Scratch" (Normal-type, power 6) — against
steelix-mega's very high Defense (270 effective), the damage formula floors to a flat `2` across
every single IV x level cell in the whole 25-50 x 0-15 grid (0 breakpoints). This is NOT a bug —
verified the formula's actual inputs numerically (typeEffectiveness 0.625, stat range 153-205, all
producing `floor(...) + 1 == 2`) — it's just a boring real result for a filler move against a
tanky boss. The charged-move sheet (delphox's real attacking move, e.g. Flamethrower/Fire
Blast/Psychic) shows 86 real breakpoints out of 800 possible transitions for the same matchup,
proving the pipeline and the breakpoint-highlight logic both work correctly once a move actually
has enough power to matter. Don't be alarmed by an all-flat sheet for a specific
species/move/target combo — check the move's power first before assuming a computation bug.

**Breakpoint-cell highlight rule**: a cell is marked (`.breakpoint-cell-changed`, blue background +
bold in `styles.css`) when its damage differs from the SAME row's cell at the previous ASCENDING
level actually in the scanned array (i.e. 0.5 lower, not necessarily the display-adjacent column
since the table renders descending) — the lowest scanned level (25) in every row is never marked,
nothing to compare against within this table's own range. `BreakpointSheet.tsx` builds a
`Map<iv, Map<level, cell>>` once per render for O(1) lookups; the `levelsAscending.indexOf(level)`
call inside the per-cell render loop is O(n) but n=51 so total cost (51x51x16x4 sheets) is cheap
enough not to bother memoizing further.

**IV/level row-column order, both an implementer's call the plan left open**: IV rows render
descending (15 at top), levels render descending (50 at left, per the plan's explicit spec) — both
axes put the "most invested" value first, for a spreadsheet reading order. The underlying
`attackDamageGrid`/`defenseDamageGrid` calls always pass `IVS_0_TO_15`/`LEVELS_25_TO_50` ASCENDING
(matching `IvBreakpointsView.tsx`'s "compute ascending, reverse only for display" convention) —
`BreakpointSheet.tsx` does the reversal internally for its own rendered column/row order, so the
raw grid data passed around everywhere else stays in a stable, order-independent shape.

**Verification performed**: `npm run test:engine` 147/147 passing (no engine files touched this
session besides what engine-developer had already changed before handoff). `npx tsc --noEmit -p
tsconfig.json` clean in both packages. `npm run build --workspace=packages/web` succeeded (same
pre-existing >500kB chunk warning, no new errors). No browser-preview tool in this session's grant
(Read/Write/Edit/Bash/Grep/Glob only, per [[verification-without-browser-tool]]) — ran the full
ladder: `vite preview` on port 4399, curled root/JS/CSS for 200s, `node --check`ed the built
bundle, grepped it for shipped strings ("Attack/Defense Breakpoints", "Attack Breakpoints",
"Defense Breakpoints") and CSS classes ("breakpoint-cell-changed", "move-select-field") — all
found. For actual data-flow correctness (not just "it compiles and loads"), used the
scratch-script technique three times (all deleted after, `git status --porcelain` confirmed clean
afterward): (1) `LEVELS_25_TO_50`/`IVS_0_TO_15` shape (51 and 16 entries respectively, correct
bounds), a full `AttackDefenseBreakpointsScenario` round-trip through the raw codec AND
`buildUrl`/`parseUrl` with the `view=` stamp on every field including the new `bossChargedMoveId`,
plus a simulated "old link missing bossChargedMoveId" JSON blob proving it decodes to `undefined`
(the `?? DEFAULT_ASSUMPTIONS.bossChargedMoveId` guard in `scenarioToAssumptions` is what prevents
that from reaching a controlled input) — all round-trips exact-equal; (2) diagnosed the flat
fast-move-sheet finding above; (3) confirmed 86 real breakpoints exist on the charged-move sheet.
Did NOT click through the live rendered tab in an actual browser — same real gap as every prior
IV/Species-Report tab build in this project's history, not closed by this session either.
