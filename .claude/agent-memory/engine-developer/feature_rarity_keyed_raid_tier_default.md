---
name: feature-rarity-keyed-raid-tier-default
description: SpeciesDefinition.rarity field + raidBoss.ts's defaultRaidTierForSpecies, replacing the blanket DEFAULT_REAL_RAID_TIER guess for real species not in the live raid feed
metadata:
  type: project
---

Added 2026-09-06, requested directly by the user after pogo-researcher's research (see
`.claude/agent-memory/pogo-researcher/proposal_default_raid_tier_fallback.md`) and data-sync
populating `rarity` on every species in `data/normalized/species.json` (1081/1081 populated).

## What changed
- `types.ts`: new `PokemonRarity = "STANDARD" | "LEGENDARY" | "MYTHIC" | "ULTRA_BEAST"` type and
  `SpeciesDefinition.rarity?: PokemonRarity` field. Undefined for hand-authored hypothetical/test
  fixtures (never went through `fromGameMaster`).
- `raidBoss.ts`: new `defaultRaidTierForSpecies(species)`, exported, consumed by
  `comparison.ts`'s `bossEffectiveStats`/`bossEffectiveHp` in place of the bare
  `tier ?? DEFAULT_REAL_RAID_TIER`. `DEFAULT_REAL_RAID_TIER` itself is UNCHANGED and still exists
  as the true last-resort (kept exactly per the task's explicit instruction not to delete it).

## The actual mapping (my call, not literally prescribed by the task)
1. `species.boost` set (real, non-hypothetical mega/primal form) → `"Mega Raids"`, checked FIRST,
   before rarity. Reasoning: a real mega/primal's own (base-species) `rarity` would otherwise still
   route it to 3-Star/5-Star, both of which are wrong — a mega/primal never raids at either tier.
   Known limitation: can't further distinguish "Mega Raids" from "Legendary Mega
   Raids"/"Primal Raids"/"Super Mega Raids" (all four share attackDefenseMultiplier 0.79, differing
   only in HP) — no clean signal in `SpeciesDefinition` for that today. Flagged, not solved.
2. Otherwise: `STANDARD` → `"3-Star Raids"`, `LEGENDARY` → `"5-Star Raids"`, `MYTHIC`/
   `ULTRA_BEAST`/undefined → `DEFAULT_REAL_RAID_TIER` ("5-Star Raids") as the true last resort —
   exactly per pogo-researcher's recommendation for the non-mega branch.

Only ever consulted for a real (non-`statsArePrecomputed`) boss; confirmed via new tests that a
precomputed boss with both `rarity` AND `boost` set is completely unaffected (short-circuits
before rarity is ever read) — the 4 (now test-only) pinned hypothetical fixtures are untouched.

## Flagged for web-developer (did not fix myself — packages/web is out of my remit)
`packages/web/src/IvBreakpointsView.tsx:293` hardcodes
`raidTierForSpeciesId(opt.id) ?? DEFAULT_REAL_RAID_TIER` directly (needs the actual resolved tier
string for per-tier bucketing, not `undefined`) — this now silently diverges from
`bossEffectiveStats`'s own internal default. Needs to become
`raidTierForSpeciesId(opt.id) ?? defaultRaidTierForSpecies(bossSpecies)` (now exported from
`@pogo-analyzer/engine`). This is a real behavior change, not cosmetic: most species are
`STANDARD` rarity, so most non-live sweep targets will now bucket into 3-Star instead of 5-Star —
`IvSweepReport.tsx`'s caveat text (lines ~68/77-84) explicitly describes and depends on the OLD
"defaults straight to tier 5" behavior to justify why the tier-4-plus filter has "narrow" practical
effect; that justification is now wrong and the prose needs rewriting alongside the code fix.

## Test-fixture/pin sanity confirmed
Ran the full existing pinned suite (Scenario A/B, raidBossTier.test.ts's original precomputed
cases) unchanged — 141/141 passing after the change, no pinned number moved. See
[[fact_raid_boss_tier_math]] for the underlying tier-table mechanics this builds on, and
[[feedback_boss_tier_not_in_scenario]] for why this still isn't a `Scenario` field (unchanged by
this feature — still derived data about the target, not a user setting).
