import type { DodgeBehavior } from "./breakpoints.js";
import { resolveMove, runSustainedComparison, type SustainedCandidateResult } from "./comparison.js";
import type { RaidTier } from "./raidBoss.js";
import { typeEffectiveness } from "./typeChart.js";
import type { IVSpread, PokemonType, SpeciesDefinition } from "./types.js";
import type { WeatherCondition } from "./weather.js";

/**
 * The engine-side half of the "what raid bosses is this Pokémon good
 * against" reverse lookup — see
 * .claude/agent-memory/pogo-researcher/proposal_species_reverse_lookup.md for
 * the full design this implements. One selected species (+ its own
 * level/IVs/moveset/dodge/weather assumptions) is swept against a
 * caller-supplied list of boss targets, reusing runSustainedComparison
 * (single-candidate array — already legal, confirmed by reading
 * comparison.ts's ComparisonInputs.candidates: SpeciesDefinition[], no
 * hardcoded length) once per boss, exactly the way teamRaid.ts reuses
 * simulateStepwiseBattle rather than forking a second combat model.
 *
 * Per this project's "no I/O in packages/engine" rule, this module cannot
 * read data/normalized/activeRaids.json or any other file itself — the list
 * of boss targets (and, for the optional type-matchup-percentile corpus, the
 * full field of "registered attackers'" own move types) must be gathered and
 * supplied by the caller (packages/web's registry.ts). This is the same
 * caller-supplies-the-data-layer pattern teamRaid.ts and comparison.ts
 * already follow for their boss/candidate SpeciesDefinition inputs.
 *
 * Explicitly does NOT model a synthetic "other trainers" party or any
 * team-damage-boost attribution (convertUptimeToTeamDamage/uptime.ts) — a
 * single-species view has no second party to attribute team-boost credit to,
 * and inventing one risks drifting toward the ruled-out Teambuilding
 * Analyzer. A species' own species.boost is surfaced only as a plain
 * informational fact (hasMegaBoost/boostedType/boostMultiplier below), never
 * folded into any team-damage number.
 */

/** One boss to sweep against, exactly as the design doc specifies — the caller (web layer) resolves this from data/normalized/activeRaids.json via registry.ts; this module never reads it directly. */
export interface SpeciesReportBossTarget {
  species: SpeciesDefinition;
  /** See comparison.ts's SustainedComparisonInputs.bossRaidTier — ignored entirely when species.statsArePrecomputed is true. Omitted for a real species defaults to defaultRaidTierForSpecies(species) (rarity/boost-keyed; DEFAULT_REAL_RAID_TIER as the true last resort), same as everywhere else this field is threaded. */
  tier?: RaidTier;
  /** Boss fast-move selection for this specific target. Omit/null defaults to the boss's first fast move (today's behavior everywhere else in this engine). */
  bossFastMoveId?: string | null;
  /** Boss charged-move selection for this specific target — see bossFastMoveId. */
  bossChargedMoveId?: string | null;
  /**
   * Override for THIS target's effective max HP — see comparison.ts's
   * bossEffectiveHp/SustainedComparisonInputs.bossMaxHpOverride for the full
   * contract. Exists so a historical raid encounter backfilled from an
   * archive (which records the tier LABEL a boss raided at, but whose HP
   * pool for that label may since have changed — e.g. Niantic's
   * 2020-08-27 tier-2/tier-4 merge) can be simulated at the HP it actually
   * had, rather than at today's stats for `tier`. Overrides HP only; `tier`
   * still drives the attack/defense multiplier and the displayed tier label,
   * completely orthogonal to this field. Omitted/undefined is byte-identical
   * to today's behavior — this row's sustained.bossMaxHp still resolves via
   * the ordinary tier/precomputed derivation. A non-finite or non-positive
   * value throws (see bossEffectiveHp) rather than silently producing a
   * degenerate 0-HP boss.
   */
  bossMaxHpOverride?: number;
}

/**
 * A single (fast move type, charged move type) pair — the minimal shape
 * needed for the cheap type-matchup-percentile corpus below. Deliberately
 * NOT a full SpeciesDefinition: the corpus can be gigantic (every registered
 * attacker, ~1079 real species per the design doc), and all that's actually
 * consumed is each one's own default moveset's two types, so there's no
 * reason to require the caller to hand over full species objects (or for
 * this module to hold onto them).
 */
export interface AttackerTypeProfile {
  fastMoveType: PokemonType;
  chargedMoveType: PokemonType;
}

