/**
 * Hand-curated table of Super Max "+" charged moves — Pokémon GO's
 * 2026-08-31 mechanic granting an eligible mega/primal species a genuinely
 * ADDITIONAL third charged move while Mega Evolved (see
 * ChargedMove.isPlusMove/plusMovePowerConfidence in
 * packages/engine/src/types.ts, and
 * .claude/agent-memory/pogo-researcher/fact_super_max_plus_move_mechanics_detail.md
 * for the full mechanic writeup this table is built from).
 *
 * Same spirit and standard of per-entry justification as
 * ./releasedMegaPrimalAllowlist.ts: a short, hand-reviewed table for content
 * the automated GAME_MASTER-driven pipeline structurally can't discover on
 * its own. Here the gap is different — GAME_MASTER genuinely has no "+"-move
 * TEMPLATE for any of these (confirmed by direct grep of a freshly-synced
 * dump, see the research memory's Q1: zero `_PLUS`-suffixed movementIds
 * beyond the pre-existing, unrelated Apex Lugia/Ho-Oh AEROBLAST_PLUS/
 * SACRED_FIRE_PLUS templates) — but each "+" move's underlying BASE move is
 * a completely ordinary, already-synced GLOBAL `moveSettings` template, so
 * this table supplies (id, name, power, confidence, energyCost) per species
 * on top of that base template's type/duration.
 *
 * THREE FIELDS, THREE DIFFERENT PROVENANCES — do not let any one of these
 * launder another; re-read this section before "simplifying" them back to a
 * single shared source:
 *
 * - durationSeconds (and vulnerableWindowSeconds, which the engine always
 *   derives equal to it): [well-evidenced]. Still INHERITED from the base
 *   move's own real GAME_MASTER duration, unchanged, via the
 *   `fromGameMasterMove(...)` spread in resolveSuperMaxPlusMove below. 11 of
 *   11 community-reported "+" move durations matched this project's own
 *   GAME_MASTER duration for the corresponding base move exactly, zero
 *   exceptions (research memory's "Duration: now very well evidenced"
 *   section).
 * - power: this table's own per-entry `power` value, at the confidence tier
 *   its own `confidence` field states — see PlusMovePowerConfidence and each
 *   entry's own citation below. NEVER inherited from the base move.
 * - energyCost: CORRECTED 2026-09-09. Now this table's own per-entry,
 *   EXPLICIT, real sourced value — no longer inherited from the base move at
 *   all. The original version of this table inherited each "+" move's
 *   energyCost from its base move's own GAME_MASTER template, justified only
 *   by [reasoned-by-analogy] off the Apex Lugia/Ho-Oh AEROBLAST/SACRED_FIRE
 *   precedent (both of which happen to keep energyDelta identical across
 *   every move tier) — genuinely the best evidence available at the time,
 *   but weak: raid-context energy for the actual "+" move mechanic was
 *   unpublished from every source checked. That assumption produced
 *   implausible outliers once put next to the game's real charged-move
 *   roster: under it, Drill Peck+ and Volt Tackle+ worked out to 5.15
 *   damage-per-energy and Fell Stinger+ to 4.24, when the best real charged
 *   move in the ENTIRE game is Mind Blown at 3.94 DPE (ignoring
 *   FISSURE/HORN_DRILL's 9000-power OHKO placeholder templates, which are
 *   not real raid moves). That sanity check is what first put the old
 *   assumption under suspicion.
 *
 *   Source now exists: db.pokemongohub.net, per-move pages, fetched
 *   2026-09-09. Each of the 8 live entries' own dedicated page (URLs cited
 *   per-entry below; id pattern is `/move/2<4-digit dex><2-digit form>`,
 *   form `00` for a species with only one Mega form, `24`/`25` for Mega
 *   X/Y) states verbatim "In Gym and Raid battles, it deals N damage and it
 *   costs 100 energy" — EVERY "+" move costs 100 energy in raids, regardless
 *   of what its own base move costs. Independently re-verified directly for
 *   this correction, not just transcribed: every one of the 8 URLs cited
 *   below was re-fetched and re-read, and every single one returned exactly
 *   "100" alongside its own already-known, DIFFERENT power figure
 *   (130-185). A source printing one constant number for every move it's
 *   asked about is EXACTLY the failure mode that made dittobase.com's own
 *   raid-energy field untrustworthy in the first place (it printed -100 on
 *   literally every "+" move checked, including ones whose real base
 *   energyDelta is 33 or 50 — see git history for that finding), so
 *   returning a constant 100 does not, by itself, clear this source. What
 *   clears it: this project's own committed data/raw/game_master.json
 *   independently confirms base VOLT_TACKLE at energyDelta -33 and base
 *   ZAP_CANNON at energyDelta -100 — two DIFFERENTLY-VALUED real numbers —
 *   and db.pokemongohub.net's own ORDINARY (non-"+") move pages reproduce
 *   both of those exactly, along with power and duration, across 11
 *   ordinary moves spot-checked against this project's own committed dump.
 *   A source whose energy field were just a template default could not also
 *   correctly reproduce two different real values elsewhere on the same
 *   site. So the uniform 100 seen on every "+" move is a genuine, if
 *   striking, per-move field reading a real design fact — 100 is already
 *   the top of the game's 3-tier PvE energy scale (33/50/100), so every "+"
 *   move landing on that max tier is mechanically unremarkable — not a
 *   placeholder. Corrected DPE for all 8 lands between 1.30 and 1.85,
 *   entirely ordinary, unlike the old implausible 4.24-5.15 outliers above.
 *
 * CONSTRUCTION PATTERN (verified end-to-end by engine-developer for Dark
 * Pulse+/Fell Stinger+ in packages/engine/test/megaLevel.test.ts, phase 1 of
 * this feature — that test's own local fixtures still hardcode the
 * pre-correction energyCost values 50/33 as arbitrary generic numbers for
 * exercising the scaling mechanism, not a claim about real data, since that
 * test only asserts scaling never touches energyCost, whatever value it
 * holds; it does not need updating for this correction, but is worth
 * knowing about if those old numbers are ever confusing to find there):
 * spread `fromGameMasterMove(<base move's real GLOBAL GAME_MASTER
 * moveSettings record>)` — via this project's existing
 * toRawGameMasterMoveFromMoveSettings on-ramp, unchanged — then override
 * `id`/`name`/`power`/`energyCost`/`isPlusMove`/`plusMovePowerConfidence` on
 * top. This still carries the base move's real `durationSeconds`/
 * `vulnerableWindowSeconds`/`type` through unchanged, but — per the
 * correction above — `energyCost` is now ALWAYS overridden by the entry's
 * own explicit field, never the spread-through base value. See
 * resolveSuperMaxPlusMove below, the only place this pattern is implemented
 * for real (non-test) data.
 *
 * IMPORTANT — 7 of these 8 live base moves are NOT in their own species' OWN
 * movepool (DARK_PULSE isn't on Mega Houndoom, SEED_BOMB isn't on Mega
 * Chesnaught, VOLT_TACKLE/ZAP_CANNON isn't on either Raichu mega, DRILL_PECK
 * isn't on Mega Skarmory, DYNAMIC_PUNCH isn't on Mega Mewtwo X, OUTRAGE isn't
 * on Mega Dragonite) — only FELL_STINGER is already one of Mega Beedrill's
 * own moves. That's exactly why this resolves against the GLOBAL
 * `gameMasterMoveByMovementId` map (every `moveSettings` entry this sync
 * fetched), never a species' own already-resolved moveset — the "+" move is
 * genuinely new content for 7 of these 8 species, not a re-listing of
 * something they already had.
 *
 * ATTACHMENT: attachSuperMaxPlusMoves is called once, from sync-data.ts's
 * mega-species build path, immediately after `megaSpecies` is fully built
 * (so every real mega/primal species this run produced is a candidate) — see
 * the call site there for the exact insertion point.
 */

