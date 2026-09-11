---
name: feature_boss_moveset_sweep_widened_to_fast_charged
description: Widening both Comparator's and Team Raid's boss-moveset sweeps from charged-moves-only to the full fast x charged cartesian product, after engine-developer's compareAcrossBossMovesets reversal — a real "sweep exists but a call site secretly holds the swept axis fixed" bug found and fixed in Team Raid's OWN hand-rolled loop
metadata:
  type: project
---

2026-09-11: engine-developer widened `compareAcrossBossChargedMoves` ->
`compareAcrossBossMovesets` (comparison.ts) to sweep the boss's fast move
alongside its charged move — the fast move drives both incoming chip damage
AND the boss's own energy/cadence, so holding it fixed while only sweeping
charged moves silently ignored a whole rolled axis. Iteration order is
FAST-MAJOR/CHARGED-MINOR, a documented stable contract on the engine side.
Two SEPARATE web-layer sweeps needed widening — easy to miss the second one,
per the task's own warning, and it was genuinely the harder half.

**Comparator (`runComparator.ts`/`BossMovesetSweep.tsx`/`ComparatorView.tsx`):**
a straight rename + gate widen (`chargedMoves.length >= 2` ->
`fastMoves.length * chargedMoves.length >= 2`) + dropping the now-forbidden
`bossFastMoveId` from the sweep call's input object (the widened `Omit` type
catches this at compile time — tsc alone was sufficient here, no runtime risk).
`BossMovesetSweep.tsx` now groups rows by fast move via a rowSpan computed
from a `Map<startIndex, span>` built with one linear pass over the array
(cheap, no memoization needed at ≤36 rows) — safe ONLY because the engine's
iteration order is the documented fast-major contract, so same-fast-move rows
are always already contiguous; a caller relying on this grouping trick without
that contract would need an explicit sort first.

**Team Raid (`runTeamRaid.ts`) was the real bug, and the task's warning about
it was correct.** Its sweep is a HAND-ROLLED loop (never called the engine
function at all), and `buildTeamRaidInputs` took only a `bossChargedMoveId`
param — its `bossFastMoveId` field was hardcoded from the outer closure's
`a.bossFastMoveId` on every call, including inside the sweep loop. So even
after widening the loop to `for (fastMove) for (chargedMove)`, EVERY row
would have silently simulated the SAME fixed fast move regardless of which
one the row claimed to test — a sweep that runs 16 variants and produces 16
different-looking rows while actually only ever testing 4 truly distinct
configurations, with the illusion of granularity. Fixed by adding a
`bossFastMoveId` parameter to `buildTeamRaidInputs` and threading the swept
fast move through both the main call (`a.bossFastMoveId`) and the sweep loop
(the loop variable). **This class of bug — a widened loop/sweep that still
silently reads a stale outer-scope value instead of its own loop variable —
is exactly what the task instructions predicted and is worth checking for by
name whenever a "sweep an axis" feature is added to a hand-rolled (non-engine)
loop: grep every param the sweep loop constructs its inputs from and confirm
each swept field is actually parameterized, not just the one being visibly
looped over.**

**Renamed `TeamRaidBossMovesetResult.moveId`/`moveName` -> `chargedMoveId`/
`chargedMoveName` and added `fastMoveId`/`fastMoveName`**, for symmetry with
the engine's `BossMovesetVariantResult`. `TeamRaidView.tsx`'s callout switched
from a bare comma-joined move-name list (unreadable at up to 36 pairs) to a
counts-based headline sentence ("clears against N of M possible boss
movesets... fails against the other K") plus a NEW nested `CollapsibleSection`
(`variant="subsection"`, closed by default) holding the full grouped-by-fast-
move detail table, reusing the exact same rowSpan-grouping pattern as
`BossMovesetSweep.tsx` (kept as a local IIFE inside the JSX rather than a
shared helper — the row shapes differ enough, own-team-damage columns vs. a
single clears/fails-with-time cell, that a shared component would need more
prop surface than the duplication costs; a genuine third call site would
tip this).

**Real numbers confirmed live** (see verification below): default Team Raid
scenario (tyranitar-mega, 4 fast x 4 charged = 16 combos) already shows
`verdictVaries: true` even at the DEFAULT 300s timer (5 of 16 clear) — this
sweep was never a corner case requiring a special tightened-timer scenario to
exercise meaningfully, unlike the old charged-only sweep. At a tightened 290s
timer, `Dragon Breath + Stone Edge` (a slow, low-power fast move paired with a
100-energy charged move) fails at 294.0s while `Smack Down + Stone Edge` (a
much higher-power/energy fast move) clears comfortably at 280.4s — same
charged move, genuinely different outcome from the fast move alone, which is
exactly the axis this whole reversal was about restoring visibility into.

**Verification: full browser-level check via Playwright, not just build/typecheck.**
`npm run verify` (all tests/typecheck/lint/checks/build) green throughout.
Beyond that, per [[verification_without_browser_tool]]'s "PARTLY SUPERSEDED"
note and [[feature_shadow_enrage_timings_surfaced]]'s exact recipe: built real
scenario URLs via each tab's own `assumptionsToScenario`/`buildScenarioUrl`
(Comparator, default scenario — latios-mega boss, 2 fast x 5 charged = 10
combos) and `assumptionsToTeamScenario`/`buildTeamScenarioUrl` (Team Raid, both
the default scenario AND a `raidTimerSeconds: 290` variant to force
`verdictVaries: true`) from a throwaway `tsx` script dropped as a REAL sibling
inside `packages/web/src/` (not a deep relative path from the scratchpad —
that resolves `.js`-suffixed sibling imports correctly per this repo's
bundler-moduleResolution convention), wrote the URLs to a JSON file, then
served the real production build via `vite preview` and drove it with
`chromium.launch()` from a `_scratch_verify.mjs` at the REPO ROOT (Playwright
needs real `node_modules` resolution — an ESM script outside the repo with
`NODE_PATH` set does NOT work, `ERR_MODULE_NOT_FOUND` even with the right env
var; Node's ESM resolver ignores `NODE_PATH` for `import` specifiers). Zero
console/page errors across all three page loads; screenshots confirmed both
the Comparator's grouped 10-row table and Team Raid's grouped 16-row detail
table render legibly with correct rowSpan grouping and Clears/Fails coloring.
Both scratch files (`packages/web/src/_scratch_build_urls.ts` and root
`_scratch_verify.mjs`) deleted after, confirmed via `git status --porcelain`
showing only the 6 real source files touched.

**A real Playwright locator gotcha hit and fixed mid-verification, matching
[[feature_collapsible_sections]]'s documented nested-`<details>` trap**: a
locator like `details:has-text('inner summary text')` with `.first()` can
resolve to the OUTER ancestor `<details>` when the inner nested subsection's
summary text is also contained by (propagates up through) the outer one —
here the outer "Raid result" section (`defaultOpen: true`, so the script's
"if not already open, click" guard never fired) swallowed the click meant for
the newly-added nested "Which movesets clear vs. fail" subsection, which
stayed collapsed and produced an innerText scrape with no table rows. Fixed by
targeting `summary:has-text(...)` directly (unique per section) and
unconditionally clicking it, rather than checking/toggling `.open` on a
`details` locator that might not be the right ancestor.
