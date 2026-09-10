import { bossEffectiveHp, bossEffectiveStats, bossEnrageStats, ownBoostMultiplier, resolveCandidateMegaLevel, resolveMove } from "./comparison.js";
import type { DodgeBehavior } from "./breakpoints.js";
import type { DamageTrajectoryPoint } from "./combat.js";
import { chargedMoveAtMegaLevel, effectiveLevelForMegaLevel, type MegaLevel } from "./megaLevel.js";
import type { RaidTier } from "./raidBoss.js";
import {
  DEFAULT_STEPWISE_MAX_SECONDS,
  simulateStepwiseBattle,
  type BossChargedMoveCadence,
  type StepwiseAttacker,
  type StepwiseBoss,
} from "./simulate.js";
import { effectiveStatsAtLevel } from "./stats.js";
import { typeEffectiveness } from "./typeChart.js";
import type { IVSpread, SpeciesDefinition } from "./types.js";
import { isWeatherBoosted, type WeatherCondition } from "./weather.js";

/**
 * A single trainer's own sequential 6-Pokémon raid lineup against a boss's
 * real HP pool and countdown timer — see
 * .claude/agent-memory/pogo-researcher/proposal_sequential_team_raid_tab.md
 * for the full design this implements (and
 * proposal_raid_clear_timer_hp.md for the boss-HP/timer grounding it builds
 * on). This is deliberately NOT the ruled-out "Teambuilding Analyzer"
 * (multi-trainer mega staggering across a raid) — it's one trainer's own
 * roster, sequentially swapped in on faint, same as a real Gym/Raid battle.
 *
 * CORRECTED 2026-09-05 (see the design doc's Section 9 addendum): a full
 * wipe of every configured slot is NOT a loss condition in the real game —
 * the trainer is bounced to the raid lobby, heals using Bag items (a real
 * cost; this module follows the addendum's explicit v1 assumption of
 * unlimited healing items), and can rejoin the SAME raid attempt repeatedly
 * under one shared, continuously-running clock, restarting from slot 1 each
 * time. The ONLY real loss condition is `raidTimerSeconds` expiring with the
 * boss's HP still above zero. This module models that as a CYCLING
 * orchestrator: run the fielded roster through to a full wipe, pay
 * `reviveCostSeconds`, loop back to the first fielded slot, and repeat until
 * the boss clears or the timer runs out — see MAX_TEAM_RAID_CYCLES for the
 * one purely-engineering safety cap this needs (the real game imposes none
 * at all, per the addendum's Q3 research).
 *
 * CRITICAL, confirmed-by-research correctness rule this module deliberately
 * does NOT violate: the mega/primal team-wide damage boost never applies to
 * the mega-bringer's OWN party — only to other trainers simultaneously
 * present in the raid (official pokemon.com + Bulbapedia, see the design doc
 * above). Since every slot here belongs to the SAME trainer, there is no
 * team-wide boost math to compute at all. A slot's species.boost only ever
 * affects that slot's OWN damage output (via ownBoostMultiplier, the same
 * helper comparison.ts uses) — never any other slot's. Do not add a
 * teammate-boost computation here even though comparison.ts/uptime.ts have
 * one; it would be a plausible-looking but mechanically wrong addition.
 *
 * Reuses simulateStepwiseBattle unmodified, once per slot per cycle, exactly
 * the way comparison.ts's runSustainedComparison already builds a
 * StepwiseAttacker — this is pure orchestration/post-processing over
 * existing simulation output, not a second combat model. Boss HP depletion
 * and the raid timer are both read here for the first time ever
 * (SpeciesDefinition.baseStamina was, until this module, pure decoration on
 * every boss fixture). Per the addendum's Q5 research, a revived slot's
 * fight starts identically to its first (full HP, 0 energy) — the existing
 * per-slot fight logic already does this for every ordinary swap-in, so
 * looping back to slot 1 needs no new combat math, only new orchestration.
 */

/** Real Pokémon GO caps a raid roster at 6 Pokémon (only one may be Mega Evolved at a time, account-wide). */
export const MAX_TEAM_RAID_SLOTS = 6;

/**
 * Purely an engineering safety guard against an unbounded loop for a
 * degenerate near-zero-net-damage roster (e.g. every fielded slot deals
 * negligible chip damage and faints almost instantly) — the real game
 * imposes NO cap on wipe-and-rejoin cycles (proposal_sequential_team_raid_tab.md
 * Section 9, Q3: "a player may repeatedly attempt that same raid until
 * either they defeat the Raid Boss or the raid's timer expires" — no count
 * limit stated). A sane roster reaches `cleared` or `timerExpired` via the
 * ordinary boss-HP/timer math long before approaching this; if this cap is
 * ever actually hit, the run is forced to `timerExpired` as a safe fallback
 * rather than looping forever.
 */
export const MAX_TEAM_RAID_CYCLES = 1000;

