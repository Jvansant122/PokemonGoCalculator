import { RAID_BOSS_CPM, RAID_BOSS_IVS } from "../raidBoss.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../types.js";

/**
 * Hypothetical fixture data reproducing the source analysis's "Mega Raichu X vs
 * Mega Raichu Y vs Primal Kyogre" comparison. Neither mega form exists in the
 * live game — these are the user-defined hypothetical species the spec requires
 * this tool to support. Base stats were chosen so the engine reproduces the
 * analysis's verified numbers exactly: 130 HP, a 4/5 fast-move damage split
 * across attack IV 13-15 at level 35, and a 190/221 (16.32%) charged-move split
 * after surviving exactly 10.0s of Primal Kyogre's Waterfall. See
 * test/scenarioA.test.ts for the full derivation.
 */

export const STATIC_SHOCK: FastMove = {
  id: "static-shock",
  name: "Static Shock",
  type: "electric",
  power: 2,
  energyGain: 3,
  durationSeconds: 1.6,
};

export const WILD_CHARGE: ChargedMove = {
  id: "wild-charge",
  name: "Wild Charge",
  type: "electric",
  power: 100,
  energyCost: 45,
  durationSeconds: 3.5,
  vulnerableWindowSeconds: 2.7,
};

/**
 * The rest of real Raichu's actual Pokémon GO movepool (from
 * `data/normalized/species.json`, i.e. `current_pokemon_moves.json` via
 * `scripts/sync-data.ts` — not hand-guessed), appended after each mega form's
 * own spec-tuned default above so the moveset picker has real alternatives to
 * choose from. Mirrors how a real mega evolution keeps its base form's full
 * moveset in-game (e.g. Mega Charizard X/Y both still learn everything
 * Charizard does). Ids match the real move ids exactly (kept as strings, same
 * as every other synced move) — these are genuinely different data points
 * from STATIC_SHOCK/WILD_CHARGE above, not renamed duplicates, so two
 * differently-tuned "Wild Charge" entries showing different numbers in the
 * picker is expected, not a bug: one is this spec's hand-tuned pinned-test
 * move, the other is the real in-game move.
 */
export const VOLT_SWITCH: FastMove = { id: "250", name: "Volt Switch", type: "electric", power: 13, energyGain: 20, durationSeconds: 1.5 };
export const SPARK: FastMove = { id: "206", name: "Spark", type: "electric", power: 4, energyGain: 6, durationSeconds: 0.5 };
export const CHARM: FastMove = { id: "320", name: "Charm", type: "fairy", power: 20, energyGain: 11, durationSeconds: 1.5 };
export const THUNDER_SHOCK: FastMove = { id: "205", name: "Thunder Shock", type: "electric", power: 4, energyGain: 7, durationSeconds: 0.5 };

export const BRICK_BREAK: ChargedMove = { id: "123", name: "Brick Break", type: "fighting", power: 40, energyCost: 33, durationSeconds: 1.5, vulnerableWindowSeconds: 1.5 };
export const THUNDER_PUNCH: ChargedMove = { id: "77", name: "Thunder Punch", type: "electric", power: 50, energyCost: 33, durationSeconds: 2, vulnerableWindowSeconds: 2 };
export const RAICHU_REAL_WILD_CHARGE: ChargedMove = { id: "251", name: "Wild Charge", type: "electric", power: 90, energyCost: 50, durationSeconds: 2.5, vulnerableWindowSeconds: 2.5 };
export const SKULL_BASH: ChargedMove = { id: "302", name: "Skull Bash", type: "normal", power: 130, energyCost: 100, durationSeconds: 3, vulnerableWindowSeconds: 3 };
export const TRAILBLAZE: ChargedMove = { id: "392", name: "Trailblaze", type: "grass", power: 65, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 };
export const RAICHU_SURF: ChargedMove = { id: "284", name: "Surf", type: "water", power: 60, energyCost: 50, durationSeconds: 1.5, vulnerableWindowSeconds: 1.5 };
export const THUNDER: ChargedMove = { id: "78", name: "Thunder", type: "electric", power: 100, energyCost: 100, durationSeconds: 2.5, vulnerableWindowSeconds: 2.5 };

const RAICHU_REAL_FAST_MOVES = [VOLT_SWITCH, SPARK, CHARM, THUNDER_SHOCK];
const RAICHU_REAL_CHARGED_MOVES = [BRICK_BREAK, THUNDER_PUNCH, RAICHU_REAL_WILD_CHARGE, SKULL_BASH, TRAILBLAZE, RAICHU_SURF, THUNDER];

/**
 * X carries a secondary Steel typing (mirroring how Mega Charizard X/Y split
 * into Fire/Dragon vs pure Fire in the live game). Water is neutral against
 * both Electric and Steel, so this doesn't touch a single Scenario A number —
 * but it gives X a genuine, type-chart-driven bulk advantage against Flying
 * attacks (Steel resists Flying too) that Y doesn't share. That's what powers
 * Scenario B's "X survives longer against Mega Skarmory" result: a typing
 * difference, not a raw stat difference, exactly as the source analysis
 * describes ("Flying-type moves, which Electric resists").
 */
