import { type DodgeBehavior, type MegaLevel, type RosterSignificanceMode, type SpeciesDefinition, type WeatherCondition } from "@pogo-analyzer/engine";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { NumberField } from "./NumberField.js";
import { SpeciesPicker, type SpeciesPickerOption } from "./SpeciesPicker.js";
import { MoveSelect, type MoveSelectOpponent } from "./MoveSelect.js";
import { MegaLevelSelect } from "./megaLevelSelect.js";
import { SpeciesBadges } from "./SpeciesBadges.js";
import { WeatherSelect } from "./WeatherSelect.js";
import { effectiveIsShadow, shadowToggleUiState } from "./shadowToggle.js";
import { BOSS_FREQUENCY_INAPPLICABLE_HINT, BossCadenceSelect, type BossChargedMoveCadence } from "./bossCadence.js";
import { BossSetPanel } from "./BossSetPanel.js";
import type { PowerUpOptimizerMode, PowerUpRankBy } from "./powerUpOptimizerScenario.js";
import { resolveMultiRaidBossIds } from "./multiRaidBossSet.js";

/**
 * Soft sanity threshold for candy/XL-candy/stardust fields, which have no
 * natural game-rule upper bound to clamp to (unlike Level or an IV) — a
 * value above this renders a non-blocking hint rather than being rejected.
 * Deliberately generous (real in-game candy/stardust bags can legitimately
 * hold five- and six-figure amounts) — this exists only to catch the exact
 * "clicked once, typed over a pre-filled value, got a 100x-too-large
 * number" bug class, not to gatekeep a genuinely large stockpile.
 */
const CURRENCY_SANITY_THRESHOLD = 99_999;

/** One roster slot's own configuration — mirrors powerUpOptimizerScenario.ts's PowerUpScenarioSlot exactly, field for field. */
export interface PowerUpSlotAssumption {
  /** null = this slot is empty and never enters the fight/never gets a power-up candidate. */
  speciesId: string | null;
  /** null = use that species' first fast move. */
  fastMoveId: string | null;
  /** null = use that species' first charged move. */
  chargedMoveId: string | null;
  /** At most one slot across the roster may set this true — enforced both here (radio-exclusivity) and by runTeamRaid, which optimizePowerUps calls under the hood. */
  isMega: boolean;
  /**
   * This slot's own Mega Level (see megaLevelSelect.tsx / packages/engine/src/megaLevel.ts)
   * — mirrors PowerUpScenarioSlot.megaLevel exactly, same per-slot semantics
   * as Team Raid's own TeamSlotAssumption.megaLevel. `null` means no Mega
   * Level investment assumed (identical to `"base"`). Feeds the simulated
   * team-DPS numbers (optimizePowerUps/planPowerUpBudget both forward it
   * into the underlying team-raid re-simulation) AND the per-slot damage
   * ladder below (powerUpDamageLadder), so the two agree.
   */
  megaLevel: MegaLevel | null;
  /** Cost- AND combat-affecting: treats this slot's species as Shadow (see shadowToggle.ts). Mutually exclusive with isPurified and with this slot's own species carrying a `boost` — see PowerUpOptimizerView's normalizePowerUpAssumptions. */
  isShadow: boolean;
  /** Cost-ONLY: a 0.9x stardust/candy power-up discount (see powerUp.ts's PowerUpCostModifiers). Does not change this slot's combat stats. Mutually exclusive with isShadow (the engine throws if both are set — see powerUp.ts's powerUpStepCost). */
  isPurified: boolean;
  /** Cost-ONLY: a 50% stardust-only power-up discount (candy is unaffected). Does not change combat stats. Freely combinable with either isShadow or isPurified. */
  isLucky: boolean;
  /** This slot's CURRENT level — the optimizer has no roster-wide default to fall back to (unlike the Team Raid tab), every fielded slot needs its own explicit starting point. */
  level: number;
  ivAttack: number;
  ivDefense: number;
  ivStamina: number;
  /** Regular candy currently held for THIS species — caps which power-up candidates are affordable. */
  candyOnHand: number;
  /** XL candy currently held for THIS species — only relevant once this slot's level reaches costTable's xlCandyMinPokemonLevel. */
  xlCandyOnHand: number;
}

export function emptyPowerUpSlot(): PowerUpSlotAssumption {
  return {
    speciesId: null,
    fastMoveId: null,
    chargedMoveId: null,
    isMega: false,
    megaLevel: null,
    isShadow: false,
    isPurified: false,
    isLucky: false,
    level: 20,
    ivAttack: 15,
    ivDefense: 15,
    ivStamina: 15,
    candyOnHand: 0,
    xlCandyOnHand: 0,
  };
}

/**
 * One "what if I caught a fresh one instead" comparison (IDEAS.md #3, "add a
 * 7th") — multi-raid mode only. Mirrors engine's `HypotheticalCatchCandidate`
 * but WITHOUT its `id`/`ivs`/`fastMoveId`/`chargedMoveId` fields: this tab
 * fixes those at the run/runRosterPlanner.ts boundary (perfect 15/15/15 IVs,
 * the species' own default moveset — a deliberate "best case for a fresh
 * catch" simplification, not a fabricated stat line) so the UI only ever
 * needs a species and a raid-catch level. `speciesId: null` means this row is
 * blank and contributes nothing. MUST be a REAL, already-synced species —
 * `slotOptions`/`candidatePickerOptions()` is the SAME catalog every other
 * species picker on this tab already draws from, never a hand-typed entry
 * (see CLAUDE.md's standing rule against fabricated species reaching a live
 * picker).
 */
