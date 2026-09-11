import { bossChargedMoveReadySeconds } from "./combat.js";
import type { DamageTrajectoryPoint } from "./combat.js";
import {
  DODGE_COST_SECONDS,
  DODGE_DAMAGE_MULTIPLIER,
  dodgeMultiplierForHit,
  fastMoveCadenceTooFastToDodge,
  type DodgeBehavior,
} from "./breakpoints.js";
import { calculateDamage, type DamageInputs } from "./damage.js";
import { bossEnergyFromDamageTaken, energyFromDamageTaken, MAX_ENERGY } from "./energy.js";
import { shadowEnragePhaseForHpFraction } from "./shadow.js";
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

/**
 * Floor guard for a physically impossible boss charged-move cadence. A boss
 * cannot begin a new charged move before its current one has finished
 * executing — so no sampled inter-arrival time may ever be shorter than the
 * charged move's own `durationSeconds`. Without this, a caller-supplied
 * `chargedMoveMeanIntervalSeconds` shorter than the move's cast time produces
 * back-to-back/overlapping casts that silently make dodging worthless (every
 * hit lands inside the attacker's own vulnerability window with no gap to
 * dodge into) — a real, reported modeling defect (Regirock's 2.5s Stone Edge
 * requested at a 2.0s cadence), not a hypothetical one.
 *
 * Deliberately `durationSeconds` alone, NOT duration + one boss fast-move
 * cycle: a real boss does interleave fast attacks between charged moves, so
 * the true minimum gap is almost certainly larger than this in practice, but
 * there is no sourced constant for how much larger (that would depend on the
 * boss's own energy-gain-per-fast-move and moveset, already implicitly
 * modeled everywhere else in this file) — inventing a flat padding constant
 * on top of this floor would be a fabricated number, not a derived one. This
 * floor is the defensible, minimal physical constraint: "can't recast before
 * the last cast finished."
 *
 * Applied to the SAMPLED (post-jitter) interval, not the mean, deliberately:
 * clamping only the mean still lets the +/-40% jitter sample below it (e.g. a
 * mean of exactly `durationSeconds` still jitters as low as 0.6x that), so
 * only a post-jitter clamp actually guarantees the invariant.
 */
export function boundedJitteredChargedMoveInterval(
  meanSeconds: number,
  minSeconds: number,
  rng: () => number,
): { seconds: number; wasClamped: boolean } {
  const raw = jitteredInterval(meanSeconds, rng);
  const seconds = Math.max(raw, minSeconds);
  return { seconds, wasClamped: seconds > raw + 1e-9 };
}

/**
 * Chance a raid boss fires its charged move at each decision point once it
 * has enough energy, under the "energy-driven" `StepwiseBoss.chargedMoveCadence`
 * model. Source: MECHANICS.md's "Raid boss behaviour" section (Silph Road's
 * analysis of Niantic's September 2024 raid rework, r/TheSilphRoad `1fckfja`,
 * `[community-consensus]`) — reverted from a brief 100% "spam" period during
 * that rework. ~2 years old as of 2026-09-08: the *mechanism* (an instant,
 * no-look-ahead coin flip per opportunity, not a planned-ahead cooldown) is
 * well corroborated, but this specific number could plausibly have been
 * re-tuned since without a public announcement — keep it a named, exported
 * constant rather than an inline literal so it's adjustable without
 * archaeology.
 */
export const BOSS_CHARGED_MOVE_USE_PROBABILITY = 0.5;

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
   *
   * TIME COST (2026-09-09): this setting models the attacker as dodging
   * TWICE around a held cast — once right before throwing the charged move,
   * once right after — rather than the usual single dodge attempt, so each
   * of the boss's CHARGED hits the attacker actually attempts to dodge while
   * this is on costs `HOLD_CHARGED_MOVE_DODGE_ATTEMPTS * DODGE_COST_SECONDS`
   * (2.0s today) instead of the ordinary `DODGE_COST_SECONDS` (1.0s today).
   * This is THIS PROJECT'S OWN EXPLICIT PLACEHOLDER MODELLING ASSUMPTION,
   * not an observed or sourced real-game mechanic — no source establishes
   * how much of the attacker's own time is actually lost dodging around
   * their own charged-move cast, and it is pending improvement. See
   * MECHANICS.md's 2026-09-09 "Dodging" entry. Only applies when a charged
   * dodge is actually attempted (`dodge.kind !== "none"`, and not mid the
   * attacker's own animation) — it never fires with dodging turned off, and
   * never affects boss FAST hits (`dodgeFastAttacks` keeps the ordinary
   * single-attempt cost).
   */
  holdChargedMoveUntilSafe?: boolean;
}

/**
 * How many dodge inputs' worth of time (`DODGE_COST_SECONDS` each) a dodged
 * boss CHARGED hit costs the attacker while `holdChargedMoveUntilSafe` is on
 * — see that field's doc comment above for the full rationale. This is a
 * labelled placeholder assumption (dodge once before the held cast, once
 * after), not a sourced constant; kept as a named multiplier rather than an
 * inline `2` so a future change to the model is a one-line edit and the call
 * site stays self-explanatory.
 */
export const HOLD_CHARGED_MOVE_DODGE_ATTEMPTS = 2;

/**
 * Which model decides WHEN a raid boss's charged move fires — see
 * StepwiseBoss.chargedMoveCadence for the full description of each. Exported
 * as a named type (rather than each consumer inlining its own copy of the
 * union) so comparison.ts/speciesReport.ts/teamRaid.ts share exactly one
 * definition; it reaches every other package via index.ts's
 * `export * from "./simulate.js"`.
 */
export type BossChargedMoveCadence = "fixed-interval" | "energy-driven" | "energy-gated-interval";

