---
name: pass_2026-09-10_live_deployed_audit
description: First pass against the LIVE deployed GitHub Pages site (not local dev) after Shadow enrage, Super Max gating, per-slot Team Raid levels, party-size sensitivity, and lineup builder shipped same-day; confirms 09-09's two findings fixed, finds the reverse Power-Up->Team-Raid export never got the per-slot-level fix its sibling direction got
metadata:
  type: project
---

## Confirmed fixed since 2026-09-09 — don't re-flag

- **Power-Up Optimizer multi-raid "Include past/inactive raids" Yes-option count is now correct.**
  Commit `55ba096` ("Species Report counts active + past") fixed this project-wide. Live-verified on
  BOTH Species Report (`?view=species-report`, dropdown reads "Yes — active + past raids (771
  recorded)") and Power-Up Optimizer multi-raid mode (same "771 recorded" string). Cross-checked:
  `grep -c '"speciesId"' data/normalized/raidHistory.json` = 771 (raidHistory accumulates ALL
  species ever seen, active included), `data/normalized/activeRaids.json` = 17 active raids today.
  754 (past-only, excluding active) + 17 = 771 — the label's math is now honest.
- **DamageOverTimeChart double-crossing (09-07b) and multi-raid cost-efficiency columns (09-09)**
  not re-tested this pass (time budget went to the new same-day features instead) — no reason to
  suspect regression, but a future pass should re-confirm rather than assume forever-fixed.

## CONFIRMED BUG (source-verified, high confidence): Power-Up Optimizer -> Team Raid "Send to Team
## Raid Simulator" still collapses per-slot levels to a roster-wide MEAN — the exact ~40%
## clear-time divergence bug the task asked me to confirm was fixed is NOT fixed in this direction

