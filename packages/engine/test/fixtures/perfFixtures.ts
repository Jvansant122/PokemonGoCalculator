import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bossEffectiveStats,
  ownBoostMultiplier,
  resolveBoost,
  resolveMove,
} from "../../src/comparison.js";
import { effectiveStatsAtLevel } from "../../src/stats.js";
import type { StepwiseSimulationParams } from "../../src/simulate.js";
import type { PowerUpCostTable } from "../../src/powerUp.js";
import { typeEffectiveness } from "../../src/typeChart.js";
import { isWeatherBoosted } from "../../src/weather.js";
import type { IVSpread, SpeciesDefinition } from "../../src/types.js";

/**
 * TEST-ONLY perf-suite fixtures (perf.bench.ts / perf.test.ts). Loads REAL
 * synced data straight off disk — data/normalized/species.json is already in
 * this engine's own SpeciesDefinition shape (data-sync's normalized output,
 * the same file packages/web's registry.ts imports), so no fromGameMaster
 * conversion is needed; data/normalized/powerUpCosts.json is likewise already
 * PowerUpCostTable-shaped plus two provenance-only fields stripped below (the
 * same convention registry.ts uses). Reading real files from a test file is
 * fine — the "no I/O" rule is a src/ rule, not a test/ rule.
 *
 * Deliberately NOT under src/ and NOT re-exported from src/index.ts — same
 * "test-only" discipline as fixtures/hypotheticalDuo.ts. This module's numbers
 * are for measuring wall-clock cost, not for pinning exact damage/HP figures,
 * so (unlike hypotheticalDuo.ts) there is no risk in these species' stats
 * drifting under a future resync — a perf budget is deliberately generous
 * (~10x measured) specifically so it doesn't need re-tuning over a small
 * stat/movepool change.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const SPECIES_PATH = path.join(REPO_ROOT, "data/normalized/species.json");
const POWER_UP_COSTS_PATH = path.join(REPO_ROOT, "data/normalized/powerUpCosts.json");

let cachedSpecies: SpeciesDefinition[] | null = null;
function allRealSpecies(): SpeciesDefinition[] {
  if (!cachedSpecies) {
    cachedSpecies = JSON.parse(fs.readFileSync(SPECIES_PATH, "utf-8")) as SpeciesDefinition[];
  }
  return cachedSpecies;
}

/** Looks up one real species by id off the synced data layer. Throws (rather than silently falling back) if the id has gone missing upstream — a perf fixture drifting silently onto a DIFFERENT species would quietly invalidate every budget below. */
export function realSpecies(id: string): SpeciesDefinition {
  const found = allRealSpecies().find((s) => s.id === id);
  if (!found) {
    throw new Error(
      `perfFixtures: no species with id "${id}" in data/normalized/species.json — has this id changed upstream? Pick a new real replacement id rather than loosening this check.`,
    );
  }
  return found;
}

let cachedCostTable: PowerUpCostTable | null = null;
/** The real, synced universal power-up cost table (see powerUp.ts's powerUpCostTableFromGameMaster) — stripped of the two provenance-only fields (sourceUrl/fetchedAt) registry.ts also strips, since PowerUpCostTable itself declares neither. */
export function realPowerUpCostTable(): PowerUpCostTable {
  if (!cachedCostTable) {
    const raw = JSON.parse(fs.readFileSync(POWER_UP_COSTS_PATH, "utf-8")) as PowerUpCostTable & {
      sourceUrl?: string;
      fetchedAt?: string;
    };
    const { sourceUrl: _sourceUrl, fetchedAt: _fetchedAt, ...table } = raw;
    cachedCostTable = table;
  }
  return cachedCostTable;
}

export const PERF_LEVEL = 40;
export const PERF_IVS: IVSpread = { attack: 15, defense: 15, stamina: 15 };
/** Mean seconds between the boss's charged moves — a few seconds is representative of most real bosses' fast-move energy gain; not load-bearing for the timing measured here. */
export const PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS = 3;

