import type { DodgeBehavior } from "./breakpoints.js";
import { bossEffectiveHp, bossEffectiveStats, ownBoostMultiplier, resolveMove, runSustainedComparison } from "./comparison.js";
import {
  RARE_CANDY_TO_CANDY_RATIO,
  RARE_CANDY_XL_TO_XL_CANDY_RATIO,
  noiseFloorFor,
  powerUpCost,
  powerUpLevelMetrics,
  summarizeResults,
  usefulPowerUpLevelsAbove,
  type PowerUpCostModifiers,
  type PowerUpCostTable,
  type PowerUpEncounterSummary,
  type PowerUpLevelMetrics,
  type PowerUpLevelMetricsParams,
  type PowerUpResourceCost,
} from "./powerUp.js";
import type { SpeciesReportBossTarget } from "./speciesReport.js";
import { MAX_TEAM_RAID_SLOTS, runTeamRaid, type TeamRaidInputs, type TeamRaidSlotInput } from "./teamRaid.js";
import { typeEffectiveness } from "./typeChart.js";
import type { ChargedMove, FastMove, IVSpread, SpeciesDefinition } from "./types.js";
import { isWeatherBoosted, type WeatherCondition } from "./weather.js";

/**
 * Phase 2 of PLAN_multi_raid_roster_optimizer.md — ranks power-ups across a
 * LARGE roster (100-200 Pokémon, "the pool") against a SET of raid bosses
 * ("targets"), surfacing not just "what's the single best power-up" but
 * "which currently-BENCHED Pokémon would beat a fielded one if powered up"
 * (§1/§3's headline question the single-target powerUp.ts tab structurally
 * cannot ask). Pure orchestration over EXISTING primitives — runTeamRaid
 * (teamRaid.ts), runSustainedComparison (comparison.ts), and powerUp.ts's
 * cost/ladder/useful-level machinery — no new combat math anywhere in this
 * file. Caller supplies all data (no I/O here), same contract every other
 * engine module in this package follows.
 *
 * PARALLEL-SESSION FILE PARTITION (see the plan's §3.5): simulate.ts,
 * comparison.ts, speciesReport.ts, teamRaid.ts, and types.ts were all
 * off-limits for this phase (another session had uncommitted work in them).
 * This module only IMPORTS from them; the only edit made to a shared file is
 * exporting two already-existing PRIVATE helpers from powerUp.ts
 * (summarizeResults/noiseFloorFor) so this module can reuse them verbatim
 * rather than re-deriving the same formulas a second time — a pure `export`
 * keyword addition, zero behavior change to powerUp.ts's own callers.
 *
 * === The four-stage algorithm (plan §4.3) ===================================
 *
 * STAGE 1 — cheap screen. One `runSustainedComparison` call per (pool entry,
 * boss) at low iterations (`screenIterations`, default 4), at the entry's
 * CURRENT level. Score = meanTotalDamage / (meanSecondsSurvived +
 * swapCostSeconds) — damage per second of raid clock consumed, not raw
 * damage (a bulky low-DPS Pokémon that eats the timer would otherwise be
 * over-rewarded in a SEQUENTIAL team-raid objective). Memoized by
 * (entryId, level, boss).
 *
 * STAGE 2 — team selection per boss. Top 6 pool entries by screen score,
 * skipping any entry beyond the first that's flagged `canMega` (runTeamRaid
 * enforces "at most one mega slot" anyway — this keeps team selection from
 * ever building a roster that call would reject). Duplicate species are
 * allowed (real raids permit them).
 *
 * STAGE 3 — candidate generation, the headline feature: candidates are NOT
 * limited to the 6 currently-fielded pool entries. For every OTHER eligible
 * entry, every USEFUL power-up level (usefulPowerUpLevelsAbove, bounded by
 * maxLevel and stardust affordability) is a candidate row, priced as one
 * direct jump from its current level (never a forced chain of half-steps —
 * see "MULTI-LEVEL JUMPS" below). A species with `isFullyEvolved === false`
 * is excluded entirely and reported in `neverCompetitive` instead (§3.6) —
 * see that field's own note below for the `undefined`-is-eligible trap.
 *
 * RELEVANCE, WITHOUT RE-SIMULATING: whether a NOT-currently-fielded entry's
 * power-up would actually change some boss's team is decided by a CHEAP,
 * PURE-ARITHMETIC proxy, never a second simulation — re-running Stage 1's
 * simulated screen at every (entry, candidate level, boss) combination would
 * cost roughly 15-30x Stage 1's own already-budgeted 2.3s (a candidate has
 * on the order of 10-20 useful levels; nothing in the plan's compute-budget
 * arithmetic accounts for that multiplier), which the plan explicitly does
 * not budget for. Instead this reuses powerUp.ts's OWN existing
 * `powerUpLevelMetrics` (pure arithmetic — a handful of `calculateDamage`
 * calls, no simulation) to build a monotonic-in-level DPS proxy:
 *
 *   proxyDps(level) = outgoingFastDamage / fastMove.durationSeconds
 *                    + outgoingChargedDamage / chargedMove.durationSeconds
 *
 * (floored per-hit damage over move duration — ignores energy pacing, dodge,
 * and survival entirely; deliberately crude, monotonic non-decreasing in
 * level since attack stat and therefore floored damage are both
 * non-decreasing in level and durations are fixed). An entry's ALREADY-
 * simulated Stage 1 screen score is then SCALED by this proxy's own ratio
 * (new level's proxyDps / current level's proxyDps) to estimate what its
 * screen score would become — keeping the estimate on the SAME real,
 * simulated scale as every other pool entry's Stage 1 score (never comparing
 * an arithmetic proxy directly against a simulated one in absolute terms).
 * When that ratio-scaling isn't sound (the entry's CURRENT level's own
 * screen score or proxy is ~0 — a common case for a genuinely benched,
 * very-low-level entry), `estimateOrMeasureScreenScore` falls back to an
 * ACTUAL `getScreenScore(entry, toLevel, ...)` measurement — a real, cheap,
 * memoized simulation at the CANDIDATE level, paid for only in this rare
 * zero-score case — rather than substituting the raw, wrong-scale
 * `newProxy` value directly. An earlier version of this function did exactly
 * that and let a level-1 Vaporeon read as the rank-1 fielded attacker
 * against a team of level 35-40 attackers on a real 164-species sweep (fixed
 * 2026-09-09 — see this module's test file for the regression pin). If that
 * estimate (scaled or measured) would beat the boss's current 6th-place
 * fielded score, the candidate "touches" that boss and gets a REAL Stage 4
 * simulation; otherwise it contributes a computed, un-simulated 0 for that
 * boss. An entry ALREADY fielded on some boss's team is always touched for
 * that boss regardless of the estimate — any level change to an
 * already-fielded slot's own damage output is worth a real measurement.
 *
 * This is the one place this module deliberately deviates from "no new
 * combat math": proxyDps is arithmetic COMPOSITION of powerUpLevelMetrics'
 * own output (division by an existing field), not a new damage/energy
 * formula — no calculateDamage/energy arithmetic is duplicated. Flagged
 * explicitly in this engine-developer's final report as the plan's one
 * genuinely underspecified area (§4.3 describes WHAT the relevance filter
 * must decide, not HOW to decide it without an unbudgeted second simulation
 * pass) and the resolution chosen here.
 *
 * MULTI-LEVEL JUMPS: `powerUp.ts`'s `PowerUpBudgetInputs.candidateLevelsPerSlotPerRound`
 * doc comment records a real regression — capping candidates to only the
 * nearest 1-2 useful levels per round hid a real gain only visible several
 * levels out, because the noise-floor commit rule only ever evaluated each
 * candidate's OWN marginal delta. This module has no equivalent per-round
 * cap: every useful level is ALWAYS offered as its own direct jump from the
 * entry's CURRENT level (fromLevel is always the entry's real current level,
 * never a previously-committed intermediate one), so a real gain that only
 * shows up several useful-levels out is never structurally unreachable —
 * see "commits a multi-level jump..." in this module's test file for the
 * mirrored regression case.
 *
 * STAGE 4 — paired evaluation. Per boss: the baseline team (Stage 2's
 * selection, at every entry's CURRENT level) is simulated ONCE over
 * `iterations` paired seeds (common random numbers — same offsetting
 * convention as everywhere else in this engine, `seed + i * 7919`). Each
 * candidate that "touches" a boss (per Stage 3 above) gets that boss's team
 * re-simulated with the candidate's entry swapped in (or leveled up in
 * place, if already fielded) over the SAME seed set. Two optimizations, both
 * required to hit the plan's compute budget:
 *   - MEMOIZE ON TEAM COMPOSITION (ordered list of entryId@level pairs),
 *     never on candidate identity — most candidates leave most bosses' teams
 *     completely unchanged (either untouched, or two different candidates
 *     happen to produce byte-identical rosters), and an identical team over
 *     an identical seed set is an identical result.
 *   - SKIP UNTOUCHED BOSSES — no `runTeamRaid` call at all for a boss a
 *     candidate doesn't touch; that boss's `deltaTeamDps` is a real,
 *     computed 0 (see RosterPerBossImpact.simulated).
 *
 * meanDeltaTeamDps is the WEIGHTED MEAN across the FULL `perBoss` array
 * (every target, not just touched ones) — a candidate that only helps 2 of
 * 30 bosses correctly reads as a small overall number, not a locally
 * inflated one restricted to the bosses it happens to touch. This is also
 * exactly what makes "per-boss deltas aggregate to the weighted mean" a
 * trivially true, directly testable property (see this module's test file).
 * BUT averaging across every target also DILUTES a genuine single-boss gain
 * into false-negative territory — see `bestBossDeltaTeamDps`/
 * `significantBossCount`/`exceedsNoise`'s own doc comments (fixed 2026-09-09
 * after a real 164-species/13-boss sweep showed a benched entry entering ONE
 * boss's team reading as "no measurable change" purely from being averaged
 * across a dozen untouched bosses).
 *
 * `noiseFloorTeamDps` is combined across bosses in QUADRATURE, not by
 * pooling raw `teamDpsPerSeed` samples across bosses — pooling measures
 * BETWEEN-BOSS spread (a real, non-noise 8-92 DPS range between a 1-star and
 * a 5-star boss on a real sweep), which cancels exactly in a paired per-boss
 * delta and isn't noise at all. See the aggregate-floor computation's own
 * inline comment for the formula and the measured before/after numbers.
 *
 * === Ranking, capping, and the two "don't silently ignore" outputs ==========
 *
 * Every (entry, level) candidate row — touched or not — is ranked by a cheap
 * proxy (summed weighted screen-score improvement across touched bosses per
 * 1000 stardust). Rows are first DIVERSIFIED — each pool entry contributes
 * at most `maxLevelsPerEntry` (default 3) of its own best-ranked rows — so a
 * dense level ladder from one or two entries can't consume the entire cap
 * (measured on a real sweep: only 8 distinct species survived a 60-candidate
 * cap with no per-entry limit, vs. 21 with it). THEN the top `maxCandidates`
 * (default 60) of the diversified set survive into `candidates`. An
 * UNTOUCHED row's proxy is exactly 0, so it naturally sinks to the bottom of
 * that ranking and is dropped by the cap on a large roster — but on a SMALL
 * pool/boss-set (fewer total candidates than the cap), an untouched row
 * survives into `candidates` with `meanDeltaTeamDps: 0` and every
 * `perBoss[].simulated === false`, exactly matching the plan's "a real
 * answer, not a skipped one" requirement (and the pinned test for it).
 *
 * `benchedButPromising` (one row per pool entry fielded on NO baseline team,
 * its CHEAPEST level that touches at least one boss) and `neverCompetitive`
 * (evolution-blocked entries, PLUS entries with no affordable useful level,
 * PLUS entries whose every affordable level touches nothing) are computed
 * from the FULL candidate-generation pass, independent of the maxCandidates
 * cap — together they are the answer to "check whether any excluded Pokémon
 * would be better if powered up," and neverCompetitive is what stops this
 * from silently ignoring the bulk of a 164-entry pool.
 *
 * === A real gap this phase found, NOT fixed here (flagged per the task's
 * "stop and report it" instruction) ==========================================
 *
 * `SpeciesReportBossTarget.bossMaxHpOverride` (comparison.ts's
 * `bossEffectiveHp` third parameter) lets a historical/archived boss target
 * be simulated at its REAL recorded HP instead of today's tier-derived
 * default — `runSustainedComparison` (Stage 1's screen) honors it via
 * `SustainedComparisonInputs.bossMaxHpOverride`. `TeamRaidInputs` (Stage 4)
 * has NO equivalent field at all — `runTeamRaid` always calls
 * `bossEffectiveHp(boss, bossRaidTier)` internally with no override
 * parameter, so its OWN clear-timer detection (`outcome`/
 * `clearsWithinTimer`/`timeToClearSeconds`) cannot honor an override no
 * matter what this module passes in. This module still computes ITS OWN
 * `bossHp` (fed into `summarizeResults`, which only touches the NON-cleared
 * fallback branch's denominator) via the correct
 * `bossEffectiveHp(target.species, target.tier, target.bossMaxHpOverride)`,
 * which partially mitigates this for a run that never clears — but a run
 * that DOES clear still clears against the WRONG (today's tier) HP
 * internally. `teamRaid.ts` needs the same `bossMaxHpOverride` hook
 * `comparison.ts`'s `SustainedComparisonInputs` already has; this module
 * cannot add it (teamRaid.ts is off-limits this phase).
 */