export interface HypotheticalCatchAssumption {
  speciesId: string | null;
  /** A real, achievable raid-catch level — 20 (ordinary) or 25 (weather-boosted). Not a general level field: this models "if I caught one today," not "if I invested to any level." */
  level: 20 | 25;
}

export function emptyHypotheticalCatch(): HypotheticalCatchAssumption {
  return { speciesId: null, level: 20 };
}

export interface PowerUpOptimizerAssumptions {
  /** Which of the tab's two computations is active — see powerUpOptimizerScenario.ts's PowerUpOptimizerMode. */
  mode: PowerUpOptimizerMode;
  /** Always exactly MAX_TEAM_RAID_SLOTS entries, in fight order — pad with empty slots rather than shortening the array. Single-raid mode only. */
  slots: PowerUpSlotAssumption[];
  /** Stardust currently held — shared across the whole roster (real Pokémon GO stardust is one account-wide pool, unlike candy which is per-species). */
  stardustOnHand: number;
  /** A shared, fungible Rare Candy pool — spendable as regular Candy on ANY fielded slot, only consumed by the fixed-budget plan below (not the per-candidate ranked table, which only ever draws on one slot's own candyOnHand). See powerUpOptimizerScenario.ts's own field doc comment for the confirmed 1:1 conversion. */
  rareCandyOnHand: number;
  /** Same shared-pool mechanic as rareCandyOnHand, for the wholly separate Rare Candy XL item (1:1 into XL Candy only). */
  rareCandyXlOnHand: number;
  targetId: string;
  bossFastMoveId: string | null;
  bossChargedMoveId: string | null;
  /** Governs dodging the boss's CHARGED attacks only — one shared assumption for the whole roster, same as Team Raid's own `dodge`. */
  dodge: DodgeBehavior;
  dodgeFastAttacks: boolean;
  holdChargedMoveUntilSafe: boolean;
  weather: WeatherCondition;
  bossChargedMoveFrequencySeconds: number;
  bossChargedMoveCadence: BossChargedMoveCadence;
  bossStartsPrimed: boolean;
  bossStartingEnergyFraction: number;
  raidTimerSeconds: number;
  swapCostSeconds: number;
  reviveCostSeconds: number;
  /** Which resource column the ranked candidate table is sorted by — display-only (never affects optimizePowerUps' own math), same "still a real setting" reasoning as Species Report's sortMode. Single-raid mode only. */
  rankBy: PowerUpRankBy;
  /** Multi-raid mode only — see powerUpOptimizerScenario.ts's multiRaidBossIds. AUTHORITATIVE for the sweep; never re-derived from the three filter fields below on scenario load — see multiRaidBossSet.ts. */
  multiRaidBossIds: string[];
  /** Multi-raid mode only — display-state restoration for BossSetPanel's own control. See multiRaidBossIds above for why the sweep itself never reads this directly. */
  multiRaidIncludePastRaids: boolean;
  /** Multi-raid mode only — see multiRaidIncludePastRaids. null = every tier. */
  multiRaidIncludedTiers: string[] | null;
  /** Multi-raid mode only — see multiRaidIncludePastRaids. */
  multiRaidMaxBossCount: number;
  /** Multi-raid mode only — account-wide candy on hand pooled per candyFamilyId. See RosterPlannerInputs.candyByFamilyId (rosterPlanner.ts) and PLAN §3.4. A family absent here is UNKNOWN candy, never 0. */
  candyByFamilyId: Record<string, { candy: number; xlCandy: number } | undefined>;
  /**
   * Multi-raid mode only — a SINGLE roster-wide Mega Level (see
   * megaLevelSelect.tsx / packages/engine/src/megaLevel.ts), unlike
   * single-raid mode's per-slot `megaLevel` above. A per-entry control isn't
   * practical across a ~150-200-entry imported roster, so this applies to
   * whichever ONE entry the roster planner fields as the mega/primal slot
   * (RosterEntry.canMega) in any given team it evaluates.
   *
   * Applied for real as of 2026-09-09: `rosterPlanner.ts` takes this as
   * `RosterPlannerInputs.megaLevel` (roster-wide), and BOTH `runRosterPlanner`
   * and `planRosterBudget` feed it into the simulated team DPS. The per-entry
   * gate still lives inside `runTeamRaid`, keyed on each entry own
   * `species.boost`, so a non-mega entry is unaffected by this value.
   */
  multiRaidMegaLevel: MegaLevel | null;
  /**
   * Multi-raid mode only — which candidates qualify as significant in the
   * ranked sweep and the fixed-budget plan (see rosterPlanner.ts's
   * `RosterSignificanceMode`). Threaded into BOTH `RosterPlannerInputs` and
   * `RosterBudgetInputs` from the SAME value (run/runRosterPlanner.ts's
   * `resolveRosterPlannerInputs`) — the ranked table and the committed
   * budget plan must never disagree about what counts. See
   * powerUpOptimizerScenario.ts's own field doc comment for why the decoded
   * default deliberately differs from DEFAULT_ASSUMPTIONS.
   */
  multiRaidSignificanceMode: RosterSignificanceMode;
  /**
   * Multi-raid mode only — IDEAS.md #11. When true, any pool entry whose
   * fast/charged move was GUESSED at import time (`fastMoveIsDefaulted`/
   * `chargedMoveIsDefaulted`, import/pokeGenieMatch.ts) is simulated on its
   * species' own highest-approximate-DPS move instead of `[0]` — see
   * run/runRosterPlanner.ts's `effectiveMoveIds` for the exact rule and why
   * it can never disagree with a hand-fixed Roster-tab entry (fixing an
   * entry there clears both `*IsDefaulted` flags, which is what actually
   * gates this substitution — there's no separate state to keep in sync).
   *
   * Two different questions, deliberately not conflated: OFF (the default)
   * answers "what should I power up TONIGHT" — the Pokémon you actually
   * have, including its real unknown moveset. ON answers "what's worth
   * INVESTING in" — a defaulted entry is no longer penalized for a moveset
   * this tool never actually confirmed. Scoped to multi-raid mode only: the
   * single-raid TM/second-charged-move optimizer (run/runPowerUpOptimizer.ts)
   * is a separate code path that must keep pricing only a moveset it
   * actually observed — see effectiveMoveIds' own doc comment for why this
   * function has no call site there.
   */
  multiRaidUseBestAvailableMoveset: boolean;
  /**
   * Multi-raid mode only — IDEAS.md #3 "add a 7th": species/level rows to
   * compare against a fresh catch, never priced (a fresh catch has no
   * stardust/candy cost, so it never competes for `planRosterBudget`'s joint
   * allocation — see rosterPlanner.ts's own `HypotheticalCatchCandidate` doc
   * comment). Kept as its OWN array rather than folded into `slots` (that
   * shape is single-raid-only and carries per-slot cost fields that make no
   * sense for something never owned). A row with `speciesId: null` is blank
   * and contributes nothing.
   */
  multiRaidHypotheticalCatches: HypotheticalCatchAssumption[];
  /** TM inventory — see powerUpOptimizerScenario.ts's own field doc comment. `null` = unknown, never gates candidate generation (single-raid mode only computes these candidates today; see run/runPowerUpOptimizer.ts). */
  fastTmOnHand: number | null;
  chargedTmOnHand: number | null;
  eliteFastTmOnHand: number | null;
  eliteChargedTmOnHand: number | null;
}

