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
  fastMoves: [STATIC_SHOCK],
  chargedMoves: [WILD_CHARGE],
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
  fastMoves: [STATIC_SHOCK],
  chargedMoves: [WILD_CHARGE],
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
  baseAttack: 2000,
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
