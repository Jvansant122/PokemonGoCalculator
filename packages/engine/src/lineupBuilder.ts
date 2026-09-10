import type { DodgeBehavior } from "./breakpoints.js";
import { bossEffectiveHp, resolveMove, runSustainedComparison } from "./comparison.js";
import type { MegaLevel } from "./megaLevel.js";
import { noiseFloorFor, summarizeResults, type PowerUpEncounterSummary } from "./powerUp.js";
import type { RaidTier } from "./raidBoss.js";
import { MAX_TEAM_RAID_SLOTS, runTeamRaid, type TeamRaidInputs, type TeamRaidResult, type TeamRaidSlotInput } from "./teamRaid.js";
import type { IVSpread, SpeciesDefinition } from "./types.js";
import type { WeatherCondition } from "./weather.js";

/**
 * The single-trainer lineup builder — see PLAN_lineup_builder.md at the repo
 * root. Answers "which up to MAX_TEAM_RAID_SLOTS of my own roster, in what
 * ORDER, should I actually bring against this one boss" — the order-aware
 * promotion of `rosterPlanner.ts`'s internal `selectTeam` (a score-only,
 * order-blind top-6 pick used there only to build a baseline team for
 * power-up evaluation). This is NOT the ruled-out "Teambuilding Analyzer"
 * (multi-trainer mega staggering across a raid lobby) — every entry here
 * belongs to ONE trainer's own roster, exactly like teamRaid.ts. No
 * cross-slot team-boost math for the same reason teamRaid.ts has none (see
 * that module's own doc comment) — a mega/canMega entry only ever boosts its
 * OWN damage while active.
 *
 * === Why order needs a real search =========================================
 *
 * In a sequential roster the lead absorbs the boss's opening damage, the
 * last-fielded slot has to land the finishing blow inside the raid timer,
 * and every faint shifts every LATER slot's start time (and, under
 * "energy-driven"/"energy-gated-interval" boss cadence, the boss's own
 * carried energy/cooldown) — order is a real decision variable, not a
 * cosmetic one. Exhaustive search over a ~164-entry pool is impossible
 * (C(164,6) x 720 ~= 2x10^10 orderings), so this runs a bounded, two-stage
 * search instead:
 *
 * STAGE 1 — SHORTLIST. One cheap `runSustainedComparison` call per pool
 * entry (its own current level, alone against the boss), scored exactly like
 * rosterPlanner.ts's Stage 1 screen (`meanTotalDamage / (meanSecondsSurvived
 * + swapCostSeconds)` — damage per second of raid clock consumed, not raw
 * damage). The full ranked list is returned as `screenedPool` (every pool
 * entry, so a caller can see exactly what the search excluded); the top
 * `shortlistSize` (default 15) becomes both the search's candidate pool AND
 * the static ranking used to build "the rest of the team" while comparing
 * candidates for one slot (see STAGE 2's "filler" below).
 *
 * STAGE 2 — GREEDY CONSTRUCTION WITH A BEAM. One slot at a time (up to
 * `Math.min(MAX_TEAM_RAID_SLOTS, shortlist.length)`), every beam state
 * (an ordered, partial lineup) is extended by every still-eligible
 * shortlisted candidate (skipping a second `canMega` entry — real Pokémon GO
 * allows only one Mega Evolved Pokémon at a time). Comparing candidates for
 * a NOT-yet-final slot needs a full-lineup projection, not a single-slot
 * score, since a strong lead can still lose to a boss that outlasts it while
 * a weaker lead paired with strong closers clears comfortably — so each
 * candidate is scored by simulating `committed-so-far + candidate + FILLER`
 * (the best still-available shortlisted entries, by their Stage 1 score,
 * padding out to a full-length roster) via `runTeamRaid`, averaged over
 * `iterations` paired seeds. That score is a lookahead HEURISTIC only — real
 * per-lineup numbers are re-measured from scratch at the very end (see
 * "FINAL EVALUATION" below), so the lookahead's own imprecision never leaks
 * into the reported margin.
 *
 * At `beamWidth: 1` (the plan's suggested minimum), this is Math.min(15,14,
 * ...,10) candidates summed across up to 6 rounds = 75 lookahead evaluations
 * for a 15-entry shortlist — matching the plan's own estimate exactly. The
 * DEFAULT here is `beamWidth: 2` (not 1): a beam of exactly 1 is pure greedy
 * and structurally can never produce a genuine ALTERNATIVE full lineup to
 * report as a runner-up (every "second place" would just be a one-slot swap
 * at whichever round happened to be closest, not a real second search
 * result) — see "REPORTING THE RUNNER-UP" below for why this project's own
 * thesis (surviving-the-search runner-up + margin) requires at least 2.
 *
 * A state that runs out of eligible candidates before reaching the target
 * slot count (a small pool, or the one-mega cap exhausting every remaining
 * canMega entry) simply stops growing — it is carried forward, unchanged,
 * into the beam's final ranking rather than discarded, so "a roster too
 * small to fill six slots" produces a real, honest, shorter final lineup
 * instead of an error.
 *
 * FINAL EVALUATION: every DISTINCT final beam state (deduplicated by its
 * exact ordered entryId sequence) gets one more `evaluateLineup` call over
 * `iterations` paired seeds, but this time on its own literal committed
 * roster with NO filler — this is the number actually reported
 * (`LineupCandidateResult.summary`), never a lookahead estimate. Every
 * `evaluateLineup` call (lookahead OR final) is memoized by its exact ordered
 * entryId sequence, so a composition reached by more than one search path
 * (or re-measured at the end after already being measured filler-free
 * mid-search) is never re-simulated — same "memoize on team composition, not
 * candidate identity" discipline rosterPlanner.ts's Stage 4 already
 * established.
 *
 * REPORTING THE RUNNER-UP: this product's whole thesis is "where does the
 * ranking flip," not just "who's on top" — see CLAUDE.md. The two
 * highest-scoring DISTINCT final lineups (by the real, filler-free final
 * evaluation above) become `winner`/`runnerUp`; `margin` reports the gap
 * (absolute team-DPS delta, a fraction of the runner-up's own score, and
 * whether that gap clears the two lineups' COMBINED noise floor — same
 * quadrature-combination convention rosterPlanner.ts's aggregate noise floor
 * already uses). `runnerUp`/`margin` are `null` only when the search
 * genuinely produced a single surviving lineup (`beamWidth: 1`, or a pool so
 * small/mega-constrained that only one valid ordering exists).
 *
 * DETERMINISM: every `evaluateLineup` call draws its paired seeds from a
 * strictly-increasing internal counter (`baseSeed + evalIndex * 104729 + i *
 * 7919`, the same offsetting convention used everywhere else in this
 * engine), and every loop that could affect which evaluation happens in
 * which order iterates the shortlist/beam in a FIXED, input-derived order —
 * so the same `LineupBuilderInputs` (including `seed`) always searches and
 * scores identically. The evaluation-cache short-circuits repeat
 * compositions rather than skipping the counter increment, so cache hits
 * never perturb later evaluations' seeds.
 *
 * KNOWN GAP shared with rosterPlanner.ts's Stage 4 (see that module's top
 * doc comment): `TeamRaidInputs` has no `bossMaxHpOverride` hook, so this
 * module cannot honor a historical/archived boss's real recorded HP the way
 * `runSustainedComparison`'s Stage 1 screen can — every lineup here is
 * always evaluated against TODAY's tier-derived boss HP. Not fixed here
 * (same `teamRaid.ts`-owns-this-gap reasoning as rosterPlanner.ts).
 */

