---
name: pass_2026-09-09_six_tabs_collapsible_multiraid
description: Post-d1b6bff (collapsible sections) / 3043516 (multi-raid optimizer) / c62248a (energy-gated cadence) audit — confirms 09-07b's chart bug fixed, finds multi-raid ranked table never shows cost-efficiency columns despite engine computing them, and a mislabeled past-raid count in Species Report
metadata:
  type: project
---

## Confirmed fixed since 2026-09-07b — don't re-flag

- **DamageOverTimeChart double-crossing bug is FIXED.** The crossing-detection logic was extracted
  into `packages/web/src/rankingFlip.ts`'s `computeRankingFlip` (cited as "AUDIT_2026-09-08.md
  finding 0" in its own doc comment) and now deliberately keeps overwriting `crossing` as later
  flips are found, so it holds the LAST flip, not the first. Re-ran the exact repro from the
  09-07b pass (`?view=comparator` zero-param default, Kartana/Rayquaza/Mega Latios) — same
  underlying per-second table (delta flips sign at 5s->6s AND again at 6s->7s) but the marked
  crossing is now `~7.0s` (the LAST, decisive flip) with the caveat sentence "Rayquaza leads by
  the end of this window" — correct and self-consistent this time.

## Confirmed bug: Power-Up Optimizer multi-raid mode never shows or sorts by cost-efficiency

