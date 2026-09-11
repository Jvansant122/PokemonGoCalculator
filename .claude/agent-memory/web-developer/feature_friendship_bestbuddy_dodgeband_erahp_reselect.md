---
name: feature-friendship-bestbuddy-dodgeband-erahp-reselect
description: Surfaced 6 previously-inert engine capabilities (friendshipLevel, Best Buddy, own-cast dodge cost, dodge-execution-error band, bossMaxHpOverride, reselectAfterWipe) across Comparator + Team Raid — a params-drift trap, a floor()-insensitivity false alarm, and the reselect heuristic chosen
metadata:
  type: project
---

Built 2026-09-11 (Web lane 1 of two, concurrently with an engine-developer lane, a scripts/data-sync
lane, and Web lane 2 owning the Power-Up Optimizer — same worktree, four agents at once).
`check-scenario-roundtrip` went from 143 to **152** fields (25 nested in per-slot arrays), all 7
tabs green.

**The task existed because "round-trips through Scenario" and "actually reaches the engine call"
are two separate claims** — the parent brief explicitly framed this as the same bug class as an
earlier session's per-slot level/IVs round-tripping perfectly while being ignored at simulation
time. Every item below got a live, numeric, browser-driven check for exactly that reason — see
"Verification" below. Two items independently proved worth the paranoia.

## Where each item surfaced

