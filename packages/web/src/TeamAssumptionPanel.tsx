import { MAX_TEAM_RAID_SLOTS, type DodgeBehavior, type MegaLevel, type SpeciesDefinition, type WeatherCondition } from "@pogo-analyzer/engine";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { SpeciesPicker, type SpeciesPickerOption } from "./SpeciesPicker.js";
import { MoveSelect } from "./MoveSelect.js";
import { MegaLevelSelect } from "./megaLevelSelect.js";
import { SpeciesBadges } from "./SpeciesBadges.js";
import { WeatherSelect } from "./WeatherSelect.js";
import { effectiveIsShadow, shadowToggleUiState } from "./shadowToggle.js";
import { BOSS_FREQUENCY_INAPPLICABLE_HINT, BossCadenceSelect, type BossChargedMoveCadence } from "./bossCadence.js";

/** One roster slot's own configuration — mirrors teamScenario.ts's TeamScenarioSlot exactly, field for field. */
export interface TeamSlotAssumption {
  /** null = this slot is empty and never enters the fight. */
  speciesId: string | null;
  /** null = use that species' first fast move. */
  fastMoveId: string | null;
  /** null = use that species' first charged move. */
  chargedMoveId: string | null;
  /** At most one slot across the roster may set this true — enforced both here (radio-exclusivity) and by the engine (runTeamRaid throws on a violation). */
  isMega: boolean;
  /**
   * This slot's own Mega Level (see megaLevelSelect.tsx / packages/engine/src/megaLevel.ts)
   * — mirrors TeamScenarioSlot.megaLevel exactly. Orthogonal to `isMega`
   * above (this slot's own boost already applies with or without `isMega`
   * set — see teamRaid.ts's TeamRaidSlotInput.megaLevel doc comment).
   * `null` means no Mega Level investment assumed (identical to `"base"`).
   * Silently has no effect for a slot whose species has no `boost` mechanic.
   */
  megaLevel: MegaLevel | null;
  /**
   * "Treat this slot's species as Shadow" — independent per slot, unlike
   * isMega above (which is exclusive across the whole roster). Mutually
   * exclusive with THIS slot's own species carrying a `boost` (see
   * shadow.ts's shadowAdjustedBaseStats) — forced back to false whenever
   * that's the case, see TeamRaidView's normalizeTeamAssumptions.
   */
  isShadow: boolean;
}

export function emptyTeamSlot(): TeamSlotAssumption {
  return { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null, isShadow: false };
}

export interface TeamAssumptions {
  /** Always exactly MAX_TEAM_RAID_SLOTS entries, in fight order — pad with empty slots rather than shortening the array. */
  slots: TeamSlotAssumption[];
  targetId: string;
  bossFastMoveId: string | null;
  bossChargedMoveId: string | null;
  /** One shared level/IV spread for the whole roster — same simplification precedent as the two-candidate comparator's Scenario.level/ivs. */
  level: number;
  ivAttack: number;
  ivDefense: number;
  ivStamina: number;
  /** Governs dodging the boss's CHARGED attacks only — one shared assumption for the whole roster (dodge skill is a property of the player, not of which of their own Pokémon is out). */
  dodge: DodgeBehavior;
  dodgeFastAttacks: boolean;
  holdChargedMoveUntilSafe: boolean;
  weather: WeatherCondition;
  bossChargedMoveFrequencySeconds: number;
  /**
   * Gates visibility of four advanced/placeholder knobs
   * (holdChargedMoveUntilSafe, bossChargedMoveFrequencySeconds,
   * swapCostSeconds, reviveCostSeconds) in the assumption panel — `false`
   * (the default) hides them behind simple, documented defaults so a
   * first-time user isn't confronted with four unconfirmed placeholder
   * numbers; `true` reveals them for direct editing. This is purely a
   * DISPLAY gate — every one of those fields still exists and still drives
   * the simulation regardless of this flag. The one exception is
   * bossChargedMoveFrequencySeconds itself: while this is `false`, the run
   * module derives an effective value from the selected boss's own
   * fast-move charge time instead of reading the stored field verbatim (see
   * runTeamRaid.ts's effectiveBossChargedMoveFrequencySeconds) — pending
   * further research, this is a placeholder approximation, not a modeled
   * mechanic.
   */
  showDetailedAssumptions: boolean;
  /**
   * Which model derives the boss's charged-move timing across the WHOLE
   * encounter (every slot, every cycle) — see bossCadence.tsx's
   * BOSS_CADENCE_HINT for the full sourcing/caveat story, and this feature's
   * AFFECTS note on how boss energy is expected to carry across a slot
   * handoff or wipe-and-revive the same way the fixed-interval model's own
   * cooldown already does. "energy-driven" makes bossChargedMoveFrequencySeconds
   * above stop mattering entirely.
   */
  bossChargedMoveCadence: BossChargedMoveCadence;
  bossStartsPrimed: boolean;
  bossStartingEnergyFraction: number;
  /**
   * Real-world raid countdown, offered as a labeled tier choice rather than a
   * raw number field per the task's explicit instruction — 180s for Tier 1/3,
   * 300s for Mega/Legendary/Primal raids (community-consensus real numbers,
   * see raidBoss.ts's RAID_TIER_TABLE / the design doc's Sources).
   */
  raidTimerSeconds: number;
  /** Seconds of raid clock a forced post-faint swap-in costs. No documented real value exists — defaults to 0.5s, an honest placeholder rather than a fabricated "realistic" number. */
  swapCostSeconds: number;
  /** Seconds of raid clock a full-roster wipe-and-rejoin costs. No official fixed value exists — a community-sourced ~12-15s estimate exists as a labeled preset, and the default (15s) is chosen at the TOP of that window specifically to allow for user error, not because it's any more confirmed than the rest of the window. */
  reviveCostSeconds: number;
}

