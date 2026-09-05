import type { DodgeBehavior } from "@pogo-analyzer/engine";
import type { CombatPhase } from "@pogo-analyzer/engine";
import { SpeciesPicker, type SpeciesPickerOption } from "./SpeciesPicker.js";

export interface Assumptions {
  candidateAId: string;
  candidateBId: string;
  targetId: string;
  level: number;
  ivAttack: number;
  ivDefense: number;
  ivStamina: number;
  dodge: DodgeBehavior;
  bossChargedMoveFrequencySeconds: number;
  phase: CombatPhase;
  partySize: number;
  teammateDps: number;
  teammateTypeMatches: boolean;
  /** Whether the boss starts the fight already partway charged (see bossStartingEnergyFraction). */
  bossStartsPrimed: boolean;
  /** Fraction (0-1) of the boss's first charged move's energy cost it starts with, when bossStartsPrimed is true. */
  bossStartingEnergyFraction: number;
}

interface Props {
  value: Assumptions;
  onChange: (next: Assumptions) => void;
  candidateOptions: SpeciesPickerOption[];
  targetOptions: SpeciesPickerOption[];
  unmatchedRaids: { raidName: string; tier: string }[];
  /**
   * Physically-derived "boss ready for its first charged move" time for the
   * currently-selected target (see bossChargedMoveReadySeconds), or null if
   * the target has no resolvable charged move. Computed in App.tsx, where the
   * resolved boss SpeciesDefinition lives — this panel only displays it.
   */
  bossReadySeconds: number | null;
}

/**
 * Always-visible assumption panel (Phase 4, point 9). Every conclusion this
 * tool produces is conditional on these — nothing is rendered as a single
 * ranked number without this panel attached above it.
 */
export function AssumptionPanel({ value, onChange, candidateOptions, targetOptions, unmatchedRaids, bossReadySeconds }: Props) {
  function set<K extends keyof Assumptions>(key: K, next: Assumptions[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <section className="panel">
      <h2>Assumptions</h2>
      <div className="assumption-grid">
        <SpeciesPicker
          idPrefix="candidate-a"
          label="Candidate A"
          options={candidateOptions}
          value={value.candidateAId}
          onChange={(id) => set("candidateAId", id)}
        />
        <SpeciesPicker
          idPrefix="candidate-b"
          label="Candidate B"
          options={candidateOptions}
          value={value.candidateBId}
          onChange={(id) => set("candidateBId", id)}
        />
        <div>
          <SpeciesPicker
            idPrefix="target"
            label="Raid target"
            options={targetOptions}
            value={value.targetId}
            onChange={(id) => set("targetId", id)}
          />
          {unmatchedRaids.length > 0 && (
            <p className="species-picker-hint" title="These raids are currently active but have no usable stat data yet.">
              Also active, no data yet: {unmatchedRaids.map((r) => `${r.raidName} (${r.tier})`).join(", ")}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="level">Level (both candidates)</label>
          <input
            id="level"
            type="number"
            min={1}
            max={40}
            step={0.5}
            value={value.level}
            onChange={(e) => set("level", Number(e.target.value))}
          />
        </div>

        <div className="field">
          <label htmlFor="ivAttack">Attack IV</label>
          <input
            id="ivAttack"
            type="number"
            min={0}
            max={15}
            value={value.ivAttack}
            onChange={(e) => set("ivAttack", Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="ivDefense">Defense IV</label>
          <input
            id="ivDefense"
            type="number"
            min={0}
            max={15}
            value={value.ivDefense}
            onChange={(e) => set("ivDefense", Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="ivStamina">Stamina IV</label>
          <input
            id="ivStamina"
            type="number"
            min={0}
            max={15}
            value={value.ivStamina}
            onChange={(e) => set("ivStamina", Number(e.target.value))}
          />
        </div>

        <div className="field">
          <label htmlFor="dodge">Dodging</label>
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
        </div>

        {value.dodge.kind === "percentage-missed" && (
          <div className="field">
            <label htmlFor="missedFraction">Fraction of hits NOT dodged</label>
            <input
              id="missedFraction"
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
          <label htmlFor="phase">Combat phase</label>
          <select id="phase" value={value.phase} onChange={(e) => set("phase", e.target.value as CombatPhase)}>
            <option value="opening-burst">Opening burst (boss uses only its fast move)</option>
            <option value="sustained">Sustained (boss's charged moves are randomized — reports a distribution)</option>
          </select>
        </div>

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
            <input
              id="bossStartingEnergyFraction"
              type="number"
              min={0}
              max={100}
              step={5}
              value={Math.round(value.bossStartingEnergyFraction * 100)}
              onChange={(e) => set("bossStartingEnergyFraction", Math.min(1, Math.max(0, Number(e.target.value) / 100)))}
              title="100% means the boss can fire immediately — there's no fast-move-only opening burst left to model; switch to Sustained for that case."
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="bossFreq">Boss charged-move mean frequency (s)</label>
          <input
            id="bossFreq"
            type="number"
            min={1}
            value={value.bossChargedMoveFrequencySeconds}
            onChange={(e) => set("bossChargedMoveFrequencySeconds", Number(e.target.value))}
            disabled={value.phase !== "sustained"}
            title={
              value.phase !== "sustained"
                ? "Only used in the sustained phase — the opening burst assumes the boss hasn't used a charged move yet."
                : "Mean seconds between the boss's charged moves (randomized +/-40% per run)."
            }
          />
        </div>

        <div className="field">
          <label htmlFor="partySize">Party size</label>
          <input
            id="partySize"
            type="number"
            min={1}
            max={20}
            value={value.partySize}
            onChange={(e) => set("partySize", Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="teammateDps">Teammate DPS (each)</label>
          <input
            id="teammateDps"
            type="number"
            min={0}
            step={0.1}
            value={value.teammateDps}
            onChange={(e) => set("teammateDps", Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="teammateType">Teammates' attack type matches boost?</label>
          <select
            id="teammateType"
            value={value.teammateTypeMatches ? "yes" : "no"}
            onChange={(e) => set("teammateTypeMatches", e.target.value === "yes")}
          >
            <option value="yes">Yes (gets the mega boost)</option>
            <option value="no">No (off-type party)</option>
          </select>
        </div>
      </div>
    </section>
  );
}
