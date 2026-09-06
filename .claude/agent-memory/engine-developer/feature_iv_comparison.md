---
name: feature-iv-comparison
description: ivComparison.ts's compareIvSpreads — two-specific-IV-spread comparator backing the "IV Breakpoints" web tab
metadata:
  type: project
---

Added `packages/engine/src/ivComparison.ts`, exporting `compareIvSpreads`. This is the
IV/level-investment analogue of `breakpoints.ts`'s existing functions: `findFastMoveBreakpoints`
sweeps a whole IV *range* against one level; this compares two *specific* arbitrary `IVSpread`s
of the same species/moveset across a level range instead, answering "is it worth powering up
spread A over spread B, and starting at what level."

**Signature** (as shipped, 2026-09-06):
```ts
function compareIvSpreads(params: {
  species: SpeciesDefinition;
  fastMove: FastMove;
  chargedMove: ChargedMove;
  ivA: IVSpread;
  ivB: IVSpread;
  levels?: number[];               // defaults to all CPM_TABLE levels, ascending
  bossDefenseStat: number;
  fastMoveDamageModifiers: Omit<DamageInputs, "power"|"attackerAttackStat"|"defenderDefenseStat">;
  chargedMoveDamageModifiers: Omit<DamageInputs, "power"|"attackerAttackStat"|"defenderDefenseStat">;
  bossAttackStat: number;
  bossFastMovePower: number;
  bossFastMoveDurationSeconds: number;
  incomingDamageModifiers: Omit<DamageInputs, "power"|"attackerAttackStat"|"defenderDefenseStat">;
  dodge: DodgeBehavior;
  maxSeconds?: number;
}): IvComparisonResult

interface IvComparisonResult {
  rows: IvComparisonRow[];  // one per level, sorted ascending
  firstDivergenceLevel: { fastMoveDamage: number|null; chargedMoveDamage: number|null; timeToFaint: number|null };
}
interface IvComparisonRow {
  level: number;
  ivA: IvSpreadStatsAtLevel;  // { attackStat, defenseStat, hp, fastMoveDamage, chargedMoveDamage, timeToFaintSeconds }
  ivB: IvSpreadStatsAtLevel;
  fastMoveDamageDiffers: boolean;
  chargedMoveDamageDiffers: boolean;
  timeToFaintDiffers: boolean;
}
```

Reuses `effectiveStatsAtLevel` (handles shadow stat adjustment automatically), `calculateDamage`,
and `timeToFaint` verbatim — no duplicated math. Fast and charged moves get separate damage
modifier objects (same reasoning as `comparison.ts`'s `fastDamageOut`/`chargedDamageOut` split —
don't ever collapse these into one shared modifier keyed off one move's type).

**Empirically confirmed while writing tests (all via a throwaway tsx scratch script, not hand
arithmetic — see `verification_without_browser_tool.md`-style discipline)**: divergence between
two IV spreads is NOT monotonic across level. A fast-move-damage or time-to-faint gap that opens
at one level can close again at a higher level purely from floor-rounding coincidence (confirmed
concretely: attack IV 0 vs 15 on a 100-base-attack species diverges in fast-move damage at level
30 but is back to identical at level 40; a defense-IV 0-vs-15 pair similarly diverges in
time-to-faint at level 10 but reconverges at level 35). `firstDivergenceLevel` reports only the
*first* level of divergence — the UI must not assume "diverges at level X" implies "stays
diverged for all levels >= X"; show the full `rows` table, not just the headline number, if that
distinction matters to the user.

Test-only helper module, not a fixture: tests live in `packages/engine/test/ivComparison.test.ts`
using ad hoc `makeSpecies()` literals (not `hypotheticalDuo.ts` — this feature didn't need
pinned-boss-style fixtures, just plain species/move objects).

**Not implemented (explicitly out of scope per the request)**: no `Scenario`-family type, no web
wiring — this was an engine-only task. If/when the "IV Breakpoints" tab is built, `web-developer`
will need its own shareable scenario type (likely sibling to `TeamScenario`, not an extension of
the two-candidate `Scenario`) — flag to `engine-developer` if a new `Scenario`-family field is
needed rather than letting `web-developer` invent one, per the "every user-facing assumption
round-trips through Scenario" standing decision.
