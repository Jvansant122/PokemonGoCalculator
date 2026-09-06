import { RAID_BOSS_CPM, RAID_BOSS_IVS } from "../../src/raidBoss.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "../../src/types.js";

/**
 * TEST-ONLY hypothetical fixtures backing this engine's own acceptance
 * tests (scenarioA.test.ts/scenarioB.test.ts) plus every other test file that
 * previously reused the old shared MEGA_RAICHU_X/MEGA_RAICHU_Y/PRIMAL_KYOGRE/
 * MEGA_SKARMORY fixtures (see git history / .claude/agent-memory for that
 * deletion). Deliberately NOT under src/fixtures and NOT re-exported from
 * src/index.ts — the old fixtures' biggest blast-radius problem was that
 * packages/web's registry.ts imported them straight from
 * "@pogo-analyzer/engine" and registered them as real, selectable species in
 * the live UI picker. These are test-only regression fixtures with fresh,
 * hand-picked numbers; nothing outside this engine's own test suite should
 * ever import this file.
 *
 * All numbers below were computed against this engine's OWN formulas
 * (stats.ts/damage.ts/typeChart.ts/combat.ts) via a throwaway script, then
 * pinned here as exact regression values — not derived from any external
 * spec. Hand-authored (not real synced species) on purpose: a real species'
 * base stats/movepool are outside this project's control and could shift
 * under a future data-sync resync, silently breaking an exact pinned number
 * (delta%, HP, per-hit damage) years later for no reason related to an
 * actual engine bug. See CANDIDATE_ALPHA's doc comment below for the full
 * derivation trail.
 */

export const LEVEL = 35;
export const PERFECT_IVS = { attack: 15, defense: 15, stamina: 15 } as const;

export const ARC_SPARK: FastMove = {
  id: "arc-spark",
  name: "Arc Spark",
  type: "electric",
  power: 3,
  energyGain: 3,
  durationSeconds: 1.6,
};

export const VOLT_SLAM: ChargedMove = {
  id: "volt-slam",
  name: "Volt Slam",
  type: "electric",
  power: 110,
  energyCost: 45,
  durationSeconds: 3.5,
  vulnerableWindowSeconds: 2.7,
};

/**
 * CANDIDATE_ALPHA/CANDIDATE_BETA: a matched pair of hypothetical Electric
 * attackers (analogous in role to the old MEGA_RAICHU_X/Y, but with entirely
 * fresh numbers — not the same fixture re-added under a new name). Both
 * share HP (baseStamina 182 -> exactly 150 effective HP at level 35/perfect
 * stamina IV) and the same moveset (ARC_SPARK/VOLT_SLAM) so ALPHA/BETA differ
 * ONLY in baseAttack (280 vs 310) and typing (ALPHA carries a secondary Steel
 * type, BETA is pure Electric) — isolating exactly what each pinned
 * assertion is meant to isolate, same convention as the old fixtures.
 *
 * Verified (via a throwaway script driving this engine's own
 * effectiveStatsAtLevel/calculateDamage/typeEffectiveness/simulateOpeningBurst,
 * against BOSS_TIDE below), at level 35/perfect IVs:
 *   - Both effective HP: 150.
 *   - ARC_SPARK's damage vs BOSS_TIDE is constant across attack IV 13-15:
 *     ALPHA=5, BETA=6 (both include STAB, the 1.6x SUPER_EFFECTIVE
 *     electric-vs-water multiplier, and the 1.3x mega boost).
 *   - Fast-move-only opening burst (BOSS_TIDE's Tidal Surge only): both
 *     faint at EXACTLY 7.5s, having taken 183 damage and landed exactly 1
 *     charged attack: ALPHA=171, BETA=189 (delta +10.53%).
 * See scenarioA.test.ts for the exact assertions.
 */
export const CANDIDATE_ALPHA: SpeciesDefinition = {
  id: "test-candidate-alpha",
  name: "Test Candidate Alpha",
  types: ["electric", "steel"],
  baseAttack: 280,
  baseDefense: 60,
  baseStamina: 182,
  fastMoves: [ARC_SPARK],
  chargedMoves: [VOLT_SLAM],
  boost: { multiplier: 1.3, boostedType: "electric" },
  isHypothetical: true,
};