// Image URLs verified live this session: pokeapi.co unexpectedly has sprite
// data for these under exactly these slugs (raichu-mega-x id 10304,
// raichu-mega-y id 10305) even though the forms are hypothetical/unreleased
// — see HANDOFF.md. Hand-set (not fetched — the engine has no I/O) rather
// than re-deriving on every load.
export const MEGA_RAICHU_X: SpeciesDefinition = {
  id: "raichu-mega-x",
  name: "Mega Raichu X",
  types: ["electric", "steel"],
  baseAttack: 383,
  baseDefense: 150,
  baseStamina: 156,
  fastMoves: [STATIC_SHOCK, ...RAICHU_REAL_FAST_MOVES],
  chargedMoves: [WILD_CHARGE, ...RAICHU_REAL_CHARGED_MOVES],
  boost: { multiplier: 1.3, boostedType: "electric" },
  isHypothetical: true,
  imageUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10304.png",
};

export const MEGA_RAICHU_Y: SpeciesDefinition = {
  id: "raichu-mega-y",
  name: "Mega Raichu Y",
  types: ["electric"],
  baseAttack: 449,
  baseDefense: 150,
  baseStamina: 156,
  fastMoves: [STATIC_SHOCK, ...RAICHU_REAL_FAST_MOVES],
  chargedMoves: [WILD_CHARGE, ...RAICHU_REAL_CHARGED_MOVES],
  boost: { multiplier: 1.3, boostedType: "electric" },
  isHypothetical: true,
  imageUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10305.png",
};

export const WATERFALL: FastMove = {
  id: "waterfall",
  name: "Waterfall",
  type: "water",
  power: 27,
  energyGain: 8,
  durationSeconds: 2.5,
};

/**
 * Primal Kyogre modeled as a raid boss: base stat fields are already its
 * effective stats (see raidBoss.ts), so baseAttack/baseDefense are read
 * straight through the same effectiveStat() pipeline used for trainer
 * Pokémon, with iv = 0 and RAID_BOSS_CPM = 1.0.
 */
export const HYDRO_PUMP: ChargedMove = {
  id: "hydro-pump",
  name: "Hydro Pump",
  type: "water",
  power: 130,
  energyCost: 100,
  durationSeconds: 3.5,
  vulnerableWindowSeconds: 3.5,
};

export const PRIMAL_KYOGRE: SpeciesDefinition = {
  id: "kyogre-primal",
  name: "Primal Kyogre",
  types: ["water"],
  baseAttack: 250,
  baseDefense: 200,
  baseStamina: 15000,
  fastMoves: [WATERFALL],
  chargedMoves: [HYDRO_PUMP],
  imageUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10077.png",
};

export const SKY_ATTACK: FastMove = {
  id: "sky-attack-fast",
  name: "Sky Attack",
  type: "flying",
  power: 12,
  energyGain: 6,
  durationSeconds: 2.2,
};

/**
 * Mega Skarmory: Scenario B's target. Flying/Steel, matching the source
 * analysis ("Flying-type fast and charged moves, which Electric resists").
 * Steel also resists Flying, so X's Electric/Steel typing takes noticeably
 * less per hit here than Y's pure Electric — the mechanism behind "X survives
 * longer against this specific raid boss" without changing X's raw stats.
 */
export const BRAVE_BIRD: ChargedMove = {
  id: "brave-bird",
  name: "Brave Bird",
  type: "flying",
  power: 90,
  energyCost: 55,
  durationSeconds: 2.2,
  vulnerableWindowSeconds: 2.2,
};

export const MEGA_SKARMORY: SpeciesDefinition = {
  id: "skarmory-mega",
  name: "Mega Skarmory",
  types: ["steel", "flying"],
  // Was 2000 — an 8x outlier against every other boss-mode fixture in this
  // file (Primal Kyogre's baseAttack is 250) and against real raid bosses in
  // general (effective attack rarely exceeds ~350 even for legendaries; see
  // raidBoss.ts — this field IS the boss's effective attack stat directly,
  // not a trainer-mode base stat run through CPM/IVs). Almost certainly a
  // stray CP-vs-base-attack-stat mix-up when this hypothetical fixture was
  // hand-authored. Matched to Kyogre's 250 for a comparable threat level
  // between Scenario A and B's targets — found and fixed after the user
  // noticed Mega Skarmory dealing implausibly large damage.
  baseAttack: 250,
  baseDefense: 250,
  baseStamina: 12000,
  fastMoves: [SKY_ATTACK],
  chargedMoves: [BRAVE_BIRD],
  imageUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10284.png",
};

export const SCENARIO_A_LEVEL = 35;
export const SCENARIO_A_PERFECT_IVS = { attack: 15, defense: 15, stamina: 15 } as const;

export const PRIMAL_KYOGRE_RAID_CPM = RAID_BOSS_CPM;
export const PRIMAL_KYOGRE_RAID_IVS = RAID_BOSS_IVS;
