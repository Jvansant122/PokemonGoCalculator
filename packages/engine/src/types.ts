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

/**
 * Sourcing confidence tier for a Super Max "+" charged move's Base-tier
 * `power` value — see ChargedMove.isPlusMove/plusMovePowerConfidence and
 * .claude/agent-memory/pogo-researcher/fact_super_max_plus_move_mechanics_detail.md.
 * "official" = stated directly in a pokemongo.com news post (e.g. Brave
 * Bird+ 150, Dark Pulse+ 150, Fell Stinger+ 140). "cross-site" = two
 * independent (non-official) sites agree on the number (e.g. Zap Cannon+
 * 160). "community-estimate" = a single self-labelled-estimate community
 * source, no corroboration (e.g. Seed Bomb+ 150, Volt Tackle+ 170, Drill
 * Peck+ 170, Outrage+ 185, Dynamic Punch+ 130). Every value at every tier is
 * a Base Mega Level reading, NOT a ceiling — see megaLevel.ts's
 * chargedMoveAtMegaLevel for how the other three tiers are derived from it.
 */
export type PlusMovePowerConfidence = "official" | "cross-site" | "community-estimate";

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
  /**
   * Marks this as a Super Max "+" charged move: a genuinely ADDITIONAL third
   * charged move a mega/primal form knows only while Mega Evolved, never a
   * replacement for its ordinary two (`SpeciesDefinition.fastMoves`/
   * `chargedMoves` still list it as one more entry in `chargedMoves`, not a
   * swap). [official, first-party: pokemongo.com/en/news/more-mega-updates-2026]
   * confirms availability needs only (a) the species being Super-Max-eligible
   * and (b) the individual currently being Mega Evolved — "regardless of
   * their current Mega Level" — so unlike the move's OWN power (see
   * plusMovePowerConfidence/megaLevel.ts's chargedMoveAtMegaLevel), no
   * runtime gate is needed here: every species that carries a move with this
   * flag set is, by construction, a mega form (`SpeciesDefinition.boost` is
   * set), and this tool only ever evaluates a mega candidate/slot as
   * currently Mega Evolved. `power` on a "+" move always stores its BASE Mega
   * Level reading (multiplier 1.0) — see plusMovePowerConfidence and
   * megaLevel.ts. Undefined/omitted (every non-"+" move, i.e. every move
   * synced before this feature and every species' ordinary two moves) means
   * false — chargedMoveAtMegaLevel passes those through completely unchanged
   * regardless of megaLevel.
   */
  isPlusMove?: boolean;
  /**
   * Confidence tier of THIS move's Base-tier `power` value — see
   * PlusMovePowerConfidence. Meaningless/undefined whenever `isPlusMove` is
   * not true; REQUIRED (by convention, not a runtime check) on every move
   * that does set `isPlusMove: true`, so a UI can badge the number honestly
   * rather than presenting a community guess with official-looking
   * confidence.
   */
  plusMovePowerConfidence?: PlusMovePowerConfidence;
}

/**
 * One ordinary-evolution BRANCH this engine can honestly price as PURE
 * CANDY — see SpeciesDefinition.evolutions' doc comment for full context
 * (IDEAS.md #9, "evolve, then power up to L" as one priced candidate). `to`
 * is the FULL evolved-form SpeciesDefinition (this package has no I/O to
 * resolve one from a bare id), `candyCost` is that branch's real
 * regular-candy cost (never stardust — MECHANICS.md's "Evolution:
 * candy-only").
 *
 * SCHEMA DECISION (2026-09-10, after data-sync measured the real
 * distribution on 550 species / 577 branches): only ~81% of real branches
 * are pure candy. The other ~19% are gated on an item, a lure module, buddy
 * walking distance, gender, time-of-day, or a field quest — see
 * `GatedEvolutionOption` below for those. `EvolutionOption` deliberately has
 * NO room to represent a gate; resolving a gated branch into this shape
 * would silently misprice it as "evolve for N candy" when the real
 * requirement might be a Metal Coat the caller doesn't own. Never widen this
 * interface to add gate fields — add to `GatedEvolutionOption` instead and
 * keep the two populations disjoint, so `evolutionEndpoints` (rosterPlanner.ts)
 * can keep treating every member of `.evolutions` as unconditionally
 * committable.
 */
export interface EvolutionOption {
  to: SpeciesDefinition;
  candyCost: number;
}