import { fromGameMasterMove, type ChargedMove, type PlusMovePowerConfidence, type SpeciesDefinition } from "@pogo-analyzer/engine";

import type { GameMasterMoveRecord } from "./rawShapes.ts";
import { toRawGameMasterMoveFromMoveSettings } from "./adapters.ts";

export interface SuperMaxPlusMoveEntry {
  /**
   * The species id this "+" move attaches to (e.g. "houndoom-mega") — this
   * project's own megaSpeciesIdFor() id convention, never a GAME_MASTER enum.
   */
  speciesId: string;
  /**
   * The base move's real GAME_MASTER movementId, e.g. "DARK_PULSE" — always
   * looked up against the GLOBAL move table (see module doc comment), never
   * the target species' own resolved moveset. Still the source of this
   * move's type/durationSeconds/vulnerableWindowSeconds — see module doc
   * comment's "THREE FIELDS" section.
   */
  baseMovementId: string;
  /**
   * The "+" move's own synthetic id, matching Niantic's real `_PLUS` naming
   * convention precedent (AEROBLAST_PLUS, SACRED_FIRE_PLUS).
   */
  moveId: string;
  moveName: string;
  /**
   * Base Mega Level (multiplier 1.0) raid power — see PlusMovePowerConfidence
   * and megaLevel.ts's chargedMoveAtMegaLevel for how the other 3 tiers are
   * derived from this at simulation time. NEVER pre-scaled here.
   */
  power: number;
  /** Confidence tier for `power` ONLY — says nothing about `energyCost`. */
  confidence: PlusMovePowerConfidence;
  /**
   * The "+" move's own real RAID-context energy cost, in this engine's usual
   * positive-magnitude convention (matches ChargedMove.energyCost, NOT
   * GAME_MASTER's negative energyDelta). CORRECTED 2026-09-09 — see module
   * doc comment's "THREE FIELDS" section for the full sourcing story. This
   * is now ALWAYS this table's own explicit, per-entry value;
   * resolveSuperMaxPlusMove no longer inherits it from the base move.
   * `confidence` above does not apply to this field — it currently reads a
   * uniform, independently-verified 100 for every live entry except the
   * still-unconfirmed Mega Staraptor placeholder (see that entry's own
   * comment for why).
   */
  energyCost: number;
}

