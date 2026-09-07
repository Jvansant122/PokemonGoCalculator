# Plan: Attack/Defense Breakpoint Sheets tab

Self-contained implementation plan for a fresh Claude Code session (this repo has
project-specific subagents in `.claude/agents/` — route work to them per `CLAUDE.md`'s
"Subagents and routing" section rather than hand-implementing across package boundaries).
Read `CLAUDE.md` in full first; it holds standing product decisions that apply here too
(no user-selectable combat phase, mega boost `1.3` is load-bearing, every user-facing
assumption must round-trip through a `Scenario`-family type, etc.).

## The ask, verbatim intent

A new tab, started as a duplicate of the existing **IV Breakpoints** tab
(`packages/web/src/IvBreakpointsView.tsx` and friends), but functionally different:

- Instead of comparing two full IV spreads (attack+defense+stamina) of one species, this
  tab has a toggle between two modes: **Attack Breakpoints** and **Defense Breakpoints**.
- **Attack Breakpoints** mode: shows the chosen Pokémon's own damage output as a
  spreadsheet — rows = **Attack IV, 0 to 15**; columns = **Level, starting at 50 at the
  left/top and stepping DOWN by 0.5 to 25** (descending order, not ascending — 51 columns
  total: 50, 49.5, 49, ..., 25.5, 25). Two separate sheets, one for the species' **fast**
  move, one for its **charged** move (both use the chosen species' own moves against the
  chosen boss target's defense stat).
- **Defense Breakpoints** mode: shows damage the chosen Pokémon RECEIVES, again as two
  separate sheets (boss's fast move, boss's charged move) — rows = **Defense IV, 0 to
  15 only** (explicitly NOT Stamina IV — the user was explicit that Stamina IV is
  irrelevant to these sheets, since HP doesn't affect per-hit damage taken, only
  survival time, which is out of scope here), same descending Level columns 50->25.
- This is a **full grid** (every IV × every level cell populated), not a filtered "only
  rows where damage changes" list — though breakpoint cells (where the value changes
  from the previous cell) should probably be visually distinguished (see Open questions).

## What already exists and can be reused

- `packages/engine/src/breakpoints.ts` already has `findFastMoveBreakpoints` (attacker-side
  IV×level sweep against a fixed defender stat) and `timeToFaintTable`/`timeToFaint`
  (defender-side, but modeling survival time, not raw per-hit damage) — **neither is a full
  unfiltered grid, and neither has a charged-move variant.** `findFastMoveBreakpoints` is
  not currently imported/used anywhere in `packages/web` (confirmed by grep) — safe to
  change its shape/behavior, or leave it alone and add new functions alongside it,
  implementer's call.
- `packages/engine/src/damage.ts`'s `calculateDamage(inputs: DamageInputs)` and
  `packages/engine/src/stats.ts`'s `effectiveStat(baseStat, iv, cpm)` are the two
  primitives every breakpoint sweep in this engine is built from — both already exported.
- `packages/engine/src/cpm.ts`'s `CPM_TABLE` already has every half-level from 1 through
  50 (levels 41-50 added 2026-09-06) — the 25-to-50 range needed here needs no new CPM data.
- `packages/web/src/registry.ts` (species/target pickers, `raidTierForSpeciesId`),
  `packages/engine`'s `bossEffectiveStats`/`defaultRaidTierForSpecies`/`resolveMove`/
  `typeEffectiveness`/`isWeatherBoosted` — the exact same primitives
  `IvBreakpointsView.tsx` already uses to resolve a boss's effective attack/defense stat
  and a move's damage modifiers. Reuse these rather than re-deriving type effectiveness
  or boss-tier defaults by hand.
- The four existing tabs' pattern for a shareable scenario (own type + own query param +
  `encode`/`decode` via the engine's `toBase64Url`/`fromBase64Url`, see
  `packages/web/src/ivBreakpointsScenario.ts` as the closest sibling) — this new tab
  needs its own fifth one, not an extension of `IvBreakpointsScenario`.

## Why this isn't a literal "duplicate the file and tweak it"

