import { MAX_POKEMON_POWER_UP_LEVEL } from "@pogo-analyzer/engine";
import type { DodgeBehavior, MegaLevel, SpeciesDefinition, WeatherCondition } from "@pogo-analyzer/engine";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { NumberField } from "./NumberField.js";
import { SpeciesPicker, type SpeciesPickerOption } from "./SpeciesPicker.js";
import { MoveSelect, type MoveSelectOpponent } from "./MoveSelect.js";
import { MegaLevelSelect } from "./megaLevelSelect.js";
import { WeatherSelect } from "./WeatherSelect.js";
import { shadowToggleUiState } from "./shadowToggle.js";
import { BOSS_FREQUENCY_INAPPLICABLE_HINT, BossCadenceSelect, type BossChargedMoveCadence } from "./bossCadence.js";

export interface Assumptions {
  candidateAId: string;
  candidateBId: string;
  targetId: string;
  /** null = use that candidate's/the boss's first fast/charged move (today's implicit default) — see the add-scenario-assumption skill for why these mirror Scenario's fields exactly. */
  candidateAFastMoveId: string | null;
  candidateAChargedMoveId: string | null;
  candidateBFastMoveId: string | null;
  candidateBChargedMoveId: string | null;
  bossFastMoveId: string | null;
  bossChargedMoveId: string | null;
  /**
   * Per-candidate "pretend this species has no mega/primal boost mechanic at
   * all", matched by index to [candidateAId, candidateBId] — lets a user
   * compare a mega candidate's DPS fairly against a non-mega one. See
   * Scenario.candidateMegaBoostDisabled: true disables BOTH that candidate's
   * own-damage boost AND its team-damage attribution entirely, not a partial
   * disable. No-op for a candidate that has no `boost` at all already.
   */
  candidateMegaBoostDisabled: [boolean, boolean];
  /**
   * Per-candidate Mega Level (see megaLevelSelect.tsx / packages/engine/src/megaLevel.ts),
   * matched by index to [candidateAId, candidateBId] — mirrors
   * Scenario.candidateMegaLevel exactly. `null` means no Mega Level
   * investment assumed (identical to `"base"`). Silently has no effect on a
   * candidate whose species has no mega/primal `boost` mechanic at all (see
   * megaLevelSelect.tsx's canHaveMegaLevel, the same gate the control's own
   * visibility uses). Defaults to `[null, null]`.
   */
  candidateMegaLevel: [MegaLevel | null, MegaLevel | null];
  /**
   * Per-candidate "treat this species as Shadow", matched by index to
   * [candidateAId, candidateBId] — applies shadow.ts's
   * SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER to that candidate's
   * raw base stats. Mutually exclusive with a mega/primal boost (a Shadow
   * Pokémon can't Mega Evolve without being Purified first — shadow.ts's
   * shadowAdjustedBaseStats throws if both are set), so this is forced back
   * to false whenever that candidate's species carries a `boost` — see
   * ComparatorView's normalizeAssumptions. No-op for a species that's
   * ALREADY isShadow from the registry (a synthesized "Shadow X" raid-target
   * variant) — see shadowToggle.ts's applyShadowToggle.
   */
  candidateShadow: [boolean, boolean];
  level: number;
  ivAttack: number;
  ivDefense: number;
  ivStamina: number;
  /** Governs dodging the boss's CHARGED attacks only. */
  dodge: DodgeBehavior;
  /** Whether the candidate also attempts to dodge the boss's fast attacks — a separate yes/no from dodge, since dodging every fast attack costs 0.5s per attempt and usually isn't worth it. */
  dodgeFastAttacks: boolean;
  /**
   * Per-candidate override for `dodge` above, matched by index to
   * [candidateAId, candidateBId] — lets a user compare a bulky candidate
   * played with no dodging against a glass cannon played with perfect
   * dodging, a real A-vs-B question this product's ranking-flip thesis
   * depends on (see Scenario.candidateDodge /
   * SustainedComparisonInputs.candidateDodge). `null` for an index means "use
   * the shared `dodge` setting above" for that candidate — the default
   * [null, null], so this is opt-in per candidate.
   */
  candidateDodge: [DodgeBehavior | null, DodgeBehavior | null];
  /**
   * Per-candidate override for `dodgeFastAttacks` above — see candidateDodge.
   * `null` means "use the shared `dodgeFastAttacks` above" for that
   * candidate, NOT "false". Defaults to [null, null].
   */
  candidateDodgeFastAttacks: [boolean | null, boolean | null];
  /** Hold the charged move for a safer moment (right after dodging a boss charged hit, or when energy caps) instead of firing immediately. */
  holdChargedMoveUntilSafe: boolean;
  /** Extends the damage-over-time chart's window beyond the auto-computed natural minimum (never below it) — 0 means no override. */
  minFightLengthSeconds: number;
  bossChargedMoveFrequencySeconds: number;
  /**
   * Which model derives the boss's charged-move timing — see bossCadence.tsx's
   * BOSS_CADENCE_HINT for the full sourcing/caveat story. "fixed-interval"
   * (the default) is bossChargedMoveFrequencySeconds above, jittered +/-40%,
   * unchanged from this project's original behavior. "energy-driven" instead
   * derives cadence from the boss's own energy gained from damage taken, and
   * makes bossChargedMoveFrequencySeconds above stop mattering entirely — see
   * AssumptionPanel's render of BOSS_FREQUENCY_INAPPLICABLE_HINT below.
   */
  bossChargedMoveCadence: BossChargedMoveCadence;
  partySize: number;
  teammateDps: number;
  /** How many of partySize match the lead candidate's boosted type — see convertUptimeToTeamDamage. The rest still get a smaller, non-zero boost, never none. */
  matchingTeammateCount: number;
  /** Whether the boss starts the fight already partway charged (see bossStartingEnergyFraction). */
  bossStartsPrimed: boolean;
  /** Fraction (0-1) of the boss's first charged move's energy cost it starts with, when bossStartsPrimed is true. */
  bossStartingEnergyFraction: number;
  /**
   * Active weather condition — boosts whichever move type it favors (see
   * WeatherSelect.tsx / weather.ts's WEATHER_BOOSTED_TYPES) by 1.2x, for
   * BOTH the candidate's and the boss's own moves independently, checked
   * against each move's own type. "none" (the default) models no weather, the
   * pre-existing implicit behavior.
   */
  weather: WeatherCondition;
  /**
   * Gates visibility of the dodge group (`dodge`, `dodgeFastAttacks`, and
   * both candidates' `candidateDodge`/`candidateDodgeFastAttacks`
   * overrides), `holdChargedMoveUntilSafe`, `minFightLengthSeconds`
   * ("extend simulated window"), and `bossChargedMoveFrequencySeconds` in
   * the assumption panel — `false` (the default for a fresh scenario) hides
   * them behind their current stored values (usually the documented
   * defaults) so a first-time user isn't confronted with a wall of
   * dodge/timing knobs; `true` reveals them for direct editing. This is
   * purely a DISPLAY gate — every one of those fields still exists and
   * still drives the simulation regardless of this flag. The one exception
   * is `bossChargedMoveFrequencySeconds` itself: while this is `false`, the
   * run module derives an effective value from the selected boss's own
   * fast-move charge time instead of reading the stored field verbatim (see
   * run/runComparator.ts's `effectiveBossChargedMoveFrequencySeconds`,
   * which shares its derivation with run/runTeamRaid.ts's identical field
   * via run/effectiveBossChargedMoveFrequency.ts) — pending further
   * research, this is a placeholder approximation, not a modeled mechanic.
   * Mirrors `TeamAssumptions.showDetailedAssumptions` exactly, including the
   * one asymmetry that matters: an ABSENT value on decode resolves to
   * `true` here (never `false`, this field's own DEFAULT_ASSUMPTIONS value)
   * — see ComparatorView's `scenarioToAssumptions` for why.
   */
  showDetailedAssumptions: boolean;
}