/** One entry in the caller's OWN roster (not the whole imported pool necessarily — a caller may pre-filter, e.g. to `isFullyEvolved` entries only, before calling in). */
export interface LineupBuilderEntry {
  /** Unique per entry — a caller may legitimately field the same species twice (real raids permit duplicates). */
  entryId: string;
  species: SpeciesDefinition;
  /** Omit/null defaults to species.fastMoves[0] — same convention as every other engine entry point (comparison.ts's resolveMove). */
  fastMoveId: string | null;
  /** See fastMoveId. */
  chargedMoveId: string | null;
  level: number;
  ivs: IVSpread;
  /**
   * Whether this entry, if fielded, would occupy the account's one Mega/
   * Primal slot. Mirrors rosterPlanner.ts's `RosterEntry.canMega` exactly,
   * including its validation rule (`runLineupBuilder` throws up front if an
   * entry sets this true without `species.boost` defined).
   */
  canMega: boolean;
}

export interface LineupBuilderInputs {
  /** The caller's own roster to search over. */
  pool: LineupBuilderEntry[];
  boss: SpeciesDefinition;
  /** See teamRaid.ts's TeamRaidInputs.bossRaidTier. */
  bossRaidTier?: RaidTier;
  /** Boss fast-move selection. Omit/null defaults to the boss's first fast move. */
  bossFastMoveId?: string | null;
  /** Boss charged-move selection. Omit/null defaults to the boss's first charged move. */
  bossChargedMoveId?: string | null;
  /** Governs dodging the boss's CHARGED attacks only — one shared assumption for the whole roster, same as teamRaid.ts. */
  dodge: DodgeBehavior;
  /** Whether the roster also attempts to dodge the boss's fast attacks. Defaults to false. */
  dodgeFastAttacks?: boolean;
  /**
   * ROSTER-WIDE Mega Level (see megaLevel.ts), applied to whichever entry
   * ends up fielded with `canMega: true` — mirrors rosterPlanner.ts's
   * roster-wide `megaLevel` field (a per-entry picker is unusable at
   * real-pool scale, and a lineup only ever fields ONE mega slot anyway).
   * `undefined` means no Mega Level effect (identical to `"base"`).
   */
  megaLevel?: MegaLevel;
  /** See simulate.ts's StepwiseAttacker.holdChargedMoveUntilSafe. Applies to every slot identically. Defaults to false. */
  holdChargedMoveUntilSafe?: boolean;
  /** See teamRaid.ts's TeamRaidInputs field of the same name. */
  bossChargedMoveMeanIntervalSeconds: number;
  /** See teamRaid.ts's TeamRaidInputs field of the same name. Indexed off that type rather than importing simulate.ts's named union directly — same reasoning as rosterPlanner.ts's identical field (a cadence mode added to simulate.ts is accepted here automatically). */
  bossChargedMoveCadence?: TeamRaidInputs["bossChargedMoveCadence"];
  /** Applied per-move to both sides against the boss — see weather.ts. Defaults to "none". */
  weather?: WeatherCondition;
  /** Real-world raid countdown, shared across the whole encounter. */
  raidTimerSeconds: number;
  /** See teamRaid.ts's TeamRaidInputs.swapCostSeconds. Also the denominator term in the Stage 1 screen score. Defaults to 0. */
  swapCostSeconds?: number;
  /** See teamRaid.ts's TeamRaidInputs.reviveCostSeconds. Defaults to 0. */
  reviveCostSeconds?: number;
  /** See teamRaid.ts's TeamRaidInputs.maxSecondsPerSlot. */
  maxSecondsPerSlot?: number;
  /** Base seed for every seeded call this module makes — see this module's top doc comment's "DETERMINISM" paragraph. Defaults to 1. */
  seed?: number;
  /** Stage 1's per-entry screen iterations. Defaults to 4 (matches rosterPlanner.ts's default). */
  screenIterations?: number;
  /** Paired seeds used for EVERY full-lineup `runTeamRaid` evaluation this module makes — both the beam's lookahead scoring and the final winner/runner-up measurement. Defaults to 3 (kept low; this module already runs many more full-roster simulations per candidate than rosterPlanner.ts's Stage 4 does). */
  iterations?: number;
  /** How many top-screened pool entries the search actually considers — see this module's top doc comment's Stage 1/2. Defaults to 15. */
  shortlistSize?: number;
  /** Number of alternative lineups the beam search carries forward at each slot. Defaults to 2 (the minimum that can ever produce a real runner-up — see this module's top doc comment). `1` degenerates to pure greedy construction with no runner-up. */
  beamWidth?: number;
}

