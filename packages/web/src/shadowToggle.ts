import { shadowAdjustedBaseStats, type SpeciesDefinition } from "@pogo-analyzer/engine";

/**
 * Shared helpers for the per-tab "Shadow" toggle (added 2026-09-06) — lets a
 * user flag ANY selected attacker species as Shadow, not just whichever
 * species HAPPENED to be synthesized as a "Shadow X" raid-target variant by
 * scripts/sync-data/shadowVariant.ts (that synthesis is raid-matching
 * triggered and only ever produces raid TARGETS, never candidate/attacker
 * options — see that file's own doc comment). A Shadow Pokémon's stat
 * adjustment (shadow.ts's shadowAdjustedBaseStats, keyed on
 * SpeciesDefinition.isShadow) is a flat, always-applicable multiplier with no
 * real per-species eligibility this project's data sources could ever
 * determine, so a general toggle is correct here, not more data-sync work.
 *
 * Convention followed by every call site that uses these: the species object
 * flowing through a view's picker/badge/label/movepool logic stays the RAW,
 * unmodified registry object at all times — only apply the toggle at the
 * exact boundary where a value is handed to an engine call. This avoids a
 * self-locking bug where a toggle-produced clone's own `isShadow: true`
 * would then be mistaken (by shadowToggleUiState below) for "this species
 * came pre-flagged Shadow from the registry," permanently disabling the very
 * checkbox that turned it on.
 */

/**
 * Returns a shallow-cloned species with `isShadow: true` when the toggle is
 * on — UNCHANGED (same reference) when:
 *  - species is null/undefined (nothing to clone)
 *  - the toggle is off
 *  - species is already isShadow (registry-synthesized "Shadow X" variant) —
 *    applying the multiplier a second time would be wrong, and
 *    shadowAdjustedBaseStats has no idea it's already been applied once
 *  - species carries a `boost` (mega/primal) — shadowAdjustedBaseStats
 *    THROWS if both isShadow and boost are set (a Shadow Pokémon can't Mega
 *    Evolve without being Purified first); this defensive guard means a bug
 *    in a caller's own disabled/normalize logic can never actually reach the
 *    engine with both flags set, since this function refuses to construct
 *    that object no matter what `toggledOn` says.
 *
 * Apply this ONLY at an engine-call boundary (see file doc comment above) —
 * never store the result back into UI-facing state or pass it to
 * SpeciesPicker/SpeciesBadges/movepool logic.
 */
export function applyShadowToggle<T extends SpeciesDefinition | null | undefined>(species: T, toggledOn: boolean): T {
  if (!species || !toggledOn || species.isShadow || species.boost) return species;
  return { ...species, isShadow: true };
}

/**
 * For breakpoints.ts's attackDamageGrid/defenseDamageGrid, which take a raw
 * baseAttack/baseDefense NUMBER rather than a whole SpeciesDefinition and so
 * never look at isShadow at all (unlike effectiveStatsAtLevel, which
 * shadowAdjustedBaseStats-adjusts internally) — this calls the engine's own
 * shadowAdjustedBaseStats directly (not a reimplementation of
 * SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER) with the same
 * already-shadow / has-boost guard as applyShadowToggle above, so it's safe
 * to call unconditionally without checking boost/isShadow at the call site.
 */
export function shadowToggledBaseStats(
  species: Pick<SpeciesDefinition, "baseAttack" | "baseDefense" | "isShadow" | "boost">,
  toggledOn: boolean,
): { baseAttack: number; baseDefense: number } {
  const isShadow = species.isShadow || (toggledOn && !species.boost);
  return shadowAdjustedBaseStats({ baseAttack: species.baseAttack, baseDefense: species.baseDefense, isShadow, boost: undefined });
}

/**
 * The badge-worthy "is this effectively Shadow" state for display — true
 * whether the species came pre-flagged from the registry OR the user's
 * toggle turned it on (and it's eligible, i.e. not a boost species). Always
 * called with the RAW species (see file doc comment), never a toggle-applied
 * clone.
 */
export function effectiveIsShadow(species: Pick<SpeciesDefinition, "isShadow" | "boost"> | null | undefined, toggledOn: boolean): boolean {
  return !!species?.isShadow || (!!toggledOn && !species?.boost);
}

export interface ShadowToggleUiState {
  disabled: boolean;
  /** When true, render the checkbox as checked regardless of the stored toggle value — species is already Shadow-flagged from the registry, nothing more for the user's toggle to do. */
  forcedOn: boolean;
  title: string;
}

/**
 * Disabled/checked/title state for a Shadow toggle checkbox, given the RAW
 * (never toggle-applied) resolved species currently selected. Mirrors the
 * mega/primal-boost checkbox precedent (AssumptionPanel.tsx's per-candidate
 * "Disable mega/primal boost" control) for the disabled+title pattern.
 */
export function shadowToggleUiState(species: Pick<SpeciesDefinition, "isShadow" | "boost"> | null | undefined): ShadowToggleUiState {
  if (species?.boost) {
    return {
      disabled: true,
      forcedOn: false,
      title: "Shadow and Mega/Primal are mutually exclusive — a Shadow Pokémon cannot Mega Evolve without being Purified first.",
    };
  }
  if (species?.isShadow) {
    return {
      disabled: true,
      forcedOn: true,
      title: "This species is already a Shadow variant (from live raid data) — nothing more to toggle.",
    };
  }
  return {
    disabled: false,
    forcedOn: false,
    title: "Applies the Shadow Attack/Defense multipliers (1.2x Attack, 5/6 Defense) to this species' raw base stats — see shadow.ts.",
  };
}
