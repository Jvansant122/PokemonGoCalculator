---
name: fixture-deletion-hypothetical-duo
description: Deleted the 4 original hypothetical fixtures (MEGA_RAICHU_X/Y, PRIMAL_KYOGRE, MEGA_SKARMORY) from src/fixtures/scenarioA.ts; replaced with test-only fixtures in test/fixtures/hypotheticalDuo.ts
metadata:
  type: project
---

On 2026-09-06, the user explicitly authorized (overriding CLAUDE.md's normal
"don't casually change the hypothetical fixtures" rule) fully deleting
`packages/engine/src/fixtures/scenarioA.ts` — the file holding
`MEGA_RAICHU_X`/`MEGA_RAICHU_Y`/`PRIMAL_KYOGRE`/`MEGA_SKARMORY` plus their
movesets (`STATIC_SHOCK`/`WILD_CHARGE`/`WATERFALL`/`HYDRO_PUMP`/`SKY_ATTACK`/
`BRAVE_BIRD`/etc.) and `SCENARIO_A_LEVEL`/`SCENARIO_A_PERFECT_IVS`.

**Why this was worth doing at all**: these 4 fixtures were exported from
`src/index.ts` (`export * from "./fixtures/scenarioA.js"`), which meant
`packages/web`'s `registry.ts` could — and did — import them straight from
`@pogo-analyzer/engine` and register them as real, permanently-selectable
species in the live UI picker (`buildRegistry()`'s
`for (const hypothetical of [MEGA_RAICHU_X, ...]) registry.registerHypothetical(...)`).
Test-only pinned-acceptance fixtures should never be reachable from product
code — that was the actual bug being fixed, not the fixtures' numbers.

**What replaced them**: `packages/engine/test/fixtures/hypotheticalDuo.ts` —
same role (two candidate attackers + two hypothetical bosses backing
Scenario A/B acceptance tests), but:
- Lives under `test/`, NOT `src/fixtures/`, and is NOT re-exported from
  `src/index.ts` — structurally impossible for `packages/web` to import it
  again by accident. This is the actual fix; don't undo it by moving it back
  under `src/` for convenience later.
- Entirely fresh hand-picked numbers (CANDIDATE_ALPHA baseAttack 280,
  CANDIDATE_BETA 310, both baseDefense 60/baseStamina 182; BOSS_TIDE
  (water) baseAttack 230/baseDefense 180; BOSS_GALE (steel/flying)
  baseAttack 230/baseDefense 230) — NOT a re-derivation of the old
  Raichu/Kyogre/Skarmory numbers. New pinned values: both candidates 150 HP,
  fast-move damage constant 5(Alpha)/6(Beta) across attack IV 13-15 vs
  BOSS_TIDE, both faint at exactly 7.5s landing exactly 1 charged attack
  (171/189 damage, delta 10.53%) in the fast-move-only opening burst.
  Scenario B (vs BOSS_GALE, dodgeFastAttacks): Alpha survives 110s (536
  charged dmg), Beta 83.6s (592 charged dmg) — crossover partySize=6.
- Every one of these numbers was verified by actually running this engine's
  own code (a throwaway vitest file, not hand arithmetic alone) before being
  pinned — see the derivation trail in hypotheticalDuo.ts's doc comments if
  these ever need re-deriving after a genuine formula change.

**Decision: hand-authored, not real synced species.** Considered pinning
against a real species pair (`data/normalized/species.json` has real
`kyogre-primal-attacker`, `raichu`, `skarmory` etc. with
`bossRaidTier`/`statsArePrecomputed` support now in place). Rejected because
an exact pinned percentage/damage/timing number is much easier to keep
stable and to re-derive by hand when hand-authored — a real species' stats
are outside this project's control and (while historically stable) could in
principle shift under a future `data-sync` resync for reasons entirely
unrelated to an actual engine bug, silently invalidating a precise pin years
later. See [[real-vs-hypothetical-fixture-tradeoff]] if this decision is
revisited.

**Test files touched** (all still pass, 126/126): `scenarioA.test.ts`,
`scenarioB.test.ts`, `bossTiming.test.ts`, `simulate.test.ts`,
`comparison.test.ts`, `sustainedComparison.test.ts`, `speciesReport.test.ts`.
`raidBossTier.test.ts`'s two "precomputed boss short-circuits tier" tests
were decoupled entirely from the shared duo — they now use fresh
inline-local `PRECOMPUTED_STYLE_BOSS`/`ANOTHER_PRECOMPUTED_STYLE_BOSS`
fixtures (same convention as that file's existing `REAL_STYLE_BOSS`), so that
file no longer imports `test/fixtures/hypotheticalDuo.ts` at all.
`teamRaid.test.ts` never referenced the old fixtures — untouched.

**packages/web breakage (flagged for web-developer, not fixed by this
pass — out of scope)**: `packages/web/src/registry.ts` fails
`tsc --noEmit` with `TS2305: Module '"@pogo-analyzer/engine"' has no
exported member 'MEGA_RAICHU_X'/'MEGA_RAICHU_Y'/'MEGA_SKARMORY'/'PRIMAL_KYOGRE'`
(lines 2-5's import, and line 44's `buildRegistry()` loop that registers
them). `packages/web/src/ComparatorView.tsx` has only a stale prose comment
(line ~22, "those live in packages/engine/src/fixtures/scenarioA.ts") — not
a compile error, just inaccurate now. web-developer needs to decide what (if
anything) replaces the 4 always-selectable hypothetical species in the live
picker — that's a product/UI decision, not mine to make here.
