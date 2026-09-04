import type { DodgeBehavior } from "@pogo-analyzer/engine";
import type { CombatPhase } from "@pogo-analyzer/engine";

export interface Assumptions {
  targetId: string;
  level: number;
  ivAttack: number;
  ivDefense: number;
  ivStamina: number;
  dodge: DodgeBehavior;
  bossChargedMoveFrequencySeconds: number;
  openingBurstSeconds: number;
  phase: CombatPhase;
  partySize: number;
  teammateDps: number;
  teammateTypeMatches: boolean;
}

interface Props {
  value: Assumptions;
  onChange: (next: Assumptions) => void;
  targetOptions: { id: string; name: string }[];
}

/**
 * Always-visible assumption panel (Phase 4, point 9). Every conclusion this
 * tool produces is conditional on these — nothing is rendered as a single
 * ranked number without this panel attached above it.
 */
export function AssumptionPanel({ value, onChange, targetOptions }: Props) {
  function set<K extends keyof Assumptions>(key: K, next: Assumptions[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <section className="panel">
      <h2>Assumptions</h2>
      <div className="assumption-grid">
        <div className="field">
          <label htmlFor="target">Raid target</label>
          <select id="target" value={value.targetId} onChange={(e) => set("targetId", e.target.value)}>
            {targetOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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
          <label htmlFor="openingBurst">
            {value.phase === "opening-burst" ? "Opening-burst window (s)" : "Simulated fight length (s)"}
          </label>
          <input
            id="openingBurst"
            type="number"
            min={1}
            max={60}
            value={value.openingBurstSeconds}
            onChange={(e) => set("openingBurstSeconds", Number(e.target.value))}
            title={
              value.phase === "opening-burst"
                ? "How long the boss goes without a charged move. The comparison only models this window."
                : "How long each simulated run lasts before being cut off."
            }
          />
        </div>

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