/** One pool entry's Stage 1 screen result — see LineupBuilderResult.screenedPool/shortlist. */
export interface LineupShortlistEntry {
  entryId: string;
  speciesId: string;
  speciesName: string;
  /** meanTotalDamage / (meanSecondsSurvived + swapCostSeconds) against the boss, alone, at this entry's own level — see this module's top doc comment. */
  screenScore: number;
}

/** One candidate considered for ONE slot along ONE lineup's own decision path — see LineupSlotDecision.considered. */
export interface LineupConsideredCandidate {
  entryId: string;
  speciesId: string;
  speciesName: string;
  /** The lookahead score (committed-so-far + this candidate + filler, projected via runTeamRaid) that decided this slot — NOT this candidate's own standalone Stage 1 score, and not the final reported number for whichever lineup this decision ended up part of. */
  lookaheadTeamDps: number;
}

/** One slot's worth of search history for one final lineup. */
export interface LineupSlotDecision {
  /** 0-indexed fight position. */
  slotIndex: number;
  chosenEntryId: string;
  /** Every candidate considered for this slot along this lineup's OWN decision path, descending by lookaheadTeamDps — considered[0].entryId === chosenEntryId. */
  considered: LineupConsideredCandidate[];
}

/** One resolved, fight-ready slot of a built lineup. */
export interface LineupSlot {
  entryId: string;
  speciesId: string;
  speciesName: string;
  /** Resolved (never null) — the actual move id this slot fights with. */
  fastMoveId: string | null;
  chargedMoveId: string | null;
  level: number;
  ivs: IVSpread;
  isMega: boolean;
  /** LineupBuilderInputs.megaLevel, carried onto this slot only when isMega is true — null otherwise, so a caller porting this straight into a TeamRaidSlotInput/TeamScenarioSlot never has to re-derive the gate. */
  megaLevel: MegaLevel | null;
}