The actual computation is fundamentally different from `compareIvSpreads` (which compares
TWO complete IV spreads across a level range). This tab instead needs a **single fixed
species/target/moveset** swept across **every value of ONE IV stat** (attack, or defense)
**and every level** — a 2D grid, not a spread-vs-spread comparison. Treat "duplicate the
tab" as "reuse its layout/picker/scenario-plumbing conventions," not "reuse
`compareIvSpreads`."

## Step-by-step

### 1. Engine work (route to `engine-developer`)

Add new exported grid-sweep function(s) to `packages/engine/src/breakpoints.ts` (or a new
file if cleaner) that return a **full, unfiltered** IV×level damage grid, reusable for
both the "my own move" case (varying stat = attacker's attack) and the "boss's incoming
move" case (varying stat = defender's defense, boss's attack stat fixed). The two cases
are structurally symmetric — one function with a role flag, or two thin wrappers, is an
implementation-detail choice for `engine-developer` to make. Needed shape roughly:

```
interface DamageGridCell { iv: number; level: number; stat: number; damage: number }
// grid[i][j] or a flat list the caller reshapes — implementer's call
```

Inputs needed: `baseStat` (the varying side's base Attack or base Defense), the fixed
opposing stat (boss's effective Defense for attack-sheets, boss's effective Attack for
defense-sheets), `power` (of whichever move), the usual `damageModifiers`
(`stab`/`typeEffectiveness`/`weatherBoosted`, same shape as `DamageInputs` minus the stat
fields), and IV range (default 0-15) / level range (default full `CPM_TABLE` range, but
this tab always requests 25-50 by 0.5).

Write engine tests alongside (per this repo's convention — `engine-developer` writes its
own tests in the same pass, not after). Cover: a known damage value at a specific
IV/level cell, grid dimensions (16 IVs × the requested level count), and that the
attacker-role and defender-role calls both route through the same `calculateDamage`
underneath rather than duplicating the formula.

Do NOT touch the 4 pinned hypothetical fixtures or their `statsArePrecomputed` handling —
this is new, additive functionality, not a change to how existing bosses resolve.

### 2. New Scenario type (route to `web-developer`, or do inline with step 3)

New file `packages/web/src/attackDefenseBreakpointsScenario.ts`, sibling to
`ivBreakpointsScenario.ts`. Needs its own query param string (pick something not already
used: `s`, `ts`, `sr`, `ivc` are taken — e.g. `adb`). Fields needed, at minimum:

- `speciesId`, `fastMoveId` (nullable), `chargedMoveId` (nullable) — the attacker.
- `targetId` (the boss), `bossFastMoveId` (nullable) — already the pattern in
  `IvBreakpointsScenario`. **New**: this tab also needs the boss's CHARGED move for the
  Defense-Breakpoints charged-move sheet, which no existing tab's scenario type currently
  tracks (`bossChargedMoveId`, nullable, mirroring the existing nullable-move convention).
- `weather` (reuse `WeatherCondition`).
- Which mode is active (Attack vs Defense) — **must** round-trip through the scenario too
  per the "every user-facing assumption must round-trip through Scenario" standing
  decision; use the `add-scenario-assumption` skill's checklist when wiring this field in,
  it exists specifically to catch the "works live, reverts to default on a shared link"
  bug class this repo has hit before.
- Decide whether dodge/best-buddy modifiers belong here at all — this tab shows raw
  per-hit damage tables, not a survival/time-to-faint model, so dodge may be genuinely out
  of scope (leave for the implementer to decide and document, not silently omit without a
  reason).

### 3. New tab component (route to `web-developer`)

New file(s), e.g. `packages/web/src/AttackDefenseBreakpointsView.tsx` plus a new
presentational grid component (e.g. `BreakpointSheet.tsx`) that renders one 16-row ×
N-column table given a grid of cells, for reuse across all four sheets (attack-fast,
attack-charged, defense-fast, defense-charged) rather than four copies of a table.

- Species picker + target/boss picker: reuse `packages/web/src/registry.ts`'s existing
  `candidatePickerOptions()`/`targetPickerOptions()`/`allSpeciesOptions()`/
  `unmatchedActiveRaids()`, same as `IvBreakpointsView.tsx` does — don't reinvent species
  search/selection.
- A toggle control (Attack Breakpoints / Defense Breakpoints) switching which pair of
  sheets renders.
- Attack mode: call the new engine grid function twice (fast move, charged move) with
  `baseStat = species.baseAttack`, fixed opposing stat = the boss's effective Defense
  (via `bossEffectiveStats`/`defaultRaidTierForSpecies`, same as
  `IvBreakpointsView.tsx` already does), IV range 0-15, levels = a new descending
  `LEVELS_50_TO_25` constant (mirror `ivBreakpointsHelpers.ts`'s existing
  `LEVELS_35_TO_50` pattern but descending 50→25 step -0.5 — confirm whether the grid
  function should accept levels in this order directly or always compute ascending and
  let the VIEW reverse for display, matching `IvBreakpointsView.tsx`'s existing
  `rowsForTable = [...rows].reverse()` precedent for "highest level first, display-order
  only").
- Defense mode: same two calls, but `baseStat = species.baseDefense`, fixed opposing stat
  = the boss's effective Attack, `power`/type from the BOSS's fast/charged move instead of
  the species' own, and damage modifiers computed from the boss's move type against the
  species' own types/weather (mirror `IvBreakpointsView.tsx`'s existing
  `incomingDamageModifiers` construction for the fast-move case; the charged-move case is
  new but structurally identical).
- Don't forget the "Known caveats" section convention every other tab has (see
  `IvBreakpointsView.tsx`'s own caveats panel for tone/content) — document that this tab
  models a single static IV/level sweep with no dodge/combat-phase simulation, mega/primal
  boost handling (or lack thereof — check whether the new engine grid function should
  accept `megaBoostMultiplier` for a mega/primal species' own attack sheets, since
  `IvBreakpointsView.tsx` explicitly does NOT model this and documents it as a caveat —
  decide and document, don't silently drop it).
- "Share this scenario" button, same convention as every other tab.

### 4. Wire into the tab switcher

`packages/web/src/App.tsx` holds the `view=` query-param tab switcher (currently
`comparator` / `team-raid` / `species-report` / `iv-breakpoints` per `CLAUDE.md`'s repo
layout section) — add a new `view` value and nav entry for this tab, following the
existing pattern exactly (each tab stamps its own `view=` value onto its scenario URL).

### 5. Verification

- `npm run test:engine` from repo root (new engine tests must pass alongside all existing
  ones — 142 passing as of the last shipped change on this branch).
- `npx tsc --noEmit -p tsconfig.json` from inside both `packages/engine` and
  `packages/web`.
- `npm run build --workspace=packages/web` from repo root.
- Manually exercise the new tab in a browser (both toggle modes, both move-type sheets
  each, a "Build link" round-trip that the shared URL restores the exact same
  species/target/moves/mode) before calling it done — this repo's own guidance is not to
  claim a UI feature works without actually driving it.
- Once merged, this is a good candidate for a `skeptic` pass (visually drives the live
  app, cross-checks numbers) since it's new user-facing surface with real game-data
  implications.

## Open questions to resolve during implementation, not before

- Exact visual treatment of "breakpoint" cells within the full grid (color/bold on the
  cell where damage changes vs. the previous level at the same IV row, e.g.) — the user
  asked for "a spreadsheet," not a specific highlight scheme; use judgment or ask.
  Consider using the correct new column for the level, cell for the damage, etc — an
  actual spreadsheet-like UI, not just a plain data table, may be worth the extra
  layout effort here.
- Whether `megaBoostMultiplier` should apply on Attack-mode sheets for a mega/primal
  species (existing IV Breakpoints tab explicitly punts on this and documents it as a
  caveat instead of solving it — same call needs making here).
- Whether dodge behavior belongs in this tab at all (see step 2).
- Exact new query-param string and file/component names — suggestions above, not
  mandates.
