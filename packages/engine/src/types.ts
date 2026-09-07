export type PokemonType =
  | "normal" | "fire" | "water" | "electric" | "grass" | "ice"
  | "fighting" | "poison" | "ground" | "flying" | "psychic" | "bug"
  | "rock" | "ghost" | "dragon" | "dark" | "steel" | "fairy";

export interface IVSpread {
  attack: number;
  defense: number;
  stamina: number;
}

/**
 * pogoapi.net's `pokemon_rarity.json` classification — the community's own
 * coarse "how does this species show up in the game" vocabulary (data-sync's
 * `toPokemonRarity` normalizes pogoapi's raw category strings, e.g. "Ultra
 * beast", into this exact union). Consumed by raidBoss.ts's
 * `defaultRaidTierForSpecies` to pick a more defensible real-raid-tier
 * fallback than one single blanket guess when a species isn't in today's
 * live raid feed — see
 * .claude/agent-memory/pogo-researcher/proposal_default_raid_tier_fallback.md
 * for the research behind this. Optional/undefined for any species
 * data-sync hasn't classified (or a hand-authored test/hypothetical fixture
 * that never goes through fromGameMaster at all).
 */
export type PokemonRarity = "STANDARD" | "LEGENDARY" | "MYTHIC" | "ULTRA_BEAST";

/**
 * Real Pokémon GO raid difficulty tiers, keyed by the exact label strings this
 * project's live raid feed already uses (data/normalized/activeRaids.json's
 * `tier` field, sourced from ScrapedDuck via scripts/sync-data.ts) — confirmed
 * by direct grep to only ever emit "1-Star Raids"/"3-Star Raids"/"Mega Raids"/
 * "5-Star Raids"/"Super Mega Raids" today. "Legendary Mega Raids" (six-star)
 * and "Primal Raids" are included for completeness per the Bulbapedia
 * Difficulty table even though the live feed has never emitted either label
 * yet — real Primal/six-star raids are current-game content, just not present
 * in this project's current raid-feed snapshot.
 *
 * Lives here (not raidBoss.ts, which is its primary consumer) so that
 * SpeciesDefinition.lastKnownRaidTier below can reference it without
 * types.ts importing back from raidBoss.ts (raidBoss.ts already imports
 * SpeciesDefinition from this file, so the reverse import would be
 * circular). raidBoss.ts re-exports this type for backward compatibility
 * with every existing `from "./raidBoss.js"` import site.
 */
export type RaidTier =
  | "1-Star Raids"
  | "3-Star Raids"
  | "Mega Raids"
  | "5-Star Raids"
  | "Legendary Mega Raids"
  | "Super Mega Raids"
  | "Primal Raids";

export interface FastMove {
  id: string;
  name: string;
  type: PokemonType;
  power: number;
  /** Energy gained by the user each time this move completes. */
  energyGain: number;
  /** Total move duration in seconds, including the animation lockout. */
  durationSeconds: number;
}

export interface ChargedMove {
  id: string;
  name: string;
  type: PokemonType;
  power: number;
  /** Energy required to fire this move. */
  energyCost: number;
  durationSeconds: number;
  /**
   * Portion of the move's duration, starting from move start, during which the
   * user is vulnerable to incoming damage (cannot dodge/be interrupted out of it).
   * Used to model the "died mid-animation" failure mode from the source analysis.
   */
  vulnerableWindowSeconds: number;
  /**
   * Whether an opponent can reliably perfectly-dodge THIS move landing on
   * them. Undefined/omitted means true (dodgeable) — this is the honest
   * default because pogoapi.net (this project's data source) has no
   * frame-level "damage window" timing for any move, so there's no real data
   * basis to mark any of the 1000+ synced moves false. Only ever hand-set to
   * false on a specific move once actually identified as undodgeable in
   * practice, the same way vulnerableWindowSeconds and fixture base stats are
   * hand-authored elsewhere in this project. See breakpoints.ts's
   * dodgeMultiplierForHit for where this is consumed.
   */
  perfectlyDodgeable?: boolean;
}