interface Props {
  value: Assumptions;
  onChange: (next: Assumptions) => void;
  candidateOptions: SpeciesPickerOption[];
  targetOptions: SpeciesPickerOption[];
  unmatchedRaids: { raidName: string; tier: string }[];
  /** Resolved species for the two candidates/boss, so this panel can read their movepools for the MoveSelect controls below — null while a selection doesn't resolve (e.g. a stale scenario id). */
  candidateSpecies: [SpeciesDefinition | null, SpeciesDefinition | null];
  bossSpecies: SpeciesDefinition | null;
  /**
   * Physically-derived "boss ready for its first charged move" time for the
   * currently-selected target (see bossChargedMoveReadySeconds), or null if
   * the target has no resolvable charged move. Computed in App.tsx, where the
   * resolved boss SpeciesDefinition lives — this panel only displays it.
   */
  bossReadySeconds: number | null;
  /** 100 - the selected candidates' charged-move energy cost (MAX_ENERGY - energyCost), for the "energy buffer" display next to holdChargedMoveUntilSafe. Computed in App.tsx from the resolved candidates. */
  energyBuffers: { name: string; buffer: number }[];
  /** Auto-computed natural minimum for the chart window (before any minFightLengthSeconds override) — shown so the user knows what they're extending past. */
  naturalFightLengthSeconds: number | null;
  /**
   * The boss charged-move mean frequency actually driving THIS run — either
   * the stored value (showDetailedAssumptions true) or the derived one
   * (false), computed by runComparatorScenario. Used both for the "Simple
   * assumptions in force" summary line and to seed
   * bossChargedMoveFrequencySeconds when the user checks "More detailed
   * assumptions" on, so flipping that checkbox doesn't itself change any
   * result. Mirrors TeamAssumptionPanel's own prop of the same name.
   */
  effectiveBossChargedMoveFrequencySeconds: number;
}

