import { bossEffectiveHp, bossEffectiveStats, ownBoostMultiplier, resolveMove } from "./comparison.js";
import type { MegaLevel } from "./megaLevel.js";
import {
  RARE_CANDY_TO_CANDY_RATIO,
  noiseFloorFor,
  powerUpLevelMetrics,
  summarizeResults,
  type PowerUpResourceCost,
} from "./powerUp.js";
import {
  resolveCandyFamilyId,
  toSlotInput,
  type RosterBaselineBossSummary,
  type RosterEntry,
  type WeightedRaidTarget,
} from "./rosterPlanner.js";
import {
  canLearnSecondChargedMove,
  generateEliteTmCandidates,
  generateSecondChargedMoveCandidates,
  isSpeciesTmEligible,
  isTmTargetableMove,
  secondChargedMoveCost,
  toPowerUpResourceCost,
  type EliteTmKind,
  type MoveChangeEvaluationInputs,
  type SecondChargedMoveCostModifiers,
} from "./tmMove.js";
import { MAX_TEAM_RAID_SLOTS, runTeamRaid, type TeamRaidInputs, type TeamRaidSlotInput } from "./teamRaid.js";
import { typeEffectiveness } from "./typeChart.js";
import type { ChargedMove, FastMove, SpeciesDefinition } from "./types.js";
import { isWeatherBoosted, type WeatherCondition } from "./weather.js";

