import { bossChargedMoveReadySeconds } from "./combat.js";
import type { DamageTrajectoryPoint } from "./combat.js";
import { DODGE_COST_SECONDS, DODGE_DAMAGE_MULTIPLIER, dodgeMultiplierForHit, type DodgeBehavior } from "./breakpoints.js";
import { calculateDamage, type DamageInputs } from "./damage.js";
import { energyFromDamageTaken, MAX_ENERGY } from "./energy.js";
import type { ChargedMove, FastMove } from "./types.js";

/**
 * Phase 5: a stepwise (100ms-tick) battle simulator. Unlike combat.ts's
 * simulateOpeningBurst (deterministic, boss uses only its fast move), this
 * models the sustained phase: the boss's charged-move timing is randomized,
 * so a single run is a single sample — callers should run many (see
 * runStepwiseDistribution) and report a distribution, not a point estimate.
 * It also models the attacker's own charged-move animation as a vulnerability
 * window: if the boss's next hit lands before that animation completes, the
 * attacker faints before the attack lands and it counts for nothing — the
 * "died mid-animation" failure mode the source analysis flagged as a known
 * caveat instead of assuming it away. Every boss hit (fast or charged) that
 * lands during that window is guaranteed to deal full damage: a dodge input
 * cannot be thrown mid-animation, and a dodge's ~0.7s reduction window
 * couldn't cover a multi-second cast even if it could — so the configured
 * DodgeBehavior is ignored for hits landing in this window specifically.
 * Boss charged moves are modeled as landing all at once at their fire time
 * (a "fast damage window"), the same as boss fast moves — there is no
 * separate windup phase to dodge around.
 *
 * Tick-quantization assumption: every event (fast-move cadence, charged-move
 * cast duration) is scheduled by repeatedly adding a move's durationSeconds
 * to the tick it last fired on, then rounding to the nearest tick boundary —
 * so this whole model implicitly assumes every real move's durationSeconds
 * is an exact multiple of the tick (checked as of 2026-09-05 against all 77
 * fast + 240 charged moves in data/raw/{fast,charged}_moves.json — zero
 * violations). If that ever stopped holding (e.g. a future data source with
 * finer-grained timing introduces a move with, say, a 350ms duration), the
 * event-scheduling anchored off the actual quantized fire tick would
 * silently push that move's subsequent fires up to just-under-one-tick later
 * per cycle than a continuous-time simulation would — a real, per-cycle
 * bounded drift, not unbounded, but real and silent. assertTickAligned below
 * turns that into a loud failure instead of a silently-skewed number.
 */

export const DEFAULT_TICK_SECONDS = 0.1;

/**
 * Whether `durationSeconds` lands exactly on a tick boundary. Checked in
 * milliseconds (rounding each side to the nearest ms) rather than raw
 * floating-point division — e.g. 3.5 / 0.1 is not exactly 35 in IEEE 754, so
 * a naive `% tickSeconds === 0` check would produce false negatives for
 * ordinary, correctly-aligned real-game durations.
 */
export function isTickAlignedDuration(durationSeconds: number, tickSeconds: number): boolean {
  const tickMs = Math.round(tickSeconds * 1000);
  if (tickMs <= 0) return true;
  const durationMs = Math.round(durationSeconds * 1000);
  return durationMs % tickMs === 0;
}

/**
 * Throws if `durationSeconds` isn't an exact multiple of the simulation
 * tick — see the module doc comment above for why this matters. Every real
 * synced move currently satisfies this; a violation means either a
 * hand-authored fixture with a bad duration, or a future data source with
 * finer-grained timing than this simulator supports (a real gap to close,
 * not a fixture to silently accept).
 */
