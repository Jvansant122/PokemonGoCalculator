---
name: feature-last-known-raid-tier
description: SpeciesDefinition.lastKnownRaidTier field + RaidTier's move from raidBoss.ts to types.ts to avoid a circular import
metadata:
  type: project
---

Added 2026-09-07, requested directly by the user.

## What changed
- `types.ts`: `RaidTier` union type now DEFINED here (moved verbatim from `raidBoss.ts`), plus a
  new `SpeciesDefinition.lastKnownRaidTier?: RaidTier` field — the most-recently-confirmed REAL
  raid tier a species has actually been observed at, distinct from `packages/web/src/registry.ts`'s
  `raidTierForSpeciesId()` (which answers "is this a CURRENTLY active raid target," untouched).
  No data-sync producer populates this yet (undefined for every real synced species today) — it's
  a slot for a future data source or hand-authored override.
- `raidBoss.ts`: no longer *defines* `RaidTier`, just `import type { RaidTier } from "./types.js"`
  then `export type { RaidTier };` — a plain re-export so every existing
  `from "./raidBoss.js"`/`"../src/raidBoss.js"` import site (comparison.ts, speciesReport.ts,
  teamRaid.ts, raidBossTier.test.ts) needed ZERO changes.
- `defaultRaidTierForSpecies(species)`: added a new priority-0 check —
  `if (species.lastKnownRaidTier) return species.lastKnownRaidTier;` — before the existing
  boost/rarity heuristic. Signature unchanged (`(species: SpeciesDefinition): RaidTier`).

## Circular-import resolution (why RaidTier moved, not the other way around)
`raidBoss.ts` imports `SpeciesDefinition` from `types.ts`. `SpeciesDefinition` needed to reference
`RaidTier` (for the new field), but `RaidTier` was defined in `raidBoss.ts` — importing it back
into `types.ts` would be a cycle. Moved the *type definition* to `types.ts` (the lower-level
module) and had `raidBoss.ts` import-then-re-export it, rather than the reverse (e.g. keeping
`RaidTier` in `raidBoss.ts` and using a bare string with `isKnownRaidTier` validation in
`types.ts`, which the task allowed as an alternative) — this keeps the field properly typed as
`RaidTier` rather than `string`, and every consumer's existing import path is unaffected.

**Verified `export * from "./types.js"` + `export * from "./raidBoss.js"` in `index.ts` do NOT
collide** even though both now transitively export the same `RaidTier` binding — TypeScript
doesn't flag "ambiguous export" for a re-export that traces back to the exact same original
declaration (confirmed empirically with a throwaway 3-file scratch tsc repro before committing to
this approach, not assumed). Only true ambiguity (two *different* declarations sharing a name)
would error.

## Test-fixture/pin sanity confirmed
Added 3 new cases to `raidBossTier.test.ts`'s existing `defaultRaidTierForSpecies` describe block:
a STANDARD-rarity mega with `lastKnownRaidTier: "Super Mega Raids"` resolves to Super Mega Raids
(not the heuristic's "Mega Raids"), a STANDARD species with `lastKnownRaidTier: "5-Star Raids"`
resolves there (not the heuristic's "3-Star Raids"), and two species without the field set still
resolve via the unchanged heuristic. Full suite: 150/150 passing (146 pre-existing + 4 new — the
task asked for 2 minimum, wrote 3 plus a no-field-set companion). Both packages' `tsc --noEmit`
clean. See [[feature_rarity_keyed_raid_tier_default]] for the heuristic this now sits on top of,
and [[feedback_boss_tier_not_in_scenario]] for why this still isn't a `Scenario` field (a
per-species historical fact, not a per-comparison user setting).
