import { useMemo, useState } from "react";
import { useDebouncedValue } from "./useDebouncedValue.js";
import {
  RAID_TIER_TABLE,
  defaultRaidTierForSpecies,
  type DodgeBehavior,
  type SpeciesDefinition,
  type SpeciesReportRow,
  type WeatherCondition,
} from "@pogo-analyzer/engine";
import type { ComparatorPrefill } from "./comparatorPrefill.js";
import { BOSS_FREQUENCY_INAPPLICABLE_HINT, BossCadenceSelect, type BossChargedMoveCadence } from "./bossCadence.js";
import { MoveSelect } from "./MoveSelect.js";
import { SpeciesBadges } from "./SpeciesBadges.js";
import { SpeciesPicker } from "./SpeciesPicker.js";
import { WeatherSelect } from "./WeatherSelect.js";
import {
  buildSpeciesReportScenarioUrl,
  parseSpeciesReportScenarioFromUrl,
  type SpeciesReportScenario,
  type SpeciesReportSortMode,
} from "./speciesReportScenario.js";
import { getBaseUrl } from "./urlUtils.js";
import {
  activeRaidBossOptions,
  candidatePickerOptions,
  pastRaidBossOptions,
  speciesRegistry,
  unmatchedActiveRaids,
} from "./registry.js";
import { runSpeciesReportScenario, sortRows, validEraHp } from "./run/runSpeciesReport.js";

// The engine's own RAID_TIER_TABLE insertion order, reused (not re-derived)
// so the tier checkbox group below sorts identically to every other place
// this project orders raid tiers by "difficulty" rather than alphabetically.
// A tier string this table doesn't recognize (shouldn't happen for a live
// feed value, but a past-raid history entry's raw tier string is less
// trustworthy) sorts after every known tier rather than being dropped.
const RAID_TIER_ORDER: string[] = Object.keys(RAID_TIER_TABLE);
function tierSortRank(tier: string): number {
  const idx = RAID_TIER_ORDER.indexOf(tier);
  return idx === -1 ? RAID_TIER_ORDER.length : idx;
}
function compareTiers(a: string, b: string): number {
  const rankDiff = tierSortRank(a) - tierSortRank(b);
  return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
}

// A free function (not a component-scoped closure over `assumptions`) so it
// can be called against BOTH the live `includedTiers` (for the checkbox
// group's instant `checked` state) and the debounced copy (for the actual
// target filter that feeds the sweep) without risking the two accidentally
// sharing one implicit source.
function tierIsIncluded(tiers: string[] | null, tier: string): boolean {
  return tiers === null || tiers.includes(tier);
}

// validEraHp now lives in run/runSpeciesReport.ts, imported above — the SAME
// function decides both what runSpeciesReportScenario hands the engine as a
// bossMaxHpOverride AND the table's "sourced" vs "tier default" HP badge
// below, so the value a row is simulated with and the value the UI claims is
// sourced can never drift apart.

// A ready-to-run default so a fresh page load demonstrates a real ranked
// table immediately, not an empty form — same precedent as the other two
// tabs' DEFAULT_CANDIDATE_A_ID/DEFAULT_TARGET_ID.
const DEFAULT_SPECIES_ID = "kartana";

export interface SpeciesReportAssumptions {
  speciesId: string;
  /** null = use this species' first fast move. */
  fastMoveId: string | null;
  /** null = use this species' first charged move. */
  chargedMoveId: string | null;
  level: number;
  ivAttack: number;
  ivDefense: number;
  ivStamina: number;
  /** Governs dodging each swept boss's CHARGED attacks. */
  dodge: DodgeBehavior;
  /** Whether the species also attempts to dodge each boss's fast attacks. */
  dodgeFastAttacks: boolean;
  weather: WeatherCondition;
  /** Mean seconds between each boss's charged moves once it starts using them — one shared assumption swept across every boss target. */
  bossChargedMoveFrequencySeconds: number;
  /** Which model derives every swept boss's charged-move timing — see bossCadence.tsx. "energy-driven" makes bossChargedMoveFrequencySeconds above stop mattering entirely for every boss in the sweep. */
  bossChargedMoveCadence: BossChargedMoveCadence;
  /** Which column the results table is sorted by — display-only, but still a real setting a shared link must preserve. */
  sortMode: SpeciesReportSortMode;
  /** null = every tier (including one that shows up later); an array is an explicit checked-tier allow-list. See the tier checkbox group below. */
  includedTiers: string[] | null;
  /** Also sweep bosses this pipeline has recorded before but that aren't part of the currently-active roster — see registry.ts's pastRaidBossOptions. */
  includePastRaids: boolean;
}

export const DEFAULT_ASSUMPTIONS: SpeciesReportAssumptions = {
  speciesId: DEFAULT_SPECIES_ID,
  fastMoveId: null,
  chargedMoveId: null,
  level: 40,
  ivAttack: 15,
  ivDefense: 15,
  ivStamina: 15,
  dodge: { kind: "perfect" },
  dodgeFastAttacks: false,
  weather: "none",
  bossChargedMoveFrequencySeconds: 15,
  bossChargedMoveCadence: "fixed-interval",
  sortMode: "damage",
  includedTiers: null,
  includePastRaids: false,
};

