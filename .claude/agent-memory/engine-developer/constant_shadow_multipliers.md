---
name: constant-shadow-multipliers
description: Where Shadow Attack/Defense multipliers live, why they're applied pre-floor, and the mega/primal mutual-exclusion guard
metadata:
  type: project
---

Implemented 2026-09-05 (routed from a `pogo-researcher` proposal, see
`.claude/agent-memory/pogo-researcher/proposal_shadow_stat_multipliers.md` and
`fact_shadow_pokemon_stats.md`).

**Constants** (`packages/engine/src/shadow.ts`): `SHADOW_ATTACK_MULTIPLIER = 1.2`,
`SHADOW_DEFENSE_MULTIPLIER = 0.83`. [community-consensus], not Niantic-published — no primary
source exists. Some sources use 5/6 (~0.8333) instead of 0.83 for defense; pick whichever if a
primary source ever surfaces. Applied only to Attack/Defense, never Stamina.

**Where applied, and why pre-floor**: `shadowAdjustedBaseStats(species)` multiplies the RAW
`baseAttack`/`baseDefense` (before `stats.ts`'s single `effectiveStat()` floor), never the
already-floored effective stat — consistent with the project's one-floor invariant. Two call
sites share this one function: `stats.ts`'s `effectiveStatsAtLevel` (trainer/candidate stats) and
a new `bossEffectiveStats` helper in `comparison.ts` (raid boss stats — several real raid bosses
are Shadow, so this had to cover boss mode too, not just candidates).

**Mutual exclusion with mega/primal boost**: a Shadow Pokémon cannot Mega Evolve without being
Purified first (real-game constraint). `shadowAdjustedBaseStats` throws if a species has both
`isShadow: true` and a `boost` object — this is the single chokepoint both stats.ts and
comparison.ts's boss stat calc pass through, so there's no way to construct working stats for an
invalid "Shadow Mega" species. Don't add a silent fallback (e.g. "shadow wins" or "boost wins") if
asked — the real game constraint means this combination is invalid data, not an ambiguous
priority to resolve.

**Schema for data-sync's future wiring**: `SpeciesDefinition.isShadow?: boolean` (types.ts).
`fromGameMaster`/`fromGameMasterMove` don't set this yet — that's `data-sync`'s job when it wires
real Shadow raid entries in (currently ScrapedDuck strips a "Shadow " prefix and matches the base
species with `isApproximate: true`, per the routing note in this feature's task).