export interface SpeciesDefinition {
  id: string;
  name: string;
  types: [PokemonType] | [PokemonType, PokemonType];
  baseAttack: number;
  baseDefense: number;
  baseStamina: number;
  fastMoves: FastMove[];
  chargedMoves: ChargedMove[];
  /** True mega/primal forms apply a party-wide or self boost multiplier while active. */
  boost?: {
    multiplier: number;
    /** The type whose damage output (attacker or teammates) receives the boost. */
    boostedType: PokemonType;
    /**
     * Whether this boost keeps applying to teammates for the rest of the
     * fight even after this Pokémon has fainted, as long as it's still in
     * the raid party (not swapped out) — true for Primal Groudon/Kyogre and
     * Mega Rayquaza specifically; every other standard mega's boost ends the
     * instant it faints. [community-consensus] (Bulbapedia, citing a March
     * 2023 Reddit crowd-test — not an official Niantic statement). Defaults
     * to false/undefined, matching every standard mega's real behavior.
     * Consumed by uptime.ts's convertUptimeToTeamDamage, which uses this to
     * decide whether the boost's team-damage window is capped at
     * secondsSurvived (false) or extends to the full fight duration (true).
     */
    persistsThroughFaint?: boolean;
  };
  /**
   * Marks data the user supplied directly rather than sourced from a GameMaster
   * dump — hypothetical mega forms, custom raid bosses, etc.
   */
  isHypothetical?: boolean;
  /**
   * Marks this species as its Shadow form — applies shadow.ts's
   * SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER to its raw base stats
   * (see stats.ts's effectiveStatsAtLevel). [community-consensus], not
   * Niantic-published — see shadow.ts for sourcing detail. Mutually
   * exclusive with `boost`: a Shadow Pokémon cannot Mega Evolve in the real
   * game without being Purified first, so a species carrying both is treated
   * as invalid data (shadow.ts's shadowAdjustedBaseStats throws rather than
   * silently combining them). Defaults to false/undefined (today's
   * behavior: no Shadow modeling).
   */
  isShadow?: boolean;
  /**
   * A sprite/icon URL for this species, if one was resolved (see
   * scripts/sync-data.ts for real species; hand-set on the hypothetical
   * fixtures). Not fetched by the engine itself (no I/O here) — this is
   * plain data set by whoever constructs the SpeciesDefinition.
   */
  imageUrl?: string;
  /**
   * Marks this species' baseAttack/baseDefense/baseStamina fields as
   * already-final, boss-effective numbers — i.e. NOT raw base stats needing
   * the real per-tier raid-boss derivation (see raidBoss.ts's RAID_TIER_TABLE
   * and comparison.ts's bossEffectiveStats/bossEffectiveHp). True only for
   * hand-tuned hypothetical raid-boss fixtures (this engine's own
   * test/fixtures/hypotheticalDuo.ts, whose numbers were reverse-engineered
   * to reproduce pinned Scenario A/B test values under the old
   * iv=0/cpm=1.0 pass-through — test-only, never exported from src/) and
   * hand-authored synthetic boss fixtures elsewhere in this engine's own
   * test suite (same category: round numbers picked to already BE the
   * effective stat, not a real species' actual base stats).
   *
   * Defaults to false/undefined for every real synced species (from
   * fromGameMaster) — those need the real tier-keyed formula derived fresh
   * from their own base stats whenever fielded as a boss, since a real
   * species' baseAttack/baseDefense/baseStamina are ordinary trainer-mode
   * base stats, not boss-effective numbers. Only consumed when a species is
   * used in the BOSS role; irrelevant to a species used as a candidate/
   * attacker (which always goes through the ordinary trainer CPM/IV pipeline
   * in stats.ts regardless of this flag).
   */
  statsArePrecomputed?: boolean;
  /**
   * pogoapi.net's Standard/Legendary/Mythic/Ultra-Beast classification for
   * this species (see PokemonRarity's doc comment). Populated by data-sync
   * for every real synced species (scripts/sync-data.ts's `rarityFor`,
   * defaulting to "STANDARD" itself when pokemon_rarity.json is missing the
   * id) as of 2026-09-06; undefined for hand-authored hypothetical/test
   * fixtures that never went through fromGameMaster. Only consumed when a
   * species is used in the BOSS role (raidBoss.ts's
   * defaultRaidTierForSpecies) — irrelevant to a species used as a
   * candidate/attacker, same scoping as statsArePrecomputed above.
   */
  rarity?: PokemonRarity;
  /**
   * The most-recently-confirmed REAL raid tier this species has actually
   * been observed/verified to raid at (e.g. a species that debuted in
   * 5-Star Raids and was later confirmed rotated to 3-Star) — distinct from
   * packages/web's registry.ts's `raidTierForSpeciesId()`, which answers "is
   * this species a CURRENTLY active raid target right now" from the live
   * feed. This field is a slower-moving, hand/data-maintained fact about a
   * species' raid history, not a live signal; it has no data-sync producer
   * as of 2026-09-07 (no upstream source currently supplies this), so it's
   * undefined for every synced species today, but the field exists so a
   * future data source (or hand-authored override) can set it.
   *
   * Consumed by raidBoss.ts's `defaultRaidTierForSpecies` as the FIRST
   * priority — preferred over the rarity/boost-keyed heuristic there,
   * since an actually-confirmed real tier is strictly better evidence than
   * a guess derived from rarity/boost. Only meaningful for a real
   * (non-precomputed) boss; irrelevant to `statsArePrecomputed` species and
   * to a species used in the candidate/attacker role.
   */
  lastKnownRaidTier?: RaidTier;
}

export interface EffectiveStats {
  attack: number;
  defense: number;
  stamina: number;
}
