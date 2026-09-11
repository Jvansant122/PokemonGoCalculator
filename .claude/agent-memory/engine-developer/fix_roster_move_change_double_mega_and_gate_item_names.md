---
name: fix_roster_move_change_double_mega_and_gate_item_names
description: rosterMoveChange.ts's benched-substitution double-mega throw (fixed by displacing the fielded mega slot, not the weakest slot) + describeEvolutionRequirement now humanizes raw ITEM_*/lure constants instead of leaking them
metadata:
  type: project
---

Two independent bugs fixed together 2026-09-11, reported by the user with an exact repro for the
first one.

## 1. `rosterMoveChange.ts` BENCHED path could field two `isMega:true` slots

**Root cause**: the benched real-eval loop always swapped a candidate into `fieldedEntries.length
- 1` (the team's plain weakest/6th slot). If the candidate itself was `canMega: true` AND the
baseline team's fielded mega (`selectTeam`'s own pick) was NOT at that weakest index — the
ordinary case, since a good mega usually scores near the TOP, not the bottom — the resulting
`candidateSlots` carried two `isMega: true` entries and `runTeamRaid` threw "At most one team-raid
slot may be flagged isMega... Got 2." This is not an edge case: the planner always fields its
single best mega, so every OTHER mega-capable pool entry is benched by construction — "baseline
team has a mega + a different mega-capable entry is benched" is the ORDINARY shape of a real
roster, confirmed by `web-developer` hitting it on the real `pokeGenieSample.csv` fixture (Mega
Delphox fielded + Mega Blaziken benched).

**Chosen fix (of 3 options the task laid out, none prescribed)**: when the benched candidate is
mega-capable AND a DIFFERENT fielded entry already holds the team's one mega slot, displace THAT
fielded mega slot instead of the weakest one, rather than (a) silently forcing the candidate's own
`isMega: false` (understates a would-be-great mega badly) or (c) excluding the pairing outright
(guts the "not limited to the six fielded" headline feature for most real rosters, per the task's
own framing). This mirrors `rosterPlanner.ts`'s own `selectTeam` convention of skipping a SECOND
`canMega` entry rather than letting two through — same constraint, applied at the single-swap
level instead of the whole-team level.