/**
 * Roster-mode ("multi-raid") half of PLAN_tm_move_change_optimizer.md's
 * "Both modes, not just single-raid" section — second-charged-move and Elite
 * TM candidates swept across a WHOLE POOL x boss SET, the same shape
 * rosterPlanner.ts already generalizes power-up candidates to. Deliberately
 * a SEPARATE file/export from rosterPlanner.ts (mirrors how tmMove.ts itself
 * sits alongside powerUp.ts) rather than growing runRosterPlanner further —
 * this sweep answers a DIFFERENT question (which move change is worth
 * making) using the SAME baseline/team data runRosterPlanner already
 * computed, not a new independent one.
 *
 * REUSES tmMove.ts's EXISTING generators for the FIELDED case unchanged
 * (`generateSecondChargedMoveCandidates`/`generateEliteTmCandidates` — both
 * already generic over `TeamRaidInputs`/`TeamRaidSlotInput`, per that
 * module's own top doc comment, specifically so this file could call them
 * without editing tmMove.ts at all). The BENCHED case (IDEAS/plan: "not
 * limited to the six already fielded") needs genuinely different mechanics
 * — see "FIELDED vs BENCHED" below — implemented directly in this file
 * using the same lower-level primitives (runTeamRaid/summarizeResults/
 * noiseFloorFor) tmMove.ts's own evaluateMoveChangeTargets composes,
 * without touching tmMove.ts's "one field of an EXISTING slot" model, which
 * doesn't fit a species swap.
 *
 * === Only the FOUR-ACTION scope tmMove.ts already ships ==================
 *
 * Regular (non-Elite) TM and Frustration removal are OUT OF SCOPE here too,
 * for the exact reasons tmMove.ts's own top doc comment already gives (a
 * random, non-uniform-confirmed outcome; a calendar-gated informational-only
 * mechanic) — this module does not reopen either question.
 *
 * === Scale, measured (2026-09-10) =========================================
 *
 * See this repo's engine-developer memory
 * (fix/feature_roster_move_change_scale_2026_09_10.md) for the actual
 * measured numbers on a realistic pool/boss scale. Headline: the FIELDED
 * case (bounded — at most MAX_TEAM_RAID_SLOTS x targets.length slots, each
 * with a handful of alternate moves) is cheap and always run in full. The
 * BENCHED case is the real cost driver at pool scale (100-200 entries), so
 * it is gated behind a CHEAP, NO-SIMULATION proxy prefilter (see
 * `benchedProxyDamagePerSecond` below) before any real
 * paired-team-raid evaluation is paid for — the same "screen cheap, confirm
 * real" discipline rosterPlanner.ts's own Stage 3 already uses, just built
 * on `powerUpLevelMetrics` directly rather than a real simulated screen
 * score (no per-boss "who's fielded and how good are they" baseline exists
 * for a not-yet-fielded entry to scale from).
 *
 * === The "known moveset" rule (plan's central rule) applies to ALL FOUR
 * actions, and binds HARDEST here ======================================
 *
 * A TM candidate may only ever be generated for a KNOWN moveset — see
 * PLAN_tm_move_change_optimizer.md's "The one clause that was overridden"
 * section (a blank CSV cell means "not captured," never "has no move," so
 * pricing a TM against it would invent a purchase and aim a random reroll
 * at exactly the Pokémon a player is least willing to gamble on). Gated on
 * `RosterEntry.movesetIsDefaulted` (Elite TM — a currently-active move is
 * always resolvable, but not trustworthy if it's a guess) AND
 * `RosterEntry.knownChargedMoveIds` (second-charged-move specifically needs
 * to know 1-vs-2 known charged moves, which a single `chargedMoveId` can't
 * distinguish — see that field's own doc comment in rosterPlanner.ts).
 * Every excluded entry is reported in `RosterMoveChangeResult.excluded`,
 * never silently dropped from the sweep — roughly a third of a real Poke
 * Genie import has a blank move column, so this exclusion is large and
 * visible by design.
 *
 * === Ranking axis (CLAUDE.md standing decision) ===========================
 *
 * `secondChargedMove` candidates are priced in stardust + candy and
 * DELIBERATELY compete in the SAME resource ledger a power-up does (the
 * plan's own words: "it competes in the stardust/candy budget already
 * tracked") — reported with `deltaPer1000Stardust`/`deltaPerCandy`, the
 * SAME two metrics `RosterPowerUpCandidate` already uses. `eliteTm`
 * candidates are priced in Elite [Fast|Charged] TM ITEMS — a third/fourth
 * non-fungible currency, never blended into the stardust/candy axis or into
 * each other (an Elite Fast TM candidate never competes against an Elite
 * Charged TM one on one sorted list) — see CLAUDE.md's "TM candidates need
 * their own axis" rule. This is why `secondChargedMove` and `eliteTm` are
 * two ENTIRELY SEPARATE output arrays, never merged or cross-ranked.
 *
 * === No joint budget allocator here (deliberate scope cut) ===============
 *
 * `runRosterMoveChangeCandidates` below answers "what's the best TM
 * opportunity, priced as if it were the only thing you buy" — the SAME
 * "priced independently" convention `runRosterPlanner`'s ranked table uses
 * (CLAUDE.md's "two different questions" split, mirrored from
 * `optimizePowerUps` vs `planPowerUpBudget`). It does NOT fold into
 * `planRosterBudget`'s joint stardust/candy/Rare-Candy allocator — TM items
 * are an ACCOUNT-WIDE, per-kind-non-fungible pool (like
 * `rareCandyOnHand`/`rareCandyXlOnHand`, per the plan's "Hard constraints"),
 * and building a joint allocator that spends stardust, candy, Rare Candy,
 * Elite Fast TMs and Elite Charged TMs together in ONE greedy search is a
 * real rearchitecture on the same order as the evolve-then-power-up commit
 * question rosterPlanner.ts already declined for `planRosterBudget` (see
 * that module's own top doc comment) — not attempted in this pass. Each
 * candidate's own `affordable`/`eliteFastTmAffordable`/`eliteChargedTmAffordable`
 * field answers "could I buy JUST this," same as `RosterPowerUpCandidate.affordable`.
 *
 * === At most one Mega (real bug fixed 2026-09-10) =========================
 *
 * A BENCHED candidate's real evaluation swaps it into the boss's fielded
 * team — normally into the team's plain weakest (6th) slot. But real
 * Pokémon GO only allows ONE Pokémon Mega Evolved at a time
 * (`runTeamRaid`'s own validation throws on a second `isMega` slot), and a
 * baseline team's fielded mega is very often NOT its weakest member (a good
 * mega usually scores near the top) — so naively always swapping the
 * weakest slot can field two megas at once whenever the benched candidate is
 * ALSO mega-capable. This is not an edge case: the planner always fields its
 * single best mega, so every OTHER mega-capable pool entry is benched by
 * construction, making "baseline mega + benched mega candidate" the
 * ORDINARY shape of a real roster, not a rare one. When this happens, the
 * fielded mega slot is displaced instead of the weakest one — the only
 * faithful comparison for a candidate that would ALSO be mega'd is "does it
 * beat your CURRENT mega," not "does it beat your worst attacker." This
 * changes which slot the delta is measured against for exactly this case,
 * so it is surfaced explicitly via `displacedEntryId`/`displacedFieldedMega`
 * on the output row rather than left implicit — never silently reported as
 * an ordinary weakest-slot swap. See `rosterPlanner.ts`'s own `selectTeam`
 * for the established, analogous convention (skip a second `canMega` entry
 * rather than let two through) this mirrors.
 */

// ---------------------------------------------------------------------------
// Shared inputs
// ---------------------------------------------------------------------------