interface Props {
  value: TeamAssumptions;
  onChange: (next: TeamAssumptions) => void;
  slotOptions: SpeciesPickerOption[];
  targetOptions: SpeciesPickerOption[];
  unmatchedRaids: { raidName: string; tier: string }[];
  /** Resolved species per slot (same index as value.slots), so this panel can read movepools/boost for the MoveSelect controls and the mega radio — null for an empty or unresolvable slot. */
  slotSpecies: (SpeciesDefinition | null)[];
  bossSpecies: SpeciesDefinition | null;
  bossReadySeconds: number | null;
  /** Boss's real per-tier battle HP pool (bossEffectiveHp) — the fixed resource the roster's cumulative damage races against. Computed by TeamRaidView, where the resolved boss species/tier live. */
  bossHp: number | null;
  /**
   * The boss charged-move mean frequency actually driving THIS run —
   * either the stored value (showDetailedAssumptions true) or the derived
   * one (false), computed by runTeamRaidScenario. Used both for the
   * "simple assumptions in force" summary line and to seed
   * bossChargedMoveFrequencySeconds when the user checks "More detailed
   * assumptions" on, so flipping that checkbox doesn't itself change any
   * result.
   */
  effectiveBossChargedMoveFrequencySeconds: number;
}

/**
 * Always-visible assumption panel for the Team Raid Simulator, mirroring
 * AssumptionPanel.tsx's own always-visible convention — the 6-slot roster
 * builder plus every shared assumption (level/IV/dodge/weather/boss/timer/
 * revive-and-swap costs) that TeamRaidView's runTeamRaid call actually
 * consumes.
 */
