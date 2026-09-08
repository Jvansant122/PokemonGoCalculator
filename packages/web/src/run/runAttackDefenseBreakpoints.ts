/**
 * Pure "assumptions in -> results out" computation for the Attack/Defense
 * Breakpoints tab — see runComparator.ts's own doc comment for why this
 * extraction exists and the conventions it follows. React-free: takes
 * AttackDefenseBreakpointsView's own `AttackDefenseBreakpointsAssumptions`
 * plus a SpeciesRegistry, and returns exactly the grids the view renders.
 * No dodge/combat-phase here at all — every cell is one isolated hit, see
 * the view's own "Known caveats" section for why.
 */
import {
  attackDamageGrid,
  bossEffectiveStats,
  defenseDamageGrid,
  isWeatherBoosted,
  resolveMove,
  typeEffectiveness,
  type DamageGridCell,
  type SpeciesDefinition,
  type SpeciesRegistry,
} from "@pogo-analyzer/engine";
import type { AttackDefenseBreakpointsAssumptions } from "../AttackDefenseBreakpointsView.js";
import { shadowToggledBaseStats } from "../shadowToggle.js";
import { IVS_0_TO_15, LEVELS_25_TO_50 } from "../attackDefenseBreakpointsHelpers.js";
import { raidTierForSpeciesId } from "../registry.js";

export interface Grids {
  fast: DamageGridCell[];
  charged: DamageGridCell[];
}

export interface AttackDefenseBreakpointsRunResult {
  species: SpeciesDefinition | null;
  boss: SpeciesDefinition | null;
  attack: Grids | null;
  defense: Grids | null;
  error: string | null;
}

export function runAttackDefenseBreakpointsScenario(
  a: AttackDefenseBreakpointsAssumptions,
  registry: SpeciesRegistry,
): AttackDefenseBreakpointsRunResult {
  const species = registry.has(a.speciesId) ? registry.get(a.speciesId) : null;
  const boss = registry.has(a.targetId) ? registry.get(a.targetId) : null;
  const bossRaidTier = raidTierForSpeciesId(a.targetId) ?? undefined;

  // `species` stays the RAW registry object — attackDamageGrid/defenseDamageGrid
  // take a raw baseAttack/baseDefense NUMBER, so the Shadow toggle is applied
  // via shadowToggledBaseStats rather than cloning the species object.
  const adjustedBaseStats = species ? shadowToggledBaseStats(species, a.isShadow) : null;

  let attack: Grids | null = null;
  let defense: Grids | null = null;
  let error: string | null = null;

  if (species && boss && adjustedBaseStats) {
    try {
      if (a.mode === "attack") {
        const fastMove = resolveMove(species.fastMoves, a.fastMoveId);
        const chargedMove = resolveMove(species.chargedMoves, a.chargedMoveId);
        if (!fastMove) throw new Error(`${species.name} has no fast move defined.`);
        if (!chargedMove) throw new Error(`${species.name} has no charged move defined.`);
        const { defense: bossDefenseStat } = bossEffectiveStats(boss, bossRaidTier);

        const fast = attackDamageGrid({
          baseAttack: adjustedBaseStats.baseAttack,
          defenderDefenseStat: bossDefenseStat,
          power: fastMove.power,
          damageModifiers: {
            stab: species.types.includes(fastMove.type),
            typeEffectiveness: typeEffectiveness(fastMove.type, boss.types),
            weatherBoosted: isWeatherBoosted(fastMove.type, a.weather),
          },
          ivRange: IVS_0_TO_15,
          levels: LEVELS_25_TO_50,
        });
        const charged = attackDamageGrid({
          baseAttack: adjustedBaseStats.baseAttack,
          defenderDefenseStat: bossDefenseStat,
          power: chargedMove.power,
          damageModifiers: {
            stab: species.types.includes(chargedMove.type),
            typeEffectiveness: typeEffectiveness(chargedMove.type, boss.types),
            weatherBoosted: isWeatherBoosted(chargedMove.type, a.weather),
          },
          ivRange: IVS_0_TO_15,
          levels: LEVELS_25_TO_50,
        });
        attack = { fast, charged };
      } else {
        const bossFastMove = resolveMove(boss.fastMoves, a.bossFastMoveId);
        const bossChargedMove = resolveMove(boss.chargedMoves, a.bossChargedMoveId);
        if (!bossFastMove) throw new Error(`${boss.name} has no fast move defined.`);
        if (!bossChargedMove) throw new Error(`${boss.name} has no charged move defined.`);
        const { attack: bossAttackStat } = bossEffectiveStats(boss, bossRaidTier);

        const fast = defenseDamageGrid({
          baseDefense: adjustedBaseStats.baseDefense,
          attackerAttackStat: bossAttackStat,
          power: bossFastMove.power,
          damageModifiers: {
            stab: boss.types.includes(bossFastMove.type),
            typeEffectiveness: typeEffectiveness(bossFastMove.type, species.types),
            weatherBoosted: isWeatherBoosted(bossFastMove.type, a.weather),
          },
          ivRange: IVS_0_TO_15,
          levels: LEVELS_25_TO_50,
        });
        const charged = defenseDamageGrid({
          baseDefense: adjustedBaseStats.baseDefense,
          attackerAttackStat: bossAttackStat,
          power: bossChargedMove.power,
          damageModifiers: {
            stab: boss.types.includes(bossChargedMove.type),
            typeEffectiveness: typeEffectiveness(bossChargedMove.type, species.types),
            weatherBoosted: isWeatherBoosted(bossChargedMove.type, a.weather),
          },
          ivRange: IVS_0_TO_15,
          levels: LEVELS_25_TO_50,
        });
        defense = { fast, charged };
      }
    } catch (err) {
      error = (err as Error).message;
    }
  }

  return { species, boss, attack, defense, error };
}