/** One entry in the caller's whole-roster pool — a single POOL ENTRY, not a species (the same species can appear more than once; real raids permit duplicates). */
export interface RosterEntry {
  /** Unique per pool entry, never derived from species id alone (duplicates are real — see this interface's own doc comment). */
  entryId: string;
  species: SpeciesDefinition;
  /** Omit/null defaults to species.fastMoves[0] — the same convention every other engine entry point uses (comparison.ts's resolveMove). */
  fastMoveId: string | null;
  /** See fastMoveId. */
  chargedMoveId: string | null;
  level: number;
  ivs: IVSpread;
  costModifiers: PowerUpCostModifiers;
  /**
   * Whether THIS entry, when fielded, occupies the account's one Mega/Primal
   * slot (i.e. is fielded with `TeamRaidSlotInput.isMega: true`) — real
   * Pokémon GO only allows one Pokémon Mega Evolved at a time. Team
   * selection (Stage 2) respects "at most one canMega entry per team" so
   * `runTeamRaid`'s own validation (which throws on a second `isMega` slot)
   * never fires. `runRosterPlanner` throws up front if an entry sets this
   * true without `species.boost` defined, matching `runTeamRaid`'s own
   * validation rule (see teamRaid.ts's `validateRoster`).
   */
  canMega: boolean;
  /** Carried through to every output row naming this entry — see PLAN_multi_raid_roster_optimizer.md §3.3 for why an approximate IV spread (derived from Poke Genie's IV Avg column) must stay visibly badged. Purely informational to this module; never consumed by any combat math here. */
  ivsAreApproximate: boolean;
  /** See ivsAreApproximate — same convention for an uncertain (Level Min != Level Max) import row. */
  levelIsApproximate: boolean;
  /** See ivsAreApproximate — same convention for a defaulted (blank in the import) moveset. */
  movesetIsDefaulted: boolean;
  /**
   * The candy-pool key this entry's power-up candy is drawn from — see
   * RosterPlannerInputs.candyByFamilyId. Defaults to species.candyFamilyId
   * when omitted.
   *
   * MUST be supplied explicitly by the caller for a mega/primal entry: every
   * real mega/primal SpeciesDefinition's own candyFamilyId is undefined (see
   * types.ts's candyFamilyId doc comment — confirmed against the real synced
   * data, 2026-09-09), because a mega draws its BASE species' candy, and
   * SpeciesDefinition carries no baseSpeciesId link this no-I/O engine could
   * resolve on its own. Leaving both this field and species.candyFamilyId
   * undefined means this entry's candy can never be verified against any
   * pool (costUnverified: true, unconditionally) — the honest,
   * non-fabricating default rather than silently pooling a mega's candy
   * against nothing or guessing a base species.
   */
  candyFamilyId?: string;
}

