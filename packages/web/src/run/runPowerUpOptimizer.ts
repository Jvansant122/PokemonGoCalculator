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
  generateEliteTmCandidates,
  generateSecondChargedMoveCandidates,
  optimizePowerUps,
  planPowerUpBudget,
  type EliteTmCandidate,
  type EliteTmKind,
  type MoveChangeEvaluationInputs,
  type PowerUpBudgetInputs,
  type RaidTier,
  type SecondChargedMoveCandidate,
  type SpeciesDefinition,
  type SpeciesRegistry,
} from "@pogo-analyzer/engine";
import type { PowerUpOptimizerAssumptions } from "../PowerUpOptimizerAssumptionPanel.js";
import { applyShadowToggle, effectiveIsShadow } from "../shadowToggle.js";
import { powerUpCostTable, raidTierForSpeciesId, resolveMegaBaseKmBuddyDistance } from "../registry.js";

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

/**
 * A `SecondChargedMoveCandidate` (packages/engine/src/tmMove.ts) plus an
 * `affordable` flag this run module computes itself — the engine type
 * carries no such flag (unlike `PowerUpCandidate.affordable`) since pricing a
 * second charged move never depends on which OTHER candidates exist. Priced
 * the same "single candidate, independent of every other" way
 * `PowerUpCandidate.affordable` already documents: stardust against the
 * shared `stardustOnHand` pool, candy against this ONE slot's own
 * `candyOnHand` plus the shared `rareCandyOnHand` pool (a second charged move
 * is never paid in XL Candy — see `toPowerUpResourceCost`).
 */
export interface SecondChargedMoveCandidateDisplay extends SecondChargedMoveCandidate {
  affordable: boolean;
}

/** Why a fielded slot produced no second-charged-move candidates at all — see `secondChargedMoveEligibility` (tmMove.ts) for the possible reasons (already knows 2, can't learn one at all, or its buddy distance is unknown). Reported, never silently dropped, per PLAN_tm_move_change_optimizer.md's central rule. */
export interface SecondChargedMoveBlockedSlot {
  slotIndex: number;
  speciesName: string;
  reason: string;
}

/** Why a fielded slot produced no Elite `kind` TM candidates — Smeargle (no TM of any kind), or a currently-active move that can never be replaced by any TM (Frustration/Return/signature/Super Max "+" — see `isTmTargetableMove`). */
export interface EliteTmBlockedSlot {
  slotIndex: number;
  speciesName: string;
  kind: EliteTmKind;
  reason: string;
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
  /**
   * Every second-charged-move candidate across every fielded slot — one per
   * (slot, learnable-charged-move-not-already-known) pair, deliberately
   * flat (not grouped per slot) so the view can sort it into the SAME
   * ranked list as `data.candidates` (both draw on the same stardust/candy
   * budget — PLAN_tm_move_change_optimizer.md's own framing for why this
   * competes there, unlike the Elite TM candidates below).
   */
  secondChargedMoveCandidates: SecondChargedMoveCandidateDisplay[];
  secondChargedMoveBlocked: SecondChargedMoveBlockedSlot[];
  /**
   * Every Elite Fast/Elite Charged TM candidate across every fielded slot,
   * kept in ONE flat array (`kind` distinguishes fast vs. charged) — NEVER
   * merged into `data.candidates`/`secondChargedMoveCandidates`'s ranking.
   * An Elite TM is a third/fourth, single-digit-supply, non-fungible
   * currency (CLAUDE.md's standing decision on never blending non-fungible
   * resources into one score) — the view renders this as its own "your N
   * Elite TMs, best N targets" section.
   */
  eliteTmCandidates: EliteTmCandidate[];
  eliteTmBlocked: EliteTmBlockedSlot[];
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
  const secondChargedMoveCandidates: SecondChargedMoveCandidateDisplay[] = [];
  const secondChargedMoveBlocked: SecondChargedMoveBlockedSlot[] = [];
  const eliteTmCandidates: EliteTmCandidate[] = [];
  const eliteTmBlocked: EliteTmBlockedSlot[] = [];
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
            // PowerUpSlotInput.megaLevel (via TeamRaidSlotInput) is
            // MegaLevel | undefined (no explicit null), unlike
            // PowerUpSlotAssumption.megaLevel's MegaLevel | null — same pure
            // type-shape conversion as runTeamRaid.ts's identical line.
            megaLevel: s.megaLevel ?? undefined,
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

