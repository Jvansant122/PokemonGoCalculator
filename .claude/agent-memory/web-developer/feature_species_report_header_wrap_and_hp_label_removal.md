---
name: feature_species_report_header_wrap_and_hp_label_removal
description: Species Report rankings-sheet header-wrap modifier class + removing the Boss HP "(sourced)"/"(tier default)" labels; concurrent-editing discipline on a shared styles.css
metadata:
  type: feedback
---

Two small, independent Species Report changes landed together (2026-09-09):

**Header wrapping.** `.time-series-table th, td { white-space: nowrap }` is shared by every
tab's tables, so a per-tab header-wrap need must go through a **modifier class** on that one
`<table>` (`table-wrap-headers`), never edits to the base rule. Inside the modifier scope: `th`
gets `white-space: normal` + `vertical-align: bottom` (common baseline for mixed 1-3 line
headers); `td` is left completely alone (base rule already keeps it nowrap). `white-space: normal`
alone does NOT force a title to stack in an auto-layout table — nothing squeezes the column
narrow enough on its own — so each narrow numeric column's `th` also needs an explicit
`max-width` in `ch`, sized off that column's own real body content (e.g. "Type matchup" → `7ch`,
matching content like "1.600x"). Breaking on hyphens needs NO extra CSS (`word-break`,
`overflow-wrap`) — default CSS line-breaking already treats a literal `-` as a soft break point,
so "Type-matchup" wraps to "Type-" / "matchup" for free; adding `overflow-wrap: break-word` would
have been redundant risk (mid-word breaks on words with no hyphen).

**Removing a provenance label without touching its logic.** The Boss HP column had
`(sourced)`/`(tier default)` spans driven by the SAME `validEraHp` guard that also decides the
simulation's `bossMaxHpOverride` (see [[feature_species_report_era_hp]]) — the user wanted the
label gone but the underlying override behavior (still the actual simulation input) completely
unchanged. That memory's claim "the same guard drives both the override AND the badge" is now
**half-obsolete**: only the override half survives. Removing the label made `validEraHp` (and its
import) fully unused in the view file — this repo lints unused imports as errors, so grep for
every other reference in that file before deleting the import, not just the one you're editing.
Also had to rewrite two comments/caveats that explicitly described the now-removed badge
behavior rather than leaving stale prose describing UI that no longer exists.

**Concurrent-editing discipline.** Told upfront another agent was live-editing
`TeamAssumptionPanel.tsx`/`TeamRaidView.tsx`/`runTeamRaid.ts`/`scenarioRoundtrip.test.ts` and to
never `Write` `styles.css` (only `Edit`, appending a new block at the end) since a whole-file
write would clobber their concurrent change. Followed that literally: every `styles.css` touch
was an `Edit` targeting the tail of the file, nothing else in it read or rewritten. The
post-edit hook's `tsc`/`check-scenario-roundtrip` output after every edit showed real,
pre-existing errors from those exact files (`showDetailedAssumptions`,
`effectiveBossChargedMoveFrequencySeconds` missing) — correctly ignored as the other agent's
in-flight work, not something to fix, since my own file (`SpeciesReportView.tsx`) had zero
errors of its own after each edit. Worth remembering: when told about concurrent edits, the
hook's per-edit output is the fastest way to confirm "my change introduced nothing new" without
touching `npm run verify`/`test`, which were both explicitly off-limits this session because both
suites were mid-flux.

See also [[feature_species_report_era_hp]] (now partially superseded by this one).
