---
name: feature-number-field-select-all-and-blur-clamp
description: Shared NumberField.tsx component (2026-09-10) fixing the "click once, type over a pre-filled numeric field, digits append instead of replace" bug across all 50 raw type="number" sites in 6 files — select-all-on-focus + clamp-only-on-blur, with a candy/stardust warnAbove hint instead of a fake ceiling
metadata:
  type: feedback
---

Round 2 of a two-round audit fix. Round 1 (see [[feature_super_max_eligibility_gate_and_two_bugfixes]])
fixed only `SpeciesPicker.tsx`'s text search box with a one-line `onFocus={(e) => e.target.select()}`.
The auditor's follow-up found every OTHER numeric input still had the old append-not-replace bug —
worst case, a "Candy on hand" field reading 100, clicked once, typed "50", silently became 10050,
with every downstream afford/can't-afford verdict then computed off a candy pool 100x too large and
zero error surfaced. This task swept the whole app.

**What I built: `packages/web/src/NumberField.tsx`.** One shared component wrapping `<input
type="number">`, used at **all 50** of the app's raw `type="number"` sites (grep-verified before and
after — `grep -rc 'type="number"' packages/web/src --include='*.tsx'` now only matches the
component's own internal `<input>`). Two behaviors:
1. `onFocus={(e) => e.target.select()}` — the same one-liner as the SpeciesPicker fix, generalized.
2. `onBlur` clamps to `[min, max]` via a **pure, exported, unit-tested** helper
   (`resolveNumberFieldBlurValue(rawText, {min, max, allowEmpty})`) — returns `null` for unparseable
   text (leave the field alone, don't guess), `undefined` for an intentionally-cleared `allowEmpty`
   field, otherwise the clamped number. **Never clamps on `onChange`** — clamping every keystroke is
   hostile because typing toward "50" passes through "5", which would clamp mid-keystroke to "5"
   immediately. This was the single most important design constraint from the task and worth
   repeating for the next agent who touches this: keystroke-time and blur-time are different
   semantic moments and must use different logic.

**Files touched (6), call-site counts confirmed by grep before writing any code:**
`AssumptionPanel.tsx` (11), `TeamAssumptionPanel.tsx` (9), `IvBreakpointsAssumptionPanel.tsx` (7),
`PowerUpOptimizerAssumptionPanel.tsx` (16, the most — includes the nullable per-candy-family pool
inputs, see below), `SpeciesReportView.tsx` (6), `BossSetPanel.tsx` (1, maxBossCount).
`AttackDefenseBreakpointsView.tsx` has no numeric level/IV input at all (it's the 0-15×levels grid
tab — nothing to convert there). `matchingTeammateCount` (a `type="range"` slider) was deliberately
**left alone** — range inputs don't accept free-typed digit sequences the same way (arrow-key/drag
only in practice), so the append-bug doesn't apply; converting it would have been scope creep.

**The nullable-value variant.** Two sites (`PowerUpOptimizerAssumptionPanel.tsx`'s per-candy-family
`candyByFamilyId` pool table, multi-raid mode) track "nothing entered yet" as a real distinct state
(`value: number | undefined`, rendered with `placeholder="unknown"`), not defaulting an empty box to
0 like every other candy field. Added an `allowEmpty` prop rather than forking a second component —
`resolveNumberFieldBlurValue` returns `undefined` (not `0`) for an emptied `allowEmpty` field. Every
other 48 sites pass a plain `number` (TS happily accepts a `number` where `number | undefined` is
declared, so the non-nullable call sites needed zero extra ceremony).