export interface StepwiseBoss {
  attackStat: number;
  defenseStat: number;
  fastMove: FastMove;
  damageOut: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  /** Boss charged move; omit to reproduce the opening-burst-only behavior. */
  chargedMove?: ChargedMove;
  chargedMoveDamageOut?: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  /**
   * Which model decides when the boss's charged move fires.
   *
   * - `"fixed-interval"` (default, unchanged behavior): a user-set mean
   *   interval (`chargedMoveMeanIntervalSeconds`) with +/-40% jitter, warmup
   *   derived only from the boss's own fast-move energy gain
   *   (`bossChargedMoveReadySeconds`/`chargedMoveWarmupSeconds`/
   *   `startingEnergy`). Kept as the default because it's what every existing
   *   `Scenario` and pinned test currently assumes — a shared link must not
   *   silently change meaning.
   * - `"energy-driven"`: models the real post-September-2024 raid rework
   *   described in MECHANICS.md's "Raid boss behaviour" section. The boss
   *   accumulates energy from BOTH its own fast moves AND damage it takes
   *   (`bossEnergyFromDamageTaken`/`BOSS_ENERGY_PER_DAMAGE_TAKEN`, mirroring
   *   how the attacker already gains energy from damage taken). Once it has
   *   at least its charged move's energy cost, it gets a
   *   `BOSS_CHARGED_MOVE_USE_PROBABILITY` chance to fire — decided instantly,
   *   with no look-ahead — at each **boss move-completion boundary**: the
   *   instant it finishes a fast move, or the instant one of its own
   *   charged-move casts ends (`attemptBossChargedMoveDecision`, called from
   *   exactly those two spots in the tick loop below). On firing it SUBTRACTS
   *   the move's energy cost from `bossEnergy` (changed 2026-09-08 from an
   *   earlier reset-to-0, to match GoBattleSim's open-source boss AI and this
   *   mode's own `"energy-gated-interval"` sibling below — see MECHANICS.md),
   *   so energy already above the cost survives into the next window instead
   *   of being discarded; this is what lets the boss reach eligibility again
   *   sooner off a big enough damage-taken spike.
   *
   *   IMPORTANT — read before trusting this number: the real game's 50%
   *   figure and the "decided instantly" phrasing are both sourced
   *   (MECHANICS.md, ultimately one Silph Road analysis of the Sept-2024
   *   rework), but nowhere is the real per-opportunity DENOMINATOR
   *   documented — no source states whether a real boss re-checks once per
   *   fast move, once per some fixed cycle, or on some other cadence, and an
   *   explicit research pass exhausted every fetchable source without
   *   finding one (`.claude/agent-memory/pogo-researcher/
   *   fact_boss_charged_move_decision_cadence.md`, 2026-09-08). "Move-
   *   completion boundary" is a REASONED INFERENCE, not a cited mechanic: it
   *   is the only trigger consistent with BOTH already-sourced facts at
   *   once — "decided instantly" (rules out a planned-ahead cooldown) AND
   *   "a boss has been observed firing three charged moves in a row with
   *   zero fast moves between them" (a fast-move-only trigger cannot produce
   *   that; a boundary-of-any-move trigger can). It also introduces no
   *   invented time constant — deliberately NOT tied to the unrelated 0.5s
   *   combat cycle, which is a separately-sourced fact with no documented
   *   link to this 50% figure. Treat this whole mode as a labelled modelling
   *   assumption, not a confirmed game rule, if revisiting it.
   *
   *   This is also why an EARLIER version of this mode (re-rolling whenever
   *   `bossEnergy` merely changed value, with no move-boundary requirement)
   *   had a real deadlock: once energy pinned at `MAX_ENERGY` and one roll
   *   failed, no further "change" could ever occur, so the boss would go
   *   silent for the rest of the fight. Move-completion boundaries can't
   *   deadlock — the boss's own fast move always keeps firing on a schedule
   *   regardless of its energy total, so a fresh decision opportunity always
   *   eventually arrives.
   *
   *   This is what lets a higher-DPS attacker force more/faster boss charged
   *   moves (more/bigger damage-taken events reach the energy threshold
   *   sooner, so more of the boss's own recurring move-completion boundaries
   *   land on an eligible decision), and lets the boss chain back-to-back
   *   casts when damage-taken energy completes the requirement mid-animation
   *   (both effects sourced in MECHANICS.md; only the trigger granularity
   *   above is inferred).
   *   `chargedMoveMeanIntervalSeconds`/`chargedMoveWarmupSeconds`/
   *   `startingEnergy` (used as the boss's INITIAL energy here instead) /
   *   `chargedMoveNextFireInSeconds` interact differently or not at all in
   *   this mode — see each field's own doc comment.
   * - `"energy-gated-interval"`: a hybrid of the two above, per
   *   MECHANICS.md's "The wait between 'can fire' and 'does fire'" entry.
   *   ENERGY ELIGIBILITY is decided exactly as `"energy-driven"` does — the
   *   boss accumulates energy from BOTH its own fast moves AND damage taken
   *   (same `bossEnergyFromDamageTaken` source) — but instead of a
   *   `BOSS_CHARGED_MOVE_USE_PROBABILITY` coin flip at each move-completion
   *   boundary, the INSTANT energy first reaches the charged move's cost
   *   (and no delay is already pending) it rolls exactly ONE random delay
   *   using `"fixed-interval"`'s own jitter machinery
   *   (`jitteredInterval(chargedMoveMeanIntervalSeconds, rng)`, no duration
   *   floor — the mid-cast lock below is already a structural floor, same as
   *   `"energy-driven"`) and fires when that delay elapses, never mid-cast.
   *   On firing it SUBTRACTS the move's energy cost — matching `"energy-driven"`,
   *   which does the same (both modes converged on subtract-cost 2026-09-08,
   *   matching GoBattleSim's open-source boss AI; see MECHANICS.md) — so
   *   leftover energy still >= cost re-arms a fresh delay
   *   immediately — the same back-to-back-casts mechanism `"energy-driven"`
   *   reproduces via its move-boundary trigger, produced here instead by the
   *   re-arm-on-fire step. Under this mode `chargedMoveMeanIntervalSeconds`
   *   means "mean delay after becoming eligible", NOT "mean seconds between
   *   casts" — it is REQUIRED for the boss to ever fire at all (missing/0
   *   behaves exactly like `"fixed-interval"` with no mean: the boss never
   *   uses its charged move). `chargedMoveWarmupSeconds` is ignored (mirrors
   *   `"energy-driven"`); `startingEnergy` is the boss's initial energy
   *   (mirrors `"energy-driven"`); `chargedMoveNextFireInSeconds`, if set,
   *   pre-arms the pending delay directly with NO re-roll (a carried-forward,
   *   already-resolved delay, exactly like it does for `"fixed-interval"`'s
   *   `nextBossChargedMoveAt`). This whole model's post-eligibility delay has
   *   no observed real-game source — see MECHANICS.md; only the
   *   gate-at-cost/subtract-cost halves are corroborated (by an
   *   open-source raid simulator, not first-party).
   *
   * Defaults to `"fixed-interval"`. `"energy-driven"`/`"energy-gated-interval"`
   * are both deliberately opt-in — neither's impact is rolled into any
   * default yet.
   */
  chargedMoveCadence?: BossChargedMoveCadence;
  /**
   * Mean seconds between the boss's charged moves once it starts using them
   * — under `"fixed-interval"` (the default). Under `"energy-gated-interval"`
   * this is instead consulted as the MEAN DELAY AFTER THE BOSS BECOMES
   * ENERGY-ELIGIBLE (a different meaning — see chargedMoveCadence's doc
   * comment — but the same field, not a second Scenario setting) and is
   * REQUIRED there for the boss to ever fire. Ignored entirely under
   * `"energy-driven"`, which has no mean-interval concept at all.
   */
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
   * trainer's mega already left partway charged. Under chargedMoveCadence
   * "fixed-interval" (default), only affects the *default* chargedMoveWarmupSeconds
   * above; ignored if that's set explicitly. Under "energy-driven", this is used
   * directly as the boss's starting energy total instead (chargedMoveWarmupSeconds/
   * chargedMoveNextFireInSeconds do not apply in that mode). This field is
   * sufficient, on its own, to carry a boss's accumulated energy across a
   * team-raid slot handoff (or a wipe-and-revive) under "energy-driven" — see
   * StepwiseRunResult.bossEndingEnergy, the read-out counterpart a caller
   * feeds back in here for the next fight (mirroring how
   * bossChargedMoveResidualSeconds/chargedMoveNextFireInSeconds already do
   * this for "fixed-interval"). No separate carryover field was needed.
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
  /**
   * Shadow raid enrage — see shadow.ts's shadowEnragedStats/
   * shadowEnragePhaseForHpFraction and MECHANICS.md's "Shadow raids"
   * section. Omitted/undefined (every non-shadow boss, and any caller that
   * hasn't wired this yet) leaves this whole simulator byte-for-byte
   * unchanged — `attackStat`/`defenseStat` above are used for the entire
   * run exactly as before this field existed. When present, the boss's LIVE
   * attack/defense used for every damage calculation this tick are
   * recomputed each tick from the boss's OWN remaining-HP fraction (derived
   * from `maxHp` and the cumulative fast+charged damage this run — plus
   * `damageDealtBeforeFight`, for a boss whose HP is already partway down
   * from an earlier fight in the same encounter, e.g. an earlier team-raid
   * slot) rather than the static `attackStat`/`defenseStat` fields, which
   * represent the boss's NORMAL (non-enraged) stats and are used whenever
   * the computed phase is `"normal"`.
   */
  enrage?: {
    /** The boss's real max HP pool for THIS raid (bossEffectiveHp) — turns cumulative damage into a remaining-HP fraction. */
    maxHp: number;
    /**
     * Damage already dealt to the boss BEFORE this simulated fight begins —
     * e.g. by earlier team-raid slots in the same continuous encounter.
     * Defaults to 0 (a standalone fight, the common case: comparison.ts's
     * runSustainedComparison always starts a fresh boss per candidate).
     */
    damageDealtBeforeFight?: number;
    /** Enraged Attack/Defense — see shadow.ts's shadowEnragedStats. */
    attackStat: number;
    defenseStat: number;
  };
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
  /**
   * How many of this run's dodge attempts were the EXTRA "protect the held
   * cast" ones — i.e. `attacker.holdChargedMoveUntilSafe` was on AND the hit
   * being dodged was one of the boss's CHARGED attacks (see
   * StepwiseAttacker.holdChargedMoveUntilSafe's "TIME COST" doc comment).
   * Each such event costs `HOLD_CHARGED_MOVE_DODGE_ATTEMPTS *
   * DODGE_COST_SECONDS` instead of the ordinary single `DODGE_COST_SECONDS`
   * — this count times that per-event cost is exactly
   * `holdChargedMoveDodgeCostSeconds` below. Always 0 when
   * `holdChargedMoveUntilSafe` is falsy, or when no charged dodge is ever
   * actually attempted (`dodge.kind === "none"`, or every such hit landed
   * mid the attacker's own animation, where no dodge is attempted at all).
   */
  holdChargedMoveDodgeCostEvents: number;
  /**
   * IDEAS.md #20 — surfaces `HOLD_CHARGED_MOVE_DODGE_ATTEMPTS *
   * DODGE_COST_SECONDS` PER "protect the held cast" event, summed over this
   * whole run, as its OWN reported value instead of leaving it silently
   * folded into `nextAttackerFastMoveAt`'s internal bookkeeping (previously
   * the only place this cost was ever computed) and thus into the aggregate
   * survivability numbers with no way to see it separately.
   *
   * **THIS IS THIS PROJECT'S OWN UNSOURCED PLACEHOLDER MODELLING ASSUMPTION,
   * NOT A CONFIRMED GAME MECHANIC** — see StepwiseAttacker.
   * holdChargedMoveUntilSafe's doc comment and MECHANICS.md's 2026-09-09
   * "OPEN QUESTION" entry under "Dodging", which is still open as of this
   * field's addition. A caller surfacing this number to a user MUST label it
   * as resting on that placeholder (e.g. "~Xs of this run's timeline is an
   * ASSUMED cost with no confirmed source — see MECHANICS.md"), not present
   * it as a measured fact the way `totalDamageTaken` or `bossChargedHitsTaken`
   * are. Always 0 under the same conditions as
   * `holdChargedMoveDodgeCostEvents` above.
   */
  holdChargedMoveDodgeCostSeconds: number;
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
   * in that case. Also always null under chargedMoveCadence "energy-driven":
   * that model has no fixed "next fire" schedule to report a residual
   * against (readiness there is a live energy total, not a countdown).
   * Non-null under "energy-gated-interval" WHENEVER a delay is currently
   * pending (the boss has already become energy-eligible and rolled its one
   * post-eligibility delay, but that delay hasn't elapsed yet) — computed the
   * same way as "fixed-interval"'s value, just against that mode's own
   * pending fire time (bossGatedFireAt) instead of nextBossChargedMoveAt; null
   * there too if the boss never became eligible during this run. Clamped to
   * >= 0 (a run can end exactly on the tick the boss's charged move was
   * scheduled to fire, which nextBossChargedMoveAt/bossGatedFireAt already
   * reflect as having "fired," not gone negative).
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
  /**
   * The boss's own accumulated energy at the moment this run ended (fainted,
   * or hit maxSeconds) — the energy-tracking counterpart to
   * bossChargedMoveResidualSeconds above (that field's "countdown" concept
   * doesn't exist under pure energy tracking; the boss's readiness is a live
   * energy total instead). Non-null under BOTH "energy-driven" AND
   * "energy-gated-interval" (both track this same bossEnergy total — see
   * StepwiseBoss.chargedMoveCadence — they only differ in what happens once
   * energy reaches the charged move's cost). Always `null` under the default
   * "fixed-interval" cadence — that mode never accumulates a bossEnergy total
   * at all, so there is nothing meaningful to report (mirrors
   * bossChargedMoveResidualSeconds's own null-under-the-other-modes
   * convention).
   *
   * The one real consumer is teamRaid.ts's sequential slot-handoff
   * orchestrator, exactly the way bossChargedMoveResidualSeconds already
   * feeds the next slot's chargedMoveNextFireInSeconds under
   * "fixed-interval"/"energy-gated-interval": feed this straight into the
   * next fight's StepwiseBoss.startingEnergy so the boss doesn't silently
   * lose its accumulated energy just because the trainer swapped in a fresh
   * Pokémon — a slot handoff handing the attacker a freshly-drained boss
   * would make either energy-tracking model MORE forgiving than
   * "fixed-interval", which would be a real, easy-to-miss modeling bug (a
   * "better-looking" number produced by a wiring mistake, not a real effect).
   */
  bossEndingEnergy: number | null;
  /**
   * True if at least one of the boss's charged-move inter-arrival times
   * sampled during THIS run had to be raised to meet the move's own
   * `durationSeconds` — i.e. the caller-supplied `chargedMoveMeanIntervalSeconds`
   * (after its +/-40% jitter roll) asked for a cadence physically shorter
   * than the boss's own cast time. See boundedJitteredChargedMoveInterval's
   * doc comment for why this floor exists. Always false when the boss has no
   * charged-move timing configured at all (no chargedMove, or no
   * chargedMoveMeanIntervalSeconds), OR under chargedMoveCadence
   * "energy-driven" — that model has no sampled interval to clamp; its own
   * equivalent floor is structural (a new cast can't start while
   * bossChargedAnimationEndsAt is still in the future), not a value that can
   * be "clamped." A true
   * value here means at least part of this run's dodge-vs-no-dodge
   * comparison was silently unaffected by dodging before this floor existed
   * (overlapping casts left no gap to dodge into) — the web layer should
   * surface this as "requested cadence was physically impossible; clamped."
   */
  bossChargedMoveCadenceClamped: boolean;
  /**
   * True when `dodgeFastAttacks` was on AND the boss's fast move recycles at
   * or faster than `DODGE_COST_SECONDS` (see breakpoints.ts's
   * `fastMoveCadenceTooFastToDodge`) — i.e. this run's configuration asked
   * the attacker to dodge a fast attack it structurally cannot ever recover
   * from: every dodge attempt pushes the attacker's own next fast-move
   * eligibility later by at least as much real time as the boss takes to
   * throw its next fast hit, so that eligibility can never catch up to the
   * clock on its own. This is a DIAGNOSIS of the configuration, not a claim
   * about this specific run's numbers — it is computed once up front from
   * `boss.fastMove.durationSeconds` and `dodgeFastAttacks` alone (no RNG, no
   * stats), so it is identical for every run/seed built from the same
   * inputs, the same way `bossChargedMoveCadenceClamped` is a config-level
   * fact rather than a per-seed sample.
   *
   * IMPORTANT — this is NOT the same claim as "totalFastMoveDamage is 0 for
   * this run": the attacker's own charged-move cast doesn't attempt to
   * dodge while it's playing out (see isMidOwnAnimation below), so real
   * time keeps passing with no further pushes during a cast, which can
   * close the gap and let a handful of fast attacks land right after the
   * cast ends — IF the cast survives to completion. An attacker that
   * reaches a charged move purely from `energyFromDamageTaken` chip damage
   * (see energy.ts) can therefore land an occasional fast attack even with
   * this flag true — verified empirically: this flag does not imply
   * totalFastMoveDamage === 0, only that it is structurally suppressed to
   * "whatever trickles through around charged-move casts" rather than a
   * sustained cadence.
   *
   * True zero-fast-AND-zero-charged-damage for the WHOLE run (the exact
   * reported symptom) is also possible, and confirmed empirically, but not
   * because chip energy fails to accumulate: reaching the charged move's
   * energy cost via chip damage alone means the attacker has already spent
   * most of its HP getting there (each unit of chip energy costs
   * `1/ENERGY_PER_DAMAGE_TAKEN` HP), so by the time the cast starts there is
   * often too little HP margin left to survive even one FULL-damage boss
   * hit landing mid-cast (mid-animation hits are never dodged/reduced — see
   * the boss-hit block below) — the cast is interrupted
   * (diedDuringOwnChargedMoveAnimation true) before it can land or let a
   * fast attack through. See simulate.test.ts's "dodgeFastAttacksLockout"
   * describe block for both this case and the "cast survives, a couple of
   * attacks land" case pinned side by side. The web layer should surface a
   * true value as "this boss's fast move is too fast to dodge reliably —
   * this configuration wastes this attacker's timeline," not silently trust
   * a low/zero fast-damage number as a normal result.
   */
  dodgeFastAttacksLockout: boolean;
  /**
   * Shadow raid enrage transition timestamps for THIS run — see
   * StepwiseBoss.enrage and shadow.ts's shadowEnragePhaseForHpFraction. Both
   * null whenever `boss.enrage` isn't configured at all (every non-shadow
   * boss, and any caller that hasn't wired this feature in yet — see
   * comparison.ts/teamRaid.ts). When `boss.enrage` IS configured:
   * `enragedAtSeconds` is the first tick this run's boss crossed into the
   * enraged band (remaining HP <= 60%); `subduedAtSeconds` is the first tick
   * it auto-subdued back out of it (remaining HP <= 15%). Either can still be
   * null even with enrage configured, if the run ended (attacker fainted, or
   * hit maxSeconds) before the boss's cumulative damage taken ever crossed
   * that threshold. Surfaced so a caller can explain an otherwise-
   * inexplicable mid-fight swing in incoming/outgoing damage — same
   * surfacing precedent as dodgeFastAttacksLockout above.
   */
  enragedAtSeconds: number | null;
  subduedAtSeconds: number | null;
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
  // Config-level fact, computed once up front (no RNG/stats involved) — see
  // StepwiseRunResult.dodgeFastAttacksLockout's doc comment for the full
  // rationale and breakpoints.ts's fastMoveCadenceTooFastToDodge for the
  // arithmetic.
  const dodgeFastAttacksLockout = dodgeFastAttacks && fastMoveCadenceTooFastToDodge(boss.fastMove.durationSeconds);
  const tick = params.tickSeconds ?? DEFAULT_TICK_SECONDS;
  const maxSeconds = params.maxSeconds ?? DEFAULT_STEPWISE_MAX_SECONDS;
  const rng = mulberry32(params.seed ?? 1);
  // See StepwiseBoss.chargedMoveCadence's doc comment for all three models.
  // Both gated on boss.chargedMove existing too, since there's nothing to
  // drive energy toward otherwise. bossTracksEnergy is the union of the two
  // (every energy-ACCUMULATION site below is gated on this, since both modes
  // accumulate identically); bossEnergyDriven/bossEnergyGatedInterval further
  // distinguish which happens once energy actually reaches the cost — the
  // move-boundary coin flip, or the one-shot post-eligibility delay.
  const cadence = boss.chargedMoveCadence ?? "fixed-interval";
  const bossEnergyDriven = cadence === "energy-driven" && !!boss.chargedMove;
  const bossEnergyGatedInterval = cadence === "energy-gated-interval" && !!boss.chargedMove;
  const bossTracksEnergy = bossEnergyDriven || bossEnergyGatedInterval;

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
  let holdChargedMoveDodgeCostEvents = 0;
  let holdChargedMoveDodgeCostSeconds = 0;
  let faintedAtSeconds: number | null = null;
  let diedDuringOwnChargedMoveAnimation = false;
  const ownDamageTrajectory: DamageTrajectoryPoint[] = [{ atSeconds: 0, cumulativeDamage: 0 }];
  const damageTakenTrajectory: DamageTrajectoryPoint[] = [{ atSeconds: 0, cumulativeDamage: 0 }];

  let nextAttackerFastMoveAt = attacker.fastMove.durationSeconds;
  let nextBossFastMoveAt = boss.fastMove.durationSeconds;
  let attackerAnimationEndsAt: number | null = null;

  // Shadow raid enrage — see StepwiseBoss.enrage's doc comment. These two
  // are the LIVE stats every damage calculation below actually uses;
  // boss.attackStat/boss.defenseStat (the "normal" stats) are only read here,
  // at initialization, and again inside the per-tick recompute block further
  // down — never directly at a damage call site, so a caller that never sets
  // boss.enrage gets byte-for-byte the old behavior (these two variables
  // never change from their initial value in that case).
  let liveBossAttackStat = boss.attackStat;
  let liveBossDefenseStat = boss.defenseStat;
  // BUG FIX (2026-09-11): this used to hardcode "normal" unconditionally.
  // shadowEnragePhaseForHpFraction is a PURE function of the boss's CURRENT
  // remaining-HP fraction, not path-dependent — so the correct initial phase
  // is whatever that fraction says at t=0, not always "normal". For a
  // standalone fight (damageDealtBeforeFight 0, or boss.enrage undefined
  // entirely) this still resolves to "normal", byte-identical to before. The
  // bug only bit teamRaid.ts's sequential handoff: a boss already enraged
  // (or already subdued) from an EARLIER slot's damage starts a LATER slot's
  // fight with its true HP fraction already past a threshold, but the old
  // hardcoded "normal" made the very first tick's phase comparison below
  // treat that as a FRESH transition — reporting a bogus enragedAtSeconds (or
  // subduedAtSeconds) at that later slot's very first tick, even though the
  // real transition already happened, and was already correctly reported,
  // during an earlier slot's own fight. Confirmed live (web-developer,
  // 2026-09-11): 14 of 14 fielded slots against a real Shadow boss reported a
  // non-null enragedAtRaidSeconds; only the first (20.1s) was real. Web
  // already works around this by taking the FIRST non-null value across the
  // slots array, so the rendered headline number is unaffected by this fix.
  let enragePhase: "normal" | "enraged" = boss.enrage
    ? shadowEnragePhaseForHpFraction(Math.max(0, 1 - (boss.enrage.damageDealtBeforeFight ?? 0) / boss.enrage.maxHp))
    : "normal";
  let enragedAtSeconds: number | null = null;
  let subduedAtSeconds: number | null = null;

  // Energy-tracking state, shared by "energy-driven" and
  // "energy-gated-interval" — see the "Boss charged move" block in the main
  // loop below. Unused (stays 0/null) under the default "fixed-interval"
  // cadence.
  let bossEnergy = bossTracksEnergy ? (boss.startingEnergy ?? 0) : 0;
  let bossChargedAnimationEndsAt: number | null = null;
  // "energy-gated-interval"-only state: the boss's one pending post-eligibility
  // fire time, armed by armGatedFireIfEligible below. null whenever nothing
  // is currently pending (not yet eligible, or already fired and not yet
  // re-armed).
  let bossGatedFireAt: number | null = null;

  /**
   * Attempts the "should the boss fire its charged move right now" coin flip
   * for the "energy-driven" cadence — see StepwiseBoss.chargedMoveCadence's
   * doc comment for the full model, and why a boss MOVE-COMPLETION BOUNDARY
   * (not a per-tick clock, not "energy changed") is the trigger. Only ever
   * called from the two spots in the tick loop below that represent the
   * boss finishing a move (its own charged-move cast ending, or its own fast
   * move landing) — calling it anywhere else, or more than once per
   * completed move, would defeat the whole point of gating on discrete
   * events rather than a free-running per-tick roll (10 rolls/second at
   * p=0.5 would be a ~99.9% chance of firing within one second alone).
   * rng() is only invoked once eligibility (not mid-cast, energy >= cost) is
   * already confirmed, so a fixed seed's rng sequence depends only on which
   * boundaries were eligible, never on the outcome of a prior roll.
   */
  function attemptBossChargedMoveDecision(atSeconds: number): number | null {
    if (bossChargedAnimationEndsAt !== null) return null; // already mid-cast, can't restart
    if (bossEnergy < boss.chargedMove!.energyCost) return null; // not yet eligible
    if (rng() >= BOSS_CHARGED_MOVE_USE_PROBABILITY) return null; // eligible, but the coin flip failed
    const damage = calculateDamage({
      power: boss.chargedMove!.power,
      attackerAttackStat: liveBossAttackStat,
      defenderDefenseStat: attacker.defenseStat,
      ...(boss.chargedMoveDamageOut ?? boss.damageOut),
    });
    bossEnergy -= boss.chargedMove!.energyCost;
    bossChargedAnimationEndsAt = atSeconds + boss.chargedMove!.durationSeconds;
    return damage;
  }

  /**
   * Arms bossGatedFireAt for the "energy-gated-interval" cadence — see
   * StepwiseBoss.chargedMoveCadence's doc comment for the full model. A no-op
   * under any other cadence, if a delay is already pending, if no mean
   * interval is configured (REQUIRED for this mode — mirrors
   * "fixed-interval"'s own "no mean means never fires" behavior), or if
   * energy hasn't yet reached the charged move's cost. Deliberately NOT
   * gated on a move-completion boundary, unlike attemptBossChargedMoveDecision
   * above — this mode's eligibility check runs at every point energy could
   * possibly have changed (see every call site below), and once armed,
   * bossGatedFireAt is a fixed future time the tick loop's structural
   * mid-cast-lock check alone gates, so there is no move-boundary/deadlock
   * concern to guard against here the way "energy-driven" has to.
   */
  function armGatedFireIfEligible(atSeconds: number): void {
    if (!bossEnergyGatedInterval) return;
    if (bossGatedFireAt !== null) return; // already pending
    if (!boss.chargedMoveMeanIntervalSeconds) return; // no mean configured -> never fires
    if (bossEnergy < boss.chargedMove!.energyCost) return; // not yet eligible
    bossGatedFireAt = atSeconds + jitteredInterval(boss.chargedMoveMeanIntervalSeconds, rng);
  }

  let nextBossChargedMoveAt: number | null = null;
  let bossChargedMoveCadenceClamped = false;
  if (!bossEnergyDriven && !bossEnergyGatedInterval && boss.chargedMove && boss.chargedMoveMeanIntervalSeconds) {
    if (boss.chargedMoveNextFireInSeconds != null) {
      // Already fully resolved (carried forward from a prior slot's residual
      // cooldown) — no additional jitteredInterval roll on top.
      nextBossChargedMoveAt = boss.chargedMoveNextFireInSeconds;
    } else {
      const warmup =
        boss.chargedMoveWarmupSeconds ??
        bossChargedMoveReadySeconds(boss.fastMove, boss.chargedMove, boss.startingEnergy ?? 0);
      const { seconds: interval, wasClamped } = boundedJitteredChargedMoveInterval(
        boss.chargedMoveMeanIntervalSeconds,
        boss.chargedMove.durationSeconds,
        rng,
      );
      if (wasClamped) bossChargedMoveCadenceClamped = true;
      nextBossChargedMoveAt = warmup + interval;
    }
  }
  if (bossEnergyGatedInterval) {
    if (boss.chargedMoveNextFireInSeconds != null) {
      // Already fully resolved (carried forward from a prior slot's residual
      // delay) — no re-roll, mirroring the "fixed-interval" carryover above.
      bossGatedFireAt = boss.chargedMoveNextFireInSeconds;
    } else {
      // May already be eligible at t=0 via a nonzero startingEnergy.
      armGatedFireIfEligible(0);
    }
  }

  const EPS = 1e-9;
  for (let t = tick; t <= maxSeconds + EPS; t += tick) {
    const roundedT = Math.round(t * 1000) / 1000;

    // Shadow raid enrage: recompute which Attack/Defense band applies for
    // THIS tick's actions, based on cumulative damage dealt to the boss as of
    // the END of the PREVIOUS tick (totalFastMoveDamage/totalChargedDamage
    // haven't been touched yet this iteration) — deliberately excluding this
    // tick's own about-to-happen damage, since including it would make the
    // transition depend circularly on damage computed using the very stat
    // it's deciding. No-op (liveBossAttackStat/liveBossDefenseStat stay at
    // their initial boss.attackStat/boss.defenseStat value) whenever
    // boss.enrage is undefined — every non-shadow boss, byte-for-byte.
    if (boss.enrage) {
      const damageDealtToBossSoFar = (boss.enrage.damageDealtBeforeFight ?? 0) + totalFastMoveDamage + totalChargedDamage;
      const remainingHpFraction = Math.max(0, 1 - damageDealtToBossSoFar / boss.enrage.maxHp);
      const phase = shadowEnragePhaseForHpFraction(remainingHpFraction);
      if (phase !== enragePhase) {
        // Monotonic within THIS SINGLE CALL to simulateStepwiseBattle (boss
        // HP only ever decreases here), so within one run this can only ever
        // fire normal->enraged then enraged->normal, in that order — a plain
        // "which direction did it change" check is enough here, no need to
        // separately guard against re-entering an earlier phase.
        //
        // This does NOT mean `enragePhase`'s INITIAL value above may safely
        // be hardcoded to "normal" — a team raid's sequential slot handoffs
        // (teamRaid.ts) call this function once PER FIGHT, carrying the
        // boss's already-accumulated damage in via
        // `boss.enrage.damageDealtBeforeFight`, so a LATER fight can
        // legitimately start already inside the enraged (or already-subdued)
        // band. `enragePhase`'s initializer above derives the true starting
        // phase from that carried-in damage for exactly this reason — it was
        // a real bug (fixed 2026-09-11) when it didn't, reporting a bogus
        // transition at every later fight's very first tick. Monotonicity
        // WITHIN this call is what justifies the simple direction check
        // just below; it says nothing about what phase this call should
        // START in.
        if (phase === "enraged") enragedAtSeconds = roundedT;
        else subduedAtSeconds = roundedT;
        enragePhase = phase;
      }
      liveBossAttackStat = phase === "enraged" ? boss.enrage.attackStat : boss.attackStat;
      liveBossDefenseStat = phase === "enraged" ? boss.enrage.defenseStat : boss.defenseStat;
    }

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
        defenderDefenseStat: liveBossDefenseStat,
        ...attacker.chargedDamageOut,
      });
      totalChargedDamage += damage;
      chargedAttacksLanded += 1;
      attackerAnimationEndsAt = null;
      ownDamageTrajectory.push({ atSeconds: roundedT, cumulativeDamage: totalFastMoveDamage + totalChargedDamage });
      // Damage the attacker's own charged move just dealt to the boss also
      // feeds the boss's energy under both energy-tracking cadences — see
      // StepwiseBoss.chargedMoveCadence.
      if (bossTracksEnergy) {
        bossEnergy = Math.min(bossEnergy + bossEnergyFromDamageTaken(damage), MAX_ENERGY);
        armGatedFireIfEligible(roundedT);
      }
    }

    // Boss charged move takes priority over its fast move in the same tick.
    let bossHitDamage: number | null = null;
    let isBossChargedHit = false;

    if (bossEnergyDriven) {
      // Decision boundary #1: the boss's own charged-move cast finishing
      // exactly on this tick. Clear the mid-cast lock BEFORE attempting a
      // fresh decision so a same-tick refire is possible — this is the
      // mechanism behind real observed back-to-back casts (MECHANICS.md:
      // Kyogre firing three Hydro Pumps in a row with zero fast moves
      // between them): energy accrued from damage taken DURING the previous
      // cast can already be sufficient the instant that cast ends. See
      // attemptBossChargedMoveDecision's doc comment and
      // StepwiseBoss.chargedMoveCadence for why a move-completion boundary
      // (not "energy changed", not a per-tick clock) is the trigger.
      if (bossChargedAnimationEndsAt !== null && roundedT >= bossChargedAnimationEndsAt - EPS) {
        bossChargedAnimationEndsAt = null;
        const damage = attemptBossChargedMoveDecision(roundedT);
        if (damage !== null) {
          bossHitDamage = damage;
          isBossChargedHit = true;
        }
      }
    } else if (bossEnergyGatedInterval) {
      // "energy-gated-interval": time-based, not move-boundary-based — clear
      // the mid-cast lock if the cast ended exactly on this tick, then fire
      // if a pending delay (armed by armGatedFireIfEligible, below and at
      // every energy-accumulation site) has elapsed. See
      // StepwiseBoss.chargedMoveCadence's doc comment for the full model.
      if (bossChargedAnimationEndsAt !== null && roundedT >= bossChargedAnimationEndsAt - EPS) {
        bossChargedAnimationEndsAt = null;
      }
      if (bossChargedAnimationEndsAt === null && bossGatedFireAt !== null && roundedT >= bossGatedFireAt - EPS) {
        bossHitDamage = calculateDamage({
          power: boss.chargedMove!.power,
          attackerAttackStat: liveBossAttackStat,
          defenderDefenseStat: attacker.defenseStat,
          ...(boss.chargedMoveDamageOut ?? boss.damageOut),
        });
        isBossChargedHit = true;
        // Subtract the move's cost — matching "energy-driven"'s own
        // attemptBossChargedMoveDecision, which does the same as of
        // 2026-09-08 — see StepwiseBoss.chargedMoveCadence's doc comment.
        bossEnergy -= boss.chargedMove!.energyCost;
        bossChargedAnimationEndsAt = roundedT + boss.chargedMove!.durationSeconds;
        bossGatedFireAt = null;
        // Leftover energy still >= cost re-arms a fresh delay immediately —
        // the back-to-back-casts path for this cadence.
        armGatedFireIfEligible(roundedT);
      }
    } else if (nextBossChargedMoveAt !== null && roundedT >= nextBossChargedMoveAt - EPS) {
      bossHitDamage = calculateDamage({
        power: boss.chargedMove!.power,
        attackerAttackStat: liveBossAttackStat,
        defenderDefenseStat: attacker.defenseStat,
        ...(boss.chargedMoveDamageOut ?? boss.damageOut),
      });
      isBossChargedHit = true;
      const { seconds: interval, wasClamped } = boundedJitteredChargedMoveInterval(
        boss.chargedMoveMeanIntervalSeconds!,
        boss.chargedMove!.durationSeconds,
        rng,
      );
      if (wasClamped) bossChargedMoveCadenceClamped = true;
      nextBossChargedMoveAt = roundedT + interval;
    }

    if (bossHitDamage === null && roundedT >= nextBossFastMoveAt - EPS) {
      const fastDamage = calculateDamage({
        power: boss.fastMove.power,
        attackerAttackStat: liveBossAttackStat,
        defenderDefenseStat: attacker.defenseStat,
        ...boss.damageOut,
      });
      bossHitDamage = fastDamage;
      nextBossFastMoveAt = roundedT + boss.fastMove.durationSeconds;
      if (bossTracksEnergy) {
        bossEnergy = Math.min(bossEnergy + boss.fastMove.energyGain, MAX_ENERGY);
        armGatedFireIfEligible(roundedT);
        if (bossEnergyDriven) {
          // Decision boundary #2: the boss's own fast move finishing/landing.
          // Only one boss action can land on the attacker per tick in this
          // model, so a successful roll here REPLACES this tick's fast hit
          // with the charged hit (the boss's next action being the charged
          // move instead), rather than applying both. Not applicable to
          // "energy-gated-interval": that mode's firing is purely time-based
          // (bossGatedFireAt), not tied to this move-completion boundary.
          const chargedDamage = attemptBossChargedMoveDecision(roundedT);
          if (chargedDamage !== null) {
            bossHitDamage = chargedDamage;
            isBossChargedHit = true;
          }
        }
      }
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
      //
      // holdChargedMoveUntilSafe's "dodge before AND after the held cast"
      // placeholder (see StepwiseAttacker.holdChargedMoveUntilSafe's doc
      // comment, and MECHANICS.md's 2026-09-09 "Dodging" entry) charges
      // HOLD_CHARGED_MOVE_DODGE_ATTEMPTS dodge inputs instead of one, but
      // ONLY for a charged-hit dodge actually attempted here — never with
      // dodging off (attemptingDodge already covers dodge.kind === "none")
      // and never for a boss fast hit.
      if (attemptingDodge) {
        const isHoldCastProtectionDodge = attacker.holdChargedMoveUntilSafe && isBossChargedHit;
        const dodgeAttempts = isHoldCastProtectionDodge ? HOLD_CHARGED_MOVE_DODGE_ATTEMPTS : 1;
        nextAttackerFastMoveAt += dodgeAttempts * DODGE_COST_SECONDS;
        // IDEAS.md #20 — surface this placeholder cost as its own value; see
        // StepwiseRunResult.holdChargedMoveDodgeCostSeconds's doc comment.
        if (isHoldCastProtectionDodge) {
          holdChargedMoveDodgeCostEvents += 1;
          holdChargedMoveDodgeCostSeconds += dodgeAttempts * DODGE_COST_SECONDS;
        }
      }
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
        defenderDefenseStat: liveBossDefenseStat,
        ...attacker.fastDamageOut,
      });
      totalFastMoveDamage += fastDamage;
      ownDamageTrajectory.push({ atSeconds: roundedT, cumulativeDamage: totalFastMoveDamage + totalChargedDamage });
      // Damage the attacker's own fast move just dealt to the boss also
      // feeds the boss's energy under both energy-tracking cadences. Note
      // this lands one tick later than the boss's own action resolution
      // above (the "Boss charged move" block runs earlier in this same loop
      // body) — a bounded, sub-tick timing simplification consistent with
      // this file's documented tick-quantization assumptions, not a bug.
      if (bossTracksEnergy) {
        bossEnergy = Math.min(bossEnergy + bossEnergyFromDamageTaken(fastDamage), MAX_ENERGY);
        armGatedFireIfEligible(roundedT);
      }
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

  // Under "fixed-interval" this is nextBossChargedMoveAt; under
  // "energy-gated-interval" it's bossGatedFireAt instead (nextBossChargedMoveAt
  // stays null in that mode — see its init block above); under
  // "energy-driven" both stay null, so this is null too, matching that mode's
  // documented "no fixed schedule" convention.
  const pendingChargedMoveFireAt = bossEnergyGatedInterval ? bossGatedFireAt : nextBossChargedMoveAt;
  const bossChargedMoveResidualSeconds =
    pendingChargedMoveFireAt !== null ? Math.max(0, pendingChargedMoveFireAt - endSeconds) : null;

  return {
    faintedAtSeconds,
    survivedFullWindow: faintedAtSeconds === null,
    chargedAttacksLanded,
    totalChargedDamage,
    totalFastMoveDamage,
    totalDamageTaken,
    diedDuringOwnChargedMoveAnimation,
    bossChargedHitsTaken,
    holdChargedMoveDodgeCostEvents,
    holdChargedMoveDodgeCostSeconds,
    ownDamageTrajectory,
    damageTakenTrajectory,
    bossChargedMoveResidualSeconds,
    bossEndingEnergy: bossTracksEnergy ? bossEnergy : null,
    bossChargedMoveCadenceClamped,
    dodgeFastAttacksLockout,
    enragedAtSeconds,
    subduedAtSeconds,
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
   * True if ANY of the underlying runs had at least one boss charged-move
   * inter-arrival sample clamped up to the move's own durationSeconds — see
   * StepwiseRunResult.bossChargedMoveCadenceClamped (this is just an OR
   * across every run in the distribution, since which specific runs hit the
   * floor depends on per-seed jitter). False whenever the boss has no
   * charged-move timing configured at all.
   */
  bossChargedMoveCadenceClamped: boolean;
  /**
   * The floor this distribution's boss charged-move cadence was constrained
   * to — i.e. max(chargedMoveMeanIntervalSeconds, the resolved boss charged
   * move's own durationSeconds) — a config-level fact (not sampled, so
   * identical for every run in the distribution), not an actual observed
   * mean of the (right-censored) sampled intervals. null when the boss has
   * no charged-move timing configured at all (no chargedMove, or no
   * chargedMoveMeanIntervalSeconds). A caller can compare this against the
   * originally-requested chargedMoveMeanIntervalSeconds to build a message
   * like "requested Xs is below this move's Ys cast time; using Ys."
   */
  bossChargedMoveEffectiveMinIntervalSeconds: number | null;
  /**
   * See StepwiseRunResult.dodgeFastAttacksLockout — a config-level fact
   * (boss fast-move duration vs `dodgeFastAttacks`/`DODGE_COST_SECONDS`,
   * no RNG involved), so it is identical across every run in this
   * distribution; aggregated with `.some(...)` purely to match this file's
   * existing convention for surfacing a per-run diagnostic flag at the
   * distribution level (see bossChargedMoveCadenceClamped above), not
   * because the value could actually differ between runs.
   */
  dodgeFastAttacksLockout: boolean;
  /**
   * Mean, across every run in this distribution, of
   * StepwiseRunResult.holdChargedMoveDodgeCostSeconds — IDEAS.md #20's
   * "surface the own-charged-move-cast vulnerability cost as its own line."
   * **STILL AN UNSOURCED PLACEHOLDER, NOT A CONFIRMED MECHANIC** — see that
   * field's own doc comment and MECHANICS.md's 2026-09-09 "OPEN QUESTION"
   * entry. Always 0 when `attacker.holdChargedMoveUntilSafe` is falsy (the
   * default), so this is a no-op addition for every existing caller that
   * hasn't opted into that setting.
   */
  meanHoldChargedMoveDodgeCostSeconds: number;
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

  const bossChargedMoveEffectiveMinIntervalSeconds =
    params.boss.chargedMove && params.boss.chargedMoveMeanIntervalSeconds
      ? Math.max(params.boss.chargedMoveMeanIntervalSeconds, params.boss.chargedMove.durationSeconds)
      : null;

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
    bossChargedMoveCadenceClamped: runs.some((r) => r.bossChargedMoveCadenceClamped),
    bossChargedMoveEffectiveMinIntervalSeconds,
    dodgeFastAttacksLockout: runs.some((r) => r.dodgeFastAttacksLockout),
    meanHoldChargedMoveDodgeCostSeconds: runs.reduce((sum, r) => sum + r.holdChargedMoveDodgeCostSeconds, 0) / iterations,
    representativeRun: runs[0]!,
  };
}