/**
 * The cheap, no-simulation "type matchup" for one attacker's moveset against
 * a (possibly dual-typed) target — the max of its fast and charged move's
 * typeEffectiveness, since a real attacker benefits from whichever of its two
 * moves hits harder by type, not their average. Pure arithmetic over
 * typeChart.ts's typeEffectiveness — no simulation, matching the design
 * doc's explicit "NOT a full simulated field-rank" framing for this stat.
 */
export function offensiveTypeMatchup(profile: AttackerTypeProfile, targetTypes: readonly PokemonType[]): number {
  return Math.max(
    typeEffectiveness(profile.fastMoveType, targetTypes),
    typeEffectiveness(profile.chargedMoveType, targetTypes),
  );
}

/**
 * The fraction of `corpus` that `value` beats or ties — e.g. 0.88 means
 * "this value is >= 88% of the corpus," i.e. "top 12%" in the design doc's
 * phrasing. Pure arithmetic, no simulation. Returns 1 for an empty corpus
 * (an honest "trivially at the top of an empty field," not a fabricated
 * number) rather than dividing by zero or throwing — callers should treat an
 * empty corpus as "no percentile context available" and choose whether to
 * display it at all.
 */
export function typeMatchupPercentile(value: number, corpus: readonly number[]): number {
  if (corpus.length === 0) return 1;
  return corpus.filter((v) => v <= value).length / corpus.length;
}

export interface SpeciesReportInputs {
  species: SpeciesDefinition;
  /** Fast-move selection for the selected species. Omit/null defaults to species.fastMoves[0] (today's behavior everywhere else). */
  fastMoveId?: string | null;
  /** Charged-move selection — see fastMoveId. */
  chargedMoveId?: string | null;
  level: number;
  ivs: IVSpread;
  /** Governs dodging each boss's CHARGED attacks — one shared assumption swept across every boss target, same as comparison.ts's ComparisonInputs.dodge. */
  dodge: DodgeBehavior;
  /** Whether the species also attempts to dodge each boss's fast attacks. Defaults to false. */
  dodgeFastAttacks?: boolean;
  /** See simulate.ts's StepwiseAttacker.holdChargedMoveUntilSafe. Applies identically against every boss target. Defaults to false. */
  holdChargedMoveUntilSafe?: boolean;
  /** Active weather, applied per-move to both sides against every boss target — see weather.ts. Defaults to "none". */
  weather?: WeatherCondition;
  /** Mean seconds between each boss's charged moves once it starts using them — one shared assumption, the same user-adjustable value the two-candidate tab already exposes (Scenario's bossChargedMoveFrequencySeconds), not per-boss data this engine has no source for. Only consulted when bossChargedMoveCadence is "fixed-interval". */
  bossChargedMoveMeanIntervalSeconds: number;
  /** See comparison.ts's SustainedComparisonInputs.bossChargedMoveCadence — one shared assumption swept identically across every boss target. Defaults to "fixed-interval". */
  bossChargedMoveCadence?: "fixed-interval" | "energy-driven";
  /** See ComparisonInputs.bossStartingEnergy. Only affects each boss's own derived warmup default. Defaults to 0. */
  bossStartingEnergy?: number;
  maxSeconds?: number;
  iterations?: number;
  /** The bosses to rank this species against — see SpeciesReportBossTarget. Caller-supplied; this module performs no I/O to build this list itself. */
  targets: SpeciesReportBossTarget[];
  /**
   * Optional corpus for the secondary type-matchup-percentile stat: every
   * "registered attacker's" own default fast/charged move TYPES (not full
   * SpeciesDefinitions — see AttackerTypeProfile). Per this project's no-I/O
   * rule, packages/engine cannot gather "every registered species" itself;
   * the caller (web layer, e.g. over data/normalized/species.json via
   * registry.ts) must supply this once. When supplied, every row also gets
   * typeMatchupPercentile — computed fresh per boss (since a percentile is
   * relative to THAT boss's own types), pure typeEffectiveness() arithmetic,
   * no simulation. Omitted entirely, every row still gets its own raw
   * offensiveTypeMatchup, just no percentile context alongside it.
   */
  typeMatchupCorpus?: AttackerTypeProfile[];
}