export interface RosterMoveChangeInputs {
  /** The whole pool being reasoned over — same convention as RosterPlannerInputs.pool. */
  pool: RosterEntry[];
  targets: WeightedRaidTarget[];
  /**
   * The ALREADY-COMPUTED baseline per boss — pass `RosterPlanResult.baselinePerBoss`
   * (or `RosterBudgetPlan.finalPerBoss`, to evaluate against a COMMITTED
   * power-up plan's ending roster state) straight through. Never recomputed
   * here — this guarantees "who's actually fielded" answers the SAME
   * question runRosterPlanner already answered (same iteration count/seed),
   * and avoids paying for a second Stage 1+2 pass. Must have exactly one
   * entry per `targets`, in the same order.
   */
  baselinePerBoss: RosterBaselineBossSummary[];
  /** Candy on hand, pooled per candyFamilyId — same shape/convention as RosterPlannerInputs.candyByFamilyId (second-charged-move draws from the SAME pool a power-up does). */
  candyByFamilyId: Record<string, { candy: number; xlCandy: number } | undefined>;
  /** Same shared, fungible, account-wide pool as RosterPlannerInputs.rareCandyOnHand — second-charged-move candy can draw from it. Defaults to 0. */
  rareCandyOnHand?: number;
  /** Elite Fast TMs on hand — account-wide, non-fungible with Elite Charged TMs or with any candy/stardust pool. Defaults to 0. */
  eliteFastTmOnHand?: number;
  /** Elite Charged TMs on hand — see eliteFastTmOnHand. Defaults to 0. */
  eliteChargedTmOnHand?: number;
  dodge: TeamRaidInputs["dodge"];
  dodgeFastAttacks?: boolean;
  megaLevel?: MegaLevel;
  holdChargedMoveUntilSafe?: boolean;
  bossChargedMoveMeanIntervalSeconds: number;
  bossChargedMoveCadence?: TeamRaidInputs["bossChargedMoveCadence"];
  weather?: WeatherCondition;
  raidTimerSeconds: number;
  swapCostSeconds?: number;
  reviveCostSeconds?: number;
  maxSecondsPerSlot?: number;
  seed?: number;
  /** Paired-evaluation iterations — same convention as MoveChangeEvaluationInputs.iterations. Defaults to 3. */
  iterations?: number;
  /**
   * Whether to also search BENCHED entries (not currently fielded on any
   * boss's team) — the plan's headline "not limited to the six already
   * fielded" requirement. This is the real cost driver at pool scale (see
   * this module's top doc comment) — a caller doing a first pass, or one
   * that measures this too slow for its own pool size, can set this false
   * to keep the sweep to the cheap fielded-only case. Defaults to true.
   */
  includeBenchedEntries?: boolean;
  /**
   * Cap on how many benched (entry, candidate move, boss) combinations get a
   * REAL paired simulation, ACROSS THE WHOLE SWEEP, after the cheap proxy
   * prefilter ranks them — the actual bound on this module's real
   * simulation cost at pool scale, independent of pool/boss/movepool size.
   * Defaults to 60 (same default as rosterPlanner.ts's own maxCandidates).
   */
  maxBenchedRealEvaluations?: number;
}