export function assumptionsToScenario(a: SpeciesReportAssumptions): SpeciesReportScenario {
  return {
    speciesId: a.speciesId,
    fastMoveId: a.fastMoveId,
    chargedMoveId: a.chargedMoveId,
    level: a.level,
    ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
    dodgeModel: a.dodge,
    dodgeFastAttacks: a.dodgeFastAttacks,
    weather: a.weather,
    bossChargedMoveFrequencySeconds: a.bossChargedMoveFrequencySeconds,
    bossChargedMoveCadence: a.bossChargedMoveCadence,
    sortMode: a.sortMode,
    includedTiers: a.includedTiers,
    includePastRaids: a.includePastRaids,
  };
}

export function scenarioToAssumptions(s: SpeciesReportScenario): SpeciesReportAssumptions {
  return {
    speciesId: s.speciesId,
    fastMoveId: s.fastMoveId ?? null,
    chargedMoveId: s.chargedMoveId ?? null,
    level: s.level,
    ivAttack: s.ivs.attack,
    ivDefense: s.ivs.defense,
    ivStamina: s.ivs.stamina,
    dodge: s.dodgeModel,
    // `??` guards a scenario URL encoded before a field existed rather than
    // surfacing `undefined` into a controlled input — same discipline as
    // App.tsx's scenarioToAssumptions/TeamRaidView's teamScenarioToAssumptions.
    dodgeFastAttacks: s.dodgeFastAttacks ?? DEFAULT_ASSUMPTIONS.dodgeFastAttacks,
    weather: s.weather ?? "none",
    bossChargedMoveFrequencySeconds: s.bossChargedMoveFrequencySeconds ?? DEFAULT_ASSUMPTIONS.bossChargedMoveFrequencySeconds,
    // `??` guards a scenario URL encoded before this field existed rather than
    // surfacing `undefined` into the cadence <select>.
    bossChargedMoveCadence: s.bossChargedMoveCadence ?? DEFAULT_ASSUMPTIONS.bossChargedMoveCadence,
    // `??` guards a scenario URL encoded before this field existed (the bug
    // this exact change is fixing) rather than surfacing `undefined` into the
    // sort-mode toggle's active-button check.
    sortMode: s.sortMode ?? DEFAULT_ASSUMPTIONS.sortMode,
    // A pre-existing shared link has no `includedTiers` at all -> `undefined`
    // -> falls back to `null` ("every tier"), same behavior the link's
    // original sender saw before this filter existed.
    includedTiers: s.includedTiers ?? DEFAULT_ASSUMPTIONS.includedTiers,
    includePastRaids: s.includePastRaids ?? DEFAULT_ASSUMPTIONS.includePastRaids,
  };
}

function initialAssumptions(): SpeciesReportAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parseSpeciesReportScenarioFromUrl(window.location.href);
  return fromUrl ? scenarioToAssumptions(fromUrl) : DEFAULT_ASSUMPTIONS;
}

function resolveSpecies(id: string): SpeciesDefinition | null {
  return speciesRegistry.has(id) ? speciesRegistry.get(id) : null;
}

function speciesLabel(s: SpeciesDefinition): string {
  return s.isHypothetical ? `${s.name} (hypothetical)` : s.name;
}

function SpeciesIcon({ s }: { s: SpeciesDefinition }) {
  return s.imageUrl ? <img src={s.imageUrl} alt="" className="species-icon" /> : null;
}

// sortRows now lives in run/runSpeciesReport.ts, imported above — display-only
// (never changes what runSpeciesReverseLookup computes), reused as-is here.

/**
 * The raid tier the simulation ACTUALLY used for this row. `row.bossTier` is
 * only set when the target's tier was a recognized `RaidTier` string (see
 * runSpeciesReverseLookup, which passes it straight through as
 * `bossTier: target.tier`); when it's undefined, `runSustainedComparison`
 * silently fell back to `defaultRaidTierForSpecies` internally, and this
 * recomputes that same fallback here purely for display — so the UI never
 * shows a tier the sim didn't actually run against (the bug this replaced:
 * printing the raw, possibly-unrecognized feed/history tier string as if it
 * had been used).
 */
function actualTierUsed(row: SpeciesReportRow, bossSpecies: SpeciesDefinition | null): { tier: string; isFallback: boolean } {
  if (row.bossTier) return { tier: row.bossTier, isFallback: false };
  return { tier: bossSpecies ? defaultRaidTierForSpecies(bossSpecies) : "unknown tier", isFallback: true };
}

/**
 * "What raid bosses is this Pokémon good against" reverse lookup — see
 * .claude/agent-memory/pogo-researcher/proposal_species_reverse_lookup.md for
 * the full design and packages/engine/src/speciesReport.ts for the engine
 * surface this view calls (runSpeciesReverseLookup, already built and tested).
 *
 * Scoped to the ~10-12 currently-active real raid bosses only (activeRaidBossOptions())
 * — not every species that has ever been a boss, since this project has no
 * queryable "ever a boss" tag (see the design doc section 1). No synthetic
 * "other trainers" team-boost modeling here either (section 2) — a species'
 * own mega/primal boost, if any, is shown only as a plain informational badge,
 * never folded into a fabricated team-damage number.
 */
