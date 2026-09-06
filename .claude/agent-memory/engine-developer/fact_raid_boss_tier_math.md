---
name: fact-raid-boss-tier-math
description: Real Pokemon GO raid boss stat derivation (per-tier HP table + Attack/Defense CPM-equivalent multiplier), and why it must branch from the old precomputed-fixture pass-through rather than replace it
metadata:
  type: project
---

Implemented 2026-09-05/06, fixing a real correctness bug: `RAID_BOSS_CPM = 1.0` / `RAID_BOSS_IVS
= {0,0,0}` in `raidBoss.ts` treats a boss's `baseAttack`/`baseDefense`/`baseStamina` as already
final/boss-effective — correct ONLY for this project's 4 hand-tuned hypothetical fixtures
(`fixtures/scenarioA.ts`) and hand-authored synthetic test bosses, wrong for any real synced
species used as a live raid target (which `activeRaidBossOptions()` in `packages/web/src/registry.ts`
already surfaces as directly selectable — e.g. Mega Victreebel was being computed with ~200 HP and
no stat multiplier instead of its real multi-thousand HP pool).

**Real per-tier stats** (source: `.claude/agent-memory/pogo-researcher/fact_raid_boss_tier_stats_resolved.md`,
Bulbapedia raw wikitext, cross-verified 3x): fixed flat HP per tier (1-star 600, 3-star 3600, Mega
9000, 5-star/Legendary 15000, Legendary Mega/6-star 22500, Super Mega 25000, Primal 22500) +
Attack/Defense multiplier (1-star 0.5974, 3-star 0.73, everything Mega-tier-and-up 0.79), combined
with perfect IV 15 via the EXISTING `effectiveStat(base, iv, cpm)` — no new formula, just different
parameters (`iv=15, cpm=tierMultiplier` instead of `iv=0, cpm=1.0`).

**The critical asymmetry, and the wrong "fix" to watch for**: HP is a flat table value, completely
decoupled from the species' own `baseStamina` and NOT run through `effectiveStat`/CPM at all
(Bulbapedia's own text: "a fixed Boss HP value based on the raid level"). Do NOT "fix" this by
applying `effectiveStat(baseStamina, 15, multiplier)` — that reproduces neither real numbers nor
the fixtures. `comparison.ts`'s `bossEffectiveHp(boss, tier?)` implements this correctly (see
`raidBossTier.test.ts`'s explicit regression test for exactly this mistake).

**The branch**: added `SpeciesDefinition.statsArePrecomputed?: boolean` (types.ts). True →
`bossEffectiveStats`/`bossEffectiveHp` keep the old iv=0/cpm=1.0 pass-through untouched. False/
absent (every real synced species) → real tier math, defaulting to `DEFAULT_REAL_RAID_TIER =
"5-Star Raids"` when no tier is supplied (an honest placeholder, same precedent as
`swapCostSeconds`/`reviveCostSeconds` defaulting to 0). New `RaidTier` type + `RAID_TIER_TABLE` +
`raidTierStats`/`isKnownRaidTier` all live in `raidBoss.ts`, keyed by the exact tier label strings
`data/normalized/activeRaids.json` already uses (`"1-Star Raids"` etc.) — no separate
label-normalization layer needed.

**Threading**: `ComparisonInputs`/`SustainedComparisonInputs`/`TeamRaidInputs` all gained an
optional `bossRaidTier?: RaidTier`. Web side: `registry.ts`'s `raidTierForSpeciesId(id)` looks up
the live active-raid feed's tier for a species id (null if not currently a live raid target);
`App.tsx` resolves this once and threads it into `runSustainedComparison`,
`compareAcrossBossChargedMoves`, AND `sensitivity.ts`'s `computeSensitivity` (this last one was an
easy thing to miss — the sensitivity panel re-simulates independently and would otherwise silently
disagree with the main result cards on a real boss's stats).

See also [[feedback-test-fixture-precomputed-flag]] and [[feedback-boss-tier-not-in-scenario]].
