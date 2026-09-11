---
name: fix_eternatus_powerup_cost_override_2026_09_10
description: PowerUpCostTable.perSpeciesOverridesByPokemonId + powerUpCostTableFor — fixes Eternatus candy cost understated ~30-59x; schema keyed by raw pokemonId not species id, resolved at lookup time; ~14 call sites fixed across powerUp.ts/rosterPlanner.ts
metadata:
  type: project
---

Real correctness bug, flagged by the coordinator 2026-09-10 (data-sync had already landed
`perSpeciesUpgradeOverrides` in `data/normalized/powerUpCosts.json`, extracted by GAME_MASTER
template-ID PATTERN — `POKEMON_UPGRADE_OVERRIDE_SETTINGS_V####_POKEMON_<NAME>` — not a hardcoded
species list). `powerUpCostTableFromGameMaster` never consumed it, so Eternatus's real candy cost
was understated ~30x at level 1 growing to ~59.3x by level 39->40 (890 real vs 15 universal), and
XL candy (previously undocumented entirely) ~10x-44.5x. Stardust is genuinely unaffected
(byte-identical to universal) — only the two candy arrays differ for the one real override that
exists today.

## Schema decision: keyed by raw pokemonId, resolved at LOOKUP time, not build time

`PowerUpCostTable.perSpeciesOverridesByPokemonId?: Record<string, PowerUpCostTable>` — each value
is a COMPLETE, independently-valid `PowerUpCostTable` (built by recursively calling
`powerUpCostTableFromGameMaster` on the override's own record). Keyed by the RAW GAME_MASTER
`pokemonId` string ("ETERNATUS"), **not** this engine's own `SpeciesDefinition.id` ("eternatus") —
deliberately, because resolving pokemonId -> species id needs the FULL synced species list, which
isn't available at the point `powerUpCostTableFromGameMaster` runs (`scripts/sync-data.ts` builds
`data/normalized/powerUpCosts.json` and `species.json` as separate, unordered outputs, and this
package has no I/O to load one to check the other). Resolving in the OTHER direction — a new
`powerUpCostTableFor(table, species)` reverses this project's own pokemonId->display-name
title-casing (the same technique `scripts/sync-data/gameMasterMatching.ts` already uses) to
rebuild a pokemonId key from `species.name` fresh at LOOKUP time, needing only the ONE species
being priced. Falls back to the unmodified table on no match — never throws, never guesses further
(acceptable: no per-species override has ever targeted a punctuated name like "Mr. Mime").

`GameMasterPerSpeciesUpgradeOverride` (the raw override record engine takes as an optional 3rd
`powerUpCostTableFromGameMaster` param) makes every field but `pokemonId` OPTIONAL
(`Partial<GameMasterPokemonUpgradeSettings> & {pokemonId}`), MERGED onto the universal record
before interpretation — deliberately mirroring data-sync's own defensively-typed raw extraction
(`GameMasterUpgradeOverrideRecord`, all fields optional except `pokemonId`/`sourceTemplateId`).
Eternatus's real record happens to set every field, but nothing guarantees a future override does
— "design for N, not for one" per the task.

## Real gap found: scripts/sync-data.ts doesn't pass the 3rd argument yet

`scripts/sync-data.ts`'s own call site (`powerUpCostTableFromGameMaster(gameMasterFetchResult.upgradeSettings, gameMasterFetchResult.luckyStardustDiscountPercent)`)
still only passes 2 args — `gameMasterFetchResult.perSpeciesUpgradeOverrides` is already extracted
and available there (confirmed via read-only grep) but never threaded through. **This is data-sync's
file, off-limits to me** — I could not close this loop myself. Reported back to the coordinator to
route: the fix is a one-line change adding `gameMasterFetchResult.perSpeciesUpgradeOverrides` as
the third argument at that call site.

## The invasive part: ~14 call sites across powerUp.ts + rosterPlanner.ts

`powerUpCost`/`powerUpStepCost` don't take `species` at all (pure level+modifiers functions) — kept
their signatures UNCHANGED (no packages/web caller touches them directly, confirmed via grep, but
still didn't want a public-API break) and instead fixed every CALL SITE to pre-resolve
`powerUpCostTableFor(costTable, species)` once per scope before pricing. `powerUpLevelsAbove` also
left unchanged (only reads `.maxLevel`, not cost VALUES). Functions that ALREADY had both `species`
and `table` in their own params (`powerUpDamageLadder`, `usefulPowerUpLevelsAbove`, rosterPlanner's
private `priceCandidate`) got the resolution done INTERNALLY instead — covers every external call
site of those three for free (a good chunk of the ~17 total sites). Remaining ~9 fixed at the call
site: `optimizePowerUps` (1), `planPowerUpBudget` (2, main round loop + best-blocked pass),
rosterPlanner's `generateDraftsForEntry`/`planRosterBudget`'s evolutionRecommendation pass/round
loop/best-blocked pass (4).

**Gotcha**: several of these live inside a `.map`/`for` where `slot.species`/`usefulLevels` could
theoretically be empty — resolved with a null-safe fallback (`slot.species ? powerUpCostTableFor(...) : costTable`)
or relied on an already-proven non-null invariant (`usefulLevels.length===0` already returns early
in the SAME function that derives it from a species-gated call, so a non-empty list guarantees
`slot.species` — documented with `!` and a comment rather than silently trusting it).

## Verification

New `packages/engine/test/powerUpCostOverride.test.ts` (10 tests) using the REAL Eternatus raw
record (hardcoded from `data/normalized/powerUpCosts.json`'s actual `perSpeciesUpgradeOverrides[0]`,
verified live via a `node -e` read, not hand-typed from the coordinator's numbers) — confirms the
level-39->39.5 real fix (890 candy, not universal's 15), stardust unaffected (10000, verified
against the raw array index not hand-guessed — first draft of this test had a wrong hand-picked
stardust number and failed, caught by actually running it), the partial-override merge fallback,
multiple overrides resolving independently, and an unrelated species' `powerUpDamageLadder` output
being byte-identical whether or not Eternatus's override is present in the same table (no
cross-species leakage). Suite 571 -> 581, both typecheck configs clean, lint clean.

## Files

`packages/engine/src/powerUp.ts` (schema + `powerUpCostTableFor` + internal fixes + 2 call-site
fixes), `packages/engine/src/rosterPlanner.ts` (5 call-site fixes, all species already in scope),
`packages/engine/test/powerUpCostOverride.test.ts` (new), `packages/engine/test/fixtures/powerUpCosts.ts`
(`RAW_ETERNATUS_UPGRADE_OVERRIDE`, `RAW_PARTIAL_UPGRADE_OVERRIDE`).
