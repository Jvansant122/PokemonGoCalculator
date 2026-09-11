---
name: feature_swap_cost_bossmaxhp_friendship_bestbuddy_2026_09_10
description: Four IDEAS.md/MECHANICS.md gap closures in one pass — swap-cost default 0->1.0, TeamRaidInputs.bossMaxHpOverride, friendship attack bonus wiring, Best Buddy CP boost + CPM table extension to 53
metadata:
  type: project
---

2026-09-10 task closed four recorded engine-side gaps in one pass. All four shipped; `npm run
verify` green (engine 534/534, web 289/289, scripts 227/227).

## 1. Swap cost default 0 -> `DEFAULT_SWAP_COST_SECONDS = 1.0` (teamRaid.ts)

Sourced from `BATTLE_SETTINGS.swapDurationMs = 1000` plus the user's own raid-recording evidence
that it applies to a faint-triggered auto-swap (MECHANICS.md's "Swapping Pokémon costs a real,
first-party 1.0s"). Exported the constant with the full sourcing in its doc comment rather than an
inline literal. Rippled into `rosterPlanner.ts`'s and `lineupBuilder.ts`'s own Stage-1 screen-score
`?? 0` fallbacks too (their score formula's denominator has to agree with what Stage-4's actual
`runTeamRaid` call resolves, or the screen ranks candidates by a different cost model than the one
that actually simulates them) — changed both to `?? DEFAULT_SWAP_COST_SECONDS`.

**Test fallout, and the judgment call behind it**: 3 existing tests broke (`teamRaid.test.ts`,
`rosterPlanner.test.ts`, `powerUp.test.ts`). Two of the three (`rosterPlanner.test.ts`'s
multi-level-jump acceptance test, `powerUp.test.ts`'s noise-floor sign test) were NOT actually
about the swap-cost mechanic — they pin exact noise-floor/threshold numbers empirically derived
under the old default-0 assumption, unrelated to what they're testing. Fix: pinned
`swapCostSeconds: 0` explicitly in those two files' shared `baseInputs()` helpers rather than
re-deriving new pinned numbers under the new default — isolates unrelated tests from a mechanic
they don't test, same discipline as pinning any other incidental parameter. Only the ONE
`teamRaid.test.ts` test that's actually about slot-handoff timing got its assertion updated (and a
new dedicated regression test added for the new default itself).

**`TeamScenario.swapCostSeconds`** (the web-facing serialization type in `teamScenario.ts`) is a
REQUIRED field with no default of its own — only updated its doc comment to say a real value now
exists and that `packages/web` should seed a *new* scenario at 1.0 not 0.5; did not touch
`packages/web` itself (out of scope, flagged for `web-developer`).

## 2. `TeamRaidInputs.bossMaxHpOverride` (mirrors `SustainedComparisonInputs.bossMaxHpOverride`)

Straightforward mirror: new optional field, wired into `runTeamRaid`'s `bossEffectiveHp(boss,
bossRaidTier, inputs.bossMaxHpOverride)` call. Then wired into every already-flagged call site:
`rosterPlanner.ts`'s Stage-4 `runFullRosterCached` (shared by both `runRosterPlanner` and
`planRosterBudget`), `lineupBuilder.ts` (both its Stage-1 screen AND its Stage-2 `runTeamRaid`
evaluation).

**Real gap found beyond what was flagged**: `powerUp.ts` (both `optimizePowerUps` and
`planPowerUpBudget`) and `tmMove.ts`'s `evaluateMoveChangeTargets` all extend `TeamRaidInputs`
(directly or via `Omit`) and spread `...rest` straight into `runTeamRaid`, so
`bossMaxHpOverride` flows through to the SIMULATION automatically the instant the field exists on
`TeamRaidInputs` — but each of those 3 call sites ALSO independently calls
`bossEffectiveHp(rest.boss, rest.bossRaidTier)` (no third arg) for its OWN `bossHp` used in
`summarizeResults`' non-cleared-fallback denominator. That call silently ignored the override,
producing the exact same "simulation honors it, the caller's own bookkeeping doesn't" bug this
whole item was about — just one layer removed, surfaced only because adding the field to the
shared base type widened its reach. Fixed all 3 (2 in powerUp.ts, 1 in tmMove.ts) by threading
`rest.bossMaxHpOverride` through. **Lesson: when adding an optional field to a widely-`extends`'d
base input type, grep every module for a SECOND, independent read of the same underlying
primitive (`bossEffectiveHp` here) — the base-type field flows automatically via `...rest`
spreads, but any local recomputation of the same derived value does not, and won't typecheck-fail
to warn you.**

Added 2 new regression tests to `teamRaid.test.ts` (honors override for clear-timer detection;
throws on non-finite/non-positive, matching `bossEffectiveHp` itself).

## 3. Friendship attack bonus — wired as a real input, wrong comment fixed

`damage.ts`'s `FRIENDSHIP_BEST_BUDDY_MULTIPLIER` comment had the raid/PvP scope EXACTLY BACKWARDS
(said "trainer battles only; raids/gyms do not apply this" — the real scope is the reverse). Fixed
the comment, but went further: **deleted** the single-value constant and its boolean `bestBuddy`
field entirely rather than just correcting the comment, because MECHANICS.md explicitly flags that
field name as colliding with the UNRELATED Best Buddy CP Boost mechanic (item 4 below) — keeping a
`bestBuddy: boolean` in `DamageInputs` while ALSO adding a real Best Buddy CP boost elsewhere would
have shipped the exact naming collision the doc warns about. Replaced with the real 5-tier
GAME_MASTER ladder (`FRIENDSHIP_ATTACK_BONUS_MULTIPLIER` = none/good/great/ultra/best/forever,
1.00-1.12) and a `friendshipLevel?: FriendshipLevel` field.

**Scope of wiring**: single-sided (candidate/slot's own `fastDamageOut`/`chargedDamageOut` only,
NEVER the boss's `damageOut`) and single-trainer-scoped (a raid boss has no "friend"). Wired into
`comparison.ts` (`ComparisonInputs`/`SustainedComparisonInputs`, both `runComparison` and
`runSustainedComparison`) and `teamRaid.ts` (`TeamRaidInputs`, applies identically to whichever
slot is currently fielded). **Deliberately NOT wired into**: `rosterPlanner.ts`, `lineupBuilder.ts`
(their own hand-declared input types, not `extends TeamRaidInputs`, so no free ride),
`speciesReport.ts`, `ivComparison.ts`, `breakpoints.ts`, `powerUp.ts`'s Stage-1 screen inputs.
Flagged as a real gap in the final report, same bounded-scope precedent as weather's original
rollout (MECHANICS.md's weather section shows that took multiple dated passes too).

No `Scenario`/`TeamScenario` field added — deliberately left for `web-developer`, same split as
every other engine-input-first feature in this project.

Structural note worth remembering: `StepwiseAttacker.fastDamageOut`/`chargedDamageOut` and
`combat.ts`'s `AttackerProfile` equivalents are typed as `Omit<DamageInputs, "power" |
"attackerAttackStat" | "defenderDefenseStat">` — so adding a field to `DamageInputs` makes it
structurally available on every attacker/boss damage-out object for FREE, no `simulate.ts`/
`combat.ts` changes needed. Only the ORCHESTRATION layer (comparison.ts, teamRaid.ts) needed real
wiring — worth checking this pattern before assuming a new `DamageInputs` field needs touching the
simulator itself.

## 4. Best Buddy CP Boost (+1 effective level) — stacks with Super Max, extended CPM_TABLE to 53

Modeled exactly like `SUPER_MAX_EFFECTIVE_LEVEL_BONUS`/`effectiveLevelForMegaLevel` in
`megaLevel.ts`: `BEST_BUDDY_EFFECTIVE_LEVEL_BONUS = 1`, `effectiveLevelForBestBuddy(level,
isBestBuddy)`. Key difference from Super Max: **deliberately NO gate at all** — no `.boost` check,
no species argument even — Best Buddy applies to any Pokémon regardless of mega status. Callers
compose the two: `effectiveLevelForMegaLevel(effectiveLevelForBestBuddy(level, isBestBuddy),
megaLevel)`.

**Stacking confidence, stated explicitly and weaker than it looks**: the ONLY source for "the two
stack" is the same single GitHub gist comment already cited for Super Max's own +2 magnitude
("brings them up to level 52, level 53 with best buddy bonus") — same source, so NOT independent
corroboration of the stacking claim specifically, even though the +2 magnitude itself has a second
independent source. Documented as `[community-consensus, single-source]`, explicitly weaker than
the magnitude claim it rides alongside.

**Real consequence this surfaced**: stacking Super Max (+2) with Best Buddy (+1) on a level-50
Pokémon needs effective level 53 — `cpm.ts`'s `CPM_TABLE` only went to 52 (deliberately, per its
own prior comment: "no modelled bonus in this engine ever needs to shift a level that far"). That
comment became false the moment stacking was modeled. Extended the table with 2 new real entries
(52.5 computed via the file's own half-level formula, verified with a node one-liner rather than
hand arithmetic; 53 = 0.8553, the real GAME_MASTER whole-level value already RECORDED IN
MECHANICS.md from an earlier research pass — no fresh fetch needed, MECHANICS.md's own "CPM, and
the levels above 50" section already had it). Updated `cpm.test.ts` and
`megaLevelPowerUpCeiling.test.ts`'s pinned "table tops out at 52" assertions to 53 — genuine, correct
pinned-number moves, not a bug.

Wired into `comparison.ts` (`candidateIsBestBuddy?: [boolean, boolean]`) and `teamRaid.ts`
(`TeamRaidSlotInput.isBestBuddy?: boolean`, per-slot like `megaLevel` since Best Buddy is also a
per-individual-Pokémon property) — same bounded scope as item 3, same modules left un-wired,
flagged the same way.

**Real Pokémon GO constraint NOT enforced**: only one Pokémon can be a trainer's active buddy at a
time. `runTeamRaid` does NOT validate "at most one slot has `isBestBuddy: true`" the way it
validates `isMega` — documented as a known, deliberate gap (a multi-Best-Buddy run isn't wrong
math, just not achievable by any real single trainer) rather than adding validation nobody asked
for.

## Gotcha: floor() can absorb a real +1-level shift for a given power/stat pairing

Wrote the first Best Buddy/Super-Max-stacking wiring tests as `toBeGreaterThan` (damage should
increase). Two of three failed — not because the wiring was wrong, but because at the specific
`power`/`attack`/`defense` values in the test fixture, `floor(0.5 * power * atk/def * ...) + 1`
produced the IDENTICAL integer at effective level 52 vs 53 (the underlying attack stat genuinely
differs, 225 vs 226, but the floored damage doesn't cross a breakpoint). This is exactly the kind
of thing `raidBoss.ts`'s "spurious sub-1% change can cross a breakpoint" caution warns about, just
in the other direction (a real change that DOESN'T cross one). **Fix: replaced `toBeGreaterThan`
with an EQUIVALENCE check instead** — `candidateIsBestBuddy: [true, false]` at level 50 must
produce a result byte-identical (`toEqual`) to an explicit `level: 51` run with no Best Buddy flag,
since both resolve to the same effective level through different paths. Equality against a
hand-derived equivalent level is exact and immune to floor-quantization coincidences; a "did it go
up" check on an arbitrary fixture is not. Reusable pattern for any future effective-level-bonus
wiring test.

## Files touched

`packages/engine/src/`: `teamRaid.ts`, `comparison.ts`, `damage.ts`, `megaLevel.ts`, `cpm.ts`,
`rosterPlanner.ts`, `lineupBuilder.ts`, `powerUp.ts`, `tmMove.ts`, `teamScenario.ts` (comment only).
`packages/engine/test/`: `teamRaid.test.ts`, `rosterPlanner.test.ts`, `powerUp.test.ts`,
`comparison.test.ts`, `sustainedComparison.test.ts`, `megaLevel.test.ts`, `cpm.test.ts`,
`megaLevelPowerUpCeiling.test.ts`, new `damage.test.ts`. `data-sync` confirmed NOT to have
normalized the Eternatus 30x-candy-override template yet (`POKEMON_UPGRADE_OVERRIDE_SETTINGS_
V0890_POKEMON_ETERNATUS` absent from `data/normalized/powerUpCosts.json`) — stopped there per the
task's explicit instruction, routed to `data-sync`.
