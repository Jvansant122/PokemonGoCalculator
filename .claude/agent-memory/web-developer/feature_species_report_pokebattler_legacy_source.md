---
name: feature-species-report-pokebattler-legacy-source
description: Added the 5th raidHistory.json source "pokebattler-legacy" (65 rows) to registry.ts's union + both silent membership-test branches, fixing check-raid-history-sources; confirms the "widen the union and stop" trap this project keeps hitting
metadata:
  type: project
---

Built 2026-09-08. Task was explicitly framed as dangerous, not routine: when
`"bulbapedia-archive"` was added earlier, `registry.ts`'s union AND two
membership-test branches (`resolvePastRaidTier`'s recordedTier-trust check,
`DATELESS_RAID_HISTORY_SOURCES`) still keyed literally on `"pogoapi-previous"`
and 32/75 real rows were silently mis-tiered/mis-sorted until someone
happened to look — see [[feature_species_report_era_hp]] for that incident.
`npm run check-raid-history-sources` (new since that incident — a static
guard, not a runtime check) exists specifically to catch the SAME shape of
gap the next time, and did: it failed cleanly on `pokebattler-legacy` before
this session's fix, listing exactly what was missing.

**The four sites that all needed the new literal, matching the task's own
pre-mapped list exactly**: `RawRaidHistoryEntry.source` union (registry.ts),
`PastRaidBossOption.source` union (registry.ts — NOT checked by the script,
which only regexes the FIRST `source:` union it finds in the file, but still
correct to keep in sync since it's assigned straight from the raw union and
would otherwise silently narrow), `resolvePastRaidTier`'s three-way
recordedTier-trust condition, and `DATELESS_RAID_HISTORY_SOURCES`. Plus
`SpeciesReportView.tsx`'s badge title text, which the else-branch already
handled MECHANICALLY (any source that isn't `"live-feed"`/`"researched-tier"`
falls into `"badge-past-archive"`/`"past (archive)"`) but whose tooltip
string still said "pogoapi's previous-raids archive, or Bulbapedia's
raid-boss-change pages" — accurate code path, stale prose. **The check
script only catches the two membership-test branches (registry.ts); it
cannot catch a tooltip string being wrong for a source that already falls
into the correct code branch by construction** — that's a "read the actual
prose, don't just trust the branch executed" step a human/agent still has to
do by hand every time a source is added to a badge group.

**What makes `pokebattler-legacy` a genuine 3rd distinct case, not a copy of
`bulbapedia-archive`**: same evidentiary shape (real past encounter, no date,
recorded tier IS the fact) so it joins the SAME archive badge/hue and the
SAME `resolvePastRaidTier`/`DATELESS_RAID_HISTORY_SOURCES` branches — but it
diverges on `eraHp`: Pokebattler re-maps its archive onto TODAY's tier labels
rather than preserving the actually-live-at-the-time tier/HP, so it
structurally can never carry a real `eraHp` (confirmed 0/65 rows have one,
not just assumed from the source's description). Measured the recordedTier
divergence the same way the two prior sources were measured (this project's
established "prove it's load-bearing, don't just claim it" convention):
26/65 pokebattler-legacy rows disagree with `defaultRaidTierForSpecies`
today, comparable in rate to the other two archive sources (203/470,
32/75) — trusting the recorded tier is real work here too, not a formality.

**Badge decision**: shared the existing `badge-past-archive`/"past (archive)"
badge across all three archive sources rather than forking a 4th color,
per the task's own precedent-following framing — rewrote the tooltip to name
all three sources plus the shared "none of the three records a date" fact,
and rewrote `styles.css`'s doc comment on `.badge-past-archive` the same way
(it previously said "Two sources share this one badge/hue" by name). Did NOT
touch `.badge-hypothetical` — a past-raid provenance badge is never the
right badge for "this species' data is speculative," a distinction this
project has gotten wrong before (see CLAUDE.md's fixture-deletion history)
and the task explicitly warned against re-making.

**Verification**: `npm run check-raid-history-sources` → `ok all 5 source
value(s) present`; `npx tsc --noEmit` clean; `npm run
check-scenario-roundtrip` unchanged at 77 total fields (confirms this is a
tiering/display fix, not a new setting — correctly out of scope for a
`Scenario` field, matches [[feature_species_report_era_hp]]'s same
non-decision). No dev server was actually running despite the task claiming
one was on :5173 (curl got connection-refused/exit 7) — started one myself
in the background via `npm run dev --workspace=packages/web -- --port 5173
--strictPort` rather than assuming the claim was accurate; **worth checking
a claimed-running dev server with curl before trusting it, since a stale or
wrong claim wastes a verification round-trip otherwise.** Used the
established scratch-`.mts`-under-`packages/web/src/`-run-via-absolute-path-
`npx tsx` technique (see [[verification_without_browser_tool]]) to call
`pastRaidBossOptions()` directly against the real 668-row JSON: confirmed
649 non-active past options total, all 65 pokebattler-legacy rows present
and correctly excluded from being treated as active, and spot-checked
`archen`/`bombirdier` (both `1-Star`/`3-Star Raids` respectively) matching
their raw JSON `tier` exactly with `eraHp: undefined` as expected. Also
curled the running dev server's Vite-transformed source for both edited
files to confirm the new literals ("pokebattler-legacy", "Pokebattler")
actually shipped, and ran the real production build (`npm run build
--workspace=packages/web`) clean (pre-existing chunk-size warning only).
Deleted the scratch script and confirmed via `git status --porcelain` no
stray file remained — note the working tree had substantial OTHER
concurrent uncommitted work already present (data-sync's own
`pokebattler-legacy` sync code, an unrelated engine `bossMaxHpOverride`
feature, etc.) at session start, none of it touched by this diff.
