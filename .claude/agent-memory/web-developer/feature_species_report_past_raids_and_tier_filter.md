---
name: feature-species-report-past-raids-and-tier-filter
description: Species Report tab gained a raid-tier checkbox filter and an "include past/inactive raids" toggle over data-sync's new raidHistory.json, plus 3 correctness fixes (mixed-unit sort, lying tier display, undocumented boss-moveset caveat) — the RAID_TIER_TABLE key-order trick for the tier checkbox list, and why the null/array includedTiers convention self-heals back to null
metadata:
  type: project
---

Built 2026-09-07 on top of data-sync's new `data/normalized/raidHistory.json`
(accumulate-only, `source: "live-feed" | "researched-tier"` provenance per
entry, started accumulating 2026-09-07 — NOT a complete historical archive,
see registry.ts's `pastRaidBossOptions` doc comment for the exact caveat
wording). Files touched: `registry.ts` (new `pastRaidBossOptions()` +
`RawRaidHistoryEntry`/`PastRaidBossOption` types), `speciesReportScenario.ts`
(`includedTiers`/`includePastRaids` fields), `SpeciesReportView.tsx` (both
new controls, the filtering, the badges, and the 3 correctness fixes). Zero
engine or data edits.

**`includedTiers: string[] | null` self-heals back to `null` when every
present tier is checked** — `toggleTier` computes the would-be next array and,
if its length equals `allTiersPresent.length` (every currently-visible tier
checked), stores `null` instead of the explicit full list. This matters
because `null` means "all tiers, including one that appears in the feed
LATER" per the task's explicit instruction not to invert this into an
exclusion list — an explicit array that happens to currently equal "every
tier" would silently exclude a brand-new tier the live feed adds tomorrow,
which is exactly the bug class this project keeps stubbing its toe on
(`null` = future-proof default, an array = an active choice the user made).
Don't "simplify" this away by always storing an explicit array; the
self-healing is deliberate.

**Filter targets before simulating, not rendered rows after — this was an
explicit, load-bearing instruction, not a nice-to-have.** `result` is a
synchronous `useMemo` doing 200 randomized sims per boss on every Level/IV
keystroke; the fix threads `includedTiers`/`includePastRaids` into the
`targets` useMemo itself (which `result` already depended on), so an
unchecked tier actually removes simulation work, confirmed by hand (filtering
active bosses down to "5-Star Raids" only cut a 16-boss roster to 4 targets
in a scratch script) rather than just trusting the diff.

**Tier ordering reused `Object.keys(RAID_TIER_TABLE)` directly, NOT the
existing `RAID_TIER_NUMERIC` map in `ivBreakpointsHelpers.ts`** (found first,
almost reused) — the task explicitly said "order it by the engine's own
RAID_TIER_TABLE key order," and `RAID_TIER_NUMERIC` reorders "Primal Raids"
before "Super Mega Raids" relative to the table's own literal key insertion
order (it ties Legendary Mega/Primal at the same number 6, listing Primal
second even though the table itself lists Super Mega Raids before Primal).
Small difference, but the task's wording was specific enough that the two
weren't interchangeable — read the literal ask before reaching for the
nearest-looking existing helper. `ivBreakpointsHelpers.ts`'s map is still the
right tool for a NUMERIC comparison (e.g. "tier 4+"); this is a pure
ORDERING/sort use case, an unrelated question.

**Fix: `sortRows`'s type-matchup mode mixed a 0-1 percentile against a
~0.39-2.56 raw multiplier per-row** (`b.typeMatchupPercentile ?? b.raw`
evaluated independently for each row being compared) — decided the scale ONCE
for the whole array instead (`rows.every(hasPercentile)` gates percentile vs.
raw for the entire sort, never mixed mid-comparison). Doesn't currently
manifest in practice (this view always supplies a non-empty
`typeMatchupCorpus`, so every row gets a percentile today), but the fix is
correct regardless of that coincidence — flagged explicitly by the parent
task as a review finding, not something caught by testing the current data.

