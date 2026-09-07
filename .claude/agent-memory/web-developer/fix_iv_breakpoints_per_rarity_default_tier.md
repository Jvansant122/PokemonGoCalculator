---
name: fix-iv-breakpoints-per-rarity-default-tier
description: Wired engine's new defaultRaidTierForSpecies into the sweep's tier-bucketing, then rewrote IvSweepReport.tsx's caveat prose that had baked in the OLD blanket-tier-5 assumption
metadata:
  type: project
---

Follow-up to [[feature-iv-breakpoints-tier-filtered-headline]], triggered by an
engine-developer change (2026-09-06): `defaultRaidTierForSpecies(species)`
replaced the old blanket `DEFAULT_REAL_RAID_TIER` fallback with a per-rarity
one (STANDARD -> "3-Star Raids", LEGENDARY -> "5-Star Raids", any real
mega/primal `species.boost` -> "Mega Raids", everything else -> the old
"5-Star Raids" last resort).

**Two call sites needed fixing, not one.** `IvBreakpointsView.tsx`'s sweep
loop (~line 293) computed `raidTierForSpeciesId(opt.id) ?? DEFAULT_REAL_RAID_TIER`
for bucketing purposes — changed to `?? defaultRaidTierForSpecies(bossSpecies)`,
where `bossSpecies` is the already-resolved `resolveSpecies(opt.id)` from two
lines above (the per-target species being evaluated in that loop iteration,
NOT the user's own candidate species). `DEFAULT_REAL_RAID_TIER` import was
then fully unused in that file (only referenced in comments) and was removed
entirely — verify with a grep before assuming a swapped-out import needs to
stay for some other use. **Did NOT touch the single-target `result` computation's**
`bossRaidTier = raidTierForSpeciesId(...) ?? undefined` (~line 164) — that one
already delegates to `bossEffectiveStats`'s own internal default, which now
resolves the same per-rarity way automatically inside the engine; no web-side
change needed there, only the sweep needed an explicit resolution because it
uses the tier as a bucketing map key.

**The bigger risk was stale prose, not stale code.** `IvSweepReport.tsx`'s
"Honest limitation" caveat paragraph explicitly described and relied on the
OLD behavior ("every non-live species defaults straight to tier 5, so the
tier-4+ filter's practical effect is narrow, excluding only ~7 targets"). That
claim inverted completely under the new default. Verified with a throwaway
`tierCheck.mts` (same scratch-script-in-`packages/web/src`-then-delete
technique as [[verification-without-browser-tool]]) importing
`allSpeciesOptions`/`raidTierForSpeciesId`/`speciesRegistry` from `registry.ts`
directly (note: `speciesRegistry` is a `SpeciesRegistry` instance, not a
factory function — `speciesRegistry.get(id)`, no second `()` call) plus
`defaultRaidTierForSpecies` from the engine: of 1081 species, the per-rarity
default now buckets 915 as 3-Star (excluded), 112 as 5-Star, 49 as Mega Raids,
1 Super Mega, 4 live at 1-Star — tier4Plus = 162 of 1081, excluding 919. The
filter's practical effect flipped from "excludes ~7" to "excludes the vast
majority (mostly ordinary Standard-rarity species now correctly bucketing at
3-Star)". Rewrote both the inline `raidTierForSpeciesId(id) ?? ...` code
snippet (now shows `defaultRaidTierForSpecies(species)`) and the full caveat
paragraph to state this plainly with the new real numbers computed live from
`sweepAggregate`, not hardcoded — same "stays accurate as data changes"
convention as the original tier-filtered-headline work.

**General lesson for any engine-side default/formula change**: search web-side
help text and caveat prose for descriptions of the OLD behavior, not just code
call sites — a UI can compile fine and still ship a paragraph that confidently
asserts something no longer true. `RAID_TIER_NUMERIC`'s doc comment in
`ivBreakpointsHelpers.ts` and the `feature-iv-breakpoints-tier-filtered-headline`
memory's own index line ("narrow practical effect") were both stale after this
fix — the index line was corrected in the same pass; the older memory file's
body left mostly intact but should be read alongside this one, not instead of it.

**Verification level**: `npx tsc --noEmit -p tsconfig.json` clean,
`npm run build --workspace=packages/web` succeeded (same pre-existing >500kB
chunk warning, no errors), then served the built `dist/` via `vite preview`,
curled `http://localhost:4183/` for a 200, and grepped the built JS bundle for
`"substantial, not narrow"` and `"defaultRaidTierForSpecies"` — both present.
Did not click through in an actual rendered browser (no browser-preview tool
in this session's grant, same Read/Write/Edit/Bash/Grep/Glob ladder as prior
IV Breakpoints work).
