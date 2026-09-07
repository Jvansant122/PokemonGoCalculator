import { bossChargedMoveReadySeconds, simulateOpeningBurst, type DamageTrajectoryPoint } from "./combat.js";
import type { DodgeBehavior } from "./breakpoints.js";
import { effectiveStat, effectiveStatsAtLevel } from "./stats.js";
import { shadowAdjustedBaseStats } from "./shadow.js";
import { typeEffectiveness } from "./typeChart.js";
import {
  RAID_BOSS_CPM,
  RAID_BOSS_IVS,
  REAL_RAID_BOSS_IV,
  defaultRaidTierForSpecies,
  raidTierStats,
  type RaidTier,
} from "./raidBoss.js";
import { DEFAULT_STEPWISE_MAX_SECONDS, runStepwiseDistribution, type DistributionSummary } from "./simulate.js";
import type { ChargedMove, IVSpread, SpeciesDefinition } from "./types.js";
import { isWeatherBoosted, type WeatherCondition } from "./weather.js";

/**
 * NOTE (2026-09-06 code-simplifier audit): runComparison/ComparisonInputs/
 * CandidateResult below have zero production callers — packages/web only
 * drives runSustainedComparison/compareAcrossBossChargedMoves further down in
 * this same file. This is intentional, not dead code: see combat.ts's
 * matching note at the top of that file for why this "Phase 1 opening burst"
 * cluster is kept as a deterministic acceptance-test harness (comparison.test.ts,
 * test/scenarioA.test.ts, test/scenarioB.test.ts, test/bossTiming.test.ts,
 * part of test/simulate.test.ts) pinning the core formula pipeline
 * independent of the sustained engine's randomized boss timing. Do not delete
 * runComparison/ComparisonInputs/CandidateResult as unused without first
 * confirming the exact pinned-number coverage they provide can be reproduced
 * through runSustainedComparison instead.
 */

/**
 * Boss effective attack/defense stats, applying shadow.ts's Shadow
 * multiplier (if the boss species is flagged isShadow) to the raw
 * baseAttack/baseDefense before the single floor — several real raid bosses
 * are Shadow, so this can't just be skipped for boss mode. Shares
 * shadowAdjustedBaseStats with stats.ts's effectiveStatsAtLevel rather than
 * forking a second Shadow-multiplier code path. Exported (not just
 * module-private) so teamRaid.ts's per-slot orchestrator can reuse the exact
 * same boss-stat derivation rather than forking a second one.
 *
 * Branches on SpeciesDefinition.statsArePrecomputed: a precomputed boss
 * (this engine's own test-only hypothetical fixtures, plus hand-authored
 * synthetic test bosses) keeps the old iv=0/cpm=1.0 pass-through unchanged — its
 * baseAttack/baseDefense fields already ARE the final effective numbers, and
 * re-deriving them under the real tier formula would silently break the
 * pinned Scenario A/B test values. A real synced species instead gets the
 * real per-tier formula (REAL_RAID_BOSS_IV=15, tier's attackDefenseMultiplier
 * — see raidBoss.ts's RAID_TIER_TABLE), defaulting to
 * defaultRaidTierForSpecies(boss) (rarity/boost-keyed; DEFAULT_REAL_RAID_TIER
 * as its own last resort) when `tier` is omitted (e.g. the species isn't
 * currently a live raid target with a known tier).
 */
export function bossEffectiveStats(boss: SpeciesDefinition, tier?: RaidTier): { attack: number; defense: number } {
  const { baseAttack, baseDefense } = shadowAdjustedBaseStats(boss);
  if (boss.statsArePrecomputed) {
    return {
      attack: effectiveStat(baseAttack, RAID_BOSS_IVS.attack, RAID_BOSS_CPM),
      defense: effectiveStat(baseDefense, RAID_BOSS_IVS.defense, RAID_BOSS_CPM),
    };
  }
  const { attackDefenseMultiplier } = raidTierStats(tier ?? defaultRaidTierForSpecies(boss));
  return {
    attack: effectiveStat(baseAttack, REAL_RAID_BOSS_IV, attackDefenseMultiplier),
    defense: effectiveStat(baseDefense, REAL_RAID_BOSS_IV, attackDefenseMultiplier),
  };
}