function assertTickAligned(durationSeconds: number, tickSeconds: number, label: string): void {
  if (!isTickAlignedDuration(durationSeconds, tickSeconds)) {
    throw new Error(
      `${label} has durationSeconds=${durationSeconds}, which is not an exact multiple of the ` +
        `${tickSeconds}s simulation tick. See simulate.ts's module doc comment: every event's ` +
        `timing is scheduled by repeatedly adding durationSeconds to the last quantized fire ` +
        `tick, so a non-tick-aligned duration would silently delay this move's fires by up to ` +
        `just-under-one-tick per cycle rather than failing loudly.`,
    );
  }
}

/**
 * Generous safety cap on how long a single sustained-phase run simulates, in
 * seconds. Raised from an earlier 60 specifically so a small/degenerate
 * caller-supplied maxSeconds can no longer silently truncate a fight before
 * anything happens (see comparison.ts — this is now the one place that value
 * comes from unless a caller has a specific reason to override it). A
 * 100ms-tick x 200-iteration run at this length still completes in
 * milliseconds, so there's no real cost to being generous here.
 */
export const DEFAULT_STEPWISE_MAX_SECONDS = 180;

/** Boss charged-move intervals are randomized uniformly within +/-40% of the mean. */
export const BOSS_CHARGED_MOVE_JITTER = 0.4;

export interface StepwiseAttacker {
  hp: number;
  defenseStat: number;
  attackStat: number;
  fastMove: FastMove;
  chargedMove: ChargedMove;
  /** Damage modifiers for the attacker's OWN FAST move — see combat.ts's AttackerProfile.fastDamageOut for why this is separate from chargedDamageOut (STAB/type-effectiveness depend on the move's own type). */
  fastDamageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  /** Damage modifiers for the attacker's OWN CHARGED move. */
  chargedDamageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  /**
   * When true, don't fire the charged move the instant energy allows it —
   * hold it (energy capped at MAX_ENERGY while waiting) until either the
   * attacker just successfully dodged one of the boss's CHARGED hits (the
   * safe-window trigger: your cast is least likely to overlap the boss's
   * next one right after you've just avoided the last one) or energy hits
   * MAX_ENERGY (forced, so further fast-move energy gain isn't wasted).
   * With no dodging configured, the safe-window trigger never fires, so this
   * degrades to "hold until the energy cap forces it" — still a real,
   * intentional behavior. Only meaningful when the boss has a charged move
   * to dodge in the first place (sustained phase); defaults to false
   * (today's fire-immediately behavior).
   */
  holdChargedMoveUntilSafe?: boolean;
}

export interface StepwiseBoss {
  attackStat: number;
  defenseStat: number;
  fastMove: FastMove;
  damageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  /** Boss charged move; omit to reproduce the opening-burst-only behavior. */
  chargedMove?: ChargedMove;
  chargedMoveDamageOut?: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  /** Mean seconds between the boss's charged moves once it starts using them. */
  chargedMoveMeanIntervalSeconds?: number;
  /**
   * Seconds before the boss can use its first charged move at all. Defaults
   * to the physically-derived bossChargedMoveReadySeconds(fastMove,
   * chargedMove, startingEnergy) rather than 0 — a boss cannot fire a charged
   * move before its own fast move has generated enough energy for it.
   */
  chargedMoveWarmupSeconds?: number;
  /**
   * Energy the boss already has saved when the fight begins (0-energyCost),
   * e.g. modeling a mega that tags in mid-fight against a boss an earlier
   * trainer's mega already left partway charged. Only affects the *default*
   * chargedMoveWarmupSeconds above; ignored if that's set explicitly.
   * Defaults to 0 (today's implicit assumption: every fight starts fresh).
   */
  startingEnergy?: number;
  /**
   * Seconds until the boss's charged move fires again, ALREADY fully
   * resolved — no jitteredInterval is rolled on top of this, unlike
   * chargedMoveWarmupSeconds (which represents "seconds until first becoming
   * energy-ready," always followed by one more random interval roll before
   * the actual first cast — correct for a fresh fight, wrong for a cooldown
   * that's already mid-countdown). Set this instead of
   * chargedMoveWarmupSeconds/startingEnergy specifically to carry a boss's
   * already-ticking charged-move cooldown across a trainer's team-raid slot
   * handoff (see teamRaid.ts and StepwiseRunResult.bossChargedMoveResidualSeconds,
   * this run's own version of the same value) — reusing chargedMoveWarmupSeconds
   * directly for that purpose would double up a cooldown that had already
   * fully rolled its random interval in the previous slot's run, silently
   * granting the next slot extra free time. Takes priority over
   * chargedMoveWarmupSeconds/startingEnergy when set.
   */
  chargedMoveNextFireInSeconds?: number;
}

