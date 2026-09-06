---
name: proposal-species-reverse-lookup
description: Proposed 2026-09-05 — "what raid bosses is this Pokémon good against" per-species view; surfaces a load-bearing pre-existing bug (RAID_BOSS_CPM=1.0 applied to real synced bosses gives wrong HP/attack/defense) as a hard prerequisite
metadata:
  type: project
---

Status: proposed 2026-09-05, design-only (explicitly requested), not routed/built. Committed
single recommendation, not a menu, per user's instruction to match the last two deep-pass
proposals' bar.

## 0. Headline finding first, because it gates everything else

**`RAID_BOSS_CPM = 1.0` (`packages/engine/src/raidBoss.ts`) is only correct for this project's 4
hand-authored hypothetical boss fixtures — it is silently wrong for any of the ~10-12 REAL synced
species currently usable as a live-raid target today.** Confirmed by reading code, not inferring:
`bossEffectiveStats()` (`comparison.ts`) computes a boss's effective attack/defense/HP as
`floor(baseAttack/baseDefense/baseStamina * 1.0)` with `RAID_BOSS_IVS = 0` — i.e. it treats
whatever is in `SpeciesDefinition.baseAttack/baseDefense/baseStamina` as already-final boss stats.
For `PRIMAL_KYOGRE`/`MEGA_SKARMORY`/etc. (`fixtures/scenarioA.ts`) that's true by construction —
their base-stat fields were deliberately hand-tuned to already BE boss-effective numbers (the
fixture file says so directly). But for a real synced species like `victreebel` (`baseAttack: 207,
baseStamina` in the low 200s, confirmed by reading `data/normalized/species.json` directly — real
Bulbapedia player-Pokémon base stats, not boss stats), running it through the exact same pipeline
gives a "Mega Victreebel" raid boss with ~200 HP and a 1.0-multiplier attack stat. A real Mega
Victreebel raid boss has an HP pool in the thousands and a tier-specific attack/defense multiplier,
neither of which resembles its own base stats.

This is **not new bug my feature would introduce** — it already silently affects today's shipped
two-candidate comparator any time a player targets a live raid boss instead of one of the 4
hypothetical fixtures (`activeRaidBossOptions()`/`targetPickerOptions()` in
`packages/web/src/registry.ts` surface the real raid roster as directly selectable targets right
now). My reverse-lookup design would be the first feature to sweep across *many* real bosses at
once, which is exactly what would make a quietly-wrong-per-boss-HP problem visible and repeated
across a whole ranked table, so I'm surfacing it here as a **hard prerequisite**, not something to
build around.

**Real numbers, tagged by confidence, with an unresolved discrepancy flagged rather than picked:**
- Direct Bulbapedia fetch (`Raid Battle (GO)`, fetched 2026-09-05): Tier 1 HP 600 / mult 0.5974;
  Tier 3 HP 3600 / mult 0.73; Mega HP 9000 / mult 0.79; Tier 5 HP 15000 (mult not captured); Primal
  HP 22500 (mult not captured). This matches the HP figures already recorded in
  [[proposal-raid-clear-timer-hp]] from an earlier fetch of the same page — two independent fetches
  agree on HP.
- A separate `WebSearch` pass the same day, also claiming to summarize the same Bulbapedia page,
  said instead: "all raid boss CP multipliers are 1" and gave HP as 600/1800/3000/7500/12500 with
  Mega HP 9500/mult 0.79 — **disagrees with the direct fetch on Tier 3/5/Primal HP and on whether a
  non-1.0 attack/defense multiplier exists at all.**
- **I am not resolving this discrepancy myself and am not fabricating a table to hand off.** Both
  readings are AI-summarized fetches of the same nominal source, not literal quoted text — before
  `data-sync`/`engine-developer` hardcodes any of these numbers, someone needs an actual verbatim
  quote (viewing the live Bulbapedia table cells directly, or cross-checking leekduck.com's stated
  raid boss CPMs) rather than a second AI paraphrase. Tag: [community-consensus, internally
  inconsistent across two fetches — re-verify before hardcoding].

## 1. Feasibility — what's actually queryable today (read `data/normalized/*.json` + `registry.ts` directly)