/**
 * One evolution branch this engine CANNOT honestly price as a committable
 * candidate — gated on something beyond candy that this project has no
 * inventory/calendar/social model for at all (an item, a lure item active at
 * a nearby PokéStop, buddy walking distance, gender, time-of-day, a field
 * quest). Mirrors data-sync's `EvolutionCandyCostEntry` (`data-sync`'s own
 * per-branch shape in `scripts/sync-data.ts`, exposed id-keyed on
 * `data/normalized/species.json` as `evolutionCandyCosts`, never resolved to
 * object references there — resolving `toId` into a `SpeciesDefinition`
 * reference is `packages/web/src/registry.ts`'s job, same pattern as
 * `resolveMegaBaseCandyFamilyId`/`resolveMegaBaseKmBuddyDistance`).
 *
 * Reported so a caller can show "this could be stronger, but needs X" rather
 * than the branch vanishing with no trace whatsoever — CLAUDE.md's standing
 * rule that an exclusion gets SHOWN, never quietly dropped, applies here
 * exactly as it does to `neverCompetitive`. See rosterPlanner.ts's
 * `gatedEvolutionNotices`/`RosterNeverCompetitiveEntry.gatedEvolutions`/
 * `RosterPowerUpCandidate.viaEvolution.otherGatedOptions`.
 *
 * `candyCost` is optional (not required, unlike `EvolutionOption`'s) because
 * a handful of real branches (Zygarde's own form changes, Gimmighoul ->
 * Gholdengo) are gated on an item COUNT with no candy component at all.
 *
 * Deliberately does NOT carry `noCandyCostViaTrade` (a real mechanic that
 * waives candy for a traded Kadabra/Machoke/Graveler/Haunter — recorded by
 * data-sync, but on branches that are ALREADY `EvolutionOption`s, since it
 * can only make a branch CHEAPER, never gate it) — this project has no
 * "was this individual traded" input anywhere, so surfacing it would invite
 * a caller to build UI for a discount this engine can't actually apply.
 * Left as explicit future work if that input is ever added.
 */
