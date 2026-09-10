import { useMemo, useState } from "react";
import {
  activeRaidBossOptions,
  pastRaidBossOptions,
  speciesRegistry,
  targetPickerOptions,
  type PastRaidBossOption,
  type RaidBossOption,
} from "./registry.js";
import { multiRaidTiersPresent, resolveMultiRaidBossIds, type MultiRaidBossFilters } from "./multiRaidBossSet.js";
import { NumberField } from "./NumberField.js";
import { SpeciesPicker } from "./SpeciesPicker.js";

export interface BossSetPanelValue extends MultiRaidBossFilters {
  bossIds: string[];
}

interface Props {
  value: BossSetPanelValue;
  onChange: (next: BossSetPanelValue) => void;
}

interface ResolvedBossDisplay {
  label: string;
  badge?: "hypothetical" | "approximate" | "shadow";
  imageUrl?: string;
}

/**
 * Resolves a `bossIds` entry to something displayable — tries the currently
 * active roster first, then the past/inactive archive, then falls back to
 * "just a registered species" for a hand-picked id that isn't a recorded
 * raid boss at all (or has since fully rotated out of both the live feed and
 * the archive since it was picked/shared) — `runRosterPlanner`'s own
 * `resolveBossTarget` already has an honest `defaultRaidTierForSpecies`
 * fallback for exactly this case, so this display just needs to not crash on
 * it, not simulate it itself.
 */
function describeBoss(id: string, activeOptions: RaidBossOption[], pastOptions: PastRaidBossOption[]): ResolvedBossDisplay {
  const active = activeOptions.find((b) => b.id === id);
  if (active) {
    return {
      label: `${active.raidName} — ${active.tier}`,
      badge: active.isApproximate ? "approximate" : speciesRegistry.has(id) && speciesRegistry.get(id).isShadow ? "shadow" : undefined,
      imageUrl: active.imageUrl,
    };
  }
  const past = pastOptions.find((b) => b.id === id);
  if (past) {
    return {
      label: `${past.raidName} — ${past.tier} (past)`,
      badge: speciesRegistry.has(id) && speciesRegistry.get(id).isShadow ? "shadow" : undefined,
      imageUrl: past.imageUrl,
    };
  }
  if (speciesRegistry.has(id)) {
    const s = speciesRegistry.get(id);
    return {
      label: `${s.name} (not a recorded raid boss — simulated at today's default tier)`,
      badge: s.isHypothetical ? "hypothetical" : s.isShadow ? "shadow" : undefined,
      imageUrl: s.imageUrl,
    };
  }
  return { label: `Unknown species id "${id}"` };
}

/**
 * Multi-raid mode's boss-set selector — reuses the Species Report tab's own
 * `activeRaidBossOptions()`/`pastRaidBossOptions()` model exactly, per
 * PLAN_multi_raid_roster_optimizer.md §3.1, rather than inventing a second
 * one. Every FILTER control here (include-past select, max-count, tier
 * checkboxes, the refresh button) mutates the filter state and, in the SAME
 * update, RECOMPUTES the RESOLVED `bossIds` via multiRaidBossSet.ts's
 * resolveMultiRaidBossIds — this REPLACES the entire set, including anything
 * added or removed by hand below (see the "Filter and (re)generate" heading's
 * own hint text). This is the ONLY place in the app that ever does that
 * recompute (see that function's own doc comment for why loading a scenario
 * from a URL must NEVER do the same thing).
 *
 * The hand-pick section below is a second, independent way to edit the same
 * `bossIds` array — add/remove one boss at a time, or "Use only this boss"
 * for the single-boss headline case (search, pick, one click) — and never
 * calls resolveMultiRaidBossIds itself, so it can't accidentally pull in a
 * bulk-filtered set. Filter = bulk (re)generate from scratch; hand-pick =
 * surgical edit that survives until a filter control is touched again. This
 * is a deliberate REPLACE choice, not a union: unioning would mean a filter
 * change could never actually shrink the set back down (a stale hand-added
 * boss would linger forever), and the existing filter controls already fully
 * replaced `bossIds` before this feature existed — keeping that invariant
 * means there's exactly one rule to learn, not two different ones depending
 * on which control you touch last.
 */