1. **`friendshipLevel`** (5-tier ladder) — new shared `FriendshipSelect.tsx` (mirrors
   `bossCadence.tsx`'s "one shared control, not six copy-pasted `<select>`s" precedent), one
   instance each in `AssumptionPanel.tsx` and `TeamAssumptionPanel.tsx` (Team Raid: roster-wide,
   not per-slot — the engine field itself is a single value per fight, not per-candidate).
2. **`candidateIsBestBuddy`/`isBestBuddy`** — per-candidate checkbox in `AssumptionPanel.tsx`
   (both candidates), per-slot checkbox in `TeamAssumptionPanel.tsx`. Shared tooltip text
   (`bestBuddyHint.ts`) so the stacking caveat (single GitHub gist comment, the SAME source
   already cited for Super Max's own +2 — NOT independent corroboration) can't drift between the
   two panels' copy.
3. **Own-cast dodge-vulnerability cost** — pure display addition, ZERO run-module change needed:
   `SustainedCandidateResult` (which extends `DistributionSummary`) already carried
   `meanHoldChargedMoveDodgeCostSeconds`, and `representativeRun` already carried
   `holdChargedMoveDodgeCostEvents` — both were already flowing through `runComparatorScenario`'s
   existing `runSustainedComparison` call, just never rendered. Gated on
   `assumptions.holdChargedMoveUntilSafe` (zero and hidden otherwise), badged
   `.badge-unsourced` (new CSS class, reused `.badge-approximate`'s hue/semantics — "no better
   data exists" is the same claim as "this is this project's own unsourced placeholder"). Team
   Raid has NO equivalent — `TeamRaidSlotResult` carries no per-fight `holdChargedMoveDodgeCost*`
   field at all (Team Raid does one deterministic fight per slot, not a 200-run distribution) —
   flagged as an engine gap in the AFFECTS note, not built around.
4. **Dodge-execution-error band** — the one item needing new engine-facing plumbing:
   `sweepDodgeExecutionError` operates at `simulate.ts`'s single-attacker-vs-boss level
   (`StepwiseSimulationParams`), one level BELOW `comparison.ts`'s two-candidate
   `SustainedComparisonInputs` — nothing outside `packages/engine` ever needed that lower
   entry point before. New `run/dodgeExecutionErrorSweep.ts`'s `buildStepwiseParamsForCandidate`
   re-assembles the attacker/boss params for ONE candidate, built ONLY from already-exported
   engine functions (`effectiveStatsAtLevel`, `resolveCandidateMegaLevel`,
   `chargedMoveAtMegaLevel`, `ownBoostMultiplier`, `typeEffectiveness`, `isWeatherBoosted`,
   `bossEffectiveStats`, `bossEnrageStats`, `bossEffectiveHp`, `resolveMove`, `resolveBoost`,
   `effectiveLevelForBestBuddy`/`effectiveLevelForMegaLevel`) — never reimplements damage math,
   only repackages already-computed values into the lower-level shape (mirrors comparison.ts's
   own internal construction almost line-for-line). **This is a real drift risk** (two places now
   build the same shape) — mitigated with a dedicated cross-check test
   (`dodgeExecutionErrorSweep.test.ts`) asserting the sweep's `missedFraction=0` endpoint agrees
   EXACTLY (not approximately) with `runSustainedComparison`'s own `dodge:{kind:"perfect"}` path,
   same seeds, same everything else. If this test ever needs `toBeCloseTo` instead of exact
   equality, the two have drifted — investigate immediately, don't loosen the assertion. New
   `DodgeExecutionErrorBand.tsx` renders a 6-point line chart (x = dodge accuracy% descending
   100→50, y = mean own total damage, both candidates) + a data table reusing the existing
   `.time-series-table`/`.table-scroll` CSS classes (no new table styling needed). Complementary
   to `sensitivity.ts` check 4 ("Dodge accuracy"), which finds the nearest single flip on a
   continuous scan — this shows the whole curve at 6 discrete points instead. Real mechanic
   called out in the caveat prose: `missedFraction=1` ≠ `dodge:"none"` — both take identical
   damage, but a missed ATTEMPT still pays the dodge time cost every time, so always-attempt-
   always-miss is strictly worse than never trying.
5. **`bossMaxHpOverride`** (Team Raid only, per the brief) — `TeamAssumptions.bossMaxHpOverrideEnabled`,
   resolved via `registry.ts`'s existing `pastRaidBossOptions()` + `run/runSpeciesReport.ts`'s
   ALREADY-EXPORTED `validEraHp` guard (reused directly, not reimplemented — Species Report solved
   this exact "guard raidHistory's raw, unvalidated eraHp against the engine's throws-on-bad-value
   contract" problem first). The panel shows/hides the toggle based on whether the CURRENT target
   has a recorded row with a usable HP (`TeamRaidRunResult.eraHpMatch`, computed regardless of
   the toggle so the control can appear before opting in) and echoes the actual overridden HP
   figure inline in the checkbox label. `bossHp` (the "Boss battle HP" display) was changed to
   reflect whichever value is ACTUALLY fed to `runTeamRaid` (override when active, else the
   ordinary tier figure) — this is the exact "display disagrees with what was simulated" bug class
   CLAUDE.md's `effectiveBossChargedMoveFrequencySeconds` precedent already exists to avoid;
   followed the same pattern. A species can have MORE than one `pastRaidBossOptions()` row
   (different tiers/sources over time) — takes the first with a usable eraHp, documented as a
   deliberate simplification, not a picker for "which encounter."
6. **`reselectAfterWipe`** — new `run/teamRaidReselect.ts`. Engine deliberately implements no
   heuristic (`teamRaid.ts`'s own doc comment says so explicitly) since it has no roster pool.
   Chosen strategy, stated plainly per the brief's ask: a CHEAP, non-simulated damage-output proxy
   per pool entry (`effectiveAttack × chargedMove.power/duration × STAB × typeEffectiveness(vs THIS
   boss) × sqrt(effectiveStamina)` as a rough bulk factor) — explicitly NOT `rosterPlanner.ts`'s
   own Stage-1 screen (`screenScoreFor`, which calls `runSustainedComparison` per candidate — far
   too expensive to re-run on every wipe from inside a closure with none of that module's
   simulation-batching infra). Ranks the WHOLE pool once up front; on each wipe, excludes only the
   six `entryId`s that JUST fielded (matched via `TeamRaidSlotInput.slotId`, which this reselector
   sets on every roster it returns) — not everyone ever fielded, so a strong entry can return two
   wipes later. Falls back to the unfiltered top ranking (never an empty array — `runTeamRaid`
   throws on that) when exclusion would leave nothing. **Known, documented limitation**: cycle 0's
   roster is whatever the player hand-built in `TeamAssumptionPanel` — never drawn from the pool,
   so it never gets a pool `entryId` as its `slotId` — meaning the FIRST reselection (cycle 0→1)
   can't exclude "who just fainted" at all; every reselection after that (which uses this
   reselector's own output, which DOES set `slotId`) excludes correctly. Toggle shows an explicit
   "No-op right now — pool is empty" note when the imported roster (Roster tab) has zero entries,
   same "empty roster, explicit note" convention as Lineup Builder/multi-raid.

## A real, reproducible false alarm — worth reading before trusting a "wiring is broken" conclusion

Live-testing Best Buddy against the Comparator's DEFAULT scenario (Kartana vs Rayquaza vs
**Latios-mega**) showed the checkbox toggling `checked=true`, the share-link URL genuinely
encoding `candidateIsBestBuddy: [true, false]`, and the result card's DPS/damage/survival numbers
staying **byte-identical to 11 decimal places** across 200 iterations. That reads exactly like a
silently-dropped field. It wasn't: `effectiveStatsAtLevel` genuinely computes a different attack
stat (257→259 for this exact matchup) and `calculateDamage` genuinely produces different per-hit
output at low defense values — but against Latios-mega's real, large raid-boss defense stat, the
`floor()` in `calculateDamage` happened to round BOTH attack values down to the identical integer
for every hit Kartana lands in that specific fight, for both its fast and charged move. Confirmed
by swapping the target to a low-defense common species (Bidoof) in the same live session: damage
output measurably increased (2380.9→2415.1 mean total across 20 iterations). **Lesson: a `+1`
effective-level (or any small stat nudge) can be real, correctly-wired, and still produce
IDENTICAL simulated output against a specific high-defense matchup — floor() insensitivity, not a
bug. Don't conclude "the wiring is broken" from one matchup going flat; retest against a
low-defense target before reporting a false negative (or, worse, "fixing" working code).** This
is now baked into `run/runTeamRaid.test.ts`'s own friendship/Best Buddy tests too — they use a
SHORT `raidTimerSeconds` + `dodge:"none"` (so both compared runs share an identical boss-attack
RNG stream and the comparison isn't confounded by overkill-on-the-finishing-blow noise) rather
than comparing full-raid total damage, which is NOT monotonic with per-hit damage output (a
higher-DPS run can finish the boss off with a SMALLER overkill on the final hit, making its own
recorded total occasionally read LOWER despite genuinely higher output — a second, different trap
than the floor() one, also discovered live while writing these tests).

## Mid-task coordinator interrupt — a real, out-of-lane fix, done because explicitly instructed

The coordinator asked me (not Web lane 2, to avoid a race) to fix two now-false sentences in
`PowerUpOptimizerView.tsx`'s "Scope, noise floor & cost-table gaps" panel: an Eternatus
per-species candy-cost override that a concurrent `data-sync` session had just wired end-to-end
(their message included exact regenerated numbers to cite), and a "Best Buddy not modelled at
all" sentence that would have contradicted this same session's own Comparator/Team Raid work —
narrowed to "not modelled **in this tab**" per the coordinator's own wording, since Power-Up
Optimizer genuinely still doesn't have it. Both are one-paragraph copy edits, no logic touched;
typechecked clean in isolation. Worth remembering: a coordinator message mid-task naming a
specific file and saying "it is yours for the rest of this pass" is real authorization to touch a
file outside your stated ownership list for that one, scoped edit — don't decline on
"not my file" grounds when explicitly handed it.

## Verification

Live, in-browser, Playwright-driven (production build via `vite preview`, scratch `.mjs` scripts
under `packages/web/`, deleted after use — see `pattern_worktree_isolation...`/prior sessions'
"Playwright drivable from Bash" precedent): 12 checks on Comparator + Team Raid, all passing,
including two genuinely LIVE numeric deltas (friendship 11.1→12.3 DPS on Comparator, 280.4s→258.9s
clear time on Team Raid) and the eraHp override's 3,600→600 HP swap for a real target (Abra, a
recorded 1-Star past encounter). `npm run test:web` 306/306 (19 new: `dodgeExecutionErrorSweep`
×2, `teamRaidReselect` ×5, `runTeamRaid` ×6, plus assertions added to existing smoke/roundtrip
tests), `typecheck:web` and `lint` (web files) both clean, production build succeeds. `npm run
check-scenario-roundtrip`: 152/152. Full `npm run verify` was red only on a `scripts/` typecheck
error in `normalizedGolden.test.ts` from the SAME concurrent data-sync Eternatus work referenced
above — confirmed via a second `npm run lint` retry (the first hit a transient `ENOENT` from a
concurrent session deleting a scratch file mid-run) that this was transient/unrelated, not mine.

**Gotchas hit while writing the Playwright scripts** (useful for the next live-verification
pass): `CollapsibleSection`'s `id` prop is a `localStorage` key only, NEVER a DOM `id` attribute —
locate a collapsed section via `page.locator("summary", { hasText: "..." })` then
`.locator("xpath=ancestor::details[1]")` to scope inside it, not `#the-id`. `SpeciesPicker`'s
search input id is `${idPrefix}-input` (e.g. `#team-target-input`), not `-search`. Share-link
URLs use base64URL (`-`/`_`, no padding), not plain base64 — decode with
`.replace(/-/g,"+").replace(/_/g,"/")` + repad before `Buffer.from(..., "base64")`, plain `atob`
on the raw param fails.