/**
 * Boss effective HP — the critical asymmetry versus bossEffectiveStats
 * above: a real boss's battle HP is a FIXED, flat pool set directly per tier
 * (RAID_TIER_TABLE), completely decoupled from the species' own baseStamina
 * stat and NOT run through effectiveStat/CPM at all (Bulbapedia's own text:
 * "a fixed Boss HP value based on the raid level"). Do NOT "fix" this by
 * applying effectiveStat(baseStamina, REAL_RAID_BOSS_IV, multiplier) the way
 * attack/defense are handled above — that would not reproduce real boss HP
 * pools and was explicitly flagged as the wrong fix path during this
 * feature's research (see raidBoss.ts's RaidTierStats.hp doc comment).
 *
 * A precomputed boss (see bossEffectiveStats) instead reads baseStamina
 * straight through, unchanged — exactly like today's pass-through behavior,
 * since its baseStamina field already IS the final effective HP pool by
 * construction.
 */
export function bossEffectiveHp(boss: SpeciesDefinition, tier?: RaidTier): number {
  if (boss.statsArePrecomputed) return boss.baseStamina;
  return raidTierStats(tier ?? defaultRaidTierForSpecies(boss)).hp;
}

/**
 * Resolves a move selection by id against a species' available moves, falling
 * back to the first move when the id is omitted, null, or doesn't match —
 * i.e. today's implicit "always use moves[0]" behavior. Shared by
 * runComparison, runSustainedComparison, AND teamRaid.ts's per-slot
 * orchestrator so a candidate/boss/team-slot move choice means the same
 * thing everywhere.
 */
export function resolveMove<T extends { id: string }>(moves: T[], id: string | null | undefined): T | undefined {
  return (id ? moves.find((m) => m.id === id) : undefined) ?? moves[0];
}

/**
 * Resolves a candidate's effective boost for this comparison: undefined when
 * the species has no boost mechanic at all, OR when the caller has flagged
 * this specific candidate's boost as disabled (see
 * ComparisonInputs.candidateMegaBoostDisabled) — a full "pretend this species
 * isn't mega/primal boosted at all," not a partial toggle. Every downstream
 * use (own-damage boost gating below, and the boostMultiplier/boostedType/
 * persistsThroughFaint fields fed to uptime.ts) reads from this, never from
 * species.boost directly, so the disable toggle can't be partially applied.
 */
export function resolveBoost(species: SpeciesDefinition, disabled: boolean): SpeciesDefinition["boost"] | undefined {
  return disabled ? undefined : species.boost;
}

/**
 * The mega/primal self-boost only applies to a candidate's own move when
 * that move's type matches the boost's boostedType (e.g. Mega Camerupt's
 * Ground-type Earthquake gets no boost even though Camerupt's boosted type
 * is Fire) — an off-type move, or a candidate with no active boost at all,
 * gets NO_BONUS (1), never the full multiplier. Exported for teamRaid.ts —
 * see that module's doc comment for why a team-raid slot's OWN damage still
 * uses this (a fielded mega form's stats/boost are inherent to that species),
 * while the team-wide "boosts teammates" side of the mechanic is deliberately
 * never computed there at all (a solo trainer's own mega never boosts their
 * own bench — see teamRaid.ts).
 */
export function ownBoostMultiplier(boost: SpeciesDefinition["boost"] | undefined, moveType: SpeciesDefinition["types"][number]): number {
  return boost && moveType === boost.boostedType ? boost.multiplier : 1;
}

