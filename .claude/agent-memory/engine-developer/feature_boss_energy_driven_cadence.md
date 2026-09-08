---
name: feature-boss-energy-driven-cadence
description: StepwiseBoss.chargedMoveCadence "energy-driven" model — boss gains energy from damage taken + 50% instant-fire roll, opt-in, MECHANICS.md-sourced. UPDATED 2026-09-08 — the original "re-roll on energy change" trigger deadlocked; fixed to "re-roll on boss move-completion boundary."
metadata:
  type: project
---

Implemented 2026-09-08 per user request, sourced from `MECHANICS.md`'s "Raid boss
behaviour" section (Silph Road's September-2024 raid-rework analysis,
r/TheSilphRoad `1fckfja`, `[community-consensus]`).

## What changed

`packages/engine/src/energy.ts`: added `BOSS_ENERGY_PER_DAMAGE_TAKEN = 0.5` and
`bossEnergyFromDamageTaken()` — a **separate** constant from the attacker's
`ENERGY_PER_DAMAGE_TAKEN`, even though they're currently the same value. The
justification is historical, not hypothetical: Niantic dropped the boss-side
value to `0.02` during the September 2024 rework while leaving the attacker
side untouched, then reverted it — proof the two dials are independently
tunable in the real game, so forcing a shared constant would be wrong even
though today's values match.

`packages/engine/src/simulate.ts`: added `StepwiseBoss.chargedMoveCadence?:
"fixed-interval" | "energy-driven"` (default `"fixed-interval"`, i.e. today's
behavior, byte-identical — all 192 pre-existing tests pass unchanged). Under
`"energy-driven"`:
- boss energy accrues from its own fast move's `energyGain` AND from
  `bossEnergyFromDamageTaken(damage dealt to it)`, capped at `MAX_ENERGY`.
- `BOSS_CHARGED_MOVE_USE_PROBABILITY = 0.5` (also new, own doc-cited constant)
  is rolled at each **decision point**, not every 0.1s tick.
- `chargedMoveMeanIntervalSeconds`/`chargedMoveWarmupSeconds`/
  `chargedMoveNextFireInSeconds` are all ignored in this mode; `startingEnergy`
  is reused as the boss's literal starting energy total instead.

## The bug I caught before shipping it (self-caught, not user-reported)

My first draft rolled the 50% chance on **every single 0.1s tick** as long as
`bossEnergy >= cost` and the boss wasn't mid-cast. That's wrong: it turns a
"50% chance per decision" into an effective ~99.9%-chance-within-1-second
(10 independent rolls/sec), because nothing gated re-rolling absent new
information. Fixed by tracking `bossEnergyAtLastDecision` and only attempting
a roll when `bossEnergy` has actually changed since the last attempt (new
damage/fast-move energy in, or the mid-cast lock just lifted). This is also
exactly what makes "higher DPS => more boss charged moves" work mechanically:
more/bigger hits landing = more energy-changing events = more decision
attempts per unit time, not just faster energy accumulation to a single
threshold. **If a future change to this file removes/bypasses
`bossEnergyAtLastDecision`, re-derive the per-tick-vs-per-event distinction
before assuming a "simplification" is safe — it silently multiplies the
effective fire rate by ~tick-rate/decision-rate.**

## Design choice: decision points, not a periodic clock

There's no sourced cadence for how often a real boss "polls" for the 50% roll
(MECHANICS.md only says "decided instantly," not how often absent new
energy). I chose "roll exactly once per energy-changing event or cast-ending
transition" as the most defensible reading of "decided instantly, no
look-ahead" — reactive to state changes, not a free-running timer. This also
naturally reproduces the sourced "back-to-back charged moves" behavior:
energy keeps accumulating during a cast (gated only on *firing*, not on
*accruing*), so the moment a cast ends, `bossEnergy != bossEnergyAtLastDecision`
is very likely already true, giving an immediate fresh attempt — no special
case needed for the back-to-back scenario, it falls out of the general rule.

## One-tick lag, documented not fixed

The attacker's own fast-move damage (and the boss's own fast-move energy
gain) land in the tick loop **after** the boss's decision block runs each
tick, so that source of boss energy is only visible to the decision check
starting the *next* 0.1s tick. Left as a documented, bounded (<=0.1s)
tick-quantization simplification consistent with this file's existing
`assertTickAligned` philosophy — not treated as a bug worth restructuring the
loop over.

## Verification

New test file `packages/engine/test/energyDrivenBossCadence.test.ts` (5 tests,
all hand-computed round-number fixtures, no shared species fixture needed):
accrual-from-damage-taken isolation, higher-DPS-more-charged-moves (headline
behavior), 50%-roll statistical + seed-reproducibility, back-to-back +
cadence-floor invariant across 200 seeds, and model-off byte-identical proof.
Full suite: 197/197 passing (192 pre-existing + 5 new).

Measured impact (scratch script, not committed — see
`verification_without_browser_tool.md` technique): representative glass
cannons (Kartana, Gengar) lost ~57-63% mean survival time turning the model
on; bulky attackers (Blissey, Snorlax) lost ~31-37% — confirms the intended
"penalizes glass cannons more" effect, magnitude not yet validated against
any real-game observation.