export interface LineupCandidateResult {
  /** In fight order — at most MAX_TEAM_RAID_SLOTS entries; may be shorter than that if the pool/mega constraint couldn't fill six (see this module's top doc comment). */
  slots: LineupSlot[];
  /** This lineup's own, real (filler-free) final measurement — never a lookahead estimate. */
  summary: PowerUpEncounterSummary;
  noiseFloorTeamDps: number;
  /** This lineup's own slot-by-slot decision trail — see LineupSlotDecision. */
  decisions: LineupSlotDecision[];
  /** One concrete run from the final evaluation's seed set, for a UI to chart alongside the distribution — same "one representative trajectory" convention as simulate.ts's runStepwiseDistribution. */
  representativeRun: TeamRaidResult;
}

export interface LineupMargin {
  /** winner.summary.teamDps - runnerUp.summary.teamDps — always >= 0. */
  teamDpsDelta: number;
  /** teamDpsDelta / runnerUp.summary.teamDps — null when runnerUp.summary.teamDps is ~0 (division would be meaningless). */
  teamDpsDeltaFraction: number | null;
  /** teamDpsDelta > sqrt(winner.noiseFloorTeamDps^2 + runnerUp.noiseFloorTeamDps^2) — same quadrature-combination convention rosterPlanner.ts's aggregate noise floor uses. */
  exceedsNoise: boolean;
}

export interface LineupBuilderResult {
  /** Every pool entry's Stage 1 screen result, descending by screenScore — the full, honest "what the search saw" list (see this module's top doc comment). */
  screenedPool: LineupShortlistEntry[];
  /** The top `shortlistSize` of screenedPool — the actual candidate pool the beam search drew from. */
  shortlist: LineupShortlistEntry[];
  winner: LineupCandidateResult;
  /** The next-best DISTINCT full lineup the search found, or null if the search only ever produced one (beamWidth: 1, or a pool/constraint too small for a genuine alternative). */
  runnerUp: LineupCandidateResult | null;
  /** null exactly when runnerUp is null. */
  margin: LineupMargin | null;
  beamWidth: number;
  shortlistSize: number;
  iterations: number;
  screenIterations: number;
}

function toSlotInput(entry: LineupBuilderEntry, megaLevel: MegaLevel | undefined): TeamRaidSlotInput {
  return {
    species: entry.species,
    fastMoveId: entry.fastMoveId,
    chargedMoveId: entry.chargedMoveId,
    isMega: entry.canMega,
    level: entry.level,
    ivs: entry.ivs,
    megaLevel,
  };
}

function toLineupSlot(entry: LineupBuilderEntry, megaLevel: MegaLevel | undefined): LineupSlot {
  const fastMove = resolveMove(entry.species.fastMoves, entry.fastMoveId);
  const chargedMove = resolveMove(entry.species.chargedMoves, entry.chargedMoveId);
  return {
    entryId: entry.entryId,
    speciesId: entry.species.id,
    speciesName: entry.species.name,
    fastMoveId: fastMove?.id ?? null,
    chargedMoveId: chargedMove?.id ?? null,
    level: entry.level,
    ivs: entry.ivs,
    isMega: entry.canMega,
    megaLevel: entry.canMega ? (megaLevel ?? null) : null,
  };
}