export interface SpeciesReportRow {
  bossId: string;
  bossName: string;
  bossTier?: RaidTier;
  /** The full sustained-comparison distribution for this species against this one boss (mean/median/p10/p90 damage, mean seconds survived, etc.) — see comparison.ts's SustainedCandidateResult/simulate.ts's DistributionSummary. */
  sustained: SustainedCandidateResult;
  /** typeEffectiveness of the species' selected fast move against this boss's types. */
  fastMoveTypeEffectiveness: number;
  /** typeEffectiveness of the species' selected charged move against this boss's types. */
  chargedMoveTypeEffectiveness: number;
  /** max(fastMoveTypeEffectiveness, chargedMoveTypeEffectiveness) — see offensiveTypeMatchup. */
  offensiveTypeMatchup: number;
  /** See SpeciesReportInputs.typeMatchupCorpus — undefined when no corpus was supplied, meaning no percentile context is available for this row. Explicitly labeled type-only in any UI surfacing this, per the design doc, so it's never confused with a simulated leaderboard. */
  typeMatchupPercentile?: number;
}

export interface SpeciesReportResult {
  speciesId: string;
  speciesName: string;
  /** Plain informational fact, never folded into any team-damage number — see this module's top doc comment and the design doc's §2. */
  hasMegaBoost: boolean;
  boostedType?: PokemonType;
  boostMultiplier?: number;
  /** One row per SpeciesReportInputs.targets entry, in the same order supplied — no default sort is applied here (an orchestration concern, not a UI one); the design doc's recommended default (sustained mean damage descending) is left to the caller. */
  rows: SpeciesReportRow[];
}

/**
 * Runs the reverse lookup: one species+moveset+assumptions against every
 * supplied boss target, ranked (by the caller, not here) by sustained
 * performance. Thin orchestration only — every actual combat number comes
 * from runSustainedComparison (single-candidate array), never a second
 * combat model.
 */
export function runSpeciesReverseLookup(inputs: SpeciesReportInputs): SpeciesReportResult {
  const { species, targets, typeMatchupCorpus } = inputs;

  const fastMove = resolveMove(species.fastMoves, inputs.fastMoveId);
  const chargedMove = resolveMove(species.chargedMoves, inputs.chargedMoveId);
  if (!fastMove || !chargedMove) {
    throw new Error(`Species ${species.id} needs at least one fast move and one charged move.`);
  }

  const rows = targets.map((target): SpeciesReportRow => {
    const [sustained] = runSustainedComparison({
      candidates: [species],
      candidateFastMoveIds: [inputs.fastMoveId ?? null],
      candidateChargedMoveIds: [inputs.chargedMoveId ?? null],
      boss: target.species,
      bossRaidTier: target.tier,
      bossMaxHpOverride: target.bossMaxHpOverride,
      bossFastMoveId: target.bossFastMoveId,
      bossChargedMoveId: target.bossChargedMoveId,
      level: inputs.level,
      ivs: inputs.ivs,
      dodge: inputs.dodge,
      dodgeFastAttacks: inputs.dodgeFastAttacks,
      holdChargedMoveUntilSafe: inputs.holdChargedMoveUntilSafe,
      bossChargedMoveMeanIntervalSeconds: inputs.bossChargedMoveMeanIntervalSeconds,
      bossChargedMoveCadence: inputs.bossChargedMoveCadence,
      bossStartingEnergy: inputs.bossStartingEnergy,
      maxSeconds: inputs.maxSeconds,
      iterations: inputs.iterations,
      weather: inputs.weather,
    });

    const fastMoveTypeEffectiveness = typeEffectiveness(fastMove.type, target.species.types);
    const chargedMoveTypeEffectiveness = typeEffectiveness(chargedMove.type, target.species.types);
    const matchup = Math.max(fastMoveTypeEffectiveness, chargedMoveTypeEffectiveness);

    return {
      bossId: target.species.id,
      bossName: target.species.name,
      bossTier: target.tier,
      sustained: sustained!,
      fastMoveTypeEffectiveness,
      chargedMoveTypeEffectiveness,
      offensiveTypeMatchup: matchup,
      typeMatchupPercentile:
        typeMatchupCorpus === undefined
          ? undefined
          : typeMatchupPercentile(
              matchup,
              typeMatchupCorpus.map((profile) => offensiveTypeMatchup(profile, target.species.types)),
            ),
    };
  });

  return {
    speciesId: species.id,
    speciesName: species.name,
    hasMegaBoost: species.boost != null,
    boostedType: species.boost?.boostedType,
    boostMultiplier: species.boost?.multiplier,
    rows,
  };
}