The engine's `RosterPowerUpCandidate` (`packages/engine/src/rosterPlanner.ts`) computes
`deltaPer1000Stardust`/`deltaPerCandy`/`deltaPerXlCandy` for every multi-raid candidate — the doc
comment on `deltaPerCandy` literally cites "CLAUDE.md standing decision" for never blending
stardust+candy. But `grep -r "deltaPer1000Stardust\|deltaPerCandy\|deltaPerXlCandy"
packages/web/src` finds ZERO matches outside a dedupe test file — the multi-raid UI
(`MultiRaidCandidateTableHead`/`MultiRaidCandidateRow` in `PowerUpOptimizerView.tsx`) never reads
these fields at all. The multi-raid "Ranked candidates" table's only ranking column is
`meanDeltaTeamDps` (an absolute, unnormalized number — `rosterPlanner.ts:1129`
`.sort((a, b) => b.meanDeltaTeamDps - a.meanDeltaTeamDps)`), with no per-1000-stardust/per-candy
column and no sort-by control anywhere in multi-raid mode. This is the exact single-raid design
this project already got right (`PowerUpOptimizerView.tsx` lines ~1550-1607, the single-raid
candidate table, HAS `/1000 stardust`/`/candy`/`/XL candy` columns plus a `rankBy` selector at
`assumptions.rankBy` — single-raid mode correctly implements "ranked by team-DPS gained per 1000
stardust and per candy SEPARATELY, never one blended score," multi-raid mode does not implement it
at all). Practical consequence: a multi-raid candidate costing 10x more stardust for a slightly
bigger absolute gain will always outrank a far cheaper, more efficient one — the opposite of the
product's own stated thesis ("ranks every power-up... not raw CP or Attack," visible in the
single-raid subtitle). Repro: `?view=power-up-optimizer`, switch to Multi-raid, import
`packages/web/src/import/test/pokeGenieSample.csv` (paste its contents into "...or paste CSV
text"), set any candy-family field (e.g. "Blaziken (for Mega Blaziken)" = 100), click "Run sweep",
scroll the "Ranked candidates" table horizontally end to end — columns are Species/Level/
Stardust/Candy/XL candy/Mean Δ team DPS/Best boss Δ/Significant bosses/Newly fielded, nothing
cost-normalized. Share URL for the settings half (roster isn't in the URL by design):
`http://localhost:5173/?pu=eyJtb2RlIjoibXVsdGktcmFpZCIsInNsb3RzIjpbeyJzcGVjaWVzSWQiOiJsYXRpb3MtbWVnYSIsImZhc3RNb3ZlSWQiOm51bGwsImNoYXJnZWRNb3ZlSWQiOm51bGwsImlzTWVnYSI6dHJ1ZSwiaXNTaGFkb3ciOmZhbHNlLCJpc1B1cmlmaWVkIjpmYWxzZSwiaXNMdWNreSI6ZmFsc2UsImxldmVsIjozNSwiaXZzIjp7ImF0dGFjayI6MTUsImRlZmVuc2UiOjE1LCJzdGFtaW5hIjoxNX0sImNhbmR5T25IYW5kIjoxMDAsInhsQ2FuZHlPbkhhbmQiOjB9LHsic3BlY2llc0lkIjoiZ2FyY2hvbXAiLCJmYXN0TW92ZUlkIjpudWxsLCJjaGFyZ2VkTW92ZUlkIjpudWxsLCJpc01lZ2EiOmZhbHNlLCJpc1NoYWRvdyI6ZmFsc2UsImlzUHVyaWZpZWQiOmZhbHNlLCJpc0x1Y2t5IjpmYWxzZSwibGV2ZWwiOjMwLCJpdnMiOnsiYXR0YWNrIjoxNSwiZGVmZW5zZSI6MTUsInN0YW1pbmEiOjE1fSwiY2FuZHlPbkhhbmQiOjEwMCwieGxDYW5keU9uSGFuZCI6MH0seyJzcGVjaWVzSWQiOiJkcmFnb25pdGUiLCJmYXN0TW92ZUlkIjpudWxsLCJjaGFyZ2VkTW92ZUlkIjpudWxsLCJpc01lZ2EiOmZhbHNlLCJpc1NoYWRvdyI6ZmFsc2UsImlzUHVyaWZpZWQiOmZhbHNlLCJpc0x1Y2t5IjpmYWxzZSwibGV2ZWwiOjQwLCJpdnMiOnsiYXR0YWNrIjoxNSwiZGVmZW5zZSI6MTUsInN0YW1pbmEiOjE1fSwiY2FuZHlPbkhhbmQiOjEwMCwieGxDYW5keU9uSGFuZCI6MH0seyJzcGVjaWVzSWQiOiJrYXJ0YW5hIiwiZmFzdE1vdmVJZCI6bnVsbCwiY2hhcmdlZE1vdmVJZCI6bnVsbCwiaXNNZWdhIjpmYWxzZSwiaXNTaGFkb3ciOmZhbHNlLCJpc1B1cmlmaWVkIjpmYWxzZSwiaXNMdWNreSI6ZmFsc2UsImxldmVsIjozOCwiaXZzIjp7ImF0dGFjayI6MTUsImRlZmVuc2UiOjE1LCJzdGFtaW5hIjoxNX0sImNhbmR5T25IYW5kIjoxMDAsInhsQ2FuZHlPbkhhbmQiOjB9LHsic3BlY2llc0lkIjoidHlyYW5pdGFyIiwiZmFzdE1vdmVJZCI6bnVsbCwiY2hhcmdlZE1vdmVJZCI6bnVsbCwiaXNNZWdhIjpmYWxzZSwiaXNTaGFkb3ciOmZhbHNlLCJpc1B1cmlmaWVkIjpmYWxzZSwiaXNMdWNreSI6ZmFsc2UsImxldmVsIjozMSwiaXZzIjp7ImF0dGFjayI6MTUsImRlZmVuc2UiOjE1LCJzdGFtaW5hIjoxNX0sImNhbmR5T25IYW5kIjoxMDAsInhsQ2FuZHlPbkhhbmQiOjB9LHsic3BlY2llc0lkIjoicmF5cXVhemEiLCJmYXN0TW92ZUlkIjpudWxsLCJjaGFyZ2VkTW92ZUlkIjpudWxsLCJpc01lZ2EiOmZhbHNlLCJpc1NoYWRvdyI6ZmFsc2UsImlzUHVyaWZpZWQiOmZhbHNlLCJpc0x1Y2t5IjpmYWxzZSwibGV2ZWwiOjI1LCJpdnMiOnsiYXR0YWNrIjoxNSwiZGVmZW5zZSI6MTUsInN0YW1pbmEiOjE1fSwiY2FuZHlPbkhhbmQiOjEwMCwieGxDYW5keU9uSGFuZCI6MH1dLCJzdGFyZHVzdE9uSGFuZCI6MjAwMDAwLCJyYXJlQ2FuZHlPbkhhbmQiOjIwLCJyYXJlQ2FuZHlYbE9uSGFuZCI6MTAsInRhcmdldCI6InR5cmFuaXRhci1tZWdhIiwiYm9zc0Zhc3RNb3ZlSWQiOm51bGwsImJvc3NDaGFyZ2VkTW92ZUlkIjpudWxsLCJkb2RnZU1vZGVsIjp7ImtpbmQiOiJwZXJmZWN0In0sImRvZGdlRmFzdEF0dGFja3MiOmZhbHNlLCJob2xkQ2hhcmdlZE1vdmVVbnRpbFNhZmUiOmZhbHNlLCJ3ZWF0aGVyIjoibm9uZSIsImJvc3NDaGFyZ2VkTW92ZUZyZXF1ZW5jeVNlY29uZHMiOjE1LCJib3NzQ2hhcmdlZE1vdmVDYWRlbmNlIjoiZml4ZWQtaW50ZXJ2YWwiLCJib3NzU3RhcnRzUHJpbWVkIjpmYWxzZSwiYm9zc1N0YXJ0aW5nRW5lcmd5RnJhY3Rpb24iOjAuNSwicmFpZFRpbWVyU2Vjb25kcyI6MzAwLCJzd2FwQ29zdFNlY29uZHMiOjAsInJldml2ZUNvc3RTZWNvbmRzIjoxNSwicmFua0J5Ijoic3RhcmR1c3QiLCJtdWx0aVJhaWRCb3NzSWRzIjpbInJlZ2lyb2NrIiwicmVnaWNlIiwicmVnaXN0ZWVsIiwiYmVlZHJpbGwtbWVnYSIsImd5YXJhZG9zLW1lZ2EiLCJzbG93cG9rZS1zaGFkb3ciLCJhaXBvbS1zaGFkb3ciLCJjcm9hZ3Vuay1zaGFkb3ciLCJncnViYmluLXNoYWRvdyIsInNub3JsYXgtc2hhZG93IiwiaGl0bW9udG9wLXNoYWRvdyIsImxhbXBlbnQtc2hhZG93IiwiZ2lyYXRpbmEtYWx0ZXJlZC1zaGFkb3ciXSwibXVsdGlSYWlkSW5jbHVkZVBhc3RSYWlkcyI6ZmFsc2UsIm11bHRpUmFpZEluY2x1ZGVkVGllcnMiOm51bGwsIm11bHRpUmFpZE1heEJvc3NDb3VudCI6MzAsImNhbmR5QnlGYW1pbHlJZCI6eyJGQU1JTFlfVE9SQ0hJQyI6eyJjYW5keSI6MTAwLCJ4bENhbmR5IjowfX19&view=power-up-optimizer`
Handed to web-developer (surface the existing engine fields in the multi-raid table + add a
rankBy-equivalent sort control) — this is a UI-layer gap, not an engine gap; the numbers already
exist.

## Confirmed bug: Species Report's past-raid count is mislabeled

The "Include past/inactive raids" dropdown's "Yes" option reads
`Yes — active + past raids ({pastRaidOptions.length} recorded)` but `pastRaidOptions` (built by
`registry.ts`'s `pastRaidBossOptions()`) deliberately EXCLUDES active-raid species (`!activeIds.has(...)`,
to avoid double-counting when unioned with the active list elsewhere) — so the number shown is
PAST-ONLY, not the "active + past" total the label promises. Observed: Species Report showed
"752 recorded" while separately reporting "13 raid bosses (currently active)" — the true combined
total is 765 (13+752), which is exactly what the Power-Up Optimizer's multi-raid `BossSetPanel.tsx`
shows for the identical underlying data (`bossCount.active + bossCount.past`, correctly summed).
Confirmed by reading both call sites, not just eyeballing — `SpeciesReportView.tsx:594` vs
`BossSetPanel.tsx:68`. Cosmetic only (the actual sweep, when "Yes" is selected, does correctly
include both active and past — verified this is a display-string bug, not a set-membership bug).
Repro: `http://localhost:5173/?view=species-report`, open the "Include past/inactive raids"
dropdown, read the "Yes" option text. Handed to web-developer.

## Suspicious, needs owner look: energy-gated-interval boss cadence produced byte-identical
## results to fixed-interval for one scenario — likely coincidental, not fully ruled out

On `?view=comparator` with Mega Blaziken vs Rayquaza vs Mega Latios (level 35, IV 15/15/15,
perfect dodge, party 4/4 matching, teammateDps 26.5, boss mean interval 15s), switching
`bossChargedMoveCadence` from `"fixed-interval"` to `"energy-gated-interval"` produced EXACTLY the
same 200-run distribution in every displayed stat (Mean survival 10.0s/7.5s, Mean charged damage
68/119, Mean fast-move damage 49/36, TDO 117/155, team contribution 318/435) — confirmed via the
decoded `s=` payload that the field really did change (`"bossChargedMoveCadence":"energy-gated-interval"`),
and confirmed a FRESH TAB loading that exact URL reproduces the identical numbers (so it's not a
stale-memoization artifact on one tab). Switching instead to `"energy-driven"` on the same
scenario produces dramatically different numbers (Mean survival 7.4s/5.6s, Mean charged damage
0/12) — proving the cadence selector genuinely re-threads into the simulation and isn't just
inert. My working theory (not fully verified): both candidates die from ONE decisive boss charged
move within this short (~10s) fight, and `fixed-interval`'s warmup formula
(`chargedMoveWarmupSeconds ?? bossChargedMoveReadySeconds(...)`) and `energy-gated-interval`'s
energy-threshold-crossing time land on the identical tick for this boss/moveset, after which both
call the SAME `jitteredInterval(mean, rng)` at the same point in the same seeded RNG stream —
producing an identical single fire time and thus identical outcomes purely by construction, not by
a bug. Tried (and failed) to fully confirm this within budget: switching the raid target to
Magikarp (0-energy-cost Struggle charged move) extends the fight past 180s but ALSO makes both
cadence models trivially convergent (energy threshold is met at t=0 either way, since cost is 0),
so that test doesn't discriminate either. Recommend: engine-developer/engine-verifier re-run this
comparison on a LONGER fight against a boss with a real non-zero-cost charged move (so multiple
charged-move cycles occur) to confirm `energy-gated-interval` and `fixed-interval` genuinely
diverge over time and not just coincide once. Share URLs for the two cadence values (everything
else identical) — swap `"bossChargedMoveCadence":"fixed-interval"` for `"energy-gated-interval"` in:
`http://localhost:5173/?s=eyJjYW5kaWRhdGVzIjpbImJsYXppa2VuLW1lZ2EiLCJyYXlxdWF6YSJdLCJjYW5kaWRhdGVGYXN0TW92ZUlkcyI6W251bGwsbnVsbF0sImNhbmRpZGF0ZUNoYXJnZWRNb3ZlSWRzIjpbbnVsbCxudWxsXSwidGFyZ2V0IjoibGF0aW9zLW1lZ2EiLCJib3NzRmFzdE1vdmVJZCI6bnVsbCwiYm9zc0NoYXJnZWRNb3ZlSWQiOm51bGwsImNhbmRpZGF0ZU1lZ2FCb29zdERpc2FibGVkIjpbZmFsc2UsZmFsc2VdLCJjYW5kaWRhdGVTaGFkb3ciOltmYWxzZSxmYWxzZV0sImxldmVsIjozNSwiaXZzIjp7ImF0dGFjayI6MTUsImRlZmVuc2UiOjE1LCJzdGFtaW5hIjoxNX0sImRvZGdlTW9kZWwiOnsia2luZCI6InBlcmZlY3QifSwiZG9kZ2VGYXN0QXR0YWNrcyI6ZmFsc2UsImNhbmRpZGF0ZURvZGdlIjpbbnVsbCxudWxsXSwiY2FuZGlkYXRlRG9kZ2VGYXN0QXR0YWNrcyI6W251bGwsbnVsbF0sImhvbGRDaGFyZ2VkTW92ZVVudGlsU2FmZSI6ZmFsc2UsIm1pbkZpZ2h0TGVuZ3RoU2Vjb25kcyI6MCwicGFydHlTaXplIjo0LCJ0ZWFtbWF0ZURwcyI6MjYuNSwibWF0Y2hpbmdUZWFtbWF0ZUNvdW50Ijo0LCJib3NzQ2hhcmdlZE1vdmVGcmVxdWVuY3lTZWNvbmRzIjoxNSwiYm9zc0NoYXJnZWRNb3ZlQ2FkZW5jZSI6ImVuZXJneS1nYXRlZC1pbnRlcnZhbCIsImJvc3NTdGFydHNQcmltZWQiOmZhbHNlLCJib3NzU3RhcnRpbmdFbmVyZ3lGcmFjdGlvbiI6MC41LCJ3ZWF0aGVyIjoibm9uZSJ9&view=comparator`
(change `energy-gated-interval` to `fixed-interval` for the comparison partner).

## Checked out fine this pass (actively tried to break, couldn't)

- **Mega/primal 1.3 boost, hand-verified via arithmetic, not just eyeballed.** Mega Blaziken vs
  Rayquaza vs Mega Latios, 4 other trainers all matching type at 26.5 DPS each, Mega Blaziken
  survives 10.0s mean: `4 teammates x 26.5 DPS x (1.3-1) x 10.0s = 318`, matching the displayed
  "Other trainers' damage from this candidate's boost: 318" exactly. Confirms the boost is really
  1.3, not 1.1 or 1.0.
- **Collapsible sections (d1b6bff) — state persistence, share-link independence, and rendering
  while collapsed all checked out clean.** Collapsing "Assumptions" on the Comparator persisted
  across a plain reload (localStorage, confirmed via `document.querySelectorAll('details')`
  `.open`); a share link's numbers/species/cadence all restored correctly in a FRESH TAB even
  though that fresh tab inherited the SAME collapsed-by-default state from shared localStorage
  (expected — fold state is per-browser, not per-tab, and deliberately not part of `Scenario`);
  expanding a collapsed section after load rendered every field correctly populated, nothing
  stale or blank. Tested on Comparator; same underlying `CollapsibleSection.tsx` component is used
  identically by all six tabs per `collapsibleState.ts`'s own doc comment.
- **Power-Up Optimizer multi-raid candy-family pooling.** Imported `pokeGenieSample.csv` (23/23
  rows matched, 0 unmatched, 0 skipped) — the candy-on-hand table listed "Houndour" ONCE covering
  both CP374 and CP419 Houndour entries (not per-individual), "Raticate (Alola)" ONCE covering
  both Alola Raticate entries, and correctly labeled mega draws as "Blaziken (for Mega Blaziken)"/
  "Delphox (for Mega Delphox)" — exactly the CLAUDE.md example. Mega Blaziken is NOT excluded as
  "unevolved": it appeared in the Fixed-budget plan's own recommendations ("Next real gain: Mega
  Blaziken Lv34 -> Lv49.5, +1.64 mean team DPS...").
- **Power-Up Optimizer multi-raid roster-not-in-URL / explicit empty state.** Before importing
  anything, both the candy-family panel and the results section showed explicit "No roster
  imported yet"/"No roster imported in this browser yet" text, not a blank or crashed UI. The
  "Share this scenario" panel's own copy states plainly: "This link carries every SETTING above...
  but NOT your imported roster — the roster lives only in THIS browser's local storage (a
  deliberate exception, see PLAN_multi_raid_roster_optimizer.md §3.2)." Decoded the actual `pu=`
  payload — confirmed no roster/entry data present, only settings + `candyByFamilyId`.
- **Old single-raid share link with no `mode` field.** Not separately re-tested this pass (time
  budget), but `PowerUpOptimizerView.tsx`'s own decode fallback (`s.mode ?? "single-raid"`,
  matching the pattern already verified for other optional fields across this project) makes this
  low-risk; flag for next pass if not covered by then.