/**
 * Fills up to `count` entryIds from `rankedShortlist` (already descending by
 * screenScore), skipping anything in `usedSet` or any further `canMega`
 * entry once one mega is already spoken for — see this module's top doc
 * comment's "filler" paragraph. `megaUsed` is the STARTING state (whether the
 * committed prefix + the candidate being tested already used the one mega
 * slot); this function tracks it as a LOCAL, mutable flag while filling,
 * since the filler selection itself can just as easily pick a mega as its
 * first pick — two different `canMega` entries both ranking well enough to
 * both get picked into the SAME filler set was a real bug found via
 * `runTeamRaid`'s own "at most one mega slot" validation throwing during a
 * beam search lookahead evaluation (see lineupBuilder.test.ts's one-mega
 * constraint test).
 */
function pickFiller(
  rankedShortlist: LineupShortlistEntry[],
  usedSet: Set<string>,
  megaUsed: boolean,
  count: number,
  entryById: Map<string, LineupBuilderEntry>,
): string[] {
  if (count <= 0) return [];
  const result: string[] = [];
  let megaAlreadyPicked = megaUsed;
  for (const candidate of rankedShortlist) {
    if (result.length >= count) break;
    if (usedSet.has(candidate.entryId)) continue;
    const entry = entryById.get(candidate.entryId)!;
    if (megaAlreadyPicked && entry.canMega) continue;
    if (entry.canMega) megaAlreadyPicked = true;
    result.push(candidate.entryId);
  }
  return result;
}

interface BeamState {
  /** entryIds, in fight order. */
  committed: string[];
  usedSet: Set<string>;
  megaUsed: boolean;
  /** True once this state can no longer grow — either it reached the target slot count, or it ran out of eligible candidates early (small pool / mega cap). */
  terminal: boolean;
  /** Last-known score — a lookahead projection while growing, carried forward unchanged once terminal. Used ONLY to rank states during the search; the actually-reported numbers always come from a final, filler-free re-evaluation (see FINAL EVALUATION in this module's top doc comment). */
  score: number;
  decisions: LineupSlotDecision[];
}

