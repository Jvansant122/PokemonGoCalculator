/**
 * Raid-name -> normalized-species resolution, shared by BOTH the activeRaids
 * matching loop and resolveRaidNameForHistoryMigration in sync-data.ts. The
 * two call sites used to each carry an INDEPENDENT copy of this exact
 * priority-ordered cascade (exact mega, exact species, regional-form
 * same-prefix, Shadow-variant, approximate generic-prefix stand-in), with a
 * comment on the second copy warning "kept deliberately in sync ... if that
 * logic changes, mirror the change here too" — real duplication risk, and
 * the reason the 2026-09-09 "Shadow Alolan Sandslash" compound-prefix fix
 * needed applying twice by hand before this extraction. There is now exactly
 * one implementation of the cascade (matchRaidName below), parameterized
 * only by the lookup pools/maps each caller already has in scope and a
 * `resolveShadowVariant` callback that lets each caller decide whether a
 * NEW Shadow-variant species may be synthesized (the activeRaids loop, which
 * owns species.json) or only an ALREADY-existing one may be reused
 * (raidHistory migration, which must never mutate species.json) — see
 * matchRaidName's own doc comment for the full contract.
 */

export interface RaidLookupPoolEntry {
  id: string;
  name: string;
}

/**
 * Prefixes a live raid name may carry ahead of a species' own bare name —
 * "Shadow ", the mega/primal markers, ScrapedDuck's own regional-adjective
 * convention (see REGIONAL_FORM_TO_RAID_PREFIX in sync-data.ts, which feeds
 * this same vocabulary into regionalFormSpeciesByPrefixAndBase's keys), and
 * the Dynamax/Gigantamax markers. Single source of truth for both the
 * same-prefix regional lookup and the compound Shadow+regional lookup below.
 */
export const KNOWN_PREFIXES = [
  "Shadow ",
  "Mega ",
  "Primal ",
  "Alolan ",
  "Galarian ",
  "Hisuian ",
  "Dynamax ",
  "Gigantamax ",
];

export function findByExactName(name: string, pool: RaidLookupPoolEntry[]): string | null {
  const lower = name.toLowerCase();
  const hit = pool.find((s) => s.name.toLowerCase() === lower);
  return hit ? hit.id : null;
}

/**
 * Resolves the remainder of a raid name AFTER a "Shadow " prefix has already
 * been stripped, for the compound case where that remainder is ITSELF a
 * regional-form name composed in one string — e.g. "Shadow Alolan Sandslash"
 * strips to "Alolan Sandslash" here. Neither a same-prefix regional lookup
 * (which would wrongly key `regionalFormSpeciesByPrefixAndBase` on
 * "shadow|alolan sandslash" — the registry only ever holds
 * "alolan|sandslash") nor a generic exact-name match (the species is named
 * "Sandslash (Alola)", never "Alolan Sandslash") can reach this: this
 * function re-runs the SAME prefix-stripping the outer KNOWN_PREFIXES loop
 * does, one more time, against the already-Shadow-stripped remainder.
 *
 * Returns the REAL regional-form species id (e.g. "sandslash-alola"), never
 * a Shadow-suffixed one — applying Shadow resolution/synthesis on top is the
 * caller's job (matchRaidName below), exactly like the plain (non-compound)
 * Shadow branch already does. Returns null when `afterShadowPrefix` doesn't
 * start with any OTHER KNOWN_PREFIXES entry the regional registry
 * recognizes, so the caller can fall through to its own generic
 * base-species stand-in unchanged.
 */
export function resolveCompoundRegionalNameAfterShadowPrefix(
  afterShadowPrefix: string,
  regionalFormSpeciesByPrefixAndBase: Map<string, string>,
  knownPrefixes: string[] = KNOWN_PREFIXES,
): string | null {
  for (const innerPrefix of knownPrefixes) {
    if (innerPrefix === "Shadow ") continue; // no double-Shadow compounding — not a real case
    if (!afterShadowPrefix.startsWith(innerPrefix)) continue;
    const innerBaseName = afterShadowPrefix.slice(innerPrefix.length);
    const regionalId = regionalFormSpeciesByPrefixAndBase.get(
      `${innerPrefix.trim().toLowerCase()}|${innerBaseName.toLowerCase()}`,
    );
    if (regionalId) return regionalId;
  }
  return null;
}

export interface RaidNameMatchPools {
  megaSpeciesLookupPool: RaidLookupPoolEntry[];
  speciesLookupPool: RaidLookupPoolEntry[];
  /** `${raid-prefix}|${base pokemon_name, lowercased}` -> extra-form species id — see sync-data.ts's own doc comment above where this map is populated. */
  regionalFormSpeciesByPrefixAndBase: Map<string, string>;
}