/** One raid boss to sweep the whole pool against, plus its aggregation weight — extends speciesReport.ts's SpeciesReportBossTarget (the SAME "active + optionally past raids, per-tier filterable" boss-target shape the Species Report tab already uses — see PLAN_multi_raid_roster_optimizer.md §3.1). */
export interface WeightedRaidTarget extends SpeciesReportBossTarget {
  /** This boss's weight in every candidate's weighted-mean aggregation (RosterPowerUpCandidate.meanDeltaTeamDps) — defaults to 1. Does NOT affect team selection or Stage 4 simulation, only how per-boss deltas are combined into one headline number. */
  weight?: number;
}

export interface RosterPlannerInputs {
  /** The whole pool being reasoned over — real exports run 100-200 entries. */
  pool: RosterEntry[];
  /** The bosses to sweep — see WeightedRaidTarget. Caller-supplied; this module performs no I/O to build this list (see speciesReport.ts's identical convention). */
  targets: WeightedRaidTarget[];
  costTable: PowerUpCostTable;
  stardustOnHand: number;
  /** Same shared, fungible, account-wide pool as powerUp.ts's PowerUpOptimizerInputs.rareCandyOnHand — see RARE_CANDY_TO_CANDY_RATIO. Defaults to 0. */
  rareCandyOnHand?: number;
  /** See rareCandyOnHand, for the separate Rare Candy XL item. Defaults to 0. */
  rareCandyXlOnHand?: number;
  /**
   * Candy on hand, pooled per `candyFamilyId` (e.g. "FAMILY_HOUNDOUR") —
   * NEVER per species id (PLAN_multi_raid_roster_optimizer.md §3.4: on a
   * real 164-row export, 25 families hold more than one pool entry;
   * FAMILY_HOUNDOUR alone holds 14). A family absent from this map (or
   * present with an `undefined` value) means "unknown," never "0" — every
   * candidate drawing on that family is reported with `costUnverified:
   * true` rather than silently treated as unaffordable or free.
   */
  candyByFamilyId: Record<string, { candy: number; xlCandy: number } | undefined>;
  /** Defaults to costTable.maxLevel. */
  maxLevel?: number;
  /** Governs dodging every boss's CHARGED attacks — one shared assumption across the whole pool and every boss, same as every other tab in this engine. */
  dodge: DodgeBehavior;
  /** Whether the roster also attempts to dodge fast attacks. Defaults to false. */
  dodgeFastAttacks?: boolean;
  /** See simulate.ts's StepwiseAttacker.holdChargedMoveUntilSafe. Applies to every slot/entry identically. Defaults to false. */
  holdChargedMoveUntilSafe?: boolean;
  /** See comparison.ts's SustainedComparisonInputs.bossChargedMoveMeanIntervalSeconds / teamRaid.ts's TeamRaidInputs field of the same name — one shared assumption swept across every boss. */
  bossChargedMoveMeanIntervalSeconds: number;
  /**
   * See simulate.ts's `BossChargedMoveCadence`. Defaults to "fixed-interval".
   * Applied identically to every boss and every fight.
   *
   * Deliberately an INDEXED ACCESS on `TeamRaidInputs` rather than an import
   * of the named type: this module's only job with this value is to hand it
   * straight to `runTeamRaid`, so tracking that input's own declared type
   * means a cadence mode added there is accepted here automatically, with no
   * second declaration to fall out of date. A hardcoded literal union was the
   * alternative and would already have been wrong — a third mode
   * ("energy-gated-interval") was added to simulate.ts while this module was
   * being written, and a two-member union would have silently rejected it.
   */
  bossChargedMoveCadence?: TeamRaidInputs["bossChargedMoveCadence"];
  /** Applied per-move to both sides against every boss — see weather.ts. Defaults to "none". */
  weather?: WeatherCondition;
  /** Real-world raid countdown, shared across every boss's team-raid simulation. */
  raidTimerSeconds: number;
  /** See teamRaid.ts's TeamRaidInputs.swapCostSeconds. Also the denominator term in Stage 1's screen score. Defaults to 0. */
  swapCostSeconds?: number;
  /** See teamRaid.ts's TeamRaidInputs.reviveCostSeconds. Defaults to 0. */
  reviveCostSeconds?: number;
  /** See teamRaid.ts's TeamRaidInputs.maxSecondsPerSlot. Defaults to that field's own default (enough to cover raidTimerSeconds even if one Pokémon solos the whole fight). */
  maxSecondsPerSlot?: number;
  /** Base seed for every seeded call this module makes (screen AND paired evaluation share the same base — each derives its own offset sequence). Defaults to 1. */
  seed?: number;
  /** Stage 1's per-(entry,boss) screen iterations. Defaults to 4 (within the plan's recommended 3-5). */
  screenIterations?: number;
  /** Stage 4's per-boss paired evaluation iterations (baseline AND every simulated candidate). Defaults to 5. */
  iterations?: number;
  /** Cap on how many (entry, level) rows survive Stage 3's cheap-proxy ranking into `candidates` — see this module's top doc comment for why an untouched row's own proxy naturally sinks to the bottom rather than needing separate exclusion. Defaults to 60. */
  maxCandidates?: number;
  /**
   * Cap on how many (toLevel) rows ONE pool entry can contribute BEFORE
   * `maxCandidates` is applied globally — keeps `maxCandidates` slots
   * representing the ROSTER (many distinct species) rather than a few
   * entries' dense level ladders. Measured on the real 164-species/13-boss
   * sweep: at `maxCandidates: 60` with no per-entry cap, only 8 distinct
   * species survived (five near-identical Cinderace rows 0.5 levels apart
   * with ~0.0004 DPS between them, twelve Vaporeon rows, etc.) even though
   * 90 entries were eligible. Each entry's OWN best rows (by Stage 3's
   * rankProxy) are kept, so this never drops an entry's single strongest
   * candidate — only its redundant near-duplicate neighbors. Defaults to 3.
   */
  maxLevelsPerEntry?: number;
}

/** One boss's real, computed effect of ONE candidate power-up — always present for every target in RosterPowerUpCandidate.perBoss, whether or not this boss was actually simulated for this candidate. */
export interface RosterPerBossImpact {
  bossId: string;
  bossName: string;
  /** 0, exactly, for an untouched boss (see `simulated` below) — not an estimate rounded to 0. */
  deltaTeamDps: number;
  /** This entry's 1-indexed fielding position on this boss's BASELINE team (Stage 2 selection, at the entry's current level) — null if not fielded there. */
  rankBefore: number | null;
  /** This entry's 1-indexed fielding position on this boss's team AFTER this candidate's power-up — null if it doesn't enter. Team-membership determination for a not-yet-fielded entry uses the Stage 3 arithmetic estimate (see this module's top doc comment); an already-fielded entry's rankAfter is definitionally the same slot it already occupied. */
  rankAfter: number | null;
  /** False means this boss was genuinely SKIPPED — no runTeamRaid call was made for it at all, and deltaTeamDps above is a real, exact, computed 0 (this entry neither entered nor was already on this boss's team). True means a real Stage 4 paired simulation produced deltaTeamDps. */
  simulated: boolean;
}

