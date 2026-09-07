---
name: pass_2026-09-07_five_tabs
description: Second full skeptic pass, first covering all 5 tabs (adds IV Breakpoints + Attack/Defense Breakpoints) — general health check, no recent product-code change to target
metadata:
  type: project
---

## Confirmed bug: mobile whole-page horizontal scroll from the shared tab-switcher nav

At the mobile preset (375x812), `document.documentElement.scrollWidth` exceeds `clientWidth` on
EVERY tab (comparator 480px, attack-defense-breakpoints 481px, team-raid 639px — all vs 375px
viewport), and it's a genuine whole-page scroll (confirmed by scrolling right and watching the
entire assumptions card shift, not just a table). Root cause (read in `packages/web/src/styles.css`
lines 42-47): `.tab-switcher` is `display: flex` with no `flex-wrap` and no `overflow-x`, and the
five tab buttons' text ("Attack/Defense Breakpoints", "Team Raid Simulator", etc.) don't fit 375px,
so the row overflows its container and that overflow isn't contained anywhere up the tree, bleeding
into `document.documentElement`. This is DIFFERENT from and IN ADDITION TO the Attack/Defense
Breakpoints table's own scroll: that table's `.breakpoint-table` wrapper div correctly has
`overflow-x: auto` and does NOT leak (confirmed: wrapper clientWidth 320, table scrollWidth 1681,
contained). The nav bug is shared across all 5 tabs since `App.tsx` renders one nav for every view.
Handed to web-developer 2026-09-07. Regression check: resize to mobile preset, load any `?view=`,
run `document.documentElement.scrollWidth > document.documentElement.clientWidth` in
`javascript_tool` — should be false once fixed.

## Confirmed bug: Species Report's mega-raid rotation is stale by one event cycle

Species Report's "13 currently-active raid bosses" list shows Mega Mewtwo Y, Mega Glalie, Mega
Steelix, Mega Aggron, Mega Skarmory for the mega slots. A live LeekDuck fetch (2026-09-07) shows
today's actual mega raid rotation is Mega Mewtwo Y, Mega Raichu Y, Mega Sableye, Mega Mawile, Mega
Audino (Prism Promenade habitat, part of GO Fest 2026: Mega Finale which is still running) — so
Glalie/Steelix/Aggron/Skarmory are the STALE previous rotation (Aug 31-Sep 6 "Mega Ascension"/Iron
Frostworks set that already ended), and Raichu Y/Sableye/Mawile/Audino are missing. Mewtwo Y is the
only mega boss that's actually still live and present in both lists. Critically, the SHADOW half of
the same list (Shadow Croagunk/Slowpoke/Grubbin/Aipom/Snorlax/Lampent/Giratina/Hitmontop) matches
LeekDuck's live shadow-raid list exactly, byte-for-byte — so this isolates the staleness to
specifically the mega-raid portion of data-sync's active-raid feed, not the whole feed. Same root
cause my 2026-09-06 pass flagged as "suspicious, not confirmed" (mega rotation didn't match a
same-day snapshot) — one day later with the rotation having visibly moved on and the app not
following, this graduates to a confirmed staleness finding. Handed to data-sync 2026-09-07.
Note: this is a live-content freshness issue, not a wrong-data issue — Mega Steelix's own base
stats (Atk 212/Def 327/Sta 181) are correct against community sources, it's just not currently a
raid boss anymore.

## Resolved since the 2026-09-06 pass — don't re-flag

- The "died mid own-animation: 100%" + nonzero "mean charged damage" apparent contradiction on the
  Comparator (default load, Rayquaza vs Mega Latios) is now fully explained by an expanded KNOWN
  CAVEATS paragraph, and the numbers are internally consistent: mean charged damage 119 + mean
  fast-move damage 36 = 155 = own total, matching the seed-1 representative run's own-damage
  trajectory exactly (jumps 27->155 at the 6-7s mark, i.e. one successful charged cast landed
  before a second, fatal one was interrupted mid-animation). Treat this as resolved, not a bug.
- Species Report's sort-mode ("sustained mean damage" vs "type-matchup percentile") now DOES
  round-trip through the `sr=` Scenario — the payload includes `"sortMode":"typeMatchup"` and a
  fresh tab correctly restores both the active sort button and the resulting row order (Shadow
  Slowpoke on top). This was a confirmed bug in the 2026-09-06 pass; it's fixed now.

## Checked out fine this pass (actively tried to break, couldn't)