interface SharedTeamRaidAssumptions {
  dodge: TeamRaidInputs["dodge"];
  dodgeFastAttacks?: boolean;
  holdChargedMoveUntilSafe?: boolean;
  bossChargedMoveMeanIntervalSeconds: number;
  bossChargedMoveCadence?: TeamRaidInputs["bossChargedMoveCadence"];
  raidTimerSeconds: number;
  swapCostSeconds?: number;
  reviveCostSeconds?: number;
  maxSecondsPerSlot?: number;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface RosterSecondChargedMoveCandidate {
  /** True for an entry already fielded on this boss's baseline team; false for a benched entry this candidate would newly field (displacing a fielded slot — see displacedEntryId/displacedFieldedMega). */
  fielded: boolean;
  entryId: string;
  bossId: string;
  bossName: string;
  speciesId: string;
  speciesName: string;
  newChargedMoveId: string;
  newChargedMoveName: string;
  cost: PowerUpResourceCost;
  costUnverified: boolean;
  affordable: boolean;
  sharedCandyNeeded: number;
  deltaTeamDps: number;
  deltaExceedsNoise: boolean;
  deltaPer1000Stardust: number | null;
  deltaPerCandy: number | null;
  /** Only meaningful when `fielded` is false: the entryId of the fielded team member this candidate's real evaluation swapped OUT. `null` for a fielded row (nobody is displaced — the entry is already on the team). See `displacedFieldedMega` for what it means when this ISN'T the team's plain weakest member. */
  displacedEntryId: string | null;
  /** See displacedEntryId's doc comment — the mega-conflict case (real Pokémon GO bug found 2026-09-10, see rosterMoveChange.ts's own top doc comment "At most one Mega" note). */
  displacedFieldedMega: boolean;
}

export interface RosterEliteTmCandidate {
  fielded: boolean;
  entryId: string;
  bossId: string;
  bossName: string;
  speciesId: string;
  speciesName: string;
  kind: EliteTmKind;
  currentMoveId: string;
  currentMoveName: string;
  newMoveId: string;
  newMoveName: string;
  deltaTeamDps: number;
  deltaExceedsNoise: boolean;
  /** Always 1 — see tmMove.ts's EliteTmCandidate.eliteTmItemsSpent for why this is never blended into a stardust/candy total. */
  eliteTmItemsSpent: 1;
  /** Whether THIS SINGLE candidate is affordable against eliteFastTmOnHand/eliteChargedTmOnHand (priced independently — see this module's top doc comment, "No joint budget allocator here"). */
  affordable: boolean;
  /** See RosterSecondChargedMoveCandidate.displacedEntryId — same convention, same mega-conflict case. */
  displacedEntryId: string | null;
  /** See RosterSecondChargedMoveCandidate.displacedFieldedMega. */
  displacedFieldedMega: boolean;
}

export interface RosterMoveChangeExcludedEntry {
  entryId: string;
  speciesId: string;
  speciesName: string;
  reason: string;
}

export interface RosterMoveChangeResult {
  secondChargedMove: RosterSecondChargedMoveCandidate[];
  eliteTm: RosterEliteTmCandidate[];
  /** Pool entries excluded from EVERY move-change candidate (moveset unknown, species un-TM-able) — never silently dropped, per the plan's central rule. An entry may ALSO appear here even if it produced no candidates for an orthogonal reason (e.g. already knows its second charged move) — see each entry's own `reason`. */
  excluded: RosterMoveChangeExcludedEntry[];
  /** How many real runTeamRaid calls this sweep actually made — for a caller/skeptic to sanity-check against this module's own scale warnings. */
  teamRaidCallCount: number;
}

// ---------------------------------------------------------------------------
// Cheap, no-simulation proxy — BENCHED candidates only (see top doc comment)
// ---------------------------------------------------------------------------

interface BossProxyContext {
  bossSpecies: SpeciesDefinition;
  bossAttackStat: number;
  bossDefenseStat: number;
  bossFastMove: FastMove;
  bossChargedMove: ChargedMove | undefined;
  weather: WeatherCondition;
}

function buildBossProxyContext(target: WeightedRaidTarget, weather: WeatherCondition): BossProxyContext {
  const { attack, defense } = bossEffectiveStats(target.species, target.tier);
  const bossFastMove = resolveMove(target.species.fastMoves, target.bossFastMoveId);
  if (!bossFastMove) throw new Error(`Boss target ${target.species.id} has no fast move defined.`);
  const bossChargedMove = resolveMove(target.species.chargedMoves, target.bossChargedMoveId);
  return { bossSpecies: target.species, bossAttackStat: attack, bossDefenseStat: defense, bossFastMove, bossChargedMove, weather };
}

/**
 * outgoingFastDamage/duration + outgoingChargedDamage/duration for `entry`
 * fighting `fastMove`/`chargedMove` (a caller-supplied candidate pair, not
 * necessarily `entry`'s own currently-active moves) against `boss` — the
 * SAME deliberately-crude, no-simulation composition rosterPlanner.ts's own
 * private `proxyDps` uses (built self-contained here rather than importing
 * that internal helper, to avoid coupling this file to rosterPlanner.ts's
 * caching internals for a 2-line arithmetic composition). Used ONLY to rank
 * which benched (entry, candidate move) pairs are worth a REAL paired
 * simulation — never itself reported as a team-DPS value.
 */
function benchedProxyDamagePerSecond(
  entry: RosterEntry,
  fastMove: FastMove,
  chargedMove: ChargedMove,
  boss: BossProxyContext,
  megaLevel: MegaLevel | undefined,
): number {
  const metrics = powerUpLevelMetrics({
    species: entry.species,
    ivs: entry.ivs,
    level: entry.level,
    fastMove,
    chargedMove,
    megaLevel,
    outgoingFastMoveDamageModifiers: {
      stab: entry.species.types.includes(fastMove.type),
      typeEffectiveness: typeEffectiveness(fastMove.type, boss.bossSpecies.types),
      megaBoostMultiplier: ownBoostMultiplier(entry.species.boost, fastMove.type),
      weatherBoosted: isWeatherBoosted(fastMove.type, boss.weather),
    },
    outgoingChargedMoveDamageModifiers: {
      stab: entry.species.types.includes(chargedMove.type),
      typeEffectiveness: typeEffectiveness(chargedMove.type, boss.bossSpecies.types),
      megaBoostMultiplier: ownBoostMultiplier(entry.species.boost, chargedMove.type),
      weatherBoosted: isWeatherBoosted(chargedMove.type, boss.weather),
    },
    bossFastMove: boss.bossFastMove,
    bossChargedMove: boss.bossChargedMove,
    bossAttackStat: boss.bossAttackStat,
    bossDefenseStat: boss.bossDefenseStat,
    incomingFastMoveDamageModifiers: {
      stab: boss.bossSpecies.types.includes(boss.bossFastMove.type),
      typeEffectiveness: typeEffectiveness(boss.bossFastMove.type, entry.species.types),
      weatherBoosted: isWeatherBoosted(boss.bossFastMove.type, boss.weather),
    },
    incomingChargedMoveDamageModifiers: boss.bossChargedMove
      ? {
          stab: boss.bossSpecies.types.includes(boss.bossChargedMove.type),
          typeEffectiveness: typeEffectiveness(boss.bossChargedMove.type, entry.species.types),
          weatherBoosted: isWeatherBoosted(boss.bossChargedMove.type, boss.weather),
        }
      : undefined,
  });
  return metrics.outgoingFastDamage / fastMove.durationSeconds + metrics.outgoingChargedDamage / chargedMove.durationSeconds;
}

// ---------------------------------------------------------------------------
// Eligibility (the plan's central "known moveset" rule, applied uniformly)
// ---------------------------------------------------------------------------

/** `null` means eligible for TM candidate generation at all (Elite TM's own move-specific / second-charged-move's own count-specific checks still apply on top). Non-null names why not, for RosterMoveChangeResult.excluded. */
function moveChangeEligibilityReason(entry: RosterEntry): string | null {
  if (entry.movesetIsDefaulted) {
    return `${entry.species.name}'s moveset was not observed (default/guessed) — a TM is never priced against a moveset this tool never confirmed.`;
  }
  if (!isSpeciesTmEligible(entry.species)) {
    return `${entry.species.name}'s moveset is fixed at capture — no TM of any kind can change it.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function runRosterMoveChangeCandidates(inputs: RosterMoveChangeInputs): RosterMoveChangeResult {
  const {
    pool,
    targets,
    baselinePerBoss,
    candyByFamilyId,
    rareCandyOnHand = 0,
    eliteFastTmOnHand = 0,
    eliteChargedTmOnHand = 0,
    megaLevel,
    weather = "none",
    seed = 1,
    iterations = 3,
    includeBenchedEntries = true,
    maxBenchedRealEvaluations = 60,
    ...rest
  } = inputs;

  if (pool.length === 0) throw new Error("runRosterMoveChangeCandidates requires a non-empty pool.");
  if (targets.length === 0) throw new Error("runRosterMoveChangeCandidates requires at least one raid target.");
  if (baselinePerBoss.length !== targets.length) {
    throw new Error(
      `baselinePerBoss must have exactly one entry per target (got ${baselinePerBoss.length} for ${targets.length} targets) — pass RosterPlanResult.baselinePerBoss/RosterBudgetPlan.finalPerBoss straight through, in the same order as targets.`,
    );
  }

  const entryById = new Map(pool.map((e) => [e.entryId, e]));
  const seenEntryIds = new Set<string>();
  for (const entry of pool) {
    if (seenEntryIds.has(entry.entryId)) {
      throw new Error(`Duplicate RosterEntry.entryId "${entry.entryId}" — every pool entry needs a unique id.`);
    }
    seenEntryIds.add(entry.entryId);
  }

  const shared: SharedTeamRaidAssumptions = {
    dodge: rest.dodge,
    dodgeFastAttacks: rest.dodgeFastAttacks,
    holdChargedMoveUntilSafe: rest.holdChargedMoveUntilSafe,
    bossChargedMoveMeanIntervalSeconds: rest.bossChargedMoveMeanIntervalSeconds,
    bossChargedMoveCadence: rest.bossChargedMoveCadence,
    raidTimerSeconds: rest.raidTimerSeconds,
    swapCostSeconds: rest.swapCostSeconds,
    reviveCostSeconds: rest.reviveCostSeconds,
    maxSecondsPerSlot: rest.maxSecondsPerSlot,
  };

  const evalSeeds = Array.from({ length: iterations }, (_, i) => seed + i * 7919);

  const secondChargedMove: RosterSecondChargedMoveCandidate[] = [];
  const eliteTm: RosterEliteTmCandidate[] = [];
  const excluded: RosterMoveChangeExcludedEntry[] = [];
  const excludedEntryIds = new Set<string>();
  let teamRaidCallCount = 0;

  const excludeOnce = (entry: RosterEntry, reason: string): void => {
    if (excludedEntryIds.has(entry.entryId)) return;
    excludedEntryIds.add(entry.entryId);
    excluded.push({ entryId: entry.entryId, speciesId: entry.species.id, speciesName: entry.species.name, reason });
  };

  // Candidates keyed for BENCHED de-duplication (an entry+candidate-move
  // pair is only evaluated once across the whole sweep's real-eval cap, even
  // if it would theoretically touch several bosses — matching
  // rosterPlanner.ts's own per-candidate, not per-(candidate,boss), cap
  // convention).
  interface BenchedProxyResult {
    entry: RosterEntry;
    targetIndex: number;
    kind: "second-charged" | "elite-fast" | "elite-charged";
    move: FastMove | ChargedMove;
    proxyGain: number;
  }
  const benchedProxyResults: BenchedProxyResult[] = [];

  for (let ti = 0; ti < targets.length; ti++) {
    const target = targets[ti]!;
    const baseline = baselinePerBoss[ti]!;
    const fieldedEntries = baseline.team.map((id) => {
      const e = entryById.get(id);
      if (!e) {
        throw new Error(
          `baselinePerBoss[${ti}].team references entryId "${id}" not present in pool — pass the SAME pool that produced this baseline.`,
        );
      }
      return e;
    });
    const slots = fieldedEntries.map((e) => toSlotInput(e, megaLevel));
    const firstFielded = fieldedEntries[0];

    const moveChangeBase: MoveChangeEvaluationInputs = {
      slots,
      boss: target.species,
      bossRaidTier: target.tier,
      bossMaxHpOverride: target.bossMaxHpOverride,
      bossFastMoveId: target.bossFastMoveId,
      bossChargedMoveId: target.bossChargedMoveId,
      // Every slot supplies its own level/ivs (toSlotInput) — these two are
      // dead fallbacks, same trick rosterPlanner.ts's own runFullRosterCached
      // uses for TeamRaidInputs.level/ivs.
      level: firstFielded?.level ?? 1,
      ivs: firstFielded?.ivs ?? { attack: 0, defense: 0, stamina: 0 },
      seed,
      iterations,
      ...shared,
      weather,
    };

    // --- FIELDED entries: reuse tmMove.ts's existing generators unchanged ---
    for (let slotIndex = 0; slotIndex < fieldedEntries.length; slotIndex++) {
      const entry = fieldedEntries[slotIndex]!;
      const eligibilityReason = moveChangeEligibilityReason(entry);
      if (eligibilityReason) {
        excludeOnce(entry, eligibilityReason);
        continue;
      }

      // Second charged move.
      if (entry.knownChargedMoveIds === undefined) {
        excludeOnce(
          entry,
          `${entry.species.name}'s current charged-move COUNT is unknown (1 vs 2) — a second charged move can only be priced against a confirmed count.`,
        );
      } else {
        const familyId = resolveCandyFamilyId(entry);
        const pool2 = familyId !== undefined ? candyByFamilyId[familyId] : undefined;
        const costModifiers: SecondChargedMoveCostModifiers = { isShadow: entry.costModifiers.isShadow, isPurified: entry.costModifiers.isPurified };
        const result = generateSecondChargedMoveCandidates({
          inputs: { ...moveChangeBase, slots: fieldedEntries.map((e) => toSlotInput(e, megaLevel)) },
          slotIndex,
          currentChargedMoveIds: entry.knownChargedMoveIds,
          pricing: { kmBuddyDistance: entry.species.kmBuddyDistance, species: entry.species, modifiers: costModifiers },
        });
        if (result.blocked) {
          excludeOnce(entry, result.reason);
        } else {
          teamRaidCallCount += result.candidates.length > 0 ? (1 + result.candidates.length) * iterations : 0;
          for (const c of result.candidates) {
            const costUnverified = pool2 === undefined;
            const ownCandy = pool2?.candy ?? 0;
            const sharedCandyNeeded = costUnverified ? 0 : Math.max(0, c.cost.candy - ownCandy) / RARE_CANDY_TO_CANDY_RATIO;
            const affordable = !costUnverified && sharedCandyNeeded <= rareCandyOnHand;
            secondChargedMove.push({
              fielded: true,
              entryId: entry.entryId,
              bossId: target.species.id,
              bossName: target.species.name,
              speciesId: c.speciesId,
              speciesName: c.speciesName,
              newChargedMoveId: c.newChargedMoveId,
              newChargedMoveName: c.newChargedMoveName,
              cost: toPowerUpResourceCost(c.cost),
              costUnverified,
              affordable,
              sharedCandyNeeded,
              deltaTeamDps: c.deltaTeamDps,
              deltaExceedsNoise: c.deltaExceedsNoise,
              deltaPer1000Stardust: c.deltaTeamDpsPer1000Stardust,
              deltaPerCandy: c.deltaTeamDpsPerCandy,
              displacedEntryId: null,
              displacedFieldedMega: false,
            });
          }
        }
      }

