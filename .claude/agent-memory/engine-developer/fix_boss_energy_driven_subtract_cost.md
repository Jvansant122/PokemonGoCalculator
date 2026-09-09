---
name: fix-boss-energy-driven-subtract-cost
description: energy-driven boss cadence changed from bossEnergy=0-on-fire to bossEnergy-=energyCost, matching GoBattleSim and this project's own energy-gated-interval sibling — user decision 2026-09-08
metadata:
  type: project
---

## What changed

`packages/engine/src/simulate.ts`'s `attemptBossChargedMoveDecision` (backs
`StepwiseBoss.chargedMoveCadence = "energy-driven"`) used to reset
`bossEnergy = 0` on firing. Per explicit user decision 2026-09-08, changed to
`bossEnergy -= boss.chargedMove!.energyCost` — matching GoBattleSim's
open-source boss AI and this project's own `"energy-gated-interval"` model,
which already subtracted the cost on fire. The two cadence models' on-fire
behavior is no longer a documented divergence (see [[feature_boss_energy_driven_cadence]]
and MECHANICS.md's "Raid boss behaviour" > "Engine: matches, as of
2026-09-08" entry, which used to read "Engine: diverges on the energy reset"
before this change).

## Why this matters mechanically

For a 50-energy move fired from 100 energy, reset-to-0 meant the boss needed a
full fresh 50 energy before it could fire again; subtract-cost leaves 50
already banked — right back at the move's own cost — so a SECOND fire can
happen off leftover energy alone at the very next move-completion boundary,
with zero additional damage-taken energy required. This is a real behavior
change for any run where the boss's energy exceeds its charged move's cost by
more than a small margin (i.e., a fast-charging boss, or one that banked a lot
of damage-taken energy mid-cast) — it makes back-to-back/rapid-refire charged
moves MORE likely under `"energy-driven"`, not less.

## What did NOT need to change

Every existing pinned test in `energyDrivenBossCadence.test.ts` and
`energyDrivenCadenceWiring.test.ts` passed unmodified — their fixtures were
all constructed so a single fire's leftover energy (post-subtract) lands
below the charged move's cost anyway (e.g. 14+14=28, cost 20, leftover 8 <
20; or exactly-at-cost fixtures where leftover is exactly 0 either way), so
reset-to-0 and subtract-cost were behaviorally indistinguishable for those
specific numbers. This is a coincidence of how those fixtures were tuned, not
evidence the change was a no-op in general — added a new dedicated test
(`energyDrivenBossCadence.test.ts`, "a boss starting at 100 energy with a
50-cost move can fire a second time on leftover energy alone...") using
startingEnergy=100/cost=50 specifically because that ratio DOES distinguish
the two models (100-50=50, still >= cost, vs the old 100-50=0). Seed 1
verified deterministic (2 fires, ending energy exactly 0) via a throwaway tsx
scratch script against the real engine, per this project's verification
discipline — not hand arithmetic.

## Doc comments updated

`StepwiseBoss.chargedMoveCadence`'s doc on both the `"energy-driven"` and
`"energy-gated-interval"` variants, `attemptBossChargedMoveDecision`'s call
site (line ~565) and the parallel energy-gated-interval fire site (~line
703), plus `MECHANICS.md`'s "Engine: diverges on the energy reset" entry
(now "Engine: matches, as of 2026-09-08"). `teamRaid.ts`/`comparison.ts` had
no mentions of the reset-vs-subtract mechanism specifically (their doc
comments are about energy CARRYOVER across slot handoffs/wipes, a different
concern already correct regardless of reset-vs-subtract) — checked via grep,
left untouched.

## If revisiting

This re-baselines every `"energy-driven"` shared-link/scenario result where
the boss fired more than once in a run (more total charged hits landed, same
seed, than before this change) — flag to whoever owns HANDOFF.md/the
decision record if a downstream consumer (web-developer, skeptic) reports a
number moved and doesn't know why.