export function TeamAssumptionPanel({
  value,
  onChange,
  slotOptions,
  targetOptions,
  unmatchedRaids,
  slotSpecies,
  bossSpecies,
  bossReadySeconds,
  bossHp,
  effectiveBossChargedMoveFrequencySeconds,
}: Props) {
  function set<K extends keyof TeamAssumptions>(key: K, next: TeamAssumptions[K]) {
    onChange({ ...value, [key]: next });
  }

  function setShowDetailedAssumptions(checked: boolean) {
    onChange(
      checked
        // Seed the stored field with whatever value is ACTUALLY in force
        // right now (the derived one, since we're coming from the simple
        // mode) so checking this box on doesn't itself change any result —
        // only unlocks the field for further editing.
        ? { ...value, showDetailedAssumptions: true, bossChargedMoveFrequencySeconds: effectiveBossChargedMoveFrequencySeconds }
        : { ...value, showDetailedAssumptions: false },
    );
  }

  function updateSlot(i: number, patch: Partial<TeamSlotAssumption>) {
    const next = value.slots.slice();
    next[i] = { ...next[i]!, ...patch };
    onChange({ ...value, slots: next });
  }

  function moveSlot(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.slots.length) return;
    const next = value.slots.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange({ ...value, slots: next });
  }

  function clearSlot(i: number) {
    updateSlot(i, emptyTeamSlot());
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

  return (
    <CollapsibleSection id="team-raid-assumptions" heading="Assumptions" defaultOpen>

      <div style={{ marginBottom: 10 }}>
        <button type="button" onClick={clearAllMega} disabled={!value.slots.some((s) => s.isMega)}>
          No mega/primal this raid
        </button>
      </div>

      <div className="team-roster">
        {value.slots.map((slot, i) => {
          const species = slotSpecies[i];
          return (
            <div className="team-slot-row" key={i}>
              <div className="team-slot-header">
                <strong>
                  Slot {i + 1}
                  <SpeciesBadges isHypothetical={species?.isHypothetical} isShadow={effectiveIsShadow(species, slot.isShadow)} />
                </strong>
                <div className="team-slot-order-buttons">
                  <button type="button" onClick={() => moveSlot(i, -1)} disabled={i === 0} title="Fights earlier">
                    move up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlot(i, 1)}
                    disabled={i === value.slots.length - 1}
                    title="Fights later"
                  >
                    move down
                  </button>
                  <button type="button" onClick={() => clearSlot(i)} disabled={!slot.speciesId}>
                    clear
                  </button>
                </div>
              </div>
              <SpeciesPicker
                idPrefix={`team-slot-${i}`}
                label={`Slot ${i + 1} species`}
                options={slotOptions}
                value={slot.speciesId ?? ""}
                onChange={(id) =>
                  // A previously-picked move id almost certainly doesn't exist
                  // on the new species — reset both back to "use first move"
                  // in the same update, same convention as the comparator's
                  // candidate pickers. isMega is left as-is here; TeamRaidView
                  // normalizes it back to false afterward if the new species
                  // turns out to have no boost mechanic (it can't know that
                  // without a registry lookup, which lives at that layer).
                  updateSlot(i, { speciesId: id, fastMoveId: null, chargedMoveId: null })
                }
              />
              {species && (
                <>
                  <MoveSelect
                    idPrefix={`team-slot-${i}-fast`}
                    label="Fast move"
                    moves={species.fastMoves}
                    kind="fast"
                    value={slot.fastMoveId}
                    onChange={(id) => updateSlot(i, { fastMoveId: id })}
                  />
                  <MoveSelect
                    idPrefix={`team-slot-${i}-charged`}
                    label="Charged move"
                    moves={species.chargedMoves}
                    kind="charged"
                    value={slot.chargedMoveId}
                    onChange={(id) => updateSlot(i, { chargedMoveId: id })}
                  />
                  <div className="team-slot-flags">
                    <label className="species-picker-hint">
                      <input
                        type="radio"
                        name="team-mega-slot"
                        checked={slot.isMega}
                        disabled={!species.boost}
                        onChange={() => setMegaSlot(i)}
                        title="Only one Pokémon may be Mega/Primal Evolved at a time, account-wide (real Pokémon GO restriction) — this radio enforces that across all 6 slots."
                      />{" "}
                      Mega/Primal for this raid{!species.boost ? " (no boost mechanic on this species)" : ""}
                    </label>
                  </div>
                  <MegaLevelSelect
                    idPrefix={`team-slot-${i}`}
                    label="Mega Level"
                    species={species}
                    value={slot.megaLevel}
                    onChange={(level) => updateSlot(i, { megaLevel: level })}
                  />
                  <div className="team-slot-flags">
                    {(() => {
                      const shadowState = shadowToggleUiState(species);
                      return (
                        <label className="species-picker-hint">
                          <input
                            type="checkbox"
                            checked={shadowState.forcedOn || slot.isShadow}
                            disabled={shadowState.disabled}
                            onChange={(e) => updateSlot(i, { isShadow: e.target.checked })}
                            title={shadowState.title}
                          />{" "}
                          Shadow
                        </label>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="assumption-grid">
        <div>
          <SpeciesPicker
            idPrefix="team-target"
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
                idPrefix="team-boss-fast"
                label="Boss fast move"
                moves={bossSpecies.fastMoves}
                kind="fast"
                value={value.bossFastMoveId}
                onChange={(id) => set("bossFastMoveId", id)}
              />
              <MoveSelect
                idPrefix="team-boss-charged"
                label="Boss charged move"
                moves={bossSpecies.chargedMoves}
                kind="charged"
                value={value.bossChargedMoveId}
                onChange={(id) => set("bossChargedMoveId", id)}
              />
            </>
          )}
        </div>

        <div>
          <div className="field">
            <label htmlFor="team-level">Level (whole roster)</label>
            <input
              id="team-level"
              type="number"
              min={1}
              max={40}
              step={0.5}
              value={value.level}
              onChange={(e) => set("level", Number(e.target.value))}
            />
          </div>
          <div className="iv-row">
            <div className="field">
              <label htmlFor="team-ivAttack">Attack IV</label>
              <input
                id="team-ivAttack"
                className="iv-input"
                type="number"
                min={0}
                max={15}
                value={value.ivAttack}
                onChange={(e) => set("ivAttack", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="team-ivDefense">Defense IV</label>
              <input
                id="team-ivDefense"
                className="iv-input"
                type="number"
                min={0}
                max={15}
                value={value.ivDefense}
                onChange={(e) => set("ivDefense", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="team-ivStamina">Stamina IV</label>
              <input
                id="team-ivStamina"
                className="iv-input"
                type="number"
                min={0}
                max={15}
                value={value.ivStamina}
                onChange={(e) => set("ivStamina", Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="team-dodge">Dodge boss's charged attacks</label>
          <select
            id="team-dodge"
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
            <label htmlFor="team-missedFraction">Fraction of charged hits NOT dodged</label>
            <input
              id="team-missedFraction"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={value.dodge.missedFraction}
              onChange={(e) => set("dodge", { kind: "percentage-missed", missedFraction: Number(e.target.value) })}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="team-dodgeFastAttacks">Also dodge boss's fast attacks?</label>
          <select
            id="team-dodgeFastAttacks"
            value={value.dodgeFastAttacks ? "yes" : "no"}
            onChange={(e) => set("dodgeFastAttacks", e.target.value === "yes")}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="team-detailed-assumptions" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              id="team-detailed-assumptions"
              type="checkbox"
              checked={value.showDetailedAssumptions}
              onChange={(e) => setShowDetailedAssumptions(e.target.checked)}
            />
            More detailed assumptions
          </label>
          <p className="species-picker-hint">
            Reveals four advanced knobs below (hold-for-safe-window, boss charged-move mean frequency, swap-in cost,
            wipe-and-rejoin cost) whose current values are deliberate placeholders pending further research, not
            confirmed game constants. Leave this unchecked to use the simple, documented defaults instead.
          </p>
        </div>

        {!value.showDetailedAssumptions && (
          <div className="field">
            <label>Simple assumptions in force</label>
            <p className="computed-value">
              Swap-in cost 0.5s, wipe-and-rejoin cost 15s, hold-for-safe-window off, boss charged-move mean frequency
              ~{effectiveBossChargedMoveFrequencySeconds.toFixed(1)}s (derived from this boss's own fast-move charge
              time — a placeholder pending improvement, not this boss's confirmed real cadence).
            </p>
          </div>
        )}

        {value.showDetailedAssumptions && (
          <div className="field">
            <label htmlFor="team-holdChargedMove">Hold charged move for a safer moment?</label>
            <select
              id="team-holdChargedMove"
              value={value.holdChargedMoveUntilSafe ? "yes" : "no"}
              onChange={(e) => set("holdChargedMoveUntilSafe", e.target.value === "yes")}
              title="Applies to every slot identically. Meant to be paired with Perfect dodging — otherwise the safe-window trigger rarely fires and this degrades to just waiting for the energy cap."
            >
              <option value="no">No — fire as soon as ready</option>
              <option value="yes">Yes — wait for a safe window</option>
            </select>
            {value.holdChargedMoveUntilSafe && value.dodge.kind !== "perfect" && (
              <p className="species-picker-hint">
                This is meant to be used with dodging set to "Perfect" — with dodging set to "{value.dodge.kind}",
                the safe-window trigger will rarely or never fire.
              </p>
            )}
            {value.holdChargedMoveUntilSafe && bossChargedMoveIsUndodgeable && (
              <p className="species-picker-hint">
                The boss's selected charged move is flagged as not reliably perfectly-dodgeable, so the safe-window
                trigger won't fire against it.
              </p>
            )}
          </div>
        )}

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
          <p className="computed-value" title="A real boss's battle HP is a fixed per-tier pool (see raidBoss.ts's RAID_TIER_TABLE), not derived from its own baseStamina — this is the resource the roster's cumulative damage races against.">
            {bossHp === null ? "unknown" : bossHp.toLocaleString()}
          </p>
        </div>

        <div className="field">
          <label htmlFor="team-bossStartsPrimed">Boss starts already partway charged?</label>
          <select
            id="team-bossStartsPrimed"
            value={value.bossStartsPrimed ? "yes" : "no"}
            onChange={(e) => set("bossStartsPrimed", e.target.value === "yes")}
          >
            <option value="no">No — fight starts at 0 boss energy</option>
            <option value="yes">Yes — boss already has some energy saved</option>
          </select>
        </div>

        {value.bossStartsPrimed && (
          <div className="field">
            <label htmlFor="team-bossStartingEnergyFraction">Boss starting energy (% of its charged-move cost)</label>
            <input
              id="team-bossStartingEnergyFraction"
              type="number"
              min={0}
              max={100}
              step={5}
              value={Math.round(value.bossStartingEnergyFraction * 100)}
              onChange={(e) => set("bossStartingEnergyFraction", Math.min(1, Math.max(0, Number(e.target.value) / 100)))}
            />
          </div>
        )}

        <WeatherSelect idPrefix="team" value={value.weather} onChange={(w) => set("weather", w)} />

        <BossCadenceSelect idPrefix="team" value={value.bossChargedMoveCadence} onChange={(v) => set("bossChargedMoveCadence", v)} />

        {value.showDetailedAssumptions && (
          <div className="field">
            <label htmlFor="team-bossFreq">
              Boss charged-move mean frequency (s)
              {value.bossChargedMoveCadence === "energy-driven" && " (inactive)"}
            </label>
            <input
              id="team-bossFreq"
              type="number"
              min={1}
              value={value.bossChargedMoveFrequencySeconds}
              onChange={(e) => set("bossChargedMoveFrequencySeconds", Number(e.target.value))}
              disabled={value.bossChargedMoveCadence === "energy-driven"}
            />
            {value.bossChargedMoveCadence === "energy-driven" && (
              <p className="species-picker-hint">{BOSS_FREQUENCY_INAPPLICABLE_HINT}</p>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="team-raidTimer">Raid timer</label>
          <select id="team-raidTimer" value={value.raidTimerSeconds} onChange={(e) => set("raidTimerSeconds", Number(e.target.value))}>
            <option value={180}>180s — Tier 1/3 Raids</option>
            <option value={300}>300s — Mega/Legendary/Primal Raids</option>
          </select>
          <p className="species-picker-hint">Real, documented per-tier raid countdown — see raidBoss.ts's RAID_TIER_TABLE.</p>
        </div>

        {value.showDetailedAssumptions && (
          <div className="field">
            <label htmlFor="team-swapCost">Swap-in cost per mid-roster faint (s)</label>
            <input
              id="team-swapCost"
              type="number"
              min={0}
              step={0.5}
              value={value.swapCostSeconds}
              onChange={(e) => set("swapCostSeconds", Math.max(0, Number(e.target.value)))}
              title="No documented real value exists for this in-game (a 'brief revival screen pause' of unconfirmed duration) — defaults to 0.5s, an honest placeholder rather than a fabricated number."
            />
          </div>
        )}

        {value.showDetailedAssumptions && (
          <div className="field">
            <label htmlFor="team-reviveCost">Full-wipe revive-and-rejoin cost (s)</label>
            <input
              id="team-reviveCost"
              type="number"
              min={0}
              step={0.5}
              value={value.reviveCostSeconds}
              onChange={(e) => set("reviveCostSeconds", Math.max(0, Number(e.target.value)))}
              title="Paid once every time the whole fielded roster faints out, before restarting from the first fielded slot. No official fixed value exists."
            />
            <button type="button" onClick={() => set("reviveCostSeconds", 13)} style={{ marginTop: 4, alignSelf: "flex-start" }}>
              Use ~13s (community estimate, unverified)
            </button>
            <p className="species-picker-hint">
              Pokémon GO Hub's "Tips for short-manning raids" reports 12-15s to heal a full team in the lobby — a
              player/hardware-dependent community estimate, not a confirmed game constant. Default is 15s, chosen at
              the top of that 12-15s window to allow for user error, rather than baking in the community estimate as
              though it were fact.
            </p>
          </div>
        )}
      </div>

      <p className="caveats note-block" style={{ marginTop: 12 }}>
        A team can field fewer than {MAX_TEAM_RAID_SLOTS} Pokémon — leave any slot empty ("clear" it) and it simply
        never enters the fight. This tab models a SOLO trainer's own roster only: the mega/primal team-wide damage
        boost never applies to the mega-bringer's own party in the real game (only to OTHER trainers simultaneously
        in the same raid), so there is no cross-slot team-boost math here at all — a slot's own `.boost` only ever
        affects that slot's own damage while it's the active attacker.
      </p>
    </CollapsibleSection>
  );
}
