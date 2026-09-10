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
  chargedMoveAtMegaLevel,
  defenseDamageGrid,
  isWeatherBoosted,
  resolveCandidateMegaLevel,
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
  // Gated on species.boost via resolveCandidateMegaLevel, same as every
  // other tab — silently null (no effect) for a non-mega/non-primal species
  // regardless of what a.megaLevel says.
  const resolvedMegaLevel = species ? resolveCandidateMegaLevel(species, a.megaLevel) : null;

  let attack: Grids | null = null;
  let defense: Grids | null = null;
  let error: string | null = null;

  if (species && boss && adjustedBaseStats) {
    try {
      if (a.mode === "attack") {
        const fastMove = resolveMove(species.fastMoves, a.fastMoveId);
        const rawChargedMove = resolveMove(species.chargedMoves, a.chargedMoveId);
        if (!fastMove) throw new Error(`${species.name} has no fast move defined.`);
        if (!rawChargedMove) throw new Error(`${species.name} has no charged move defined.`);
        // A "+" move's power is scaled for this species' current Mega Level
        // (no-op for every ordinary move) — see megaLevel.ts's
        // chargedMoveAtMegaLevel. Fast moves are never "+" moves, so
        // fastMove.power is used unscaled either way.
        const chargedMove = chargedMoveAtMegaLevel(rawChargedMove, resolvedMegaLevel);
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
          megaLevel: resolvedMegaLevel,
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
          megaLevel: resolvedMegaLevel,
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
          // The DEFENDING species' (our own) Mega Level — the boss's own
          // moves are never scaled by it (a raid boss has no Mega Level
          // concept anywhere in this tool).
          megaLevel: resolvedMegaLevel,
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
          megaLevel: resolvedMegaLevel,
        });
        defense = { fast, charged };
      }
    } catch (err) {
      error = (err as Error).message;
    }
  }

  return { species, boss, attack, defense, error };
}
