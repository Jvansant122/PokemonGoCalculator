---
name: investigation-charged-damage-mid-animation-contradiction
description: skeptic-reported "died mid own-animation 100% but nonzero charged damage" was not an engine bug — a real multi-cast sequence within one run; the web caveat text's blanket claim was the actual defect
metadata:
  type: project
---

On 2026-09-06 a skeptic audit flagged the default Comparator scenario (kartana vs rayquaza vs
latios-mega, level 35, perfect IVs, dodge none) as showing "Died mid own-animation: 100%" for
Rayquaza alongside a nonzero "mean charged damage: 119" and zero-variance p10/median/p90 total
damage (155) — apparently contradicting the app's own caveat text ("dies mid-animation... lands 0
charged damage that run").

Traced tick-by-tick with a throwaway tsx script (temporarily instrumenting `simulate.ts`'s tick
loop with a `globalThis.__SIM_DEBUG__` gate, then reverting) against the real default scenario.
Root cause: **not an engine bug**. `simulateStepwiseBattle` legitimately allows an attacker to
land ONE charged move (fueled by fast-move energy + `ENERGY_PER_DAMAGE_TAKEN` from boss hits taken
mid-cast), then immediately re-enter a SECOND cast using energy accumulated during/after the first
cast's animation, and die mid THAT second cast. `diedDuringOwnChargedMoveAnimation` only describes
the fatal/final cast attempt — it does not and should not imply the run's `totalChargedDamage` is
zero. In the reproduced scenario the boss's timing was fully deterministic (its charged move
warmup + jitter range never came due before the fight ended), so all 200 seeds produced the exact
same numbers — explaining the zero variance the skeptic also flagged as suspicious (that part was
correct behavior, not a separate bug).

The actual defect is `packages/web/src/ComparatorView.tsx`'s "Known caveats" panel text (~line
715-716): "a candidate that dies mid-animation on its own charged move... lands 0 charged damage
that run" is a false blanket claim — true only when the run had exactly one charged-move attempt
total. This is `web-developer`'s fix, not `engine-developer`'s (out of this agent's file scope).

What I did on the engine side instead of touching web text:
- Strengthened `StepwiseRunResult.diedDuringOwnChargedMoveAnimation`'s doc comment in
  `packages/engine/src/simulate.ts` to explicitly state the non-implication and point at the new
  test.
- Added a hand-traced, fully deterministic regression test in
  `packages/engine/test/simulate.test.ts` ("diedDuringOwnChargedMoveAnimation does not imply zero
  total charged damage") that pins `diedDuringOwnChargedMoveAnimation === true` co-occurring with
  `totalChargedDamage === 26 > 0` in a single run, plus a `runStepwiseDistribution` check that
  `fractionDiedDuringOwnAnimation === 1` while `meanChargedDamage === 26` — reproducing the exact
  shape of the skeptic's reported "contradiction" as the CORRECT, expected output. This guards
  against a future engine change that "fixes" the symptom by forcing charged damage to 0 whenever
  the flag is true, which would be wrong.

**Lesson for next time**: when a skeptic/bug report frames something as "one of these three things
must be wrong," don't assume the fix belongs in the file you were pointed at — trace the actual
numbers first (tsx scratch script against real data, per `verification_without_browser_tool.md`
technique referenced in web-developer's memory) before touching any code. Here two of the three
hypothesized culprits (classification logic, damage aggregation) were fine; only the prose
description was wrong, and it lived in a different package.

See also [[real_vs_hypothetical_fixture_tradeoff]] for why the regression test uses a fully
hand-authored synthetic fixture (deterministic, no boss charged move) rather than trying to pin
against the live `rayquaza`/`latios-mega` species data, which would drift with `data-sync` resyncs.

**Related but distinct gotcha found 2026-09-09** (see
[[feature_super_max_plus_moves_and_mega_level]]): `simulateOpeningBurst` (comparison.ts's
`runComparison`) has NO cast-animation/vulnerability window for the attacker's own charged move at
all — it lands instantly the moment energy allows — whereas `simulateStepwiseBattle` (this file's
subject) DOES model one. A fixture's exact HP/timing tuned to work under the opening-burst model
(e.g. CANDIDATE_ALPHA/BOSS_TIDE, tuned to die at exactly 7.5s) can silently produce a fully
suppressed (zero) charged-move outcome if reused verbatim in a NEW stepwise-engine test — not a bug
in either simulator, just two genuinely different models that don't share fixture tuning safely.
