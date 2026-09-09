import { MAX_TEAM_RAID_SLOTS, type DodgeBehavior, type SpeciesDefinition, type WeatherCondition } from "@pogo-analyzer/engine";
import { SpeciesPicker, type SpeciesPickerOption } from "./SpeciesPicker.js";
import { MoveSelect } from "./MoveSelect.js";
import { SpeciesBadges } from "./SpeciesBadges.js";
import { WeatherSelect } from "./WeatherSelect.js";
import { effectiveIsShadow, shadowToggleUiState } from "./shadowToggle.js";
import { BOSS_FREQUENCY_INAPPLICABLE_HINT, BossCadenceSelect, type BossChargedMoveCadence } from "./bossCadence.js";
import type { PowerUpRankBy } from "./powerUpOptimizerScenario.js";

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

export interface PowerUpOptimizerAssumptions {
  /** Always exactly MAX_TEAM_RAID_SLOTS entries, in fight order — pad with empty slots rather than shortening the array. */
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
  /** Which resource column the ranked candidate table is sorted by — display-only (never affects optimizePowerUps' own math), same "still a real setting" reasoning as Species Report's sortMode. */
  rankBy: PowerUpRankBy;
}

interface Props {
  value: PowerUpOptimizerAssumptions;
  onChange: (next: PowerUpOptimizerAssumptions) => void;
  slotOptions: SpeciesPickerOption[];
  targetOptions: SpeciesPickerOption[];
  unmatchedRaids: { raidName: string; tier: string }[];
  /** Resolved species per slot (same index as value.slots) — RAW, never toggle-applied, see shadowToggle.ts's file doc comment. */
  slotSpecies: (SpeciesDefinition | null)[];
  bossSpecies: SpeciesDefinition | null;
  bossReadySeconds: number | null;
  bossHp: number | null;
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
  targetOptions,
  unmatchedRaids,
  slotSpecies,
  bossSpecies,
  bossReadySeconds,
  bossHp,
}: Props) {
  function set<K extends keyof PowerUpOptimizerAssumptions>(key: K, next: PowerUpOptimizerAssumptions[K]) {
    onChange({ ...value, [key]: next });
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

  return (
    <section className="panel">
      <h2>Assumptions</h2>

      <div style={{ marginBottom: 10 }}>
        <button type="button" onClick={clearAllMega} disabled={!value.slots.some((s) => s.isMega)}>
          No mega/primal this raid
        </button>
      </div>

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
                  />
                  <MoveSelect
                    idPrefix={`pu-slot-${i}-charged`}
                    label="Charged move"
                    moves={species.chargedMoves}
                    kind="charged"
                    value={slot.chargedMoveId}
                    onChange={(id) => updateSlot(i, { chargedMoveId: id })}
                  />
                  <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
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
                  <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={shadowState.forcedOn || slot.isShadow}
                      disabled={shadowDisabled}
                      onChange={(e) => updateSlot(i, { isShadow: e.target.checked })}
                      title={slot.isPurified ? "Shadow and Purified are mutually exclusive — uncheck Purified first." : shadowState.title}
                    />{" "}
                    Shadow
                  </label>
                  <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
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
                  <label className="species-picker-hint" style={{ display: "block", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={slot.isLucky}
                      onChange={(e) => updateSlot(i, { isLucky: e.target.checked })}
                      title="Applies the Lucky power-up cost discount (50% off stardust only — candy is unaffected). Does not change this slot's combat stats."
                    />{" "}
                    Lucky
                  </label>
                  <div className="field">
                    <label htmlFor={`pu-slot-${i}-level`}>Current level</label>
                    <input
                      id={`pu-slot-${i}-level`}
                      type="number"
                      min={1}
                      max={50}
                      step={0.5}
                      value={slot.level}
                      onChange={(e) => updateSlot(i, { level: Number(e.target.value) })}
                    />
                  </div>
                  <div className="iv-row">
                    <div className="field">
                      <label htmlFor={`pu-slot-${i}-ivAttack`}>Attack IV</label>
                      <input
                        id={`pu-slot-${i}-ivAttack`}
                        className="iv-input"
                        type="number"
                        min={0}
                        max={15}
                        value={slot.ivAttack}
                        onChange={(e) => updateSlot(i, { ivAttack: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`pu-slot-${i}-ivDefense`}>Defense IV</label>
                      <input
                        id={`pu-slot-${i}-ivDefense`}
                        className="iv-input"
                        type="number"
                        min={0}
                        max={15}
                        value={slot.ivDefense}
                        onChange={(e) => updateSlot(i, { ivDefense: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`pu-slot-${i}-ivStamina`}>Stamina IV</label>
                      <input
                        id={`pu-slot-${i}-ivStamina`}
                        className="iv-input"
                        type="number"
                        min={0}
                        max={15}
                        value={slot.ivStamina}
                        onChange={(e) => updateSlot(i, { ivStamina: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="iv-row">
                    <div className="field">
                      <label htmlFor={`pu-slot-${i}-candy`}>Candy on hand</label>
                      <input
                        id={`pu-slot-${i}-candy`}
                        type="number"
                        min={0}
                        value={slot.candyOnHand}
                        onChange={(e) => updateSlot(i, { candyOnHand: Math.max(0, Number(e.target.value)) })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`pu-slot-${i}-xlCandy`}>XL candy on hand</label>
                      <input
                        id={`pu-slot-${i}-xlCandy`}
                        type="number"
                        min={0}
                        value={slot.xlCandyOnHand}
                        onChange={(e) => updateSlot(i, { xlCandyOnHand: Math.max(0, Number(e.target.value)) })}
                      />
                    </div>
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
              />
              <MoveSelect
                idPrefix="pu-boss-charged"
                label="Boss charged move"
                moves={bossSpecies.chargedMoves}
                kind="charged"
                value={value.bossChargedMoveId}
                onChange={(id) => set("bossChargedMoveId", id)}
              />
            </>
          )}
        </div>

        <div className="field">
          <label htmlFor="pu-stardust">Stardust on hand</label>
          <input
            id="pu-stardust"
            type="number"
            min={0}
            value={value.stardustOnHand}
            onChange={(e) => set("stardustOnHand", Math.max(0, Number(e.target.value)))}
            title="One shared account-wide pool, unlike candy/XL candy which are held per-species (see each slot's own candy fields above)."
          />
        </div>

        <div className="field">
          <label htmlFor="pu-rareCandy">Rare Candy on hand</label>
          <input
            id="pu-rareCandy"
            type="number"
            min={0}
            value={value.rareCandyOnHand}
            onChange={(e) => set("rareCandyOnHand", Math.max(0, Number(e.target.value)))}
            title="A shared, account-wide pool — converts 1:1 into any species' regular Candy (never XL Candy). Only used by the fixed-budget plan below, after each slot's own candy on hand runs out."
          />
        </div>

        <div className="field">
          <label htmlFor="pu-rareCandyXl">Rare Candy XL on hand</label>
          <input
            id="pu-rareCandyXl"
            type="number"
            min={0}
            value={value.rareCandyXlOnHand}
            onChange={(e) => set("rareCandyXlOnHand", Math.max(0, Number(e.target.value)))}
            title="A separate shared, account-wide pool from plain Rare Candy — converts 1:1 into any species' XL Candy only. Only used by the fixed-budget plan below, after each slot's own XL candy on hand runs out."
          />
        </div>

        <div className="field">
          <label htmlFor="pu-rankBy">Rank candidates by</label>
          <select id="pu-rankBy" value={value.rankBy} onChange={(e) => set("rankBy", e.target.value as PowerUpRankBy)}>
            <option value="stardust">Team-DPS gained per 1000 stardust</option>
            <option value="candy">Team-DPS gained per candy</option>
            <option value="xlCandy">Team-DPS gained per XL candy</option>
          </select>
          <p className="species-picker-hint">
            Display-only — never changes which candidates exist or their own numbers, only the sort order of the
            table below. Stardust and candy are deliberately kept as two separate efficiency numbers rather than one
            blended score, since they aren't fungible resources for a real player.
          </p>
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
            <input
              id="pu-missedFraction"
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
            <input
              id="pu-bossStartingEnergyFraction"
              type="number"
              min={0}
              max={100}
              step={5}
              value={Math.round(value.bossStartingEnergyFraction * 100)}
              onChange={(e) => set("bossStartingEnergyFraction", Math.min(1, Math.max(0, Number(e.target.value) / 100)))}
            />
          </div>
        )}

        <WeatherSelect idPrefix="pu" value={value.weather} onChange={(w) => set("weather", w)} />

        <BossCadenceSelect idPrefix="pu" value={value.bossChargedMoveCadence} onChange={(v) => set("bossChargedMoveCadence", v)} />

        <div className="field">
          <label htmlFor="pu-bossFreq">
            Boss charged-move mean frequency (s)
            {value.bossChargedMoveCadence === "energy-driven" && " (inactive)"}
          </label>
          <input
            id="pu-bossFreq"
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

        <div className="field">
          <label htmlFor="pu-raidTimer">Raid timer</label>
          <select id="pu-raidTimer" value={value.raidTimerSeconds} onChange={(e) => set("raidTimerSeconds", Number(e.target.value))}>
            <option value={180}>180s — Tier 1/3 Raids</option>
            <option value={300}>300s — Mega/Legendary/Primal Raids</option>
          </select>
          <p className="species-picker-hint">Real, documented per-tier raid countdown — see raidBoss.ts's RAID_TIER_TABLE.</p>
        </div>

        <div className="field">
          <label htmlFor="pu-swapCost">Swap-in cost per mid-roster faint (s)</label>
          <input
            id="pu-swapCost"
            type="number"
            min={0}
            step={0.5}
            value={value.swapCostSeconds}
            onChange={(e) => set("swapCostSeconds", Math.max(0, Number(e.target.value)))}
            title="No documented real value exists for this in-game (a 'brief revival screen pause' of unconfirmed duration) — defaults to 0 (fastest-possible play), an honest placeholder rather than a fabricated number."
          />
        </div>

        <div className="field">
          <label htmlFor="pu-reviveCost">Full-wipe revive-and-rejoin cost (s)</label>
          <input
            id="pu-reviveCost"
            type="number"
            min={0}
            step={0.5}
            value={value.reviveCostSeconds}
            onChange={(e) => set("reviveCostSeconds", Math.max(0, Number(e.target.value)))}
            title="Paid once every time the whole fielded roster faints out, before restarting from the first fielded slot — raid-clock time in which nothing is dealt. Defaults to 15s on this tab (within the community's ~12-15s lobby-rejoin estimate; no official figure exists). Set 0 to model instant, free revives."
          />
          <button type="button" onClick={() => set("reviveCostSeconds", 15)} style={{ marginTop: 4, alignSelf: "flex-start" }}>
            Reset to 15s (default — community ~12-15s estimate, unverified)
          </button>
        </div>
      </div>

      <p className="caveats" style={{ marginTop: 12 }}>
        A team can field fewer than {MAX_TEAM_RAID_SLOTS} Pokémon — leave any slot empty ("clear" it) and it simply
        never enters the fight and never contributes a power-up candidate. Every power-up candidate below is a
        SINGLE-SLOT power-up run through a full paired team-raid simulation against the other 5 slots exactly as
        configured — no multi-slot power-up plans and no "add a hypothetical 7th Pokémon" candidates in this v1.
      </p>
    </section>
  );
}