export interface GatedEvolutionOption {
  to: SpeciesDefinition;
  candyCost?: number;
  requiresItem?: string;
  requiresItemCount?: number;
  requiresLureItem?: string;
  requiresBuddy?: boolean;
  requiresBuddyDistanceKm?: number;
  requiresGender?: string;
  requiresDaytime?: boolean;
  requiresNighttime?: boolean;
  requiresDuskPeriod?: boolean;
  requiresFullMoon?: boolean;
  requiresUpsideDown?: boolean;
  requiresQuest?: boolean;
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
  /**
   * Whether this species has no further ordinary evolution — i.e. GAME_MASTER's
   * `evolutionBranch` carries no entry with an `evolution` field. Populated by
   * data-sync for every real synced species; undefined for hand-authored test
   * fixtures that never went through fromGameMaster, same as `rarity`/
   * `imageUrl` above.
   *
   * CRITICAL — this is NOT `evolutionBranch.length > 0`. Verified against the
   * live dump 2026-09-08: 984 templates carry a real evolution branch, but a
   * further **123 carry an `evolutionBranch` whose only entries are TEMPORARY
   * (mega) branches** — Venusaur, Charizard, Blastoise, Beedrill and Metagross
   * among them. Deriving this from branch presence alone marks those as
   * unevolved, which would silently delete the best attackers from the
   * Power-Up Optimizer's candidate set while still looking like it worked.
   * See scripts/sync-data/gameMasterMatching.ts's `isFullyEvolved`, which is
   * the single derivation and is pinned by test on exactly those species.
   *
   * Consumed by the roster planner to exclude unevolved Pokémon from power-up
   * candidates: evolution costs candy only, preserves level and IVs exactly,
   * and raises base stats, so stardust spent before evolving always buys less
   * than the same stardust spent after (MECHANICS.md; PLAN_multi_raid_roster_optimizer.md §3.6).
   */
  isFullyEvolved?: boolean;
  /**
   * The species ids this species can evolve into by ordinary evolution —
   * empty when `isFullyEvolved`. Excludes temporary (mega) evolution, which
   * is `boost`/mega-form territory, not an evolution branch.
   *
   * Resolved PER FORM, not per species: Shellos (West Sea) evolves to
   * Gastrodon (West Sea) and Shellos (East Sea) to Gastrodon (East Sea), so
   * this reads the specifically-matched GAME_MASTER record rather than a
   * union across the pokemonId enum (`isFullyEvolved` above correctly does
   * union, since a costume template can lack the branch a sibling carries).
   */
  evolvesToIds?: string[];
  /**
   * Every ordinary-evolution branch reachable from this species/form that
   * this engine can honestly price as PURE CANDY (`EvolutionOption`'s own
   * doc comment) — added 2026-09-10 for rosterPlanner.ts's "evolve, then
   * power up to L" priced candidate (IDEAS.md #9).
   *
   * RESOLUTION CONTRACT (settled 2026-09-10, after data-sync measured the
   * real distribution and found ~19% of real branches are gated — see
   * `GatedEvolutionOption`): data-sync itself does NOT populate this field.
   * It exposes an id-keyed `evolutionCandyCosts` array on the SYNCED
   * (pre-engine) species record instead (each entry carrying a
   * `candyCostOnly: boolean`), specifically so resolving a `toId` into an
   * object reference — and splitting candy-only from gated — stays a
   * separate, later step. `packages/web/src/registry.ts` does that
   * resolution (the established id-to-object pattern already used for
   * `resolveMegaBaseCandyFamilyId`/`resolveMegaBaseKmBuddyDistance`): for
   * every synced-record entry with `candyCostOnly === true`, resolve `toId`
   * against the full species map and push `{ to, candyCost }` here; every
   * entry with `candyCostOnly === false` resolves into
   * `gatedEvolutions` below instead, never here. As of THIS field's
   * introduction it is undefined for every real synced species until that
   * registry.ts step ships — rosterPlanner.ts degrades to its pre-existing
   * "evolve first" advisory whenever both this and `gatedEvolutions` are
   * absent, so the feature activates automatically once resolved, no
   * further engine change needed.
   */
  evolutions?: EvolutionOption[];
  /**
   * Every evolution branch reachable from this species/form that this
   * engine CANNOT honestly price (see `GatedEvolutionOption`'s own doc
   * comment for what "gated" means and why it's a SEPARATE array rather
   * than a richer `EvolutionOption`). Resolved by `packages/web/src/registry.ts`
   * the same way as `evolutions` above — see that field's "RESOLUTION
   * CONTRACT" note. Consumed by rosterPlanner.ts's `gatedEvolutionNotices`
   * so a gated branch is always SHOWN (with why it can't be priced) rather
   * than silently absent — never skip surfacing this just because
   * `evolutions` above already has a real candy-only candidate for the same
   * species (Eevee: Vaporeon/Jolteon/Flareon are priced candidates,
   * Espeon/Umbreon/Leafeon/Glaceon/Sylveon are still real options a user
   * should see even though this engine can't price them).
   */
  gatedEvolutions?: GatedEvolutionOption[];
  /**
   * GAME_MASTER's `familyId` (e.g. "FAMILY_BELDUM") — present on all 2472
   * templates. Real Pokémon GO candy is shared across an evolutionary FAMILY,
   * not a species: Beldum, Metang and Metagross all draw Beldum candy. Any
   * candy-budget accounting must pool on this, never on `id`, or a roster
   * holding twelve Houndour would let a planner spend the same candy twelve
   * times.
   */
  candyFamilyId?: string;
  /**
   * National Pokédex number, from pogoapi's `pokemon_stats.json` `pokemon_id`
   * (GAME_MASTER carries no `pokedexNumber` at all — confirmed 0 of 2472
   * templates, 2026-09-08). Omitted rather than guessed when it can't be
   * resolved.
   *
   * Note for anything matching external roster exports against this: a mega
   * form's `imageUrl` does NOT carry its real dex number (PokeAPI serves megas
   * under alternate-form ids, e.g. `delphox-mega` -> 10293, not Delphox's 655),
   * which is why the Poke Genie importer resolves megas by name rather than dex.
   */
  dexNumber?: number;
  /**
   * Buddy-walking distance (km) required to earn a candy for THIS
   * pokemonId/form — GAME_MASTER's own first-party `kmBuddyDistance`
   * (`data-sync`'s `scripts/sync-data.ts`/`rawShapes.ts` document full
   * provenance). Added 2026-09-10 for tmMove.ts's second-charged-move cost
   * tiering (MECHANICS.md's "Second charged move unlock": 1/3/5/20 km ->
   * 10,000/50,000/75,000/100,000 stardust). Undefined for a species
   * data-sync couldn't match to a GAME_MASTER template, or for any
   * hand-authored test/hypothetical fixture that never went through
   * `fromGameMaster`.
   *
   * IMPORTANT: keyed to the pokemonId ENUM (one evolutionary stage), NOT the
   * candy family — candy is pooled across a whole family, but this is NOT
   * always uniform across one. `data-sync` confirmed live 2026-09-10: 4 of
   * 541 families disagree between evolutionary stages (Qwilfish 3km ->
   * Overqwil 5km; Sneasel/Weavile 3km -> Sneasler 5km; Stantler 3km ->
   * Wyrdeer 5km; Zigzagoon/Linoone 1km -> Obstagoon 3km — all four are a
   * species that regionally-evolves into a form Game Freak treats as a
   * materially different Pokémon). It IS uniform across every FORM of the
   * same pokemonId (e.g. base/Hisuian Sneasel both 3km, Zacian Hero/Crowned
   * Sword both 20km) — a per-(pokemonId, form) lookup (i.e. this field, read
   * straight off the specific `SpeciesDefinition` in hand) is safe; deriving
   * it from `candyFamilyId` is not, without picking a specific stage.
   *
   * tmMove.ts's `secondChargedMoveCost` deliberately still takes buddy
   * distance as an explicit function parameter rather than reading this
   * field directly — it also needs the starter/baby flat-rate override
   * (which this field alone can't express) and stayed unblocked while this
   * field didn't exist yet. A caller should pass `species.kmBuddyDistance`
   * through to that parameter now that it exists.
   */
  kmBuddyDistance?: number;
}

export interface EffectiveStats {
  attack: number;
  defense: number;
  stamina: number;
}