## Explicitly deferred to the requester

Default stays OFF pending the requester's own before/after review — do not
flip the default without them saying so. The asymmetric fast/charged move
delay mechanic (MECHANICS.md, same section) was explicitly out of scope for
this change and remains unmodeled.

## 2026-09-08 update: the "re-roll on energy change" trigger deadlocked — fixed to move-completion boundaries

The self-caught bug above ("per-tick vs per-event") was real, but the fix I
shipped for it (`bossEnergy !== bossEnergyAtLastDecision`) introduced a WORSE
bug the user caught via measurement: once boss energy pins at `MAX_ENERGY`
and one roll fails, energy can never "change" again (it's already at the
cap), so the boss goes silent for the rest of the fight. Measured: 101/200
seeded 60s runs with an overwhelming attacker had ZERO boss charged moves the
entire run.

**Fix**: the roll now triggers on a **boss move-completion boundary** —
the instant the boss finishes a fast move, OR the instant one of its own
charged-move casts ends — not on "energy changed." `attemptBossChargedMoveDecision()`
in `simulate.ts` is the single helper called from exactly those two points in
the tick loop; `bossEnergyAtLastDecision` is gone entirely. This structurally
cannot deadlock: the boss's own fast move keeps firing on schedule regardless
of its energy total, so a fresh decision opportunity always eventually
arrives. Both triggers fire on the SAME tick when applicable, so back-to-back
charged casts (a charged-move-end immediately re-triggering) and a
fast-move-landing immediately promoting into a charged hit (only one boss
action lands per tick, so a successful post-fast-landing roll REPLACES that
tick's fast hit) both still work without any added lag.

**Honesty requirement, not optional**: per
`.claude/agent-memory/pogo-researcher/fact_boss_charged_move_decision_cadence.md`
(researched same session), the real per-opportunity denominator is NOT
documented anywhere fetchable — "move-completion boundary" is a reasoned
inference reconciling two already-sourced facts ("decided instantly" +
"three charged moves observed back-to-back with zero fast moves between"),
not a cited mechanic. This is spelled out at length in `simulate.ts`'s
`StepwiseBoss.chargedMoveCadence` doc comment and on
`attemptBossChargedMoveDecision` itself — do not strip that caveat out or
present the trigger as confirmed if touching this again. Explicitly did NOT
tie the roll to the unrelated 0.5s combat cycle (separately sourced from the
50% figure, no documented link between them) even though both numbers are
"0.5" — that pairing would be an invented mechanic.

**Test fallout**: 4 of the 5 original energy-driven tests broke — not
because the new trigger is wrong, but because their fixtures relied on the
attacker's OWN fast-move hit (not the boss's move-completion) as the decision
trigger, which is no longer true. Rewrote the "50% roll honoured
statistically" test to use `boss.startingEnergy` so the boss's own first
fast-move landing IS the one decision boundary under test, instead of hoping
an attacker hit synced up with it. The "accrues from damage taken" and
"higher-DPS -> more charged moves" tests needed no logic changes (their
fixture happens to give the boss and attacker the same 1s fast-move cadence,
so decision-opportunity counts are coincidentally similar under both
models) — only comment updates for accuracy. Added two new tests: the exact
deadlock regression (200 seeds, overwhelming attacker, asserts zero runs with
zero charged moves), and a per-tick-inflation guard (asserts
`bossChargedHitsTaken <= maxSeconds / chargedMove.durationSeconds`, the
structural cadence-floor ceiling). Full suite: 199/199 (197 pre-existing + 2
new; net +2 since one test was rewritten in place, not added).

**Measured impact on real species** (`data/normalized/species.json`, not
synthetic fixtures — L40 15/15/15 vs Regirock 5-Star Raids, 300 seeds, 60s,
each species' `moves[0]`/`moves[0]` moveset, fixed-interval baseline mean =
`bossChargedMoveReadySeconds(bossFast, bossCharged, 0)` = 13.0s): mean
survival seconds OFF -> ON: Gengar 14.0 -> 9.2 (**-34%**), Kartana 16.0 ->
9.6 (**-40%**), Blissey 37.0 -> 30.5 (**-18%**), Metagross 23.7 -> 16.8
(**-29%**). Mean boss charged hits landed under ON: Gengar 0.99, Kartana
1.00, Blissey 2.74, Metagross 1.51.

**This flips sign versus the pre-fix (deadlock-affected) measurement**
(Gengar -19%, Kartana -16%, Blissey **+6%**, Metagross **+7%**) — Blissey and
Metagross went from "energy-driven mode looks BETTER for survival" to
solidly worse, because the deadlock was silently gifting long-surviving
(bulky) attackers extended stretches of a permanently-silenced boss once
energy capped, which no longer happens. **Any future measurement of this
mode's impact must be re-taken post-fix — the pre-fix numbers are not just
imprecise, they're the wrong sign for two of the four test species.**