/**
 * Whether a candidate currently has a mega/primal boost mechanic that's
 * actually live — a genuinely non-mega species (no `.boost` at all) or one
 * with its per-candidate "disable mega/primal boost" checkbox ticked both
 * count as no boost. Mirrors App.tsx's own `resolveBoost(species, disabled)`
 * exactly (species.boost if not disabled, else undefined) — not imported
 * directly to avoid a circular import (App.tsx already imports `Assumptions`
 * from this file), so kept as a small local equivalent instead of a second,
 * divergent reimplementation of any real math (this is trivial field access,
 * same as the original).
 */
function hasActiveBoost(species: SpeciesDefinition | null, disabled: boolean): boolean {
  return !!species?.boost && !disabled;
}

/** Human-readable label for the "Simple assumptions in force" summary and other plain-text renderings of a DodgeBehavior's kind. */
function dodgeKindLabel(kind: DodgeBehavior["kind"]): string {
  switch (kind) {
    case "none":
      return "None";
    case "perfect":
      return "Perfect";
    case "percentage-missed":
      return "Percentage missed";
  }
}

/**
 * Pure, testable core of the per-candidate dodge-override checkbox
 * (CandidateDodgeOverride below) — exported so packages/web's own vitest
 * suite can assert the seed/clear behavior directly, without rendering.
 * Checking the box seeds BOTH override fields from whatever the SHARED
 * dodge/dodgeFastAttacks settings currently are, so ticking it on never
 * itself changes a result — only unlocks per-candidate editing (same "seed
 * on check" convention as TeamAssumptionPanel's showDetailedAssumptions
 * checkbox). Unchecking always returns BOTH fields to `null` together — an
 * override is all-or-nothing per candidate, never a stale half-set pair.
 */
export function setCandidateDodgeOverriding(value: Assumptions, index: 0 | 1, checked: boolean): Assumptions {
  const candidateDodge: [DodgeBehavior | null, DodgeBehavior | null] = [...value.candidateDodge];
  const candidateDodgeFastAttacks: [boolean | null, boolean | null] = [...value.candidateDodgeFastAttacks];
  candidateDodge[index] = checked ? value.dodge : null;
  candidateDodgeFastAttacks[index] = checked ? value.dodgeFastAttacks : null;
  return { ...value, candidateDodge, candidateDodgeFastAttacks };
}

/**
 * Per-candidate override for the shared "Dodge boss's charged attacks" /
 * "Also dodge boss's fast attacks?" controls further down this panel — one
 * instance rendered under each candidate's move pickers (index 0 = A,
 * index 1 = B), only while showDetailedAssumptions is on (see this panel's
 * own gating below). `null` in both
 * Assumptions.candidateDodge/candidateDodgeFastAttacks means "use the
 * shared setting" for that candidate — surfaced here as a single checkbox
 * ("Override dodge settings for this candidate") rather than a per-field
 * "same as shared" sentinel option, per the user's explicit request:
 * ticking it "auto turn[s] off the shared ones" for THIS candidate only
 * (the other candidate, if not also overridden, keeps using the shared
 * setting — see the "Overridden for..." note next to the shared controls
 * below, which makes that legible rather than just removing the shared
 * control).
 */
