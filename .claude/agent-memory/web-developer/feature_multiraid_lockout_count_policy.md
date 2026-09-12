---
name: feature-multiraid-lockout-count-policy
description: Finished the multi-raid half of the dodge-lockout false-conclusion bug (single-raid fixed in 83c9255) once rosterPlanner.ts grew RosterPerBossImpact.dodgeFastAttacksLockout / lockedBossCount. A boss SET's lockout is a count, not a boolean — three-way policy, 2026-09-12.
metadata:
  type: feedback
---

## The three-way policy (not a boolean gate) — why single-raid's fix couldn't just be copied

Single-raid mode has ONE boss, so its lockout is boolean (`dodgeFastAttacksLockoutActive`) and the
fix was a straight swap: replace the false "genuinely done" conclusion with a can't-be-judged
callout. Multi-raid mode sweeps a whole boss SET, and a set can be *partially* locked — some
bosses support the dodge-fast-attacks assumption normally while others structurally can't. Given
`lockedBossCount`/`targets.length` (both new engine fields, `RosterPlanResult`/`RosterBudgetPlan`):

- **all locked** (`lockedBossCount === targets.length`, and `targets.length > 0`): suppress the
  conclusion entirely, same can't-be-judged callout as single-raid.
- **partial** (`0 < lockedBossCount < targets.length`): **keep** the conclusion but append a
  qualifier sentence naming the count — it's genuinely true for the unlocked bosses, which really
  did contribute non-zero deltas to the aggregate. Throwing the whole conclusion away here would
  be strictly worse than keeping it honestly qualified.
- **none locked**: unchanged.

Wrote this as `multiRaidLockoutConclusionGuard(lockedBossCount, totalBossCount):
{ suppress: boolean; qualifier: string | null }` in `dodgeFastAttackLockout.ts` (per CLAUDE.md's
instruction to reuse that file's wording helpers rather than writing a third variant) — the
`totalBossCount > 0` guard on the "all locked" branch matters: a zero-boss sweep has
`lockedBossCount === totalBossCount === 0`, which must NOT read as "fully locked."

## Grammar bug caught only by live rendering, not by reading the diff

First draft's qualifier read "9 of 17 bosses ... **its own** fast move recycles" — grammatically
wrong for plural counts (`lockedBossCount > 1`), because I wrote the singular phrasing first and
parameterized only the "is"/"are" verb, not the possessive-noun clause after it. Caught by
actually running the live scratch-Playwright scan against the app's real default multi-raid boss
set (9 of 17 locked, a real number, not a constructed test double) and reading the rendered
sentence — `npm run test:web`'s unit tests on the helper alone would never have caught this since
I only asserted `toContain("are dodge-locked")`, not the full clause. Fixed by also branching
"its own fast move recycles" vs "their own fast moves recycle" on the same singular/plural check.
Added a dedicated assertion for the plural clause to the test after finding it, so this can't
regress silently again.

## Audited the ranked-results section too — genuinely nothing to fix there

Task asked me to check whether `MultiRaidResultsSection` (the ranked candidate table, separate
component from `MultiRaidBudgetPlanSection`) has an equivalent false-conclusion sentence. It does
not — it's purely a ranked data table with a stats `<dl>` (bosses swept, noise floor, benched
count, etc.) and zero "nothing helps"/"genuinely done"-shaped prose anywhere in it, confirmed by
reading the whole component top to bottom, not just grepping. The toggle-level warning in
`PowerUpOptimizerAssumptionPanel.tsx` (`multiRaidFastAttackLockoutBossCount > 0`, shipped in the
prior 83c9255 session) already covers the "heads up, some of your selected bosses are
lockout-prone" case proactively, off pure per-species arithmetic before any sweep runs — the task
explicitly said keep it and don't duplicate it into the results area, so I left it verbatim
(its "this tab's multi-raid results don't currently flag which simulated fights hit the lockout
per boss" wording is still literally true even after this fix — we now surface an aggregate
COUNT in one specific conclusion sentence, never which boss(es), so no per-boss identification
exists anywhere in the results area).

## No engine import changes needed — wildcard re-export already covered it

`RosterPlanResult`/`RosterBudgetPlan`'s new `lockedBossCount` field and
`RosterPerBossImpact`'s new `dodgeFastAttacksLockout` field needed ZERO new imports in
`PowerUpOptimizerView.tsx` — `packages/engine/src/index.ts` does `export * from
"./rosterPlanner.js"`, and the web package imports the engine straight from its TS source (no
build step between them), so a new field on an already-exported interface is visible immediately
to every existing `import { type RosterBudgetPlanRunResult } from "./run/runRosterPlanner.js"`
site without touching the import list at all. Worth checking this FIRST (grep the engine's
`index.ts` for a wildcard export of the module) before assuming a new field needs new plumbing.

## Verification — live-reproduced all three cases, not just reasoned about them

Used a Vite DEV server on `:5173` (HMR reflects edits) for the initial scratch-Playwright pass,
then re-verified the SAME three cases against a fresh `npm run build` + the `test:e2e` suite
(against `dist`) after the grammar fix, so both the fast dev loop and the actual shipped artifact
were checked:

- **All-locked**: hand-picked Tyranitar solo (`Bite` recycles at exactly 0.5s — the same real data
  point every prior lockout memory cites) via the multi-raid single-boss hand-pick UI
  (`#pu-multiraid-handpick-input` / "Use only this boss", from `multi-raid.spec.ts`'s own
  pattern), dodge-fast-attacks on. Confirmed "Can't be judged right now" renders and neither
  "genuinely done" nor "Nothing further measurably helps" appear anywhere on the page.
- **Partial**: switched to multi-raid mode WITHOUT hand-picking (auto-populates the real default
  boss set, 17 bosses, 9 of them locked — a real number matching the pre-existing toggle
  warning's own count, not a constructed fixture), dodge on. Confirmed the ORIGINAL "Nothing
  further measurably helps... genuinely done" sentence is still present verbatim AND the new
  qualifier ("9 of 17 bosses in this set are dodge-locked... reflects only the other 8 bosses")
  is appended to the same callout.
- **None-locked**: hand-picked Machamp solo (a normal-cadence fast move), dodge on. Confirmed the
  ORIGINAL sentence renders unchanged with no qualifier appended.

Re-hit the `text-transform: uppercase` `innerText()` gotcha from
`feature_powerup_dodge_lockout_and_comparator_key.md` again — a case-sensitive
`bodyText.includes("Nothing further measurably helps")` silently reads `false` even when the
sentence is genuinely on the page inside a `<strong>`, because `innerText()` reflects the
rendered (uppercased) text, not the DOM's literal casing. Used `.locator(".blocked-gain-callout")
.innerText()` on the specific element instead of scanning the whole body for that one check.

`npm run test:web` (377 tests, up from 366 by 11 new `multiRaidLockoutConclusionGuard` cases),
`npm run typecheck`, `npm run lint`, `npm run check` (155 scenario fields unchanged — this is
derived engine output, no new `Scenario` field, as instructed), `npm run verify`, and
`npm run test:e2e` (27/27) all green.
