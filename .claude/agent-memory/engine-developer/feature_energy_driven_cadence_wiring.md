---
name: feature-energy-driven-cadence-wiring
description: Threaded StepwiseBoss.chargedMoveCadence into SustainedComparisonInputs/TeamRaidInputs/SpeciesReportInputs; the real work was TeamRaid boss-energy carryover across slot handoffs AND wipe-and-revive (energy follows the same "one continuous encounter" rule as the existing charged-move cooldown).
metadata:
  type: project
---

Implemented 2026-09-08, per `PLAN_energy_driven_boss_cadence.md`. The underlying
model itself (`StepwiseBoss.chargedMoveCadence`, `BOSS_ENERGY_PER_DAMAGE_TAKEN`,
`BOSS_CHARGED_MOVE_USE_PROBABILITY`) already existed and is documented in
[[feature_boss_energy_driven_cadence]] — this pass is the plumbing that makes
it reachable from the three simulating entry points, plus one genuine design
problem in `teamRaid.ts`.

## Pinned field, verbatim on all three input types

```ts
bossChargedMoveCadence?: "fixed-interval" | "energy-driven";
```

Added to `SustainedComparisonInputs` (`comparison.ts`), `TeamRaidInputs`
(`teamRaid.ts`), `SpeciesReportInputs` (`speciesReport.ts`, pass-through into
its single `runSustainedComparison` call). Default stays `"fixed-interval"`
everywhere — omitted/undefined is byte-identical to before the field existed
(verified: all 199 pre-existing tests unchanged, 0 moved).

**A `web-developer`-side agent was building against this exact field name in
parallel** (already-uncommitted changes to `AssumptionPanel.tsx`,
`ComparatorView.tsx`, `SpeciesReportView.tsx`, `TeamAssumptionPanel.tsx`,
`TeamRaidView.tsx`, `sensitivity.ts`, a new `bossCadence.tsx`) — confirmed the
field name matches exactly before finishing. **They did NOT add the field to
the engine's actual `Scenario`/`TeamScenario` types** — instead they extended
locally (`interface ComparatorScenario extends Scenario { bossChargedMoveCadence
?: ... }`), the same pattern already used for `candidateShadow` (also not on
engine's `Scenario`). This technically round-trips (generic JSON
serialization doesn't care about the TS field list) but is a deviation from
CLAUDE.md's "every user-facing assumption must round-trip through Scenario,
and that's engine-owned" standing decision. I did NOT add the field to
`scenario.ts`/`teamScenario.ts` myself since it was explicitly out of my
delegated scope this session (task said "packages/engine only" and listed only
the three Input interfaces + TeamRaid carryover) — **flagging this as an open
item**: if asked to formalize Scenario round-trip properly, promote
`bossChargedMoveCadence` onto `Scenario`/`TeamScenario` for real, matching
`candidateShadow`'s fate whenever that gets resolved too.

## The real work: TeamRaid boss-energy carryover

Team Raid is ONE continuous encounter across a sequential 6-slot roster. Under
`"fixed-interval"`, the boss's charged-move cooldown already carries across
every slot handoff AND every wipe-and-revive (pre-existing
`bossChargedMoveResidualSeconds` -> `chargedMoveNextFireInSeconds` machinery).
Under `"energy-driven"` there's no cooldown to carry — the boss carries
**energy** instead. Missing this would have been a subtle, dangerous bug: a
slot handoff silently draining the boss back to 0 energy makes energy-driven
mode look *more forgiving* than fixed-interval, exactly backwards from the
model's whole point (penalizing sustained high-DPS pressure).

**Decision: energy carries across a wipe-and-revive too**, for the identical
"one continuous encounter from the boss's side" reasoning already applied to
the fixed-interval cooldown — stated explicitly in `teamRaid.ts`'s doc
comments now, not left implied. Mechanically this required zero extra
special-casing: `carriedNextFireInSeconds`/`carriedStartingEnergy` were
already never reset at a cycle (wipe) boundary, only read/written per-fight —
adding `carriedBossEnergy` alongside them the same way means the
wipe-and-revive case falls out of the existing loop structure for free. Tested
explicitly anyway (don't assume "falls out for free" means "don't need a
test for it" — a future refactor could easily reset it at the cycle boundary
without realizing that breaks this).

**`startingEnergy` sufficed — no new `StepwiseBoss` field needed.** It was
already "used directly as the boss's starting energy total" under
energy-driven (from the original feature work). The one addition was a new
**read side**: `StepwiseRunResult.bossEndingEnergy: number | null` (the boss's
final accumulated energy when the run ended; always `null` under
`"fixed-interval"`, mirroring how `bossChargedMoveResidualSeconds` is always
`null` under `"energy-driven"` — the two fields are mirror images of each
other, one per cadence mode). `teamRaid.ts` reads `run.bossEndingEnergy` into
a new `carriedBossEnergy` local and feeds it into the next fight's
`startingEnergy`. Because `bossEndingEnergy` is always `null` under
`"fixed-interval"`, `carriedBossEnergy ?? 0` resolves to `0` in that mode —
identical to before this change, no branch on cadence needed in the
construction site.

**`bossChargedMoveResidualSeconds`/`bossChargedMoveCadenceClamped` are kept
explicitly, harmlessly inert under `"energy-driven"`** rather than made
meaningful — they're computed from `nextBossChargedMoveAt`, which
`simulate.ts` never populates in that mode, so `chargedMoveWarmupSeconds`/
`chargedMoveNextFireInSeconds` passed into a `StepwiseBoss` under
energy-driven are simply never consulted (gated by the `bossEnergyDriven`
check in `simulateStepwiseBattle`). Left populated in `teamRaid.ts`'s
`bossForSlot` construction purely because doing so is a no-op in that mode and
still load-bearing in `"fixed-interval"` — documented as such, not left for a
reader to wonder about.

## New output field: `TeamRaidSlotResult.bossChargedHitsTaken`

Added (from `StepwiseRunResult.bossChargedHitsTaken`, previously computed
internally and discarded) so the product's headline "higher DPS forces more
boss charged moves" effect is directly observable through `runTeamRaid`'s own
return value, not just inferable from timing side effects — needed to write
the requested "high-DPS roster fires more than low-DPS, at the runTeamRaid
level" test. Same "not clipped to the clear point for the finishing-blow
fight" caveat as the pre-existing `chargedAttacksLanded` field.

## Verification technique for the new tests

`test/energyDrivenCadenceWiring.test.ts` (8 tests). Rather than fabricating
threshold numbers by hand, every fixture's exact numbers (per-hit damage,
banked energy, HP thresholds for "exactly N hits before fainting") were
derived by importing the actual engine functions (`calculateDamage`,
`bossEnergyFromDamageTaken`, `effectiveStatsAtLevel`) in throwaway `tsx`
scratch scripts (`packages/engine/scratch_calibrate*.ts`, all deleted before
finishing — see `verification_without_browser_tool.md`-style discipline). This
let the slot-handoff and wipe-and-revive tests be **fully deterministic on a
pinned seed** (not just statistical): the fixture is tuned so one fight's own
banked energy (14) is provably below the boss's `energyCost` (20), so a
single fight can NEVER reach eligibility alone, while two fights' carried
energy (28) crosses it — meaning "did the boss ever fire" is a hard,
seed-independent proof of whether energy carried, not a coin-flip-dependent
inference. The actual 50%-roll *outcome* (fire vs. not, once eligible) is
still probabilistic and only pinned for the specific tested seed, exactly like
this project's existing low-level cadence tests already do.