- `data/normalized/species.json`: ~1079 real species, flat list, **no boss/tier tag of any kind** —
  confirmed by grep, zero hits for `isRaidBoss`/`tier` anywhere in the file. There is no queryable
  notion of "every species that has ever been a boss" — that would need new `data-sync` sourcing
  (e.g. Bulbapedia's historical raid-boss-list article), a real, separate ask I am naming but not
  folding into this design.
- `data/normalized/activeRaids.json`: the ONE real, current, queryable boss list — 14 entries as of
  this sync, each with `raidName`/`tier`/`speciesId | null`/`isApproximate`. `registry.ts`'s
  `activeRaidBossOptions()` already filters this down to entries with a resolvable `speciesId`
  (currently ~10-12 of the 14 have one — a couple of `speciesId: null` entries exist for bosses this
  project has no stat source for yet, e.g. "Mega Mewtwo X" in the current snapshot).
- **Recommendation: scope v1 to `activeRaidBossOptions()`'s current live roster only.** Not "every
  species tagged as ever-a-boss" — that tag doesn't exist, and inventing one is its own
  `data-sync` project. This does mean the reverse-lookup table is only ever as wide as whatever's
  actually in rotation (~10-12 rows today) — smaller than a player might expect from a "what is this
  good against" feature, but it is the only honestly-sourced, currently-queryable list; flagging
  the size honestly rather than padding it with speculative/historical bosses this project can't
  back with real stats. This directly matches the always-visible, no-user-selectable-mode framing
  the tool already uses elsewhere (real raid feed pinned to the top of `targetPickerOptions()`).

## 2. What "most effective against" means — commit to the survivability engine, not flat DPS

**Recommendation: reuse `runSustainedComparison` (single-candidate array, `[selectedSpecies]`)
per boss — the real stepwise/dodge/randomized-boss-cadence simulator, not a flat power/duration DPS
number.** Read `comparison.ts` directly to confirm this is actually available at this granularity:
`ComparisonInputs.candidates`/`SustainedComparisonInputs.candidates` are plain `SpeciesDefinition[]`
with no hardcoded length — a one-element array is already a fully legal call, no engine change
needed for this part. Its `DistributionSummary` return (`simulate.ts`) already carries
`meanTotalDamage`, `meanSecondsSurvived`, `fractionSurvivedFullWindow`, and percentile bands per
boss — a genuinely survival-weighted number (200 randomized iterations against THIS boss's real
moveset/cadence/type matchup), categorically different from, and more honest than, a wiki's
generic "DPS = power/(fast+charged duration)" stat that ignores whether the attacker is even still
alive against this specific boss's real incoming damage.

**Explicitly NOT reusing `convertUptimeToTeamDamage`/`teammateDps` for this feature — stated why,
not silently dropped.** That function's whole job is attributing a mega's team-wide boost credit
to teammates/other trainers, which requires a second party (`matchingTeammateCount`/`partySize`) to
attribute anything to. A single-species reverse lookup has no second party to model, and inventing
a synthetic "typical roster" to run it against would be exactly the kind of fabricated-number risk
I'm supposed to avoid, and edges toward the ruled-out Teambuilding Analyzer's "model other
trainers/teams" territory (see §6). Where a species DOES carry `species.boost`, surface it as a
plain annotation/badge — "grants a team-wide 1.3x Water boost to other trainers in this raid while
active" (per [[fact_mega_boost_other_trainers_not_own_party]], already corroborated) — informational
text, not a second computed number standing in for a party that isn't there.

**Net: the "team DPS not raw damage" thesis shows up here as "survival-adjusted sustained output
against this specific boss," not as a party-size ranking flip** (there's no second candidate here
for a flip to occur between) — this is a real, narrower slice of the thesis than the two-candidate
tab's headline, and I'm stating that distinction explicitly rather than overclaiming this view
also produces "flip points."

