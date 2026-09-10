---
name: reaction-full-audit-2026-09-10
description: Full satisfaction audit across all six tabs x four archetypes (2026-09-10), post "collapse assumptions by default + move caveats out" pass — verdicts, FIXABLE/STRUCTURAL/TASTE findings, prioritized list. Read before re-auditing any tab so settled verdicts aren't re-litigated.
metadata:
  type: project
---

Triggered by: "keep building until the player agents multiple profiles are satisfied with all 6
tabs." Confirmed landed as described: Assumptions + Known Caveats collapsed by default on all six
tabs; the moveset-default badge fix (see `reaction_powerup_tm_proposal.md`) is real and correctly
wired for freshly-imported rosters (verified by a clean 2-row re-import: Rayquaza -> "DEFAULT
MOVESET", Palkia -> "DEFAULT CHARGED MOVE", both inline on the ranked-candidates row).

## Outstanding FIXABLE findings, priority order (not yet re-verified as fixed — check before reuse)

1. **Team Raid Simulator's `DEFAULT_TEAM_ASSUMPTIONS` (`TeamRaidView.tsx`) loses outright** — Mega
   Latios/Garchomp/Dragonite/Kartana/Tyranitar/Rayquaza vs Mega Tyranitar (Dark/Fire, resists most
   of that lineup, one slot eats a 2.56x hit) — "Timer expired, raid failed," 3 wipes, every "n/a."
   Confirmed this holds even at level 50 across the whole roster, so it's a type-matchup problem,
   not a levels problem. This is the FIRST thing a first-time visitor sees on Team Raid Simulator
   AND on Power-Up Optimizer single-raid mode (same default, shared file). Fix: swap the default
   pairing for one that actually clears (with some margin) so the wipe-and-revive mechanic
   demonstrates a win at least once, not only failure.
2. **Power-Up Optimizer's fixed-budget plan never reports clear rate after the plan** — baseline
   card shows "Clear rate: 0%" but after computing a real stardust/candy spend (e.g. +0.69 team DPS,
   9.7% over baseline, 25,000 stardust) there's no "clear rate after" or "time to clear after"
   anywhere, even though `runTeamRaid` already computes it (the baseline card proves this). A team
   that can't clear a raid before the plan is very unlikely to clear it after a ~10% DPS bump, and
   the tool never says so — directly against the real users' explicit "just choose a different
   mega" / tool-should-say-don't-bring-this preference (see archetype file). Fix: surface clear
   rate (and/or time-to-clear) both before and after the plan, next to "Final team DPS."
3. **Multi-raid Power-Up Optimizer: a roster imported before the moveset-badge fix shipped shows
   ZERO badges, silently, with no prompt to re-import.** Root cause confirmed in
   `packages/web/src/rosterPool.ts`'s `hydrateRosterEntry` — `stored.fastMoveIsDefaulted ?? false`
   is a deliberate, documented migration fallback for localStorage data older than the new fields.
   Reasonable as a fallback, but nothing tells a returning user their cached roster predates it.
   The real user (real-users) already has an imported roster from before this fix, so this is
   not a hypothetical case for them. Fix: extend the existing `rosterDroppedCount`-style notice
   (`PowerUpOptimizerView.tsx` line ~828) to also count/flag entries missing the new provenance
   fields and prompt a re-import.
4. **IV Breakpoints' two main result panels ("Impact across every raid target," "Per-level
   breakdown") are open by default and hold multi-sentence methodology prose inline** ("Outperforms
   here means...", "Honest limitation: any species that isn't currently active now defaults to..."),
   unlike Species Report's own already-solved pattern (a small collapsed "How is this computed"
   toggle sitting next to the verdict, prose hidden until asked for). Fix: apply Species Report's
   pattern here — verdict box + table stay open, methodology paragraph moves behind a toggle.
5. **"Known caveats," once opened, is one undifferentiated wall mixing 3-4 unrelated topics**
   (simulation/mega mechanics, Mega Level, boss cadence models, the detail toggle, on Comparator;
   Roster-wide Mega Level + candy family data on Power-Up Optimizer, etc.) with no sub-collapse.
   Low priority since it's collapsed and opt-in by default — only bites a player who deliberately
   opens it looking for one fact and has to scroll past three unrelated essays. Fix: split into
   per-topic sub-disclosures inside the one "Known caveats" section.
6. **Comparator's species search combobox doesn't select-all on focus.** A single click into a
   filled box (e.g. already showing "Kartana") then typing APPENDS ("Kartanamewtwo" -> "No
   matches") instead of replacing; triple-click/select-all-then-type works correctly. Minor,
   self-correcting (the "No matches" state is visible and recoverable), cheap to fix.

## Per-tab verdicts (see full response for per-archetype detail; this is the terse index)

- **Comparator**: real-users satisfied (best-fit tab — own-DPS-vs-own+team split, sensitivity-
  by-boss-moveset table directly match their adversarial-pair/flip-hunting style). Cross-links
  correctly from Species Report's "Compare vs another attacker."
- **Team Raid Simulator**: mechanic (real timer, real HP pool, wipe/revive, per-slot ladder) is
  right and matches the real users' breakpoints-first style once you get past finding #1 above.
- **Species Report**: best tab for casual-optimizer of the six (one species, one click, ranked
  list of tonight's raids, terse verdict box). real-users satisfied.
- **IV Breakpoints**: real-users satisfied on substance (their own by-hand Raichu X/Y
  breakpoint reasoning, almost exactly), minus finding #4. STRUCTURAL rejection for
  casual-optimizer — premise presupposes you already know two IV spreads you care about.
- **Attack/Defense Breakpoints**: no findings beyond casual-optimizer's STRUCTURAL rejection (most
  extreme of the six — pure 51-column spreadsheet grid, no verdict sentence). real-users/
  hardcore-spender satisfied, this is deliberately the raw-data tab.
- **Power-Up Optimizer (single-raid)**: shares finding #1's default; finding #2 is specific to
  this tab and matters most to f2p-constrained (irreversible spend that may not change the
  outcome). STRUCTURAL rejection for casual-optimizer (already recorded, not re-litigated).
- **Power-Up Optimizer (multi-raid)**: finding #3 above is new this pass. Otherwise confirms the
  prior pass's fix landed. 6 of 8 "Never competitive" entries still "evolve first" on the same
  23-row sample (IDEAS.md #9, unchanged, not a new finding).

## Tool note (not a product finding)

The Browser pane's `screenshot`/`zoom` occasionally returned a solid-blank frame or an
unexpectedly-scrolled view after `scroll_to`/tab-switch in this session, and `zoom`'s region crop
isn't implemented here (returns the full screenshot). `read_page filter="interactive"` also
under-returned real `<button>` elements at least once (a styled disclosure button only showed up
via `find`, not the interactive dump) — don't conclude an element is inaccessible from that filter
alone; confirm with `find` or a text-content check first.