**Fix: `row.bossTier ?? meta?.tier ?? "unknown tier"` displayed a tier the
simulation never actually used.** `speciesReport.ts`'s `runSpeciesReverseLookup`
passes `bossTier: target.tier` straight through — when the caller passed
`tier: undefined` (an unrecognized feed/history string, or omitted entirely),
`row.bossTier` is `undefined` too, and `runSustainedComparison` silently fell
back to `defaultRaidTierForSpecies` internally, a fact the row never carried
back out. Fixed with a `actualTierUsed(row, bossSpecies)` helper that
recomputes that same `defaultRaidTierForSpecies` fallback purely for display
and marks it `isFallback: true` (rendered as "— fallback" + an explanatory
title) rather than ever printing the raw, possibly-wrong feed string as if it
had been simulated. This bug was ABOUT TO GET WORSE with past raids added
(they have no `bossMetaById` entry at all) — worth checking for this same
"row shows raw data that was never actually the executed value" shape
whenever a UI prints something believed to feed an engine call, not just
when told to.

**Badge reuse for provenance, no new CSS**: `"past"` (live-feed) reuses
`badge-persists` (blue, already used for the informational mega-boost badge);
`"past (researched)"` reuses `badge-hypothetical` (orange) — chosen because
"researched-tier" shares the same epistemic status as "hypothetical"
(never-observed-live, i.e. a claim rather than a sighting), NOT because the
species itself is fake. Each carries a `title` with the actual provenance
detail (a formatted `lastSeenAt` date for live-feed, a flat "never observed
live" statement for researched) so hovering explains the distinction CLAUDE.md
requires stay visible, not flattened into one label.

**Verification this session**: `npx tsc --noEmit` clean, `npm run
check-scenario-roundtrip` reports all 14 Species Report fields round-trip
(up from prior session's count, +`includedTiers`/+`includePastRaids`),
`npm run test:engine` 21 files/174 tests green (proves zero engine edits),
`npm run build --workspace=packages/web` succeeded (pre-existing chunk-size
warning only). No browser-preview tool in this session's grant — used the
established scratch-script technique (a throwaway `.mts` in
`packages/web/src/`, run via `npx tsx` with an ABSOLUTE path — see
[[verification_without_browser_tool]], and note a real gotcha hit this
session: `cd`ing into the directory first and passing a relative filename to
`npx tsx` resolved against the WRONG cwd (`packages/web/`, not
`packages/web/src/`) and threw `ERR_MODULE_NOT_FOUND`; passing the absolute
script path fixed it immediately — prefer the absolute-path form from the
start next time) to confirm: (1) `pastRaidBossOptions()` never overlaps the
active roster and is sorted newest-`lastSeenAt`-first against the real
14-entry `raidHistory.json`; (2) a full scenario with non-default
`includedTiers`/`includePastRaids` round-trips byte-for-byte through both the
raw codec and the `buildSpeciesReportScenarioUrl`/`parseSpeciesReportScenarioFromUrl`
share-link path; (3) an old-style scenario missing both new fields decodes
them as `undefined`, proving the `?? DEFAULT_ASSUMPTIONS.field` guards are
load-bearing, not decorative; (4) the tier-order comparator and the
tier-filter target-count reduction against the REAL registered active/past
rosters. Also served the production build via `vite preview`, curled
root/JS/CSS for 200s, ran `node --check` on the bundle, and grepped the
shipped JS for the new literal UI strings ("Raid tiers to include", "Include
past/inactive raids", "No raid tiers selected", "past (researched)") to
confirm they actually shipped. Did NOT click through the live checkbox
group/toggle/badge rendering in an actual rendered browser — same
Read/Write/Edit/Bash/Grep/Glob-only tool grant as prior sessions, no browser
tool available.