/** A real, non-boosted LEGENDARY raid boss with a varied movepool (3 fast / 8 charged) — stable across resyncs, used as the shared boss target throughout this perf suite. */
export const PERF_BOSS_ID = "mewtwo";
/** A real, boosted mega attacker — used as the single-candidate attacker for the simulate.ts/comparison.ts benchmarks. */
export const PERF_ATTACKER_ID = "metagross-mega";
/** A realistic 6-slot roster: one mega attacker plus five real, strong non-mega species of varied types — used for the Team Raid / Power-Up Optimizer benchmarks. Real ids as of 2026-09-08; see realSpecies' doc comment for what happens if one goes missing. */
export const PERF_ROSTER_IDS = [
  "metagross-mega",
  "charizard-mega-y",
  "venusaur-mega",
  "tyranitar-mega",
  "garchomp",
  "dragonite",
] as const;
/** A handful of real, varied raid bosses — used as the Species Report's caller-supplied boss-target corpus. */
export const PERF_REPORT_BOSS_IDS = ["mewtwo", "rayquaza", "kyogre-primal", "groudon-primal", "landorus-incarnate"] as const;

/**
 * Builds one complete StepwiseSimulationParams for `attacker` vs `boss` at
 * PERF_LEVEL/PERF_IVS — reusing this engine's own exported helpers
 * (bossEffectiveStats/resolveMove/resolveBoost/ownBoostMultiplier from
 * comparison.ts, exactly the construction runSustainedComparison itself
 * performs) rather than a second hand-rolled damage-modifier assembly, so
 * this benchmark exercises the same real-shaped inputs the web UI actually
 * drives simulate.ts with.
 */
export function buildPerfStepwiseParams(attacker: SpeciesDefinition, boss: SpeciesDefinition): StepwiseSimulationParams {
  const stats = effectiveStatsAtLevel(attacker, PERF_IVS, PERF_LEVEL);
  const fastMove = resolveMove(attacker.fastMoves, undefined)!;
  const chargedMove = resolveMove(attacker.chargedMoves, undefined)!;
  const bossFastMove = resolveMove(boss.fastMoves, undefined)!;
  const bossChargedMove = resolveMove(boss.chargedMoves, undefined);
  const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(boss);
  const boost = resolveBoost(attacker, false);

  return {
    attacker: {
      hp: stats.stamina,
      defenseStat: stats.defense,
      attackStat: stats.attack,
      fastMove,
      chargedMove,
      fastDamageOut: {
        stab: attacker.types.includes(fastMove.type),
        typeEffectiveness: typeEffectiveness(fastMove.type, boss.types),
        megaBoostMultiplier: ownBoostMultiplier(boost, fastMove.type),
        weatherBoosted: isWeatherBoosted(fastMove.type, "none"),
      },
      chargedDamageOut: {
        stab: attacker.types.includes(chargedMove.type),
        typeEffectiveness: typeEffectiveness(chargedMove.type, boss.types),
        megaBoostMultiplier: ownBoostMultiplier(boost, chargedMove.type),
        weatherBoosted: isWeatherBoosted(chargedMove.type, "none"),
      },
    },
    boss: {
      attackStat: bossAttackStat,
      defenseStat: bossDefenseStat,
      fastMove: bossFastMove,
      damageOut: {
        stab: boss.types.includes(bossFastMove.type),
        typeEffectiveness: typeEffectiveness(bossFastMove.type, attacker.types),
        weatherBoosted: isWeatherBoosted(bossFastMove.type, "none"),
      },
      chargedMove: bossChargedMove,
      chargedMoveDamageOut: bossChargedMove
        ? {
            stab: boss.types.includes(bossChargedMove.type),
            typeEffectiveness: typeEffectiveness(bossChargedMove.type, attacker.types),
            weatherBoosted: isWeatherBoosted(bossChargedMove.type, "none"),
          }
        : undefined,
      chargedMoveMeanIntervalSeconds: PERF_BOSS_CHARGED_MOVE_MEAN_INTERVAL_SECONDS,
    },
    dodge: { kind: "perfect" },
    seed: 1,
  };
}