export const SUPER_MAX_PLUS_MOVES: SuperMaxPlusMoveEntry[] = [
  // [official] pokemongo.com/en/news/mega-squads-2026, fetched 2026-09-09 —
  // states Dark Pulse+'s raid power directly. Mega Squads event species
  // (2026-09-08 to 09-14), brand new this event. DARK_PULSE is NOT in Mega
  // Houndoom's own moveset (see module doc comment) — resolved from the
  // global move table instead. Pinned at value level in
  // scripts/sync-data/test/normalizedGolden.test.ts.
  // energyCost: [sourced, corrected 2026-09-09] db.pokemongohub.net/move/2022900,
  // fetched 2026-09-09 — "In Gym and Raid battles, it deals 150 damage and
  // it costs 100 energy." Independently re-verified directly for this
  // correction; see module doc comment for why this source's energyCost
  // field is trusted despite reading a uniform 100 across every "+" move.
  {
    speciesId: "houndoom-mega",
    baseMovementId: "DARK_PULSE",
    moveId: "DARK_PULSE_PLUS",
    moveName: "Dark Pulse+",
    power: 150,
    confidence: "official",
    energyCost: 100,
  },
  // [official] pokemongo.com/en/news/mega-squads-2026, fetched 2026-09-09.
  // Same event as Houndoom above. FELL_STINGER IS already one of Mega
  // Beedrill's own moves (the one exception among these 8 — see module doc
  // comment) but is still resolved from the global table here for a uniform
  // code path; the values are identical either way. Pinned at value level in
  // scripts/sync-data/test/normalizedGolden.test.ts.
  // energyCost: [sourced, corrected 2026-09-09] db.pokemongohub.net/move/2001500,
  // fetched 2026-09-09 — "In Gym and Raid battles, it deals 140 damage and
  // it costs 100 energy." Independently re-verified directly for this
  // correction; see module doc comment.
  {
    speciesId: "beedrill-mega",
    baseMovementId: "FELL_STINGER",
    moveId: "FELL_STINGER_PLUS",
    moveName: "Fell Stinger+",
    power: 140,
    confidence: "official",
    energyCost: 100,
  },
  // [cross-site] two independently-run community sites agree on this exact
  // figure: doctorpokegogo.com's own Level-1 raid-power table AND
  // db.pokemongohub.net ("Damage: 160" stated flatly), checked independently
  // of each other. Part of the original 13-species Super Max "+" move batch
  // (pokemongo.com/en/news/more-mega-updates-2026). ZAP_CANNON is not in
  // either Raichu mega's own moveset.
  // energyCost: [sourced, corrected 2026-09-09] db.pokemongohub.net/move/2002625,
  // fetched 2026-09-09 — "In Gym and Raid battles, it deals 160 damage and
  // it costs 100 energy." Independently re-verified directly for this
  // correction; see module doc comment. (Coincidentally also matches base
  // ZAP_CANNON's own real energyCost of 100 — see data/raw/game_master.json
  // — but this value is sourced to the "+" move's own page, not inferred
  // from that coincidence.)
  {
    speciesId: "raichu-mega-y",
    baseMovementId: "ZAP_CANNON",
    moveId: "ZAP_CANNON_PLUS",
    moveName: "Zap Cannon+",
    power: 160,
    confidence: "cross-site",
    energyCost: 100,
  },
  // [cross-site, upgraded 2026-09-09] Originally community-estimate off
  // doctorpokegogo.com's own Level-1 raid-power table alone (self-labelled
  // an estimate). db.pokemongohub.net now independently states the same
  // figure ("Damage: 150"). Confirmed via
  // .claude/agent-memory/pogo-researcher/fact_super_max_plus_move_mechanics_detail.md's
  // round-3 (same-day) sourcing table that pokemongohub was NOT
  // doctorpokegogo's original source for this species — that pass lists
  // Seed Bomb+ as "doctorpokegogo only" with zero pokemongohub mention —
  // so this is two genuinely independent sites converging, the same bar
  // Zap Cannon+ above already met. Part of the original 13-species batch.
  // SEED_BOMB is not in Mega Chesnaught's own moveset.
  // energyCost: [sourced, corrected 2026-09-09] db.pokemongohub.net/move/2065200,
  // fetched 2026-09-09 — "In Gym and Raid battles, it deals 150 damage and
  // it costs 100 energy." Independently re-verified directly for this
  // correction; see module doc comment.
  {
    speciesId: "chesnaught-mega",
    baseMovementId: "SEED_BOMB",
    moveId: "SEED_BOMB_PLUS",
    moveName: "Seed Bomb+",
    power: 150,
    confidence: "cross-site",
    energyCost: 100,
  },
  // [cross-site, upgraded 2026-09-09] Originally community-estimate off
  // doctorpokegogo.com's own Level-1 raid-power table alone (self-labelled
  // an estimate). db.pokemongohub.net now independently states the same
  // figure ("Damage: 170"). Confirmed via the research memory's round-3
  // sourcing table that pokemongohub was NOT doctorpokegogo's original
  // source for this species (listed there as "doctorpokegogo only") — two
  // genuinely independent sites converging, same bar Zap Cannon+ met. Part
  // of the original 13-species batch. VOLT_TACKLE is not in Mega Raichu X's
  // own moveset (Mega Raichu X's own debut was itself a
  // RELEASED_MEGA_PRIMAL_ALLOWLIST gap-fill case — see that table).
  // energyCost: [sourced, corrected 2026-09-09] db.pokemongohub.net/move/2002624,
  // fetched 2026-09-09 — "In Gym and Raid battles, it deals 170 damage and
  // it costs 100 energy." Independently re-verified directly for this
  // correction; see module doc comment. NOTE this is a genuine change, not
  // a coincidence: base VOLT_TACKLE's own real energyCost is 33 (see
  // data/raw/game_master.json) — proof this field is not simply inherited.
  {
    speciesId: "raichu-mega-x",
    baseMovementId: "VOLT_TACKLE",
    moveId: "VOLT_TACKLE_PLUS",
    moveName: "Volt Tackle+",
    power: 170,
    confidence: "cross-site",
    energyCost: 100,
  },
  // [cross-site, upgraded 2026-09-09] Originally community-estimate off
  // doctorpokegogo.com's own Level-1 raid-power table alone (self-labelled
  // an estimate). db.pokemongohub.net now independently states the same
  // figure ("Damage: 170"). Confirmed via the research memory's round-3
  // sourcing table that pokemongohub was NOT doctorpokegogo's original
  // source for this species (listed there as "doctorpokegogo only") — two
  // genuinely independent sites converging, same bar Zap Cannon+ met. Part
  // of the original 13-species batch. DRILL_PECK is not in Mega Skarmory's
  // own moveset.
  // energyCost: [sourced, corrected 2026-09-09] db.pokemongohub.net/move/2022700,
  // fetched 2026-09-09 — "In Gym and Raid battles, it deals 170 damage and
  // it costs 100 energy." Independently re-verified directly for this
  // correction; see module doc comment. NOTE this is a genuine change, not
  // a coincidence: base DRILL_PECK's own real energyCost is 33 (see
  // data/raw/game_master.json) — proof this field is not simply inherited.
  {
    speciesId: "skarmory-mega",
    baseMovementId: "DRILL_PECK",
    moveId: "DRILL_PECK_PLUS",
    moveName: "Drill Peck+",
    power: 170,
    confidence: "cross-site",
    energyCost: 100,
  },
  // [cross-site, upgraded 2026-09-09] Originally community-estimate off
  // doctorpokegogo.com's own Level-1 raid-power table alone (self-labelled
  // an estimate). db.pokemongohub.net now independently states the same
  // figure ("Damage: 185"). Confirmed via the research memory's round-3
  // sourcing table that pokemongohub was NOT doctorpokegogo's original
  // source for this species (listed there as "doctorpokegogo only") — two
  // genuinely independent sites converging, same bar Zap Cannon+ met. Part
  // of the original 13-species batch. OUTRAGE is not in Mega Dragonite's
  // own moveset.
  // energyCost: [sourced, corrected 2026-09-09] db.pokemongohub.net/move/2014900,
  // fetched 2026-09-09 — "In Gym and Raid battles, it deals 185 damage and
  // it costs 100 energy." Independently re-verified directly for this
  // correction; see module doc comment. NOTE this is a genuine change, not
  // a coincidence: base OUTRAGE's own real energyCost is 50 (see
  // data/raw/game_master.json) — proof this field is not simply inherited.
  {
    speciesId: "dragonite-mega",
    baseMovementId: "OUTRAGE",
    moveId: "OUTRAGE_PLUS",
    moveName: "Outrage+",
    power: 185,
    confidence: "cross-site",
    energyCost: 100,
  },
  // [cross-site, upgraded 2026-09-09] Originally community-estimate off
  // doctorpokegogo.com's own Level-1 raid-power table alone (self-labelled
  // an estimate; pokemongo.com/en/news/more-mega-updates-2026 announced
  // Mega Mewtwo X's ELIGIBILITY for the mechanic itself as [official] but
  // did not itself state a power number for this move — only the
  // eligibility is official-tier, never the number). db.pokemongohub.net
  // now independently states the same power figure ("Damage: 130").
  // Confirmed via the research memory's round-3 sourcing table that
  // pokemongohub was NOT doctorpokegogo's original source for this species
  // (listed there as "doctorpokegogo only") — two genuinely independent
  // sites converging, same bar Zap Cannon+ met. DYNAMIC_PUNCH is not in
  // Mega Mewtwo X's own moveset.
  // energyCost: [sourced, corrected 2026-09-09] db.pokemongohub.net/move/2015024,
  // fetched 2026-09-09 — "In Gym and Raid battles, it deals 130 damage and
  // it costs 100 energy." Independently re-verified directly for this
  // correction; see module doc comment. NOTE this is a genuine change, not
  // a coincidence: base DYNAMIC_PUNCH's own real energyCost is 50 (see
  // data/raw/game_master.json) — proof this field is not simply inherited.
  {
    speciesId: "mewtwo-mega-x",
    baseMovementId: "DYNAMIC_PUNCH",
    moveId: "DYNAMIC_PUNCH_PLUS",
    moveName: "Dynamic Punch+",
    power: 130,
    confidence: "cross-site",
    energyCost: 100,
  },
  // DELIBERATELY INERT as of this table's authoring (2026-09-09): Mega
  // Staraptor debuts 2026-09-19 (pokemongo.com/news/staraptor-super-mega-raid-day-2026;
  // rotomlabs.net/gonintendo.com/leekduck.com all independently agree on the
  // date) and is genuinely absent from data/normalized/species.json today —
  // "staraptor-mega" (megaSpeciesIdFor's naming convention for pokemon_name
  // "Staraptor" + mega_name "Mega Staraptor") matches NOTHING in
  // attachSuperMaxPlusMoves' species lookup until that debut actually syncs
  // in. Included now (rather than added later) so the move attaches
  // automatically the day the species appears, with zero further code
  // change required. attachSuperMaxPlusMoves is REQUIRED to skip an
  // unmatched speciesId silently (see its own doc comment and
  // test/superMaxPlusMoves.test.ts's "unknown species" case) — never throw,
  // never emit a partial move. [official]
  // pokemongo.com/news/staraptor-super-mega-raid-day-2026, fetched
  // 2026-09-09 — states Brave Bird+'s raid power directly.
  // energyCost: UNCONFIRMED — re-checked 2026-09-09 for this correction and
  // still not sourceable. Tried db.pokemongohub.net/move/2039800 (this
  // species+form's predicted URL, following the exact "2" + 4-digit dex
  // ("0398") + 2-digit form ("00", the code Beedrill/Houndoom/Chesnaught/
  // Skarmory/Dragonite all use as one-mega-form species) pattern that
  // correctly resolved all 8 live entries above) — it does not resolve to a
  // real move page. Separately checked Staraptor's own species page on the
  // same site: it lists base "Brave Bird" (linking to that move's own
  // ordinary page) with no mention of "Brave Bird+" anywhere. Both findings
  // are consistent with the page simply not existing yet because the
  // species hasn't debuted (2026-09-19) — NOT evidence the real value is
  // something other than 100. The `100` shipped below is therefore NOT
  // independently sourced like the other 8 entries above — it is retained
  // only because it happens to equal base BRAVE_BIRD's own already-confirmed
  // real energyCost (100, see data/raw/game_master.json), i.e. the same
  // coincidental-fallback reasoning this whole table used to rely on for
  // every entry before this correction. Re-check db.pokemongohub.net (or
  // another source) once Staraptor actually debuts and a real page might
  // exist — do not treat this number as confirmed until then.
  {
    speciesId: "staraptor-mega",
    baseMovementId: "BRAVE_BIRD",
    moveId: "BRAVE_BIRD_PLUS",
    moveName: "Brave Bird+",
    power: 150,
    confidence: "official",
    energyCost: 100,
  },
];