export interface RaidNameMatchResult {
  speciesId: string | null;
  isApproximate: boolean;
}

/**
 * The full priority cascade a raid's real `name` string resolves through:
 *   1. Exact case-insensitive match against a real mega/primal species.
 *   2. Exact case-insensitive match against the full normalized species pool
 *      (includes non-default regional/extra forms already built as their
 *      own species, e.g. "Lilligant (Hisuian)").
 *   3. Strip a KNOWN_PREFIXES entry off the raid name and:
 *      3a. Same-prefix regional-form lookup (e.g. "Hisuian " + "Lilligant").
 *      3b. COMPOUND case: "Shadow " + a regional adjective composed in the
 *          SAME remaining name (e.g. "Shadow " + "Alolan Sandslash") — see
 *          resolveCompoundRegionalNameAfterShadowPrefix above.
 *      3c. Exact base-species match, with Shadow-variant resolution applied
 *          on top when the stripped prefix was "Shadow ".
 *
 * `resolveShadowVariant(baseSpeciesId)` is called at both 3b and 3c whenever
 * the prefix branch is Shadow's — return the Shadow-variant species id to
 * treat this as a real (non-approximate) match, or null to fall through to
 * whatever the cascade offers next. This is the one caller-owned choice
 * baked into the shared cascade: the activeRaids matching loop in
 * sync-data.ts (which owns species.json) always synthesizes a fresh variant
 * via getOrCreateShadowVariant and so this never returns null for it;
 * resolveRaidNameForHistoryMigration (which must never mutate species.json)
 * only ever returns an id already present in shadowSpeciesByBaseId, and
 * null otherwise — see each call site in sync-data.ts.
 */
export function matchRaidName(
  raidName: string,
  pools: RaidNameMatchPools,
  resolveShadowVariant: (baseSpeciesId: string) => string | null,
): RaidNameMatchResult {
  const exactMega = findByExactName(raidName, pools.megaSpeciesLookupPool);
  if (exactMega) return { speciesId: exactMega, isApproximate: false };

  const exactNormalized = findByExactName(raidName, pools.speciesLookupPool);
  if (exactNormalized) return { speciesId: exactNormalized, isApproximate: false };

  for (const prefix of KNOWN_PREFIXES) {
    if (!raidName.startsWith(prefix)) continue;
    const baseName = raidName.slice(prefix.length);

    // 3a: same-prefix regional-form lookup — a regional-form prefix (e.g.
    // "Hisuian ") this project carries as its OWN mechanically-distinct
    // species, checked before the generic base-species stand-in below so
    // e.g. "Hisuian Lilligant" resolves to lilligant-hisuian's own real
    // stats instead of base Lilligant's. A regional raid whose stats/typing
    // happen to be cosmetically identical to its base form was never added
    // as its own species, so it correctly falls through to the generic
    // stand-in below unchanged.
    const regionalId = pools.regionalFormSpeciesByPrefixAndBase.get(
      `${prefix.trim().toLowerCase()}|${baseName.toLowerCase()}`,
    );
    if (regionalId) return { speciesId: regionalId, isApproximate: false };

    // 3b: compound case — "Shadow " plus a regional adjective composed in
    // ONE name (e.g. "Shadow Alolan Sandslash"). The 3a lookup just above
    // can't reach this (it would key on "shadow|alolan sandslash", not the
    // "alolan|sandslash" the registry actually holds), so resolve the
    // regional form FIRST via the shared helper, then let the caller apply
    // Shadow resolution/synthesis to THAT species — result e.g.
    // "sandslash-alola-shadow" with the Alolan form's own Ice/Steel
    // typing/stats, never base Sandslash's Ground ones.
    if (prefix === "Shadow ") {
      const compoundRegionalId = resolveCompoundRegionalNameAfterShadowPrefix(
        baseName,
        pools.regionalFormSpeciesByPrefixAndBase,
      );
      if (compoundRegionalId) {
        const shadowId = resolveShadowVariant(compoundRegionalId);
        if (shadowId) return { speciesId: shadowId, isApproximate: false };
        // No existing/creatable Shadow variant for this regional base —
        // fall through to the generic base-match branch below, same as the
        // plain (non-compound) Shadow case does.
      }
    }

    // 3c: generic exact base-species match, with Shadow-variant resolution
    // applied on top when the stripped prefix was "Shadow ".
    const baseMatch = findByExactName(baseName, pools.speciesLookupPool);
    if (baseMatch) {
      if (prefix === "Shadow ") {
        const shadowId = resolveShadowVariant(baseMatch);
        if (shadowId) return { speciesId: shadowId, isApproximate: false };
      }
      return { speciesId: baseMatch, isApproximate: true };
    }
  }

  return { speciesId: null, isApproximate: true };
}