## Re-measured real-species impact (confirms no drop/double-apply in the wiring)

L40 15/15/15 vs Regirock 5-Star, 300 iterations, `maxSeconds: 60`,
`bossChargedMoveMeanIntervalSeconds: 15` (the app's actual
`DEFAULT_ASSUMPTIONS.bossChargedMoveFrequencySeconds`, found by reading
`ComparatorView.tsx` rather than guessing — an arbitrary interval like 3s
produces a wildly different, even sign-flipped, comparison for tanky species,
since the "OFF" baseline itself is only meaningful at a realistic mean
interval):

| attacker | OFF | ON | delta |
| :--- | ---: | ---: | ---: |
| Kartana | 24.75s | 16.44s | -33.6% |
| Gengar | 14.00s | 9.19s | -34.4% |
| Metagross | 33.06s | 24.56s | -25.7% |
| Blissey | 37.72s | 32.01s | -15.1% |

Matches the plan's expected table (-34/-34/-25/-15%) almost exactly through
`runSustainedComparison` (the actual wired path), corroborating the
lower-level measurement in [[feature_boss_energy_driven_cadence]] — the
plumbing neither drops nor double-applies anything.

## Pushback / judgment calls

None pushed back on — the task's scope (three Input types + TeamRaid
carryover, engine-only, no Scenario/UI work) was explicit and I followed it
literally. The Scenario round-trip gap noted above is a flag, not something I
overrode; CLAUDE.md says adding a Scenario field is this agent's call, so if
a future session is asked to close that gap, do it there rather than treating
the web-side local-extension pattern as a permanent fixture.