/**
 * Deliberately EXCLUDED from the table above — do not add these without new,
 * qualifying evidence (see each reason). Both categories were evaluated and
 * rejected during this table's authoring (2026-09-09), not simply
 * overlooked.
 *
 * - Mystical Fire+ (Mega Delphox), Surf+ (Mega Greninja), Brick Break+ (Mega
 *   Falinks), Liquidation+ (Mega Starmie), Acid Spray+ (Mega Victreebel),
 *   Psybeam+ (Mega Malamar): NO raid-context power reading exists for any of
 *   these from any source checked (official, cross-site, or single-site
 *   estimate) — every guide article that lists these 6 species by name
 *   explicitly declines to give a power number. PvP-context power/energy
 *   DOES exist for all 6 in PvPoke's own maintained dataset, but a PvP
 *   number is demonstrably not a raid number on the base moves underneath
 *   them — base Fell Stinger is PvE power 45/energy 33 vs PvP power
 *   40/energy 35; base Seed Bomb PvE power 55/energy 33 vs PvP power
 *   60/energy 40 (research memory's round-3 PvP/PvE mismatch finding).
 *   Using a PvP number here would silently launder a PvP-context figure as
 *   if it were this table's Base-Mega-Level RAID reading.
 * - Future Sight+ (Mega Mewtwo Y): a single power estimate (140) exists
 *   (dittobase.com only, self-labelled an estimate, and that site's own
 *   DEDICATED page for this specific move 404s — i.e. this number is a
 *   secondary listing, not even that site's own primary source for it).
 *   CORRECTION recorded here for anyone re-checking this exclusion later:
 *   the task brief that produced this table originally cited the exclusion
 *   reason as "FUTURE_SIGHT is absent from data/raw/game_master.json
 *   entirely" — that specific claim does NOT hold under direct
 *   verification. The real movementId has no underscore (`FUTURESIGHT`,
 *   confirmed present as of the 2026-09-09 dump with power 115/energyDelta
 *   -100/durationMs 2500) and resolves against the global move table
 *   exactly like the 8 included entries above. The exclusion is upheld
 *   anyway, but on the power-sourcing ground actually documented in the
 *   research memory (a single weakly-sourced estimate, weaker than even the
 *   "community-estimate" tier used for the entries above, each of which has
 *   at least one site's own dedicated, live page for that specific move) —
 *   not the movementId-availability ground the original brief stated, which
 *   was itself in error. A future pass revisiting this exclusion should
 *   re-verify the 140 figure's sourcing directly rather than leaning on
 *   movementId absence as a reason, since it isn't one.
 */