- Attack/Defense Breakpoints damage-grid math verified by hand against the real PoGo formula
  (Delphox vs Mega Steelix, both Attack and Defense modes) — matched exactly ONLY once accounting
  for `REAL_RAID_BOSS_IV = 15` (in `packages/engine/src/raidBoss.ts` and used by
  `bossEffectiveStats` in `comparison.ts`) for a real synced boss species — NOT the `RAID_BOSS_IVS
  = 0` pass-through, which is only for `statsArePrecomputed` test fixtures. Worth remembering for
  future hand-calc checks on this tab: boss IV is 15, not 0, unless the target is a pinned fixture.
- Attack/Defense Breakpoints: mode switch (Attack/Defense), Shadow toggle, boss charged move, and
  weather all round-trip through `adb=` correctly, including which mode-tab renders as `active` on
  a fresh load (verified via `className` on the mode button, not just visually).
- Round-trip tested and solid on all 5 tabs this pass (Comparator `s=`, Team Raid `ts=`, Species
  Report `sr=`, IV Breakpoints `ivc=`, Attack/Defense `adb=`), each with 4-5 simultaneous
  non-default fields including the general Shadow toggle: build link in one tab, decode+diff
  `document.querySelectorAll('select'/'input[type=checkbox]'/'input[type=number]')` state in a
  fresh tab loading that exact URL. Byte-identical every time.
- Shadow/mega-primal mutual exclusivity holds: Team Raid Simulator slot 1 (Mega Latios, already
  boosted) has its Shadow checkbox `disabled=true`; a species with no boost mechanic at all
  (Garchomp, Dragonite in the default roster) has its Mega/Primal radio `disabled=true`. No double
  application found anywhere checked.
- Shadow toggle actually changes displayed output when triggered by a REAL click (Kartana solo:
  132 -> 160 own total damage, `SHADOW` badge appears on the result card and chart heading) — see
  tooling note below, this required working around a real testing-tool limitation.
- RAID_TIER_TABLE's 7 entries read directly: Legendary Mega Raids and Primal Raids do legitimately
  share 22500 HP / 0.79 multiplier, exactly as documented — not a bug, don't re-flag.
- Mega Steelix base stats (Atk 212 / Def 327 / Sta 181) match `data/normalized/species.json`
  exactly AND match community sources (Dittobase, PokemonGoHub, community-tier, 2026-09-07 search).
- No console errors (React or otherwise) on any of the 5 tabs across every scenario driven this
  pass, including the 51-column Attack/Defense grid.

## Tooling gotcha for future skeptic passes (not an app bug)

`mcp__Claude_Browser__form_input` on a `<input type=checkbox>` sets the DOM `.checked` property
without firing React's synthetic change event — the checkbox visually/DOM-wise shows checked=true
but the app's React state (and therefore all derived output) never updates. This looks EXACTLY
like a "Shadow toggle doesn't affect damage" bug if you only check `.checked` afterward. Always
verify a checkbox toggle with a real `computer` `left_click` on the checkbox or its `<label>`, then
re-verify with `document.querySelector(...).checked` — form_input worked fine for `<select>` and
text `<input>` elements throughout this pass, the issue is checkbox-specific.

Also: `computer` `left_click`/`scroll_to` by `ref` frequently failed with "(0,0) could not be
attributed to a frame" or wildly negative off-viewport coordinates on these long pages, especially
right after a `find` call or on a background (non-fronted) tab. Workarounds that worked: (1)
front the tab first via `tabs_select`; (2) re-run `find` immediately before the click (a stale ref
from even one action ago can fail); (3) as a last resort, read `getBoundingClientRect()` via
`javascript_tool` (read-only) and manually scale to the `computer` screenshot's own reported pixel
dimensions (NOT `window.innerWidth`/`innerHeight` — the screenshot pane can be scaled down, e.g.
1280x720 real viewport rendered as an 800x446 screenshot) before clicking by coordinate.

## Useful regression URLs / recipe for next pass

- Mobile overflow check: `resize_window` mobile preset, load `?view=<any>`, run
  `document.documentElement.scrollWidth > document.documentElement.clientWidth` via
  `javascript_tool` — cheap, fast, catches the nav bug without any screenshots.
- Mega-raid freshness check: Species Report's mega rows vs a live LeekDuck `/raid-bosses/` fetch —
  cross-check the mega subset only (shadow subset has been accurate 2 passes running).