export interface StepwiseRunResult {
  faintedAtSeconds: number | null;
  survivedFullWindow: boolean;
  chargedAttacksLanded: number;
  totalChargedDamage: number;
  /** Damage the attacker's own fast move dealt to the boss over the run. */
  totalFastMoveDamage: number;
  totalDamageTaken: number;
  /**
   * True if the attacker fainted while mid-animation on its own charged
   * move — that ONE (fatal) cast never landed. This is NOT the same claim as
   * "totalChargedDamage is 0 for this run": an attacker can gain enough
   * energy purely from damage taken (see energy.ts's
   * ENERGY_PER_DAMAGE_TAKEN) to fire a charged move, have it land, and then
   * immediately re-enter a SECOND cast (still using leftover/accumulated
   * energy) before dying mid that second one — a real, correctly-modeled
   * sequence, not a bug. In that case chargedAttacksLanded/totalChargedDamage
   * reflect the first (successful) cast, while this flag is true because of
   * the second (interrupted) one. A caller must not assume
   * diedDuringOwnChargedMoveAnimation implies zero charged damage for the
   * run as a whole — see simulate.test.ts's "died mid own-animation does not
   * imply zero total charged damage" test, which pins exactly this sequence.
   */
  diedDuringOwnChargedMoveAnimation: boolean;
  bossChargedHitsTaken: number;
  /** Combined fast+charged cumulative own damage over time — see OpeningBurstResult.ownDamageTrajectory (combat.ts) for the exact shape/semantics. */
  ownDamageTrajectory: DamageTrajectoryPoint[];
  /**
   * Cumulative damage the ATTACKER TOOK over time — same shape/semantics as
   * ownDamageTrajectory (a point at {0, 0}, one point each time a boss hit
   * — fast or charged, post-dodge-multiplier — actually lands on hp, and a
   * final point padded out to the run's end time), so a caller can chart or
   * sample both trajectories at the same set of times and compare them
   * directly.
   */
  damageTakenTrajectory: DamageTrajectoryPoint[];
  /**
   * How many seconds were left on the boss's charged-move cooldown when this
   * run ended (attacker fainted, or hit maxSeconds) — null when the boss has
   * no charged-move timing configured at all (no chargedMove, or no
   * chargedMoveMeanIntervalSeconds), since there's nothing to carry forward
   * in that case. Clamped to >= 0 (a run can end exactly on the tick the
   * boss's charged move was scheduled to fire, which nextBossChargedMoveAt
   * already reflects as having "fired," not gone negative).
   *
   * The one real consumer of this is teamRaid.ts's sequential slot-handoff
   * orchestrator: feed this straight into the next slot's
   * StepwiseBoss.chargedMoveWarmupSeconds so the boss's own attack cadence
   * doesn't reset just because the trainer swapped in a fresh Pokémon — this
   * field is exactly the piece the doc comment on chargedMoveWarmupSeconds/
   * startingEnergy above already anticipated ("a mega that tags in mid-fight
   * against a boss an earlier trainer's mega already left partway charged"),
   * generalized from a multi-trainer scenario to a single trainer's own
   * sequential swap-in, which is mechanically identical from the boss's side.
   */
  bossChargedMoveResidualSeconds: number | null;
}

