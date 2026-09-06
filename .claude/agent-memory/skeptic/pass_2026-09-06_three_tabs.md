---
name: pass_2026-09-06_three_tabs
description: First full skeptic pass across Comparator/Team-Raid/Species-Report after commit 51db7e1 (hypothetical fixtures deleted, new tabs added) — regression checks worth repeating
metadata:
  type: project
---

## Confirmed bug worth repeating as a regression check

**"Died mid own-animation" contradicts nonzero "Mean charged damage" for the same candidate.**
Reproduce: fresh load of `http://localhost:5173/?view=comparator` (all defaults, Kartana vs
Rayquaza vs Mega Latios, level 35, no dodge). Rayquaza's result card shows "Died mid
own-animation: 100%" AND "Mean charged damage: 119" simultaneously, with p10/median/p90 all
exactly 155 (zero variance across the 200-run distribution). The app's own caveat text states "a
candidate that dies mid-animation on its own charged move ... lands 0 charged damage that run" —
so a 100% mid-animation death rate should force mean charged damage to 0, not 119. The
representative seed-1 run's table confirms it: Rayquaza's own-damage column jumps from 27 to 155
between the 6s and 7s rows (a full charged-move hit), not a fast-move-only trickle. Either the
"died mid own-animation" classification is wrong, or charged damage is being credited when the
caveat text says it shouldn't be, or the caveat text itself misdescribes actual intended behavior.
Handed to engine-developer 2026-09-06 — check next pass whether the numbers or the caveat text
changed.

## Confirmed bug: Species Report sort-mode doesn't round-trip

The "Sort: type-matchup percentile" / "Sort: sustained mean damage" toggle on the Species Report
tab is pure component state, not part of the serialized `sr=` Scenario payload. Build a link while
"type-matchup percentile" is selected (table topped by e.g. Mega Beedrill) and the fresh tab
reverts silently to "sustained mean damage" sort (table topped by e.g. Shadow Slowpoke) even
though every other field (species, moves, level, IVs, dodge, weather) round-trips exactly. This is
the same named bug class as the standing-decision note about settings reverting to default on a
share link, just applied to a display/sort preference rather than a fight input — worth deciding
explicitly whether sort mode should be in-scope for `Scenario` or is intentionally view-only.
Handed to web-developer 2026-09-06.

## Checked out fine — don't need to re-litigate unless something changes nearby

- Hypothetical fixtures (Mega Raichu X/Y, Mega Skarmory, the old fixture-only Primal Kyogre) are
  NOT reachable in any of the 7 species-search comboboxes across all 3 tabs (2 comparator
  candidates + raid target on Comparator; 6 roster slots on Team Raid Simulator; 1 picker on
  Species Report) as of 51db7e1. Searching "Raichu"/"Skarmory"/"Kyogre" everywhere returns only
  the real species.
- "Primal Kyogre" IS selectable and IS real product data (`data/normalized/species.json` id
  `kyogre-primal-attacker`, base 353/268/218, boost 1.3x water) — confirmed against a live web
  search (GamePress/PokemonGoHub-tier sources, 2026-09-06) matching those exact numbers. This is
  legitimate real-game content, not the deleted hand-authored hypothetical fixture — don't confuse
  the two if the name comes up again.
- Team Raid Simulator has zero cross-slot team-boost math, confirmed both from the rendered output
  (per-slot "Own damage" figures with a mega active in slot 1 don't inflate other slots) and from
  reading `packages/engine/src/teamRaid.ts` directly — `ownBoostMultiplier(species.boost, ...)` is
  computed per-slot from that slot's own species only, no aggregate/team boost function exists in
  that file at all.
- Scenario round-tripping is solid on all three query params (`s=`, `ts=`, `sr=`) for every actual
  *fight input* field, including newer/easy-to-miss ones: `bossStartingEnergyFraction`,
  `matchingTeammateCount`, per-slot `isMega`, `swapCostSeconds`/`reviveCostSeconds`,
  `dodgeModel.missedFraction` (percentage-missed variant). Tested by setting ~10 non-default values
  at once per tab, decoding the base64 payload, and diffing full rendered output text between the
  tab that built the link and a completely fresh tab loading the same URL — byte-identical in both
  the Comparator and Team Raid cases.
- Mega Latios base stats (335/241/190) and moveset match real GO data (web search, GamePress-tier,
  2026-09-06).
- Shadow raid roster shown in Species Report (Slowpoke/Aipom/Croagunk/Grubbin 1★; Snorlax/
  Hitmontop/Lampent 3★; Giratina-Altered 5★) matches LeekDuck's live current-raid-bosses page
  exactly as of 2026-09-06 — strong signal data-sync's raid feed is fresh and correctly tiered.
- "Mega/Primal for this raid" is modeled as a radio (only one slot at a time) on the Team Raid
  Simulator, with a tooltip citing the real account-wide one-mega-at-a-time restriction — a nice
  fidelity detail, not just a UI convenience.
- `isApproximate` badging is data-driven and correct: `data/normalized/activeRaids.json` has
  `"speciesId": "victreebel"` (non-mega stand-in) with `isApproximate: true` for the "Mega
  Victreebel" raid entry, and the UI renders the APPROXIMATE badge only on that row, not on
  Beedrill/Abomasnow/Pinsir rows which have `isApproximate: false`.
- Mega boost multiplier is 1.3x (not silently 1.1 or 1.0) wherever checked — sensitivity panel
  explicitly labels it "Mega boost multiplier (currently 1.3x)".

## Suspicious — flagged but not fully confirmed, worth a second look

- Setting "Also dodge boss's fast attacks: Yes" against a boss with a very fast (0.5s) fast move
  (e.g. Bite, Dragon Breath) drives a candidate's own damage to *exactly* 0 across 100% of the
  200-run distribution, on both the Comparator and Team Raid Simulator tabs. The caveat text does
  warn "dodging everything is not free DPS-wise" so a large DPS hit is expected, but literally zero
  output every single run (not just reduced) is an extreme edge case worth an engine-developer gut
  check on the dodge-timing math when the boss's fast-move cadence is very short. Not confirmed as
  wrong — plausible if the boss can spam a 0.5s fast move with no gap and every single cast is
  dodged at 0.5s cost each, but extreme enough to double check.
- Mega raid rotation shown in Species Report (Victreebel/Abomasnow/Beedrill/Pinsir) didn't exactly
  match either of two external snapshots pulled the same day (one WebSearch said September
  rotation includes Beedrill/Houndoom/Malamar/Victreebel; a direct LeekDuck fetch showed an
  entirely different Iron-Frostworks-event set of Steelix/Skarmory/Aggron/Glalie). Mega raid
  rotation appears to change very frequently (hourly during events per GO Fest coverage), so this
  is most likely just data-sync timing/staleness rather than a bug — flagged to data-sync as a
  "check freshness of the mega-raid feed" note, not a confirmed defect.

## Useful regression URLs / recipe for next pass

- Default comparator load (no query params) is the fastest way to reproduce the died-mid-animation
  contradiction — no setup needed, just load `?view=comparator` fresh and read Rayquaza's card.
- For round-trip testing, change ~8-10 fields at once (including at least one field added in the
  most recent commit) before hitting "Build link", decode the base64 payload via
  `JSON.parse(atob(new URLSearchParams(location.search).get('s'|'ts'|'sr')))` in
  `javascript_tool`, then open the exact URL in a fresh `tabs_create` tab and diff
  `document.body.innerText` — much faster than manually re-checking every field visually.
