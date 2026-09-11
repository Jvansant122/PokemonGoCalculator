---
name: feature_gated_evolution_schema_2026_09_10
description: schema decision for evolution branches gated on non-candy requirements (item/lure/buddy-distance/gender/time-of-day/quest) — two disjoint arrays, never one richer EvolutionOption, resolved by registry.ts not data-sync
metadata:
  type: project
---

Follow-up to [feature_evolve_then_powerup_hypothetical_catch_onprogress](feature_evolve_then_powerup_hypothetical_catch_onprogress.md).
data-sync measured the real distribution after I shipped `EvolutionOption`/`evolutionEndpoints`:
550/1338 species carry >=1 branch (577 total), but only 467 (~81%) are pure-candy — the other 110
(~19%) are gated on an item (56), a lure, buddy distance, gender, time-of-day, or a quest. Silently
resolving a gated branch into `EvolutionOption` would misprice it as "evolve for N candy."

## Decision: two disjoint arrays, not one richer type

- `EvolutionOption`/`SpeciesDefinition.evolutions` stays EXACTLY as originally shipped — `{ to:
  SpeciesDefinition; candyCost: number }`, unconditionally committable, never gains gate fields.
- New `GatedEvolutionOption`/`SpeciesDefinition.gatedEvolutions?: GatedEvolutionOption[]` —
  `{ to, candyCost?, requiresItem?, requiresItemCount?, requiresLureItem?, requiresBuddy?,
  requiresBuddyDistanceKm?, requiresGender?, requiresDaytime?, requiresNighttime?,
  requiresDuskPeriod?, requiresFullMoon?, requiresUpsideDown?, requiresQuest? }`. `candyCost` is
  OPTIONAL here (unlike EvolutionOption's required one) because 3 real branches — Zygarde's own
  form changes, Gimmighoul -> Gholdengo — are gated on an item COUNT with no candy component at
  all.
- **Deliberately excluded**: `noCandyCostViaTrade` (waives candy for a traded
  Kadabra/Machoke/Graveler/Haunter — these are ALREADY plain `EvolutionOption`s since it can only
  make a branch cheaper, never gate it). This project has no "was this individual traded" input
  anywhere, so I didn't add a field a caller could build UI for that the engine can't actually
  apply. Explicit future work if that input is ever added — flagged, not silently dropped.

## Resolution contract (data-sync -> registry.ts -> engine)

data-sync's own `EvolutionCandyCostEntry` (id-keyed, on `data/normalized/species.json`'s
`evolutionCandyCosts`, never resolved to object references) is the INPUT. `packages/web/src/
registry.ts` does the id->object resolution — same established pattern as
`resolveMegaBaseCandyFamilyId`/`resolveMegaBaseKmBuddyDistance` (the coordinator's own pointer):
split on `candyCostOnly` — `true` rows resolve into `.evolutions`, `false` rows (including the
no-candy-cost ones) resolve into `.gatedEvolutions`. I do NOT touch registry.ts (web-owned) — this
is the contract I handed back to the coordinator to route.

## Never silently drop a gated branch (the actual ask)

`rosterPlanner.ts` gained `gatedEvolutionNotices(species): GatedEvolutionNotice[]`
(`{ toSpeciesId, toSpeciesName, requirementSummary }`, human-readable summary built by a private
`describeEvolutionRequirement`), wired into BOTH entry points at every place an unevolved entry is
already reported:
- `RosterNeverCompetitiveEntry.gatedEvolutions` — populated whenever a row is evolution-blocked,
  REGARDLESS of whether it also has a priceable candy-only path (i.e. even the "endpoints found but
  none touched a boss" case names its gated siblings too, not just the "zero endpoints at all"
  case).
- `RosterPowerUpCandidate.viaEvolution.otherGatedOptions` — attached to EVERY priced "evolve, then
  power up" candidate row, so Eevee's Vaporeon candidate still names Espeon/Umbreon/etc. even
  though they can't be priced.
- Same two fields on `planRosterBudget`'s `excludedEntries` (that planner's `evolutionRecommendation`
  pass is unaffected — still walks `evolutionEndpoints`, which is unchanged and guaranteed
  candy-only by construction now).

Zero changes needed to `evolutionEndpoints` itself — it was already correctly scoped to
`.evolutions` only, so it silently became "the candy-only walker" for free once the gated data
moved to a separate field. That's the value of having split `EvolutionOption` cleanly in the first
draft rather than building one permissive type.

## Files / tests

`packages/engine/src/types.ts` (GatedEvolutionOption, SpeciesDefinition.gatedEvolutions),
`packages/engine/src/rosterPlanner.ts` (gatedEvolutionNotices + wiring in both functions), 6 new
tests + 2 new fixtures (GATED_ONLY_SPECIES, MIXED_EVOLUTIONS_SPECIES) in
`rosterPlannerEvolutionAndCatches.test.ts`/`rosterPlannerFixtures.ts`. Suite 565 -> 571, both
typecheck configs clean, lint clean.