**Out-of-range decision, and why it's asymmetric (the task explicitly asked for this reasoning):**
- **Level and IVs get a hard clamp on blur** (`min`/`max` were already being passed to every one of
  these inputs — the component's clamp is a pure additive fix, no new bounds invented). Level 357
  now becomes 50 on blur instead of reaching `cpmForLevel` and throwing; IV 99 becomes 15. This is
  strictly an *improvement* over the pre-existing behavior (an ugly-but-legible engine error), not a
  rescue of something that was silent before.
- **Candy/XL candy/stardust/Rare Candy get NO `max` prop at all** — there is no natural game-rule
  ceiling to clamp to (real accounts can legitimately hold five- or six-figure amounts), and
  inventing one would be exactly the kind of fabricated constant this project explicitly avoids
  elsewhere (see CLAUDE.md's "load-bearing constants" framing). Instead these 9 fields (5 in
  single-raid: candyOnHand/xlCandyOnHand/stardustOnHand/rareCandyOnHand/rareCandyXlOnHand, plus the
  2 nullable per-family ones = 7, times some repeated across slot loops) get a new `warnAbove={99_999}`
  prop — a **non-blocking** `<p className="species-picker-hint">` rendered under the field once the
  value exceeds the threshold, never altering the stored value. `CURRENCY_SANITY_THRESHOLD` is a
  single module-level constant in `PowerUpOptimizerAssumptionPanel.tsx` (the only file with
  currency-shaped fields) so the threshold has one place to tune. This is deliberately generous
  (99,999, not something small like 9,999) — the goal is catching the exact "typo landed an extra
  digit" bug class the auditor found, not gatekeeping a genuinely large stockpile.
- **Time-cost fields with only a `min` (teammateDps, bossFreq, swapCost, reviveCost,
  minFightLengthSeconds, maxBossCount)** got the clamp-on-blur-at-min-only treatment for free (same
  component, no `max` passed) — matches their pre-existing `Math.max(0, ...)` onChange guards, now
  also enforced on blur. No `warnAbove` added here; these aren't the "100x-too-large and nobody
  notices" bug class the task was scoped around (an oddly-large boss frequency just produces an
  unusual scenario, not a silently-wrong verdict the way an inflated candy pool does).

**A `.type()`-is-deprecated Playwright gotcha hit while writing the verification script** (not
committed, scratch only): `Locator.type()` still exists but current Playwright docs push
`pressSequentially()` — used the latter in the verification script to match current API guidance,
though `.type()` would likely still have worked on this repo's pinned `@playwright/test@^1.63.0`.

**Verification depth:** `npm run verify` fully green (test/typecheck/lint/check/build — same
pre-existing `SpeciesPicker.tsx` `set-state-in-effect` warning, unrelated line, untouched);
`npm run test:e2e` 14/14 twice (before and after the full edit pass); `NumberField.test.ts` (9 new
unit tests on the pure blur-resolver, including the literal "357 clamps to 50" and "10050 stays
10050 when no max is set" cases); `check-scenario-roundtrip` unchanged at 114 fields (this was a
pure input-mechanism change, zero `Scenario`/`Assumptions` fields added/removed/renamed, exactly per
the task's constraint). **Live browser verification, not just automated tests**: built `dist/`,
served via `vite preview --port 4300` (checked the port free first — another concurrent session had
5173 already bound, matching [[feature_concurrent_sessions_shared_worktree]]'s established
discipline), drove a throwaway Playwright script from inside `packages/web/` (not the OS temp
scratchpad — needed for `@playwright/test` module resolution to find the repo-root `node_modules`,
same constraint as prior sessions' `@pogo-analyzer/engine` resolution issue) against 3 different
tabs (power-up-optimizer, comparator, iv-breakpoints): reproduced the auditor's EXACT repro
(pre-filled 100, one click, type "50" → reads "50" on both the candy field and stardust field, not
10050), the level-357-clamps-to-50-on-blur case on two different tabs, the IV-99-clamps-to-15 case,
and confirmed the large-stardust-value (500000) stays unclamped with the warning hint rendered.
Zero console/page errors across the whole run. Killed the preview server via `taskkill //PID <pid>
//T //F` per the known Windows `spawn`+`shell:true`+`.kill()` orphan gotcha (already in this file's
system prompt) rather than a bare kill, and deleted the scratch script + log afterward.

**Stage-nothing discipline confirmed necessary this session**: `git status` at task start showed a
huge number of OTHER agents' already-uncommitted, unrelated changes sitting in the shared worktree
(engine/, scripts/, and several web files this task didn't touch) — `git diff --stat` on my own 6
edited files initially looked alarmingly large (e.g. 525 changed lines in `AssumptionPanel.tsx` for
what should have been ~11 small edits) until I checked `git diff` content directly and confirmed the
bulk was a DIFFERENT, already-uncommitted feature (`showDetailedAssumptions`/dodge-override work,
matches [[feature_comparator_advanced_assumptions_gate]]) sitting in the same file, not anything I
introduced. Lesson: when `git diff --stat` looks disproportionate to the edits you made, grep the
diff for your own added symbol names (`grep -c NumberField` here) to confirm your change is a small,
correct subset before assuming something went wrong — don't just trust the line count.