export interface TeamRaidSlotInput {
  /** The species fielded in this slot, or null/undefined for an empty slot that never enters the fight. */
  species: SpeciesDefinition | null | undefined;
  /** Fast-move override for this slot — same convention as comparison.ts's candidateFastMoveIds: null/omitted defaults to species.fastMoves[0]. */
  fastMoveId?: string | null;
  /** Charged-move override — see fastMoveId. */
  chargedMoveId?: string | null;
  /**
   * Whether this slot is THE one Mega/Primal-evolved Pokémon for the whole
   * encounter. At most one slot across the roster may set this true — real
   * Pokémon GO only allows one Pokémon Mega Evolved at a time (an
   * account-wide, 8-hour restriction; [official] pokemon.com "A Guide to
   * Mega Evolution in Pokémon GO"). runTeamRaid validates this (throws
   * rather than silently ignoring a violation) and additionally requires the
   * flagged slot's species to actually have `.boost` defined.
   *
   * This flag is purely declarative/validation bookkeeping — it does NOT
   * gate whether this slot's own damage gets boosted (that already happens
   * automatically whenever species.boost is present, the same as any other
   * mega candidate elsewhere in this engine) and it never affects any OTHER
   * slot's damage (see the module doc comment above). Stays mega-evolved
   * across every cycle it's fielded in (a revive doesn't un-mega it).
   */
  isMega?: boolean;
  /**
   * Per-slot override for TeamRaidInputs.level — this slot fights at ITS
   * OWN level instead of the roster-wide default. Omitted/undefined falls
   * back to the roster-wide `level` (today's behavior, byte-identical).
   * Added for the Power-Up Optimizer (powerUp.ts's optimizePowerUps), which
   * needs to simulate one slot power-up'd to a candidate level while every
   * other slot stays at its own current level — but usable by any caller
   * that wants a mixed-level roster.
   */
  level?: number;
  /** Per-slot override for TeamRaidInputs.ivs — see `level` above for the same fallback convention and motivation. */
  ivs?: IVSpread;
  /**
   * This slot's own Mega Level (see megaLevel.ts) — orthogonal to `isMega`
   * above (that flag is purely the account-wide "only one Pokémon Mega
   * Evolved at a time" bookkeeping/validation; a slot's OWN boost already
   * applies automatically whenever its species carries `.boost`, with or
   * without `isMega` set, exactly as ownBoostMultiplier already works —
   * megaLevel follows the same convention). Silently has no effect for a
   * slot whose species has no `.boost` at all — see
   * comparison.ts's resolveCandidateMegaLevel, which this module reuses
   * rather than re-deriving the gate. `undefined`/omitted means no Mega
   * Level effect (identical to `"base"`), so every existing caller needs
   * zero changes.
   */
  megaLevel?: MegaLevel;
}