Two sibling cross-tab export functions exist:
- `packages/web/src/teamRaidExport.ts` (Team Raid -> Power-Up, the "Export roster to Power-Up
  Optimizer" button): `slotToPowerUpSlot` correctly uses `slot.level ?? level` / `slot.ivs?.attack
  ?? ivAttack` per slot — this direction WAS fixed, and its own doc comment says so explicitly,
  citing "the exact ~40% clear-time divergence already measured for the Power-Up-Optimizer-plan ->
  Team Raid direction."
- `packages/web/src/powerUpOptimizerExport.ts` (Power-Up -> Team Raid, the "Send to Team Raid
  Simulator" button, `PowerUpOptimizerView.tsx` line ~2326 `handleSendToTeamRaid`): `slotToTeamSlot`
  (line 37) only carries speciesId/fastMoveId/chargedMoveId/isMega/megaLevel/isShadow — it does
  NOT set `level`/`ivs` on the output `TeamSlotAssumption` at all, even though that type has had
  per-slot `level?: number` / `ivs?: IVSpread` fields since the Lineup Builder shipped (confirmed
  in `TeamAssumptionPanel.tsx` lines 46-60 — that field's OWN doc comment explicitly names "~40%
  divergence measured in the sibling Power-Up-Optimizer-plan export" as the historical motivation
  for adding it). Instead, `powerUpOptimizerAssumptionsToTeamAssumptions` (line 101) computes ONE
  `mean(fieldedLevels)` / `mean(ivAttack)` / etc. across every fielded slot and writes that single
  number into `TeamAssumptions.level`/`ivAttack`/... (the roster-wide shared field), discarding
  each slot's own real level entirely. The doc comment on this function (lines 64-76) claims this
  is "the one genuine reduction... there is no lossless way to carry N different post-plan levels
  into a type that only has room for one" — that claim is now FALSE, since the destination type
  (`TeamSlotAssumption`) has carried per-slot `level`/`ivs` since the sibling direction was fixed.
  Verified the call site too (`PowerUpOptimizerView.tsx` `handleSendToTeamRaid`) uses the function's
  return value as-is with no post-hoc per-slot fixup — the mean-collapse is the actual, final,
  shipped behavior, not stale-but-superseded code.
- Practical consequence: the Power-Up Optimizer's whole premise is "every slot at its OWN
  level/IVs" (varied on purpose — `PowerUpOptimizerView.tsx`'s own comment: "at VARIED levels
  (unlike Team Raid's single shared level) since this tab's whole point is per-slot power-up
  headroom"). Clicking "Send to Team Raid Simulator" throws that away and re-collapses the roster
  onto one mean level/IV spread — reintroducing the exact simulated-clear-time distortion the
  per-slot override field was built to eliminate, just on the opposite hand-off direction.
- Could not get a clean LIVE-UI repro this pass — this session's Browser pane was intermittently
  reported "hidden" (`tabs_context` → "The Browser pane is currently hidden", also surfaced as
  screenshot timeouts: "Claude's window is minimized or hidden, which can stop the page from
  drawing") for reasons outside this agent's control, and click delivery was unreliable while
  hidden (many clicks silently no-op'd; retries eventually landed for OTHER controls but never
  cleanly for this one button within budget). Confidence rests on three-point source
  cross-reference (function body + its type's own doc-comment history + the call site) rather than
  an observed live number — still very high confidence given how directly the three artifacts
  corroborate each other, but flagging the missing live confirmation honestly.
- Handed to **web-developer**: give `slotToTeamSlot` (or its caller) the same `finalLevels?.[i]?.toLevel
  ?? s.level` / `s.ivAttack` per-slot treatment `teamRaidExport.ts` already uses, populating each
  output `TeamSlotAssumption.level`/`.ivs` instead of (or in addition to, for the panel-wide
  fallback) the roster-mean `TeamAssumptions.level`/`ivAttack`/etc. Also update
  `powerUpOptimizerAssumptionsToTeamAssumptions`'s own doc comment, which still asserts a
  now-untrue "no lossless way" claim.

## Suspicious, needs owner look: Team Raid Simulator's default demo boss (Mega Tyranitar) is no
## longer in the live raid rotation

`data/normalized/activeRaids.json` (17 rows, today 2026-09-10) has exactly ONE Mega Raid entry —
Mega Beedrill — not Mega Tyranitar. `data/normalized/raidHistory.json`'s Mega Tyranitar row has
`"lastSeenAt": "2026-09-08T01:01:53.395Z"`, `"source": "bulbapedia-archive"` (an archived/past
record, not a live-feed row). Cross-checked against a live web search (community tier: LeekDuck,
Dexerto, PokemonGoHub, 2026-09-10): Mega Tyranitar was a Mega Raid boss during GO Fest 2026's "Mega
Finale"/"Mega Ascension" event window (~Aug 31 - Sep 4, plus the Fest weekend after), which has
already concluded relative to today. This isn't wrong math or bad data — Team Raid Simulator
isn't restricted to only currently-active bosses, so fighting a rotated-out boss is a legitimate
user choice — but the tab's own HARDCODED DEFAULT scenario (what a fresh page load shows before any
input) presents a boss that's no longer something a player could actually go fight tonight, which
undercuts the tab's own framing ("against the boss's real HP pool and countdown timer"). Not
severe, but worth a look from whoever owns `TeamRaidView.tsx`'s `DEFAULT_TEAM_ASSUMPTIONS` — either
refresh the default target periodically or note explicitly that the default is illustrative, not
"tonight's raid." Handed to **web-developer** (default-scenario choice) / **data-sync** (whether
sync cadence should re-evaluate hardcoded UI defaults after a rotation-ending sync).

## Checked out fine this pass (actively tried to break, couldn't)

- **Team Raid Simulator default scenario, full arithmetic check.** Mega Mewtwo X -> Machamp ->
  Terrakion -> Lucario -> Lucario vs Mega Tyranitar (9000 HP, matches `RAID_TIER_TABLE["Mega
  Raids"]` exactly). Per-cycle/per-slot breakdown table sums to 9055 own damage across 3 cycles
  (slightly over 9000 — expected overkill on the final hit). Wipe count (2) matches: cycle 0 all 5
  slots faint (wipe 1), cycle 1 all 5 faint (wipe 2), cycle 2 clears on slot 4 survives. 13 faint
  events matches 5+5+3. Finishing blow "Cycle 2, Slot 4 (Lucario)" matches the table's own
  "LucarioCLEAR" row. Time to clear 280.4s + timer margin 19.6s = 300s raid timer exactly.
  Inter-slot gaps: 0.5s (swapCostSeconds) between ordinary swaps, 15s (reviveCostSeconds) between
  wipe-and-revive cycles, both threaded consistently through all 3 cycles. Mega Tyranitar's 4
  charged moves (Fire Blast/Crunch/Stone Edge/Brutal Swing, `data/normalized/species.json`
  `tyranitar-mega`) match the UI's "Clears against all 4 of this boss's known charged moves"
  exactly, and source-read `runTeamRaid.ts` lines 221-254 confirms this is a REAL re-simulation
  once per boss charged move (`bossMovesetSweep`), not a hardcoded/miscounted label.
- **Shadow raid enrage math, hand-verified against `shadow.ts`'s formula.** Built a Team Raid
  scenario vs Shadow Lampent (3-Star, 3600 HP, `data/normalized/activeRaids.json` confirms it's
  currently active) using the SAME roster that clears Mega Tyranitar — this roster only reaches
  54% of Lampent's HP before the 300s timer runs out (4 wipes, 24 faint events). Per-cycle damage
  collapses hugely partway through cycle 0->1 (e.g. Lucario: 272 dmg/18s in cycle 0 down to 27
  dmg/9s in cycle 1, a ~94% per-second drop) — consistent with crossing the 40%-dealt / 60%-HP
  enrage threshold mid-cycle-1. Hand-computed the enrage defense jump from `shadow.ts`'s own
  documented formula: Lampent baseDefense 115, shadow-adjusted 115*5/6=95.83; normal 3-star defense
  floor((95.83+15)*0.73)=80; enraged defense floor(3*95.83+15)=302 — a 3.77x defense increase,
  predicting ~73.5% less damage per hit, which is in the same ballpark as the observed 67-94% drops
  across different attackers (variance expected from move-type/floor-rounding differences at small
  numbers). No double-application of the 1.2x/5-6ths shadow multiplier found — `shadowEnragedStats`
  reuses `shadowAdjustedBaseStats`'s OUTPUT as its input exactly once, matching its own doc comment's
  architectural argument.
- **Party-size ranking-flip sensitivity, hand-verified.** Mega Blaziken vs Rayquaza vs Mega Latios
  (level 35, 4 other trainers matching type, 26.5 DPS each — same scenario 09-09 already verified
  the 1.3x boost arithmetic on). Comparator's "Sensitivity" section (a `<details>`, closed by
  default) reports "Ranking flips at 1 other trainer in the raid: Rayquaza leads below that, Mega
  Blaziken leads at 1 or more." Hand check: at 0 trainers Mega Blaziken's own total is 117 <
  Rayquaza's 155 (Rayquaza leads); at 1 trainer, team damage = 1 x (1.3-1) x 26.5 DPS x 10.0s
  survival = 79.5, own+team = 196.5 > 155 (Mega Blaziken leads) — matches exactly. Sensitivity row
  #1 "Mega boost multiplier (currently 1.3x)... flips at 1.14x" also directly corroborates
  CLAUDE.md's "a real conclusion in this project flips at 1.1" standing-decision language for THIS
  matchup's specific flip point.
- **Super Max gating, live-verified.** Built a Comparator scenario with `blaziken-mega` (confirmed
  via `data/normalized/species.json` grep: no `_PLUS` move on Blaziken's moveset, one of the ~39
  ineligible mega/primal forms) forced to `candidateMegaLevel: ["super-max", ...]` via a hand-edited
  share link. The dropdown correctly rendered "Super Max (not reachable here)" as the kept-but-
  labelled-inert selected option (matches `megaLevelSelect.tsx`'s `selectableMegaLevels`/
  `megaLevelOptionLabel` exactly), and the computed result (11.7 own DPS, 117 TDO, 318 team damage)
  was BYTE-IDENTICAL to the same scenario run at the implicit "base" level — confirming the engine
  really clamps an illegal Super Max request down to Max (which has zero combat effect per this
  tool's own model) rather than silently applying the CP bump/"+"move anyway. Cross-checked the "15
  megas with a + move" claim: `grep -c '_PLUS"' data/normalized/species.json` = 15 exactly, mapped
  each to a distinct mega/primal species (including `raichu-mega-x`/`raichu-mega-y`'s
  VOLT_TACKLE_PLUS/ZAP_CANNON_PLUS, the CLAUDE.md-flagged real-but-easy-to-miss form).
- **RAID_TIER_TABLE, 7 entries read directly from `raidBoss.ts`.** 1-Star 600/0.5974, 3-Star
  3600/0.73, Mega 9000/0.79, 5-Star 15000/0.79, Legendary Mega 22500/0.79, Super Mega 25000/0.79,
  Primal 22500/0.79 — Legendary Mega and Primal Raids legitimately share 22500 HP as the system
  prompt's own hint predicted; not a bug.
- **`view=` URL param NOT syncing on a plain tab-nav click — confirmed NOT a bug, by reading
  source.** Observed live (`window.location.href` staying `?view=comparator` after the rendered
  content visibly switched to Team Raid) and initially suspected a real bug, but `App.tsx` shows
  every tab button's `onClick` only calls `setTab(...)` (React state) with NO `history.pushState`/
  `replaceState` anywhere — confirmed by that file's own doc comment: "Every view's own 'Build
  link' button additionally stamps this param onto its generated URL" is the ONLY place `view=`
  ever gets written. This is deliberate (avoids URL churn on every plain click); the "Build Link"
  button on a cross-tab-jumped page DOES correctly stamp the right `view=` (verified: Species
  Report's "Send to Team Raid Simulator" -> Team Raid's own "Build Link" produced a URL with
  `view=team-raid` and a `ts=` payload correctly containing Kartana as slot 1 and
  `target":"rattata-alola"`, boss HP 600 matching Alolan Rattata's 1-star tier).

## Tooling hazard this pass — worse than prior passes, cost significant time

The Browser pane repeatedly reported itself "hidden" (`tabs_context` → "The Browser pane is
currently hidden") for reasons outside this agent's control (the user's actual window was likely
minimized/backgrounded for stretches of this session) — matching the tool's own documented warning
("Claude's window is minimized or hidden, which can stop the page from drawing"). Symptoms while
hidden: `computer{screenshot}` returned fully blank frames OR timed out; `window.innerWidth`/
`innerHeight` read 0 via `javascript_tool`; `ref`-based click coordinates went stale after ANY
`resize_window` call (reporting wildly wrong y-values, once even negative); clicks on visually-
correct coordinates silently no-op'd on the first (sometimes second, third) attempt before
eventually landing on a later retry, with NO way to distinguish "click genuinely had no handler" from
"click was dropped by the hidden pane" except retrying and checking a read-only DOM signal
(`document.querySelectorAll('details')[n].open`, `document.body.innerText.includes(...)`) after
each attempt. Workaround that helped: after ANY `resize_window` call, take a screenshot FIRST and
click by SCREENSHOT COORDINATE, not by stale `ref` — `ref`-computed bounding boxes do not
re-resolve after a resize. Standard-size clicks without a prior resize were far more reliable.
Recommend future passes budget for this explicitly and lean harder on `get_page_text`/`find`/
read-only `javascript_tool` DOM checks over `computer{click}` when a finding can be confirmed
either way — and treat any single "nothing happened" click as inconclusive, not a bug, until
retried at least twice with an authoritative DOM-state check in between.

## Useful regression URLs / recipe for next pass

- Power-Up -> Team Raid per-slot-level bug: once web-developer fixes it, re-verify by building a
  Power-Up Optimizer single-raid scenario with two slots at very different levels (e.g. Lv20 and
  Lv45), clicking "Send to Team Raid Simulator", and confirming the resulting Team Raid slots each
  show THEIR OWN level (via `TeamSlotAssumption.level` in the decoded `ts=`), not one shared mean.
- Shadow enrage: Shadow Lampent (3-star, 600 HP... no, 3600 HP) vs the Mega-Tyranitar-clearing
  roster is a good repeatable "definitely crosses the enrage threshold but doesn't clear" regression
  case — re-run if `shadow.ts`'s formula or its stacking order ever changes.
- Team Raid default boss freshness: re-check `data/normalized/activeRaids.json` for a Mega Raids
  entry whenever auditing `TeamRaidView.tsx`'s `DEFAULT_TEAM_ASSUMPTIONS` — Mega Beedrill was the
  live one as of 2026-09-10, not Mega Tyranitar.