export interface ComparisonInputs {
  candidates: SpeciesDefinition[];
  /** Per-candidate fast-move selection, matched by index to `candidates`. Omit or use null for a given index to default to that species' first fast move (today's behavior). */
  candidateFastMoveIds?: (string | null)[];
  /** Per-candidate charged-move selection — see candidateFastMoveIds. */
  candidateChargedMoveIds?: (string | null)[];
  /**
   * Per-candidate "pretend this species has no mega/primal boost mechanic at
   * all", matched by index to `candidates` — for comparing a mega candidate's
   * DPS fairly against a non-mega one. When true for a candidate, its
   * species.boost is treated as entirely absent for EVERY purpose: both this
   * candidate's own-damage boost (fast/charged) AND its team-damage
   * attribution (boostMultiplier/boostedType/persistsThroughFaint fed to
   * uptime.ts) — a full toggle, not a partial one. Defaults to [false, false]
   * when omitted, so every existing caller needs zero changes.
   */
  candidateMegaBoostDisabled?: [boolean, boolean];
  boss: SpeciesDefinition;
  /**
   * Which real raid tier the boss counts as, for real (non-precomputed)
   * species — see bossEffectiveStats/bossEffectiveHp above and raidBoss.ts's
   * RAID_TIER_TABLE. Ignored entirely when boss.statsArePrecomputed is true
   * (this project's hypothetical fixtures). Omitted/undefined for a real
   * species defaults to defaultRaidTierForSpecies(boss) — rarity/boost-keyed,
   * falling back to DEFAULT_REAL_RAID_TIER ("5-Star Raids") only as the true
   * last resort (species with no rarity data, or Mythic/Ultra Beast).
   */
  bossRaidTier?: RaidTier;
  /** Boss fast-move selection. Omit/null defaults to the boss's first fast move (today's behavior). */
  bossFastMoveId?: string | null;
  /** Boss charged-move selection. Omit/null defaults to the boss's first charged move (today's behavior). */
  bossChargedMoveId?: string | null;
  level: number;
  ivs: IVSpread;
  /** Governs dodging the boss's CHARGED attacks only — inert during the opening burst, since the boss never throws one there. */
  dodge: DodgeBehavior;
  /** Whether the candidate also attempts to dodge the boss's fast attacks — the only attack type that exists during the opening burst, so this is what actually extends survival here. Costs DODGE_COST_SECONDS per attempt (see breakpoints.ts). Defaults to false. */
  dodgeFastAttacks?: boolean;
  /**
   * How long the "opening burst" window lasts before a real boss would start
   * throwing charged moves. Defaults to bossChargedMoveReadySeconds(boss's
   * fast move, boss's first charged move, bossStartingEnergy) — the earliest
   * physically possible time, not an arbitrary number — so callers only need
   * to override this explicitly for a scenario that isn't "boss starts
   * fresh, this is the natural pre-charged-move window."
   */
  openingBurstSeconds?: number;
  /**
   * Energy the boss already has saved when the fight begins (0-energyCost of
   * its first charged move) — only affects the derived openingBurstSeconds
   * default above. Models a mega tagging in mid-fight against a boss an
   * earlier trainer's mega left partway charged. Defaults to 0.
   */
  bossStartingEnergy?: number;
  /**
   * Active weather condition, applied per-move (by that move's own type) to
   * both the candidate's and the boss's damage output independently — see
   * weather.ts's isWeatherBoosted. Defaults to "none" (today's behavior: no
   * weather modeled), matching Scenario's default.
   */
  weather?: WeatherCondition;
}

export interface CandidateResult {
  id: string;
  name: string;
  secondsSurvived: number;
  chargedAttacksLanded: number;
  /** Charged-move damage only. */
  ownChargedDamage: number;
  /** Fast-move damage dealt to the boss — previously untracked entirely (the fast move's damage was never computed, only its energy gain). */
  ownFastMoveDamage: number;
  /** ownChargedDamage + ownFastMoveDamage — the true total damage output, and what feeds the team-contribution/crossover math (uptime.ts) and the damage-over-time chart. */
  ownTotalDamage: number;
  /** undefined means this candidate has no boost mechanic active for this comparison — genuinely non-mega, or candidateMegaBoostDisabled was set. See uptime.ts's UptimeConversionInputs.boostMultiplier. */
  boostMultiplier: number | undefined;
  boostedType: SpeciesDefinition["types"][number];
  /** See SpeciesDefinition.boost.persistsThroughFaint (uptime.ts consumes this). Defaults to false when the species has no boost at all. */
  persistsThroughFaint: boolean;
  /** Combined fast+charged cumulative damage over time — see combat.ts's OpeningBurstResult.ownDamageTrajectory. */
  ownDamageTrajectory: DamageTrajectoryPoint[];
}