export interface TeamRaidInputs {
  /** Up to MAX_TEAM_RAID_SLOTS entries, in fight order. A team can field fewer than 6 by leaving trailing/interior entries with species: null. */
  slots: TeamRaidSlotInput[];
  boss: SpeciesDefinition;
  /**
   * Which real raid tier the boss counts as, for real (non-precomputed)
   * species — see comparison.ts's bossEffectiveStats/bossEffectiveHp and
   * raidBoss.ts's RAID_TIER_TABLE. Ignored entirely when
   * boss.statsArePrecomputed is true (this project's hypothetical fixtures
   * and hand-authored test bosses). Omitted/undefined for a real species
   * defaults to defaultRaidTierForSpecies(boss) (rarity/boost-keyed;
   * DEFAULT_REAL_RAID_TIER as the true last resort).
   */
  bossRaidTier?: RaidTier;
  /** Boss fast-move selection. Omit/null defaults to the boss's first fast move. */
  bossFastMoveId?: string | null;
  /** Boss charged-move selection. Omit/null defaults to the boss's first charged move. */
  bossChargedMoveId?: string | null;
  level: number;
  ivs: IVSpread;
  /** Governs dodging the boss's CHARGED attacks only — one shared assumption for the whole roster (dodge skill is a property of the player, not of which of their own Pokémon is currently out). */
  dodge: DodgeBehavior;
  /** Whether the roster also attempts to dodge the boss's fast attacks. Defaults to false. */
  dodgeFastAttacks?: boolean;
  /** See simulate.ts's StepwiseAttacker.holdChargedMoveUntilSafe. Applies to every slot identically. Defaults to false. */
  holdChargedMoveUntilSafe?: boolean;
  /** Mean seconds between the boss's charged moves once it starts using them — one continuous encounter from the boss's side, shared across every slot and every cycle. Consulted under "fixed-interval" as the mean interval between casts, and under "energy-gated-interval" as the mean delay after energy-eligibility (required there — see StepwiseBoss.chargedMoveCadence); ignored entirely under "energy-driven". */
  bossChargedMoveMeanIntervalSeconds: number;
  /**
   * See comparison.ts's SustainedComparisonInputs.bossChargedMoveCadence for
   * the full model. Defaults to "fixed-interval", byte-identical to before
   * this field existed. Applies to the boss for the WHOLE encounter (every
   * slot, every cycle) — see this module's top doc comment and the
   * carriedBossEnergy/carriedNextFireInSeconds handling below for how boss
   * state carries across a slot handoff and a wipe-and-revive under
   * "energy-driven"/"energy-gated-interval" respectively (both carry
   * unconditionally every fight, regardless of which mode is active).
   */
  bossChargedMoveCadence?: BossChargedMoveCadence;
  /**
   * Warmup for the boss's very FIRST charged move of the whole encounter
   * (cycle 0, slot 1 only) — defaults to simulateStepwiseBattle's own
   * physically-derived bossChargedMoveReadySeconds. Every SUBSEQUENT fight
   * (later slot in the same cycle, OR the first slot of a later cycle after
   * a wipe-and-revive) always carries forward the PREVIOUS fight's residual
   * cooldown instead (see StepwiseRunResult.bossChargedMoveResidualSeconds)
   * — the boss doesn't reset its own attack cadence just because the
   * trainer's active Pokémon changed, or because the trainer briefly
   * returned to the lobby to heal (it's still the same raid attempt).
   */
  bossChargedMoveWarmupSeconds?: number;
  /** See comparison.ts's ComparisonInputs.bossStartingEnergy. Only affects the very first fight's default warmup above. Defaults to 0. */
  bossStartingEnergy?: number;
  /** Active weather, applied per-move to both sides — see weather.ts. Defaults to "none". */
  weather?: WeatherCondition;
  /** Real-world raid countdown: 180s for Tier 1/3, 300s for Mega/Legendary/Primal raids (community-consensus real numbers). The single, shared clock across every cycle — see this module's top doc comment. */
  raidTimerSeconds: number;
  /**
   * Seconds of raid clock a forced post-faint swap-in costs (mid-roster,
   * no lobby return). No real fixed value is documented for this in-game (a
   * "brief revival screen pause" of unconfirmed, likely player-reaction-
   * time-driven duration) — defaults to 0 (fastest-possible play), an
   * honest placeholder rather than a fabricated "realistic" number.
   * User-adjustable. Distinct from reviveCostSeconds below, which is paid
   * only once per FULL-roster wipe, not per individual faint.
   */
  swapCostSeconds?: number;
  /**
   * Seconds of raid clock a full-roster wipe-and-rejoin costs: paid once
   * every time every fielded slot has fainted in the current cycle, before
   * restarting from the first fielded slot (see this module's top doc
   * comment and MAX_TEAM_RAID_CYCLES). No official fixed value exists —
   * defaults to 0 (fastest-possible play), the same honesty precedent as
   * swapCostSeconds. A community-sourced ~12-15s estimate exists (Pokémon GO
   * Hub, "Tips for short-manning raids," see
   * proposal_sequential_team_raid_tab.md Section 9 Q4) for a UI-facing
   * labeled preset — do not bake that number in here as though it were a
   * confirmed constant.
   */
  reviveCostSeconds?: number;
  /**
   * Per-fight simulation window cap (applies to every individual slot fight,
   * every cycle). Defaults to enough seconds to cover the full
   * raidTimerSeconds even if a single Pokémon solos the entire fight
   * (Math.max(DEFAULT_STEPWISE_MAX_SECONDS, raidTimerSeconds)) — sized this
   * way so a currently-active fight's own simulated window can never end
   * before the real raid timer would have, which the outcome-detection logic
   * below relies on (see runTeamRaid's inline reasoning). Don't lower this
   * without also reasoning about that invariant.
   */
  maxSecondsPerSlot?: number;
  /** Base seed; each individual fight (cycle, slot) gets its own derived seed, the same offsetting convention runStepwiseDistribution already uses for its iterations, so no two fights in the same run replay the same jitter sequence. Defaults to 1. */
  seed?: number;
}

