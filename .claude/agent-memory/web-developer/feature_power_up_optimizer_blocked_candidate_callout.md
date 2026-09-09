---
name: feature_power_up_optimizer_blocked_candidate_callout
description: Rendering PowerUpBudgetPlan.bestBlockedCandidate ("blocked, not done" vs "genuinely optimal") in the fixed-budget plan section, plus a second confirmation that concurrent-session file churn produces transient tsc failures outside packages/engine too
metadata:
  type: project
---

Built 2026-09-08, same day as [[feature_power_up_optimizer_fixed_budget_plan]] — a small,
contained follow-up once the engine started reporting `PowerUpBudgetPlan.bestBlockedCandidate`
(a real, noise-floor-clearing gain that exists but isn't affordable yet, distinct from the plan
genuinely having nothing left to do). Before this, `budgetStopReasonSentence`'s
`no-significant-candidate`/`budget-exhausted` wording read as "nothing else helps" even when a
much bigger blocked gain existed — the exact bug report: default roster vs Mega Tyranitar at
100k stardust/10 candy per slot/25 Rare Candy stopped after 2 steps with a real +0.26 team-DPS
gain sitting unreported just out of reach.

**Gave it a dedicated, non-footnote CSS treatment (`.blocked-gain-callout` in `styles.css`) —
bordered box with `accent-y` (the same "pay attention" orange `badge-hypothetical` already uses),
not another `<p className="caveats">` line.** This tab never uses `accent-x`/`accent-y` for
anything else (no two-candidate comparison to collide with, unlike Comparator's X/Y color
scheme), so reusing that hue here is safe. Placed the callout immediately after the section's
intro paragraph and BEFORE the baseline/final result-card — first thing read on scroll, per the
task's explicit "worth more than every affordable option combined" instruction.

**Rendered as a strict either/or, unconditional on `stopReason`** — the callout checks only
`plan.bestBlockedCandidate` (null vs non-null), not which of the 4 stop reasons applies, so it
correctly covers `budget-exhausted` and any other stop reason the same way it covers
`no-significant-candidate`, per the task's explicit requirement not to special-case just one
reason.

**Every `shortfalls[]` entry rendered, joined with a real "a, b, and c" English list
(`joinWithAnd`), never `shortfalls[0]`** — the real default-roster case is short on stardust AND
candy simultaneously, and CLAUDE.md's standing decision against blending stardust/candy into one
composite number means the sentence must name each resource separately rather than picking one.

**Exported the composed sentence function (`blockedCandidateSentence`) from the View file itself**
(same precedent as `DEFAULT_ASSUMPTIONS`/`scenarioToAssumptions` already being exported from
View.tsx files) so `scripts/run-scenario.ts`'s CLI headline calls the exact same function instead
of re-deriving similar-but-different wording — CLI == UI by construction, per this project's own
stated architecture rule.

**`bestBlockedCandidate` is engine-computed output, correctly kept OFF the Scenario/Assumptions
surface** — confirmed via `check-scenario-roundtrip` staying at 19 fields for this tab before and
after the change. Don't be tempted to "share" a blocked-candidate result via URL; it's derived
fresh from the plan run every time, same as `data`/`plan` themselves.

**Test empirically confirmed the task's own numeric premise doesn't reproduce exactly, and that's
fine.** A scratch script reproducing "100k stardust / 10 candy per slot / 25 Rare Candy" found the
engine's bounded (non-exhaustive) blocked-candidate search reports Mega Latios Lv35->50
(+0.25 team DPS) as the best blocked candidate, not the task's stated Tyranitar Lv31->37
(+0.26) — plausible drift from RNG seed differences or the search's own
`blockedCandidateLevelsPerSlot` bound (documented as NOT exhaustive), not a wiring bug. Wrote the
smoke test to assert general shape (finite deltaTeamDps > noiseFloor, every shortfall has a valid
resource name and shortfall > 0) rather than pinning the exact species/numbers from the bug
report, since the illustrative example was never guaranteed reproducible byte-for-byte.

**Second confirmation that concurrent-session file churn produces transient tsc failures, and
this time OUTSIDE packages/engine too** — extending [[feature_boss_cadence_toggle]]'s lesson.
Mid-session, `npm run typecheck` failed twice in a row with DIFFERENT symptoms each time: first a
missing-field error in `packages/engine/src/powerUp.ts` at one line number, then (after re-running
minutes later) a clean engine/web pass but new errors in `scripts/_probe_dodge5.tmp.ts` /
`scripts/_probe_dodge_sanity3.tmp.ts` — throwaway scratch files from a concurrent per-candidate-
dodge-override session that were created, edited, and deleted between my own tsc invocations
(confirmed via repeated `git status --porcelain scripts/` showing a DIFFERENT single `_probe*.tmp.ts`
file present each time I checked). A third re-run came back fully clean. **Lesson: when
`npm run typecheck`/`build` fails in a file you never touched, re-run it once more before
reporting a real blocker — a concurrent session's own scratch/WIP files can transiently fail the
shared `tsconfig.scripts.json` project (which type-checks all of `scripts/` together) even though
neither your work nor theirs is actually broken.** Report on the LAST clean-or-not state you
personally observed, and name the specific untouched files if it's still failing when you stop.