      // Move-change candidates (PLAN_tm_move_change_optimizer.md web half).
      // `optimizerInputs` already satisfies every TeamRaidInputs field
      // MoveChangeEvaluationInputs needs EXCEPT a roster-wide level/ivs
      // default — every slot here already carries its OWN required
      // level/ivs (PowerUpSlotInput.level/ivs is required, unlike
      // TeamRaidSlotInput's optional per-slot override), so that default is
      // never actually consulted for any fielded slot; the placeholders
      // below exist purely to satisfy the type. Iterations deliberately
      // left at the engine's own default (3) rather than this tab's
      // boosted OPTIMIZER_ITERATIONS (20) — these are supplementary
      // candidates on top of the main power-up ranking, and each call
      // reports its own noise floor, so a coarser-but-fast evaluation here
      // keeps the debounced recompute from ballooning as slot count grows.
      const moveChangeInputs: MoveChangeEvaluationInputs = {
        ...optimizerInputs,
        level: FALLBACK_LEVEL,
        ivs: { attack: 15, defense: 15, stamina: 15 },
      };

      a.slots.forEach((s, i) => {
        const species = slotSpecies[i];
        if (!species) return;
        const effectiveShadowFlag = effectiveIsShadow(species, s.isShadow);

        // Second charged move — unlike an imported roster row (Roster tab /
        // multi-raid mode), this tab's own move pickers always resolve to
        // ONE concrete charged move (never "unknown" — see this module's
        // own doc comment on SecondChargedMoveCandidateDisplay), so
        // `currentChargedMoveIds` is always exactly the one currently
        // selected move here.
        const knownChargedMoveId = s.chargedMoveId ?? species.chargedMoves[0]?.id;
        if (knownChargedMoveId) {
          const scmResult = generateSecondChargedMoveCandidates({
            inputs: moveChangeInputs,
            slotIndex: i,
            currentChargedMoveIds: [knownChargedMoveId],
            pricing: {
              // A mega/primal species record carries no buddy distance of
              // its own — resolved from its BASE form instead (see
              // resolveMegaBaseKmBuddyDistance's own doc comment; without
              // this, every mega/primal slot would show "unknown" here).
              kmBuddyDistance: resolveMegaBaseKmBuddyDistance(species) ?? null,
              modifiers: { isShadow: effectiveShadowFlag, isPurified: s.isPurified },
            },
          });
          if (scmResult.blocked) {
            secondChargedMoveBlocked.push({ slotIndex: i, speciesName: species.name, reason: scmResult.reason });
          } else {
            for (const c of scmResult.candidates) {
              // Same "priced independently of every other candidate" model
              // as PowerUpCandidate.affordable's own doc comment: stardust
              // against the shared pool, candy against this slot's OWN
              // candyOnHand plus the shared Rare Candy pool (never XL Candy
              // — a second charged move is never paid in it).
              const candyAffordable = c.cost.candy <= s.candyOnHand + a.rareCandyOnHand;
              const stardustAffordable = c.cost.stardust <= a.stardustOnHand;
              secondChargedMoveCandidates.push({ ...c, affordable: candyAffordable && stardustAffordable });
            }
          }
        }

        // Elite Fast/Elite Charged TM — deterministic once a target is
        // picked, so every reachable move (other than the one currently
        // simulated) is evaluated regardless of how many Elite TMs this
        // slot's owner actually holds (see PowerUpOptimizerAssumptions'
        // eliteFastTmOnHand/eliteChargedTmOnHand doc comments — "unknown,
        // not zero," never gates candidate generation itself).
        for (const kind of ["fast", "charged"] as const) {
          const eliteResult = generateEliteTmCandidates({ inputs: moveChangeInputs, slotIndex: i, kind });
          if (eliteResult.blocked) {
            eliteTmBlocked.push({ slotIndex: i, speciesName: species.name, kind, reason: eliteResult.reason });
          } else {
            eliteTmCandidates.push(...eliteResult.candidates);
          }
        }
      });
    } catch (err) {
      error = (err as Error).message;
    }
  }

  return {
    slotSpecies,
    bossSpecies,
    bossRaidTier,
    bossReadySeconds,
    bossHp,
    data,
    plan,
    secondChargedMoveCandidates,
    secondChargedMoveBlocked,
    eliteTmCandidates,
    eliteTmBlocked,
    error,
  };
}
