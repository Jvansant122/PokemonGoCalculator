import type { SpeciesDefinition } from "./types.js";

/**
 * Raid bosses don't level up or roll IVs the way trainer-owned Pokémon do — Niantic
 * publishes their effective stats directly. To reuse the single stat pipeline in
 * stats.ts (one documented FLOOR(), one code path) rather than forking a second one,
 * a raid boss is modeled as a species whose "base stat" fields already ARE its
 * effective stats, combined with iv = 0 and this fixed multiplier of 1.0.
 *
 * IMPORTANT: this iv=0/cpm=1.0 pass-through is only correct for species whose
 * baseAttack/baseDefense/baseStamina fields were deliberately hand-authored to
 * already be final boss-effective numbers (SpeciesDefinition.statsArePrecomputed) —
 * this engine's own test-only hypothetical raid-boss fixtures
 * (test/fixtures/hypotheticalDuo.ts, never exported from src/) plus a number
 * of hand-tuned synthetic bosses used only in this engine's own test suite.
 * Every REAL synced species used as a live raid target needs the real per-tier
 * formula below instead — see RAID_TIER_TABLE, raidTierStats, and
 * comparison.ts's bossEffectiveStats/bossEffectiveHp (the only place these two
 * pass-through and real-tier pipelines are actually selected between).
 */
export const RAID_BOSS_CPM = 1.0;
export const RAID_BOSS_IVS = { attack: 0, defense: 0, stamina: 0 } as const;

/**
 * Real raid bosses carry perfect Attack/Defense IV 15 (community-consensus,
 * corroborated but not from one single verbatim primary source — see
 * .claude/agent-memory/pogo-researcher/fact_raid_boss_tier_stats_resolved.md).
 * Distinct from RAID_BOSS_IVS (iv=0) above, which only applies to the
 * already-final hand-tuned/precomputed boss fixtures.
 */
export const REAL_RAID_BOSS_IV = 15;

/**
 * Real Pokémon GO raid difficulty tiers, keyed by the exact label strings this
 * project's live raid feed already uses (data/normalized/activeRaids.json's
 * `tier` field, sourced from ScrapedDuck via scripts/sync-data.ts) — confirmed
 * by direct grep to only ever emit "1-Star Raids"/"3-Star Raids"/"Mega Raids"/
 * "5-Star Raids"/"Super Mega Raids" today. "Legendary Mega Raids" (six-star)
 * and "Primal Raids" are included for completeness per the Bulbapedia
 * Difficulty table (see the fact file above) even though the live feed has
 * never emitted either label yet — real Primal/six-star raids are current-game
 * content, just not present in this project's current raid-feed snapshot.
 */
export type RaidTier =
  | "1-Star Raids"
  | "3-Star Raids"
  | "Mega Raids"
  | "5-Star Raids"
  | "Legendary Mega Raids"
  | "Super Mega Raids"
  | "Primal Raids";

export interface RaidTierStats {
  /**
   * Fixed, flat battle HP pool for this tier — Bulbapedia's own text calls
   * this "a fixed Boss HP value based on the raid level," i.e. NOT derived
   * from the species' own baseStamina at all (a completely different number
   * from the species' base stat, and not run through effectiveStat/CPM
   * either). See comparison.ts's bossEffectiveHp — this is the one place
   * that distinction must be preserved; applying effectiveStat() to a real
   * species' baseStamina would NOT reproduce these numbers.
   */
  hp: number;
  /**
   * Attack/Defense CPM-equivalent multiplier for this tier — combined with
   * REAL_RAID_BOSS_IV via the ordinary effectiveStat(baseStat, iv, cpm)
   * pipeline already in stats.ts (no new formula needed).
   */
  attackDefenseMultiplier: number;
}

/**
 * Real per-tier battle HP + Attack/Defense multiplier, verbatim from
 * Bulbapedia's "Raid Battle (GO)" Difficulty table (raw wikitext fetch,
 * cross-verified across 3 independent fetches this project — see
 * .claude/agent-memory/pogo-researcher/fact_raid_boss_tier_stats_resolved.md
 * for the full sourcing and the earlier false-alarm CP-display-formula mixup
 * this superseded). [community-consensus] — Bulbapedia is a community wiki,
 * not an official Niantic source, but this is the third independent fetch to
 * land on the same figures.
 */