      // Elite Fast / Elite Charged TM.
      for (const kind of ["fast", "charged"] as const) {
        const result = generateEliteTmCandidates({
          inputs: { ...moveChangeBase, slots: fieldedEntries.map((e) => toSlotInput(e, megaLevel)) },
          slotIndex,
          kind,
        });
        if (result.blocked) {
          excludeOnce(entry, result.reason);
          continue;
        }
        teamRaidCallCount += result.candidates.length > 0 ? (1 + result.candidates.length) * iterations : 0;
        const onHand = kind === "fast" ? eliteFastTmOnHand : eliteChargedTmOnHand;
        for (const c of result.candidates) {
          eliteTm.push({
            fielded: true,
            entryId: entry.entryId,
            bossId: target.species.id,
            bossName: target.species.name,
            speciesId: c.speciesId,
            speciesName: c.speciesName,
            kind: c.kind,
            currentMoveId: c.currentMoveId,
            currentMoveName: c.currentMoveName,
            newMoveId: c.newMoveId,
            newMoveName: c.newMoveName,
            deltaTeamDps: c.deltaTeamDps,
            deltaExceedsNoise: c.deltaExceedsNoise,
            eliteTmItemsSpent: 1,
            affordable: onHand >= 1,
            displacedEntryId: null,
            displacedFieldedMega: false,
          });
        }
      }
    }

    // --- BENCHED entries: cheap proxy screen only (real eval happens once, after the whole sweep — see below) ---
    if (includeBenchedEntries && fieldedEntries.length === MAX_TEAM_RAID_SLOTS) {
      const fieldedIds = new Set(fieldedEntries.map((e) => e.entryId));
      const bossCtx = buildBossProxyContext(target, weather);
      const weakestEntry = fieldedEntries[fieldedEntries.length - 1]!;
      const weakestFastMove = resolveMove(weakestEntry.species.fastMoves, weakestEntry.fastMoveId);
      const weakestChargedMove = resolveMove(weakestEntry.species.chargedMoves, weakestEntry.chargedMoveId);
      if (weakestFastMove && weakestChargedMove) {
        const weakestProxy = benchedProxyDamagePerSecond(weakestEntry, weakestFastMove, weakestChargedMove, bossCtx, megaLevel);

        for (const entry of pool) {
          if (fieldedIds.has(entry.entryId)) continue;
          const eligibilityReason = moveChangeEligibilityReason(entry);
          if (eligibilityReason) {
            excludeOnce(entry, eligibilityReason);
            continue;
          }
          const currentFastMove = resolveMove(entry.species.fastMoves, entry.fastMoveId);
          const currentChargedMove = resolveMove(entry.species.chargedMoves, entry.chargedMoveId);
          if (!currentFastMove || !currentChargedMove) continue;

          // Second charged move: candidate charged moves it could newly learn.
          if (entry.knownChargedMoveIds !== undefined && entry.knownChargedMoveIds.length === 1) {
            for (const m of entry.species.chargedMoves) {
              if (entry.knownChargedMoveIds.includes(m.id) || !isTmTargetableMove(m)) continue;
              if (!canLearnSecondChargedMove(entry.species, { isShadow: entry.costModifiers.isShadow, isPurified: entry.costModifiers.isPurified }))
                continue;
              const proxyGain = benchedProxyDamagePerSecond(entry, currentFastMove, m, bossCtx, megaLevel) - weakestProxy;
              if (proxyGain > 0) benchedProxyResults.push({ entry, targetIndex: ti, kind: "second-charged", move: m, proxyGain });
            }
          }
          // Elite Fast TM: candidate fast moves.
          if (isTmTargetableMove(currentFastMove)) {
            for (const m of entry.species.fastMoves) {
              if (m.id === currentFastMove.id || !isTmTargetableMove(m)) continue;
              const proxyGain = benchedProxyDamagePerSecond(entry, m, currentChargedMove, bossCtx, megaLevel) - weakestProxy;
              if (proxyGain > 0) benchedProxyResults.push({ entry, targetIndex: ti, kind: "elite-fast", move: m, proxyGain });
            }
          }
          // Elite Charged TM: candidate charged moves (replacing the active one).
          if (isTmTargetableMove(currentChargedMove)) {
            for (const m of entry.species.chargedMoves) {
              if (m.id === currentChargedMove.id || !isTmTargetableMove(m)) continue;
              const proxyGain = benchedProxyDamagePerSecond(entry, currentFastMove, m, bossCtx, megaLevel) - weakestProxy;
              if (proxyGain > 0) benchedProxyResults.push({ entry, targetIndex: ti, kind: "elite-charged", move: m, proxyGain });
            }
          }
        }
      }
    }
  }

  // --- BENCHED: rank the cheap-proxy survivors, then pay for a REAL paired
  // simulation only for the top maxBenchedRealEvaluations, globally. -------
  const rankedBenched = [...benchedProxyResults].sort((a, b) => b.proxyGain - a.proxyGain).slice(0, maxBenchedRealEvaluations);

  for (const candidate of rankedBenched) {
    const { entry, targetIndex, kind, move } = candidate;
    const target = targets[targetIndex]!;
    const baseline = baselinePerBoss[targetIndex]!;
    const fieldedEntries = baseline.team.map((id) => entryById.get(id)!);
    const weakestIndex = fieldedEntries.length - 1;
    const baselineSlots = fieldedEntries.map((e) => toSlotInput(e, megaLevel));

    const candidateEntry: RosterEntry =
      kind === "second-charged" || kind === "elite-charged"
        ? { ...entry, chargedMoveId: move.id }
        : { ...entry, fastMoveId: move.id };
    const candidateSlot = toSlotInput(candidateEntry, megaLevel);

    // --- At-most-one-Mega guard (real bug found 2026-09-10) ------------------
    // The naive "always replace the team's weakest (6th) slot" swap can field
    // TWO isMega:true slots at once — runTeamRaid throws — whenever this
    // benched candidate is itself mega-capable AND the baseline team already
    // fields a DIFFERENT mega-capable entry that ISN'T the weakest slot. This
    // is the ORDINARY shape of a real roster, not an edge case: the planner
    // always fields its single best mega, so any OTHER mega-capable pool
    // entry is benched by construction. Real Pokémon GO only allows one
    // Pokémon Mega Evolved at a time, so there is no team this candidate could
    // legally join WITH its own mega active while the fielded mega stays too
    // — the only faithful real-game comparison is "would this candidate,
    // mega'd, replace your CURRENT mega," so displace the fielded mega slot
    // itself instead of the weakest one. This changes which slot the paired
    // delta compares against for exactly this case — surfaced via
    // displacedEntryId/displacedFieldedMega on the output row rather than left
    // implicit, per this project's "never silently misreport a candidate's
    // value" rule.
    const fieldedMegaIndex = fieldedEntries.findIndex((e) => e.canMega);
    const displacesFieldedMega = candidateEntry.canMega && fieldedMegaIndex !== -1 && fieldedMegaIndex !== weakestIndex;
    const swapIndex = displacesFieldedMega ? fieldedMegaIndex : weakestIndex;
    const displacedEntryId = fieldedEntries[swapIndex]!.entryId;

    const bossHp = bossEffectiveHp(target.species, target.tier, target.bossMaxHpOverride);
    const teamRaidBase = {
      boss: target.species,
      bossRaidTier: target.tier,
      bossMaxHpOverride: target.bossMaxHpOverride,
      bossFastMoveId: target.bossFastMoveId,
      bossChargedMoveId: target.bossChargedMoveId,
      level: fieldedEntries[0]?.level ?? 1,
      ivs: fieldedEntries[0]?.ivs ?? { attack: 0, defense: 0, stamina: 0 },
      weather,
      ...shared,
    };

    const baselineResults = evalSeeds.map((s) => runTeamRaid({ ...teamRaidBase, slots: baselineSlots, seed: s } satisfies TeamRaidInputs));
    const candidateSlots: TeamRaidSlotInput[] = baselineSlots.map((s, i) => (i === swapIndex ? candidateSlot : s));
    const candidateResults = evalSeeds.map((s) => runTeamRaid({ ...teamRaidBase, slots: candidateSlots, seed: s } satisfies TeamRaidInputs));
    teamRaidCallCount += evalSeeds.length * 2;

    const baselineSummary = summarizeResults(baselineResults, bossHp, teamRaidBase.raidTimerSeconds);
    const candidateSummary = summarizeResults(candidateResults, bossHp, teamRaidBase.raidTimerSeconds);
    const deltaTeamDps = candidateSummary.teamDps - baselineSummary.teamDps;
    const noiseFloorTeamDps = noiseFloorFor(baselineSummary, evalSeeds.length);
    const deltaExceedsNoise = Math.abs(deltaTeamDps) > noiseFloorTeamDps;

    if (kind === "second-charged") {
      const chargedMove = move as ChargedMove;
      const costModifiers: SecondChargedMoveCostModifiers = { isShadow: entry.costModifiers.isShadow, isPurified: entry.costModifiers.isPurified };
      const costResult = secondChargedMoveCost({ kmBuddyDistance: entry.species.kmBuddyDistance, species: entry.species, modifiers: costModifiers });
      if (!costResult.known) {
        excludeOnce(entry, costResult.reason);
        continue;
      }
      const cost = toPowerUpResourceCost(costResult.cost);
      const familyId = resolveCandyFamilyId(entry);
      const pool2 = familyId !== undefined ? candyByFamilyId[familyId] : undefined;
      const costUnverified = pool2 === undefined;
      const ownCandy = pool2?.candy ?? 0;
      const sharedCandyNeeded = costUnverified ? 0 : Math.max(0, cost.candy - ownCandy) / RARE_CANDY_TO_CANDY_RATIO;
      const affordable = !costUnverified && sharedCandyNeeded <= rareCandyOnHand;
      secondChargedMove.push({
        fielded: false,
        entryId: entry.entryId,
        bossId: target.species.id,
        bossName: target.species.name,
        speciesId: entry.species.id,
        speciesName: entry.species.name,
        newChargedMoveId: chargedMove.id,
        newChargedMoveName: chargedMove.name,
        cost,
        costUnverified,
        affordable,
        sharedCandyNeeded,
        deltaTeamDps,
        deltaExceedsNoise,
        deltaPer1000Stardust: cost.stardust > 0 ? (deltaTeamDps / cost.stardust) * 1000 : null,
        deltaPerCandy: cost.candy > 0 ? deltaTeamDps / cost.candy : null,
        displacedEntryId,
        displacedFieldedMega: displacesFieldedMega,
      });
    } else {
      const eliteKind: EliteTmKind = kind === "elite-fast" ? "fast" : "charged";
      const currentMove =
        eliteKind === "fast" ? resolveMove(entry.species.fastMoves, entry.fastMoveId)! : resolveMove(entry.species.chargedMoves, entry.chargedMoveId)!;
      const onHand = eliteKind === "fast" ? eliteFastTmOnHand : eliteChargedTmOnHand;
      eliteTm.push({
        fielded: false,
        entryId: entry.entryId,
        bossId: target.species.id,
        bossName: target.species.name,
        speciesId: entry.species.id,
        speciesName: entry.species.name,
        kind: eliteKind,
        currentMoveId: currentMove.id,
        currentMoveName: currentMove.name,
        newMoveId: move.id,
        newMoveName: move.name,
        deltaTeamDps,
        deltaExceedsNoise,
        eliteTmItemsSpent: 1,
        affordable: onHand >= 1,
        displacedEntryId,
        displacedFieldedMega: displacesFieldedMega,
      });
    }
  }

  return { secondChargedMove, eliteTm, excluded, teamRaidCallCount };
}
