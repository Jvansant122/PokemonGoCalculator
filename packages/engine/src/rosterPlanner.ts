import type { DodgeBehavior } from "./breakpoints.js";
import { bossEffectiveHp, bossEffectiveStats, ownBoostMultiplier, resolveMove, runSustainedComparison } from "./comparison.js";
import type { MegaLevel } from "./megaLevel.js";
import {
  RARE_CANDY_TO_CANDY_RATIO,
  RARE_CANDY_XL_TO_XL_CANDY_RATIO,
  noiseFloorFor,
  powerUpCost,
  powerUpLevelMetrics,
  shortfallsForCandidate,
  summarizeResults,
  usefulPowerUpLevelsAbove,
  type PowerUpBudgetResourceShortfall,
  type PowerUpBudgetStopReason,
  type PowerUpCostModifiers,
  type PowerUpCostTable,
  type PowerUpEncounterSummary,
  type PowerUpLevelMetrics,
  type PowerUpLevelMetricsParams,
  type PowerUpResourceCost,
} from "./powerUp.js";
import type { SpeciesReportBossTarget } from "./speciesReport.js";
import { DEFAULT_SWAP_COST_SECONDS, MAX_TEAM_RAID_SLOTS, runTeamRaid, type TeamRaidInputs, type TeamRaidSlotInput } from "./teamRaid.js";
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
 * === A real gap this phase found — RESOLVED 2026-09-10 ======================
 *
 * `SpeciesReportBossTarget.bossMaxHpOverride` (comparison.ts's
 * `bossEffectiveHp` third parameter) lets a historical/archived boss target
 * be simulated at its REAL recorded HP instead of today's tier-derived
 * default — `runSustainedComparison` (Stage 1's screen) has always honored it
 * via `SustainedComparisonInputs.bossMaxHpOverride`. `TeamRaidInputs`
 * (Stage 4) previously had NO equivalent field, so Stage 4's own
 * clear-timer detection (`outcome`/`clearsWithinTimer`/`timeToClearSeconds`)
 * could not honor an override no matter what this module passed in — this
 * module's own `bossHp` (fed into `summarizeResults`'s non-cleared fallback
 * branch) was correct via `bossEffectiveHp(target.species, target.tier,
 * target.bossMaxHpOverride)`, but a run that DID clear still cleared against
 * the WRONG (today's tier) HP internally. `teamRaid.ts` now carries the same
 * `bossMaxHpOverride` hook `SustainedComparisonInputs` already had, and
 * `runFullRosterCached`'s Stage 4 `runTeamRaid` call below passes
 * `target.bossMaxHpOverride` through — this module needed zero other changes
 * to pick it up.
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

/**
 * Governs what counts as a "real effect" at BOTH significance gates this
 * module has — `RosterPowerUpCandidate.exceedsNoise` (the ranked table, via
 * `runRosterPlanner`) and `candidateClearsBudgetFloor` (the committed
 * fixed-budget plan, via `planRosterBudget`). The two gates already shared
 * one documented relationship before this type existed (see
 * `candidateClearsBudgetFloor`'s own doc comment — the budget gate requires a
 * POSITIVE per-boss clearance, never a harm-only one, while the ranked
 * table's abs-based `exceedsNoise` also flags "measurably hurts"); this mode
 * is orthogonal to that distinction and applies identically on top of it in
 * both places.
 *
 * - `"aggregate-or-per-boss"` (ENGINE DEFAULT — see below): a candidate
 *   qualifies if it clears the aggregate (weighted-mean, quadrature-floor)
 *   test OR is individually significant on at least one boss —
 *   `significantBossCount > 0` alone is enough. This is the CURRENT,
 *   pre-existing behavior (fixed 2026-09-09 after a real benched Kyurem
 *   scored +1.29 against one boss out of thirteen and read as a diluted 0.11
 *   averaged across all of them — see this module's top doc comment).
 * - `"aggregate-only"`: a candidate qualifies ONLY by clearing the aggregate
 *   test — a single-boss specialist gain is still computed and reported
 *   (`bestBossDeltaTeamDps`/`bestBossId`/`significantBossCount` are ALWAYS
 *   populated in both modes; this mode changes what QUALIFIES a candidate as
 *   significant, never what's measured or returned) but no longer admits the
 *   candidate into `exceedsNoise`/a committed budget step on that signal
 *   alone.
 *
 * DEFAULTS TO `"aggregate-or-per-boss"` in this engine's own two entry
 * points (`runRosterPlanner`/`planRosterBudget`) — deliberately the CURRENT
 * behavior, not the web UI's chosen default. Every existing caller/test that
 * predates this field gets byte-for-byte unchanged output. `packages/web`'s
 * Power-Up Optimizer defaults its OWN control to `"aggregate-only"` (the
 * user's explicit ask — rank strictly on the cross-boss average, with this as
 * an opt-in) — that default lives entirely in the UI layer, not here.
 */
export type RosterSignificanceMode = "aggregate-only" | "aggregate-or-per-boss";

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
  /**
   * ROSTER-WIDE Mega Level (see megaLevel.ts) — deliberately NOT a per-entry
   * `RosterEntry` field: a real import runs 100-200 entries, and a per-entry
   * Mega Level picker would be unusable at that scale. Applied identically
   * to EVERY entry in the sweep that's actually mega/primal-capable (i.e.
   * `species.boost` is defined) — a non-mega entry is completely unaffected
   * regardless of this setting, via the same comparison.ts
   * resolveCandidateMegaLevel gate every other engine entry point already
   * uses (screenScoreFor's runSustainedComparison call, toSlotInput's
   * TeamRaidSlotInput.megaLevel, and entryBossMetricsInputs' Stage-3 proxy
   * all route through it rather than re-deriving the gate). `undefined`
   * means no Mega Level effect assumed (identical to `"base"`), so every
   * existing caller/share-link that predates this field is byte-for-byte
   * unchanged.
   */
  megaLevel?: MegaLevel;
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
  /** See teamRaid.ts's TeamRaidInputs.swapCostSeconds. Also the denominator term in Stage 1's screen score. Defaults to DEFAULT_SWAP_COST_SECONDS (1.0), same as runTeamRaid itself — the two stay consistent (see screenScoreFor's `?? DEFAULT_SWAP_COST_SECONDS` fallback). */
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
  /** See RosterSignificanceMode. Defaults to "aggregate-or-per-boss" (the pre-existing behavior) — NOT the web UI's chosen default; see that type's own doc comment for why the two defaults deliberately differ. */
  significanceMode?: RosterSignificanceMode;
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
   * `Math.abs(meanDeltaTeamDps) > RosterPlanResult.noiseFloorTeamDps` —
   * always required. Under `RosterPlannerInputs.significanceMode ===
   * "aggregate-or-per-boss"` (the engine default — see
   * `RosterSignificanceMode`'s doc comment), `significantBossCount > 0`
   * ALSO qualifies on its own, so a genuine per-boss gain is never reported
   * as "no measurable change" purely because it got diluted by bosses it
   * doesn't touch. Under `"aggregate-only"`, only the aggregate test above
   * counts — `significantBossCount`/`bestBossDeltaTeamDps` are still
   * computed and returned either way, this field just stops treating a
   * single-boss-only signal as sufficient.
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

/** `megaLevel` is the roster-wide RosterPlannerInputs.megaLevel setting, forwarded unchanged onto TeamRaidSlotInput.megaLevel for every entry — runTeamRaid's own resolveCandidateMegaLevel gate silently no-ops it for an entry whose species has no `.boost`, so this never needs a per-entry check here. */
function toSlotInput(entry: RosterEntry, megaLevel: MegaLevel | undefined): TeamRaidSlotInput {
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

function teamKeyFor(entries: RosterEntry[]): string {
  return entries.map((e) => `${e.entryId}@${e.level}`).join(",");
}

// --- Stage 1: cheap screen ----------------------------------------------------

interface SharedAssumptions {
  dodge: DodgeBehavior;
  dodgeFastAttacks?: boolean;
  /** See RosterPlannerInputs.megaLevel — the same roster-wide value, threaded through screenScoreFor/toSlotInput/entryBossMetricsInputs. */
  megaLevel?: MegaLevel;
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
    candidateMegaLevel: [shared.megaLevel ?? null, null],
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

  const score = result!.meanTotalDamage / (result!.meanSecondsSurvived + (shared.swapCostSeconds ?? DEFAULT_SWAP_COST_SECONDS));
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

/**
 * Module-level composition of proxyDps/estimateScreenScore, taking an
 * explicit `fromLevel` rather than reading `entry.level` — factored out
 * 2026-09-09 so BOTH `runRosterPlanner` (where `fromLevel` is always the
 * entry's own imported level) and `planRosterBudget` (where `fromLevel` is
 * whichever level the greedy search has currently committed the entry to,
 * which can differ from its imported starting level after earlier rounds)
 * share ONE implementation of "estimate this entry's screen score at
 * `toLevel`, falling back to a real measurement when the ratio-scaling proxy
 * isn't sound." See `estimateScreenScore`'s own doc comment for why a raw,
 * un-scaled proxy value must never be substituted on a `null` return —
 * `measureFallback` is exactly that real, cheap, memoized measurement.
 */
function estimateOrMeasureScore(
  metricsInputs: Omit<PowerUpLevelMetricsParams, "level">,
  fromLevel: number,
  toLevel: number,
  currentScore: number,
  measureFallback: () => number,
): number {
  const currentMetrics = powerUpLevelMetrics({ ...metricsInputs, level: fromLevel });
  const newMetrics = powerUpLevelMetrics({ ...metricsInputs, level: toLevel });
  const currentProxy = proxyDps(currentMetrics, metricsInputs.fastMove, metricsInputs.chargedMove);
  const newProxy = proxyDps(newMetrics, metricsInputs.fastMove, metricsInputs.chargedMove);
  const scaled = estimateScreenScore(currentScore, currentProxy, newProxy);
  return scaled ?? measureFallback();
}

/** Everything powerUpLevelMetrics/usefulPowerUpLevelsAbove need for one (entry, boss) pair, built once and cached (see getMetricsInputs) since only `level` varies call to call. `megaLevel` is the roster-wide RosterPlannerInputs.megaLevel setting — forwarded onto PowerUpLevelMetricsParams.megaLevel unchanged, so the Stage-3 proxy (proxyDps, built from this function's output) stays on the same effective stats/move power as Stage 4's actual runTeamRaid simulation. */
function entryBossMetricsInputs(
  entry: RosterEntry,
  target: WeightedRaidTarget,
  weather: WeatherCondition,
  megaLevel: MegaLevel | undefined,
): Omit<PowerUpLevelMetricsParams, "level"> {
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
    megaLevel,
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
  fromLevel: number,
  toLevel: number,
  stardustOnHand: number,
  candyByFamilyId: Record<string, { candy: number; xlCandy: number } | undefined>,
  rareCandyOnHand: number,
  rareCandyXlOnHand: number,
): PricedCandidate {
  const cost = powerUpCost(costTable, fromLevel, toLevel, entry.costModifiers);
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

  const slots = teamEntries.map((entry) => toSlotInput(entry, shared.megaLevel));
  const first = teamEntries[0]!;
  const results = seeds.map((s) =>
    runTeamRaid({
      slots,
      boss: target.species,
      bossRaidTier: target.tier,
      // Closes the gap this module's own top doc comment used to flag (see
      // "A real gap this phase found, NOT fixed here" above, now resolved
      // 2026-09-10): teamRaid.ts's TeamRaidInputs finally has the same
      // bossMaxHpOverride hook SustainedComparisonInputs (Stage 1's screen,
      // wired at screenScoreFor above) already had, so Stage 4's own
      // clear-timer detection now honors an archived boss's real recorded HP
      // too, not just the `bossHp` this function receives for the
      // non-cleared fallback branch below.
      bossMaxHpOverride: target.bossMaxHpOverride,
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
    // Engine default is the PRE-EXISTING behavior, deliberately not the web
    // UI's chosen default — see RosterSignificanceMode's doc comment.
    significanceMode = "aggregate-or-per-boss",
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
    megaLevel: rest.megaLevel,
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
      v = entryBossMetricsInputs(entry, target, weather, shared.megaLevel);
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
  ): number =>
    estimateOrMeasureScore(getMetricsInputs(entry, target, targetIndex), entry.level, toLevel, currentScore, () =>
      getScreenScore(entry, toLevel, target, targetIndex),
    );

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
      const priced = priceCandidate(costTable, entry, entry.level, toLevel, stardustOnHand, candyByFamilyId, rareCandyOnHand, rareCandyXlOnHand);
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
      exceedsNoise:
        Math.abs(meanDeltaTeamDps) > noiseFloorTeamDps || (significanceMode === "aggregate-or-per-boss" && significantBossCount > 0),
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

// =============================================================================
// === planRosterBudget — Phase 4 of PLAN_multi_raid_roster_optimizer.md =====
// =============================================================================
//
// `runRosterPlanner` above answers "what's the best power-up, priced as if it
// were the only thing you buy?" (§4.3's ranked table). `planRosterBudget`
// answers the DIFFERENT question: "here is my stardust, my per-family candy,
// and my two shared Rare Candy pools — what SET of power-ups should I
// actually make?" — a joint allocation, not a ranking of independent single
// steps. This is `powerUp.ts`'s `planPowerUpBudget` generalized from "6 fixed
// slots vs. one boss" to "N pool entries vs. M weighted bosses" (plan §3.4,
// §3.6, §4.3's "Fixed-budget planner" paragraph, §5 Phase 4) — same greedy
// round-loop shape, same three hard-won properties preserved verbatim:
//
//   1. THE NOISE FLOOR IS PER-ROUND, NOT FIXED. Recomputed after every
//      committed step from whichever TOUCHED boss(es) that step actually
//      changed — see `perBossNoiseFloors`/`aggregateNoiseFloorFrom` below.
//      Untouched bosses' own floors are left exactly as they were (their
//      team never changed, so their variance didn't either).
//   2. `bestBlockedCandidate` — "blocked, not done." A bounded (NOT
//      exhaustive), one-time post-search pass over each eligible entry's
//      useful-but-currently-unaffordable levels, judged against the FINAL
//      floor. `null` means genuine convergence; non-null names a real gain
//      that exists but couldn't be committed. Same distinction, same
//      one-time-after-the-loop timing as `planPowerUpBudget`'s.
//   3. MULTI-LEVEL JUMPS, NOT CHAINS. Every useful level is offered as its
//      own direct jump from an entry's CURRENTLY-PLANNED level (never a
//      forced chain through intermediate half-steps) — see
//      `PowerUpBudgetInputs.candidateLevelsPerSlotPerRound`'s REGRESSION
//      HISTORY doc comment in powerUp.ts for the real bug this guards
//      against; `candidateLevelsPerEntryPerRound` below is the same knob,
//      defaulting the same way (unbounded).
//
// TWO THINGS DELIBERATELY DIFFER FROM THE SINGLE-BOSS ANCESTOR (both
// documented in the plan because Phase 2 got them wrong first, and this
// function reuses Phase 2's ALREADY-FIXED formulas rather than re-deriving
// either):
//
//   - THE AGGREGATE NOISE FLOOR COMBINES PER-BOSS FLOORS IN QUADRATURE —
//     `sqrt(sum((normalizedWeight * thatBoss'sOwnFloor)^2))` — never by
//     pooling raw `teamDpsPerSeed` samples across bosses (which measures
//     BETWEEN-BOSS spread, not noise, and made Phase 2's first build report
//     0 of 60 candidates significant at every iteration count — see
//     `runRosterPlanner`'s own top doc comment for the measured numbers).
//     `aggregateNoiseFloorFrom` below is the SAME formula `runRosterPlanner`
//     already uses, just recomputed per round instead of once.
//   - ACCEPTANCE IS AGGREGATE OR PER-BOSS, never the diluted mean alone —
//     same reasoning as `RosterPowerUpCandidate.exceedsNoise`'s doc comment
//     (a benched entry's real gain against ONE boss can read as "no
//     measurable change" once averaged over a dozen untouched ones). See
//     `candidateClearsBudgetFloor`'s own doc comment for one deliberate
//     REFINEMENT on top of `exceedsNoise`'s literal OR-of-absolute-values
//     rule: this function's COMMIT gate (unlike the ranked table's read-only
//     `exceedsNoise` flag) requires the clearing delta to be POSITIVE, not
//     merely large in magnitude — a budget planner should never spend real
//     stardust/candy to knowingly commit a change whose own measured effect
//     is a wash or a loss just because it also happens to swing some OTHER
//     boss's result by a lot in either direction.
//
// COST CONTROL (plan's "Cost" section, target < ~15s for a realistic
// 164-entry x 13-boss pool): unlike `runRosterPlanner`'s ONE sweep, a greedy
// plan is MANY sweeps — but each round's own cost is kept far below a full
// Stage-1-through-4 sweep by exploiting two invariants specific to this
// domain:
//   - Stage 1 screen scores are a PURE function of (entry, level, boss) —
//     independent of every OTHER entry's level — so `screenScoreCache`
//     persists across rounds for free; only the ONE entryId committed each
//     round ever needs a fresh score at its new level.
//   - A committed step can only change team COMPOSITION on a boss where the
//     stepped entry is ALREADY fielded or NEWLY enters (exactly the
//     `touchedTargetIndices` set `evaluateCandidate` below already computes
//     to price the step) — every OTHER boss's team, and therefore its own
//     `runFullRosterCached` result and noise floor, is provably unaffected
//     and is left untouched rather than re-simulated.
// So a round's real simulation cost is bounded by `maxCandidatesPerRound` x
// (candidates' own touched-boss count) x `iterations`, not by
// `pool.length x targets.length`. See this engine-developer's final report
// for the measured wall-clock on a real 164x13 sweep.

/**
 * Every real per-boss effect of ONE candidate power-up, evaluated against
 * whatever `currentTeamsByTarget`/`currentTeamSummaryByTarget` are RIGHT NOW
 * (i.e. relative to the roster's currently-planned state, not the original
 * imported baseline) — the budget-loop analogue of `runRosterPlanner`'s
 * per-draft `perBoss` computation, but re-evaluated fresh every time it's
 * called (a round considers many candidates; only the WINNING one is ever
 * committed) rather than once per (entry, level) pair.
 *
 * Exported bare (no index.ts re-export, same convention as powerUp.ts's
 * `summarizeResults`/`noiseFloorFor`) purely so test files can construct
 * synthetic eval results directly against `candidateClearsBudgetFloor`
 * below, without needing to engineer a real simulated scenario that happens
 * to produce a specific significant-harm-only shape.
 */
export interface RosterBudgetCandidateEval {
  perBoss: RosterPerBossImpact[];
  meanDeltaTeamDps: number;
  bestBossDeltaTeamDps: number | null;
  bestBossId: string | null;
  significantBossCount: number;
  touchedTargetIndices: number[];
}

/**
 * Whether a candidate clears the bar this function's greedy search commits
 * against — "aggregate OR per-boss," per this module's top doc comment.
 *
 * ONE DELIBERATE REFINEMENT over `RosterPowerUpCandidate.exceedsNoise`'s
 * literal rule (which this function's OWN `RosterBudgetStep.significantBossCount`
 * still mirrors exactly, for reporting/auditing consistency with the ranked
 * table): `exceedsNoise` uses `Math.abs(delta) > floor` on BOTH the
 * aggregate mean and every per-boss delta, so it also flags a candidate that
 * MEASURABLY HURTS the team (useful there — "don't power this up, it hurts"
 * is a real, useful answer for a READ-ONLY ranked row). A budget planner
 * that's about to actually SPEND resources must not commit a step on the
 * strength of a large-magnitude HARM on one boss alone — so this test
 * requires the aggregate mean OR at least one per-boss delta to be
 * POSITIVE and beyond its floor, not merely large. Every POSITIVE per-boss
 * clearance here is automatically also counted by the abs-based
 * `significantBossCount` (a positive delta greater than a non-negative floor
 * is trivially also greater in absolute value), so the two never disagree
 * about a genuine positive gain — this refinement only ever excludes a
 * candidate whose ONLY qualifying signal was a significant HARM, never one
 * with a real, exploitable gain.
 *
 * `significanceMode` (see `RosterSignificanceMode`) governs whether the
 * per-boss branch below is even consulted at all — under `"aggregate-only"`
 * this function reduces to the aggregate test alone, mirroring exactly how
 * `RosterPowerUpCandidate.exceedsNoise` narrows under the same mode (see that
 * field's doc comment). The two gates must never disagree about what counts
 * as significant, so any future change to one of these tests must be mirrored
 * in the other.
 *
 * Exported bare — see `RosterBudgetCandidateEval`'s doc comment.
 */
export function candidateClearsBudgetFloor(
  evalResult: RosterBudgetCandidateEval,
  perBossFloors: number[],
  aggregateFloor: number,
  significanceMode: RosterSignificanceMode,
): boolean {
  if (evalResult.meanDeltaTeamDps > aggregateFloor) return true;
  if (significanceMode === "aggregate-only") return false;
  return evalResult.perBoss.some((p, ti) => p.deltaTeamDps > perBossFloors[ti]!);
}

export interface RosterBudgetInputs extends Omit<RosterPlannerInputs, "maxCandidates" | "maxLevelsPerEntry"> {
  /**
   * Pure engineering safety cap on greedy rounds (each round commits at most
   * one step) — same role as `powerUp.ts`'s `PowerUpBudgetInputs.maxRounds`/
   * `teamRaid.ts`'s `MAX_TEAM_RAID_CYCLES`. Defaults to 200. Unlike the
   * 6-slot ancestor (worst case ~98 half-levels x 6 slots, but almost always
   * stopped by "max-level-reached"/"budget-exhausted" long before that), a
   * 100-200 entry pool has vastly more DISTINCT entries that could each want
   * one committed step, so this default is higher — see this module's
   * "Cost control" doc comment above for why each round stays cheap enough
   * that raising this is safe.
   */
  maxRounds?: number;
  /**
   * How many of ONE eligible entry's own useful-level candidates survive
   * into a round's global ranking — see this module's top doc comment
   * ("Cost control") for why this is a DELIBERATE DEPARTURE from
   * `PowerUpBudgetInputs.candidateLevelsPerSlotPerRound`'s semantics, not
   * just a renamed reuse:
   *
   * The 6-slot ancestor selects a round's candidates via ROUND-ROBIN BY
   * DEPTH (every slot's nearest candidate first, then every slot's
   * 2nd-nearest, etc.) — correct at 6 slots, where even a 60-candidate cap
   * reaches 10 levels deep per slot. VERIFIED EMPIRICALLY while building
   * this function (real 164-entry pool, real synced species/bosses): the
   * SAME mechanism at pool scale means depth 0 ALONE (every entry's own
   * single nearest level) already exceeds a 60-candidate cap, so NO entry
   * ever gets a look at its 2nd-nearest level, let alone a genuine
   * multi-level jump — a real Gengar 30 -> 49 jump (the single most
   * valuable candidate in that run) was silently unreachable this way.
   *
   * This field instead bounds how many of an entry's own candidates are
   * kept after ranking them by a CHEAP, PURE-ARITHMETIC proxy (no
   * simulation — see `proxyDps`/`cachedProxyDps`), before every surviving
   * candidate across the WHOLE pool competes in ONE global top-`maxCandidatesPerRound`
   * cut (also by that same proxy) for the round's REAL simulated
   * evaluation. A genuinely valuable deep jump (a big stat/damage
   * improvement) scores highly on this proxy and is therefore likely to
   * survive BOTH cuts, unlike a nearest-first depth cut which excludes it
   * purely by its POSITION in the level list, never its actual value.
   * Defaults to 5 (a per-entry cap mainly to bound the cheap-proxy pass's
   * own cost on an entry with many affordable levels — the global cap is
   * what actually governs round quality/diversity on a large pool).
   */
  candidateLevelsPerEntryPerRound?: number;
  /**
   * Hard cap on how many candidates get a REAL (simulated) evaluation in a
   * single round, across every eligible pool entry combined, after the
   * cheap-proxy ranking above — see `candidateLevelsPerEntryPerRound`'s doc
   * comment for why this is proxy-ranked rather than round-robin-by-depth
   * at this scale. Defaults to 60 (same default as the single-boss
   * ancestor's `maxCandidatesPerRound`).
   */
  maxCandidatesPerRound?: number;
  /**
   * Bounds the post-search "best blocked candidate" pass, per eligible
   * entry — same cheap-proxy-ranked selection as the main round loop (see
   * `candidateLevelsPerEntryPerRound`'s doc comment), applied to each
   * entry's UNAFFORDABLE levels instead of its affordable ones. Defaults
   * to 8.
   */
  blockedCandidateLevelsPerEntry?: number;
  /** See `PowerUpBudgetInputs.maxBlockedCandidatesToCheck`'s doc comment — same role, proxy-ranked selection instead of round-robin-by-depth. Defaults to 60. */
  maxBlockedCandidatesToCheck?: number;
}

export interface RosterBudgetStep {
  entryId: string;
  speciesId: string;
  speciesName: string;
  fromLevel: number;
  toLevel: number;
  /** This step's total resource cost (fromLevel -> toLevel), same shape as powerUpCost's return. */
  cost: PowerUpResourceCost;
  /** How much of cost.candy was drawn from this entry's resolved candy-FAMILY pool (spent first, shared across every OTHER pool entry of that family — §3.4) — ownCandySpent + sharedCandySpent === cost.candy. */
  ownCandySpent: number;
  /** How much of cost.candy was drawn from the shared rareCandyOnHand pool, only after the family's own candy ran out. */
  sharedCandySpent: number;
  /** Same own-first breakdown as ownCandySpent, for cost.xlCandy against this entry's family's own xlCandy. */
  ownXlCandySpent: number;
  /** Same own-first breakdown as sharedCandySpent, for cost.xlCandy against the shared rareCandyXlOnHand pool. */
  sharedXlCandySpent: number;
  /** Weighted mean across EVERY target (untouched bosses correctly pull this toward 0) — this step's marginal team-DPS gain, real full-team simulations before/after, never an estimate. */
  meanDeltaTeamDps: number;
  /** See RosterPowerUpCandidate.bestBossDeltaTeamDps — the single largest-magnitude perBoss delta this step produced, signed. Null only when every perBoss delta is exactly 0. */
  bestBossDeltaTeamDps: number | null;
  /** See RosterPowerUpCandidate.bestBossId. Null exactly when bestBossDeltaTeamDps is null. */
  bestBossId: string | null;
  /** Count of perBoss entries individually clearing THAT boss's own floor (Math.abs test — same convention as RosterPowerUpCandidate.significantBossCount, kept abs-based here for reporting/auditing consistency even though the COMMIT decision itself required a positive clearance — see candidateClearsBudgetFloor's doc comment). */
  significantBossCount: number;
  /** Whether meanDeltaTeamDps alone (the AGGREGATE test) cleared noiseFloorTeamDps at the time this step was judged — false is possible even for a committed step, when a per-boss clearance alone is what qualified it (see candidateClearsBudgetFloor). Recorded per-step per this module's "record on each step which test it passed" requirement. */
  clearsAggregateFloor: boolean;
  /** The AGGREGATE noise floor THIS step was actually judged against (i.e. RosterBudgetPlan.noiseFloorTeamDps's value at the moment this round ran, BEFORE the post-commit recompute) — see this module's top doc comment, "THE NOISE FLOOR IS PER-ROUND, NOT FIXED." A later step can be judged against a meaningfully different floor than an earlier one. */
  noiseFloorTeamDps: number;
  /** Boss ids where this entry wasn't on that boss's team immediately before this step but is on it immediately after — the same "headline" surface as RosterPowerUpCandidate.bossesNewlyFielded, per-step instead of per-ranked-row. */
  bossesNewlyFielded: string[];
  /** The full per-boss breakdown behind meanDeltaTeamDps — one entry per RosterBudgetInputs.targets, in order, never collapsed away (CLAUDE.md's "where the ranking flips" thesis applies to a committed plan too, not just the ranked table). */
  perBoss: RosterPerBossImpact[];
}

export interface RosterBudgetFinalLevel {
  entryId: string;
  speciesId: string;
  speciesName: string;
  /** This entry's starting (imported) level — equals toLevel if the plan never touched this entry. */
  fromLevel: number;
  /** This entry's level at the end of the plan. */
  toLevel: number;
}

export interface RosterBudgetResourceLedgerEntry {
  spent: number;
  remaining: number;
}

/** One candy-FAMILY's own ledger — see RosterBudgetLedger.candyByFamilyId. */
export interface RosterBudgetCandyFamilyLedgerEntry {
  candy: RosterBudgetResourceLedgerEntry;
  xlCandy: RosterBudgetResourceLedgerEntry;
}

export interface RosterBudgetLedger {
  stardust: RosterBudgetResourceLedgerEntry;
  /**
   * Keyed by `candyFamilyId` (never by species id or entryId — §3.4), one
   * entry per family that at least one ELIGIBLE pool entry resolved to AND
   * that had a KNOWN starting pool in `RosterPlannerInputs.candyByFamilyId`
   * (an unknown-candy family never enters this ledger at all — its entries
   * are reported in `RosterBudgetPlan.excludedEntries` instead, never
   * silently treated as a 0-candy family that happens to spend nothing).
   */
  candyByFamilyId: Record<string, RosterBudgetCandyFamilyLedgerEntry>;
  /** The shared rareCandyOnHand pool. */
  sharedRareCandy: RosterBudgetResourceLedgerEntry;
  /** The shared rareCandyXlOnHand pool. */
  sharedRareCandyXl: RosterBudgetResourceLedgerEntry;
}

/**
 * The best (highest meanDeltaTeamDps) USEFUL level, for any eligible pool
 * entry, that cleared the FINAL noise floor (candidateClearsBudgetFloor
 * against RosterBudgetPlan's own final aggregate/per-boss floors) but could
 * not be committed because it wasn't affordable against what was left of the
 * budget when the search stopped — see RosterBudgetPlan.bestBlockedCandidate's
 * doc comment for the "blocked, not done" distinction, and
 * PowerUpBudgetBlockedCandidate (powerUp.ts) for the single-boss ancestor
 * this generalizes.
 */
export interface RosterBudgetBlockedCandidate {
  entryId: string;
  speciesId: string;
  speciesName: string;
  /** This entry's level at the point the search stopped (== its starting level if the plan never touched this entry). */
  fromLevel: number;
  toLevel: number;
  cost: PowerUpResourceCost;
  meanDeltaTeamDps: number;
  bestBossDeltaTeamDps: number | null;
  bestBossId: string | null;
  /** Every resource this candidate is short on right now, against what's left of the budget when the search stopped — see powerUp.ts's shortfallsForCandidate (reused verbatim, not re-derived). Never empty. */
  shortfalls: PowerUpBudgetResourceShortfall[];
}

export interface RosterBudgetPlan {
  /** The plan, in the order the greedy search chose each step. */
  steps: RosterBudgetStep[];
  /** One entry per ELIGIBLE pool entry (RosterBudgetPlan.excludedEntries covers the rest) — unchanged entries included, toLevel === fromLevel. */
  finalLevels: RosterBudgetFinalLevel[];
  /** The do-nothing state (every pool entry, eligible or not, at its imported level) and its measured encounter summary, for every boss — same shape as RosterPlanResult.baselinePerBoss. */
  baselinePerBoss: RosterBaselineBossSummary[];
  /** The FINISHED plan's state and measured encounter summary, for every boss — an accumulated real simulation (memoized by team composition throughout the search), not a fresh dedicated re-run, since every touched boss's summary was already a real simulation of its exact final team/seed set (see this module's top doc comment, "Cost control"). */
  finalPerBoss: RosterBaselineBossSummary[];
  /** The iteration count actually used for Stage 4 paired evaluation (baseline AND every step). */
  iterations: number;
  /** The iteration count actually used for Stage 1's screen. */
  screenIterations: number;
  /**
   * The FINAL aggregate noise floor — the value in effect when the round
   * loop actually stopped (quadrature-combined per-boss floors, same formula
   * as RosterPlanResult.noiseFloorTeamDps — see this module's top doc
   * comment). NOT one fixed floor that governed the whole plan — see
   * RosterBudgetStep.noiseFloorTeamDps for auditing a specific step's own
   * acceptance.
   */
  noiseFloorTeamDps: number;
  /** Total spend and what's left, broken out per resource — stardust and every candy pool kept strictly separate, never blended into one number (CLAUDE.md standing decision). */
  ledger: RosterBudgetLedger;
  /** Why the search stopped — see powerUp.ts's PowerUpBudgetStopReason (reused, same four reasons, same meanings). */
  stopReason: PowerUpBudgetStopReason;
  /** "You're done" vs. "you're blocked" — see this interface's own top-level doc comment and RosterBudgetBlockedCandidate. Null means genuine convergence; non-null means a real, unaffordable gain exists. */
  bestBlockedCandidate: RosterBudgetBlockedCandidate | null;
  /**
   * Pool entries excluded from candidate generation entirely (§3.4/§3.6),
   * reported with why rather than silently dropped — two cases:
   * `isFullyEvolved === false` ("evolve first," same message/evolvesToIds
   * convention as RosterPlanResult.neverCompetitive), and an entry whose
   * resolved candy-family pool is UNKNOWN (either no family resolves at
   * all — an unmapped mega/primal entry missing its required
   * RosterEntry.candyFamilyId override — or the family resolves but has no
   * entry in RosterPlannerInputs.candyByFamilyId). These entries can still
   * be FIELDED on a baseline/final team (team selection always considers
   * the FULL pool); they just never become power-up candidates here.
   */
  excludedEntries: RosterNeverCompetitiveEntry[];
}

/**
 * A fixed-budget, whole-roster-x-boss-set power-up planner — see this
 * module's top doc comment (search "planRosterBudget") for the algorithm,
 * the three properties preserved from `planPowerUpBudget`, and the two
 * deliberate differences from it. A NEW export alongside `runRosterPlanner`
 * (completely unchanged by this addition).
 */
export function planRosterBudget(inputs: RosterBudgetInputs): RosterBudgetPlan {
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
    seed = 1,
    weather = "none",
    maxRounds = 200,
    candidateLevelsPerEntryPerRound = 5,
    maxCandidatesPerRound = 60,
    blockedCandidateLevelsPerEntry = 8,
    maxBlockedCandidatesToCheck = 60,
    // Engine default is the PRE-EXISTING behavior, deliberately not the web
    // UI's chosen default — see RosterSignificanceMode's doc comment. Must
    // stay in lockstep with runRosterPlanner's own default so the ranked
    // table and the committed budget plan never disagree about what counts
    // as significant.
    significanceMode = "aggregate-or-per-boss",
    ...rest
  } = inputs;

  if (pool.length === 0) throw new Error("planRosterBudget requires a non-empty pool.");
  if (targets.length === 0) throw new Error("planRosterBudget requires at least one raid target.");

  const seenEntryIds = new Set<string>();
  for (const entry of pool) {
    if (seenEntryIds.has(entry.entryId)) {
      throw new Error(
        `Duplicate RosterEntry.entryId "${entry.entryId}" — every pool entry needs a unique id even when the same species appears more than once.`,
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
    megaLevel: rest.megaLevel,
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

  // Caches persist across the WHOLE search (every round), not just one call —
  // see this module's top doc comment, "Cost control": both caches are keyed
  // on values that never change retroactively (a screen score is a pure
  // function of (entry, level, boss); a team summary is a pure function of
  // (team composition incl. every member's CURRENT level, boss, seeds)), so
  // reuse across rounds is always correct, never stale.
  const screenScoreCache = new Map<string, number>();
  const metricsInputsCache = new Map<string, Omit<PowerUpLevelMetricsParams, "level">>();
  const teamSummaryCache = new Map<string, PowerUpEncounterSummary>();

  const getMetricsInputs = (entry: RosterEntry, target: WeightedRaidTarget, targetIndex: number): Omit<PowerUpLevelMetricsParams, "level"> => {
    const key = `${entry.entryId}|${targetIndex}`;
    let v = metricsInputsCache.get(key);
    if (!v) {
      v = entryBossMetricsInputs(entry, target, weather, shared.megaLevel);
      metricsInputsCache.set(key, v);
    }
    return v;
  };

  const getScreenScore = (entry: RosterEntry, level: number, target: WeightedRaidTarget, targetIndex: number): number =>
    screenScoreFor(entry, level, target, targetIndex, shared, screenIterations, screenScoreCache);

  // --- Exclude entries from candidate generation (§3.4/§3.6) — team
  // selection below still sees the FULL pool; only Stage-3-style candidate
  // generation is restricted to what's left. ------------------------------
  const excludedEntries: RosterNeverCompetitiveEntry[] = [];
  const eligiblePool: RosterEntry[] = [];
  const entryFamilyId = new Map<string, string>();
  const remainingCandyByFamilyId = new Map<string, { candy: number; xlCandy: number }>();

  for (const entry of pool) {
    if (entry.species.isFullyEvolved === false) {
      const evolvesToIds = entry.species.evolvesToIds ?? [];
      excludedEntries.push({
        entryId: entry.entryId,
        speciesId: entry.species.id,
        speciesName: entry.species.name,
        reason:
          evolvesToIds.length > 0
            ? `Evolve first (into ${evolvesToIds.join(", ")}) before budgeting for a power-up — evolution costs candy only, preserves level/IVs exactly, and always buys more team DPS per stardust afterward.`
            : "This species has a further evolution on record (though the specific target isn't) — evolve first before budgeting for a power-up.",
        evolvesToIds,
      });
      continue;
    }

    const familyId = resolveCandyFamilyId(entry);
    const familyPool = familyId !== undefined ? candyByFamilyId[familyId] : undefined;
    if (familyId === undefined || familyPool === undefined) {
      excludedEntries.push({
        entryId: entry.entryId,
        speciesId: entry.species.id,
        speciesName: entry.species.name,
        reason:
          familyId === undefined
            ? "No candy-family pool could be resolved for this entry (a mega/primal entry needs an explicit RosterEntry.candyFamilyId naming its BASE species' family) — the fixed-budget plan needs a real candy count, unlike the un-budgeted ranked table."
            : `Candy on hand for family "${familyId}" is unknown — fill it in to include this entry in the fixed-budget plan (it still ranks normally, as costUnverified, in runRosterPlanner's un-budgeted table).`,
      });
      continue;
    }

    eligiblePool.push(entry);
    entryFamilyId.set(entry.entryId, familyId);
    if (!remainingCandyByFamilyId.has(familyId)) {
      remainingCandyByFamilyId.set(familyId, { candy: familyPool.candy, xlCandy: familyPool.xlCandy });
    }
  }
  // Snapshot BEFORE any round mutates the pools above, for the final ledger's
  // per-family "spent" accounting (spent = initial - remaining).
  const initialCandyByFamilyId = new Map<string, { candy: number; xlCandy: number }>(
    [...remainingCandyByFamilyId].map(([familyId, v]) => [familyId, { ...v }]),
  );

  // --- Stage 1 + 2 (once): baseline screen scores & team selection, over
  // the FULL pool — mirrors runRosterPlanner exactly, except the resulting
  // `scoredAllByTarget`/`currentTeamsByTarget` are MUTATED in place as the
  // search commits steps, rather than staying fixed for one call. ----------
  const bossHpByTarget = targets.map((t) => bossEffectiveHp(t.species, t.tier, t.bossMaxHpOverride));

  const scoredAllByTarget: { entry: RosterEntry; score: number }[][] = targets.map((target, ti) =>
    pool.map((entry) => ({ entry, score: getScreenScore(entry, entry.level, target, ti) })),
  );
  const currentTeamsByTarget: RosterEntry[][] = scoredAllByTarget.map((scored) => selectTeam(scored));

  const currentLevelByEntryId = new Map<string, number>(pool.map((e) => [e.entryId, e.level]));
  const liveEntry = (entry: RosterEntry): RosterEntry => {
    const level = currentLevelByEntryId.get(entry.entryId)!;
    return level === entry.level ? entry : { ...entry, level };
  };

  const currentTeamSummaryByTarget: PowerUpEncounterSummary[] = targets.map((target, ti) =>
    runFullRosterCached(currentTeamsByTarget[ti]!.map(liveEntry), ti, target, evalSeeds, shared, bossHpByTarget[ti]!, teamSummaryCache),
  );

  const baselinePerBoss: RosterBaselineBossSummary[] = targets.map((target, ti) => ({
    bossId: target.species.id,
    bossName: target.species.name,
    team: currentTeamsByTarget[ti]!.map((e) => e.entryId),
    summary: currentTeamSummaryByTarget[ti]!,
  }));

  const totalTargetWeight = targets.reduce((sum, t) => sum + (t.weight ?? 1), 0);
  /** Same quadrature formula as RosterPlanResult.noiseFloorTeamDps (see runRosterPlanner's top doc comment) — recomputed per round from CURRENT per-boss floors instead of once. */
  const aggregateNoiseFloorFrom = (perBossFloors: number[]): number =>
    totalTargetWeight > 0
      ? Math.sqrt(
          targets.reduce((sum, t, ti) => {
            const normalizedWeight = (t.weight ?? 1) / totalTargetWeight;
            return sum + (normalizedWeight * perBossFloors[ti]!) ** 2;
          }, 0),
        )
      : 0;

  const perBossNoiseFloors = currentTeamSummaryByTarget.map((s) => noiseFloorFor(s, iterations));
  let aggregateNoiseFloor = aggregateNoiseFloorFrom(perBossNoiseFloors);

  // --- Candidate evaluation (Stage 3+4, re-run per round-candidate) -------
  const usefulLevelsForEntry = (entry: RosterEntry, fromLevel: number): number[] => {
    if (fromLevel >= maxLevel) return [];
    const levelsUnion = new Set<number>();
    for (let ti = 0; ti < targets.length; ti++) {
      const metricsInputs = getMetricsInputs(entry, targets[ti]!, ti);
      for (const lvl of usefulPowerUpLevelsAbove({ ...metricsInputs, table: costTable, fromLevel, maxLevel })) levelsUnion.add(lvl);
    }
    return [...levelsUnion].sort((a, b) => a - b);
  };

  // --- Cheap, pure-arithmetic candidate ranking (no simulation) — see
  // RosterBudgetInputs.candidateLevelsPerEntryPerRound's doc comment for WHY
  // this replaces round-robin-by-depth at pool scale. `proxyDps` is a pure
  // function of (entry, level, boss), so caching across the WHOLE search
  // (not just one round) is always correct, exactly like screenScoreCache
  // above. --------------------------------------------------------------
  const proxyCache = new Map<string, number>();
  const cachedProxyDps = (entry: RosterEntry, level: number, target: WeightedRaidTarget, targetIndex: number): number => {
    const key = `${entry.entryId}|${level}|${targetIndex}`;
    let v = proxyCache.get(key);
    if (v === undefined) {
      const metricsInputs = getMetricsInputs(entry, target, targetIndex);
      const metrics = powerUpLevelMetrics({ ...metricsInputs, level });
      v = proxyDps(metrics, metricsInputs.fastMove, metricsInputs.chargedMove);
      proxyCache.set(key, v);
    }
    return v;
  };

  /**
   * Weighted-summed ABSOLUTE improvement across every target — ranking-only,
   * never compared against a noise floor or surfaced in any output.
   * Anchored against each target's REAL (already-cached, or cheaply
   * one-off-simulated) current screen score via `estimateScreenScore`'s SAME
   * scaling technique `evaluateCandidate`'s own touched-determination uses
   * (see runRosterPlanner's top doc comment for the full reasoning) —
   * NOT a raw, un-anchored `proxyDps` delta. This matters specifically for
   * an ALREADY-FIELDED, strong entry: its raw proxyDps delta for one more
   * useful level is often SMALL relative to a weak/benched entry's own raw
   * delta (which can look proportionally huge purely from starting near
   * zero), so ranking on the raw delta alone systematically buried a
   * real, high-value fielded-entry jump under many low-value benched-entry
   * candidates — verified empirically on a real 164-species/13-boss sweep
   * (a genuine ~1.6 team-DPS Gengar jump never even reached a real
   * simulation) while building this function.
   *
   * DELIBERATELY NOT divided by cost (unlike the round-loop's OWN knapsack
   * `score`, which IS cost-aware — see the round loop below): the noise
   * floor a candidate must clear to be COMMITTABLE is an ABSOLUTE bar, not a
   * per-stardust one, so a "value per stardust" pre-filter systematically
   * excludes exactly the large, expensive, multi-level jumps this whole
   * design exists to surface — a SECOND real bug found empirically while
   * building this function (a genuine ~1.8 team-DPS Entei 29 -> 50 jump
   * never even reached a real simulation once ranked by per-stardust
   * efficiency, because many cheap, tiny, low-absolute-value candidates
   * scored "more efficient" per stardust despite being individually
   * worthless against the floor). `getScreenScore` at `fromLevel` is a
   * cache hit for the common case (an entry not yet committed this search,
   * or committed on THIS target already); a fresh (cheap, single)
   * simulation only when an entry was committed on some OTHER target and
   * this target's score at its new level was never queried before — bounded
   * by committed-steps x targets.length across the whole search, not by
   * candidate count.
   */
  const cheapRankProxy = (entry: RosterEntry, fromLevel: number, toLevel: number): number => {
    let improvement = 0;
    for (let ti = 0; ti < targets.length; ti++) {
      const target = targets[ti]!;
      const currentProxy = cachedProxyDps(entry, fromLevel, target, ti);
      const newProxy = cachedProxyDps(entry, toLevel, target, ti);
      const currentScore = getScreenScore(entry, fromLevel, target, ti);
      const scaledNewScore = estimateScreenScore(currentScore, currentProxy, newProxy);
      const delta = scaledNewScore !== null ? scaledNewScore - currentScore : Math.max(0, newProxy - currentProxy);
      improvement += (target.weight ?? 1) * Math.max(0, delta);
    }
    return improvement;
  };

  /**
   * Diversify (keep each entry's own top `perEntryCap` raw candidates by the
   * cheap proxy above) THEN globally rank the survivors by the SAME proxy
   * and cap at `globalCap` — the pool-scale replacement for
   * `interleaveCandidatesRoundRobin`'s round-robin-by-depth (see
   * RosterBudgetInputs.candidateLevelsPerEntryPerRound's doc comment).
   * Shared by the main round loop (ranking AFFORDABLE candidates) and the
   * post-search "best blocked candidate" pass (ranking UNAFFORDABLE ones).
   */
  const selectTopCandidatesByProxy = <T extends { entry: RosterEntry; fromLevel: number; toLevel: number }>(
    perEntryLists: T[][],
    perEntryCap: number,
    globalCap: number,
  ): T[] => {
    const rank = (c: T) => cheapRankProxy(c.entry, c.fromLevel, c.toLevel);
    const diversified: T[] = [];
    for (const list of perEntryLists) {
      if (list.length === 0) continue;
      diversified.push(...[...list].sort((a, b) => rank(b) - rank(a)).slice(0, perEntryCap));
    }
    return diversified.sort((a, b) => rank(b) - rank(a)).slice(0, globalCap);
  };

  /**
   * The single real evaluation primitive this round loop and the
   * post-search "blocked candidate" pass both call — see
   * RosterBudgetCandidateEval's own doc comment. Every touched boss's team
   * is re-simulated via runFullRosterCached (memoized by team composition —
   * a repeat is free); every untouched boss contributes a real, computed 0
   * with zero simulation, exactly as runRosterPlanner's own simulateDraft
   * does.
   */
  const evaluateCandidate = (entry: RosterEntry, fromLevel: number, toLevel: number, perBossFloors: number[]): RosterBudgetCandidateEval => {
    const perBoss: RosterPerBossImpact[] = [];
    const touchedTargetIndices: number[] = [];

    for (let ti = 0; ti < targets.length; ti++) {
      const target = targets[ti]!;
      const team = currentTeamsByTarget[ti]!;
      const fieldedIdx = team.findIndex((e) => e.entryId === entry.entryId);
      const rankBefore = fieldedIdx >= 0 ? fieldedIdx + 1 : null;
      const fieldedNow = fieldedIdx >= 0;
      const currentScore = getScreenScore(entry, fromLevel, target, ti);

      let touched = fieldedNow;
      let estimated = currentScore;
      if (!fieldedNow) {
        estimated = estimateOrMeasureScore(getMetricsInputs(entry, target, ti), fromLevel, toLevel, currentScore, () =>
          getScreenScore(entry, toLevel, target, ti),
        );
        const sixthPlace =
          team.length >= MAX_TEAM_RAID_SLOTS
            ? Math.min(...team.map((e) => scoredAllByTarget[ti]!.find((s) => s.entry.entryId === e.entryId)!.score))
            : -Infinity;
        touched = estimated > sixthPlace;
      }

      if (!touched) {
        perBoss.push({ bossId: target.species.id, bossName: target.species.name, deltaTeamDps: 0, rankBefore, rankAfter: rankBefore, simulated: false });
        continue;
      }
      touchedTargetIndices.push(ti);

      let candidateTeam: RosterEntry[];
      if (fieldedNow) {
        candidateTeam = team.map((e) => (e.entryId === entry.entryId ? { ...e, level: toLevel } : liveEntry(e)));
      } else {
        const scoredWithout = scoredAllByTarget[ti]!.filter((s) => s.entry.entryId !== entry.entryId);
        candidateTeam = selectTeam([...scoredWithout, { entry: { ...entry, level: toLevel }, score: estimated }]).map((e) =>
          e.entryId === entry.entryId ? e : liveEntry(e),
        );
      }

      const candidateSummary = runFullRosterCached(candidateTeam, ti, target, evalSeeds, shared, bossHpByTarget[ti]!, teamSummaryCache);
      const deltaTeamDps = candidateSummary.teamDps - currentTeamSummaryByTarget[ti]!.teamDps;
      const rankAfterIdx = candidateTeam.findIndex((e) => e.entryId === entry.entryId);
      const rankAfter = rankAfterIdx >= 0 ? rankAfterIdx + 1 : null;
      perBoss.push({ bossId: target.species.id, bossName: target.species.name, deltaTeamDps, rankBefore, rankAfter, simulated: true });
    }

    const meanDeltaTeamDps =
      totalTargetWeight > 0 ? targets.reduce((sum, t, ti) => sum + (t.weight ?? 1) * perBoss[ti]!.deltaTeamDps, 0) / totalTargetWeight : 0;

    let bestBossDeltaTeamDps: number | null = null;
    let bestBossId: string | null = null;
    let significantBossCount = 0;
    for (let ti = 0; ti < targets.length; ti++) {
      const delta = perBoss[ti]!.deltaTeamDps;
      if (bestBossDeltaTeamDps === null || Math.abs(delta) > Math.abs(bestBossDeltaTeamDps)) {
        bestBossDeltaTeamDps = delta;
        bestBossId = targets[ti]!.species.id;
      }
      if (Math.abs(delta) > perBossFloors[ti]!) significantBossCount++;
    }
    if (bestBossDeltaTeamDps === 0) {
      bestBossDeltaTeamDps = null;
      bestBossId = null;
    }

    return { perBoss, meanDeltaTeamDps, bestBossDeltaTeamDps, bestBossId, significantBossCount, touchedTargetIndices };
  };

  // --- Ledger state, mutated as steps commit -------------------------------
  let remainingStardust = stardustOnHand;
  let remainingSharedCandy = rareCandyOnHand;
  let remainingSharedXl = rareCandyXlOnHand;

  const steps: RosterBudgetStep[] = [];
  let stopReason: PowerUpBudgetStopReason = "round-cap-reached";

  interface RawRosterBudgetCandidate {
    entry: RosterEntry;
    fromLevel: number;
    toLevel: number;
    cost: PowerUpResourceCost;
    familyId: string;
  }

  roundLoop: for (let round = 0; round < maxRounds; round++) {
    // Captured before any mutation below, so RosterBudgetStep.noiseFloorTeamDps
    // records exactly what governed THIS round's decision — see this
    // module's top doc comment, "THE NOISE FLOOR IS PER-ROUND, NOT FIXED."
    const floorForThisRound = aggregateNoiseFloor;
    const perBossFloorsForThisRound = [...perBossNoiseFloors];

    const perEntryUseful = new Map<string, number[]>();
    for (const entry of eligiblePool) {
      perEntryUseful.set(entry.entryId, usefulLevelsForEntry(entry, currentLevelByEntryId.get(entry.entryId)!));
    }

    if ([...perEntryUseful.values()].every((levels) => levels.length === 0)) {
      stopReason = "max-level-reached";
      break roundLoop;
    }

    const perEntryCandidates: RawRosterBudgetCandidate[][] = eligiblePool.map((entry) => {
      const fromLevel = currentLevelByEntryId.get(entry.entryId)!;
      const familyId = entryFamilyId.get(entry.entryId)!;
      const familyPool = remainingCandyByFamilyId.get(familyId)!;
      const maxSpendableCandy = familyPool.candy + remainingSharedCandy * RARE_CANDY_TO_CANDY_RATIO;
      const maxSpendableXl = familyPool.xlCandy + remainingSharedXl * RARE_CANDY_XL_TO_XL_CANDY_RATIO;

      // Every AFFORDABLE useful level, full stop — no early break by depth
      // here (see RosterBudgetInputs.candidateLevelsPerEntryPerRound's doc
      // comment: a depth-based cap BEFORE proxy-ranking would silently
      // exclude a genuinely valuable far-out jump exactly the same way
      // round-robin-by-depth did). `selectTopCandidatesByProxy` below is the
      // ONLY place this entry's candidate count actually gets reduced.
      const affordable: RawRosterBudgetCandidate[] = [];
      for (const toLevel of perEntryUseful.get(entry.entryId)!) {
        const cost = powerUpCost(costTable, fromLevel, toLevel, entry.costModifiers);
        if (cost.stardust > remainingStardust || cost.candy > maxSpendableCandy || cost.xlCandy > maxSpendableXl) break;
        affordable.push({ entry, fromLevel, toLevel, cost, familyId });
      }
      return affordable;
    });

    const roundCandidates = selectTopCandidatesByProxy(perEntryCandidates, candidateLevelsPerEntryPerRound, maxCandidatesPerRound);

    if (roundCandidates.length === 0) {
      stopReason = "budget-exhausted";
      break roundLoop;
    }

    let best: { candidate: RawRosterBudgetCandidate; evalResult: RosterBudgetCandidateEval; score: number } | null = null;
    for (const candidate of roundCandidates) {
      const evalResult = evaluateCandidate(candidate.entry, candidate.fromLevel, candidate.toLevel, perBossFloorsForThisRound);
      if (!candidateClearsBudgetFloor(evalResult, perBossFloorsForThisRound, floorForThisRound, significanceMode)) continue;

      // Multi-dimensional-knapsack-style scalarization — a SEARCH HEURISTIC
      // ONLY (same as planPowerUpBudget's own scoring), never surfaced in
      // the output: cost as a fraction of what's actually left of each
      // constrained resource, summed, ranking by the WEIGHTED MEAN delta
      // (the joint objective) per unit of that fraction.
      const familyPool = remainingCandyByFamilyId.get(candidate.familyId)!;
      const candyAvail = familyPool.candy + remainingSharedCandy * RARE_CANDY_TO_CANDY_RATIO;
      const xlAvail = familyPool.xlCandy + remainingSharedXl * RARE_CANDY_XL_TO_XL_CANDY_RATIO;
      const stardustFraction = remainingStardust > 0 ? candidate.cost.stardust / remainingStardust : 0;
      const candyFraction = candyAvail > 0 ? candidate.cost.candy / candyAvail : 0;
      const xlFraction = xlAvail > 0 ? candidate.cost.xlCandy / xlAvail : 0;
      const costFraction = Math.max(stardustFraction + candyFraction + xlFraction, 1e-9);
      const score = evalResult.meanDeltaTeamDps / costFraction;

      if (best === null || score > best.score) best = { candidate, evalResult, score };
    }

    if (!best) {
      stopReason = "no-significant-candidate";
      break roundLoop;
    }

    const { candidate, evalResult } = best;
    const familyPool = remainingCandyByFamilyId.get(candidate.familyId)!;

    const ownCandySpent = Math.min(candidate.cost.candy, familyPool.candy);
    const sharedCandySpent = candidate.cost.candy - ownCandySpent;
    const ownXlCandySpent = Math.min(candidate.cost.xlCandy, familyPool.xlCandy);
    const sharedXlCandySpent = candidate.cost.xlCandy - ownXlCandySpent;

    remainingStardust -= candidate.cost.stardust;
    familyPool.candy -= ownCandySpent;
    familyPool.xlCandy -= ownXlCandySpent;
    remainingSharedCandy -= sharedCandySpent / RARE_CANDY_TO_CANDY_RATIO;
    remainingSharedXl -= sharedXlCandySpent / RARE_CANDY_XL_TO_XL_CANDY_RATIO;

    currentLevelByEntryId.set(candidate.entry.entryId, candidate.toLevel);

    // Only TOUCHED bosses can have changed — see this module's top doc
    // comment, "Cost control." Update scores/team/summary/floor for exactly
    // those, leaving every other boss's state (and therefore its own noise
    // floor) untouched.
    for (const ti of evalResult.touchedTargetIndices) {
      const target = targets[ti]!;
      const newScore = getScreenScore(candidate.entry, candidate.toLevel, target, ti);
      const row = scoredAllByTarget[ti]!.find((s) => s.entry.entryId === candidate.entry.entryId)!;
      row.score = newScore;
      currentTeamsByTarget[ti] = selectTeam(scoredAllByTarget[ti]!);
      const liveTeam = currentTeamsByTarget[ti]!.map(liveEntry);
      const newSummary = runFullRosterCached(liveTeam, ti, target, evalSeeds, shared, bossHpByTarget[ti]!, teamSummaryCache);
      currentTeamSummaryByTarget[ti] = newSummary;
      perBossNoiseFloors[ti] = noiseFloorFor(newSummary, iterations);
    }
    aggregateNoiseFloor = aggregateNoiseFloorFrom(perBossNoiseFloors);

    const bossesNewlyFielded = evalResult.perBoss.filter((p) => p.rankBefore === null && p.rankAfter !== null).map((p) => p.bossId);

    steps.push({
      entryId: candidate.entry.entryId,
      speciesId: candidate.entry.species.id,
      speciesName: candidate.entry.species.name,
      fromLevel: candidate.fromLevel,
      toLevel: candidate.toLevel,
      cost: candidate.cost,
      ownCandySpent,
      sharedCandySpent,
      ownXlCandySpent,
      sharedXlCandySpent,
      meanDeltaTeamDps: evalResult.meanDeltaTeamDps,
      bestBossDeltaTeamDps: evalResult.bestBossDeltaTeamDps,
      bestBossId: evalResult.bestBossId,
      significantBossCount: evalResult.significantBossCount,
      clearsAggregateFloor: evalResult.meanDeltaTeamDps > floorForThisRound,
      noiseFloorTeamDps: floorForThisRound,
      bossesNewlyFielded,
      perBoss: evalResult.perBoss,
    });
  }

  // --- Best blocked candidate (one-time, post-search only) ------------------
  // Same bounded-not-exhaustive design as planPowerUpBudget's own pass (see
  // that export's top doc comment in powerUp.ts), reused here per pool entry
  // instead of per slot — but selected via the SAME cheap-proxy ranking as
  // the main round loop (see RosterBudgetInputs.candidateLevelsPerEntryPerRound's
  // doc comment) rather than round-robin-by-depth: the raw per-entry list
  // below intentionally takes the FULL unaffordable tail (bounded in
  // practice by usefulPowerUpLevelsAbove's own dominated-level reduction,
  // ~98 levels worst case), cheap to proxy-rank in full, and
  // `selectTopCandidatesByProxy` is what actually applies
  // `blockedCandidateLevelsPerEntry`/`maxBlockedCandidatesToCheck` — a
  // "nearest N unaffordable levels" pre-slice here would reproduce the exact
  // scale bug this module's top doc comment already found once for the main
  // round loop.
  const perEntryBlocked: RawRosterBudgetCandidate[][] = eligiblePool.map((entry) => {
    const fromLevel = currentLevelByEntryId.get(entry.entryId)!;
    const usefulLevels = usefulLevelsForEntry(entry, fromLevel);
    if (usefulLevels.length === 0) return [];

    const familyId = entryFamilyId.get(entry.entryId)!;
    const familyPool = remainingCandyByFamilyId.get(familyId)!;
    const maxSpendableCandy = familyPool.candy + remainingSharedCandy * RARE_CANDY_TO_CANDY_RATIO;
    const maxSpendableXl = familyPool.xlCandy + remainingSharedXl * RARE_CANDY_XL_TO_XL_CANDY_RATIO;

    const firstUnaffordableIndex = usefulLevels.findIndex((toLevel) => {
      const cost = powerUpCost(costTable, fromLevel, toLevel, entry.costModifiers);
      return cost.stardust > remainingStardust || cost.candy > maxSpendableCandy || cost.xlCandy > maxSpendableXl;
    });
    if (firstUnaffordableIndex === -1) return [];

    return usefulLevels.slice(firstUnaffordableIndex).map((toLevel) => ({
      entry,
      fromLevel,
      toLevel,
      cost: powerUpCost(costTable, fromLevel, toLevel, entry.costModifiers),
      familyId,
    }));
  });

  const blockedCandidatesToCheck = selectTopCandidatesByProxy(perEntryBlocked, blockedCandidateLevelsPerEntry, maxBlockedCandidatesToCheck);

  let bestBlockedCandidate: RosterBudgetBlockedCandidate | null = null;
  let bestBlockedScore = -Infinity;
  for (const candidate of blockedCandidatesToCheck) {
    const evalResult = evaluateCandidate(candidate.entry, candidate.fromLevel, candidate.toLevel, perBossNoiseFloors);
    if (!candidateClearsBudgetFloor(evalResult, perBossNoiseFloors, aggregateNoiseFloor, significanceMode)) continue;
    if (evalResult.meanDeltaTeamDps > bestBlockedScore) {
      bestBlockedScore = evalResult.meanDeltaTeamDps;
      const familyPool = remainingCandyByFamilyId.get(candidate.familyId)!;
      bestBlockedCandidate = {
        entryId: candidate.entry.entryId,
        speciesId: candidate.entry.species.id,
        speciesName: candidate.entry.species.name,
        fromLevel: candidate.fromLevel,
        toLevel: candidate.toLevel,
        cost: candidate.cost,
        meanDeltaTeamDps: evalResult.meanDeltaTeamDps,
        bestBossDeltaTeamDps: evalResult.bestBossDeltaTeamDps,
        bestBossId: evalResult.bestBossId,
        shortfalls: shortfallsForCandidate(
          candidate.cost,
          remainingStardust,
          familyPool.candy,
          familyPool.xlCandy,
          remainingSharedCandy,
          remainingSharedXl,
        ),
      };
    }
  }

  // --- Final reporting ------------------------------------------------------
  const finalPerBoss: RosterBaselineBossSummary[] = targets.map((target, ti) => ({
    bossId: target.species.id,
    bossName: target.species.name,
    team: currentTeamsByTarget[ti]!.map((e) => e.entryId),
    summary: currentTeamSummaryByTarget[ti]!,
  }));

  const finalLevels: RosterBudgetFinalLevel[] = eligiblePool.map((entry) => ({
    entryId: entry.entryId,
    speciesId: entry.species.id,
    speciesName: entry.species.name,
    fromLevel: entry.level,
    toLevel: currentLevelByEntryId.get(entry.entryId)!,
  }));

  const candyLedger: Record<string, RosterBudgetCandyFamilyLedgerEntry> = {};
  for (const [familyId, initial] of initialCandyByFamilyId) {
    const remaining = remainingCandyByFamilyId.get(familyId)!;
    candyLedger[familyId] = {
      candy: { spent: initial.candy - remaining.candy, remaining: remaining.candy },
      xlCandy: { spent: initial.xlCandy - remaining.xlCandy, remaining: remaining.xlCandy },
    };
  }

  const ledger: RosterBudgetLedger = {
    stardust: { spent: stardustOnHand - remainingStardust, remaining: remainingStardust },
    candyByFamilyId: candyLedger,
    sharedRareCandy: { spent: rareCandyOnHand - remainingSharedCandy, remaining: remainingSharedCandy },
    sharedRareCandyXl: { spent: rareCandyXlOnHand - remainingSharedXl, remaining: remainingSharedXl },
  };

  return {
    steps,
    finalLevels,
    baselinePerBoss,
    finalPerBoss,
    iterations,
    screenIterations,
    noiseFloorTeamDps: aggregateNoiseFloor,
    ledger,
    stopReason,
    bestBlockedCandidate,
    excludedEntries,
  };
}