export function SpeciesReportView({ onCompare }: { onCompare: (prefill: ComparatorPrefill) => void }) {
  const [assumptions, setAssumptions] = useState<SpeciesReportAssumptions>(initialAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const speciesOptions = useMemo(() => candidatePickerOptions(), []);
  const bossOptions = useMemo(() => activeRaidBossOptions(), []);
  const pastRaidOptions = useMemo(() => pastRaidBossOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);
  const bossMetaById = useMemo(() => new Map(bossOptions.map((b) => [b.id, b])), [bossOptions]);
  const pastMetaById = useMemo(() => new Map(pastRaidOptions.map((r) => [r.id, r])), [pastRaidOptions]);

  // Every tier actually present in the roster currently being swept — the
  // active roster always, plus past-raid tiers too once that toggle is on —
  // is what the checkbox group below renders one checkbox per. Ordered by the
  // engine's own RAID_TIER_TABLE difficulty order, not alphabetically.
  const allTiersPresent = useMemo(() => {
    const tiers = new Set(bossOptions.map((b) => b.tier));
    if (assumptions.includePastRaids) {
      for (const r of pastRaidOptions) tiers.add(r.tier);
    }
    return [...tiers].sort(compareTiers);
  }, [bossOptions, pastRaidOptions, assumptions.includePastRaids]);

  // Unchecking every box lands here explicitly (an empty array, not null) —
  // rendered as its own empty state below rather than an empty table, per the
  // task's explicit ask that this never look like a crash or "no results."
  // Deliberately checked against the LIVE includedTiers, not the debounced
  // one below — unchecking the last box should hide the (possibly stale)
  // table and show this message immediately, not 300ms later.
  const noTiersSelected = allTiersPresent.length > 0 && assumptions.includedTiers !== null && assumptions.includedTiers.length === 0;

  function toggleTier(tier: string) {
    const current = assumptions.includedTiers ?? allTiersPresent;
    const next = current.includes(tier) ? current.filter((t) => t !== tier) : [...current, tier];
    // Checking every currently-present box is treated as "back to the
    // no-filter default" (null) rather than an explicit list that happens to
    // equal today's full roster — so a tier that shows up in the feed LATER
    // is still included by default, exactly like a user who never touched
    // this control at all.
    setAssumptions({
      ...assumptions,
      includedTiers: next.length === allTiersPresent.length ? null : next,
    });
  }

  // Live species — bound to every rendered control (movesets, boost badge,
  // subtitle) so picking a new species updates the FORM instantly. The sweep
  // itself resolves its own, separately-debounced species below
  // (`sweepSpecies`) — see the debounce block for why those two must stay
  // independent rather than sharing one resolution.
  const species = useMemo(() => resolveSpecies(assumptions.speciesId), [assumptions.speciesId]);

  // The subset of `assumptions` that actually drives the expensive sweep
  // below — everything except `sortMode`, which only reorders already-
  // computed rows (see sortRows/sortedRows) and must stay instant per this
  // task's explicit instruction. Each field is listed individually as a
  // dependency so this object's IDENTITY only changes when one of THESE
  // fields changes — a sortMode-only update leaves it untouched, which is
  // what keeps the sort toggle from ever flashing a "pending" indicator for
  // work that was never actually re-triggered.
  const sweepInputs = useMemo(
    () => ({
      speciesId: assumptions.speciesId,
      fastMoveId: assumptions.fastMoveId,
      chargedMoveId: assumptions.chargedMoveId,
      level: assumptions.level,
      ivAttack: assumptions.ivAttack,
      ivDefense: assumptions.ivDefense,
      ivStamina: assumptions.ivStamina,
      dodge: assumptions.dodge,
      dodgeFastAttacks: assumptions.dodgeFastAttacks,
      weather: assumptions.weather,
      bossChargedMoveFrequencySeconds: assumptions.bossChargedMoveFrequencySeconds,
      bossChargedMoveCadence: assumptions.bossChargedMoveCadence,
      includedTiers: assumptions.includedTiers,
      includePastRaids: assumptions.includePastRaids,
    }),
    [
      assumptions.speciesId,
      assumptions.fastMoveId,
      assumptions.chargedMoveId,
      assumptions.level,
      assumptions.ivAttack,
      assumptions.ivDefense,
      assumptions.ivStamina,
      assumptions.dodge,
      assumptions.dodgeFastAttacks,
      assumptions.weather,
      assumptions.bossChargedMoveFrequencySeconds,
      assumptions.bossChargedMoveCadence,
      assumptions.includedTiers,
      assumptions.includePastRaids,
    ],
  );

  // Debounced echo of the above — see useDebouncedValue.ts for why a plain
  // timer beats React's concurrent primitives here (the sweep is one giant
  // synchronous computation; React cannot interrupt it mid-flight regardless
  // of how the update was scheduled). Every control stays bound to the LIVE
  // `assumptions` state above, so typing/toggling itself is always instant —
  // only `targets`/`result` below read this delayed copy.
  const debouncedSweepInputs = useDebouncedValue(sweepInputs, 300);

  // Exact and free: `sweepInputs` and `debouncedSweepInputs` become the SAME
  // object reference the instant the debounce timer fires (useDebouncedValue
  // stores the very value it was handed, no cloning), so a `!==` check is a
  // correct "is a recompute still outstanding for the CURRENT inputs" test,
  // no deep-equality needed. This is what backs the "Recomputing…" indicator
  // below the results heading — the requirement that a lagging table must
  // never look silently authoritative.
  const isSweepPending = sweepInputs !== debouncedSweepInputs;

  // The entire engine-facing computation (species resolution, target-list
  // construction from the tier filter, the type-matchup corpus, and the
  // runSpeciesReverseLookup sweep itself) lives in runSpeciesReportScenario
  // (run/runSpeciesReport.ts) — a pure, React-free function shared with the
  // run-scenario CLI and this tab's own vitest smoke test. Called against
  // `debouncedSweepInputs`, never live `assumptions` — this is the actual fix
  // for the per-keystroke freeze: the expensive call only re-runs once inputs
  // have settled, not on every character typed. `sortMode` is a placeholder
  // here (runSpeciesReportScenario never reads it — see SpeciesReportAssumptions'
  // own doc comment) specifically so this useMemo's dependency stays
  // `debouncedSweepInputs` alone; threading the LIVE `assumptions.sortMode`
  // in here would recompute the whole sweep on every sort-toggle click, the
  // exact regression the debounce split was built to avoid.
  const runResult = useMemo(
    () => runSpeciesReportScenario({ ...debouncedSweepInputs, sortMode: "damage" }, speciesRegistry),
    [debouncedSweepInputs],
  );
  const targets = runResult.targets;
  const activeTargetCount = runResult.activeTargetCount;
  const pastTargetCount = runResult.pastTargetCount;
  const result = { data: runResult.data, error: runResult.error };

  const sortedRows = useMemo(
    () => (result.data ? sortRows(result.data.rows, assumptions.sortMode) : []),
    [result.data, assumptions.sortMode],
  );

  // An honest, cheap observation in place of the two-candidate comparator's
  // "ratio sentence" convention — this view has no second candidate to
  // compare against (see the design doc's section 2), so there's no
  // meaningful "X outputs Nx the other's" ratio to compute. What IS a real,
  // cheap comparison here: whether the two independent rankings (survival-
  // weighted sustained damage vs. the cheap type-only percentile) agree on
  // which boss is the best target, or diverge.
  const topByDamage = useMemo(() => (result.data ? sortRows(result.data.rows, "damage")[0] : undefined), [result.data]);
  const topByType = useMemo(() => (result.data ? sortRows(result.data.rows, "typeMatchup")[0] : undefined), [result.data]);

  // activeTargetCount/pastTargetCount above come straight from runResult —
  // same split (against the same `targets`), just computed once inside
  // runSpeciesReportScenario rather than a second time here.

  function handleShare() {
    // Also pins `view=species-report` so reloading/sharing this link lands on
    // this tab, not whichever one happened to be open — see App.tsx's
    // tab-switch scaffold, which all three views' share flows now write into.
    const url = new URL(buildSpeciesReportScenarioUrl(getBaseUrl(), assumptionsToScenario(assumptions)));
    url.searchParams.set("view", "species-report");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  function handleCompare(row: SpeciesReportRow) {
    onCompare({
      targetId: row.bossId,
      candidateAId: assumptions.speciesId,
      candidateAFastMoveId: assumptions.fastMoveId,
      candidateAChargedMoveId: assumptions.chargedMoveId,
    });
  }

  const overallError = result.error;

  return (
    <>
      <p className="subtitle">
        {species ? (
          <>
            <SpeciesIcon s={species} /> {speciesLabel(species)}
          </>
        ) : (
          "Pick a Pokémon"
        )}{" "}
        vs.{" "}
        {assumptions.includePastRaids
          ? "every currently-active raid boss plus past/inactive ones this pipeline has recorded"
          : "every currently-active real raid boss"}{" "}
        — ranked by survival-weighted sustained output, not raw DPS.
      </p>

      <section className="panel">
        <h2>Assumptions</h2>
        <div className="assumption-grid">
          <div>
            <SpeciesPicker
              idPrefix="species-report-species"
              label="Pokémon"
              options={speciesOptions}
              value={assumptions.speciesId}
              onChange={(id) =>
                // A previously-picked move id almost certainly doesn't exist
                // on the new species — reset both back to "use first move" in
                // the same update, same convention as the other two tabs.
                setAssumptions({ ...assumptions, speciesId: id, fastMoveId: null, chargedMoveId: null })
              }
            />
            {species && (
              <>
                <MoveSelect
                  idPrefix="species-report-fast"
                  label="Fast move"
                  moves={species.fastMoves}
                  kind="fast"
                  value={assumptions.fastMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, fastMoveId: id })}
                />
                <MoveSelect
                  idPrefix="species-report-charged"
                  label="Charged move"
                  moves={species.chargedMoves}
                  kind="charged"
                  value={assumptions.chargedMoveId}
                  onChange={(id) => setAssumptions({ ...assumptions, chargedMoveId: id })}
                />
                {species.boost && (
                  <p
                    className="species-picker-hint"
                    title="Informational only — this view has no second party to attribute team-damage credit to (see the design doc's section 2), so this is never folded into any computed number here."
                  >
                    Has a mega/primal boost mechanic: grants a team-wide {species.boost.multiplier}x{" "}
                    {species.boost.boostedType} boost to OTHER trainers in the raid lobby while active (never this
                    species' own bench).
                  </p>
                )}
              </>
            )}
          </div>

          <div>
            <div className="field">
              <label htmlFor="species-report-level">Level</label>
              <input
                id="species-report-level"
                type="number"
                min={1}
                max={40}
                step={0.5}
                value={assumptions.level}
                onChange={(e) => setAssumptions({ ...assumptions, level: Number(e.target.value) })}
              />
            </div>
            <div className="iv-row">
              <div className="field">
                <label htmlFor="species-report-ivAttack">Attack IV</label>
                <input
                  id="species-report-ivAttack"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivAttack}
                  onChange={(e) => setAssumptions({ ...assumptions, ivAttack: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="species-report-ivDefense">Defense IV</label>
                <input
                  id="species-report-ivDefense"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivDefense}
                  onChange={(e) => setAssumptions({ ...assumptions, ivDefense: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="species-report-ivStamina">Stamina IV</label>
                <input
                  id="species-report-ivStamina"
                  className="iv-input"
                  type="number"
                  min={0}
                  max={15}
                  value={assumptions.ivStamina}
                  onChange={(e) => setAssumptions({ ...assumptions, ivStamina: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="species-report-dodge">Dodge each boss's charged attacks</label>
            <select
              id="species-report-dodge"
              value={assumptions.dodge.kind}
              onChange={(e) => {
                const kind = e.target.value as DodgeBehavior["kind"];
                setAssumptions({
                  ...assumptions,
                  dodge: kind === "percentage-missed" ? { kind, missedFraction: 0.5 } : ({ kind } as DodgeBehavior),
                });
              }}
            >
              <option value="none">None</option>
              <option value="perfect">Perfect</option>
              <option value="percentage-missed">Percentage missed</option>
            </select>
          </div>

          {assumptions.dodge.kind === "percentage-missed" && (
            <div className="field">
              <label htmlFor="species-report-missedFraction">Fraction of charged hits NOT dodged</label>
              <input
                id="species-report-missedFraction"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={assumptions.dodge.missedFraction}
                onChange={(e) =>
                  setAssumptions({ ...assumptions, dodge: { kind: "percentage-missed", missedFraction: Number(e.target.value) } })
                }
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="species-report-dodgeFastAttacks">Also dodge each boss's fast attacks?</label>
            <select
              id="species-report-dodgeFastAttacks"
              value={assumptions.dodgeFastAttacks ? "yes" : "no"}
              onChange={(e) => setAssumptions({ ...assumptions, dodgeFastAttacks: e.target.value === "yes" })}
              title="Dodging every fast attack costs 0.5s of the attack cycle each time — usually not worth it, but can matter for a glass cannon."
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>

          <WeatherSelect
            idPrefix="species-report"
            value={assumptions.weather}
            onChange={(w) => setAssumptions({ ...assumptions, weather: w })}
          />

          <BossCadenceSelect
            idPrefix="species-report"
            value={assumptions.bossChargedMoveCadence}
            onChange={(v) => setAssumptions({ ...assumptions, bossChargedMoveCadence: v })}
          />

          <div className="field">
            <label htmlFor="species-report-bossFreq">
              Boss charged-move mean frequency (s)
              {assumptions.bossChargedMoveCadence === "energy-driven" && " (inactive)"}
            </label>
            <input
              id="species-report-bossFreq"
              type="number"
              min={1}
              value={assumptions.bossChargedMoveFrequencySeconds}
              onChange={(e) => setAssumptions({ ...assumptions, bossChargedMoveFrequencySeconds: Number(e.target.value) })}
              disabled={assumptions.bossChargedMoveCadence === "energy-driven"}
              title="Mean seconds between each boss's charged moves once it's ready to use them (randomized +/-40% per run) — one shared assumption swept across every boss below. Below the boss charged-move duration (commonly 2-3s) its attacks overlap, so dodging cannot help and the dodge setting stops affecting results entirely."
            />
            {assumptions.bossChargedMoveCadence === "energy-driven" && (
              <p className="species-picker-hint">{BOSS_FREQUENCY_INAPPLICABLE_HINT}</p>
            )}
          </div>

          <div className="field">
            <label htmlFor="species-report-includePast">Include past/inactive raids</label>
            <select
              id="species-report-includePast"
              value={assumptions.includePastRaids ? "yes" : "no"}
              onChange={(e) => setAssumptions({ ...assumptions, includePastRaids: e.target.value === "yes" })}
              title="Also sweeps bosses this pipeline has recorded before but that aren't part of the currently-active raid roster right now — see the 'past'/'past (researched)'/'past (archive)' badges in the table below for each one's provenance."
            >
              <option value="no">No — active raids only</option>
              <option value="yes">Yes — active + past raids ({pastRaidOptions.length} recorded)</option>
            </select>
            {/*
              The coverage description belongs HERE, on the control itself,
              not only in the caveats paragraph at the bottom of the page —
              someone toggling this on should learn its real shape from the
              control rather than having to go hunting for it. Updated once
              data-sync backfilled pogoapi's raid_bosses.json `previous`
              archive (~500 "past (archive)" entries) on top of the original
              live-feed/researched-tier log: the coverage limit is no longer
              "only since 2026-09-07, mega/primal only" (that was true before
              the backfill landed) — it's now "no date information on archive
              entries, and EX Raids excluded entirely" instead. Both are real,
              durable limits of this data source, just different ones than
              before — keep this paragraph in sync if that changes again.
              Same day, data-sync added a second archive source (Bulbapedia's
              raid-boss-change pages, ~75 more "past (archive)" entries — see
              registry.ts's RawRaidHistoryEntry doc comment) plus a real
              recorded max HP for most archive rows from either source, now
              shown in the results table's "Boss HP" column — that HP is
              display context only and doesn't change this coverage-limit
              paragraph.
            */}
            <p className="species-picker-hint">
              A sourced historical archive, not a live log — most entries above have no date
              information, so they can't be ordered or filtered by when they were actually active
              (see each row's "past (archive)" badge for the provenance behind that). EX Raids are
              excluded entirely, since no modern raid tier equivalent exists to simulate them at.
            </p>
          </div>

          <div>
            <p className="field-group-label">Raid tiers to include</p>
            {allTiersPresent.map((tier) => (
              <label key={tier} className="species-picker-hint" style={{ display: "block" }}>
                <input type="checkbox" checked={tierIsIncluded(assumptions.includedTiers, tier)} onChange={() => toggleTier(tier)} /> {tier}
              </label>
            ))}
          </div>
        </div>

        {unmatchedRaids.length > 0 && (
          <p className="species-picker-hint" title="These raids are currently active but have no usable stat data yet.">
            Other raids currently live in-game that this tool can't sweep yet (no stat data available):{" "}
            {unmatchedRaids.map((r) => `${r.raidName} (${r.tier})`).join(", ")}
          </p>
        )}
      </section>

      {overallError && (
        <section className="panel">
          <p style={{ color: "#ff6b6b" }}>Could not compute this report: {overallError}</p>
        </section>
      )}

      {noTiersSelected && (
        <section className="panel">
          <p className="caveats">No raid tiers selected — check at least one tier under Assumptions above to see ranked results.</p>
        </section>
      )}

      {result.data && !noTiersSelected && (
        <section className="panel">
          <h2>
            Ranked against {targets.length} raid boss{targets.length === 1 ? "" : "es"}
            {/* Reads the DEBOUNCED includePastRaids, not live `assumptions` —
                this heading describes `targets`/`result.data`, which are
                themselves debounced, so it must describe the SAME snapshot
                they came from rather than whatever the toggle currently says
                mid-debounce (that mismatch would be exactly the "silently
                stale-looking-authoritative" bug this task warns against). */}
            {debouncedSweepInputs.includePastRaids
              ? ` — ${activeTargetCount} currently active, ${pastTargetCount} past/inactive`
              : activeTargetCount < bossOptions.length
                ? ` of ${bossOptions.length} currently-active (tier filter applied)`
                : " (currently active)"}
            {isSweepPending && (
              <span
                className="badge badge-pending"
                title="Inputs have changed since this table was last computed — it still reflects the previous Level/IV/dodge/weather/tier/species settings and will refresh automatically a moment after you stop changing them."
              >
                recomputing…
              </span>
            )}
          </h2>
          <p className="caveats" style={{ marginBottom: 12 }}>
            Each row is the same real stepwise/dodge/randomized-boss-cadence simulator the two-candidate comparator
            uses (200 randomized runs per boss, single-candidate) — a survival-weighted number, not a flat
            power/duration DPS stat that ignores whether {result.data.speciesName} is even still alive against that
            specific boss's real incoming damage. "Type-matchup percentile" is different and cheaper: pure
            type-effectiveness arithmetic against every registered species' own default moveset, no simulation at
            all — labeled explicitly so it's never confused with the simulated ranking. Scoped to the currently-live
            raid roster (plus past/inactive raids when that toggle is on above), not every species that has ever
            been a boss (no such archival list exists in this tool's data layer).
          </p>

          <div className="tab-switcher" role="group" aria-label="Sort by" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab-button${assumptions.sortMode === "damage" ? " active" : ""}`}
              onClick={() => setAssumptions({ ...assumptions, sortMode: "damage" })}
            >
              Sort: sustained mean damage
            </button>
            <button
              type="button"
              className={`tab-button${assumptions.sortMode === "typeMatchup" ? " active" : ""}`}
              onClick={() => setAssumptions({ ...assumptions, sortMode: "typeMatchup" })}
            >
              Sort: type-matchup percentile
            </button>
          </div>

          {topByDamage && topByType && (
            <p className="caveats" style={{ marginBottom: 12 }}>
              {topByDamage.bossId === topByType.bossId
                ? `Both rankings agree: ${bossMetaById.get(topByDamage.bossId)?.raidName ?? topByDamage.bossName} is the top result either way.`
                : `The two rankings disagree on the top result — sustained mean damage favors ${bossMetaById.get(topByDamage.bossId)?.raidName ?? topByDamage.bossName}, while the cheap type-only percentile favors ${bossMetaById.get(topByType.bossId)?.raidName ?? topByType.bossName}. The simulated (damage/survival) ranking is the one to trust for a real decision; the type percentile is sanity-check context only.`}
            </p>
          )}

          {/* Dimmed (not hidden) while a recompute is outstanding — the rows
              underneath are real, previously-computed results, just not for
              the CURRENT inputs anymore; the "recomputing…" badge above names
              the condition, this dimming makes it visible at a glance too
              without the jarring flash of clearing the table to empty. */}
          <div style={{ overflowX: "auto", opacity: isSweepPending ? 0.55 : 1, transition: "opacity 0.15s ease" }}>
          <table className="time-series-table">
            <thead>
              <tr>
                <th>Boss</th>
                <th>Type matchup</th>
                <th>Type-matchup percentile</th>
                <th>Boss HP</th>
                <th>Sustained mean damage (TDO)</th>
                <th>Mean survival</th>
                <th>Boost</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const meta = bossMetaById.get(row.bossId);
                const pastMeta = pastMetaById.get(row.bossId);
                const bossSpecies = resolveSpecies(row.bossId);
                const tierInfo = actualTierUsed(row, bossSpecies);
                return (
                  <tr key={row.bossId}>
                    <td style={{ textAlign: "left" }}>
                      {bossSpecies?.imageUrl && <img src={bossSpecies.imageUrl} alt="" className="species-icon" />}{" "}
                      {meta?.raidName ?? pastMeta?.raidName ?? row.bossName}
                      <span
                        className="species-picker-hint"
                        title={
                          tierInfo.isFallback
                            ? `This engine didn't recognize the raid feed/history's own tier label, so the simulation fell back to ${tierInfo.tier} based on this species' own rarity/boost/lastKnownRaidTier — not necessarily this raid's real current tier.`
                            : undefined
                        }
                      >
                        {" "}
                        ({tierInfo.tier}
                        {tierInfo.isFallback ? " — fallback" : ""})
                      </span>
                      {meta?.isApproximate && <span className="badge badge-approximate">approximate</span>}
                      {pastMeta && (
                        <span
                          // Not badge-hypothetical for any of the three past-raid variants: that
                          // badge means "this species' data is speculative", and every row here is
                          // a real, released species — these three only ever qualify how the
                          // TIER/encounter was SOURCED, never whether the Pokémon exists. See
                          // styles.css's .badge-past / .badge-past-researched / .badge-past-archive.
                          // "pogoapi-previous" / "bulbapedia-archive" / "pokebattler-legacy" all
                          // share the archive badge/hue (same evidentiary shape — see registry.ts's
                          // RawRaidHistoryEntry doc comment) rather than getting a 4th/5th variant.
                          className={`badge ${
                            pastMeta.source === "live-feed"
                              ? "badge-past"
                              : pastMeta.source === "researched-tier"
                                ? "badge-past-researched"
                                : "badge-past-archive"
                          }`}
                          title={
                            pastMeta.source === "live-feed"
                              ? `Not currently active — this pipeline last observed it live in the raid feed on ${new Date(pastMeta.lastSeenAt).toLocaleDateString()}.`
                              : pastMeta.source === "researched-tier"
                                ? "Not currently active, and never observed live in the raid feed by this pipeline — seeded from a hand-researched tier citation only."
                                : "A real past raid boss sourced from a historical raid archive (pogoapi's previous-raids archive, Bulbapedia's raid-boss-change pages, or Pokebattler's own historical archive) — never observed live by this pipeline, and none of these three sources records a date, so exactly when it was active is unknown. Its tier here is the historical encounter's OWN recorded tier, which can legitimately differ from this species' current default tier elsewhere in this tool."
                          }
                        >
                          {pastMeta.source === "live-feed"
                            ? "past"
                            : pastMeta.source === "researched-tier"
                              ? "past (researched)"
                              : "past (archive)"}
                        </span>
                      )}
                      <SpeciesBadges isShadow={bossSpecies?.isShadow} />
                    </td>
                    <td>{row.offensiveTypeMatchup.toFixed(3)}x</td>
                    <td>
                      {row.typeMatchupPercentile === undefined
                        ? "n/a"
                        : `top ${Math.max(0, (1 - row.typeMatchupPercentile) * 100).toFixed(0)}%`}
                    </td>
                    <td>
                      {row.sustained.bossMaxHp.toLocaleString()}
                      {(() => {
                        // The SAME validEraHp guard that decided whether this
                        // row's target actually got a bossMaxHpOverride above
                        // — never an independently-recomputed condition, so
                        // this label can't ever claim "sourced" for a row
                        // that was actually simulated against the tier
                        // default, or vice versa.
                        const sourcedHp = validEraHp(pastMeta?.eraHp);
                        return sourcedHp === undefined ? (
                          <span
                            className="species-picker-hint"
                            title="No sourced historical HP exists for this row — either a currently-active raid (whose current tier IS the real fact) or a past raid this pipeline has no real eraHp record for. This is today's tier's own HP value, which may not match what this specific historical encounter actually had. Does not affect this row's damage/survival numbers either way — this view never fights a boss to zero HP."
                          >
                            {" "}
                            (tier default)
                          </span>
                        ) : (
                          <span
                            className="species-picker-hint"
                            title="This specific past encounter's real recorded max HP, sourced from a historical raid archive (pogoapi's previous-raids archive or Bulbapedia's raid-boss-change pages) rather than derived from today's tier stats. Shown for context only — does not affect this row's damage/survival numbers, since this view never fights a boss to zero HP."
                          >
                            {" "}
                            (sourced)
                          </span>
                        );
                      })()}
                    </td>
                    <td>{row.sustained.meanTotalDamage.toFixed(0)}</td>
                    <td>
                      {row.sustained.meanSecondsSurvived.toFixed(1)}s (
                      {(row.sustained.fractionSurvivedFullWindow * 100).toFixed(0)}% survived full window)
                    </td>
                    <td>
                      {result.data!.hasMegaBoost ? (
                        <span
                          className="badge badge-persists"
                          title={`Informational only — grants a team-wide ${result.data!.boostMultiplier}x ${result.data!.boostedType} boost to other trainers in the raid, never this species' own bench. Not folded into any number in this table.`}
                        >
                          {result.data!.boostMultiplier}x {result.data!.boostedType}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <button type="button" onClick={() => handleCompare(row)}>
                        Compare vs. another attacker
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Share this scenario</h2>
        <div className="share-row">
          <button onClick={handleShare}>Build link</button>
          {shareUrl && <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />}
        </div>
      </section>

      <section className="panel">
        <h2>Known caveats</h2>
        <p className="caveats">
          There's no "opening burst vs sustained" mode to pick here either — every per-boss run is one continuous
          simulation. This view models the selected species alone: it has no second party, so a mega/primal boost
          (if this species has one) is shown only as a plain informational badge above and in the table, never folded
          into a fabricated team-damage number the way the two-candidate comparator's "other trainers" party fields
          do — that requires a second party to attribute credit to, which doesn't exist here (see the design doc's
          section 2). Every swept boss attacks with its own FIRST fast move and FIRST charged move only — unlike the
          two-candidate comparator's dedicated boss-moveset sweep, there's no per-boss moveset selection here, so a
          boss whose real threat comes from a rarer second charged move will look easier in the "Mean survival" column
          than it actually is. "Boss charged-move cadence model" above defaults to the fixed mean-interval model
          every number on this tab has always used; the experimental "Energy-driven" alternative instead derives
          EVERY swept boss's timing from its own energy, independently per boss — see that control's own explanation
          for what's sourced, what's this project's own reasoned inference, and what's simply unvalidated. Left off
          by default so a shared link's meaning never silently changes. Scoped to the currently-active real raid bosses by default, per the live community raid
          feed, plus past/inactive raids this pipeline has separately recorded when that toggle above is on — two real,
          sourced historical archives (pogoapi's previous-raids archive and Bulbapedia's raid-boss-change pages, both
          badged "past (archive)"), this pipeline's own live-feed sightings since 2026-09-07 (badged "past"), and a
          small number of hand-researched tier citations for raids no archive has caught up to yet (badged "past
          (researched)"). The archive entries carry no date information at all, so they can't be ordered or filtered
          by when they were actually active, and EX Raids are excluded from them entirely since no modern raid tier
          equivalent exists to simulate them at — a gap in the combined list still means "none of these four sources
          ever recorded it," not "it was never a real raid boss." Most archive rows also carry a real recorded max HP
          for that specific encounter (shown in the "Boss HP" column, marked "sourced" vs. "tier default") — this is
          display context only and never changes a row's damage/survival numbers, since this view never fights a boss
          down to zero HP in the first place; a row's HP provenance and its ranking are independent facts. Raid targets
          marked "approximate" use a
          documented stand-in species' stats because no better data exists yet — treat those rows as directional, not
          exact. A row's tier label marked "fallback" means the feed/history's own tier string wasn't one this engine
          recognizes, so the simulation used this species' own rarity/boost/lastKnownRaidTier to guess instead — not
          necessarily that raid's real current tier. Click "Compare vs. another attacker" on any row to hand this
          species, its selected moveset, and that boss off to the two-candidate comparator, leaving the second
          candidate for you to pick there.
        </p>
      </section>
    </>
  );
}