- **IV Breakpoints `rows`/`rowsForTable` memo split (uncommitted local change).** Dependency chain
  is correct (`runResult` keyed on `[assumptions]` -> `rows` keyed on `[runResult.data]` ->
  `rowsForTable`/`divergingCounts` keyed on `[rows]`) — no staleness. Hand-verified the rendered
  "3 of 31 show a charged-move damage difference" headline against the actual per-level table
  (Delphox vs Mega Steelix defaults): divergences at levels 37.5, 44, and 49.5 exactly, matching
  the count and the "first becomes different at level 37.5" claim (lowest level where a gap first
  opens, reading low-to-high as you power up).
- **Team Raid Simulator boss cadence + share round-trip.** Boss HP for Mega Tyranitar target
  showed 9000 (matches `RAID_TIER_TABLE["Mega Raids"]` exactly). Cadence switched to
  `energy-driven`, built a link, opened in a fresh tab — combobox restored to "Energy-driven
  (experimental)" correctly, no console errors.
- **Mobile-width pass, all six tabs.** `document.documentElement.scrollWidth ===
  document.documentElement.clientWidth` (375/375) on comparator, team-raid, species-report,
  iv-breakpoints, attack-defense-breakpoints, and power-up-optimizer. The mobile-nav bug from the
  2026-09-07 pass stays fixed.