/**
 * Resolves ONE table entry into a real ChargedMove, or null if the base
 * move's global GAME_MASTER template can't be found (never expected — all 9
 * base movementIds were directly confirmed present in the committed dump at
 * authoring time — but GAME_MASTER is re-fetched live every run, so a silent
 * skip-and-report beats a crash if a future upstream change ever drops one).
 *
 * Exact pattern engine-developer verified end-to-end for Dark Pulse+/Fell
 * Stinger+ in packages/engine/test/megaLevel.test.ts: spread the BASE move's
 * real global template (type/duration/vulnerable-window unchanged), then
 * override id/name/power/energyCost/isPlusMove/plusMovePowerConfidence on
 * top. energyCost is an override now, same as power — CORRECTED 2026-09-09,
 * see module doc comment's "THREE FIELDS" section; it used to be carried
 * through from the base move's own template like duration still is.
 */
export function resolveSuperMaxPlusMove(
  entry: SuperMaxPlusMoveEntry,
  gameMasterMoveByMovementId: Map<string, GameMasterMoveRecord>,
): ChargedMove | null {
  const baseRecord = gameMasterMoveByMovementId.get(entry.baseMovementId);
  if (!baseRecord) return null;
  const base = fromGameMasterMove(toRawGameMasterMoveFromMoveSettings(entry.baseMovementId, baseRecord, false));
  return {
    ...base,
    id: entry.moveId,
    name: entry.moveName,
    power: entry.power,
    energyCost: entry.energyCost,
    isPlusMove: true,
    plusMovePowerConfidence: entry.confidence,
  };
}

