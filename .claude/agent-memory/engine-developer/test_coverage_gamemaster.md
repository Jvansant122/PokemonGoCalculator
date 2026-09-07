---
name: test-coverage-gamemaster
description: gamemaster.ts (fromGameMaster/fromGameMasterMove/speciesIdFor/SpeciesRegistry) now has direct regression coverage in test/gamemaster.test.ts
metadata:
  type: project
---

Added `packages/engine/test/gamemaster.test.ts` (2026-09-07), the single on-ramp from raw
GAME_MASTER/pogoapi-shaped records into `SpeciesDefinition`/moves that `scripts/sync-data.ts`
calls to build all 1092 `data/normalized/species.json` entries. Previously had zero direct test
coverage despite being load-bearing — only a passing comment in `raidBossTier.test.ts`.

**Why:** requested explicitly as a regression-guard task, not a bug hunt. Confirmed empirically
healthy output beforehand (all 1092 species positive stats, non-empty types/movesets, no dupe
ids, no bad durations).

**What's pinned:**
- `speciesIdFor`: drops `"Normal"` form from id; a non-Normal form is lowercased and
  hyphen-prefixed onto the base name **verbatim, including any spaces in the form string itself**
  (e.g. `form: "Mega X"` → id `"raichu-mega x"`, literal space preserved — NOT converted to a
  second hyphen). This isn't a bug: real synced data never actually passes a form with a space
  (`sync-data.ts`'s mega/primal gap-fill only ever sets `form` to a bare suffix like `"X"`/`"Primal"`,
  confirmed real ids are `"raichu-mega-x"`/`"kyogre-primal"`, no spaces) — but a hand-authored
  caller passing a multi-word form would get a space in the id. Documented, not fixed, per this
  task's explicit test-only scope.
- `fromGameMaster`: base stats pass through completely unchanged (no floor/round) — deliberately
  tested with non-integer input (270.5) to prove it, since a second floor anywhere downstream of
  `stats.ts`'s single `FLOOR()` is this project's documented failure mode (see
  [fact_raid_boss_tier_math](fact_raid_boss_tier_math.md) and CLAUDE.md's "single most important
  invariant"). `types`/`fastMoves`/`chargedMoves` land by reference (verbatim), name gets `" (Form)"`
  suffix only for non-Normal form.
- `fromGameMasterMove`: sign convention — positive `energy_delta` → `energyGain` with
  `energyCost: 0`; negative → positive `energyCost` with `energyGain: 0`. `duration_ms` divides by
  1000 into `durationSeconds`, defaults to 0 when absent. `toPokemonType` strips a
  `POKEMON_TYPE_` prefix case-insensitively; a bare `"Fire"` also normalizes to `"fire"` (no prefix
  to strip, just lowercased).
- **`vulnerableWindowSeconds` == `durationSeconds` exactly** is a documented approximation, pinned
  with a comment explaining why (no source syncs frame-level damage-window timing) — do not treat
  a future change to this as a silent regression, but also don't casually "fix" it without a real
  data source backing a narrower window. Separately noted (not actioned, not this agent's task):
  no production code currently reads `vulnerableWindowSeconds` at all.
- `SpeciesRegistry`: `register`/`get`/`has`/`all` round-trip; `get` on unknown id throws;
  `registerHypothetical` sets `isHypothetical: true`, plain `register` leaves it `undefined`.

No bugs found in `gamemaster.ts` itself — suite went from 150 to 174 passing tests (24 new), all
green, zero `src/` changes.
