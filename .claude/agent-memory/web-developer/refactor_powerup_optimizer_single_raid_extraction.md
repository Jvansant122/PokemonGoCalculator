---
name: refactor-powerup-optimizer-single-raid-extraction
description: code-simplifier-driven pure refactor of PowerUpOptimizerView.tsx — extracted SingleRaidResultsSection/SingleRaidBudgetPlanSection, hoisted a shared multi-raid table head, found a real (unfixed) thead asymmetry
metadata:
  type: feedback
---

Done 2026-09-09, requested directly by a `code-simplifier` audit finding (not
the user), routed to me as a **pure refactor — no behavior change**. Both
findings lived in `PowerUpOptimizerView.tsx`.

**Finding 1 (real): single-raid mode's ~400-line results JSX had never been
extracted, unlike multi-raid's (already split into `MultiRaidResultsSection`
/`MultiRaidBudgetPlanSection` from an earlier session).** Mirrored that same
2-component split: `SingleRaidResultsSection` (gating states + baseline card
+ per-slot damage ladder + recommendation + ranked-candidates table +
always-visible "Known caveats") and a nested `SingleRaidBudgetPlanSection`
(the fixed-budget plan). **Key difference from the multi-raid precedent: the
single-raid budget-plan section had to stay a component invoked INLINE at
its original position** (between "Recommendation" and "Ranked candidates"),
not hoisted to a trailing sibling section the way multi-raid's budget plan
is — multi-raid's plan was already a separate top-level section after the
ranked table, but single-raid's has always rendered BETWEEN two other
single-raid sections. Moving it to "after everything" to match multi-raid's
shape would have been a real (if minor) visual reordering — exactly the kind
of thing "pure refactor" rules out. When mirroring a sibling tab's component
split, check the ORIGINAL DOM ORDER before assuming the split is
purely-structural — it may encode something the sibling didn't.

Result: top-level `PowerUpOptimizerView()` shrank from ~837 lines (1159-1995)
to ~465 lines (1626-2090); file grew from 1996 to 2090 total (net +94, since
extraction adds prop-interface/doc-comment boilerplate even while removing
duplication from the top-level component — expect a file-total INCREASE from
this kind of split, the win is in the top-level component's own size, not
the file's).

**A closure-narrowing question resolved empirically rather than by
recollection: does `{data && (<>{arr.map(x => data.foo)}</>)}` need `data!`
inside the `.map()` callback when `data` is a plain destructured PROP (not a
`result.data` member-expression)?** The pre-extraction code used
`result.data!` inside `.map()` closures specifically because TS drops
narrowing across a closure boundary for MEMBER EXPRESSIONS (`result.data`
could theoretically be reassigned/mutated between the check and the
closure). I renamed to a plain prop `data` and wrote the closures WITHOUT any
`!`, hypothesizing narrowing would hold for a plain identifier — confirmed by
`tsc --noEmit` staying clean. Lesson: the `!` in the original code was a
member-expression tax, not something that automatically had to travel with
the extracted variable — don't reflexively copy `!` assertions into a
refactor without checking whether the SHAPE of the reference changed too.

**Finding 2 (the real bug, deliberately NOT fixed): the two 9-column
`<thead>` blocks the task described as "copy-pasted verbatim" between
`MultiRaidResultsSection`'s "Ranked candidates" and "Benched but promising"
tables are NOT actually identical** — "Ranked candidates" carries `title`
tooltips on 4 columns (Mean Δ, Best boss Δ, Significant bosses, Newly
fielded); "Benched but promising" has plain `<th>` text with no tooltips at
all. Verified via `grep -n` against the live file before touching anything,
since the task's own description of "verbatim" turned out to be wrong.
Hoisted anyway (DRY was still worth doing) via a shared
`MultiRaidCandidateTableHead({ withTooltips: boolean })` component, called
`withTooltips` at the Ranked-candidates site and `withTooltips={false}` at
Benched-but-promising — preserves EXACT current per-site rendered output
(same tooltip presence/absence) while still being one source of truth for
the column labels. Reported the asymmetry back rather than equalizing it
silently, per the task's own "report, don't fix" rule for anything
bug-shaped found mid-refactor. **General lesson: when a task describes two
blocks as "identical" as justification for a hoist, `grep`/diff them
yourself before hoisting — don't trust the task description's own claim of
sameness, since a hoist that silently changes one side's behavior to match
the other is exactly the kind of thing a "pure refactor" ticket is there to
prevent.**

**Verification depth this session: full `npm run verify` (all 3 vitest
suites incl. 159/159 web, 3 typechecks, lint at the pre-existing 3 warnings/0
errors baseline, all 4 checkers, production build) PLUS the full 13-test
Playwright `test:e2e` suite separately** — both green, both explicitly run
(not skipped), since this was the ONLY thing that could actually prove "no
behavior change" for rendered JSX (typecheck/lint can't catch a reordered or
re-labeled DOM node). The power-up-optimizer-specific e2e specs
(single-raid "fixed-budget plan section renders a spend ledger", multi-raid
sweep-and-ranked-rows, multi-raid share-link empty state) directly exercise
the exact JSX moved in Finding 1, so their continued pass is real evidence,
not incidental. Bundle size before/after: 2,113,730 → 2,113,490 bytes (net
-240 bytes, consistent with zero real code-size change — component-boundary
extraction doesn't change what gets bundled).

See also [[feature_power_up_optimizer_fixed_budget_plan]] and
[[feature_multi_raid_roster_optimizer_phase4_ui]] for the two sections'
original (pre-extraction) shape and doc-comment history.
