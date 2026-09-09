/**
 * Pure "assumptions in -> results out" computation for the Power-Up
 * Optimizer tab — see runComparator.ts's own doc comment for why this
 * extraction exists and the conventions it follows. React-free: takes
 * PowerUpOptimizerView's own `PowerUpOptimizerAssumptions` plus a
 * SpeciesRegistry, and returns exactly the data PowerUpOptimizerView.tsx
 * renders (the baseline + per-slot ladders + ranked candidates).
 */
import {
  bossChargedMoveReadySeconds,
  bossEffectiveHp,
  optimizePowerUps,
  planPowerUpBudget,
  type PowerUpBudgetInputs,
  type RaidTier,
  type SpeciesDefinition,
  type SpeciesRegistry,
} from "@pogo-analyzer/engine";
import type { PowerUpOptimizerAssumptions } from "../PowerUpOptimizerAssumptionPanel.js";
import { applyShadowToggle, effectiveIsShadow } from "../shadowToggle.js";
import { powerUpCostTable, raidTierForSpeciesId } from "../registry.js";

/**
 * Matches DEFAULT_ASSUMPTIONS.slots[0]!.level in PowerUpOptimizerView.tsx —
 * the fallback used when a live-typed level is transiently non-finite.
 */
const FALLBACK_LEVEL = 35;

/**
 * Seed count for optimizePowerUps' paired team-raid comparison. Measured
 * ~217ms for the full 202-candidate default-roster sweep at 3 seeds (see
 * feature_power_up_optimizer_tab memory), so ~1.5s at 20 seeds — a level-1
 * roster has roughly 3x the candidates (more half-level steps available),
 * so worst case is still comfortably inside the 400ms debounce's "don't
 * block typing" budget once the debounce itself has settled. Raised from
 * the engine's own default of 3 because at 3 seeds, 78 of 202 default-roster
 * candidates showed a negative deltaTeamDps purely from seed-to-seed noise
 * (the baseline itself varies +/-0.25 team DPS across a single seed change);
 * at 20 seeds the noise floor the engine now computes is tight enough that
 * the ranked table stops reading as random. NOT a user-exposed setting —
 * deliberately: a shared link should encode WHAT was compared, not how hard
 * the tool searched for a stable answer, and every viewer of a given link
 * should see the same reproducible-enough result.
 */
const OPTIMIZER_ITERATIONS = 20;

/** Rounds to the nearest half-level and clamps to [1, 50] — powerUpCost/powerUpDamageLadder both throw on a non-half-level or an out-of-range level, and a live-typed number input can transiently be neither. */
function clampHalfLevel(level: number): number {
  const safe = Number.isFinite(level) ? level : FALLBACK_LEVEL;
  return Math.min(50, Math.max(1, Math.round(safe * 2) / 2));
}

/** Clamps a live-typed IV to [0, 15] — same defensive boundary reasoning as clampHalfLevel. */
function clampIv(iv: number): number {
  const safe = Number.isFinite(iv) ? iv : 0;
  return Math.min(15, Math.max(0, Math.round(safe)));
}

export interface PowerUpOptimizerRunResult {
  slotSpecies: (SpeciesDefinition | null)[];
  bossSpecies: SpeciesDefinition | null;
  bossRaidTier: RaidTier | undefined;
  bossReadySeconds: number | null;
  bossHp: number | null;
  data: ReturnType<typeof optimizePowerUps> | null;
  /**
   * The fixed-budget planner's output — a DIFFERENT question than `data`
   * above ("what SET of upgrades fits this whole stardust/Rare Candy/Rare
   * Candy XL budget?" vs. `data`'s "what is the single best next power-up?").
   * Computed unconditionally alongside `data` (measured ~0.8s combined for
   * both calls on the default roster — comfortably cheap, no debounce-gating
   * toggle needed). Null only when `data` is also null (no boss/no fielded
   * slot) or the same computation error applies — see `error`.
   */
  plan: ReturnType<typeof planPowerUpBudget> | null;
  error: string | null;
}