/** Simple seeded PRNG (mulberry32) so a given seed always reproduces the same run. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitteredInterval(mean: number, rng: () => number): number {
  const factor = 1 - BOSS_CHARGED_MOVE_JITTER + rng() * (2 * BOSS_CHARGED_MOVE_JITTER);
  return mean * factor;
}

export interface StepwiseSimulationParams {
  attacker: StepwiseAttacker;
  boss: StepwiseBoss;
  /** Governs dodging the boss's CHARGED attacks only. */
  dodge?: DodgeBehavior;
  /** Whether the attacker also attempts to dodge the boss's fast attacks — a plain boolean (not a percentage), since dodging every fast attack is a yes/no decision, not a skill dial. Costs DODGE_COST_SECONDS per attempt, same as a charged-attack dodge attempt. Defaults to false. */
  dodgeFastAttacks?: boolean;
  tickSeconds?: number;
  maxSeconds?: number;
  seed?: number;
}

export function simulateStepwiseBattle(params: StepwiseSimulationParams): StepwiseRunResult {
  const { attacker, boss } = params;
  const dodge = params.dodge ?? { kind: "none" };
  const dodgeFastAttacks = params.dodgeFastAttacks ?? false;
  const tick = params.tickSeconds ?? DEFAULT_TICK_SECONDS;
  const maxSeconds = params.maxSeconds ?? DEFAULT_STEPWISE_MAX_SECONDS;
  const rng = mulberry32(params.seed ?? 1);

  assertTickAligned(attacker.fastMove.durationSeconds, tick, `Attacker fast move "${attacker.fastMove.name}"`);
  assertTickAligned(attacker.chargedMove.durationSeconds, tick, `Attacker charged move "${attacker.chargedMove.name}"`);
  assertTickAligned(boss.fastMove.durationSeconds, tick, `Boss fast move "${boss.fastMove.name}"`);
  if (boss.chargedMove) {
    assertTickAligned(boss.chargedMove.durationSeconds, tick, `Boss charged move "${boss.chargedMove.name}"`);
  }

  let hp = attacker.hp;
  let energy = 0;
  let totalDamageTaken = 0;
  let chargedAttacksLanded = 0;
  let totalChargedDamage = 0;
  let totalFastMoveDamage = 0;
  let bossChargedHitsTaken = 0;
  let chargedHitIndex = 0;
  let faintedAtSeconds: number | null = null;
  let diedDuringOwnChargedMoveAnimation = false;
  const ownDamageTrajectory: DamageTrajectoryPoint[] = [{ atSeconds: 0, cumulativeDamage: 0 }];
  const damageTakenTrajectory: DamageTrajectoryPoint[] = [{ atSeconds: 0, cumulativeDamage: 0 }];

  let nextAttackerFastMoveAt = attacker.fastMove.durationSeconds;
  let nextBossFastMoveAt = boss.fastMove.durationSeconds;
  let attackerAnimationEndsAt: number | null = null;

  let nextBossChargedMoveAt: number | null = null;
  if (boss.chargedMove && boss.chargedMoveMeanIntervalSeconds) {
    if (boss.chargedMoveNextFireInSeconds != null) {
      // Already fully resolved (carried forward from a prior slot's residual
      // cooldown) — no additional jitteredInterval roll on top.
      nextBossChargedMoveAt = boss.chargedMoveNextFireInSeconds;
    } else {
      const warmup =
        boss.chargedMoveWarmupSeconds ??
        bossChargedMoveReadySeconds(boss.fastMove, boss.chargedMove, boss.startingEnergy ?? 0);
      nextBossChargedMoveAt = warmup + jitteredInterval(boss.chargedMoveMeanIntervalSeconds, rng);
    }
  }

  const EPS = 1e-9;
  for (let t = tick; t <= maxSeconds + EPS; t += tick) {
    const roundedT = Math.round(t * 1000) / 1000;

    // Attacker's own charged-move animation completing — resolved BEFORE the
    // boss's hit below, deliberately, for a same-tick-tie reason: the boss-hit
    // block's own isMidOwnAnimation check already uses a strict `<` against
    // attackerAnimationEndsAt, meaning a hit landing on the EXACT tick the
    // animation ends is already treated as "no longer mid-animation" (full
    // dodge rules apply, not the forced-full-damage window). That convention
    // only makes sense if the cast is considered to have finished BY this
    // tick — so the landing must be credited before a same-tick boss hit is
    // resolved, otherwise a fatal same-tick hit would silently discard an
    // attack the rest of the model already treats as having gone off. This
    // was a real bug (not a deliberate tie-break) caught by exercising the
    // exact-tie case in a test — see simulate.test.ts's
    // "same-tick tie" describe block.
    if (attackerAnimationEndsAt !== null && roundedT >= attackerAnimationEndsAt - EPS) {
      const damage = calculateDamage({
        power: attacker.chargedMove.power,
        attackerAttackStat: attacker.attackStat,
        defenderDefenseStat: boss.defenseStat,
        ...attacker.chargedDamageOut,
      });
      totalChargedDamage += damage;
      chargedAttacksLanded += 1;
      attackerAnimationEndsAt = null;
      ownDamageTrajectory.push({ atSeconds: roundedT, cumulativeDamage: totalFastMoveDamage + totalChargedDamage });
    }

    // Boss charged move takes priority over its fast move in the same tick.
    let bossHitDamage: number | null = null;
    let isBossChargedHit = false;
    if (nextBossChargedMoveAt !== null && roundedT >= nextBossChargedMoveAt - EPS) {
      bossHitDamage = calculateDamage({
        power: boss.chargedMove!.power,
        attackerAttackStat: boss.attackStat,
        defenderDefenseStat: attacker.defenseStat,
        ...(boss.chargedMoveDamageOut ?? boss.damageOut),
      });
      isBossChargedHit = true;
      nextBossChargedMoveAt = roundedT + jitteredInterval(boss.chargedMoveMeanIntervalSeconds!, rng);
    } else if (roundedT >= nextBossFastMoveAt - EPS) {
      bossHitDamage = calculateDamage({
        power: boss.fastMove.power,
        attackerAttackStat: boss.attackStat,
        defenderDefenseStat: attacker.defenseStat,
        ...boss.damageOut,
      });
      nextBossFastMoveAt = roundedT + boss.fastMove.durationSeconds;
    }

    // Set within the block below when this tick's hit was a charged hit the
    // attacker successfully dodged — the "safe window" trigger for
    // holdChargedMoveUntilSafe, checked further down in this same tick.
    let justDodgedChargedHit = false;

    if (bossHitDamage !== null) {
      if (isBossChargedHit) {
        bossChargedHitsTaken += 1;
        chargedHitIndex += 1;
      }
      // Locked into your own charged-move animation, you cannot input a new
      // dodge — a dodge's damage-reduction window (~0.7s, see
      // DODGE_WINDOW_SECONDS) cannot cover a multi-second cast anyway. Any
      // hit landing in this window is guaranteed to land at full damage,
      // regardless of the configured dodge behavior, and no dodge is even
      // attempted (so it costs no time either — see DODGE_COST_SECONDS below).
      // By this point attackerAnimationEndsAt has already been nulled above
      // if the cast finished on this exact tick, so isMidOwnAnimation is
      // correctly false for a same-tick tie (matching the strict `<` this
      // always used, even before the reorder above).
      const isMidOwnAnimation = attackerAnimationEndsAt !== null && roundedT < attackerAnimationEndsAt - EPS;
      // `dodge` (DodgeBehavior) governs charged hits only; `dodgeFastAttacks`
      // is a separate plain boolean for fast hits — see the type docs above.
      const attemptingDodge = !isMidOwnAnimation && (isBossChargedHit ? dodge.kind !== "none" : dodgeFastAttacks);
      const dodgeMultiplier = isMidOwnAnimation
        ? 1
        : isBossChargedHit
          ? dodgeMultiplierForHit(dodge, chargedHitIndex, boss.chargedMove?.perfectlyDodgeable ?? true)
          : dodgeFastAttacks
            ? DODGE_DAMAGE_MULTIPLIER
            : 1;
      justDodgedChargedHit = isBossChargedHit && dodgeMultiplier === DODGE_DAMAGE_MULTIPLIER;
      const damage = Math.floor(bossHitDamage * dodgeMultiplier);
      totalDamageTaken += damage;
      hp -= damage;
      damageTakenTrajectory.push({ atSeconds: roundedT, cumulativeDamage: totalDamageTaken });
      if (hp <= 0) {
        faintedAtSeconds = roundedT;
        diedDuringOwnChargedMoveAnimation = attackerAnimationEndsAt !== null && roundedT < attackerAnimationEndsAt - EPS;
        // Everything else that could also be scheduled on this exact tick
        // (the attacker's own fast move firing, or starting a new charged
        // cast further down this loop body) is discarded by this break —
        // "boss wins the tie" for those specifically, a deliberate,
        // arbitrary-but-chosen convention (there's no finer-grained signal
        // to break the tie by, unlike the charged-move-landing case handled
        // above) matching combat.ts's simulateOpeningBurst, which documents
        // the same choice for its own event merge.
        break;
      }
      energy = Math.min(energy + energyFromDamageTaken(damage), MAX_ENERGY);
      // Dodging is a distinct input that interrupts your own attack cycle —
      // every attempt (hit or miss) costs DODGE_COST_SECONDS, pushing your
      // own next fast move later. No attempt (and so no cost) happens while
      // mid-own-animation, since attemptingDodge is already false there.
      if (attemptingDodge) nextAttackerFastMoveAt += DODGE_COST_SECONDS;
    }

    // Attacker's own fast move — locked out while mid-charged-move-animation.
    // Energy is capped at MAX_ENERGY (the real game's per-Pokémon stored-energy
    // cap) — a no-op for the default fire-immediately behavior below (energy
    // is reset to 0 well before it could approach 100), but meaningful once
    // holdChargedMoveUntilSafe lets energy accumulate while waiting. The fast
    // move also deals damage to the boss, not just energy — tracked
    // separately (totalFastMoveDamage) and folded into the combined trajectory.
    if (attackerAnimationEndsAt === null && roundedT >= nextAttackerFastMoveAt - EPS) {
      energy = Math.min(energy + attacker.fastMove.energyGain, MAX_ENERGY);
      nextAttackerFastMoveAt = roundedT + attacker.fastMove.durationSeconds;
      const fastDamage = calculateDamage({
        power: attacker.fastMove.power,
        attackerAttackStat: attacker.attackStat,
        defenderDefenseStat: boss.defenseStat,
        ...attacker.fastDamageOut,
      });
      totalFastMoveDamage += fastDamage;
      ownDamageTrajectory.push({ atSeconds: roundedT, cumulativeDamage: totalFastMoveDamage + totalChargedDamage });
    }

    // Fire the charged move as soon as energy allows — UNLESS holding for a
    // safer moment: then wait for either the safe-window trigger (just
    // dodged one of the boss's charged hits) or being forced by hitting the
    // energy cap (see StepwiseAttacker.holdChargedMoveUntilSafe).
    if (attackerAnimationEndsAt === null && energy >= attacker.chargedMove.energyCost) {
      const shouldFireNow = !attacker.holdChargedMoveUntilSafe || justDodgedChargedHit || energy >= MAX_ENERGY;
      if (shouldFireNow) {
        energy = 0;
        attackerAnimationEndsAt = roundedT + attacker.chargedMove.durationSeconds;
      }
    }
  }

  const endSeconds = faintedAtSeconds ?? maxSeconds;
  const lastDamagePoint = ownDamageTrajectory[ownDamageTrajectory.length - 1]!;
  if (lastDamagePoint.atSeconds < endSeconds) {
    ownDamageTrajectory.push({ atSeconds: endSeconds, cumulativeDamage: lastDamagePoint.cumulativeDamage });
  }
  const lastDamageTakenPoint = damageTakenTrajectory[damageTakenTrajectory.length - 1]!;
  if (lastDamageTakenPoint.atSeconds < endSeconds) {
    damageTakenTrajectory.push({ atSeconds: endSeconds, cumulativeDamage: lastDamageTakenPoint.cumulativeDamage });
  }

  const bossChargedMoveResidualSeconds =
    nextBossChargedMoveAt !== null ? Math.max(0, nextBossChargedMoveAt - endSeconds) : null;

  return {
    faintedAtSeconds,
    survivedFullWindow: faintedAtSeconds === null,
    chargedAttacksLanded,
    totalChargedDamage,
    totalFastMoveDamage,
    totalDamageTaken,
    diedDuringOwnChargedMoveAnimation,
    bossChargedHitsTaken,
    ownDamageTrajectory,
    damageTakenTrajectory,
    bossChargedMoveResidualSeconds,
  };
}