export const RAID_TIER_TABLE: Record<RaidTier, RaidTierStats> = {
  "1-Star Raids": { hp: 600, attackDefenseMultiplier: 0.5974 },
  "3-Star Raids": { hp: 3600, attackDefenseMultiplier: 0.73 },
  "Mega Raids": { hp: 9000, attackDefenseMultiplier: 0.79 },
  "5-Star Raids": { hp: 15000, attackDefenseMultiplier: 0.79 },
  "Legendary Mega Raids": { hp: 22500, attackDefenseMultiplier: 0.79 },
  "Super Mega Raids": { hp: 25000, attackDefenseMultiplier: 0.79 },
  "Primal Raids": { hp: 22500, attackDefenseMultiplier: 0.79 },
};

/**
 * The assumed real-raid tier when a real (non-precomputed) boss's tier isn't
 * known/supplied — e.g. a species picked directly from the full species
 * picker rather than from the live active-raid list, where no tier is
 * derivable at all. "5-Star Raids" (Legendary-tier, the most common
 * "serious raid boss" assumption) is an honest, documented placeholder, the
 * same honesty precedent as teamRaid.ts's swapCostSeconds/reviveCostSeconds
 * defaulting to 0 rather than a fabricated "realistic" number.
 */
export const DEFAULT_REAL_RAID_TIER: RaidTier = "5-Star Raids";

/**
 * A per-species-classed replacement for blindly assuming
 * DEFAULT_REAL_RAID_TIER whenever a real boss's actual current tier isn't
 * known (species not in today's live raid feed) — see
 * .claude/agent-memory/pogo-researcher/proposal_default_raid_tier_fallback.md
 * for the research this implements. Previously EVERY unmatched real species
 * (including an ordinary Tier-1 species like Caterpie) silently modeled as a
 * Legendary-tier boss; most species are Standard-rarity, so this was wrong
 * far more often than right.
 *
 * Priority order:
 * 1. A real, non-hypothetical mega/primal form (`species.boost` set) ->
 *    "Mega Raids". Real mega/primal species never actually raid at 3-star or
 *    5-star, so branching on their (base-species) `rarity` alone would still
 *    be wrong — `boost` is a strictly better signal here, already on every
 *    synced mega/primal SpeciesDefinition (scripts/sync-data.ts). Note this
 *    can't further distinguish "Mega Raids" from "Legendary Mega
 *    Raids"/"Primal Raids"/"Super Mega Raids" (all four share the same 0.79
 *    attackDefenseMultiplier, differing only in HP pool) — SpeciesDefinition
 *    has no clean signal for that today, so "Mega Raids" (the most common
 *    mega-tier raid) is the single best guess, not a fully solved case.
 * 2. Otherwise, `species.rarity`: STANDARD -> "3-Star Raids" (the common
 *    case), LEGENDARY -> "5-Star Raids". MYTHIC/ULTRA_BEAST and
 *    missing/undefined rarity data (neither Mythic nor Ultra Beast has
 *    historically been a standard raid-boss category, and undefined means
 *    data-sync has no classification for this species at all) both pass
 *    through to DEFAULT_REAL_RAID_TIER, the true last resort — kept as its
 *    own named export rather than inlined here so callers/tests can still
 *    reference "the honest placeholder" directly.
 *
 * Only meaningful for a real (non-precomputed) boss — see comparison.ts's
 * bossEffectiveStats/bossEffectiveHp, the only two callers. Irrelevant to
 * `statsArePrecomputed` bosses (this engine's own hypothetical/test
 * fixtures), which short-circuit before ever reaching this function.
 */
export function defaultRaidTierForSpecies(species: SpeciesDefinition): RaidTier {
  if (species.boost) return "Mega Raids";
  switch (species.rarity) {
    case "STANDARD":
      return "3-Star Raids";
    case "LEGENDARY":
      return "5-Star Raids";
    default:
      return DEFAULT_REAL_RAID_TIER;
  }
}

/** Looks up a tier's fixed HP + Attack/Defense multiplier. Total over RaidTier — every member of the union has a table row. */
export function raidTierStats(tier: RaidTier): RaidTierStats {
  return RAID_TIER_TABLE[tier];
}

/**
 * Type guard for a raw string (e.g. straight from activeRaids.json's `tier`
 * field, which is untyped JSON) actually being one of the tiers this table
 * knows about — lets a caller (packages/web's registry) safely narrow an
 * arbitrary string into a RaidTier without this engine package needing to
 * trust web-side data shapes blindly.
 */
export function isKnownRaidTier(tier: string): tier is RaidTier {
  return Object.prototype.hasOwnProperty.call(RAID_TIER_TABLE, tier);
}