**This changes what the delta means for exactly this case**, so it's surfaced explicitly rather
than left implicit (project's "never silently misreport a candidate's value" rule):
`RosterSecondChargedMoveCandidate`/`RosterEliteTmCandidate` both gained `displacedEntryId: string
| null` (the entryId of the fielded member actually swapped out; `null` for `fielded: true` rows)
and `displacedFieldedMega: boolean` (true only for this mega-conflict case). A UI showing these
rows should read `displacedFieldedMega: true` as "would replace your CURRENT mega," not "would
join your weakest slot" — **flagged for `web-developer`, not yet consumed by any UI**.

**Regression test**: `packages/engine/test/rosterMoveChange.test.ts`'s new "at-most-one-mega"
describe block, backed by two new fixtures in `rosterMoveChangeFixtures.ts`
(`MULTI_MOVE_TEAM_MEGA_SPECIES` — slot 0 boosted so `selectTeam` deterministically claims it as
the fielded mega; `MULTI_MOVE_BENCH_MEGA_SPECIES` — also mega-capable but deliberately weaker, so
it stays benched rather than displacing team-0 in the baseline itself, since `selectTeam` skips
ANY second `canMega` entry outright once the slot is claimed regardless of score). Verified the
new test actually fails against the pre-fix code (reverted `swapIndex` to `weakestIndex` only,
confirmed the exact reported error text, then restored) — not just "passes now," per this
project's own discipline.

## 2. Gated-evolution item constants leaked raw (`describeEvolutionRequirement`)

`ITEM_SUN_STONE` etc. were interpolated verbatim into `GatedEvolutionNotice.requirementSummary`.
Fixed AT THE SOURCE (`rosterPlanner.ts`'s private `describeEvolutionRequirement`), not by exposing
raw fields for the web layer to format — one place, every consumer benefits, matches how the task
was framed.

Two new lookup tables, keyed on the exact raw values observed on the CURRENTLY SYNCED roster
(checked via a throwaway `node -e` over `data/normalized/species.json`, 2026-09-11): 7 items
(`ITEM_SUN_STONE`/`ITEM_KINGS_ROCK`/`ITEM_METAL_COAT`/`ITEM_DRAGON_SCALE`/`ITEM_UP_GRADE`/
`ITEM_GEN4_EVOLUTION_STONE`→"Sinnoh Stone"/`ITEM_GEN5_EVOLUTION_STONE`→"Unova Stone"), 4 lure
constants (`ITEM_TROY_DISK_{GLACIAL,MOSSY,MAGNETIC,RAINY}`), plus 5 oddly-named real ones found in
the data (`ITEM_OTHER_EVOLUTION_STONE_MAPLE_{A,B,C}` → Applin's Tart/Sweet/Syrupy Apple,
`ITEM_OTHER_EVOLUTION_STONE_A` → Gimmighoul Coins [count 999 matches the known mainline
requirement], `ITEM_BEANS` → Zygarde Cells [an internal-id reuse, moderate-not-total confidence]).
**Deliberately NOT added to MECHANICS.md** — these are applied from general Pokémon GO item
knowledge, not independently re-verified via a live source lookup this session, and the task
explicitly said only record a mechanic actually verified. A future session citing these as sourced
fact should re-confirm first, especially the Zygarde Cell / Gimmighoul Coin / Applin-item ones —
[[user_field_researcher]] would be the natural cite-check if in doubt.

**Fallback for anything unmapped**: `humanizeGateConstant(raw, table)` de-constant-ises
("ITEM_FOO_BAR" → "a Foo Bar") wrapped in an "(unconfirmed name — raw: ...)" marker rather than
inventing a product name — deliberately its own named, greppable function so a search for
`humanizeGateConstant(` or its distinctive output text finds every place the fallback (not a
confirmed table entry) is actually reached. `requiresGender` also lowercased ("FEMALE" → "female")
while in the area — same raw-constant-leak class, low risk, not separately asked for.

**A pre-existing test fixture broke, correctly**: `GATED_ONLY_SPECIES` (rosterPlannerFixtures.ts)
had hand-authored `requiresItem: "Metal Coat"` (already-human string, not a real raw GAME_MASTER
constant like `data-sync` actually writes) — unrealistic even before this fix, it just didn't
matter until humanization started keying off the `ITEM_` prefix shape. Fixed the FIXTURE to
`"ITEM_METAL_COAT"` (matching real synced data) rather than special-casing the humanizer to accept
bare display strings — 3 downstream test assertions in
`rosterPlannerEvolutionAndCatches.test.ts` updated from `"needs Metal Coat, 50 candy"` to `"needs
a Metal Coat, 50 candy"` to match. Worth remembering for any FUTURE hand-authored
`GatedEvolutionOption` fixture: use the real `ITEM_*` shape, not a shortcut display string, or a
later humanization-adjacent change will silently test the wrong thing again.

4 new focused tests added directly to `rosterPlannerEvolutionAndCatches.test.ts`'s
`gatedEvolutionNotices` describe block (mapped item, mapped lure, gender lowercasing, unmapped
fallback) — didn't need a new fixture file, built inline via the existing `makeAttacker` helper
(newly imported into that test file) with a one-off `gatedEvolutions` array per test.

## Files

`packages/engine/src/rosterMoveChange.ts` (swapIndex/displacesFieldedMega logic + 2 new output
fields + top-doc-comment section), `packages/engine/src/rosterPlanner.ts`
(`GATE_ITEM_DISPLAY_NAMES`/`GATE_LURE_ITEM_DISPLAY_NAMES`/`humanizeGateConstant`/
`describeEvolutionRequirement`), `packages/engine/test/rosterMoveChange.test.ts` (+2 tests),
`packages/engine/test/fixtures/rosterMoveChangeFixtures.ts` (+2 fixtures + `MEGA_BOOST`),
`packages/engine/test/rosterPlannerEvolutionAndCatches.test.ts` (+4 tests, 3 pre-existing
assertions updated), `packages/engine/test/fixtures/rosterPlannerFixtures.ts`
(`GATED_ONLY_SPECIES`'s `requiresItem` fixed to a real raw constant). Suite 593 -> 599, both
engine typecheck configs clean (and web/scripts typecheck unaffected — additive fields only),
lint clean. `packages/web` NOT touched (task's explicit instruction) —
`displacedEntryId`/`displacedFieldedMega` are real new fields with no UI consumer yet; flag for
`web-developer` if/when this candidate table is surfaced.
