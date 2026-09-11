import { bossChargedMoveReadySeconds, simulateOpeningBurst, type DamageTrajectoryPoint } from "./combat.js";
import type { DodgeBehavior } from "./breakpoints.js";
import type { FriendshipLevel } from "./damage.js";
import { canReachSuperMax, chargedMoveAtMegaLevel, effectiveLevelForBestBuddy, effectiveLevelForMegaLevel, type MegaLevel } from "./megaLevel.js";
import { effectiveStat, effectiveStatsAtLevel } from "./stats.js";
import { shadowAdjustedBaseStats, shadowEnragedStats } from "./shadow.js";
import { typeEffectiveness } from "./typeChart.js";
import {
  RAID_BOSS_CPM,
  RAID_BOSS_IVS,
  REAL_RAID_BOSS_IV,
  defaultRaidTierForSpecies,
  raidTierStats,
  type RaidTier,
} from "./raidBoss.js";
import {
  DEFAULT_STEPWISE_MAX_SECONDS,
  runStepwiseDistribution,
  type BossChargedMoveCadence,
  type DistributionSummary,
} from "./simulate.js";
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
 *
 * `maxHpOverride`, when supplied, wins over BOTH of the above: a real,
 * sourced historical HP value for one specific past encounter (e.g. a
 * retired raid tier whose HP pool has since changed — Niantic's 2020-08-27
 * tier-2/tier-4 merge folded those into today's tier-1/tier-3, silently
 * understating old tier-2 raids by 3.0x and old tier-4 raids by 2.5x if
 * simulated at today's stats), NOT a tuning knob. It overrides HP only — the
 * tier's attackDefenseMultiplier above is untouched by it, since Bulbapedia's
 * difficulty table only records CURRENT tier multipliers, not retired ones,
 * while per-row era HP is reliably recorded by the historical archives this
 * override is meant to feed from. HP is the dominant term of the two (up to
 * 3x historically) and the multiplier's own era drift is second-order (0.73
 * vs 0.79, ~8%) — so this override is a large, honest accuracy win even
 * though it leaves that ~8% residual un-era-corrected; that residual is
 * deliberate, not an oversight. Omitted/undefined leaves this function
 * byte-identical to before this parameter existed. A supplied value that
 * isn't finite and > 0 throws rather than silently producing a degenerate
 * 0-HP (or negative/NaN-HP) boss that would "die" instantly and report
 * absurd TDO — see this project's standing "no silent-degenerate-output"
 * lesson (DEFAULT_STEPWISE_MAX_SECONDS's own history is the same lesson
 * applied elsewhere).
 */
export function bossEffectiveHp(boss: SpeciesDefinition, tier?: RaidTier, maxHpOverride?: number): number {
  if (maxHpOverride !== undefined) {
    if (!Number.isFinite(maxHpOverride) || maxHpOverride <= 0) {
      throw new Error(
        `bossEffectiveHp's maxHpOverride must be a finite, positive HP value (got ${maxHpOverride}). ` +
          `This is meant to carry a real, sourced historical HP figure for one specific past encounter — ` +
          `omit it entirely to fall back to today's tier-derived default rather than passing an invalid value.`,
      );
    }
    return maxHpOverride;
  }
  if (boss.statsArePrecomputed) return boss.baseStamina;
  return raidTierStats(tier ?? defaultRaidTierForSpecies(boss)).hp;
}

/**
 * A Shadow raid boss's ENRAGED Attack/Defense — see shadow.ts's
 * shadowEnragedStats and MECHANICS.md's "Shadow raids" section. `null` for
 * any boss NOT flagged `isShadow` (every non-shadow boss never enrages at
 * all — this is the one gate that keeps enrage entirely out of a non-shadow
 * fight's math). Applies unconditionally to a `statsArePrecomputed` boss too
 * — there's nothing tier-specific about the enrage formula (it doesn't use
 * `attackDefenseMultiplier` at all, unlike bossEffectiveStats' normal-stats
 * branch), so a hand-authored precomputed test boss that sets `isShadow` gets
 * exactly the same enrage treatment a real synced Shadow boss does. Exported
 * (not just module-private) so teamRaid.ts's per-slot orchestrator can reuse
 * this instead of forking a second isShadow check.
 */
