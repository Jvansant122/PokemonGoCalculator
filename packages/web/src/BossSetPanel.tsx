import { useMemo } from "react";
import { activeRaidBossOptions, pastRaidBossOptions } from "./registry.js";
import { multiRaidTiersPresent, resolveMultiRaidBossIds, type MultiRaidBossFilters } from "./multiRaidBossSet.js";

export interface BossSetPanelValue extends MultiRaidBossFilters {
  bossIds: string[];
}

interface Props {
  value: BossSetPanelValue;
  onChange: (next: BossSetPanelValue) => void;
}

/**
 * Multi-raid mode's boss-set selector — reuses the Species Report tab's own
 * `activeRaidBossOptions()`/`pastRaidBossOptions()` model exactly, per
 * PLAN_multi_raid_roster_optimizer.md §3.1, rather than inventing a second
 * one. Every control here mutates the FILTER state (includePastRaids/
 * includedTiers/maxBossCount) and, in the SAME update, recomputes the
 * RESOLVED `bossIds` via multiRaidBossSet.ts's resolveMultiRaidBossIds — this
 * is the ONLY place in the app that ever does that recompute (see that
 * function's own doc comment for why loading a scenario from a URL must
 * NEVER do the same thing).
 */
export function BossSetPanel({ value, onChange }: Props) {
  const activeOptions = useMemo(() => activeRaidBossOptions(), []);
  const pastOptions = useMemo(() => pastRaidBossOptions(), []);
  const allTiersPresent = useMemo(() => multiRaidTiersPresent(value.includePastRaids), [value.includePastRaids]);

  function applyFilters(patch: Partial<MultiRaidBossFilters>) {
    const nextFilters: MultiRaidBossFilters = {
      includePastRaids: patch.includePastRaids ?? value.includePastRaids,
      includedTiers: patch.includedTiers !== undefined ? patch.includedTiers : value.includedTiers,
      maxBossCount: patch.maxBossCount ?? value.maxBossCount,
    };
    onChange({ ...nextFilters, bossIds: resolveMultiRaidBossIds(nextFilters) });
  }

  function toggleTier(tier: string) {
    const current = value.includedTiers ?? allTiersPresent;
    const next = current.includes(tier) ? current.filter((t) => t !== tier) : [...current, tier];
    // Checking every currently-present tier collapses back to "no filter"
    // (null) — same convention as SpeciesReportView's toggleTier, so a tier
    // that appears LATER (a rotation, or turning on past raids) is still
    // included by default rather than needing to be checked by hand.
    applyFilters({ includedTiers: next.length === allTiersPresent.length ? null : next });
  }

  const bossCount = { active: activeOptions.length, past: pastOptions.length };

  return (
    <div>
      <p className="field-group-label">Boss set (multi-raid mode)</p>
      <p className="species-picker-hint">
        {value.bossIds.length} boss{value.bossIds.length === 1 ? "" : "es"} resolved and encoded into this scenario —
        this exact list, not the phrase &ldquo;active raids,&rdquo; is what a shared link reproduces (the live raid
        roster rotates, so re-resolving on load would silently sweep a different set than you ran).
      </p>

      <div className="field">
        <label htmlFor="pu-multiraid-includePast">Include past/inactive raids</label>
        <select
          id="pu-multiraid-includePast"
          value={value.includePastRaids ? "yes" : "no"}
          onChange={(e) => applyFilters({ includePastRaids: e.target.value === "yes" })}
        >
          <option value="no">No — active raids only ({bossCount.active})</option>
          <option value="yes">Yes — active + past raids ({bossCount.active + bossCount.past} recorded)</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="pu-multiraid-maxCount">Max boss count</label>
        <input
          id="pu-multiraid-maxCount"
          type="number"
          min={0}
          value={value.maxBossCount}
          onChange={(e) => applyFilters({ maxBossCount: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          title="Trims the resolved boss set to at most this many bosses (default 30) — the compute cost of a sweep scales directly with this number."
        />
      </div>

      <div>
        <p className="field-group-label">Raid tiers to include</p>
        {allTiersPresent.map((tier) => (
          <label key={tier} className="species-picker-hint" style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={value.includedTiers === null || value.includedTiers.includes(tier)}
              onChange={() => toggleTier(tier)}
            />{" "}
            {tier}
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={() => applyFilters({})}
        title="Re-resolves the boss set from the filters above against TODAY's active raid roster — useful if the roster has rotated since this scenario was last built."
      >
        Refresh boss set from today&rsquo;s active raids
      </button>
    </div>
  );
}