export interface RosterPowerUpCandidate {
  entryId: string;
  speciesId: string;
  speciesName: string;
  fromLevel: number;
  toLevel: number;
  cost: PowerUpResourceCost;
  /** True when this entry's resolved candy-family pool (RosterPlannerInputs.candyByFamilyId, see RosterEntry.candyFamilyId) is unknown — ranked normally regardless (§3.4), never dropped or silently treated as 0/unaffordable. */
  costUnverified: boolean;
  /**
   * Whether this SINGLE candidate could be bought on its own — same
   * "priced independently" convention as powerUp.ts's PowerUpCandidate
   * .affordable (two rows can both read affordable while being jointly
   * unaffordable; that joint question is Phase 4's planRosterBudget, not
   * this table). Always false when costUnverified is true — affordability
   * can't be confirmed without a known candy count.
   */
  affordable: boolean;
  /** Rare Candy this candidate would draw from the shared pool beyond this entry's own known family candy — see powerUp.ts's PowerUpCandidate.sharedCandyNeeded. 0 when costUnverified (nothing known to draw down from first). */
  sharedCandyNeeded: number;
  /** Same as sharedCandyNeeded, for the shared Rare Candy XL pool. */
  sharedXlCandyNeeded: number;
  /**
   * Weighted mean of perBoss[].deltaTeamDps across EVERY target (see this
   * module's top doc comment — untouched bosses correctly pull this toward
   * 0, not just toward the touched subset's own average). This is an honest
   * "across your whole boss set" number, but averaging over bosses a
   * candidate never touches manufactures FALSE NEGATIVES for a candidate
   * that only helps one or two bosses — see `bestBossDeltaTeamDps`/
   * `significantBossCount` below, and CLAUDE.md's headline thesis ("where
   * the ranking flips," not one collapsed number). Never use this field
   * alone to decide whether a candidate is worth surfacing.
   */
  meanDeltaTeamDps: number;
  /**
   * The single largest-magnitude entry of `perBoss[].deltaTeamDps` (signed —
   * can be negative, meaning the power-up measurably HURTS that one boss's
   * team, e.g. by shifting when the boss's charged-move RNG lands). `null`
   * only when every `perBoss[].deltaTeamDps` is exactly 0 (an untouched
   * candidate). Exists because `meanDeltaTeamDps` dilutes a real, large
   * single-boss gain across every OTHER boss the candidate never touches —
   * e.g. a benched entry newly entering ONE boss's team out of thirteen can
   * read as comfortably below the aggregate noise floor while still being a
   * genuine, individually-significant improvement on that one boss.
   */
  bestBossDeltaTeamDps: number | null;
  /** speciesReport.ts-style boss id `perBoss[]` entry that `bestBossDeltaTeamDps` came from — `null` exactly when `bestBossDeltaTeamDps` is `null`. */
  bestBossId: string | null;
  /** Count of `perBoss[]` entries where `Math.abs(deltaTeamDps) > noiseFloorFor(that boss's OWN baseline summary, iterations)` — i.e. bosses where THIS candidate's effect is real on its own terms, not just in the aggregate. */
  significantBossCount: number;
  /** One entry per RosterPlannerInputs.targets, in the same order — the full per-boss breakdown, never collapsed away (this product's headline output, per CLAUDE.md/plan §1). */
  perBoss: RosterPerBossImpact[];
  /** Boss ids where this entry wasn't on the baseline team but is estimated to enter after this power-up — the explicit "headline" surface for the bench-aware question (plan §1/§3). */
  bossesNewlyFielded: string[];
  /** Null when cost.stardust is 0. */
  deltaPer1000Stardust: number | null;
  /** Regular candy only, never blended with stardust (CLAUDE.md standing decision). Null when cost.candy is 0. */
  deltaPerCandy: number | null;
  /** Null when cost.xlCandy is 0. */
  deltaPerXlCandy: number | null;
  /**
   * `Math.abs(meanDeltaTeamDps) > RosterPlanResult.noiseFloorTeamDps` OR
   * `significantBossCount > 0` — a candidate that clears the aggregate floor
   * OR is individually significant on at least one boss counts as a real
   * effect. A genuine per-boss gain must never be reported as "no measurable
   * change" purely because it got diluted by bosses it doesn't touch.
   */
  exceedsNoise: boolean;
}

export interface RosterNeverCompetitiveEntry {
  entryId: string;
  speciesId: string;
  speciesName: string;
  /** Human-readable reason — see runRosterPlanner's three cases (evolution-blocked, no affordable level, no level makes it competitive). */
  reason: string;
  /** Present (possibly empty — see types.ts's isFullyEvolved doc comment on the Zygarde/Farfetch'd-family gap) only for the evolution-blocked case. */
  evolvesToIds?: string[];
}

export interface RosterBaselineBossSummary {
  bossId: string;
  bossName: string;
  /** entryIds, in fielding order (descending Stage 1 screen score, respecting the one-mega-slot cap). */
  team: string[];
  summary: PowerUpEncounterSummary;
}

export interface RosterPlanResult {
  /** One entry per RosterPlannerInputs.targets — the do-nothing team and its measured encounter summary for every boss, always fully simulated regardless of whether any candidate touches it. */
  baselinePerBoss: RosterBaselineBossSummary[];
  /**
   * A single noise floor across the WHOLE sweep, derived via powerUp.ts's
   * `noiseFloorFor` applied to the POOLED sample of every boss's baseline
   * `teamDpsPerSeed` values (not per-boss) — "averaging across `targets.length`
   * bosses is itself variance reduction... the effective sample is bosses x
   * iterations" (plan §4.3), so this floor is generally tighter than any
   * single boss's own `noiseFloorFor(baselinePerBoss[i].summary, iterations)`
   * would be.
   */
  noiseFloorTeamDps: number;
  /** The iteration count actually used for Stage 4's paired evaluation. */
  iterations: number;
  /** The iteration count actually used for Stage 1's screen. */
  screenIterations: number;
  /** Ranked (by meanDeltaTeamDps, descending), capped at RosterPlannerInputs.maxCandidates. */
  candidates: RosterPowerUpCandidate[];
  /** One row per pool entry fielded on NO baseline team but with at least one affordable level that touches some boss — that level's CHEAPEST (lowest stardust) instance, fully simulated. See this module's top doc comment — computed independent of the maxCandidates cap. */
  benchedButPromising: RosterPowerUpCandidate[];
  /** Pool entries excluded from candidate generation entirely, with why — never silently hidden. See this module's top doc comment for the three cases. */
  neverCompetitive: RosterNeverCompetitiveEntry[];
}

// --- Team selection -----------------------------------------------------------

/** Top MAX_TEAM_RAID_SLOTS by score, descending, skipping any `canMega` entry beyond the first (so runTeamRaid's own "at most one mega slot" validation never fires) — see RosterEntry.canMega. */
function selectTeam(scored: { entry: RosterEntry; score: number }[]): RosterEntry[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const team: RosterEntry[] = [];
  let megaUsed = false;
  for (const { entry } of sorted) {
    if (team.length >= MAX_TEAM_RAID_SLOTS) break;
    if (entry.canMega) {
      if (megaUsed) continue;
      megaUsed = true;
    }
    team.push(entry);
  }
  return team;
}

