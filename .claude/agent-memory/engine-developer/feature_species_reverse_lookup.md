---
name: feature-species-reverse-lookup
description: speciesReport.ts's runSpeciesReverseLookup — one species swept against caller-supplied boss targets, plus the cheap type-matchup-percentile helpers; the corpus-shape call I had to make myself
metadata:
  type: project
---

Implemented 2026-09-06, per `.claude/agent-memory/pogo-researcher/proposal_species_reverse_lookup.md`
(design doc, read in full first). New file `packages/engine/src/speciesReport.ts`, exported from
`index.ts`. Tests in `packages/engine/test/speciesReport.test.ts` (11 tests, full suite 126/126
passing after this change).

**Confirmed before building, not assumed**: `ComparisonInputs.candidates`/`SustainedComparisonInputs.candidates`
really is a plain `SpeciesDefinition[]` with no hardcoded length — a one-element array (`[species]`)
is already fully legal today, exactly as the design doc claimed. Also confirmed the
`RAID_BOSS_CPM=1.0`-on-real-species prerequisite the design doc flagged as blocking (§0) was
**already resolved** by the time I started — `raidBoss.ts`'s `RAID_TIER_TABLE`/`bossEffectiveStats`/
`bossEffectiveHp` tier-stats fix had already landed (see git log: "moveset selection, dodge-feasibility
gating..." commit). Nothing to re-derive there.

**Design call I had to make myself (design doc didn't fully spec this)**: how the "type-matchup
percentile" corpus (design doc §2: "across all registered species' fast/charged move types vs the
boss's types") gets into this engine package at all, given the no-I/O rule means the engine can
never itself enumerate "every registered species." Resolved as: `SpeciesReportInputs.typeMatchupCorpus?:
AttackerTypeProfile[]` — a plain array of `{fastMoveType, chargedMoveType}` pairs (NOT full
`SpeciesDefinition`s) that the caller (web layer, e.g. iterating `data/normalized/species.json` via
registry.ts) gathers once and passes in; `runSpeciesReverseLookup` then does the actual (still
cheap, still pure `typeEffectiveness()` arithmetic, no simulation) per-boss re-ranking internally,
since a percentile is relative to that specific boss's types and needs recomputing per row. Omitting
`typeMatchupCorpus` entirely just means every row's `typeMatchupPercentile` is `undefined` (still gets
the raw `offensiveTypeMatchup` either way) — an honest "no context available," not a fabricated
number. Flagging this because a future caller could reasonably have expected the engine to source
the corpus itself; it structurally cannot (see `CLAUDE.md`'s "no I/O" rule for this package).

**Also explicitly excluded, per the design doc's own instruction, not a thing I discovered
independently**: no synthetic "other trainers" party, no `convertUptimeToTeamDamage`/team-damage
attribution anywhere in this feature — a single-species view has no second party to attribute
team-boost credit to. A species' `boost` is surfaced only as a flat informational fact
(`hasMegaBoost`/`boostedType`/`boostMultiplier` on `SpeciesReportResult`, species-level not
per-row since it doesn't vary by boss) — this is the one place this design could have drifted
toward the ruled-out Teambuilding Analyzer, and it deliberately doesn't.

**bossChargedMoveMeanIntervalSeconds is one shared value across the whole sweep, not per-boss** —
confirmed by grepping `packages/web/src` that this has always been a single user-adjustable
assumption (`Scenario.bossChargedMoveFrequencySeconds`), never sourced per-species data this
engine has anywhere. Same convention followed here: one input threads unchanged into every
`runSustainedComparison` call across all boss targets.

**Per-target `bossFastMoveId`/`bossChargedMoveId` support**: added even though the design doc's
sequencing note (§Sequencing, step 2) didn't explicitly ask for it, since `comparison.ts` already
supports this per-boss and it was zero extra cost to thread through `SpeciesReportBossTarget`. Not
flagging this as a "call" since it's just consistent reuse, not a product decision.

See also [[feature_weather_and_boss_moveset_sweep]] (the `bossRaidTier` threading convention this
copies) and [[feature_team_raid_wipe_and_revive]] (the `teamRaid.ts` orchestration-reuse precedent
this follows — thin orchestration over existing sim, no second combat model).

**Gotcha hit while implementing** (not a real bug, just a TS strictness note for next time):
`SustainedComparisonInputs.candidateFastMoveIds` is `(string | null)[]` — building it as
`[inputs.fastMoveId]` where `inputs.fastMoveId?: string | null` fails to typecheck, because the
array literal's inferred element type includes `undefined`, which isn't assignable into a
`(string | null)[]`-typed array element even though `undefined` is fine for a bare optional
property. Fix: `[inputs.fastMoveId ?? null]`. Direct optional-property assignments
(`bossFastMoveId: target.bossFastMoveId`) don't have this problem — only array-literal wrapping
of an optional value does.