export function runPowerUpOptimizerScenario(a: PowerUpOptimizerAssumptions, registry: SpeciesRegistry): PowerUpOptimizerRunResult {
  const resolveSpecies = (id: string | null): SpeciesDefinition | null => (id && registry.has(id) ? registry.get(id) : null);

  const slotSpecies = a.slots.map((s) => resolveSpecies(s.speciesId));
  const bossSpecies = resolveSpecies(a.targetId);
  const bossRaidTier = raidTierForSpeciesId(a.targetId) ?? undefined;

  const selectedBossChargedMove = bossSpecies
    ? (bossSpecies.chargedMoves.find((m) => m.id === a.bossChargedMoveId) ?? bossSpecies.chargedMoves[0])
    : undefined;

  const bossStartingEnergy =
    a.bossStartsPrimed && bossSpecies ? a.bossStartingEnergyFraction * (selectedBossChargedMove?.energyCost ?? 0) : 0;

  let bossReadySeconds: number | null = null;
  if (bossSpecies) {
    const fastMove = bossSpecies.fastMoves.find((m) => m.id === a.bossFastMoveId) ?? bossSpecies.fastMoves[0];
    if (fastMove && selectedBossChargedMove) {
      bossReadySeconds = bossChargedMoveReadySeconds(fastMove, selectedBossChargedMove, bossStartingEnergy);
    }
  }

  const bossHp = bossSpecies ? bossEffectiveHp(bossSpecies, bossRaidTier) : null;

  let data: ReturnType<typeof optimizePowerUps> | null = null;
  let plan: ReturnType<typeof planPowerUpBudget> | null = null;
  let error: string | null = null;

  if (bossSpecies && a.slots.some((s) => s.speciesId)) {
    try {
      const optimizerInputs: PowerUpBudgetInputs = {
        slots: a.slots.map((s) => {
          const species = resolveSpecies(s.speciesId);
          const effectiveShadowFlag = effectiveIsShadow(species, s.isShadow);
          return {
            // Each slot's species stays RAW everywhere else — the Shadow
            // toggle is applied ONLY here, at the boundary into
            // optimizePowerUps, same convention as runTeamRaidScenario.
            species: applyShadowToggle(species, s.isShadow),
            fastMoveId: s.fastMoveId,
            chargedMoveId: s.chargedMoveId,
            isMega: s.isMega,
            level: clampHalfLevel(s.level),
            ivs: { attack: clampIv(s.ivAttack), defense: clampIv(s.ivDefense), stamina: clampIv(s.ivStamina) },
            costModifiers: { isShadow: effectiveShadowFlag, isPurified: s.isPurified, isLucky: s.isLucky },
            candyOnHand: Math.max(0, Math.floor(Number.isFinite(s.candyOnHand) ? s.candyOnHand : 0)),
            xlCandyOnHand: Math.max(0, Math.floor(Number.isFinite(s.xlCandyOnHand) ? s.xlCandyOnHand : 0)),
          };
        }),
        costTable: powerUpCostTable,
        stardustOnHand: Math.max(0, Math.floor(Number.isFinite(a.stardustOnHand) ? a.stardustOnHand : 0)),
        rareCandyOnHand: Math.max(0, Math.floor(Number.isFinite(a.rareCandyOnHand) ? a.rareCandyOnHand : 0)),
        rareCandyXlOnHand: Math.max(0, Math.floor(Number.isFinite(a.rareCandyXlOnHand) ? a.rareCandyXlOnHand : 0)),
        boss: bossSpecies,
        bossRaidTier,
        bossFastMoveId: a.bossFastMoveId,
        bossChargedMoveId: a.bossChargedMoveId,
        dodge: a.dodge,
        dodgeFastAttacks: a.dodgeFastAttacks,
        holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
        bossChargedMoveMeanIntervalSeconds: a.bossChargedMoveFrequencySeconds,
        bossChargedMoveCadence: a.bossChargedMoveCadence,
        bossStartingEnergy,
        weather: a.weather,
        raidTimerSeconds: a.raidTimerSeconds,
        swapCostSeconds: a.swapCostSeconds,
        reviveCostSeconds: a.reviveCostSeconds,
        iterations: OPTIMIZER_ITERATIONS,
      };
      data = optimizePowerUps(optimizerInputs);
      // Same seed/iteration convention as optimizePowerUps above — a
      // DIFFERENT algorithm (greedy multi-slot budget allocation) over the
      // same inputs, not a re-derivation of `data`. See PowerUpOptimizerRunResult.plan.
      plan = planPowerUpBudget(optimizerInputs);
    } catch (err) {
      error = (err as Error).message;
    }
  }

  return { slotSpecies, bossSpecies, bossRaidTier, bossReadySeconds, bossHp, data, plan, error };
}
