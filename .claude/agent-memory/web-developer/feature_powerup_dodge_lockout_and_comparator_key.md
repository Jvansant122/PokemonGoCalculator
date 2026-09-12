---
name: feature-powerup-dodge-lockout-and-comparator-key
description: Power-Up Optimizer never surfaced the fast-dodge lockout and stated a false "past its headroom" conclusion under it; Comparator had a duplicate React key when both candidates share a species. Both from a skeptic pass, 2026-09-12.
metadata:
  type: feedback
---

## The bug: a result-bearing view can compute a lockout fact without ever reading a result flag

`PowerUpEncounterSummary` (packages/engine/src/powerUp.ts, this tab's own baseline/candidate
summary type) never propagates the per-run `dodgeFastAttacksLockout` flag that `TeamRaidSlotResult`/
`DistributionSummary` carry elsewhere — Comparator/Team Raid/Species Report all read that flag
straight off their own result types, but `PowerUpOptimizerView.tsx` had ZERO references to
`dodgeFastAttackLockout.ts` before this fix (grep confirmed it), because it was scoped out of an
earlier "wire the lockout into every result-bearing view" pass that only checked the three tabs
whose engine result types carry the flag.

The fix does NOT touch the engine. `dodgeFastAttacksLockout = dodgeFastAttacks &&
fastMoveCadenceTooFastToDodge(bossFastMove.durationSeconds)` is a **config-level, deterministic**
fact — identical for the baseline and every candidate/plan-step re-simulated against the same
boss, never seed-dependent. So it's legitimate (not a re-derivation of engine math) to compute it
directly in the view from `assumptions.dodgeFastAttacks` + the resolved boss fast move, the exact
same way `dodgeFastAttackLockoutWarning`/`dodgeFastAttackLockoutResultNote`
(`dodgeFastAttackLockout.ts`) already do for every other tab's TOGGLE-level warning. Only the
RESULT-level note needed this workaround for Power-Up Optimizer specifically, because its own
summary type is the one place that drops the flag on the floor.

**Lesson: when auditing "does every result-bearing view read the lockout flag," don't stop at
`grep dodgeFastAttacksLockout` on result TYPES** — a view whose own summary type never captured
the flag at all won't show up that way, and is easy to skip entirely (which is exactly what
happened here).

## What shipped

Single-raid mode (full result-level treatment):
- Baseline result card gets the lockout note (`dodgeFastAttackLockoutResultNote`), same placement
  convention as Comparator/Team Raid (after the stat-tile-headline, before `<dl>`).
- New exported helper `noAffordableImprovementSentence(noiseFloorTeamDps, lockoutActive, note)` in
  `PowerUpOptimizerView.tsx` REPLACES (never just supplements) the old "may already be past its
  useful power-up headroom" sentence when the lockout is active — that conclusion is actively
  false in that state (every delta reads ≈0 for a reason that has nothing to do with roster
  headroom), not merely unhelpful. Tested directly in `PowerUpOptimizerView.test.ts` (3 cases,
  including the "active flag but null note falls back to the ordinary sentence" edge case — the
  boss fast move not yet resolved shouldn't render an empty explanation).
- The fixed-budget plan section (`SingleRaidBudgetPlanSection`) gets the SAME treatment: the
  lockout note up top, and its "Nothing further measurably helps... genuinely done" callout
  swapped for a "Can't be judged right now" one under lockout. This is a SECOND instance of the
  same false-conclusion bug class the task didn't explicitly name (it only called out the
  Recommendation section's sentence) — found by re-reading the whole single-raid results area for
  the same "genuinely done" framing, not just patching the one line quoted in the report. Worth
  doing: leaving one fixed and the sibling one broken would have read as an incomplete job.
- Deliberately did NOT touch `budgetStopReasonSentence`'s "no-significant-candidate" case (the
  `no-significant-candidate` stop-reason wording, shared verbatim with multi-raid) — that sentence
  ("nothing else measurably beats the ±X noise floor... left unspent on purpose") stays literally
  true even under total lockout (0 really doesn't exceed a 0.00 floor), so it isn't the same false
  claim as "genuinely done"/"past its headroom" and touching it would have meant either forking
  the shared function or changing multi-raid's wording too, neither of which the bug needed.

Multi-raid mode (proactive-only, by design — flagged, not "fixed"):
- `RosterPerBossImpact` (rosterPlanner.ts) has NO per-boss lockout flag at all — it's a thin shape
  (deltaTeamDps/rankBefore/rankAfter/simulated), confirmed by reading the type, not assumed. So
  there is structurally no result-level half to add for multi-raid without an engine change.
- Added the toggle-level warning only, in `PowerUpOptimizerAssumptionPanel.tsx`: counts how many
  of `value.multiRaidBossIds` have a first fast move that's too-fast-to-dodge (pure per-species
  arithmetic via `speciesRegistry`, no simulation) — same shortcut `SpeciesReportView.tsx`'s own
  `fastAttackLockoutBossCount` already uses for its boss-SET case. The warning text says plainly
  that multi-raid results don't flag which fight hit the lockout, so a suspiciously low/zeroed
  per-boss delta should be treated as a possible cause, not a confirmed effect.
