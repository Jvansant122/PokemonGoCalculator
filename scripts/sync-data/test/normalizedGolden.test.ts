/**
 * Golden/sentinel test over the COMMITTED data/normalized/*.json output (not
 * a live sync — this task deliberately never runs `npm run sync-data`).
 *
 * Purpose: sync-data.ts's own transform is exercised end-to-end by
 * packages/engine's `fromGameMaster`/`fromGameMasterMove` unit tests, but
 * nothing previously asserted that the COMMITTED, checked-in normalized
 * output itself still holds specific, independently-known-correct values.
 * If a future sync run regresses a field (a GAME_MASTER matching bug, a
 * fallback path firing when it shouldn't, etc.), this test fails locally
 * with a concrete wrong-vs-expected number instead of the regression only
 * being noticed as a wrong number in the species picker or a raid sim.
 *
 * Sentinel values below are cited to their real-world source (Niantic's own
 * published Pokémon GO base stats/typing/costs, as mirrored by GAME_MASTER
 * and cross-checked by community references) — NOT re-derived from the
 * pipeline itself, so this test has independent teeth. A couple of sentinels
 * (Shadow Abra's stats, the Shadow Thundurus (Incarnate) active-raid row)
 * assert an internal pipeline INVARIANT instead (raw-copy, id-resolution)
 * rather than an external fact, and are labeled as such.
 *
 * Run via `npm run test:scripts` (scripts/vitest.config.ts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const NORMALIZED_DIR = join(REPO_ROOT, "data", "normalized");

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(NORMALIZED_DIR, filename), "utf-8")) as T;
}

interface NormalizedMove {
  id: string;
  name: string;
  type: string;
  power: number;
  durationSeconds: number;
  energyGain?: number;
  energyCost?: number;
  isPlusMove?: boolean;
  plusMovePowerConfidence?: string;
}

interface NormalizedSpecies {
  id: string;
  name: string;
  types: string[];
  baseAttack: number;
  baseDefense: number;
  baseStamina: number;
  fastMoves: NormalizedMove[];
  chargedMoves: NormalizedMove[];
  boost?: { multiplier: number; boostedType: string };
  isShadow?: boolean;
  rarity?: string;
  lastKnownRaidTier?: string;
  kmBuddyDistance?: number;
}

interface ActiveRaidEntry {
  raidName: string;
  tier: string;
  speciesId: string | null;
  isApproximate: boolean;
}

interface RaidHistoryEntry {
  speciesId: string;
  raidName: string;
  tier: string;
  source: string;
  eraHp?: number;
}

interface PowerUpCosts {
  maxLevel: number;
  shadowStardustMultiplier: number;
  shadowCandyMultiplier: number;
  purifiedStardustMultiplier: number;
  purifiedCandyMultiplier: number;
  steps: { fromLevel: number; stardust: number; candy: number; xlCandy: number }[];
}

const species: NormalizedSpecies[] = loadJson<NormalizedSpecies[]>("species.json");
const speciesById = new Map(species.map((s) => [s.id, s]));
const activeRaids: ActiveRaidEntry[] = loadJson<ActiveRaidEntry[]>("activeRaids.json");
const raidHistory: RaidHistoryEntry[] = loadJson<RaidHistoryEntry[]>("raidHistory.json");
const powerUpCosts: PowerUpCosts = loadJson<PowerUpCosts>("powerUpCosts.json");

function findStep(fromLevel: number) {
  return powerUpCosts.steps.find((s) => s.fromLevel === fromLevel);
}

describe("species.json sentinels", () => {
  // Real, published Pokémon GO base stats/typing for Bulbasaur — a plain,
  // unremarkable species with no mega/shadow/regional wrinkle at all.
  // [Niantic GAME_MASTER, mirrored consistently by every community stats
  // reference, e.g. GamePress/Pokebattler's Bulbasaur pages.]
  it("Bulbasaur: a plain species (grass/poison, 118/111/128)", () => {
    const s = speciesById.get("bulbasaur")!;
    expect(s).toBeDefined();
    expect(s.types).toEqual(["grass", "poison"]);
    expect(s.baseAttack).toBe(118);
    expect(s.baseDefense).toBe(111);
    expect(s.baseStamina).toBe(128);
  });

  // Alolan Vulpix: a regional form that differs from base Vulpix ONLY by
  // type (fire -> ice), same base stat line — exactly the "form qualifies by
  // stats OR types" case CLAUDE.md's standing decisions calls out by name.
  // [Real Pokémon GO base stats, e.g. GamePress "Alolan Vulpix" page.]
  it("Vulpix (Alola): a regional form differing from base Vulpix by type only", () => {
    const base = speciesById.get("vulpix")!;
    const alolan = speciesById.get("vulpix-alola")!;
    expect(alolan).toBeDefined();
    expect(alolan.types).toEqual(["ice"]);
    expect(base.types).toEqual(["fire"]);
    expect(alolan.baseAttack).toBe(base.baseAttack);
    expect(alolan.baseDefense).toBe(base.baseDefense);
    expect(alolan.baseStamina).toBe(base.baseStamina);
  });

  // Sandslash (Alola): a regional form differing from base Sandslash by
  // BOTH type (ground -> ice/steel) AND base stats — the compound-form
  // sibling of the "Shadow Alolan Sandslash" activeRaids sentinel below.
  // [Real Pokémon GO base stats, e.g. GamePress "Alolan Sandslash" page.]
  it("Sandslash (Alola): a regional form differing from base Sandslash by type AND stats (ice/steel, 177/195/181)", () => {
    const base = speciesById.get("sandslash")!;
    const alolan = speciesById.get("sandslash-alola")!;
    expect(base.types).toEqual(["ground"]);
    expect(alolan).toBeDefined();
    expect(alolan.types).toEqual(["ice", "steel"]);
    expect(alolan.baseAttack).toBe(177);
    expect(alolan.baseDefense).toBe(195);
    expect(alolan.baseStamina).toBe(181);
  });

  // Mega Charizard X: real, published mega stats/typing, boost 1.3 — the
  // load-bearing constant per CLAUDE.md ("a real conclusion in this project
  // flips at 1.1"). [Niantic GAME_MASTER tempEvoOverrides, cross-checked by
  // Bulbapedia's Mega Charizard X (GO) page.]
  it("Mega Charizard X: fire/dragon, 273/213/186, boost exactly 1.3 fire", () => {
    const s = speciesById.get("charizard-mega-x")!;
    expect(s).toBeDefined();
    expect(s.types).toEqual(["fire", "dragon"]);
    expect(s.baseAttack).toBe(273);
    expect(s.baseDefense).toBe(213);
    expect(s.baseStamina).toBe(186);
    expect(s.boost).toEqual({ multiplier: 1.3, boostedType: "fire" });
  });

  // Primal Kyogre: real, published primal stats, LEGENDARY rarity, boost 1.3
  // water. [Niantic GAME_MASTER tempEvoOverrides, cross-checked by
  // Bulbapedia's Primal Kyogre (GO) page.]
  it("Primal Kyogre: water, 353/268/218, LEGENDARY, boost exactly 1.3 water", () => {
    const s = speciesById.get("kyogre-primal")!;
    expect(s).toBeDefined();
    expect(s.types).toEqual(["water"]);
    expect(s.baseAttack).toBe(353);
    expect(s.baseDefense).toBe(268);
    expect(s.baseStamina).toBe(218);
    expect(s.rarity).toBe("LEGENDARY");
    expect(s.boost).toEqual({ multiplier: 1.3, boostedType: "water" });
  });

  // Mega Skarmory: the species CLAUDE.md names as proof the live-raid-only
  // gate is real, not hypothetical — carried by RELEASED_MEGA_PRIMAL_ALLOWLIST
  // with a researched lastKnownRaidTier. [pokemongohub.net raid guide +
  // Dittobase, per the allowlist's own citation.]
  it("Mega Skarmory: steel/flying, 273/228/163, boost 1.3 steel, lastKnownRaidTier Mega Raids", () => {
    const s = speciesById.get("skarmory-mega")!;
    expect(s).toBeDefined();
    expect(s.types).toEqual(["steel", "flying"]);
    expect(s.baseAttack).toBe(273);
    expect(s.baseDefense).toBe(228);
    expect(s.baseStamina).toBe(163);
    expect(s.boost).toEqual({ multiplier: 1.3, boostedType: "steel" });
    expect(s.lastKnownRaidTier).toBe("Mega Raids");
  });

  // Mega Raichu X: the RELEASED_MEGA_PRIMAL_ALLOWLIST species this whole
  // gap-fill mechanism was built for (2026-07-18 Super Mega Raid Day debut).
  // [Serebii.net Mega Evolution list + poketory.com/PvPoke gamemaster.json,
  // per the allowlist's own citation.]
  it("Mega Raichu X: pure electric, 277/203/155, lastKnownRaidTier Super Mega Raids", () => {
    const s = speciesById.get("raichu-mega-x")!;
    expect(s).toBeDefined();
    expect(s.types).toEqual(["electric"]);
    expect(s.baseAttack).toBe(277);
    expect(s.baseDefense).toBe(203);
    expect(s.baseStamina).toBe(155);
    expect(s.lastKnownRaidTier).toBe("Super Mega Raids");
  });

  // Shadow Abra: an INTERNAL INVARIANT, not an external fact — shadowVariant.ts's
  // getOrCreateShadowVariant must copy base stats RAW/unmultiplied (the engine
  // applies SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER at
  // effective-stat time; pre-multiplying here would double-apply).
  it("Shadow Abra: stats equal base Abra's exactly (raw, un-multiplied copy)", () => {
    const base = speciesById.get("abra")!;
    const shadow = speciesById.get("abra-shadow")!;
    expect(shadow).toBeDefined();
    expect(shadow.isShadow).toBe(true);
    expect(shadow.boost).toBeUndefined();
    expect(shadow.baseAttack).toBe(base.baseAttack);
    expect(shadow.baseDefense).toBe(base.baseDefense);
    expect(shadow.baseStamina).toBe(base.baseStamina);
  });

  // Two moves, spot-checked against real Pokémon GO PvE move data.
  // [Niantic GAME_MASTER moveSettings, e.g. GamePress move lists.]
  it("Vine Whip (fast, on Bulbasaur): power 6, duration 0.5s", () => {
    const move = speciesById.get("bulbasaur")!.fastMoves.find((m) => m.id === "VINE_WHIP_FAST");
    expect(move).toBeDefined();
    expect(move!.power).toBe(6);
    expect(move!.durationSeconds).toBe(0.5);
  });

  it("Hydro Pump (charged, on Primal Kyogre): power 135, energyCost 100, duration 3.5s", () => {
    const move = speciesById.get("kyogre-primal")!.chargedMoves.find((m) => m.id === "HYDRO_PUMP");
    expect(move).toBeDefined();
    expect(move!.power).toBe(135);
    expect(move!.energyCost).toBe(100);
    expect(move!.durationSeconds).toBe(3.5);
  });

  // Super Max "+" charged moves (2026-09-09, scripts/sync-data/superMaxPlusMoves.ts)
  // — a genuinely ADDITIONAL third charged move, pinned here at value level
  // per the task's own instruction, so a future sync silently dropping or
  // altering either of the two OFFICIAL-tier entries fails loudly. Built
  // from their base move's real GAME_MASTER template (duration/type carried
  // through unchanged, [well-evidenced] per that module's doc comment) with
  // power/energyCost/id/name/isPlusMove/plusMovePowerConfidence overridden.
  // energyCost CORRECTED 2026-09-09: was inherited from the base move
  // (Dark Pulse 50 / Fell Stinger 33), now db.pokemongohub.net-sourced 100
  // for both, per that module's doc comment — every "+" move costs 100
  // energy in raids regardless of its base move's own cost.
  it('Mega Houndoom carries Dark Pulse+ as a genuinely additional 3rd charged move: dark, power 150, energyCost 100, duration 3s, "official"', () => {
    const s = speciesById.get("houndoom-mega")!;
    expect(s).toBeDefined();
    expect(s.chargedMoves.length).toBeGreaterThanOrEqual(3);
    const move = s.chargedMoves.find((m) => m.id === "DARK_PULSE_PLUS");
    expect(move).toBeDefined();
    expect(move!.name).toBe("Dark Pulse+");
    expect(move!.type).toBe("dark");
    expect(move!.power).toBe(150);
    expect(move!.energyCost).toBe(100);
    expect(move!.durationSeconds).toBe(3);
    expect(move!.isPlusMove).toBe(true);
    expect(move!.plusMovePowerConfidence).toBe("official");
  });

  it('Mega Beedrill carries Fell Stinger+ as a genuinely additional 3rd charged move: bug, power 140, energyCost 100, duration 2s, "official"', () => {
    const s = speciesById.get("beedrill-mega")!;
    expect(s).toBeDefined();
    expect(s.chargedMoves.length).toBeGreaterThanOrEqual(3);
    const move = s.chargedMoves.find((m) => m.id === "FELL_STINGER_PLUS");
    expect(move).toBeDefined();
    expect(move!.name).toBe("Fell Stinger+");
    expect(move!.type).toBe("bug");
    expect(move!.power).toBe(140);
    expect(move!.energyCost).toBe(100);
    expect(move!.durationSeconds).toBe(2);
    expect(move!.isPlusMove).toBe(true);
    expect(move!.plusMovePowerConfidence).toBe("official");
  });

  // 2026-09-10 ADDITION: 7 more "+" moves resolved on a full 15-row
  // db.pokemongohub.net table read directly by the user, lifting this
  // table's previous 7 exclusions (see superMaxPlusMoves.ts's "Deliberately
  // EXCLUDED" block, repurposed 2026-09-10 into a resolution record). These
  // 2 pins sample the batch: one species whose base move was ALREADY in its
  // own moveset (Acid Spray/Victreebel, same pattern as Fell Stinger/Beedrill
  // above) and one that resolves the earlier FUTURE_SIGHT-vs-FUTURESIGHT
  // movementId correction (Future Sight+/Mewtwo Y). Both at
  // "community-estimate" confidence — single-site (db.pokemongohub.net),
  // no cross-site corroboration — per PlusMovePowerConfidence's own
  // definition.
  it('Mega Victreebel carries Acid Spray+ as a genuinely additional charged move: poison, power 160, energyCost 100, duration 3s, "community-estimate"', () => {
    const s = speciesById.get("victreebel-mega")!;
    expect(s).toBeDefined();
    expect(s.chargedMoves.length).toBeGreaterThanOrEqual(3);
    const move = s.chargedMoves.find((m) => m.id === "ACID_SPRAY_PLUS");
    expect(move).toBeDefined();
    expect(move!.name).toBe("Acid Spray+");
    expect(move!.type).toBe("poison");
    expect(move!.power).toBe(160);
    expect(move!.energyCost).toBe(100);
    expect(move!.durationSeconds).toBe(3);
    expect(move!.isPlusMove).toBe(true);
    expect(move!.plusMovePowerConfidence).toBe("community-estimate");
  });

  it('Mega Mewtwo Y carries Future Sight+ as a genuinely additional charged move: psychic, power 140, energyCost 100, duration 2.5s, "community-estimate"', () => {
    const s = speciesById.get("mewtwo-mega-y")!;
    expect(s).toBeDefined();
    expect(s.chargedMoves.length).toBeGreaterThanOrEqual(3);
    const move = s.chargedMoves.find((m) => m.id === "FUTURESIGHT_PLUS");
    expect(move).toBeDefined();
    expect(move!.name).toBe("Future Sight+");
    expect(move!.type).toBe("psychic");
    expect(move!.power).toBe(140);
    expect(move!.energyCost).toBe(100);
    expect(move!.durationSeconds).toBe(2.5);
    expect(move!.isPlusMove).toBe(true);
    expect(move!.plusMovePowerConfidence).toBe("community-estimate");
  });

  it("Mega Staraptor's Brave Bird+ entry stays inert until the species itself syncs in (not present in species.json today)", () => {
    expect(speciesById.get("staraptor-mega")).toBeUndefined();
  });

  // 2026-09-10 fix for MECHANICS.md's "Form-change `moveReassignment` grants
  // moves that appear in no movepool array" — Kyurem (Black)'s real
  // signature move was previously entirely absent from species.json (only
  // reachable via pokemonSettings.formChange[].moveReassignment, which this
  // pipeline discarded at fetch time). The fusion direction is one-way (no
  // `existingMoves` key on the granting formChange entry at all), the case
  // this sentinel specifically covers. [Niantic GAME_MASTER moveSettings
  // V0466_MOVE_FREEZE_SHOCK, direct 2026-09-10 fetch.]
  it("Kyurem (Black) carries its real signature move Freeze Shock: ice, power 160, energyCost 100, duration 1.5s", () => {
    const s = speciesById.get("kyurem-black")!;
    expect(s).toBeDefined();
    const move = s.chargedMoves.find((m) => m.id === "FREEZE_SHOCK");
    expect(move).toBeDefined();
    expect(move!.type).toBe("ice");
    expect(move!.power).toBe(160);
    expect(move!.energyCost).toBe(100);
    expect(move!.durationSeconds).toBe(1.5);
  });

  // Zacian (Crowned Sword): the form-change grant declared from BOTH
  // directions (Hero->Crowned's replacementMoves AND Crowned->Hero's
  // existingMoves independently assert the same fact) — see MECHANICS.md.
  // ALSO the id-stability sentinel for the companion display-name fix: the
  // id must stay the untouched, underscore-carrying
  // "zacian-crowned_sword" (species ids are embedded in every shared
  // scenario URL and must never change), while `.name` is now cleaned to
  // natural spacing instead of carrying the raw "Crowned_sword" form
  // straight through. [Niantic GAME_MASTER moveSettings
  // V0469_MOVE_BEHEMOTH_BLADE, direct 2026-09-10 fetch.]
  it("Zacian (Crowned Sword): id stays zacian-crowned_sword, name is cleaned (no underscore), and it carries Behemoth Blade (steel, power 200, energyCost 100, duration 3.5s)", () => {
    const s = speciesById.get("zacian-crowned_sword")!;
    expect(s).toBeDefined();
    expect(s.id).toBe("zacian-crowned_sword");
    expect(s.name).toBe("Zacian (Crowned Sword)");
    const move = s.chargedMoves.find((m) => m.id === "BEHEMOTH_BLADE");
    expect(move).toBeDefined();
    expect(move!.type).toBe("steel");
    expect(move!.power).toBe(200);
    expect(move!.energyCost).toBe(100);
    expect(move!.durationSeconds).toBe(3.5);
  });

  // 2026-09-10 fix, pure display-name half (no signature-move angle) — a
  // second, independent id-stability + clean-name sentinel so this isn't
  // resting entirely on the Zacian case above. Real Pokémon GO form name is
  // "West Sea" (Bulbapedia, GAME_MASTER's own form key "SHELLOS_WEST_SEA").
  it("Shellos (West Sea): id stays shellos-west_sea, name is cleaned to natural spacing", () => {
    const s = speciesById.get("shellos-west_sea")!;
    expect(s).toBeDefined();
    expect(s.id).toBe("shellos-west_sea");
    expect(s.name).toBe("Shellos (West Sea)");
  });

  // kmBuddyDistance (2026-09-10) — GAME_MASTER's own first-party buddy-
  // walking-distance tiering key behind MECHANICS.md's "Second charged move
  // unlock" cost table (see setKmBuddyDistance's doc comment in
  // scripts/sync-data.ts). Magikarp/Gyarados at the fastest real-world 1km
  // buddy tier, Zacian's two real forms both at the slowest 20km tier (same
  // value across both forms of one pokemonId, confirmed directly against a
  // live 2026-09-10 GAME_MASTER fetch).
  it("Magikarp and Gyarados: both 1km buddy distance (fastest real tier)", () => {
    expect(speciesById.get("magikarp")!.kmBuddyDistance).toBe(1);
    expect(speciesById.get("gyarados")!.kmBuddyDistance).toBe(1);
  });

  it("Zacian (Hero) and Zacian (Crowned Sword): both 20km buddy distance (uniform across forms of one pokemonId)", () => {
    expect(speciesById.get("zacian-hero")!.kmBuddyDistance).toBe(20);
    expect(speciesById.get("zacian-crowned_sword")!.kmBuddyDistance).toBe(20);
  });

  // The one confirmed per-family DISAGREEMENT case: Qwilfish (3km) evolves
  // into Overqwil (5km) — candy is pooled across the family (MECHANICS.md)
  // but kmBuddyDistance is keyed to the pokemonId enum (evolutionary stage),
  // not the family, so a family-keyed cost lookup would be wrong here.
  it("Qwilfish (3km) and its evolution Overqwil (5km) disagree — kmBuddyDistance is per-species, not per-candy-family", () => {
    expect(speciesById.get("qwilfish")!.kmBuddyDistance).toBe(3);
    expect(speciesById.get("overqwil")!.kmBuddyDistance).toBe(5);
  });

  // Mega Charizard X never gets its own kmBuddyDistance — mega/primal
  // species are built directly from tempEvoOverrides, not through either of
  // the two GAME_MASTER-matched build loops that set it (same population as
  // candyFamilyId/dexNumber/isFullyEvolved — see CLAUDE.md's Phase 0 note).
  // `undefined` here must stay distinguishable from a real 0km value.
  it("Mega Charizard X: kmBuddyDistance is undefined (mega/primal species never get one)", () => {
    expect(speciesById.get("charizard-mega-x")!.kmBuddyDistance).toBeUndefined();
  });
});

describe("activeRaids.json / raidHistory.json sentinels", () => {
  // A currently-active raid boss row with a parenthetical-form + Shadow
  // species — exercises both the "Shadow " prefix handling and the
  // multi-word qualified-name lookup in the same row.
  //
  // Updated 2026-09-09 (raid rotation): the previous sentinel here, "Shadow
  // Giratina (Altered)", rotated OUT of the live ScrapedDuck feed this run
  // (replaced by Shadow Thundurus (Incarnate) at the same 5-Star tier) — a
  // real rotation, not a pipeline regression; Shadow Giratina (Altered)
  // still exists as a raidHistory.json row (accumulate-only, see the
  // raidHistory-focused sentinels below), just no longer in activeRaids.json.
  it("Shadow Thundurus (Incarnate) is an active 5-Star raid boss, resolved (not approximate)", () => {
    const row = activeRaids.find((r) => r.raidName === "Shadow Thundurus (Incarnate)");
    expect(row).toBeDefined();
    expect(row!.tier).toBe("5-Star Raids");
    expect(row!.speciesId).toBe("thundurus-incarnate-shadow");
    expect(row!.isApproximate).toBe(false);
  });

  // 2026-09-09 fix: "Shadow " + a regional adjective composed in ONE raid
  // name ("Shadow Alolan Sandslash") used to resolve to speciesId: null —
  // the matcher stripped "Shadow " first, then tried "shadow|alolan
  // sandslash" against a registry that only ever holds "alolan|sandslash",
  // and separately tried an exact-name match on "Alolan Sandslash" against
  // a species actually named "Sandslash (Alola)". Both failed silently.
  // Pins that it now resolves to the Alolan form's OWN Shadow variant (ice/
  // steel typing/stats), never base Sandslash's (ground) or null.
  it("Shadow Alolan Sandslash is an active 3-Star boss resolved to sandslash-alola-shadow, not approximate", () => {
    const row = activeRaids.find((r) => r.raidName === "Shadow Alolan Sandslash");
    expect(row).toBeDefined();
    expect(row!.tier).toBe("3-Star Raids");
    expect(row!.speciesId).toBe("sandslash-alola-shadow");
    expect(row!.isApproximate).toBe(false);

    const resolved = speciesById.get("sandslash-alola-shadow");
    expect(resolved).toBeDefined();
    expect(resolved!.isShadow).toBe(true);
    expect(resolved!.types).toEqual(["ice", "steel"]); // the Alolan form's own typing, never base Sandslash's ["ground"]
  });

  // A historical raid-history row carrying a real, Bulbapedia-sourced eraHp
  // (2026-09-07 era-HP backfill task) — 22500 is Primal Kyogre/Groudon's
  // real historical Legendary-Mega-Raid HP per this project's own documented
  // KNOWN_ERA_HP_VALUES set (bulbapediaRaidArchive.ts).
  it("kyogre-primal has a pogoapi-previous raidHistory row with eraHp 22500 at Legendary Mega Raids", () => {
    const row = raidHistory.find((r) => r.speciesId === "kyogre-primal");
    expect(row).toBeDefined();
    expect(row!.tier).toBe("Legendary Mega Raids");
    expect(row!.source).toBe("pogoapi-previous");
    expect(row!.eraHp).toBe(22500);
  });

  // A researched-tier row (RELEASED_MEGA_PRIMAL_ALLOWLIST-sourced, never
  // observed live this run) — deliberately has NO eraHp, since a
  // researched-tier seed is not itself a dated historical HP observation.
  it("skarmory-mega has a researched-tier raidHistory row at Mega Raids with no eraHp", () => {
    const row = raidHistory.find((r) => r.speciesId === "skarmory-mega");
    expect(row).toBeDefined();
    expect(row!.tier).toBe("Mega Raids");
    expect(row!.source).toBe("researched-tier");
    expect(row!.eraHp).toBeUndefined();
  });
});

describe("powerUpCosts.json sentinels", () => {
  // Real, published Pokémon GO power-up costs — public, stable game
  // knowledge (e.g. GamePress's "Power Up Costs" table): level 25 costs 4000
  // Stardust + 3 Candy (below the XL-candy threshold), level 40 costs 10000
  // Stardust + 10 XL Candy (above it, 0 ordinary candy).
  it("level 25 step: 4000 stardust, 3 candy, 0 XL candy", () => {
    expect(findStep(25)).toEqual({ fromLevel: 25, stardust: 4000, candy: 3, xlCandy: 0 });
  });

  it("level 40 step: 10000 stardust, 0 candy, 10 XL candy", () => {
    expect(findStep(40)).toEqual({ fromLevel: 40, stardust: 10000, candy: 0, xlCandy: 10 });
  });

  // Real, published Niantic constants: Shadow Pokémon cost 20% MORE
  // Stardust/Candy to power up; Purified Pokémon cost 10% LESS. Max level is
  // 50 for a standard (non-Best-Buddy) trainer.
  it("top-level multipliers: shadow +20%, purified -10%, maxLevel 50", () => {
    expect(powerUpCosts.shadowStardustMultiplier).toBe(1.2);
    expect(powerUpCosts.shadowCandyMultiplier).toBe(1.2);
    expect(powerUpCosts.purifiedStardustMultiplier).toBe(0.9);
    expect(powerUpCosts.purifiedCandyMultiplier).toBe(0.9);
    expect(powerUpCosts.maxLevel).toBe(50);
  });
});

describe("structural invariants (mirrors what check-mega-gates.mjs / check-raid-history-sources.mjs rely on)", () => {
  it("every species id is unique", () => {
    const ids = species.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every species has a non-empty typing (1 or 2 types)", () => {
    for (const s of species) {
      expect(s.types.length, `${s.id} has no typing`).toBeGreaterThanOrEqual(1);
      expect(s.types.length, `${s.id} has more than 2 types`).toBeLessThanOrEqual(2);
    }
  });

  // 2026-09-10 fix: 21 species previously carried a raw pogoapi/GAME_MASTER
  // form suffix straight through into `.name` (e.g. "Zacian (Crowned_sword)")
  // — see applyCleanFormDisplayName in sync-data.ts and formDisplayName's own
  // doc comment in scripts/sync-data/gameMasterMatching.ts. A display name is
  // user-facing prose, never a raw identifier, so it should never contain the
  // underscore-as-separator convention ids/enums use — this is a project-wide
  // regression guard, not just a per-species pin (see the Zacian/Shellos
  // sentinels above for the two most specific cases).
  it("no species display name carries a raw underscore", () => {
    const underscored = species.filter((s) => s.name.includes("_"));
    expect(underscored.map((s) => s.name)).toEqual([]);
  });

  it("every fast/charged move has a finite power and a positive duration (no dangling/malformed move data)", () => {
    for (const s of species) {
      for (const m of [...s.fastMoves, ...s.chargedMoves]) {
        expect(Number.isFinite(m.power), `${s.id}'s move ${m.id} has non-finite power`).toBe(true);
        expect(m.durationSeconds, `${s.id}'s move ${m.id} has non-positive duration`).toBeGreaterThan(0);
      }
    }
  });

  it("every species with a boost uses EXACTLY multiplier 1.3 (load-bearing per CLAUDE.md — never a cosmetic tuning knob)", () => {
    const boosted = species.filter((s) => s.boost);
    expect(boosted.length).toBeGreaterThan(0);
    for (const s of boosted) {
      expect(s.boost!.multiplier, `${s.id} has boost multiplier ${s.boost!.multiplier}, expected exactly 1.3`).toBe(1.3);
    }
  });

  it("every Shadow species' base stats equal its non-shadow base species' base stats exactly (raw copy, never pre-multiplied)", () => {
    const shadowSpecies = species.filter((s) => s.isShadow);
    expect(shadowSpecies.length).toBeGreaterThan(0);
    let checked = 0;
    for (const shadow of shadowSpecies) {
      const baseId = shadow.id.replace(/-shadow$/, "");
      const base = speciesById.get(baseId);
      if (!base) continue; // a shadow variant of a non-"Normal"-form base (e.g. giratina-altered-shadow) still resolves via the same suffix-strip; skip only if truly unresolvable
      checked++;
      expect(shadow.baseAttack, `${shadow.id} vs ${baseId}`).toBe(base.baseAttack);
      expect(shadow.baseDefense, `${shadow.id} vs ${baseId}`).toBe(base.baseDefense);
      expect(shadow.baseStamina, `${shadow.id} vs ${baseId}`).toBe(base.baseStamina);
      expect(shadow.boost, `${shadow.id} must never carry a boost`).toBeUndefined();
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("raidHistory.json is a plausible superset of activeRaids.json's speciesIds (accumulate-only — see CLAUDE.md)", () => {
    const historyIds = new Set(raidHistory.map((r) => r.speciesId));
    const activeIds = activeRaids.map((r) => r.speciesId).filter((id): id is string => id !== null);
    for (const id of activeIds) {
      expect(historyIds.has(id), `active raid speciesId "${id}" has no raidHistory row at all`).toBe(true);
    }
  });
});
