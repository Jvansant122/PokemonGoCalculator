---
name: investigation-stepwise-tick-timing
description: Three findings from an overseer-directed audit of simulate.ts's 100ms tick (tick-alignment validation, DODGE_WINDOW_SECONDS dead-code status, same-tick tie-break bug) and what was actually changed
metadata:
  type: project
---

Investigated 2026-09-05, all three fixed/documented in the same pass (`packages/engine/src/simulate.ts`,
`packages/engine/src/breakpoints.ts`, `packages/engine/test/simulate.test.ts`).

**1. Tick-quantization is real but currently dormant.** All 77 fast + 240 charged real synced
moves have durations that are exact multiples of the 100ms tick (`DEFAULT_TICK_SECONDS`), so no
drift exists today. But it was a completely silent assumption. Added `isTickAlignedDuration`
(exported) and an internal `assertTickAligned` that `simulateStepwiseBattle` now calls on all
four durations (attacker fast/charged, boss fast/charged) at the top of every run — throws with a
clear message rather than letting a future non-aligned move (e.g. a finer-grained future data
source) silently delay fires by up to just-under-one-tick per cycle. Precedent for "throw on bad
data rather than silently degrade": `shadowAdjustedBaseStats`'s mega/shadow mutual-exclusion throw
(see [[constant_shadow_multipliers]]). Checked in **milliseconds**, not raw division — `3.5 / 0.1`
is not exactly `35` in IEEE 754, so a naive `% tickSeconds === 0` would false-negative on ordinary
correctly-aligned durations like 3.5s.

**2. `DODGE_WINDOW_SECONDS` (breakpoints.ts) is genuinely dead code, and that's correct, not a
bug.** Grepped the whole engine tree — it's referenced in exactly one comment (simulate.ts) and
never consumed computationally anywhere. Confirmed this is the right design, not an oversight:
gating dodge feasibility on this window would require tracking a windup/telegraph phase separate
from a hit's landing time, which pogoapi.net has no frame-level data for at all — same "no data
basis" reasoning that keeps `ChargedMove.perfectlyDodgeable` hand-set-only rather than derived.
Rewrote its doc comment to say this explicitly instead of reading like a value that gets consumed
somewhere. Kept it exported (rather than removing it) since multiple comments across the codebase
cite the 0.7s figure by name — one place to update if the figure or the modeling decision is ever
revisited.

**3. Real same-tick tie-break bug, now fixed.** In `simulateStepwiseBattle`'s per-tick loop, the
boss-hit block (which can `break` on a fatal hit) ran BEFORE the "attacker's own charged-move
animation completing" block. `isMidOwnAnimation` already uses a strict `<` against
`attackerAnimationEndsAt` — meaning a hit landing on the EXACT tick the cast ends was already
treated as "no longer mid-animation" (full dodge rules apply). That convention only makes sense if
the cast is considered complete by that tick, so the landing must be credited even when a fatal
boss hit resolves on the same tick — the old ordering silently discarded it instead (a real bug,
not a deliberate tie-break, since the mid-animation flag already implied the opposite). Fixed by
moving the animation-completing block before the boss-hit block; this is behavior-preserving for
every non-tied tick (verified: `isMidOwnAnimation`'s truth value at a tie doesn't change, since
`attackerAnimationEndsAt` was already null via the reorder exactly when the old strict-`<` check
would've already evaluated false). For every OTHER same-tick collision (fast move firing, or
starting a new cast, vs. a fatal boss hit) there's no equivalent contradicting signal — kept
"boss wins the tie" there, documented explicitly at the `break` site, matching `combat.ts`'s
`simulateOpeningBurst` which already documents the identical choice for its own 2-pointer merge.
Regression test: `simulate.test.ts`'s "same-tick tie" describe block (hp=18, boss deals 6/hit at
t=1/2/3, attacker's cast started at t=1 completes at t=3 — the exact tick the third hit is fatal).

**Takeaway for future audits of this file**: when asked to "verify a reading is correct" on a
tie/ordering question in `simulate.ts`, check whether an existing strict-inequality convention
elsewhere in the same function already implies an answer before treating it as a fresh arbitrary
choice — `isMidOwnAnimation`'s `<` (not `<=`) was the tell here.