/**
 * Attaches every resolvable SUPER_MAX_PLUS_MOVES entry onto its matching
 * species in `species` — mutates each matched SpeciesDefinition's
 * `chargedMoves` array in place by PUSHING the new move on (a genuinely
 * additional third charged move, never a replacement/reorder of the existing
 * two — see ChargedMove.isPlusMove's own doc comment in types.ts). Called
 * once from sync-data.ts's mega-species build path, right after
 * `megaSpecies` is fully built.
 *
 * MUST no-op cleanly (skip, never throw, never emit a partial move) for:
 * - An entry whose speciesId matches no species built this run (the Mega
 *   Staraptor case above, until it actually syncs in) — recorded in
 *   `skippedUnknownSpecies`, not thrown.
 * - An entry whose base move can't be resolved against the global GAME_MASTER
 *   move table (resolveSuperMaxPlusMove returning null) — recorded in
 *   `skippedMissingBaseMove`, not thrown.
 */
export function attachSuperMaxPlusMoves(
  species: SpeciesDefinition[],
  gameMasterMoveByMovementId: Map<string, GameMasterMoveRecord>,
): { attached: string[]; skippedUnknownSpecies: string[]; skippedMissingBaseMove: string[] } {
  const speciesById = new Map(species.map((s) => [s.id, s]));
  const attached: string[] = [];
  const skippedUnknownSpecies: string[] = [];
  const skippedMissingBaseMove: string[] = [];

  for (const entry of SUPER_MAX_PLUS_MOVES) {
    const target = speciesById.get(entry.speciesId);
    if (!target) {
      skippedUnknownSpecies.push(entry.speciesId);
      continue;
    }
    const move = resolveSuperMaxPlusMove(entry, gameMasterMoveByMovementId);
    if (!move) {
      skippedMissingBaseMove.push(`${entry.speciesId} (${entry.baseMovementId})`);
      continue;
    }
    target.chargedMoves.push(move);
    attached.push(`${target.name} (${move.name})`);
  }

  return { attached, skippedUnknownSpecies, skippedMissingBaseMove };
}