function CandidateDodgeOverride({
  value,
  index,
  onChange,
}: {
  value: Assumptions;
  index: 0 | 1;
  onChange: (next: Assumptions) => void;
}) {
  const dodgeOverride = value.candidateDodge[index];
  const fastOverride = value.candidateDodgeFastAttacks[index];
  const isOverriding = dodgeOverride !== null || fastOverride !== null;
  const idPrefix = index === 0 ? "candidate-a" : "candidate-b";
  // Falls back to the shared setting for DISPLAY only — normally
  // unreachable once this checkbox is the only writer (it always sets both
  // fields together), but a share link built by the old per-field "same as
  // shared" selects could carry just one of the pair set.
  const currentDodge = dodgeOverride ?? value.dodge;
  const currentFast = fastOverride ?? value.dodgeFastAttacks;

  function setDodgeOverride(next: DodgeBehavior) {
    const candidateDodge: [DodgeBehavior | null, DodgeBehavior | null] = [...value.candidateDodge];
    candidateDodge[index] = next;
    onChange({ ...value, candidateDodge });
  }

  function setFastOverride(next: boolean) {
    const candidateDodgeFastAttacks: [boolean | null, boolean | null] = [...value.candidateDodgeFastAttacks];
    candidateDodgeFastAttacks[index] = next;
    onChange({ ...value, candidateDodgeFastAttacks });
  }

  return (
    <div
      className={`species-picker-hint${isOverriding ? " candidate-dodge-override-active" : ""}`}
      style={{ display: "block", marginTop: 6 }}
    >
      <label
        htmlFor={`${idPrefix}-dodge-override-toggle`}
        style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: isOverriding ? 700 : undefined, cursor: "pointer" }}
      >
        <input
          id={`${idPrefix}-dodge-override-toggle`}
          type="checkbox"
          checked={isOverriding}
          onChange={(e) => onChange(setCandidateDodgeOverriding(value, index, e.target.checked))}
          title="Overrides the shared dodge settings below for just this candidate — lets you compare, e.g., a bulky pick played with no dodging against a glass cannon played with perfect dodging. Turns the shared setting off for THIS candidate only; the other candidate keeps using it unless it has its own override checked too."
        />
        Override dodge settings for this candidate{isOverriding && " (active — differs from the shared setting below)"}
      </label>
      {isOverriding && (
        <>
          <select
            id={`${idPrefix}-dodge-override`}
            value={currentDodge.kind}
            onChange={(e) => {
              const kind = e.target.value as DodgeBehavior["kind"];
              setDodgeOverride(kind === "percentage-missed" ? { kind, missedFraction: 0.5 } : ({ kind } as DodgeBehavior));
            }}
            style={{ marginTop: 4 }}
            title="This candidate's own charged-attack dodge setting, independent of the shared one below."
          >
            <option value="none">None</option>
            <option value="perfect">Perfect</option>
            <option value="percentage-missed">Percentage missed</option>
          </select>
          {currentDodge.kind === "percentage-missed" && (
            <NumberField
              min={0}
              max={1}
              step={0.05}
              value={currentDodge.missedFraction}
              onChange={(v) => setDodgeOverride({ kind: "percentage-missed", missedFraction: v ?? 0 })}
              style={{ marginTop: 4, display: "block" }}
              title="Fraction of this candidate's charged hits NOT dodged."
            />
          )}
          <select
            id={`${idPrefix}-dodge-fast-override`}
            value={currentFast ? "yes" : "no"}
            onChange={(e) => setFastOverride(e.target.value === "yes")}
            style={{ marginTop: 4 }}
            title="This candidate's own fast-attack dodge setting, independent of the shared one below."
          >
            <option value="no">Fast-attack dodge: No</option>
            <option value="yes">Fast-attack dodge: Yes</option>
          </select>
        </>
      )}
    </div>
  );
}

/**
 * Always-visible assumption panel (Phase 4, point 9). Every conclusion this
 * tool produces is conditional on these — nothing is rendered as a single
 * ranked number without this panel attached above it.
 *
 * There is no "combat phase" selector here on purpose: the fight is one
 * continuous simulation, and whether the boss has thrown a charged move yet
 * is a computed fact (see "Boss ready for its first charged move" below),
 * not a mode the user picks.
 */