export function bossEnrageStats(boss: SpeciesDefinition): { attack: number; defense: number } | null {
  return boss.isShadow ? shadowEnragedStats(boss) : null;
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

/**
 * Resolves a candidate's/slot's effective Mega Level for this comparison —
 * `null` (no Mega Level effect at all: no Super Max effective-level CP bonus,
 * no "+" move power scaling beyond its stored Base-tier reading) whenever the
 * species has no `.boost` mechanic at all, regardless of what the caller
 * supplied — Mega Level is not a concept that applies to a non-mega species,
 * and megaLevel.ts's effectiveLevelForMegaLevel/chargedMoveAtMegaLevel are
 * themselves pure/ungated, so this gate is what keeps a stray non-null
 * megaLevel on a non-boosted species from silently granting a free +2
 * effective levels. `undefined`/`null` on an actual mega candidate resolves
 * to `null` too, which effectiveLevelForMegaLevel/chargedMoveAtMegaLevel both
 * already treat identically to `"base"` (no bonus, Base-tier "+" move power)
 * — so every existing caller that never passes this at all sees
 * byte-identical behavior. Exported so teamRaid.ts's/speciesReport.ts's/
 * powerUp.ts's own per-candidate wiring shares exactly this gate rather than
 * each re-deriving it slightly differently — ivComparison.ts now also calls
 * THIS function directly (it used to hand-roll only the `.boost` half of
 * this check locally; see this file's own history/megaLevel.ts's own
 * canReachSuperMax doc comment).
 *
 * SECOND GATE (added 2026-09-10, confirmed in-game observation — see
 * megaLevel.ts's canReachSuperMax): a request of exactly `"super-max"` is
 * additionally CLAMPED down to `"max"` — the highest tier every mega/primal
 * can reach regardless of "+" move eligibility — whenever `canReachSuperMax`
 * says this species can't actually get there. This is a CLAMP, not a throw:
 * a share link or saved scenario built before this gate existed (every mega
 * could reach super-max then — a real bug) degrades to the nearest legal
 * value on decode instead of erroring or silently keeping the illegal
 * +2-effective-level bonus. Every OTHER tier (base/high/max) is reachable by
 * every mega regardless of "+" move eligibility (see megaLevel.ts's
 * MegaLevel doc comment — they only ever affect re-Mega Energy cost/
 * cooldown), so `"super-max"` is the only value this second gate ever
 * touches; the clamp is invisible for every other input, including
 * `null`/`undefined`.
 */
export function resolveCandidateMegaLevel(
  species: Pick<SpeciesDefinition, "boost" | "chargedMoves">,
  megaLevel: MegaLevel | null | undefined,
): MegaLevel | null {
  if (!species.boost) return null;
  const resolved = megaLevel ?? null;
  return resolved === "super-max" && !canReachSuperMax(species) ? "max" : resolved;
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
  /**
   * Per-candidate Mega Level (see megaLevel.ts), matched by index to
   * `candidates` — `null`/omitted-per-index means no Mega Level effect for
   * that candidate (identical to `"base"`). UNLIKE candidateDodge (see
   * SustainedComparisonInputs below), this is NOT inert during the opening
   * burst: the candidate's own attack stat (Super Max's effective-level CP
   * bonus) and its own charged move (a "+" move's scaled power, if selected)
   * both feed simulateOpeningBurst's attacker profile directly, and the
   * attacker CAN land its own first charged move inside the opening-burst
   * window (only the BOSS is restricted to fast moves there — see combat.ts).
   * Defaults to `[null, null]` when omitted, so every existing caller needs
   * zero changes. Silently has no effect for a candidate whose species has no
   * `.boost` at all — see resolveCandidateMegaLevel.
   */
  candidateMegaLevel?: [MegaLevel | null, MegaLevel | null];
  /**
   * Per-candidate Best Buddy CP Boost, matched by index to `candidates` —
   * see megaLevel.ts's BEST_BUDDY_EFFECTIVE_LEVEL_BONUS/
   * effectiveLevelForBestBuddy for the mechanic (a free `+1` effective level,
   * unrelated to and gated independently of Mega Level — it applies to any
   * species, mega or not, and STACKS with candidateMegaLevel's Super Max
   * bonus if both are set for the same candidate). Defaults to
   * `[false, false]` when omitted, so every existing caller needs zero
   * changes.
   */
  candidateIsBestBuddy?: [boolean, boolean];
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
  /**
   * The friendship attack bonus tier assumed for BOTH candidates — see
   * damage.ts's FRIENDSHIP_ATTACK_BONUS_MULTIPLIER for the real 5-tier
   * Gym/Raid ladder this represents. Defaults to "none" (today's behavior:
   * no friendship bonus modeled), matching Scenario's default.
   *
   * UNLIKE weather, this is single-SIDED and single-trainer-scoped: it only
   * ever boosts a candidate's OWN fast/charged damage (fastDamageOut/
   * chargedDamageOut below), never the boss's (a raid boss has no "friend"
   * co-participating with it, and this engine has no multi-trainer modelling
   * at all — see CLAUDE.md's standing decision ruling out a "Teambuilding
   * Analyzer"). It is also NOT a team-wide boost like the mega/primal
   * `boostMultiplier` — setting this only ever changes the two candidates'
   * own numbers, exactly like weather's per-move `isWeatherBoosted` check,
   * never anything resembling team-boost attribution.
   */
  friendshipLevel?: FriendshipLevel;
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
    friendshipLevel = "none",
    candidateMegaBoostDisabled = [false, false],
    candidateMegaLevel = [null, null],
    candidateIsBestBuddy = [false, false],
  } = inputs;
  const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(boss, inputs.bossRaidTier);
  const bossFastMove = resolveMove(boss.fastMoves, inputs.bossFastMoveId);
  if (!bossFastMove) throw new Error(`Boss species ${boss.id} has no fast move defined.`);
  const bossChargedMove = resolveMove(boss.chargedMoves, inputs.bossChargedMoveId);
  const openingBurstSeconds =
    inputs.openingBurstSeconds ??
    (bossChargedMove ? bossChargedMoveReadySeconds(bossFastMove, bossChargedMove, bossStartingEnergy) : 20);

  return candidates.map((species, i) => {
    const megaLevel = resolveCandidateMegaLevel(species, candidateMegaLevel[i]);
    // Best Buddy's +1 effective level stacks with Super Max's +2 — see
    // megaLevel.ts's BEST_BUDDY_EFFECTIVE_LEVEL_BONUS doc comment. Applied
    // BEFORE effectiveLevelForMegaLevel per that function's own convention
    // (order is mathematically inert — both are a flat `+N` shift).
    const effectiveLevel = effectiveLevelForMegaLevel(effectiveLevelForBestBuddy(level, candidateIsBestBuddy[i]), megaLevel);
    const stats = effectiveStatsAtLevel(species, ivs, effectiveLevel);
    const fastMove = resolveMove(species.fastMoves, inputs.candidateFastMoveIds?.[i]);
    const rawChargedMove = resolveMove(species.chargedMoves, inputs.candidateChargedMoveIds?.[i]);
    if (!fastMove || !rawChargedMove) {
      throw new Error(`Candidate ${species.id} needs at least one fast move and one charged move.`);
    }
    // A "+" move's power is scaled for this candidate's current Mega Level
    // (no-op for every ordinary move) — see megaLevel.ts's
    // chargedMoveAtMegaLevel. Every downstream use of `chargedMove` (damage
    // calc, energy cost, duration) reads from this already-resolved object.
    const chargedMove = chargedMoveAtMegaLevel(rawChargedMove, megaLevel);
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
          friendshipLevel,
        },
        chargedDamageOut: {
          stab: species.types.includes(chargedMove.type),
          typeEffectiveness: candidateChargedVsBoss,
          megaBoostMultiplier: ownBoostMultiplier(boost, chargedMove.type),
          weatherBoosted: isWeatherBoosted(chargedMove.type, weather),
          friendshipLevel,
        },
      },
      {
        attackStat: bossAttackStat,
        defenseStat: bossDefenseStat,
        fastMove: bossFastMove,
        // NO friendshipLevel here — the bonus never applies to the boss's
        // own damage (a raid boss has no co-participating "friend"). See
        // ComparisonInputs.friendshipLevel's doc comment.
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
  /** See ComparisonInputs.candidateMegaLevel — same per-candidate semantics, same resolveCandidateMegaLevel gate on species.boost. Defaults to [null, null]. */
  candidateMegaLevel?: [MegaLevel | null, MegaLevel | null];
  /** See ComparisonInputs.candidateIsBestBuddy — same per-candidate semantics, stacks with candidateMegaLevel's Super Max bonus. Defaults to [false, false]. */
  candidateIsBestBuddy?: [boolean, boolean];
  boss: SpeciesDefinition;
  /** See ComparisonInputs.bossRaidTier. */
  bossRaidTier?: RaidTier;
  /**
   * Override for the boss's effective max HP for THIS comparison — see
   * comparison.ts's bossEffectiveHp doc comment for the full contract (a
   * real, sourced historical HP figure for one specific past encounter, not
   * a tuning knob; overrides HP only, never the tier's own
   * attackDefenseMultiplier). Omitted/undefined is byte-identical to before
   * this field existed — the result's bossMaxHp still comes from
   * bossEffectiveHp(boss, bossRaidTier) exactly as it always implicitly did
   * for any caller that needed it. A non-finite or non-positive value throws.
   */
  bossMaxHpOverride?: number;
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
   * Per-candidate override for `dodge` above, matched by index to
   * `candidates` — lets a caller compare, e.g., a bulky candidate played
   * with no dodging against a glass cannon played with perfect dodging,
   * a real A-vs-B question this product's whole thesis is built on (two
   * mega forms rarely have one "winner" once play style is factored in).
   * `null` (or an omitted index/whole field) means "use the shared `dodge`
   * above for this candidate" — today's behavior. Omitting the field
   * entirely is byte-identical to before it existed.
   */
  candidateDodge?: (DodgeBehavior | null)[];
  /**
   * Per-candidate override for `dodgeFastAttacks` above — see
   * candidateDodge. `null` means "use the shared `dodgeFastAttacks`
   * above for this candidate", NOT "false" — an explicit `false` override
   * is preserved (resolved via `??`, which only falls through on
   * null/undefined).
   */
  candidateDodgeFastAttacks?: (boolean | null)[];
  /**
   * Hold the charged move for a safer moment instead of firing the instant
   * energy allows — see simulate.ts's StepwiseAttacker.holdChargedMoveUntilSafe
   * for the exact trigger conditions. Defaults to false (today's
   * fire-immediately behavior).
   */
  holdChargedMoveUntilSafe?: boolean;
  /** Mean seconds between the boss's charged moves once the sustained phase begins. Only consulted when bossChargedMoveCadence is "fixed-interval" (the default); under "energy-gated-interval" the SAME field means mean delay after the boss becomes energy-eligible instead (and is required there); ignored entirely under "energy-driven" — see that field's doc comment. */
  bossChargedMoveMeanIntervalSeconds: number;
  /**
   * Which model decides when the boss throws its charged move — see
   * simulate.ts's StepwiseBoss.chargedMoveCadence for the full model and its
   * sourcing caveats. Defaults to "fixed-interval", byte-identical to this
   * field's absence before it existed. "energy-driven" models the boss
   * gaining energy from damage taken (not just its own fast move), so a
   * higher-DPS candidate makes the boss throw its charged move sooner/more
   * often — the real feedback loop the fixed-interval model misses entirely.
   * "energy-gated-interval" gates eligibility the same way, but then rolls
   * one fixed-interval-style jittered delay before actually firing, rather
   * than a per-move-boundary coin flip.
   */
  bossChargedMoveCadence?: BossChargedMoveCadence;
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
  /** See ComparisonInputs.friendshipLevel — same single-sided, single-trainer-scoped semantics (never applied to the boss). Defaults to "none". */
  friendshipLevel?: FriendshipLevel;
}