export function runLineupBuilder(inputs: LineupBuilderInputs): LineupBuilderResult {
  const {
    pool,
    boss,
    bossRaidTier,
    bossFastMoveId,
    bossChargedMoveId,
    dodge,
    dodgeFastAttacks = false,
    megaLevel,
    holdChargedMoveUntilSafe = false,
    bossChargedMoveMeanIntervalSeconds,
    bossChargedMoveCadence,
    weather = "none",
    raidTimerSeconds,
    swapCostSeconds = 0,
    reviveCostSeconds = 0,
    maxSecondsPerSlot,
    seed = 1,
    screenIterations = 4,
    iterations = 3,
    shortlistSize = 15,
    beamWidth: rawBeamWidth = 2,
  } = inputs;

  if (pool.length === 0) throw new Error("runLineupBuilder requires a non-empty pool.");
  const beamWidth = Math.max(1, Math.floor(rawBeamWidth));

  const entryById = new Map<string, LineupBuilderEntry>();
  for (const entry of pool) {
    if (entryById.has(entry.entryId)) {
      throw new Error(`Duplicate LineupBuilderEntry.entryId "${entry.entryId}" — every pool entry needs a unique id even when the same species appears more than once.`);
    }
    entryById.set(entry.entryId, entry);
    if (entry.canMega && !entry.species.boost) {
      throw new Error(`Pool entry ${entry.entryId} (${entry.species.id}) is flagged canMega but its species has no boost mechanic defined.`);
    }
  }

  const bossHp = bossEffectiveHp(boss, bossRaidTier);

  // --- Stage 1: screen the whole pool, once each, against this one boss ----
  const screenedPool: LineupShortlistEntry[] = pool
    .map((entry) => {
      const [result] = runSustainedComparison({
        candidates: [entry.species],
        candidateFastMoveIds: [entry.fastMoveId],
        candidateChargedMoveIds: [entry.chargedMoveId],
        candidateMegaLevel: [entry.canMega ? (megaLevel ?? null) : null, null],
        boss,
        bossRaidTier,
        bossFastMoveId,
        bossChargedMoveId,
        level: entry.level,
        ivs: entry.ivs,
        dodge,
        dodgeFastAttacks,
        holdChargedMoveUntilSafe,
        bossChargedMoveMeanIntervalSeconds,
        bossChargedMoveCadence,
        weather,
        iterations: screenIterations,
      });
      const score = result!.meanTotalDamage / (result!.meanSecondsSurvived + swapCostSeconds);
      return { entryId: entry.entryId, speciesId: entry.species.id, speciesName: entry.species.name, screenScore: score };
    })
    .sort((a, b) => b.screenScore - a.screenScore);

  const shortlist = screenedPool.slice(0, Math.max(1, Math.floor(shortlistSize)));
  const maxSlots = Math.min(MAX_TEAM_RAID_SLOTS, shortlist.length);

  // --- Stage 2: order-aware beam search --------------------------------------
  let evalCounter = 0;
  const evalCache = new Map<string, { summary: PowerUpEncounterSummary; representative: TeamRaidResult }>();

  const evaluateLineup = (entryIds: string[]): { summary: PowerUpEncounterSummary; representative: TeamRaidResult } => {
    const key = entryIds.join(",");
    const cached = evalCache.get(key);
    if (cached) return cached;

    const slots = entryIds.map((id) => toSlotInput(entryById.get(id)!, megaLevel));
    const first = entryById.get(entryIds[0]!)!;
    const evalBase = seed + evalCounter * 104729;
    evalCounter += 1;
    const seeds = Array.from({ length: iterations }, (_, i) => evalBase + i * 7919);
    const results = seeds.map((s) =>
      runTeamRaid({
        slots,
        boss,
        bossRaidTier,
        bossFastMoveId,
        bossChargedMoveId,
        // Every slot supplies its own level/ivs (toSlotInput) — these
        // roster-wide fields are dead fallbacks, same trick powerUp.ts/
        // rosterPlanner.ts already use for TeamRaidInputs.
        level: first.level,
        ivs: first.ivs,
        dodge,
        dodgeFastAttacks,
        holdChargedMoveUntilSafe,
        bossChargedMoveMeanIntervalSeconds,
        bossChargedMoveCadence,
        weather,
        raidTimerSeconds,
        swapCostSeconds,
        reviveCostSeconds,
        maxSecondsPerSlot,
        seed: s,
      } satisfies TeamRaidInputs),
    );
    const summary = summarizeResults(results, bossHp, raidTimerSeconds);
    const value = { summary, representative: results[0]! };
    evalCache.set(key, value);
    return value;
  };

  interface Extension {
    parent: BeamState;
    committed: string[];
    usedSet: Set<string>;
    megaUsed: boolean;
    terminal: boolean;
    score: number;
    decisionEntry: LineupSlotDecision | null;
  }

  let beam: BeamState[] = [{ committed: [], usedSet: new Set(), megaUsed: false, terminal: false, score: 0, decisions: [] }];

  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex++) {
    const extensions: Extension[] = [];

    for (const state of beam) {
      if (state.terminal) {
        extensions.push({ parent: state, committed: state.committed, usedSet: state.usedSet, megaUsed: state.megaUsed, terminal: true, score: state.score, decisionEntry: null });
        continue;
      }

      const validCandidates = shortlist.filter((c) => !state.usedSet.has(c.entryId) && !(entryById.get(c.entryId)!.canMega && state.megaUsed));
      if (validCandidates.length === 0) {
        // Ran out of eligible candidates before reaching the target slot
        // count — this state stops growing (see this module's top doc
        // comment's "a state that runs out..." paragraph).
        extensions.push({ parent: state, committed: state.committed, usedSet: state.usedSet, megaUsed: state.megaUsed, terminal: true, score: state.score, decisionEntry: null });
        continue;
      }

      const remainingAfter = maxSlots - (state.committed.length + 1);
      const considered: LineupConsideredCandidate[] = [];
      const scoredCandidates: { entryId: string; score: number }[] = [];

      for (const candidate of validCandidates) {
        const candidateEntry = entryById.get(candidate.entryId)!;
        const newMegaUsed = state.megaUsed || candidateEntry.canMega;
        const usedForFiller = new Set(state.usedSet);
        usedForFiller.add(candidate.entryId);
        const filler = pickFiller(shortlist, usedForFiller, newMegaUsed, remainingAfter, entryById);
        const tentative = [...state.committed, candidate.entryId, ...filler];
        const { summary } = evaluateLineup(tentative);
        scoredCandidates.push({ entryId: candidate.entryId, score: summary.teamDps });
        considered.push({ entryId: candidate.entryId, speciesId: candidateEntry.species.id, speciesName: candidateEntry.species.name, lookaheadTeamDps: summary.teamDps });
      }
      considered.sort((a, b) => b.lookaheadTeamDps - a.lookaheadTeamDps);

      for (const scored of scoredCandidates) {
        const candidateEntry = entryById.get(scored.entryId)!;
        const newCommitted = [...state.committed, scored.entryId];
        const newUsedSet = new Set(state.usedSet);
        newUsedSet.add(scored.entryId);
        const newMegaUsed = state.megaUsed || candidateEntry.canMega;
        const decisionEntry: LineupSlotDecision = { slotIndex, chosenEntryId: scored.entryId, considered };
        extensions.push({
          parent: state,
          committed: newCommitted,
          usedSet: newUsedSet,
          megaUsed: newMegaUsed,
          terminal: newCommitted.length >= maxSlots,
          score: scored.score,
          decisionEntry,
        });
      }
    }

    // Dedupe by exact ordered sequence (keep the highest-scoring instance),
    // then keep the top `beamWidth` for the next round.
    const bestBySequence = new Map<string, Extension>();
    for (const ext of extensions) {
      const key = ext.committed.join(",");
      const existing = bestBySequence.get(key);
      if (!existing || ext.score > existing.score) bestBySequence.set(key, ext);
    }
    const ranked = [...bestBySequence.values()].sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, beamWidth);

    beam = top.map((ext) => ({
      committed: ext.committed,
      usedSet: ext.usedSet,
      megaUsed: ext.megaUsed,
      terminal: ext.terminal,
      score: ext.score,
      decisions: ext.decisionEntry ? [...ext.parent.decisions, ext.decisionEntry] : ext.parent.decisions,
    }));

    if (beam.every((s) => s.terminal)) break;
  }

  // --- Final evaluation: real, filler-free numbers for every distinct lineup found ---
  const distinctFinal = new Map<string, BeamState>();
  for (const state of beam) {
    const key = state.committed.join(",");
    if (!distinctFinal.has(key)) distinctFinal.set(key, state);
  }

  const finalized = [...distinctFinal.values()].map((state) => {
    const { summary, representative } = evaluateLineup(state.committed);
    return { state, summary, representative, score: summary.teamDps };
  });
  finalized.sort((a, b) => b.score - a.score);

  const toResult = (item: (typeof finalized)[number]): LineupCandidateResult => ({
    slots: item.state.committed.map((id) => toLineupSlot(entryById.get(id)!, megaLevel)),
    summary: item.summary,
    noiseFloorTeamDps: noiseFloorFor(item.summary, iterations),
    decisions: item.state.decisions,
    representativeRun: item.representative,
  });

  const winnerItem = finalized[0]!;
  const winner = toResult(winnerItem);
  const runnerUpItem = finalized[1];
  const runnerUp = runnerUpItem ? toResult(runnerUpItem) : null;

  const margin: LineupMargin | null = runnerUp
    ? {
        teamDpsDelta: winner.summary.teamDps - runnerUp.summary.teamDps,
        teamDpsDeltaFraction: runnerUp.summary.teamDps > 1e-9 ? (winner.summary.teamDps - runnerUp.summary.teamDps) / runnerUp.summary.teamDps : null,
        exceedsNoise:
          winner.summary.teamDps - runnerUp.summary.teamDps > Math.sqrt(winner.noiseFloorTeamDps ** 2 + runnerUp.noiseFloorTeamDps ** 2),
      }
    : null;

  return {
    screenedPool,
    shortlist,
    winner,
    runnerUp,
    margin,
    beamWidth,
    shortlistSize: shortlist.length,
    iterations,
    screenIterations,
  };
}