**Secondary, cheap context stat — a type-matchup percentile, NOT a full simulated field-rank.**
Per Q3's ask for "rank among plausible attackers, not just a raw number": running the full stepwise
simulator for all ~1079 species against every boss (the previously-proposed, still-pending
[[proposal-field-survey-ranked-table]]) is explicitly out of scope here — same cost concern that
proposal already flagged, and I am not quietly rebuilding it under a new name. Instead: a single
cheap, no-simulation pass using the already-exported `typeEffectiveness()` (arithmetic only, no
200-iteration runs) across all registered species' fast/charged move types vs. the boss's types,
producing something like "top 12% type-matchup among registered attackers for this boss" — an
honest, cheaply-computed *type-matchup* percentile, explicitly labeled as such (not a DPS-based
rank) so it's never confused with a real simulated leaderboard.

## 3. Output shape — one selected species, a ranked table of bosses

For the selected species (plus its own level/IV/moveset/dodge assumptions — see §4's new
shareable-state type):

| Boss (image, name, tier badge, `isApproximate` flag if inherited) | Type matchup (e.g. "2x", "0.625x") | Sustained mean damage over the run window (labelled with the already-shipped DPS/TDO vocabulary) | Mean seconds survived / % of runs surviving the full window | Type-matchup percentile among registered attackers (labelled explicitly as type-only, not simulated) | Mega/primal team-boost badge, if applicable |

Default sort: sustained mean damage descending (i.e., "where does this Pokémon perform best,"
matching the "start from a Pokémon" framing) — with a secondary sort option by type-matchup
percentile for a quick sanity check independent of level/IV assumptions. Each row gets a
"Compare against another attacker for this boss" action (see §4) — this is the literal mechanism
that turns "found a good matchup" into "now validate it against a specific alternative," which is
what the existing two-candidate tab is already built to do well.

## 4. Where this lives — a new front-door view, feeding the existing comparator, not replacing it

**Recommendation: a new top-level view, and specifically the one a player lands on first** — the
"start from a Pokémon, not a raid" framing argues for making this the entry point, not a third
peer tab buried alongside the other two. Concretely: select one species (reusing the existing
`SpeciesPicker`), optionally override its fast/charged move and level/IVs/dodge assumptions (a
smaller subset of `Scenario`'s existing per-candidate fields — no second candidate, no boss/target
selection since bosses are swept, not chosen), and the ranked table above renders live.

Clicking a boss row's "Compare against another attacker" action pre-fills the existing
two-candidate comparator's `target` (that boss) and `candidateAId`/`candidateAFastMoveId`/
`candidateAChargedMoveId` (this species and its chosen moves), leaving `candidateBId` open for the
player to pick — this is the literal "picking a boss from this view pre-fills a comparison"
integration the task suggested, and I'm committing to it as the recommended hand-off mechanism, not
listing it as one option among several.

**App.tsx currently has no tab/view-routing concept at all** (confirmed by reading it — one
continuous page). This reverse-lookup view and the already-designed-but-UI-pending
[[proposal-sequential-team-raid-tab]] (engine-side `teamScenario.ts`/presumably `teamRaid.ts` exist
already, per a direct read of `packages/engine/src/teamScenario.ts`; no matching web view exists
yet, confirmed — `packages/web/src/*.tsx` has no team-raid component) **both need the same new
tab/view-switcher scaffolding.** Flagging this explicitly so whichever gets scheduled first builds
that shared scaffolding once, not twice — a genuine sequencing note for the overseer, not a
decision I'm making about which ships first.

**New shareable state required — a small sibling type, not an extension of `Scenario` or
`TeamScenario`.** Per the standing decision every user-facing assumption must round-trip: this view
introduces speciesId + fast/charged move overrides + level/IVs/dodgeModel/dodgeFastAttacks/weather
as real, adjustable inputs with no existing home (no boss/target, no second candidate — genuinely
different shape from both existing scenario types). Recommend `SpeciesReportScenario` (or similar),
mirroring `Scenario`/`TeamScenario`'s existing base64url-JSON codec pattern exactly. Naming this
explicitly per the task's instruction rather than leaving a new input implicit.

## 5. Scale/performance — assessed concretely, not hand-waved

**Cheap, live, no precomputation needed, for the scope actually recommended.** The outer loop is
bounded by the real active-raid-boss count (~10-12 today), not by the ~1079-species field — this is
the opposite computational shape from the deferred Field Survey proposal (which sweeps ~1079
species against ONE boss). Per boss: one `runSustainedComparison` call, one candidate, 200
iterations (the same per-call cost the existing two-candidate tab already pays twice per
comparison) — ~10-12 such calls for a full table is on the same order as the existing tab's normal
page-load cost, comfortably live-in-browser. The type-matchup percentile context stat is pure
arithmetic over ~1079 rows (no simulation at all) — negligible, sub-millisecond.

