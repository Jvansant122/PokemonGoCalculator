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
 * SACRED_FIRE_PLUS templates — see the "Deliberately EXCLUDED" block below
 * for why those two are cited only as a naming precedent, never candidates
 * for this table) — but each "+" move's underlying BASE move is a completely
 * ordinary, already-synced GLOBAL `moveSettings` template, so this table
 * supplies (id, name, power, confidence, energyCost) per species on top of
 * that base template's type/duration.
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
 *   section). RECONFIRMED AND EXTENDED 2026-09-10: a full 15-row "+" move
 *   table read directly off db.pokemongohub.net by the user (all 15
 *   currently-live "+" moves the site documents, i.e. this project's
 *   original 8 PLUS the 7 added below) matched this project's own committed
 *   GAME_MASTER duration for every one of the 15 corresponding base moves
 *   EXACTLY, zero exceptions — including the 7 moves added below on this
 *   same evidence, which had no duration reading of any kind before this
 *   date. Independent of, and consistent with, the 11-of-11 finding above.
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
 *   RECONFIRMED AND EXTENDED 2026-09-10: the same full 15-row table (see the
 *   duration paragraph above) reads 100 energy for literally every row,
 *   including the 7 moves added below (ACID_SPRAY_PLUS, BRICK_BREAK_PLUS,
 *   FUTURESIGHT_PLUS, LIQUIDATION_PLUS, MYSTICAL_FIRE_PLUS, PSYBEAM_PLUS,
 *   SURF_PLUS), whose own BASE moves' real energyDelta together span all
 *   three tiers of the game's PvE energy scale (ACID_SPRAY/PSYBEAM/SURF at
 *   50, BRICK_BREAK/LIQUIDATION/MYSTICAL_FIRE at 33, FUTURESIGHT at 100 —
 *   see data/raw/game_master.json). 15 real, differently-valued base-energy
 *   readings spanning all 3 real tiers, with every single corresponding "+"
 *   move still printing the identical 100, is a materially larger sample of
 *   the SAME argument above, not a new form of evidence — a template-default
 *   field could print a constant 100 across an arbitrarily large sample too;
 *   what actually rules the worry out is still that this same source
 *   separately reproduces base VOLT_TACKLE/ZAP_CANNON's own two DIFFERENT
 *   real values elsewhere on the site. "+" move energy cost is therefore
 *   treated as a settled, uniform 100 for every live entry in this table
 *   (15 of 15 as of 2026-09-10, up from 8 of 8), not merely a pattern that
 *   happened to hold for the first batch.
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
 * IMPORTANT — UPDATED 2026-09-10 for the 7 species added below: across all
 * 15 live entries, 9 of the 15 base moves are NOT in their own species' OWN
 * movepool (DARK_PULSE isn't on Mega Houndoom, SEED_BOMB isn't on Mega
 * Chesnaught, VOLT_TACKLE/ZAP_CANNON isn't on either Raichu mega, DRILL_PECK
 * isn't on Mega Skarmory, DYNAMIC_PUNCH isn't on Mega Mewtwo X, OUTRAGE isn't
 * on Mega Dragonite, FUTURESIGHT isn't on Mega Mewtwo Y, LIQUIDATION isn't on
 * Mega Starmie) — while the other 6 ARE already one of that species' own
 * moves (FELL_STINGER on Mega Beedrill, ACID_SPRAY on Mega Victreebel,
 * BRICK_BREAK on Mega Falinks, MYSTICAL_FIRE on Mega Delphox, PSYBEAM on Mega
 * Malamar, SURF on Mega Greninja — so this batch of 7 skews the OPPOSITE way
 * from the original 8, where only 1 of 8 base moves was already in its own
 * species' movepool). That's exactly why this resolves against the GLOBAL
 * `gameMasterMoveByMovementId` map (every `moveSettings` entry this sync
 * fetched), never a species' own already-resolved moveset, UNCONDITIONALLY —
 * the "+" move is genuinely new, additional content in every case, whether
 * or not the underlying base move happens to already be one of that
 * species' ordinary two.
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
   * comment for why). RECONFIRMED 2026-09-10 across the 7 entries added that
   * day on a full 15-row site read (see module doc comment's "THREE FIELDS"
   * section) — the evidence base for "uniform 100" now spans 15 independent
   * live entries and all three of the game's real PvE base-move energy
   * tiers, not just 8.
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
  // ---------------------------------------------------------------------
  // 2026-09-10 ADDITION: the 7 entries below (Acid Spray+, Brick Break+,
  // Future Sight+, Liquidation+, Mystical Fire+, Psybeam+, Surf+) resolve
  // ALL 7 of this table's previous exclusions — see the "Deliberately
  // EXCLUDED" block below, which now records why each exclusion was lifted
  // rather than the exclusion itself. Source: db.pokemongohub.net's own
  // charged-move pages, read directly by the user on 2026-09-09 and relayed
  // as a complete 15-row table (all 15 "+" moves the site currently
  // documents — this project's original 8 PLUS these 7 — the user states
  // this is the site's full list, so the absence of a 16th row for Mega
  // Staraptor's Brave Bird+ is itself meaningful: that species hasn't
  // debuted yet, consistent with the still-inert entry at the bottom of
  // this table).
  //
  // Unlike the original 8 (each independently re-fetched and re-read
  // per-URL on 2026-09-09), these 7 are sourced to ONE direct site read
  // covering all of them at once — a single source, not two
  // independently-run sites agreeing — so `confidence: "community-estimate"`
  // per PlusMovePowerConfidence's own definition
  // (packages/engine/src/types.ts): neither "official" (not a
  // pokemongo.com statement) nor "cross-site" (no second independent site
  // corroborates these 7 specifically) fits, and "community-estimate" is
  // what this project's own precedent (the Future Sight+ exclusion note,
  // pre-2026-09-10) already defines as "a single site's own dedicated page
  // for that specific move" — which this is: db.pokemongohub.net maintains
  // one dedicated page per move, matching the same per-move URL pattern
  // (`/move/2<4-digit dex><2-digit form>`) already confirmed live and
  // accurate for the original 8. Unlike a typical "community-estimate"
  // entry, this source states its numbers as plain fact rather than
  // self-labelling them an estimate — but with no second site to
  // corroborate against, "community-estimate" (single-site, no cross-site
  // corroboration) is still the honest tier of the union's three options;
  // do not read this note as license to upgrade these to "cross-site"
  // without an actual second independent site.
  //
  // energyCost 100 on every one of these 7 is cross-checked against this
  // project's own committed data/raw/game_master.json the same way the
  // original 8 were: durationMs matches the base move's own real
  // GAME_MASTER duration exactly for all 7 (part of the 15/15 finding in
  // the module doc comment's "THREE FIELDS" section), and each base move's
  // own real energyDelta (see per-entry note below) differs from the
  // printed 100 in every case except FUTURESIGHT — the same "site
  // reproduces real, different numbers elsewhere, so its constant '+'
  // reading isn't a template artifact" argument the module doc comment
  // already makes for the original 8.
  // ---------------------------------------------------------------------
  // [community-estimate] db.pokemongohub.net, per the 2026-09-10 batch note
  // above. ACID_SPRAY IS already one of Mega Victreebel's own moves (like
  // Fell Stinger/Beedrill above — see the module doc comment's IMPORTANT
  // paragraph) but is still resolved from the global move table here for a
  // uniform code path; the values are identical either way. Base ACID_SPRAY
  // energyDelta is -50 (see data/raw/game_master.json), confirming the
  // printed 100 is not simply inherited.
  {
    speciesId: "victreebel-mega",
    baseMovementId: "ACID_SPRAY",
    moveId: "ACID_SPRAY_PLUS",
    moveName: "Acid Spray+",
    power: 160,
    confidence: "community-estimate",
    energyCost: 100,
  },
  // [community-estimate] db.pokemongohub.net, per the 2026-09-10 batch note
  // above. BRICK_BREAK IS already one of Mega Falinks' own moves (like Fell
  // Stinger/Beedrill). Base BRICK_BREAK energyDelta is -33 (see
  // data/raw/game_master.json), confirming the printed 100 is not simply
  // inherited.
  {
    speciesId: "falinks-mega",
    baseMovementId: "BRICK_BREAK",
    moveId: "BRICK_BREAK_PLUS",
    moveName: "Brick Break+",
    power: 150,
    confidence: "community-estimate",
    energyCost: 100,
  },
  // [community-estimate] db.pokemongohub.net, per the 2026-09-10 batch note
  // above. Resolves this table's own previously-documented Future Sight+
  // exclusion (see the "Deliberately EXCLUDED" block below for the full
  // history, including the earlier FUTURE_SIGHT-vs-FUTURESIGHT movementId
  // correction). The real movementId has NO underscore — `FUTURESIGHT`,
  // confirmed present in data/raw/game_master.json at power 115/energyDelta
  // -100/durationMs 2500 — so moveId below matches that spelling
  // (FUTURESIGHT_PLUS), not FUTURE_SIGHT_PLUS. FUTURESIGHT is NOT in Mega
  // Mewtwo Y's own moveset. Base FUTURESIGHT energyDelta happens to already
  // be -100 — the one base move in this batch of 7 whose own real energy
  // coincidentally matches the printed "+" value — see the module doc
  // comment's energy section for why this single coincidence doesn't
  // undermine the other 14 entries' independent confirmation.
  {
    speciesId: "mewtwo-mega-y",
    baseMovementId: "FUTURESIGHT",
    moveId: "FUTURESIGHT_PLUS",
    moveName: "Future Sight+",
    power: 140,
    confidence: "community-estimate",
    energyCost: 100,
  },
  // [community-estimate] db.pokemongohub.net, per the 2026-09-10 batch note
  // above. LIQUIDATION is NOT in Mega Starmie's own moveset. Note Mega
  // Starmie's OWN moveset does already include base PSYBEAM and base SURF —
  // but Psybeam+/Surf+ attach to Mega Malamar/Mega Greninja respectively
  // (see their own entries below), NOT to Starmie, which knows neither; only
  // Liquidation+ attaches here. Base LIQUIDATION energyDelta is -33 (see
  // data/raw/game_master.json), confirming the printed 100 is not simply
  // inherited.
  {
    speciesId: "starmie-mega",
    baseMovementId: "LIQUIDATION",
    moveId: "LIQUIDATION_PLUS",
    moveName: "Liquidation+",
    power: 180,
    confidence: "community-estimate",
    energyCost: 100,
  },
  // [community-estimate] db.pokemongohub.net, per the 2026-09-10 batch note
  // above. MYSTICAL_FIRE IS already one of Mega Delphox's own moves (like
  // Fell Stinger/Beedrill). Base MYSTICAL_FIRE energyDelta is -33 (see
  // data/raw/game_master.json), confirming the printed 100 is not simply
  // inherited.
  {
    speciesId: "delphox-mega",
    baseMovementId: "MYSTICAL_FIRE",
    moveId: "MYSTICAL_FIRE_PLUS",
    moveName: "Mystical Fire+",
    power: 140,
    confidence: "community-estimate",
    energyCost: 100,
  },
  // [community-estimate] db.pokemongohub.net, per the 2026-09-10 batch note
  // above. PSYBEAM IS already one of Mega Malamar's own moves (like Fell
  // Stinger/Beedrill) — note Mega Starmie ALSO knows base Psybeam but is not
  // eligible for Psybeam+ (see Liquidation+/Starmie's own entry above); only
  // Malamar gets this move. Base PSYBEAM energyDelta is -50 (see
  // data/raw/game_master.json), confirming the printed 100 is not simply
  // inherited.
  {
    speciesId: "malamar-mega",
    baseMovementId: "PSYBEAM",
    moveId: "PSYBEAM_PLUS",
    moveName: "Psybeam+",
    power: 170,
    confidence: "community-estimate",
    energyCost: 100,
  },
  // [community-estimate] db.pokemongohub.net, per the 2026-09-10 batch note
  // above. SURF IS already one of Mega Greninja's own moves (like Fell
  // Stinger/Beedrill) — note Mega Starmie ALSO knows base Surf but is not
  // eligible for Surf+ (see Liquidation+/Starmie's own entry above); only
  // Greninja gets this move. Base SURF energyDelta is -50 (see
  // data/raw/game_master.json), confirming the printed 100 is not simply
  // inherited.
  {
    speciesId: "greninja-mega",
    baseMovementId: "SURF",
    moveId: "SURF_PLUS",
    moveName: "Surf+",
    power: 130,
    confidence: "community-estimate",
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
  // 2026-09-09 — states Brave Bird+'s raid power directly. STILL ABSENT from
  // db.pokemongohub.net's 15-row "+" move table as read by the user on
  // 2026-09-09 (see the "2026-09-10 ADDITION" note above) — expected and NOT
  // a concern, consistent with the species not having debuted yet; re-check
  // that table once Staraptor actually debuts.
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
  // independently sourced like the other 15 entries above — it is retained
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
 * RESOLVED 2026-09-10 — this block used to document 7 live exclusions; all 7
 * are now added to the table above. Kept (not deleted) as a record of why
 * they were excluded for one day (2026-09-09 to 2026-09-10) and exactly what
 * new evidence lifted each exclusion, plus one PERMANENT exclusion that is
 * NOT a "+" move at all and must never be added (see the bottom of this
 * comment).
 *
 * - Mystical Fire+ (Mega Delphox), Surf+ (Mega Greninja), Brick Break+ (Mega
 *   Falinks), Liquidation+ (Mega Starmie), Acid Spray+ (Mega Victreebel),
 *   Psybeam+ (Mega Malamar): excluded on 2026-09-09 because no raid-context
 *   power reading existed from any source checked that day (official,
 *   cross-site, or single-site estimate) — every guide article that listed
 *   these 6 species by name explicitly declined to give a power number.
 *   RESOLVED 2026-09-10: the user read db.pokemongohub.net's own
 *   charged-move pages directly and relayed a complete 15-row table
 *   including all 6 of these, each with its own power/energy/duration
 *   reading — see the "2026-09-10 ADDITION" comment above the 7 new entries
 *   in the table above for the full sourcing and confidence-tier reasoning.
 *   The PvP-vs-PvE power mismatch warning that used to sit here is still a
 *   GOOD RULE in general — base Fell Stinger is PvE power 45/energy 33 vs
 *   PvP power 40/energy 35; base Seed Bomb PvE power 55/energy 33 vs PvP
 *   power 60/energy 40 (research memory's round-3 PvP/PvE mismatch finding)
 *   — but it does NOT apply to these 6 specifically: the 2026-09-10 figures
 *   are raid-context numbers off db.pokemongohub.net's own raid-context "+"
 *   move pages (the same "In Gym and Raid battles, it deals N damage"
 *   phrasing already confirmed for the original 8 — see the module doc
 *   comment's energy section), not PvPoke PvP figures. Keep the underlying
 *   rule in mind for any FUTURE "+" move added to this table on new
 *   evidence: always confirm a candidate source is quoting a raid/gym
 *   context, never a PvP one, before trusting its power number here.
 * - Future Sight+ (Mega Mewtwo Y): excluded on 2026-09-09 because the only
 *   power estimate available that day (140, dittobase.com only,
 *   self-labelled an estimate, and that site's own DEDICATED page for this
 *   specific move 404s — i.e. that number was a secondary listing, not even
 *   dittobase's own primary source for it) fell below this table's own
 *   evidentiary bar. RESOLVED 2026-09-10 on the same db.pokemongohub.net
 *   full-table read as the 6 entries above — coincidentally the same power
 *   figure (140) dittobase's weaker listing had also shown, now on
 *   materially better sourcing (one site's own dedicated page, not a
 *   secondary listing on a page whose own primary one 404s).
 *   The movementId correction recorded here on 2026-09-09 remains accurate
 *   and is still worth keeping: the real movementId has no underscore
 *   (`FUTURESIGHT`, confirmed present at power 115/energyDelta
 *   -100/durationMs 2500) — the table above spells the "+" move's own id to
 *   match (`FUTURESIGHT_PLUS`), not `FUTURE_SIGHT_PLUS`.
 *
 * PERMANENTLY EXCLUDED, not a resolvable gap — Aeroblast+/Aeroblast++
 * (Lugia) and Sacred Fire+/Sacred Fire++ (Ho-Oh): these are Apex Lugia/Ho-Oh
 * moves, a COMPLETELY DIFFERENT mechanic from the Super Max "+" mechanic
 * this table models, and must NEVER be added here even though a future
 * GAME_MASTER sync might surface their real AEROBLAST_PLUS/SACRED_FIRE_PLUS
 * templates (see the module doc comment's second paragraph, which already
 * cites these two as the pre-existing real `_PLUS`-suffixed templates found
 * during the original grep for this feature). They are cited elsewhere in
 * this file ONLY as the precedent for Niantic's own `_PLUS` naming
 * convention — that citation is about the NAMING PATTERN, not a claim that
 * either move belongs in this table. Apex forms are not Mega/Primal forms
 * (`SpeciesDefinition.boost` semantics don't apply to them the same way),
 * they are not reachable through this project's mega/primal pipeline at
 * all, and "++" is a second escalation tier Super Max "+" has no equivalent
 * of. If a future pass ever finds AEROBLAST_PLUS/SACRED_FIRE_PLUS while
 * extending this table, that is a sign to build a SEPARATE table (or extend
 * SpeciesDefinition for Apex forms generally — an engine-developer schema
 * decision, not a data-sync one), not to add a row here.
 */

/**
 * Resolves ONE table entry into a real ChargedMove, or null if the base
 * move's global GAME_MASTER template can't be found (never expected — all 16
 * base movementIds (15 live + Mega Staraptor's still-inert BRAVE_BIRD) were
 * directly confirmed present in the committed dump at authoring time — but
 * GAME_MASTER is re-fetched live every run, so a silent skip-and-report
 * beats a crash if a future upstream change ever drops one).
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
