/**
 * Shadow-variant species synthesis, used only during active-raid matching
 * (a "Shadow " raid entry gets its own distinct SpeciesDefinition rather than
 * standing in the unboosted base species). Split out of sync-data.ts as part
 * of a 2026-09-06 code-simplifier-prompted reorg.
 */

import type { SpeciesDefinition } from "@pogo-analyzer/engine";

export function shadowVariantIdFor(baseId: string): string {
  return `${baseId}-shadow`;
}

/**
 * "Shadow " raid entries used to just point speciesId at the unboosted base
 * species and get flagged isApproximate: true (this project didn't model the
 * real Shadow atk/def multiplier). Now that shadow.ts's
 * shadowAdjustedBaseStats/SpeciesDefinition.isShadow exist (engine-developer,
 * 2026-09-05), a Shadow raid entry gets its OWN distinct SpeciesDefinition —
 * same pattern as a mega/primal getting its own id separate from its base
 * form — with raw base stats copied unmultiplied from the base species (the
 * engine applies SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER at
 * effective-stat time; pre-multiplying here would double-apply once combined
 * with the engine's own shadowAdjustedBaseStats).
 *
 * `shadowSpeciesByBaseId` is owned by the caller (sync-data.ts) and passed in
 * so e.g. two "Shadow Slowpoke" raid tiers don't synthesize two entries.
 */
export function getOrCreateShadowVariant(
  baseSpecies: SpeciesDefinition,
  shadowSpeciesByBaseId: Map<string, SpeciesDefinition>,
): SpeciesDefinition {
  const existing = shadowSpeciesByBaseId.get(baseSpecies.id);
  if (existing) return existing;
  const shadowId = shadowVariantIdFor(baseSpecies.id);
  const shadow: SpeciesDefinition = {
    ...baseSpecies,
    id: shadowId,
    name: `Shadow ${baseSpecies.name}`,
    isShadow: true,
    // Shadow and mega/primal boost are mutually exclusive in the real game
    // (shadow.ts's shadowAdjustedBaseStats throws if both are set) — the base
    // species this is derived from is never itself a mega/primal form (a
    // "Shadow Mega X" raid doesn't exist), but strip boost defensively rather
    // than trust that invariant silently.
    boost: undefined,
  };
  shadowSpeciesByBaseId.set(baseSpecies.id, shadow);
  return shadow;
}