export interface DistributionSummary {
  iterations: number;
  /** Combined fast+charged damage per run (was charged-only before fast-move damage was tracked) — the true total DPS output, not just charged attacks. */
  meanTotalDamage: number;
  medianTotalDamage: number;
  p10TotalDamage: number;
  p90TotalDamage: number;
  /** Breakdown alongside the combined totals above, for displaying how much of the total came from each move type. */
  meanChargedDamage: number;
  meanFastMoveDamage: number;
  meanSecondsSurvived: number;
  fractionSurvivedFullWindow: number;
  fractionDiedDuringOwnAnimation: number;
  /**
   * The first iteration's full run (seed = baseSeed), exposed so callers have
   * one concrete, reproducible ownDamageTrajectory to chart even though the
   * underlying phase is randomized — not a claim that this run is typical,
   * just a stable example alongside the distribution stats above.
   */
  representativeRun: StepwiseRunResult;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index]!;
}

/**
 * Runs `iterations` independent samples (each with its own seed derived from
 * `baseSeed`) and reports a distribution rather than a single point estimate —
 * required because the boss's charged-move timing is randomized per Phase 5.
 */
export function runStepwiseDistribution(
  params: Omit<StepwiseSimulationParams, "seed">,
  iterations = 200,
  baseSeed = 1,
): DistributionSummary {
  const runs: StepwiseRunResult[] = [];
  for (let i = 0; i < iterations; i++) {
    runs.push(simulateStepwiseBattle({ ...params, seed: baseSeed + i * 7919 }));
  }

  const damages = runs.map((r) => r.totalChargedDamage + r.totalFastMoveDamage).sort((a, b) => a - b);
  const survivalSeconds = runs.map((r) => r.faintedAtSeconds ?? (params.maxSeconds ?? DEFAULT_STEPWISE_MAX_SECONDS));

  return {
    iterations,
    meanTotalDamage: damages.reduce((sum, d) => sum + d, 0) / iterations,
    medianTotalDamage: percentile(damages, 0.5),
    p10TotalDamage: percentile(damages, 0.1),
    p90TotalDamage: percentile(damages, 0.9),
    meanChargedDamage: runs.reduce((sum, r) => sum + r.totalChargedDamage, 0) / iterations,
    meanFastMoveDamage: runs.reduce((sum, r) => sum + r.totalFastMoveDamage, 0) / iterations,
    meanSecondsSurvived: survivalSeconds.reduce((sum, s) => sum + s, 0) / iterations,
    fractionSurvivedFullWindow: runs.filter((r) => r.survivedFullWindow).length / iterations,
    fractionDiedDuringOwnAnimation: runs.filter((r) => r.diedDuringOwnChargedMoveAnimation).length / iterations,
    representativeRun: runs[0]!,
  };
}