export const CANDIDATE_BETA: SpeciesDefinition = {
  ...CANDIDATE_ALPHA,
  id: "test-candidate-beta",
  name: "Test Candidate Beta",
  types: ["electric"],
  baseAttack: 310,
};

export const TIDAL_SURGE: FastMove = {
  id: "tidal-surge",
  name: "Tidal Surge",
  type: "water",
  power: 25,
  energyGain: 10,
  durationSeconds: 2.5,
};

export const MAELSTROM: ChargedMove = {
  id: "maelstrom",
  name: "Maelstrom",
  type: "water",
  power: 130,
  energyCost: 100,
  durationSeconds: 3.5,
  vulnerableWindowSeconds: 3.5,
};

/**
 * BOSS_TIDE: a precomputed (statsArePrecomputed: true) hypothetical raid
 * boss, pure Water — the Scenario A target. Water is neutral against both
 * Electric and Steel (see typeChart.ts), so ALPHA/BETA's typing difference
 * doesn't touch a single Scenario A number, same as the old fixtures'
 * PRIMAL_KYOGRE/Raichu-X/Y relationship. Carries a persistsThroughFaint
 * party-wide boost purely as fixture metadata coverage (see
 * scenarioA.test.ts's dedicated test for it) — boss-mode damage calc never
 * reads SpeciesDefinition.boost at all, so this can't affect any pinned
 * number above.
 */
export const BOSS_TIDE: SpeciesDefinition = {
  id: "test-boss-tide",
  name: "Test Boss Tide",
  types: ["water"],
  baseAttack: 230,
  baseDefense: 180,
  baseStamina: 12000,
  fastMoves: [TIDAL_SURGE],
  chargedMoves: [MAELSTROM],
  boost: { multiplier: 1.3, boostedType: "water", persistsThroughFaint: true },
  isHypothetical: true,
  statsArePrecomputed: true,
};

export const GUST: FastMove = {
  id: "test-gust",
  name: "Gust",
  type: "flying",
  power: 12,
  energyGain: 6,
  durationSeconds: 2.2,
};

export const SKY_CRASH: ChargedMove = {
  id: "sky-crash",
  name: "Sky Crash",
  type: "flying",
  power: 90,
  energyCost: 55,
  durationSeconds: 2.2,
  vulnerableWindowSeconds: 2.2,
};

/**
 * BOSS_GALE: a precomputed hypothetical raid boss, Steel/Flying — the
 * Scenario B target, matched to BOSS_TIDE's threat level (same effective
 * attack, 230) for a comparable A/B difficulty. Flying's attacks are
 * NOT_VERY_EFFECTIVE (0.625x) against BOTH Electric and Steel individually,
 * so ALPHA's secondary Steel typing stacks a second 0.625x multiplier
 * (0.625*0.625 = 0.390625) that BETA (pure Electric) doesn't get — the same
 * type-chart-driven survivability edge the old MEGA_RAICHU_X/MEGA_SKARMORY
 * pairing demonstrated, just with fresh numbers. Verified (same throwaway
 * script) with dodge:{kind:"none"}, dodgeFastAttacks:true,
 * openingBurstSeconds:150: ALPHA survives 110s (4 charged attacks landed,
 * 536 total charged damage) while BETA survives only 83.6s but still lands
 * MORE total charged damage (592) despite dying sooner — the crossover
 * finding Scenario B exists to demonstrate. See scenarioB.test.ts.
 */
export const BOSS_GALE: SpeciesDefinition = {
  id: "test-boss-gale",
  name: "Test Boss Gale",
  types: ["steel", "flying"],
  baseAttack: 230,
  baseDefense: 230,
  baseStamina: 11000,
  fastMoves: [GUST],
  chargedMoves: [SKY_CRASH],
  isHypothetical: true,
  statsArePrecomputed: true,
};

export const BOSS_TIDE_RAID_CPM = RAID_BOSS_CPM;
export const BOSS_TIDE_RAID_IVS = RAID_BOSS_IVS;
