---
name: feature-super-max-plus-moves-and-mega-level
description: Phase 1 (engine contract) for Super Max "+" charged moves and a MegaLevel dimension — exported names data-sync/web-developer code against, the real risk finding (task's named risk area was wrong), and deliberate scope boundaries
metadata:
  type: project
---

Implemented 2026-09-09, phase 1 of 3 (data-sync authors the real per-species "+" move table in
phase 2; web-developer adds the UI dropdown in phase 3). Full research in
`.claude/agent-memory/pogo-researcher/fact_super_max_plus_move_mechanics_detail.md`,
`fact_super_max_extra_charged_move.md`, `fact_mega_level_system_2026_update.md`,
`fact_cpm_table_levels_41_50.md`.

## The exported contract (new file `src/megaLevel.ts`, re-exported from `src/index.ts`)

- `MegaLevel = "base" | "high" | "max" | "super-max"` — a per-CANDIDATE/per-SLOT scenario input
  (comparison.ts's `candidateMegaLevel`, teamRaid.ts's `TeamRaidSlotInput.megaLevel`,
  speciesReport.ts's `SpeciesReportInputs.megaLevel`), never a `SpeciesDefinition` field — it's an
  individual Pokémon's investment level, not a species trait.
- `MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER: Record<MegaLevel, number>` = `{base:1, high:1.1, max:1.2,
  "super-max":1.3}` — `[community-estimate]` ONLY (two sites, verbatim-identical disclaimer text —
  one shared guess, not corroboration).
- `SUPER_MAX_EFFECTIVE_LEVEL_BONUS = 2` — `[community-consensus]` magnitude, mechanism unconfirmed.
  base/high/max give +0 (a step, not a gradient).
- `effectiveLevelForMegaLevel(level, megaLevel)` — pure, species-agnostic; `level + 2` only for
  super-max. Feeds `effectiveStatsAtLevel`'s level param (never touches `stats.ts` itself).
- `chargedMoveAtMegaLevel(move, megaLevel)` — scales `.power` (Math.round) only when
  `move.isPlusMove`; complete passthrough otherwise. Duration/energyCost NEVER touched (see below).
- `types.ts` gained `ChargedMove.isPlusMove?`/`.plusMovePowerConfidence?: "official"|"cross-site"|
  "community-estimate"` and the `PlusMovePowerConfidence` type.
- `comparison.ts` gained exported `resolveCandidateMegaLevel(species, megaLevel)` — the shared gate
  (see below), reused by teamRaid.ts and passed through unchanged by speciesReport.ts.

## The real risk finding — task's named risk area was WRONG, the actual bug was elsewhere

The task flagged `powerUp.ts`/`rosterPlanner.ts` as the highest-risk spot for the CPM_TABLE
extension (50→52) leaking into power-up candidate generation. Checked by direct code reading:
**both are completely safe** — neither references `CPM_TABLE` or `Object.keys(CPM_TABLE)` at all;
their candidate ladder derives entirely from `PowerUpCostTable.maxLevel` (sourced from real
GAME_MASTER `maxNormalUpgradeLevel`, confirmed independently == 50). New regression test:
`test/megaLevelPowerUpCeiling.test.ts`.

The REAL bug was in `breakpoints.ts` and `ivComparison.ts`: both derive their default level sweep
via `const ALL_LEVELS = Object.keys(CPM_TABLE).map(Number).sort(...)` — extending CPM_TABLE would
have silently made the Attack/Defense Breakpoints grid and IV Breakpoints tab start sweeping
50.5/51/51.5/52 as if they were real, reachable power-up levels. Fixed with an explicit
`MAX_POKEMON_POWER_UP_LEVEL = 50` constant (cpm.ts) that both files now filter `ALL_LEVELS`
against, rather than trusting CPM_TABLE's own key range. **Lesson: when a task names a specific
risk area, verify it by reading the code — don't assume the stated risk is where the actual bug
is; grep for every consumer of the thing being extended.**

## Design decisions worth flagging (not explicitly mandated by the task — my judgment calls)

- **`resolveCandidateMegaLevel(species, megaLevel)` gates on `species.boost`**: returns `null`
  regardless of what's requested when the species has no boost mechanic at all. Not explicitly
  asked for, but `effectiveLevelForMegaLevel`/`chargedMoveAtMegaLevel` are deliberately PURE and
  species-agnostic (per the task's own "pure resolver" request), so without this gate a stray
  `megaLevel: "super-max"` on a non-mega candidate would silently grant a free +2 effective levels.
  Every orchestration call site (comparison.ts, teamRaid.ts, ivComparison.ts, speciesReport.ts via
  delegation) routes through this gate.
- **`ComparisonInputs.candidateMegaLevel` WAS added to `runComparison` (the opening-burst path)** —
  this is a deliberate DIVERGENCE from the `candidateDodge` precedent
  ([[feature_per_candidate_dodge_override]]), which explicitly did NOT touch `ComparisonInputs`
  because charged-move dodge behavior is inert there (the boss never throws a charged move during
  the opening burst). `candidateMegaLevel` is NOT inert there: the attacker's own stat bump and its
  own "+" move (which CAN fire during the opening burst, per `simulateOpeningBurst`'s own charged-
  move-fires-on-energy logic) both matter regardless of the boss's move. Do not "simplify" this by
  removing it from `ComparisonInputs` to match the dodge precedent — they're genuinely different.
- **`Math.round` for a "+" move's scaled power** — no source specifies rounding behavior for the
  non-Base tiers (the whole formula is a community estimate); Math.round was the least-surprising
  choice given real move powers are always integers. Verified against real numbers (Dark Pulse+
  150→165/180/195, Fell Stinger+ 140→154/168/182, Zap Cannon+ 160→176/192/208) via an actual node
  script, not hand arithmetic.
- **CLOSED 2026-09-09 — see [[feature_super_max_mega_level_gaps_closed]].** This bullet originally
  said `rosterPlanner.ts` and `powerUp.ts`'s `powerUpDamageLadder`/`optimizePowerUps` damage-ladder
  computation did NOT thread `megaLevel` at all, deliberately out of phase-1 scope, and framed it as
  a defensible floor default rather than a bug. The user asked for both to be closed in a same-day
  follow-up specifically because it left a user-facing control (the web ladder display, and the
  `multiRaidMegaLevel` roster-wide setting) that did nothing — read the linked memory before
  assuming either gap is still open. That follow-up also found a THIRD, more serious spot this
  bullet didn't mention at all: `powerUp.ts`'s `toTeamRaidSlotsAtLevels` was silently dropping
  `megaLevel` from `planPowerUpBudget`'s actual simulation, not just its ladder display.

## CPM_TABLE extension (cpm.ts)

Added 50.5/51/51.5/52 (51/52 are real whole-level GAME_MASTER values, 50.5/51.5 computed via the
file's own established half-level formula, verified via an actual node script:
`50.5: 0.842803707870344`, `51.5: 0.8478036860028387`). Rewrote the table's doc comment to explain
the NEW purpose (effective-level bonus stacking, never a power-up target) — the OLD comment
explicitly justified omitting these; that decision changed, so the comment had to change with it,
not just the data. Updated `cpm.test.ts`'s old "rejects level 50.5 and beyond" test (a deliberate,
explicit pinned-test change, not a silent weakening — see CLAUDE.md's testing discipline).

## `packages/web` typecheck fallout (expected, flagged for web-developer)

`Scenario.candidateMegaLevel` and `TeamScenarioSlot.megaLevel` are REQUIRED fields (matching the
established `candidateDodge`/`candidateMegaBoostDisabled` convention — `Scenario`'s own fields are
deliberately required-typed even though `decodeScenario` does no runtime validation, so a missing
field in an object-literal CONSTRUCTION site is a compile error by design — this is the forcing
function behind `add-scenario-assumption`). This broke `packages/web`'s typecheck at 5 known
locations (`ComparatorView.tsx:90`, `TeamRaidView.tsx:275`, `scenarioRoundtrip.test.ts:179/189/240`)
— all `packages/web`'s OWN `Scenario`/`TeamScenario` literal constructions, now missing the new
field. `npm run test:web`/`lint`/`check-scenario-roundtrip` all still pass (vitest doesn't
type-check; `check-scenario-roundtrip` only checks web's OWN `Assumptions` interfaces, which don't
have the field yet either) — only the dedicated `tsc --noEmit -p packages/web/tsconfig.json` step
catches it. This is the same accepted phase-boundary pattern as
[[feature_per_candidate_dodge_override]]'s "web typecheck gap flagged" — expected until
web-developer's phase-3 pass, not something I should fix myself (out of this agent's package scope).

## A real testing gotcha found while writing tests (see [[investigation_charged_damage_mid_animation_contradiction]])

`simulateOpeningBurst` (comparison.ts's `runComparison`) models the attacker's own charged move as
landing INSTANTLY the moment energy allows — no cast-duration/vulnerability window at all.
`simulateStepwiseBattle` (the sustained engine `runSustainedComparison`/`runTeamRaid` actually use)
models a REAL multi-second cast animation with its own vulnerability window, and a lethal hit
landing mid-cast means the charged move NEVER LANDS. Reusing CANDIDATE_ALPHA/BOSS_TIDE (a fixture
precisely tuned to die at exactly 7.5s under the OPENING-BURST model) in a NEW test against
`runSustainedComparison`/`runSpeciesReverseLookup` produced 0 charged damage for this reason — a
real, correctly-modeled mechanic, not a bug, but a trap for test-writing. **When writing a NEW test
against the sustained/stepwise engine, don't reuse an opening-burst-tuned fixture's exact HP/damage
numbers — build a bulkier dedicated fixture (or a much weaker boss) so the mid-animation-death risk
doesn't confound what you're actually trying to isolate.**