/**
 * Runs the opening-burst comparison (see combat.ts) for every candidate against
 * a shared boss under one set of assumptions. This is the single code path
 * both the acceptance tests and the web UI drive, so "what does the tool
 * conclude" can never drift between the two.
 */
export function runComparison(inputs: ComparisonInputs): CandidateResult[] {
  const {
    candidates,
    boss,
    level,
    ivs,
    dodge,
    dodgeFastAttacks = false,
    bossStartingEnergy = 0,
    weather = "none",
    candidateMegaBoostDisabled = [false, false],
  } = inputs;
  const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(boss, inputs.bossRaidTier);
  const bossFastMove = resolveMove(boss.fastMoves, inputs.bossFastMoveId);
  if (!bossFastMove) throw new Error(`Boss species ${boss.id} has no fast move defined.`);
  const bossChargedMove = resolveMove(boss.chargedMoves, inputs.bossChargedMoveId);
  const openingBurstSeconds =
    inputs.openingBurstSeconds ??
    (bossChargedMove ? bossChargedMoveReadySeconds(bossFastMove, bossChargedMove, bossStartingEnergy) : 20);

  return candidates.map((species, i) => {
    const stats = effectiveStatsAtLevel(species, ivs, level);
    const fastMove = resolveMove(species.fastMoves, inputs.candidateFastMoveIds?.[i]);
    const chargedMove = resolveMove(species.chargedMoves, inputs.candidateChargedMoveIds?.[i]);
    if (!fastMove || !chargedMove) {
      throw new Error(`Candidate ${species.id} needs at least one fast move and one charged move.`);
    }
    // Fast and charged moves can differ in type (e.g. a Dragon fast move with
    // a Fire charged move), so STAB/type-effectiveness are computed per-move,
    // not shared — see combat.ts's AttackerProfile.fastDamageOut doc for the
    // bug this fixes (previously invisible because every fixture's fast and
    // charged moves happen to share a type).
    const candidateFastVsBoss = typeEffectiveness(fastMove.type, boss.types);
    const candidateChargedVsBoss = typeEffectiveness(chargedMove.type, boss.types);
    const bossVsCandidate = typeEffectiveness(bossFastMove.type, species.types);
    const boost = resolveBoost(species, candidateMegaBoostDisabled[i] ?? false);

    const result = simulateOpeningBurst(
      {
        hp: stats.stamina,
        defenseStat: stats.defense,
        attackStat: stats.attack,
        fastMove,
        chargedMove,
        fastDamageOut: {
          stab: species.types.includes(fastMove.type),
          typeEffectiveness: candidateFastVsBoss,
          megaBoostMultiplier: ownBoostMultiplier(boost, fastMove.type),
          weatherBoosted: isWeatherBoosted(fastMove.type, weather),
        },
        chargedDamageOut: {
          stab: species.types.includes(chargedMove.type),
          typeEffectiveness: candidateChargedVsBoss,
          megaBoostMultiplier: ownBoostMultiplier(boost, chargedMove.type),
          weatherBoosted: isWeatherBoosted(chargedMove.type, weather),
        },
      },
      {
        attackStat: bossAttackStat,
        defenseStat: bossDefenseStat,
        fastMove: bossFastMove,
        damageOut: {
          stab: boss.types.includes(bossFastMove.type),
          typeEffectiveness: bossVsCandidate,
          weatherBoosted: isWeatherBoosted(bossFastMove.type, weather),
        },
      },
      openingBurstSeconds,
      dodge,
      dodgeFastAttacks,
    );

    return {
      id: species.id,
      name: species.name,
      secondsSurvived: result.faintedAtSeconds ?? openingBurstSeconds,
      chargedAttacksLanded: result.chargedAttacksLanded,
      ownChargedDamage: result.totalChargedDamage,
      ownFastMoveDamage: result.totalFastMoveDamage,
      ownTotalDamage: result.totalChargedDamage + result.totalFastMoveDamage,
      boostMultiplier: boost?.multiplier,
      boostedType: boost?.boostedType ?? species.types[0],
      persistsThroughFaint: boost?.persistsThroughFaint ?? false,
      ownDamageTrajectory: result.ownDamageTrajectory,
    };
  });
}