- `speciesRegistry` imported directly from `./registry.js` into the assumption panel (not passed
  as a prop) — checked `registry.ts`'s own imports first (only engine + JSON) to confirm this
  can't create a circular import; `BossSetPanel.tsx` already does the exact same thing.

## Comparator duplicate-key bugfix

`ComparatorView.tsx`'s candidate-cards `.map((c, i) => ...)` used `key={c.id}` — nothing stops a
user picking the same species for both candidate A and B, which fires React's "two children with
the same key" warning (both cards still rendered correctly in practice; it's a correctness risk by
React's own semantics, not a visible glitch). Fixed to `key={`${c.id}-${i}`}`. Verified live: a
`return (` cannot start with a `{/* JSX comment */}` before its single returned element — TS parses
that as an object/expression start, not a sibling comment — so the explanatory comment had to move
above the `return` as a plain `//` comment instead of a JSX comment inside the parens.

## Verification method — dev server + scratch Playwright, no built dist needed

A Vite DEV server was already running on `:5173` (HMR reflects live source edits instantly) — used
that directly rather than building `dist` first, since the task only needed live behavior, not a
production-build check (that came later via the full `npm run verify`). Scratch `.mjs` Playwright
scripts MUST live inside the repo (`node_modules/playwright` resolution fails from the OS temp
scratchpad — confirmed AGAIN here, matching `feature_energy_gated_interval_cadence`'s prior
finding) — write to a repo-root `_scratch_*.mjs`, run it, then `rm` it before finishing; confirmed
`git status` is clean of scratch artifacts as the last step.

`CollapsibleSection`'s `id` prop is a localStorage key, NOT a DOM id (documented in its own file,
also previously noted in `feature_species_report_type_rank_readability.md` and others) — so
`page.locator("#pu-baseline")` finds nothing; locate by `summary:has-text("Baseline")` and walk up
via `xpath=ancestor::details[1]` instead, every time.

`page.locator(...).innerText()` reflects CSS `text-transform` (a `<strong>` styled
`text-transform: uppercase` reads back as `"CAN'T BE JUDGED RIGHT NOW"`, not the DOM's literal
mixed-case text) — a case-sensitive substring check against the ORIGINAL casing will silently fail
even though the content is present and correct; don't treat that as a bug, check case-insensitively
or match a distinctive substring instead.

Confirmed live end-to-end: loading `?view=power-up-optimizer` (default scenario: Tyranitar, Bite
recycles at exactly 0.5s) and switching "Also dodge boss's fast attacks?" to Yes reproduced the
exact zeroed baseline (Team DPS 0.0, Clear rate 0%, noise floor ±0.00) from the skeptic's report,
AND confirmed post-fix that `"past its useful power-up headroom"` and `"genuinely done, not just
out of money"` no longer appear ANYWHERE on the page in that state (searched full `body.innerText()`,
not just the one section quoted in the bug report). Also confirmed the multi-raid toggle warning
fires with a real, non-zero boss count (9 of the default multi-raid boss set) with zero console
errors, and confirmed the Comparator fix by actually picking the same species (Machamp) for both
candidate A and B via the real `SpeciesPicker` combobox and asserting zero "same key" console
warnings plus both result-card headings reading "Machamp".