export interface TeamRaidSlotResult {
  /** 0 = the first pass through the fielded roster; 1 = after the first full wipe-and-revive; 2 = after the second; etc. */
  cycleIndex: number;
  /** Index into the original TeamRaidInputs.slots array (stable across cycles — the same configured slot can appear here more than once, once per cycle it's fielded in). */
  slotIndex: number;
  speciesId: string;
  speciesName: string;
  /** Seconds into this fight (this cycle's own local clock) this slot fainted — null if it survived to the end of the whole encounter (clear or timer expiry) without fainting in this fight. */
  faintedAtSeconds: number | null;
  /** Seconds this fight actually lasted, on its own local clock. */
  secondsActive: number;
  /** Raid-global clock (seconds since the whole encounter began, including every swapCostSeconds/reviveCostSeconds already spent) this fight started/ended — null only if never reached (shouldn't occur for an entry actually present in this array). */
  startedAtRaidSeconds: number;
  endedAtRaidSeconds: number;
  /** This fight's own combined fast+charged damage dealt to the boss. */
  ownDamageDealt: number;
  chargedAttacksLanded: number;
  /**
   * How many of the BOSS's own charged moves landed on this slot during this
   * fight — see simulate.ts's StepwiseRunResult.bossChargedHitsTaken. Exists
   * so a caller (or a test) can observe the energy-driven cadence's headline
   * effect — a higher-DPS roster forcing the boss to throw more charged
   * moves — directly through runTeamRaid's own output, not by re-deriving it
   * from timing side effects. Same "not clipped to the clear point" caveat as
   * chargedAttacksLanded above applies (can slightly overcount for the one
   * fight that lands the finishing blow); doesn't affect any outcome/margin
   * computation.
   */
  bossChargedHitsTaken: number;
  /**
   * Combined fast+charged cumulative TEAM damage over time — this fight's
   * own contribution stacked on top of every prior fight's already-
   * accumulated total (across every earlier slot AND every earlier cycle),
   * timestamped on the raid-GLOBAL clock (not this fight's own local clock).
   * Concatenating every entry's array in array order gives one continuous
   * team-damage trajectory; startedAtRaidSeconds is exactly where a chart
   * should draw a handoff divider (a wipe-and-revive divider when
   * slotIndex resets back to the first fielded slot with a higher
   * cycleIndex, an ordinary next-slot divider otherwise).
   */
  ownDamageTrajectory: DamageTrajectoryPoint[];
  /**
   * See simulate.ts's StepwiseRunResult.dodgeFastAttacksLockout — true when
   * this slot's dodgeFastAttacks setting and the boss's fast move cadence
   * make dodging every fast attack structurally unrecoverable for this
   * fight (the boss's fast move recycles at or faster than
   * DODGE_COST_SECONDS). A config-level fact about this fight's own inputs,
   * not an artifact of this specific run's RNG.
   */
  dodgeFastAttacksLockout: boolean;
  /**
   * Raid-global seconds (same clock as startedAtRaidSeconds/
   * endedAtRaidSeconds) the boss enraged/auto-subdued during THIS fight —
   * see simulate.ts's StepwiseRunResult.enragedAtSeconds/subduedAtSeconds.
   * Both null whenever the boss isn't Shadow, OR the transition didn't occur
   * during this specific fight (it may have already happened in an earlier
   * slot/cycle of the same continuous encounter — see StepwiseBoss.enrage's
   * damageDealtBeforeFight carryover above — or not yet reached by the time
   * this fight ended). Clipped the same way faintedAtSeconds/ownDamageDealt
   * are: a transition that would only have occurred in the raw run's
   * post-clear tail (after the boss's HP actually hit 0) is nulled out, since
   * the encounter was already over by then.
   */
  enragedAtRaidSeconds: number | null;
  subduedAtRaidSeconds: number | null;
}

export type TeamRaidOutcome = "cleared" | "timerExpired";

export interface TeamRaidResult {
  outcome: TeamRaidOutcome;
  clearsWithinTimer: boolean;
  /**
   * Raid-global seconds at which the boss's HP was actually reduced to 0 —
   * null whenever that never happened in this simulated run: either the
   * timer ran out first, or the last fight simulated survived its own full
   * simulated window without fainting or landing the finishing blow (in
   * which case we know the real timer necessarily expired sometime during
   * that fight, but not the honest deficit past it — see maxSecondsPerSlot's
   * doc comment for why that window is always >= raidTimerSeconds).
   */
  timeToClearSeconds: number | null;
  /**
   * raidTimerSeconds - timeToClearSeconds: positive means cleared with time
   * to spare, negative means the finishing blow would only have landed after
   * the real buzzer (a genuinely late but fully-determined clear). null
   * whenever timeToClearSeconds is null.
   */
  timerMarginSeconds: number | null;
  /** Which CYCLE's fight landed the finishing blow — null if it never happened in this run. Pairs with clearingSlotIndex. */
  clearingCycleIndex: number | null;
  /** Which configured slot (index into the original `slots` input) landed the finishing blow — null if it never happened in this run. */
  clearingSlotIndex: number | null;
  /** How many distinct configured slots were sent out at least once across the whole encounter (<= slots.length) — cycle-invariant, unlike slotsFainted below. */
  slotsUsed: number;
  /**
   * Total FAINT EVENTS across every cycle, not distinct slots — a roster
   * that wipes twice with the same 3 fielded slots reports 6 here, not 3,
   * since each faint is a real, separately-costed event (it either triggers
   * the next slot's swapCostSeconds or, if it's the cycle's last fielded
   * slot, the next cycle's reviveCostSeconds). Compare against slotsUsed for
   * "how many distinct slots ever fainted."
   */
  slotsFainted: number;
  /**
   * How many times the full fielded roster fainted out and had to be
   * revived-and-rejoined before the encounter ended — 0 for a clean
   * single-pass clear, incremented once per completed wipe-and-revive cycle.
   * A diagnostic/descriptive stat, NOT a loss condition (see this module's
   * top doc comment) — replaces the old, factually-wrong `teamWiped: boolean`
   * (a full wipe was never actually a hard loss in the real game; see
   * proposal_sequential_team_raid_tab.md Section 9).
   */
  wipeCount: number;
  /**
   * Flat, chronological list of every actual fight across every cycle (a
   * slot that faints and gets revived across 2 cycles produces 2 separate
   * entries here, one per cycle — see TeamRaidSlotResult.cycleIndex). A
   * configured slot with species: null never appears at all, since it never
   * gets fielded in any cycle.
   */
  slots: TeamRaidSlotResult[];
}