export interface SustainedComparisonInputs {
  candidates: SpeciesDefinition[];
  /** Per-candidate fast-move selection, matched by index to `candidates`. Omit or use null for a given index to default to that species' first fast move (today's behavior). */
  candidateFastMoveIds?: (string | null)[];
  /** Per-candidate charged-move selection — see candidateFastMoveIds. */
  candidateChargedMoveIds?: (string | null)[];
  /** See ComparisonInputs.candidateMegaBoostDisabled. Defaults to [false, false]. */
  candidateMegaBoostDisabled?: [boolean, boolean];
  boss: SpeciesDefinition;
  /** See ComparisonInputs.bossRaidTier. */
  bossRaidTier?: RaidTier;
  /** Boss fast-move selection. Omit/null defaults to the boss's first fast move (today's behavior). */
  bossFastMoveId?: string | null;
  /** Boss charged-move selection. Omit/null defaults to the boss's first charged move (today's behavior) — also determines which move's `perfectlyDodgeable` flag applies. */
  bossChargedMoveId?: string | null;
  level: number;
  ivs: IVSpread;
  /** Governs dodging the boss's CHARGED attacks only. */
  dodge: DodgeBehavior;
  /** Whether the candidate also attempts to dodge the boss's fast attacks — a plain boolean, not a percentage. Costs DODGE_COST_SECONDS per attempt. Defaults to false. */
  dodgeFastAttacks?: boolean;
  /**
   * Hold the charged move for a safer moment instead of firing the instant
   * energy allows — see simulate.ts's StepwiseAttacker.holdChargedMoveUntilSafe
   * for the exact trigger conditions. Defaults to false (today's
   * fire-immediately behavior).
   */
  holdChargedMoveUntilSafe?: boolean;
  /** Mean seconds between the boss's charged moves once the sustained phase begins. */
  bossChargedMoveMeanIntervalSeconds: number;
  /**
   * Defaults to bossChargedMoveReadySeconds(boss's fast move, boss's charged
   * move, bossStartingEnergy) — see ComparisonInputs.openingBurstSeconds for
   * why this replaced a flat 0 default.
   */
  bossChargedMoveWarmupSeconds?: number;
  /** See ComparisonInputs.bossStartingEnergy. Defaults to 0. */
  bossStartingEnergy?: number;
  maxSeconds?: number;
  iterations?: number;
  /** See ComparisonInputs.weather. Defaults to "none". */
  weather?: WeatherCondition;
}

export interface SustainedCandidateResult extends DistributionSummary {
  id: string;
  name: string;
}

/**
 * Phase 5: the sustained-combat counterpart to runComparison. The boss's
 * charged-move timing is randomized (see simulate.ts), so this returns a
 * distribution per candidate rather than one number.
 */