- **Badging.** `grep '"isHypothetical": true' data/normalized/species.json` — zero matches (no
  synced species carries the flag), and `SpeciesBadges.tsx` only renders the "hypothetical" badge
  when the prop is truthy, so the badge is structurally unreachable from live data today.
- **Console errors** — none (`onlyErrors`) on any of the six tabs across every scenario driven
  this pass.

## Tooling note (not an app bug)

The Browser pane's `screenshot` action intermittently returns a fully black/blank frame or times
out on a background/just-navigated tab (same family as 09-07b's "pane stops compositing" hazard).
Workaround that worked reliably: open a brand-new tab via `tabs_create`, `navigate` it directly to
the target URL (don't reuse an old tab that had this happen), and retry the screenshot once — it
recovered every time this pass. `get_page_text`/`find`/`read_page` kept working normally even
while `screenshot` was blank, so prefer those for anything that doesn't need pixels.

## Useful regression URLs / recipe for next pass

- Multi-raid cost-efficiency check: re-run the multi-raid repro above after web-developer adds the
  columns/sort — confirm `deltaPer1000Stardust`/`deltaPerCandy` actually render and that the
  DEFAULT sort isn't silently still `meanDeltaTeamDps`.
- Species Report past-count label check: reload `?view=species-report`, open the "Include
  past/inactive raids" dropdown, confirm the "Yes" option's number equals active+past summed, not
  past-only.
- Energy-gated-interval divergence check: use a raid target with a nonzero-energy-cost charged
  move and a long enough fight (tanky candidates or a weak boss) that at least 2-3 charged-move
  cycles occur, then diff `fixed-interval` vs `energy-gated-interval` — they should diverge once
  more than one cycle happens. If they're STILL byte-identical over a multi-cycle fight, that's a
  real bug, not the coincidence documented above.

## Overseer follow-up (2026-09-09, same day): the cadence item is RESOLVED — not a bug

The `energy-gated-interval` == `fixed-interval` byte-identical result was the short-fight
coincidence, confirmed via `npm run run-scenario` (same run functions as the UI):

- On the original Mega Blaziken / Rayquaza vs Mega Latios link both candidates die by ~10s and
  the earliest fixed-interval charged hit cannot land before ~12s (0.6 x 15s jitter floor plus
  Psychic's cast time), so NO charged move lands under either model — identical by construction.
- On a long fight (Metagross + Tyranitar L40 vs Mega Latios with SOLAR_BEAM (100 energy),
  partySize 1, teammateDps 0, dodge none) the two models diverge: Metagross 20.2s/204 dmg
  (gated) vs 20.5s/205 (fixed), window 22.2s vs 22.6s, and the nearest-flip sensitivity knob
  differs ("Boss charged-move cadence" vs "Other trainers"). Full `--json` outputs differ.
- Starting-energy note: `bossStartingEnergyFraction` only applies when `bossStartsPrimed` is
  true (`run/runComparator.ts` line ~87 multiplies fraction x cost only under primed) — so an
  unprimed 0 vs 0.5 comparison is identical BY DESIGN, not inert wiring. Primed 0.5 under gated
  moves Metagross to 19.1s/192, proving the setting reaches the sim.

Regression recipe for next pass: use a long fight with a 100-energy boss move and no teammates
before judging cadence models; do not expect divergence on a sub-12s fight.