function toSlotInput(entry: RosterEntry): TeamRaidSlotInput {
  return {
    species: entry.species,
    fastMoveId: entry.fastMoveId,
    chargedMoveId: entry.chargedMoveId,
    isMega: entry.canMega,
    level: entry.level,
    ivs: entry.ivs,
  };
}

function teamKeyFor(entries: RosterEntry[]): string {
  return entries.map((e) => `${e.entryId}@${e.level}`).join(",");
}

// --- Stage 1: cheap screen ----------------------------------------------------

interface SharedAssumptions {
  dodge: DodgeBehavior;
  dodgeFastAttacks?: boolean;
  holdChargedMoveUntilSafe?: boolean;
  bossChargedMoveMeanIntervalSeconds: number;
  bossChargedMoveCadence?: TeamRaidInputs["bossChargedMoveCadence"];
  weather: WeatherCondition;
  raidTimerSeconds: number;
  swapCostSeconds?: number;
  reviveCostSeconds?: number;
  maxSecondsPerSlot?: number;
}

/** Damage per second of raid clock consumed — see this module's top doc comment for why not plain meanTotalDamage. Memoized by (entryId, level, targetIndex). */
function screenScoreFor(
  entry: RosterEntry,
  level: number,
  target: WeightedRaidTarget,
  targetIndex: number,
  shared: SharedAssumptions,
  screenIterations: number,
  cache: Map<string, number>,
): number {
  const key = `${entry.entryId}|${level}|${targetIndex}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  // NOTE: runSustainedComparison/SustainedComparisonInputs has NO `seed`
  // field at all — comparison.ts's runStepwiseDistribution call omits the
  // baseSeed argument, so every screen call always uses that function's own
  // internal default (baseSeed=1). Harmless for this module's purposes
  // (every screen call is independent, never paired against another screen
  // call), but worth flagging: unlike Stage 4's runTeamRaid, this module's
  // own `seed` input cannot influence Stage 1 at all.
  const [result] = runSustainedComparison({
    candidates: [entry.species],
    candidateFastMoveIds: [entry.fastMoveId],
    candidateChargedMoveIds: [entry.chargedMoveId],
    boss: target.species,
    bossRaidTier: target.tier,
    bossMaxHpOverride: target.bossMaxHpOverride,
    bossFastMoveId: target.bossFastMoveId,
    bossChargedMoveId: target.bossChargedMoveId,
    level,
    ivs: entry.ivs,
    dodge: shared.dodge,
    dodgeFastAttacks: shared.dodgeFastAttacks,
    holdChargedMoveUntilSafe: shared.holdChargedMoveUntilSafe,
    bossChargedMoveMeanIntervalSeconds: shared.bossChargedMoveMeanIntervalSeconds,
    bossChargedMoveCadence: shared.bossChargedMoveCadence,
    weather: shared.weather,
    iterations: screenIterations,
  });

  const score = result!.meanTotalDamage / (result!.meanSecondsSurvived + (shared.swapCostSeconds ?? 0));
  cache.set(key, score);
  return score;
}

// --- Stage 3: the cheap, no-simulation relevance/ranking proxy ---------------

/**
 * outgoingFastDamage/duration + outgoingChargedDamage/duration — see this
 * module's top doc comment for why this specific, deliberately crude
 * composition of powerUpLevelMetrics' own output (never a new damage
 * formula) is the right no-simulation proxy for Stage 3.
 */
function proxyDps(metrics: PowerUpLevelMetrics, fastMove: FastMove, chargedMove: ChargedMove): number {
  return metrics.outgoingFastDamage / fastMove.durationSeconds + metrics.outgoingChargedDamage / chargedMove.durationSeconds;
}

/**
 * Scales a REAL, already-simulated screen score by the arithmetic proxy's own
 * ratio — keeps the estimate on the same simulated scale as every other pool
 * entry's Stage 1 score. Returns `null` (never a raw proxy value) when that
 * scaling isn't sound: either the current level's own simulated screen score
 * OR its own proxy is ~0 — a real, common case for a genuinely BENCHED entry
 * (e.g. it dies before landing a single complete hit at its current level, so
 * meanTotalDamage is exactly 0 even though its floored per-hit damage isn't).
 * A multiplicative ratio against a zero baseline would stay zero no matter
 * how strong the new level becomes, hiding the "benched Pokémon becomes
 * competitive" case this module exists to surface.
 *
 * CRITICAL: the caller must NOT substitute the raw `newProxy` value on a
 * `null` return. `newProxy` is an arithmetic damage/duration number, on a
 * completely different scale from every simulated screen score (damage per
 * second of RAID CLOCK, i.e. divided by survival+swap seconds) it gets
 * compared against — an earlier version of this function did exactly that
 * and it let a level-1 Vaporeon read as the #1-ranked entry against a team
 * of level 35-40 attackers (measured on the real 164-species sweep: three
 * distinct level-1 Vaporeon rows all read `rankAfter: 1` with a mean delta
 * around -20 team DPS once actually simulated). See
 * `estimateOrMeasureScreenScore` below for the real fix: get a genuine
 * measurement instead.
 */
function estimateScreenScore(currentScreenScore: number, currentProxy: number, newProxy: number): number | null {
  if (currentProxy > 1e-9 && currentScreenScore > 1e-9) {
    const ratio = newProxy / currentProxy;
    if (Number.isFinite(ratio)) return currentScreenScore * ratio;
  }
  return null;
}

/** Everything powerUpLevelMetrics/usefulPowerUpLevelsAbove need for one (entry, boss) pair, built once and cached (see getMetricsInputs) since only `level` varies call to call. */
function entryBossMetricsInputs(entry: RosterEntry, target: WeightedRaidTarget, weather: WeatherCondition): Omit<PowerUpLevelMetricsParams, "level"> {
  const fastMove = resolveMove(entry.species.fastMoves, entry.fastMoveId);
  const chargedMove = resolveMove(entry.species.chargedMoves, entry.chargedMoveId);
  if (!fastMove || !chargedMove) {
    throw new Error(`Roster entry ${entry.entryId} (${entry.species.id}) needs at least one fast move and one charged move.`);
  }
  const { attack: bossAttackStat, defense: bossDefenseStat } = bossEffectiveStats(target.species, target.tier);
  const bossFastMove = resolveMove(target.species.fastMoves, target.bossFastMoveId);
  if (!bossFastMove) throw new Error(`Boss target ${target.species.id} has no fast move defined.`);
  const bossChargedMove = resolveMove(target.species.chargedMoves, target.bossChargedMoveId);

  return {
    species: entry.species,
    ivs: entry.ivs,
    fastMove,
    chargedMove,
    outgoingFastMoveDamageModifiers: {
      stab: entry.species.types.includes(fastMove.type),
      typeEffectiveness: typeEffectiveness(fastMove.type, target.species.types),
      megaBoostMultiplier: ownBoostMultiplier(entry.species.boost, fastMove.type),
      weatherBoosted: isWeatherBoosted(fastMove.type, weather),
    },
    outgoingChargedMoveDamageModifiers: {
      stab: entry.species.types.includes(chargedMove.type),
      typeEffectiveness: typeEffectiveness(chargedMove.type, target.species.types),
      megaBoostMultiplier: ownBoostMultiplier(entry.species.boost, chargedMove.type),
      weatherBoosted: isWeatherBoosted(chargedMove.type, weather),
    },
    bossFastMove,
    bossChargedMove,
    bossAttackStat,
    bossDefenseStat,
    incomingFastMoveDamageModifiers: {
      stab: target.species.types.includes(bossFastMove.type),
      typeEffectiveness: typeEffectiveness(bossFastMove.type, entry.species.types),
      weatherBoosted: isWeatherBoosted(bossFastMove.type, weather),
    },
    incomingChargedMoveDamageModifiers: bossChargedMove
      ? {
          stab: target.species.types.includes(bossChargedMove.type),
          typeEffectiveness: typeEffectiveness(bossChargedMove.type, entry.species.types),
          weatherBoosted: isWeatherBoosted(bossChargedMove.type, weather),
        }
      : undefined,
  };
}

function resolveCandyFamilyId(entry: RosterEntry): string | undefined {
  return entry.candyFamilyId ?? entry.species.candyFamilyId;
}

interface PricedCandidate {
  cost: PowerUpResourceCost;
  costUnverified: boolean;
  affordable: boolean;
  sharedCandyNeeded: number;
  sharedXlCandyNeeded: number;
}

function priceCandidate(
  costTable: PowerUpCostTable,
  entry: RosterEntry,
  toLevel: number,
  stardustOnHand: number,
  candyByFamilyId: Record<string, { candy: number; xlCandy: number } | undefined>,
  rareCandyOnHand: number,
  rareCandyXlOnHand: number,
): PricedCandidate {
  const cost = powerUpCost(costTable, entry.level, toLevel, entry.costModifiers);
  const familyId = resolveCandyFamilyId(entry);
  const pool = familyId !== undefined ? candyByFamilyId[familyId] : undefined;
  const costUnverified = pool === undefined;
  const ownCandy = pool?.candy ?? 0;
  const ownXl = pool?.xlCandy ?? 0;
  const sharedCandyNeeded = costUnverified ? 0 : Math.max(0, cost.candy - ownCandy) / RARE_CANDY_TO_CANDY_RATIO;
  const sharedXlCandyNeeded = costUnverified ? 0 : Math.max(0, cost.xlCandy - ownXl) / RARE_CANDY_XL_TO_XL_CANDY_RATIO;
  const affordable =
    !costUnverified && cost.stardust <= stardustOnHand && sharedCandyNeeded <= rareCandyOnHand && sharedXlCandyNeeded <= rareCandyXlOnHand;
  return { cost, costUnverified, affordable, sharedCandyNeeded, sharedXlCandyNeeded };
}

// --- Stage 4: paired evaluation, memoized on team composition ----------------

function runFullRosterCached(
  teamEntries: RosterEntry[],
  targetIndex: number,
  target: WeightedRaidTarget,
  seeds: number[],
  shared: SharedAssumptions,
  bossHp: number,
  cache: Map<string, PowerUpEncounterSummary>,
): PowerUpEncounterSummary {
  const key = `${targetIndex}::${teamKeyFor(teamEntries)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const slots = teamEntries.map(toSlotInput);
  const first = teamEntries[0]!;
  const results = seeds.map((s) =>
    runTeamRaid({
      slots,
      boss: target.species,
      bossRaidTier: target.tier,
      bossFastMoveId: target.bossFastMoveId,
      bossChargedMoveId: target.bossChargedMoveId,
      // Every slot supplies its own level/ivs override (toSlotInput) — these
      // roster-wide fields are dead fallbacks, same trick powerUp.ts's
      // optimizePowerUps/planPowerUpBudget already use for TeamRaidInputs.
      level: first.level,
      ivs: first.ivs,
      dodge: shared.dodge,
      dodgeFastAttacks: shared.dodgeFastAttacks,
      holdChargedMoveUntilSafe: shared.holdChargedMoveUntilSafe,
      bossChargedMoveMeanIntervalSeconds: shared.bossChargedMoveMeanIntervalSeconds,
      bossChargedMoveCadence: shared.bossChargedMoveCadence,
      weather: shared.weather,
      raidTimerSeconds: shared.raidTimerSeconds,
      swapCostSeconds: shared.swapCostSeconds,
      reviveCostSeconds: shared.reviveCostSeconds,
      maxSecondsPerSlot: shared.maxSecondsPerSlot,
      seed: s,
    } satisfies TeamRaidInputs),
  );

  const summary = summarizeResults(results, bossHp, shared.raidTimerSeconds);
  cache.set(key, summary);
  return summary;
}

// --- Main entry point ---------------------------------------------------------

export function runRosterPlanner(inputs: RosterPlannerInputs): RosterPlanResult {
  const {
    pool,
    targets,
    costTable,
    stardustOnHand,
    rareCandyOnHand = 0,
    rareCandyXlOnHand = 0,
    candyByFamilyId,
    maxLevel = costTable.maxLevel,
    screenIterations = 4,
    iterations = 5,
    maxCandidates = 60,
    maxLevelsPerEntry = 3,
    seed = 1,
    weather = "none",
    ...rest
  } = inputs;

  if (pool.length === 0) throw new Error("runRosterPlanner requires a non-empty pool.");
  if (targets.length === 0) throw new Error("runRosterPlanner requires at least one raid target.");

  const seenEntryIds = new Set<string>();
  for (const entry of pool) {
    if (seenEntryIds.has(entry.entryId)) {
      throw new Error(
        `Duplicate RosterEntry.entryId "${entry.entryId}" — every pool entry needs a unique id even when the same species appears more than once (real raids permit duplicate species; this planner needs a unique key regardless).`,
      );
    }
    seenEntryIds.add(entry.entryId);
    if (entry.canMega && !entry.species.boost) {
      throw new Error(`Roster entry ${entry.entryId} (${entry.species.id}) is flagged canMega but its species has no boost mechanic defined.`);
    }
  }

  const shared: SharedAssumptions = {
    dodge: rest.dodge,
    dodgeFastAttacks: rest.dodgeFastAttacks,
    holdChargedMoveUntilSafe: rest.holdChargedMoveUntilSafe,
    bossChargedMoveMeanIntervalSeconds: rest.bossChargedMoveMeanIntervalSeconds,
    bossChargedMoveCadence: rest.bossChargedMoveCadence,
    weather,
    raidTimerSeconds: rest.raidTimerSeconds,
    swapCostSeconds: rest.swapCostSeconds,
    reviveCostSeconds: rest.reviveCostSeconds,
    maxSecondsPerSlot: rest.maxSecondsPerSlot,
  };

  const evalSeeds = Array.from({ length: iterations }, (_, i) => seed + i * 7919);

  const screenScoreCache = new Map<string, number>();
  const metricsInputsCache = new Map<string, Omit<PowerUpLevelMetricsParams, "level">>();
  const teamSummaryCache = new Map<string, PowerUpEncounterSummary>();

  const getMetricsInputs = (entry: RosterEntry, target: WeightedRaidTarget, targetIndex: number): Omit<PowerUpLevelMetricsParams, "level"> => {
    const key = `${entry.entryId}|${targetIndex}`;
    let v = metricsInputsCache.get(key);
    if (!v) {
      v = entryBossMetricsInputs(entry, target, weather);
      metricsInputsCache.set(key, v);
    }
    return v;
  };

  const getScreenScore = (entry: RosterEntry, level: number, target: WeightedRaidTarget, targetIndex: number): number =>
    screenScoreFor(entry, level, target, targetIndex, shared, screenIterations, screenScoreCache);

  /**
   * Estimates a NOT-currently-fielded entry's screen score at `toLevel`,
   * always on the SAME simulated scale as `currentScore`/every other pool
   * entry's real Stage 1 score — never a raw arithmetic proxy value (see
   * `estimateScreenScore`'s doc comment for the real bug this replaced).
   * When the cheap ratio-scaling isn't sound (current level's own screen
   * score or proxy is ~0 — a genuinely benched, very-low-level entry), falls
   * back to an ACTUAL `getScreenScore(entry, toLevel, ...)` measurement — a
   * real (cheap, memoized) simulation at the candidate level, only ever paid
   * for in this rare zero-score case.
   */
  const estimateOrMeasureScreenScore = (
    entry: RosterEntry,
    toLevel: number,
    target: WeightedRaidTarget,
    targetIndex: number,
    currentScore: number,
  ): number => {
    const metricsInputs = getMetricsInputs(entry, target, targetIndex);
    const currentMetrics = powerUpLevelMetrics({ ...metricsInputs, level: entry.level });
    const newMetrics = powerUpLevelMetrics({ ...metricsInputs, level: toLevel });
    const currentProxy = proxyDps(currentMetrics, metricsInputs.fastMove, metricsInputs.chargedMove);
    const newProxy = proxyDps(newMetrics, metricsInputs.fastMove, metricsInputs.chargedMove);
    const scaled = estimateScreenScore(currentScore, currentProxy, newProxy);
    return scaled ?? getScreenScore(entry, toLevel, target, targetIndex);
  };

  // --- Stage 1 + 2: baseline screen & team selection, per boss --------------
  const bossHpByTarget = targets.map((t) => bossEffectiveHp(t.species, t.tier, t.bossMaxHpOverride));

  const scoredAllByTarget: { entry: RosterEntry; score: number }[][] = [];
  const baselineTeamsByTarget: RosterEntry[][] = [];
  for (let ti = 0; ti < targets.length; ti++) {
    const target = targets[ti]!;
    const scored = pool.map((entry) => ({ entry, score: getScreenScore(entry, entry.level, target, ti) }));
    scoredAllByTarget.push(scored);
    baselineTeamsByTarget.push(selectTeam(scored));
  }

  const baselinePerBoss: RosterBaselineBossSummary[] = targets.map((target, ti) => {
    const team = baselineTeamsByTarget[ti]!;
    const summary = runFullRosterCached(team, ti, target, evalSeeds, shared, bossHpByTarget[ti]!, teamSummaryCache);
    return { bossId: target.species.id, bossName: target.species.name, team: team.map((e) => e.entryId), summary };
  });

  // --- Aggregate (weighted, cross-boss) noise floor ---------------------------
  // NEVER pool raw teamDpsPerSeed values across bosses — that measures
  // BETWEEN-BOSS spread (a 1-star's ~8 DPS baseline vs. a 5-star's ~90 DPS
  // baseline is a real, measured 8.26-92.31 range on a live 13-boss sweep),
  // which is not noise at all and which cancels exactly in a paired per-boss
  // delta. The aggregate delta this module reports (meanDeltaTeamDps below)
  // is a weighted sum Σ wᵦ·δᵦ, so its noise is the per-boss floors combined
  // in QUADRATURE with the SAME normalized weights: sqrt(Σ (wᵦ·floorᵦ)²),
  // floorᵦ = noiseFloorFor(that boss's OWN baseline summary, iterations).
  // Measured on the real 164-species/13-boss sweep this is 20-100x TIGHTER
  // than the old pooled approach (which read 2.67-9.23 across iteration
  // counts, driving every candidate's delta to read as "no measurable
  // change" — see this module's own perBossNoiseFloors below for how tight
  // any one boss's floor actually is).
  const totalTargetWeight = targets.reduce((sum, t) => sum + (t.weight ?? 1), 0);
  const perBossNoiseFloors = baselinePerBoss.map((b) => noiseFloorFor(b.summary, iterations));
  const noiseFloorTeamDps =
    totalTargetWeight > 0
      ? Math.sqrt(
          targets.reduce((sum, t, ti) => {
            const normalizedWeight = (t.weight ?? 1) / totalTargetWeight;
            return sum + (normalizedWeight * perBossNoiseFloors[ti]!) ** 2;
          }, 0),
        )
      : 0;

  // --- Stage 3: candidate generation -----------------------------------------
  interface Draft {
    entry: RosterEntry;
    toLevel: number;
    priced: PricedCandidate;
    touchedTargetIndices: number[];
    rankProxy: number;
  }

  const neverCompetitive: RosterNeverCompetitiveEntry[] = [];
  const drafts: Draft[] = [];

  for (const entry of pool) {
    if (entry.species.isFullyEvolved === false) {
      const evolvesToIds = entry.species.evolvesToIds ?? [];
      neverCompetitive.push({
        entryId: entry.entryId,
        speciesId: entry.species.id,
        speciesName: entry.species.name,
        reason:
          evolvesToIds.length > 0
            ? `Evolve first (into ${evolvesToIds.join(", ")}) before powering up — evolution costs candy only, preserves level/IVs exactly, and always buys more team DPS per stardust afterward.`
            : "This species has a further evolution on record (though the specific target isn't) — evolve first before powering up.",
        evolvesToIds,
      });
      continue;
    }

    const levelsUnion = new Set<number>();
    for (let ti = 0; ti < targets.length; ti++) {
      const metricsInputs = getMetricsInputs(entry, targets[ti]!, ti);
      for (const lvl of usefulPowerUpLevelsAbove({ ...metricsInputs, table: costTable, fromLevel: entry.level, maxLevel })) {
        levelsUnion.add(lvl);
      }
    }
    const affordableLevels = [...levelsUnion]
      .sort((a, b) => a - b)
      .filter((lvl) => powerUpCost(costTable, entry.level, lvl, entry.costModifiers).stardust <= stardustOnHand);

    if (affordableLevels.length === 0) {
      neverCompetitive.push({
        entryId: entry.entryId,
        speciesId: entry.species.id,
        speciesName: entry.species.name,
        reason: "No affordable power-up level within stardustOnHand (or already at maxLevel).",
      });
      continue;
    }

    let anyTouched = false;
    for (const toLevel of affordableLevels) {
      const priced = priceCandidate(costTable, entry, toLevel, stardustOnHand, candyByFamilyId, rareCandyOnHand, rareCandyXlOnHand);
      const touchedTargetIndices: number[] = [];
      let weightedImpact = 0;

      for (let ti = 0; ti < targets.length; ti++) {
        const target = targets[ti]!;
        const fieldedNow = baselineTeamsByTarget[ti]!.some((e) => e.entryId === entry.entryId);
        const currentScore = getScreenScore(entry, entry.level, target, ti);
        let touched = fieldedNow;
        let estimated = currentScore;

        if (!fieldedNow) {
          estimated = estimateOrMeasureScreenScore(entry, toLevel, target, ti, currentScore);

          const team = baselineTeamsByTarget[ti]!;
          const sixthPlace =
            team.length >= MAX_TEAM_RAID_SLOTS
              ? Math.min(...team.map((e) => scoredAllByTarget[ti]!.find((s) => s.entry.entryId === e.entryId)!.score))
              : -Infinity;
          touched = estimated > sixthPlace;
        }

        if (touched) {
          touchedTargetIndices.push(ti);
          const weight = target.weight ?? 1;
          weightedImpact += weight * Math.max(0, estimated - (fieldedNow ? currentScore : 0));
        }
      }

      anyTouched = anyTouched || touchedTargetIndices.length > 0;
      const rankProxy = (weightedImpact / Math.max(priced.cost.stardust, 1)) * 1000;
      drafts.push({ entry, toLevel, priced, touchedTargetIndices, rankProxy });
    }

    if (!anyTouched) {
      neverCompetitive.push({
        entryId: entry.entryId,
        speciesId: entry.species.id,
        speciesName: entry.species.name,
        reason: "No affordable level makes this entry competitive against any evaluated boss.",
      });
    }
  }

  // DIVERSIFY before the global cap: keep only each pool entry's OWN top
  // `maxLevelsPerEntry` rows (by rankProxy) first, so a maxCandidates cap
  // represents the ROSTER (many distinct species) rather than a few entries'
  // dense level ladders — see RosterPlannerInputs.maxLevelsPerEntry's doc
  // comment for the measured real-sweep symptom this fixes (8 distinct
  // species surviving a 60-candidate cap out of 90 eligible entries).
  const draftsByEntryId = new Map<string, Draft[]>();
  for (const d of drafts) {
    const arr = draftsByEntryId.get(d.entry.entryId);
    if (arr) arr.push(d);
    else draftsByEntryId.set(d.entry.entryId, [d]);
  }
  const diversifiedDrafts: Draft[] = [];
  for (const entryDrafts of draftsByEntryId.values()) {
    const topForEntry = [...entryDrafts].sort((a, b) => b.rankProxy - a.rankProxy).slice(0, maxLevelsPerEntry);
    diversifiedDrafts.push(...topForEntry);
  }

  // Rank the DIVERSIFIED draft set (touched and untouched alike) — an
  // untouched row's rankProxy is exactly 0, so it naturally sinks to the
  // bottom of a large pool's ranking rather than needing separate exclusion,
  // while still surviving into `candidates` on a small pool (see this
  // module's top doc comment / the "changes no team" pinned test).
  const rankedDrafts = [...diversifiedDrafts].sort((a, b) => b.rankProxy - a.rankProxy);
  const capped = rankedDrafts.slice(0, maxCandidates);

  const fieldedEntryIdsAnywhere = new Set(baselineTeamsByTarget.flat().map((e) => e.entryId));
  const benchedDraftByEntry = new Map<string, Draft>();
  for (const d of drafts) {
    if (d.touchedTargetIndices.length === 0) continue;
    if (fieldedEntryIdsAnywhere.has(d.entry.entryId)) continue;
    const existing = benchedDraftByEntry.get(d.entry.entryId);
    if (!existing || d.priced.cost.stardust < existing.priced.cost.stardust) benchedDraftByEntry.set(d.entry.entryId, d);
  }

  const toSimulate = new Map<string, Draft>();
  for (const d of capped) toSimulate.set(`${d.entry.entryId}@${d.toLevel}`, d);
  for (const d of benchedDraftByEntry.values()) toSimulate.set(`${d.entry.entryId}@${d.toLevel}`, d);

  const simulateDraft = (d: Draft): RosterPowerUpCandidate => {
    const perBoss: RosterPerBossImpact[] = targets.map((target, ti) => {
      const baseline = baselinePerBoss[ti]!;
      const baselineTeam = baselineTeamsByTarget[ti]!;
      const fieldedIdx = baselineTeam.findIndex((e) => e.entryId === d.entry.entryId);
      const rankBefore = fieldedIdx >= 0 ? fieldedIdx + 1 : null;

      if (!d.touchedTargetIndices.includes(ti)) {
        return { bossId: target.species.id, bossName: target.species.name, deltaTeamDps: 0, rankBefore, rankAfter: rankBefore, simulated: false };
      }

      let candidateTeam: RosterEntry[];
      if (fieldedIdx >= 0) {
        candidateTeam = baselineTeam.map((e) => (e.entryId === d.entry.entryId ? { ...e, level: d.toLevel } : e));
      } else {
        const currentScore = getScreenScore(d.entry, d.entry.level, target, ti);
        const estimated = estimateOrMeasureScreenScore(d.entry, d.toLevel, target, ti, currentScore);
        const scoredWithout = scoredAllByTarget[ti]!.filter((s) => s.entry.entryId !== d.entry.entryId);
        candidateTeam = selectTeam([...scoredWithout, { entry: { ...d.entry, level: d.toLevel }, score: estimated }]);
      }

      const candidateSummary = runFullRosterCached(candidateTeam, ti, target, evalSeeds, shared, bossHpByTarget[ti]!, teamSummaryCache);
      const deltaTeamDps = candidateSummary.teamDps - baseline.summary.teamDps;
      const rankAfterIdx = candidateTeam.findIndex((e) => e.entryId === d.entry.entryId);
      const rankAfter = rankAfterIdx >= 0 ? rankAfterIdx + 1 : null;

      return { bossId: target.species.id, bossName: target.species.name, deltaTeamDps, rankBefore, rankAfter, simulated: true };
    });

    const meanDeltaTeamDps =
      totalTargetWeight > 0 ? targets.reduce((sum, t, ti) => sum + (t.weight ?? 1) * perBoss[ti]!.deltaTeamDps, 0) / totalTargetWeight : 0;
    const bossesNewlyFielded = perBoss.filter((p) => p.rankBefore === null && p.rankAfter !== null).map((p) => p.bossId);

    // See RosterPowerUpCandidate.bestBossDeltaTeamDps/significantBossCount —
    // the aggregate mean alone manufactures false negatives for a candidate
    // that only helps a small subset of the boss set (this module's top doc
    // comment / CLAUDE.md's "where the ranking flips" thesis).
    let bestBossDeltaTeamDps: number | null = null;
    let bestBossId: string | null = null;
    let significantBossCount = 0;
    for (let ti = 0; ti < targets.length; ti++) {
      const delta = perBoss[ti]!.deltaTeamDps;
      if (bestBossDeltaTeamDps === null || Math.abs(delta) > Math.abs(bestBossDeltaTeamDps)) {
        bestBossDeltaTeamDps = delta;
        bestBossId = targets[ti]!.species.id;
      }
      if (Math.abs(delta) > perBossNoiseFloors[ti]!) significantBossCount++;
    }
    if (bestBossDeltaTeamDps === 0) {
      // Every boss read exactly 0 (an untouched candidate) — no single boss
      // is meaningfully "best," so don't name one.
      bestBossDeltaTeamDps = null;
      bestBossId = null;
    }

    return {
      entryId: d.entry.entryId,
      speciesId: d.entry.species.id,
      speciesName: d.entry.species.name,
      fromLevel: d.entry.level,
      toLevel: d.toLevel,
      cost: d.priced.cost,
      costUnverified: d.priced.costUnverified,
      affordable: d.priced.affordable,
      sharedCandyNeeded: d.priced.sharedCandyNeeded,
      sharedXlCandyNeeded: d.priced.sharedXlCandyNeeded,
      meanDeltaTeamDps,
      bestBossDeltaTeamDps,
      bestBossId,
      significantBossCount,
      perBoss,
      bossesNewlyFielded,
      deltaPer1000Stardust: d.priced.cost.stardust > 0 ? (meanDeltaTeamDps / d.priced.cost.stardust) * 1000 : null,
      deltaPerCandy: d.priced.cost.candy > 0 ? meanDeltaTeamDps / d.priced.cost.candy : null,
      deltaPerXlCandy: d.priced.cost.xlCandy > 0 ? meanDeltaTeamDps / d.priced.cost.xlCandy : null,
      exceedsNoise: Math.abs(meanDeltaTeamDps) > noiseFloorTeamDps || significantBossCount > 0,
    };
  };

  const simulatedByKey = new Map<string, RosterPowerUpCandidate>();
  for (const [key, d] of toSimulate) simulatedByKey.set(key, simulateDraft(d));

  const candidates = capped
    .map((d) => simulatedByKey.get(`${d.entry.entryId}@${d.toLevel}`)!)
    .sort((a, b) => b.meanDeltaTeamDps - a.meanDeltaTeamDps);
  const benchedButPromising = [...benchedDraftByEntry.values()].map((d) => simulatedByKey.get(`${d.entry.entryId}@${d.toLevel}`)!);

  return {
    baselinePerBoss,
    noiseFloorTeamDps,
    iterations,
    screenIterations,
    candidates,
    benchedButPromising,
    neverCompetitive,
  };
}
