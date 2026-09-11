---
name: fix_teamraid_enrage_reinit_bug_2026_09_11
description: simulate.ts's enragePhase was hardcoded to "normal" at init instead of derived from the boss's real starting HP fraction — every team-raid slot after the first false-reported a fresh enrage transition. Fixed; shadowEnrage.test.ts pinned number corrected (not a regression, the old pin WAS the bug); new dedicated regression test.
metadata:
  type: project
---

2026-09-11, injected mid-session by the coordinator (found by `web-developer`
against a live raid: 14 of 14 fielded slots against `sandslash-alola-shadow`
reported a non-null `enragedAtRaidSeconds`; only the first, 20.1s, was real).
I confirmed the root cause independently by reading `simulate.ts` before
touching anything, per the task's own instruction.

## Root cause

`simulate.ts`'s `simulateStepwiseBattle` initialized `let enragePhase:
"normal" | "enraged" = "normal";` unconditionally. But
`shadowEnragePhaseForHpFraction` (shadow.ts) is a PURE function of the boss's
CURRENT remaining-HP fraction — not path-dependent, no memory of how it got
there. The per-tick block computes `phase` fresh from
`(boss.enrage.damageDealtBeforeFight ?? 0) + totalFastMoveDamage +
totalChargedDamage` and fires a transition timestamp whenever `phase !==
enragePhase`. For a team raid's LATER slots, `damageDealtBeforeFight` already
carries in every earlier fight's accumulated damage — so a boss already
enraged (or already subdued) from an earlier slot starts a later slot's very
first tick with the CORRECT `phase` but the WRONG (hardcoded) `enragePhase`,
so the comparison always found a "transition" on that first tick regardless
of whether one actually happened.

**The in-code comment justifying the plain "which direction" check
("monotonic within one run...") was itself correct but misleadingly scoped**
— true within one CALL to `simulateStepwiseBattle`, false across a team
raid's sequence of calls, and its wording didn't distinguish the two. Left it
looking like the hardcoded initializer was an intentional consequence of that
reasoning rather than a bug. Rewrote it to say explicitly that monotonicity
within a call says nothing about what phase a call should START in, and that
`teamRaid.ts`'s slot handoffs are exactly the case that needs the initial
phase DERIVED rather than assumed.

## Fix

```ts
let enragePhase: "normal" | "enraged" = boss.enrage
  ? shadowEnragePhaseForHpFraction(Math.max(0, 1 - (boss.enrage.damageDealtBeforeFight ?? 0) / boss.enrage.maxHp))
  : "normal";
```

Reuses the EXACT same formula the per-tick block already computes (with
`totalFastMoveDamage`/`totalChargedDamage` both still 0 at this point in
the function, so this is literally "the same expression, evaluated at
t=0"). Byte-identical for every existing caller that never sets
`boss.enrage`, or sets it with `damageDealtBeforeFight` 0/undefined (every
STANDALONE fight — comparison.ts's `runSustainedComparison` always starts a
boss fresh per candidate) — the initializer still resolves to `"normal"` in
both cases.

**Crucially, this bug never affected the actual DAMAGE numbers** —
`liveBossAttackStat`/`liveBossDefenseStat` are set from `phase` (the
freshly-computed, always-correct value) every tick, never from the buggy
`enragePhase` bookkeeping variable. Only the TRANSITION TIMESTAMP fields
(`enragedAtSeconds`/`subduedAtSeconds`) were wrong. This is why
`web-developer`'s existing workaround (take the first non-null value across
the chronological slots array) already produced the correct headline number
on screen, and why fixing this does not change any rendered number — exactly
as the coordinator predicted, confirmed by the shadowEnrage.test.ts pin
below (every OTHER pinned value — totalDamage/duration/rate — was untouched
by the fix; only `enragedAtSeconds` itself changed).

## The one pinned test that had to change — and why it's correct to change, not a regression

`shadowEnrage.test.ts`'s "THE FLIP" test starts a STANDALONE (non-team-raid)
`simulateStepwiseBattle` fight with `damageDealtBeforeFight: 1000` on a
2000-max-HP boss — i.e. ALREADY 50% dealt, inside the enraged band (≤60%)
from t=0. The OLD pin asserted `enragedAtSeconds: 0.1` — that number WAS the
bug (a bogus "just became enraged at the very first tick" when in truth the
boss was ALREADY enraged before the fight even started, so no transition
ever occurred). Updated to `toBeNull()`, with a comment explaining why this
is the fix working, not breaking. Every other pinned value in that same test
(`totalDamage`, `duration`, `rate` for both archetypes, and the ranking flip
itself) is UNCHANGED — confirms the fix is exactly as scoped (transition
bookkeeping only, never the damage math).

## New regression test (the coordinator's explicit ask)

`shadowEnrage.test.ts`, "reports the real enrage transition on exactly the
fight it happened in — never re-detected on any later fight": a hand-tuned
3-slot roster (`FRAGILE_HITTER` — fragile enough to faint every fight,
`baseStamina: 45`) against a 100-HP Shadow boss, verified by actually running
`runTeamRaid` via a throwaway tsx scratch script (`packages/engine/test/
_scratch_enrage.ts`, deleted after use — iterated stats until the shape was
right, same discipline as every other pinned-number derivation in this file)
before pinning. Produces exactly 7 fights across 2 full wipe-and-revive
cycles, with:
- The ONE real enrage transition on fight 0 (`cycleIndex: 0, slotIndex: 0`,
  `enragedAtRaidSeconds ≈ 8.1`) — the boss crosses under 60% remaining HP
  mid-fight.
- Every one of the SIX later fights (`.slots.slice(1)`) reporting
  `enragedAtRaidSeconds: null` — the actual regression this test exists to
  pin; before the fix, most/all of these would have been non-null.
- A bonus, symmetric check: exactly one real SUBDUE transition, on the LAST
  fight only (never re-detected on an earlier one either — same bug class,
  opposite direction).

Also confirmed `npm run test:engine` full suite (619 passed, up from the
pre-fix 618 — the one net-new test) and `npm run typecheck`/`npm run lint`
clean after this change (lint's one warning is pre-existing,
`packages/web/src/SpeciesPicker.tsx`, unrelated).

Files: `packages/engine/src/simulate.ts` (enragePhase initializer + the
"Monotonic within one run" comment rewrite), `packages/engine/test/
shadowEnrage.test.ts` (one pin corrected, one new regression test added — 11
→ 12 tests in this file).
