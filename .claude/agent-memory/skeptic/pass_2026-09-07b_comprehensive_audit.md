---
name: pass_2026-09-07b_comprehensive_audit
description: Second 2026-09-07 pass, requested as a comprehensive "find lingering data/calc issues" audit after Species Report's raid-history/tier-filter feature landed — finds the crossover-chart double-crossing bug, confirms two prior findings fixed
metadata:
  type: project
---

## Confirmed bug: DamageOverTimeChart marks the wrong crossing when the lead flips twice

`packages/web/src/DamageOverTimeChart.tsx`'s crossing-detection loop `break`s on the FIRST sign
change of `(x.own - y.own)` it finds while walking forward in time. When the two candidates' own-
damage lead flips more than once (candidate A briefly overtakes, then candidate B retakes the lead
for good), the marked green dot and the caveat sentence "Ranking flips at ~Xs into the fight; Y
leads by the end of this window" both describe the FIRST, non-decisive flip — not the second one
that actually produces the final leader. Reproduce on the app's own zero-query-param default
Comparator load (`?view=comparator`, Kartana vs Rayquaza vs Mega Latios): the own-damage table
shows Kartana(own)/Rayquaza(own) at 5s=24/27, 6s=66/27, 7s=74/155 — delta flips from -3 to +39
between 5s-6s (Kartana takes the lead: this is the marked "crossover: ~5.4s") and then flips AGAIN
from +39 to -81 between 6s-7s (Rayquaza retakes it for good, unmarked). The chart visual confirms
this exactly: the green dot sits where the blue (Kartana) line is about to rise above the flat
orange (Rayquaza) line, then orange jumps far above blue one second later — the opposite of what
"Rayquaza leads by the end of this window" implies is happening at that dot. `finalLeader` itself
(computed independently by comparing final totals) is correct; only the marked crossing point and
its accompanying sentence are misleading when a double-crossing occurs. Scope: isolated to
`DamageOverTimeChart.tsx`, used only by the Comparator tab — `TeamDamageChart.tsx` (party-size
sensitivity chart) has no similar crossing-detection code, so this doesn't appear to affect other
tabs. Handed to web-developer 2026-09-07. Regression check: fresh load of `?view=comparator` with
zero query params, read the "Time" table's own-damage columns for both candidates and check
whether the delta's sign flips more than once across the visible window — if so, verify the
crossing note's `t` matches the LAST flip (the one whose sign persists at the final row), not the
first.

## Confirmed fixed since 2026-09-07's first pass — don't re-flag

- **Mobile whole-page horizontal scroll** (tab-switcher nav overflow): re-tested all 5 tabs at the
  375x812 mobile preset via `document.documentElement.scrollWidth vs clientWidth` — equal (375/375)
  on every tab now. Commit `0b03ba0` fixed this.
- **Species Report mega-raid rotation staleness**: `data/normalized/activeRaids.json` now lists
  exactly ONE mega raid (Mega Gyarados) plus the same 10 non-mega + 8 shadow entries as before.
  Cross-checked against a live LeekDuck search (2026-09-07, community-tier): "Mega Gyarados will be
  in Mega Raids from August 26, 2026 ... to September 8, 2026," Regirock/Regice/Registeel 5-star,
  Hisuian Sneasel/Hisuian Lilligant/Passimian 3-star, Amaura/Tyrunt/Dratini/Honedge 1-star — matches
  exactly, byte for byte. The staleness flagged in the previous 2026-09-07 pass (Mewtwo
  Y/Glalie/Steelix/Aggron/Skarmory) is gone; data-sync re-ran the feed since then.

## Species Report raid-history/tier-filter feature (2026-09-07 session's main addition) — extensively checked, no defects found

- Badge distribution matches `data/normalized/raidHistory.json`'s own `source` field exactly: with
  "include past raids" on and all 6 tiers checked, the table showed 533 "past (archive)" rows (458
  `pogoapi-previous` + 75 `bulbapedia-archive`, summed) + 16 "past (researched)" rows (all 16
  `researched-tier` entries) + 19 rows with NO past-badge (exactly the 19 `live-feed`/currently-
  active entries) = 568 total. Confirmed via `javascript_tool` DOM scan, not eyeballing.
- Boss HP "(sourced)" values match `raidHistory.json`'s `eraHp` field exactly on every spot check:
  Magikarp 600, Wailmer 3,600, Unown (A) 1,800. "(tier default)" is shown correctly for every
  `live-feed`/`researched-tier` entry (neither of those two sources carries an `eraHp` in the data
  file, and the UI never fabricates one for them).
- Raid tier checkboxes actually filter the swept set, not just hide rows: unchecking "1-Star Raids"
  dropped the total from 568 to 337 with zero leftover "1-Star Raids" rows in the DOM (verified by
  scanning `table tr` text, not just the header count). Unchecking "Mega Raids" correctly dropped
  BOTH the active count (19->18, since Mega Gyarados is tier "Mega Raids") and the past count
  (549->514) together — the two counts move in lockstep with the filter as they should.
  `isApproximate` badges (Hisuian Lilligant, Hisuian Sneasel) matched `activeRaids.json`'s
  `isApproximate: true` exactly.