export function BossSetPanel({ value, onChange }: Props) {
  const activeOptions = useMemo(() => activeRaidBossOptions(), []);
  const pastOptions = useMemo(() => pastRaidBossOptions(), []);
  const pickerOptions = useMemo(() => targetPickerOptions(), []);
  const allTiersPresent = useMemo(() => multiRaidTiersPresent(value.includePastRaids), [value.includePastRaids]);
  const [pendingBossId, setPendingBossId] = useState("");

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

  function addPendingBoss() {
    if (!pendingBossId) return;
    if (!value.bossIds.includes(pendingBossId)) {
      onChange({ ...value, bossIds: [...value.bossIds, pendingBossId] });
    }
    setPendingBossId("");
  }

  function usePendingBossOnly() {
    if (!pendingBossId) return;
    onChange({ ...value, bossIds: [pendingBossId] });
    setPendingBossId("");
  }

  function removeBoss(id: string) {
    onChange({ ...value, bossIds: value.bossIds.filter((b) => b !== id) });
  }

  function clearAll() {
    onChange({ ...value, bossIds: [] });
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

      <div>
        <p className="field-group-label">Hand-pick bosses</p>
        <p className="species-picker-hint">
          Attending one specific raid tonight? Search for it below and click &ldquo;Use only this boss&rdquo; — the
          sweep runs against exactly that one boss, whole roster included.
        </p>
        <SpeciesPicker
          idPrefix="pu-multiraid-handpick"
          label="Search bosses"
          options={pickerOptions}
          value={pendingBossId}
          onChange={setPendingBossId}
        />
        <div className="boss-set-handpick-actions">
          <button type="button" onClick={usePendingBossOnly} disabled={!pendingBossId} className="button-accent">
            Use only this boss
          </button>
          <button type="button" onClick={addPendingBoss} disabled={!pendingBossId}>
            + Add to set
          </button>
        </div>

        {value.bossIds.length > 0 ? (
          <ul className="boss-set-list">
            {value.bossIds.map((id) => {
              const d = describeBoss(id, activeOptions, pastOptions);
              return (
                <li key={id}>
                  {d.imageUrl && <img src={d.imageUrl} alt="" className="species-icon" />}
                  <span className="boss-set-list-label">{d.label}</span>
                  {d.badge && <span className={`badge badge-${d.badge}`}>{d.badge}</span>}
                  <button type="button" onClick={() => removeBoss(id)} aria-label={`Remove ${d.label} from the boss set`}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="species-picker-warning">
            No bosses in the set — the sweep has nothing to run against. Hand-pick at least one above, or use a
            filter below.
          </p>
        )}
        {value.bossIds.length > 0 && (
          <button type="button" onClick={clearAll}>
            Clear all bosses
          </button>
        )}
      </div>

      <div>
        <p className="field-group-label">Filter and (re)generate the boss set</p>
        <p className="species-picker-hint">
          Any control below REPLACES the entire boss set above with a freshly resolved list, discarding anything
          added or removed by hand — use hand-picking above for surgical edits, and these filters when you want to
          bulk-regenerate from scratch.
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
          <NumberField
            id="pu-multiraid-maxCount"
            min={0}
            value={value.maxBossCount}
            onChange={(v) => applyFilters({ maxBossCount: Math.max(0, Math.floor(v ?? 0)) })}
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
          title="Re-resolves the boss set from the filters above against TODAY's active raid roster — useful if the roster has rotated since this scenario was last built. Replaces the whole set, including hand-picked entries."
        >
          Refresh boss set from today&rsquo;s active raids
        </button>
      </div>
    </div>
  );
}