export interface SustainedCandidateResult extends DistributionSummary {
  id: string;
  name: string;
  /**
   * The boss's resolved effective max HP for this comparison — see
   * bossEffectiveHp. Identical across every row of a single
   * runSustainedComparison call (the boss doesn't change per candidate);
   * surfaced per-row purely so a caller never has to re-derive it (or
   * duplicate the statsArePrecomputed/tier/override branch) itself, the same
   * convenience `id`/`name` already provide. NOTE: the sustained simulation
   * itself (simulate.ts) still never consumes this value for termination —
   * a candidate's own meanTotalDamage/meanSecondsSurvived are computed
   * exactly as before regardless of this field or of bossMaxHpOverride; boss
   * HP is only ever compared against accumulated damage in caller-side
   * post-processing (see teamRaid.ts's runTeamRaid, and speciesReport.ts's
   * intended reverse-lookup use).
   */
  bossMaxHp: number;
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
    bossChargedMoveCadence,
    bossChargedMoveWarmupSeconds,
    bossStartingEnergy = 0,
    maxSeconds = DEFAULT_STEPWISE_MAX_SECONDS,
    iterations = 200,
    weather = "none",
    friendshipLevel = "none",
    candidateMegaBoostDisabled = [false, false],
    candidateMegaLevel = [null, null],
    candidateIsBestBuddy = [false, false],
  } = inputs;
  const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(boss, inputs.bossRaidTier);
  const bossMaxHp = bossEffectiveHp(boss, inputs.bossRaidTier, inputs.bossMaxHpOverride);
  const bossEnrage = bossEnrageStats(boss);
  const bossFastMove = resolveMove(boss.fastMoves, inputs.bossFastMoveId);
  const bossChargedMove = resolveMove(boss.chargedMoves, inputs.bossChargedMoveId);
  if (!bossFastMove) throw new Error(`Boss species ${boss.id} has no fast move defined.`);

  return candidates.map((species, i) => {
    const megaLevel = resolveCandidateMegaLevel(species, candidateMegaLevel[i]);
    // See runComparison's identical comment — Best Buddy's +1 stacks with
    // Super Max's +2.
    const effectiveLevel = effectiveLevelForMegaLevel(effectiveLevelForBestBuddy(level, candidateIsBestBuddy[i]), megaLevel);
    const stats = effectiveStatsAtLevel(species, ivs, effectiveLevel);
    const fastMove = resolveMove(species.fastMoves, inputs.candidateFastMoveIds?.[i]);
    const rawChargedMove = resolveMove(species.chargedMoves, inputs.candidateChargedMoveIds?.[i]);
    if (!fastMove || !rawChargedMove) {
      throw new Error(`Candidate ${species.id} needs at least one fast move and one charged move.`);
    }
    // See runComparison's identical comment — a "+" move's power is scaled
    // for this candidate's current Mega Level here, once, before every
    // downstream use of `chargedMove`.
    const chargedMove = chargedMoveAtMegaLevel(rawChargedMove, megaLevel);
    const candidateFastVsBoss = typeEffectiveness(fastMove.type, boss.types);
    const candidateChargedVsBoss = typeEffectiveness(chargedMove.type, boss.types);
    const bossVsCandidate = typeEffectiveness(bossFastMove.type, species.types);
    const bossChargedVsCandidate = bossChargedMove ? typeEffectiveness(bossChargedMove.type, species.types) : 1;
    const boost = resolveBoost(species, candidateMegaBoostDisabled[i] ?? false);
    // A null/absent per-candidate entry falls back to the shared dodge/
    // dodgeFastAttacks above — see SustainedComparisonInputs.candidateDodge.
    const resolvedDodge = inputs.candidateDodge?.[i] ?? dodge;
    const resolvedDodgeFastAttacks = inputs.candidateDodgeFastAttacks?.[i] ?? dodgeFastAttacks;

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
            friendshipLevel,
          },
          chargedDamageOut: {
            stab: species.types.includes(chargedMove.type),
            typeEffectiveness: candidateChargedVsBoss,
            megaBoostMultiplier: ownBoostMultiplier(boost, chargedMove.type),
            weatherBoosted: isWeatherBoosted(chargedMove.type, weather),
            friendshipLevel,
          },
          holdChargedMoveUntilSafe,
        },
        // NO friendshipLevel on the boss's own damageOut/chargedMoveDamageOut
        // below — see SustainedComparisonInputs.friendshipLevel's doc comment.
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
          chargedMoveCadence: bossChargedMoveCadence,
          chargedMoveMeanIntervalSeconds: bossChargedMoveMeanIntervalSeconds,
          chargedMoveWarmupSeconds: bossChargedMoveWarmupSeconds,
          startingEnergy: bossStartingEnergy,
          // Shadow raid enrage — see simulate.ts's StepwiseBoss.enrage.
          // Undefined (no-op) for every non-shadow boss. Each candidate here
          // fights a FRESH boss (runSustainedComparison never carries damage
          // across candidates), so damageDealtBeforeFight is left at its
          // default 0 — unlike teamRaid.ts, which threads a running total
          // across slots of the SAME continuous encounter.
          enrage: bossEnrage ? { maxHp: bossMaxHp, attackStat: bossEnrage.attack, defenseStat: bossEnrage.defense } : undefined,
        },
        dodge: resolvedDodge,
        dodgeFastAttacks: resolvedDodgeFastAttacks,
        maxSeconds,
      },
      iterations,
    );

    return { id: species.id, name: species.name, bossMaxHp, ...distribution };
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