function validateRoster(slots: TeamRaidSlotInput[]): void {
  if (slots.length > MAX_TEAM_RAID_SLOTS) {
    throw new Error(`A team raid roster may have at most ${MAX_TEAM_RAID_SLOTS} slots, got ${slots.length}.`);
  }
  if (slots.every((s) => s.species == null)) {
    throw new Error("Team raid requires at least one fielded Pokémon (every slot is empty).");
  }
  const megaSlots = slots.filter((s) => s.isMega);
  if (megaSlots.length > 1) {
    throw new Error(
      `At most one team-raid slot may be flagged isMega — only one Pokémon may be Mega Evolved at a time. Got ${megaSlots.length}.`,
    );
  }
  for (const slot of megaSlots) {
    if (!slot.species?.boost) {
      throw new Error(
        `Slot flagged isMega must use a species with a boost mechanic defined — "${slot.species?.name ?? "(unset)"}" has none.`,
      );
    }
  }
}

/**
 * Runs the full sequential team-raid encounter, cycling through
 * wipe-and-revive as needed, and reports whether/when the team clears the
 * boss within its real, single shared countdown timer. See this module's
 * top doc comment for the mechanics this deliberately does and does not
 * model (no cross-slot mega team-boost math, boss charged-move cooldown OR
 * accumulated energy — whichever bossChargedMoveCadence is active — carries
 * forward across every fight handoff including a wipe-and-revive, unlimited
 * healing items assumed for v1).
 */