interface Props {
  value: PowerUpOptimizerAssumptions;
  onChange: (next: PowerUpOptimizerAssumptions) => void;
  slotOptions: SpeciesPickerOption[];
  targetOptions: SpeciesPickerOption[];
  unmatchedRaids: { raidName: string; tier: string }[];
  /** Resolved species per slot (same index as value.slots) — RAW, never toggle-applied, see shadowToggle.ts's file doc comment. */
  slotSpecies: (SpeciesDefinition | null)[];
  /** Resolved species per value.multiRaidHypotheticalCatches row (same index), same RAW convention as slotSpecies — used only for the badge/name preview next to each row's picker. */
  hypotheticalCatchSpecies: (SpeciesDefinition | null)[];
  bossSpecies: SpeciesDefinition | null;
  bossReadySeconds: number | null;
  bossHp: number | null;
  /** Multi-raid mode only — distinct candyFamilyId values present in the imported roster pool, each with a representative species name for display. Drives the minimal inline candy-on-hand editor (PLAN §3.4: "let you fill candy in inline, per FAMILY, for the rows you actually care about" — entering every family is not a real workflow). */
  rosterFamilyOptions: { familyId: string; label: string }[];
}

/**
 * Always-visible assumption panel for the Power-Up Optimizer — the 6-slot
 * roster builder (species/moves/mega/shadow/purified/lucky/level/IVs/candy-
 * on-hand PER SLOT, unlike Team Raid's roster-wide level/IVs) plus every
 * shared assumption (stardust on hand, rank-by, boss/dodge/weather/cadence/
 * timer/swap/revive) optimizePowerUps actually consumes. Modelled directly on
 * TeamAssumptionPanel.tsx's roster editor.
 */