/**
 * IDEAS.md #21 — "dodge-execution-error sensitivity." Today's `DodgeBehavior`
 * only ever chooses WHICH of the boss's charged attacks the attacker
 * attempts to dodge; once an attempt happens, `{kind:"perfect"}` always
 * succeeds and models zero execution error. This sweeps the ALREADY-EXISTING
 * `{kind:"percentage-missed", missedFraction}` variant (breakpoints.ts) —
 * built for exactly this axis but never previously swept anywhere in this
 * codebase — across a caller-supplied (or default) set of missed-fractions,
 * running a full `runStepwiseDistribution` at each point.
 *
 * Deliberately returns an ARRAY of distributions, one per missed-fraction,
 * rather than a single blended number — this project's standing discipline
 * (see CLAUDE.md's product thesis and IDEAS.md #19's identical framing for
 * the party-size crossover) is to show WHERE a conclusion moves as an
 * assumption is varied, not collapse it into one figure. A caller (e.g. a
 * web chart) renders this as a band across the swept axis: each point's
 * `distribution.p10TotalDamage`/`p90TotalDamage` (or its own
 * `meanSecondsSurvived`, for a survivability-flavored chart) traces the
 * width of that band at that execution-error level.
 *
 * `missedFraction` sits on the same 0-1 axis `dodgeMultiplierForHit`
 * documents: 0 = every dodge attempt lands (byte-identical to
 * `{kind:"perfect"}` — both are RNG-free, so with matching seeds the two
 * produce IDENTICAL distributions, not just similar ones). The 1 endpoint is
 * NOT byte-identical to `{kind:"none"}`, and this is a real, deliberate
 * distinction rather than a bug: `{kind:"none"}` never attempts a dodge at
 * all against a charged hit (`attemptingDodge` is false, so no
 * `DODGE_COST_SECONDS` is ever spent), whereas `{missedFraction:1}` still
 * throws a dodge input every time — it's just guaranteed to whiff — so it
 * still pays the ordinary attempt cost per simulate.ts's "every dodge
 * attempt, hit or miss, costs time" rule. Both endpoints deal identical
 * FULL per-hit damage (multiplier 1 either way), so a caller charting
 * incoming damage sees the two endpoints agree; a caller charting the
 * attacker's own fast-move output sees `missedFraction:1` strictly worse
 * than `{kind:"none"}`, since it wastes attempt time for zero benefit — the
 * worst realistic point on this axis is genuinely worse than simply not
 * trying, which is itself a useful thing for this sweep to surface. `params.dodge` is deliberately excluded from the input type — this
 * function OWNS the dodge axis for the sweep; a caller wanting to hold
 * `dodgeFastAttacks` or anything else fixed still can, via the rest of
 * `params`.
 *
 * This is a single-attacker-vs-boss primitive, the same level
 * `runStepwiseDistribution` already operates at — it does not itself thread
 * through comparison.ts's two-candidate ranking, teamRaid.ts's roster
 * orchestration, or powerUp.ts's cost ladder. A caller in one of those
 * higher layers builds its own band by calling this once per candidate/slot
 * it cares about.
 */
export const DEFAULT_DODGE_ERROR_MISSED_FRACTIONS: number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

export interface DodgeErrorSweepPoint {
  /** Fraction of the attacker's dodge ATTEMPTS (against the boss's CHARGED attacks) that fail to reduce damage this run — see the function doc comment above for the 0/1 endpoints' equivalence to {kind:"perfect"}/{kind:"none"}. */
  missedFraction: number;
  distribution: DistributionSummary;
}

export function sweepDodgeExecutionError(
  params: Omit<StepwiseSimulationParams, "dodge" | "seed">,
  missedFractions: number[] = DEFAULT_DODGE_ERROR_MISSED_FRACTIONS,
  iterations = 200,
  baseSeed = 1,
): DodgeErrorSweepPoint[] {
  return missedFractions.map((missedFraction) => ({
    missedFraction,
    distribution: runStepwiseDistribution(
      { ...params, dodge: { kind: "percentage-missed", missedFraction } },
      iterations,
      baseSeed,
    ),
  }));
}