**This assessment is contingent on staying scoped to the real active-raid list.** If the boss list
is ever widened (e.g. a future "all historically-known bosses" `data-sync` extension pushes the
row count into the dozens or hundreds), the design stays cheap regardless, since the per-boss cost
is fixed and small — the only genuinely expensive shape (an N-species-wide field sweep per boss)
is explicitly not part of this design. No caching/precompute layer is being recommended for v1.

## 6. Standing-decision checks

- **No user-selectable combat phase**: untouched — each per-boss run is still one continuous
  `runSustainedComparison` call; nothing here introduces a phase toggle.
- **1.3 mega/primal boost**: untouched as a tuning knob — this design only ever *displays* a
  species' own `boost.multiplier` as an informational badge (§2), never varies it.
- **Every user-facing assumption round-trips through a Scenario-like type**: addressed explicitly
  in §4 — a new `SpeciesReportScenario` sibling type is a named, explicit requirement of this
  design, not an afterthought.
- **Teambuilding Analyzer (multi-trainer mega staggering) is out of scope**: this design stays on
  the "which single Pokémon is good where" side throughout — no other-trainer modeling, no
  synthetic party, no staggering/scheduling question anywhere in it. The one place this could have
  drifted (attributing team-boost credit via `convertUptimeToTeamDamage` against an invented
  "typical roster") is exactly what §2 explicitly declines to do, naming the risk rather than
  quietly avoiding it.

## Sequencing recommendation

1. **`data-sync` + `engine-developer` (prerequisite, blocks trustworthy numbers for real bosses)**:
   resolve the RAID_BOSS_CPM=1.0-on-real-species gap (§0) — needs a verified (not
   AI-paraphrased-twice) source for tier HP pools and attack/defense multipliers before hardcoding.
   This fix independently improves today's shipped two-candidate comparator too, whenever a live
   raid boss is the target — not solely a prerequisite for this new feature.
2. **`engine-developer`**: a thin new orchestrating function (e.g. `runSpeciesReverseLookup`) that
   loops `runSustainedComparison`-with-one-candidate across a list of boss `SpeciesDefinition`s, plus
   the cheap type-matchup-percentile helper. Reuses `bossEffectiveStats`/`resolveMove`/
   `typeEffectiveness` almost entirely as-is.
3. **`web-developer`**: the new front-door view, `SpeciesReportScenario` + codec, the tab/view
   scaffolding (coordinate with whoever builds the Team Raid Simulator's still-pending UI), and the
   "compare against another attacker" hand-off into the existing `AssumptionPanel`/`Scenario` state.

## Sources
- Bulbapedia, "Raid Battle (GO)" — https://bulbapedia.bulbagarden.net/wiki/Raid_Battle_(GO)
  (re-fetched 2026-09-05, targeted extraction): tier HP pools (600/3600/9000/15000/22500) and
  per-tier attack/defense multipliers (0.5974 T1, 0.73 T3, 0.79 Mega; T5/Primal not captured this
  fetch) — matches the HP figures already recorded from an earlier fetch in
  [[proposal-raid-clear-timer-hp]].
- `WebSearch`, "Pokemon GO raid boss CP multiplier by tier" (2026-09-05): a second AI-summarized
  pass over presumably the same Bulbapedia page giving DIFFERENT HP figures
  (600/1800/3000/7500/12500, Mega 9500) and claiming "all raid boss CP multipliers are 1" —
  contradicts the direct fetch above. Flagged as an unresolved discrepancy, not adjudicated by this
  agent; needs a literal-quote re-verification before any number here is hardcoded.
- Direct reads (not web sources): `packages/engine/src/raidBoss.ts`, `comparison.ts`, `stats.ts`,
  `simulate.ts`, `teamScenario.ts`; `data/normalized/species.json`, `activeRaids.json`;
  `packages/web/src/registry.ts`, `App.tsx` — grounded the feasibility/reuse/gap claims above in
  actual current code and data, not memory or assumption.