export function runSustainedComparison(inputs: SustainedComparisonInputs): SustainedCandidateResult[] {
  const {
    candidates,
    boss,
    level,
    ivs,
    dodge,
    dodgeFastAttacks = false,
    holdChargedMoveUntilSafe = false,
    bossChargedMoveMeanIntervalSeconds,
    bossChargedMoveWarmupSeconds,
    bossStartingEnergy = 0,
    maxSeconds = DEFAULT_STEPWISE_MAX_SECONDS,
    iterations = 200,
    weather = "none",
    candidateMegaBoostDisabled = [false, false],
  } = inputs;
  const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(boss, inputs.bossRaidTier);
  const bossFastMove = resolveMove(boss.fastMoves, inputs.bossFastMoveId);
  const bossChargedMove = resolveMove(boss.chargedMoves, inputs.bossChargedMoveId);
  if (!bossFastMove) throw new Error(`Boss species ${boss.id} has no fast move defined.`);

  return candidates.map((species, i) => {
    const stats = effectiveStatsAtLevel(species, ivs, level);
    const fastMove = resolveMove(species.fastMoves, inputs.candidateFastMoveIds?.[i]);
    const chargedMove = resolveMove(species.chargedMoves, inputs.candidateChargedMoveIds?.[i]);
    if (!fastMove || !chargedMove) {
      throw new Error(`Candidate ${species.id} needs at least one fast move and one charged move.`);
    }
    const candidateFastVsBoss = typeEffectiveness(fastMove.type, boss.types);
    const candidateChargedVsBoss = typeEffectiveness(chargedMove.type, boss.types);
    const bossVsCandidate = typeEffectiveness(bossFastMove.type, species.types);
    const bossChargedVsCandidate = bossChargedMove ? typeEffectiveness(bossChargedMove.type, species.types) : 1;
    const boost = resolveBoost(species, candidateMegaBoostDisabled[i] ?? false);

    const distribution = runStepwiseDistribution(
      {
        attacker: {
          hp: stats.stamina,
          defenseStat: stats.defense,
          attackStat: stats.attack,
          fastMove,
          chargedMove,
          fastDamageOut: {
            stab: species.types.includes(fastMove.type),
            typeEffectiveness: candidateFastVsBoss,
            megaBoostMultiplier: ownBoostMultiplier(boost, fastMove.type),
            weatherBoosted: isWeatherBoosted(fastMove.type, weather),
          },
          chargedDamageOut: {
            stab: species.types.includes(chargedMove.type),
            typeEffectiveness: candidateChargedVsBoss,
            megaBoostMultiplier: ownBoostMultiplier(boost, chargedMove.type),
            weatherBoosted: isWeatherBoosted(chargedMove.type, weather),
          },
          holdChargedMoveUntilSafe,
        },
        boss: {
          attackStat: bossAttackStat,
          defenseStat: bossDefenseStat,
          fastMove: bossFastMove,
          damageOut: {
            stab: boss.types.includes(bossFastMove.type),
            typeEffectiveness: bossVsCandidate,
            weatherBoosted: isWeatherBoosted(bossFastMove.type, weather),
          },
          chargedMove: bossChargedMove,
          chargedMoveDamageOut: bossChargedMove
            ? {
                stab: boss.types.includes(bossChargedMove.type),
                typeEffectiveness: bossChargedVsCandidate,
                weatherBoosted: isWeatherBoosted(bossChargedMove.type, weather),
              }
            : undefined,
          chargedMoveMeanIntervalSeconds: bossChargedMoveMeanIntervalSeconds,
          chargedMoveWarmupSeconds: bossChargedMoveWarmupSeconds,
          startingEnergy: bossStartingEnergy,
        },
        dodge,
        dodgeFastAttacks,
        maxSeconds,
      },
      iterations,
    );

    return { id: species.id, name: species.name, ...distribution };
  });
}

export interface BossChargedMoveVariantResult {
  chargedMoveId: string;
  chargedMoveName: string;
  results: SustainedCandidateResult[];
}

/**
 * Runs runSustainedComparison once per each of the boss's known charged
 * moves (already present on SpeciesDefinition.chargedMoves — no new sourcing
 * needed), so a caller can show whether the ranking between two candidates
 * depends on which charged-move variant the boss instance happens to have
 * rolled. A real raid boss instance is locked to ONE fixed charged move for
 * its whole lifetime, but different instances of "the same" boss (different
 * eggs/gyms) can roll different charged moves from its known movepool — a
 * player deciding which mega to bring can't know in advance which variant
 * they'll actually face.
 *
 * Scoped to charged moves only, per the originating proposal — this does NOT
 * also sweep the boss's fast moves. `inputs.bossChargedMoveId` is ignored if
 * supplied (each swept entry provides its own); every other input (dodge,
 * party assumptions passed through by the caller, weather, etc.) is held
 * fixed across the sweep so only the boss's moveset varies.
 */
export function compareAcrossBossChargedMoves(
  inputs: Omit<SustainedComparisonInputs, "bossChargedMoveId">,
): BossChargedMoveVariantResult[] {
  return inputs.boss.chargedMoves.map((chargedMove: ChargedMove) => ({
    chargedMoveId: chargedMove.id,
    chargedMoveName: chargedMove.name,
    results: runSustainedComparison({ ...inputs, bossChargedMoveId: chargedMove.id }),
  }));
}