export function runTeamRaid(inputs: TeamRaidInputs): TeamRaidResult {
  const {
    slots,
    boss,
    bossRaidTier,
    level,
    ivs,
    dodge,
    dodgeFastAttacks = false,
    holdChargedMoveUntilSafe = false,
    bossChargedMoveMeanIntervalSeconds,
    bossChargedMoveCadence,
    bossChargedMoveWarmupSeconds,
    bossStartingEnergy = 0,
    weather = "none",
    raidTimerSeconds,
    swapCostSeconds = 0,
    reviveCostSeconds = 0,
    maxSecondsPerSlot = Math.max(DEFAULT_STEPWISE_MAX_SECONDS, raidTimerSeconds),
    seed = 1,
  } = inputs;

  validateRoster(slots);

  const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(boss, bossRaidTier);
  // See bossEffectiveHp's doc comment: a real boss's battle HP is a FIXED,
  // flat per-tier pool, NOT boss.baseStamina run through effectiveStat/CPM
  // — only a precomputed boss (this project's hypothetical fixtures/
  // hand-authored test bosses) reads baseStamina straight through.
  const bossHp = bossEffectiveHp(boss, bossRaidTier);
  // Shadow raid enrage — see simulate.ts's StepwiseBoss.enrage and
  // comparison.ts's bossEnrageStats. null for every non-shadow boss.
  const bossEnrage = bossEnrageStats(boss);
  const bossFastMove = resolveMove(boss.fastMoves, inputs.bossFastMoveId);
  if (!bossFastMove) throw new Error(`Boss species ${boss.id} has no fast move defined.`);
  const bossChargedMove = resolveMove(boss.chargedMoves, inputs.bossChargedMoveId);

  const activeEntries = slots
    .map((slot, slotIndex) => ({ slot, slotIndex }))
    .filter((entry): entry is { slot: TeamRaidSlotInput & { species: SpeciesDefinition }; slotIndex: number } => entry.slot.species != null);

  const slotResults: TeamRaidSlotResult[] = [];

  let bossDamageAccum = 0;
  let globalClock = 0;
  // Only the very first fight of the whole encounter (cycle 0, first fielded
  // slot) derives the boss's charged-move readiness the normal way
  // (warmup/startingEnergy, still followed by one jittered interval roll
  // before the actual first cast — see simulate.ts). Every SUBSEQUENT fight
  // (later slot in the same cycle, or the first slot of a later cycle after
  // a wipe-and-revive) instead carries forward the PREVIOUS fight's
  // fully-resolved residual cooldown via carriedNextFireInSeconds below,
  // which bypasses that extra jitter roll entirely — the boss's cadence
  // doesn't restart just because the trainer swapped Pokémon or briefly
  // returned to the lobby to heal (it's still the same raid attempt).
  //
  // carriedNextFireInSeconds/carriedStartingEnergy are the "fixed-interval"
  // cadence's carryover state; carriedBossEnergy (below) is the
  // energy-tracking cadences' equivalent — fed from StepwiseRunResult.
  // bossEndingEnergy, which is non-null under BOTH "energy-driven" AND
  // "energy-gated-interval" (see that field's doc comment) for why a slot
  // handoff must NOT silently reset the boss's accumulated energy (doing so
  // would make either energy-tracking mode MORE forgiving than
  // "fixed-interval", backwards from the whole point of the model).
  // carriedNextFireInSeconds itself is NOT fixed-interval-only either — it is
  // also fed from StepwiseRunResult.bossChargedMoveResidualSeconds, which is
  // non-null under "energy-gated-interval" too whenever that mode has a
  // pending post-eligibility delay (see that field's own doc comment); only
  // "energy-driven" has neither a residual cooldown nor a use for one.
  // DECISION: both carried values cross a wipe-and-revive too, for the same
  // "one continuous encounter from the boss's side" reasoning already applied
  // to the fixed-interval cooldown above — neither carriedNextFireInSeconds
  // nor carriedBossEnergy is ever reset at a cycle boundary, only read/written
  // per-fight, so this falls out of the existing loop structure rather than
  // needing special-cased wipe handling. Under "fixed-interval" (the
  // default), carriedBossEnergy always stays undefined (bossEndingEnergy is
  // null in that mode), so startingEnergy below resolves to 0 exactly as it
  // always did — this addition is byte-identical for existing callers.
  let carriedStartingEnergy = bossStartingEnergy;
  let carriedNextFireInSeconds: number | undefined;
  let carriedBossEnergy: number | undefined;
  let outcome: TeamRaidOutcome | null = null;
  let timeToClearSeconds: number | null = null;
  let clearingCycleIndex: number | null = null;
  let clearingSlotIndex: number | null = null;
  let wipeCount = 0;
  let fightIndex = 0; // strictly increasing across every (cycle, slot) fight, used only for seed offsetting

  cycleLoop: for (let cycleIndex = 0; cycleIndex < MAX_TEAM_RAID_CYCLES; cycleIndex++) {
    for (let n = 0; n < activeEntries.length; n++) {
      const { slot, slotIndex } = activeEntries[n]!;
      const species = slot.species;
      const isVeryFirstFight = cycleIndex === 0 && n === 0;

      if (n > 0) globalClock += swapCostSeconds;

      if (globalClock >= raidTimerSeconds) {
        // The timer ran out before this Pokémon could even be sent in (e.g.
        // mid-swap-cost after the previous slot's faint, or mid-revive-cost
        // after a full wipe) — nothing to simulate.
        outcome = "timerExpired";
        break cycleLoop;
      }

      const startClock = globalClock;
      // Per-slot level/ivs override (see TeamRaidSlotInput.level's doc
      // comment) — omitted for a slot falls back to the roster-wide
      // level/ivs exactly as before this field existed. megaLevel shifts the
      // effective-level lookup on top of that (Super Max's CP bonus — see
      // megaLevel.ts), gated on this slot's OWN species carrying `.boost`.
      const megaLevel = resolveCandidateMegaLevel(species, slot.megaLevel);
      const stats = effectiveStatsAtLevel(species, slot.ivs ?? ivs, effectiveLevelForMegaLevel(slot.level ?? level, megaLevel));
      const fastMove = resolveMove(species.fastMoves, slot.fastMoveId);
      const rawChargedMove = resolveMove(species.chargedMoves, slot.chargedMoveId);
      if (!fastMove || !rawChargedMove) {
        throw new Error(`Team raid slot ${slotIndex} (${species.id}) needs at least one fast move and one charged move.`);
      }
      // A "+" move's power is scaled for this slot's current Mega Level here,
      // once, before every downstream use of `chargedMove` — see
      // megaLevel.ts's chargedMoveAtMegaLevel (a no-op for every ordinary
      // move, including a mega's own normal two).
      const chargedMove = chargedMoveAtMegaLevel(rawChargedMove, megaLevel);
      const fastVsBoss = typeEffectiveness(fastMove.type, boss.types);
      const chargedVsBoss = typeEffectiveness(chargedMove.type, boss.types);
      const bossVsSlot = typeEffectiveness(bossFastMove.type, species.types);
      const bossChargedVsSlot = bossChargedMove ? typeEffectiveness(bossChargedMove.type, species.types) : 1;

      const attacker: StepwiseAttacker = {
        hp: stats.stamina,
        defenseStat: stats.defense,
        attackStat: stats.attack,
        fastMove,
        chargedMove,
        fastDamageOut: {
          stab: species.types.includes(fastMove.type),
          typeEffectiveness: fastVsBoss,
          megaBoostMultiplier: ownBoostMultiplier(species.boost, fastMove.type),
          weatherBoosted: isWeatherBoosted(fastMove.type, weather),
        },
        chargedDamageOut: {
          stab: species.types.includes(chargedMove.type),
          typeEffectiveness: chargedVsBoss,
          megaBoostMultiplier: ownBoostMultiplier(species.boost, chargedMove.type),
          weatherBoosted: isWeatherBoosted(chargedMove.type, weather),
        },
        holdChargedMoveUntilSafe,
      };

      const bossForSlot: StepwiseBoss = {
        attackStat: bossAttackStat,
        defenseStat: bossDefenseStat,
        fastMove: bossFastMove,
        damageOut: {
          stab: boss.types.includes(bossFastMove.type),
          typeEffectiveness: bossVsSlot,
          weatherBoosted: isWeatherBoosted(bossFastMove.type, weather),
        },
        chargedMove: bossChargedMove,
        chargedMoveDamageOut: bossChargedMove
          ? {
              stab: boss.types.includes(bossChargedMove.type),
              typeEffectiveness: bossChargedVsSlot,
              weatherBoosted: isWeatherBoosted(bossChargedMove.type, weather),
            }
          : undefined,
        chargedMoveCadence: bossChargedMoveCadence,
        chargedMoveMeanIntervalSeconds: bossChargedMoveMeanIntervalSeconds,
        chargedMoveWarmupSeconds: isVeryFirstFight ? bossChargedMoveWarmupSeconds : undefined,
        // Under "fixed-interval", carriedBossEnergy is always undefined (see
        // the doc comment above carriedStartingEnergy), so this resolves to
        // carriedStartingEnergy/0 exactly as before. Under "energy-driven"
        // AND "energy-gated-interval", this is the one line that actually
        // carries the boss's accumulated energy across the handoff.
        // NOTE — this is NOT "every non-fixed mode ignores the countdown
        // fields": chargedMoveWarmupSeconds is genuinely ignored under BOTH
        // energy-tracking modes (structurally inert — simulate.ts never
        // consults it once chargedMoveCadence isn't "fixed-interval"), but
        // chargedMoveNextFireInSeconds below is inert ONLY under
        // "energy-driven" (which has no fixed "next fire" schedule at all —
        // see StepwiseSimulationParams' bossEnergyDriven gate). Under
        // "energy-gated-interval" it is load-bearing, exactly like under
        // "fixed-interval": it pre-arms that mode's pending post-eligibility
        // delay (bossGatedFireAt) with no re-roll, carrying a slot's residual
        // delay forward the same way the fixed-interval cooldown already
        // does. Both fields are left populated unconditionally below because
        // they're harmless no-ops whenever the active mode doesn't consult
        // them.
        startingEnergy: isVeryFirstFight ? carriedStartingEnergy : (carriedBossEnergy ?? 0),
        chargedMoveNextFireInSeconds: isVeryFirstFight ? undefined : carriedNextFireInSeconds,
        // Shadow raid enrage — see simulate.ts's StepwiseBoss.enrage.
        // damageDealtBeforeFight carries this SLOT's starting point in the
        // boss's real, continuous HP pool (bossDamageAccum, already tracked
        // below for the clear-detection post-processing) — the boss doesn't
        // reset to "full HP, not enraged" just because the trainer swapped
        // Pokémon or the roster wiped-and-revived; it's still the same fight
        // from the boss's own side, exactly like its charged-move cadence
        // carryover just above.
        enrage: bossEnrage
          ? { maxHp: bossHp, damageDealtBeforeFight: bossDamageAccum, attackStat: bossEnrage.attack, defenseStat: bossEnrage.defense }
          : undefined,
      };

      const run = simulateStepwiseBattle({
        attacker,
        boss: bossForSlot,
        dodge,
        dodgeFastAttacks,
        maxSeconds: maxSecondsPerSlot,
        seed: seed + fightIndex * 7919,
      });
      fightIndex += 1;

      // Scan this fight's own trajectory for the earliest point the boss's
      // HP (accumulated across every prior fight's damage, plus this fight's
      // own running total) reaches zero. The run itself always plays out to
      // its own natural end (faint or maxSecondsPerSlot) regardless — see
      // this module's boss-HP-as-post-processing design — so a clear found
      // mid-run must be clipped below: nothing that happens in the raw run
      // AFTER the real finishing blow is real (the encounter is over the
      // instant the boss's HP hits zero, including whatever would otherwise
      // have happened to the attacker later in that same simulated run).
      let localClearIndex: number | null = null;
      let localClearSeconds: number | null = null;
      for (let pointIndex = 0; pointIndex < run.ownDamageTrajectory.length; pointIndex++) {
        const point = run.ownDamageTrajectory[pointIndex]!;
        if (bossDamageAccum + point.cumulativeDamage >= bossHp) {
          localClearIndex = pointIndex;
          localClearSeconds = point.atSeconds;
          break;
        }
      }
      const clearedThisFight = localClearSeconds !== null;

      // Whether this fight's own faint is still real once clipped to the
      // clear point: a faint recorded strictly AFTER the finishing blow
      // never actually happens (the raid was already won); a faint at or
      // before it is a genuine same-tick "traded the finishing blow for its
      // own faint".
      const clippedFaintedAtSeconds =
        clearedThisFight && (run.faintedAtSeconds === null || run.faintedAtSeconds > localClearSeconds!)
          ? null
          : run.faintedAtSeconds;
      const localEndSeconds = clearedThisFight ? localClearSeconds! : (run.faintedAtSeconds ?? maxSecondsPerSlot);
      const fightOwnDamage = clearedThisFight
        ? run.ownDamageTrajectory[localClearIndex!]!.cumulativeDamage
        : run.totalFastMoveDamage + run.totalChargedDamage;
      const clippedTrajectory = clearedThisFight ? run.ownDamageTrajectory.slice(0, localClearIndex! + 1) : run.ownDamageTrajectory;
      // Same clip-to-clear-point rule as clippedFaintedAtSeconds above — see
      // TeamRaidSlotResult.enragedAtRaidSeconds/subduedAtRaidSeconds's doc
      // comment.
      const clippedEnragedAtSeconds =
        clearedThisFight && (run.enragedAtSeconds === null || run.enragedAtSeconds > localClearSeconds!) ? null : run.enragedAtSeconds;
      const clippedSubduedAtSeconds =
        clearedThisFight && (run.subduedAtSeconds === null || run.subduedAtSeconds > localClearSeconds!) ? null : run.subduedAtSeconds;

      slotResults.push({
        cycleIndex,
        slotIndex,
        speciesId: species.id,
        speciesName: species.name,
        faintedAtSeconds: clippedFaintedAtSeconds,
        secondsActive: localEndSeconds,
        startedAtRaidSeconds: startClock,
        endedAtRaidSeconds: startClock + localEndSeconds,
        ownDamageDealt: fightOwnDamage,
        // NOTE: not clipped to the clear point for the specific fight that
        // lands the finishing blow — this can slightly overcount (counting a
        // charged attack that would land only in the moot post-clear tail of
        // the raw run) for that one fight only. A real, minor, documented
        // simplification: recovering an exact clipped count would need
        // per-point fast-vs-charged classification data StepwiseRunResult
        // doesn't expose. Doesn't affect any outcome/margin computation.
        chargedAttacksLanded: run.chargedAttacksLanded,
        bossChargedHitsTaken: run.bossChargedHitsTaken,
        ownDamageTrajectory: clippedTrajectory.map((p) => ({
          atSeconds: startClock + p.atSeconds,
          cumulativeDamage: bossDamageAccum + p.cumulativeDamage,
        })),
        dodgeFastAttacksLockout: run.dodgeFastAttacksLockout,
        enragedAtRaidSeconds: clippedEnragedAtSeconds !== null ? startClock + clippedEnragedAtSeconds : null,
        subduedAtRaidSeconds: clippedSubduedAtSeconds !== null ? startClock + clippedSubduedAtSeconds : null,
      });

      if (clearedThisFight) {
        clearingCycleIndex = cycleIndex;
        clearingSlotIndex = slotIndex;
        timeToClearSeconds = startClock + localClearSeconds!;
        outcome = "cleared"; // refined below against raidTimerSeconds
        break cycleLoop;
      }

      bossDamageAccum += fightOwnDamage;
      globalClock = startClock + localEndSeconds;
      carriedNextFireInSeconds =
        run.bossChargedMoveResidualSeconds != null ? Math.max(0, run.bossChargedMoveResidualSeconds) : undefined;
      carriedBossEnergy = run.bossEndingEnergy ?? undefined;
      carriedStartingEnergy = 0;

      if (run.faintedAtSeconds === null) {
        // Survived its own full simulated window without fainting or
        // clearing. maxSecondsPerSlot is always >= raidTimerSeconds (see its
        // doc comment), and startClock < raidTimerSeconds is guaranteed by
        // the check at the top of this loop, so the real raid timer
        // necessarily elapsed sometime during this fight — but exactly how
        // much MORE time would have been needed is genuinely unknown (this
        // fight never fainted, so there's no "next fight" data point to
        // bound it), hence timeToClearSeconds stays null rather than being
        // guessed at.
        outcome = "timerExpired";
        break cycleLoop;
      }
      // Fainted with no clear yet — continue on to the next fielded slot in
      // this cycle (or, if this was the last one, fall through below to pay
      // reviveCostSeconds and loop back to the first fielded slot).
    }

    // Every fielded slot fainted this cycle without ever clearing the boss
    // or hitting the timer mid-cycle — this is a full team wipe. Per the
    // corrected mechanic (this module's top doc comment), that is NOT a
    // loss: pay reviveCostSeconds and loop back to the first fielded slot,
    // as long as the timer still allows it (checked at the top of the next
    // cycle's first iteration, same as any other swap/revive-induced clock
    // advance).
    wipeCount += 1;
    globalClock += reviveCostSeconds;
  }

  if (outcome === null) {
    // Exhausted MAX_TEAM_RAID_CYCLES without ever clearing or hitting the
    // timer through the ordinary boss-HP/timer math — see that constant's
    // doc comment. This is a pure engineering safety fallback for a
    // degenerate roster, not a real game outcome; treated as the timer
    // having effectively run out, since the real game's only other stopping
    // condition (a clear) demonstrably never occurred in this many cycles.
    outcome = "timerExpired";
  }

  const clearsWithinTimer = timeToClearSeconds !== null && timeToClearSeconds <= raidTimerSeconds;
  if (outcome === "cleared" && !clearsWithinTimer) outcome = "timerExpired";

  const usedSlotIndices = new Set(slotResults.map((s) => s.slotIndex));

  return {
    outcome,
    clearsWithinTimer,
    timeToClearSeconds,
    timerMarginSeconds: timeToClearSeconds !== null ? raidTimerSeconds - timeToClearSeconds : null,
    clearingCycleIndex,
    clearingSlotIndex,
    slotsUsed: usedSlotIndices.size,
    slotsFainted: slotResults.filter((s) => s.faintedAtSeconds !== null).length,
    wipeCount,
    slots: slotResults,
  };
}