- Full round-trip of the NEW fields specifically: built a link with level 42, IV 7/15/15, dodge
  "perfect", weather "rainy", sortMode "typeMatchup", Mega Raids tier unchecked, includePastRaids
  "yes" — a fresh tab loading that `sr=` URL restored every one of those fields exactly (including
  which 5 of 6 tier checkboxes were checked) and produced a byte-identical 532-boss/18-active/514-
  past ranked table with Hisuian Lilligant on top in the same tie-broken order. No revert-to-default
  bug anywhere in this new surface.
- No "fallback" tier-label rows exist in the current 568-entry dataset (that code path is real but
  unexercised by today's data — not a bug, just untested by the current snapshot).
- No plain "past" badge (as opposed to "past (archive)"/"past (researched)") exists in the current
  data either, because the 19 `live-feed`-sourced entries are exactly the 19 currently-active raids
  (0 stale live-feed sightings right now) — also an unexercised-but-real code path, not a bug.

## Also re-verified this pass (no defects)

- Team Raid Simulator round-trip: built a link with dodge=perfect, weather=windy,
  holdChargedMoveUntilSafe=true, bossStartsPrimed=true, swapCostSeconds=3, reviveCostSeconds=13,
  level=35 — fresh tab restored every select/number field AND the slot-1 `isMega` radio exactly.
- IV Breakpoints round-trip: ivA.attack=2, ivB.defense=3, weather=fog, dodge=perfect, isShadow=true
  (toggled via a real click, verified `.checked` afterward) — fresh tab restored everything exactly.
- Species Report "Compare vs. another attacker" handoff works exactly as documented in
  `packages/web/src/comparatorPrefill.ts`'s own comment: carries ONLY candidate-A species/moveset +
  raid target across to the Comparator tab, deliberately leaving level/IVs/dodge/weather/candidate-B
  at the Comparator's own defaults for the user to adjust. The resulting TDO numbers legitimately
  differ from the Species Report row's own numbers (level 35 comparator defaults vs. whatever level
  Species Report was set to) — this is NOT the share-link revert-to-default bug class, it's a
  narrow, intentional prefill contract. Don't re-flag this mismatch as a bug.
- Delphox-vs-Mega-Steelix IV Breakpoints per-level effective stats hand-verified against the CPM
  formula: level 40, Spread A (14/15/15) -> Atk floor((230+14)*0.7903)=192, Def
  floor((189+15)*0.7903)=161, HP floor((181+15)*0.7903)=154 — all three match the displayed row
  exactly. Delphox base stats (230/189/181) match `data/normalized/species.json`.
- No console errors (onlyErrors) on any of seed/tab-1/tab-2/tab-3 across every scenario driven this
  pass.

## Tooling hazard this pass (not an app bug, but cost real time — read before next pass)

The Browser pane can silently stop compositing frames mid-session ("Browser pane is not displayed"
on `screenshot`, `window.innerWidth`/`innerHeight` reading 0, `left_click` by ref resolving to
wildly wrong or stuck-repeating coordinates like `(0,0)` or the same `(x,360)` regardless of which
element/page). This is NOT the same as the already-known "stale ref" gotcha from the 2026-09-07
first pass — it happened even with fresh `find` calls immediately before the click, and even
`resize_window` desktop (which fixed it once) didn't reliably fix it a second time. What DID work:
opening a brand-new tab via `tabs_create` and giving it a couple seconds (`computer wait`) before
the first `screenshot`. Symptom to watch for: a click silently does nothing (URL/DOM state
unchanged) while `find`/`read_page` keep returning normal-looking refs — always confirm a
suspicious "the button didn't do anything" result by checking `[role=tab] aria-selected` or
similar committed state, and if it didn't change, suspect the pane before suspecting the app. This
cost significant time chasing a false "Compare vs. another attacker does nothing" lead this pass
before a fresh tab proved the feature works fine.

## Useful regression URLs / recipe for next pass

- Crossover double-flip check: `?view=comparator` with zero query params (the app's own default,
  Kartana/Rayquaza/Mega Latios) reproduces the double-crossing bug with no setup at all — cheapest
  possible regression check once web-developer fixes the crossing-detection logic.
- Species Report badge/HP audit recipe: set `species-report-includePast` select to "yes", then in
  `javascript_tool` scan `document.querySelectorAll('table tr')` for badge text substrings
  (`past (archive)`, `past (researched)`, else-no-badge) and diff the counts against
  `data/normalized/raidHistory.json`'s own `source` field tally — much faster than eyeballing 568
  rows, and catches a badge/source mismatch immediately.