export function AssumptionPanel({
  value,
  onChange,
  candidateOptions,
  targetOptions,
  unmatchedRaids,
  candidateSpecies,
  bossSpecies,
  bossReadySeconds,
  energyBuffers,
  naturalFightLengthSeconds,
  effectiveBossChargedMoveFrequencySeconds,
}: Props) {
  function set<K extends keyof Assumptions>(key: K, next: Assumptions[K]) {
    onChange({ ...value, [key]: next });
  }

  function setShowDetailedAssumptions(checked: boolean) {
    onChange(
      checked
        // Seed the stored field with whatever value is ACTUALLY in force
        // right now (the derived one, since we're coming from simple mode)
        // so checking this box on doesn't itself change any result — only
        // unlocks the field for further editing. Mirrors
        // TeamAssumptionPanel's identical setShowDetailedAssumptions.
        ? { ...value, showDetailedAssumptions: true, bossChargedMoveFrequencySeconds: effectiveBossChargedMoveFrequencySeconds }
        : { ...value, showDetailedAssumptions: false },
    );
  }

  const selectedBossChargedMove = bossSpecies
    ? (bossSpecies.chargedMoves.find((m) => m.id === value.bossChargedMoveId) ?? bossSpecies.chargedMoves[0])
    : undefined;
  const bossChargedMoveIsUndodgeable = selectedBossChargedMove?.perfectlyDodgeable === false;

  // The "other trainers" party inputs below only affect anything when at
  // least one candidate has a live mega/primal boost to attribute team damage
  // from — a pure no-op group otherwise (both non-mega, or both disabled),
  // so it's hidden entirely rather than shown next to an inert "N/A" result.
  // Recomputed on every render, so toggling a species or a disable-checkbox
  // shows/hides this live, not just once on mount.
  const anyBoostActive =
    hasActiveBoost(candidateSpecies[0], value.candidateMegaBoostDisabled[0]) ||
    hasActiveBoost(candidateSpecies[1], value.candidateMegaBoostDisabled[1]);

  // Type-effectiveness opponents for the move pickers below (display-only —
  // see MoveSelect.tsx's own `opponents` prop doc comment). A candidate's
  // own move pickers measure against the boss (one entry); the boss's own
  // move pickers measure against whichever of the two candidates currently
  // resolve (up to two, each tagged by its own letter so the reader never
  // has to guess which chip belongs to which candidate).
  const bossOpponent: MoveSelectOpponent[] = bossSpecies ? [{ label: "Boss", types: bossSpecies.types }] : [];
  const candidateOpponents: MoveSelectOpponent[] = [
    ...(candidateSpecies[0] ? [{ label: "A", types: candidateSpecies[0].types }] : []),
    ...(candidateSpecies[1] ? [{ label: "B", types: candidateSpecies[1].types }] : []),
  ];

  // Which candidates currently have an active per-candidate dodge override
  // (CandidateDodgeOverride above) — surfaced as a note next to the SHARED
  // dodge controls below so "the checkbox auto turns off the shared ones"
  // is legible there too, not just at the override checkbox itself. The
  // shared control is never removed or disabled — the other candidate (if
  // not also overridden) still uses it.
  const overriddenCandidateNames = (["A", "B"] as const)
    .filter((_, i) => value.candidateDodge[i] !== null || value.candidateDodgeFastAttacks[i] !== null)
    .map((letter) => `Candidate ${letter}`);

  // Built as one plain string (not interleaved JSX expressions) so line
  // wrapping in this source file can't silently eat a space the way JSX's
  // own whitespace-collapsing rules once did in DamageOverTimeChart.tsx's
  // ranking-flip sentence (an `{expr}` immediately followed by a newline
  // then text loses the space entirely) — every value here is read live off
  // `value`, not a hardcoded "typical default", so this stays accurate even
  // if a user set something non-default before unchecking the box.
  const simpleAssumptionsSummary = value.showDetailedAssumptions
    ? null
    : [
        `Dodge boss's charged attacks: ${dodgeKindLabel(value.dodge.kind)}${
          value.dodge.kind === "percentage-missed" ? ` (${Math.round(value.dodge.missedFraction * 100)}% missed)` : ""
        }`,
        `also dodge fast attacks: ${value.dodgeFastAttacks ? "yes" : "no"}`,
        `hold charged move for a safer moment: ${value.holdChargedMoveUntilSafe ? "yes" : "no"}`,
        value.minFightLengthSeconds > 0
          ? `chart window extended to at least ${value.minFightLengthSeconds}s`
          : "chart window not extended",
        `boss charged-move mean frequency ~${effectiveBossChargedMoveFrequencySeconds.toFixed(1)}s (derived from this boss's own fast-move charge time — a placeholder pending improvement, not this boss's confirmed real cadence)`,
      ].join("; ") +
      ". Any per-candidate dodge override set earlier stays in force but is hidden here — check the box above to see or change it.";

  return (
    <CollapsibleSection id="comparator-assumptions" heading="Assumptions" defaultOpen={false}>
      <div className="assumption-grid">
        <div>
          <SpeciesPicker
            idPrefix="candidate-a"
            label="Candidate A"
            options={candidateOptions}
            value={value.candidateAId}
            onChange={(id) =>
              // A previously-picked move id almost certainly doesn't exist on
              // the new species, so reset both back to "use first move" in
              // the same update rather than leaving a stale/invalid id.
              onChange({ ...value, candidateAId: id, candidateAFastMoveId: null, candidateAChargedMoveId: null })
            }
            primary
          />
          {candidateSpecies[0] && (
            <>
              <MoveSelect
                idPrefix="candidate-a-fast"
                label="Candidate A fast move"
                moves={candidateSpecies[0].fastMoves}
                kind="fast"
                value={value.candidateAFastMoveId}
                onChange={(id) => set("candidateAFastMoveId", id)}
                opponents={bossOpponent}
              />
              <MoveSelect
                idPrefix="candidate-a-charged"
                label="Candidate A charged move"
                moves={candidateSpecies[0].chargedMoves}
                kind="charged"
                value={value.candidateAChargedMoveId}
                onChange={(id) => set("candidateAChargedMoveId", id)}
                opponents={bossOpponent}
              />
              {candidateSpecies[0].boost && (
                <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={value.candidateMegaBoostDisabled[0]}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        candidateMegaBoostDisabled: [e.target.checked, value.candidateMegaBoostDisabled[1]],
                      })
                    }
                    title="Treats this candidate as if it had no mega/primal boost mechanic at all — both its own move damage boost AND its team-damage attribution — so it can be compared fairly against a non-mega species."
                  />{" "}
                  Disable mega/primal boost (fair DPS comparison vs. non-mega)
                </label>
              )}
              <MegaLevelSelect
                idPrefix="candidate-a"
                species={candidateSpecies[0]}
                value={value.candidateMegaLevel[0]}
                onChange={(level) => onChange({ ...value, candidateMegaLevel: [level, value.candidateMegaLevel[1]] })}
              />
              {(() => {
                const shadowState = shadowToggleUiState(candidateSpecies[0]);
                return (
                  <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={shadowState.forcedOn || value.candidateShadow[0]}
                      disabled={shadowState.disabled}
                      onChange={(e) =>
                        onChange({ ...value, candidateShadow: [e.target.checked, value.candidateShadow[1]] })
                      }
                      title={shadowState.title}
                    />{" "}
                    Shadow
                  </label>
                );
              })()}
              {value.showDetailedAssumptions && <CandidateDodgeOverride value={value} index={0} onChange={onChange} />}
            </>
          )}
        </div>
        <div>
          <SpeciesPicker
            idPrefix="candidate-b"
            label="Candidate B"
            options={candidateOptions}
            value={value.candidateBId}
            onChange={(id) =>
              onChange({ ...value, candidateBId: id, candidateBFastMoveId: null, candidateBChargedMoveId: null })
            }
            primary
          />
          {candidateSpecies[1] && (
            <>
              <MoveSelect
                idPrefix="candidate-b-fast"
                label="Candidate B fast move"
                moves={candidateSpecies[1].fastMoves}
                kind="fast"
                value={value.candidateBFastMoveId}
                onChange={(id) => set("candidateBFastMoveId", id)}
                opponents={bossOpponent}
              />
              <MoveSelect
                idPrefix="candidate-b-charged"
                label="Candidate B charged move"
                moves={candidateSpecies[1].chargedMoves}
                kind="charged"
                value={value.candidateBChargedMoveId}
                onChange={(id) => set("candidateBChargedMoveId", id)}
                opponents={bossOpponent}
              />
              {candidateSpecies[1].boost && (
                <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={value.candidateMegaBoostDisabled[1]}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        candidateMegaBoostDisabled: [value.candidateMegaBoostDisabled[0], e.target.checked],
                      })
                    }
                    title="Treats this candidate as if it had no mega/primal boost mechanic at all — both its own move damage boost AND its team-damage attribution — so it can be compared fairly against a non-mega species."
                  />{" "}
                  Disable mega/primal boost (fair DPS comparison vs. non-mega)
                </label>
              )}
              <MegaLevelSelect
                idPrefix="candidate-b"
                species={candidateSpecies[1]}
                value={value.candidateMegaLevel[1]}
                onChange={(level) => onChange({ ...value, candidateMegaLevel: [value.candidateMegaLevel[0], level] })}
              />
              {(() => {
                const shadowState = shadowToggleUiState(candidateSpecies[1]);
                return (
                  <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={shadowState.forcedOn || value.candidateShadow[1]}
                      disabled={shadowState.disabled}
                      onChange={(e) =>
                        onChange({ ...value, candidateShadow: [value.candidateShadow[0], e.target.checked] })
                      }
                      title={shadowState.title}
                    />{" "}
                    Shadow
                  </label>
                );
              })()}
              {value.showDetailedAssumptions && <CandidateDodgeOverride value={value} index={1} onChange={onChange} />}
            </>
          )}
        </div>
        <div>
          <SpeciesPicker
            idPrefix="target"
            label="Raid target"
            options={targetOptions}
            value={value.targetId}
            onChange={(id) => onChange({ ...value, targetId: id, bossFastMoveId: null, bossChargedMoveId: null })}
            primary
          />
          {unmatchedRaids.length > 0 && (
            <p className="species-picker-hint" title="These raids are currently active but have no usable stat data yet.">
              Other raids currently live in-game that this tool can't model yet (no stat data available):{" "}
              {unmatchedRaids.map((r) => `${r.raidName} (${r.tier})`).join(", ")}
            </p>
          )}
          {bossSpecies && (
            <>
              <MoveSelect
                idPrefix="boss-fast"
                label="Boss fast move"
                moves={bossSpecies.fastMoves}
                kind="fast"
                value={value.bossFastMoveId}
                onChange={(id) => set("bossFastMoveId", id)}
                opponents={candidateOpponents}
              />
              <MoveSelect
                idPrefix="boss-charged"
                label="Boss charged move"
                moves={bossSpecies.chargedMoves}
                kind="charged"
                value={value.bossChargedMoveId}
                onChange={(id) => set("bossChargedMoveId", id)}
                opponents={candidateOpponents}
              />
            </>
          )}
        </div>

        <div>
          <div className="field">
            <label htmlFor="level">Level (both candidates)</label>
            <NumberField
              id="level"
              min={1}
              max={MAX_POKEMON_POWER_UP_LEVEL}
              step={0.5}
              value={value.level}
              onChange={(v) => set("level", v ?? 1)}
            />
          </div>

          <div className="iv-row">
            <div className="field">
              <label htmlFor="ivAttack">Attack IV</label>
              <NumberField
                id="ivAttack"
                className="iv-input"
                min={0}
                max={15}
                value={value.ivAttack}
                onChange={(v) => set("ivAttack", v ?? 0)}
              />
            </div>
            <div className="field">
              <label htmlFor="ivDefense">Defense IV</label>
              <NumberField
                id="ivDefense"
                className="iv-input"
                min={0}
                max={15}
                value={value.ivDefense}
                onChange={(v) => set("ivDefense", v ?? 0)}
              />
            </div>
            <div className="field">
              <label htmlFor="ivStamina">Stamina IV</label>
              <NumberField
                id="ivStamina"
                className="iv-input"
                min={0}
                max={15}
                value={value.ivStamina}
                onChange={(v) => set("ivStamina", v ?? 0)}
              />
            </div>
          </div>
        </div>

        <div className="field">
          <label
            htmlFor="comparator-detailed-assumptions"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            title="Reveals the dodge controls, hold-for-safe-window, boss charged-move mean frequency, and the chart's extend-window override. Only changes what's SHOWN, never what's simulated — see &quot;Known caveats&quot; below for the full explanation."
          >
            <input
              id="comparator-detailed-assumptions"
              type="checkbox"
              checked={value.showDetailedAssumptions}
              onChange={(e) => setShowDetailedAssumptions(e.target.checked)}
            />
            More detailed assumptions
          </label>
        </div>

        {simpleAssumptionsSummary !== null && (
          <div className="field">
            <label>Simple assumptions in force</label>
            <p className="computed-value">{simpleAssumptionsSummary}</p>
          </div>
        )}

        {value.showDetailedAssumptions && (
          <>
            <div className="field">
              <label htmlFor="dodge">Dodge boss's charged attacks</label>
              <select
                id="dodge"
                value={value.dodge.kind}
                onChange={(e) => {
                  const kind = e.target.value as DodgeBehavior["kind"];
                  set(
                    "dodge",
                    kind === "percentage-missed" ? { kind, missedFraction: 0.5 } : ({ kind } as DodgeBehavior),
                  );
                }}
              >
                <option value="none">None</option>
                <option value="perfect">Perfect</option>
                <option value="percentage-missed">Percentage missed</option>
              </select>
              {overriddenCandidateNames.length > 0 && (
                <p className="species-picker-hint">
                  Overridden for {overriddenCandidateNames.join(" and ")} — see that candidate's own dodge override
                  above instead of this shared setting.
                </p>
              )}
            </div>

            {value.dodge.kind === "percentage-missed" && (
              <div className="field">
                <label htmlFor="missedFraction">Fraction of charged hits NOT dodged</label>
                <NumberField
                  id="missedFraction"
                  min={0}
                  max={1}
                  step={0.05}
                  value={value.dodge.missedFraction}
                  onChange={(v) => set("dodge", { kind: "percentage-missed", missedFraction: v ?? 0 })}
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="dodgeFastAttacks">Also dodge boss's fast attacks?</label>
              <select
                id="dodgeFastAttacks"
                value={value.dodgeFastAttacks ? "yes" : "no"}
                onChange={(e) => set("dodgeFastAttacks", e.target.value === "yes")}
                title="Dodging every fast attack costs 0.5s of your own attack cycle each time (see DODGE_COST_SECONDS) — usually not worth it, but can matter for a glass cannon. A separate yes/no from charged-attack dodging above, since these are different real decisions."
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </>
        )}

        <div className="field">
          <label>Boss ready for its first charged move</label>
          <p className="computed-value" title="A boss cannot use a charged move before its own fast move has generated enough energy for it — this is computed from the selected target's move data, not a free assumption.">
            {bossReadySeconds === null
              ? "unknown (target has no charged move data)"
              : value.bossStartsPrimed && bossReadySeconds === 0
                ? "0s — already primed, see below"
                : `~${bossReadySeconds.toFixed(1)}s`}
          </p>
        </div>

        <div className="field">
          <label htmlFor="bossStartsPrimed">Boss starts already partway charged?</label>
          <select
            id="bossStartsPrimed"
            value={value.bossStartsPrimed ? "yes" : "no"}
            onChange={(e) => set("bossStartsPrimed", e.target.value === "yes")}
            title="Models a mega tagging in mid-fight against a boss an earlier trainer's mega already left partway (or fully) charged, instead of a fight that always starts at 0 boss energy."
          >
            <option value="no">No — fight starts at 0 boss energy</option>
            <option value="yes">Yes — boss already has some energy saved</option>
          </select>
        </div>

        {value.bossStartsPrimed && (
          <div className="field">
            <label htmlFor="bossStartingEnergyFraction">Boss starting energy (% of its charged-move cost)</label>
            <NumberField
              id="bossStartingEnergyFraction"
              min={0}
              max={100}
              step={5}
              value={Math.round(value.bossStartingEnergyFraction * 100)}
              onChange={(v) => set("bossStartingEnergyFraction", Math.min(1, Math.max(0, (v ?? 0) / 100)))}
              title="100% means the boss can fire immediately."
            />
          </div>
        )}

        <WeatherSelect idPrefix="candidate" value={value.weather} onChange={(w) => set("weather", w)} />

        <BossCadenceSelect idPrefix="candidate" value={value.bossChargedMoveCadence} onChange={(v) => set("bossChargedMoveCadence", v)} />

        {value.showDetailedAssumptions && (
          <div className="field">
            <label htmlFor="bossFreq">
              Boss charged-move mean frequency (s)
              {value.bossChargedMoveCadence === "energy-driven" && " (inactive)"}
            </label>
            <NumberField
              id="bossFreq"
              min={1}
              value={value.bossChargedMoveFrequencySeconds}
              onChange={(v) => set("bossChargedMoveFrequencySeconds", v ?? 1)}
              disabled={value.bossChargedMoveCadence === "energy-driven"}
              title="Mean seconds between the boss's charged moves once it's ready to use them (randomized +/-40% per run). Below the boss charged-move duration (commonly 2-3s) its attacks overlap, so dodging cannot help and the dodge setting stops affecting results entirely."
            />
            {value.bossChargedMoveCadence === "energy-driven" && (
              <p className="species-picker-hint">{BOSS_FREQUENCY_INAPPLICABLE_HINT}</p>
            )}
          </div>
        )}

        {value.showDetailedAssumptions && (
          <div className="field">
            <label htmlFor="holdChargedMove">Hold charged move for a safer moment?</label>
            <select
              id="holdChargedMove"
              value={value.holdChargedMoveUntilSafe ? "yes" : "no"}
              onChange={(e) => set("holdChargedMoveUntilSafe", e.target.value === "yes")}
              title="Instead of firing the instant energy allows, wait until right after successfully dodging one of the boss's charged attacks (or until energy caps at 100, whichever comes first). Trades some DPS for avoiding your undodgeable cast window overlapping the boss's next hit."
            >
              <option value="no">No — fire as soon as ready</option>
              <option value="yes">Yes — wait for a safe window</option>
            </select>
            {value.holdChargedMoveUntilSafe && (
              <p className="species-picker-hint">
                {value.dodge.kind !== "perfect"
                  ? `This is meant to be used with "Dodge boss's charged attacks" set to Perfect — with dodging set to "${value.dodge.kind}", the safe-window trigger will rarely or never fire, so this degrades to just waiting for the energy cap.`
                  : bossChargedMoveIsUndodgeable
                    ? "The boss's selected charged move is flagged as not reliably perfectly-dodgeable, so the safe-window trigger won't fire against it — this degrades to just waiting for the energy cap."
                    : "Safe-window trigger active: will fire right after a dodged boss charged hit, or when energy caps, whichever comes first."}
                {energyBuffers.length > 0 && (
                  <>
                    {" "}Energy buffer (100 minus the move's cost — how much can be banked before more is wasted):{" "}
                    {energyBuffers.map((b) => `${b.name} ${b.buffer}`).join(", ")}
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {anyBoostActive && (
          <>
            <div className="field">
              <label htmlFor="partySize">Other trainers also in this raid (not this candidate)</label>
              <NumberField
                id="partySize"
                min={0}
                max={20}
                value={value.partySize}
                onChange={(v) => {
                  const partySize = v ?? 0;
                  onChange({ ...value, partySize, matchingTeammateCount: Math.min(value.matchingTeammateCount, partySize) });
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="teammateDps">Other trainers' DPS (each)</label>
              <NumberField
                id="teammateDps"
                min={0}
                step={0.1}
                value={value.teammateDps}
                onChange={(v) => set("teammateDps", v ?? 0)}
              />
            </div>
            <div className="field">
              <label htmlFor="matchingTeammateCount">Other trainers matching boost type (of {value.partySize})</label>
              <input
                id="matchingTeammateCount"
                type="range"
                min={0}
                max={value.partySize}
                step={1}
                value={value.matchingTeammateCount}
                onChange={(e) => set("matchingTeammateCount", Number(e.target.value))}
                title="How many of the other trainers simultaneously in this raid (each with their own single active Pokémon — the mega/primal boost only reaches other trainers' Pokémon, never this candidate's own bench) have their highest-DPS Pokémon share the lead candidate's boosted type and so get the full mega-boost multiplier — the rest still get a smaller, non-zero boost (real raid lobbies are rarely all-or-nothing on type)."
              />
              <span className="species-picker-hint">
                {value.matchingTeammateCount} matching / {value.partySize - value.matchingTeammateCount} off-type
              </span>
            </div>
          </>
        )}

        {value.showDetailedAssumptions && (
          <div className="field">
            <label htmlFor="minFightLength">Extend simulated window to at least (s)</label>
            <NumberField
              id="minFightLength"
              min={0}
              step={1}
              value={value.minFightLengthSeconds}
              onChange={(v) => set("minFightLengthSeconds", Math.max(0, v ?? 0))}
              title="The chart's window is auto-computed from how long each candidate actually survives — this can only stretch it further out (e.g. to see a longer horizon), never shrink it below that real outcome."
            />
            {naturalFightLengthSeconds !== null && (
              <span className="species-picker-hint">Natural minimum for this scenario: ~{naturalFightLengthSeconds.toFixed(1)}s</span>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
