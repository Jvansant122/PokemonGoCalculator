---
name: feature-reverse-cross-tab-links-powerup-to-teamraid-and-speciesreport
description: Two reverse cross-tab links from a live audit — Power-Up Optimizer's post-plan roster into Team Raid Simulator (navigation), and Species Report rows into Team Raid Simulator (lifted-prop) — plus the real many-slots-to-one-shared-level reduction problem this direction hits that the forward export didn't.
metadata:
  type: project
---

2026-09-10, same day as [[feature_team_raid_export_to_power_up_optimizer]] (the forward
direction this partially mirrors) and [[feature_power_up_optimizer_fixed_budget_plan]] (source of
`PowerUpBudgetPlan.finalLevels`). Driven by a live audit finding: the fixed-budget plan's "clear
rate after this plan: 100%" was "a number I can't feel" without hand-copying post-plan levels into
Team Raid to watch it play out cycle-by-cycle.

**Direction 1 (Power-Up Optimizer -> Team Raid) hits a REAL structural mismatch the forward
export never had to deal with, and this is the one thing worth re-reading before touching either
direction again: `TeamAssumptions`/`TeamScenario` have exactly ONE shared `level`/`ivAttack`/
`ivDefense`/`ivStamina` for the whole 6-slot roster (a real, documented, deliberate
simplification — see TeamAssumptionPanel.tsx's own doc comment), while every Power-Up Optimizer
slot carries its OWN level/IVs (the entire point of that tab).** Going Team Raid -> Power-Up
Optimizer, one shared spread fans OUT to 6 slots losslessly. Going the other way, N different
post-plan levels do NOT fit losslessly into a field that only has room for one — there is no
faithful reduction, only a defensible one. Chosen reduction, in `powerUpOptimizerExport.ts`
(`powerUpOptimizerAssumptionsToTeamAssumptions`): the MEAN across fielded slots' levels/IVs
(post-plan `toLevel` for a slot the plan touched, current level otherwise — see
`PowerUpBudgetFinalLevel`/`RosterBudgetFinalLevel` for the two engine shapes this could come
from), rounded to the precision Team Raid's own inputs accept (nearest half-level, whole IVs).
Documented to the user via a new `POWER_UP_OPTIMIZER_EXPORT_MISSING_NOTE` shown next to the
button, same "missing note" precedent as the forward export's own constant.

**This reduction was proven live, not assumed, via a throwaway Playwright scratch spec run
against the dev server (deleted after) at the default scenario: 6 fielded post-plan levels
(36.5/30/40/38/37.5/25) -> mean exactly 34.5, matching Team Raid's own "Level (whole roster)"
field byte-for-byte after the click.** The same run surfaced the actual COST of this reduction,
exactly the "finding, not a bug" the task asked to hear rather than have papered over: the plan's
own claimed "100% clear rate, avg 89.8s to clear" (computed at each slot's TRUE post-plan level)
disagreed materially with Team Raid's own simulated "Cleared at 125.7s" (computed at the single
averaged 34.5 for every slot) — both agree QUALITATIVELY (clears every time either way), but the
quantitative clear time differs by ~40% because the mean pulled every slot down toward the
roster's two untouched low-level members (Machamp 30, Heracross 25), UNDER-representing the two
slots the plan actually invested in (Lucario 36.5, Conkeldurr 37.5) and the two strong untouched
ones (Terrakion 40, Excadrill 38). This is real, expected, and STRUCTURAL — a consequence of
Team Raid's one-shared-level data model, not a bug in either engine call. Don't "fix" this by
tuning the reduction formula (max instead of mean, etc.) — any single-number reduction will
disagree with a genuinely per-slot-varied post-plan roster by construction; the honest fix would
be an engine-owned `TeamScenarioSlot.level`/`.ivs` optional override (the engine's OWN
`TeamRaidSlotInput.level`/`.ivs` per-slot override already exists internally, used by
`optimizePowerUps`/`planPowerUpBudget` themselves — see teamRaid.ts — it's just never been
exposed through the round-trippable `TeamScenario` type). Flagged to engine-developer as an
AFFECTS note rather than worked around; see this session's final report for the exact framing.

**A circular-import risk was checked, not assumed away.** `TeamRaidView.tsx` already imports
`assumptionsToScenario` from `PowerUpOptimizerView.tsx` (the forward export, shipped earlier the
same day). Adding this direction's `PowerUpOptimizerView.tsx` -> `assumptionsToTeamScenario` from
`TeamRaidView.tsx` creates a genuine A<->B cycle between the two view files. Verified this is SAFE
in practice (both `tsc --noEmit` and `vite build` clean, `npm run test:e2e` 18/18) because neither
module reads the other's export at its own top level — only inside a click handler, called long
after both modules finish initializing — so the cycle resolves fine under ESM/Vite. Didn't extract
the codec to a neutral third module to avoid the cycle, because `scripts/check-scenario-roundtrip.mjs`
(a `scripts/` file I must not edit) HARDCODES the file path `packages/web/src/TeamRaidView.tsx` as
where `assumptionsToTeamScenario`/`teamScenarioToAssumptions` live — moving them elsewhere (even
with a re-export) would be extra indirection for zero benefit once the cycle was confirmed safe.

**Single-raid mode ONLY, per the task's own suggested scope cut, taken rather than inventing a
reduction**: multi-raid mode has a whole imported roster (~200 entries) and a boss SET; Team Raid
is hard-coded to 6 slots vs ONE boss. No unambiguous "which 6, which 1" reduction exists without a
silent, arbitrary filter — CLAUDE.md's standing decision on multi-raid boss-set encoding
("resolved ids, never a filter") is the same principle applied here. The button is rendered only
when `assumptions.mode === "single-raid"`; multi-raid mode gets an explanatory caveat paragraph
instead (merged into the SAME conditional block as the pre-existing "roster not in this link"
multi-raid caveat, which used to be its own separate `{mode === "multi-raid" && (...)}` block
right next to where the new one would've gone — collapsed into one `<>...</>` for tidiness, not a
behavior change).

**Direction 2 (Species Report row -> Team Raid) used the LIFTED-PROP mechanism
(`comparatorPrefill.ts`'s own pattern), not full navigation** — checked which of the app's two
real cross-tab mechanisms fit BEFORE picking (per the task's explicit "check which one, don't add
a third"): SpeciesReportView already threads `onCompare`/`ComparatorPrefill` through App.tsx as a
lifted-prop, same-SPA hand-off (NOT the "full navigation via scenario URL" mechanism the
Direction-1 button above uses). Direction 2's payload (one species + moveset + one boss) is the
exact same SHAPE and SIZE as `ComparatorPrefill`'s own 4 fields — a genuine "partial hand-off",
not a full ~20-field assumption object — so the lifted-prop mechanism is the correct fit, not the
navigation one. Built a SEPARATE new type, `teamRaidPrefill.ts`'s `TeamRaidPrefill { targetId,
speciesId, fastMoveId, chargedMoveId }`, rather than reusing `ComparatorPrefill` itself — its own
field name `candidateAId` is specifically about the two-candidate comparator's candidate A, and
overloading it for a second, unrelated destination would read as ambiguous about which tab a
given hand-off object is actually for. `TeamRaidView` gained the exact same
`prefill`/`onConsumedPrefill` prop shape as `ComparatorView` (lazy `useState` initializer plus a
`useEffect(() => { if (prefill) onConsumedPrefill?.(); }, [])` with an empty dep array, same
"component fully unmounts on tab switch so mount==fresh-hand-off" reasoning) — `TeamRaidView()`'s
signature changed from zero-arg to `({ prefill = null, onConsumedPrefill }: TeamRaidViewProps = {})`,
so its own default-parameter destructuring keeps every existing zero-arg call site
(`<TeamRaidView />` in App.tsx before this session, any test that constructs it bare) compiling
unchanged. Only slot 1 + boss target are seeded from the click; the other 5 slots and every shared
assumption (level/IV/dodge/weather/timer) stay at `DEFAULT_TEAM_ASSUMPTIONS`, matching
`ComparatorView`'s own "only seed what was actually clicked, leave the rest for the player"
precedent exactly. Boss fast/charged move ids reset to `null` (that boss's own first moves)
rather than carrying `DEFAULT_TEAM_ASSUMPTIONS`' moves, which belong to a DIFFERENT boss.

**Row action button placement**: added as a SECOND button inside the SAME "Actions" `<td>`
(renamed from singular "Action") rather than a new table column — matches the task's own "buttons,
not panels" density complaint; a new column would have widened an already-dense table for one more
button, while a second stacked button in the existing action cell costs nothing.

**No new Scenario field for either direction** — `npm run check-scenario-roundtrip` stayed at 115
fields (same as session start) before and after both features. Neither direction needed one: #1
only builds a URL for Team Raid's ALREADY-round-tripped `TeamScenario` shape (the level/IV
reduction happens in plain JS before the scenario is ever built, not as a new field); #2's
`TeamRaidPrefill` is a same-SPA lifted-prop payload, never serialized to a URL at all (same as
`ComparatorPrefill` itself — check `comparatorPrefill.test.ts`'s own doc comment, which explicitly
says this pattern has "nothing to round-trip").

**Both mapping functions got their own pure-function unit test file** (`powerUpOptimizerExport.test.ts`,
8 cases covering the mean-reduction with/without a plan, rounding, empty-roster fallback, and
verbatim-carry fields; `teamRaidPrefill.test.ts`, 1 shape-pin test mirroring `comparatorPrefill.test.ts`'s
own "nothing to unit-test behaviorally, pin the shape so a field rename shows up as a compile
error" reasoning) — per this project's "extract each mapping as a pure, tested function, don't
inline in JSX" convention, and matching the forward export's own precedent
(`teamRaidExport.test.ts`) exactly.

**Verification**: `npm run verify` green (241 web tests including the 9 new ones, 115 scenario
fields, lint at the pre-existing 1 warning/0 errors baseline, production build clean).
`npm run test:e2e` 18/18 (16 pre-existing + 2 new: one `waitForURL`-based navigation test for
Direction 1 mirroring the forward export's own test shape exactly, one plain in-SPA click+assert
test for Direction 2 checking the destination tab's `aria-selected` and subtitle). PLUS a live
Playwright scratch script against the dev server (deleted after, `git status --porcelain` reconfirmed
clean) that actually built a real budget plan, clicked the button, and cross-checked the two tabs'
own numbers — see the reduction-consequence finding above; this is the level of verification the
task explicitly asked for ("that consistency check is the actual deliverable"), not just a
round-trip/compiles check.