export function PowerUpOptimizerAssumptionPanel({
  value,
  onChange,
  slotOptions,
  hypotheticalCatchSpecies,
  targetOptions,
  unmatchedRaids,
  slotSpecies,
  bossSpecies,
  bossReadySeconds,
  bossHp,
  rosterFamilyOptions,
}: Props) {
  function set<K extends keyof PowerUpOptimizerAssumptions>(key: K, next: PowerUpOptimizerAssumptions[K]) {
    onChange({ ...value, [key]: next });
  }

  function setMode(mode: PowerUpOptimizerMode) {
    if (mode === value.mode) return;
    // Switching INTO multi-raid mode with no boss set resolved yet gets a
    // real, non-empty default (today's active raids, no tier filter, capped
    // at the default 30) — same "a fresh state should demonstrate something
    // real, not an empty form" precedent every other tab's own DEFAULT_*
    // follows. Only auto-populates when truly empty, so re-toggling the mode
    // switch back and forth never clobbers a boss set the user already tuned.
    if (mode === "multi-raid" && value.multiRaidBossIds.length === 0) {
      const filters = {
        includePastRaids: value.multiRaidIncludePastRaids,
        includedTiers: value.multiRaidIncludedTiers,
        maxBossCount: value.multiRaidMaxBossCount,
      };
      onChange({ ...value, mode, multiRaidBossIds: resolveMultiRaidBossIds(filters) });
      return;
    }
    set("mode", mode);
  }

  function updateSlot(i: number, patch: Partial<PowerUpSlotAssumption>) {
    const next = value.slots.slice();
    next[i] = { ...next[i]!, ...patch };
    onChange({ ...value, slots: next });
  }

  function clearSlot(i: number) {
    updateSlot(i, emptyPowerUpSlot());
  }

  function setMegaSlot(i: number) {
    onChange({ ...value, slots: value.slots.map((s, j) => ({ ...s, isMega: j === i })) });
  }

  function clearAllMega() {
    onChange({ ...value, slots: value.slots.map((s) => ({ ...s, isMega: false })) });
  }

  const selectedBossChargedMove = bossSpecies
    ? (bossSpecies.chargedMoves.find((m) => m.id === value.bossChargedMoveId) ?? bossSpecies.chargedMoves[0])
    : undefined;
  const bossChargedMoveIsUndodgeable = selectedBossChargedMove?.perfectlyDodgeable === false;

  // Type-effectiveness opponents for the move pickers below (display-only —
  // see MoveSelect.tsx's own `opponents` prop doc comment), single-raid
  // mode only (the only mode with per-slot/boss move pickers at all — see
  // multi-raid's own roster-wide handling elsewhere). Each slot's own move
  // pickers measure against the boss (one entry); the boss's own move
  // pickers measure against every currently-resolved (non-empty) slot at
  // once, tagged by slot NUMBER, mirroring Team Raid's identical pattern.
  const bossOpponent: MoveSelectOpponent[] = bossSpecies ? [{ label: "Boss", types: bossSpecies.types }] : [];
  const slotOpponents: MoveSelectOpponent[] = slotSpecies
    .map((sp, i): MoveSelectOpponent | null => (sp ? { label: String(i + 1), types: sp.types } : null))
    .filter((o): o is MoveSelectOpponent => o !== null);

  return (
    <CollapsibleSection id="pu-assumptions" heading="Assumptions" defaultOpen={false}>
      <div className="tab-switcher" role="group" aria-label="Power-up optimizer mode" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`tab-button${value.mode === "single-raid" ? " active" : ""}`}
          onClick={() => setMode("single-raid")}
        >
          Single raid — 6-slot roster vs. one boss
        </button>
        <button
          type="button"
          className={`tab-button${value.mode === "multi-raid" ? " active" : ""}`}
          onClick={() => setMode("multi-raid")}
        >
          Multi-raid — whole imported roster vs. a boss set
        </button>
      </div>

      {value.mode === "multi-raid" && (
        <div>
          <BossSetPanel
            value={{
              includePastRaids: value.multiRaidIncludePastRaids,
              includedTiers: value.multiRaidIncludedTiers,
              maxBossCount: value.multiRaidMaxBossCount,
              bossIds: value.multiRaidBossIds,
            }}
            onChange={(next) =>
              onChange({
                ...value,
                multiRaidIncludePastRaids: next.includePastRaids,
                multiRaidIncludedTiers: next.includedTiers,
                multiRaidMaxBossCount: next.maxBossCount,
                multiRaidBossIds: next.bossIds,
              })
            }
          />

          <div style={{ marginTop: 12 }}>
            <MegaLevelSelect
              idPrefix="pu-multiraid"
              label="Mega Level (whichever roster entry is fielded as the mega/primal slot)"
              species={null}
              forceVisible
              value={value.multiRaidMegaLevel}
              onChange={(level) => set("multiRaidMegaLevel", level)}
            />
            <p className="species-picker-hint">
              Applies ROSTER-WIDE, to whichever entry can actually Mega Evolve — see "Known caveats" below for why
              (and for what Mega Level itself changes).
            </p>
          </div>

          <div style={{ marginTop: 12 }}>
            <label className="species-picker-hint">
              <input
                type="checkbox"
                checked={value.multiRaidSignificanceMode === "aggregate-or-per-boss"}
                onChange={(e) => set("multiRaidSignificanceMode", e.target.checked ? "aggregate-or-per-boss" : "aggregate-only")}
              />{" "}
              Also count a candidate that only helps against one boss, even if it doesn&rsquo;t move the average
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <label className="species-picker-hint">
              <input
                type="checkbox"
                checked={value.multiRaidUseBestAvailableMoveset}
                onChange={(e) => set("multiRaidUseBestAvailableMoveset", e.target.checked)}
              />{" "}
              For an entry with an unknown moveset, assume its best available move instead of penalizing it for a
              guess
            </label>
            <p
              className="species-picker-hint"
              title="OFF (default): what should I power up TONIGHT — simulates the Pokemon you actually have, guessed moveset and all. ON: what's worth INVESTING in — an entry the import never confirmed a moveset for is no longer under-ranked for that alone. Fixing an entry's moveset by hand on the Roster tab always overrides this, in either state."
            >
              Off answers &ldquo;what should I power up tonight&rdquo; (the roster you actually have). On answers
              &ldquo;what&rsquo;s worth investing in&rdquo; (don&rsquo;t penalize a guess). An entry you&rsquo;ve
              fixed by hand on the Roster tab is never affected either way.
            </p>
          </div>

          <div style={{ marginTop: 12 }}>
            <p className="field-group-label">What if you caught a fresh one? (IDEAS.md #3)</p>
            <p className="species-picker-hint">
              Compares a REAL species at a REAL raid-catch level against your whole boss set — never fabricated
              stats. Assumes PERFECT 15/15/15 IVs and this species&rsquo; own default moveset (the best case for a
              fresh catch, not a guarantee). Purely informational: never priced, never part of the fixed-budget
              plan below — a fresh catch has no stardust/candy cost to weigh against the entries you already own.
            </p>
            {value.multiRaidHypotheticalCatches.map((catchRow, i) => {
              const species = hypotheticalCatchSpecies[i] ?? null;
              return (
                <div key={i} className="team-slot-row" style={{ marginTop: 8 }}>
                  <div className="team-slot-header">
                    <strong>
                      Hypothetical catch {i + 1}
                      {species && <SpeciesBadges isHypothetical={species.isHypothetical} isShadow={species.isShadow} />}
                    </strong>
                    <div className="team-slot-order-buttons">
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "multiRaidHypotheticalCatches",
                            value.multiRaidHypotheticalCatches.filter((_, j) => j !== i),
                          )
                        }
                      >
                        remove
                      </button>
                    </div>
                  </div>
                  <SpeciesPicker
                    idPrefix={`pu-hypothetical-${i}`}
                    label={`Hypothetical catch ${i + 1} species`}
                    options={slotOptions}
                    value={catchRow.speciesId ?? ""}
                    onChange={(id) =>
                      set(
                        "multiRaidHypotheticalCatches",
                        value.multiRaidHypotheticalCatches.map((c, j) => (j === i ? { ...c, speciesId: id } : c)),
                      )
                    }
                  />
                  <div className="field">
                    <label htmlFor={`pu-hypothetical-${i}-level`}>Raid-catch level</label>
                    <select
                      id={`pu-hypothetical-${i}-level`}
                      value={catchRow.level}
                      onChange={(e) =>
                        set(
                          "multiRaidHypotheticalCatches",
                          value.multiRaidHypotheticalCatches.map((c, j) =>
                            j === i ? { ...c, level: Number(e.target.value) as 20 | 25 } : c,
                          ),
                        )
                      }
                    >
                      <option value={20}>20 (ordinary raid catch)</option>
                      <option value={25}>25 (weather-boosted raid catch)</option>
                    </select>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              style={{ marginTop: 8 }}
              onClick={() => set("multiRaidHypotheticalCatches", [...value.multiRaidHypotheticalCatches, emptyHypotheticalCatch()])}
            >
              Add hypothetical catch
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <p className="field-group-label">Candy on hand, per candy family (multi-raid mode)</p>
            <p
              className="species-picker-hint"
              title="Poke Genie exports no candy-on-hand column at all — every family starts UNKNOWN, not zero, and filling one in is what unlocks it for the fixed-budget plan below. See &quot;Known caveats&quot; below for the full explanation."
            >
              Every family starts UNKNOWN, not zero — fill in only what you care about. Pooled per candy FAMILY
              (e.g. Houndour and Houndoom share one pool), never per species; see "Known caveats" below for how a
              mega/primal entry's candy resolves.
            </p>
            {rosterFamilyOptions.length === 0 ? (
              <p className="species-picker-hint">No roster imported yet — import one below to see its candy families here.</p>
            ) : (
              <div className="table-scroll">
                <table className="time-series-table">
                  <thead>
                    <tr>
                      <th>Family (example species)</th>
                      <th>Candy on hand</th>
                      <th>XL candy on hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterFamilyOptions.map(({ familyId, label }) => {
                      const pool = value.candyByFamilyId[familyId];
                      return (
                        <tr key={familyId}>
                          <td>{label}</td>
                          <td>
                            <NumberField
                              min={0}
                              allowEmpty
                              value={pool?.candy}
                              placeholder="unknown"
                              warnAbove={CURRENCY_SANITY_THRESHOLD}
                              onChange={(candy) => {
                                const normalized = candy === undefined ? undefined : Math.max(0, Math.floor(candy || 0));
                                set("candyByFamilyId", {
                                  ...value.candyByFamilyId,
                                  [familyId]: normalized === undefined ? undefined : { candy: normalized, xlCandy: pool?.xlCandy ?? 0 },
                                });
                              }}
                            />
                          </td>
                          <td>
                            <NumberField
                              min={0}
                              allowEmpty
                              value={pool?.xlCandy}
                              placeholder="unknown"
                              warnAbove={CURRENCY_SANITY_THRESHOLD}
                              onChange={(xlCandy) => {
                                const normalized = xlCandy === undefined ? undefined : Math.max(0, Math.floor(xlCandy || 0));
                                set("candyByFamilyId", {
                                  ...value.candyByFamilyId,
                                  [familyId]: normalized === undefined ? undefined : { candy: pool?.candy ?? 0, xlCandy: normalized },
                                });
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {value.mode === "single-raid" && (
      <div style={{ marginBottom: 10 }}>
        <button type="button" onClick={clearAllMega} disabled={!value.slots.some((s) => s.isMega)}>
          No mega/primal this raid
        </button>
      </div>
      )}

      {value.mode === "single-raid" && (
      <div className="team-roster">
        {value.slots.map((slot, i) => {
          const species = slotSpecies[i];
          const shadowState = shadowToggleUiState(species);
          const shadowEffectivelyOn = effectiveIsShadow(species, slot.isShadow);
          const purifiedDisabled = shadowEffectivelyOn;
          const shadowDisabled = shadowState.disabled || slot.isPurified;
          return (
            <div className="team-slot-row" key={i}>
              <div className="team-slot-header">
                <strong>
                  Slot {i + 1}
                  <SpeciesBadges isHypothetical={species?.isHypothetical} isShadow={shadowEffectivelyOn} />
                </strong>
                <div className="team-slot-order-buttons">
                  <button type="button" onClick={() => clearSlot(i)} disabled={!slot.speciesId}>
                    clear
                  </button>
                </div>
              </div>
              <SpeciesPicker
                idPrefix={`pu-slot-${i}`}
                label={`Slot ${i + 1} species`}
                options={slotOptions}
                value={slot.speciesId ?? ""}
                onChange={(id) =>
                  // A previously-picked move id almost certainly doesn't exist
                  // on the new species — reset both back to "use first move"
                  // in the same update, same convention as every other tab.
                  updateSlot(i, { speciesId: id, fastMoveId: null, chargedMoveId: null })
                }
              />
              {species && (
                <>
                  <MoveSelect
                    idPrefix={`pu-slot-${i}-fast`}
                    label="Fast move"
                    moves={species.fastMoves}
                    kind="fast"
                    value={slot.fastMoveId}
                    onChange={(id) => updateSlot(i, { fastMoveId: id })}
                    opponents={bossOpponent}
                  />
                  <MoveSelect
                    idPrefix={`pu-slot-${i}-charged`}
                    label="Charged move"
                    moves={species.chargedMoves}
                    kind="charged"
                    value={slot.chargedMoveId}
                    onChange={(id) => updateSlot(i, { chargedMoveId: id })}
                    opponents={bossOpponent}
                  />
                  <div className="team-slot-flags">
                    <label className="species-picker-hint">
                      <input
                        type="radio"
                        name="pu-mega-slot"
                        checked={slot.isMega}
                        disabled={!species.boost}
                        onChange={() => setMegaSlot(i)}
                        title="Only one Pokémon may be Mega/Primal Evolved at a time, account-wide (real Pokémon GO restriction) — this radio enforces that across all 6 slots."
                      />{" "}
                      Mega/Primal for this raid{!species.boost ? " (no boost mechanic on this species)" : ""}
                    </label>
                  </div>
                  <MegaLevelSelect
                    idPrefix={`pu-slot-${i}`}
                    label="Mega Level"
                    species={species}
                    value={slot.megaLevel}
                    onChange={(level) => updateSlot(i, { megaLevel: level })}
                  />
                  <div className="team-slot-flags">
                    <label className="species-picker-hint">
                      <input
                        type="checkbox"
                        checked={shadowState.forcedOn || slot.isShadow}
                        disabled={shadowDisabled}
                        onChange={(e) => updateSlot(i, { isShadow: e.target.checked })}
                        title={slot.isPurified ? "Shadow and Purified are mutually exclusive — uncheck Purified first." : shadowState.title}
                      />{" "}
                      Shadow
                    </label>
                    <label className="species-picker-hint">
                      <input
                        type="checkbox"
                        checked={slot.isPurified}
                        disabled={purifiedDisabled}
                        onChange={(e) => updateSlot(i, { isPurified: e.target.checked })}
                        title={
                          purifiedDisabled
                            ? "Shadow and Purified are mutually exclusive — uncheck Shadow first."
                            : "Applies the Purified power-up cost discount (0.9x stardust and candy) — does not change this slot's combat stats."
                        }
                      />{" "}
                      Purified
                    </label>
                    <label className="species-picker-hint">
                      <input
                        type="checkbox"
                        checked={slot.isLucky}
                        onChange={(e) => updateSlot(i, { isLucky: e.target.checked })}
                        title="Applies the Lucky power-up cost discount (50% off stardust only — candy is unaffected). Does not change this slot's combat stats."
                      />{" "}
                      Lucky
                    </label>
                  </div>
                  <div className="field">
                    <label htmlFor={`pu-slot-${i}-level`}>Current level</label>
                    <NumberField
                      id={`pu-slot-${i}-level`}
                      min={1}
                      max={50}
                      step={0.5}
                      value={slot.level}
                      onChange={(v) => updateSlot(i, { level: v ?? 1 })}
                    />
                  </div>
                  <div className="iv-row">
                    <div className="field">
                      <label htmlFor={`pu-slot-${i}-ivAttack`}>Attack IV</label>
                      <NumberField
                        id={`pu-slot-${i}-ivAttack`}
                        className="iv-input"
                        min={0}
                        max={15}
                        value={slot.ivAttack}
                        onChange={(v) => updateSlot(i, { ivAttack: v ?? 0 })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`pu-slot-${i}-ivDefense`}>Defense IV</label>
                      <NumberField
                        id={`pu-slot-${i}-ivDefense`}
                        className="iv-input"
                        min={0}
                        max={15}
                        value={slot.ivDefense}
                        onChange={(v) => updateSlot(i, { ivDefense: v ?? 0 })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`pu-slot-${i}-ivStamina`}>Stamina IV</label>
                      <NumberField
                        id={`pu-slot-${i}-ivStamina`}
                        className="iv-input"
                        min={0}
                        max={15}
                        value={slot.ivStamina}
                        onChange={(v) => updateSlot(i, { ivStamina: v ?? 0 })}
                      />
                    </div>
                  </div>
                  <div className="iv-row">
                    <div className="field">
                      <label htmlFor={`pu-slot-${i}-candy`}>Candy on hand</label>
                      <NumberField
                        id={`pu-slot-${i}-candy`}
                        min={0}
                        value={slot.candyOnHand}
                        warnAbove={CURRENCY_SANITY_THRESHOLD}
                        onChange={(v) => updateSlot(i, { candyOnHand: Math.max(0, v ?? 0) })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`pu-slot-${i}-xlCandy`}>XL candy on hand</label>
                      <NumberField
                        id={`pu-slot-${i}-xlCandy`}
                        min={0}
                        value={slot.xlCandyOnHand}
                        warnAbove={CURRENCY_SANITY_THRESHOLD}
                        onChange={(v) => updateSlot(i, { xlCandyOnHand: Math.max(0, v ?? 0) })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      )}

      <div className="assumption-grid">
        <div>
        {value.mode === "single-raid" && (
        <>
          <SpeciesPicker
            idPrefix="pu-target"
            label="Raid target"
            options={targetOptions}
            value={value.targetId}
            onChange={(id) => onChange({ ...value, targetId: id, bossFastMoveId: null, bossChargedMoveId: null })}
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
                idPrefix="pu-boss-fast"
                label="Boss fast move"
                moves={bossSpecies.fastMoves}
                kind="fast"
                value={value.bossFastMoveId}
                onChange={(id) => set("bossFastMoveId", id)}
                opponents={slotOpponents}
              />
              <MoveSelect
                idPrefix="pu-boss-charged"
                label="Boss charged move"
                moves={bossSpecies.chargedMoves}
                kind="charged"
                value={value.bossChargedMoveId}
                onChange={(id) => set("bossChargedMoveId", id)}
                opponents={slotOpponents}
              />
            </>
          )}
        </>
        )}
        </div>

        <div className="field">
          <label htmlFor="pu-stardust">Stardust on hand</label>
          <NumberField
            id="pu-stardust"
            min={0}
            value={value.stardustOnHand}
            warnAbove={CURRENCY_SANITY_THRESHOLD}
            onChange={(v) => set("stardustOnHand", Math.max(0, v ?? 0))}
            title="One shared account-wide pool, unlike candy/XL candy which are held per-species (see each slot's own candy fields above)."
          />
        </div>

        <div className="field">
          <label htmlFor="pu-rareCandy">Rare Candy on hand</label>
          <NumberField
            id="pu-rareCandy"
            min={0}
            value={value.rareCandyOnHand}
            warnAbove={CURRENCY_SANITY_THRESHOLD}
            onChange={(v) => set("rareCandyOnHand", Math.max(0, v ?? 0))}
            title="A shared, account-wide pool — converts 1:1 into any species' regular Candy (never XL Candy). Only used by the fixed-budget plan below, after each slot's own candy on hand runs out."
          />
        </div>

        <div className="field">
          <label htmlFor="pu-rareCandyXl">Rare Candy XL on hand</label>
          <NumberField
            id="pu-rareCandyXl"
            min={0}
            value={value.rareCandyXlOnHand}
            warnAbove={CURRENCY_SANITY_THRESHOLD}
            onChange={(v) => set("rareCandyXlOnHand", Math.max(0, v ?? 0))}
            title="A separate shared, account-wide pool from plain Rare Candy — converts 1:1 into any species' XL Candy only. Only used by the fixed-budget plan below, after each slot's own XL candy on hand runs out."
          />
        </div>

        {value.mode === "single-raid" && (
          <>
            <div className="field">
              <label htmlFor="pu-fastTm">Fast TM on hand</label>
              <NumberField
                id="pu-fastTm"
                min={0}
                allowEmpty
                value={value.fastTmOnHand ?? undefined}
                placeholder="unknown"
                warnAbove={CURRENCY_SANITY_THRESHOLD}
                onChange={(v) => set("fastTmOnHand", v ?? null)}
                title="Leave blank if unknown — second-charged-move and Elite TM candidates below are still ranked either way; regular TMs are informational only (no lottery outcome is modeled, see &quot;Known caveats&quot;)."
              />
            </div>
            <div className="field">
              <label htmlFor="pu-chargedTm">Charged TM on hand</label>
              <NumberField
                id="pu-chargedTm"
                min={0}
                allowEmpty
                value={value.chargedTmOnHand ?? undefined}
                placeholder="unknown"
                warnAbove={CURRENCY_SANITY_THRESHOLD}
                onChange={(v) => set("chargedTmOnHand", v ?? null)}
                title="Leave blank if unknown — informational only (no regular-TM lottery is modeled, see &quot;Known caveats&quot;)."
              />
            </div>
            <div className="field">
              <label htmlFor="pu-eliteFastTm">Elite Fast TM on hand</label>
              <NumberField
                id="pu-eliteFastTm"
                min={0}
                allowEmpty
                value={value.eliteFastTmOnHand ?? undefined}
                placeholder="unknown"
                warnAbove={CURRENCY_SANITY_THRESHOLD}
                onChange={(v) => set("eliteFastTmOnHand", v ?? null)}
                title="Leave blank if unknown — every Elite Fast TM candidate is still ranked below; this only labels how many rows are within your current stock."
              />
            </div>
            <div className="field">
              <label htmlFor="pu-eliteChargedTm">Elite Charged TM on hand</label>
              <NumberField
                id="pu-eliteChargedTm"
                min={0}
                allowEmpty
                value={value.eliteChargedTmOnHand ?? undefined}
                placeholder="unknown"
                warnAbove={CURRENCY_SANITY_THRESHOLD}
                onChange={(v) => set("eliteChargedTmOnHand", v ?? null)}
                title="Leave blank if unknown — every Elite Charged TM candidate is still ranked below; this only labels how many rows are within your current stock."
              />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="pu-rankBy">Rank candidates by</label>
          <select
            id="pu-rankBy"
            value={value.rankBy}
            onChange={(e) => set("rankBy", e.target.value as PowerUpRankBy)}
            title="Display-only — never changes which candidates exist or their own numbers, only the sort order of the ranked table below (both modes). See &quot;Known caveats&quot; below for why stardust/candy stay separate."
          >
            <option value="stardust">Team-DPS gained per 1000 stardust</option>
            <option value="candy">Team-DPS gained per candy</option>
            <option value="xlCandy">Team-DPS gained per XL candy</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="pu-dodge">Dodge boss's charged attacks</label>
          <select
            id="pu-dodge"
            value={value.dodge.kind}
            onChange={(e) => {
              const kind = e.target.value as DodgeBehavior["kind"];
              set("dodge", kind === "percentage-missed" ? { kind, missedFraction: 0.5 } : ({ kind } as DodgeBehavior));
            }}
          >
            <option value="none">None</option>
            <option value="perfect">Perfect</option>
            <option value="percentage-missed">Percentage missed</option>
          </select>
        </div>

        {value.dodge.kind === "percentage-missed" && (
          <div className="field">
            <label htmlFor="pu-missedFraction">Fraction of charged hits NOT dodged</label>
            <NumberField
              id="pu-missedFraction"
              min={0}
              max={1}
              step={0.05}
              value={value.dodge.missedFraction}
              onChange={(v) => set("dodge", { kind: "percentage-missed", missedFraction: v ?? 0 })}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="pu-dodgeFastAttacks">Also dodge boss's fast attacks?</label>
          <select
            id="pu-dodgeFastAttacks"
            value={value.dodgeFastAttacks ? "yes" : "no"}
            onChange={(e) => set("dodgeFastAttacks", e.target.value === "yes")}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="pu-holdChargedMove">Hold charged move for a safer moment?</label>
          <select
            id="pu-holdChargedMove"
            value={value.holdChargedMoveUntilSafe ? "yes" : "no"}
            onChange={(e) => set("holdChargedMoveUntilSafe", e.target.value === "yes")}
            title="Applies to every slot identically. Meant to be paired with Perfect dodging — otherwise the safe-window trigger rarely fires and this degrades to just waiting for the energy cap."
          >
            <option value="no">No — fire as soon as ready</option>
            <option value="yes">Yes — wait for a safe window</option>
          </select>
          {value.holdChargedMoveUntilSafe && value.dodge.kind !== "perfect" && (
            <p className="species-picker-hint">
              This is meant to be used with dodging set to "Perfect" — with dodging set to "{value.dodge.kind}", the
              safe-window trigger will rarely or never fire.
            </p>
          )}
          {value.holdChargedMoveUntilSafe && bossChargedMoveIsUndodgeable && (
            <p className="species-picker-hint">
              The boss's selected charged move is flagged as not reliably perfectly-dodgeable, so the safe-window
              trigger won't fire against it.
            </p>
          )}
        </div>

        {value.mode === "single-raid" && (
        <>
        <div className="field">
          <label>Boss ready for its first charged move</label>
          <p className="computed-value">
            {bossReadySeconds === null
              ? "unknown (target has no charged move data)"
              : value.bossStartsPrimed && bossReadySeconds === 0
                ? "0s — already primed, see below"
                : `~${bossReadySeconds.toFixed(1)}s`}
          </p>
        </div>

        <div className="field">
          <label>Boss battle HP (this tier)</label>
          <p
            className="computed-value"
            title="A real boss's battle HP is a fixed per-tier pool (see raidBoss.ts's RAID_TIER_TABLE), not derived from its own baseStamina — this is the resource the roster's cumulative damage races against."
          >
            {bossHp === null ? "unknown" : bossHp.toLocaleString()}
          </p>
        </div>

        <div className="field">
          <label htmlFor="pu-bossStartsPrimed">Boss starts already partway charged?</label>
          <select
            id="pu-bossStartsPrimed"
            value={value.bossStartsPrimed ? "yes" : "no"}
            onChange={(e) => set("bossStartsPrimed", e.target.value === "yes")}
          >
            <option value="no">No — fight starts at 0 boss energy</option>
            <option value="yes">Yes — boss already has some energy saved</option>
          </select>
        </div>

        {value.bossStartsPrimed && (
          <div className="field">
            <label htmlFor="pu-bossStartingEnergyFraction">Boss starting energy (% of its charged-move cost)</label>
            <NumberField
              id="pu-bossStartingEnergyFraction"
              min={0}
              max={100}
              step={5}
              value={Math.round(value.bossStartingEnergyFraction * 100)}
              onChange={(v) => set("bossStartingEnergyFraction", Math.min(1, Math.max(0, (v ?? 0) / 100)))}
            />
          </div>
        )}
        </>
        )}

        <WeatherSelect idPrefix="pu" value={value.weather} onChange={(w) => set("weather", w)} />

        <BossCadenceSelect idPrefix="pu" value={value.bossChargedMoveCadence} onChange={(v) => set("bossChargedMoveCadence", v)} />

        <div className="field">
          <label htmlFor="pu-bossFreq">
            Boss charged-move mean frequency (s)
            {value.bossChargedMoveCadence === "energy-driven" && " (inactive)"}
          </label>
          <NumberField
            id="pu-bossFreq"
            min={1}
            value={value.bossChargedMoveFrequencySeconds}
            onChange={(v) => set("bossChargedMoveFrequencySeconds", v ?? 1)}
            disabled={value.bossChargedMoveCadence === "energy-driven"}
          />
          {value.bossChargedMoveCadence === "energy-driven" && (
            <p className="species-picker-hint">{BOSS_FREQUENCY_INAPPLICABLE_HINT}</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="pu-raidTimer">Raid timer</label>
          <select
            id="pu-raidTimer"
            value={value.raidTimerSeconds}
            onChange={(e) => set("raidTimerSeconds", Number(e.target.value))}
            title="Real, documented per-tier raid countdown — see &quot;Known caveats&quot; below for the source."
          >
            <option value={180}>180s — Tier 1/3 Raids</option>
            <option value={300}>300s — Mega/Legendary/Primal Raids</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="pu-swapCost">Swap-in cost per mid-roster faint (s)</label>
          <NumberField
            id="pu-swapCost"
            min={0}
            step={0.5}
            value={value.swapCostSeconds}
            onChange={(v) => set("swapCostSeconds", Math.max(0, v ?? 0))}
            title="No documented real value exists for this in-game (a 'brief revival screen pause' of unconfirmed duration) — defaults to 0 (fastest-possible play), an honest placeholder rather than a fabricated number."
          />
        </div>

        <div className="field">
          <label htmlFor="pu-reviveCost">Full-wipe revive-and-rejoin cost (s)</label>
          <NumberField
            id="pu-reviveCost"
            min={0}
            step={0.5}
            value={value.reviveCostSeconds}
            onChange={(v) => set("reviveCostSeconds", Math.max(0, v ?? 0))}
            title="Paid once every time the whole fielded roster faints out, before restarting from the first fielded slot — raid-clock time in which nothing is dealt. Defaults to 15s on this tab (within the community's ~12-15s lobby-rejoin estimate; no official figure exists). Set 0 to model instant, free revives."
          />
          <button type="button" onClick={() => set("reviveCostSeconds", 15)} style={{ marginTop: 4, alignSelf: "flex-start" }}>
            Reset to 15s (default — community ~12-15s estimate, unverified)
          </button>
        </div>
      </div>
    </CollapsibleSection>
  );
}
